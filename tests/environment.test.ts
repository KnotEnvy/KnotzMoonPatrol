import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import source from '../src/game/assets/environment.json';
import { describe, expect, it } from 'vitest';
import * as T from 'three/webgpu';
import { addEnvironment } from '../src/game/environment';
import { batchStaticMeshes } from '../src/game/render-batches';
import { disposeGroup } from '../src/game/models';

describe('biome environment construction', () => {
  it('uses the current real Blender generator and a complete variant kit', () => {
    const script = readFileSync(new URL('../scripts/build-environment.py', import.meta.url));
    expect(source.generatorScriptSha256).toBe(createHash('sha256').update(script).digest('hex'));
    expect(source.generator).toMatch(/^Blender /);
    expect(Object.keys(source.models)).toHaveLength(20);
    for (let biome = 0; biome < 5; biome++) {
      for (const key of [0, 1, 2]
        .map((variant) => `biome${biome}-${variant}`)
        .concat(`debris-${biome}`)) {
        const batches = (source.models as Record<string, (typeof source.models)['biome0-0']>)[key];
        expect(batches.length).toBeGreaterThan(0);
        expect(batches.length).toBeLessThanOrEqual(4);
      }
    }
  });
  it('shares authoritative palette properties and bakes stronger ground contact without exporting a plane', () => {
    expect(source.palettes).toHaveLength(5);
    expect(source.ambientOcclusion.bakeGroundY).toBe(-0.015);
    expect(source.ambientOcclusion.groundExported).toBe(false);
    expect(source.ambientOcclusion.floor).toBe(0.72);
    for (let biome = 0; biome < 5; biome++) {
      const group = new T.Group();
      const actual: T.MeshStandardMaterial[] = [];
      addEnvironment(group, biome * 18, biome, (_key, color, metalness, roughness, glow) => {
        const material = new T.MeshStandardMaterial({
          color,
          metalness,
          roughness,
          emissive: glow ?? '#000000',
        });
        actual.push(material);
        return material;
      });
      expect(actual).toHaveLength(4);
      for (const [i, definition] of source.palettes[biome].entries()) {
        expect(actual[i].color.getHexString()).toBe(definition.color.slice(1));
        expect(actual[i].metalness).toBe(definition.metalness);
        expect(actual[i].roughness).toBe(definition.roughness);
        expect(actual[i].emissive.getHexString()).toBe((definition.emissive ?? '#000000').slice(1));
        expect(actual[i].emissiveIntensity).toBe(definition.emissiveIntensity);
      }
      const retained = new Set(actual);
      disposeGroup(group, retained);
      actual.forEach((material) => material.dispose());
    }
    let base = 0,
      top = 0,
      baseCount = 0,
      topCount = 0;
    for (const batch of source.models['biome4-0']) {
      const position = Buffer.from(batch.position, 'base64');
      const color = Buffer.from(batch.color, 'base64');
      for (let vertex = 0; vertex < color.length / 3; vertex++) {
        const y = position.readInt16LE(vertex * 6 + 2) / source.positionScale;
        expect(y).toBeGreaterThanOrEqual(0);
        expect(color[vertex * 3]).toBeGreaterThanOrEqual(Math.round(255 * 0.72));
        if (y < 0.5) {
          base += color[vertex * 3];
          baseCount++;
        }
        if (y > 5) {
          top += color[vertex * 3];
          topCount++;
        }
      }
    }
    expect(baseCount).toBeGreaterThan(0);
    expect(topCount).toBeGreaterThan(0);
    expect(base / baseCount).toBeLessThan(top / topCount - 5);
  });
  it('repeats seeded placement exactly without a fixed three-station variant cycle', () => {
    const sequence: string[] = [];
    for (let id = 0; id < 10; id++) {
      const a = new T.Group(),
        b = new T.Group();
      const palette = (_key: string, color: string) => new T.MeshStandardMaterial({ color });
      addEnvironment(a, id, 0, palette);
      addEnvironment(b, id, 0, palette);
      sequence.push(a.children[0].name);
      expect(a.children.map((mesh) => [mesh.name, mesh.position.toArray()])).toEqual(
        b.children.map((mesh) => [mesh.name, mesh.position.toArray()]),
      );
      disposeGroup(a);
      disposeGroup(b);
    }
    expect(new Set(sequence).size).toBe(3);
    expect(sequence.some((name, i) => i >= 3 && name !== sequence[i - 3])).toBe(true);
  });
  it('gives every chunk exclusive authored buffers while retaining immutable decoded sources', () => {
    const first = new T.Group(),
      second = new T.Group();
    const palette = (_key: string, color: string) => new T.MeshStandardMaterial({ color });
    addEnvironment(first, 0, 0, palette);
    addEnvironment(second, 0, 0, palette);
    const a = (first.children[0] as T.Mesh).geometry.getAttribute('position');
    const b = (second.children[0] as T.Mesh).geometry.getAttribute('position');
    expect(a.array).not.toBe(b.array);
    const original = b.getX(0);
    a.setX(0, original + 100);
    expect(b.getX(0)).toBe(original);
    disposeGroup(first);
    disposeGroup(second);
  });
  it.each(
    [0, 1, 2, 3, 4].flatMap((biome) => [0, 1, 2, 3].map((offset) => [biome, biome * 18 + offset])),
  )('keeps biome %i chunk %i outside the route with bounded batches and geometry', (biome, id) => {
    const group = new T.Group();
    const materials = new Map<string, T.MeshStandardMaterial>();
    addEnvironment(group, id, biome, (key, color, metalness, roughness) => {
      if (!materials.has(key))
        materials.set(key, new T.MeshStandardMaterial({ color, metalness, roughness }));
      return materials.get(key)!;
    });
    let totalVolume = 0;
    for (const child of group.children) {
      const bounds = new T.Box3().setFromObject(child);
      expect(bounds.max.z < -5.5 || bounds.min.z > 5.5).toBe(true);
      // Signed volume catches inside-out custom rock/slab faces before lighting hides them.
      const geometry = (child as T.Mesh).geometry;
      const position = geometry.getAttribute('position');
      const colors = geometry.getAttribute('color');
      expect((colors.array.BYTES_PER_ELEMENT * colors.itemSize) % 4).toBe(0);
      expect(colors.count).toBe(position.count);
      for (let vertex = 0; vertex < colors.count; vertex++) expect(colors.getW(vertex)).toBe(1);
      const index = geometry.index!;
      const a = new T.Vector3(),
        b = new T.Vector3(),
        c = new T.Vector3();
      let volume = 0;
      for (let vertex = 0; vertex < index.count; vertex += 3) {
        a.fromBufferAttribute(position, index.getX(vertex));
        b.fromBufferAttribute(position, index.getX(vertex + 1));
        c.fromBufferAttribute(position, index.getX(vertex + 2));
        const normal = b.clone().sub(a).cross(c.clone().sub(a));
        expect(normal.lengthSq()).toBeGreaterThan(1e-12);
        volume += a.dot(b.cross(c)) / 6;
      }
      totalVolume += volume;
    }
    expect(totalVolume).toBeGreaterThan(0);
    const before = new T.Box3().setFromObject(group, true);
    const triangles = group.children.reduce((count, child) => {
      const geometry = (child as T.Mesh).geometry;
      return count + (geometry.index?.count ?? geometry.attributes.position.count) / 3;
    }, 0);
    expect(triangles).toBeLessThan(5000);
    batchStaticMeshes(group);
    expect(group.children.length).toBeLessThanOrEqual(4);
    expect(materials.size).toBeLessThanOrEqual(4);
    const after = new T.Box3().setFromObject(group, true);
    expect(after.min.distanceTo(before.min)).toBeLessThan(0.001);
    expect(after.max.distanceTo(before.max)).toBeLessThan(0.001);
    disposeGroup(group);
  });
});
