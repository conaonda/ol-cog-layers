# Changelog

## 0.3.1

### Fixed
- Fix CI test failure: add missing `ModelTransformation` property to mock `fileDirectory` in `createMockTiff` helper, ensuring `computePixelToViewAffine()` returns the correct affine transform

## 0.3.0

### Added
- Interactive examples (basic-cog, colormap, comparison, rotated-sar) with live demo pages
- CI workflow (GitHub Actions) with automated tests
- Lint job added to CI pipeline (`eslint src`)
- Unit tests for `cogLayer` and `colormap` modules using Vitest
- `debounceMs` option for `createCOGImageLayer` to reduce raster re-fetches on rapid view changes
- `preload` option for `createCOGLayer` to preload adjacent zoom levels
- TypeScript type declarations (`types/index.d.ts`) with `exports` types condition
- CJS build output (`dist/ol-cog-layers.cjs`) alongside ESM
- ESLint 9 flat config + Prettier setup
- `CONTRIBUTING.md` guide
- npm publish workflow (`.github/workflows/publish.yml`)
- `sideEffects: false` for tree-shaking support
- Package metadata: `engines`, `author`, `bugs`, `homepage`

### Fixed
- Debounce stale canvas bug in `cogImageLayer` — the debounce callback now always uses the latest requested extent/size, preventing infinite re-render loops and blank tiles after zoom/pan
- `main` field corrected to point to CJS entry (`dist/ol-cog-layers.cjs`)

### Changed
- README rewritten with full API documentation, real COG dataset examples, and architecture explanation

## 0.2.0

### Added
- `createCOGImageLayer` — Canvas-based image pipeline for devices without WebGL float support
- Built-in colormaps (viridis, inferno, plasma) for single-band visualization
- `buildStyleWithColormap` utility for WebGL colormap rendering
- `setColormap()` and `setStats()` dynamic update methods on image layer

## 0.1.1

### Fixed
- Include `src` directory in npm package

## 0.1.0

### Added
- Initial release
- `createCOGLayer` — WebGL tile pipeline with affine transform support
- `detectBands` — automatic RGB/grayscale band detection
- `getMinMaxFromOverview` — fast min/max statistics from coarsest overview
- `buildStyle` — WebGL style expression builder
- `createCOGSource` — GeoTIFF source factory with sensible defaults
