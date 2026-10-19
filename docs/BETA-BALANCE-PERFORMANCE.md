# Beta balance and frame pacing — October 13, 2026

Target: arcade challenge with forgiving recovery. These changes remain local until the beta evidence is strong enough to publish. The original PRD remains authoritative.

## What changed

The route audit exposed expensive construction during driving: the first baseline had a terrain-update spike near 97 ms and enemy construction around 15 ms. The fixed-arena benchmark did not exercise those transitions. The finite A–Z route now prepares 95 chunks, 27 reusable enemy actors, and all authored hazards during loading. Shared scenery materials, shader compilation, GPU uploads, shadows, projectiles, debris, and Beam/slag effects are warmed before the launch button becomes available.

Only nearby terrain and hazard colliders remain active. Scene streaming detaches distant groups while retaining the finite asset cache. Retry restores original terrain vertices and hazard state without rebuilding the art. Generation checks discard both queued and in-flight crater results from an earlier attempt. Overflow enemy actors are disposed rather than growing the pool.

The tradeoff is more work and memory during initial loading. It removes repeated art/model construction from the authored route, except for bounded actor overflow; nearby physics colliders are still created as needed. It is not free memory or a general solution for infinite worlds. The first cache audit held 822 geometries, and retaining the orbital strike geometry raised that to 823. Instancing matching wheel components then reduced the count to 803. Texture counters remain at 18 on native WebGPU and 16 on fallback. These counters are resource counts, not memory in bytes.

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

## Full-route release gate: still failing

The final normal-speed capture includes the visible-biome warmup, instanced wheels, production React, active audio, all checkpoints, and the boss. It completes A-Z on both backends with 37 hull, no recovery, no console errors, and unchanged geometry/texture counters. It **does not** meet consistent 60 FPS:

| Backend | Sampled frames |  Median |     p95 |     p99 |    Maximum | Frames over 25 ms |
| ------- | -------------: | ------: | ------: | ------: | ---------: | ----------------: |
| WebGPU  |         14,006 | 16.7 ms | 33.6 ms | 50.9 ms |   300.1 ms |            20.97% |
| WebGL 2 |         12,352 | 16.8 ms | 50.0 ms | 67.2 ms | 1,050.3 ms |            31.82% |

Evidence: `test-results/full-run-production-visible-warm.json`. Host: Core i5-10300H, 32 GB RAM, Windows 10.0.19045, Edge 155.0.4283.45; the stress fixture's independently requested adapter reports NVIDIA/Turing. Captures use a native 1920x1080 canvas. No build or other browser suite overlaps this final run; lightweight status/report inspection does occur on the shared machine. Whether unrelated heavy apps were running was not confirmed.

Frame spikes remain in the rendered frame path and occasionally simulation/collider work. Resource counts staying flat rule out accumulation of those counted resources in this capture, not every possible memory or scheduling problem. The improvements above should not be presented as a completed full-run frame-rate fix.

**Keep publishing on hold.** The next performance investigation should correlate the recorded slow-distance samples with CPU profiles, GPU timing, and a controlled foreground run on named hardware; compare fresh versus sustained runs and keep other GPU workloads closed. Repeat full-route and heavy-load captures after a demonstrated fix. Human A-Z balance, all nine weapon combinations, physical input devices, and the other PRD acceptance gates also remain open.

## Regression coverage

The cache tests cover bounded route ownership, collider counts, restoring deformed terrain, cancellation across retries, restored bridge support, enemy reuse, and overflow disposal. Browser recovery tests exercise the real death/recover control on both backends, score rollback, repeated recovery, fresh-run reset, projectile velocity, and the narrow-screen dialog.

53 unit tests pass. The gameplay/boss/retry, weapon, hazard, all-biome graphics, recovery, and local Pages production suites pass on their exercised backends, with zero browser console errors. The Pages build excludes the benchmark hook. Instanced wheel bounds and gameplay screenshots were checked, and the mobile recovery dialog was inspected.

Run `npm test`, `npm run test:recovery`, and the existing gameplay, weapon, hazard, graphics, and Pages suites. A passing diagnostic run does not establish the PRD's input latency or baseline-hardware acceptance targets. All changes remain local on `codex/classic-assets-gameplay`; no deployment was performed.

## October 17 continuation: cheaper terrain colliders and readable feedback

Terrain streaming and atomic crater commits now use Rapier heightfields matching the existing 65-by-9 vertex grid. This avoids constructing a triangle-mesh acceleration structure for every incoming chunk or changed surface. The rendered triangles, friction, streaming window, collider ownership, and staged commit/rollback lifecycle retain their existing contracts. Heights and off-edge ray normals are compared against the previous triangle representation across biome boundaries and overlapping crater seams. At exact grid edges, either adjacent face can win a ray query; tests compare heights there without requiring identical face selection.

The repeatable CPU fixture alternates the old triangle descriptor and the new heightfield descriptor across five route positions. It measures descriptor construction, collider creation, and removal, after 100 warmup operations per representation, with 1,000 recorded operations each. On an Intel Core Ultra 7 265F, WSL2 Linux 6.18.54.1, Node 24.21.0, the triangle path records 0.1909 ms median / 0.2350 ms p95; heightfields record 0.0055 / 0.0104 ms. The median improvement is approximately 35 times. Sample maxima, including outliers, are 2.5573 / 0.7854 ms. Evidence: `test-results/terrain-colliders-continuation.json`; reproduce with `npm run test:colliders -- my-capture` using Node 24. This fixture measures CPU collider work, not presentation time or sustained FPS.

The production WebGL audit completes all three loadouts before and after this change in Chromium 156.0.8078.4 at a 1920-by-1080 drawing buffer. Pulse/Flak, Beam/Rail, and Seismic/Seekers finish with 37, 12, and 56 hull and 0, 1, and 0 checkpoint recoveries respectively in both captures. Some intermediate damage, scores, and route times differ; this is not deterministic replay evidence. All runs retain 803 geometries / 16 textures, 95 cached chunks, and 27 pooled actors, with zero browser errors. These resource counts do not measure total memory. Evidence: `test-results/full-run-continuation-baseline-webgl.json` and `full-run-continuation-heightfield.json`.

55 unit tests pass, including heightfield/triangle equivalence, edited chunk reuse, retry restoration, atomic multi-chunk replacement, allocation failure rollback, and disposal. The WebGL gameplay smoke exercises driving, six-wheel contacts, jump/hover, charged weapons, thermal lockout, single/seam craters, checkpoint service, boss completion, death/retry, and mobile layout. Its final single/seam crater checks both record 0.7 ms with matching mesh/raycast probes; these are unloaded development smoke observations, not the heavy-combat terrain acceptance fixture.

That mobile review exposed animated notices losing horizontal centering when Framer Motion replaced their CSS transform. Centering now uses the independent CSS `translate` property. Warnings wrap within the viewport, and mobile notices sit between the biome caption and touch controls. The smoke suite waits for entrance/exit animations and verifies centering, unclipped text, and clear caption/control bounds at both 390 and 320 px. The rendered captures were inspected; evidence is `test-results/mobile-gameplay-390.png`, `mobile-gameplay-320.png`, and the `feedback` records in `browser-results.json`.

Browser suites now share a launcher: Edge remains the Windows default, while other platforms use Playwright Chromium. `PLAYWRIGHT_CHANNEL` / `PLAYWRIGHT_EXECUTABLE_PATH` override selection; `PLAYWRIGHT_HEADLESS=0` enables a foreground window. Development suites honor `GAME_URL`; production continues using `PAGES_URL`. Full-route audits record the actual backend plus OS/Node metadata and reject an unavailable requested backend rather than labeling fallback as native. Linux runtime libraries were extracted under `/tmp` for this session; no system packages were installed. The first explicitly enabled native attempt timed out before launch; ordinary Chromium automatic mode selected WebGL 2. Fresh native WebGPU coverage remains outstanding.

Final benchmark and Pages production builds pass, as do formatting and browser-script syntax checks. The local Pages smoke passes in automatic and forced WebGL modes, both selecting WebGL 2 on this host. It verifies project-path assets, graphics settings, driving, jump/fire, charge/release, pause/resume, mobile controls, and absent developer hooks, with zero browser errors. Evidence: `test-results/pages-results.json`.

For an isolated production audit, build with `npm run build:benchmark`, run `npm run preview:benchmark`, then set `GAME_URL=http://127.0.0.1:4174/` and `RECOVERY=1` for `npm run test:full-run -- my-capture audit webgl`. Use `paced` and an available native backend on named target hardware for rendered frame measurements, with other game previews closed.

The remaining long-run renderer/frame-pacing problem is still open. This continuation removes a measured collider cost and fixes feedback readability; it does not satisfy the sustained native-1080p 60 FPS gate. The user later authorized merging the combined continuation to `main`; the strict 40 FPS acceptance gate remains open.

## PR #4 performance gate carried into the October 17 continuation

The production benchmark retains the strict 40 FPS full-route check as `npm run test:frame-floor`. It runs a normal-speed A–Z route with detailed graphics and audio at native 1920×1080 and fails if any sampled frame exceeds 25 ms. Short stress fixtures and profiled runs do not clear this gate.

The October 15 420-second as-is capture completed both routes but failed the gate: WebGPU p95/max 66.8/432.9 ms with 63.33% of frames over 25 ms; WebGL 2 p95/max 99.9/5,033.3 ms with 67.36% over 25 ms. The user reported competing YouTube playback on NitroBliss and a substantially slower CPU than Superbeast, so these are shared-host observations and do not establish target-hardware performance. The next clean named-hardware run remains necessary.

PR #4 also merged 256 m regional batching for static scenery and prepared/disabled route colliders. This October 17 integration preserves that batching and collider reuse while replacing its repeated primitive scenery with the Blender-authored environment kit and its terrain triangle collider with the grid-matched heightfield. The remote capture reduced geometry resources from 803 to 452 and fixed-fixture draws from 51/35 to 45/31 (WebGPU/WebGL); the heightfield collider fixture separately measured roughly 35× lower median CPU construction/removal cost than the previous triangle path. Those workload reductions do not establish a full-route frame-rate pass.

On October 15 the user authorized merging this continuation to `main`; the repository's existing Pages workflow validates and deploys that branch. The merge preserves the recorded frame gate and its failure evidence for follow-up work.
