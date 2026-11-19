import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCssChartFallbackColor, getCssChartPalette, resolveCssColorForD3 } from '@utils/chartPalette'

function mockComputedStyle(getPropertyValue: (prop: string) => string) {
  return vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () =>
      ({
        getPropertyValue,
      }) as CSSStyleDeclaration,
  )
}

describe('getCssChartPalette', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the D3 fallback palette when document is undefined', () => {
    vi.stubGlobal('document', undefined)
    const palette = getCssChartPalette()
    expect(palette.length).toBeGreaterThanOrEqual(10)
    expect(palette.every((c) => c.length > 0)).toBe(true)
  })

  it('returns D3-safe hex colors when --chart-* variables are set', () => {
    mockComputedStyle((prop) => {
      const map: Record<string, string> = {
        '--chart-1': ' #aabbcc ',
        '--chart-2': ' rgb(1, 2, 3) ',
      }
      return map[prop] ?? ''
    })
    expect(getCssChartPalette()).toEqual(['#aabbcc', '#010203'])
  })

  it('returns the D3 fallback palette when chart variables are empty', () => {
    mockComputedStyle(() => '')
    const palette = getCssChartPalette()
    vi.stubGlobal('document', undefined)
    expect(getCssChartPalette()).toEqual(palette)
  })
})

describe('getCssChartFallbackColor', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns neutral hex when document is undefined', () => {
    vi.stubGlobal('document', undefined)
    expect(getCssChartFallbackColor()).toBe('#737373')
  })

  it('returns trimmed --chart-fallback when present', () => {
    mockComputedStyle((prop) => (prop === '--chart-fallback' ? ' #336699 ' : ''))
    expect(getCssChartFallbackColor()).toBe('#336699')
  })

  it('returns neutral hex when --chart-fallback is empty', () => {
    mockComputedStyle(() => '')
    expect(getCssChartFallbackColor()).toBe('#737373')
  })
})

describe('resolveCssColorForD3', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('normalizes parseable colors to hex', () => {
    expect(resolveCssColorForD3('  #336699  ')).toBe('#336699')
    expect(resolveCssColorForD3('rgb(10, 20, 30)')).toBe('#0a141e')
  })

  it('uses lastResort when the color cannot be resolved (e.g. oklch in jsdom)', () => {
    expect(resolveCssColorForD3('oklch(0.5 0.1 180)', '#feed00')).toBe('#feed00')
  })

  describe('canvas rasterization fallback', () => {
    function stubCanvasPixel(pixel: number[]) {
      const ctx = {
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: '',
        getImageData: vi.fn(() => ({ data: Uint8ClampedArray.from(pixel) })),
      }
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        ctx as unknown as CanvasRenderingContext2D,
      )
      return ctx
    }

    it('returns the rasterized hex for a color d3 cannot parse', () => {
      const ctx = stubCanvasPixel([0x12, 0xab, 0x05, 255])
      expect(resolveCssColorForD3('oklch(0.5 0.1 180)', '#feed00')).toBe('#12ab05')
      expect(ctx.fillStyle).toBe('oklch(0.5 0.1 180)')
    })

    it('falls back when the rasterized pixel is fully transparent', () => {
      stubCanvasPixel([0, 0, 0, 0])
      expect(resolveCssColorForD3('oklch(0.5 0.1 180)', '#feed00')).toBe('#feed00')
    })

    it.each([[[]], [[1]], [[1, 2]], [[1, 2, 3]]])(
      'falls back when the pixel buffer is short: %j',
      (pixel) => {
        stubCanvasPixel(pixel)
        expect(resolveCssColorForD3('oklch(0.5 0.1 180)', '#feed00')).toBe('#feed00')
      },
    )
  })
})
