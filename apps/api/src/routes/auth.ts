import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { requestOtp, verifyOtpAndLogin, updateUserWard } from '../services/auth'
import { requireAuth } from '../middleware/auth'
import { otpRateLimit } from '../middleware/rateLimit'
import { ok, handleError } from '../lib/errors'
import type { AuthUser } from '@naijagov/shared'

const app = new Hono()

// ── POST /auth/otp/request ────────────────────────────────────

const requestSchema = z.object({
  phone: z.string().min(10).max(15),
})

app.post('/otp/request', otpRateLimit, zValidator('json', requestSchema), async (c) => {
  try {
    const { phone } = c.req.valid('json')
    const result    = await requestOtp(phone)
    return ok(c, result)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── POST /auth/otp/verify ─────────────────────────────────────

const verifySchema = z.object({
  phone: z.string().min(10).max(15),
  code:  z.string().length(6).regex(/^\d{6}$/),
})

app.post('/otp/verify', otpRateLimit, zValidator('json', verifySchema), async (c) => {
  try {
    const { phone, code } = c.req.valid('json')
    const result          = await verifyOtpAndLogin(phone, code)
    return ok(c, {
      token:     result.token,
      user:      result.user,
      isNewUser: result.isNewUser,
    }, result.isNewUser ? 201 : 200)
  } catch (e) {
    return handleError(e, c)
  }
})

// ── GET /auth/me ──────────────────────────────────────────────

app.get('/me', requireAuth, (c) => {
  const user = c.get('user') as AuthUser
  return ok(c, user)
})

// ── PATCH /auth/me/ward ───────────────────────────────────────

const wardSchema = z.object({
  wardId: z.number().int().positive(),
})

app.patch('/me/ward', requireAuth, zValidator('json', wardSchema), async (c) => {
  try {
    const user   = c.get('user') as AuthUser
    const { wardId } = c.req.valid('json')
    await updateUserWard(user.id, wardId)
    return ok(c, { message: 'Ward updated successfully' })
  } catch (e) {
    return handleError(e, c)
  }
})

export default app
