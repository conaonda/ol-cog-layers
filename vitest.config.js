import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.js'],
      exclude: ['src/AffineTileLayer.js', 'src/cogImageLayer.js', 'src/index.js']
    }
  }
})
