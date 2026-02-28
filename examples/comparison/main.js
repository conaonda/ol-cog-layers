import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import GeoTIFF from 'ol/source/GeoTIFF'
import WebGLTileLayer from 'ol/layer/WebGLTile'
import { createCOGLayer } from 'ol-cog-layers'

// SkySat RGB — UTM projected
const COG_URL = 'https://storage.googleapis.com/pdd-stac/disasters/hurricane-harvey/0831/SkySat_20170831T195552Z_RGB.tif'

const status = document.getElementById('status')

try {
  // --- Vanilla OpenLayers ---
  // Uses OL's built-in GeoTIFF source on an EPSG:3857 view
  const vanillaSource = new GeoTIFF({
    sources: [{ url: COG_URL, bands: [1, 2, 3] }],
  })
  const vanillaLayer = new WebGLTileLayer({ source: vanillaSource })

  const vanillaMap = new Map({
    target: 'map-vanilla',
    layers: [
      new TileLayer({ source: new OSM() }),
      vanillaLayer,
    ],
    view: new View({
      projection: 'EPSG:3857',
      center: [0, 0],
      zoom: 2,
    }),
  })

  // --- ol-cog-layers with affine mode ---
  const { layer, extent } = await createCOGLayer({
    url: COG_URL,
    viewProjection: 'EPSG:3857',
    projectionMode: 'affine',
  })

  const easyMap = new Map({
    target: 'map-easy',
    layers: [
      new TileLayer({ source: new OSM() }),
      layer,
    ],
    view: new View({
      projection: 'EPSG:3857',
    }),
  })

  easyMap.getView().fit(extent)

  // Sync vanilla map to match ol-cog-layers view
  const easyView = easyMap.getView()
  vanillaMap.getView().setCenter(easyView.getCenter())
  vanillaMap.getView().setZoom(easyView.getZoom())

  // --- Sync views ---
  let syncing = false

  function syncView(source, target) {
    source.getView().on(['change:center', 'change:resolution', 'change:rotation'], () => {
      if (syncing) return
      syncing = true
      const view = source.getView()
      const targetView = target.getView()
      targetView.setCenter(view.getCenter())
      targetView.setResolution(view.getResolution())
      targetView.setRotation(view.getRotation())
      syncing = false
    })
  }

  syncView(vanillaMap, easyMap)
  syncView(easyMap, vanillaMap)

  status.textContent = 'Both maps loaded — pan/zoom is synced'
  status.className = 'status ready'
} catch (err) {
  status.textContent = `Error: ${err.message}`
  status.className = 'status error'
  console.error(err)
}
