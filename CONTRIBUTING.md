# Contributing

## Development Setup

```bash
git clone https://github.com/conaonda/ol-cog-layers.git
cd ol-cog-layers
npm install
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run tests |
| `npm run build` | Build ESM + CJS bundles |
| `npm run lint` | Lint source files |
| `npm run format` | Format source files with Prettier |
| `npm run examples` | Start examples dev server |

## Pull Request Guidelines

1. Fork the repo and create a feature branch from `master`.
2. Ensure `npm test` and `npm run lint` pass before submitting.
3. Keep PRs focused — one feature or fix per PR.
4. Add tests for new functionality when applicable.
