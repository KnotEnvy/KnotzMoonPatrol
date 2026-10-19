import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as T from 'three/webgpu';
import { makeEnemy } from '../src/game/enemy-geometry';
import source from '../src/game/assets/enemies.json';
import { Game } from '../src/game/engine';

const kinds = [
  'drone',
  'bomber',
  'hunter',
  'interceptor',
  'rock',
  'mine',
  'skimmer',
  'leech',
  'boss',
];
describe('Blender enemy assets', () => {
  it('keeps authored hit envelopes aligned with the actual engine shot radii', () => {
    for (const kind of kinds) {
      const actual = Game.prototype['enemyRadius']({ kind } as never);
      expect(actual).toBe((source.hitRadius as Record<string, number>)[kind]);
    }
  });
  it('exports all nine archetypes from evaluated Blender geometry within draw and triangle budgets', () => {
    expect(source.generator).toContain('Blender 5.2');
    const script = readFileSync(new URL('../scripts/build-enemies.py', import.meta.url));
    expect(source.generatorScriptSha256).toBe(createHash('sha256').update(script).digest('hex'));
    expect(Object.keys(source.models).sort()).toEqual([...kinds].sort());
    for (const kind of kinds) {
      const group = makeEnemy(kind);
      const meshes = group.children.filter((child): child is T.Mesh => child instanceof T.Mesh);
      expect(meshes.length).toBeLessThanOrEqual(kind === 'hunter' ? 4 : 3);
      const bounds = new T.Box3();
      let triangles = 0;
      for (const mesh of meshes) {
        if (mesh === group.userData.tractorBeam) continue;
        bounds.union(new T.Box3().setFromObject(mesh));
        const positions = mesh.geometry.getAttribute('position');
        const normals = mesh.geometry.getAttribute('normal');
        const colors = mesh.geometry.getAttribute('color');
        expect(colors.count).toEqual(positions.count);
        expect(colors.normalized).toBe(true);
        expect((colors.array.BYTES_PER_ELEMENT * colors.itemSize) % 4).toBe(0);
        for (let i = 0; i < colors.count; i++) expect(colors.getW(i)).toBe(1);
        expect((mesh.material as T.MeshStandardMaterial).vertexColors).toBe(true);
        expect(Array.from(colors.array).every((v) => v >= 165 && v <= 255)).toBe(true);
        expect(positions.count).toEqual(normals.count);
        expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
        const hitRadii = source.hitRadius as Record<string, number>;
        for (let i = 0; i < positions.count; i++)
          expect(
            Math.hypot(positions.getX(i), positions.getY(i)),
            `${kind} vertex ${i} shot-circle fit`,
          ).toBeLessThanOrEqual(hitRadii[kind] + 1e-6);
        if (kind === 'drone')
          for (let i = 0; i < positions.count; i++)
            expect(
              Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i)),
              `yawing drone vertex ${i}`,
            ).toBeLessThanOrEqual(hitRadii[kind] + 1e-6);
        const palette = (source.materials as Record<string, typeof source.materials.drone>)[kind];
        const config = palette.find((c) => c.name === (mesh.material as T.Material).name)!;
        const material = mesh.material as T.MeshStandardMaterial;
        expect(config).toBeDefined();
        expect(material.color.getHexString()).toBe(config.color.slice(1));
        expect(material.emissive.getHexString()).toBe(config.emissive.slice(1));
        expect(material.metalness).toBe(config.metalness);
        expect(material.roughness).toBe(config.roughness);
        expect(material.emissiveIntensity).toBe(config.emissiveIntensity);
        const indices = mesh.geometry.getIndex()!;
        expect(Math.max(...indices.array)).toBeLessThan(positions.count);
        triangles += indices.count / 3;
        const a = new T.Vector3(),
          b = new T.Vector3(),
          c = new T.Vector3();
        for (let i = 0; i < indices.count; i += 3) {
          a.fromBufferAttribute(positions, indices.getX(i));
          b.fromBufferAttribute(positions, indices.getX(i + 1));
          c.fromBufferAttribute(positions, indices.getX(i + 2));
          const area = b.sub(a).cross(c.sub(a)).length() * 0.5;
          expect(area, `${kind} triangle ${i / 3}`).toBeGreaterThanOrEqual(1e-10);
        }
        for (let i = 0; i < normals.count; i++)
          expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 3);
      }
      expect(triangles).toBeGreaterThan(kind === 'rock' ? 200 : 500);
      expect(triangles).toBeLessThan(kind === 'boss' ? 18000 : 8000);
      if (kind === 'interceptor')
        expect(bounds.getSize(new T.Vector3()).y).toBeGreaterThanOrEqual(1.4);
      if (kind === 'rock') {
        const seam = meshes.find((m) => m.name === 'rock-signal')!
          .material as T.MeshStandardMaterial;
        expect(seam.name).toBe('mineral-seam');
        expect(seam.emissiveIntensity).toBe(0.3);
      }
      expect(bounds.getSize(new T.Vector3()).x).toBeLessThanOrEqual(kind === 'boss' ? 10 : 4.5);
      if (['drone', 'bomber', 'boss'].includes(kind)) {
        expect(meshes.some((mesh) => mesh.material === group.userData.warningLight)).toBe(true);
      }
      if (kind === 'hunter') expect(group.userData.tractorBeam.parent).toBe(group);
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        const material = mesh.material as T.Material;
        material.dispose();
      }
    }
  });
  it('serializes canonical vertices and winding-preserving triangle order', () => {
    const compare = (a: number[], b: number[]) => {
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
      return 0;
    };
    for (const batches of Object.values(source.models))
      for (const batch of batches) {
        const positions = Buffer.from(batch.position, 'base64');
        const normals = Buffer.from(batch.normal, 'base64');
        const colors = Buffer.from(batch.color, 'base64');
        let previous: number[] | undefined;
        for (let i = 0; i < positions.length / 6; i++) {
          const key = [0, 1, 2]
            .map((j) => positions.readInt16LE(i * 6 + j * 2))
            .concat(
              [0, 1, 2].map((j) => normals.readInt16LE(i * 6 + j * 2)),
              [0, 1, 2].map((j) => colors[i * 3 + j]),
            );
          if (previous) expect(compare(previous, key)).toBeLessThanOrEqual(0);
          previous = key;
        }
        const indices = Buffer.from(batch.index, 'base64');
        previous = undefined;
        for (let i = 0; i < indices.length; i += 6) {
          const triangle = [0, 1, 2].map((j) => indices.readUInt16LE(i + j * 2));
          expect(triangle[0]).toBeLessThan(triangle[1]);
          expect(triangle[0]).toBeLessThan(triangle[2]);
          if (previous) expect(compare(previous, triangle)).toBeLessThanOrEqual(0);
          previous = triangle;
        }
      }
  });
  it('exposes warning optics and the hanging hunter hoop to gameplay-facing rays', () => {
    const probes: [string, number[], number[]][] = [
      ['drone', [0, 0.39, 8], [0, 0.39, 1.29]],
      ['hunter', [0, -0.86, 8], [0, -0.86, 1.72]],
      ['bomber', [-8, 0.52, 0], [-1.53, 0.52, 0]],
      ['boss', [0, 0.71, 8], [0, 0.71, 1.35]],
    ];
    for (const [kind, from, target] of probes) {
      const group = makeEnemy(kind);
      group.updateMatrixWorld(true);
      const scale = (source.modelScales as Record<string, number>)[kind];
      const origin = new T.Vector3(...from).multiplyScalar(scale);
      const direction = new T.Vector3(...target).multiplyScalar(scale).sub(origin).normalize();
      const meshes = group.children.filter((o) => o !== group.userData.tractorBeam);
      const hits = new T.Raycaster(origin, direction).intersectObjects(meshes);
      expect(hits.length, kind).toBeGreaterThan(0);
      expect(hits[0].object.name, kind).toBe(`${kind}-signal`);
    }
  });
  it('gives independently disposable buffers and materials to each spawn', () => {
    const first = makeEnemy('bomber');
    const second = makeEnemy('bomber');
    expect((first.children[0] as T.Mesh).geometry).not.toBe(
      (second.children[0] as T.Mesh).geometry,
    );
    expect(first.userData.warningLight).not.toBe(second.userData.warningLight);
  });
});
