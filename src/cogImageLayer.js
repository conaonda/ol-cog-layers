import ImageLayer from 'ol/layer/Image'
import ImageCanvasSource from 'ol/source/ImageCanvas'
import { transformExtent } from 'ol/proj'
import { intersects, getIntersection } from 'ol/extent'
import { fromUrl as tiffFromUrl, Pool } from 'geotiff'
import { detectBands, getMinMaxFromOverview } from './cogLayer.js'
import { COLORMAPS } from './colormap.js'
import { createPerfMonitor } from './perf.js'
import { fillPixelDataAsync } from './fillPixelWorker.js'

const GEOTIFF_BLOCK_SIZE = 524288
const GEOTIFF_CACHE_SIZE = 500

let pool
try { pool = new Pool(4) } catch { /* worker unavailable – decode on main thread */ }

export function fillPixelData(px, rasters, bandInfo, stats, pixelCount, colormapName, nodata = 0) {
  if (bandInfo.type === 'rgb') {
    const r = rasters[0], g = rasters[1], b = rasters[2]
    const rMin = stats[0].min, rScale = 255 / (stats[0].max - stats[0].min)
    const gMin = stats[1].min, gScale = 255 / (stats[1].max - stats[1].min)
    const bMin = stats[2].min, bScale = 255 / (stats[2].max - stats[2].min)
    for (let i = 0; i < pixelCount; i++) {
      const j = i * 4
      if (r[i] === nodata && g[i] === nodata && b[i] === nodata) {
        px[j + 3] = 0
      } else {
        px[j]     = ((r[i] - rMin) * rScale + 0.5) | 0
        px[j + 1] = ((g[i] - gMin) * gScale + 0.5) | 0
        px[j + 2] = ((b[i] - bMin) * bScale + 0.5) | 0
        px[j + 3] = 255
      }
    }
  } else {
    const band = rasters[0]
    const bMin = stats[0].min, bScale = 255 / (stats[0].max - stats[0].min)
    const lut = colormapName ? COLORMAPS[colormapName] : null
    for (let i = 0; i < pixelCount; i++) {
      const j = i * 4
      if (band[i] === nodata) {
        px[j + 3] = 0
      } else {
        const v = ((band[i] - bMin) * bScale + 0.5) | 0
        if (lut) {
          const idx = Math.min(255, Math.max(0, v))
          px[j] = lut[idx][0]; px[j + 1] = lut[idx][1]; px[j + 2] = lut[idx][2]; px[j + 3] = 255
        } else {
          px[j] = v; px[j + 1] = v; px[j + 2] = v; px[j + 3] = 255
        }
      }
    }
  }
}

export async function createCOGImageLayer({ url, projectionMode = 'reproject', viewProjection, opacity = 1, resolutionMultiplier = 1, debounceMs = 500, enablePerf = false, nodata = 0, fetchOptions, onLoadStart, onLoadEnd, onLoadError } = {}) {
  if (!url) throw new Error('url is required')
  if (projectionMode === 'affine' && !viewProjection) throw new Error('viewProjection is required for affine mode')

  const canvasPerfMonitor = enablePerf ? createPerfMonitor('canvasFunction') : null
  const renderPerfMonitor = enablePerf ? createPerfMonitor('loadAndRender') : null

  let tiff
  try {
    tiff = await tiffFromUrl(url, { blockSize: GEOTIFF_BLOCK_SIZE, cacheSize: GEOTIFF_CACHE_SIZE, ...fetchOptions })
  } catch (err) {
    throw new Error(`Failed to load COG from ${url}: ${err.message}`)
  }

  const [bandInfo, image] = await Promise.all([
    detectBands(tiff),
    tiff.getImage(0)
  ])

  const overview = await getMinMaxFromOverview(tiff, bandInfo.bands, { nodata })
  const stats = overview.stats
  const samples = bandInfo.bands.map(b => b - 1)
  let currentColormap = null

  // COG native CRS
  const geoKeys = image.getGeoKeys()
  const epsgCode = geoKeys.ProjectedCSTypeGeoKey || geoKeys.GeographicTypeGeoKey || 4326
  const cogCRS = `EPSG:${epsgCode}`

  // COG native extent
  const bbox = image.getBoundingBox()
  const cogExtent = [bbox[0], bbox[1], bbox[2], bbox[3]]
  const viewExtent = transformExtent(cogExtent, cogCRS, viewProjection)

  const affineViewToCog = (ext) => {
    const sx = (cogExtent[2] - cogExtent[0]) / (viewExtent[2] - viewExtent[0])
    const sy = (cogExtent[3] - cogExtent[1]) / (viewExtent[3] - viewExtent[1])
    return [
      cogExtent[0] + (ext[0] - viewExtent[0]) * sx,
      cogExtent[1] + (ext[1] - viewExtent[1]) * sy,
      cogExtent[0] + (ext[2] - viewExtent[0]) * sx,
      cogExtent[1] + (ext[3] - viewExtent[1]) * sy
    ]
  }

  // Cache & async state
  let cachedCanvas = null
  let cachedExtent = null
  let cachedKey = null
  let debounceTimer = null
  let abortCtrl = null
  let pendingExtent = null
  let pendingSize = null

  // Render overview as low-res preview so the first frame is not blank
  const pvW = overview.width, pvH = overview.height
  const previewCanvas = document.createElement('canvas')
  previewCanvas.width = pvW
  previewCanvas.height = pvH
  const previewCtx = previewCanvas.getContext('2d')
  const previewImgData = previewCtx.createImageData(pvW, pvH)
  fillPixelData(previewImgData.data, overview.rasters, bandInfo, stats, pvW * pvH, currentColormap, nodata)
  previewCtx.putImageData(previewImgData, 0, 0)
  cachedCanvas = previewCanvas
  cachedExtent = viewExtent.slice()

  const extentKey = (ext, w, h) => `${ext.map(v => v.toFixed(1)).join(',')}_${w}x${h}`

  const loadAndRender = async (extent, size) => {
    // Abort previous in-flight request
    if (abortCtrl) abortCtrl.abort()
    abortCtrl = new AbortController()
    const { signal } = abortCtrl

    if (onLoadStart) onLoadStart()
    try {
      const reqExtent = projectionMode === 'affine'
        ? affineViewToCog(extent)
        : transformExtent(extent, viewProjection, cogCRS)

      // Clip to COG bounds
      if (!intersects(reqExtent, cogExtent)) return
      const clipped = getIntersection(reqExtent, cogExtent)

      // Compute pixel dimensions proportional to clipped area
      const fullW = reqExtent[2] - reqExtent[0]
      const fullH = reqExtent[3] - reqExtent[1]
      const clipW = clipped[2] - clipped[0]
      const clipH = clipped[3] - clipped[1]
      const resX = (fullW / size[0]) * resolutionMultiplier
      const resY = (fullH / size[1]) * resolutionMultiplier

      const readParams = {
        bbox: [clipped[0], clipped[1], clipped[2], clipped[3]],
        resX, resY,
        samples
      }
      const rasters = await tiff.readRasters({ ...readParams, signal, pool })

      if (signal.aborted) return

      const natW = rasters.width
      const natH = rasters.height
      if (natW === 0 || natH === 0) return

      // Build pixel data — try worker first, fallback to main thread
      const lut = currentColormap ? COLORMAPS[currentColormap] : null
      const rasterArrays = []
      for (let i = 0; i < rasters.length; i++) rasterArrays.push(rasters[i])
      let pixelData = await fillPixelDataAsync(rasterArrays, bandInfo.type, stats, natW * natH, lut, nodata)

      if (signal.aborted) return

      // Render pixel data to canvas (main thread only — canvas API not available in workers)
      const renderToCanvas = () => {
        const tmpCanvas = document.createElement('canvas')
        tmpCanvas.width = natW
        tmpCanvas.height = natH
        const tmpCtx = tmpCanvas.getContext('2d')
        const imgData = tmpCtx.createImageData(natW, natH)

        if (pixelData) {
          imgData.data.set(pixelData)
        } else {
          // Worker unavailable — fallback to main thread
          fillPixelData(imgData.data, rasters, bandInfo, stats, natW * natH, currentColormap, nodata)
        }
        tmpCtx.putImageData(imgData, 0, 0)

        const canvas = document.createElement('canvas')
        canvas.width = size[0]
        canvas.height = size[1]
        const ctx = canvas.getContext('2d')
        const drawW = Math.round(size[0] * (clipW / fullW))
        const drawH = Math.round(size[1] * (clipH / fullH))
        const offsetX = Math.round(size[0] * ((clipped[0] - reqExtent[0]) / fullW))
        const offsetY = Math.round(size[1] * ((reqExtent[3] - clipped[3]) / fullH))
        ctx.drawImage(tmpCanvas, 0, 0, natW, natH, offsetX, offsetY, drawW, drawH)
        return canvas
      }

      let canvas
      if (renderPerfMonitor) {
        canvas = renderPerfMonitor.measure(renderToCanvas, { width: natW, height: natH, pixels: natW * natH, workerUsed: !!pixelData })
        const last = renderPerfMonitor.report()
        if (last.maxMs > 16 && last.drops > 0) {
          console.warn(`[${renderPerfMonitor.label}] Frame drop detected: last render took ${last.maxMs.toFixed(1)}ms (drops: ${last.drops}/${last.renders})`)
          const analysis = renderPerfMonitor.analyze()
          if (analysis.dropRate > 0.2) {
            console.table({ p50: analysis.p50.toFixed(2), p95: analysis.p95.toFixed(2), p99: analysis.p99.toFixed(2), dropRate: (analysis.dropRate * 100).toFixed(1) + '%' })
          }
        }
      } else {
        canvas = renderToCanvas()
      }

      // Update cache and trigger re-render
      cachedKey = extentKey(extent, size[0], size[1])
      cachedExtent = extent.slice()
      cachedCanvas = canvas
      source.changed()
      if (onLoadEnd) onLoadEnd()
    } catch (err) {
      if (err.name === 'AbortError') return
      console.error('COG image load error:', err)
      if (onLoadError) onLoadError(err)
    }
  }

  const source = new ImageCanvasSource({
    canvasFunction(extent, resolution, pixelRatio, size, projection) {
      const body = () => {
        const key = extentKey(extent, size[0], size[1])
        if (cachedKey === key && cachedCanvas) {
          return cachedCanvas
        }

        const canvas = document.createElement('canvas')
        canvas.width = size[0]
        canvas.height = size[1]

        if (cachedCanvas && cachedExtent) {
          const ctx = canvas.getContext('2d')
          const newW = extent[2] - extent[0]
          const newH = extent[3] - extent[1]
          const dx = (cachedExtent[0] - extent[0]) / newW * size[0]
          const dy = (extent[3] - cachedExtent[3]) / newH * size[1]
          const dw = (cachedExtent[2] - cachedExtent[0]) / newW * size[0]
          const dh = (cachedExtent[3] - cachedExtent[1]) / newH * size[1]
          ctx.drawImage(cachedCanvas, dx, dy, dw, dh)
        }

        pendingExtent = extent
        pendingSize = size

        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => loadAndRender(pendingExtent, pendingSize), debounceMs)

        return canvas
      }

      return canvasPerfMonitor ? canvasPerfMonitor.measure(body) : body()
    },
    ratio: 1
  })

  const layer = new ImageLayer({
    source,
    extent: viewExtent,
    opacity
  })

  return {
    layer, source, extent: viewExtent, tiff,
    center: [(viewExtent[0] + viewExtent[2]) / 2, (viewExtent[1] + viewExtent[3]) / 2],
    getStats() { return stats },
    getBandInfo() { return bandInfo },
    setStats(newStats) {
      stats.length = 0
      newStats.forEach(s => stats.push(s))
      cachedKey = null
      source.changed()
    },
    setColormap(name) {
      currentColormap = name || null
      cachedKey = null
      source.changed()
    },
    getPerf() {
      if (!enablePerf) return null
      return {
        canvasFunction: canvasPerfMonitor.report(),
        loadAndRender: renderPerfMonitor.report(),
        analysis: {
          canvasFunction: canvasPerfMonitor.analyze(),
          loadAndRender: renderPerfMonitor.analyze()
        }
      }
    },
    resetPerf() {
      if (!enablePerf) return
      canvasPerfMonitor.reset()
      renderPerfMonitor.reset()
    }
  }
}
