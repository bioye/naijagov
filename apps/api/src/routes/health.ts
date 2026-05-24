import { Hono } from 'hono'
import db from '../lib/db'
import { ok } from '../lib/errors'

const app = new Hono()

app.get('/', (c) => ok(c, { name: 'NaijaGov API', version: '1.0.0' }))

app.get('/health', async (c) => {
  const start = Date.now()
  let dbStatus = 'ok'

  try {
    await db.query('SELECT 1')
  } catch {
    dbStatus = 'error'
  }

  const status = dbStatus === 'ok' ? 'ok' : 'degraded'
  const httpStatus = status === 'ok' ? 200 : 503

  return c.json({
    status,
    db:      dbStatus,
    version: process.env['npm_package_version'] ?? '0.0.1',
    uptimeSeconds: Math.floor(process.uptime()),
    responseTimeMs: Date.now() - start,
    env:     process.env['NODE_ENV'] ?? 'development',
  }, httpStatus as 200 | 503)
})

export default app
