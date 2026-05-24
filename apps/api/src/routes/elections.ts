import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { ok, handleError, notFound } from '../lib/errors'
import { apiRateLimit } from '../middleware/rateLimit'
import db from '../lib/db'

const app = new Hono()

// ── GET /elections ────────────────────────────────────────────

app.get('/', apiRateLimit, async (c) => {
  try {
    const cycles = await db.queryMany(
      `SELECT id, year, election_date AS "electionDate", status, notes,
              CASE WHEN election_date > CURRENT_DATE
                   THEN (election_date - CURRENT_DATE)
                   ELSE NULL
              END AS "daysRemaining"
       FROM election_cycles
       ORDER BY year DESC`
    )
    return ok(c, cycles)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /elections/:year ──────────────────────────────────────

app.get('/:year', apiRateLimit, async (c) => {
  try {
    const year = parseInt(c.req.param('year'), 10)
    if (isNaN(year)) return notFound(c, 'Invalid year')

    const cycle = await db.query(
      `SELECT id, year, election_date AS "electionDate", status, notes,
              CASE WHEN election_date > CURRENT_DATE
                   THEN (election_date - CURRENT_DATE) ELSE NULL
              END AS "daysRemaining"
       FROM election_cycles WHERE year = $1`,
      year
    )
    if (!cycle) return notFound(c, `No election cycle found for ${year}`)

    // Summary counts per type
    const summary = await db.queryMany(
      `SELECT election_type AS "electionType", COUNT(*) AS "raceCount",
              COUNT(CASE WHEN status = 'declared' THEN 1 END) AS "declaredCount"
       FROM election_races WHERE cycle_id = $1
       GROUP BY election_type`,
      (cycle as Record<string, unknown>)['id']
    )

    return ok(c, { ...cycle as Record<string, unknown>, summary })
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /elections/:year/candidates ──────────────────────────

const candidateQuerySchema = z.object({
  electionType: z.string().optional(),
  stateSlug:    z.string().optional(),
  partySlug:    z.string().optional(),
  page:         z.coerce.number().int().positive().optional().default(1),
  pageSize:     z.coerce.number().int().min(1).max(50).optional().default(20),
})

app.get('/:year/candidates', apiRateLimit, zValidator('query', candidateQuerySchema), async (c) => {
  try {
    const year = parseInt(c.req.param('year'), 10)
    const { electionType, stateSlug, partySlug, page, pageSize } = c.req.valid('query')
    const offset = (page - 1) * pageSize

    const conditions = [`ec.year = $1`]
    const params: unknown[] = [year]

    if (electionType) {
      params.push(electionType)
      conditions.push(`r.election_type = $${params.length}`)
    }
    if (stateSlug) {
      params.push(stateSlug)
      conditions.push(`s.slug = $${params.length}`)
    }
    if (partySlug) {
      params.push(partySlug)
      conditions.push(`p.slug = $${params.length}`)
    }

    const where = conditions.join(' AND ')

    const [rows, countRow] = await Promise.all([
      db.queryMany(
        `SELECT
           cand.id, cand.slug, cand.full_name AS "fullName",
           cand.photo_url AS "photoUrl", cand.status,
           cand.education, cand.occupation,
           cand.manifesto_url AS "manifestoUrl",
           cand.manifesto_summary AS "manifestoSummary",
           cand.website, cand.twitter_handle AS "twitterHandle",
           p.name AS "partyName", p.abbreviation AS "partyAbbreviation",
           p.color_hex AS "partyColorHex", p.slug AS "partySlug",
           r.election_type AS "electionType",
           COALESCE(sd.name, fc.name, sc.name, s2.name) AS "constituencyName",
           s.name AS "stateOfOriginName",
           cand.rep_id IS NOT NULL AS "isIncumbent"
         FROM candidates cand
         JOIN election_races r    ON r.id = cand.race_id
         JOIN election_cycles ec  ON ec.id = r.cycle_id
         JOIN parties p           ON p.id = cand.party_id
         LEFT JOIN states s       ON s.id = cand.state_of_origin
         LEFT JOIN states s2      ON s2.id = r.state_id
         LEFT JOIN senatorial_districts  sd ON sd.id = r.senatorial_district_id
         LEFT JOIN federal_constituencies fc ON fc.id = r.federal_constituency_id
         LEFT JOIN state_constituencies   sc ON sc.id = r.state_constituency_id
         WHERE ${where}
         ORDER BY cand.full_name
         LIMIT ${pageSize} OFFSET ${offset}`,
        ...params
      ),
      db.query<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM candidates cand
         JOIN election_races r   ON r.id = cand.race_id
         JOIN election_cycles ec ON ec.id = r.cycle_id
         JOIN parties p          ON p.id = cand.party_id
         LEFT JOIN states s      ON s.id = cand.state_of_origin
         WHERE ${where}`,
        ...params
      ),
    ])

    return ok(c, {
      items: rows,
      total: Number(countRow?.total ?? 0),
      page, pageSize,
      hasMore: offset + rows.length < Number(countRow?.total ?? 0),
    })
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /elections/:year/candidates/:slug ─────────────────────

app.get('/:year/candidates/:slug', apiRateLimit, async (c) => {
  try {
    const candidate = await db.query(
      `SELECT
         cand.id, cand.slug, cand.full_name AS "fullName",
         cand.photo_url AS "photoUrl", cand.bio, cand.status,
         cand.education, cand.occupation,
         cand.manifesto_url AS "manifestoUrl",
         cand.manifesto_summary AS "manifestoSummary",
         cand.manifesto_summary_generated_at AS "manifestoSummaryGeneratedAt",
         cand.website, cand.twitter_handle AS "twitterHandle", cand.facebook_url AS "facebookUrl",
         p.id AS "partyId", p.name AS "partyName", p.abbreviation AS "partyAbbreviation",
         p.color_hex AS "partyColorHex", p.logo_url AS "partyLogoUrl", p.slug AS "partySlug",
         r.election_type AS "electionType", r.id AS "raceId",
         COALESCE(sd.name, fc.name, sc.name, s2.name) AS "constituencyName",
         s.id AS "stateOfOriginId", s.name AS "stateOfOriginName",
         cand.rep_id IS NOT NULL AS "isIncumbent",
         ec.year, ec.election_date AS "electionDate"
       FROM candidates cand
       JOIN election_races r    ON r.id  = cand.race_id
       JOIN election_cycles ec  ON ec.id = r.cycle_id
       JOIN parties p           ON p.id  = cand.party_id
       LEFT JOIN states s       ON s.id  = cand.state_of_origin
       LEFT JOIN states s2      ON s2.id = r.state_id
       LEFT JOIN senatorial_districts  sd ON sd.id = r.senatorial_district_id
       LEFT JOIN federal_constituencies fc ON fc.id = r.federal_constituency_id
       LEFT JOIN state_constituencies   sc ON sc.id = r.state_constituency_id
       WHERE ec.year = $1 AND cand.slug = $2`,
      parseInt(c.req.param('year'), 10),
      c.req.param('slug')
    )
    if (!candidate) return notFound(c, 'Candidate not found')
    return ok(c, candidate)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /elections/:year/results ──────────────────────────────

app.get('/:year/results', apiRateLimit, async (c) => {
  try {
    const year         = parseInt(c.req.param('year'), 10)
    const electionType = c.req.query('type') ?? 'presidential'

    const results = await db.queryMany(
      `SELECT
         r.id AS "raceId", r.election_type AS "electionType", r.status,
         COALESCE(sd.name, fc.name, sc.name, s2.name) AS "constituencyName",
         json_agg(
           json_build_object(
             'candidateId', cand.id,
             'candidateName', cand.full_name,
             'partyAbbreviation', p.abbreviation,
             'partyColorHex', p.color_hex,
             'votes', er.votes,
             'percentage', er.percentage,
             'isWinner', er.is_winner
           ) ORDER BY er.votes DESC
         ) AS results
       FROM election_races r
       JOIN election_cycles ec  ON ec.id = r.cycle_id
       LEFT JOIN election_results er ON er.race_id = r.id
       LEFT JOIN candidates cand     ON cand.id = er.candidate_id
       LEFT JOIN parties p           ON p.id = cand.party_id
       LEFT JOIN states s2           ON s2.id = r.state_id
       LEFT JOIN senatorial_districts  sd ON sd.id = r.senatorial_district_id
       LEFT JOIN federal_constituencies fc ON fc.id = r.federal_constituency_id
       LEFT JOIN state_constituencies   sc ON sc.id = r.state_constituency_id
       WHERE ec.year = $1 AND r.election_type = $2
       GROUP BY r.id, sd.name, fc.name, sc.name, s2.name
       ORDER BY COALESCE(sd.name, fc.name, sc.name, s2.name)`,
      year, electionType
    )
    return ok(c, results)
  } catch (e) {
    return handleError(e, c)
  }
})

export default app
