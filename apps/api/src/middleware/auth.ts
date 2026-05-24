import type { Context, Next } from 'hono'
import { SignJWT, jwtVerify } from 'jose'
import type { AuthUser } from '@naijagov/shared'
import { AppError } from '../lib/errors'

const SECRET = new TextEncoder().encode(
  process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production-min32'
)
const ISSUER   = 'naijagov-api'
const AUDIENCE = 'naijagov-web'
const TTL_SECONDS = 60 * 60 * 24 * 30  // 30 days

// ── Token helpers ─────────────────────────────────────────────

export async function signToken(user: AuthUser): Promise<string> {
  return new SignJWT({
    sub:          user.id,
    phone:        user.phone,
    displayName:  user.displayName,
    verification: user.verificationTier,
    wardId:       user.wardId,
    isAdmin:      user.isAdmin,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<AuthUser> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      issuer:   ISSUER,
      audience: AUDIENCE,
    })
    return {
      id:               payload['sub'] as string,
      phone:            payload['phone'] as string,
      displayName:      (payload['displayName'] as string | null) ?? null,
      verificationTier: payload['verification'] as AuthUser['verificationTier'],
      wardId:           (payload['wardId'] as number | null) ?? null,
      isAdmin:          Boolean(payload['isAdmin']),
    }
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401)
  }
}

// ── Middleware ────────────────────────────────────────────────

/**
 * requireAuth — rejects requests with no valid JWT.
 * Attaches user to c.var.user.
 */
export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Authentication required', 401)
  }
  const token = header.slice(7)
  const user  = await verifyToken(token)
  c.set('user', user)
  await next()
}

/**
 * optionalAuth — attaches user if JWT present, continues either way.
 * Used for feed endpoints where unauth users can read but not write.
 */
export async function optionalAuth(c: Context, next: Next) {
  const header = c.req.header('Authorization')
  if (header?.startsWith('Bearer ')) {
    try {
      const user = await verifyToken(header.slice(7))
      c.set('user', user)
    } catch {
      // Invalid token — treat as unauthenticated, don't reject
    }
  }
  await next()
}

/**
 * requireAdmin — rejects non-admin users.
 * Must be used after requireAuth.
 */
export async function requireAdmin(c: Context, next: Next) {
  const user = c.get('user') as AuthUser | undefined
  if (!user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401)
  if (!user.isAdmin) throw new AppError('FORBIDDEN', 'Admin access required', 403)
  await next()
}
