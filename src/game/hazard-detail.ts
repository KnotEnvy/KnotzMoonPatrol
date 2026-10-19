import * as T from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { HazardDefinition } from './route';

/** Static supporting geometry, using the hazard's existing palette and batch owner.
 * Warning volumes, destructible cores and collision shapes remain independent.
 */
export function detailHazard(
  group: T.Group,
  effect: T.Group,
  def: HazardDefinition,
  metal: T.Material,
  signal: T.Material,
) {
  const block = (owner: T.Group, size: number[], pos: number[], material = metal) => {
    const mesh = new T.Mesh(
      new RoundedBoxGeometry(size[0], size[1], size[2], 1, Math.min(...size) * 0.12),
      material,
    );
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = mesh.receiveShadow = true;
    owner.add(mesh);
    return mesh;
  };
  if (def.kind === 'laser' || def.kind === 'crystal') {
    for (const z of [-2.7, 2.7]) {
      block(group, [1.25, 0.16, 1.45], [0, 0.13, z]);
      if (def.kind === 'laser') {
        // Recessed emitter strips sit inside a substantial manufactured frame.
        block(group, [0.72, 0.23, 0.8], [0, 3.02, z]);
        for (const x of [-0.32, 0.32]) {
          block(group, [0.12, 2.45, 0.65], [x, 1.7, z]);
          block(group, [0.08, 1.8, 0.07], [x, 1.72, z + 0.36], signal);
        }
        for (const y of [0.65, 1.2, 2.35]) block(group, [0.68, 0.12, 0.72], [0, y, z]);
      } else {
        // Fracture splinters anchor the main crystal without enlarging its warning.
        for (const side of [-1, 1]) {
          const shard = new T.Mesh(new T.OctahedronGeometry(0.48, 0), metal);
          shard.position.set(side * 0.55, 0.65, z + side * 0.25);
          shard.scale.set(0.65, 1.6, 0.8);
          shard.rotation.z = -side * 0.25;
          group.add(shard);
        }
      }
    }
    // Protective yoke leaves the forward firing axis and luminous target exposed.
    block(group, [0.87, 0.15, 0.92], [0, 0.25, 0]);
    for (const z of [-0.45, 0.45]) block(group, [0.76, 0.77, 0.12], [0.04, 0.69, z]);
    block(group, [0.85, 0.14, 0.98], [0.04, 1.33, 0]);
  } else if (def.kind === 'vent') {
    for (let i = 0; i < 9; i++) {
      const angle = (i * Math.PI * 2) / 9;
      const rock = new T.Mesh(new T.DodecahedronGeometry(0.45, 0), metal);
      rock.position.set(Math.cos(angle) * 2.05, 0.08, Math.sin(angle) * 2.05);
      rock.scale.set(1.3, 0.7 + (i % 3) * 0.13, 0.8);
      rock.rotation.set(0.25, angle, 0.4);
      group.add(rock);
    }
  } else if (def.kind === 'plate') {
    // Layered broken edges move with the slab when the bridge fails.
    const slab = effect.children.find((child) => child.name === 'tectonic-plate') as T.Mesh;
    for (const z of [-3.7, 3.7])
      for (let i = 0; i < 5; i++) {
        const chip = block(
          effect,
          [def.width / 5 - 0.12, 0.19, 0.55],
          [(i - 2) * (def.width / 5), -0.18 - (i % 2) * 0.04, z],
          slab.material as T.Material,
        );
        chip.rotation.y = (i % 2 ? 1 : -1) * 0.05;
      }
  } else if (def.kind === 'canopy') {
    const cap = effect.children.find((child) => child instanceof T.Mesh) as T.Mesh;
    for (let i = 0; i < 5; i++) {
      const x = -def.width / 2 + 1.5 + i * 2.3;
      for (const z of [-2.5, 2.5]) {
        const gill = block(effect, [1.65, 0.12, 0.16], [x, -0.08, z], cap.material as T.Material);
        gill.rotation.y = z * 0.06;
      }
    }
  } else {
    for (const x of [-def.width / 2, def.width / 2])
      for (const z of [-4, 4]) {
        block(group, [0.75, 0.18, 0.8], [x, 0.12, z]);
        block(group, [0.46, 0.55, 0.48], [x, 0.4, z]);
        block(group, [0.56, 0.08, 0.58], [x, 0.68, z], signal);
      }
  }
}
