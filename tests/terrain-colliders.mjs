import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import RAPIER from '@dimforge/rapier3d-compat';
import { initializePhysics } from '../src/game/physics.ts';
import { baseHeight } from '../src/game/rules.ts';
import { terrainCollider } from '../src/game/terrain-collider.ts';

// CPU-only collider construction comparison. This does not measure rendered frames.
const label = process.argv[2] ?? 'current';
assert(/^[a-z0-9-]+$/i.test(label));
await initializePhysics();
const fixtures = [0, 18, 35, 52, 69].map((id) => {
  const vertices = new Float32Array(65 * 9 * 3),
    indices = [];
  for (let x = 0; x <= 64; x++)
    for (let z = 0; z <= 8; z++) {
      const a = x * 9 + z;
      vertices.set([id * 64 + x, baseHeight(id * 64 + x, z * 3 - 12), z * 3 - 12], a * 3);
      if (x < 64 && z < 8) indices.push(a, a + 1, a + 9, a + 1, a + 10, a + 9);
    }
  return { vertices, indices: new Uint32Array(indices) };
});
const world = new RAPIER.World({ x: 0, y: -17, z: 0 });
const samples = { trimesh: [], heightfield: [] };
try {
  // Alternate order to reduce warmup/order bias; measure descriptor + create + remove.
  for (let i = 0; i < 1100; i++)
    for (const kind of i % 2 ? ['trimesh', 'heightfield'] : ['heightfield', 'trimesh']) {
      const { vertices, indices } = fixtures[i % fixtures.length];
      const t = performance.now();
      const descriptor =
        kind === 'trimesh'
          ? RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.8)
          : terrainCollider(vertices);
      const collider = world.createCollider(descriptor);
      world.removeCollider(collider, true);
      if (i >= 100) samples[kind].push(performance.now() - t);
    }
} finally {
  world.free();
}
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { samples: sorted.length, median: sorted[500], p95: sorted[950], max: sorted.at(-1) };
};
const result = {
  node: process.version,
  platform: process.platform,
  os: os.release(),
  cpu: os.cpus()[0]?.model,
  workload:
    '585 vertices / 1024 triangles, five route positions, descriptor + create + remove (ms)',
  trimesh: summarize(samples.trimesh),
  heightfield: summarize(samples.heightfield),
};
await fs.mkdir('test-results', { recursive: true });
await fs.writeFile(`test-results/terrain-colliders-${label}.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
