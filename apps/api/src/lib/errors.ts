import type { Context } from 'hono'
import type { ApiError, ApiSuccess } from '@naijagov/shared'

// ── Typed error codes ─────────────────────────────────────────

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'RESOLVER_NO_MATCH'
  | 'RESOLVER_AMBIGUOUS'
  | 'RESOLVER_INVALID_CODE'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_TOO_MANY_ATTEMPTS'
  | 'SMS_SEND_FAILED'
  | 'INTERNAL'

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// ── Response helpers ──────────────────────────────────────────

export function ok<T>(c: Context, data: T, status = 200) {
  const body: ApiSuccess<T> = { ok: true, data }
  return c.json(body, status as 200)
}

export function err(c: Context, code: ErrorCode, message: string, status = 400, details?: unknown) {
  const body: ApiError = { ok: false, error: { code, message, details } }
  return c.json(body, status as 400)
}

export function notFound(c: Context, message = 'Resource not found') {
  return err(c, 'NOT_FOUND', message, 404)
}

export function unauthorized(c: Context, message = 'Authentication required') {
  return err(c, 'UNAUTHORIZED', message, 401)
}

export function forbidden(c: Context, message = 'Insufficient permissions') {
  return err(c, 'FORBIDDEN', message, 403)
}

// ── Error handler middleware ──────────────────────────────────

export function handleError(error: unknown, c: Context) {
  if (error instanceof AppError) {
    return err(c, error.code, error.message, error.statusCode, error.details)
  }
  console.error('Unhandled error:', error)
  return err(c, 'INTERNAL', 'An unexpected error occurred', 500)
}
