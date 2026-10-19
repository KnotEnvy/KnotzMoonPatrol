import RAPIER from '@dimforge/rapier3d-compat';

/** Match Terrain's x-major 65 x 9 vertex grid, including its triangle diagonals.
 * A heightfield avoids rebuilding a triangle-mesh BVH whenever a chunk streams in
 * or a crater commits. Heights are copied so staged edits cannot mutate live physics.
 */
export function terrainCollider(vertices: Float32Array) {
  const heights = new Float32Array(65 * 9);
  for (let i = 0; i < heights.length; i++) heights[i] = vertices[i * 3 + 1];
  return RAPIER.ColliderDesc.heightfield(8, 64, heights, { x: 64, y: 1, z: 24 })
    .setTranslation(vertices[0] + 32, 0, 0)
    .setFriction(0.8);
}
