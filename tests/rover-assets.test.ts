import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as T from 'three/webgpu';
import asset from '../src/game/assets/rover.json';
import { makeRover, updateSuspension, updateWheelBatches } from '../src/game/rover-model';
import { disposeGroup } from '../src/game/models';

describe('Blender-authored rover asset', () => {
  it('matches the authoritative build script that generated the asset', () => {
    const source = readFileSync(new URL('../scripts/build-rover.py', import.meta.url));
    expect(asset.generatorScriptSha256).toBe(createHash('sha256').update(source).digest('hex'));
  });
  it('exports complete indexed meshes within the rover geometry and submission budget', () => {
    let triangles = 0;
    for (const mesh of asset.meshes) {
      const vertices = mesh.position.length / 3;
      expect(mesh.normal.length).toBe(mesh.position.length);
      expect(mesh.color.length).toBe(mesh.position.length);
      expect(mesh.color.every((value) => value >= 135 && value <= 255)).toBe(true);
      expect(mesh.index.length % 3).toBe(0);
      expect(mesh.index.every((index) => index >= 0 && index < vertices)).toBe(true);
      expect(mesh.position.every(Number.isFinite)).toBe(true);
      const point = (index: number) =>
        new T.Vector3().fromArray(mesh.position, index * 3).divideScalar(asset.positionScale);
      let degenerate = 0;
      for (let i = 0; i < mesh.index.length; i += 3) {
        const a = point(mesh.index[i]);
        const b = point(mesh.index[i + 1]);
        const c = point(mesh.index[i + 2]);
        if (b.sub(a).cross(c.sub(a)).length() * 0.5 < 1e-10) degenerate++;
      }
      expect(degenerate, `${mesh.part}/${mesh.material} zero-area triangles`).toBe(0);
      for (let i = 0; i < mesh.normal.length; i += 3) {
        const length = Math.hypot(...mesh.normal.slice(i, i + 3)) / asset.normalScale;
        expect(length).toBeCloseTo(1, 3);
      }
      triangles += (mesh.index.length / 3) * (mesh.part === 'wheel' ? 6 : 1);
    }
    expect(triangles).toBeLessThan(22000);
    const colors = asset.meshes.flatMap((mesh) => mesh.color);
    expect(Math.min(...colors)).toBeLessThan(210);
    expect(asset.ambientOcclusion.samples).toBe(12);
    expect(asset.meshes.length + 2).toBeLessThanOrEqual(16);
    expect(asset.meshes.filter((mesh) => mesh.part === 'wheel')).toHaveLength(4);
  });

  it('retains wheel dimensions, suspension motion, turret mount and muzzle geometry', () => {
    const rover = makeRover();
    expect(rover.wheels.map((wheel) => wheel.position.toArray())).toEqual([
      [-1.55, -0.6, -1.17],
      [0, -0.6, -1.17],
      [1.55, -0.6, -1.17],
      [-1.55, -0.6, 1.17],
      [0, -0.6, 1.17],
      [1.55, -0.6, 1.17],
    ]);
    expect(rover.turret.position.toArray()).toEqual([-0.6, 1.18, 0]);
    const wheelBounds = new T.Box3();
    for (const batch of rover.wheelBatches) wheelBounds.union(batch.geometry.boundingBox!);
    expect(wheelBounds.max.x).toBeCloseTo(0.66, 1);
    expect(wheelBounds.max.y).toBeCloseTo(0.66, 1);
    expect(wheelBounds.min.y).toBeCloseTo(-0.66, 1);
    const matrix = new T.Matrix4();
    rover.wheels[2].position.y += 0.42;
    rover.wheels[2].rotation.z = 0.7;
    updateWheelBatches(rover);
    updateSuspension(rover);
    rover.wheelBatches[0].getMatrixAt(2, matrix);
    const position = new T.Vector3().setFromMatrixPosition(matrix);
    expect(position.y).toBeCloseTo(-0.18);
    rover.suspension.getMatrixAt(2, matrix);
    expect([...matrix.elements].every(Number.isFinite)).toBe(true);
    expect(rover.flame.visible).toBe(false);
    expect(rover.flame.position.toArray()).toEqual([-2.9, -0.05, 0]);
    const light = rover.group.children.find(
      (child) => child.name === 'Blender body / light',
    ) as T.Mesh;
    expect(light.geometry.boundingBox!.max.x).toBeGreaterThan(2.87);
    disposeGroup(rover.group);
  });
});
