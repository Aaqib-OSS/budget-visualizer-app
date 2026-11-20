import { describe, expect, it } from 'vitest'
import { utcDate } from '@utils/utcDate'
import { isoWeekStartUtc } from '@utils/isoWeekStartUtc'
import { parseIsoDateUtc } from '@utils/parseIsoDateUtc'
import { localIsoDate } from '@utils/localIsoDate'
import { addMonthsClamped } from '@utils/addMonthsClamped'

describe('utcDate', () => {
  it('builds UTC midnight', () => {
    expect(utcDate(2026, 2, 1).toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  // Date.UTC maps 0–99 to 1900–1999.
  it('keeps two-digit years literal', () => {
    expect(utcDate(50, 0, 1).getUTCFullYear()).toBe(50)
  })
})

describe('isoWeekStartUtc', () => {
  it.each([
    [2024, 10, '2024-03-04T00:00:00.000Z'],
    [2025, 1, '2024-12-30T00:00:00.000Z'],
    [2021, 1, '2021-01-04T00:00:00.000Z'],
    [2024, 52, '2024-12-23T00:00:00.000Z'],
    [2020, 53, '2020-12-28T00:00:00.000Z'],
    [2026, 53, '2026-12-28T00:00:00.000Z'],
  ])('week-year %i week %i starts %s', (weekYear, week, expected) => {
    expect(isoWeekStartUtc(weekYear, week)?.toISOString()).toBe(expected)
  })

  it('rejects week 53 of a 52-week year', () => {
    expect(isoWeekStartUtc(2024, 53)).toBeNull()
  })

  it.each([0, 54, 1.5, Number.NaN])('rejects week %s', (week) => {
    expect(isoWeekStartUtc(2024, week)).toBeNull()
  })
})

describe('parseIsoDateUtc', () => {
  it('parses a calendar date to UTC midnight', () => {
    expect(parseIsoDateUtc('2025-01-15')?.toISOString()).toBe('2025-01-15T00:00:00.000Z')
  })

  it('takes the date part of a timestamp', () => {
    expect(parseIsoDateUtc('2026-03-01T00:00:00.000Z')?.toISOString()).toBe('2026-03-01T00:00:00.000Z')
  })

  it.each(['2025-02-30', '2025-13-01', '2025-1-5', 'not-a-date', ''])('rejects %j', (value) => {
    expect(parseIsoDateUtc(value)).toBeNull()
  })
})

describe('localIsoDate', () => {
  it('formats the local calendar day, not the UTC one', () => {
    const lateEvening = new Date(2026, 9, 30, 21, 30)
    expect(lateEvening.toISOString().slice(0, 10)).toBe('2026-10-31')
    expect(localIsoDate(lateEvening)).toBe('2026-10-30')
  })
})

describe('addMonthsClamped', () => {
  it('keeps the time of day', () => {
    const d = addMonthsClamped(new Date(2026, 0, 31, 14, 5), 1)
    expect([d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([1, 28, 14, 5])
  })

  it('subtracts months across a year boundary', () => {
    const d = addMonthsClamped(new Date(2026, 2, 31), -4)
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2025, 10, 30])
  })
})
