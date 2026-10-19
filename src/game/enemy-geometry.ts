import * as T from 'three/webgpu';
import source from './assets/enemies.json';
import { bakedColorAttribute } from './asset-colors';

// Blender's evaluated bevels and weighted normals are stored as indexed, quantized
// geometry. Each instance owns its buffers so the existing disposal API stays safe.
function decode16(encoded: string, signed: boolean) {
  const binary = atob(encoded);
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
  const result = signed ? new Int16Array(binary.length / 2) : new Uint16Array(binary.length / 2);
  for (let i = 0; i < result.length; i++)
    result[i] = signed ? view.getInt16(i * 2, true) : view.getUint16(i * 2, true);
  return result;
}

export function makeEnemy(kind: string) {
  const group = new T.Group();
  group.name = kind;
  const hunter = kind === 'hunter';
  const palettes = source.materials as Record<string, typeof source.materials.drone>;
  const materials = (palettes[kind] ?? palettes.drone).map(
    (config) => new T.MeshStandardMaterial({ ...config, vertexColors: true }),
  );
  const signal = materials[2];
  const models = source.models as Record<string, typeof source.models.drone>;
  const batches = models[kind] ?? models.drone;
  const used = new Set<number>();
  for (const batch of batches) {
    const positions = decode16(batch.position, true);
    const normals = decode16(batch.normal, true);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(
        Float32Array.from(positions, (v) => v / source.positionScale),
        3,
      ),
    );
    geometry.setAttribute(
      'normal',
      new T.Float32BufferAttribute(
        Float32Array.from(normals, (v) => v / source.normalScale),
        3,
      ),
    );
    const colorBytes = Uint8Array.from(atob(batch.color), (c) => c.charCodeAt(0));
    geometry.setAttribute('color', bakedColorAttribute(colorBytes));
    geometry.setIndex(new T.BufferAttribute(decode16(batch.index, false), 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, materials[batch.palette]);
    mesh.name = `${kind}-${['mechanisms', 'armor', 'signal'][batch.palette]}`;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    used.add(batch.palette);
  }
  materials.forEach((m, i) => {
    if (!used.has(i)) m.dispose();
  });
  if (['drone', 'bomber', 'boss'].includes(kind)) group.userData.warningLight = signal;
  if (hunter) {
    const beam = new T.Mesh(
      new T.CylinderGeometry(0.3, 2.7, 10, 16, 1, true),
      new T.MeshBasicMaterial({
        color: '#77fadd',
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        side: T.DoubleSide,
      }),
    );
    beam.name = 'tractor-beam';
    beam.position.y = -5;
    group.add(beam);
    group.userData.tractorBeam = beam;
  }
  return group;
}
