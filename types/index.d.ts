import type WebGLTileLayer from 'ol/layer/WebGLTile'
import type GeoTIFFSource from 'ol/source/GeoTIFF'
import type ImageLayer from 'ol/layer/Image'
import type ImageCanvasSource from 'ol/source/ImageCanvas'
import type { GeoTIFF } from 'geotiff'

export interface BandInfo {
  type: 'rgb' | 'gray'
  bands: number[]
}

export interface BandStats {
  min: number
  max: number
}

export interface OverviewResult {
  stats: BandStats[]
  rasters: ArrayLike<number>[]
  width: number
  height: number
}

export interface PerfReport {
  renders: number
  totalMs: number
  maxMs: number
  drops: number
  avgMs: number
}

export interface PerfDropStreak {
  start: number
  end: number
  count: number
  maxMs: number
}

export interface PerfAnalysis {
  p50: number
  p95: number
  p99: number
  dropRate: number
  recentDrops: PerfDropStreak[]
}

export interface PerfMonitor {
  measure<T>(fn: () => T, meta?: Record<string, unknown>): T
  measureAsync<T>(fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T>
  report(): PerfReport
  analyze(): PerfAnalysis
  reset(): void
  label: string
}

export interface PerfResult {
  canvasFunction: PerfReport
  loadAndRender: PerfReport
  analysis: {
    canvasFunction: PerfAnalysis
    loadAndRender: PerfAnalysis
  }
}

export interface FetchOptions {
  headers?: Record<string, string>
  credentials?: RequestCredentials
  maxRanges?: number
}

export interface COGLayerOptions {
  url: string
  bandInfo?: BandInfo
  projectionMode?: 'affine' | 'reproject'
  viewProjection?: string
  targetTileSize?: number
  opacity?: number
  preload?: number
  nodata?: number
  fetchOptions?: FetchOptions
}

export interface COGLayerResult {
  layer: WebGLTileLayer
  source: GeoTIFFSource
  extent: number[] | undefined
  center: number[] | undefined
  projection: string
  zoom: number | undefined
  tiff: GeoTIFF
}

export interface COGImageLayerOptions {
  url: string
  projectionMode?: 'affine' | 'reproject'
  viewProjection?: string
  opacity?: number
  resolutionMultiplier?: number
  debounceMs?: number
  enablePerf?: boolean
  nodata?: number
  fetchOptions?: FetchOptions
  onLoadStart?: () => void
  onLoadEnd?: () => void
  onLoadError?: (error: Error) => void
}

export interface COGImageLayerResult {
  layer: ImageLayer<ImageCanvasSource>
  source: ImageCanvasSource
  extent: number[]
  tiff: GeoTIFF
  center: number[]
  getStats(): BandStats[]
  getBandInfo(): BandInfo
  setStats(newStats: BandStats[]): void
  setColormap(name: string | null): void
  getPerf(): PerfResult | null
  resetPerf(): void
}

export type ColormapName = 'grayscale' | 'viridis' | 'inferno' | 'plasma' | (string & {})

export declare const COLORMAPS: Record<string, number[][] | null>

export declare function registerColormap(name: string, lut: number[][]): void

export declare function createCOGLayer(options: COGLayerOptions): Promise<COGLayerResult>

export declare function createCOGImageLayer(options: COGImageLayerOptions): Promise<COGImageLayerResult>

export declare function createCOGSource(url: string, bands: number[], options?: { nodata?: number, fetchOptions?: FetchOptions }): GeoTIFFSource

export declare function buildStyle(
  bandInfo: BandInfo,
  stats: BandStats[]
): Record<string, unknown>

export declare function buildStyleWithColormap(
  bandInfo: BandInfo,
  stats: BandStats[],
  colormapName?: string
): Record<string, unknown>

export declare function detectBands(tiff: GeoTIFF): Promise<BandInfo>

export declare function getTotalBands(tiff: GeoTIFF): Promise<number>

export declare function getMinMaxFromOverview(
  tiff: GeoTIFF,
  bands: number[],
  options?: { nodata?: number }
): Promise<OverviewResult>

export declare function applyColormapToPixel(
  normalizedValue: number,
  colormapName: string
): number[]

export declare function createPerfMonitor(
  label?: string,
  options?: { maxHistory?: number }
): PerfMonitor

export declare function fillPixelData(
  px: Uint8ClampedArray,
  rasters: ArrayLike<number>[],
  bandInfo: BandInfo,
  stats: BandStats[],
  pixelCount: number,
  colormapName: string | null,
  nodata?: number
): void
