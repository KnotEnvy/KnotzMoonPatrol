import * as T from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { baseHeight, BIOMES, biomeIndex, randomAt, FINISH } from './rules';
import { mat, box, disposeGroup, disposeMaterial } from './models';
import { biomeSurface } from './surfaces';
import { TerrainCompute } from './terrain-compute';
import { batchStaticMeshes } from './render-batches';
interface Chunk {
  id: number;
  group: T.Group;
  mesh: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  collider: RAPIER.Collider;
  vertices: Float32Array;
  indices: Uint32Array;
  version: number;
}
type PreparedChunk = Chunk & { original: Float32Array; baseCollider: RAPIER.Collider };
export class Terrain {
  private materials = new Map<number, T.MeshStandardMaterial>();
  private retainedMaterials = new Set<T.Material>();
  private chunks = new Map<number, Chunk>();
  private prepared = new Map<number, PreparedChunk>();
  private sceneryMaterials = new Map<string, T.MeshStandardMaterial>();
  private sceneryRegions = new Map<number, T.Group>();
  private visibleRegions = new Set<number>();
  private dirty = new Set<number>();
  private generation = 0;
  private disposed = false;
  private queue = Promise.resolve();
  constructor(
    private scene: T.Scene,
    private world: RAPIER.World,
    private compute: TerrainCompute,
  ) {}
  /** The route is finite. Build its CPU geometry during loading, never on a driving frame. */
  async prepare() {
    for (let id = -2; id <= Math.floor((FINISH + 200) / 64); id++) {
      if (this.disposed) return;
      if (!this.prepared.has(id)) this.prepared.set(id, this.build(id));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    // Keep the deformable 64 m surfaces independent. Decorations can share much
    // larger draws without changing a single vertex, material, or shadow flag.
    for (const chunk of this.prepared.values()) {
      const id = Math.floor(chunk.id / 4);
      let region = this.sceneryRegions.get(id);
      if (!region) this.sceneryRegions.set(id, (region = new T.Group()));
      for (const child of [...chunk.group.children]) if (child !== chunk.mesh) region.add(child);
    }
    for (const region of this.sceneryRegions.values()) {
      batchStaticMeshes(region);
      region.traverse((object) => {
        if (object === region) return;
        object.updateMatrix();
        object.matrixAutoUpdate = false;
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (this.disposed) return;
    }
    this.update(0);
  }
  warmupGroups() {
    return [...this.prepared.values()]
      .map((c) => c.group)
      .concat([...this.sceneryRegions.values()]);
  }
  warmupViews() {
    const seen = new Set<number>();
    return [...this.prepared.values()]
      .filter((chunk) => {
        const biome = biomeIndex(chunk.id * 64);
        if (seen.has(biome)) return false;
        seen.add(biome);
        return true;
      })
      .flatMap((chunk) => {
        const views = [{ group: chunk.group, origin: chunk.id * 64 }];
        const scenery = this.sceneryRegions.get(Math.floor(chunk.id / 4));
        if (scenery) views.push({ group: scenery, origin: chunk.id * 64 });
        return views;
      });
  }
  private scenery(key: string, color: string, metalness = 0.15, roughness = 0.7, glow?: string) {
    let material = this.sceneryMaterials.get(key);
    if (!material) {
      material = mat(color, metalness, roughness, glow);
      this.sceneryMaterials.set(key, material);
      this.retainedMaterials.add(material);
    }
    return material;
  }
  update(x: number) {
    const min = Math.floor((x - 90) / 64),
      max = Math.floor((x + 200) / 64);
    for (let i = min; i <= max; i++) if (!this.chunks.has(i)) this.add(i);
    for (const [id, c] of this.chunks)
      if (id < min || id > max) {
        c.collider.setEnabled(false);
        c.group.removeFromParent();
        this.chunks.delete(id);
      }
    const first = Math.floor(min / 4),
      last = Math.floor(max / 4);
    for (let id = first; id <= last; id++) {
      const region = this.sceneryRegions.get(id);
      if (region && !this.visibleRegions.has(id)) {
        this.scene.add(region);
        this.visibleRegions.add(id);
      }
    }
    for (const id of this.visibleRegions)
      if (id < first || id > last) {
        this.sceneryRegions.get(id)?.removeFromParent();
        this.visibleRegions.delete(id);
      }
  }
  private add(id: number) {
    let prepared = this.prepared.get(id);
    if (!prepared) {
      prepared = this.build(id);
      this.prepared.set(id, prepared);
    }
    prepared.collider.setEnabled(true);
    this.scene.add(prepared.group);
    this.chunks.set(id, prepared);
  }
  private build(id: number): PreparedChunk {
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
      Object.assign(material, biomeSurface(surfaceBiome));
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
    group.add(new T.Mesh(skirt, this.scenery('skirt', '#26333e', 0.1, 1)));
    const biome = biomeIndex(id * 64),
      accent = this.scenery('accent-' + biome, BIOMES[biome].color, 0.2, 0.3, BIOMES[biome].color),
      markerMaterial = this.scenery('marker', '#485d67');
    for (let i = 0; i < 3; i++) {
      const x = id * 64 + 8 + i * 23,
        z = -5.5;
      if (baseHeight(x) > -2) {
        box(group, [0.12, 1.7, 0.12], [x, baseHeight(x) + 0.85, z], markerMaterial);
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
    if (biome === 1 || biome === 3) {
      const crystalMaterial = this.scenery(
        'flora-' + biome,
        BIOMES[biome].color,
        0.55,
        0.25,
        biome === 3 ? '#174d35' : undefined,
      );
      for (let i = 0; i < 6; i++) {
        const x = id * 64 + i * 11,
          z = -7 - randomAt(id + i) * 4,
          h = 2 + randomAt(id * 4 + i) * 7;
        if (biome === 1) {
          for (let shard = 0; shard < 3; shard++) {
            const height = h * (shard === 0 ? 1 : 0.5);
            const crystal = new T.Mesh(
              new T.ConeGeometry(shard === 0 ? 1.1 : 0.55, height, 5),
              crystalMaterial,
            );
            crystal.position.set(
              x + (shard - 1) * 0.8,
              baseHeight(x) + height / 2,
              z + shard * 0.35,
            );
            crystal.rotation.z = (shard - 1) * 0.22;
            group.add(crystal);
          }
        } else {
          const stem = new T.Mesh(new T.CylinderGeometry(0.15, 0.4, h * 0.65, 7), markerMaterial);
          stem.position.set(x, baseHeight(x) + h * 0.325, z);
          group.add(stem);
          const cap = new T.Mesh(new T.SphereGeometry(1.3, 12, 8), crystalMaterial);
          cap.scale.set(1, 0.35, 0.85);
          cap.position.set(x, baseHeight(x) + h * 0.65, z);
          group.add(cap);
          for (let spore = 0; spore < 3; spore++) {
            const bulb = new T.Mesh(new T.IcosahedronGeometry(0.09, 0), crystalMaterial);
            bulb.position.set(x + (spore - 1) * 1.2, baseHeight(x) + h * 0.7 + spore * 0.6, z);
            group.add(bulb);
          }
        }
      }
    }
    if (biome === 2) {
      const lava = box(
        group,
        [64, 0.1, 24],
        [id * 64 + 32, -6, 0],
        this.scenery('lava', '#ff5825', 0.1, 0.4, '#e84008'),
      );
      lava.receiveShadow = false;
    }
    if (biome === 4) {
      const towerMaterial = this.scenery('tower', '#28303d', 0.7, 0.4);
      for (let i = 0; i < 4; i++) {
        const x = id * 64 + i * 18;
        box(group, [2, 12, 2], [x, 3, -10], towerMaterial);
        box(group, [3.2, 0.6, 2.6], [x, 8, -10], towerMaterial);
        box(group, [2.05, 0.14, 2.05], [x, 6.7, -10], accent);
        box(group, [0.15, 4, 0.1], [x + 0.65, 2, -8.95], accent);
        box(group, [16, 0.6, 1], [x + 8, 7.4, -11], towerMaterial);
      }
    }
    // The deformable surface remains independent from decorative batches.
    batchStaticMeshes(group, new Set([mesh]));
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(v, ix).setFriction(0.8).setEnabled(false),
    );
    return {
      id,
      group,
      mesh,
      vertices: v,
      original: v.slice(),
      indices: ix,
      version: 0,
      collider,
      baseCollider: collider,
    };
  }
  carve(x: number, y: number, radius = 5, depth = 5) {
    const generation = this.generation;
    this.queue = this.queue
      .then(async () => {
        if (this.disposed || generation !== this.generation) return;
        const chunks = [...this.chunks.values()].filter(
          (chunk) => chunk.id * 64 <= x + radius && (chunk.id + 1) * 64 >= x - radius,
        );
        const edits = await Promise.all(
          chunks.map(async (chunk) => ({
            chunk,
            vertices: await this.compute.carve(chunk.vertices, x, y, radius, depth),
          })),
        );
        if (this.disposed || generation !== this.generation) return;
        const live = edits.filter(
          ({ chunk, vertices }) =>
            this.chunks.get(chunk.id) === chunk &&
            vertices !== chunk.vertices &&
            vertices.some((value, i) => value !== chunk.vertices[i]),
        );
        const replacements: { chunk: Chunk; vertices: Float32Array; collider: RAPIER.Collider }[] =
          [];
        try {
          for (const { chunk, vertices } of live)
            replacements.push({
              chunk,
              vertices,
              collider: this.world.createCollider(
                RAPIER.ColliderDesc.trimesh(vertices, chunk.indices).setFriction(0.8),
              ),
            });
        } catch (error) {
          for (const replacement of replacements)
            this.world.removeCollider(replacement.collider, true);
          throw error;
        }
        // All brush jobs finish before any surface changes. Commit the mesh/collider
        // pair for every surviving chunk in one task, retaining GPU vertex buffers.
        for (const { chunk, vertices, collider } of replacements) {
          if (chunk.collider === this.prepared.get(chunk.id)?.baseCollider)
            chunk.collider.setEnabled(false);
          else this.world.removeCollider(chunk.collider, true);
          chunk.collider = collider;
          chunk.vertices.set(vertices);
          chunk.mesh.geometry.getAttribute('position').needsUpdate = true;
          chunk.mesh.geometry.computeVertexNormals();
          chunk.mesh.geometry.computeBoundingSphere();
          chunk.version++;
          this.dirty.add(chunk.id);
        }
      })
      .catch((error) => console.warn('Terrain brush failed', error));
    return this.queue;
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
  reset() {
    this.generation++;
    for (const c of this.chunks.values()) {
      c.collider.setEnabled(false);
      c.group.removeFromParent();
    }
    this.chunks.clear();
    for (const id of this.dirty) {
      const chunk = this.prepared.get(id);
      if (!chunk) continue;
      if (chunk.collider !== chunk.baseCollider) this.world.removeCollider(chunk.collider, true);
      chunk.collider = chunk.baseCollider;
      chunk.vertices.set(chunk.original);
      chunk.mesh.geometry.getAttribute('position').needsUpdate = true;
      chunk.mesh.geometry.computeVertexNormals();
      chunk.mesh.geometry.computeBoundingSphere();
    }
    this.dirty.clear();
    this.update(0);
  }
  dispose() {
    this.disposed = true;
    const groups = new Set(
      [...this.prepared.values(), ...this.chunks.values()].map((c) => c.group),
    );
    const colliders = new Set([...this.chunks.values()].map((c) => c.collider));
    for (const c of this.prepared.values()) {
      colliders.add(c.collider);
      colliders.add(c.baseCollider);
    }
    colliders.forEach((collider) => this.world.removeCollider(collider, true));
    groups.forEach((group) => disposeGroup(group, this.retainedMaterials));
    this.sceneryRegions.forEach((group) => disposeGroup(group, this.retainedMaterials));
    this.sceneryRegions.clear();
    this.visibleRegions.clear();
    this.chunks.clear();
    this.prepared.clear();
    this.retainedMaterials.forEach(disposeMaterial);
    this.materials.clear();
    this.sceneryMaterials.clear();
    this.retainedMaterials.clear();
  }
}
