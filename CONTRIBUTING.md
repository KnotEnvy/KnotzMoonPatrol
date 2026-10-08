# Contributing

Use Node 24 and `npm ci`. Keep changes focused and work on a branch from the current `main`.

```powershell
npm run dev
npm run format:check
npm test
npm run build:pages
npm run test:pages
```

For world work, read [the world-detail handoff](docs/WORLD-DETAIL-HANDOFF.md). For source requirements, use [PRD v2.0](docs/PRD.md); the status document records remaining work rather than redefining the target.

GitHub Actions validates pull requests and deploys successful `main` builds to Pages. Generated output, logs, caches and test evidence stay ignored. Preserve the supplied PRD's text; update implementation/handoff docs when behavior changes.

Browser gameplay tests use installed Edge on Windows. The production Pages test uses Chromium on Linux and checks the actual built site without developer hooks.

Before proposing a world/detail change, inspect the game on desktop and a narrow viewport, exercise the affected biome/hazards, and record any measured performance changes. Update acceptance evidence only for checks actually performed.
