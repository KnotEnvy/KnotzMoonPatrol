import * as T from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { HAZARDS, advanceHazard, type HazardClock, type HazardDefinition } from './route';
import { baseHeight } from './rules';
import { box, mat, disposeGroup } from './models';
import { batchStaticMeshes } from './render-batches';

export interface HazardEffects {
  hurt: (amount: number) => void;
  launch: (velocity: number) => void;
  notice: (text: string) => void;
  burst: (x: number, y: number, count: number) => void;
  rumble: () => void;
}
export interface HazardThreat {
  id: string;
  x: number;
  y: number;
  label: string;
  urgent: boolean;
}
interface ActiveHazard extends HazardClock {
  def: HazardDefinition;
  group: T.Group;
  effect: T.Group;
  material: T.MeshBasicMaterial;
  collider?: RAPIER.Collider;
  y: number;
  hp: number;
  launched: boolean;
  dropped: boolean;
}
export class Hazards {
  private active = new Map<string, ActiveHazard>();
  private retired = new Set<string>();
  private disposed = false;
  constructor(
    private scene: T.Scene,
    private world: RAPIER.World,
  ) {}
  stream(x: number) {
    if (this.disposed) return;
    for (const def of HAZARDS)
      if (
        def.x >= x - 50 &&
        def.x <= x + 125 &&
        !this.active.has(def.id) &&
        !this.retired.has(def.id)
      )
        this.add(def);
    for (const [id, h] of this.active)
      if (h.def.x < x - 70 || h.def.x > x + 160) {
        if (h.collider) this.world.removeCollider(h.collider, true);
        disposeGroup(h.group);
        h.material.dispose();
        this.active.delete(id);
        this.retired.add(id);
      }
  }
  private add(def: HazardDefinition) {
    const group = new T.Group(),
      effect = new T.Group();
    const isGap = def.kind === 'plate' || def.kind === 'canopy';
    const y = isGap
      ? (baseHeight(def.x - def.width / 2 - 1) + baseHeight(def.x + def.width / 2 + 1)) / 2 + 0.08
      : baseHeight(def.x);
    group.position.set(def.x, y, 0);
    group.add(effect);
    const color =
      def.kind === 'vent' || def.kind === 'plate'
        ? '#ffac63'
        : def.kind === 'laser'
          ? '#ff687c'
          : def.kind === 'canopy'
            ? '#a1f4b8'
            : '#b4baff';
    const material = new T.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const metal = mat('#3d505d', 0.6, 0.45),
      glow = mat(color, 0.4, 0.3, color);
    let collider: RAPIER.Collider | undefined;
    if (def.kind === 'plate') {
      const slab = box(effect, [def.width, 0.3, 8], [0, 0, 0], mat('#69655b', 0.45, 0.65));
      slab.name = 'tectonic-plate';
      const lines: number[] = [];
      for (let i = 0; i < 5; i++) {
        const x = -def.width / 2 + 1.5 + i * 2.6;
        lines.push(
          x,
          0.17,
          -4,
          x + 0.5,
          0.17,
          -1.5,
          x + 0.5,
          0.17,
          -1.5,
          x - 0.5,
          0.17,
          1,
          x - 0.5,
          0.17,
          1,
          x + 0.2,
          0.17,
          4,
        );
      }
      const cracks = new T.LineSegments(
        new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(lines, 3)),
        new T.LineBasicMaterial({ color: '#e9aa65' }),
      );
      effect.add(cracks);
      for (const x of [-def.width / 2, def.width / 2]) {
        box(group, [0.18, 1.6, 0.18], [x, 0.6, 4.3], metal);
        box(group, [0.35, 0.18, 0.35], [x, 1.45, 4.3], glow);
      }
      collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(def.width / 2, 0.15, 4)
          .setTranslation(def.x, y, 0)
          .setFriction(0.85),
      );
    } else if (def.kind === 'vent') {
      const rim = new T.Mesh(new T.TorusGeometry(2, 0.22, 6, 20), metal);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.1;
      group.add(rim);
      const glowDisk = new T.Mesh(new T.CircleGeometry(1.8, 20), glow);
      glowDisk.rotation.x = -Math.PI / 2;
      glowDisk.position.y = 0.08;
      group.add(glowDisk);
      for (let i = 0; i < 3; i++) {
        const jet = new T.Mesh(new T.ConeGeometry(1.1 - i * 0.2, 9 - i, 12, 1, true), material);
        jet.position.set((i - 1) * 0.7, 4.4, -0.4);
        jet.rotation.z = (i - 1) * 0.12;
        effect.add(jet);
      }
      effect.visible = false;
    } else if (def.kind === 'crystal' || def.kind === 'laser') {
      for (const z of [-2.7, 2.7]) {
        box(group, [1, 0.45, 1.2], [0, 0.25, z], metal);
        const pylon = new T.Mesh(
          def.kind === 'crystal'
            ? new T.OctahedronGeometry(1.2, 0)
            : new T.BoxGeometry(0.45, 3, 0.45),
          glow,
        );
        pylon.position.set(0, 1.6, z);
        pylon.scale.y = def.kind === 'crystal' ? 2 : 1;
        group.add(pylon);
      }
      // The visible core is on the firing axis and can be destroyed by the forward battery.
      box(group, [0.65, 1.3, 0.7], [0, 0.8, 0], glow);
      const column = new T.Mesh(new T.CylinderGeometry(0.25, 0.25, 9, 8), material);
      column.position.y = 4.5;
      effect.add(column);
      const halo = new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 9, 8, 1, true), material);
      halo.position.y = 4.5;
      effect.add(halo);
      effect.visible = false;
    } else if (def.kind === 'canopy') {
      const leafMat = mat('#254d43', 0.1, 0.9, '#103629');
      for (let i = 0; i < 5; i++) {
        const cap = new T.Mesh(new T.SphereGeometry(1, 10, 5), leafMat);
        cap.scale.set(2.4, 0.22, 3.7);
        cap.position.set(-def.width / 2 + 1.5 + i * 2.3, 0.1, 0);
        effect.add(cap);
      }
      const acid = new T.Mesh(
        new T.PlaneGeometry(def.width, 13),
        new T.MeshBasicMaterial({ color: '#54b57b', transparent: true, opacity: 0.5 }),
      );
      acid.rotation.x = -Math.PI / 2;
      acid.position.y = -5.5;
      group.add(acid);
      for (const x of [-def.width / 2, def.width / 2])
        box(group, [0.14, 1.6, 0.14], [x, 0.7, 4.2], glow);
    } else {
      for (const x of [-def.width / 2, def.width / 2]) {
        const ring = new T.Mesh(new T.TorusGeometry(5, 0.1, 5, 32), material);
        ring.position.set(x, 3.5, 0);
        ring.rotation.y = Math.PI / 2;
        group.add(ring);
        for (const z of [-4, 4]) box(group, [0.2, 1, 0.2], [x, 0.5, z], glow);
      }
      for (let i = 0; i < 8; i++) {
        const rock = new T.Mesh(new T.OctahedronGeometry(0.25, 0), metal);
        rock.position.set((i / 7 - 0.5) * def.width, 2 + (i % 3), -2);
        effect.add(rock);
      }
    }
    batchStaticMeshes(group);
    batchStaticMeshes(effect);
    this.scene.add(group);
    this.active.set(def.id, {
      def,
      group,
      effect,
      material,
      collider,
      y,
      hp: 4,
      phase: 'idle',
      remaining: 0,
      launched: false,
      dropped: false,
    });
  }
  step(dt: number, rover: { x: number; y: number; contacts: Set<number> }, fx: HazardEffects) {
    for (const h of this.active.values()) {
      const { def } = h;
      if (def.kind === 'lowGravity') {
        const inside = Math.abs(rover.x - def.x) < def.width / 2;
        if (inside && h.phase === 'idle') {
          h.phase = 'active';
          fx.notice('LOW-G FIELD · SHORT JUMPS / CONTROL YOUR PITCH');
        }
        if (rover.x > def.x + def.width / 2) h.phase = 'spent';
        h.effect.rotation.x += dt * 0.15;
        continue;
      }
      const contact = !!h.collider && rover.contacts.has(h.collider.handle);
      const trigger = def.kind === 'plate' ? contact : def.x - rover.x < 34 && rover.x < def.x + 4;
      const changed = advanceHazard(
        h,
        trigger,
        dt,
        def.kind === 'plate'
          ? 0.8
          : def.kind === 'vent'
            ? 0.85
            : def.kind === 'canopy'
              ? 0.65
              : 1.1,
        def.kind === 'plate' ? 0.8 : def.kind === 'canopy' ? 1.1 : 1.6,
      );
      if (changed === 'charging') {
        if (def.kind === 'plate') fx.notice('PLATE FRACTURE · 0.8 SECONDS · KEEP MOVING');
        else if (def.kind === 'vent') fx.notice('VENT PRESSURE · BOOST PAST OR RIDE THE SURGE');
        else if (def.kind === 'canopy') fx.notice('CANOPY VOID · JUMP THE ACID GAP');
        else fx.notice('LASER CHARGING · SHOOT THE CORE OR CHANGE SPEED');
      }
      if (h.phase === 'charging') {
        h.material.opacity = 0.2 + Math.abs(Math.sin(h.remaining * 24)) * 0.45;
        if (def.kind === 'plate') h.effect.position.y = Math.sin(h.remaining * 65) * 0.035;
        if (def.kind === 'crystal' || def.kind === 'laser') {
          h.effect.visible = true;
          h.effect.scale.set(0.15, 1, 0.15);
        }
        if (def.kind === 'vent') {
          h.effect.visible = true;
          h.effect.scale.set(0.5, 0.12, 0.5);
        }
      }
      if (changed === 'active') {
        h.material.opacity = 0.7;
        h.effect.scale.set(1, 1, 1);
        if (def.kind === 'plate' && h.collider) {
          this.world.removeCollider(h.collider, true);
          h.collider = undefined;
          h.dropped = true;
          fx.burst(def.x, h.y, 65);
          fx.rumble();
        } else if (def.kind === 'vent') {
          fx.burst(def.x, h.y + 0.5, 25);
          fx.rumble();
        } else if (def.kind === 'laser' || def.kind === 'crystal') fx.rumble();
      }
      if (h.phase === 'active') {
        if (def.kind === 'plate') {
          h.effect.position.y -= dt * 12;
          h.effect.rotation.z += dt * 0.15;
        }
        if (def.kind === 'canopy') {
          h.effect.scale.y = Math.max(0.01, h.effect.scale.y - dt);
          h.effect.position.y -= dt * 5;
        }
        if (def.kind === 'vent') {
          h.effect.scale.y = 0.85 + Math.sin(h.remaining * 30) * 0.15;
          if (!h.launched && Math.abs(rover.x - def.x) < 3 && rover.y < h.y + 7) {
            h.launched = true;
            fx.launch(15);
            fx.notice('GEOTHERMAL LIFT · TRIM FOR LANDING');
          }
        }
        if (
          (def.kind === 'crystal' || def.kind === 'laser') &&
          Math.abs(rover.x - def.x) < 1.7 &&
          rover.y < h.y + 9
        )
          fx.hurt(22);
      }
      if (changed === 'spent') h.effect.visible = false;
    }
  }
  gravityAt(x: number) {
    return [...this.active.values()].some(
      (h) => h.def.kind === 'lowGravity' && Math.abs(x - h.def.x) < h.def.width / 2,
    )
      ? 3
      : undefined;
  }
  surfaceHeight(x: number, fallback: number) {
    for (const h of this.active.values())
      if (h.collider && h.def.kind === 'plate' && Math.abs(x - h.def.x) <= h.def.width / 2)
        return h.y + 0.15;
    return fallback;
  }
  strikeCore(x: number, y: number, damage: number, fx: HazardEffects) {
    for (const h of this.active.values())
      if (
        (h.def.kind === 'crystal' || h.def.kind === 'laser') &&
        h.phase !== 'spent' &&
        Math.hypot(x - h.def.x, y - h.y - 1) < 2
      ) {
        h.hp -= damage;
        if (h.hp <= 0) {
          h.phase = 'spent';
          h.effect.visible = false;
          h.group.scale.y = 0.3;
          fx.burst(h.def.x, h.y + 1, 25);
          fx.notice('EMITTER DISABLED');
          return 'destroyed';
        }
        return 'hit';
      }
    return null;
  }
  fractureNear(x: number, radius: number) {
    for (const h of this.active.values())
      if (h.def.kind === 'plate' && h.collider && Math.abs(h.def.x - x) < radius) {
        h.phase = 'charging';
        h.remaining = 0;
      }
  }
  threats(x: number): HazardThreat[] {
    const labels = {
      plate: 'UNSTABLE PLATE',
      vent: 'MAGMA VENT',
      crystal: 'CRYSTAL LASER',
      canopy: 'CONCEALED GAP',
      laser: 'LASER BARRIER',
      lowGravity: 'LOW-G FIELD',
    };
    return [...this.active.values()]
      .filter((h) => h.def.x >= x - 5 && h.def.x <= x + 75 && h.phase !== 'spent')
      .map((h) => ({
        id: h.def.id,
        x: h.def.x,
        y: h.y + 2,
        label:
          h.phase === 'charging' && h.def.kind === 'plate'
            ? 'COLLAPSE ' + h.remaining.toFixed(1) + 's'
            : labels[h.def.kind],
        urgent: h.phase === 'active' || h.phase === 'charging',
      }));
  }
  reset() {
    for (const h of this.active.values()) {
      if (h.collider) this.world.removeCollider(h.collider, true);
      disposeGroup(h.group);
      h.material.dispose();
    }
    this.active.clear();
    this.retired.clear();
  }
  dispose() {
    this.reset();
    this.disposed = true;
  }
}
