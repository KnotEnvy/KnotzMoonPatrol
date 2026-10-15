// Test driver only: reads nearby terrain/threats and sends ordinary controls.
// It never changes physics, damage, resources, spawns, or the rover's position.
export function createPatrolPilot() {
  let holdingUntil = -Infinity;
  let cooling = false;
  let release = false;
  return (g) => {
    const p = g.body.translation();
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
    const obstacle = g.enemies.find(
      (e) =>
        e.hp > 0 && ['rock', 'mine', 'skimmer'].includes(e.kind) && e.x > p.x && e.x - p.x < 11,
    );
    let jump = false;
    if (release) release = false;
    else if (grounded && ((edge !== null && edge - p.x < 12) || obstacle)) {
      holdingUntil = end ?? p.x + 18;
      jump = true;
    } else if (!grounded && p.x < holdingUntil) jump = true;
    else if (holdingUntil !== -Infinity) {
      holdingUntil = -Infinity;
      release = true;
    }
    if (g.state.heat > 78 || g.state.lockout > 0) cooling = true;
    if (g.state.heat < 20 && g.state.lockout === 0) cooling = false;
    const target = g.enemies.some((e) => e.hp > 0 && e.x > p.x - 16 && e.x < p.x + 44);
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
      brake: blocked && grounded,
      boost: tractor || strike,
      jump,
      fire,
      vent: cooling,
      pitch: 0,
    };
  };
}
