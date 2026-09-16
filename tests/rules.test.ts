import { describe, it, expect } from 'vitest';
import {
  initialTelemetry,
  updateEnergy,
  addHeat,
  checkpointBonus,
  biomeIndex,
  sectorIndex,
  FINISH,
  baseHeight,
  FIXED_DT,
} from '../src/game/rules';
import { TerrainCompute } from '../src/game/terrain-compute';
const idle = { brake: false, boost: false, jump: false, fire: false, vent: false, pitch: 0 };
describe('energy and thermal rules', () => {
  it('prevents firing throughout the three-second lockout and recovers', () => {
    const s = initialTelemetry();
    s.heat = 97;
    expect(addHeat(s, 7)).toBe(true);
    expect(s.lockout).toBe(3);
    for (let i = 0; i < 179; i++) {
      expect(addHeat(s, 7)).toBe(false);
      updateEnergy(s, idle, false, FIXED_DT);
    }
    expect(s.lockout).toBeGreaterThan(0);
    updateEnergy(s, idle, false, 0.05);
    expect(addHeat(s, 7)).toBe(true);
  });
  it('shares one capacitor between overdrive and hover without going negative', () => {
    const s = initialTelemetry();
    s.capacitor = 10;
    for (let i = 0; i < 300; i++)
      updateEnergy(s, { ...idle, boost: true, jump: true }, true, FIXED_DT);
    expect(s.capacitor).toBeGreaterThanOrEqual(0);
    expect(s.capacitor).toBeLessThan(1);
  });
  it('recharges without overfilling and vents faster than passive cooling', () => {
    const a = initialTelemetry(),
      b = initialTelemetry();
    a.heat = b.heat = 80;
    a.capacitor = 99;
    updateEnergy(a, { ...idle, vent: true }, false, 1);
    updateEnergy(b, idle, false, 1);
    expect(a.heat).toBeLessThan(b.heat);
    expect(a.capacitor).toBe(100);
  });
});
describe('A to Z progression', () => {
  it('maps every sector and biome boundary without overflow', () => {
    expect(biomeIndex(-128)).toBe(0);
    expect(sectorIndex(0)).toBe(0);
    expect(sectorIndex(219.9)).toBe(0);
    expect(sectorIndex(220)).toBe(1);
    expect(biomeIndex(1099)).toBe(0);
    expect(biomeIndex(1100)).toBe(1);
    expect(biomeIndex(4400)).toBe(4);
    expect(sectorIndex(FINISH)).toBe(25);
    expect(biomeIndex(FINISH)).toBe(4);
  });
  it('awards no-damage and par-time bonuses only when earned', () => {
    expect(checkpointBonus(70, 0, 0, 10)).toBe(0);
    expect(checkpointBonus(70, 0, 0, 0)).toBe(1500);
    expect(checkpointBonus(60, 2, 1, 0)).toBe(2450);
  });
  it('authors a safe starting runway and real traversable gaps', () => {
    expect(baseHeight(0)).toBeCloseTo(0);
    expect(baseHeight(111)).toBeLessThan(-7);
    expect(baseHeight(120)).toBeGreaterThan(-2);
  });
});
describe('terrain deformation fallback', () => {
  it('carves only inside the brush, leaves the input intact, and never raises terrain', async () => {
    const compute = new TerrainCompute();
    const vertices = new Float32Array([-10, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 8]);
    const result = await compute.carve(vertices, 0, 0, 5, 4);
    expect(result[1]).toBe(0);
    expect(result[4]).toBe(-4);
    expect(result[7]).toBeCloseTo(-3.2);
    expect(result[10]).toBe(0);
    expect(vertices[4]).toBe(0);
    const again = await compute.carve(result, 0, 2, 5, 2);
    expect(again[4]).toBe(-4);
  });
});
