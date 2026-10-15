import * as T from 'three/webgpu';
import { disposeGroup, makeEnemy } from './models';

/** Bounded reusable actors: geometry/material construction happens in the loading screen. */
export class EnemyModels {
  private free = new Map<string, T.Group[]>();
  private owned = new Set<T.Group>();
  private idle = new Set<T.Group>();
  private disposed = false;

  async prepare() {
    for (const [kind, count] of Object.entries({
      drone: 8,
      bomber: 3,
      hunter: 3,
      interceptor: 2,
      rock: 3,
      mine: 3,
      skimmer: 2,
      leech: 2,
      boss: 1,
    })) {
      for (let i = 0; i < count; i++) {
        if (this.disposed) return;
        const model = makeEnemy(kind);
        this.owned.add(model);
        this.release(model);
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }
  get warmupGroups() {
    return [...this.owned];
  }
  acquire(kind: string) {
    const model = this.free.get(kind)?.pop() ?? makeEnemy(kind);
    this.idle.delete(model);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.setScalar(1);
    if (kind === 'rock')
      model.traverse((o) => {
        if (o instanceof T.Mesh && o.material instanceof T.MeshStandardMaterial) {
          o.material.emissive.set('#000000');
          // Black emission is dark while keeping the same shader variant as melting.
          o.material.emissiveIntensity = 1;
          o.material.roughness = 0.95;
        }
      });
    return model;
  }
  release(model: T.Group) {
    model.removeFromParent();
    if (!this.owned.has(model)) {
      disposeGroup(model);
      return;
    }
    if (this.idle.has(model)) return;
    const pool = this.free.get(model.name) ?? [];
    pool.push(model);
    this.free.set(model.name, pool);
    this.idle.add(model);
  }
  dispose() {
    this.disposed = true;
    this.owned.forEach((model) => disposeGroup(model));
    this.owned.clear();
    this.idle.clear();
    this.free.clear();
  }
}
