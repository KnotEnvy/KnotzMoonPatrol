import * as T from 'three/webgpu';
import asset from './assets/rover.json';

/** Evaluated Blender meshes grouped by material and independently animated part. */
function geometry(mesh: (typeof asset.meshes)[number]) {
  const result = new T.BufferGeometry();
  result.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      mesh.position.map((v) => v / asset.positionScale),
      3,
    ),
  );
  result.setAttribute(
    'normal',
    new T.Float32BufferAttribute(
      mesh.normal.map((v) => v / asset.normalScale),
      3,
    ),
  );
  result.setAttribute(
    'color',
    new T.Float32BufferAttribute(
      mesh.color.map((v) => v / asset.colorScale),
      3,
    ),
  );
  result.setIndex(mesh.index);
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export function makeRover() {
  const group = new T.Group();
  group.name = 'Blender lunar utility rover';
  const materials = new Map<string, T.MeshStandardMaterial>();
  for (const [name, settings] of Object.entries(asset.materials)) {
    materials.set(
      name,
      new T.MeshStandardMaterial({
        ...settings,
        vertexColors: true,
        ...(name === 'light' ? { emissive: '#2ba4b2', emissiveIntensity: 1.3 } : {}),
      }),
    );
  }
  const turret = new T.Group();
  turret.name = 'Aiming mast';
  turret.position.set(-0.6, 1.18, 0);
  group.add(turret);
  const wheels: T.Group[] = [];
  for (const z of [-1.17, 1.17]) {
    for (const x of [-1.55, 0, 1.55]) {
      const wheel = new T.Group();
      wheel.name = `Suspension pivot ${wheels.length + 1}`;
      wheel.position.set(x, -0.6, z);
      group.add(wheel);
      wheels.push(wheel);
    }
  }
  const wheelBatches: T.InstancedMesh[] = [];
  for (const mesh of asset.meshes) {
    const material = materials.get(mesh.material)!;
    if (mesh.part === 'wheel') {
      const batch = new T.InstancedMesh(geometry(mesh), material, wheels.length);
      batch.name = `Blender wheels / ${mesh.material}`;
      batch.castShadow = batch.receiveShadow = true;
      batch.frustumCulled = false;
      batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
      group.add(batch);
      wheelBatches.push(batch);
    } else {
      const model = new T.Mesh(geometry(mesh), material);
      model.name = `Blender ${mesh.part} / ${mesh.material}`;
      model.castShadow = model.receiveShadow = true;
      (mesh.part === 'turret' ? turret : group).add(model);
    }
  }
  const suspension = new T.InstancedMesh(
    new T.CylinderGeometry(0.09, 0.09, 1, 8),
    materials.get('orange')!,
    wheels.length,
  );
  suspension.name = 'Articulated suspension struts';
  suspension.instanceMatrix.setUsage(T.DynamicDrawUsage);
  suspension.castShadow = suspension.receiveShadow = true;
  suspension.frustumCulled = false;
  group.add(suspension);
  const flame = new T.Mesh(new T.BoxGeometry(1.5, 0.22, 1.2), materials.get('light'));
  flame.name = 'Boost flame';
  flame.position.set(-2.9, -0.05, 0);
  flame.visible = false;
  group.add(flame);
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
