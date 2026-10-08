import { describe, expect, it } from 'vitest';
import * as T from 'three/webgpu';
import { batchStaticMeshes, updateInstanceBatch } from '../src/game/render-batches';
import { disposeGroup, makeRover } from '../src/game/models';

describe('static rendering batches', () => {
  it('preserves transformed bounds, materials, shadows, and independently animated children', () => {
    const group = new T.Group();
    const material = new T.MeshStandardMaterial();
    for (const x of [-4, 4]) {
      const mesh = new T.Mesh(new T.BoxGeometry(2, 3, 1), material);
      mesh.position.set(x, 2, 1);
      mesh.rotation.z = x * 0.1;
      mesh.castShadow = true;
      group.add(mesh);
    }
    const excluded = new T.Mesh(new T.BoxGeometry(), material);
    const animated = new T.Group();
    animated.add(new T.Mesh(new T.BoxGeometry(), material));
    group.add(excluded, animated);
    const before = new T.Box3().setFromObject(group);
    batchStaticMeshes(group, new Set([excluded]));
    expect(group.children).toHaveLength(3);
    expect(excluded.parent).toBe(group);
    expect(animated.children).toHaveLength(1);
    const merged = group.children.find(
      (child) => child !== excluded && child !== animated,
    ) as T.Mesh;
    expect(merged.material).toBe(material);
    expect(merged.castShadow).toBe(true);
    const after = new T.Box3().setFromObject(group);
    expect(after.min.distanceTo(before.min)).toBeLessThan(0.00001);
    expect(after.max.distanceTo(before.max)).toBeLessThan(0.00001);
    disposeGroup(group);
  });

  it('keeps six wheel pivots, aiming, and the independently visible boost flame', () => {
    const rover = makeRover();
    expect(rover.wheels).toHaveLength(6);
    expect(rover.flame.parent).toBe(rover.group);
    expect(rover.flame.visible).toBe(false);
    expect(rover.turret.parent).toBe(rover.group);
    for (const wheel of rover.wheels) {
      expect(wheel.parent).toBe(rover.group);
      expect(wheel.children.length).toBeLessThan(6);
      const before = new T.Box3().setFromObject(wheel).getCenter(new T.Vector3());
      wheel.position.y += 2;
      const after = new T.Box3().setFromObject(wheel).getCenter(new T.Vector3());
      expect(after.y - before.y).toBeCloseTo(2);
    }
    disposeGroup(rover.group);
  });
});

describe('dynamic rendering batches', () => {
  it('packs active transforms and removes stale instances after expiry and restart', () => {
    const batch = new T.InstancedMesh(new T.BoxGeometry(), new T.MeshBasicMaterial(), 4);
    const a = new T.Object3D(),
      b = new T.Object3D();
    a.position.set(2, 3, 4);
    b.position.set(10, 20, 30);
    b.scale.set(2, 1, 3);
    updateInstanceBatch(batch, [a, b]);
    expect(batch.count).toBe(2);
    const matrix = new T.Matrix4();
    batch.getMatrixAt(1, matrix);
    expect(matrix.equals(b.matrix)).toBe(true);
    updateInstanceBatch(batch, [b]);
    expect(batch.count).toBe(1);
    batch.getMatrixAt(0, matrix);
    expect(matrix.equals(b.matrix)).toBe(true);
    updateInstanceBatch(batch, []);
    expect(batch.count).toBe(0);
    expect(batch.visible).toBe(false);
    updateInstanceBatch(batch, [a]);
    expect(batch.visible).toBe(true);
    let disposed = false;
    batch.addEventListener('dispose', () => {
      disposed = true;
    });
    disposeGroup(batch);
    expect(disposed).toBe(true);
  });
});
