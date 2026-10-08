# Rendering performance measurements

## September 16, 2026 implementation pass

- Merge static geometry by material and shadow settings within each model/chunk. Wheel groups, suspension pivots, turret aiming, boost flame visibility, and deformable terrain stay independent.
- Replace separate projectile meshes with two bounded instance batches (120 friendly / 40 hostile capacity). Combat and collision still operate on individual projectiles.
- Upload and draw only live debris instances; retain the existing 800-particle CPU pool.
- Dispose instance resources during scene cleanup.

## Reproduce

Start `npm run dev`, then run `npm run test:performance -- comparison-name`.
The label determines the ignored `test-results/performance-comparison-name.json` and backend screenshot names.
Use the same source revision, machine, browser, viewport, and power settings for comparisons; run timing captures without competing build/test jobs.

The fixed-arena fixture keeps real physics/combat stepping while maintaining exactly 100 projectiles and 600 active CPU debris particles. It warms 90 frames, then samples 240 frames on each backend. Occupancy and console errors are assertions. Raw frame intervals, browser/OS/CPU details, actual canvas resolution, geometry counts, and per-frame draw calls are saved.

`renderer.info.render.drawCalls` is the per-frame counter in the installed Three.js version. The previous script's `render.calls` counter was cumulative, so its reported 573 calls cannot be compared to the measurements here.

A 1920 x 1080 browser viewport gives a 1920 x 976 game canvas with the current header/footer. This fixture does not establish native 1080p rendering acceptance, sustained terrain deformation performance, input latency, human playability, or the 200,000-particle requirement. An independently requested high-performance WebGPU adapter is recorded for context; it is not proof of the active WebGL device.

## Machine and baseline

- Windows; Intel Core i5-10300H; NVIDIA GeForce GTX 1650 Ti and Intel UHD Graphics installed.
- Headless Microsoft Edge 153.0.4234.32 (full version is stored with each capture).
- WebGPU adapter request reports NVIDIA / Turing.
- Baseline source: `7aad47b`, with the corrected fixture only.

| Backend | Baseline draw calls/frame | Baseline resident geometries | Baseline median / p95 frame time |
| ------- | ------------------------: | ---------------------------: | -------------------------------: |
| WebGPU  |                       360 |                          179 |                  33.5 / 116.9 ms |
| WebGL 2 |                       251 |                          177 |                  66.6 / 216.7 ms |

## Post-change captures

Both captures assert 100 active projectiles and 600 active debris in every sampled frame, with zero console errors.

| Backend | Batched draw calls/frame | Repeat resident geometries | First batched median / p95 | Repeat median / p95 |
| ------- | -----------------------: | -------------------------: | -------------------------: | ------------------: |
| WebGPU  |                       78 |                         65 |            67.0 / 166.6 ms |      16.7 / 66.9 ms |
| WebGL 2 |                       52 |                         66 |             16.7 / 66.5 ms |      16.7 / 50.1 ms |

Draw calls fell 78.3% on WebGPU and 79.3% on WebGL. The first batched WebGPU capture was slower than baseline, during a session with intermittent host/tool/browser stalls. The repeat ran after all build and regression jobs finished. Both captures had identical draw-call counts, but timing variance prevents a stable-60-FPS claim. WebGPU resident geometry counts varied from 61 to 65 between captures; these are renderer allocations, not a total memory measurement.

Local artifacts: `test-results/performance-baseline.json`, `performance-batched.json`, and `performance-batched-repeat.json`, plus corresponding screenshots. These are ignored outputs; the summary above is retained in the repository. The screenshot is captured while gameplay is active; the original baseline screenshot includes the pause overlay, but its timings were collected before pausing.

Production build, 11 unit tests, gameplay smoke, and WebGPU/WebGL all-biome streaming passed. No stable 60 FPS acceptance claim is made from this comparison. The remaining gates are tracked in [implementation status](IMPLEMENTATION-STATUS.md).
