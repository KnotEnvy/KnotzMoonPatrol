import { baseHeight, biomeIndex, FINISH, SECTOR_LENGTH } from './rules';

export type EncounterKind =
  'drone' | 'bomber' | 'hunter' | 'interceptor' | 'rock' | 'mine' | 'skimmer' | 'leech';
export interface Encounter {
  id: string;
  x: number;
  kind: EncounterKind;
  count: number;
  altitude: number;
}
export type HazardKind = 'plate' | 'vent' | 'crystal' | 'canopy' | 'laser' | 'lowGravity';
export interface HazardDefinition {
  id: string;
  kind: HazardKind;
  x: number;
  width: number;
}
export const GAP_START = 105;
export const GAP_PERIOD = 145;
export const GAP_WIDTH = 12;
export function nextGap(x: number) {
  const index = Math.max(0, Math.ceil((x - GAP_START) / GAP_PERIOD));
  return GAP_START + index * GAP_PERIOD;
}
export function gapDistance(x: number) {
  const start = GAP_START + Math.max(0, Math.floor((x - GAP_START) / GAP_PERIOD)) * GAP_PERIOD;
  return x >= start && x <= start + GAP_WIDTH ? 0 : nextGap(x) - x;
}
export function safeGroundPosition(preferred: number) {
  // Keep authored enemies and emitters off crater lips. Search locally, preserving pacing.
  for (let offset = 0; offset <= 32; offset += 2)
    for (const direction of [1, -1]) {
      const x = preferred + offset * direction;
      if (baseHeight(x) > -1.5 && baseHeight(x - 8) > -1.5 && baseHeight(x + 8) > -1.5) return x;
    }
  return preferred;
}
export function buildEncounters(): Encounter[] {
  const result: Encounter[] = [];
  for (let sector = 0; sector < 25; sector++) {
    const origin = sector * SECTOR_LENGTH,
      biome = biomeIndex(origin);
    const kinds: EncounterKind[][] = [
      ['rock', 'drone', 'bomber', 'drone', 'skimmer'],
      ['drone', 'hunter', 'mine', 'bomber', 'drone'],
      ['bomber', 'skimmer', 'interceptor', 'drone', 'bomber'],
      ['hunter', 'leech', 'drone', 'bomber', 'mine'],
      ['interceptor', 'bomber', 'skimmer', 'hunter', 'drone'],
    ];
    const kind = kinds[biome][sector % 5];
    result.push({
      id: 'main-' + sector,
      x: safeGroundPosition(origin + 75),
      kind,
      count: kind === 'drone' ? 3 + Math.min(biome, 2) : 1,
      altitude: kind === 'bomber' ? 15 : kind === 'interceptor' ? 19 : 10,
    });
    // A recovery stretch around letter/checkpoint boundaries; no time-based spawn accumulation while braking.
    if (sector > 0)
      result.push({
        id: 'secondary-' + sector,
        x: safeGroundPosition(origin + 173),
        kind: sector % 3 === 0 ? 'mine' : sector % 3 === 1 ? 'rock' : 'drone',
        count: sector % 3 === 2 ? 3 : 1,
        altitude: 11,
      });
  }
  // Teach a jump before layering aerial pressure over a gap.
  result.push({ id: 'first-flight', x: 155, kind: 'drone', count: 3, altitude: 11 });
  return result.sort((a, b) => a.x - b.x);
}
export const ENCOUNTERS = buildEncounters();
export class EncounterDirector {
  private cursor = 0;
  reset() {
    this.cursor = 0;
  }
  take(distance: number): Encounter[] {
    const due: Encounter[] = [];
    while (this.cursor < ENCOUNTERS.length && ENCOUNTERS[this.cursor].x - distance <= 58) {
      const event = ENCOUNTERS[this.cursor++];
      if (event.x >= distance + 8) due.push(event);
    }
    return due;
  }
}
export function buildHazards(): HazardDefinition[] {
  const result: HazardDefinition[] = [];
  for (let x = GAP_START; x < FINISH - 150; x += GAP_PERIOD) {
    const biome = biomeIndex(x + GAP_WIDTH / 2);
    if (biome === 2)
      result.push({ id: 'plate-' + x, kind: 'plate', x: x + GAP_WIDTH / 2, width: GAP_WIDTH + 2 });
    if (biome === 3)
      result.push({ id: 'canopy-' + x, kind: 'canopy', x: x + GAP_WIDTH / 2, width: GAP_WIDTH });
  }
  for (let sector = 5; sector < 25; sector++) {
    const origin = sector * SECTOR_LENGTH,
      biome = biomeIndex(origin);
    if (biome === 1)
      result.push({
        id: 'crystal-' + sector,
        kind: 'crystal',
        x: safeGroundPosition(origin + 125),
        width: 3,
      });
    if (biome === 2)
      result.push({
        id: 'vent-' + sector,
        kind: 'vent',
        x: safeGroundPosition(origin + 178),
        width: 5,
      });
    if (biome === 4) {
      result.push({
        id: 'laser-' + sector,
        kind: 'laser',
        x: safeGroundPosition(origin + 125),
        width: 3,
      });
      if (sector % 2 === 0)
        result.push({ id: 'gravity-' + sector, kind: 'lowGravity', x: origin + 55, width: 48 });
    }
  }
  return result.sort((a, b) => a.x - b.x);
}
export const HAZARDS = buildHazards();
export type HazardPhase = 'idle' | 'charging' | 'active' | 'spent';
export interface HazardClock {
  phase: HazardPhase;
  remaining: number;
}
export function advanceHazard(
  clock: HazardClock,
  trigger: boolean,
  dt: number,
  delay: number,
  duration: number,
): HazardPhase | null {
  const before = clock.phase;
  if (clock.phase === 'idle' && trigger) {
    clock.phase = 'charging';
    clock.remaining = delay;
  } else if (clock.phase === 'charging') {
    clock.remaining = Math.max(0, clock.remaining - dt);
    if (clock.remaining < 1e-7) {
      clock.phase = 'active';
      clock.remaining = duration;
    }
  } else if (clock.phase === 'active') {
    clock.remaining = Math.max(0, clock.remaining - dt);
    if (clock.remaining < 1e-7) clock.phase = 'spent';
  }
  return before === clock.phase ? null : clock.phase;
}
