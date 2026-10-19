# Steady camera and sustained aerial combat — October 17, 2026

Player feedback requested steady framing during speed changes, longer aerial fights, and aircraft that maneuver and bomb the road ahead. This request supersedes the speed-zoom requirement in the supplied PRD, which remains unchanged. The [Museum of the Game description](https://www.arcade-museum.com/Videogame/moon-patrol) anchors the original's speed control, dual-axis fire, spinning saucers, and bombs creating craters ahead. Durations, health, targeting, and interception below are this game's balance choices.

## Behavior

- Gameplay FOV stays at 48 degrees with the same follow distance, lead, and look-at at cruise, brake, and boost. Horizontal following uses the same interpolated rover position as rendering, avoiding speed-dependent lag. Boost no longer adds chromatic aberration. Impact feedback and the menu's separate framing remain.
- Scouts, bombers, hunters, and interceptors enter over 1.8 seconds, maneuver relative to the rover at every driving speed, then depart over 2.4 seconds. Their total encounter lifetimes are bounded at 20.4, 24.4, 20.4, and 16.4 seconds respectively; successful shooting can end them sooner. Banking, spinning scouts, and tractor cues remain visible.
- Patrols occupy a lower sky band. Desktop telemetry is more compact, and Beam/Rail status sits beside it, leaving aircraft silhouettes visible. Anti-air tracking covers 30–150 degrees. Portrait keeps its existing instrument layout.
- Scouts and bombers warn for 0.85 seconds, pulse payload lights, and mark a fixed road target with an orange ring. Ballistics account for warning/fall time and current rover speed, leaving the target about 14 meters ahead at predicted impact. Speed changes can evade a committed target. Targets prefer solid road over authored gaps.
- Falling bombs can be intercepted with Pulse, Flak, Seekers, Beam, or Rail for +50 points, without carving the road. Missed bombs carve a roughly four-unit-deep crater through the existing atomic terrain/collider path. Ordinary jump/hover can escape a crater if the rover falls in.
- A shared pressure budget spaces bomb runs and interceptor strikes. There are at most eight regular aircraft, matching per-kind prepared pool limits (8 scouts, 3 bombers, 3 hunters, 2 interceptors), and three active bombs. New aircraft exceeding a cap are omitted rather than allocated at runtime. Departures and kills release their actors.
- Nearby target spacing remembers the last target for eight simulation seconds, allowing repeated stationary boss attacks without permanent suppression. Pause/report states freeze attack clocks. Restart/checkpoint retry clears plans, bombs, rings, and attack cooldowns.
- Imminent bombs, gaps, and strikes take scanner priority. Labels reserve the warning area and separate when their projected positions coincide; portrait shows at most two. The duplicate central bomb banner was removed to keep bombs and aircraft visible. Thermal, hull, and strike warnings remain.
- Aircraft health is scout 8, bomber 24, hunter 16, interceptor 10. Seekers fire two guided missiles per salvo; cadence, per-missile damage, and heat cost remain. This prevents a single salvo from deleting a scout while preserving homing and bomb defense.
- Sustained encounters use 10 hull damage for aircraft contact and 25 for an orbital strike, with a four-unit crater. Ground contact and ordinary bomb damage retain their existing values. This reduces cumulative pressure from aircraft that now stay with the rover much longer.

## Controlled integration evidence

`npm run test:classic` exercises the running development build on actual WebGL 2. These are controlled fixtures, distinct from normal-route balance and human playtesting.

| Check                                    | Recorded result                                                                                                                                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera projection                        | 18 cases at 1440, 390, and 320 px: cruise, boost tap on/off, held boost, brake, empty capacitor; fixed 48 FOV, framing/rover size difference below 0.000001, zero boost lens distortion                    |
| Four-aircraft formation, Pulse/Flak      | 20.37 s presence, 3 kills and one departure, 2 actual bomb releases                                                                                                                                        |
| Four-aircraft formation, Beam/Rail       | 16.73 s presence, 4 kills, 2 actual bomb releases                                                                                                                                                          |
| Four-aircraft formation, Seismic/Seekers | 11.40 s presence, 4 kills, 1 actual bomb release                                                                                                                                                           |
| Unopposed bomber at brake/cruise/boost   | 20.2 s patrol at all three speeds, four actual releases, finite departure                                                                                                                                  |
| Stationary boss                          | Actual releases at 2.1, 10.1, and 18.1 s; continued attacks after target-memory expiry                                                                                                                     |
| Real seam impact                         | Full 0.85 s windup; locked X64, impact X64.008; road height 0.473 → −3.527; mesh/physics probes at 63.8, 64, 64.2 agree within 0.00001                                                                     |
| Crater escape                            | After ordinary braking stalls the rover at X65.99 with two wheel contacts, jump/hover advances to X79.13                                                                                                   |
| Bomb defense                             | All five weapon paths intercept, award +50 once, and leave no crater; terrain blocks Beam/Rail interception                                                                                                |
| Hunter                                   | Lift only during live patrol; entry, boost escape, and dead actor apply no lift                                                                                                                            |
| Actor pressure                           | At most 8 aircraft; every per-kind cap reached without overflow construction; prepared actor count stays 27                                                                                                |
| Presentation                             | Fresh 1440/390/320 captures of selected scout/bomber patrol poses; complete projected geometry stays in bounds and outside telemetry; labels remain separate and in bounds; falling bomb capture inspected |
| Lifecycle                                | Pause and report freeze clocks; actual checkpoint retry clears actors/bombs/rings/cooldown                                                                                                                 |

Ignored raw evidence: `test-results/classic-combat.json`, `classic-combat-{1440,390,320}.png`, and `classic-combat-falling.png`.

The automated route pilot initially missed a crater exit, retained jump through landing, and released hover before an upcoming gap despite a full capacitor. Actual-physics probes confirmed ordinary jump/hover frees the rover. The test pilot now recognizes stalled progress, releases before another launch, extends an existing hover across a nearby gap with a three-second hold bound, and brakes an airborne Beam approach to a low emitter. Four unit regressions cover those input edges. The production movement and recovery rules were retained.

## Independent review

Three AI critics independently review camera comfort, encounter length, classic flying/bombing, fairness, visual clarity, and readiness for local human playtesting. Their scores are code/evidence reviews, not human ratings or hardware certification.

| Round                   | Arcade critic minimum | Comfort critic minimum | Engineering critic minimum | Main response                                                                                         |
| ----------------------- | --------------------: | ---------------------: | -------------------------: | ----------------------------------------------------------------------------------------------------- |
| 1: baseline             |                   3.0 |                    3.5 |                        4.0 | Remove zoom/lead/lens movement; replace fleeting flybys and rearward bombs                            |
| 2: first implementation |                   7.8 |                    7.8 |                        7.6 | Reduce Seeker salvo, complete integration, separate labels, expire target memory, gate hunter attacks |
| 3: refined and verified |                   8.5 |                    8.6 |                        8.5 | Clear the aircraft band, tune sustained pressure, verify crater escape and supported route controls   |

Round 3 also caught aircraft behind the HUD and a test-pilot release problem. The lower patrol band, compact telemetry, removal of the duplicate bomb banner, and explicit jump-release checks address them. All final criteria meet the requested threshold for local human playtesting.

| Final criterion                    | Arcade | Comfort | Engineering |
| ---------------------------------- | -----: | ------: | ----------: |
| Camera comfort / steadiness        |    9.5 |     9.3 |         9.3 |
| Aerial encounter presence / length |    8.8 |     8.8 |         8.8 |
| Classic flight / bombing           |    8.8 |     8.7 |         8.7 |
| Attack clarity / fairness          |    8.6 |     8.6 |         8.5 |
| Modern visual clarity              |    8.6 |     8.6 |         8.6 |
| Readiness for local human playtest |    8.5 |     8.6 |         8.6 |

## Verification

- 65 unit tests pass; TypeScript/benchmark and Pages builds pass; formatting and whitespace checks pass.
- The complete classic-combat integration, existing actual-input gameplay/boss/retry smoke, WebGL weapon, patrol, hazard, and all-five-biome graphics suites pass with no console errors. Graphics transition checks now wait for actual blended light levels rather than assuming a wall-clock delay guarantees a completed transition.
- Local Pages production smoke passes automatic and forced WebGL 2, including project-path assets, input, charged release, graphics presets, mobile width, and stripped developer hooks. The final rebuilt asset hashes match the smoke-tested assets.
- The final source has full A–Z successes without recoveries for all three pairs: Pulse/Flak53 hull, Beam/Rail21, Seismic/Seekers46. Earlier failed Beam traces remain in ignored evidence. Test-pilot fixes use the same supported brake, fire, vent, jump, and hover controls as players, with normal damage/resources/spawns.
- Three reviewers independently approved the scoped build for local human testing after seeing the source, integration artifacts, and fresh images. Their final scorecards preceded the consolidated repeated-start audit; that audit is recorded separately below.

The consolidated final production-benchmark audit passes all three sequential loadouts, including repeated starts in the same game instance. Every run reaches completion at Z, uses ordinary damage/resources, and needs zero checkpoint recoveries.

| Loadout          | Final hull | Checkpoint recoveries | Route time | Peak aircraft / bombs |
| ---------------- | ---------: | --------------------: | ---------: | --------------------: |
| Pulse / Flak     |         53 |                     0 |   292.88 s |                 8 / 1 |
| Beam / Rail      |         21 |                     0 |   306.35 s |                 8 / 1 |
| Seismic / Seeker |         46 |                     0 |   302.15 s |                 7 / 1 |

Raw evidence: `test-results/full-run-classic-final-check.json` and its three completion captures. Each run retains 804 geometries, 16 textures, 95 prepared terrain chunks, and 27 prepared actors. Peak pending bomb plans are one. These resource counts do not establish a byte-level memory or frame-rate budget.

Validation host: Linux/WSL2, Node24, Chromium156. Fresh browser checks exercised actual WebGL2; automatic selection also used WebGL2. Native WebGPU was unavailable on this host. The browser suites use the repository's Playwright workflow because the T3 host browser reports missing runtime libraries. These gameplay audits are accelerated and some browser jobs overlap: no new rendered-frame or timing acceptance claim is made. The prior sustained-frame-pacing gate remains open.

Reproduce with the appropriate local servers already running:

```bash
npm test
GAME_URL=http://127.0.0.1:5175/ npm run test:classic
GAME_URL=http://127.0.0.1:4174/ RECOVERY=1 npm run test:full-run -- classic-final-check audit webgl
PAGES_URL=http://127.0.0.1:4188/KnotzMoonPatrol/ npm run test:pages
```

Use `BACKEND=webgl` for the graphics, weapons, patrol, and hazard suites on a fallback-only host. Browser installation and executable overrides are documented in the README. Generated benchmark/evidence folders are excluded from Vite's development watcher so they cannot reset a controlled scene during a build or capture.

## Local playtest

Start with `npm run dev` and use the port printed by Vite. In this session the development server is **http://127.0.0.1:5175/** and the smoke-tested Pages preview is **http://127.0.0.1:4188/KnotzMoonPatrol/**. Port 5173 belongs to another project.

1. Tap and hold boost, release it, brake, and repeat while jumping. Watch rover size and framing.
2. Let a saucer/bomber accompany the rover. Observe the pulse and orange target, then try shooting the bomb, changing speed, and jumping the resulting crater.
3. Compare all three anti-air choices; note whether fights feel sustained without becoming tedious.
4. Check desktop and a narrow screen, including crowded/crystal/magma scenes; pause and retry a checkpoint during an encounter.

Human handling/difficulty, physical mobile/gamepad input, native WebGPU revalidation, and sustained native-1080p frame pacing remain open. Accelerated route audits measure gameplay progression, not frame rate. These local changes have not been merged or deployed; human playtesting precedes any live Pages merge.
