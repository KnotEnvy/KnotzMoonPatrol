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
  // Fender shoulders, access panels and roll cage keep the six-wheel silhouette legible.
  for (const z of [-1.02, 1.02]) {
    box(group, [4.3, 0.16, 0.3], [-0.1, 0.13, z], cream);
    box(group, [1.3, 0.36, 0.06], [-1.15, 0.46, z], dark);
    for (let i = 0; i < 3; i++) box(group, [0.07, 0.25, 0.08], [-1.55 + i * 0.3, 0.46, z], orange);
    box(group, [1.9, 0.09, 0.1], [0.45, 1.6, z * 0.88], dark);
    box(group, [0.09, 0.9, 0.1], [-0.45, 1.12, z * 0.88], dark);
  }
  box(group, [0.18, 0.26, 2.3], [2.22, 0.02, 0], dark);
  for (const z of [-0.65, 0.65]) {
    box(group, [0.6, 0.4, 0.45], [-2.15, 0.15, z], dark);
    box(group, [0.08, 0.23, 0.3], [-2.47, 0.15, z], orange);
  }
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
      batchStaticMeshes(wheel);
    }
  // Six wheels share geometry and materials; keep their pivots for suspension,
  // but submit each matching component once instead of six separate draws.
  const wheelBatches: T.InstancedMesh[] = [];
  for (const child of wheels[0].children) {
    if (!(child instanceof T.Mesh)) continue;
    child.updateMatrix();
    const batch = new T.InstancedMesh(
      child.geometry.clone().applyMatrix4(child.matrix),
      child.material,
      wheels.length,
    );
    batch.castShadow = child.castShadow;
    batch.receiveShadow = child.receiveShadow;
    batch.frustumCulled = false;
    batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
    group.add(batch);
    wheelBatches.push(batch);
  }
  for (const wheel of wheels)
    for (const child of [...wheel.children]) {
      if (child instanceof T.Mesh) child.geometry.dispose();
      child.removeFromParent();
    }
  batchStaticMeshes(turret);
  batchStaticMeshes(group);
  const suspension = new T.InstancedMesh(new T.CylinderGeometry(0.09, 0.09, 1, 6), orange, 6);
  suspension.instanceMatrix.setUsage(T.DynamicDrawUsage);
  suspension.frustumCulled = false;
  group.add(suspension);
  const flame = box(group, [1.5, 0.22, 1.2], [-2.9, -0.05, 0], glow);
  flame.visible = false;
  const rover = { group, wheels, turret, flame, suspension, wheelBatches };
  updateWheelBatches(rover);
  updateSuspension(rover);
  return rover;
}
const strutTransform = new T.Object3D();
const strutStart = new T.Vector3();
const strutEnd = new T.Vector3();
const strutDirection = new T.Vector3();
const strutAxis = new T.Vector3(0, 1, 0);
export function updateWheelBatches(rover: { wheels: T.Group[]; wheelBatches: T.InstancedMesh[] }) {
  rover.wheels.forEach((wheel, i) => {
    wheel.updateMatrix();
    for (const batch of rover.wheelBatches) batch.setMatrixAt(i, wheel.matrix);
  });
  for (const batch of rover.wheelBatches) batch.instanceMatrix.needsUpdate = true;
}
export function updateSuspension(rover: { wheels: T.Group[]; suspension: T.InstancedMesh }) {
  rover.wheels.forEach((wheel, i) => {
    strutStart.set(wheel.position.x - 0.35, 0.05, wheel.position.z * 0.7);
    strutEnd.copy(wheel.position);
    strutDirection.subVectors(strutEnd, strutStart);
    strutTransform.position.copy(strutStart).add(strutEnd).multiplyScalar(0.5);
    strutTransform.scale.set(1, strutDirection.length(), 1);
    strutTransform.quaternion.setFromUnitVectors(strutAxis, strutDirection.normalize());
    strutTransform.updateMatrix();
    rover.suspension.setMatrixAt(i, strutTransform.matrix);
  });
  rover.suspension.instanceMatrix.needsUpdate = true;
}
export function makeEnemy(kind: string) {
  const g = new T.Group(),
    dark = mat('#343a47', 0.65, 0.4),
    glow = mat(
      kind === 'hunter' ? '#80ffe1' : '#fc685a',
      0.3,
      0.25,
      kind === 'hunter' ? '#28b58b' : '#b52c31',
    ),
    pale = mat('#bbc0c5', 0.55, 0.42);
  g.name = kind;
  // Consistent shadow flags allow all static pieces to collapse to three material batches.
  const solid = (geometry: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  const finish = () => {
    batchStaticMeshes(g);
    // Some archetypes use only a subset of the palette.
    const used = new Set<T.Material>();
    g.traverse((o) => {
      if (o instanceof T.Mesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) used.add(m);
    });
    for (const m of [dark, glow, pale]) if (!used.has(m)) m.dispose();
    return g;
  };
  if (kind === 'rock') {
    pale.color.set('#687277');
    pale.metalness = 0.05;
    pale.roughness = 0.95;
    pale.flatShading = true;
    const rock = solid(new T.DodecahedronGeometry(1.15, 1), pale);
    rock.scale.set(1.3, 1.1, 1);
    rock.rotation.set(0.4, 0.6, 0.2);
    // A fractured foot breaks the perfect-polyhedron silhouette without enlarging the hurtbox.
    const chip = solid(new T.DodecahedronGeometry(0.55, 0), pale, -0.65, -0.55, 0.35);
    chip.rotation.set(0.2, 0.9, 0.6);
    return finish();
  }
  if (kind === 'mine') {
    solid(new T.IcosahedronGeometry(0.6, 1), dark);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const spike = solid(
        new T.ConeGeometry(0.16, 0.6, 6),
        pale,
        Math.sin(a) * 0.7,
        Math.cos(a) * 0.7,
      );
      spike.rotation.z = -a;
    }
    solid(new T.SphereGeometry(0.25, 10, 8), glow, 0, 0, 0.53);
    return finish();
  }
  if (kind === 'skimmer') {
    box(g, [1.8, 0.55, 1.3], [0, 0.1, 0], pale);
    for (const z of [-0.8, 0.8]) {
      box(g, [2.25, 0.5, 0.45], [0, -0.2, z], dark);
      for (let i = 0; i < 5; i++) box(g, [0.12, 0.53, 0.48], [-0.85 + i * 0.42, -0.2, z], pale);
    }
    box(g, [0.9, 0.5, 0.8], [-0.25, 0.56, 0], dark);
    box(g, [1, 0.17, 0.2], [-1, 0.55, 0], pale);
    box(g, [0.09, 0.22, 0.25], [-1.5, 0.55, 0], glow);
    box(g, [0.65, 0.14, 0.08], [-0.28, 0.58, 0.43], glow);
    return finish();
  }
  if (kind === 'leech') {
    for (let i = 0; i < 5; i++) {
      const segment = solid(
        new T.IcosahedronGeometry(0.68 - i * 0.075, 0),
        i % 2 ? dark : pale,
        Math.sin(i * 0.8) * 0.22,
        -1 + i * 0.45,
      );
      segment.scale.y = 0.65;
    }
    for (const x of [-0.28, 0.28]) {
      const fang = solid(new T.ConeGeometry(0.16, 0.7, 6), glow, x, 1.15);
      fang.rotation.z = x;
    }
    return finish();
  }
  if (kind === 'interceptor') {
    const nose = solid(new T.ConeGeometry(0.65, 3.3, 4), pale, -0.2);
    nose.rotation.z = Math.PI / 2;
    for (const z of [-1, 1]) {
      const wing = box(g, [1.9, 0.12, 0.75], [0.6, -0.1, z], dark);
      wing.rotation.y = z * -0.6;
      box(g, [0.15, 0.23, 0.45], [1.5, 0, z * 0.5], glow);
    }
    box(g, [0.75, 0.22, 0.42], [-0.15, 0.38, 0], glow);
    return finish();
  }
  if (kind === 'bomber') {
    box(g, [2.7, 0.75, 1.7], [0, 0, 0], dark);
    box(g, [1.3, 0.5, 1.2], [-0.5, 0.52, 0], pale);
    box(g, [0.15, 0.3, 1], [-1.2, 0.48, 0], glow);
    for (const z of [-1.4, 1.4]) {
      box(g, [3.6, 0.6, 0.85], [0.2, -0.08, z], pale);
      box(g, [0.15, 0.35, 0.6], [2.02, -0.08, z], glow);
      for (let i = 0; i < 3; i++)
        solid(new T.SphereGeometry(0.27, 10, 8), glow, -0.8 + i * 0.8, -0.56, z);
    }
    // An exposed belly bay flashes before a torpedo drops.
    box(g, [1, 0.17, 0.8], [0, -0.5, 0], glow);
    g.userData.warningLight = glow;
    return finish();
  }
  // The scout and tractor hunter are recognizably saucers, with different proportions.
  const radius = kind === 'boss' ? 4.7 : kind === 'hunter' ? 1.65 : 1.35;
  solid(
    new T.CylinderGeometry(radius * 0.5, radius, kind === 'boss' ? 1.1 : 0.45, 24),
    pale,
    0,
    0.15,
  );
  solid(new T.CylinderGeometry(radius, radius * 0.55, 0.35, 24), dark, 0, -0.22);
  const dome = solid(new T.SphereGeometry(radius * 0.47, 20, 12), dark, 0, 0.5);
  dome.scale.y = 0.65;
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5;
    solid(
      new T.SphereGeometry(kind === 'boss' ? 0.21 : 0.1, 8, 6),
      glow,
      Math.cos(a) * radius * 0.84,
      0.12,
      Math.sin(a) * radius * 0.84,
    );
  }
  if (kind === 'boss') {
    const core = solid(new T.SphereGeometry(0.9, 16, 12), glow, 0, -0.65);
    core.scale.y = 0.7;
    for (const x of [-3.2, 3.2]) {
      box(g, [1, 2.1, 1.3], [x, 0.35, 0], dark);
      box(g, [0.7, 0.2, 1.4], [x, 1.45, 0], glow);
      box(g, [0.3, 1.1, 0.4], [x, -1.1, 0], pale);
    }
    g.userData.warningLight = glow;
  }
  if (kind === 'hunter') {
    const ring = solid(new T.TorusGeometry(1.6, 0.13, 6, 28), glow, 0, -0.5);
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
    g.userData.tractorBeam = beam;
  }
  return finish();
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
        randomAt(sample + layer * 200) * 6;
      const y =
        -3 + Math.sin((j / 8) * Math.PI) * ridge + randomAt(sample * 9 + j + layer * 93) * 2;
      vertices.push(x, y, z);
      const shade = 0.75 + randomAt(sample * 7 + j) * 0.35;
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
