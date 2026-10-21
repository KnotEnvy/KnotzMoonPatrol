# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0-beta.1] - 2026-10-21

First public beta, playable at <https://knotenvy.github.io/KnotzMoonPatrol/>.

### Added

- Redesigned classic arcade-style title screen.
- Social sharing and search metadata: consistent page title, Open Graph and Twitter cards, JSON-LD structured data, web app manifest with 192/512 px icons, `robots.txt`, `sitemap.xml`, and a `<noscript>` message. `npm run test:seo` checks the built output.
- Beta feedback issue forms (bug report, gameplay feedback), a pull request template, and a README written for beta testers.
- Branded share art and app icons.
- Visible puff of steam when weapon heat is vented.
- Blender-built model libraries for the rover, enemies and scenery, with a reproducible `npm run assets:build` pipeline.
- Classic patrol gameplay: sustained saucer and bomber patrols, warned shootable bombs that carve craters, tractor hunters, interceptors, skimmers, mines, rocks and leech threats, in a distance-authored A-Z route with reports after sectors E, J, O and T and a sector-Z mothership.
- Weapons: three forward weapons (Pulse Vulcan, Resonance Beam, Seismic Spreader) and three sky weapons (Flak Cannon, Tachyon Railgun, Seeker Missiles), shared thermal lockout, vent, capacitor and rear EMP. Beam stays active while held; the Railgun charges on hold and fires on release.
- Biome hazards: contact-triggered collapsing bridges, magma vents, destructible laser emitters, concealed acid gaps, and low-gravity fields.
- Graphics presets (Performance, Balanced, Cinematic) with biome PBR surfaces, blended lighting and rover headlights; WebGPU bloom and lens effects on Cinematic.
- Streamed, deformable terrain with bounded crater brushes and matching physics colliders.
- Procedural Web Audio soundtrack and effects.
- Touch controls and standard gamepad mapping (not yet validated on physical devices).
- GitHub Pages deployment with validation and a live-site check.

### Changed

- Rover cruise speed is lower, and boost now tops out at the previous cruise speed.
- Jump gravity is stronger so the rover falls faster; low-gravity zones stay floaty.
- Weapon heat builds more slowly, and venting is faster.
- Top turret (sky weapon) shots travel faster.
- Unified visual style across the HUD, pause menu, hangar, route reports and end screens.
- Driving camera uses a steady field of view at every speed.
- Page title is now "Void Runner — Moon Patrol Remake | Free Browser Game" across the page, Open Graph and Twitter tags.
- Package version set to 1.0.0-beta.1.

### Known issues

See the [release notes](docs/RELEASE-NOTES-v1.0.0-beta.1.md#known-issues).

[Unreleased]: https://github.com/KnotEnvy/KnotzMoonPatrol/compare/v1.0.0-beta.1...HEAD
[1.0.0-beta.1]: https://github.com/KnotEnvy/KnotzMoonPatrol/releases/tag/v1.0.0-beta.1
