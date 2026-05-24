/**
 * Geo resolver service
 * The core engine: resolves any input → full political stack.
 */
import db from '../lib/db'
import { AppError } from '../lib/errors'
import type { PoliticalStack } from '@naijagov/shared'

// ── Types ─────────────────────────────────────────────────────

export interface VoterCardInput {
  stateCode:       number  // 01–37
  lgaCode:         number
  wardCode:        number
  pollingUnitCode: number
}

export interface TextSearchInput {
  stateName?: string
  lgaName:    string
  wardName?:  string
}

export interface GeoInput {
  lat: number
  lng: number
}

// ── Parser ────────────────────────────────────────────────────

/**
 * Parse the raw CODE string from a voter's card.
 * Accepts: "27-02-10-001", "27/02/10/001", "27 02 10 001"
 */
export function parseVoterCardCode(raw: string): VoterCardInput {
  const parts = raw.trim().split(/[-/ ]+/).map(Number)
  if (parts.length !== 4 || parts.some(isNaN) || parts.some(n => n < 0)) {
    throw new AppError(
      'RESOLVER_INVALID_CODE',
      `Cannot parse voter card code: "${raw}". Expected format: SS-LL-WW-PPP (e.g. 27-02-10-001)`,
      400
    )
  }
  const [stateCode, lgaCode, wardCode, pollingUnitCode] = parts as [number, number, number, number]
  if (stateCode < 1 || stateCode > 37) {
    throw new AppError('RESOLVER_INVALID_CODE', `Invalid state code: ${stateCode}. Must be 1–37.`, 400)
  }
  return { stateCode, lgaCode, wardCode, pollingUnitCode }
}

// ── Full ward row type (internal) ─────────────────────────────

interface FullWardRow {
  stateId: number;           stateInecCode: number;    stateAlphaCode: string
  stateName: string;         stateSlug: string;        geopoliticalZone: string
  lgaId: number;             lgaInecCode: number;      lgaName: string;     lgaSlug: string
  wardId: number;            wardInecCode: number;     compoundCode: string
  wardName: string;          wardSlug: string
  scMappingMissing: boolean; fcMappingMissing: boolean; sdMappingMissing: boolean
  scId: number | null;       scInecCode: string | null; scName: string | null; scSlug: string | null
  fcId: number | null;       fcInecCode: string | null; fcName: string | null; fcSlug: string | null
  sdId: number | null;       sdInecCode: string | null; sdName: string | null; sdSlug: string | null
  puId: number | null;       puLocId: string | null;    inecPuCode: number | null
  puDescription: string | null; hasGps: boolean | null; lat: number | null; lng: number | null
}

const FULL_SELECT = `
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
  FROM   states                   s
  JOIN   lgas                     l  ON l.state_id = s.id
  JOIN   wards                    w  ON w.lga_id   = l.id
  LEFT JOIN state_constituencies   sc ON sc.id = w.state_constituency_id
  LEFT JOIN federal_constituencies fc ON fc.id = w.federal_constituency_id
  LEFT JOIN senatorial_districts   sd ON sd.id = w.senatorial_district_id
`

// ── Resolvers ─────────────────────────────────────────────────

export async function resolveByVoterCard(input: VoterCardInput): Promise<PoliticalStack> {
  const { stateCode, lgaCode, wardCode, pollingUnitCode } = input

  const row = await db.query<FullWardRow>(
    `${FULL_SELECT}
     LEFT JOIN polling_units pu ON pu.ward_id = w.id AND pu.inec_pu_code = $4
     WHERE s.inec_code = $1
       AND l.inec_code = $2
       AND w.inec_code = $3
     LIMIT 1`,
    stateCode, lgaCode, wardCode, pollingUnitCode
  )

  if (!row) {
    throw new AppError(
      'RESOLVER_NO_MATCH',
      `No constituency found for voter card code ${stateCode}-${lgaCode}-${wardCode}-${String(pollingUnitCode).padStart(3,'0')}`,
      404
    )
  }

  return buildStack(row)
}

export async function resolveByText(input: TextSearchInput): Promise<PoliticalStack[]> {
  const { lgaName, wardName, stateName } = input

  let rows: FullWardRow[]

  if (wardName && stateName) {
    rows = await db.queryMany<FullWardRow>(
      `${FULL_SELECT}
       LEFT JOIN polling_units pu ON pu.ward_id = w.id AND pu.inec_pu_code = 1
       WHERE s.name ILIKE $1
         AND similarity(l.name, $2) > 0.3
         AND similarity(w.name, $3) > 0.3
       ORDER BY similarity(w.name, $3) + similarity(l.name, $2) DESC
       LIMIT 5`,
      `%${stateName}%`, lgaName, wardName
    )
  } else if (wardName) {
    rows = await db.queryMany<FullWardRow>(
      `${FULL_SELECT}
       LEFT JOIN polling_units pu ON pu.ward_id = w.id AND pu.inec_pu_code = 1
       WHERE similarity(l.name, $1) > 0.3
         AND similarity(w.name, $2) > 0.3
       ORDER BY similarity(w.name, $2) + similarity(l.name, $1) DESC
       LIMIT 5`,
      lgaName, wardName
    )
  } else {
    rows = await db.queryMany<FullWardRow>(
      `${FULL_SELECT}
       LEFT JOIN polling_units pu ON pu.ward_id = w.id AND pu.inec_pu_code = 1
       WHERE similarity(l.name, $1) > 0.3
       ORDER BY similarity(l.name, $1) DESC, w.inec_code ASC
       LIMIT 5`,
      lgaName
    )
  }

  if (rows.length === 0) {
    throw new AppError('RESOLVER_NO_MATCH', `No constituency found matching "${lgaName}"`, 404)
  }

  return rows.map(buildStack)
}

export async function resolveByGeo(input: GeoInput): Promise<PoliticalStack> {
  const { lat, lng } = input

  // Nearest polling unit via PostGIS KNN operator
  const nearest = await db.query<{ wardId: number; puId: number }>(
    `SELECT ward_id AS "wardId", id AS "puId"
     FROM polling_units
     WHERE has_gps = true
     ORDER BY geom <-> ST_SetSRID(ST_MakePoint($2, $1), 4326)
     LIMIT 1`,
    lat, lng
  )

  if (!nearest) {
    throw new AppError('RESOLVER_NO_MATCH', 'No polling unit found near your location', 404)
  }

  const row = await db.query<FullWardRow>(
    `${FULL_SELECT}
     LEFT JOIN polling_units pu ON pu.id = $2
     WHERE w.id = $1
     LIMIT 1`,
    nearest.wardId, nearest.puId
  )

  if (!row) throw new AppError('RESOLVER_NO_MATCH', 'Ward not found', 404)
  return buildStack(row)
}

// ── Stack builder ─────────────────────────────────────────────

function buildStack(r: FullWardRow): PoliticalStack {
  return {
    state: {
      id: r.stateId, inecCode: r.stateInecCode, alphaCode: r.stateAlphaCode,
      name: r.stateName, slug: r.stateSlug, geopoliticalZone: r.geopoliticalZone,
    },
    lga: {
      id: r.lgaId, stateId: r.stateId, inecCode: r.lgaInecCode,
      name: r.lgaName, slug: r.lgaSlug,
    },
    ward: {
      id: r.wardId, lgaId: r.lgaId, stateId: r.stateId, inecCode: r.wardInecCode,
      compoundCode: r.compoundCode, name: r.wardName, slug: r.wardSlug,
    },
    pollingUnit: r.puId ? {
      id: r.puId, wardId: r.wardId, puLocId: r.puLocId!,
      inecPuCode: r.inecPuCode!, description: r.puDescription,
      hasGps: r.hasGps!, lat: r.lat, lng: r.lng,
    } : null,
    constituencies: {
      stateConstituency:   r.scId ? { id: r.scId, stateId: r.stateId, inecCode: r.scInecCode!, name: r.scName!, slug: r.scSlug! } : null,
      federalConstituency: r.fcId ? { id: r.fcId, stateId: r.stateId, inecCode: r.fcInecCode!, name: r.fcName!, slug: r.fcSlug! } : null,
      senatorialDistrict:  r.sdId ? { id: r.sdId, stateId: r.stateId, inecCode: r.sdInecCode!, name: r.sdName!, slug: r.sdSlug! } : null,
    },
    dataQuality: {
      scMissing: r.scMappingMissing,
      fcMissing: r.fcMappingMissing,
      sdMissing: r.sdMappingMissing,
      hasGps:    r.hasGps ?? false,
    },
  }
}
