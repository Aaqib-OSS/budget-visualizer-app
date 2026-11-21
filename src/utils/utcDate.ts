/**
 * UTC midnight of a calendar date. Out-of-range months and days roll over the
 * way `Date.UTC` does (day 0 is the last day of the previous month).
 *
 * Unlike `Date.UTC`, years 0–99 stay literal instead of mapping to 1900–1999.
 */
export function utcDate(year: number, monthIndex: number, day: number): Date {
  const d = new Date(0)
  d.setUTCFullYear(year, monthIndex, day)
  return d
}
