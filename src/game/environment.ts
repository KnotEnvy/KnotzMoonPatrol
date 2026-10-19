import * as T from 'three/webgpu';
import { baseHeight, randomAt } from './rules';
import source from './assets/environment.json';
import { bakedColorAttribute } from './asset-colors';

interface DecodedBatch {
  palette: number;
  position: Float32Array;
  normal: Float32Array;
  color: Uint8Array;
  index: Uint16Array;
}
function bytes(encoded: string) {
  return Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
}
function decode16(encoded: string, signed: boolean) {
  const raw = bytes(encoded);
  const view = new DataView(raw.buffer);
  const result = signed ? new Int16Array(raw.length / 2) : new Uint16Array(raw.length / 2);
  for (let i = 0; i < result.length; i++)
    result[i] = signed ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true);
  return result;
}
// Decode once at module loading. Preparing chunks only copies immutable CPU arrays;
// driving, terrain streaming and rendering never decode or evaluate authored models.
const decoded = new Map<string, DecodedBatch[]>(
  Object.entries(source.models).map(([key, batches]) => [
    key,
    batches.map((batch) => ({
      palette: batch.palette,
      position: Float32Array.from(decode16(batch.position, true), (v) => v / source.positionScale),
      normal: Float32Array.from(decode16(batch.normal, true), (v) => v / source.normalScale),
      color: bytes(batch.color),
      index: decode16(batch.index, false) as Uint16Array,
    })),
  ]),
);

type Palette = (
  key: string,
  color: string,
  metalness?: number,
  roughness?: number,
  glow?: string,
) => T.MeshStandardMaterial;

/** Chunk-owned scenery: only direct meshes, so terrain's static merger owns every geometry.
 * Large silhouettes live behind the route; no decorative geometry enters |z| < 5.5.
 */
export function addEnvironment(group: T.Group, id: number, biome: number, palette: Palette) {
  const materials = source.palettes[biome].map((definition) => {
    const material = palette(
      `land-${definition.name}-${biome}`,
      definition.color,
      definition.metalness,
      definition.roughness,
      definition.emissive ?? undefined,
    );
    material.emissiveIntensity = definition.emissiveIntensity;
    material.vertexColors = true;
    return material;
  });
  function place(
    key: string,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rotation = 0,
  ) {
    const kit = decoded.get(key);
    if (!kit) throw new Error(`Missing authored environment kit: ${key}`);
    for (const batch of kit) {
      // CPU caches are shared, GPU-bound geometry buffers exclusively belong to this
      // prepared chunk. The terrain merger may safely dispose the source geometry.
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(batch.position.slice(), 3));
      geometry.setAttribute('normal', new T.BufferAttribute(batch.normal.slice(), 3));
      geometry.setAttribute('color', bakedColorAttribute(batch.color));
      geometry.setIndex(new T.BufferAttribute(batch.index.slice(), 1));
      const mesh = new T.Mesh(geometry, materials[batch.palette]);
      mesh.name = `authored-${key}`;
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.y = rotation;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  for (let i = 0; i < 4; i++) {
    const seed = id * 103 + i * 19;
    const variant = Math.floor(randomAt(seed + 16) * 3);
    if (i === 2 && randomAt(id * 31) < 0.4) continue;
    const x = id * 64 + 6 + i * 16 + (randomAt(seed) - 0.5) * 9;
    const z = -11.5 - randomAt(seed + 1) * 2;
    const y = baseHeight(x, z) - 0.12;
    const sx = 0.9 + randomAt(seed + 2) * 0.22;
    const sy = 0.8 + randomAt(seed + 3) * 0.42;
    const rotation =
      biome === 4 ? (randomAt(seed + 4) - 0.5) * 0.12 : (randomAt(seed + 4) - 0.5) * 0.5;
    place(`biome${biome}-${variant}`, x, y, z, sx, sy, 1, rotation);
  }
  // Rear landmarks re-use authored construction at a separate depth and scale.
  if (((id % 4) + 4) % 4 === 1) {
    const x = id * 64 + 37,
      z = -21;
    place(
      `biome${biome}-${biome === 3 ? 1 : 0}`,
      x,
      baseHeight(x, z) - 0.3,
      z,
      1.65,
      1.8,
      1.3,
      -0.15,
    );
  }
  for (let i = 0; i < 7; i++) {
    const seed = id * 67 + i * 11;
    const x = id * 64 + 3 + randomAt(seed) * 58;
    const z = 7.1 + randomAt(seed + 1) * 2.5;
    place(
      `debris-${biome}`,
      x,
      baseHeight(x, z) - 0.08,
      z,
      0.7 + randomAt(seed + 2) * 0.6,
      0.7,
      1,
      randomAt(seed + 3) * 2,
    );
  }
}
