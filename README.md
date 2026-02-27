# @conaonda/ol-cog-layers

OpenLayers COG (Cloud Optimized GeoTIFF) rendering layers — WebGL tile + Canvas image pipelines.

## Install

```bash
npm install @conaonda/ol-cog-layers
```

## Usage

```js
import { createCOGLayer, createCOGImageLayer } from '@conaonda/ol-cog-layers'

// WebGL tile pipeline (desktop)
const { layer, extent, center } = await createCOGLayer({
  url: 'https://example.com/image.tif',
  viewProjection: 'EPSG:3857'
})

// Canvas image pipeline (mobile / no WebGL float)
const result = await createCOGImageLayer({
  url: 'https://example.com/image.tif',
  viewProjection: 'EPSG:3857'
})
```

## Peer Dependencies

- `ol` >= 10.0.0

## License

MIT
