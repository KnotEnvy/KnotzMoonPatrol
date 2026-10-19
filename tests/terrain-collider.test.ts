import { expect, it, vi } from 'vitest';
import * as T from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { initializePhysics } from '../src/game/physics';
import { Terrain } from '../src/game/terrain';
import { TerrainCompute } from '../src/game/terrain-compute';

vi.mock('../src/game/surfaces', () => ({ biomeSurface: () => ({}) }));

async function fixture() {
  await initializePhysics();
  const world = new RAPIER.World({ x: 0, y: -17, z: 0 });
  const terrain = new Terrain(new T.Scene(), world, new TerrainCompute());
  const compare = () => {
    const reference = new RAPIER.World({ x: 0, y: -17, z: 0 });
    try {
      for (const chunk of terrain['chunks'].values()) {
        expect(chunk.collider.shapeType()).toBe(RAPIER.ShapeType.HeightField);
        expect(chunk.collider.friction()).toBeCloseTo(0.8);
        reference.createCollider(RAPIER.ColliderDesc.trimesh(chunk.vertices, chunk.indices));
      }
      world.step();
      reference.step();
      for (const chunk of terrain['chunks'].values())
        for (const offset of [0, 0.125, 1.75, 16.3, 32.65, 48.1, 63.875, 64])
          for (const z of [-11.75, -1.17, 0, 1.17, 11.75]) {
            const ray = new RAPIER.Ray(
              { x: chunk.id * 64 + offset, y: 25, z },
              { x: 0, y: -1, z: 0 },
            );
            const expected = reference.castRayAndGetNormal(ray, 60, true)!;
            const actual = world.castRayAndGetNormal(ray, 60, true)!;
            expect(actual).not.toBeNull();
            expect(expected).not.toBeNull();
            expect(actual.timeOfImpact).toBeCloseTo(expected.timeOfImpact, 4);
            // At a chunk seam or grid row either adjoining face can win the ray query.
            if (offset > 0 && offset < 64 && z !== 0) {
              expect(actual.normal.x).toBeCloseTo(expected.normal.x, 4);
              expect(actual.normal.y).toBeCloseTo(expected.normal.y, 4);
              expect(actual.normal.z).toBeCloseTo(expected.normal.z, 4);
            }
          }
    } finally {
      reference.free();
    }
  };
  return {
    terrain,
    compare,
    dispose: () => {
      terrain.dispose();
      expect(world.colliders.len()).toBe(0);
      world.free();
    },
  };
}

it('preserves triangle-mesh heights and contact normals across all biome boundaries', async () => {
  const f = await fixture();
  try {
    for (const distance of [0, 1100, 2200, 3300, 4400, 5680]) {
      f.terrain.update(distance);
      f.compare();
    }
  } finally {
    f.dispose();
  }
});

it('preserves crater seams, edited chunks after streaming, and restored terrain on retry', async () => {
  const f = await fixture();
  try {
    f.terrain.update(64);
    await f.terrain.carve(64, f.terrain.heightAt(64), 8, 5);
    await f.terrain.carve(66, f.terrain.heightAt(66), 5, 4);
    const edited = f.terrain.heightAt(64);
    f.compare();
    f.terrain.update(1000);
    f.terrain.update(64);
    expect(f.terrain.heightAt(64)).toBe(edited);
    f.compare();
    f.terrain.reset();
    expect(f.terrain.heightAt(64)).toBeGreaterThan(edited + 4);
    f.compare();
  } finally {
    f.dispose();
  }
});
