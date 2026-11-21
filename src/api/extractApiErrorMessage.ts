import { HttpError } from '@api/HttpError'

/**
 * Pulls a human-readable message from an API error (`HttpError` or generic Error).
 * Prefers the JSON body's `message` from the server, falling back to `error.message`.
 * A thrown non-empty string is its own message.
 */
export function extractApiErrorMessage(error: unknown): string {
  if (error instanceof HttpError && typeof error.data === 'object' && error.data !== null) {
    const serverMessage = (error.data as { message?: unknown }).message
    if (typeof serverMessage === 'string' && serverMessage.length > 0) {
      return serverMessage
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return 'An unexpected error occurred'
}
