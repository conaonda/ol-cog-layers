# @conaonda/ol-cog-layers

**Why this library?** OpenLayers' built-in `ol/source/GeoTIFF` assumes the COG's native CRS matches the view projection, or relies on its internal reprojection pipeline. When you load a UTM-projected COG (e.g. EPSG:32615) onto an EPSG:3857 web map, the built-in approach often produces misaligned tiles, broken extents, or simply fails for rotated GeoTIFFs that use a `ModelTransformation` matrix.

`ol-cog-layers` solves this with a single function call — and its `projectionMode: 'affine'` mode bypasses OL's reprojection entirely, patching the tile grid and renderer to apply a GPU-accelerated affine transform directly. This means:

- UTM COGs render **pixel-perfect** on EPSG:3857 basemaps
- **Rotated/skewed GeoTIFFs** (with ModelTransformation) display at the correct position and angle
- No CPU-side reprojection overhead — everything stays on the GPU

## Features

- **WebGL Tile Pipeline** (`createCOGLayer`) — GPU-accelerated rendering via `ol/layer/WebGLTile`
- **Canvas Image Pipeline** (`createCOGImageLayer`) — CPU-based rendering via `ol/layer/Image`, works on devices without WebGL float support
- **Affine transform support** — correctly renders rotated/skewed GeoTIFFs
- **Automatic band detection** — RGB vs grayscale auto-detection from GeoTIFF metadata
- **Min/Max from overview** — fast statistics extraction from the coarsest overview level
- **Built-in colormaps** — viridis, inferno, plasma for single-band visualization

## How `projectionMode: 'affine'` Works

When `projectionMode` is set to `'affine'`, ol-cog-layers:

1. Reads the GeoTIFF's `ModelTransformation` (or `ModelTiepoint` + `ModelPixelScale`)
2. Computes an affine matrix mapping **pixel coordinates → view CRS**
3. Creates a custom `TileGrid` aligned to the COG's native pixel grid
4. **Patches the WebGL tile renderer** to apply the affine transform on the GPU — no per-tile reprojection

This is especially critical for SAR imagery (e.g. Umbra, Capella) where the `ModelTransformation` includes rotation terms that OL's standard pipeline cannot handle.

## Install

```bash
npm install @conaonda/ol-cog-layers
```

## Peer Dependencies

- `ol` >= 10.0.0

## Usage

### WebGL Tile Layer

```js
import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { createCOGLayer } from '@conaonda/ol-cog-layers'

// SkySat RGB imagery (UTM → EPSG:3857 via affine)
const { layer, extent, projection } = await createCOGLayer({
  url: 'https://storage.googleapis.com/pdd-stac/disasters/hurricane-harvey/0831/SkySat_20170831T195552Z_RGB.tif',
  viewProjection: 'EPSG:3857',
  projectionMode: 'affine',
})

const map = new Map({
  target: 'map',
  layers: [
    new TileLayer({ source: new OSM() }),
    layer,
  ],
  view: new View({ projection: 'EPSG:3857' }),
})

map.getView().fit(extent)
```

### Canvas Image Layer

```js
import { createCOGImageLayer } from '@conaonda/ol-cog-layers'

const result = await createCOGImageLayer({
  url: 'https://example.com/image.tif',
  viewProjection: 'EPSG:3857',
  // Optional:
  // projectionMode: 'affine',
  // opacity: 1,
  // resolutionMultiplier: 1,
})

map.addLayer(result.layer)
map.getView().fit(result.extent)

// Dynamic updates
result.setColormap('viridis')  // 'viridis' | 'inferno' | 'plasma' | null
result.setStats([{ min: 0, max: 1000 }])  // override min/max
```

### Colormaps (WebGL)

```js
import { buildStyleWithColormap, detectBands, getMinMaxFromOverview } from '@conaonda/ol-cog-layers'
import { fromUrl } from 'geotiff'

const tiff = await fromUrl('https://example.com/dem.tif')
const bandInfo = await detectBands(tiff)
const { stats } = await getMinMaxFromOverview(tiff, bandInfo.bands)

const style = buildStyleWithColormap(bandInfo, stats, 'viridis')
layer.setStyle(style)
```

### Utility Functions

```js
import {
  detectBands,          // Auto-detect band type (rgb/gray) and band indices
  getTotalBands,        // Get number of data bands (excluding alpha)
  getMinMaxFromOverview, // Extract min/max stats from coarsest overview
  buildStyle,           // Build WebGL style expression from band info and stats
  createCOGSource,      // Create ol/source/GeoTIFF with defaults
  COLORMAPS,            // { grayscale, viridis, inferno, plasma }
  applyColormapToPixel, // Apply colormap LUT to a normalized value (0-255)
  registerColormap,     // Register a custom 256-entry [r,g,b] colormap
} from '@conaonda/ol-cog-layers'
```

## API

### `createCOGLayer(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | — | COG file URL |
| `viewProjection` | `string` | — | Target map projection (e.g. `'EPSG:3857'`) |
| `bandInfo` | `object` | auto-detect | `{ type: 'rgb'|'gray', bands: number[] }` |
| `projectionMode` | `string` | — | Set to `'affine'` for rotated GeoTIFFs |
| `targetTileSize` | `number` | `256` | Target tile size in pixels |
| `opacity` | `number` | `1` | Layer opacity |
| `preload` | `number` | `0` | Number of adjacent zoom levels to preload tiles for |
| `nodata` | `number` | `0` | Nodata value to treat as transparent |
| `fetchOptions` | `object` | — | Options passed to geotiff.js source (e.g. `{ headers: { Authorization: 'Bearer ...' } }`) |

Returns: `Promise<{ layer, source, extent, center, projection, zoom, tiff }>`

### `createCOGImageLayer(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | — | COG file URL |
| `viewProjection` | `string` | — | Target map projection |
| `projectionMode` | `string` | `'reproject'` | `'reproject'` or `'affine'` |
| `opacity` | `number` | `1` | Layer opacity |
| `resolutionMultiplier` | `number` | `1` | Resolution scale factor |
| `debounceMs` | `number` | `500` | Debounce delay (ms) before re-fetching raster data on view change |
| `enablePerf` | `boolean` | `false` | Enable built-in performance monitoring |
| `nodata` | `number` | `0` | Nodata value to treat as transparent |
| `fetchOptions` | `object` | — | Options passed to geotiff.js source (e.g. `{ headers: { Authorization: 'Bearer ...' } }`) |

Returns: `Promise<{ layer, source, extent, center, tiff, getStats(), getBandInfo(), setStats(stats), setColormap(name), getPerf(), resetPerf() }>`

**Methods on result object:**

| Method | Description |
|---|---|
| `getStats()` | Returns current `BandStats[]` |
| `getBandInfo()` | Returns detected `BandInfo` |
| `setStats(stats)` | Override min/max statistics |
| `setColormap(name)` | Set colormap: `'viridis'` \| `'inferno'` \| `'plasma'` \| `null` |
| `getPerf()` | Returns performance report with `{ canvasFunction, loadAndRender, analysis }` or `null` if `enablePerf` is `false` |
| `resetPerf()` | Reset all performance metrics and history |

### `createPerfMonitor(label?, options?)`

Low-level performance monitor utility. Used internally by `createCOGImageLayer` when `enablePerf` is `true`.

```js
import { createPerfMonitor } from '@conaonda/ol-cog-layers'

const monitor = createPerfMonitor('myLabel', { maxHistory: 500 })
const result = monitor.measure(() => expensiveOperation(), { width: 1024 })
console.log(monitor.report())   // { renders, totalMs, maxMs, drops, avgMs }
console.log(monitor.analyze())  // { p50, p95, p99, dropRate, recentDrops }
monitor.reset()
```

## Error Handling

Both `createCOGLayer` and `createCOGImageLayer` are async and may throw on network errors or invalid COG files. Wrap calls in try-catch:

```js
try {
  const cog = await createCOGImageLayer({ url, viewProjection: 'EPSG:3857' })
} catch (err) {
  console.error('Failed to load COG:', err.message)
}
```

## License

MIT
