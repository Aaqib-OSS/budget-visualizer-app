import { isoDatePart } from '@utils/isoDatePart'
import { utcDate } from '@utils/utcDate'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * UTC midnight of a `YYYY-MM-DD` date (a timestamp's date part is used), or
 * `null` when it is malformed or names a day that does not exist (`2025-02-30`).
 */
export function parseIsoDateUtc(value: string): Date | null {
  const match = ISO_DATE.exec(isoDatePart(value))
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  if (y === undefined || m === undefined || d === undefined) return null

  const date = utcDate(y, m - 1, d)
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null
}
