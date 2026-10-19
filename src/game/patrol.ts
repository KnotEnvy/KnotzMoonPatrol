import { GAP_WIDTH, nextGap } from './route';

/** Bank clearance points only after an intentional, undamaged jump lands.
 * Crossings must clear the whole chassis; recovery teleports never earn points. */
export class PatrolJump {
  private takeoff: number | null = null;
  private obstacles = new Set<object>();
  private bonus = 0;
  reset() {
    this.takeoff = null;
    this.obstacles.clear();
    this.bonus = 0;
  }
  launch(x: number) {
    this.reset();
    this.takeoff = x;
  }
  cross(obstacle: object, kind: string, x: number, y: number, roverX: number, roverY: number) {
    const points = kind === 'rock' ? 100 : kind === 'mine' ? 150 : kind === 'skimmer' ? 200 : 0;
    if (this.takeoff === null || !points || this.obstacles.has(obstacle)) return;
    if (this.takeoff > x - 2.6 || roverX < x + 3 || roverX > x + 6 || roverY < y + 2.6) return;
    this.obstacles.add(obstacle);
    this.bonus += points;
  }
  land(x: number) {
    if (this.takeoff === null) return 0;
    let bonus = this.bonus;
    for (let gap = nextGap(this.takeoff + 2.6); gap + GAP_WIDTH + 2.6 <= x; gap = nextGap(gap + 1))
      bonus += 50;
    this.reset();
    return bonus;
  }
}
