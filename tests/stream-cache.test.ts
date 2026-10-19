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
      await terrain.prepare();
      const size = terrain['prepared'].size;
      expect(size).toBe(95);
      const cut = terrain['prepared'].get(0)!.group.getObjectByName('terrain-cut-edge') as T.Mesh;
      expect(cut).toBeDefined();
      const normals = cut.geometry.getAttribute('normal');
      for (let vertex = 0; vertex < normals.count; vertex++)
        expect(normals.getZ(vertex)).toBeGreaterThan(0.99);
      for (let x = 0; x <= 5720; x += 64) {
        terrain.update(x);
        expect(world.colliders.len()).toBeLessThanOrEqual(6);
        expect(terrain['prepared'].size).toBe(size);
      }
      terrain.reset();
      const before = terrain.heightAt(32);
      const old = terrain.carve(32, before, 5, 4);
      terrain.reset();
      await old;
      expect(terrain.heightAt(32)).toBe(before);
      await terrain.carve(32, before, 5, 4);
      expect(terrain.heightAt(32)).toBeLessThan(before - 3.9);
      terrain.reset();
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
  });
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
      if (o instanceof T.Mesh) {
        const material = o.material as T.MeshStandardMaterial;
        material.emissive.set('#ff0000');
        material.emissiveIntensity = 5;
        material.roughness = 0.1;
      }
    });
    pool.release(rock);
    const reused = pool.acquire('rock');
    expect(reused).toBe(rock);
    expect(reused.scale.x).toBe(1);
    reused.traverse((o) => {
      if (o instanceof T.Mesh) {
        const material = o.material as T.MeshStandardMaterial;
        const seam = material.name === 'mineral-seam';
        expect(material.emissive.getHex()).toBe(seam ? 0x453012 : 0);
        expect(material.emissiveIntensity).toBe(seam ? 0.3 : 1);
        expect(material.roughness).toBe(seam ? 0.25 : 0.95);
      }
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
