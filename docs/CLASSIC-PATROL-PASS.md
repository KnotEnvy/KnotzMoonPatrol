# Classic patrol assets and gameplay — October 13, 2026

This pass strengthens the classic driving, jumping, shooting, and parallax identity while preserving the modern direction in [PRD v2.0](PRD.md). It is an implemented art/readability and scoring pass, not a claim of complete production acceptance or an exact arcade recreation.

The [Museum of the Game reference](https://www.arcade-museum.com/Videogame/moon-patrol) describes the original's speed control, simultaneous forward/upward fire, rocks and craters, aerial bombing, independently scrolling terrain, and checkpoint timing. Those are the fidelity anchors. The new clearance values below are Void Runner balance choices, not a reproduction of the original scoring table.

## Implemented

- All nine enemy/obstacle archetypes now have distinct procedural silhouettes: scout saucer, payload bomber, ringed tractor hunter, dart interceptor, fractured rock, spiked mine, tracked skimmer, segmented leech, and a broad mothership with a visible belly core.
- Bomber and mothership lights pulse during the final 0.6 seconds before payload release. The hunter beam brightens while applying lift and dims when boost escapes it. These cues follow simulation time and stop advancing while paused.
- RV-06 keeps its six animated wheels and turret, adding fenders, access panels, roll cage, rear housings, and six articulated suspension struts in one instance draw.
- Three ridge layers now scroll at different speeds. Repeated, batched 600-unit tiles have matching endpoint heights/colors and remain continuous through the full route and wrap boundaries.
- Crystalline scenery now forms clustered shards. The chasm has stalks, luminous fungal caps, and spores. Citadel pylons have linking beams and luminous power strips. Scenery stays outside the driving lane and belongs to its streamed chunk.
- Intentional obstacle-clearing jumps bank points on landing: rock 100, mine 150, skimmer 200, complete authored chasm 50. A clean landing retains its existing 250 points and momentum boost. Damage, recovery, and restarting cancel unbanked clearance points. Each obstacle counts once per jump.
- Opening prompts teach rock shooting/jumping, the first chasm, dual-axis fire, then energy controls in encounter order. The flight manual explains the new scoring, including on narrow screens.

## Element review

| Element             | This pass / preserved foundation                                                                   | Remaining beta acceptance work                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Rover and handling  | Six-wheel rig, visible struts, speed control, buffered jump, hover, pitch and landing rewards      | Human handling feedback across all gravity transitions; physical controllers                                                   |
| Combat assets       | Nine distinct silhouettes; payload and tractor cues; existing damage and collision rules retained  | Bomber shields/weakpoint behavior, richer formations, rear pursuit, boss phases                                                |
| Shooting            | Dual-axis input, Beam melting, Rail charging/penetration and interruption safety regression-tested | Full Seismic surface shockwave and loadout balance                                                                             |
| Rocks and craters   | Shoot-or-jump choice now affects score; complete gap clearance pays on landing                     | Full-run obstacle spacing, human reaction-time and recovery balance; dynamic blast craters do not grant the authored-gap bonus |
| Biome hazards       | Bridges, vents, emitters, fungal cover and gravity fields preserved and tested                     | Broader acid interactions and enemy camouflage                                                                                 |
| World art           | Layered parallax, clustered crystals, fungi, powered citadel structures                            | More bespoke landmarks, a more convincing Earth-like planet, less repetitive scenery, richer magma art                         |
| HUD and progression | A-Z route, threat labels, reports, field service, death/retry and completion preserved             | Full human A-Z run, UI frame pacing, clearer feedback under crowded encounters                                                 |
| Audio               | Existing procedural engine, weapons, warnings and rhythm preserved                                 | Listening/mix review, stronger reactive soundtrack, 3D spatial audio                                                           |
| Rendering/lifecycle | Static material batches; chunk ownership/disposal; one suspension instance batch                   | Sustained native-1080p 60 FPS, long-session/device testing                                                                     |

No external art downloads or new asset dependencies were introduced. Most enemies use at most three static mesh draws; the hunter adds its transparent beam for four. The ridge repetitions retain one draw per depth layer. Shadows and biome scenery still affect the complete scene budget.

## Verification

- 50 unit tests pass, including safe landing scoring, deduplication, partial-clearance rejection, cancellation, ridge wrap continuity, enemy draw bounds, and suspension instance disposal.
- `npm run test:patrol` passes in native WebGPU and forced WebGL 2. Real fixed-step jumps clear the opening rock and chasm with 100 hull; they bank 100 and 50 points respectively in addition to clean-landing bonuses. A damaged jump banks no clearance. Payload timing, tractor escape visuals, and mobile manual scrolling are exercised.
- Existing gameplay/boss/retry, both-backend weapon, all-biome graphics, and hazard scenarios pass with no console errors. Preset cycling retains stable resource counters.
- Desktop asset scenes, mothership, narrow-screen manual, and biome captures were visually inspected. These are controlled scenarios, not a complete human playthrough.
- Pages production build and formatting checks pass. The local Pages production smoke passes on WebGPU and WebGL 2, including project-path assets, input, charged fire, graphics controls, and absent developer hooks.

Reproduce with the dev server running: `npm test`, `npm run test:patrol`, `npm run test:browser`, `npm run test:weapons`, `npm run test:graphics`, and `npm run test:hazards`. Build/production: `npm run build:pages` followed by `npm run test:pages`.

Ignored evidence: `test-results/patrol.json`, `patrol-*-threats.png`, `patrol-*-boss.png`, `patrol-*-mobile*.png`, and `graphics-*-biome-*.jpg`.

## Performance capture

The isolated Balanced fixture retains 100 projectiles and 600 CPU debris for all 240 sampled frames after 90 warmup frames. Draw calls are 79 WebGPU and 53 WebGL 2, one more than the previously documented 78/52 fixture. This is consistent with the new suspension batch; it is not a simultaneous baseline timing comparison. Enemy-heavy and later-biome costs require separate profiling.

| Backend |  Median |     p95 | Maximum |     Mean |
| ------- | ------: | ------: | ------: | -------: |
| WebGPU  | 16.7 ms | 17.0 ms | 50.1 ms | 17.64 ms |
| WebGL 2 | 16.7 ms | 17.0 ms | 33.4 ms | 16.95 ms |

Reproduce: `node tests/performance.mjs classic-assets balanced`. Metadata and raw frames are in `test-results/performance-classic-assets.json`. Host: Intel Core i5-10300H, 32 GB RAM, Windows 10.0.19045, Edge 155.0.4283.45. The 1920x1080 viewport has a 1920x976 drawing buffer. An independently requested adapter reports NVIDIA/Turing. No build or other browser suite overlapped the measurement. Frame outliers and the lower canvas height prevent claiming the PRD's sustained native-1080p target.
