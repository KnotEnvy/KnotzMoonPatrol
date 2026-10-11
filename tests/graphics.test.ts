import { afterEach, describe, expect, it, vi } from 'vitest';
import * as T from 'three/webgpu';
import { graphicsOptions, loadGraphicsQuality } from '../src/game/quality';
import { disposeGroup } from '../src/game/models';
import { BiomeLighting } from '../src/game/lighting';

afterEach(() => vi.unstubAllGlobals());
describe('graphics budgets and preferences', () => {
  it('caps high-density pixel budgets and constrains unsupported effects', () => {
    expect(graphicsOptions('performance', true, 3)).toEqual({
      pixelRatio: 1,
      shadows: false,
      bloom: false,
    });
    expect(graphicsOptions('balanced', true, 3).pixelRatio).toBe(1.25);
    expect(graphicsOptions('cinematic', false, 3)).toEqual({
      pixelRatio: 1.75,
      shadows: false,
      bloom: false,
    });
    expect(graphicsOptions('cinematic', true, 1).bloom).toBe(true);
    expect(graphicsOptions('balanced', true, NaN).pixelRatio).toBe(1);
  });
  it('ignores invalid preferences, survives unavailable storage, and accepts a valid test override', () => {
    vi.stubGlobal('location', { search: '?quality=unknown' });
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw Error('Storage blocked');
      },
    });
    expect(loadGraphicsQuality()).toBe('balanced');
    vi.stubGlobal('localStorage', { getItem: () => 'cinematic' });
    expect(loadGraphicsQuality()).toBe('cinematic');
    vi.stubGlobal('location', { search: '?quality=performance' });
    expect(loadGraphicsQuality()).toBe('performance');
  });
});

it('releases all owned surface maps once while retaining shared biome materials', () => {
  const scene = new T.Group(),
    material = new T.MeshStandardMaterial();
  const diffuse = new T.Texture(),
    relief = new T.Texture(),
    glow = new T.Texture();
  material.map = diffuse;
  material.bumpMap = relief;
  material.normalMap = relief;
  material.emissiveMap = glow;
  const release = [diffuse, relief, glow].map((texture) => vi.spyOn(texture, 'dispose'));
  const group = new T.Group();
  group.add(new T.Mesh(new T.BoxGeometry(), material));
  scene.add(group);
  disposeGroup(group, new Set([material]));
  release.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  scene.add(new T.Mesh(new T.BoxGeometry(), material));
  disposeGroup(scene);
  release.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
});

it('blends toward the dark chasm rig and restores lunar lighting without adding lights', () => {
  const scene = new T.Scene(),
    sun = new T.DirectionalLight('#edf7ff', 4);
  scene.fog = new T.FogExp2('#080f1c', 0.0022);
  const lighting = new BiomeLighting(scene, sun),
    position = new T.Vector3(3400, 2, 0);
  for (let i = 0; i < 300; i++) lighting.update(3, position, 1 / 60);
  expect(sun.intensity).toBeLessThan(0.61);
  expect(lighting.headlight.intensity).toBeGreaterThan(359);
  expect(lighting.headlight.castShadow).toBe(false);
  expect(lighting.headlight.position.x).toBe(3402);
  for (let i = 0; i < 300; i++) lighting.update(0, position, 1 / 60);
  expect(sun.intensity).toBeGreaterThan(3.99);
  expect(scene.children.filter((o) => o instanceof T.Light)).toHaveLength(2);
  scene.fog = null;
  expect(() => lighting.update(0, position, 1 / 60)).not.toThrow();
  lighting.dispose();
  expect(scene.children).toHaveLength(0);
});
