import crypto from 'crypto'
import db from '../lib/db'
import { sendOtp, verifyOtp } from './sms'
import { signToken } from '../middleware/auth'
import { AppError } from '../lib/errors'
import type { AuthUser } from '@naijagov/shared'

// ── Phone normalisation ───────────────────────────────────────

/**
 * Normalise Nigerian phone numbers to E.164 format (+234XXXXXXXXXX).
 * Accepts: 08012345678, 8012345678, +2348012345678, 2348012345678
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')

  if (digits.startsWith('234') && digits.length === 13) return `+${digits}`
  if (digits.startsWith('0')   && digits.length === 11)  return `+234${digits.slice(1)}`
  if (digits.length === 10)                               return `+234${digits}`

  throw new AppError(
    'INVALID_INPUT',
    'Invalid phone number. Please use a Nigerian mobile number (e.g. 08012345678)',
    400
  )
}

// ── OTP request ───────────────────────────────────────────────

interface OtpRow {
  id: number
  phone: string
  pinId: string
  attempts: number
  expiresAt: Date
}

export async function requestOtp(rawPhone: string): Promise<{ message: string }> {
  const phone = normalisePhone(rawPhone)

  // Check for existing unexpired OTP — avoid spamming Termii
  const existing = await db.query<{ expiresAt: Date }>(
    `SELECT expires_at AS "expiresAt"
     FROM otp_attempts
     WHERE phone = $1 AND verified = false AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    phone
  )

  if (existing) {
    const secondsLeft = Math.ceil((existing.expiresAt.getTime() - Date.now()) / 1000)
    if (secondsLeft > 13 * 60) {  // less than 2 minutes elapsed
      throw new AppError(
        'RATE_LIMITED',
        `A code was recently sent. Please wait before requesting another.`,
        429
      )
    }
  }

  const { pinId } = await sendOtp(phone)

  await db.execute(
    `INSERT INTO otp_attempts (phone, code_hash, expires_at)
     VALUES ($1, $2, now() + interval '15 minutes')`,
    phone,
    // Store pinId hash — we verify via Termii, not locally
    crypto.createHash('sha256').update(pinId).digest('hex')
  )

  // Also store pinId in a separate short-lived cache for verify step
  await db.execute(
    `INSERT INTO otp_pin_cache (phone, pin_id, expires_at)
     VALUES ($1, $2, now() + interval '15 minutes')
     ON CONFLICT (phone) DO UPDATE SET pin_id = $2, expires_at = now() + interval '15 minutes'`,
    phone, pinId
  )

  return { message: `Verification code sent to ${phone.replace(/(\+234)(\d{3})(\d{4})(\d{4})/, '$1 $2 $3 $4')}` }
}

// ── OTP verify ────────────────────────────────────────────────

export async function verifyOtpAndLogin(
  rawPhone: string,
  otpCode:  string
): Promise<{ token: string; user: AuthUser; isNewUser: boolean }> {
  const phone = normalisePhone(rawPhone)

  // Retrieve the pinId for this phone
  const cache = await db.query<{ pinId: string; expiresAt: Date }>(
    `SELECT pin_id AS "pinId", expires_at AS "expiresAt"
     FROM otp_pin_cache WHERE phone = $1`,
    phone
  )

  if (!cache || cache.expiresAt < new Date()) {
    throw new AppError('OTP_EXPIRED', 'Verification code expired. Please request a new one.', 400)
  }

  // Check attempt count
  const attemptRow = await db.query<{ attempts: number }>(
    `SELECT attempts FROM otp_attempts
     WHERE phone = $1 AND verified = false AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    phone
  )

  if (attemptRow && attemptRow.attempts >= 5) {
    throw new AppError('OTP_TOO_MANY_ATTEMPTS', 'Too many failed attempts. Please request a new code.', 400)
  }

  // Verify with Termii
  const valid = await verifyOtp(cache.pinId, otpCode)

  if (!valid) {
    // Increment attempt count
    await db.execute(
      `UPDATE otp_attempts SET attempts = attempts + 1
       WHERE phone = $1 AND verified = false AND expires_at > now()`,
      phone
    )
    throw new AppError('OTP_INVALID', 'Incorrect verification code. Please try again.', 400)
  }

  // Mark OTP as used
  await db.execute(
    `UPDATE otp_attempts SET verified = true WHERE phone = $1 AND verified = false`,
    phone
  )
  await db.execute(`DELETE FROM otp_pin_cache WHERE phone = $1`, phone)

  // Upsert user
  const existingUser = await db.query<{ id: string; isNewUser: false }>(
    `SELECT id FROM users WHERE phone = $1`,
    phone
  )

  let userId: string
  let isNewUser: boolean

  if (existingUser) {
    userId    = existingUser.id
    isNewUser = false
  } else {
    const newUser = await db.query<{ id: string }>(
      `INSERT INTO users (phone, verification) VALUES ($1, 'phone_verified') RETURNING id`,
      phone
    )
    userId    = newUser!.id
    isNewUser = true
  }

  // Fetch full user record
  const userRow = await db.query<{
    id: string; phone: string; displayName: string | null
    verification: string; wardId: number | null; isAdmin: boolean
  }>(
    `SELECT id, phone, display_name AS "displayName",
            verification, ward_id AS "wardId", is_admin AS "isAdmin"
     FROM users WHERE id = $1`,
    userId
  )

  if (!userRow) throw new AppError('INTERNAL', 'User not found after creation', 500)

  const user: AuthUser = {
    id:               userRow.id,
    phone:            userRow.phone,
    displayName:      userRow.displayName,
    verificationTier: userRow.verification as AuthUser['verificationTier'],
    wardId:           userRow.wardId,
    isAdmin:          userRow.isAdmin,
  }

  const token = await signToken(user)
  return { token, user, isNewUser }
}

// ── Update ward ───────────────────────────────────────────────

export async function updateUserWard(userId: string, wardId: number): Promise<void> {
  const ward = await db.query<{ id: number }>(
    `SELECT id FROM wards WHERE id = $1`, wardId
  )
  if (!ward) throw new AppError('NOT_FOUND', 'Ward not found', 404)

  await db.execute(
    `UPDATE users SET ward_id = $1, updated_at = now() WHERE id = $2`,
    wardId, userId
  )
}
