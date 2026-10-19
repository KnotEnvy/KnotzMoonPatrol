import { describe, expect, it } from 'vitest';
import * as T from 'three/webgpu';
import {
  disposeGroup,
  makeEnemy,
  makeRover,
  updateSuspension,
  updateWheelBatches,
  makeRidge,
  updateParallax,
} from '../src/game/models';

describe('patrol assets', () => {
  it('tiles ridge heights and colors continuously and gives each layer its own scroll speed', () => {
    const backdrop = {
      group: new T.Group(),
      ridges: [new T.Group(), new T.Group(), new T.Group()],
    };
    updateParallax(backdrop, 100);
    backdrop.ridges.forEach((ridge, i) => expect(ridge.position.x).toBeCloseTo([-24, -12, -4][i]));
    for (let layer = 0; layer < 3; layer++) {
      const ridge = makeRidge(layer);
      try {
        const positions = ridge.geometry.getAttribute('position'),
          colors = ridge.geometry.getAttribute('color'),
          normals = ridge.geometry.getAttribute('normal');
        for (let j = 0; j < 9; j++) {
          expect(positions.getY(j)).toBe(positions.getY(1080 + j));
          expect(colors.getX(j)).toBe(colors.getX(1080 + j));
          expect(colors.getY(j)).toBe(colors.getY(1080 + j));
          expect(colors.getZ(j)).toBe(colors.getZ(1080 + j));
          expect(normals.getY(j)).toBeGreaterThan(0);
          expect(normals.getX(j)).toBe(normals.getX(1080 + j));
          expect(normals.getY(j)).toBe(normals.getY(1080 + j));
          expect(normals.getZ(j)).toBe(normals.getZ(1080 + j));
        }
      } finally {
        disposeGroup(ridge);
      }
    }
    for (const x of [0, 2307.69, 2307.7, 4400, 5720]) {
      updateParallax(backdrop, x);
      for (const ridge of backdrop.ridges) {
        const offset = backdrop.group.position.x + ridge.position.x - x;
        expect(offset).toBeGreaterThan(-600.01);
        expect(offset).toBeLessThanOrEqual(0.01);
      }
    }
  });
  it('keeps distinct enemy silhouettes inside bounded static draw budgets', () => {
    const bounds: string[] = [];
    for (const kind of [
      'drone',
      'bomber',
      'hunter',
      'interceptor',
      'rock',
      'mine',
      'skimmer',
      'leech',
      'boss',
    ]) {
      const group = makeEnemy(kind);
      try {
        let meshes = 0;
        group.traverse((o) => {
          if (o instanceof T.Mesh) {
            meshes++;
            expect(Array.from(o.geometry.attributes.position.array).every(Number.isFinite)).toBe(
              true,
            );
          }
        });
        expect(meshes).toBeLessThanOrEqual(kind === 'hunter' ? 4 : 3);
        const bodyBounds = new T.Box3();
        for (const child of group.children)
          if (child !== group.userData.tractorBeam)
            bodyBounds.union(new T.Box3().setFromObject(child));
        const size = bodyBounds.getSize(new T.Vector3());
        expect(size.x).toBeLessThanOrEqual(kind === 'boss' ? 10 : 4.5);
        bounds.push(
          size
            .toArray()
            .map((x) => x.toFixed(2))
            .join(','),
        );
      } finally {
        disposeGroup(group);
      }
    }
    expect(new Set(bounds).size).toBe(bounds.length);
  });
  it('articulates six struts with the wheel centers and frees their instance resources', () => {
    const rover = makeRover();
    let freed = false;
    rover.suspension.addEventListener('dispose', () => {
      freed = true;
    });
    try {
      expect(rover.wheels).toHaveLength(6);
      rover.wheels[0].position.y = -1.1;
      rover.wheels[0].rotation.z = 0.7;
      updateWheelBatches(rover);
      expect(rover.wheelBatches.length).toBeLessThanOrEqual(5);
      for (const batch of rover.wheelBatches) {
        expect(batch.count).toBe(6);
        const matrix = new T.Matrix4();
        batch.getMatrixAt(0, matrix);
        expect(
          new T.Vector3().setFromMatrixPosition(matrix).distanceTo(rover.wheels[0].position),
        ).toBeLessThan(0.000001);
        const rotation = new T.Quaternion().setFromRotationMatrix(
          new T.Matrix4().extractRotation(matrix),
        );
        expect(rotation.angleTo(rover.wheels[0].quaternion)).toBeLessThan(0.001);
      }
      updateSuspension(rover);
      const transform = new T.Matrix4();
      rover.suspension.getMatrixAt(0, transform);
      const end = new T.Vector3(0, 0.5, 0).applyMatrix4(transform);
      expect(end.distanceTo(rover.wheels[0].position)).toBeLessThan(0.000001);
    } finally {
      disposeGroup(rover.group);
    }
    expect(freed).toBe(true);
  });
});
