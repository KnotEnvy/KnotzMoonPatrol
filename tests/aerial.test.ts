import { describe, expect, it } from 'vitest';
import {
  AIR_DURATION,
  AIR_KIND_LIMITS,
  BOMB_WINDUP,
  BOMB_FALL_SPEED,
  BOMB_GRAVITY,
  createFlight,
  advanceFlight,
  bombFallTime,
  planBomb,
  type AirKind,
} from '../src/game/aerial';
import { baseHeight } from '../src/game/rules';

describe('sustained aerial patrols', () => {
  for (const kind of Object.keys(AIR_KIND_LIMITS) as AirKind[])
    it(`keeps ${kind} maneuvering at brake, cruise and boost before a bounded departure`, () => {
      for (const speed of [8, 20, 36]) {
        const f = createFlight(58, 15, 0),
          phases = new Set<string>();
        const offsets: number[] = [];
        for (let tick = 1; tick <= Math.ceil((AIR_DURATION[kind] + 2.5) * 60); tick++) {
          advanceFlight(f, kind, 58, (speed * tick) / 60, 1 / 60);
          phases.add(f.phase);
          if (f.phase === 'patrol') {
            expect(f.offset).toBeGreaterThanOrEqual(-11);
            expect(f.offset).toBeLessThanOrEqual(44);
            expect(f.y).toBeGreaterThan(8);
            offsets.push(f.offset);
          }
        }
        expect(phases).toEqual(new Set(['enter', 'patrol', 'depart', 'gone']));
        expect(offsets.length).toBeGreaterThan(700);
        expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(18);
        expect(f.phase).toBe('gone');
      }
    });
});

describe('readable ballistic bomb targets', () => {
  it('leaves reaction space ahead at all driving speeds and locks a concrete target', () => {
    for (const speed of [0, 8, 20, 36]) {
      const plan = planBomb(100, speed, 16, () => 0);
      const fall = bombFallTime(16, 0);
      expect(plan.remaining).toBe(BOMB_WINDUP);
      expect(plan.x - (100 + speed * (BOMB_WINDUP + fall))).toBeCloseTo(14);
      expect(16 + BOMB_FALL_SPEED * fall - (BOMB_GRAVITY * fall * fall) / 2).toBeCloseTo(0);
      const locked = plan.x;
      planBomb(120, 36, 16, () => 0);
      expect(plan.x).toBe(locked);
    }
  });
  it('prefers fresh road instead of the authored holes across biome transitions', () => {
    for (const x of [40, 90, 1060, 2160, 3260, 4360])
      for (const speed of [8, 20, 36]) {
        const plan = planBomb(x, speed, 16, baseHeight);
        expect(plan.x).toBeGreaterThan(x + 14);
        expect(plan.x).toBeLessThan(x + 125);
        expect(baseHeight(plan.x)).toBeGreaterThan(-2);
      }
  });
});
