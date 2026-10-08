# Product Requirements Document (PRD)

## Project: *Moon Patrol: Void Runner* (Working Title)

**Document Version:** 2.0

**Target Architecture:** Next-Gen Browser / WebGPU

**Tech Stack:** Three.js (WebGPU Renderer), WebGPU Shaders (WGSL), React / HTML5 Overlay with Framer Motion, TypeScript, Rapier.js 3D Physics

---

## 1. Executive Summary & Vision

*Moon Patrol: Void Runner* is a modern 2.5D sci-fi vehicle action game inspired by the rhythm, speed control, and dual-axis combat of the 1982 arcade classic *Moon Patrol*.

Rather than a retro facsimile, *Void Runner* reimagines the formula as a cinematic, high-octane run-based survival platformer. Players pilot a customizable, multi-axle planetary rover across volatile alien crusts under dynamic weather, shifting gravity, and relentless aerial/ground assaults.

The game combines:

- **Tight 2D arcade handling** mapped inside a **rich 3D world** rendered via WebGPU.
- **Upgraded twin-axis modular weaponry** with energy management and weapon loadouts.
- **Complex dynamic terrain destruction and synthesis** powered by compute shaders.
- **Intelligent enemy flight formations** and dynamic ground threats with physicalized hazards.
- **Polished, reactive UI and micro-interactions** driven by Framer Motion.

---

## 2. Technical Stack & Architectural Blueprint
```java
┌────────────────────────────────────────────────────────────────────────┐
│                        React & UI Shell                                │
│   Framer Motion (HUD, Overdrive Meter, Boss Bars, Checkpoints, Menu)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ DOM / React State Bindings
┌──────────────────────────────────▼─────────────────────────────────────┐
│                    Three.js WebGPU Engine Core                         │
│  ┌────────────────────────┬──────────────────────────────────────────┐  │
│  │ WebGPURenderer         │ Compute Shaders (WGSL)                   │  │
│  │ - PBR Post-Processing  │ - Terrain Heightfield Carving & Voxel FX │  │
│  │ - Volumetric Dust/Fog  │ - High-density GPU Particle Systems      │  │
│  │ - Screen-Space Shadows │ - Debris & Spark Physics                 │  │
│  └────────────────────────┴──────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Rapier.js (WebAssembly 3D Physics Engine)                         │  │
│  │ - Raycast Vehicle Controller (Spring-Damper Suspension)           │  │
│  │ - Dynamic Collider Meshes (Real-Time Terrain Deformation)         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Technology Matrix

- **Rendering Engine:** `three/webgpu` (Three.js with native WebGPU backend).
- **Shader Pipeline:** WGSL (WebGPU Shading Language) for custom volumetric fog, surface displacement, shield effects, and GPU compute particle systems (supporting up to 200,000 active particles at 60+ FPS).
- **Physics Engine:** `@dimforge/rapier3d-compat` (Wasm-based Rapier physics running deterministic ticks at 60Hz decoupled from frame rendering).
- **State Management & UI:** React 19 + TypeScript.
- **UI Motion & Screen Transitions:** Framer Motion (orchestrating HUD telemetry, damage vignetting, checkpoint announcements, and end-of-sector score tallies).
- **Audio Engine:** Web Audio API with procedural sound synthesis and positional spatial audio for passing aerial vehicles.

---

## 3. Core Gameplay Loop & Control Mechanics

The player traverses linear sectors (A through Z) across multiple hostile celestial biomes. The camera is locked to a 2.5D perspective (side-scrolling with slight forward perspective yaw and dynamic camera dolly effects based on speed).
```css
[Speed Decel] ◄── [Cruising Velocity] ──► [Overdrive Boost]
     ▲                     ▲                      ▲
     │                     │                      │
Low momentum          Balanced fire         High jump range
Tight jumps           Standard jump         Requires boost charge
```

### 3.1 Rover Locomotive Physics

- **Multi-Axle Raycast Suspension:** The buggy features 6 independent, articulated wheels (two front steerable, four rear bogie suspension). Wheels conform dynamically to the 3D terrain profile using Rapier raycast suspension springs.

- **Variable Throttle Mechanics:**

- **Reverse/Brake ($V\_{\text{min}}$):** 40% base speed. Decreases forward jump distance; maximizes firing accuracy and obstacle reaction time.

- **Cruising Speed ($V\_{\text{normal}}$):** 100% base speed. Standard travel state.

- **Overdrive Boost ($V\_{\text{max}}$):** 180% base speed. Consumes the **Overdrive Capacitor Gauge**. Required for clearing colossal chasms and escaping orbital strike zones.

- **Jump Dynamics & Jump Jets:**

- **Standard Jump:** Tapping Jump fires primary pneumatic suspension springs, launching the chassis on a parabolic arc.

- **Sustained Thruster Hover:** Holding Jump burns the Overdrive gauge to activate auxiliary RCS thrusters, allowing horizontal glide and height modulation across multi-tiered gaps.

- **Air Pitch Control:** Players can tilt the chassis ($\pm 20^\circ$) mid-air to land flush against downward slopes for an immediate momentum boost ("Clean Landing").



### 3.2 Dynamic Camera System

- **Speed Zoom:** As the player hits Overdrive, the field of view opens from $45^\circ$ to $65^\circ$, moving the rover toward the left edge to reveal threats ahead.
- **Impact Jolt:** High-impact landings and nearby explosions trigger procedural 3D camera trauma (perlin noise-based rotational shake).

---

## 4. Reimagined Arsenal & Weapon Systems

Rather than simple fixed single-lasers, the rover features a modular dual-axis weapon system powered by an **Auxiliary Energy Core**.
```less
                           [ TOP TURRET (AA / High-Angle) ]
                           - Direction: +45° to +135° (Auto-tracking or Manual)
                           - Types: Flak, Railgun, Micro-Missiles
                                        ▲
                                        │
                                   ┌────┴────┐
 [ FORWARD BATTERY ] ◄─────────────┤  ROVER  ├─────────────► [ REAR DEFENSE ]
 - Ground-clearing plasma          └─┬─────┬─┘               - EMP Mine dispenser
 - Focused mining laser             ◯◯     ◯◯◯               - Kinetic slug
```

### 4.1 Forward Kinetic/Energy Battery (Ground Axis)

Fires along the forward horizontal axis to eliminate surface obstacles, boulders, enemy barricades, and surface crawlers.

1. **Pulse Vulcan (Default):** High-velocity plasma bolts with rapid cyclic rate. Low armor penetration, high knockback against rolling obstacles.
2. **Resonance Beam:** A continuous beam that ramps up heat. Melts large titanium/granite boulders into liquid slag, clearing paths without launching bouncing debris.
3. **Seismic Spreader:** Heavy kinetic slug that impacts the ground ahead, sending a low shockwave along the surface that detonates buried landmines and cracks thin ground bridges.

### 4.2 Vertical / Anti-Air Battery (Sky Axis)

Mounted on a gyro-stabilized roof turret to neutralize flying drones, bombers, and falling debris.

1. **Flak Cannon (Default):** Fires timed explosive shells that detonate at mid-altitude into shrapnel clouds, eliminating swarms of light aerial drones.
2. **Tachyon Railgun:** Pinpoint, high-damage beam penetrating through multiple stacked flyers; requires charging.
3. **Seeker Micro-Missiles:** Fires an arc of 4 micro-rockets that auto-target incoming airborne hazards and descending orbital missiles.

### 4.3 Weapon System Mechanics: Core Overheat

Continuous firing builds **Core Heat**. Exceeding 100% enters a 3-second thermal lockout where weapons cycle offline. Players must balance cadence or trigger manual venting (which vents hot gas, damaging obstacles directly touching the vehicle).

---

## 5. Reimagined Enemies & Dynamic Hazards

### 5.1 Aerial Threats (The Swarm)

| Enemy Type              | Visual Profile                       | Attack Pattern / Behavior                                                                                                                   | Counter Strategy                                                      |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Stinger Drone**       | Sleek angular bio-mechanical drone   | Spawns in V-formations; oscillates in vertical sine-waves and dives in kamikaze vectors when hit by player fire.                            | Flak shrapnel cloud or forward Pulse Vulcan during low dive.          |
| **Heavy Void Bomber**   | Armored hexacopter gunship           | Drops **Crust-Buster Torpedoes** vertically. If a torpedo hits the surface, it blasts dynamic holes into the terrain.                       | Prioritize Railgun shots into its unshielded top core before release. |
| **Sky-Leech Hunter**    | Hovering saucer with energy tendrils | Projects an anti-gravity tractor beam onto the track. Driving into it lifts the buggy into the air, disabling steering until destroyed.     | Shoot downward vertical lasers or activate Overdrive to break free.   |
| **Orbital Interceptor** | High-altitude supersonic jet         | Sweeps quickly across the upper screen, painting laser targeting lines on the ground that trigger kinetic pillar strikes 1.5 seconds later. | Watch laser telemetry warnings and modulate vehicle speed.            |

### 5.2 Ground & Sub-Surface Threats

| Hazard / Enemy                  | Profile & Behavior                           | Interaction Mechanic                                                                                      |
| ------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Magma Leech (Crater Lurker)** | Burrowing xenomorph dwelling in deep craters | Leaps out vertically when the buggy jumps over the chasm.                                                 |
| **Automated Ground Skimmer**    | Fast-moving twin-tread drone                 | Approaches from ahead or closes in rapidly from behind the rover, firing forward pulse beams.             |
| **Magnetic Minefields**         | Floating spherical proximity mines           | Drift toward the rover if it moves slowly; can be shot or detonated harmlessly with the Seismic Spreader. |
| **Collapsing Tectonic Plates**  | Weakened lunar bridges over acid/void pits   | Visual stress fractures appear; plate disintegrates 0.8 seconds after wheel contact.                      |

---

## 6. Real-Time Terrain Deformation (WebGPU Compute)

Unlike static pre-baked tiles, *Void Runner* features **mutable, dynamic terrain**:
```css
[UFO Bombs / Explosions] ──► [WGSL Heightfield Compute Shader] ──► [Rapier Trimesh Update]
                                        │
                                        ├──► Procedural Mesh Tessellation
                                        └──► GPU Particle Voxel Spall Effect
```

1. **Heightfield Deformation Pipeline:**

- The surface is evaluated as a continuous GPU heightmap buffer.
- When explosive ordnance (UFO torpedoes, landmines, heavy player weapons) detonates on the ground, a compute pass subtracts volume using spherical SDF (Signed Distance Field) brushes.

2. **Physics Sync:**

- The deformed heightfield slice immediately rebuilds the local Rapier 3D trimesh collider.
- Shallow hits create minor dips that jolt the suspension; direct heavy bomb impacts blow wide chasms that must be cleared via Overdrive jumps.

3. **Debris Spallation:**

- Every crater carve-out instantiates hundreds of physics-driven GPU gravel particles that cascade into the pit or bounce off the rover's hull.



---

## 7. User Interface & HUD Architecture (Framer Motion)

The interface merges diegetic cockpit elements with a sleek, minimalist cybernetic telemetry overlay rendered via React and animated with Framer Motion.
```scss
┌────────────────────────────────────────────────────────────────────────┐
│ [SPD: 142 KM/H]   [CAPACITOR: ▓▓▓▓▓▓▓░░]   [SECTOR D ➔ E]   [SCR: 48,200]│
│                                                                        │
│                      [ ! CAUTION: ORBITAL SWARM ! ]                     │
│                                                                        │
│                                                                        │
│ ──(A)────(B)────(C)────[D]─────────(E)──────────────────────────(Z)── │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.1 HUD Components

- **Overdrive Capacitor & Heat Gauge:** Top-left telemetry ring. As heat builds, the ring changes color from icy cyan to radiant amber and warning crimson with pulsing spring animations.
- **Dynamic Threat Reticle:** Floating diegetic UI tags appear above off-screen aerial enemies and incoming artillery strikes, tracking their angle of approach.
- **Sector Progress Bar (A–Z):** Bottom docking strip showing current sector progress. Passing a letter checkpoint triggers a liquid milestone pulse across the track.
- **Warning Klaxon Overlay:** When elite bombers or high-density rolling hazards enter, an animated banner drops from the top (`initial={{ y: -50, opacity: 0 }}` to `animate={{ y: 0, opacity: 1 }}`) accompanied by directional flashing warning chevrons.

### 7.2 Checkpoint Sector Evaluation Overlay

Upon completing Sector `E`, `J`, `O`, `T`, and `Z`, the gameplay pauses into a dynamic cinematic bullet-time camera tracking the buggy, while Framer Motion reveals the sector report card:

- **Time Under Target:** Compares actual sector time against Par Time.
- **Bonus Multipliers:** Trophies for *Clean Landings*, *Aerial Enemies Vaporized*, and *No Damage Taken*.
- **Score Cascades:** Numbers roll up rapidly using spring-damped number displays with crisp mechanical audio ticks.

---

## 8. Biome Progression & Level Architecture

The run spans five distinct visual and mechanical biomes, escalating in environmental hazards:
```css
[Sector A-E]     [Sector F-J]       [Sector K-O]     [Sector P-T]       [Sector U-Z]
Mare Tranquillitatis ➔ Crystalline Spire ➔ Magma Fissures ➔ Acid Swamps  ➔ Core Uplink
(Low gravity,    (Reflective ice,   (Geysers, falling (Toxic pools,     (Zero-G zones,
 basic terrain)   skid physics)      lava bombs)      destructible vines) orbital defense)
```

1. **Sectors A–E: Mare Tranquillitatis (Lunar Basalt Fields)**

- *Aesthetics:* Deep ink-black skies, high-contrast sharp white sunlight, cyan-tinted cratered terrain, distant earthrise.
- *Mechanics:* Teaches jump heights, basic rock obstacles, and standard drone waves.

2. **Sectors F–J: The Crystalline Spires**

- *Aesthetics:* Giant prism monoliths refracting colored volumetric lights, iridescent terrain.
- *Mechanics:* Low-friction surfaces (drift handling), vertical laser crystals that fire on proximity.

3. **Sectors K–O: The Magma Fissures**

- *Aesthetics:* Smoldering obsidian crust, molten rivers beneath collapsible rock crusts, red ash fog.
- *Mechanics:* Dynamic ground eruptions, geothermal vents launching the buggy skyward.

4. **Sectors P–T: The Bioluminescent Chasm**

- *Aesthetics:* Pitch dark environment lit only by the player's headlights and glowing flora/spores.
- *Mechanics:* Hidden craters covered by fungal canopies; flying enemies camouflage until firing.

5. **Sectors U–Z: Orbital Defense Complex (The Citadel)**

- *Aesthetics:* Brutalist metal alloy tracks, planetary megastructures, sweeping searchlights.
- *Mechanics:* Full environmental assault: laser barriers, automated sentry turrets, and the sector Z mothership encounter.



---

## 9. Audio & Haptic Architecture

- **Adaptive Dynamic Soundtrack:** Synthwave and industrial electronic score featuring reactive stems. Cruising speed triggers a driving 140 BPM bassline; engaging Overdrive fades in aggressive arpeggiated synths; critical hull integrity activates distorted sub-bass pulses.
- **Positional 3D Audio:** Implemented via Web Audio API `PannerNode`. Aerial enemies whining overhead pan accurately across the stereo field; subterranean tremors rumble through heavy LFE bass channels.
- **Dynamic Sound Priorities:**

1. *Priority 1 (Emergency):* Low-fuel / critical heat warning, incoming missile tone.
2. *Priority 2 (Feedback):* Target locks, weapon overheat clicks, shield deflection pings.
3. *Priority 3 (Environment):* Suspension compression creaks, tire gravel spray, ambient wind shear.



---

## 10. Development Milestones & Phased Execution
```scss
[Milestone 1] ────► [Milestone 2] ────► [Milestone 3] ────► [Milestone 4]
Core Engine &       Weapons, Swarms &   Terrain Compute &   Polish, Audio &
Raycast Buggy       Rapier Physics      Framer Motion UI    Performance Pass
(Weeks 1-3)         (Weeks 4-6)         (Weeks 7-9)         (Weeks 10-12)
```

### Phase 1: Core Physics & WebGPU Foundation (Weeks 1–3)

- Initialize Three.js WebGPU renderer with basic forward PBR pipeline and lighting.
- Implement Rapier 3D raycast vehicle model with 6 suspension points and responsive keyboard/gamepad throttle.
- Build procedural level segment streamer generating continuous heightfield terrain.

### Phase 2: Combat Systems & Enemy Behaviors (Weeks 4–6)

- Build modular dual-axis weapon firing pipeline with projectile pooling.
- Implement aerial drone flocking and dive-bomb AI behaviors.
- Add ground threat detection, collision hurtboxes, and destructible obstacle physics.

### Phase 3: Terrain Deformation & UI Polish (Weeks 7–9)

- Write WGSL compute shader for real-time crater carving and terrain spallation.
- Integrate Rapier dynamic mesh collider updates on crater generation.
- Build complete React + Framer Motion HUD, checkpoint banners, and weapon heat meters.

### Phase 4: Biome Expansion, Audio & Optimization (Weeks 10–12)

- Implement all 5 visual biomes with custom WebGPU background shaders and post-processing (bloom, chromatic aberration, tone mapping).
- Integrate Web Audio reactive sound framework.
- Profile WebGPU memory buffers and shader passes to ensure steady 60 FPS performance on target systems.

---

## 11. Acceptance Criteria & QA Validation Checklist

- [ ] **Frame Rate Budget:** Stable 60 FPS at 1080p on baseline WebGPU hardware (e.g., Apple M1 / GTX 1660 equivalent) during heavy combat with 50+ concurrent projectiles and active particle fields.
- [ ] **Deterministic Suspension:** Buggy maintains stable orientation and wheel-ground contact over undulating hills without falling through or jittering on terrain colliders.
- [ ] **Terrain Carving Integrity:** UFO ground torpedoes reliably deform the terrain geometry and update physics colliders within a 2-frame window without stalling the main render thread.
- [ ] **Input Responsiveness:** End-to-end input latency from jump/fire keypress to visual screen actuation stays under 32ms.
- [ ] **UI Overlay Smoothness:** Framer Motion HUD elements remain silky and decoupled from render load, maintaining zero layout shifts or stutter during sector transitions.