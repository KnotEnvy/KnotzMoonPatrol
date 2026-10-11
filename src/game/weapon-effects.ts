import * as T from 'three/webgpu';

/** Fixed GPU allocations: six energy shapes and sixteen non-colliding slag pools. */
export class WeaponEffects {
  readonly energy = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 1),
    new T.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
    6,
  );
  readonly slag = new T.InstancedMesh(
    new T.SphereGeometry(1, 10, 5),
    new T.MeshStandardMaterial({
      color: '#f47b31',
      emissive: '#ff4a08',
      emissiveIntensity: 1.8,
      roughness: 0.32,
      metalness: 0.3,
    }),
    16,
  );
  private pools = Array.from({ length: 16 }, () => ({ x: 0, y: 0, life: 0 }));
  private cursor = 0;
  private shape = new T.Object3D();
  private cyan = new T.Color().setRGB(0.2, 1.5, 2.8);
  private white = new T.Color().setRGB(2, 2.6, 3);
  private violet = new T.Color().setRGB(1.5, 0.7, 2.8);
  constructor(scene: T.Scene) {
    for (const batch of [this.energy, this.slag]) {
      batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
      batch.frustumCulled = false;
      batch.count = 0;
      batch.visible = false;
      scene.add(batch);
    }
    // Allocate instance colors before first render, including an initially empty batch.
    this.energy.setColorAt(0, this.cyan);
  }
  melt(x: number, y: number) {
    Object.assign(this.pools[this.cursor++ % this.pools.length], { x, y, life: 4 });
  }
  step(dt: number) {
    for (const pool of this.pools) pool.life = Math.max(0, pool.life - dt);
  }
  render(
    beam: { x: number; y: number; length: number; active: boolean },
    rail: { x: number; y: number; angle: number; length: number; life: number },
    charge: number,
    muzzleX: number,
    muzzleY: number,
  ) {
    let count = 0;
    const line = (
      x: number,
      y: number,
      angle: number,
      length: number,
      width: number,
      color: T.Color,
    ) => {
      this.shape.position.set(
        x + (Math.cos(angle) * length) / 2,
        y + (Math.sin(angle) * length) / 2,
        0.3,
      );
      this.shape.rotation.set(0, 0, angle);
      this.shape.scale.set(Math.max(0.01, length), width, width);
      this.shape.updateMatrix();
      this.energy.setMatrixAt(count, this.shape.matrix);
      this.energy.setColorAt(count++, color);
    };
    if (beam.active) {
      line(beam.x, beam.y, 0, beam.length, 0.24, this.cyan);
      line(beam.x, beam.y, 0, beam.length, 0.065, this.white);
    }
    if (rail.life > 0) {
      line(rail.x, rail.y, rail.angle, rail.length, (0.34 * rail.life) / 0.16, this.violet);
      line(rail.x, rail.y, rail.angle, rail.length, 0.07, this.white);
    }
    if (charge > 0) {
      const size = 0.15 + charge * 0.42;
      line(muzzleX - size / 2, muzzleY, Math.PI / 4, size, size, this.violet);
    }
    this.energy.count = count;
    this.energy.visible = count > 0;
    if (count) {
      this.energy.instanceMatrix.needsUpdate = true;
      this.energy.instanceColor!.needsUpdate = true;
    }
    count = 0;
    for (const pool of this.pools)
      if (pool.life > 0) {
        const fade = Math.min(1, pool.life);
        this.shape.position.set(pool.x, pool.y + 0.06, 0);
        this.shape.rotation.set(0, 0, 0);
        this.shape.scale.set(1.4 * fade, 0.09 * fade, 1.1 * fade);
        this.shape.updateMatrix();
        this.slag.setMatrixAt(count++, this.shape.matrix);
      }
    this.slag.count = count;
    this.slag.visible = count > 0;
    if (count) this.slag.instanceMatrix.needsUpdate = true;
  }
  reset() {
    for (const pool of this.pools) pool.life = 0;
    this.energy.visible = this.slag.visible = false;
    this.energy.count = this.slag.count = 0;
  }
}
