import { describe, expect, it } from 'vitest'
import { lastTwo } from '@utils/lastTwo'

describe('lastTwo', () => {
  it('returns the last two items in order', () => {
    expect(lastTwo([1, 2, 3])).toEqual([2, 3])
  })

  it('returns both items of a pair', () => {
    expect(lastTwo(['a', 'b'])).toEqual(['a', 'b'])
  })

  it.each([[[]], [[1]]])('returns null for fewer than two items (%j)', (items: number[]) => {
    expect(lastTwo(items)).toBeNull()
  })

  it('keeps falsy items rather than treating them as missing', () => {
    expect(lastTwo([5, 0, 0])).toEqual([0, 0])
  })
})
