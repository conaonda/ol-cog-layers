import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { fromUrl } from 'geotiff'
import {
  createCOGLayer,
  detectBands,
  getMinMaxFromOverview,
  buildStyleWithColormap,
} from 'ol-cog-layers'

// Umbra SAR — has ModelTransformation with rotation terms
const COG_URL = 'https://umbra-open-data-catalog.s3.amazonaws.com/sar-data/tasks/Tanna%20Island,%20Vanuatu/9c76a918-9247-42bf-b9f6-3b4f672bc148/2023-02-12-21-33-56_UMBRA-04/2023-02-12-21-33-56_UMBRA-04_GEC.tif'

const status = document.getElementById('status')

try {
  const tiff = await fromUrl(COG_URL)
  const bandInfo = await detectBands(tiff)
  const { stats } = await getMinMaxFromOverview(tiff, bandInfo.bands)

  const { layer, extent } = await createCOGLayer({
    url: COG_URL,
    viewProjection: 'EPSG:3857',
    projectionMode: 'affine',
  })

  // Apply viridis colormap for SAR grayscale visualization
  const style = buildStyleWithColormap(bandInfo, stats, 'viridis')
  layer.setStyle(style)

  const map = new Map({
    target: 'map',
    layers: [
      new TileLayer({ source: new OSM() }),
      layer,
    ],
    view: new View({
      projection: 'EPSG:3857',
    }),
  })

  map.getView().fit(extent)
  status.textContent = 'Rotated SAR loaded — affine mode handles ModelTransformation rotation'
  status.className = 'status ready'
} catch (err) {
  status.textContent = `Error: ${err.message}`
  status.className = 'status error'
  console.error(err)
}
