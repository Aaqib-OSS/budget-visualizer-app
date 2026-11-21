import { describe, expect, it } from 'vitest'
import { buildQueryString } from '@api/buildQueryString'

describe('buildQueryString', () => {
  it.each([
    ['undefined', undefined],
    ['an empty object', {}],
    ['only undefined and null values', { a: undefined, b: null }],
  ])('is empty for %s', (_label, params) => {
    expect(buildQueryString(params)).toBe('')
  })

  it('stringifies numbers and booleans', () => {
    expect(buildQueryString({ count: true, limit: 50 })).toBe('?count=true&limit=50')
  })

  it('encodes characters that would otherwise split or end a value', () => {
    expect(buildQueryString({ memoName: 'A&B, C' })).toBe('?memoName=A%26B%2C+C')
  })
})
