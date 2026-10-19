import { describe, it, expect } from 'vitest';
import { createPatrolPilot } from './helpers/patrol-pilot.mjs';

function fixture() {
  let grounded = true;
  const position = { x: 20, y: 2 };
  const g = {
    body: { translation: () => position },
    vehicle: { wheelIsInContact: () => grounded },
    terrain: { heightAt: (x) => (x > 28 && x < 40 ? -9 : 0) },
    hazards: { surfaceHeight: (_x, y) => y, active: new Map() },
    enemies: [],
    shots: [],
    strikes: [],
    state: { heat: 0, lockout: 0, railCharge: 0 },
    loadout: { sky: 'flak' },
  };
  return {
    g,
    position,
    grounded: (value) => {
      grounded = value;
    },
  };
}

describe('ordinary-control route pilot', () => {
  it('releases jump on landing before requesting another launch', () => {
    const f = fixture(),
      pilot = createPatrolPilot();
    expect(pilot(f.g).jump).toBe(true);
    f.grounded(false);
    expect(pilot(f.g).jump).toBe(true);
    f.grounded(true);
    expect(pilot(f.g).jump).toBe(false);
    expect(pilot(f.g).jump).toBe(true);
  });
  it('releases a held jump even when a blocked chassis retains wheel contact', () => {
    const f = fixture(),
      pilot = createPatrolPilot();
    const controls = Array.from({ length: 240 }, () => pilot(f.g).jump);
    expect(controls[0]).toBe(true);
    expect(controls.slice(1).some((jump) => !jump)).toBe(true);
    // A new press follows the release; no physics or resource changes are made by the pilot.
    expect(controls.some((jump, i) => i > 1 && jump && !controls[i - 1])).toBe(true);
  });
  it('continues ordinary hover when an obstacle jump leads into another gap', () => {
    const f = fixture(),
      pilot = createPatrolPilot();
    f.g.terrain.heightAt = (x) => (x >= 55 && x <= 67 ? -9 : 0);
    f.g.enemies.push({ hp: 3, kind: 'rock', x: 28, y: 1.5 });
    expect(pilot(f.g).jump).toBe(true);
    f.grounded(false);
    f.position.x = 35;
    expect(pilot(f.g).jump).toBe(true);
    f.position.x = 40;
    expect(pilot(f.g).jump).toBe(true);
  });
  it('brakes the Beam approach to a visible emitter while still airborne', () => {
    const f = fixture(),
      pilot = createPatrolPilot();
    f.g.loadout.ground = 'beam';
    f.position.y = 8;
    f.grounded(false);
    f.g.hazards.active.set('laser', { def: { kind: 'laser', x: 35 }, phase: 'active', y: 0 });
    expect(pilot(f.g).brake).toBe(true);
    f.g.hazards.active.get('laser').phase = 'spent';
    expect(pilot(f.g).brake).toBe(false);
  });
});
