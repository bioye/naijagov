import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { ok, handleError, notFound, unauthorized } from '../lib/errors'
import { requireAuth, optionalAuth } from '../middleware/auth'
import { apiRateLimit } from '../middleware/rateLimit'
import { AppError } from '../lib/errors'
import type { AuthUser } from '@naijagov/shared'
import db from '../lib/db'

const app = new Hono()

// ── GET /feed ─────────────────────────────────────────────────

const feedQuerySchema = z.object({
  scope:       z.enum(['ward', 'lga', 'state', 'national', 'elections']).optional().default('national'),
  scopeId:     z.coerce.number().int().positive().optional(),
  topic:       z.string().optional(),
  sort:        z.enum(['top', 'recent']).optional().default('top'),
  verifiedOnly: z.coerce.boolean().optional().default(false),
  page:        z.coerce.number().int().positive().optional().default(1),
  pageSize:    z.coerce.number().int().min(1).max(50).optional().default(20),
})

app.get('/', apiRateLimit, optionalAuth, zValidator('query', feedQuerySchema), async (c) => {
  try {
    const { scope, scopeId, topic, sort, verifiedOnly, page, pageSize } = c.req.valid('query')
    const user    = c.get('user') as AuthUser | undefined
    const offset  = (page - 1) * pageSize

    const conditions: string[] = ['p.is_removed = false']
    const params: unknown[]    = []

    // Scope filter
    if (scope === 'ward' && scopeId) {
      params.push(scopeId); conditions.push(`p.ward_id = $${params.length}`)
    } else if (scope === 'lga' && scopeId) {
      params.push(scopeId); conditions.push(`p.lga_id = $${params.length}`)
    } else if (scope === 'state' && scopeId) {
      params.push(scopeId); conditions.push(`p.state_id = $${params.length}`)
    } else if (scope === 'elections') {
      conditions.push(`p.topic = 'elections'`)
    }

    if (topic) {
      params.push(topic); conditions.push(`p.topic = $${params.length}`)
    }
    if (verifiedOnly) {
      conditions.push(`u.verification = 'nin_verified'`)
    }

    const where   = `WHERE ${conditions.join(' AND ')}`
    const orderBy = sort === 'top'
      ? `ORDER BY p.rank_score DESC, p.created_at DESC`
      : `ORDER BY p.created_at DESC`

    // User upvote status — only if logged in
    const upvoteJoin = user
      ? `LEFT JOIN post_upvotes uv ON uv.post_id = p.id AND uv.user_id = '${user.id}'`
      : ''
    const upvoteSelect = user ? `, uv.post_id IS NOT NULL AS "userHasUpvoted"` : `, false AS "userHasUpvoted"`

    const rows = await db.queryMany(
      `SELECT
         p.id, p.body, p.topic, p.created_at AS "createdAt",
         p.upvote_count AS "upvoteCount", p.reply_count AS "replyCount",
         p.ward_id AS "wardId", p.lga_id AS "lgaId", p.state_id AS "stateId",
         w.name AS "wardName", l.name AS "lgaName", s.name AS "stateName",
         u.id AS "authorId", u.display_name AS "authorDisplayName",
         u.verification AS "authorVerification",
         wu.name AS "authorWardName", lu.name AS "authorLgaName"
         ${upvoteSelect}
       FROM posts p
       JOIN users u  ON u.id = p.user_id
       LEFT JOIN wards  w  ON w.id  = p.ward_id
       LEFT JOIN lgas   l  ON l.id  = p.lga_id
       LEFT JOIN states s  ON s.id  = p.state_id
       LEFT JOIN wards  wu ON wu.id = u.ward_id
       LEFT JOIN lgas   lu ON lu.id = wu.lga_id
       ${upvoteJoin}
       ${where}
       ${orderBy}
       LIMIT ${pageSize} OFFSET ${offset}`,
      ...params
    )

    const countRow = await db.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM posts p
       JOIN users u ON u.id = p.user_id ${where}`,
      ...params
    )

    return ok(c, {
      items: rows.map(shapPost),
      total: Number(countRow?.total ?? 0),
      page, pageSize,
      hasMore: offset + rows.length < Number(countRow?.total ?? 0),
    })
  } catch (e) {
    return handleError(e, c)
  }
})

// ── POST /feed ────────────────────────────────────────────────

const createPostSchema = z.object({
  body:        z.string().min(1).max(500),
  topic:       z.enum(['infrastructure','health','security','education','water',
                       'electricity','corruption','elections','youth','women','economy','other']),
  wardId:      z.number().int().positive().optional(),
  lgaId:       z.number().int().positive().optional(),
  stateId:     z.number().int().positive().optional(),
  candidateId: z.string().uuid().optional(),
  repId:       z.string().uuid().optional(),
})

app.post('/', requireAuth, zValidator('json', createPostSchema), async (c) => {
  try {
    const user    = c.get('user') as AuthUser
    const body    = c.req.valid('json')

    // If user hasn't set their ward, use the one from the request (if provided)
    const wardId  = body.wardId  ?? user.wardId ?? null
    const lgaId   = body.lgaId   ?? null
    const stateId = body.stateId ?? null

    const post = await db.query<{ id: string }>(
      `INSERT INTO posts
         (user_id, body, topic, ward_id, lga_id, state_id, candidate_id, rep_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      user.id, body.body, body.topic,
      wardId, lgaId, stateId,
      body.candidateId ?? null, body.repId ?? null
    )

    return ok(c, { id: post!.id }, 201)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /feed/:id ─────────────────────────────────────────────

app.get('/:id', apiRateLimit, optionalAuth, async (c) => {
  try {
    const user = c.get('user') as AuthUser | undefined
    const upvoteJoin   = user ? `LEFT JOIN post_upvotes uv ON uv.post_id = p.id AND uv.user_id = '${user.id}'` : ''
    const upvoteSelect = user ? `, uv.post_id IS NOT NULL AS "userHasUpvoted"` : `, false AS "userHasUpvoted"`

    const post = await db.query(
      `SELECT p.id, p.body, p.topic, p.created_at AS "createdAt",
              p.upvote_count AS "upvoteCount", p.reply_count AS "replyCount",
              p.ward_id AS "wardId", p.lga_id AS "lgaId", p.state_id AS "stateId",
              w.name AS "wardName", l.name AS "lgaName", s.name AS "stateName",
              u.id AS "authorId", u.display_name AS "authorDisplayName",
              u.verification AS "authorVerification"
              ${upvoteSelect}
       FROM posts p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN wards  w ON w.id = p.ward_id
       LEFT JOIN lgas   l ON l.id = p.lga_id
       LEFT JOIN states s ON s.id = p.state_id
       ${upvoteJoin}
       WHERE p.id = $1 AND p.is_removed = false`,
      c.req.param('id')
    )
    if (!post) return notFound(c)

    // Replies
    const replies = await db.queryMany(
      `SELECT r.id, r.body, r.created_at AS "createdAt",
              r.upvote_count AS "upvoteCount",
              u.display_name AS "authorDisplayName",
              u.verification AS "authorVerification"
       FROM replies r
       JOIN users u ON u.id = r.user_id
       WHERE r.post_id = $1 AND r.is_removed = false
       ORDER BY r.created_at ASC
       LIMIT 50`,
      c.req.param('id')
    )

    return ok(c, { ...shapPost(post as Record<string, unknown>), replies })
  } catch (e) {
    return handleError(e, c)
  }
})

// ── POST /feed/:id/upvote ─────────────────────────────────────

app.post('/:id/upvote', requireAuth, async (c) => {
  try {
    const user   = c.get('user') as AuthUser
    const postId = c.req.param('id')

    const existing = await db.query(
      `SELECT 1 FROM post_upvotes WHERE post_id = $1 AND user_id = $2`,
      postId, user.id
    )

    if (existing) {
      // Toggle off
      await db.execute(`DELETE FROM post_upvotes WHERE post_id = $1 AND user_id = $2`, postId, user.id)
      await db.execute(`UPDATE posts SET upvote_count = upvote_count - 1 WHERE id = $1`, postId)
      return ok(c, { upvoted: false })
    } else {
      await db.execute(`INSERT INTO post_upvotes (post_id, user_id) VALUES ($1, $2)`, postId, user.id)
      await db.execute(`UPDATE posts SET upvote_count = upvote_count + 1 WHERE id = $1`, postId)
      // Auto-index for SEO when 5+ upvotes
      await db.execute(
        `UPDATE posts SET seo_indexed = true WHERE id = $1 AND upvote_count >= 5`, postId
      )
      return ok(c, { upvoted: true })
    }
  } catch (e) {
    return handleError(e, c)
  }
})

// ── POST /feed/:id/flag ───────────────────────────────────────

app.post('/:id/flag', requireAuth, async (c) => {
  try {
    const user   = c.get('user') as AuthUser
    const postId = c.req.param('id')
    const reason = (await c.req.json() as { reason?: string })['reason'] ?? null

    await db.execute(
      `INSERT INTO post_flags (post_id, user_id, reason) VALUES ($1, $2, $3)
       ON CONFLICT (post_id, user_id) DO NOTHING`,
      postId, user.id, reason
    )
    await db.execute(
      `UPDATE posts SET
         flag_count = (SELECT COUNT(*) FROM post_flags WHERE post_id = $1),
         is_under_review = (SELECT COUNT(*) FROM post_flags WHERE post_id = $1) >= 5
       WHERE id = $1`,
      postId
    )
    return ok(c, { flagged: true })
  } catch (e) {
    return handleError(e, c)
  }
})

// ── POST /feed/:id/replies ────────────────────────────────────

const replySchema = z.object({ body: z.string().min(1).max(500) })

app.post('/:id/replies', requireAuth, zValidator('json', replySchema), async (c) => {
  try {
    const user   = c.get('user') as AuthUser
    const postId = c.req.param('id')
    const { body } = c.req.valid('json')

    const post = await db.query(`SELECT id FROM posts WHERE id = $1 AND is_removed = false`, postId)
    if (!post) return notFound(c, 'Post not found')

    const reply = await db.query<{ id: string }>(
      `INSERT INTO replies (post_id, user_id, body) VALUES ($1, $2, $3) RETURNING id`,
      postId, user.id, body
    )
    await db.execute(`UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1`, postId)

    return ok(c, { id: reply!.id }, 201)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── Helper ────────────────────────────────────────────────────

function shapPost(row: Record<string, unknown>) {
  return {
    id:    row['id'],
    body:  row['body'],
    topic: row['topic'],
    author: {
      id:               row['authorId'],
      displayName:      row['authorDisplayName'] ?? 'Citizen',
      verificationTier: row['authorVerification'],
      wardName:         row['authorWardName'] ?? null,
      lgaName:          row['authorLgaName']  ?? null,
    },
    scope: {
      wardId:    row['wardId'],
      lgaId:     row['lgaId'],
      stateId:   row['stateId'],
      wardName:  row['wardName'],
      lgaName:   row['lgaName'],
      stateName: row['stateName'],
    },
    upvoteCount:    row['upvoteCount'],
    replyCount:     row['replyCount'],
    userHasUpvoted: row['userHasUpvoted'],
    createdAt:      row['createdAt'],
  }
}

export default app
