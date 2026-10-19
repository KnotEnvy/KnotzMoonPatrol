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

Browser suites use installed Edge on Windows and Playwright Chromium elsewhere. `PLAYWRIGHT_CHANNEL` or `PLAYWRIGHT_EXECUTABLE_PATH` overrides the browser; `PLAYWRIGHT_HEADLESS=0` selects a foreground window. Set `GAME_URL` when development uses a different port. The production Pages test uses `PAGES_URL` separately and checks the actual built site without developer hooks. Full-route audits reject an unavailable requested backend instead of recording fallback as native WebGPU.

`npm run test:classic` runs controlled camera, aircraft, bomb/crater, interception, pressure, and portrait-label scenarios on WebGL 2. `BACKEND=webgl` limits graphics, weapon, patrol, and hazard suites to an available backend; their default still checks both backends and rejects an unexpected fallback.

`npm run test:ui` exercises title-menu keyboard navigation, selected-loadout launch, modal focus handoff, and crowded playing HUD layouts from 320×568 through 1920×1080. It uses the instrumented development or benchmark build.

Before proposing a world/detail change, inspect the game on desktop and a narrow viewport, exercise the affected biome/hazards, and record any measured performance changes. Update acceptance evidence only for checks actually performed.

For model work, use [the beta asset pipeline](docs/BETA-ASSET-PASS.md). `npm run assets:build` regenerates the three libraries with Blender; Python scripts are authoritative and generated `.blend` edits are overwritten. Keep source hashes and geometry guards passing. `npm run assets:studio` and `npm run assets:scenes` produce source-matched local inspection evidence. `BACKEND=webgl` also limits streaming and performance fixtures; the performance fixtures now use the full-window 1920×1080 canvas.
