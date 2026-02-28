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

// Capella SAR — UTM, grayscale
const COG_URL = 'https://capella-open-data.s3.amazonaws.com/data/2025/12/5/CAPELLA_C17_SS_GEO_HH_20251205200331_20251205200347/CAPELLA_C17_SS_GEO_HH_20251205200331_20251205200347_preview.tif'

const status = document.getElementById('status')
const select = document.getElementById('colormap-select')
const bandInfoEl = document.getElementById('band-info')

try {
  const tiff = await fromUrl(COG_URL)
  const bandInfo = await detectBands(tiff)
  const { stats } = await getMinMaxFromOverview(tiff, bandInfo.bands)

  bandInfoEl.innerHTML =
    `<strong>Band info:</strong> type=${bandInfo.type}, bands=[${bandInfo.bands.join(',')}]<br>` +
    `<strong>Stats:</strong> ${stats.map((s, i) => `band${i + 1}: [${s.min}, ${s.max}]`).join(', ')}`

  const { layer, extent } = await createCOGLayer({
    url: COG_URL,
    viewProjection: 'EPSG:3857',
    projectionMode: 'affine',
  })

  // Apply initial colormap
  const initialStyle = buildStyleWithColormap(bandInfo, stats, select.value)
  layer.setStyle(initialStyle)

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

  select.disabled = false
  select.addEventListener('change', () => {
    const style = buildStyleWithColormap(bandInfo, stats, select.value)
    layer.setStyle(style)
  })

  status.textContent = 'COG loaded — select a colormap above'
  status.className = 'status ready'
} catch (err) {
  status.textContent = `Error: ${err.message}`
  status.className = 'status error'
  console.error(err)
}
