import * as T from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { baseHeight, BIOMES, biomeIndex, randomAt, FINISH } from './rules';
import { mat, box, disposeGroup, disposeMaterial } from './models';
import { biomeSurface } from './surfaces';
import { TerrainCompute } from './terrain-compute';
import { terrainCollider } from './terrain-collider';
import { batchStaticMeshes } from './render-batches';
import { addEnvironment } from './environment';
interface Chunk {
  id: number;
  group: T.Group;
  mesh: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  collider: RAPIER.Collider;
  vertices: Float32Array;
  indices: Uint32Array;
  version: number;
}
type PreparedChunk = Omit<Chunk, 'collider'> & { original: Float32Array };
export class Terrain {
  private materials = new Map<number, T.MeshStandardMaterial>();
  private retainedMaterials = new Set<T.Material>();
  private chunks = new Map<number, Chunk>();
  private prepared = new Map<number, PreparedChunk>();
  private sceneryMaterials = new Map<string, T.MeshStandardMaterial>();
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
  }
  warmupGroups() {
    return [...this.prepared.values()].map((c) => c.group);
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
      .map((chunk) => ({ group: chunk.group, origin: chunk.id * 64 }));
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
        this.world.removeCollider(c.collider, true);
        c.group.removeFromParent();
        this.chunks.delete(id);
      }
  }
  private add(id: number) {
    let prepared = this.prepared.get(id);
    if (!prepared) {
      prepared = this.build(id);
      this.prepared.set(id, prepared);
    }
    const collider = this.world.createCollider(terrainCollider(prepared.vertices));
    this.scene.add(prepared.group);
    this.chunks.set(id, { ...prepared, collider });
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
    // An outward-facing stratified cut shows the terrain's physical depth. The old
    // reversed winding exposed the void/lava beneath the front edge of the route.
    const edgeVertices: number[] = [],
      edgeIndices: number[] = [],
      edgeColors: number[] = [];
    const courses = 5;
    for (let i = 0; i <= 64; i++) {
      const x = id * 64 + i;
      const top = baseHeight(x, 12);
      for (let row = 0; row < courses; row++) {
        const depth = row / (courses - 1);
        edgeVertices.push(x, top * (1 - depth) - 13 * depth, 12);
        const shade = (0.73 - depth * 0.43) * (1 + Math.sin(x * 0.17 + row * 2.4) * 0.075);
        edgeColors.push(shade, shade * 0.96, shade * 0.9);
      }
    }
    for (let i = 0; i < 64; i++)
      for (let row = 0; row < courses - 1; row++) {
        const a = i * courses + row;
        edgeIndices.push(a, a + 1, a + courses, a + courses, a + 1, a + courses + 1);
      }
    const skirt = new T.BufferGeometry();
    skirt.setAttribute('position', new T.Float32BufferAttribute(edgeVertices, 3));
    skirt.setAttribute('color', new T.Float32BufferAttribute(edgeColors, 3));
    skirt.setIndex(edgeIndices);
    skirt.computeVertexNormals();
    const skirtMaterial = this.scenery(
      'skirt-' + surfaceBiome,
      BIOMES[surfaceBiome].ground,
      0.1,
      1,
    );
    skirtMaterial.vertexColors = true;
    const cutEdge = new T.Mesh(skirt, skirtMaterial);
    cutEdge.name = 'terrain-cut-edge';
    group.add(cutEdge);
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
    addEnvironment(group, id, biome, this.scenery.bind(this));
    if (biome === 2) {
      const lava = box(
        group,
        [64, 0.1, 12],
        [id * 64 + 32, -6, 0],
        this.scenery('lava', '#ff5825', 0.1, 0.4, '#e84008'),
      );
      lava.receiveShadow = false;
    }
    // The deformable surface remains independent from decorative batches.
    batchStaticMeshes(group, new Set([mesh]));
    return { id, group, mesh, vertices: v, original: v.slice(), indices: ix, version: 0 };
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
              collider: this.world.createCollider(terrainCollider(vertices)),
            });
        } catch (error) {
          for (const replacement of replacements)
            this.world.removeCollider(replacement.collider, true);
          throw error;
        }
        // All brush jobs finish before any surface changes. Commit the mesh/collider
        // pair for every surviving chunk in one task, retaining GPU vertex buffers.
        for (const { chunk, vertices, collider } of replacements) {
          this.world.removeCollider(chunk.collider, true);
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
      this.world.removeCollider(c.collider, true);
      c.group.removeFromParent();
    }
    this.chunks.clear();
    for (const id of this.dirty) {
      const chunk = this.prepared.get(id);
      if (!chunk) continue;
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
    for (const c of this.chunks.values()) this.world.removeCollider(c.collider, true);
    groups.forEach((group) => disposeGroup(group, this.retainedMaterials));
    this.chunks.clear();
    this.prepared.clear();
    this.retainedMaterials.forEach(disposeMaterial);
    this.materials.clear();
    this.sceneryMaterials.clear();
    this.retainedMaterials.clear();
  }
}
