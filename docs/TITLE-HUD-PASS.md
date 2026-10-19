# Title screen and HUD continuation

October 17, 2026. Local work on `codex/classic-assets-gameplay`; pending human playtesting before integration or GitHub Pages publication.

## Direction and references

The player request was to replace the website-like presentation with a video-game title screen and HUD. Three games informed the direction:

- **Outer Wilds:** a recognizable wordmark, a short vertical menu, and an evocative scene. The [main-menu screenshot](https://mdshepard1.medium.com/outer-wilds-once-more-unto-the-stars-9e430e4e7ec7) was inspected alongside [Mobius Digital's game page](https://www.mobiusdigitalgames.com/outer-wilds.html). Our implementation uses the existing lunar scene and rover.
- **Resogun:** the [gameplay screenshot](https://www.gamespot.com/reviews/resogun-review/1900-6415541/) emphasizes score at the edge while leaving the shooter action visible. Housemarque's [official introduction](https://blog.playstation.com/2013/08/20/introducing-resogun-the-new-ps4-exclusive-from-the-super-stardust-team/) supplies the arcade context. Our score and compact route display follow that information hierarchy.
- **Returnal:** Housemarque's UI/UX director explains [prioritizing gameplay information, peripheral secondary data, and functional industrial instruments](https://blog.playstation.com/2021/05/11/unpacking-returnals-ux-design-gameplay-first-ui-retro-futuristic-tech-and-accessibility/). Its gameplay HUD image was inspected. This informed the restrained instrument palette, clear critical-health state, and contextual weapon status.

These are design interpretations, not claims that our game duplicates their interfaces. No reference artwork, logos, or downloaded images were added to the game. Fonts remain locally bundled and the scene remains procedural.

## Implemented interface

- Full-window 3D scene, without the website navigation header/footer or deployment/marketing cards.
- Large VOID RUNNER wordmark, direct four-option menu, high score, and a compact equipped-weapon summary when space permits.
- A closer title-only rover camera, staged to the right of the menu. Driving retains its fixed 48-degree FOV and speed-independent follow behavior.
- Score/time/distance at the upper left, compact A–Z route at the top, hull/energy/heat below, secondary speed and contextual weapon charge at the lower right.
- Critical hull numerals and bars turn red. Lockout labels fit small instrument panels. Renderer/FPS diagnostics live in Graphics.
- Real menu buttons support pointer, Tab, Up/Down, Home/End, and Enter. Enter from the title background honors the selected weapon loadout. Disabled options are skipped during loading.
- Direct game-state dialog headings, visible focus, and guarded focus restoration when one dialog replaces another. Graphics is reachable within Pause, checkpoint reports, and end screens; background utility controls yield to the open panel. Exiting panels leave the input/accessibility tree while their visual fade completes.
- At least 44-pixel touch controls on the checked narrow/short layouts. Short title layouts retain Configure Rover while hiding the optional loadout summary.
- Generic aircraft name cards were removed so the models and their world effects remain visible. Short-screen urgent warnings sit below the action and take precedence over secondary notices; compact notices return when no urgent warning is present.
- Radar placements use instrument bounds measured on layout/state changes, avoiding per-frame DOM measurement. Labels try nearby positions and omit a lower-priority tag when no unobstructed slot exists. Ground bomb target rings remain in the 3D world.

## Local verification

Screenshots and JSON artifacts are generated into ignored `test-results/`. The seven-viewport UI check passes with zero browser errors. It also projects both aircraft models into screen bounds and verifies that fixed instruments, warning/notice panels, and radar labels do not cover them in the controlled scene.

The 65 unit tests, Pages build, formatting, and whitespace checks pass. The gameplay, classic camera/combat, weapon, and hazard browser suites pass on WebGL 2 with zero recorded browser errors. This WSL/Chromium session uses software WebGL; it does not establish native WebGPU rendering or frame-rate acceptance.

The new `npm run test:ui` exercises title-menu navigation, selected-loadout Enter, Pause→Graphics focus handoff, low hull, heat lockout, Beam/Rail charge, populated aircraft/radar, notices, and touch controls at 1440×900, 390×844, 320×568, 601×800, 700×600, 844×390, and 1920×1080. Its crowded HUD is a controlled playing-state fixture with simulation stepping frozen; it tests presentation and input wiring, not difficulty.

The graphics regression passes all three presets and their high-DPI ratios, repeated target cleanup, all five biomes, steady 48-degree boost framing, saved settings, and report/death/completion panel replacement/return. Browser errors are empty.

The publishable Pages build passes its production smoke at `http://127.0.0.1:4188/KnotzMoonPatrol/`: project-path assets, quality selection, controls, pause/resume, narrow layout, charged weapon release, and absent developer hooks. Both automatic selection and forced fallback used actual WebGL 2 here, with zero recorded errors. No native-backend validation is implied.

The full-route harness now requests a 1920×1080 viewport for a 1920×1080 canvas, since the former website header/footer no longer consume 104 pixels. Historical measurements retain their original dimensions; no new full-route performance result is implied by that harness adjustment.

## Critic rounds

The first two rounds identified short-screen menu collisions, critical-health color specificity, disabled-option keyboard navigation, replacement-modal focus, intermediate-width overlaps, and aircraft hidden behind generic name cards or banners. The final pass corrected those issues and added aircraft-bound checks. These are AI code/image reviews of this UI pass, not carried-over gameplay scores or human-device acceptance.

| Criterion                  | Arcade | Comfort | Engineering |
| -------------------------- | -----: | ------: | ----------: |
| Title / game identity      |    9.1 |     9.2 |         9.0 |
| Menu usability             |    8.8 |     9.0 |         8.8 |
| HUD readability            |    8.7 |     8.8 |         8.8 |
| Action visibility          |    8.8 |     8.8 |         8.8 |
| Responsive / touch comfort |    8.6 |     8.8 |         8.6 |
| Local playtest readiness   |    8.7 |     8.7 |         8.6 |

All three found no remaining UI blocker for local human playtesting. The crowded fixture contains two aircraft at selected positions; it does not prove that all moving encounters will be comfortable. Small-label glance readability and physical touch/controller use need hands-on feedback.

## Human playtest

1. Review the title at desktop size, a small phone, and landscape. Navigate with both keyboard and pointer; change a loadout, then launch with Enter.
2. Drive, brake, boost, and jump while reading hull/energy/heat. Confirm that edge instruments remain easy to glance at and driving framing remains steady.
3. Try Beam/Rail, including hold/release, overheating, and venting. On touch, hold Fire while jumping and verify that cancellation does not leave a control held.
4. Check a bomber encounter and crater warning, then pause and open Graphics and Flight Manual. Confirm that focus remains in the current panel and Escape returns to Pause.
5. Listen on real speakers/headphones and try a physical controller. Native WebGPU, physical-device comfort, human difficulty, and stable 60 FPS acceptance remain open.
