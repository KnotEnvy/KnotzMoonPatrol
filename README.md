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

Browser checks require Microsoft Edge installed and the development server already running:

```powershell
npm run test:browser
npm run test:streaming
npm run test:hazards
npm run test:performance -- current
```

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

## What is playable

- Distance-authored A–Z route through five biome palettes and scenery sets; reports after E/J/O/T and a sector-Z mothership.
- Six-wheel Rapier raycast suspension, fixed 60 Hz physics, arcade speed control, jump/hover/pitch, clean-landing bonuses.
- Three forward and three anti-air loadouts; shared thermal lockout; capacitor management; rear EMP.
- Drone formations/dives, bombers, tractor hunters, interceptors, skimmers, mines, rocks, and leech threats.
- Streamed heightfield meshes with WGSL crater brushes and atomic mesh/collider replacement after readback.
- React/Framer Motion HUD, reports, route progress, loadout menu, pause, retry, victory, and persistent best score.
- Procedural Web Audio engine hum, rhythmic bass/percussion, boost arpeggios, weapon/impact cues, stereo panning.
- Static rover, enemy, and scenery geometry batches; two projectile instance batches and active-only debris draws.
- Locally bundled fonts and procedurally generated scenery; no external asset requests are required at runtime.
- Contact-triggered collapsing bridges, erupting magma vents, destructible laser emitters, concealed acid gaps, and low-gravity fields.
- World-projected hazard/aircraft/strike scanner, buffered jumps, and slope-matched momentum rewards.

See [the October gameplay pass](docs/GAMEPLAY-PASS.md) for behavior and evidence.

## Architecture

| File                                                               | Responsibility                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `src/game/engine.ts`                                               | Fixed-step loop, Rapier controller, combat, encounter lifecycle, progression |
| `src/game/terrain.ts`                                              | Bounded chunk streaming, triangle meshes, collider replacement               |
| `src/game/terrain-compute.ts`                                      | Native WGSL brush, shared WebGPU device, readback, CPU fallback              |
| `src/game/rules.ts`                                                | Pure energy/scoring/progression rules and biome definitions                  |
| `src/game/models.ts`                                               | Procedural rover, enemies, planet, mountains, surface textures               |
| `src/game/render-batches.ts`                                       | Static geometry batching and dynamic instance packing                        |
| `src/game/route.ts`, `src/game/hazards.ts`, `src/game/movement.ts` | Authored encounters, physical biome hazards, buffered jumps, landing rewards |
| `src/game/audio.ts`                                                | Procedural soundtrack and feedback                                           |
| `src/App.tsx`, `src/style.css`                                     | Interface, input hints, loadout dialogs, responsive HUD                      |

The rover's horizontal speed uses an impulse servo for arcade handling; the six suspension contacts use Rapier's vehicle controller. Physics stepping is fixed, but cross-platform deterministic replay is **not** claimed. Visual debris uses an 800-instance CPU-updated pool; it is **not** the PRD's 200,000-particle GPU system.

The developer server exposes `window.__voidRunner` only in development for the browser tests. That hook is compiled out of production builds. Scenario tests deliberately position the rover at checkpoints and the final arena to verify those transitions; they are not a substitute for a complete human playthrough.

## Readiness

This is a working prototype, **not full PRD acceptance**. See [implementation status](docs/IMPLEMENTATION-STATUS.md) for implemented, simplified, and outstanding requirements.

The cold GPU crater path was measured at roughly 270–370 ms during local headless tests; it does not meet the two-frame target. The repeatable render comparison is documented in [performance measurements](docs/PERFORMANCE.md); its fixed arena is not the full PRD acceptance workload. Do not treat this build as a verified 60 FPS release.

Reference APIs: [Three.js WebGPU renderer](https://threejs.org/manual/en/webgpurenderer), [Rapier raycast vehicle](https://rapier.rs/javascript3d/classes/DynamicRayCastVehicleController.html).
