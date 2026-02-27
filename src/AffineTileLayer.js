import {
  create as createTransform,
  set as setTransform,
  setFromArray,
  multiply as multiplyTransform,
  compose as composeTransform,
} from 'ol/transform.js'

/**
 * Monkey-patches the layer's renderer to apply a full affine transform
 * (including rotation/shear) per tile, instead of axis-aligned scaling.
 *
 * @param {import('ol/layer/WebGLTile').default} layer
 * @param {import('ol/transform').Transform} pixelToView  pixel→view CRS affine
 * @param {Array<[number,number]>} sourceTileSizes  per-zoom source tile sizes
 */
export function patchRendererWithAffine(layer, pixelToView, sourceTileSizes, overviewScales) {
  const origCreateRenderer = layer.createRenderer.bind(layer)

  layer.createRenderer = function () {
    const renderer = origCreateRenderer()
    const origRenderTile = renderer.renderTile.bind(renderer)

    const texToPixel = createTransform()
    const viewToClip = createTransform()
    const final_ = createTransform()
    const INF_EXTENT = [-1e15, -1e15, 1e15, 1e15]

    renderer.renderTile = function (
      tileTexture, tileTransform, frameState, renderExtent,
      tileResolution, tileSize, tileOrigin, tileExtent,
      depth, gutter, alpha
    ) {
      const [z, x, y] = tileTexture.tile.tileCoord
      const sts = sourceTileSizes[z]
      const srcW = Array.isArray(sts) ? sts[0] : sts
      const srcH = Array.isArray(sts) ? sts[1] : sts

      // M_texToPixel: texture [0,1]² → full-res pixel coords (via overview scale)
      const [scX, scY] = overviewScales[z]
      const effW = srcW * scX
      const effH = srcH * scY
      setTransform(texToPixel, effW, 0, 0, effH, x * effW, y * effH)

      // M_viewToClip: view CRS → clip space [-1,1]²
      // pixelToView already maps pixel-Y(down) → view-Y(up),
      // so no additional Y-flip needed (unlike standard tileTransform
      // which flips tile-grid-Y(down) → clip-Y(up)).
      const vs = frameState.viewState
      composeTransform(viewToClip,
        0, 0,
        2 / (frameState.size[0] * vs.resolution),
        2 / (frameState.size[1] * vs.resolution),
        -vs.rotation,
        -vs.center[0], -vs.center[1]
      )

      // M_final = viewToClip * pixelToView * texToPixel
      setFromArray(final_, viewToClip)
      multiplyTransform(final_, pixelToView)
      multiplyTransform(final_, texToPixel)

      origRenderTile(
        tileTexture, final_, frameState, INF_EXTENT,
        tileResolution, tileSize, tileOrigin, tileExtent,
        depth, gutter, alpha
      )
    }

    return renderer
  }
}
