/**
 * NaijaGov — Constituency Resolver
 * packages/geo/src/resolver.ts
 *
 * Resolves a citizen's full political stack from:
 *   (a) Voter card CODE fields: state, lga, ward, polling unit numbers
 *   (b) LGA + ward name (text search)
 *   (c) Free-text address (via geocoder → nearest polling unit)
 *
 * Returns a PoliticalStack: every rep from ward councillor to president.
 */

import { db } from '../db/client'

// ── Types ──────────────────────────────────────────────────────────────────

export interface VoterCardInput {
  /** 2-digit INEC state numeric code, e.g. 27 for OGUN */
  stateCode: number
  /** LGA numeric code within state, e.g. 2 */
  lgaCode: number
  /** Ward numeric code within LGA, e.g. 10 */
  wardCode: number
  /** Polling unit number within ward, e.g. 1 */
  pollingUnitCode: number
}

export interface TextSearchInput {
  stateName?: string
  lgaName: string
  wardName?: string
}

export interface GeoInput {
  lat: number
  lng: number
}

export type ResolverInput =
  | { type: 'voter_card'; data: VoterCardInput }
  | { type: 'text_search'; data: TextSearchInput }
  | { type: 'geo'; data: GeoInput }

export interface PoliticalStack {
  ward: Ward | null
  lga: LGA | null
  state: State | null
  pollingUnit: PollingUnit | null
  constituencies: {
    stateConstituency: StateConstituency | null
    federalConstituency: FederalConstituency | null
    senatorialDistrict: SenatorialDistrict | null
  }
  dataQuality: {
    scMissing: boolean
    fcMissing: boolean
    sdMissing: boolean
    hasGps: boolean
  }
}

export interface State {
  id: number
  inecCode: number
  alphaCode: string
  name: string
  slug: string
  geopoliticalZone: string
}

export interface LGA {
  id: number
  stateId: number
  inecCode: number
  name: string
  slug: string
}

export interface Ward {
  id: number
  lgaId: number
  stateId: number
  inecCode: number
  compoundCode: string
  name: string
  slug: string
}

export interface PollingUnit {
  id: number
  wardId: number
  puLocId: string
  inecPuCode: number
  description: string | null
  hasGps: boolean
  lat: number | null
  lng: number | null
}

export interface StateConstituency {
  id: number
  stateId: number
  inecCode: string
  name: string
  slug: string
}

export interface FederalConstituency {
  id: number
  stateId: number
  inecCode: string
  name: string
  slug: string
}

export interface SenatorialDistrict {
  id: number
  stateId: number
  inecCode: string
  name: string
  slug: string
}

export class ResolverError extends Error {
  constructor(
    message: string,
    public code:
      | 'INVALID_STATE_CODE'
      | 'INVALID_LGA_CODE'
      | 'INVALID_WARD_CODE'
      | 'NO_MATCH'
      | 'AMBIGUOUS_MATCH'
      | 'DB_ERROR'
  ) {
    super(message)
    this.name = 'ResolverError'
  }
}

// ── Core Resolver ─────────────────────────────────────────────────────────

/**
 * Main entry point. Resolves any input type to a PoliticalStack.
 *
 * @example
 * // From voter card
 * const stack = await resolve({
 *   type: 'voter_card',
 *   data: { stateCode: 27, lgaCode: 2, wardCode: 10, pollingUnitCode: 1 }
 * })
 *
 * @example
 * // From text search
 * const stack = await resolve({
 *   type: 'text_search',
 *   data: { lgaName: 'Ikeja', stateName: 'Lagos' }
 * })
 */
export async function resolve(input: ResolverInput): Promise<PoliticalStack> {
  switch (input.type) {
    case 'voter_card':
      return resolveByVoterCard(input.data)
    case 'text_search':
      return resolveByText(input.data)
    case 'geo':
      return resolveByGeo(input.data)
  }
}

// ── Voter Card Resolver ───────────────────────────────────────────────────

/**
 * Resolves from PVC CODE fields.
 *
 * The voter card CODE field is: SS-LL-WW-PPP
 *   SS  = state numeric (01-37)
 *   LL  = LGA numeric within state
 *   WW  = ward numeric within LGA
 *   PPP = polling unit numeric within ward
 *
 * Verified against real PVC: CODE 27-02-10-001
 *   → OGUN / ABEOKUTA SOUTH / SODEKE-ISALE IJEUN I / PU 001
 */
export async function resolveByVoterCard(
  input: VoterCardInput
): Promise<PoliticalStack> {
  const { stateCode, lgaCode, wardCode, pollingUnitCode } = input

  // Validate ranges
  if (stateCode < 1 || stateCode > 37) {
    throw new ResolverError(
      `Invalid state code: ${stateCode}. Must be 1–37.`,
      'INVALID_STATE_CODE'
    )
  }

  try {
    // Single query: join everything from ward outward
    const row = await db.query<FullWardRow>(
      `
      SELECT
        s.id              AS state_id,
        s.inec_code       AS state_inec_code,
        s.alpha_code      AS state_alpha_code,
        s.name            AS state_name,
        s.slug            AS state_slug,
        s.geopolitical_zone,

        l.id              AS lga_id,
        l.inec_code       AS lga_inec_code,
        l.name            AS lga_name,
        l.slug            AS lga_slug,

        w.id              AS ward_id,
        w.inec_code       AS ward_inec_code,
        w.compound_code,
        w.name            AS ward_name,
        w.slug            AS ward_slug,
        w.sc_mapping_missing,
        w.fc_mapping_missing,
        w.sd_mapping_missing,

        sc.id             AS sc_id,
        sc.inec_code      AS sc_inec_code,
        sc.name           AS sc_name,
        sc.slug           AS sc_slug,

        fc.id             AS fc_id,
        fc.inec_code      AS fc_inec_code,
        fc.name           AS fc_name,
        fc.slug           AS fc_slug,

        sd.id             AS sd_id,
        sd.inec_code      AS sd_inec_code,
        sd.name           AS sd_name,
        sd.slug           AS sd_slug,

        pu.id             AS pu_id,
        pu.pu_loc_id,
        pu.inec_pu_code,
        pu.description    AS pu_description,
        pu.has_gps,
        pu.lat,
        pu.lng

      FROM   states                 s
      JOIN   lgas                   l  ON l.state_id   = s.id AND l.inec_code = $2
      JOIN   wards                  w  ON w.lga_id     = l.id AND w.inec_code = $3
      LEFT JOIN state_constituencies  sc ON sc.id = w.state_constituency_id
      LEFT JOIN federal_constituencies fc ON fc.id = w.federal_constituency_id
      LEFT JOIN senatorial_districts   sd ON sd.id = w.senatorial_district_id
      LEFT JOIN polling_units          pu ON pu.ward_id = w.id
                                         AND pu.inec_pu_code = $4
      WHERE  s.inec_code = $1
      LIMIT  1
      `,
      [stateCode, lgaCode, wardCode, pollingUnitCode]
    )

    if (!row) {
      throw new ResolverError(
        `No ward found for code ${stateCode}-${lgaCode}-${wardCode}`,
        'NO_MATCH'
      )
    }

    return buildStack(row)
  } catch (err) {
    if (err instanceof ResolverError) throw err
    throw new ResolverError(`Database error: ${(err as Error).message}`, 'DB_ERROR')
  }
}

/**
 * Parse the raw string from the voter card CODE field.
 * Accepts formats: "27-02-10-001", "27/02/10/001", "27 02 10 001"
 */
export function parseVoterCardCode(raw: string): VoterCardInput {
  const parts = raw.trim().split(/[-/ ]+/).map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) {
    throw new ResolverError(
      `Cannot parse voter card code: "${raw}". Expected format: SS-LL-WW-PPP`,
      'INVALID_STATE_CODE'
    )
  }
  return {
    stateCode:       parts[0],
    lgaCode:         parts[1],
    wardCode:        parts[2],
    pollingUnitCode: parts[3],
  }
}

// ── Text Search Resolver ──────────────────────────────────────────────────

/**
 * Resolves from LGA + optional ward name using fuzzy text search.
 * Uses pg_trgm similarity for typo tolerance.
 */
export async function resolveByText(
  input: TextSearchInput
): Promise<PoliticalStack> {
  const { lgaName, wardName, stateName } = input

  // Build the query dynamically based on what was provided
  let query: string
  let params: (string | number)[]

  if (wardName && stateName) {
    // Most precise: state + LGA + ward
    query = `
      SELECT w.id AS ward_id, similarity(w.name, $3) AS ward_sim,
             similarity(l.name, $2) AS lga_sim
      FROM wards w
      JOIN lgas l ON l.id = w.lga_id
      JOIN states s ON s.id = l.state_id
      WHERE s.name ILIKE $1
        AND similarity(l.name, $2) > 0.3
        AND similarity(w.name, $3) > 0.3
      ORDER BY (similarity(w.name, $3) + similarity(l.name, $2)) DESC
      LIMIT 5
    `
    params = [`%${stateName}%`, lgaName, wardName]
  } else if (wardName) {
    query = `
      SELECT w.id AS ward_id, similarity(w.name, $2) AS ward_sim,
             similarity(l.name, $1) AS lga_sim
      FROM wards w
      JOIN lgas l ON l.id = w.lga_id
      WHERE similarity(l.name, $1) > 0.3
        AND similarity(w.name, $2) > 0.3
      ORDER BY (similarity(w.name, $2) + similarity(l.name, $1)) DESC
      LIMIT 5
    `
    params = [lgaName, wardName]
  } else {
    // LGA only — return first ward as anchor, citizen can refine on map
    query = `
      SELECT w.id AS ward_id, 1.0 AS ward_sim, similarity(l.name, $1) AS lga_sim
      FROM wards w
      JOIN lgas l ON l.id = w.lga_id
      WHERE similarity(l.name, $1) > 0.3
      ORDER BY similarity(l.name, $1) DESC, w.inec_code ASC
      LIMIT 5
    `
    params = [lgaName]
  }

  const matches = await db.queryMany<{ ward_id: number; ward_sim: number; lga_sim: number }>(
    query, params
  )

  if (matches.length === 0) {
    throw new ResolverError(
      `No match found for LGA "${lgaName}"${wardName ? ` / Ward "${wardName}"` : ''}`,
      'NO_MATCH'
    )
  }

  // If top result is significantly better than second, use it directly
  const top = matches[0]
  if (matches.length > 1) {
    const second = matches[1]
    const topScore  = top.ward_sim + top.lga_sim
    const nextScore = second.ward_sim + second.lga_sim
    if (topScore - nextScore < 0.15) {
      // Too close — return all candidates for disambiguation UI
      throw new ResolverError(
        `Ambiguous match for "${lgaName}". Multiple constituencies found.`,
        'AMBIGUOUS_MATCH'
      )
    }
  }

  // Fetch full stack for the top ward
  const row = await fetchFullWardById(top.ward_id)
  if (!row) throw new ResolverError('Ward not found', 'NO_MATCH')
  return buildStack(row)
}

// ── Geo Resolver ─────────────────────────────────────────────────────────

/**
 * Resolves from GPS coordinates by finding the nearest polling unit.
 * Uses PostGIS ST_Distance for fast spatial lookup.
 */
export async function resolveByGeo(input: GeoInput): Promise<PoliticalStack> {
  const { lat, lng } = input

  const row = await db.query<FullWardRow>(
    `
    SELECT pu.ward_id, pu.id AS pu_id
    FROM polling_units pu
    WHERE pu.has_gps = true
    ORDER BY pu.geom <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)
    LIMIT 1
    `,
    [lat, lng]
  )

  if (!row) throw new ResolverError('No polling unit found near location', 'NO_MATCH')

  const fullRow = await fetchFullWardById(row.ward_id, row.pu_id)
  if (!fullRow) throw new ResolverError('Ward not found', 'NO_MATCH')
  return buildStack(fullRow)
}

// ── Helpers ───────────────────────────────────────────────────────────────

type FullWardRow = {
  state_id: number; state_inec_code: number; state_alpha_code: string
  state_name: string; state_slug: string; geopolitical_zone: string
  lga_id: number; lga_inec_code: number; lga_name: string; lga_slug: string
  ward_id: number; ward_inec_code: number; compound_code: string
  ward_name: string; ward_slug: string
  sc_mapping_missing: boolean; fc_mapping_missing: boolean; sd_mapping_missing: boolean
  sc_id: number | null; sc_inec_code: string | null; sc_name: string | null; sc_slug: string | null
  fc_id: number | null; fc_inec_code: string | null; fc_name: string | null; fc_slug: string | null
  sd_id: number | null; sd_inec_code: string | null; sd_name: string | null; sd_slug: string | null
  pu_id: number | null; pu_loc_id: string | null; inec_pu_code: number | null
  pu_description: string | null; has_gps: boolean | null; lat: number | null; lng: number | null
}

async function fetchFullWardById(wardId: number, puId?: number): Promise<FullWardRow | null> {
  return db.query<FullWardRow>(
    `
    SELECT
      s.id, s.inec_code AS state_inec_code, s.alpha_code AS state_alpha_code,
      s.name AS state_name, s.slug AS state_slug, s.geopolitical_zone,
      l.id AS lga_id, l.inec_code AS lga_inec_code, l.name AS lga_name, l.slug AS lga_slug,
      w.id AS ward_id, w.inec_code AS ward_inec_code, w.compound_code,
      w.name AS ward_name, w.slug AS ward_slug,
      w.sc_mapping_missing, w.fc_mapping_missing, w.sd_mapping_missing,
      sc.id AS sc_id, sc.inec_code AS sc_inec_code, sc.name AS sc_name, sc.slug AS sc_slug,
      fc.id AS fc_id, fc.inec_code AS fc_inec_code, fc.name AS fc_name, fc.slug AS fc_slug,
      sd.id AS sd_id, sd.inec_code AS sd_inec_code, sd.name AS sd_name, sd.slug AS sd_slug,
      pu.id AS pu_id, pu.pu_loc_id, pu.inec_pu_code, pu.description AS pu_description,
      pu.has_gps, pu.lat, pu.lng
    FROM wards w
    JOIN lgas l ON l.id = w.lga_id
    JOIN states s ON s.id = l.state_id
    LEFT JOIN state_constituencies   sc ON sc.id = w.state_constituency_id
    LEFT JOIN federal_constituencies fc ON fc.id = w.federal_constituency_id
    LEFT JOIN senatorial_districts   sd ON sd.id = w.senatorial_district_id
    LEFT JOIN polling_units pu ON pu.ward_id = w.id
      AND ($2::int IS NULL OR pu.id = $2)
    WHERE w.id = $1
    LIMIT 1
    `,
    [wardId, puId ?? null]
  )
}

function buildStack(row: FullWardRow): PoliticalStack {
  return {
    state: {
      id: row.state_id,
      inecCode: row.state_inec_code,
      alphaCode: row.state_alpha_code,
      name: row.state_name,
      slug: row.state_slug,
      geopoliticalZone: row.geopolitical_zone,
    },
    lga: {
      id: row.lga_id,
      stateId: row.state_id,
      inecCode: row.lga_inec_code,
      name: row.lga_name,
      slug: row.lga_slug,
    },
    ward: {
      id: row.ward_id,
      lgaId: row.lga_id,
      stateId: row.state_id,
      inecCode: row.ward_inec_code,
      compoundCode: row.compound_code,
      name: row.ward_name,
      slug: row.ward_slug,
    },
    pollingUnit: row.pu_id
      ? {
          id: row.pu_id,
          wardId: row.ward_id,
          puLocId: row.pu_loc_id!,
          inecPuCode: row.inec_pu_code!,
          description: row.pu_description,
          hasGps: row.has_gps!,
          lat: row.lat,
          lng: row.lng,
        }
      : null,
    constituencies: {
      stateConstituency: row.sc_id
        ? { id: row.sc_id, stateId: row.state_id, inecCode: row.sc_inec_code!, name: row.sc_name!, slug: row.sc_slug! }
        : null,
      federalConstituency: row.fc_id
        ? { id: row.fc_id, stateId: row.state_id, inecCode: row.fc_inec_code!, name: row.fc_name!, slug: row.fc_slug! }
        : null,
      senatorialDistrict: row.sd_id
        ? { id: row.sd_id, stateId: row.state_id, inecCode: row.sd_inec_code!, name: row.sd_name!, slug: row.sd_slug! }
        : null,
    },
    dataQuality: {
      scMissing: row.sc_mapping_missing,
      fcMissing: row.fc_mapping_missing,
      sdMissing: row.sd_mapping_missing,
      hasGps: row.has_gps ?? false,
    },
  }
}
