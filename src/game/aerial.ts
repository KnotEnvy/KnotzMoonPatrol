import { clamp } from './rules';

export type AirKind = 'drone' | 'bomber' | 'hunter' | 'interceptor';
export const AIR_LIMIT = 8;
export const AIR_KIND_LIMITS = { drone: 8, bomber: 3, hunter: 3, interceptor: 2 } as const;
export const AIR_HULL = { drone: 8, bomber: 24, hunter: 16, interceptor: 10 } as const;
export const AIR_DURATION = { drone: 18, bomber: 22, hunter: 18, interceptor: 14 } as const;
export const BOMB_WINDUP = 0.85;
export const BOMB_GRAVITY = 8;
export const BOMB_FALL_SPEED = -3;
export const BOMB_LIMIT = 3;
export const BOMB_RELEASE_GAP = 2.2;
export const BOMB_TARGET_MEMORY = 8;

export function isAirKind(kind: string): kind is AirKind {
  return Object.hasOwn(AIR_KIND_LIMITS, kind);
}

export interface AirFlight {
  age: number;
  entryOffset: number;
  entryY: number;
  offset: number;
  x: number;
  y: number;
  bank: number;
  phase: 'enter' | 'patrol' | 'depart' | 'gone';
}
export function createFlight(x: number, y: number, roverX: number): AirFlight {
  return {
    age: 0,
    entryOffset: x - roverX,
    entryY: y,
    offset: x - roverX,
    x,
    y,
    bank: 0,
    phase: 'enter',
  };
}

/** Simulation-time choreography stays with the rover at brake, cruise, and boost. */
export function advanceFlight(
  f: AirFlight,
  kind: AirKind,
  seed: number,
  roverX: number,
  dt: number,
) {
  f.age += dt;
  const phase = seed * 0.41;
  const frequency = kind === 'interceptor' ? 1.15 : kind === 'bomber' ? 0.55 : 0.72;
  const center = kind === 'hunter' ? 8 : kind === 'bomber' ? 14 : 12;
  const amplitude = kind === 'bomber' ? 14 : kind === 'interceptor' ? 23 : 18;
  const t = clamp(f.age / 1.8, 0, 1),
    entry = t * t * (3 - 2 * t);
  const depart = Math.max(0, f.age - AIR_DURATION[kind]);
  const offset =
    f.entryOffset * (1 - entry) +
    (center + Math.sin(f.age * frequency + phase) * amplitude) * entry +
    depart * 32;
  // Keep the patrol silhouette in the visible sky beneath the telemetry panels.
  const altitude =
    kind === 'bomber' ? 12 : kind === 'interceptor' ? 13 : kind === 'hunter' ? 10 : 10.5;
  const lift = kind === 'bomber' ? 1 : kind === 'drone' ? 1.5 : 1.2;
  f.bank = dt > 0 ? clamp(((offset - f.offset) / dt) * -0.012, -0.28, 0.28) : f.bank;
  f.offset = offset;
  f.x = roverX + offset;
  f.y =
    f.entryY * (1 - entry) +
    (altitude + Math.sin(f.age * 1.05 + phase) * lift) * entry +
    depart * 5;
  f.phase = depart >= 2.4 ? 'gone' : depart > 0 ? 'depart' : entry < 1 ? 'enter' : 'patrol';
  return f;
}

export function bombFallTime(y: number, ground: number) {
  return (
    (BOMB_FALL_SPEED +
      Math.sqrt(BOMB_FALL_SPEED ** 2 + 2 * BOMB_GRAVITY * Math.max(0.5, y - ground))) /
    BOMB_GRAVITY
  );
}

/** Lock the road target during the warning. Speed changes can evade it afterwards. */
export function planBomb(roverX: number, speed: number, y: number, height: (x: number) => number) {
  const velocity = clamp(speed, 0, 36);
  let x = roverX + velocity * (BOMB_WINDUP + bombFallTime(y, height(roverX + 45))) + 14;
  for (let i = 0; i < 3; i++)
    x = roverX + velocity * (BOMB_WINDUP + bombFallTime(y, height(x))) + 14;
  // Prefer fresh road over an existing authored chasm; this only moves the warning forward.
  for (let offset = 0; offset <= 18; offset++)
    if (height(x + offset) > -2) return { x: x + offset, remaining: BOMB_WINDUP };
  return { x, remaining: BOMB_WINDUP };
}
