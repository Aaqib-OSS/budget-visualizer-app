import { describe, expect, it } from 'vitest'
import { HttpError } from '@api/HttpError'
import { isAbortError } from '@api/isAbortError'

describe('HttpError', () => {
  it('describes a response by its status, in axios wording', () => {
    const error = new HttpError({ method: 'GET', url: '/x', status: 409, data: { message: 'dup' } })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('HttpError')
    expect(error.message).toBe('Request failed with status code 409')
    expect(error.status).toBe(409)
    expect(error.data).toEqual({ message: 'dup' })
    expect(error.method).toBe('GET')
    expect(error.url).toBe('/x')
  })

  it('reads as a network error when there was no response', () => {
    const error = new HttpError({ method: 'POST', url: '/x' })
    expect(error.message).toBe('Network Error')
    expect(error.status).toBeUndefined()
  })
})

describe('isAbortError', () => {
  it('recognizes a DOMException abort', () => {
    expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true)
  })

  it('recognizes an Error named AbortError', () => {
    const error = new Error('x')
    error.name = 'AbortError'
    expect(isAbortError(error)).toBe(true)
  })

  it.each([
    ['an HttpError', new HttpError({ method: 'GET', url: '/x' })],
    ['a plain Error', new Error('x')],
    ['the string AbortError', 'AbortError'],
    ['undefined', undefined],
  ])('rejects %s', (_label, value) => {
    expect(isAbortError(value)).toBe(false)
  })
})
