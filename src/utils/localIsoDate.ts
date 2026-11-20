/**
 * `YYYY-MM-DD` of a date's **local** calendar day. `toISOString().slice(0, 10)`
 * gives the UTC day instead, which is tomorrow in New York after 8 pm.
 */
export function localIsoDate(d: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
