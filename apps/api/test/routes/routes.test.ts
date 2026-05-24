import { describe, it, expect, vi, beforeEach } from 'vitest'
import app from '../../src/index'
import db from '../../src/lib/db'
import { signToken } from '../../src/middleware/auth'
import type { AuthUser } from '@naijagov/shared'

// ── Test helpers ──────────────────────────────────────────────

async function request(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path:   string,
  opts: { body?: unknown; token?: string } = {}
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`

  const req = new Request(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  return app.fetch(req)
}

async function getToken(overrides: Partial<AuthUser> = {}): Promise<string> {
  return signToken({
    id: 'user-uuid-test', phone: '+2348012345678',
    displayName: 'Test Citizen', verificationTier: 'phone_verified',
    wardId: null, isAdmin: false,
    ...overrides,
  })
}

async function getAdminToken(): Promise<string> {
  return getToken({ isAdmin: true, id: 'admin-uuid-test' })
}

// ── Health ────────────────────────────────────────────────────

describe('GET /', () => {
  it('returns API info', async () => {
    const res  = await request('GET', '/')
    const body = await res.json() as { ok: boolean; data: { name: string } }
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.name).toBe('NaijaGov API')
  })
})

describe('GET /health', () => {
  it('returns ok when db is healthy', async () => {
    vi.mocked(db.query).mockResolvedValue({ '?column?': 1 })
    const res  = await request('GET', '/health')
    const body = await res.json() as { status: string }
    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
  })

  it('returns degraded when db is down', async () => {
    vi.mocked(db.query).mockRejectedValue(new Error('connection refused'))
    const res  = await request('GET', '/health')
    const body = await res.json() as { status: string; db: string }
    expect(res.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.db).toBe('error')
  })
})

// ── Auth ──────────────────────────────────────────────────────

describe('POST /api/auth/otp/request', () => {
  beforeEach(() => {
    vi.mocked(db.query).mockResolvedValue(null)
    vi.mocked(db.execute).mockResolvedValue(undefined)
  })

  it('returns 200 for a valid Nigerian number', async () => {
    const res  = await request('POST', '/api/auth/otp/request', { body: { phone: '08012345678' } })
    const body = await res.json() as { ok: boolean }
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it('returns 400 for missing phone', async () => {
    const res = await request('POST', '/api/auth/otp/request', { body: {} })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid phone format', async () => {
    const res = await request('POST', '/api/auth/otp/request', { body: { phone: '123' } })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/otp/verify', () => {
  it('returns 400 for non-6-digit code', async () => {
    const res = await request('POST', '/api/auth/otp/verify', {
      body: { phone: '08012345678', code: '12345' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-numeric code', async () => {
    const res = await request('POST', '/api/auth/otp/verify', {
      body: { phone: '08012345678', code: 'ABCDEF' },
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/auth/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request('GET', '/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('returns 200 with a valid token', async () => {
    const token = await getToken()
    const res   = await request('GET', '/api/auth/me', { token })
    expect(res.status).toBe(200)
  })
})

// ── Geo ───────────────────────────────────────────────────────

describe('POST /api/geo/resolve/voter-card', () => {
  const MOCK_STACK = {
    stateId: 27, stateInecCode: 27, stateAlphaCode: 'OG',
    stateName: 'OGUN', stateSlug: 'ogun', geopoliticalZone: 'South West',
    lgaId: 42, lgaInecCode: 2, lgaName: 'ABEOKUTA SOUTH', lgaSlug: 'abeokuta-south',
    wardId: 6392, wardInecCode: 10, compoundCode: 'OG0210',
    wardName: 'SODEKE/ISALE IJEUN I', wardSlug: 'sodeke-isale-ijeun-i',
    scMappingMissing: false, fcMappingMissing: false, sdMappingMissing: true,
    scId: 724, scInecCode: 'SC/724/OG', scName: 'ABEOKUTA SOUTH II', scSlug: 'abeokuta-south-ii',
    fcId: 268, fcInecCode: 'FC/268/OG', fcName: 'Abeokuta South', fcSlug: 'abeokuta-south',
    sdId: null, sdInecCode: null, sdName: null, sdSlug: null,
    puId: 91200, puLocId: 'OG0210001', inecPuCode: 1,
    puDescription: 'in front of sekoni mosque', hasGps: true, lat: 7.1604, lng: 3.3423,
  }

  beforeEach(() => {
    vi.mocked(db.query).mockResolvedValue(MOCK_STACK)
  })

  it('resolves the voter card from the real card in our data', async () => {
    const res  = await request('POST', '/api/geo/resolve/voter-card', { body: { code: '27-02-10-001' } })
    const body = await res.json() as { ok: boolean; data: { state: { name: string } } }
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.data.state.name).toBe('OGUN')
  })

  it('accepts slash-separated code', async () => {
    const res = await request('POST', '/api/geo/resolve/voter-card', { body: { code: '27/02/10/001' } })
    expect(res.status).toBe(200)
  })

  it('returns 400 for malformed code', async () => {
    const res = await request('POST', '/api/geo/resolve/voter-card', { body: { code: 'NOTACODE' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing code', async () => {
    const res = await request('POST', '/api/geo/resolve/voter-card', { body: {} })
    expect(res.status).toBe(400)
  })

  it('returns 404 when ward not found in DB', async () => {
    vi.mocked(db.query).mockResolvedValue(null)
    const res = await request('POST', '/api/geo/resolve/voter-card', { body: { code: '1-1-1-1' } })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/geo/resolve/text', () => {
  it('returns 400 for too-short LGA name', async () => {
    const res = await request('POST', '/api/geo/resolve/text', { body: { lgaName: 'X' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing LGA name', async () => {
    const res = await request('POST', '/api/geo/resolve/text', { body: { wardName: 'Sodeke' } })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/geo/resolve/gps', () => {
  it('returns 400 for coordinates outside Nigeria bounding box', async () => {
    const res = await request('POST', '/api/geo/resolve/gps', { body: { lat: 51.5, lng: -0.1 } })  // London
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing coordinates', async () => {
    const res = await request('POST', '/api/geo/resolve/gps', { body: { lat: 7.1 } })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/geo/states', () => {
  beforeEach(() => {
    vi.mocked(db.queryMany).mockResolvedValue([
      { id: 24, inecCode: 24, alphaCode: 'LA', name: 'LAGOS', slug: 'lagos', geopoliticalZone: 'South West' },
      { id: 27, inecCode: 27, alphaCode: 'OG', name: 'OGUN',  slug: 'ogun',  geopoliticalZone: 'South West' },
    ])
  })

  it('returns all states', async () => {
    const res  = await request('GET', '/api/geo/states')
    const body = await res.json() as { ok: boolean; data: unknown[] }
    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(2)
  })
})

// ── Reps ──────────────────────────────────────────────────────

describe('GET /api/reps', () => {
  beforeEach(() => {
    vi.mocked(db.queryMany).mockResolvedValue([])
    vi.mocked(db.query).mockResolvedValue({ total: 0 })
  })

  it('returns paginated reps', async () => {
    const res  = await request('GET', '/api/reps')
    const body = await res.json() as { ok: boolean; data: { items: unknown[]; total: number } }
    expect(res.status).toBe(200)
    expect(body.data).toHaveProperty('items')
    expect(body.data).toHaveProperty('total')
  })

  it('accepts role filter', async () => {
    const res = await request('GET', '/api/reps?role=senator')
    expect(res.status).toBe(200)
  })

  it('rejects invalid pageSize', async () => {
    const res = await request('GET', '/api/reps?pageSize=1000')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/reps/:slug', () => {
  it('returns 404 for unknown slug', async () => {
    vi.mocked(db.query).mockResolvedValue(null)
    const res = await request('GET', '/api/reps/unknown-person')
    expect(res.status).toBe(404)
  })
})

// ── Feed ──────────────────────────────────────────────────────

describe('GET /api/feed', () => {
  beforeEach(() => {
    vi.mocked(db.queryMany).mockResolvedValue([])
    vi.mocked(db.query).mockResolvedValue({ total: 0 })
  })

  it('returns 200 without auth (public feed)', async () => {
    const res = await request('GET', '/api/feed')
    expect(res.status).toBe(200)
  })

  it('accepts scope filter', async () => {
    const res = await request('GET', '/api/feed?scope=state&scopeId=24')
    expect(res.status).toBe(200)
  })

  it('rejects invalid sort value', async () => {
    const res = await request('GET', '/api/feed?sort=random')
    expect(res.status).toBe(400)
  })
})

describe('POST /api/feed', () => {
  it('returns 401 without auth', async () => {
    const res = await request('POST', '/api/feed', {
      body: { body: 'Test post', topic: 'infrastructure' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 201 with valid auth and body', async () => {
    const token = await getToken()
    vi.mocked(db.query).mockResolvedValue({ id: 'post-uuid-1' })
    vi.mocked(db.execute).mockResolvedValue(undefined)

    const res  = await request('POST', '/api/feed', {
      token,
      body: { body: 'Road in my area is broken', topic: 'infrastructure' },
    })
    expect(res.status).toBe(201)
  })

  it('returns 400 for body exceeding 500 chars', async () => {
    const token = await getToken()
    const res   = await request('POST', '/api/feed', {
      token,
      body: { body: 'A'.repeat(501), topic: 'other' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid topic', async () => {
    const token = await getToken()
    const res   = await request('POST', '/api/feed', {
      token,
      body: { body: 'Test', topic: 'invalid_topic' },
    })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/feed/:id/upvote', () => {
  it('returns 401 without auth', async () => {
    const res = await request('POST', '/api/feed/some-post-id/upvote')
    expect(res.status).toBe(401)
  })
})

// ── 404 fallback ──────────────────────────────────────────────

describe('404 handler', () => {
  it('returns structured error for unknown routes', async () => {
    const res  = await request('GET', '/api/does-not-exist')
    const body = await res.json() as { ok: boolean; error: { code: string } }
    expect(res.status).toBe(404)
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
  })
})

// ── Elections ─────────────────────────────────────────────────

describe('GET /api/elections', () => {
  beforeEach(() => {
    vi.mocked(db.queryMany).mockResolvedValue([
      { id: 7, year: 2027, electionDate: '2027-02-27', status: 'upcoming', daysRemaining: 600 },
      { id: 6, year: 2023, electionDate: '2023-02-25', status: 'declared', daysRemaining: null },
    ])
  })

  it('returns all election cycles', async () => {
    const res  = await request('GET', '/api/elections')
    const body = await res.json() as { data: unknown[] }
    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(2)
  })
})

describe('GET /api/elections/:year', () => {
  it('returns 404 for year with no data', async () => {
    vi.mocked(db.query).mockResolvedValue(null)
    const res = await request('GET', '/api/elections/1990')
    expect(res.status).toBe(404)
  })

  it('returns 404 for non-numeric year', async () => {
    const res = await request('GET', '/api/elections/notayear')
    expect(res.status).toBe(404)
  })
})
