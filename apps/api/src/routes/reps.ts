import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { ok, handleError, notFound } from '../lib/errors'
import { apiRateLimit } from '../middleware/rateLimit'
import db from '../lib/db'

const app = new Hono()

// ── Shared rep SELECT ─────────────────────────────────────────

const REP_SELECT = `
  SELECT
    r.id, r.slug, r.full_name AS "fullName",
    r.role, r.status,
    r.photo_url AS "photoUrl", r.bio,
    r.term_start AS "termStart", r.term_end AS "termEnd",
    r.email, r.phone, r.office_address AS "officeAddress",
    r.website, r.twitter_handle AS "twitterHandle",
    r.facebook_url AS "facebookUrl",
    r.data_verified AS "dataVerified",
    p.id AS "partyId", p.name AS "partyName",
    p.abbreviation AS "partyAbbreviation",
    p.color_hex AS "partyColorHex", p.logo_url AS "partyLogoUrl",
    s.name AS "stateName", s.slug AS "stateSlug",
    COALESCE(
      sd.name, fc.name, sc.name, l.name, w.name
    ) AS "constituencyName",
    COALESCE(
      sd.slug, fc.slug, sc.slug, l.slug, w.slug
    ) AS "constituencySlug",
    CASE
      WHEN r.senatorial_district_id  IS NOT NULL THEN 'senatorial'
      WHEN r.federal_constituency_id IS NOT NULL THEN 'federal'
      WHEN r.state_constituency_id   IS NOT NULL THEN 'state'
      WHEN r.lga_id                  IS NOT NULL THEN 'lga'
      WHEN r.ward_id                 IS NOT NULL THEN 'ward'
      ELSE NULL
    END AS "constituencyType"
  FROM representatives r
  LEFT JOIN parties               p  ON p.id = r.party_id
  LEFT JOIN states                s  ON s.id = r.state_id
  LEFT JOIN senatorial_districts  sd ON sd.id = r.senatorial_district_id
  LEFT JOIN federal_constituencies fc ON fc.id = r.federal_constituency_id
  LEFT JOIN state_constituencies   sc ON sc.id = r.state_constituency_id
  LEFT JOIN lgas                   l  ON l.id = r.lga_id
  LEFT JOIN wards                  w  ON w.id = r.ward_id
`

function shapeRep(row: Record<string, unknown>) {
  return {
    id:     row['id'],
    slug:   row['slug'],
    fullName: row['fullName'],
    role:   row['role'],
    status: row['status'],
    party: row['partyId'] ? {
      id:           row['partyId'],
      name:         row['partyName'],
      abbreviation: row['partyAbbreviation'],
      colorHex:     row['partyColorHex'],
      logoUrl:      row['partyLogoUrl'],
    } : null,
    state: row['stateName'] ? { name: row['stateName'], slug: row['stateSlug'] } : null,
    constituency: {
      type: row['constituencyType'],
      name: row['constituencyName'],
      slug: row['constituencySlug'],
    },
    photoUrl:    row['photoUrl'],
    bio:         row['bio'],
    termStart:   row['termStart'],
    termEnd:     row['termEnd'],
    contact: {
      email:         row['email'],
      phone:         row['phone'],
      officeAddress: row['officeAddress'],
      website:       row['website'],
      twitterHandle: row['twitterHandle'],
      facebookUrl:   row['facebookUrl'],
    },
    dataVerified: row['dataVerified'],
  }
}

// ── GET /reps ─────────────────────────────────────────────────
// Browse reps with filters

const listSchema = z.object({
  role:     z.string().optional(),
  state:    z.string().optional(),
  status:   z.enum(['incumbent', 'former']).optional().default('incumbent'),
  page:     z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
})

app.get('/', apiRateLimit, zValidator('query', listSchema), async (c) => {
  try {
    const { role, state, status, page, pageSize } = c.req.valid('query')
    const offset = (page - 1) * pageSize

    const conditions: string[] = [`r.status = '${status}'`]
    const params: unknown[]    = []

    if (role) {
      params.push(role)
      conditions.push(`r.role = $${params.length}`)
    }
    if (state) {
      params.push(state)
      conditions.push(`s.slug = $${params.length}`)
    }

    const where = `WHERE ${conditions.join(' AND ')}`

    const [rows, countRow] = await Promise.all([
      db.queryMany(
        `${REP_SELECT} ${where} ORDER BY r.full_name LIMIT ${pageSize} OFFSET ${offset}`,
        ...params
      ),
      db.query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM representatives r
         LEFT JOIN states s ON s.id = r.state_id ${where}`,
        ...params
      ),
    ])

    return ok(c, {
      items:    rows.map(r => shapeRep(r as Record<string, unknown>)),
      total:    Number(countRow?.total ?? 0),
      page,
      pageSize,
      hasMore:  offset + rows.length < Number(countRow?.total ?? 0),
    })
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /reps/:slug ───────────────────────────────────────────

app.get('/:slug', apiRateLimit, async (c) => {
  try {
    const row = await db.query(
      `${REP_SELECT} WHERE r.slug = $1 LIMIT 1`,
      c.req.param('slug')
    )
    if (!row) return notFound(c, `Representative not found`)
    return ok(c, shapeRep(row as Record<string, unknown>))
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /reps/ward/:wardId ────────────────────────────────────
// Returns all reps for a ward (the full political stack)

app.get('/ward/:wardId', apiRateLimit, async (c) => {
  try {
    const wardId = parseInt(c.req.param('wardId'), 10)
    if (isNaN(wardId)) return notFound(c, 'Invalid ward ID')

    // Fetch ward → constituency IDs
    const ward = await db.query<{
      stateId: number; lgaId: number
      scId: number | null; fcId: number | null; sdId: number | null
    }>(
      `SELECT state_id AS "stateId", lga_id AS "lgaId",
              state_constituency_id AS "scId",
              federal_constituency_id AS "fcId",
              senatorial_district_id AS "sdId"
       FROM wards WHERE id = $1`,
      wardId
    )
    if (!ward) return notFound(c, 'Ward not found')

    // Fetch all reps whose constituency contains this ward
    const reps = await db.queryMany(
      `${REP_SELECT}
       WHERE r.status = 'incumbent'
         AND (
           r.state_id = $1                                              -- governor, president
           OR r.lga_id = $2                                             -- LGA chairman
           OR r.ward_id = $3                                            -- councillor
           OR (r.state_constituency_id  IS NOT NULL AND r.state_constituency_id  = $4)
           OR (r.federal_constituency_id IS NOT NULL AND r.federal_constituency_id = $5)
           OR (r.senatorial_district_id  IS NOT NULL AND r.senatorial_district_id  = $6)
           OR r.role IN ('president', 'vice_president')
         )
       ORDER BY
         CASE r.role
           WHEN 'president'      THEN 1
           WHEN 'vice_president' THEN 2
           WHEN 'governor'       THEN 3
           WHEN 'senator'        THEN 4
           WHEN 'house_of_reps'  THEN 5
           WHEN 'state_assembly' THEN 6
           WHEN 'lga_chairman'   THEN 7
           WHEN 'councillor'     THEN 8
           ELSE 9
         END`,
      ward.stateId, ward.lgaId, wardId,
      ward.scId, ward.fcId, ward.sdId
    )

    return ok(c, reps.map(r => shapeRep(r as Record<string, unknown>)))
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /reps/search?q= ───────────────────────────────────────

app.get('/search', apiRateLimit, async (c) => {
  try {
    const q = c.req.query('q')?.trim()
    if (!q || q.length < 2) {
      return ok(c, [])
    }

    const rows = await db.queryMany(
      `${REP_SELECT}
       WHERE r.full_name ILIKE $1
          OR similarity(r.full_name, $2) > 0.3
       ORDER BY similarity(r.full_name, $2) DESC, r.full_name
       LIMIT 10`,
      `%${q}%`, q
    )
    return ok(c, rows.map(r => shapeRep(r as Record<string, unknown>)))
  } catch (e) {
    return handleError(e, c)
  }
})

export default app
