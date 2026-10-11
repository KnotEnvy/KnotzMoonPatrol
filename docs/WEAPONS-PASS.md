# Continuous and charged weapons — October 10, 2026

This pass implements the Resonance Beam and charged Tachyon Railgun from PRD sections 4.1–4.3. The original PRD is unchanged.

## Player controls

Choose either weapon in Configure Rover. The same Fire control powers both axes: J/Z, gamepad X, or the on-screen FIRE button.

- Resonance Beam stays on while Fire is held. Release or vent to cool the shared core.
- Tachyon Railgun charges while Fire is held, reaching full power in approximately 0.85 seconds. Release to discharge. A quarter charge is the minimum; partial charges produce weaker shots. A full charge waits for release rather than firing automatically.
- The ground battery continues operating while the rail charges. Pause, focus loss, venting, thermal lockout, checkpoints, death, retries, and cancelled pointer input clear charge/beam state. Ordinary pointer release fires the charged shot.
- A fixed-position HUD strip shows Beam activity, charge percentage, and the ready/release prompt. The roof turret follows the firing direction and holds that orientation during the discharge flash.

## Combat and visuals

The Beam is a continuous 30-metre ray anchored to the rover's physical muzzle, with interpolated rendering between physics ticks. It damages the nearest live enemy or emitter core and stops at terrain/plate surfaces. Heightfield grid vertices and half-metre samples prevent narrow crests from slipping between checks.

Sustained firing ramps approximately 28–58 heat units/second and 6–9 damage/second over 1.5 seconds. Gameplay boulders progressively glow and shrink, retaining a stable combat circle while melting. A Beam-finished rock becomes a glowing, non-colliding visual slag pool instead of launching ballistic debris. Other enemy deaths retain their existing explosions.

The Railgun uses an instantaneous 55-metre ray, auto-aimed within the roof turret's 45–135 degree arc. It damages every intersected enemy before the nearest terrain/emitter obstruction, so stacked flyers can be pierced in one physics tick. Damage ranges from 4.75 at minimum charge to 10 at full charge. Charging adds modest heat; discharge adds 12.5–20 heat. The existing three-second thermal lockout remains authoritative.

Energy shapes share one six-instance batch; slag uses one sixteen-instance batch and expires after four seconds. Both reuse their geometry/materials, add no lights or shadow passes, and are hidden when empty. Scene disposal releases their resources. The obsolete Beam/Rail projectile branches and 160 projectile hit sets were removed; the 120-friendly/40-hostile projectile and 800-debris capacities stay unchanged. Target selection uses a scan instead of sorting temporary arrays.

Slag is a bounded visual effect, not a liquid simulation. Decorative scenery rocks are not combat hurtboxes. Full human balance, physical controller/mobile feedback, input latency, sustained 60 FPS, GPU particles, and the remaining PRD systems still require validation/work.

## Validation and reproduction

```powershell
npm test
npm run build:pages
npm run test:pages
npm run dev
```

With the development server running:

```powershell
npm run test:weapons
npm run test:browser
npm run test:hazards
npm run test:graphics
npm run test:performance -- weapons-idle balanced idle
npm run test:performance -- weapons-active balanced weapons
```

The weapon scenario suite covers front-target blocking, shrinking/melting without debris, slag expiry/capacity, heat/recovery, full/partial rail strength, same-tick penetration, off-axis misses, hill occlusion, emitter damage, interruption safety, keyboard/pointer release, mobile HUD, and renderer resource counts across retries on native WebGPU and forced WebGL. Desktop Beam/Rail/slag and narrow HUD captures were inspected; muzzle/contact alignment was corrected after review.

The Pages suite exercises the new loadout through the production UI after its default-loadout controls check. It waits for visible full charge and release, with developer hooks absent, on normal renderer selection and forced WebGL. Gameplay/boss/retry, hazard, and all-biome graphics scenarios preserve existing behavior. The boss harness now releases the charged rail between holds.

The optional `weapons` performance fixture retains 100 projectiles and 600 CPU debris and adds Beam/charge/discharge shapes plus sixteen slag pools. It explicitly resets core heat to sustain the rendering workload; thermal balance is tested separately. Its 1920×1080 viewport contains a 1920×976 canvas and does not close the PRD's native-1080p acceptance gate. Run captures after other build/test processes finish.

Ignored evidence is generated under `test-results/weapons-*.jpg`, `weapons-results.json`, Pages/gameplay/hazard/graphics results, and `performance-weapons-*.json`.

43 unit tests passed locally with `node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout=15000`. Two earlier default runs hit timeouts in unchanged physics/WASM tests while local shell/import operations were also unusually slow. The first attempt to forward the worker flag through the PowerShell npm shim did not forward it correctly; the direct Vitest command did. Repository/CI test defaults remain unchanged. The final Pages build/production and both-backend weapon scenarios pass, as do gameplay/boss/retry, both-backend hazards, and all-biome graphics checks.

The full-charge ray dealt 10 damage to each of two stacked flyers in the same tick while missing the off-axis flyer; a partial charge dealt approximately 7.12 damage. Hill occlusion left the protected rock untouched. Melting produced one slag pool and zero ballistic debris. Keyboard/pointer release and pointer cancellation pass. Six restart/menu cycles retained native allocations at 63 geometries / 7 textures and fallback allocations at 53 / 5. Those counters do not establish total memory or long-session stability.

See [performance captures](PERFORMANCE.md): the idle stress fixture retains 78 native / 52 fallback draws. Active weapons and a full slag pool use 80 / 54; Cinematic uses 92 native draws including bloom. Performance uses 54 native draws. Timing remains highly variable, including an idle native control repeat with a 116.9 ms median. These captures establish bounded rendering work, not stable frame pacing or a causal FPS comparison. Cinematic and desktop/mobile weapon screenshots were inspected.
