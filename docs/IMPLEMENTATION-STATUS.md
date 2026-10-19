# PRD v2.0 implementation status

Initial implementation: September 2026. Working title: Moon Patrol: Void Runner.
The [original PRD v2.0](PRD.md) is the authoritative product target; the table records this prototype's actual scope.
Full requirements validation must be checked against that document, including its acceptance criteria. The October 17 player-feedback request supersedes its speed-zoom requirement: gameplay framing now stays steady at all driving speeds. The supplied PRD is preserved unchanged.

| PRD area            | Current implementation                                                                                                                                                                        | Remaining work                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| WebGPU architecture | Three.js WebGPURenderer, PBR surfaces/lighting, manual quality presets, optional HDR bloom/lens effects, batching, native WGSL brush, React 19, TypeScript, Rapier, Framer Motion             | Volumetric fog/dust, screen-space shadows, measured frame/memory budgets                                  |
| Rover               | Six independent raycast wheels, fixed-step physics, cruise/brake/boost, jump/hover/pitch with input grace/buffering, slope-matched clean-landing momentum rewards                             | Steering articulation, richer suspension rig, replay determinism                                          |
| Camera              | Side-on view, fixed 48-degree driving FOV and lead at every speed, landing/impact shake, responsive framing                                                                                   | Perlin trauma and authored cinematic checkpoint camera                                                    |
| Weapons             | Six loadouts, continuous Beam with rock melting/visual slag, charged hitscan Railgun penetration, thermal lockout, vent, rear EMP, seismic bridge fracture                                    | Full surface shockwaves; broader weapon/enemy balance and physical-input validation                       |
| Enemies             | Bounded aircraft arrivals/patrols/departures, warned forward crater bombs with interception, hunter lift, interceptor telegraphs, ground threats, mothership, distance-authored encounters    | Advanced flocking, bomber weakpoint/shield, tractor steering disable, human difficulty/balance validation |
| Mutable terrain     | Bounded small-mesh CPU brush, retained WGSL/readback for larger jobs, atomic multi-chunk mesh/collider commits, contact-triggered destructible bridge colliders                               | Radial bowl rather than voxel SDF; no overhangs, synthesis, resident GPU heightmap, or physics worker     |
| Particles           | Bounded 800-instance debris pool with CPU ballistic motion, ground bounce, and active-only instance uploads/draws                                                                             | GPU simulation, 200,000-particle target, rover/debris collision                                           |
| HUD                 | Full-window game title/menu, compact edge instruments and A–Z route, terrain/strike/bomb scanner, reports, score, pause/retry/victory                                                         | Spring-counted score cascades; instrumented transition smoothness                                         |
| Biomes              | Five PBR surface/palette sets and blended lighting/headlights, altered gravity, ice response, crystal lasers, magma vents/bridges, concealed acid gaps, citadel lasers and low-gravity fields | Broader acid interactions, enemy camouflage, fully zero-G zones, weather, authored art/lighting depth     |
| Audio               | Procedural rhythmic soundtrack, engine, boosts, weapons, warnings, stereo panning                                                                                                             | PannerNode 3D spatialization, full reactive stems/mix, emergency priority arbitration                     |
| Customization       | Six weapon choices and fixed RV-06 chassis                                                                                                                                                    | Chassis/body customization and additional vehicle equipment                                               |

## Validation evidence

- TypeScript and Vite production build passed.
- The current 65-test regression suite includes physics initialization, batching, jump assistance, route-pilot input edges, encounter pacing, aerial lifetimes across driving speeds, ballistic bomb planning, biome hazards, atomic crater rollback/disposal, heightfield/triangle collider equivalence, small-brush routing, overlapping explosions, rail charge/cancellation, ray occlusion, and bounded weapon effects. See the continuation reports for validation conditions.
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

## October 10 graphics continuation

See [graphics changes and evidence](GRAPHICS-PASS.md). Three presets, optional WebGPU HDR bloom/lens effects, five owned surface sets, blended biome lighting/headlights, 65-degree boost framing, and an accurate FPS counter are implemented.

31 unit tests pass. Native WebGPU/forced WebGL graphics and hazard scenarios pass, as do the gameplay/boss/retry and Pages production suites. The graphics suite covers high-density pixel caps, resource counters across repeated preset switches, all five surfaces, boost framing/lens input, mobile settings, preference persistence, and checkpoint/end-dialog handling. Screenshots were inspected. The Pages suite now exercises presets before its normal production input checks.

The controlled heavy fixture retains 100 projectiles and 600 debris. Balanced preserves the previous draw counts (78 native / 52 fallback), Performance uses 52 native draws, and Cinematic uses 90 native draws. Frame-time tails still miss the stable-60-FPS gate; [measurements](PERFORMANCE.md) retain the full per-preset results. Native canvas size in this fixture is 1920 x 976, below the PRD's 1080p acceptance resolution.

A fresh cold GPU carve measured 380.5 ms; a subsequent two-chunk carve measured 13.5 ms with matching seam/collider probes. The cold path and combat-load two-frame guarantee remain open. Volumetric weather/dust, screen-space shadows, GPU particles, richer authored art, and the remaining weapon/enemy/audio/customization work are still unfinished. No full human A-Z run or physical-device validation was added.

This continuation was merged in [PR #1](https://github.com/KnotEnvy/KnotzMoonPatrol/pull/1), commit `2f474c8`; [deployment and hosted checks passed](https://github.com/KnotEnvy/KnotzMoonPatrol/actions/runs/38104022586).

## October 10 terrain latency continuation

See [terrain changes and evidence](TERRAIN-PASS.md). Current 585-vertex chunks use the analytic CPU brush up to a bounded 2,048-vertex cutoff, avoiding GPU queue/readback latency. WGSL remains available for larger jobs and is tested explicitly against the CPU result. Unchanged brushes skip collider replacement and geometry uploads; ordered overlapping edits, atomic staging/rollback, and partial GPU allocation cleanup have regression coverage.

The native 1920×1080 combat fixture maintains 100 projectiles and 600 CPU debris. Across 48 single/seam edits, WebGPU cold/p95/maximum commit times are 4.1 / 4.9 / 5.4 ms; fallback times are 10.6 / 9.9 / 11.2 ms. All mesh/raycast probes agree. A three-edit burst takes 6.3 ms native / 12.3 ms fallback. CPU/WGSL error stays below 0.000001 world units.

This capture meets the small-brush commit budget on the measured host. WebGL frame-time tails still miss 60 FPS, and the native maximum sampled frame is 33.3 ms. Presentation deadlines, target-hardware equivalence, complete route suspension, input latency, UI shifts, and human difficulty remain unverified. No full product acceptance is claimed.

## Repository and Pages handoff

See [the weapon continuation](WEAPONS-PASS.md) for the continuous Beam, charged Railgun, controls, bounded effects, and regression/performance methodology. Weapon charge is cancelled safely on interruption; the production browser check now selects this loadout and exercises visible charge/release.

The final local source passes 43 unit tests with the recorded startup allowance, both-backend weapon and production scenarios, gameplay/boss/retry, hazards, and all-biome graphics. Frame-time captures retain variability rather than claiming 60 FPS; active effects add two draws at full slag capacity. CI uses the repository's unchanged test defaults.

Gameplay, graphics, and terrain continuations are merged on `main`, with successful Pages deployment and hosted checks. Merged feature branches were removed. The Pages mode builds for `/KnotzMoonPatrol/`; the production browser test validates assets, presets, launch, controls, charged weapons, pause/resume, mobile width, and absent developer hooks. The pinned Actions workflow validates pull requests and deploys successful `main` builds.

See [deployment](DEPLOYMENT.md) and [world-detail handoff](WORLD-DETAIL-HANDOFF.md). Publishing/integration readiness does not close the product acceptance gates below.

## October 13 classic patrol continuation

See [the asset/gameplay review](CLASSIC-PATROL-PASS.md) for all nine threat silhouettes, rover suspension detail, independent ridge parallax, biome props, safe-landing clearance rewards, and encounter-ordered onboarding. The review records remaining work for each major game element rather than treating this pass as full production acceptance.

50 unit tests and native/fallback patrol, weapon, graphics, and hazard scenarios pass; gameplay/boss/retry also passes. The Balanced stress capture keeps 100 projectiles and 600 debris, with 79/53 draws and 17.0 ms p95 on both backends. Maximum frames remain 50.1/33.4 ms and the canvas is 1920x976. Human A-Z balance, listening, physical-device testing, and the acceptance targets below remain open.

The local Pages production build/smoke and streaming checks pass on both backends with zero console errors. This continuation is local on `codex/classic-assets-gameplay`; it has not been published to the hosted game.

## October 13 beta balance and frame pacing

The [beta continuation](BETA-BALANCE-PERFORMANCE.md) adds full-route audits, checkpoint recovery with score rollback, rover-velocity inheritance for projectiles, a prepared finite terrain/hazard cache, reusable enemy actors, combat pipeline warmup, an immediate launch HUD, and four component batches for the six animated wheels.

53 unit tests pass. Gameplay/boss/retry, both-backend weapons, hazards, all-biome graphics, and checkpoint-recovery checks pass with zero console errors. The automated production audit completes A-Z with all three representative loadout pairs on both backends; Beam/Rail uses one ordinary checkpoint recovery. This remains distinct from human difficulty acceptance.

The final native-1080p heavy fixture holds 100 projectiles, 600 debris particles, active energy effects, and 16 slag pools for 600 sampled frames. Both backends record 16.7 ms median, 16.9 ms p95, 17.0 ms p99, and 17.1 ms maximum. Wheel batching reduces its draws from 81 to 51 native and 55 to 35 fallback. See the continuation report for full-route measurements, cache memory tradeoffs, capture isolation, and remaining limitations. The separate benchmark build retains instrumentation; publishable builds strip it.

The final normal-speed A-Z capture still fails the frame-pacing gate: native/fallback p95 is 33.6/50.0 ms, with maxima of 300.1/1,050.3 ms. Both runs complete with 37 hull and stable resource counters, but this is not consistently smooth 60 FPS. Publishing remains on hold. The local Pages production build/smoke pass; nothing was deployed.

## October 17 terrain collider and feedback continuation

The [beta report](BETA-BALANCE-PERFORMANCE.md#october-17-continuation-cheaper-terrain-colliders-and-readable-feedback) records grid-matched Rapier heightfields for streamed terrain and atomic crater replacement. A local CPU fixture measures approximately 35 times lower median collider construction/removal cost. This is separate from the sustained frame-rate gate.

55 unit tests and the WebGL gameplay smoke pass. All three representative production WebGL loadouts complete A-Z before and after the change, retaining the same final hull and recovery counts. Native WebGPU revalidation and sustained rendered-frame captures remain outstanding. Animated HUD feedback now stays centered and readable at 390 and 320 px, with bounds checked against captions and touch controls. Browser suites support Chromium, configurable server ports, and foreground captures; full-route results reject mislabeled backend fallback. See the beta report for host metadata, raw evidence, and remaining limits.

## October 17 steady camera and aerial combat

The [player-feedback continuation](STEADY-CAMERA-COMBAT.md) removes speed-dependent zoom, lead changes, follow lag, and boost lens distortion. Aircraft now arrive, maneuver with the rover, warn and bomb the road ahead, and leave after bounded encounters. Bombs can be intercepted; missed payloads create matching visual/physical craters. Pressure caps, target spacing, threat priority, and HUD spacing keep sustained fights readable.

65 unit tests, the new camera/combat integration, WebGL graphics/weapon/patrol/hazard scenarios, actual-input gameplay smoke, and local Pages production checks pass. All three representative loadouts have completed A-Z with ordinary controls. Three independent AI critics score every scoped category at least 8.5 for local human playtesting. These reviews do not establish human enjoyment, native WebGPU performance, or release acceptance. The continuation remains local; nothing has been merged or deployed.

Final benchmark/Pages builds, formatting, and the local Pages production smoke pass. Automatic and forced-fallback production scenarios both use WebGL 2 on this host and report zero browser errors. Nothing was deployed.

## Acceptance checklist

- [ ] Stable 60 FPS at 1080p under the specified sustained heavy load on baseline hardware.
- [ ] Stable suspension across the entire authored/destructible route and all gravity transitions.
- [ ] Terrain carve and collider update within two frames across representative targets and route scenarios. The small-brush 1080p combat fixture passes a 33.3 ms commit budget (native maximum 5.4 ms; fallback 11.2 ms); broader presentation/large-job guarantees remain open.
- [ ] Measured end-to-end input latency below 32 ms.
- [ ] Instrumented UI smoothness / zero layout shifts under stress.

## Recommended next implementation pass

1. Validate full-route frame tails and repeatability on named target hardware using the production benchmark. Initial batching, small-brush readback avoidance, asset preparation, wheel instancing, and grid-matched heightfield colliders are complete; correlate the remaining renderer work with CPU/GPU profiles and fresh versus sustained runs.
2. Run a complete human A–Z playthrough across loadouts, including checkpoint recovery; tune difficulty against player feedback as well as the automated driver.
3. Deepen the remaining enemy, weapon, biome, lighting, and audio systems from the PRD.
4. Add GPU particles and post-processing only against measured frame/memory budgets.
5. Re-run the PRD acceptance suite and record hardware/browser versions and repeatable captures.

## October 17 title and HUD continuation

The [title/HUD report](TITLE-HUD-PASS.md) records the Outer Wilds, Resogun, and Returnal references and the implemented scene-backed title, keyboard menu, full-window playfield, compact instruments, direct command panels, and responsive warning hierarchy. Generic aircraft cards were removed to expose enemy silhouettes; actionable ground/bomb/strike cues remain.

The new seven-viewport UI fixture checks menu input and selected-loadout launch, modal focus handoff, critical health, touch targets, panel/radar separation, and populated aircraft bounds against overlays. Final UI critic scores range from 8.6 to 9.2 across all six criteria; these are AI reviews for local playtest readiness, with human comfort, native WebGPU, and performance acceptance still open. See the report for final regression evidence and limitations. Nothing in this continuation has been merged or deployed.

## October 17 Blender asset continuation

The [asset pass report](BETA-ASSET-PASS.md) records 30 Blender-authored assets: the rover, nine enemies and twenty biome props. Dimension-limited bevels, weighted normals, baked vertex occlusion, shared material tables and deterministic exports add model detail while preserving animation and collision contracts. Hazard supports, terrain cut faces and dark-biome lighting also receive detail/readability fixes. Python generators are authoritative; rebuilding overwrites the editable Blender galleries and runtime exports.

Three rounds of three Claude Opus 5.5 high-effort critics are complete. Final overall art assessments are 6.1–6.5/10, with all three finding no concrete blocker for local playtesting in the reviewed art. The 8.5/AAA target remains unmet. UV texture baking and stronger material variation are the next substantial art steps. Human readability in motion and physical-device testing remain open.

Final native testing caught and fixed a WebGPU-only RGB vertex-buffer alignment failure by padding the runtime color attributes to opaque RGBA. All 97 unit tests and the Pages build pass afterward, along with native WebGPU graphics/weapons/hazards/streaming and production scenarios on both WebGPU and forced WebGL 2. Authored JSON did not change after the final art review; the report distinguishes the reviewed source from the subsequent runtime correction.

The controlled native 1920×1080 Balanced fixture on Windows Edge 155 with an NVIDIA Blackwell adapter maintains 100 projectiles, 600 debris and active energy effects for 600 sampled frames. Median/p95/maximum frame times are 16.7/16.8/16.9 ms, with 60 draws, 983 stable geometries and zero browser errors. This result does not close the full-route or baseline-hardware acceptance gates above. The local production build is ready for hands-on review at `http://127.0.0.1:4188/KnotzMoonPatrol/`; nothing was merged or deployed.

## October 18 merge integration

PR #4's performance work remains part of the current source: static scenery is batched across 256 m regions, original terrain colliders are prepared once and reused, and `npm run test:frame-floor` enforces a strict 25 ms maximum across a normal-speed native-1080p A–Z route. Its latest recorded full-route run failed that gate on both backends; shared-host timing was reported as confounded, so named target hardware still needs a clean run. The October 17 continuation keeps those performance paths while using authored biome props and heightfield colliders. The earlier native 1080p stress fixture is a separate controlled result and cannot waive the full-route gate.
