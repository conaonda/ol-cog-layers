import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'examples',
  base: '/ol-cog-layers/',
  resolve: {
    alias: {
      'ol-cog-layers': resolve(__dirname, 'src/index.js')
    }
  },
  build: {
    target: 'esnext',
    outDir: resolve(__dirname, 'dist-examples'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'examples/index.html'),
        'basic-cog': resolve(__dirname, 'examples/basic-cog/index.html'),
        'rotated-sar': resolve(__dirname, 'examples/rotated-sar/index.html'),
        colormap: resolve(__dirname, 'examples/colormap/index.html'),
        comparison: resolve(__dirname, 'examples/comparison/index.html')
      }
    }
  }
})
