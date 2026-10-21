# Void Runner v1.0.0-beta.1

**[▶ Play the beta: https://knotenvy.github.io/KnotzMoonPatrol/](https://knotenvy.github.io/KnotzMoonPatrol/)**

![Void Runner](https://raw.githubusercontent.com/KnotEnvy/KnotzMoonPatrol/main/public/og-void-runner.jpg)

The first public beta of **Void Runner**, a 2.5D lunar rover action game and modern remake of the 1982 arcade classic _Moon Patrol_. It runs in your browser: no install, free to play.

## What is in the beta

- A distance-authored A-Z route across **five biomes**, with route reports after sectors E, J, O and T and a mothership fight at sector Z.
- A six-wheel rover on Rapier physics: cruise, brake, boost, jump, hover, mid-air pitch, and clean-landing bonuses.
- Aerial patrols of saucers and bombers whose warned, shootable bombs carve real craters in the road ahead, plus tractor hunters, interceptors, skimmers, mines, rocks and leech threats.
- Streamed, deformable terrain: craters change both the look and the physics of the road.
- Procedural Web Audio soundtrack and effects.
- A WebGPU renderer with an automatic WebGL 2 fallback.

### The five biomes

| Sectors | Biome                | Subtitle            |
| ------- | -------------------- | ------------------- |
| A - E   | Mare Tranquillitatis | Lunar basalt fields |
| F - J   | Crystalline Spires   | The frozen frontier |
| K - O   | Magma Fissures       | Obsidian fault line |
| P - T   | Bioluminescent Chasm | The living dark     |
| U - Z   | Orbital Citadel      | Core uplink         |

Hazards include crystal lasers and icy handling, collapsing bridges and magma vents, concealed acid gaps, and low-gravity fields in the citadel.

### Weapons and loadouts

Choose one ground weapon and one sky weapon; both fire together. All weapons share a heat meter with thermal lockout. Vent to cool down (the short-range vent also deals contact damage), and use the rear EMP for threats behind you.

| Ground weapon    | Style                               |
| ---------------- | ----------------------------------- |
| Pulse Vulcan     | Rapid plasma, balanced heat         |
| Resonance Beam   | Hold to melt obstacles, rising heat |
| Seismic Spreader | Surface shockwave, heavy impact     |

| Sky weapon      | Style                                |
| --------------- | ------------------------------------ |
| Flak Cannon     | Airburst shells, swarm control       |
| Tachyon Railgun | Hold to charge, release to pierce    |
| Seeker Missiles | Twin guided rockets, target tracking |

### Graphics presets

Performance, Balanced (default) and Cinematic, selectable from the title screen or in play, and saved locally. Cinematic adds WebGPU bloom and impact lens effects. You can force a preset with `?quality=performance|balanced|cinematic` and the WebGL 2 renderer with `?renderer=webgl`.

## Changes in this release

- Rover cruise speed is lower (15 instead of 20); boost now tops out at the old cruise speed.
- Stronger jump gravity, so the rover falls faster. Low-gravity zones stay floaty.
- Weapon heat builds more slowly, and venting is faster and releases a visible puff of steam.
- Top turret (sky weapon) shots travel about 55% faster.
- Redesigned classic arcade-style title screen, and a unified visual style across the HUD, pause menu, hangar, reports and end screens.
- Better link previews when sharing the game (Open Graph/Twitter cards, structured data), a web manifest, and beta feedback issue templates.

## Requirements

- Desktop Chrome or Edge with WebGPU for the best experience. Other browsers use WebGL 2 automatically.
- Hardware acceleration enabled. If the frame rate is low, switch to the Performance preset.

## Known issues

- This is a beta, not a full match for the project's requirements document; see [implementation status](https://github.com/KnotEnvy/KnotzMoonPatrol/blob/main/docs/IMPLEMENTATION-STATUS.md) for what is simplified or missing.
- A stable 60 FPS is **not** guaranteed. Frame-time spikes were measured on long runs, especially on lower-end GPUs and at 1080p; see [performance measurements](https://github.com/KnotEnvy/KnotzMoonPatrol/blob/main/docs/PERFORMANCE.md).
- WebGL 2 has no dynamic shadows or cinematic effects.
- Difficulty and weapon balance have not had broad human testing. Some loadout pairs are likely harder than others (Beam and Rail are more demanding near late laser emitters and aerial threats). This is the main thing we want feedback on.
- Gamepad mappings, vibration, touch controls and mobile devices have not been validated on physical hardware.
- Cross-platform deterministic replay is not supported.
- The visual debris system is a bounded 800-instance pool, not a large GPU particle system.

## How to give feedback

- [Report a bug](https://github.com/KnotEnvy/KnotzMoonPatrol/issues/new?template=bug_report.yml): include your browser, renderer (WebGPU or WebGL), graphics preset and steps to reproduce.
- [Share gameplay feedback](https://github.com/KnotEnvy/KnotzMoonPatrol/issues/new?template=feedback.yml): difficulty, weapon balance, handling and feel.

Thank you for flying a patrol.
