# World-detail team handoff

The gameplay/rendering and October 10 graphics release are consolidated on `main`, with successful Pages deployment and hosted checks. See [the graphics pass](GRAPHICS-PASS.md) and subsequent [terrain latency pass](TERRAIN-PASS.md). Start with [the original PRD](PRD.md), then [current implementation status](IMPLEMENTATION-STATUS.md). Continue visual/world detail while preserving playable systems and measuring graphics costs.

## Start here

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Choose a loadout and Begin Expedition.

```powershell
npm test
npm run build:pages
npm run test:pages
```

See [deployment](DEPLOYMENT.md) for Pages and [performance](PERFORMANCE.md) for the existing render fixture. Development gameplay/streaming/hazard tests require the dev server running:

```powershell
npm run test:browser
npm run test:streaming
npm run test:hazards
npm run test:graphics
npm run test:weapons
npm run test:terrain -- world-detail
npm run test:performance -- world-detail
```

## Coordinate and biome map

X moves forward along the run, Y is up, Z is scene depth. The rover is constrained to Z=0. Each letter sector spans 220 world units; the finish is x=5720.

| Biome                | Sectors | X range   | World-detail priorities                                                           |
| -------------------- | ------- | --------- | --------------------------------------------------------------------------------- |
| Mare Tranquillitatis | A–E     | 0–1100    | Basalt strata, believable crater rims, earthrise, lunar landmarks and dust        |
| Crystalline Spires   | F–J     | 1100–2200 | Prism silhouettes, iridescent surfaces, readable crystal emitters                 |
| Magma Fissures       | K–O     | 2200–3300 | Obsidian cliffs, molten depth, vent detail, visible plate stress/fracture         |
| Bioluminescent Chasm | P–T     | 3300–4400 | Glowing vegetation/spores, fungal shapes, acid depth, stronger headlight contrast |
| Orbital Citadel      | U–Z     | 4400–5720 | Alloy track detail, megastructures, field generators, barrier/sentry silhouettes  |

The five surface sets and shared lighting/headlights now distinguish the biomes. Background, rover, enemy, and flora/structure geometry remain provisional procedural art. There is no external world-asset library to preserve.

## Editing entry points

| File/function                                      | Responsibility                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/game/rules.ts` / `BIOMES`                     | Palette, labels, gravity; `baseHeight` defines the playable ground                   |
| `src/game/models.ts` / `makeBackdrop`, `makeRidge` | Planet, skyline, and ridge geometry                                                  |
| `src/game/surfaces.ts` / `biomeSurface`            | Five cached CPU image sets and terrain-owned GPU surface maps                        |
| `src/game/lighting.ts` / `BiomeLighting`           | Shared blended lighting, headlight, and distance fog                                 |
| `src/game/graphics.ts`, `src/game/quality.ts`      | Preset budgets and optional HDR bloom/lens graph                                     |
| `src/game/terrain.ts` / `add`                      | Streamed surface, chunk-owned scenery, material retention, terrain colliders         |
| `src/game/hazards.ts` / `add`                      | Visuals for plates, vents, crystal/laser emitters, fungal covers, low-gravity fields |
| `src/game/route.ts`                                | Authored encounters and hazard positions; gap layout contract                        |
| `src/game/models.ts` / `makeRover`, `makeEnemy`    | Vehicle and threat art, with animated pivots retained                                |
| `src/game/engine.ts` / `render`                    | Lighting, camera, backdrop follow, warning projection, visual-effect updates         |
| `src/game/render-batches.ts`                       | Static owned-geometry batching and bounded dynamic instance packing                  |
| `src/App.tsx`, `src/style.css`                     | HUD/menus, protected play area and readable threat markers                           |

## Working boundaries

Decorative terrain currently streams about 90 units behind and 200 ahead. Add scenery to the owning chunk group so it unloads with that chunk; keep world positions in the same coordinate space. Keep the driving lane and warnings clear.

The playable surface and its Rapier collider must change together. Do not replace `baseHeight` purely for appearance without updating the authored gap/hazard layout and physics tests. Bridge support, crater brushes, and gameplay probes depend on that contract.

Keep the mutable surface separate from decorative batches. Keep wheel/suspension, turret, boost-flame, and hazard-effect groups independent when they animate.

`batchStaticMeshes` disposes source geometries and requires exclusive ownership. Imported GLTF geometry/materials may be shared: clone owned geometry before batching, or use instances. Retain shared materials/textures until their final owner is disposed; unloading one chunk must not invalidate another chunk's resources.

Prefer shared materials and instanced repeated props. Avoid adding one material/light/shadow caster per small decorative item. Measure changes against the existing stress fixture rather than assuming a sparse menu scene represents combat.

Compare Balanced first, then opt into Cinematic. Keep effects outside the HTML HUD. Preserve disposal of all surface maps and optional render targets. Keep the chasm vehicle/edges readable when adjusting night lighting.

## Asset paths and review

Bundled assets can live under `src` and be imported so Vite hashes and rewrites them. Larger public assets can live under `public/worlds/<biome>/` and load from:

```ts
const url = import.meta.env.BASE_URL + 'worlds/magma/landmark.glb';
```

Use albedo/emissive color textures as sRGB; keep normal/roughness/metalness data textures linear. Include asset credits with the asset documentation.

Verify all five biomes, warning silhouettes, desktop/mobile readability, WebGL fallback, and the Pages production build. Preserve clean console output and unload/disposal behavior. The current browser harnesses use controlled positioning for later-sector scenarios and do not substitute for a complete human run.

## Readiness boundary

Deployment readiness is separate from full PRD acceptance. Current open gates include sustained 60 FPS, broader two-frame crater presentation checks, measured input latency, full-run balance, and real mobile/gamepad validation. The [continuous Beam/charged Railgun](WEAPONS-PASS.md) is implemented with bounded visual effects. GPU particles, weather/screen-space effects, remaining enemy depth/surface shockwaves, and 3D spatial audio remain unfinished.

Keep those items explicit in `IMPLEMENTATION-STATUS.md`. World-detail work should improve the experience without turning unfinished targets into readiness claims.
