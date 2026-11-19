/**
 * The calendar-date part of an ISO timestamp: `'2026-03-01T00:00:00.000Z'` -> `'2026-03-01'`.
 * A value with no time part comes back unchanged.
 */
export function isoDatePart(value: string): string {
  const t = value.indexOf('T')
  return t === -1 ? value : value.slice(0, t)
}
