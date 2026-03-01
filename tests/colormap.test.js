import { describe, it, expect } from 'vitest'
import { COLORMAPS, applyColormapToPixel, buildStyleWithColormap, registerColormap } from '../src/colormap.js'

describe('COLORMAPS', () => {
  it('grayscale is null', () => {
    expect(COLORMAPS.grayscale).toBeNull()
  })

  it.each(['viridis', 'inferno', 'plasma'])('%s has 256 [r,g,b] entries in 0-255', (name) => {
    const lut = COLORMAPS[name]
    expect(lut).toHaveLength(256)
    for (const entry of lut) {
      expect(entry).toHaveLength(3)
      for (const v of entry) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
        expect(Number.isInteger(v)).toBe(true)
      }
    }
  })

  it('first and last entries differ for each colormap', () => {
    for (const name of ['viridis', 'inferno', 'plasma']) {
      const lut = COLORMAPS[name]
      expect(lut[0]).not.toEqual(lut[255])
    }
  })
})

describe('applyColormapToPixel', () => {
  it('returns LUT color at index 0', () => {
    expect(applyColormapToPixel(0, 'viridis')).toEqual(COLORMAPS.viridis[0])
  })

  it('returns LUT color at index 255', () => {
    expect(applyColormapToPixel(255, 'viridis')).toEqual(COLORMAPS.viridis[255])
  })

  it('returns LUT color at mid index', () => {
    expect(applyColormapToPixel(128, 'inferno')).toEqual(COLORMAPS.inferno[128])
  })

  it('clamps values above 255', () => {
    expect(applyColormapToPixel(300, 'viridis')).toEqual(COLORMAPS.viridis[255])
  })

  it('clamps negative values to 0', () => {
    expect(applyColormapToPixel(-10, 'viridis')).toEqual(COLORMAPS.viridis[0])
  })

  it('returns grayscale triple for unknown colormap', () => {
    expect(applyColormapToPixel(128, 'nonexistent')).toEqual([128, 128, 128])
  })

  it('returns grayscale triple for grayscale (null LUT)', () => {
    expect(applyColormapToPixel(100, 'grayscale')).toEqual([100, 100, 100])
  })
})

describe('buildStyleWithColormap', () => {
  const rgbBand = { type: 'rgb', bands: [1, 2, 3] }
  const grayBand = { type: 'gray', bands: [1] }
  const rgbStats = [{ min: 0, max: 255 }, { min: 0, max: 255 }, { min: 0, max: 255 }]
  const grayStats = [{ min: 0, max: 1000 }]

  it('RGB band ignores colormap, returns array style', () => {
    const style = buildStyleWithColormap(rgbBand, rgbStats, 'viridis')
    expect(style.color[0]).toBe('array')
    expect(style.color).toHaveLength(5)
    // Alpha channel
    expect(style.color[4]).toEqual(['/', ['band', 4], 255])
  })

  it('gray + grayscale returns array style (no colormap)', () => {
    const style = buildStyleWithColormap(grayBand, grayStats, 'grayscale')
    expect(style.color[0]).toBe('array')
  })

  it('gray + null colormapName returns array style', () => {
    const style = buildStyleWithColormap(grayBand, grayStats, null)
    expect(style.color[0]).toBe('array')
  })

  it('gray + undefined colormapName returns array style', () => {
    const style = buildStyleWithColormap(grayBand, grayStats, undefined)
    expect(style.color[0]).toBe('array')
  })

  it('gray + unknown colormap falls back to grayscale', () => {
    const style = buildStyleWithColormap(grayBand, grayStats, 'nonexistent')
    expect(style.color[0]).toBe('array')
  })

  it('gray + viridis returns case expression with interpolate', () => {
    const style = buildStyleWithColormap(grayBand, grayStats, 'viridis')
    expect(style.color[0]).toBe('case')
    // nodata check: ['==', ['band', 2], 0] → transparent
    expect(style.color[1]).toEqual(['==', ['band', 2], 0])
    expect(style.color[2]).toEqual(['color', 0, 0, 0, 0])
    // interpolate expression
    const interp = style.color[3]
    expect(interp[0]).toBe('interpolate')
    expect(interp[1]).toEqual(['linear'])
    // 16 stops: each stop has (t, ['color', r, g, b, 1])
    // Total length: 'interpolate' + ['linear'] + norm + 16*(t + color) = 3 + 32 = 35
    expect(interp).toHaveLength(35)
  })

  it('gray + inferno returns case expression', () => {
    const style = buildStyleWithColormap(grayBand, grayStats, 'inferno')
    expect(style.color[0]).toBe('case')
  })

  it('gray + plasma returns case expression', () => {
    const style = buildStyleWithColormap(grayBand, grayStats, 'plasma')
    expect(style.color[0]).toBe('case')
  })

  it('RGB style normalizes each band with stats', () => {
    const stats = [{ min: 10, max: 210 }, { min: 20, max: 220 }, { min: 30, max: 230 }]
    const style = buildStyleWithColormap(rgbBand, stats, 'viridis')
    // R channel: ['/', ['-', ['band', 1], 10], 200]
    expect(style.color[1]).toEqual(['/', ['-', ['band', 1], 10], 200])
  })
})

describe('registerColormap', () => {
  it('registers a custom colormap', () => {
    const lut = Array.from({ length: 256 }, (_, i) => [i, 0, 0])
    registerColormap('custom-red', lut)
    expect(COLORMAPS['custom-red']).toBe(lut)
    const result = applyColormapToPixel(128, 'custom-red')
    expect(result).toEqual([128, 0, 0])
  })

  it('throws for invalid LUT length', () => {
    expect(() => registerColormap('bad', [[0, 0, 0]])).toThrow('256')
  })

  it('throws for non-array LUT', () => {
    expect(() => registerColormap('bad', 'not-array')).toThrow('256')
  })
})
