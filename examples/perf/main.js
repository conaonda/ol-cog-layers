import { Map, View } from 'ol'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { createCOGImageLayer } from 'ol-cog-layers'

const COG_URL = 'https://storage.googleapis.com/pdd-stac/disasters/hurricane-harvey/0831/SkySat_20170831T195552Z_RGB.tif'

const status = document.getElementById('status')

try {
  const cog = await createCOGImageLayer({
    url: COG_URL,
    viewProjection: 'EPSG:3857',
    projectionMode: 'affine',
    enablePerf: true,
  })

  const map = new Map({
    target: 'map',
    layers: [
      new TileLayer({ source: new OSM() }),
      cog.layer,
    ],
    view: new View({
      projection: 'EPSG:3857',
    }),
  })

  map.getView().fit(cog.extent)
  status.textContent = 'COG loaded — pan/zoom to see metrics'
  status.className = 'status ready'

  // Update perf panel every second
  function updatePanel() {
    const perf = cog.getPerf()
    if (!perf) return

    const cf = perf.canvasFunction
    document.getElementById('cf-renders').textContent = cf.renders
    document.getElementById('cf-avg').textContent = cf.avgMs.toFixed(2)
    document.getElementById('cf-max').textContent = cf.maxMs.toFixed(2)
    document.getElementById('cf-drops').textContent = cf.drops

    const lr = perf.loadAndRender
    document.getElementById('lr-renders').textContent = lr.renders
    document.getElementById('lr-avg').textContent = lr.avgMs.toFixed(2)
    document.getElementById('lr-max').textContent = lr.maxMs.toFixed(2)
    document.getElementById('lr-drops').textContent = lr.drops

    const an = perf.analysis.loadAndRender
    document.getElementById('an-p50').textContent = an.p50.toFixed(2)
    document.getElementById('an-p95').textContent = an.p95.toFixed(2)
    document.getElementById('an-p99').textContent = an.p99.toFixed(2)
    document.getElementById('an-drop-rate').textContent = (an.dropRate * 100).toFixed(1) + '%'
  }

  setInterval(updatePanel, 1000)

  document.getElementById('reset-btn').addEventListener('click', () => {
    cog.resetPerf()
    updatePanel()
  })
} catch (err) {
  status.textContent = `Error: ${err.message}`
  status.className = 'status error'
  console.error(err)
}
