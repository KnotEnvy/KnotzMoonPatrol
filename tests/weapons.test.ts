import { describe, expect, it } from 'vitest';
import { RailCharge, rayCircleDistance, surfaceRayDistance } from '../src/game/weapons';
import { WeaponEffects } from '../src/game/weapon-effects';
import { disposeGroup } from '../src/game/models';
import * as T from 'three/webgpu';

describe('charged rail timing', () => {
  it('requires at least a quarter charge before releasing a shot', () => {
    const rail = new RailCharge();
    rail.update(true, false, 0.85 * 0.25 - 0.0001);
    expect(rail.update(false, false, 1 / 60)).toBe(0);
    rail.update(true, false, 0.85 * 0.25);
    expect(rail.update(false, false, 1 / 60)).toBe(0.25);
  });
  it('holds a full charge without firing, releases once, and requires recharging after cooldown', () => {
    const rail = new RailCharge();
    for (let i = 0; i < 120; i++) expect(rail.update(true, false, 1 / 60)).toBe(0);
    expect(rail.charge).toBe(1);
    expect(rail.update(false, false, 1 / 60)).toBe(1);
    expect(rail.update(false, false, 1 / 60)).toBe(0);
    rail.update(true, false, 0.1);
    expect(rail.charge).toBe(0);
    rail.update(true, false, 0.4);
    expect(rail.charge).toBeGreaterThan(0);
  });
  it('cancels short taps and interruption, but permits weaker partial discharges', () => {
    const rail = new RailCharge();
    rail.update(true, false, 0.1);
    expect(rail.update(false, false, 1 / 60)).toBe(0);
    rail.update(true, false, 0.4);
    expect(rail.update(false, false, 1 / 60)).toBeCloseTo(0.4 / 0.85);
    rail.reset();
    rail.update(true, false, 0.5);
    rail.update(false, true, 1 / 60);
    expect(rail.update(false, false, 1 / 60)).toBe(0);
    rail.update(true, false, 0.5);
    rail.cancel();
    expect(rail.update(false, false, 1 / 60)).toBe(0);
  });
});
describe('beam hurtboxes and terrain occlusion', () => {
  it('hits the closest entry, tangents, and the muzzle interior while rejecting targets behind/outside', () => {
    expect(rayCircleDistance(0, 0, 1, 0, 30, 10, 0, 2)).toBe(8);
    expect(rayCircleDistance(0, 0, 1, 0, 30, 10, 2, 2)).toBe(10);
    expect(rayCircleDistance(0, 0, 1, 0, 30, 0, 0, 2)).toBe(0);
    expect(rayCircleDistance(0, 0, 1, 0, 30, -10, 0, 2)).toBeNull();
    expect(rayCircleDistance(0, 0, 1, 0, 30, 10, 3, 2)).toBeNull();
    expect(rayCircleDistance(0, 0, 0, 1, 10, 0, 15, 2)).toBeNull();
  });
  it('stops at sloped/raised terrain and leaves an upward rail unobstructed', () => {
    expect(surfaceRayDistance(0, 2, 1, 0, 30, (x) => x * 0.2)).toBeCloseTo(9.6, 2);
    expect(surfaceRayDistance(0, 2, 1, 0, 30, (x) => (x >= 5 ? 3 : 0))).toBeCloseTo(5, 2);
    expect(surfaceRayDistance(0, 2, 0, 1, 55, () => 0)).toBe(55);
    expect(surfaceRayDistance(0, -1, 1, 0, 30, () => 0)).toBe(0);
    expect(
      surfaceRayDistance(0.17, 1.07, 1, 0, 3, (x) => Math.max(0, 1 - Math.abs(x - 1))),
    ).toBeLessThan(1);
  });
});
it('keeps energy/slag allocations bounded and hides them on reset', () => {
  const scene = new T.Scene(),
    effects = new WeaponEffects(scene);
  for (let i = 0; i < 100; i++) effects.melt(i, 0);
  effects.render(
    { x: 0, y: 2, length: 30, active: true },
    { x: 0, y: 2, angle: 1, length: 55, life: 0.16 },
    1,
    0,
    2,
  );
  expect(effects.energy.count).toBe(5);
  expect(effects.slag.count).toBe(16);
  expect(scene.children).toHaveLength(2);
  effects.step(5);
  effects.render(
    { x: 0, y: 2, length: 30, active: false },
    { x: 0, y: 2, angle: 1, length: 55, life: 0 },
    0,
    0,
    2,
  );
  expect(effects.slag.visible).toBe(false);
  effects.reset();
  expect(effects.energy.visible).toBe(false);
  disposeGroup(scene);
});
