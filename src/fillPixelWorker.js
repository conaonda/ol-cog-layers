/**
 * Inline Web Worker for fillPixelData offloading.
 * The worker code is embedded as a string and instantiated via Blob URL
 * so it works in any bundler without special worker plugin configuration.
 */

const WORKER_CODE = `
self.onmessage = function(e) {
  const { id, rasters, bandType, stats, pixelCount, lut, nodata } = e.data
  const px = new Uint8ClampedArray(pixelCount * 4)

  if (bandType === 'rgb') {
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

  self.postMessage({ id, px }, [px.buffer])
}
`

let workerInstance = null
let msgId = 0
const pending = new Map()

function getWorker() {
  if (workerInstance) return workerInstance
  try {
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    workerInstance = new Worker(url)
    workerInstance.onmessage = (e) => {
      const { id, px } = e.data
      const resolve = pending.get(id)
      if (resolve) {
        pending.delete(id)
        resolve(px)
      }
    }
    workerInstance.onerror = () => {
      // Worker failed — terminate and disable
      workerInstance.terminate()
      workerInstance = null
      // Reject all pending
      for (const [id, resolve] of pending) {
        resolve(null)
      }
      pending.clear()
    }
    return workerInstance
  } catch {
    return null
  }
}

/**
 * Offload fillPixelData to a Web Worker.
 * Returns a Promise<Uint8ClampedArray> or null if worker is unavailable.
 * Raster typed arrays are transferred (zero-copy) to the worker.
 */
export function fillPixelDataAsync(rasters, bandType, stats, pixelCount, lut, nodata) {
  const worker = getWorker()
  if (!worker) return Promise.resolve(null)

  const id = msgId++
  // Copy raster arrays since we transfer them (caller may still need originals for abort retry)
  const rasterArrays = []
  const transferables = []
  for (let i = 0; i < rasters.length; i++) {
    const copy = new Float32Array(rasters[i])
    rasterArrays.push(copy)
    transferables.push(copy.buffer)
  }

  return new Promise((resolve) => {
    pending.set(id, resolve)
    worker.postMessage(
      { id, rasters: rasterArrays, bandType, stats, pixelCount, lut, nodata },
      transferables
    )
  })
}

export function terminateWorker() {
  if (workerInstance) {
    workerInstance.terminate()
    workerInstance = null
    pending.clear()
  }
}
