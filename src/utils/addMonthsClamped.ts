/**
 * `date` moved by `months` calendar months in local time, keeping the time of
 * day. The day clamps to the end of a shorter month: Jan 31 + 1 → Feb 28 (or
 * 29), where `setMonth(getMonth() + 1)` would overflow to Mar 3.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const targetMonth = date.getMonth() + months
  const lastDay = new Date(date.getFullYear(), targetMonth + 1, 0).getDate()
  const result = new Date(date)
  result.setDate(1)
  result.setMonth(targetMonth)
  result.setDate(Math.min(date.getDate(), lastDay))
  return result
}
