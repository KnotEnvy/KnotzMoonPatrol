# Gameplay development pass — October 7, 2026

This pass develops the mechanics in [the original PRD](PRD.md). It resumes and completes the interrupted hazard work.

## Player-facing changes

- Encounters are authored by route distance. Each event fires once; braking does not accumulate repeated time-based waves. The opening stretch introduces rocks, gaps, and then aerial pressure.
- Magma bridges fracture after actual wheel contact. They retain physical support for 0.8 seconds, then lose their Rapier collider and fall into the fissure.
- Magma vents warn before erupting and can launch the rover. Each eruption provides one lift.
- Crystal and citadel emitters warn before firing. Their forward-facing cores can be destroyed by the rover's weapons; an active beam deals hull damage.
- Fungal cover conceals acid gaps without creating a false supporting collider. The cover retracts during its warning.
- Citadel fields reduce gravity from 12 to 3 while the rover is inside. The HUD reports low gravity; normal gravity returns on exit. These are low-gravity fields, not the PRD's fully zero-gravity zones.
- Terrain, elite-aircraft, and orbital-strike markers project world positions onto the HUD, with distance and urgent-state labels. Markers stay within the phone viewport.
- Jump input allows a 100 ms grace period after leaving a lip and a 140 ms buffer before landing. Holding jump does not repeatedly bounce the rover.
- Intentional, slope-matched clean landings grant score and a short momentum bonus. Ordinary falls no longer grant clean-landing credit; collisions no longer count as weapon kills.
- Checkpoint servicing gives a brief damage grace period when the player resumes.
- Progress and hazard text have stronger contrast over bright magma.

## Terrain integrity

Crater brushes dispatch affected chunks together, wait for all readbacks, then commit their mesh/collider pairs in one task. Existing vertex attributes are updated in place, avoiding a new GPU position buffer for every crater.

If collider construction fails, staged replacements are removed and the previous surface remains. A completed brush is discarded if its terrain has been disposed or its chunk has streamed away.

Bombs, seismic rounds, and orbital strikes fracture nearby bridges; projectile impact checks include the bridge surface.

## Evidence

- Production compilation passed.
- 27 unit tests passed, covering rules, shared physics initialization, batching, jump forgiveness, encounter progression, physical hazards, atomic terrain commits, rollback, and disposal.
- The game-loop hazard harness exercised WebGPU and WebGL 2 with controlled positioning. Actual suspension contacts armed a plate; its collider disappeared after 48 fixed ticks. Vents launched, weapon hits disabled cores, active lasers reduced hull, fungal covers stayed non-solid, and low gravity reset on exit.
- Gameplay/boss/retry and all-biome streaming browser suites passed with zero console errors.
- Native WebGPU seam probes on either side of a crater crossing x=64 matched each other and the Rapier surface within the test tolerance.
- Cold single-chunk carve: 288.9 ms. Subsequent two-chunk carve: 86.6 ms in the local headless Edge smoke capture. Both exceed the two-frame target at 60 Hz.
- Desktop bridge and phone scanner screenshots were visually inspected.

Generated evidence: `test-results/hazard-results.json`, `browser-results.json`, `streaming-results.json`, and hazard JPEGs. Run `npm run test:hazards` with the development server running to regenerate the hazard cases.

## Remaining acceptance work

The original PRD acceptance checklist remains open. This pass does not establish sustained 60 FPS, sub-32 ms end-to-end latency, a complete fair human A–Z run, or physical gamepad/mobile-device behavior. GPU particles, continuous beam/charged rail behavior, cinematic post-processing, weather, and the remaining biome/enemy/audio depth are still tracked in [implementation status](IMPLEMENTATION-STATUS.md).
