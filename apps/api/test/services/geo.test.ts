import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseVoterCardCode, resolveByVoterCard, resolveByText } from '../../src/services/geo'
import db from '../../src/lib/db'
import { AppError } from '../../src/lib/errors'

// ── Fixtures ──────────────────────────────────────────────────

const MOCK_WARD_ROW = {
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
  puDescription: 'in front of sekoni mosque near house no.35',
  hasGps: true, lat: 7.1604, lng: 3.3423,
}

// ── parseVoterCardCode ────────────────────────────────────────

describe('parseVoterCardCode', () => {
  it('parses dash-separated code correctly', () => {
    const result = parseVoterCardCode('27-02-10-001')
    expect(result).toEqual({ stateCode: 27, lgaCode: 2, wardCode: 10, pollingUnitCode: 1 })
  })

  it('parses slash-separated code', () => {
    const result = parseVoterCardCode('27/02/10/001')
    expect(result).toEqual({ stateCode: 27, lgaCode: 2, wardCode: 10, pollingUnitCode: 1 })
  })

  it('parses space-separated code', () => {
    const result = parseVoterCardCode('27 02 10 001')
    expect(result).toEqual({ stateCode: 27, lgaCode: 2, wardCode: 10, pollingUnitCode: 1 })
  })

  it('parses codes without leading zeros', () => {
    const result = parseVoterCardCode('1-1-1-1')
    expect(result).toEqual({ stateCode: 1, lgaCode: 1, wardCode: 1, pollingUnitCode: 1 })
  })

  it('throws RESOLVER_INVALID_CODE for wrong segment count', () => {
    expect(() => parseVoterCardCode('27-02-10'))
      .toThrowError(expect.objectContaining({ code: 'RESOLVER_INVALID_CODE' }))
  })

  it('throws RESOLVER_INVALID_CODE for non-numeric segments', () => {
    expect(() => parseVoterCardCode('AB-02-10-001'))
      .toThrowError(expect.objectContaining({ code: 'RESOLVER_INVALID_CODE' }))
  })

  it('throws RESOLVER_INVALID_CODE for state code > 37', () => {
    expect(() => parseVoterCardCode('38-02-10-001'))
      .toThrowError(expect.objectContaining({ code: 'RESOLVER_INVALID_CODE' }))
  })

  it('throws RESOLVER_INVALID_CODE for state code 0', () => {
    expect(() => parseVoterCardCode('0-02-10-001'))
      .toThrowError(expect.objectContaining({ code: 'RESOLVER_INVALID_CODE' }))
  })

  it('handles max valid state code (37 = FCT)', () => {
    const result = parseVoterCardCode('37-01-01-001')
    expect(result.stateCode).toBe(37)
  })
})

// ── resolveByVoterCard ────────────────────────────────────────

describe('resolveByVoterCard', () => {
  beforeEach(() => {
    vi.mocked(db.query).mockResolvedValue(MOCK_WARD_ROW)
  })

  it('returns a full political stack for a valid voter card', async () => {
    const stack = await resolveByVoterCard({ stateCode: 27, lgaCode: 2, wardCode: 10, pollingUnitCode: 1 })

    expect(stack.state.name).toBe('OGUN')
    expect(stack.state.alphaCode).toBe('OG')
    expect(stack.lga.name).toBe('ABEOKUTA SOUTH')
    expect(stack.ward.compoundCode).toBe('OG0210')
    expect(stack.constituencies.stateConstituency?.name).toBe('ABEOKUTA SOUTH II')
    expect(stack.constituencies.federalConstituency?.name).toBe('Abeokuta South')
    expect(stack.constituencies.senatorialDistrict).toBeNull()  // gap in data
  })

  it('includes polling unit with GPS when present', async () => {
    const stack = await resolveByVoterCard({ stateCode: 27, lgaCode: 2, wardCode: 10, pollingUnitCode: 1 })
    expect(stack.pollingUnit).not.toBeNull()
    expect(stack.pollingUnit?.lat).toBeCloseTo(7.1604)
    expect(stack.pollingUnit?.lng).toBeCloseTo(3.3423)
    expect(stack.pollingUnit?.puLocId).toBe('OG0210001')
  })

  it('reflects data quality flags accurately', async () => {
    const stack = await resolveByVoterCard({ stateCode: 27, lgaCode: 2, wardCode: 10, pollingUnitCode: 1 })
    expect(stack.dataQuality.scMissing).toBe(false)
    expect(stack.dataQuality.fcMissing).toBe(false)
    expect(stack.dataQuality.sdMissing).toBe(true)   // senatorial gap
    expect(stack.dataQuality.hasGps).toBe(true)
  })

  it('throws RESOLVER_NO_MATCH when DB returns null', async () => {
    vi.mocked(db.query).mockResolvedValue(null)
    await expect(
      resolveByVoterCard({ stateCode: 99, lgaCode: 1, wardCode: 1, pollingUnitCode: 1 })
    ).rejects.toThrow(expect.objectContaining({ code: 'RESOLVER_NO_MATCH' }))
  })

  it('sets pollingUnit to null when no PU row returned', async () => {
    vi.mocked(db.query).mockResolvedValue({ ...MOCK_WARD_ROW, puId: null })
    const stack = await resolveByVoterCard({ stateCode: 27, lgaCode: 2, wardCode: 10, pollingUnitCode: 1 })
    expect(stack.pollingUnit).toBeNull()
  })
})

// ── resolveByText ─────────────────────────────────────────────

describe('resolveByText', () => {
  beforeEach(() => {
    vi.mocked(db.queryMany).mockResolvedValue([MOCK_WARD_ROW])
  })

  it('returns an array of stacks on match', async () => {
    const results = await resolveByText({ lgaName: 'Abeokuta South' })
    expect(results).toHaveLength(1)
    expect(results[0]?.lga.name).toBe('ABEOKUTA SOUTH')
  })

  it('throws RESOLVER_NO_MATCH when no results', async () => {
    vi.mocked(db.queryMany).mockResolvedValue([])
    await expect(resolveByText({ lgaName: 'NonExistentPlace' }))
      .rejects.toThrow(expect.objectContaining({ code: 'RESOLVER_NO_MATCH' }))
  })

  it('returns multiple stacks when multiple matches found', async () => {
    vi.mocked(db.queryMany).mockResolvedValue([MOCK_WARD_ROW, { ...MOCK_WARD_ROW, wardId: 9999 }])
    const results = await resolveByText({ lgaName: 'Ikeja' })
    expect(results).toHaveLength(2)
  })
})
