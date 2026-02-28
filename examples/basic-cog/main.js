import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { createCOGLayer } from 'ol-cog-layers'

// SkySat RGB — UTM projected, rendered on EPSG:3857 via affine transform
const COG_URL = 'https://storage.googleapis.com/pdd-stac/disasters/hurricane-harvey/0831/SkySat_20170831T195552Z_RGB.tif'

const status = document.getElementById('status')

try {
  const { layer, extent } = await createCOGLayer({
    url: COG_URL,
    viewProjection: 'EPSG:3857',
    projectionMode: 'affine',
  })

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
  status.textContent = 'COG loaded successfully'
  status.className = 'status ready'
} catch (err) {
  status.textContent = `Error: ${err.message}`
  status.className = 'status error'
  console.error(err)
}
