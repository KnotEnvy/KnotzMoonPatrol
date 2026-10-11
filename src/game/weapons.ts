export const BEAM_RANGE = 30;
export const RAIL_RANGE = 55;
export const RAIL_CHARGE_SECONDS = 0.85;
export const RAIL_MIN_CHARGE = 0.25;

/** Fixed-step charge, deliberately cancelled by pause/vent/lockout rather than released. */
export class RailCharge {
  charge = 0;
  cooldown = 0;
  update(held: boolean, blocked: boolean, dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (blocked || this.cooldown > 0) {
      this.charge = 0;
      return 0;
    }
    if (held) {
      this.charge = Math.min(1, this.charge + dt / RAIL_CHARGE_SECONDS);
      return 0;
    }
    const strength = this.charge >= RAIL_MIN_CHARGE ? this.charge : 0;
    this.charge = 0;
    if (strength) this.cooldown = 0.4;
    return strength;
  }
  cancel() {
    this.charge = 0;
  }
  reset() {
    this.charge = 0;
    this.cooldown = 0;
  }
}

/** Distance to the first circular combat hurtbox on a unit-direction ray. */
export function rayCircleDistance(
  x: number,
  y: number,
  dx: number,
  dy: number,
  range: number,
  cx: number,
  cy: number,
  radius: number,
) {
  const ox = cx - x,
    oy = cy - y;
  const projection = ox * dx + oy * dy;
  const perpendicular2 = ox * ox + oy * oy - projection * projection;
  if (perpendicular2 > radius * radius) return null;
  const half = Math.sqrt(Math.max(0, radius * radius - perpendicular2));
  if (projection + half < 0) return null;
  const distance = Math.max(0, projection - half);
  return distance <= range ? distance : null;
}

/** Visit terrain grid vertices as well as half-metre samples, so narrow crests
 * cannot slip between samples. Hazard plate tops are included by the caller. */
export function surfaceRayDistance(
  x: number,
  y: number,
  dx: number,
  dy: number,
  range: number,
  height: (x: number) => number,
) {
  const buried = (t: number) => y + dy * t <= height(x + dx * t) + 0.08;
  if (buried(0)) return 0;
  let previous = 0;
  while (previous < range) {
    const px = x + dx * previous;
    const gridX = dx > 0 ? Math.floor(px + 1e-7) + 1 : Math.ceil(px - 1e-7) - 1;
    const gridT = Math.abs(dx) < 1e-8 ? Infinity : (gridX - x) / dx;
    const t = Math.min(range, previous + 0.5, gridT);
    if (!buried(t)) {
      previous = t;
      continue;
    }
    let lo = previous,
      hi = t;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (buried(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  return range;
}
