import { describe, it, expect, vi } from 'vitest';
import * as T from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { initializePhysics } from '../src/game/physics';
import { JumpAssist, landingQuality } from '../src/game/movement';
import { EncounterDirector, ENCOUNTERS, HAZARDS, advanceHazard, nextGap } from '../src/game/route';
import { Hazards, type HazardEffects } from '../src/game/hazards';
const dt = 1 / 60;
describe('jump forgiveness', () => {
  it('allows a late lip press once, but never a second midair jump', () => {
    const jump = new JumpAssist();
    jump.update(false, true, dt);
    for (let i = 0; i < 4; i++) jump.update(false, false, dt);
    expect(jump.update(true, false, dt)).toBe(true);
    jump.update(false, false, dt);
    expect(jump.update(true, false, dt)).toBe(false);
  });
  it('buffers an early landing press without auto-bouncing while held', () => {
    const jump = new JumpAssist();
    expect(jump.update(true, true, dt)).toBe(true);
    jump.update(false, false, 0.3);
    expect(jump.update(true, false, dt)).toBe(false);
    expect(jump.update(true, true, dt)).toBe(true);
    jump.update(true, false, 0.5);
    expect(jump.update(true, true, dt)).toBe(false);
  });
  it('expires old press and coyote windows', () => {
    const jump = new JumpAssist();
    jump.update(false, true, dt);
    jump.update(false, false, 0.2);
    expect(jump.update(true, false, dt)).toBe(false);
    expect(jump.update(false, true, 0.2)).toBe(false);
  });
  it('rewards slope matching only after an intentional controlled flight', () => {
    expect(landingQuality(0.25, 0.25, -6, 1, true)).toBe(true);
    expect(landingQuality(0, 0.3, -6, 1, true)).toBe(false);
    expect(landingQuality(0, 0, -6, 1, false)).toBe(false);
    expect(landingQuality(0, 0, -20, 1, true)).toBe(false);
  });
});
describe('route direction', () => {
  it('spawns each authored event once regardless of time spent braking', () => {
    const director = new EncounterDirector();
    expect(director.take(0)).toEqual([]);
    const first = director.take(20);
    expect(first.map((x) => x.id)).toEqual(['main-0']);
    for (let i = 0; i < 100; i++) expect(director.take(20)).toEqual([]);
    director.reset();
    expect(director.take(20)).toEqual(first);
  });
  it('skips old events after recovery instead of accumulating a wave', () => {
    const director = new EncounterDirector(),
      due = director.take(2320);
    expect(due.length).toBeLessThanOrEqual(2);
    expect(due.every((e) => e.x >= 2328 && e.x <= 2378)).toBe(true);
    expect(director.take(2320)).toEqual([]);
  });
  it('has unique bounded encounters and biome-specific hazards', () => {
    expect(new Set(ENCOUNTERS.map((x) => x.id)).size).toBe(ENCOUNTERS.length);
    expect(ENCOUNTERS.every((e) => e.x >= 60 && e.x < 5500)).toBe(true);
    expect(HAZARDS.filter((h) => h.kind === 'plate').every((h) => h.x >= 2200 && h.x < 3300)).toBe(
      true,
    );
    expect(HAZARDS.filter((h) => h.kind === 'canopy').every((h) => h.x >= 3300 && h.x < 4400)).toBe(
      true,
    );
    expect(nextGap(0)).toBe(105);
    expect(nextGap(106)).toBe(250);
  });
  it('requires a full 0.8 seconds from first plate contact before collapse', () => {
    const state: { phase: 'idle' | 'charging' | 'active' | 'spent'; remaining: number } = {
      phase: 'idle',
      remaining: 0,
    };
    advanceHazard(state, true, dt, 0.8, 1);
    for (let i = 0; i < 47; i++) advanceHazard(state, false, dt, 0.8, 1);
    expect(state.phase).toBe('charging');
    advanceHazard(state, false, dt, 0.8, 1);
    expect(state.phase).toBe('active');
  });
});
function effects(): HazardEffects {
  return { hurt: vi.fn(), launch: vi.fn(), notice: vi.fn(), burst: vi.fn(), rumble: vi.fn() };
}
async function fixture(kind: string) {
  await initializePhysics();
  const world = new RAPIER.World({ x: 0, y: -17, z: 0 });
  const hazards = new Hazards(new T.Scene(), world);
  const def = HAZARDS.find((h) => h.kind === kind)!;
  hazards.stream(def.x);
  world.step();
  return {
    world,
    hazards,
    def,
    dispose: () => {
      hazards.dispose();
      world.free();
    },
  };
}
describe('physical biome hazards', () => {
  it('removes the supporting Rapier bridge collider only after its contact fuse', async () => {
    const f = await fixture('plate');
    try {
      let support: RAPIER.Collider | undefined;
      f.world.colliders.forEach((c) => {
        if (Math.abs(c.translation().x - f.def.x) < 0.1) support = c;
      });
      expect(support).toBeDefined();
      const ray = new RAPIER.Ray({ x: f.def.x, y: 20, z: 0 }, { x: 0, y: -1, z: 0 });
      expect(f.world.castRay(ray, 40, true)).not.toBeNull();
      const rover = { x: f.def.x, y: 2, contacts: new Set([support!.handle]) },
        fx = effects();
      f.hazards.step(dt, rover, fx);
      for (let i = 0; i < 47; i++) f.hazards.step(dt, rover, fx);
      f.world.step();
      expect(f.world.castRay(ray, 40, true)).not.toBeNull();
      f.hazards.step(dt, rover, fx);
      f.world.step();
      expect(f.world.castRay(ray, 40, true)).toBeNull();
      expect(fx.rumble).toHaveBeenCalledTimes(1);
    } finally {
      f.dispose();
    }
  });
  it('lets the forward battery disable a charged laser core', async () => {
    const f = await fixture('crystal');
    try {
      const fx = effects(),
        rover = { x: f.def.x - 20, y: 2, contacts: new Set<number>() };
      f.hazards.step(dt, rover, fx);
      expect(f.hazards.strikeCore(f.def.x, 1, 5, fx)).toBe('destroyed');
      for (let i = 0; i < 180; i++) f.hazards.step(dt, { ...rover, x: f.def.x }, fx);
      expect(fx.hurt).not.toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });
  it('applies damage during an active laser window and not during its warning', async () => {
    const f = await fixture('laser');
    try {
      const fx = effects(),
        rover = { x: f.def.x, y: 2, contacts: new Set<number>() };
      f.hazards.step(dt, rover, fx);
      for (let i = 0; i < 60; i++) f.hazards.step(dt, rover, fx);
      expect(fx.hurt).not.toHaveBeenCalled();
      for (let i = 0; i < 10; i++) f.hazards.step(dt, rover, fx);
      expect(fx.hurt).toHaveBeenCalled();
    } finally {
      f.dispose();
    }
  });
  it('launches once per vent eruption and restores ordinary gravity after a field', async () => {
    const f = await fixture('vent');
    try {
      const fx = effects(),
        rover = { x: f.def.x, y: 2, contacts: new Set<number>() };
      for (let i = 0; i < 140; i++) f.hazards.step(dt, rover, fx);
      expect(fx.launch).toHaveBeenCalledTimes(1);
      expect(fx.launch).toHaveBeenCalledWith(15);
    } finally {
      f.dispose();
    }
    const g = await fixture('lowGravity');
    try {
      expect(g.hazards.gravityAt(g.def.x)).toBe(3);
      expect(g.hazards.gravityAt(g.def.x + g.def.width)).toBeUndefined();
      g.hazards.reset();
      expect(g.hazards.gravityAt(g.def.x)).toBeUndefined();
    } finally {
      g.dispose();
    }
  });
  it('keeps fungal cover non-solid and releases hazard resources on reset', async () => {
    const f = await fixture('canopy');
    try {
      expect(f.world.colliders.len()).toBe(0);
      expect(f.hazards.threats(f.def.x - 20).some((t) => t.label === 'CONCEALED GAP')).toBe(true);
      f.hazards.reset();
      expect(f.hazards.threats(f.def.x - 20)).toEqual([]);
    } finally {
      f.dispose();
    }
  });
});
