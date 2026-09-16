import * as T from 'three/webgpu';
import { randomAt } from './rules';
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
export function makeRover() {
  const group = new T.Group(),
    cream = mat('#c4c8bd', 0.55, 0.4),
    dark = mat('#1d2a31', 0.6, 0.55),
    orange = mat('#e6753c', 0.4, 0.48),
    glass = mat('#174c59', 0.7, 0.2),
    glow = mat('#70f5ff', 0.3, 0.2, '#2ba4b2');
  box(group, [4.6, 0.62, 2.1], [0, 0, 0], dark);
  box(group, [4.2, 0.65, 2], [-0.1, 0.38, 0], cream);
  box(group, [0.5, 0.7, 2.12], [1.3, 0.4, 0], orange);
  const cabin = box(group, [1.85, 0.95, 1.75], [0.45, 1.07, 0], cream);
  cabin.rotation.z = -0.08;
  const windshield = box(group, [0.06, 0.67, 1.5], [1.4, 1.16, 0], glass);
  windshield.rotation.z = -0.12;
  box(group, [1.2, 0.55, 0.04], [0.65, 1.17, 0.89], glass);
  box(group, [1.2, 0.55, 0.04], [0.65, 1.17, -0.89], glass);
  box(group, [0.12, 0.65, 1.85], [0.07, 1.15, 0], orange);
  box(group, [1.1, 0.2, 1.6], [-1.35, 0.8, 0], dark);
  for (let i = 0; i < 5; i++) box(group, [0.08, 0.1, 1.4], [-1.7 + i * 0.2, 0.95, 0], cream);
  box(group, [0.65, 0.22, 0.4], [2.5, 0.6, 0], dark);
  box(group, [0.12, 0.12, 0.3], [2.86, 0.6, 0], glow);
  for (const z of [-0.72, 0.72]) box(group, [0.1, 0.18, 0.35], [2.08, 0.42, z], glow);
  box(group, [0.1, 1.2, 0.1], [-1.7, 1.55, -0.7], dark);
  box(group, [0.18, 0.14, 0.18], [-1.7, 2.18, -0.7], orange);
  const turret = new T.Group();
  turret.position.set(-0.6, 1.18, 0);
  group.add(turret);
  box(turret, [0.6, 0.36, 0.6], [0, 0, 0], dark);
  box(turret, [0.15, 1, 0.18], [0, 0.62, 0], cream);
  box(turret, [0.2, 0.14, 0.24], [0, 1.14, 0], glow);
  const wheels: T.Group[] = [];
  for (const z of [-1.17, 1.17])
    for (const x of [-1.55, 0, 1.55]) {
      const wheel = new T.Group();
      wheel.position.set(x, -0.6, z);
      group.add(wheel);
      wheels.push(wheel);
      const tire = new T.Mesh(new T.CylinderGeometry(0.66, 0.66, 0.48, 20), dark);
      tire.rotation.x = Math.PI / 2;
      tire.castShadow = true;
      wheel.add(tire);
      const rim = new T.Mesh(new T.CylinderGeometry(0.41, 0.41, 0.51, 12), cream);
      rim.rotation.x = Math.PI / 2;
      wheel.add(rim);
      const hub = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.54, 8), orange);
      hub.rotation.x = Math.PI / 2;
      wheel.add(hub);
      for (let a = 0; a < 12; a++) {
        const lug = box(
          wheel,
          [0.16, 0.09, 0.5],
          [Math.sin((a * Math.PI) / 6) * 0.66, Math.cos((a * Math.PI) / 6) * 0.66, 0],
          dark,
        );
        lug.rotation.z = (-a * Math.PI) / 6;
      }
    }
  const flame = box(group, [1.5, 0.22, 1.2], [-2.9, -0.05, 0], glow);
  flame.visible = false;
  return { group, wheels, turret, flame };
}
export function makeEnemy(kind: string) {
  const g = new T.Group(),
    dark = mat('#343a47', 0.7, 0.35),
    glow = mat('#fc685a', 0.3, 0.25, '#b52c31'),
    pale = mat('#969b9c', 0.6, 0.35);
  if (kind === 'rock') {
    const rock = new T.Mesh(new T.DodecahedronGeometry(1.15, 0), mat('#687277'));
    rock.scale.set(1.3, 1.1, 1);
    rock.rotation.set(0.4, 0.6, 0.2);
    rock.castShadow = true;
    g.add(rock);
    return g;
  }
  if (kind === 'mine') {
    const ball = new T.Mesh(new T.IcosahedronGeometry(0.6, 0), dark);
    g.add(ball);
    box(g, [1.5, 0.12, 0.12], [0, 0, 0], glow);
    box(g, [0.12, 1.5, 0.12], [0, 0, 0], glow);
    return g;
  }
  if (kind === 'skimmer') {
    box(g, [2, 0.65, 1.5], [0, 0, 0], dark);
    box(g, [0.5, 0.2, 1.6], [0.5, 0.3, 0], glow);
    return g;
  }
  if (kind === 'leech') {
    const cone = new T.Mesh(new T.ConeGeometry(0.8, 2.6, 7), glow);
    g.add(cone);
    return g;
  }
  const big = kind === 'boss' ? 3.4 : kind === 'bomber' ? 1.7 : 1;
  box(g, [2.3, 0.5, 1.5], [0, 0, 0], dark);
  box(g, [0.7, 0.32, 1.56], [-0.3, 0.1, 0], glow);
  for (const z of [-1.4, 1.4]) {
    const wing = box(g, [2.4, 0.12, 1.1], [0.25, 0, z], pale);
    wing.rotation.y = z * 0.2;
    box(g, [0.6, 0.18, 0.6], [-0.4, -0.2, z], glow);
  }
  if (kind === 'hunter') {
    const ring = new T.Mesh(new T.TorusGeometry(1.6, 0.13, 6, 28), glow);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
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
    beam.position.y = -5;
    g.add(beam);
  }
  g.scale.setScalar(big);
  return g;
}
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
  for (let layer = 0; layer < 3; layer++) group.add(makeRidge(layer));
  return { group, planet, mountainMaterial };
}
export function disposeGroup(group: T.Object3D, retainedMaterials?: Set<T.Material>) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>();
  group.traverse((o) => {
    if (o instanceof T.Mesh || o instanceof T.Points) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => {
    if (retainedMaterials?.has(m)) return;
    const map = (m as T.MeshStandardMaterial).map;
    map?.dispose();
    m.dispose();
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
      const ridge =
        Math.pow(Math.max(0, Math.sin(i * 0.17 + layer * 2) * 0.4 + 0.5), 0.7) * 11 +
        randomAt(i + layer * 200) * 6;
      const y = -3 + Math.sin((j / 8) * Math.PI) * ridge + randomAt(i * 9 + j + layer * 93) * 2;
      vertices.push(x, y, z);
      const shade = 0.75 + randomAt(i * 7 + j) * 0.35;
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
  return new T.Mesh(
    geo,
    new T.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 1,
      flatShading: true,
    }),
  );
}
let lunarBaseTexture: T.CanvasTexture | undefined;
export function lunarTexture() {
  if (lunarBaseTexture) {
    const texture = new T.CanvasTexture(lunarBaseTexture.image);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#b4b7b6';
  c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 18000; i++) {
    const x = randomAt(i * 3 + 10) * 512,
      y = randomAt(i * 3 + 20) * 512,
      r = 0.3 + randomAt(i * 3 + 30) * 3;
    const grey = 95 + Math.floor(randomAt(i + 5) * 135);
    c.fillStyle = 'rgba(' + grey + ',' + grey + ',' + grey + ',.25)';
    c.beginPath();
    c.ellipse(x, y, r * 2, r, 0.6, 0, 7);
    c.fill();
  }
  for (let i = 0; i < 35; i++) {
    const x = randomAt(i + 90) * 512,
      y = randomAt(i + 290) * 512,
      r = 3 + randomAt(i + 30) * 18;
    const grad = c.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, '#4448');
    grad.addColorStop(0.6, '#7775');
    grad.addColorStop(0.85, '#ddd4');
    grad.addColorStop(1, '#aaa0');
    c.fillStyle = grad;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  lunarBaseTexture = texture;
  return texture.clone();
}
