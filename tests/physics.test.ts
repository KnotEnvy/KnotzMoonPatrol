import { expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { initializePhysics } from '../src/game/physics';
it('shares WASM initialization and preserves existing world handles across remounts', async () => {
  const a = initializePhysics(),
    b = initializePhysics();
  expect(a).toBe(b);
  await Promise.all([a, b]);
  const world = new RAPIER.World({ x: 0, y: -10, z: 0 });
  try {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 10, 0));
    world.createCollider(RAPIER.ColliderDesc.ball(0.5), body);
    world.step();
    await initializePhysics();
    world.step();
    expect(body.translation().y).toBeLessThan(10);
    expect(Number.isFinite(body.linvel().y)).toBe(true);
  } finally {
    world.free();
  }
});
