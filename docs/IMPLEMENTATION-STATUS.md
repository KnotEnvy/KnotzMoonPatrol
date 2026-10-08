# PRD v2.0 implementation status

Initial implementation: September 2026. Working title: Moon Patrol: Void Runner.
The [original PRD v2.0](PRD.md) is the authoritative product target; the table records this prototype's actual scope.
Full requirements validation must be checked against that document, including its acceptance criteria.

| PRD area            | Current implementation                                                                                                                                                       | Remaining work                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| WebGPU architecture | Three.js WebGPURenderer, PBR materials, shadows, static model/scenery batches, instanced projectiles, native WGSL terrain brush, React 19, TypeScript, Rapier, Framer Motion | Bloom, chromatic aberration, volumetric fog/dust, screen-space shadows, quality tiers                          |
| Rover               | Six independent raycast wheels, fixed-step physics, cruise/brake/boost, jump/hover/pitch with input grace/buffering, slope-matched clean-landing momentum rewards            | Steering articulation, richer suspension rig, replay determinism                                               |
| Camera              | Side-on perspective, speed FOV change, landing/impact shake, responsive framing                                                                                              | Perlin trauma and authored cinematic checkpoint camera                                                         |
| Weapons             | All six distinct loadouts, thermal lockout, vent, rear EMP, seismic fracture of nearby bridges                                                                               | Continuous beam melting/slag; hold-to-charge rail; full surface shockwave effects                              |
| Enemies             | Drone V waves/dives, bombers, hunter lift, interceptor telegraphs, mines, skimmers, leeches, mothership, distance-authored encounters                                        | Advanced flocking, bomber weakpoint/shield, tractor steering disable, human difficulty/balance validation      |
| Mutable terrain     | Native GPU brush/readback and CPU fallback, atomic multi-chunk mesh/collider commits, contact-triggered destructible bridge colliders                                        | Radial bowl rather than voxel SDF; no overhangs or terrain synthesis; readback/performance budget remains open |
| Particles           | Bounded 800-instance debris pool with CPU ballistic motion, ground bounce, and active-only instance uploads/draws                                                            | GPU simulation, 200,000-particle target, rover/debris collision                                                |
| HUD                 | Responsive telemetry, world-projected terrain/aircraft/strike scanner, A–Z route, checkpoint reports, score, pause/retry/victory                                             | Spring-counted score cascades; instrumented transition smoothness                                              |
| Biomes              | Five scenery/palette sets, altered gravity, ice response, crystal lasers, magma vents/bridges, concealed acid gaps, citadel lasers and low-gravity fields                    | Broader acid interactions, enemy camouflage, fully zero-G zones, weather, authored art/lighting depth          |
| Audio               | Procedural rhythmic soundtrack, engine, boosts, weapons, warnings, stereo panning                                                                                            | PannerNode 3D spatialization, full reactive stems/mix, emergency priority arbitration                          |
| Customization       | Six weapon choices and fixed RV-06 chassis                                                                                                                                   | Chassis/body customization and additional vehicle equipment                                                    |

## Validation evidence

- TypeScript and Vite production build passed.
- The current 27-test regression suite passes, including physics initialization, batching, jump assistance, encounter pacing, biome hazards, and atomic crater rollback/disposal.
- Headless Edge WebGPU browser checks passed with zero console errors: loadout selection, driving, six grounded wheel contacts, jump, capacitor use, firing, pause/resume, manual Escape handling, checkpoint/service, thermal lockout, boss destruction, completion, death/retry, and no horizontal overflow at 390 px.
- The browser scenario harness uses controlled positioning and invulnerability in the boss test. It verifies state/combat wiring, not difficulty or fair survival balance.
- GPU crater center changed from approximately 0.5372 to -3.4628; Rapier raycast returned -3.4628 after the update.
- WebGPU and WebGL 2 streaming checks passed: actual travel beyond 170 m, rendered transitions through all five biomes, and menu/restart with zero console errors. WebGL uses CPU crater carving and disables dynamic shadows.
- Screenshots and machine-readable results are generated into ignored `test-results/`.
- Initial 1080p headless stress capture: 180 sampled frames, 16.8 ms median, 100 ms p95, 33.44 ms mean, up to 120 active projectiles, 573 cumulative render calls (not per-frame draw calls; this counter was corrected in the September 16 pass). Projectile occupancy was not continuously above 50, so this is exploratory profiling rather than the PRD acceptance benchmark.
- Physical gamepad/haptics, real mobile hardware, long-session memory, and a full human A–Z run remain unverified.

## September 16 rendering pass

- Batched static rover and enemy components by material/shadow settings, plus rocks, markers, crystals, and citadel scenery per terrain chunk. Suspension pivots, turret, boost flame, and deformable terrain remain independent.
- Replaced up to 160 separate projectile meshes with two bounded instance batches. Kept individual combat/collision state and existing weapon behavior.
- Stopped uploading/drawing inactive debris and added explicit instance-resource disposal.
- Replaced the exploratory benchmark with a fixed 100-projectile / 600-debris workload, occupancy assertions, actual per-frame draw calls, raw frame intervals, canvas resolution, and machine/browser metadata.
- Named host: Core i5-10300H, GTX 1650 Ti / Intel UHD, Windows 10.0.19045, Edge 153.0.4234.32. See [performance measurements](PERFORMANCE.md) for methodology and capture variability.

| Controlled fixture | Baseline draw calls/frame | Batched draw calls/frame | Repeat median / p95 frame time |
| ------------------ | ------------------------: | -----------------------: | -----------------------------: |
| WebGPU             |                       360 |                       78 |                 16.7 / 66.9 ms |
| WebGL 2            |                       251 |                       52 |                 16.7 / 50.1 ms |

Validation: production build and all 11 unit tests pass. Gameplay smoke and streaming through all five biomes pass on the exercised backends with zero console errors. Stress fixture occupancy remains at 100 projectiles and 600 particles on both backends. Menu and stress screenshots were visually inspected. Initial browser attempts hit host/page-load/click timeouts; after dev-server restart and dependency optimization, the unmodified smoke/streaming suites passed.

This is a rendering-work reduction, not full PRD acceptance. The 1920 x 1080 browser viewport contains a 1920 x 976 canvas. The repeated frame-time tails still miss a stable 60 FPS budget. The fresh GPU carve/collider smoke measurement was 322.6 ms; the two-frame terrain target remains open. No full human A-Z or physical-device validation was added.

## October 7 gameplay pass

The interrupted gameplay pass is now implemented and validated. See [details and evidence](GAMEPLAY-PASS.md).

- 27 unit tests pass, including jump buffering/coyote time, encounter progression, contact-fused bridge removal, laser timing/destruction, vent lift, low-gravity boundaries, and atomic crater rollback/disposal.
- WebGPU and WebGL hazard scenarios pass with zero console errors. Gameplay/boss/retry and five-biome streaming suites also pass.
- HUD warnings were inspected on desktop and phone-sized browser viewports.
- Fresh native GPU measurements: 288.9 ms cold single-chunk brush; 86.6 ms subsequent two-chunk brush. Terrain seam/collider integrity passes, while the two-frame timing gate remains open.

## Repository and Pages handoff

Completed work is consolidated on `main`. The Pages mode builds for `/KnotzMoonPatrol/`; the production browser test validates assets, launch, controls, pause/resume, mobile width, and absent developer hooks. The pinned Actions workflow validates pull requests and deploys successful `main` builds.

See [deployment](DEPLOYMENT.md) and [world-detail handoff](WORLD-DETAIL-HANDOFF.md). Publishing/integration readiness does not close the product acceptance gates below.

## Acceptance checklist

- [ ] Stable 60 FPS at 1080p under the specified sustained heavy load on baseline hardware.
- [ ] Stable suspension across the entire authored/destructible route and all gravity transitions.
- [ ] Terrain carve and collider update within two frames. Current cold headless measurements are about 270–370 ms.
- [ ] Measured end-to-end input latency below 32 ms.
- [ ] Instrumented UI smoothness / zero layout shifts under stress.

## Recommended next implementation pass

1. Profile remaining frame-time spikes and terrain readback on named target hardware. Initial decorative geometry, shadow-caster, and projectile batching is complete; move collider work to a bounded worker/update pipeline where practical.
2. Run a complete human A–Z playthrough against the new authored encounters and hazards; tune difficulty and recovery pacing.
3. Deepen the remaining enemy, weapon, biome, lighting, and audio systems from the PRD.
4. Add GPU particles and post-processing only against measured frame/memory budgets.
5. Re-run the PRD acceptance suite and record hardware/browser versions and repeatable captures.
