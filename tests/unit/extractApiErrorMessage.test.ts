import { describe, expect, it } from 'vitest'
import { HttpError } from '@api/HttpError'
import { extractApiErrorMessage } from '@api/extractApiErrorMessage'

describe('extractApiErrorMessage', () => {
  it('extracts server message from HttpError', () => {
    const error = new HttpError({
      method: 'POST',
      url: '/login',
      status: 401,
      data: { message: 'Unauthorized' },
    })
    expect(extractApiErrorMessage(error)).toBe('Unauthorized')
  })

  it('falls back to error.message when no server message', () => {
    expect(extractApiErrorMessage(new HttpError({ method: 'GET', url: '/x' }))).toBe('Network Error')
  })

  it('falls back to the status line when the body is not JSON', () => {
    const error = new HttpError({ method: 'GET', url: '/x', status: 502, data: '<html>bad gateway</html>' })
    expect(extractApiErrorMessage(error)).toBe('Request failed with status code 502')
  })

  it('handles generic Error', () => {
    expect(extractApiErrorMessage(new Error('Something broke'))).toBe('Something broke')
  })

  it('uses a thrown string as the message', () => {
    expect(extractApiErrorMessage(' string error ')).toBe('string error')
  })

  it('returns fallback for other non-Error values', () => {
    expect(extractApiErrorMessage('  ')).toBe('An unexpected error occurred')
    expect(extractApiErrorMessage(null)).toBe('An unexpected error occurred')
    expect(extractApiErrorMessage(42)).toBe('An unexpected error occurred')
  })
})
