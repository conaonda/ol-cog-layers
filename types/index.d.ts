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

export interface COGLayerOptions {
  url: string
  bandInfo?: BandInfo
  projectionMode?: 'affine' | 'reproject'
  viewProjection?: string
  targetTileSize?: number
  opacity?: number
  preload?: number
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
}

export type ColormapName = 'grayscale' | 'viridis' | 'inferno' | 'plasma'

export declare const COLORMAPS: Record<ColormapName, number[][] | null>

export declare function createCOGLayer(options: COGLayerOptions): Promise<COGLayerResult>

export declare function createCOGImageLayer(options: COGImageLayerOptions): Promise<COGImageLayerResult>

export declare function createCOGSource(url: string, bands: number[]): GeoTIFFSource

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
  bands: number[]
): Promise<OverviewResult>

export declare function applyColormapToPixel(
  normalizedValue: number,
  colormapName: string
): number[]
