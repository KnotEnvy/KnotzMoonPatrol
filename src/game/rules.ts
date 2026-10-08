export type Phase = 'menu' | 'playing' | 'paused' | 'report' | 'dead' | 'complete';
export type Weapon = 'pulse' | 'beam' | 'seismic';
export type SkyWeapon = 'flak' | 'rail' | 'seeker';
export const SECTOR_LENGTH = 220;
export const FINISH = SECTOR_LENGTH * 26;
export const FIXED_DT = 1 / 60;
export const BIOMES = [
  {
    name: 'Mare Tranquillitatis',
    sub: 'LUNAR BASALT FIELDS',
    range: 'A — E',
    color: '#8ce3ea',
    ground: '#68777f',
    sky: '#080f1c',
    gravity: 17,
    description: 'Beyond the silence, something is moving.',
  },
  {
    name: 'Crystalline Spires',
    sub: 'THE FROZEN FRONTIER',
    range: 'F — J',
    color: '#c3a4ff',
    ground: '#79799e',
    sky: '#100d25',
    gravity: 18,
    description: 'A thousand prisms. Nowhere to hide.',
  },
  {
    name: 'Magma Fissures',
    sub: 'OBSIDIAN FAULT LINE',
    range: 'K — O',
    color: '#ff965a',
    ground: '#554a48',
    sky: '#25100d',
    gravity: 22,
    description: 'Keep moving. The crust will not.',
  },
  {
    name: 'Bioluminescent Chasm',
    sub: 'THE LIVING DARK',
    range: 'P — T',
    color: '#a5f5aa',
    ground: '#405b58',
    sky: '#041815',
    gravity: 16,
    description: 'The light down here is alive.',
  },
  {
    name: 'Orbital Citadel',
    sub: 'CORE UPLINK',
    range: 'U — Z',
    color: '#ff8095',
    ground: '#606677',
    sky: '#160b1d',
    gravity: 12,
    description: 'One last transmission. One way through.',
  },
] as const;
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const biomeIndex = (x: number) => clamp(Math.floor(x / (SECTOR_LENGTH * 5)), 0, 4);
export const sectorIndex = (x: number) => clamp(Math.floor(x / SECTOR_LENGTH), 0, 25);
export const sectorLetter = (x: number) => String.fromCharCode(65 + sectorIndex(x));
export function randomAt(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function baseHeight(x: number, z = 0) {
  const roll = Math.sin(x * 0.021) * 0.75 + Math.sin(x * 0.081) * 0.24;
  // A gradual approach lip makes each authored gap readable at cruising speed.
  const cell = (((x - 105) % 145) + 145) % 145;
  const gap = x > 100 && cell < 12;
  const edge = gap ? Math.min(cell, 12 - cell) : 0;
  return roll - (gap ? Math.min(9, edge * 5) : 0) + Math.sin(x * 0.16 + z * 0.9) * 0.06;
}
export interface Input {
  brake: boolean;
  boost: boolean;
  jump: boolean;
  fire: boolean;
  vent: boolean;
  pitch: number;
}
export interface RadarMarker {
  id: string;
  x: number;
  y: number;
  label: string;
  distance: number;
  urgent: boolean;
  offscreen: boolean;
}
export interface Telemetry {
  radar: RadarMarker[];
  lowGravity: boolean;
  phase: Phase;
  distance: number;
  speed: number;
  hull: number;
  capacitor: number;
  heat: number;
  lockout: number;
  score: number;
  kills: number;
  clean: number;
  time: number;
  sector: number;
  biome: number;
  warning: string;
  notice: string;
  backend: string;
  fps: number;
  boss: number;
  best: number;
  reportTime: number;
  reportKills: number;
  reportClean: number;
  reportBonus: number;
  reportDamage: number;
}
export function initialTelemetry(best = 0): Telemetry {
  return {
    radar: [],
    lowGravity: false,
    phase: 'menu',
    distance: 0,
    speed: 0,
    hull: 100,
    capacitor: 100,
    heat: 0,
    lockout: 0,
    score: 0,
    kills: 0,
    clean: 0,
    time: 0,
    sector: 0,
    biome: 0,
    warning: '',
    notice: '',
    backend: 'INITIALIZING',
    fps: 0,
    boss: 100,
    best,
    reportTime: 0,
    reportKills: 0,
    reportClean: 0,
    reportBonus: 0,
    reportDamage: 0,
  };
}
export function updateEnergy(s: Telemetry, input: Input, airborne: boolean, dt: number) {
  const boosting = input.boost && s.capacitor > 0;
  const hovering = airborne && input.jump && s.capacitor > 0;
  s.capacitor = clamp(
    s.capacitor +
      dt *
        (boosting || hovering
          ? -(boosting ? 23 : 0) - (hovering ? 17 : 0)
          : input.boost || (airborne && input.jump)
            ? 0
            : 13),
    0,
    100,
  );
  s.lockout = Math.max(0, s.lockout - dt);
  s.heat = Math.max(0, s.heat - dt * (input.vent ? 55 : input.fire && s.lockout === 0 ? 4 : 24));
  return { boosting, hovering };
}
export function addHeat(s: Telemetry, value: number) {
  if (s.lockout > 0) return false;
  s.heat = clamp(s.heat + value, 0, 100);
  if (s.heat >= 100) s.lockout = 3;
  return true;
}
export function checkpointBonus(time: number, kills: number, clean: number, damage: number) {
  return (
    Math.max(0, Math.round((65 - time) * 80)) +
    kills * 150 +
    clean * 250 +
    (damage === 0 ? 1500 : 0)
  );
}
