/**
 * Band Math utilities for spectral index computation.
 *
 * Provides:
 * - WebGL style expression builders (for createCOGLayer)
 * - Canvas pixel computation (for createCOGImageLayer)
 */

// === WebGL Style Expression Builders ===

/**
 * Normalized Difference Vegetation Index.
 * NDVI = (NIR - Red) / (NIR + Red)
 */
export function ndvi(nirBand = 2, redBand = 1) {
  return normalizedDifference(nirBand, redBand)
}

/**
 * Normalized Difference Water Index.
 * NDWI = (Green - NIR) / (Green + NIR)
 */
export function ndwi(greenBand = 1, nirBand = 2) {
  return normalizedDifference(greenBand, nirBand)
}

/**
 * Normalized Difference Built-up Index.
 * NDBI = (SWIR - NIR) / (SWIR + NIR)
 */
export function ndbi(swirBand = 1, nirBand = 2) {
  return normalizedDifference(swirBand, nirBand)
}

/**
 * Generic normalized difference: (A - B) / (A + B)
 * Returns an OL WebGL style expression array.
 */
export function normalizedDifference(bandA, bandB) {
  const a = ['band', bandA]
  const b = ['band', bandB]
  return ['/', ['-', a, b], ['+', a, b]]
}

/**
 * Build a complete WebGL style object from a band math expression and color stops.
 *
 * @param {Array} expression - OL style expression (e.g. from ndvi())
 * @param {Array<[number, number[]]>} colorStops - [[value, [r,g,b]], ...] sorted by value
 * @returns {Object} OL style object with interpolated color
 */
export function buildBandMathStyle(expression, colorStops) {
  if (!expression) throw new Error('expression is required')
  if (!colorStops || colorStops.length < 2) throw new Error('colorStops must have at least 2 entries')

  const flatStops = []
  for (const [value, color] of colorStops) {
    flatStops.push(value)
    flatStops.push(['color', color[0], color[1], color[2]])
  }

  return {
    color: ['interpolate', ['linear'], expression, ...flatStops]
  }
}

/**
 * Compute band math on raster data (Canvas pipeline).
 *
 * @param {Float32Array[]} rasters - Array of band raster arrays
 * @param {function} fn - (bands: number[]) => number
 * @param {number} pixelCount - Number of pixels
 * @returns {Float32Array} Single-band result
 */
export function computeBandMath(rasters, fn, pixelCount) {
  const result = new Float32Array(pixelCount)
  const bandCount = rasters.length
  const bands = new Array(bandCount)
  for (let i = 0; i < pixelCount; i++) {
    for (let b = 0; b < bandCount; b++) {
      bands[b] = rasters[b][i]
    }
    result[i] = fn(bands)
  }
  return result
}
