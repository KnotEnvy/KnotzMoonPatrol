import { describe, it, expect, vi } from 'vitest';
import * as T from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { initializePhysics } from '../src/game/physics';
import { Terrain } from '../src/game/terrain';
import { TerrainCompute } from '../src/game/terrain-compute';
import { EnemyModels } from '../src/game/enemy-models';
import { Hazards } from '../src/game/hazards';
import { HAZARDS } from '../src/game/route';

vi.mock('../src/game/surfaces', () => ({ biomeSurface: () => ({}) }));
// Keep loading-screen yields deterministic without needing a browser canvas.
vi.stubGlobal('requestAnimationFrame', (fn: (time: number) => void) => {
  fn(0);
  return 0;
});

describe('prepared route ownership', () => {
  it('reuses a bounded route cache and discards craters queued before a restart', async () => {
    await initializePhysics();
    const world = new RAPIER.World({ x: 0, y: -17, z: 0 });
    const terrain = new Terrain(new T.Scene(), world, new TerrainCompute());
    try {
      // Batching must preserve all triangles and their material/shadow assignments.
      const triangles = (groups: T.Group[]) => {
        const counts: Record<string, number> = {};
        for (const group of groups)
          group.traverse((object) => {
            if (!(object instanceof T.Mesh)) return;
            const key = `${(object.material as T.Material).uuid}:${object.castShadow}:${object.receiveShadow}`;
            counts[key] =
              (counts[key] ?? 0) +
              (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
          });
        return counts;
      };
      const expected: Record<string, number> = {};
      const build = terrain['build'].bind(terrain);
      const building = vi.spyOn(terrain, 'build' as never).mockImplementation(((id: number) => {
        const chunk = build(id);
        for (const [key, count] of Object.entries(triangles([chunk.group])))
          expected[key] = (expected[key] ?? 0) + count;
        return chunk;
      }) as never);
      await terrain.prepare();
      building.mockRestore();
      expect(triangles(terrain.warmupGroups())).toEqual(expected);
      const size = terrain['prepared'].size;
      expect(size).toBe(95);
      const createCollider = vi.spyOn(world, 'createCollider');
      for (let x = 0; x <= 5720; x += 64) {
        terrain.update(x);
        let enabled = 0;
        world.colliders.forEach((collider) => {
          if (collider.isEnabled()) enabled++;
        });
        expect(enabled).toBeLessThanOrEqual(6);
        expect(world.colliders.len()).toBe(size);
        expect(terrain['prepared'].size).toBe(size);
      }
      terrain.reset();
      expect(createCollider).not.toHaveBeenCalled();
      createCollider.mockRestore();
      const before = terrain.heightAt(32);
      const old = terrain.carve(32, before, 5, 4);
      terrain.reset();
      await old;
      expect(terrain.heightAt(32)).toBe(before);
      await terrain.carve(32, before, 5, 4);
      expect(terrain.heightAt(32)).toBeLessThan(before - 3.9);
      terrain.update(1000);
      terrain.update(32);
      world.step();
      const craterHit = world.castRay(
        new RAPIER.Ray({ x: 32, y: 20, z: 0 }, { x: 0, y: -1, z: 0 }),
        100,
        true,
      );
      expect(20 - craterHit!.timeOfImpact).toBeCloseTo(terrain.heightAt(32), 4);
      terrain.reset();
      expect(world.colliders.len()).toBe(size);
      expect(terrain.heightAt(32)).toBe(before);
      let finish!: (vertices: Float32Array) => void;
      const compute = vi.spyOn(terrain['compute'], 'carve').mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const inflight = terrain.carve(32, before, 5, 4);
      await Promise.resolve();
      const oldVertices = terrain['chunks'].get(0)!.vertices.slice();
      for (let i = 1; i < oldVertices.length; i += 3) oldVertices[i] -= 4;
      terrain.reset();
      finish(oldVertices);
      await inflight;
      compute.mockRestore();
      expect(terrain.heightAt(32)).toBe(before);
      world.step();
      const hit = world.castRay(
        new RAPIER.Ray({ x: 32, y: 20, z: 0 }, { x: 0, y: -1, z: 0 }),
        100,
        true,
      );
      expect(20 - hit!.timeOfImpact).toBeCloseTo(before, 4);
    } finally {
      terrain.dispose();
      expect(world.colliders.len()).toBe(0);
      world.free();
    }
  }, 20000);
  it('restores cached hazard clocks, visual damage, and bridge support on restart', async () => {
    await initializePhysics();
    const world = new RAPIER.World({ x: 0, y: -17, z: 0 });
    const hazards = new Hazards(new T.Scene(), world);
    try {
      await hazards.prepare();
      expect(world.colliders.len()).toBe(0);
      const plate = HAZARDS.find((h) => h.kind === 'plate')!;
      hazards.stream(plate.x);
      const model = hazards['active'].get(plate.id)!;
      model.effect.position.y = -4;
      model.phase = 'spent';
      model.hp = 0;
      hazards.reset();
      hazards.stream(plate.x);
      const restored = hazards['active'].get(plate.id)!;
      expect(restored).toBe(model);
      expect(restored.phase).toBe('idle');
      expect(restored.hp).toBe(4);
      expect(restored.effect.position.y).toBe(0);
      expect(restored.collider?.isValid()).toBe(true);
    } finally {
      hazards.dispose();
      expect(world.colliders.len()).toBe(0);
      world.free();
    }
  });
  it('reuses enemy geometry, resets melted rocks, and disposes overflow actors', async () => {
    const pool = new EnemyModels();
    await pool.prepare();
    const count = pool.warmupGroups.length;
    const rock = pool.acquire('rock');
    rock.scale.setScalar(0.2);
    rock.traverse((o) => {
      if (o instanceof T.Mesh) (o.material as T.MeshStandardMaterial).emissive.set('#ff0000');
    });
    pool.release(rock);
    const reused = pool.acquire('rock');
    expect(reused).toBe(rock);
    expect(reused.scale.x).toBe(1);
    reused.traverse((o) => {
      if (o instanceof T.Mesh)
        expect((o.material as T.MeshStandardMaterial).emissive.getHex()).toBe(0);
    });
    const drones = Array.from({ length: 10 }, () => pool.acquire('drone'));
    let disposed = false;
    (drones[9].children[0] as T.Mesh).geometry.addEventListener('dispose', () => {
      disposed = true;
    });
    drones.forEach((g) => pool.release(g));
    expect(disposed).toBe(true);
    expect(pool.warmupGroups.length).toBe(count);
    pool.release(reused);
    pool.dispose();
    expect(pool.warmupGroups).toHaveLength(0);
  });
});
