/**
 * SMS service via Termii
 * Termii is a Nigerian SMS provider — naira pricing, reliable delivery.
 * Docs: https://developers.termii.com
 */
import { AppError } from '../lib/errors'

const TERMII_BASE = 'https://api.ng.termii.com/api'

interface TermiiSendResponse {
  pinId: string
  to: string
  smsStatus: string
}

/**
 * Send a 6-digit OTP to a Nigerian phone number via Termii.
 * Returns the pinId needed to verify the OTP.
 */
export async function sendOtp(phone: string): Promise<{ pinId: string }> {
  const apiKey    = process.env['TERMII_API_KEY']
  const senderId  = process.env['TERMII_SENDER_ID'] ?? 'NaijaGov'

  if (!apiKey) throw new Error('TERMII_API_KEY not set')

  const res = await fetch(`${TERMII_BASE}/sms/otp/send`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      api_key:     apiKey,
      message_type: 'NUMERIC',
      to:           phone,
      from:         senderId,
      channel:      'dnd',           // DND-compliant channel
      pin_attempts: 3,
      pin_time_to_live: 15,          // 15 minutes
      pin_length:   6,
      pin_placeholder: '<otp>',
      message_text: `Your NaijaGov verification code is <otp>. Valid for 15 minutes. Do not share this code.`,
      pin_type:     'NUMERIC',
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('Termii send error:', res.status, body)
    throw new AppError('SMS_SEND_FAILED', 'Failed to send verification code. Please try again.', 503)
  }

  const data = await res.json() as TermiiSendResponse
  return { pinId: data.pinId }
}

/**
 * Verify an OTP against a pinId returned from sendOtp.
 */
export async function verifyOtp(pinId: string, pin: string): Promise<boolean> {
  const apiKey = process.env['TERMII_API_KEY']
  if (!apiKey) throw new Error('TERMII_API_KEY not set')

  const res = await fetch(`${TERMII_BASE}/sms/otp/verify`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ api_key: apiKey, pin_id: pinId, pin }),
  })

  if (!res.ok) return false

  const data = await res.json() as { verified: boolean; msisdn: string }
  return data.verified === true
}
