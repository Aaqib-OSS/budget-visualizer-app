import { localIsoDate } from '@utils/localIsoDate'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * `<input type="date">` value for a local date. `toISOString()` would give the
 * UTC day, which is tomorrow in New York after 8 pm.
 */
export function formatLoanDateInput(d: Date): string {
  if (Number.isNaN(d.getTime())) return ''
  return localIsoDate(d)
}

/** Local midnight of a `YYYY-MM-DD` input value; an Invalid Date when empty or malformed. */
export function parseLoanDateInput(value: string): Date {
  const match = ISO_DATE.exec(value)
  if (!match) return new Date(NaN)
  const [, y, m, d] = match.map(Number)
  if (y === undefined || m === undefined || d === undefined) return new Date(NaN)

  const date = new Date(0, 0, 1)
  date.setFullYear(y, m - 1, d)
  return date.getMonth() === m - 1 && date.getDate() === d ? date : new Date(NaN)
}
