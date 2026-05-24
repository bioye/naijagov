import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import {
  parseVoterCardCode,
  resolveByVoterCard,
  resolveByText,
  resolveByGeo,
} from '../services/geo'
import { resolverRateLimit } from '../middleware/rateLimit'
import { ok, handleError, notFound } from '../lib/errors'
import db from '../lib/db'

const app = new Hono()

// ── POST /geo/resolve/voter-card ──────────────────────────────
// Primary resolver: from PVC CODE field

const voterCardSchema = z.object({
  code: z.string().regex(
    /^\d{1,2}[-/ ]\d{1,2}[-/ ]\d{1,2}[-/ ]\d{1,3}$/,
    'Code must be in format SS-LL-WW-PPP (e.g. 27-02-10-001)'
  ),
})

app.post('/resolve/voter-card', resolverRateLimit, zValidator('json', voterCardSchema), async (c) => {
  try {
    const { code }  = c.req.valid('json')
    const parsed    = parseVoterCardCode(code)
    const stack     = await resolveByVoterCard(parsed)
    return ok(c, stack)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── POST /geo/resolve/text ────────────────────────────────────
// Text search: LGA name + optional ward name

const textSchema = z.object({
  lgaName:   z.string().min(2).max(100),
  wardName:  z.string().min(2).max(100).optional(),
  stateName: z.string().min(2).max(100).optional(),
})

app.post('/resolve/text', resolverRateLimit, zValidator('json', textSchema), async (c) => {
  try {
    const input   = c.req.valid('json')
    const results = await resolveByText(input)
    // Single unambiguous result → return it directly
    // Multiple results → return all for disambiguation UI
    if (results.length === 1) return ok(c, { match: results[0], ambiguous: false })
    return ok(c, { matches: results, ambiguous: true })
  } catch (e) {
    return handleError(e, c)
  }
})

// ── POST /geo/resolve/gps ─────────────────────────────────────
// GPS resolver: lat/lng → nearest polling unit → ward

const gpsSchema = z.object({
  lat: z.number().min(4.0).max(14.0),   // Nigeria bounding box
  lng: z.number().min(2.5).max(15.0),
})

app.post('/resolve/gps', resolverRateLimit, zValidator('json', gpsSchema), async (c) => {
  try {
    const { lat, lng } = c.req.valid('json')
    const stack        = await resolveByGeo({ lat, lng })
    return ok(c, stack)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /geo/states ───────────────────────────────────────────

app.get('/states', async (c) => {
  try {
    const states = await db.queryMany(
      `SELECT id, inec_code AS "inecCode", alpha_code AS "alphaCode",
              name, slug, geopolitical_zone AS "geopoliticalZone"
       FROM states ORDER BY name`
    )
    return ok(c, states)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /geo/states/:slug ─────────────────────────────────────

app.get('/states/:slug', async (c) => {
  try {
    const state = await db.query(
      `SELECT s.id, s.inec_code AS "inecCode", s.alpha_code AS "alphaCode",
              s.name, s.slug, s.geopolitical_zone AS "geopoliticalZone",
              COUNT(DISTINCT l.id) AS "lgaCount",
              COUNT(DISTINCT w.id) AS "wardCount"
       FROM states s
       LEFT JOIN lgas l ON l.state_id = s.id
       LEFT JOIN wards w ON w.state_id = s.id
       WHERE s.slug = $1
       GROUP BY s.id`,
      c.req.param('slug')
    )
    if (!state) return notFound(c, `State "${c.req.param('slug')}" not found`)
    return ok(c, state)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /geo/states/:stateSlug/lgas ──────────────────────────

app.get('/states/:stateSlug/lgas', async (c) => {
  try {
    const lgas = await db.queryMany(
      `SELECT l.id, l.inec_code AS "inecCode", l.name, l.slug,
              COUNT(w.id) AS "wardCount"
       FROM lgas l
       JOIN states s ON s.id = l.state_id
       LEFT JOIN wards w ON w.lga_id = l.id
       WHERE s.slug = $1
       GROUP BY l.id
       ORDER BY l.name`,
      c.req.param('stateSlug')
    )
    return ok(c, lgas)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /geo/wards/:compoundCode ──────────────────────────────

app.get('/wards/:compoundCode', async (c) => {
  try {
    const ward = await db.query(
      `SELECT w.id, w.compound_code AS "compoundCode", w.name, w.slug,
              w.sc_mapping_missing AS "scMappingMissing",
              w.fc_mapping_missing AS "fcMappingMissing",
              w.sd_mapping_missing AS "sdMappingMissing",
              l.name AS "lgaName", l.slug AS "lgaSlug",
              s.name AS "stateName", s.slug AS "stateSlug",
              sc.name AS "stateConstituency",
              fc.name AS "federalConstituency",
              sd.name AS "senatorialDistrict"
       FROM wards w
       JOIN lgas l  ON l.id = w.lga_id
       JOIN states s ON s.id = w.state_id
       LEFT JOIN state_constituencies   sc ON sc.id = w.state_constituency_id
       LEFT JOIN federal_constituencies fc ON fc.id = w.federal_constituency_id
       LEFT JOIN senatorial_districts   sd ON sd.id = w.senatorial_district_id
       WHERE UPPER(w.compound_code) = UPPER($1)`,
      c.req.param('compoundCode')
    )
    if (!ward) return notFound(c, `Ward "${c.req.param('compoundCode')}" not found`)
    return ok(c, ward)
  } catch (e) {
    return handleError(e, c)
  }
})

export default app
