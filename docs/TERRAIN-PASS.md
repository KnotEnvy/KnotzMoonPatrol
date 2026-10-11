# Terrain latency continuation — October 10, 2026

This pass addresses the crater/collider latency gap in PRD section 6 and acceptance criterion 11. It preserves terrain resolution, surface maps, lighting, brush shapes, and the original PRD text.

## Implementation

The current streamed mesh has 585 vertices per chunk. Small brush jobs (at most 2,048 vertices) now evaluate the spherical bowl on CPU instead of waiting for the renderer's GPU queue and readback. The operation copies only when a height actually changes. Larger jobs retain the shared-device WGSL path; unavailable/failed GPU jobs fall back safely. Partial buffer allocation failures release completed allocations without destroying the renderer's device.

All affected live chunks still commit together. Replacement colliders are staged before any old collider is removed, preserving rollback and seam integrity. Overlapping explosions remain ordered against the preceding committed heights. Unchanged brushes preserve collider handles, geometry uploads, normals, and chunk versions.

This is a deliberate workload choice: WebGPU still renders the game, while its small collision meshes use a bounded CPU brush. The retained compute shader is tested explicitly. This does not implement a continuously resident GPU heightmap, voxel overhangs, terrain synthesis, or a physics worker. Main-thread normal/collider work remains measurable.

## Measured evidence

`npm run test:terrain -- october-small-brush` runs serially on native WebGPU and forced WebGL. A 1920×1184 browser viewport leaves an actual 1920×1080 canvas at device ratio 1. The fixed arena maintains real simulation, 100 projectiles, and 600 CPU debris particles. It captures a cold edit, then 48 total alternating single-chunk/seam edits and a burst of three overlapping edits. Frame samples span the warm commits; raycasts verify the resulting geometry. Separate explicit GPU dispatches compare both brush implementations.

Host: Intel Core i5-10300H, Windows 10.0.19045, 31.8 GB RAM; headless Edge 155.0.4283.45. An independent WebGPU adapter request reports NVIDIA/Turing; this does not identify the active WebGL adapter or establish baseline-hardware equivalence.

| Backend | Cold commit | Median / p95 commit | Maximum commit | Three-edit burst | Median / p95 / max frame |
| ------- | ----------: | ------------------: | -------------: | ---------------: | -----------------------: |
| WebGPU  |      4.1 ms |        2.4 / 4.9 ms |         5.4 ms |           6.3 ms |    16.7 / 16.8 / 33.3 ms |
| WebGL 2 |     10.6 ms |        3.7 / 9.9 ms |        11.2 ms |          12.3 ms |   16.7 / 66.8 / 100.1 ms |

All collider probes, seam checks, occupancy assertions, unchanged-brush checks, and console-error checks pass. CPU/WGSL maximum coordinate error is approximately 0.00000048 world units. These small-brush commits fit within a 33.3 ms budget in this capture. That result does not establish every brush/presentation deadline on every target system, sustained 60 FPS, or a complete A–Z suspension run.

The previous October graphics capture measured a 380.5 ms cold GPU edit. A same-session exploratory diagnostic at native 1080p measured GPU edits from 8.8 to 3,223.6 ms and CPU edits from 1.7 to 7.4 ms; different startup/render conditions mean these are diagnostic evidence, not a controlled before/after FPS comparison.

Raw commits, frame intervals, machine metadata, and screenshots are ignored outputs under `test-results/terrain-october-small-brush.*` and related backend images. The retained repository evidence is this summary. The PRD acceptance boxes stay open pending representative route/hardware/presentation checks.

## Regression checks

37 unit tests and the Pages production build/browser checks pass. Gameplay, boss/retry, and both-backend hazard/biome-streaming scenarios pass with zero console errors. The gameplay smoke measured a 2.9 ms cold edit and 3.8 ms seam edit, with matching colliders. Desktop crater and narrow gameplay captures were inspected. The hover smoke check now holds controls until it observes ascent, firing, and capacitor consumption, replacing a fixed 650 ms wall-clock assumption that intermittently missed hover during startup. This tests input behavior without claiming a measured input-latency budget.
