# PRD v2.0 implementation status

Initial implementation: September 2026. Working title: Moon Patrol: Void Runner.
The supplied PRD remains the product target; the table records this prototype's actual scope.

| PRD area            | Current implementation                                                                                                       | Remaining work                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebGPU architecture | Three.js WebGPURenderer, PBR materials, shadows, native WGSL terrain brush, React 19, TypeScript, Rapier, Framer Motion      | Bloom, chromatic aberration, volumetric fog/dust, screen-space shadows, quality tiers                                                                                                                   |
| Rover               | Six independent raycast wheels, fixed-step physics, cruise/brake/boost, jump, hover, limited pitch, clean-landing score      | Steering articulation, richer suspension rig, slope-based momentum reward, replay determinism                                                                                                           |
| Camera              | Side-on perspective, speed FOV change, landing/impact shake, responsive framing                                              | Perlin trauma and authored cinematic checkpoint camera                                                                                                                                                  |
| Weapons             | All six loadout options have distinct firing behavior; timed flak, piercing rail, four seekers, heat lockout, vent, rear EMP | Beam is dense energy projectiles rather than a continuous melting/slag simulation; rail is cadence-based rather than hold-to-charge; seismic pulse clears nearby ground targets without bridge fracture |
| Enemies             | Drone V waves/dives, bomber torpedoes, hunter lift, interceptor telegraphs, mines, skimmers, leech leap, mothership          | Advanced flocking, bomber weakpoint/shield, hull steering disable inside tractor beam, authored escalation and balance                                                                                  |
| Mutable terrain     | Native GPU brush/readback; matching CPU fallback; local streamed Rapier trimesh replacement                                  | Brush uses a smooth radial bowl, not a voxel SDF volume. No overhangs, terrain synthesis, collapsible plates, or destructible bridges. Readback/performance budget remains open                         |
| Particles           | Bounded 800-instance debris pool with simple CPU ballistic motion and ground bounce                                          | GPU simulation, 200,000-particle target, rover/debris collision                                                                                                                                         |
| HUD                 | Responsive telemetry, heat/capacitor gauges, hull, threats, A–Z route, checkpoint reports, score, pause/retry/victory        | Spatial off-screen reticles and spring-counted score cascades                                                                                                                                           |
| Biomes              | Five palettes/scenery sets, altered gravity, lower response on ice, lava and crystal/flora/citadel scenery                   | Geysers, ice-crystal lasers, acid interactions, fungal concealment, zero-G pockets, laser barriers, weather                                                                                             |
| Audio               | Procedural rhythmic soundtrack, engine, boosts, weapons, warnings, stereo panning                                            | PannerNode 3D spatialization, full reactive stems/mix, emergency priority arbitration                                                                                                                   |
| Customization       | Six weapon choices and fixed RV-06 chassis                                                                                   | Chassis/body customization and additional vehicle equipment                                                                                                                                             |

## Validation evidence

- TypeScript and Vite production build passed.
- Eight rule/terrain/physics regression tests passed, including shared WASM initialization across remounts.
- Headless Edge WebGPU browser checks passed with zero console errors: loadout selection, driving, six grounded wheel contacts, jump, capacitor use, firing, pause/resume, manual Escape handling, checkpoint/service, thermal lockout, boss destruction, completion, death/retry, and no horizontal overflow at 390 px.
- The browser scenario harness uses controlled positioning and invulnerability in the boss test. It verifies state/combat wiring, not difficulty or fair survival balance.
- GPU crater center changed from approximately 0.5372 to -3.4628; Rapier raycast returned -3.4628 after the update.
- WebGPU and WebGL 2 streaming checks passed: actual travel beyond 170 m, rendered transitions through all five biomes, and menu/restart with zero console errors. WebGL uses CPU crater carving and disables dynamic shadows.
- Screenshots and machine-readable results are generated into ignored `test-results/`.
- Initial 1080p headless stress capture: 180 sampled frames, 16.8 ms median, 100 ms p95, 33.44 ms mean, up to 120 active projectiles, 573 render calls. Projectile occupancy was not continuously above 50, so this is exploratory profiling rather than the PRD acceptance benchmark.
- Physical gamepad/haptics, real mobile hardware, long-session memory, and a full human A–Z run remain unverified.

## Acceptance checklist

- [ ] Stable 60 FPS at 1080p under the specified sustained heavy load on baseline hardware.
- [ ] Stable suspension across the entire authored/destructible route and all gravity transitions.
- [ ] Terrain carve and collider update within two frames. Current cold headless measurements are about 270–370 ms.
- [ ] Measured end-to-end input latency below 32 ms.
- [ ] Instrumented UI smoothness / zero layout shifts under stress.

## Recommended next implementation pass

1. Profile render batches and terrain readback on named target hardware. Batch decorative geometry and shadow casters; move collider work to a bounded worker/update pipeline where practical.
2. Add authored hazard pacing and telemetry for a complete human A–Z playthrough.
3. Implement collapsible plates and biome-specific interactive hazards.
4. Add GPU particles and post-processing only against measured frame/memory budgets.
5. Re-run the PRD acceptance suite and record hardware/browser versions and repeatable captures.
