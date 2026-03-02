import { describe, it, expect } from 'vitest'
import { ndvi, ndwi, ndbi, normalizedDifference, buildBandMathStyle, computeBandMath } from '../src/bandMath.js'

describe('normalizedDifference', () => {
  it('returns correct OL expression structure', () => {
    const expr = normalizedDifference(4, 3)
    expect(expr).toEqual(['/', ['-', ['band', 4], ['band', 3]], ['+', ['band', 4], ['band', 3]]])
  })
})

describe('ndvi', () => {
  it('defaults to NIR=2, Red=1', () => {
    const expr = ndvi()
    expect(expr).toEqual(['/', ['-', ['band', 2], ['band', 1]], ['+', ['band', 2], ['band', 1]]])
  })

  it('accepts custom band numbers', () => {
    const expr = ndvi(5, 4)
    expect(expr).toEqual(['/', ['-', ['band', 5], ['band', 4]], ['+', ['band', 5], ['band', 4]]])
  })
})

describe('ndwi', () => {
  it('returns normalized difference expression', () => {
    const expr = ndwi(3, 5)
    expect(expr).toEqual(['/', ['-', ['band', 3], ['band', 5]], ['+', ['band', 3], ['band', 5]]])
  })
})

describe('ndbi', () => {
  it('returns normalized difference expression', () => {
    const expr = ndbi(6, 5)
    expect(expr).toEqual(['/', ['-', ['band', 6], ['band', 5]], ['+', ['band', 6], ['band', 5]]])
  })
})

describe('buildBandMathStyle', () => {
  it('builds interpolate expression from color stops', () => {
    const expr = ndvi()
    const stops = [[-1, [255, 0, 0]], [0, [255, 255, 0]], [1, [0, 128, 0]]]
    const style = buildBandMathStyle(expr, stops)

    expect(style.color[0]).toBe('interpolate')
    expect(style.color[1]).toEqual(['linear'])
    expect(style.color[2]).toEqual(expr)
    // value, color pairs
    expect(style.color[3]).toBe(-1)
    expect(style.color[4]).toEqual(['color', 255, 0, 0])
    expect(style.color[5]).toBe(0)
    expect(style.color[6]).toEqual(['color', 255, 255, 0])
    expect(style.color[7]).toBe(1)
    expect(style.color[8]).toEqual(['color', 0, 128, 0])
  })

  it('throws without expression', () => {
    expect(() => buildBandMathStyle(null, [[0, [0, 0, 0]], [1, [255, 255, 255]]])).toThrow('expression is required')
  })

  it('throws with fewer than 2 color stops', () => {
    expect(() => buildBandMathStyle(ndvi(), [[0, [0, 0, 0]]])).toThrow('colorStops must have at least 2 entries')
  })
})

describe('computeBandMath', () => {
  it('computes NDVI correctly', () => {
    const nir = new Float32Array([0.8, 0.6, 0.4])
    const red = new Float32Array([0.2, 0.3, 0.4])
    const rasters = [red, nir]
    const fn = (b) => (b[1] - b[0]) / (b[1] + b[0])
    const result = computeBandMath(rasters, fn, 3)

    expect(result[0]).toBeCloseTo(0.6, 5)   // (0.8-0.2)/(0.8+0.2)
    expect(result[1]).toBeCloseTo(1 / 3, 5) // (0.6-0.3)/(0.6+0.3)
    expect(result[2]).toBeCloseTo(0, 5)      // (0.4-0.4)/(0.4+0.4)
  })

  it('returns Float32Array of correct length', () => {
    const rasters = [new Float32Array([1, 2, 3, 4])]
    const result = computeBandMath(rasters, (b) => b[0] * 2, 4)
    expect(result).toBeInstanceOf(Float32Array)
    expect(result.length).toBe(4)
    expect(result[0]).toBe(2)
    expect(result[3]).toBe(8)
  })
})
