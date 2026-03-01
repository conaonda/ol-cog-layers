import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fillPixelData } from '../src/cogImageLayer.js'

// Mock OL and geotiff — only needed if we test createCOGImageLayer
vi.mock('ol/layer/Image', () => ({
  default: vi.fn(function (opts) { this.opts = opts })
}))
vi.mock('ol/source/ImageCanvas', () => ({
  default: vi.fn(function (opts) {
    this.opts = opts
    this.changed = vi.fn()
  })
}))
vi.mock('ol/proj', () => ({
  transformExtent: vi.fn((ext) => ext)
}))
vi.mock('ol/extent', () => ({
  intersects: vi.fn(() => true),
  getIntersection: vi.fn((a) => a)
}))
vi.mock('geotiff', () => ({
  fromUrl: vi.fn(),
  Pool: vi.fn(function () {})
}))
vi.mock('../src/fillPixelWorker.js', () => ({
  fillPixelDataAsync: vi.fn(() => Promise.resolve(null))
}))
vi.mock('../src/cogLayer.js', () => ({
  detectBands: vi.fn(() => Promise.resolve({ type: 'rgb', bands: [1, 2, 3] })),
  getMinMaxFromOverview: vi.fn(() => Promise.resolve({
    stats: [{ min: 0, max: 255 }, { min: 0, max: 255 }, { min: 0, max: 255 }],
    rasters: [new Float32Array([100, 150, 200, 50]), new Float32Array([100, 150, 200, 50]), new Float32Array([100, 150, 200, 50])],
    width: 2,
    height: 2
  }))
}))

// === fillPixelData ===
describe('fillPixelData', () => {
  describe('RGB mode', () => {
    const bandInfo = { type: 'rgb', bands: [1, 2, 3] }
    const stats = [{ min: 0, max: 255 }, { min: 0, max: 255 }, { min: 0, max: 255 }]

    it('normalizes RGB values to 0-255', () => {
      const px = new Uint8ClampedArray(8) // 2 pixels
      const rasters = [
        new Float32Array([100, 0]),
        new Float32Array([150, 0]),
        new Float32Array([200, 0])
      ]
      fillPixelData(px, rasters, bandInfo, stats, 2, null)
      // pixel 0: normalized
      expect(px[0]).toBe(100)
      expect(px[1]).toBe(150)
      expect(px[2]).toBe(200)
      expect(px[3]).toBe(255)
    })

    it('treats (0,0,0) as nodata (transparent)', () => {
      const px = new Uint8ClampedArray(4)
      const rasters = [
        new Float32Array([0]),
        new Float32Array([0]),
        new Float32Array([0])
      ]
      fillPixelData(px, rasters, bandInfo, stats, 1, null)
      expect(px[3]).toBe(0) // alpha = 0
    })

    it('normalizes with non-trivial min/max', () => {
      const px = new Uint8ClampedArray(4)
      const s = [{ min: 100, max: 200 }, { min: 100, max: 200 }, { min: 100, max: 200 }]
      const rasters = [
        new Float32Array([150]),
        new Float32Array([150]),
        new Float32Array([150])
      ]
      fillPixelData(px, rasters, bandInfo, s, 1, null)
      // (150-100)*255/100 + 0.5 = 127.75 → 127
      expect(px[0]).toBeCloseTo(127, 0)
      expect(px[3]).toBe(255)
    })
  })

  describe('Gray mode', () => {
    const bandInfo = { type: 'gray', bands: [1] }
    const stats = [{ min: 0, max: 255 }]

    it('renders grayscale without colormap', () => {
      const px = new Uint8ClampedArray(4)
      const rasters = [new Float32Array([128])]
      fillPixelData(px, rasters, bandInfo, stats, 1, null)
      expect(px[0]).toBe(128)
      expect(px[1]).toBe(128)
      expect(px[2]).toBe(128)
      expect(px[3]).toBe(255)
    })

    it('treats 0 as nodata (transparent)', () => {
      const px = new Uint8ClampedArray(4)
      const rasters = [new Float32Array([0])]
      fillPixelData(px, rasters, bandInfo, stats, 1, null)
      expect(px[3]).toBe(0)
    })

    it('applies viridis colormap', () => {
      const px = new Uint8ClampedArray(4)
      const rasters = [new Float32Array([128])]
      fillPixelData(px, rasters, bandInfo, stats, 1, 'viridis')
      // viridis at index 128 should be greenish — not grayscale
      expect(px[3]).toBe(255)
      // Should differ from plain gray (128,128,128)
      const isGray = px[0] === 128 && px[1] === 128 && px[2] === 128
      expect(isGray).toBe(false)
    })

    it('falls back to gray for unknown colormap', () => {
      const px = new Uint8ClampedArray(4)
      const rasters = [new Float32Array([128])]
      fillPixelData(px, rasters, bandInfo, stats, 1, 'nonexistent')
      // No LUT found → grayscale
      expect(px[0]).toBe(128)
      expect(px[1]).toBe(128)
      expect(px[2]).toBe(128)
    })
  })
})

// === createCOGImageLayer ===
describe('createCOGImageLayer', () => {
  let createCOGImageLayer, fromUrl

  beforeEach(async () => {
    // Mock document.createElement for canvas
    const mockCtx = {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: vi.fn(),
      drawImage: vi.fn()
    }
    globalThis.document = {
      createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => mockCtx }))
    }

    vi.resetModules()
    const geotiff = await import('geotiff')
    fromUrl = geotiff.fromUrl

    const mod = await import('../src/cogImageLayer.js')
    createCOGImageLayer = mod.createCOGImageLayer
  })

  function setupMockTiff() {
    const image = {
      getGeoKeys: () => ({ ProjectedCSTypeGeoKey: 32632 }),
      getBoundingBox: () => [0, 0, 100, 100],
    }
    const tiff = {
      getImage: vi.fn(() => Promise.resolve(image)),
    }
    fromUrl.mockResolvedValue(tiff)
    return tiff
  }

  it('returns expected properties', async () => {
    setupMockTiff()
    const result = await createCOGImageLayer({
      url: 'http://example.com/test.tif',
      viewProjection: 'EPSG:3857'
    })
    expect(result).toHaveProperty('layer')
    expect(result).toHaveProperty('source')
    expect(result).toHaveProperty('extent')
    expect(result).toHaveProperty('center')
    expect(result).toHaveProperty('tiff')
    expect(typeof result.getStats).toBe('function')
    expect(typeof result.getBandInfo).toBe('function')
    expect(typeof result.setStats).toBe('function')
    expect(typeof result.setColormap).toBe('function')
  })

  it('getPerf returns null when enablePerf is false', async () => {
    setupMockTiff()
    const result = await createCOGImageLayer({
      url: 'http://example.com/test.tif',
      viewProjection: 'EPSG:3857'
    })
    expect(result.getPerf()).toBeNull()
  })

  it('getPerf returns data when enablePerf is true', async () => {
    setupMockTiff()
    const result = await createCOGImageLayer({
      url: 'http://example.com/test.tif',
      viewProjection: 'EPSG:3857',
      enablePerf: true
    })
    const perf = result.getPerf()
    expect(perf).not.toBeNull()
    expect(perf).toHaveProperty('canvasFunction')
    expect(perf).toHaveProperty('loadAndRender')
    expect(perf).toHaveProperty('analysis')
  })

  it('resetPerf clears perf data', async () => {
    setupMockTiff()
    const result = await createCOGImageLayer({
      url: 'http://example.com/test.tif',
      viewProjection: 'EPSG:3857',
      enablePerf: true
    })
    result.resetPerf()
    const perf = result.getPerf()
    expect(perf.canvasFunction.renders).toBe(0)
    expect(perf.loadAndRender.renders).toBe(0)
  })

  it('setColormap updates colormap', async () => {
    setupMockTiff()
    const result = await createCOGImageLayer({
      url: 'http://example.com/test.tif',
      viewProjection: 'EPSG:3857'
    })
    // Should not throw
    result.setColormap('viridis')
    result.setColormap(null)
  })

  it('setStats updates stats', async () => {
    setupMockTiff()
    const result = await createCOGImageLayer({
      url: 'http://example.com/test.tif',
      viewProjection: 'EPSG:3857'
    })
    const newStats = [{ min: 0, max: 500 }, { min: 0, max: 500 }, { min: 0, max: 500 }]
    result.setStats(newStats)
    expect(result.getStats()).toEqual(newStats)
  })

  it('getBandInfo returns detected bands', async () => {
    setupMockTiff()
    const result = await createCOGImageLayer({
      url: 'http://example.com/test.tif',
      viewProjection: 'EPSG:3857'
    })
    const bandInfo = result.getBandInfo()
    expect(bandInfo.type).toBe('rgb')
    expect(bandInfo.bands).toEqual([1, 2, 3])
  })

  it('throws when url is missing', async () => {
    await expect(createCOGImageLayer({ viewProjection: 'EPSG:3857' })).rejects.toThrow('url is required')
  })

  it('throws when affine mode without viewProjection', async () => {
    await expect(createCOGImageLayer({
      url: 'http://example.com/test.tif',
      projectionMode: 'affine'
    })).rejects.toThrow('viewProjection is required for affine mode')
  })

  it('wraps tiff loading errors', async () => {
    fromUrl.mockRejectedValue(new Error('Network error'))
    await expect(createCOGImageLayer({
      url: 'http://example.com/bad.tif',
      viewProjection: 'EPSG:3857'
    })).rejects.toThrow('Failed to load COG')
  })
})
