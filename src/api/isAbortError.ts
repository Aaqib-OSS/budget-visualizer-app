/**
 * `true` when a request was cancelled on purpose: `fetch` and `putWithProgress`
 * reject with an `AbortError` when their `AbortSignal` fires. A cancellation is
 * never retried, logged, or treated as a failure.
 */
export function isAbortError(error: unknown): boolean {
  return (error instanceof Error || error instanceof DOMException) && error.name === 'AbortError'
}
