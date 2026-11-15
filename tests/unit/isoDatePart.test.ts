import { describe, expect, it } from 'vitest'
import { isoDatePart } from '@utils/isoDatePart'

describe('isoDatePart', () => {
  it('keeps the calendar date of a timestamp', () => {
    expect(isoDatePart('2026-03-01T00:00:00.000Z')).toBe('2026-03-01')
  })

  it('returns a bare date unchanged', () => {
    expect(isoDatePart('2026-03-01')).toBe('2026-03-01')
  })

  it('returns an empty string unchanged', () => {
    expect(isoDatePart('')).toBe('')
  })
})
