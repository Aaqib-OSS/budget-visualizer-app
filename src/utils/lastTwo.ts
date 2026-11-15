/** The last two items, in order, or `null` when there are fewer than two. */
export function lastTwo<T>(items: readonly T[]): [T, T] | null {
  if (items.length < 2) return null
  const [a, b] = items.slice(-2) as [T, T]
  return [a, b]
}
