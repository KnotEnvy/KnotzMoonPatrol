import * as T from 'three/webgpu';

// Shared lights blend between biomes; no per-prop lights or extra shadow passes.
const LIGHTS = [
  { key: '#edf7ff', sky: '#b5d9ec', floor: '#1a2938', sun: 4, ambient: 1.8, fog: 0.0022, lamp: 55 },
  {
    key: '#d7d3ff',
    sky: '#adbce9',
    floor: '#21213e',
    sun: 3.5,
    ambient: 1.35,
    fog: 0.003,
    lamp: 70,
  },
  {
    key: '#ffb58c',
    sky: '#d4b5a5',
    floor: '#4b3330',
    sun: 2.5,
    ambient: 1.65,
    fog: 0.004,
    lamp: 90,
  },
  {
    key: '#c0dfd4',
    sky: '#83a79a',
    floor: '#2d4540',
    sun: 1.7,
    ambient: 1.6,
    fog: 0.005,
    lamp: 360,
  },
  {
    key: '#b9c4e9',
    sky: '#8999be',
    floor: '#23152e',
    sun: 3.2,
    ambient: 1.25,
    fog: 0.0028,
    lamp: 80,
  },
] as const;

export class BiomeLighting {
  readonly ambient = new T.HemisphereLight(LIGHTS[0].sky, LIGHTS[0].floor, LIGHTS[0].ambient);
  readonly headlight = new T.SpotLight('#c6f5f0', LIGHTS[0].lamp, 40, Math.PI / 6, 0.65, 2);
  private tint = new T.Color();
  constructor(
    private scene: T.Scene,
    private sun: T.DirectionalLight,
  ) {
    this.headlight.castShadow = false;
    this.scene.add(this.ambient, this.headlight, this.headlight.target);
  }
  update(biome: number, position: T.Vector3, dt: number) {
    const target = LIGHTS[biome],
      blend = 1 - Math.exp(-dt * 2);
    this.sun.color.lerp(this.tint.set(target.key), blend);
    this.ambient.color.lerp(this.tint.set(target.sky), blend);
    this.ambient.groundColor.lerp(this.tint.set(target.floor), blend);
    this.sun.intensity = T.MathUtils.lerp(this.sun.intensity, target.sun, blend);
    this.ambient.intensity = T.MathUtils.lerp(this.ambient.intensity, target.ambient, blend);
    this.headlight.intensity = T.MathUtils.lerp(this.headlight.intensity, target.lamp, blend);
    const fog = this.scene.fog;
    if (fog instanceof T.FogExp2) fog.density = T.MathUtils.lerp(fog.density, target.fog, blend);
    this.headlight.position.set(position.x + 2, position.y + 0.85, 0);
    this.headlight.target.position.set(position.x + 17, position.y - 2.5, 0);
  }
  dispose() {
    this.ambient.removeFromParent();
    this.headlight.target.removeFromParent();
    this.headlight.removeFromParent();
    this.headlight.dispose();
  }
}
