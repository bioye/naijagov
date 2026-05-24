import { describe, it, expect, vi } from 'vitest'
import { signToken, verifyToken } from '../../src/middleware/auth'
import type { AuthUser } from '@naijagov/shared'

const MOCK_USER: AuthUser = {
  id:               'user-uuid-123',
  phone:            '+2348012345678',
  displayName:      'Test Citizen',
  verificationTier: 'phone_verified',
  wardId:           null,
  isAdmin:          false,
}

// ── JWT ───────────────────────────────────────────────────────

describe('JWT sign and verify', () => {
  it('round-trips a user through sign → verify', async () => {
    const token = await signToken(MOCK_USER)
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)   // valid JWT structure

    const decoded = await verifyToken(token)
    expect(decoded.id).toBe(MOCK_USER.id)
    expect(decoded.phone).toBe(MOCK_USER.phone)
    expect(decoded.isAdmin).toBe(false)
    expect(decoded.verificationTier).toBe('phone_verified')
  })

  it('signs admin users correctly', async () => {
    const token   = await signToken({ ...MOCK_USER, isAdmin: true })
    const decoded = await verifyToken(token)
    expect(decoded.isAdmin).toBe(true)
  })

  it('signs NIN-verified users correctly', async () => {
    const token   = await signToken({ ...MOCK_USER, verificationTier: 'nin_verified' })
    const decoded = await verifyToken(token)
    expect(decoded.verificationTier).toBe('nin_verified')
  })

  it('includes wardId when set', async () => {
    const token   = await signToken({ ...MOCK_USER, wardId: 6392 })
    const decoded = await verifyToken(token)
    expect(decoded.wardId).toBe(6392)
  })

  it('throws UNAUTHORIZED for a tampered token', async () => {
    const token   = await signToken(MOCK_USER)
    const tampered = token.slice(0, -5) + 'XXXXX'
    await expect(verifyToken(tampered))
      .rejects.toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }))
  })

  it('throws UNAUTHORIZED for a completely invalid token', async () => {
    await expect(verifyToken('not.a.token'))
      .rejects.toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }))
  })

  it('throws UNAUTHORIZED for an empty string', async () => {
    await expect(verifyToken(''))
      .rejects.toThrow(expect.objectContaining({ code: 'UNAUTHORIZED' }))
  })
})

// ── Error types ───────────────────────────────────────────────

describe('AppError', () => {
  it('has the correct code and statusCode', async () => {
    const { AppError } = await import('../../src/lib/errors')
    const e = new AppError('NOT_FOUND', 'test message', 404)
    expect(e.code).toBe('NOT_FOUND')
    expect(e.statusCode).toBe(404)
    expect(e.message).toBe('test message')
    expect(e.name).toBe('AppError')
  })

  it('defaults statusCode to 400', async () => {
    const { AppError } = await import('../../src/lib/errors')
    const e = new AppError('INVALID_INPUT', 'bad')
    expect(e.statusCode).toBe(400)
  })
})
