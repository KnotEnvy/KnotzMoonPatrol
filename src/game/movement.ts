import { clamp } from './rules';
/** Consume one press, allowing 100 ms off a lip and 140 ms before touchdown. */
export class JumpAssist {
  private down = false;
  private grace = 0;
  private buffer = 0;
  private spent = false;
  private leftGround = false;
  reset() {
    this.down = false;
    this.grace = 0;
    this.buffer = 0;
    this.spent = false;
    this.leftGround = false;
  }
  update(pressed: boolean, grounded: boolean, dt: number) {
    if (!grounded) this.leftGround = true;
    if (grounded && this.leftGround) {
      this.spent = false;
      this.leftGround = false;
    }
    this.grace = grounded && !this.spent ? 0.1 : Math.max(0, this.grace - dt);
    this.buffer = pressed && !this.down ? 0.14 : Math.max(0, this.buffer - dt);
    this.down = pressed;
    if (this.buffer > 0 && this.grace > 0 && !this.spent) {
      this.buffer = 0;
      this.grace = 0;
      this.spent = true;
      return true;
    }
    return false;
  }
}
export function landingQuality(
  angle: number,
  slope: number,
  downwardSpeed: number,
  airtime: number,
  intentional: boolean,
) {
  return intentional && airtime > 0.3 && Math.abs(angle - slope) < 0.18 && downwardSpeed > -17;
}
export function terrainPitch(left: number, right: number, distance = 3.1) {
  return clamp(Math.atan2(right - left, distance), -0.349, 0.349);
}
