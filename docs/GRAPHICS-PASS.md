# Graphics continuation — October 10, 2026

This pass addresses the biome aesthetics in PRD section 8, speed framing in section 3.2, and post-processing/performance work in Phase 4. The source PRD remains unchanged.

## Player-facing changes

- Five procedural PBR surface sets: cratered basalt, glossy fractured ice, smoldering obsidian seams, fungal veins, and inset alloy panels. Color/emissive maps use sRGB; separate height maps stay linear.
- A shared sun/hemisphere/headlight rig blends color, intensity, and distance fog between biomes. The chasm darkens around the rover's headlight while retaining enough fill to identify the vehicle. Headlights add no shadow pass.
- Graphics settings offer Performance, Balanced (default), and Cinematic. The choice persists across reloads and retries. Opening settings during play pauses the expedition; closing them returns to the pause screen. Checkpoint/end dialogs are hidden while settings or the manual are open.
- Performance caps device pixel ratio at 1 and disables dynamic shadows. Balanced caps it at 1.25 and keeps WebGPU shadows. Cinematic caps it at 1.75 and adds WebGPU HDR bloom plus subtle chromatic separation during boosts/impacts. WebGL keeps surfaces, lighting, and resolution presets with clear capability labels.
- Boost framing now opens to the PRD's 65-degree target and looks farther ahead, keeping the rover toward the left of the view.
- The FPS readout uses real elapsed frame time instead of the simulation's capped delta, so stalls are no longer understated.

## Ownership and budgets

Surface generation caches at most five CPU image sets. Each Terrain material owns its GPU textures; unloading a chunk retains shared biome materials, and terrain restart/disposal releases all owned maps. Optional HDR/bloom targets are disposed when changing away from Cinematic. The render counter resets once for the complete scene/effect frame.

No extra decorative meshes, per-prop lights, headlight shadows, or particle capacity were added. Balanced at high device density renders about 51% of the pixels permitted by the former 1.75 cap; at device ratio 1, the canvas resolution is unchanged. Presets are manual, not automatic adaptive resolution.

## Validation

- 31 unit tests pass, including preset/storage restrictions, map ownership/disposal, lighting transitions, and the existing gameplay/terrain rules.
- Native WebGPU and forced WebGL graphics scenarios pass: presets at device ratio 2, repeated effect teardown, all five surfaces, night lighting, boost framing/lens input, mobile settings, pause/Escape/resume, preference persistence, and single-dialog behavior at checkpoints/end screens.
- Gameplay/boss/retry and both-backend hazard scenarios pass with zero console errors. A hover-energy assertion failed during overlapping browser checks; the unchanged gameplay suite passed in an isolated rerun.
- Pages production build and the production browser suite pass on the project subpath with absent developer hooks. The Pages suite now exercises all three presets before driving/fire/pause/mobile checks.
- Desktop biome and narrow settings screenshots were inspected; the chasm fill was adjusted after review.
- Repeated switches returned native WebGPU allocations to 59 geometries / 7 textures, and WebGL to 55 / 5 in the controlled menu fixture. These counters do not establish total memory or long-session stability.
- See [performance captures](PERFORMANCE.md) for the same 100-projectile / 600-debris workload across presets. Median frame time alone does not close the stable-60-FPS gate.

Evidence is generated under ignored `test-results/graphics-*.jpg`, `graphics-results.json`, Pages/gameplay/hazard results, and the October performance JSON files.

## Remaining work

Volumetric dust/weather, screen-space shadows, GPU particle simulation/200,000-particle validation, refractive crystal/organic flora/megastructure art, and cinematic checkpoint cameras remain unfinished. Continuous beam/charged rail behavior, enemy depth, spatial audio, and chassis customization also remain open.

The acceptance gates for frame-time tails, complete suspension/full-run balance, cold terrain carving, input latency, and instrumented UI smoothness remain open. The fresh gameplay capture measured 380.5 ms for the cold GPU brush and 13.5 ms for a subsequent two-chunk brush; one fast warm carve does not establish the two-frame guarantee under combat load.

Changes are prepared locally on `codex/biome-graphics`. Hosted Pages publishing is handled separately through the existing validated `main` workflow.
