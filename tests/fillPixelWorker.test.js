import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Test the worker module's public API
// Since Worker/Blob aren't available in Node, fillPixelDataAsync returns null (fallback)
import { fillPixelDataAsync, terminateWorker } from '../src/fillPixelWorker.js'

describe('fillPixelWorker', () => {
  afterEach(() => {
    terminateWorker()
  })

  it('fillPixelDataAsync returns null when Worker is unavailable (Node env)', async () => {
    const rasters = [new Float32Array([100, 150])]
    const stats = [{ min: 0, max: 255 }]
    const result = await fillPixelDataAsync(rasters, 'gray', stats, 2, null, 0)
    // In Node, Worker constructor throws → returns null (fallback path)
    expect(result).toBeNull()
  })

  it('terminateWorker does not throw when no worker exists', () => {
    expect(() => terminateWorker()).not.toThrow()
  })
})
