/**
 * `?key=value&…` for a request's query params, or `''` when there are none.
 * `undefined` and `null` values are left out; numbers and booleans are
 * stringified.
 *
 * Takes `object`, not `Record<string, …>`: the params are interfaces such as
 * `TransactionQueryParams`, which don't satisfy an index signature.
 */
export function buildQueryString(params: object | undefined): string {
  if (!params) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    search.append(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}
