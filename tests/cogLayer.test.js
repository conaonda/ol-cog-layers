import { describe, it, expect, vi } from 'vitest'

// Mock OL and geotiff modules before importing cogLayer
vi.mock('ol/layer/WebGLTile', () => ({
  default: vi.fn(function (opts) { this.opts = opts })
}))
vi.mock('ol/source/GeoTIFF', () => ({
  default: vi.fn(function (opts) { this.opts = opts })
}))
vi.mock('ol/tilegrid/TileGrid.js', () => ({
  default: vi.fn(function (opts) { this.opts = opts })
}))
vi.mock('ol/proj', () => ({
  transformExtent: vi.fn((ext) => ext),
  transform: vi.fn((pt) => pt),
  get: vi.fn((code) => ({ getCode: () => code }))
}))
vi.mock('ol/transform.js', () => ({
  create: vi.fn(() => new Float64Array(6)),
  set: vi.fn(),
  setFromArray: vi.fn(),
  invert: vi.fn(),
  apply: vi.fn((t, pt) => pt)
}))
vi.mock('ol/TileRange.js', () => ({
  createOrUpdate: vi.fn((a, b, c, d) => ({ minX: a, maxX: b, minY: c, maxY: d }))
}))
vi.mock('geotiff', () => ({
  fromUrl: vi.fn()
}))
vi.mock('../src/AffineTileLayer.js', () => ({
  patchRendererWithAffine: vi.fn()
}))

import { detectBands, getTotalBands, getMinMaxFromOverview, buildStyle, createCOGSource, createCOGLayer } from '../src/cogLayer.js'
import { fromUrl } from 'geotiff'
import GeoTIFFSource from 'ol/source/GeoTIFF'
import { patchRendererWithAffine } from '../src/AffineTileLayer.js'

function createMockTiff({ samplesPerPixel = 3, photometric = 2, extraSamples, imageCount = 1, rasterData, modelTransformation } = {}) {
  const image = {
    getSamplesPerPixel: () => samplesPerPixel,
    fileDirectory: {
      PhotometricInterpretation: photometric,
      ExtraSamples: extraSamples,
      ModelTransformation: modelTransformation || null,
      getValue: vi.fn(() => modelTransformation || null)
    },
    getWidth: () => 10,
    getHeight: () => 10,
    getGeoKeys: () => ({ ProjectedCSTypeGeoKey: 32632 }),
    getBoundingBox: () => [0, 0, 100, 100],
    readRasters: vi.fn(({ samples }) => {
      if (rasterData) return rasterData
      return samples.map(() => new Float32Array([1, 2, 3, 0, 5]))
    })
  }
  return {
    getImage: vi.fn(() => Promise.resolve(image)),
    getImageCount: vi.fn(() => Promise.resolve(imageCount)),
    readRasters: vi.fn(() => Promise.resolve(rasterData || [new Float32Array([1, 2, 3])]))
  }
}

// === detectBands ===
describe('detectBands', () => {
  it('RGB: photometric=2 with 3+ data bands', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 3, photometric: 2 })
    expect(await detectBands(tiff)).toEqual({ type: 'rgb', bands: [1, 2, 3] })
  })

  it('RGB: 4 bands with 1 alpha', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 4, photometric: 2, extraSamples: [2] })
    expect(await detectBands(tiff)).toEqual({ type: 'rgb', bands: [1, 2, 3] })
  })

  it('RGB: 3+ data bands even without photometric=2', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 3, photometric: 1 })
    expect(await detectBands(tiff)).toEqual({ type: 'rgb', bands: [1, 2, 3] })
  })

  it('gray: 1 band', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 1, photometric: 1 })
    expect(await detectBands(tiff)).toEqual({ type: 'gray', bands: [1] })
  })

  it('gray: 2 bands with alpha', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 2, photometric: 1, extraSamples: [1] })
    expect(await detectBands(tiff)).toEqual({ type: 'gray', bands: [1] })
  })

  it('gray: 2 bands with premultiplied alpha', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 2, photometric: 1, extraSamples: [2] })
    expect(await detectBands(tiff)).toEqual({ type: 'gray', bands: [1] })
  })
})

// === getTotalBands ===
describe('getTotalBands', () => {
  it('returns all bands when no ExtraSamples', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 3 })
    expect(await getTotalBands(tiff)).toBe(3)
  })

  it('subtracts alpha (type=1) channels', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 4, extraSamples: [1] })
    expect(await getTotalBands(tiff)).toBe(3)
  })

  it('subtracts premultiplied alpha (type=2)', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 4, extraSamples: [2] })
    expect(await getTotalBands(tiff)).toBe(3)
  })

  it('does not subtract non-alpha ExtraSamples (type=0)', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 4, extraSamples: [0] })
    expect(await getTotalBands(tiff)).toBe(4)
  })

  it('handles multiple ExtraSamples entries', async () => {
    const tiff = createMockTiff({ samplesPerPixel: 5, extraSamples: [0, 1] })
    expect(await getTotalBands(tiff)).toBe(4)
  })
})

// === getMinMaxFromOverview ===
describe('getMinMaxFromOverview', () => {
  it('computes min/max ignoring zeros', async () => {
    const rasterData = [new Float32Array([0, 10, 20, 0, 5])]
    const tiff = createMockTiff({ imageCount: 3, rasterData })
    const result = await getMinMaxFromOverview(tiff, [1])
    expect(tiff.getImage).toHaveBeenCalledWith(2) // reads last image
    expect(result.stats).toEqual([{ min: 5, max: 20 }])
    expect(result.width).toBe(10)
    expect(result.height).toBe(10)
  })

  it('defaults to [0,1] when all zeros', async () => {
    const rasterData = [new Float32Array([0, 0, 0])]
    const tiff = createMockTiff({ imageCount: 1, rasterData })
    const result = await getMinMaxFromOverview(tiff, [1])
    expect(result.stats).toEqual([{ min: 0, max: 1 }])
  })

  it('handles multiple bands', async () => {
    const rasterData = [
      new Float32Array([0, 100, 200]),
      new Float32Array([0, 50, 150])
    ]
    const tiff = createMockTiff({ imageCount: 1, rasterData })
    const result = await getMinMaxFromOverview(tiff, [1, 2])
    expect(result.stats).toEqual([
      { min: 100, max: 200 },
      { min: 50, max: 150 }
    ])
  })

  it('handles single non-zero value', async () => {
    const rasterData = [new Float32Array([0, 0, 42])]
    const tiff = createMockTiff({ imageCount: 1, rasterData })
    const result = await getMinMaxFromOverview(tiff, [1])
    expect(result.stats).toEqual([{ min: 42, max: 42 }])
  })

  it('returns rasters data', async () => {
    const rasterData = [new Float32Array([1, 2, 3])]
    const tiff = createMockTiff({ imageCount: 1, rasterData })
    const result = await getMinMaxFromOverview(tiff, [1])
    expect(result.rasters).toBe(rasterData)
  })
})

// === buildStyle ===
describe('buildStyle', () => {
  it('RGB returns array with normalized R,G,B and alpha', () => {
    const stats = [{ min: 10, max: 210 }, { min: 20, max: 220 }, { min: 30, max: 230 }]
    const style = buildStyle({ type: 'rgb', bands: [1, 2, 3] }, stats)
    expect(style.color[0]).toBe('array')
    expect(style.color).toHaveLength(5)
    expect(style.color[1]).toEqual(['/', ['-', ['band', 1], 10], 200])
    expect(style.color[2]).toEqual(['/', ['-', ['band', 2], 20], 200])
    expect(style.color[3]).toEqual(['/', ['-', ['band', 3], 30], 200])
    expect(style.color[4]).toEqual(['/', ['band', 4], 255])
  })

  it('gray replicates band 1 to R,G,B', () => {
    const stats = [{ min: 0, max: 1000 }]
    const style = buildStyle({ type: 'gray', bands: [1] }, stats)
    expect(style.color[0]).toBe('array')
    const norm = ['/', ['-', ['band', 1], 0], 1000]
    expect(style.color[1]).toEqual(norm)
    expect(style.color[2]).toEqual(norm)
    expect(style.color[3]).toEqual(norm)
    expect(style.color[4]).toEqual(['/', ['band', 2], 255])
  })
})

// === createCOGSource ===
describe('createCOGSource', () => {
  it('creates GeoTIFFSource with correct options', () => {
    const source = createCOGSource('http://example.com/test.tif', [1, 2, 3])
    expect(source.opts).toEqual({
      sources: [{ url: 'http://example.com/test.tif', bands: [1, 2, 3], nodata: 0 }],
      normalize: false,
      convertToRGB: false,
      opaque: false,
      sourceOptions: { allowFullFile: false }
    })
  })
})

// === createCOGLayer ===
describe('createCOGLayer', () => {
  function setupSourceMock() {
    const coarsestImg = { getWidth: () => 10, getHeight: () => 10 }
    const mainImg = { getWidth: () => 100, getHeight: () => 100 }
    GeoTIFFSource.mockImplementation(function (opts) {
      this.opts = opts
      this.getView = () => Promise.resolve({
        projection: 'EPSG:32632',
        extent: [0, 0, 100, 100],
        center: [50, 50],
        zoom: 10
      })
      this.tileGrid = {
        getResolutions: () => [10, 1],
        getTileSize: (z) => 256,
        getMinZoom: () => 0
      }
      this.sourceImagery_ = [[coarsestImg, mainImg]]
      this.sourceMasks_ = [[coarsestImg, mainImg]]
      this.setTileSizes = vi.fn()
      this.projection = null
      this.tileGridForProjection_ = {}
      this.transformMatrix = null
    })
  }

  it('creates layer in reproject mode (no rotation)', async () => {
    setupSourceMock()
    const mockTiff = createMockTiff({ samplesPerPixel: 3, photometric: 2 })
    fromUrl.mockResolvedValue(mockTiff)

    const result = await createCOGLayer({
      url: 'http://example.com/test.tif',
      projectionMode: 'reproject',
      viewProjection: 'EPSG:3857'
    })

    expect(result).toHaveProperty('layer')
    expect(result).toHaveProperty('source')
    expect(result).toHaveProperty('extent')
    expect(result).toHaveProperty('center')
    expect(result).toHaveProperty('zoom', 10)
    expect(result).toHaveProperty('tiff')
  })

  it('creates layer with overrideBandInfo', async () => {
    setupSourceMock()
    const mockTiff = createMockTiff({ samplesPerPixel: 1, photometric: 1 })
    fromUrl.mockResolvedValue(mockTiff)

    const result = await createCOGLayer({
      url: 'http://example.com/test.tif',
      bandInfo: { type: 'gray', bands: [1] },
      projectionMode: 'reproject',
      viewProjection: 'EPSG:3857'
    })

    expect(result.layer).toBeDefined()
  })

  it('creates layer in affine mode with rotation', async () => {
    setupSourceMock()
    // ModelTransformation with rotation (non-zero mt[1] and mt[4])
    const mt = [1, 0.5, 0, 100, -0.5, 1, 0, 200, 0, 0, 0, 0, 0, 0, 0, 1]
    const mockTiff = createMockTiff({
      samplesPerPixel: 3, photometric: 2,
      modelTransformation: mt
    })
    fromUrl.mockResolvedValue(mockTiff)

    const result = await createCOGLayer({
      url: 'http://example.com/rotated.tif',
      projectionMode: 'affine',
      viewProjection: 'EPSG:3857',
      targetTileSize: 256
    })

    expect(result.layer).toBeDefined()
    expect(result.extent).toBeDefined()
    expect(patchRendererWithAffine).toHaveBeenCalled()
  })

  it('affine mode with extra resolution levels (small initial resolution)', async () => {
    // Make dstResolutions[0] < maxViewRes to trigger extra level logic
    const coarsestImg = { getWidth: () => 10, getHeight: () => 10 }
    const mainImg = { getWidth: () => 100, getHeight: () => 100 }
    GeoTIFFSource.mockImplementation(function (opts) {
      this.opts = opts
      this.getView = () => Promise.resolve({
        projection: 'EPSG:32632',
        extent: [0, 0, 10000, 10000],
        center: [5000, 5000],
        zoom: 10
      })
      this.tileGrid = {
        // Very small resolution → dstResolutions[0] < maxViewRes
        getResolutions: () => [0.1],
        getTileSize: (z) => 256,
        getMinZoom: () => 0
      }
      this.sourceImagery_ = [[coarsestImg, mainImg]]
      this.sourceMasks_ = [[coarsestImg, mainImg]]
      this.setTileSizes = vi.fn()
      this.projection = null
      this.tileGridForProjection_ = {}
      this.transformMatrix = null
    })

    const mt = [1, 0.5, 0, 100, -0.5, 1, 0, 200, 0, 0, 0, 0, 0, 0, 0, 1]
    const mockTiff = createMockTiff({
      samplesPerPixel: 3, photometric: 2,
      modelTransformation: mt
    })
    fromUrl.mockResolvedValue(mockTiff)

    const result = await createCOGLayer({
      url: 'http://example.com/rotated.tif',
      projectionMode: 'affine',
      viewProjection: 'EPSG:3857',
      targetTileSize: 256
    })

    expect(result.layer).toBeDefined()
  })

  it('creates layer in affine mode without rotation (no patch)', async () => {
    setupSourceMock()
    // No rotation: mt[1]=0, mt[4]=0
    const mt = [1, 0, 0, 100, 0, -1, 0, 200, 0, 0, 0, 0, 0, 0, 0, 1]
    const mockTiff = createMockTiff({
      samplesPerPixel: 3, photometric: 2,
      modelTransformation: mt
    })
    fromUrl.mockResolvedValue(mockTiff)

    patchRendererWithAffine.mockClear()

    const result = await createCOGLayer({
      url: 'http://example.com/norot.tif',
      projectionMode: 'affine',
      viewProjection: 'EPSG:3857'
    })

    expect(result.layer).toBeDefined()
    // pixelToView is null when no rotation, so patchRendererWithAffine not called
    expect(patchRendererWithAffine).not.toHaveBeenCalled()
  })

  it('affine mode patches tileGrid with getTileRangeForExtentAndZ', async () => {
    setupSourceMock()
    const mt = [1, 0.5, 0, 100, -0.5, 1, 0, 200, 0, 0, 0, 0, 0, 0, 0, 1]
    const mockTiff = createMockTiff({
      samplesPerPixel: 3, photometric: 2,
      modelTransformation: mt
    })
    fromUrl.mockResolvedValue(mockTiff)

    const result = await createCOGLayer({
      url: 'http://example.com/rotated.tif',
      projectionMode: 'affine',
      viewProjection: 'EPSG:3857',
      targetTileSize: 256
    })

    // The tileGrid should have been patched
    const tileGrid = result.source.tileGrid
    expect(tileGrid.getTileRangeForExtentAndZ).toBeDefined()
    const range = tileGrid.getTileRangeForExtentAndZ([0, 0, 100, 100], 0)
    expect(range).toBeDefined()
    expect(range).toHaveProperty('minX')
    expect(range).toHaveProperty('maxX')
    expect(tileGrid.tileCoordIntersectsViewport()).toBe(true)
  })

  it('affine mode extra levels with uncapped tile sizes', async () => {
    // Large coarsest image so tile sizes are not capped (isCapped = false)
    // getTileSize returns array to cover Array.isArray branches
    const coarsestImg = { getWidth: () => 4096, getHeight: () => 4096 }
    const mainImg = { getWidth: () => 100, getHeight: () => 100 }
    GeoTIFFSource.mockImplementation(function (opts) {
      this.opts = opts
      this.getView = () => Promise.resolve({
        projection: 'EPSG:32632',
        extent: [0, 0, 10000, 10000],
        center: [5000, 5000],
        zoom: 10
      })
      this.tileGrid = {
        getResolutions: () => [0.1],
        getTileSize: (z) => [256, 256],
        getMinZoom: () => 0
      }
      this.sourceImagery_ = [[coarsestImg, mainImg]]
      this.sourceMasks_ = [[coarsestImg, mainImg]]
      this.setTileSizes = vi.fn()
      this.projection = null
      this.tileGridForProjection_ = {}
      this.transformMatrix = null
    })

    const mt = [1, 0.5, 0, 100, -0.5, 1, 0, 200, 0, 0, 0, 0, 0, 0, 0, 1]
    const mockTiff = createMockTiff({
      samplesPerPixel: 3, photometric: 2,
      modelTransformation: mt
    })
    fromUrl.mockResolvedValue(mockTiff)

    const result = await createCOGLayer({
      url: 'http://example.com/rotated.tif',
      projectionMode: 'affine',
      viewProjection: 'EPSG:3857',
      targetTileSize: 256
    })

    expect(result.layer).toBeDefined()
  })

  it('handles opacity parameter', async () => {
    setupSourceMock()
    const mockTiff = createMockTiff({ samplesPerPixel: 3, photometric: 2 })
    fromUrl.mockResolvedValue(mockTiff)

    const result = await createCOGLayer({
      url: 'http://example.com/test.tif',
      projectionMode: 'reproject',
      viewProjection: 'EPSG:3857',
      opacity: 0.5
    })

    expect(result.layer).toBeDefined()
  })
})
