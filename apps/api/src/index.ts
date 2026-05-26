import "dotenv/config"
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { serve } from '@hono/node-server'

import healthRoutes    from './routes/health'
import authRoutes      from './routes/auth'
import geoRoutes       from './routes/geo'
import repsRoutes      from './routes/reps'
import electionsRoutes from './routes/elections'
import feedRoutes      from './routes/feed'
import { handleError, err } from './lib/errors'

const app = new Hono()

// ── Global middleware ─────────────────────────────────────────

app.use('*', logger())
app.use('*', secureHeaders())
app.use('*', cors({
  origin: [
    'https://naijagov.ng',
    'https://www.naijagov.ng',
    'https://naijagov.vercel.app',
    ...(process.env['NODE_ENV'] !== 'production'
      ? ['http://localhost:3000', 'http://localhost:3001']
      : []),
  ],
  allowMethods:  ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders:  ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials:   true,
  maxAge:        600,
}))

// ── Routes ────────────────────────────────────────────────────

app.route('/',           healthRoutes)
app.route('/api/auth',   authRoutes)
app.route('/api/geo',    geoRoutes)
app.route('/api/reps',   repsRoutes)
app.route('/api/elections', electionsRoutes)
app.route('/api/feed',   feedRoutes)

// ── 404 fallback ──────────────────────────────────────────────

app.notFound((c) => err(c, 'NOT_FOUND', `Route ${c.req.method} ${c.req.path} not found`, 404))

// ── Global error handler ──────────────────────────────────────

app.onError((error, c) => handleError(error, c))

// ── Start server ──────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '8080', 10)

if (process.env['NODE_ENV'] !== 'test') {
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`NaijaGov API running on http://localhost:${info.port}`)
    console.log(`Environment: ${process.env['NODE_ENV'] ?? 'development'}`)
  })
}

export default app
