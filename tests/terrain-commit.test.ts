import { describe, it, expect, vi } from 'vitest';
import * as T from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { initializePhysics } from '../src/game/physics';
import { Terrain } from '../src/game/terrain';
import { TerrainCompute } from '../src/game/terrain-compute';

async function fixture() {
  await initializePhysics();
  const world = new RAPIER.World({ x: 0, y: -17, z: 0 }),
    scene = new T.Scene(),
    compute = new TerrainCompute(),
    terrain = new Terrain(scene, world, compute);
  const chunks = new Map<
    number,
    {
      id: number;
      group: T.Group;
      mesh: T.Mesh;
      collider: RAPIER.Collider;
      vertices: Float32Array;
      indices: Uint32Array;
      version: number;
    }
  >();
  for (let id = 0; id < 2; id++) {
    const left = 62 + id * 2,
      vertices = new Float32Array([left, 0, -1, left, 0, 1, left + 2, 0, -1, left + 2, 0, 1]),
      indices = new Uint32Array([0, 1, 2, 1, 3, 2]);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(vertices, 3));
    geometry.setIndex(new T.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial()),
      group = new T.Group();
    group.add(mesh);
    scene.add(group);
    const collider = world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices));
    chunks.set(id, { id, group, mesh, collider, vertices, indices, version: 0 });
  }
  (terrain as unknown as { chunks: typeof chunks }).chunks = chunks;
  world.step();
  const deferred: { vertices: Float32Array; resolve: (v: Float32Array) => void }[] = [];
  vi.spyOn(compute, 'carve').mockImplementation(
    (vertices) => new Promise((resolve) => deferred.push({ vertices, resolve })),
  );
  const lowered = (v: Float32Array) => {
    const result = v.slice();
    for (let i = 1; i < result.length; i += 3) result[i] = -4;
    return result;
  };
  const resolveAll = () => deferred.forEach((d) => d.resolve(lowered(d.vertices)));
  const rayY = (x: number) => {
    const hit = world.castRay(new RAPIER.Ray({ x, y: 20, z: 0 }, { x: 0, y: -1, z: 0 }), 40, true);
    return hit ? 20 - hit.timeOfImpact : null;
  };
  return {
    world,
    terrain,
    chunks,
    deferred,
    lowered,
    resolveAll,
    rayY,
    dispose: () => {
      terrain.dispose();
      world.free();
    },
  };
}
describe('crater commits across chunk boundaries', () => {
  it('waits for both readbacks and changes both physics surfaces in one commit', async () => {
    const f = await fixture();
    try {
      const attribute = f.chunks.get(0)!.mesh.geometry.getAttribute('position');
      const run = f.terrain.carve(64, 0, 5, 4);
      await Promise.resolve();
      expect(f.deferred).toHaveLength(2);
      f.deferred[0].resolve(f.lowered(f.deferred[0].vertices));
      await Promise.resolve();
      await Promise.resolve();
      expect(f.chunks.get(0)!.vertices[1]).toBe(0);
      expect(f.rayY(63)).toBe(0);
      expect(f.rayY(65)).toBe(0);
      f.deferred[1].resolve(f.lowered(f.deferred[1].vertices));
      await run;
      f.world.step();
      expect(f.rayY(63)).toBeCloseTo(-4);
      expect(f.rayY(65)).toBeCloseTo(-4);
      expect(f.chunks.get(0)!.mesh.geometry.getAttribute('position')).toBe(attribute);
      expect(f.world.colliders.len()).toBe(2);
    } finally {
      f.dispose();
    }
  });
  it('preserves the old surface and removes staged colliders when one replacement fails', async () => {
    const f = await fixture(),
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const original = f.world.createCollider.bind(f.world);
      let count = 0;
      const create = vi.spyOn(f.world, 'createCollider').mockImplementation((...args) => {
        if (++count === 2) throw new Error('replacement rejected');
        return original(...args);
      });
      const run = f.terrain.carve(64, 0);
      await Promise.resolve();
      f.resolveAll();
      await run;
      create.mockRestore();
      f.world.step();
      expect(f.chunks.get(0)!.vertices[1]).toBe(0);
      expect(f.chunks.get(1)!.vertices[1]).toBe(0);
      expect(f.world.colliders.len()).toBe(2);
      expect(f.rayY(63)).toBe(0);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
      f.dispose();
    }
  });
  it('drops a completed brush after its terrain has been disposed', async () => {
    const f = await fixture();
    const run = f.terrain.carve(64, 0);
    await Promise.resolve();
    f.terrain.dispose();
    const create = vi.spyOn(f.world, 'createCollider');
    f.resolveAll();
    await run;
    expect(create).not.toHaveBeenCalled();
    expect(f.world.colliders.len()).toBe(0);
    create.mockRestore();
    f.world.free();
  });
});
