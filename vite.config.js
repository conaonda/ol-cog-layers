import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.js',
      formats: ['es', 'cjs'],
      fileName: 'ol-cog-layers'
    },
    rollupOptions: {
      external: [
        'ol/layer/WebGLTile',
        'ol/source/GeoTIFF',
        'ol/tilegrid/TileGrid.js',
        'ol/proj',
        'ol/transform.js',
        'ol/TileRange.js',
        'ol/layer/Image',
        'ol/source/ImageCanvas',
        'ol/extent',
        /^ol\//
      ]
    },
    sourcemap: true
  }
})
