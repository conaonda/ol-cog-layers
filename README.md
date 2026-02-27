# @conaonda/ol-cog-layers

OpenLayers COG (Cloud Optimized GeoTIFF) rendering layers — WebGL tile + Canvas image pipelines.

## Features

- **WebGL Tile Pipeline** (`createCOGLayer`) — GPU-accelerated rendering via `ol/layer/WebGLTile`
- **Canvas Image Pipeline** (`createCOGImageLayer`) — CPU-based rendering via `ol/layer/Image`, works on devices without WebGL float support
- **Affine transform support** — correctly renders rotated/skewed GeoTIFFs
- **Automatic band detection** — RGB vs grayscale auto-detection from GeoTIFF metadata
- **Min/Max from overview** — fast statistics extraction from the coarsest overview level
- **Built-in colormaps** — viridis, inferno, plasma for single-band visualization

## Install

```bash
npm install @conaonda/ol-cog-layers
```

## Peer Dependencies

- `ol` >= 10.0.0

## Usage

### WebGL Tile Layer

```js
import { createCOGLayer } from '@conaonda/ol-cog-layers'

const { layer, extent, center, zoom, source, tiff } = await createCOGLayer({
  url: 'https://example.com/image.tif',
  viewProjection: 'EPSG:3857',
  // Optional:
  // bandInfo: { type: 'rgb', bands: [1, 2, 3] },
  // projectionMode: 'affine',
  // targetTileSize: 256,
  // opacity: 1,
})

map.addLayer(layer)
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

Returns: `Promise<{ layer, source, extent, center, zoom, tiff }>`

### `createCOGImageLayer(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | — | COG file URL |
| `viewProjection` | `string` | — | Target map projection |
| `projectionMode` | `string` | `'reproject'` | `'reproject'` or `'affine'` |
| `opacity` | `number` | `1` | Layer opacity |
| `resolutionMultiplier` | `number` | `1` | Resolution scale factor |

Returns: `Promise<{ layer, source, extent, center, tiff, getStats(), getBandInfo(), setStats(stats), setColormap(name) }>`

## License

MIT
