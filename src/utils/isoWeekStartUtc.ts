import { utcDate } from '@utils/utcDate'

const DAY_MS = 86_400_000

/**
 * UTC midnight of the Monday that starts ISO week `week` of ISO week-year
 * `weekYear`, or `null` when that week does not exist — including week 53 of a
 * year that only has 52.
 *
 * Week 1 is the week containing January 4th, and a week belongs to the
 * week-year its Thursday falls in.
 */
export function isoWeekStartUtc(weekYear: number, week: number): Date | null {
  if (!Number.isInteger(weekYear) || !Number.isInteger(week) || week < 1 || week > 53) return null

  const jan4 = utcDate(weekYear, 0, 4)
  const daysSinceMonday = (jan4.getUTCDay() + 6) % 7
  const start = new Date(jan4.getTime() + ((week - 1) * 7 - daysSinceMonday) * DAY_MS)

  const thursday = new Date(start.getTime() + 3 * DAY_MS)
  return thursday.getUTCFullYear() === weekYear ? start : null
}
