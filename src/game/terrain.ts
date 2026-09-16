import * as T from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { baseHeight, BIOMES, biomeIndex, randomAt } from './rules';
import { mat, box, disposeGroup, lunarTexture } from './models';
import { TerrainCompute } from './terrain-compute';
interface Chunk {
  id: number;
  group: T.Group;
  mesh: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  collider: RAPIER.Collider;
  vertices: Float32Array;
  indices: Uint32Array;
  version: number;
}
export class Terrain {
  private materials = new Map<number, T.MeshStandardMaterial>();
  private retainedMaterials = new Set<T.Material>();
  private chunks = new Map<number, Chunk>();
  private disposed = false;
  private queue = Promise.resolve();
  constructor(
    private scene: T.Scene,
    private world: RAPIER.World,
    private compute: TerrainCompute,
  ) {}
  update(x: number) {
    const min = Math.floor((x - 90) / 64),
      max = Math.floor((x + 200) / 64);
    for (let i = min; i <= max; i++) if (!this.chunks.has(i)) this.add(i);
    for (const [id, c] of this.chunks)
      if (id < min || id > max) {
        this.world.removeCollider(c.collider, true);
        disposeGroup(c.group, this.retainedMaterials);
        this.chunks.delete(id);
      }
  }
  private add(id: number) {
    const group = new T.Group(),
      vertices: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= 64; i++)
      for (let j = 0; j <= 8; j++) {
        const x = id * 64 + i,
          z = j * 3 - 12;
        vertices.push(x, baseHeight(x, z), z);
      }
    for (let i = 0; i < 64; i++)
      for (let j = 0; j < 8; j++) {
        const a = i * 9 + j;
        indices.push(a, a + 1, a + 9, a + 1, a + 10, a + 9);
      }
    const v = new Float32Array(vertices),
      ix = new Uint32Array(indices),
      geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(v, 3));
    geo.setIndex(new T.BufferAttribute(ix, 1));
    geo.computeVertexNormals();
    const surfaceBiome = biomeIndex(id * 64);
    let material = this.materials.get(surfaceBiome);
    if (!material) {
      material = mat(BIOMES[surfaceBiome].ground, 0.1, 0.96);
      material.map = lunarTexture();
      material.bumpMap = material.map;
      material.bumpScale = 0.18;
      this.materials.set(surfaceBiome, material);
      this.retainedMaterials.add(material);
    }
    const uvs: number[] = [];
    for (let i = 0; i <= 64; i++)
      for (let j = 0; j <= 8; j++) uvs.push((id * 64 + i) / 18, (j * 3) / 18);
    geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    const mesh = new T.Mesh(geo, material);
    mesh.receiveShadow = true;
    group.add(mesh);
    // A dark cut edge gives the continuous terrain depth in the side-on view.
    const edgeVertices: number[] = [],
      edgeIndices: number[] = [];
    for (let i = 0; i <= 64; i++) {
      const x = id * 64 + i;
      edgeVertices.push(x, baseHeight(x, 12), 12, x, -13, 12);
    }
    for (let i = 0; i < 64; i++) {
      const a = i * 2;
      edgeIndices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
    const skirt = new T.BufferGeometry();
    skirt.setAttribute('position', new T.Float32BufferAttribute(edgeVertices, 3));
    skirt.setIndex(edgeIndices);
    skirt.computeVertexNormals();
    group.add(new T.Mesh(skirt, mat('#26333e', 0.1, 1)));
    const biome = biomeIndex(id * 64),
      accent = mat(BIOMES[biome].color, 0.2, 0.3, BIOMES[biome].color);
    for (let i = 0; i < 3; i++) {
      const x = id * 64 + 8 + i * 23,
        z = -5.5;
      if (baseHeight(x) > -2) {
        box(group, [0.12, 1.7, 0.12], [x, baseHeight(x) + 0.85, z], mat('#485d67'));
        box(group, [0.16, 0.28, 0.2], [x, baseHeight(x) + 1.8, z], accent);
      }
    }
    for (let i = 0; i < 14; i++) {
      const x = id * 64 + randomAt(id * 29 + i) * 64,
        z = (randomAt(id * 47 + i) > 0.5 ? 1 : -1) * (3 + randomAt(id * 67 + i) * 7);
      const h = baseHeight(x, z),
        size = 0.15 + randomAt(id * 17 + i) * 0.65;
      const rock = new T.Mesh(new T.DodecahedronGeometry(size, 0), material);
      rock.position.set(x, h + size * 0.3, z);
      rock.scale.set(1.5, 0.7, 1);
      rock.rotation.y = i;
      rock.castShadow = false;
      group.add(rock);
    }
    if (biome === 1 || biome === 3)
      for (let i = 0; i < 6; i++) {
        const x = id * 64 + i * 11,
          z = -7 - randomAt(id + i) * 4,
          h = 2 + randomAt(id * 4 + i) * 7;
        const crystal = new T.Mesh(
          new T.ConeGeometry(biome === 1 ? 1.1 : 0.6, h, biome === 1 ? 5 : 7),
          mat(BIOMES[biome].color, 0.55, 0.25, biome === 3 ? '#174d35' : undefined),
        );
        crystal.position.set(x, baseHeight(x) + h / 2, z);
        crystal.rotation.z = 0.15;
        group.add(crystal);
      }
    if (biome === 2) {
      const lava = box(
        group,
        [64, 0.1, 24],
        [id * 64 + 32, -6, 0],
        mat('#ff5825', 0.1, 0.4, '#e84008'),
      );
      lava.receiveShadow = false;
    }
    if (biome === 4)
      for (let i = 0; i < 4; i++)
        box(group, [2, 12, 2], [id * 64 + i * 18, 3, -10], mat('#28303d', 0.7, 0.4));
    this.scene.add(group);
    const collider = this.world.createCollider(RAPIER.ColliderDesc.trimesh(v, ix).setFriction(0.8));
    this.chunks.set(id, { id, group, mesh, collider, vertices: v, indices: ix, version: 0 });
  }
  carve(x: number, y: number, radius = 5, depth = 5) {
    this.queue = this.queue
      .then(async () => {
        for (const chunk of [...this.chunks.values()]) {
          if (chunk.id * 64 > x + radius || (chunk.id + 1) * 64 < x - radius) continue;
          const vertices = await this.compute.carve(chunk.vertices, x, y, radius, depth);
          if (this.disposed || this.chunks.get(chunk.id) !== chunk) continue;
          const collider = this.world.createCollider(
            RAPIER.ColliderDesc.trimesh(vertices, chunk.indices).setFriction(0.8),
          );
          this.world.removeCollider(chunk.collider, true);
          chunk.collider = collider;
          chunk.vertices = vertices;
          chunk.mesh.geometry.setAttribute('position', new T.BufferAttribute(vertices, 3));
          chunk.mesh.geometry.computeVertexNormals();
          chunk.mesh.geometry.computeBoundingSphere();
          chunk.version++;
        }
      })
      .catch((err) => console.warn('Terrain brush failed', err));
  }
  heightAt(x: number) {
    const chunk = this.chunks.get(Math.floor(x / 64));
    if (!chunk) return baseHeight(x);
    const local = x - chunk.id * 64,
      i = Math.min(63, Math.floor(local)),
      t = local - i;
    return (
      chunk.vertices[(i * 9 + 4) * 3 + 1] * (1 - t) + chunk.vertices[((i + 1) * 9 + 4) * 3 + 1] * t
    );
  }
  dispose() {
    this.disposed = true;
    for (const c of this.chunks.values()) {
      this.world.removeCollider(c.collider, true);
      disposeGroup(c.group, this.retainedMaterials);
    }
    this.chunks.clear();
    for (const material of this.materials.values()) {
      material.map?.dispose();
      material.dispose();
    }
    this.materials.clear();
    this.retainedMaterials.clear();
  }
}
