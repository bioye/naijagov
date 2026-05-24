import { vi } from 'vitest'

process.env['NODE_ENV']         = 'test'
process.env['DATABASE_URL']     = 'postgresql://test:test@localhost:5432/naijagov_test'
process.env['JWT_SECRET']       = 'test-secret-32-chars-minimum-ok!'
process.env['TERMII_API_KEY']   = 'test-termii-key'
process.env['TERMII_SENDER_ID'] = 'NaijaGov'

const mockDb = {
  query:    vi.fn(),
  queryMany: vi.fn(),
  execute:  vi.fn(),
  sql:      vi.fn(),
}

vi.mock('../src/lib/db', () => ({
  default:    mockDb,
  query:      mockDb.query,
  queryMany:  mockDb.queryMany,
  execute:    mockDb.execute,
  db:         mockDb,
}))

vi.mock('../src/services/sms', () => ({
  sendOtp:   vi.fn().mockResolvedValue({ pinId: 'mock-pin-id' }),
  verifyOtp: vi.fn().mockResolvedValue(true),
}))
