// Test driver only: reads nearby terrain/threats and sends ordinary controls.
// It never changes physics, damage, resources, spawns, or the rover's position.
export function createPatrolPilot() {
  let holdingUntil = -Infinity;
  let cooling = false;
  let previousJump = false;
  let wasGrounded = true;
  let lastX = -Infinity;
  let stalled = 0;
  let holdTime = 0;
  return (g) => {
    const p = g.body.translation();
    stalled = p.x - lastX < 0.015 ? stalled + 1 / 60 : 0;
    lastX = p.x;
    const grounded = Array.from({ length: 6 }, (_, i) => g.vehicle.wheelIsInContact(i)).some(
      Boolean,
    );
    const ground = (x) => g.hazards.surfaceHeight(x, g.terrain.heightAt(x));
    let edge = null,
      end = null;
    for (let ahead = 3; ahead <= 42; ahead++) {
      if (ground(p.x + ahead) < -2.5 && edge === null) edge = p.x + ahead;
      if (edge !== null && ground(p.x + ahead) > -1.5) {
        end = p.x + ahead;
        break;
      }
    }
    // An obstacle jump can lead directly into a gap. Keep its normal hover until
    // the whole chassis clears the next lip instead of dropping with unused energy.
    if (!grounded && previousJump && end !== null) holdingUntil = Math.max(holdingUntil, end + 4);
    const obstacle = g.enemies.find(
      (e) =>
        e.hp > 0 && ['rock', 'mine', 'skimmer'].includes(e.kind) && e.x > p.x && e.x - p.x < 11,
    );
    const landed = grounded && !wasGrounded;
    wasGrounded = grounded;
    let jump = false;
    if (previousJump && (landed || holdTime >= 3)) holdingUntil = -Infinity;
    else if (
      grounded &&
      !previousJump &&
      ((edge !== null && edge - p.x < 12) || obstacle || stalled > 1.5)
    ) {
      holdingUntil = end !== null ? end + 4 : p.x + 18;
      jump = true;
      stalled = 0;
    } else if (previousJump && p.x < holdingUntil && holdTime < 3) jump = true;
    holdTime = jump ? holdTime + 1 / 60 : 0;
    previousJump = jump;
    if (g.state.heat > 78 || g.state.lockout > 0) cooling = true;
    if (g.state.heat < 20 && g.state.lockout === 0) cooling = false;
    const target =
      g.enemies.some((e) => e.hp > 0 && e.x > p.x - 16 && e.x < p.x + 44) ||
      g.shots.some(
        (s) => s.active && s.enemy && s.type === 'bomb' && s.y > p.y && Math.abs(s.x - p.x) < 35,
      );
    const emitter = [...g.hazards.active.values()].some(
      (h) =>
        ['crystal', 'laser'].includes(h.def.kind) &&
        h.phase !== 'spent' &&
        h.def.x > p.x &&
        h.def.x < p.x + 40,
    );
    const tractor = g.enemies.some((e) => e.kind === 'hunter' && Math.abs(e.x - p.x) < 5);
    const strike = g.strikes.some((s) => !s.fired && Math.abs(s.x - p.x) < 7 && s.timer < 0.6);
    const fire =
      !cooling && (target || emitter) && !(g.loadout.sky === 'rail' && g.state.railCharge >= 0.95);
    const blocked = [...g.hazards.active.values()].some(
      (h) =>
        ['crystal', 'laser'].includes(h.def.kind) &&
        h.phase !== 'spent' &&
        h.def.x > p.x &&
        h.def.x < p.x + 22,
    );
    return {
      brake: blocked && (grounded || g.loadout.ground === 'beam'),
      boost: tractor || strike,
      jump,
      fire,
      vent: cooling,
      pitch: 0,
    };
  };
}
