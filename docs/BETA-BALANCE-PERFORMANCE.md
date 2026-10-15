# Beta balance and frame pacing — October 15, 2026

Target: arcade challenge with forgiving recovery. The original PRD remains authoritative.

## Merge decision and test closeout — October 15

The user authorized merging this pass to `main` after reporting that YouTube was running on NitroBliss during the timing tests and that NitroBliss has a substantially slower CPU than Superbeast. Treat the captures below as shared-host observations, not isolated measurements of a game regression or performance on Superbeast. Preserve the raw failures; the 40 FPS target has not been independently verified on Superbeast or in a clean target-hardware run.

This authorization supersedes the earlier publishing hold. Merging to this repository's `main` branch invokes its existing Pages validation/deployment workflow. Functional/build checks passed; the performance check remains available for a later controlled run. Project preview servers and test browsers were closed for handoff. Unrelated browser sessions were left alone. Generated diagnostics remain ignored local artifacts, while the reusable test suites remain in the repository.

## October 15: strict 40 FPS floor

The user requires high graphics quality throughout A-Z with a minimum of 40 FPS. The new `npm run test:frame-floor` command exercises the production benchmark at native 1920x1080, Balanced (textured surfaces and native dynamic shadows), normal simulation speed, with audio and all authored encounters. It fails if either route does not complete or **any sampled frame exceeds 25 ms**. Median/p95 results cannot override this gate. Run `build:benchmark` and `preview:benchmark` first. The gate refuses positioned, shortened, accelerated, or CPU-profiled runs.

This pass preserves the existing geometry, materials, lighting, shadow settings, resolution, particles, and gameplay. Static decoration is merged across 256-meter regions while deformable surfaces remain separate. Renderer geometry counts drop from 803 to 452; the fixed stress workload drops from 51 to 45 native draws and 35 to 31 fallback draws. Triangle totals by material and shadow assignment are checked against the original authored chunks.

All 95 original terrain colliders are now prepared during loading and parked disabled outside the nearby window. At most six terrain colliders participate in physics. Streaming and fresh retries reuse them without constructing triangle meshes during a driving frame. Craters disable the retained original collider and atomically install a replacement; returning to a streamed crater preserves its shape, and retry removes replacements and restores the original. Hazard supports still use their existing lifecycle. This adds bounded physics memory at load time; it is not a claim of reduced total memory. Recovery checks see 96 total colliders (including the rover), with seven enabled, after repeated fresh resets.

Diagnostics are deliberately separate from acceptance:

- The 65-second positioned, CPU-profiled comparison (`floor-baseline` / `floor-regions`, starting at x=3100) reduced the largest recorded terrain update from 10.2 to 4.5 ms. Overall timing worsened in that capture; it does not prove an FPS improvement.
- `performance-floor-regions.json` verifies 45/31 draws, but both backends miss the floor in that capture (maximum about 66.7/66.8 ms).
- `performance-floor-gpu-timing.json` records native GPU p95 6.03 ms and CPU render-submission p95 25.1 ms. Timestamp readback adds overhead, so this is a bottleneck diagnostic, not a release measurement.
- A render-bundle experiment (`floor-bundle-probe`) did not establish an improvement and was not adopted in the game.
- Disabling UI/audio produced a 17 ms maximum, but the same-session alternating comparison (`floor-ui-sweep`) also ran near 60 FPS with everything enabled. It did not isolate a HUD, grain, or audio defect. No production UI/audio behavior was removed. The last normal block still had a 50 ms outlier.
- A headed capture also failed. Headless versus headed, profiled versus unprofiled, and different thermal conditions must not be treated as controlled code-only comparisons.

Read-only host checks identify a GTX 1650 Ti, GPU temperature 89-90 C, and Windows processor-performance counter about 42% of nominal at one sample. The NVIDIA driver reported no active thermal slowdown; these observations do not prove a throttling diagnosis. The user explicitly requested continued testing as-is. Power plans, cooling settings, and other applications were not changed.

Raw captures remain in ignored `test-results/`. `PROFILE=1` adds a CPU profile and long-animation-frame records to the route diagnostic. Stress diagnostics support `GPU_PROFILE=1`, `UI_SWEEP=1`, and `HEADED=1`; those are not substitutes for the unprofiled full-route gate.

### Final as-is A-Z result: failed

`node tests/full-run.mjs floor-regions-final paced both --gate` completed both routes with 37 hull and no recovery, then correctly exited with a failed 40 FPS assertion. Detailed graphics, native 1080p, audio, and ordinary encounter/damage rules remained enabled. No build or other browser suite ran concurrently; light report/source inspection occurred on the shared host.

| Backend | Frames |  Median |     p95 |      p99 | Worst frame | Frames over 25 ms |
| ------- | -----: | ------: | ------: | -------: | ----------: | ----------------: |
| WebGPU  |  8,551 | 33.3 ms | 66.8 ms | 100.5 ms |    432.9 ms |    5,415 (63.33%) |
| WebGL 2 |  7,613 | 33.3 ms | 99.9 ms | 150.1 ms |  5,033.3 ms |    5,128 (67.36%) |

This capture is worse than the October 13 capture below. Reduced draw/resource counts and removed collider construction do **not** establish a frame-pacing win. The capture does not establish buttery-smooth performance; see the subsequent user-authorized merge decision above. Geometry/texture counts remain 452/18 native and 452/16 fallback.

The longest fallback animation-frame entry spans about 5.04 seconds while reporting zero blocking duration and only about 29 ms of attributed script work; the next render callback starts roughly five seconds after the previous script. That identifies a large frame-delivery gap, not five seconds of measured game JavaScript. It does not identify the browser/driver/system cause. Conversely, the subsequent empty-page calibration (`node tests/frame-scheduling.mjs`) samples 3,601 frames over 60 seconds with p95 16.9 ms, maximum 17.3 ms, and zero frames over 25 ms. Thus the failure is workload-sensitive; the empty control is not grounds to waive game-frame failures or blame the hardware alone.

All 53 unit tests, repeated checkpoint recovery, all-biome/preset graphics checks, and six accelerated full-route loadout audits pass on the updated build. The local Pages production build, both-backend Pages smoke checks, formatting, and diff checks also pass; shipping output excludes the benchmark hook. A sustained moving-workload browser/GPU scheduling trace remains necessary to isolate the remaining stalls. The renderer already caches unchanged object state and shares camera/light uniform work; no speculative renderer-internal override was added. No publication was performed.

## What changed

The route audit exposed expensive construction during driving: the first baseline had a terrain-update spike near 97 ms and enemy construction around 15 ms. The fixed-arena benchmark did not exercise those transitions. The finite A–Z route now prepares 95 chunks, 27 reusable enemy actors, and all authored hazards during loading. Shared scenery materials, shader compilation, GPU uploads, shadows, projectiles, debris, and Beam/slag effects are warmed before the launch button becomes available.

Only nearby terrain and hazard colliders remain active. Scene streaming detaches distant groups while retaining the finite asset cache. Retry restores original terrain vertices and hazard state without rebuilding the art. Generation checks discard both queued and in-flight crater results from an earlier attempt. Overflow enemy actors are disposed rather than growing the pool.

The tradeoff is more work and memory during initial loading. The October 13 pass removed repeated art/model construction from the authored route, except for bounded actor overflow; the October 15 pass above also prepares original terrain colliders. It is not free memory or a general solution for infinite worlds. The first cache audit held 822 geometries, and retaining the orbital strike geometry raised that to 823. Instancing matching wheel components then reduced the count to 803, before regional scenery batching reduced it to 452. Texture counters remain at 18 on native WebGPU and 16 on fallback. These counters are resource counts, not memory in bytes.

Matching tire and hub components are now drawn as four batches across all six wheels. Their original geometry, materials, shadow flags, pivot positions, and rotations are retained; physics and suspension remain independent. Regression tests measure the transformed bounds of each rendered wheel instance as its pivot moves.

The warmup also renders populated combat batches through the ordinary camera/lighting path, then clears them before showing the menu. This removed first-fire/impact pipeline stalls missed by identity-only compilation. A representative of each biome is also temporarily moved into view and rasterized: distant geometry can remain clipped after vertex processing even when CPU frustum culling is disabled. All groups return to their original world coordinates before play. The HUD mounts immediately on launch instead of waiting for the menu's exit animation while the rover is already moving.

Player projectiles now inherit rover velocity. Previously the default anti-air gun fell behind the mothership while the boss matched the moving rover's speed. The default loadout now completes the route in the diagnostic driver without changing enemy hull or encounter density. Enemy projectiles retain their existing velocities.

After reaching a serviced checkpoint, a destroyed rover can recover there with full hull and energy. Score, elapsed route time, kills, and clean landings roll back to the saved checkpoint; repeating a failed leg cannot accumulate score. The next report, encounter cursor, hazard supports, camera, and terrain reset together. Enter selects checkpoint recovery after a death; a fresh expedition remains available. Recovery points last for the current in-memory expedition only.

## Full-route balance evidence

`tests/full-run.mjs` uses a driver that reads nearby terrain and enemies and sends ordinary jump, brake, boost, fire, and vent inputs. It does not grant invulnerability, move the rover, suppress encounters, or refill resources. Reports are continued automatically. With recovery enabled it uses the same checkpoint recovery action offered to players, at most three times.

The accelerated audit advances fixed physics ticks between rendered frames and flushes crater work after the tick that queued it. It measures route/combat outcomes and CPU work, not real-time frame rate. The normal-speed mode uses the game's own accumulator and keeps audio active. Both modes retain all five biomes and the final boss.

The production audit completes all six runs:

| Loadout           | WebGPU / WebGL outcome | Checkpoint recoveries | Final hull | Recorded route time |
| ----------------- | ---------------------- | --------------------: | ---------: | ------------------: |
| Pulse / Flak      | Complete / complete    |                 0 / 0 |    37 / 37 |             296.0 s |
| Beam / Rail       | Complete / complete    |                 1 / 1 |    12 / 12 |             306.9 s |
| Seismic / Seekers | Complete / complete    |                 0 / 0 |    56 / 56 |             292.9 s |

Beam/Rail remains more demanding for this driver, particularly near late emitters and aerial threats. These are three representative weapon pairs, not all nine combinations or human completion rates. The driver was improved to brake for live emitters; its baseline and final outcomes do not isolate every balance change. Human A–Z play, subjective fairness, real controller/mobile input, and broader loadout balance remain open.

## Production benchmark separation

React's development JSX work was prominent in the CPU profile. Timing the dev server alone overstates some costs and does not represent the shipping bundle. The separate `benchmark` build uses production React and Vite output while retaining a local test hook. It writes to ignored `benchmark-dist/`. Normal and Pages builds still strip that hook, and the deployment workflow never builds benchmark mode.

```powershell
npm run build:benchmark
npm run preview:benchmark
# In another terminal:
$env:GAME_URL = 'http://127.0.0.1:4174/'
$env:RUN_SECONDS = '420'
$env:START_DISTANCE = '0'
$env:QUALITY = 'balanced'
$env:RECOVERY = '1'
node tests/full-run.mjs production-final audit both
$env:RECOVERY = '0'
node tests/full-run.mjs production-visible-warm paced both
node tests/performance.mjs production-wheels balanced weapons
```

The full-run and stress fixtures now use a 1920×1080 drawing buffer inside a 1920×1184 viewport. The stress fixture keeps 100 projectiles and 600 CPU debris active for 600 frames by default; `PERF_FRAMES` can extend it to 3,600 frames. Production frame captures run without concurrent builds or other browser suites. Development results from earlier passes remain historical and are not an apples-to-apples timing baseline.

Raw evidence is stored in ignored `test-results/full-run-production-final.json`, `full-run-production-visible-warm.json`, and `performance-production-wheels.json`. The earlier `full-run-production-isolated.json` records the route before wheel instancing; its p95 33.5/50.1 ms missed the target and motivated the additional batching work. The next `full-run-production-wheels.json` still missed the long-run target (p95 49.8/50.3 ms), despite the improved short stress result. These failures remain part of the evidence.

The earlier `full-run-production-paced.json` is retained as a failed/confounded capture: an in-app WebGPU game preview was also running. It measured p95 66.8 ms native / 83.3 ms fallback. Closing that temporary preview restored the short Balanced control to 16.7 ms median / 16.9 ms p95. The corrected captures close that competing preview before starting. They must not be described as a code-only improvement from the confounded figures.

## Native-1080p stress result

The final Balanced capture sustains 100 projectiles, 600 debris particles, an active Beam/charged Rail cycle, and 16 slag pools for all 600 sampled frames after 90 warmup frames. No browser tests or build jobs overlap this capture.

| Backend | Draws/frame before / after wheel instancing |  Median |     p95 |     p99 | Maximum |
| ------- | ------------------------------------------: | ------: | ------: | ------: | ------: |
| WebGPU  |                                     81 / 51 | 16.7 ms | 16.9 ms | 17.0 ms | 17.1 ms |
| WebGL 2 |                                     55 / 35 | 16.7 ms | 16.9 ms | 17.0 ms | 17.1 ms |

The 10-second stress capture meets the frame budget on this host at the exercised load. Before-instancing draw counts are from `performance-production-stress.json`; its fallback timing partly overlapped a regression job and is not a timing baseline. The final after-instancing capture is isolated. Full-route results and portability remain separate from this short stress result.

The subsequent positioned transition diagnostic (`START_DISTANCE=2120`, `RUN_SECONDS=30`, `full-run-visible-biome.json`) records p95 16.9 ms and p99 17.0 ms on both backends over the crystal-to-magma transition. It has startup frame outliers of 166.8/100 ms and does not substitute for an A-Z run.

## October 13 full-route capture: historical failure

The final normal-speed capture includes the visible-biome warmup, instanced wheels, production React, active audio, all checkpoints, and the boss. It completes A-Z on both backends with 37 hull, no recovery, no console errors, and unchanged geometry/texture counters. It **does not** meet consistent 60 FPS:

| Backend | Sampled frames |  Median |     p95 |     p99 |    Maximum | Frames over 25 ms |
| ------- | -------------: | ------: | ------: | ------: | ---------: | ----------------: |
| WebGPU  |         14,006 | 16.7 ms | 33.6 ms | 50.9 ms |   300.1 ms |            20.97% |
| WebGL 2 |         12,352 | 16.8 ms | 50.0 ms | 67.2 ms | 1,050.3 ms |            31.82% |

Evidence: `test-results/full-run-production-visible-warm.json`. Host: Core i5-10300H, 32 GB RAM, Windows 10.0.19045, Edge 155.0.4283.45; the stress fixture's independently requested adapter reports NVIDIA/Turing. Captures use a native 1920x1080 canvas. No build or other browser suite overlaps this final run; lightweight status/report inspection does occur on the shared machine. Whether unrelated heavy apps were running was not confirmed.

Frame spikes remain in the rendered frame path and occasionally simulation/collider work. Resource counts staying flat rule out accumulation of those counted resources in this capture, not every possible memory or scheduling problem. The improvements above should not be presented as a completed full-run frame-rate fix.

The initial publishing hold was superseded by the user-authorized merge decision above. The next performance investigation should use a controlled foreground run on named target hardware with competing GPU workloads closed, then correlate slow samples with CPU/GPU scheduling. Human A-Z balance, all nine weapon combinations, physical input devices, and the other PRD acceptance gates remain open.

## Regression coverage

The cache tests cover bounded route ownership, collider counts, restoring deformed terrain, cancellation across retries, restored bridge support, enemy reuse, and overflow disposal. Browser recovery tests exercise the real death/recover control on both backends, score rollback, repeated recovery, fresh-run reset, projectile velocity, and the narrow-screen dialog.

53 unit tests pass. The gameplay/boss/retry, weapon, hazard, all-biome graphics, recovery, and local Pages production suites pass on their exercised backends, with zero browser console errors. The Pages build excludes the benchmark hook. Instanced wheel bounds and gameplay screenshots were checked, and the mobile recovery dialog was inspected.

Run `npm test`, `npm run test:recovery`, and the existing gameplay, weapon, hazard, graphics, and Pages suites. A passing diagnostic run does not establish the PRD's input latency or baseline-hardware acceptance targets. The implementation was prepared on `codex/classic-assets-gameplay` for the user-authorized merge to `main`.
