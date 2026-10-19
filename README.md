# Moon Patrol: Void Runner

Playable 2.5D lunar vehicle-action prototype built from the [original PRD v2.0](docs/PRD.md).

[GitHub Pages](https://knotenvy.github.io/KnotzMoonPatrol/) · [World-detail handoff](docs/WORLD-DETAIL-HANDOFF.md) · [Deployment guide](docs/DEPLOYMENT.md) · [Contributing](CONTRIBUTING.md)

## Run locally

Use Node.js 24 (see `.nvmrc`) and a current WebGPU-capable browser. The development server binds only to localhost.

```powershell
npm ci
npm run dev
```

Open **http://127.0.0.1:5173** and choose **Begin Expedition**. Audio starts on that interaction.
A WebGL 2 renderer and CPU terrain brush are available when WebGPU is unavailable.
Use `http://127.0.0.1:5173/?renderer=webgl` to exercise that fallback explicitly.

```powershell
npm test
npm run build
npm run preview
```

Browser checks use Microsoft Edge on Windows and Playwright Chromium elsewhere, with the development server already running. Install Chromium with `npx playwright install --with-deps chromium` when needed. `GAME_URL` selects a different server/port; `PLAYWRIGHT_CHANNEL` or `PLAYWRIGHT_EXECUTABLE_PATH` selects a browser. Set `PLAYWRIGHT_HEADLESS=0` for foreground captures.

```powershell
npm run test:browser
npm run test:streaming
npm run test:hazards
npm run test:graphics
npm run test:weapons
npm run test:classic
npm run test:ui
npm run test:terrain -- current
npm run test:performance -- current
```

`npm run test:colliders -- current` compares terrain collider construction on the CPU using Node 24. It records timings in `test-results/`; it does not measure game frame rate.

## GitHub Pages

`main` is the integration/deployment branch. Pull requests run validation; successful pushes to `main` deploy the built game through GitHub Actions.

```powershell
npm run format:check
npm test
npm run build:pages
npm run test:pages
```

The Pages build uses `/KnotzMoonPatrol/` while ordinary development stays at `/`. The production smoke test starts/stops its own preview server, checks the real project subpath, and verifies that developer controls are absent. See [deployment details](docs/DEPLOYMENT.md).

## Controls

| Control           | Action                                     |
| ----------------- | ------------------------------------------ |
| A / Left          | Brake to 40% cruise; pitch down in the air |
| D / Right / Shift | Boost; D/Right also pitch up in the air    |
| Space / W / Up    | Jump; hold for capacitor-powered hover     |
| J / Z             | Fire forward and anti-air weapons together |
| K / X             | Vent heat; short-range contact damage      |
| R                 | Rear EMP; costs 20 capacitor               |
| Esc / P           | Pause / resume                             |
| M                 | Mute / unmute                              |
| Enter             | Start or retry from the relevant screen    |

Touch controls appear on narrow/coarse-pointer screens.
Standard gamepad: left stick speed/pitch, A jump, X fire, B vent, bumpers brake/boost, Start pause.
Gamepad mappings and vibration need physical-device validation.

Resonance Beam stays active while Fire is held. Tachyon Railgun charges on hold and fires on release; build at least a quarter charge. Venting or pausing cancels charge. The HUD shows charge and readiness. See [weapon behavior and validation](docs/WEAPONS-PASS.md).

## Graphics

Choose Graphics on the title screen, or use the sliders control during play, to select Performance, Balanced, or Cinematic. Balanced is the default. All presets keep biome surface detail and rover headlights; Cinematic adds WebGPU bloom and impact lens effects. Driving uses a steady 48-degree field of view at every speed. The choice is saved locally. Settings pause active play.

For repeatable comparisons, use `?quality=performance`, `?quality=balanced`, or `?quality=cinematic`. WebGL uses the resolution presets with surface/lighting detail; dynamic shadows and cinematic effects require WebGPU.

```powershell
npm run test:performance -- my-capture balanced
```

See [the graphics pass](docs/GRAPHICS-PASS.md) and [measurements](docs/PERFORMANCE.md) for capabilities and open acceptance work.

## What is playable

- Distance-authored A–Z route through five biome palettes and scenery sets; reports after E/J/O/T and a sector-Z mothership.
- Six-wheel Rapier raycast suspension, fixed 60 Hz physics, arcade speed control, jump/hover/pitch, clean-landing bonuses.
- Three forward and three anti-air loadouts; shared thermal lockout; capacitor management; rear EMP.
- Sustained saucer/bomber patrols, tractor hunters, interceptors, skimmers, mines, rocks, and leech threats. Aircraft arrive, maneuver around the rover, and depart after a bounded encounter.
- Warned, shootable bombs target the road ahead and carve matching visual/physical craters. Brake, boost, fire, or jump to respond.
- Streamed heightfields with bounded CPU crater brushes, retained WGSL for larger jobs, and atomic mesh/collider replacement.
- React/Framer Motion HUD, reports, route progress, loadout menu, pause, retry, victory, and persistent best score.
- Procedural Web Audio engine hum, rhythmic bass/percussion, boost arpeggios, weapon/impact cues, stereo panning.
- Static rover, enemy, and scenery geometry batches; two projectile instance batches and active-only debris draws.
- Five distinct PBR surface sets, blended biome lighting, rover headlights, and optional cinematic bloom/lens effects.
- Locally bundled fonts and procedurally generated scenery; no external asset requests are required at runtime.
- Contact-triggered collapsing bridges, erupting magma vents, destructible laser emitters, concealed acid gaps, and low-gravity fields.
- World-projected terrain/strike/bomb scanner, buffered jumps, and slope-matched momentum rewards.

See [the October gameplay pass](docs/GAMEPLAY-PASS.md) for behavior and evidence.
The [title and HUD continuation](docs/TITLE-HUD-PASS.md) records the game-interface references, responsive layouts, keyboard navigation, and local review evidence.
The [beta asset continuation](docs/BETA-ASSET-PASS.md) documents the Blender model libraries, reproducible rebuild command, geometry budgets and three-round critique evidence. Run `npm run assets:build` to regenerate assets with Blender; the Python generators are authoritative and overwrite the editable gallery files.
The [steady camera and aerial combat continuation](docs/STEADY-CAMERA-COMBAT.md) records the latest player-feedback changes, critic rounds, and local playtest steps.

## Architecture

| File                                                               | Responsibility                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `src/game/engine.ts`                                               | Fixed-step loop, Rapier controller, combat, encounter lifecycle, progression        |
| `src/game/aerial.ts`                                               | Aircraft choreography, bounded encounter pressure, ballistic bomb targeting         |
| `src/game/terrain.ts`, `src/game/terrain-collider.ts`              | Bounded chunk streaming, visual triangle meshes, grid-matched heightfield colliders |
| `src/game/terrain-compute.ts`                                      | Bounded small-mesh CPU brush; shared-device WGSL/readback for larger jobs           |
| `src/game/rules.ts`                                                | Pure energy/scoring/progression rules and biome definitions                         |
| `src/game/models.ts`                                               | Procedural rover, enemies, planet, mountains, surface textures                      |
| `src/game/render-batches.ts`                                       | Static geometry batching and dynamic instance packing                               |
| `src/game/graphics.ts`, `src/game/quality.ts`                      | Graphics presets, optional HDR graph, and effect resource ownership                 |
| `src/game/surfaces.ts`, `src/game/lighting.ts`                     | Biome surface maps and shared biome/headlight rig                                   |
| `src/game/route.ts`, `src/game/hazards.ts`, `src/game/movement.ts` | Authored encounters, physical biome hazards, buffered jumps, landing rewards        |
| `src/game/audio.ts`                                                | Procedural soundtrack and feedback                                                  |
| `src/game/weapons.ts`, `src/game/weapon-effects.ts`                | Charge timing, ray/terrain tests, bounded energy and slag effects                   |
| `src/App.tsx`, `src/style.css`                                     | Interface, input hints, loadout dialogs, responsive HUD                             |

The rover's horizontal speed uses an impulse servo for arcade handling; the six suspension contacts use Rapier's vehicle controller. Physics stepping is fixed, but cross-platform deterministic replay is **not** claimed. Visual debris uses an 800-instance CPU-updated pool; it is **not** the PRD's 200,000-particle GPU system.

The developer server and separate local benchmark build expose `window.__voidRunner` for browser tests. Ordinary production and Pages builds strip that hook. Scenario tests deliberately position the rover at checkpoints and the final arena to verify those transitions; they are not a substitute for a complete human playthrough.

## Readiness

This is a working prototype, **not full PRD acceptance**. See [implementation status](docs/IMPLEMENTATION-STATUS.md) for implemented, simplified, and outstanding requirements.

The [terrain latency pass](docs/TERRAIN-PASS.md) removes GPU readback from current small-mesh edits. A native 1080p combat fixture measured a 5.4 ms maximum native commit and 11.2 ms fallback commit, with matching colliders. The broader two-frame presentation guarantee remains open. [Performance measurements](docs/PERFORMANCE.md) retain frame-time tails and fixture limitations; this is not a verified stable-60-FPS release.

Reference APIs: [Three.js WebGPU renderer](https://threejs.org/manual/en/webgpurenderer), [Rapier raycast vehicle](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html).
