import * as T from 'three/webgpu';
import { randomAt } from './rules';
import { batchStaticMeshes } from './render-batches';
export const mat = (
  color: T.ColorRepresentation,
  metalness = 0.15,
  roughness = 0.7,
  glow?: T.ColorRepresentation,
) =>
  new T.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    ...(glow ? { emissive: glow, emissiveIntensity: 2 } : {}),
  });
export function box(g: T.Group, size: number[], pos: number[], material: T.Material) {
  const m = new T.Mesh(new T.BoxGeometry(size[0], size[1], size[2]), material);
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
export { makeRover, updateWheelBatches, updateSuspension } from './rover-model';
export { makeEnemy } from './enemy-geometry';

export function makeBackdrop(scene: T.Scene) {
  const group = new T.Group();
  scene.add(group);
  const stars = new Float32Array(2700);
  for (let i = 0; i < 900; i++) {
    stars[i * 3] = (randomAt(i * 3) - 0.5) * 700;
    stars[i * 3 + 1] = randomAt(i * 3 + 1) * 180 + 5;
    stars[i * 3 + 2] = -90 - randomAt(i * 3 + 2) * 140;
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(stars, 3));
  group.add(
    new T.Points(
      geo,
      new T.PointsMaterial({ color: '#b6cfdf', size: 0.19, sizeAttenuation: true }),
    ),
  );
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#62838e';
  c.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 16000; i++) {
    const x = randomAt(i * 3) * 1024,
      y = randomAt(i * 3 + 1) * 512;
    const bands = Math.sin(x * 0.024 + Math.sin(y * 0.03) * 3) + Math.cos(y * 0.04 + x * 0.011);
    c.fillStyle = bands > 0.7 ? 'rgba(178,203,196,.22)' : 'rgba(22,53,66,.16)';
    c.beginPath();
    c.ellipse(x, y, randomAt(i + 90) * 18 + 2, randomAt(i + 20) * 5 + 1, -0.3, 0, 7);
    c.fill();
  }
  const planet = new T.Mesh(
    new T.SphereGeometry(22, 64, 40),
    new T.MeshStandardMaterial({ map: new T.CanvasTexture(canvas), roughness: 1, metalness: 0.1 }),
  );
  planet.position.set(28, 23, -130);
  planet.rotation.z = 0.35;
  group.add(planet);
  const halo = new T.Mesh(
    new T.SphereGeometry(22.5, 48, 32),
    new T.MeshBasicMaterial({
      color: '#7dcae4',
      transparent: true,
      opacity: 0.07,
      side: T.BackSide,
    }),
  );
  halo.position.copy(planet.position);
  group.add(halo);
  const mountainMaterial = mat('#233644', 0.1, 1);
  const ridges: T.Group[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const strip = new T.Group();
    const ridge = makeRidge(layer);
    for (const x of [-600, 0, 600]) {
      const tile = ridge.clone();
      tile.position.x = x;
      strip.add(tile);
    }
    batchStaticMeshes(strip);
    group.add(strip);
    ridges.push(strip);
  }
  return { group, planet, mountainMaterial, ridges };
}
export function updateParallax(
  backdrop: Pick<ReturnType<typeof makeBackdrop>, 'group' | 'ridges'>,
  x: number,
) {
  backdrop.group.position.x = x * 0.98;
  backdrop.ridges.forEach((ridge, layer) => {
    // Periodic geometry and repeated tiles keep all three depths continuous over A-Z.
    const speed = [0.26, 0.14, 0.06][layer];
    ridge.position.x = x * 0.02 - ((x * speed) % 600);
  });
}
export function disposeMaterial(material: T.Material) {
  const m = material as T.MeshStandardMaterial;
  new Set([
    m.map,
    m.bumpMap,
    m.normalMap,
    m.emissiveMap,
    m.roughnessMap,
    m.metalnessMap,
    m.aoMap,
    m.alphaMap,
  ]).forEach((texture) => texture?.dispose());
  material.dispose();
}
export function disposeGroup(group: T.Object3D, retainedMaterials?: Set<T.Material>) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>();
  group.traverse((o) => {
    if (o instanceof T.InstancedMesh) o.dispose();
    if (o instanceof T.Mesh || o instanceof T.Points || o instanceof T.Line) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => {
    if (retainedMaterials?.has(m)) return;
    disposeMaterial(m);
  });
  group.removeFromParent();
}

export function makeRidge(layer: number) {
  const vertices: number[] = [],
    indices: number[] = [],
    colors: number[] = [];
  const color = new T.Color(layer === 0 ? '#1c2e40' : layer === 1 ? '#2b4050' : '#364a54');
  for (let i = 0; i <= 120; i++)
    for (let j = 0; j <= 8; j++) {
      const x = i * 5 - 300,
        z = -34 - layer * 30 - j * 5;
      const sample = i % 120;
      const ridge =
        Math.pow(Math.max(0, Math.sin((sample * Math.PI) / 20 + layer * 2) * 0.4 + 0.5), 0.7) * 11 +
        Math.sin((sample * Math.PI) / 6 + layer) * 1.3 +
        randomAt(sample + layer * 200) * 2.5;
      const y =
        -3 + Math.sin((j / 8) * Math.PI) * ridge + randomAt(sample * 9 + j + layer * 93) * 0.8;
      vertices.push(x, y, z);
      const shade =
        0.82 + Math.sin((sample * Math.PI) / 12 + j * 0.8) * 0.09 + randomAt(sample * 7 + j) * 0.08;
      colors.push(color.r * shade, color.g * shade, color.b * shade);
    }
  for (let i = 0; i < 120; i++)
    for (let j = 0; j < 8; j++) {
      const a = i * 9 + j;
      indices.push(a, a + 9, a + 1, a + 1, a + 9, a + 10);
    }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // The repeated 600 m tiles share both position and shading at the seam.
  const normals = geo.getAttribute('normal');
  for (let row = 0; row <= 8; row++) {
    const last = 120 * 9 + row;
    const normal = new T.Vector3()
      .fromBufferAttribute(normals, row)
      .add(new T.Vector3().fromBufferAttribute(normals, last))
      .normalize();
    normals.setXYZ(row, normal.x, normal.y, normal.z);
    normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  return new T.Mesh(
    geo,
    new T.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 1,
      flatShading: false,
    }),
  );
}
