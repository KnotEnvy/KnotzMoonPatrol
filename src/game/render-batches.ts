import * as T from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Batch owned, static, direct-child meshes. Animated child groups stay independent.
 * Call during model construction, before these meshes are used by the renderer.
 * Source geometries must be exclusively owned by this group.
 */
export function batchStaticMeshes(group: T.Group, exclude = new Set<T.Object3D>()) {
  const batches = new Map<string, T.Mesh<T.BufferGeometry, T.Material>[]>();
  for (const child of group.children) {
    if (
      !(child instanceof T.Mesh) ||
      child instanceof T.InstancedMesh ||
      Array.isArray(child.material) ||
      exclude.has(child) ||
      !child.visible ||
      child.children.length
    )
      continue;
    const attributes = Object.keys(child.geometry.attributes).sort().join(',');
    const key = `${child.material.uuid}:${child.castShadow}:${child.receiveShadow}:${!!child.geometry.index}:${attributes}`;
    const meshes = batches.get(key) ?? [];
    meshes.push(child);
    batches.set(key, meshes);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const copies = meshes.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(copies);
    copies.forEach((copy) => copy.dispose());
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const merged = new T.Mesh(geometry, meshes[0].material);
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    group.add(merged);
    const originals = new Set(meshes.map((mesh) => mesh.geometry));
    meshes.forEach((mesh) => mesh.removeFromParent());
    originals.forEach((original) => original.dispose());
  }
}

/** Pack only live transforms into one draw. Membership/order can change every frame. */
export function updateInstanceBatch(batch: T.InstancedMesh, transforms: Iterable<T.Object3D>) {
  let count = 0;
  for (const transform of transforms) {
    if (count >= batch.instanceMatrix.count) throw new Error('Instance batch capacity exceeded');
    transform.updateMatrix();
    batch.setMatrixAt(count++, transform.matrix);
  }
  batch.count = count;
  batch.visible = count > 0;
  if (count > 0) batch.instanceMatrix.needsUpdate = true;
}
