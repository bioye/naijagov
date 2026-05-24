import type { Context, Next } from 'hono'
import { AppError } from '../lib/errors'

interface Window {
  count: number
  resetAt: number
}

const store = new Map<string, Window>()

function getKey(c: Context, prefix: string): string {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
           ?? c.req.header('x-real-ip')
           ?? 'unknown'
  return `${prefix}:${ip}`
}

/**
 * Creates a rate limiter middleware.
 *
 * @param max       - max requests per window
 * @param windowMs  - window size in milliseconds
 * @param prefix    - key namespace (use one per route group)
 */
export function rateLimit(max: number, windowMs: number, prefix = 'rl') {
  // Prune expired keys every 5 minutes to prevent memory leaks
  setInterval(() => {
    const now = Date.now()
    for (const [key, w] of store) {
      if (w.resetAt < now) store.delete(key)
    }
  }, 5 * 60 * 1000)

  return async function rateLimitMiddleware(c: Context, next: Next) {
    const key = getKey(c, prefix)
    const now = Date.now()
    const win = store.get(key)

    if (!win || win.resetAt < now) {
      store.set(key, { count: 1, resetAt: now + windowMs })
      c.header('X-RateLimit-Limit', String(max))
      c.header('X-RateLimit-Remaining', String(max - 1))
      return next()
    }

    win.count++
    const remaining = Math.max(0, max - win.count)
    c.header('X-RateLimit-Limit', String(max))
    c.header('X-RateLimit-Remaining', String(remaining))
    c.header('X-RateLimit-Reset', String(Math.ceil(win.resetAt / 1000)))

    if (win.count > max) {
      throw new AppError('RATE_LIMITED', 'Too many requests. Please try again later.', 429)
    }

    return next()
  }
}

// Pre-configured limiters
export const otpRateLimit     = rateLimit(5,   15 * 60 * 1000, 'otp')   // 5/15min — OTP requests
export const resolverRateLimit = rateLimit(60,  60 * 1000,      'res')   // 60/min  — resolver
export const apiRateLimit     = rateLimit(120,  60 * 1000,      'api')   // 120/min — general API
