import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalisePhone, requestOtp, verifyOtpAndLogin } from '../../src/services/auth'
import { sendOtp, verifyOtp } from '../../src/services/sms'
import db from '../../src/lib/db'
import { AppError } from '../../src/lib/errors'

// ── normalisePhone ────────────────────────────────────────────

describe('normalisePhone', () => {
  it('accepts E.164 format', () => {
    expect(normalisePhone('+2348012345678')).toBe('+2348012345678')
  })

  it('normalises local format 080XXXXXXXX', () => {
    expect(normalisePhone('08012345678')).toBe('+2348012345678')
  })

  it('normalises format without leading zero', () => {
    expect(normalisePhone('8012345678')).toBe('+2348012345678')
  })

  it('normalises 234XXXXXXXXXX without plus', () => {
    expect(normalisePhone('2348012345678')).toBe('+2348012345678')
  })

  it('strips spaces and dashes before normalising', () => {
    // normalisePhone does .replace(/\D/g, '') first
    expect(normalisePhone('0801 234 5678')).toBe('+2348012345678')
  })

  it('throws INVALID_INPUT for a UK number', () => {
    expect(() => normalisePhone('+447911123456'))
      .toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })

  it('throws INVALID_INPUT for empty string', () => {
    expect(() => normalisePhone('')).toThrow()
  })

  it('throws INVALID_INPUT for too-short number', () => {
    expect(() => normalisePhone('0801234')).toThrow()
  })
})

// ── requestOtp ────────────────────────────────────────────────

describe('requestOtp', () => {
  beforeEach(() => {
    vi.mocked(db.query).mockResolvedValue(null)        // no existing OTP
    vi.mocked(db.execute).mockResolvedValue(undefined)
    vi.mocked(sendOtp).mockResolvedValue({ pinId: 'mock-pin-123' } as never)
  })

  it('returns a message on success', async () => {
    const result = await requestOtp('08012345678')
    expect(result.message).toContain('+234')
  })

  it('calls sendOtp with the normalised E.164 number', async () => {
    await requestOtp('08012345678')
    expect(sendOtp).toHaveBeenCalledWith('+2348012345678')
  })

  it('throws RATE_LIMITED if recent OTP exists', async () => {
    const futureDate = new Date(Date.now() + 14 * 60 * 1000)  // 14 min from now
    vi.mocked(db.query).mockResolvedValue({ expiresAt: futureDate })
    await expect(requestOtp('08012345678'))
      .rejects.toThrow(expect.objectContaining({ code: 'RATE_LIMITED' }))
  })

  it('allows a new OTP if previous one is close to expiry (< 2 min remaining)', async () => {
    const nearExpiry = new Date(Date.now() + 60 * 1000)  // 1 min from now
    vi.mocked(db.query).mockResolvedValue({ expiresAt: nearExpiry })
    const result = await requestOtp('08012345678')
    expect(result.message).toBeDefined()
  })
})

// ── verifyOtpAndLogin ─────────────────────────────────────────

describe('verifyOtpAndLogin', () => {
  const MOCK_CACHE    = { pinId: 'mock-pin-123', expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
  const MOCK_ATTEMPTS = { attempts: 0 }
  const MOCK_USER_ROW = {
    id: 'user-uuid-123', phone: '+2348012345678',
    displayName: null, verification: 'phone_verified',
    wardId: null, isAdmin: false,
  }

  beforeEach(() => {
    vi.mocked(db.execute).mockResolvedValue(undefined)
    vi.mocked(verifyOtp).mockResolvedValue(true as never)
  })

  it('returns token and user on valid OTP', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce(MOCK_CACHE)       // otp_pin_cache
      .mockResolvedValueOnce(MOCK_ATTEMPTS)    // otp_attempts
      .mockResolvedValueOnce({ id: 'user-uuid-123' })  // existing user
      .mockResolvedValueOnce(MOCK_USER_ROW)    // user fetch

    const result = await verifyOtpAndLogin('08012345678', '123456')
    expect(result.token).toBeDefined()
    expect(result.user.phone).toBe('+2348012345678')
    expect(result.isNewUser).toBe(false)
  })

  it('creates a new user when phone not found', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce(MOCK_CACHE)
      .mockResolvedValueOnce(MOCK_ATTEMPTS)
      .mockResolvedValueOnce(null)              // no existing user
      .mockResolvedValueOnce({ id: 'new-uuid' })// INSERT RETURNING id
      .mockResolvedValueOnce({ ...MOCK_USER_ROW, id: 'new-uuid' })

    const result = await verifyOtpAndLogin('08012345678', '123456')
    expect(result.isNewUser).toBe(true)
  })

  it('throws OTP_EXPIRED when no cache entry', async () => {
    vi.mocked(db.query).mockResolvedValue(null)
    await expect(verifyOtpAndLogin('08012345678', '123456'))
      .rejects.toThrow(expect.objectContaining({ code: 'OTP_EXPIRED' }))
  })

  it('throws OTP_TOO_MANY_ATTEMPTS at 5 attempts', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce(MOCK_CACHE)
      .mockResolvedValueOnce({ attempts: 5 })
    await expect(verifyOtpAndLogin('08012345678', '123456'))
      .rejects.toThrow(expect.objectContaining({ code: 'OTP_TOO_MANY_ATTEMPTS' }))
  })

  it('throws OTP_INVALID when Termii says code is wrong', async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce(MOCK_CACHE)
      .mockResolvedValueOnce(MOCK_ATTEMPTS)
    vi.mocked(verifyOtp).mockResolvedValue(false as never)
    await expect(verifyOtpAndLogin('08012345678', '999999'))
      .rejects.toThrow(expect.objectContaining({ code: 'OTP_INVALID' }))
  })
})
