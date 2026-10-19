# Beta asset continuation — October 17, 2026

This pass replaces the primitive vehicle library with Blender-authored game geometry and adds a Blender environment kit. It is an asset and local-playtest milestone, not a claim of AAA parity or release acceptance. The user requested a maximum of three critique rounds with three Claude Opus 5.5 high-effort reviewers, plus GPT-6.1-Sol medium implementation workers.

## Scope and art references

The visual benchmarks were [Housemarque's Resogun](https://housemarque.com/games/resogun) for arcade silhouette clarity and [Returnal](https://www.playstation.com/en-us/games/returnal/) for distinct industrial and organic construction. These are reference standards, not assets or textures copied into the project. The [Returnal UX discussion](https://blog.playstation.com/2021/05/11/unpacking-returnals-ux-design-gameplay-first-ui-retro-futuristic-tech-and-accessibility/) also informs keeping important action readable.

- Rover: shaped pressure hull and cabin, framed glazing, service panels, machine hardware, recovery eyes, mesh expedition lettering, detailed wheels and radiator. Six wheel pivots, suspension, weapon mount and boost attachment retain their existing runtime contracts.
- All nine enemies: distinct modeled construction, exposed warning optics, hunter emitter ring and prow, segmented bomber armor/intakes, boss containment assembly, chitin-toned leech and fractured mineral obstacle.
- Twenty environment models: three variants and one debris kit for each biome. Angular lunar outcrops, sheared ice, columnar basalt, curved fungal growth and beveled citadel equipment replace the previous repeated primitives. Placement uses deterministic variation, spacing gaps and occasional rear landmarks.
- Hazard supports: emitter frames, crystal anchoring, vent rubble, layered plate edges, canopy gills and gravity anchors reuse existing materials and batching. Warning timing and collider behavior are unchanged.
- Terrain and visibility: corrected front cut-face winding, narrowed the lava fill, added depth shading, smoothed ridge shading across repeating seams and raised the fungal light rig to preserve actor visibility.
- Loading: the title UI renders before the engine and asset module downloads/parses. Loading cancellation handles component teardown; production still excludes development instrumentation.

No custom shader or new VFX system was added. Existing lighting, materials and effects remain in use. Surface detail in this pass is modeled geometry, baked vertex ambient occlusion and restrained vertex tinting. There are no UV texture atlases or baked normal/roughness maps; those remain a significant route to greater close-up material quality.

## Rebuilding and editing

Run `npm run assets:build`. It invokes Blender in background mode for:

| Generator                      | Editable gallery                  | Runtime export                     |
| ------------------------------ | --------------------------------- | ---------------------------------- |
| `scripts/build-rover.py`       | `assets/source/rover.blend`       | `src/game/assets/rover.json`       |
| `scripts/build-enemies.py`     | `assets/source/enemies.blend`     | `src/game/assets/enemies.json`     |
| `scripts/build-environment.py` | `assets/source/environment.blend` | `src/game/assets/environment.json` |

Set `BLENDER_PATH` to override the executable. The wrapper detects the installed Blender 5.2 Windows executable from WSL and converts script paths with `wslpath`; otherwise it invokes `blender` on PATH. This pass was generated with Blender 5.2.1 LTS.

**The Python scripts are the authoritative sources.** Each rebuild starts a fresh scene and overwrites the generated JSON and `.blend` galleries. Hand edits made only in Blender are not preserved by regeneration. Incorporate lasting changes in the authoring script or deliberately establish a separate manual export workflow first. The galleries retain named components and editable modifier stacks for inspection.

Manufactured components use dimension-limited bevels and weighted normals. Blender's evaluated geometry is exported with quantized positions/normals, indices and RGB vertex occlusion. Rover/enemies use twelve hemisphere rays; scenery uses six. These are deterministic BVH geometry bakes, not Cycles texture baking. Degenerate faces are filtered after quantization; enemy vertices and triangles receive a canonical ordering so Blender loop enumeration cannot change the export bytes. Two consecutive rebuilds of each library produced byte-identical runtime JSON. Generator SHA256 values are stored in the exports and checked by tests. Regeneration fails the wrapper if a success marker is missing, even when Blender returns exit code zero after a Python exception.

A single exported material table supplies both the Blender preview and runtime palette, with explicit sRGB-to-linear conversion in Blender. Enemy geometry is fitted to the existing shot circles; the rotating drone uses a full 3D envelope. Collision rules were preserved.

## Runtime budgets and ownership

- Rover: 17,688 authored triangles (17,892 including runtime suspension and the hidden boost mesh), four six-instance wheel batches, 15 maximum draws including suspension and the usually hidden boost flame.
- Enemies: three material batches each; the hunter has a fourth, independent tractor-beam mesh. Current geometry ranges from 1,514 rock triangles to 12,656 boss triangles.
- Environment: tested chunks use 546–2,332 environment triangles and at most four material batches. Decorations remain outside the driving corridor. Existing route preparation handles the uploads; no Blender evaluation occurs during play.
- Environment arrays decode once into immutable CPU data; prepared chunks own their geometry buffers. Enemies retain independently owned geometry and materials in the bounded actor pool, including their mutable warning/melting materials.
- Current geometry JSON totals approximately 1.74 MB uncompressed. The engine/asset chunk is approximately 1.84 MB raw / 617 KB gzip; the initial UI chunk is approximately 384 KB raw / 122 KB gzip. These are build sizes, not measured network transfer or load-time guarantees. Physics and renderer chunks are additional.

The larger geometry library is intentionally bounded. A controlled native WebGPU stress fixture now holds approximately 60 FPS on the measured NVIDIA adapter; full-route, baseline-hardware and physical-device acceptance remain open. Software-rendered screenshots and finite draw counts alone do not establish release performance.

## Critique and evidence

Round 1 found buried warning optics, drone/hunter silhouette collision, blank armor, repetitive scenery, insufficient fungal visibility, collapsed bevel triangles and missing gameplay-camera evidence. Those findings drove the exposed signal geometry, differentiated hunter, occlusion bake, panel construction, authored environment kit, lighting change and exporter integrity checks.

The review files and captures are local artifacts under `test-results/asset-pass/`. Each round's screenshots describe that round; later source changes must not be attributed to earlier screenshots. `before-*.png` preserves the old vehicle models under the same studio lighting. `roundN-*.png` contains neutral-light models, title, all five biomes and the nine enemies through the real gameplay camera. The gameplay scene captures deliberately freeze simulation and set up actors for inspection; they are not completed human playthroughs or balance evidence.

Round 2 additionally identified the interceptor’s thin side profile, rock/scenery camouflage, weak ground fractures, duplicated material settings and artwork outside shot bounds. The final pass adds a banked interceptor with fins, warm fractured basalt with mineral seams, integrated drone optics, tapered leech armor and sloped skimmer panels. Ground patterns now branch and wrap across tiles. Crystal housings retain visible facets; hazard labels sit above physical housings.

All three final Opus 5.5 reviewers found **no concrete local-playtest blocker**. Their final ratings remain below the earlier 8.5 goal and do not establish AAA quality:

| Reviewer    | Silhouette | Modeling | Surface depth | Readability | Cohesion | Local beta readiness |
| ----------- | ---------- | -------- | ------------- | ----------- | -------- | -------------------- |
| Art         | 6.5        | 6.0      | 4.5           | 7.0         | 6.5      | 7.0                  |
| Readability | 7.0        | 6.5      | 5.0           | 7.0         | 6.5      | 7.0                  |
| Engineering | 6.5        | 6.0      | 4.5           | 6.5         | 6.0      | 7.0                  |

Overall art assessments progressed from roughly 4.6–5.0 in round 1, to 5.5–5.6 in round 2, to 6.1–6.5 in round 3. These are AI judgements against the requested premium-game benchmark, not player ratings. The maximum of three rounds was respected.

Remaining art priorities are UV/texture baking for material variation, more distinctive construction on the drone/skimmer/bomber, seating the boss rim panels, and richer foreground/bridge treatment. Watch rock visibility in dark biomes and against magma scenery, crystal-core clarity, and leech legs during human play. Runtime watch items include ground-enemy pool overflow and duplicated seam-restoration constants. A final test now asserts the authored hit radii equal the engine's actual shot radii.

After round 3, native WebGPU validation exposed a runtime buffer-layout bug: packed RGB byte colors had a three-byte stride, which WebGPU rejects. `src/game/asset-colors.ts` now pads enemy and scenery colors to opaque RGBA bytes with a legal four-byte stride. Tests cover alignment, vertex counts and opacity. This correction changes runtime loader source hashes; the archived round-3 manifests describe the reviewed source at capture time. Authored geometry, material palettes and exported JSON stayed unchanged. The native checks below ran after the correction; no fourth critique round was added.

## Local verification and playtest

`npm run assets:studio` and `npm run assets:scenes` capture the runtime models and scene fixtures. Both use the existing browser helper and `GAME_URL`; `ASSET_STAGE` selects an artifact prefix. The studio creates only an ignored developer HTML artifact, not a production route. Capture manifests record source hashes and reject changes during capture. The final scene suite covers all nine enemies in all five biomes and the rover in each biome. An actor-present/actor-hidden difference mask excludes empty corners of projected bounds from luminance measurements; the coarse visibility gate does not replace human readability judgement.

The T3 collaborative preview is unavailable on this host because `libnspr4.so`, `libnss3.so`, `libnssutil3.so` and `libasound.so.2` are missing. Art-review captures use repository Playwright with Chromium, temporary dependency libraries and WebGL software rendering. Subsequent native validation uses Windows Edge 155 and its NVIDIA Blackwell WebGPU adapter. The browser reports no specific GPU model name.

Final verification:

- All 97 unit tests across 17 files and `npm run build:pages` pass after the buffer correction.
- Native WebGPU graphics, weapons, hazards and five-biome streaming pass with zero browser errors. Production Pages scenarios pass with both automatic WebGPU and forced WebGL 2.
- Classic camera/combat, actual-input browser smoke, seven UI viewport sizes and WebGL graphics/weapons/hazards/streaming passed during the asset pass. All 50 final gameplay-camera visibility fixtures passed before the runtime buffer correction.
- Native graphics checks exercise all presets, repeated switching, shadows, optional Cinematic bloom and stable resource counters. Balanced retains 983 geometries and 18 textures.

The final native stress capture (`test-results/performance-assets-native-final.json`) uses Windows Edge 155.0.4283.45, an Intel Core Ultra 7 265F, and the NVIDIA Blackwell adapter. Both viewport and drawing buffer are 1920×1080. Balanced quality runs 90 warmup frames followed by 600 sampled frames with 100 projectiles, 600 debris, active Beam/Rail effects and 16 slag instances. Frame time is 16.7 ms median, 16.8 ms p95/p99 and 16.9 ms maximum, with 60 draws, a constant 983 geometries and zero browser errors.

The separate software WebGL capture (`test-results/performance-assets-final.json`, 240 sampled frames) records 183.3 ms median and 183.4 ms p95. These are different rendering backends and hosts, not a before/after optimization comparison. The native result demonstrates this controlled fixture on the available hardware; it does not close full-route frame pacing, baseline-hardware, input-latency or physical-mobile acceptance.

The local production build is available at [http://127.0.0.1:4188/KnotzMoonPatrol/](http://127.0.0.1:4188/KnotzMoonPatrol/). Before a live beta, inspect the rover in motion and each biome, distinguish drone/hunter without relying only on color, watch bomb warnings and silhouettes during combat, check suspension and weapon alignment, and exercise pause/settings/restart. Complete a human A–Z run and test a real touch device. This pass remains local for the user's hands-on review before merging or deploying.
