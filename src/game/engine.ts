import * as T from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { Sound } from './audio';
import { initializePhysics } from './physics';
import { TerrainCompute } from './terrain-compute';
import { Terrain } from './terrain';
import { makeRover, makeEnemy, makeBackdrop, mat, disposeGroup } from './models';
import {
  type Telemetry,
  type Input,
  type Weapon,
  type SkyWeapon,
  initialTelemetry,
  BIOMES,
  FIXED_DT,
  FINISH,
  SECTOR_LENGTH,
  biomeIndex,
  sectorIndex,
  baseHeight,
  randomAt,
  clamp,
  updateEnergy,
  addHeat,
  checkpointBonus,
} from './rules';

type EnemyKind =
  'drone' | 'bomber' | 'hunter' | 'interceptor' | 'rock' | 'mine' | 'skimmer' | 'leech' | 'boss';
interface Enemy {
  group: T.Group;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  timer: number;
  seed: number;
  diving: boolean;
}
interface Shot {
  mesh: T.Mesh;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  type: 'pulse' | 'flak' | 'rail' | 'seeker' | 'bomb' | 'beam' | 'seismic';
  damage: number;
  enemy: boolean;
  hit: Set<Enemy>;
}
interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
}
interface Strike {
  x: number;
  timer: number;
  mesh: T.Mesh;
  fired: boolean;
}
export interface Loadout {
  ground: Weapon;
  sky: SkyWeapon;
}
export class Game {
  state: Telemetry;
  loadout: Loadout = { ground: 'pulse', sky: 'flak' };
  overlayOpen = false;
  readonly audio = new Sound();
  readonly keys = new Set<string>();
  readonly touch = new Set<string>();
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(45, 1, 0.1, 550);
  private renderer!: T.WebGPURenderer;
  private world!: RAPIER.World;
  private body!: RAPIER.RigidBody;
  private vehicle!: RAPIER.DynamicRayCastVehicleController;
  private terrain!: Terrain;
  private compute = new TerrainCompute();
  private rover = makeRover();
  private backdrop!: ReturnType<typeof makeBackdrop>;
  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private strikes: Strike[] = [];
  private particleMesh!: T.InstancedMesh;
  private particles: Particle[] = [];
  private dummy = new T.Object3D();
  private frame = 0;
  private disposed = false;
  private ready = false;
  private last = 0;
  private accumulator = 0;
  private uiTime = 0;
  private elapsed = 0;
  private fireCooldown = 0;
  private skyCooldown = 0;
  private invulnerable = 0;
  private spawnAt = 3;
  private jumpHeld = 0;
  private lastJump = false;
  private airborneTime = 0;
  private lastGrounded = true;
  private trauma = 0;
  private reportMark = { time: 0, kills: 0, clean: 0, damage: 0 };
  private nextReport = 5;
  private noticeUntil = 0;
  private rearCooldown = 0;
  private padPause = false;
  private sectorBefore = 0;
  private bossSpawned = false;
  private fpsFrames = 0;
  private fpsTime = 0;
  private previous = new T.Vector3();
  private current = new T.Vector3();
  private resizeObserver?: ResizeObserver;
  private light = new T.DirectionalLight('#edf7ff', 4);
  constructor(
    private host: HTMLElement,
    private onState: (s: Telemetry) => void,
    private onError: (message: string) => void,
  ) {
    let best = 0;
    try {
      best = Number(localStorage.getItem('void-runner-best')) || 0;
    } catch {}
    this.state = initialTelemetry(best);
  }
  async init() {
    try {
      await initializePhysics();
      if (this.disposed) return;
      this.renderer = new T.WebGPURenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        forceWebGL: new URLSearchParams(location.search).get('renderer') === 'webgl',
      });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
      this.renderer.shadowMap.enabled = true;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;
      await this.renderer.init();
      if (!('isWebGPUBackend' in this.renderer.backend)) this.renderer.shadowMap.enabled = false;
      if (this.disposed) {
        this.renderer.dispose();
        return;
      }
      if ('device' in this.renderer.backend)
        await this.compute.init(this.renderer.backend.device as GPUDevice);
      if (this.disposed) {
        this.compute.dispose();
        this.renderer.dispose();
        return;
      }
      this.state.backend =
        'isWebGPUBackend' in this.renderer.backend && this.renderer.backend.isWebGPUBackend
          ? 'WEBGPU'
          : 'WEBGL 2';
      this.host.appendChild(this.renderer.domElement);
      this.renderer.domElement.setAttribute('aria-label', 'Moon Patrol lunar landscape and rover');
      this.scene.background = new T.Color(BIOMES[0].sky);
      this.scene.fog = new T.FogExp2(BIOMES[0].sky, 0.0022);
      this.scene.add(new T.HemisphereLight('#b5d9ec', '#1a2938', 1.8));
      this.light.position.set(-25, 55, 22);
      this.light.castShadow = true;
      this.light.shadow.mapSize.set(1024, 1024);
      Object.assign(this.light.shadow.camera, {
        left: -45,
        right: 70,
        top: 35,
        bottom: -30,
        near: 0.1,
        far: 150,
      });
      this.light.shadow.bias = -0.001;
      this.scene.add(this.light, this.light.target);
      this.backdrop = makeBackdrop(this.scene);
      this.scene.add(this.rover.group);
      this.world = new RAPIER.World({ x: 0, y: -17, z: 0 });
      this.world.timestep = FIXED_DT;
      this.body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0, 2.0, 0)
          .enabledTranslations(true, true, false)
          .enabledRotations(false, false, true)
          .setLinearDamping(0.1)
          .setAngularDamping(4)
          .setCcdEnabled(true),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(1.9, 0.4, 0.85).setMass(120).setFriction(0.1),
        this.body,
      );
      this.vehicle = this.world.createVehicleController(this.body);
      this.vehicle.indexUpAxis = 1;
      this.vehicle.setIndexForwardAxis = 0;
      for (const z of [-1.17, 1.17])
        for (const x of [-1.55, 0, 1.55]) {
          this.vehicle.addWheel(
            { x, y: -0.1, z },
            { x: 0, y: -1, z: 0 },
            { x: 0, y: 0, z: 1 },
            0.6,
            0.66,
          );
          const i = this.vehicle.numWheels() - 1;
          this.vehicle.setWheelSuspensionStiffness(i, 55);
          this.vehicle.setWheelSuspensionCompression(i, 5);
          this.vehicle.setWheelSuspensionRelaxation(i, 7);
          this.vehicle.setWheelMaxSuspensionTravel(i, 0.38);
          this.vehicle.setWheelMaxSuspensionForce(i, 10000);
          this.vehicle.setWheelFrictionSlip(i, 1.7);
        }
      this.terrain = new Terrain(this.scene, this.world, this.compute);
      this.terrain.update(0);
      const shotGeo = new T.SphereGeometry(1, 7, 5),
        friendly = mat('#9bffff', 0.1, 0.2, '#44d5e6'),
        hostile = mat('#ff8c60', 0.1, 0.2, '#ff4c22');
      for (let i = 0; i < 160; i++) {
        const mesh = new T.Mesh(shotGeo, i < 120 ? friendly : hostile);
        mesh.visible = false;
        this.scene.add(mesh);
        this.shots.push({
          mesh,
          active: false,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          life: 0,
          type: 'pulse',
          damage: 1,
          enemy: i >= 120,
          hit: new Set(),
        });
      }
      this.particleMesh = new T.InstancedMesh(
        new T.IcosahedronGeometry(0.13, 0),
        mat('#a4b4b8', 0.2, 0.8),
        800,
      );
      this.particleMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      this.particleMesh.frustumCulled = false;
      this.scene.add(this.particleMesh);
      for (let i = 0; i < 800; i++)
        this.particles.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 });
      this.seedPreview();
      this.camera.position.set(7, 8.8, 32);
      this.camera.lookAt(9, 3.6, 0);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host);
      this.resize();
      window.addEventListener('keydown', this.keyDown);
      window.addEventListener('keyup', this.keyUp);
      window.addEventListener('blur', this.blur);
      document.addEventListener('visibilitychange', this.visibility);
      this.ready = true;
      this.previous.copy(this.body.translation());
      this.current.copy(this.previous);
      this.emit();
      this.frame = requestAnimationFrame(this.tick);
    } catch (e) {
      if (!this.disposed)
        this.onError(e instanceof Error ? e.message : 'Unable to initialize the renderer.');
    }
  }
  private seedPreview() {
    this.spawn('drone', 32, 11);
    this.spawn('drone', 36, 13);
    this.spawn('drone', 40, 11);
    this.spawn('rock', 24, 1);
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  private keyDown = (e: KeyboardEvent) => {
    if (
      this.overlayOpen ||
      (this.state.phase !== 'playing' && (e.target as HTMLElement)?.closest('button,input,select'))
    )
      return;
    if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code))
      e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      this.pause();
      return;
    }
    if (e.code === 'Enter' && ['menu', 'dead', 'complete'].includes(this.state.phase)) {
      this.start();
      return;
    }
    if (e.code === 'KeyM') {
      this.audio.toggle();
      this.emit();
      return;
    }
    if (e.code === 'KeyR') this.rearDefense();
    this.keys.add(e.code);
  };
  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private blur = () => {
    this.keys.clear();
    this.touch.clear();
    if (this.state.phase === 'playing') this.pause();
  };
  private visibility = () => {
    if (document.hidden) this.blur();
  };
  private input(): Input {
    const down = (...codes: string[]) => codes.some((c) => this.keys.has(c) || this.touch.has(c));
    const pad = navigator.getGamepads?.()[0];
    const b = (i: number) => !!pad?.buttons[i]?.pressed;
    if (b(9) && !this.padPause) this.pause();
    this.padPause = b(9);
    const axis = pad?.axes[0] ?? 0;
    return {
      brake: down('ArrowLeft', 'KeyA') || b(4) || axis < -0.35,
      boost: down('ArrowRight', 'KeyD', 'ShiftLeft', 'ShiftRight') || b(5) || axis > 0.35,
      jump: down('Space', 'ArrowUp', 'KeyW') || b(0),
      fire: down('KeyJ', 'KeyZ') || b(2),
      vent: down('KeyK', 'KeyX') || b(1),
      pitch: axis || Number(down('KeyD', 'ArrowRight')) - Number(down('KeyA', 'ArrowLeft')),
    };
  }
  start(loadout?: Loadout) {
    if (!this.ready) return;
    if (loadout) this.loadout = loadout;
    this.clearEntities();
    this.terrain.dispose();
    this.terrain = new Terrain(this.scene, this.world, this.compute);
    this.terrain.update(0);
    this.state = {
      ...initialTelemetry(this.state.best),
      phase: 'playing',
      backend: this.state.backend,
      fps: this.state.fps,
    };
    this.body.setTranslation({ x: 0, y: 2, z: 0 }, true);
    this.body.setLinvel({ x: 18, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.previous.set(0, 2, 0);
    this.current.copy(this.previous);
    this.camera.position.set(12, 10.2, 34);
    this.elapsed = 0;
    this.spawnAt = 3;
    this.nextReport = 5;
    this.sectorBefore = 0;
    this.bossSpawned = false;
    this.invulnerable = 2;
    this.reportMark = { time: 0, kills: 0, clean: 0, damage: 0 };
    this.jumpHeld = 0;
    this.lastJump = false;
    this.airborneTime = 0;
    this.lastGrounded = true;
    this.fireCooldown = 0;
    this.skyCooldown = 0;
    this.accumulator = 0;
    this.rearCooldown = 0;
    this.keys.clear();
    this.touch.clear();
    this.announce('EXPEDITION STARTED');
    void this.audio.start();
    this.emit();
  }
  pause() {
    if (this.state.phase === 'playing') {
      this.state.phase = 'paused';
      this.keys.clear();
      this.touch.clear();
    } else if (this.state.phase === 'paused') {
      this.state.phase = 'playing';
      this.accumulator = 0;
      void this.audio.start();
    }
    this.emit();
  }
  continue() {
    if (this.state.phase !== 'report') return;
    this.state.phase = 'playing';
    this.accumulator = 0;
    this.state.hull = clamp(this.state.hull + 25, 0, 100);
    this.state.capacitor = 100;
    this.state.heat = 0;
    this.state.lockout = 0;
    this.announce('ROVER SERVICED · ROUTE RESUMED');
    this.emit();
  }
  menu() {
    this.start();
    this.state.phase = 'menu';
    this.state.speed = 0;
    this.state.notice = '';
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.clearEntities();
    this.seedPreview();
    this.camera.position.set(7, 8.8, 32);
    this.camera.lookAt(9, 3.6, 0);
    this.keys.clear();
    this.touch.clear();
    this.emit();
  }
  toggleAudio() {
    this.audio.toggle();
    this.emit();
  }
  private announce(message: string) {
    this.state.notice = message;
    this.noticeUntil = this.elapsed + 3;
  }
  private emit() {
    this.onState({ ...this.state });
  }
  private tick = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime > 0.7) {
      this.state.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    const input = this.input();
    if (this.state.phase === 'playing') {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 6 && this.state.phase === 'playing') {
        this.step(input);
        this.accumulator -= FIXED_DT;
        steps++;
      }
    } else if (this.state.phase === 'menu') {
      this.body.setLinvel({ x: 0, y: this.body.linvel().y, z: 0 }, true);
      this.vehicle.updateVehicle(FIXED_DT);
      this.world.step();
      this.body.setTranslation({ x: 0, y: this.body.translation().y, z: 0 }, true);
      this.current.copy(this.body.translation());
      this.previous.copy(this.current);
    }
    this.render(dt, input);
    this.audio.update(this.state.speed, input.boost, this.state.phase === 'playing');
    this.uiTime += dt;
    if (this.uiTime > 0.07) {
      this.uiTime = 0;
      this.emit();
    }
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };
  private step(input: Input) {
    const dt = FIXED_DT,
      s = this.state;
    this.elapsed += dt;
    s.time += dt;
    this.previous.copy(this.current);
    const p = this.body.translation(),
      v = this.body.linvel();
    const grounded = Array.from({ length: 6 }, (_, i) => this.vehicle.wheelIsInContact(i)).some(
      Boolean,
    );
    if (!grounded) this.airborneTime += dt;
    if (grounded && !this.lastGrounded && this.airborneTime > 0.3) {
      const angle = 2 * Math.atan2(this.body.rotation().z, this.body.rotation().w);
      if (Math.abs(angle) < 0.16 && v.y > -15) {
        s.clean++;
        s.score += 250;
        this.announce('CLEAN LANDING +250');
        this.audio.tone(660, 0.15, 'sine', 0.2);
      }
      this.trauma = Math.min(1, this.airborneTime * 0.15);
      this.burst(p.x, p.y - 0.6, 14);
      this.airborneTime = 0;
    }
    this.lastGrounded = grounded;
    const { boosting, hovering } = updateEnergy(s, input, !grounded && this.jumpHeld > 0.16, dt);
    const target = input.brake ? 8 : boosting ? 36 : 20;
    // Arcade speed servo acts through impulses; all vertical contact is raycast suspension.
    const acceleration = clamp((target - v.x) * (biomeIndex(p.x) === 1 ? 1.7 : 3.5), -20, 20);
    this.body.applyImpulse({ x: acceleration * this.body.mass() * dt, y: 0, z: 0 }, true);
    if (input.jump && !this.lastJump && grounded) {
      this.body.applyImpulse({ x: 0, y: this.body.mass() * 11.5, z: 0 }, true);
      this.audio.jump();
      this.burst(p.x, p.y - 1, 24);
      this.lastGrounded = false;
    }
    this.jumpHeld = input.jump ? this.jumpHeld + dt : 0;
    this.lastJump = input.jump;
    if (hovering && v.y < 2.5)
      this.body.applyImpulse(
        { x: 0, y: this.body.mass() * BIOMES[biomeIndex(p.x)].gravity * 0.86 * dt, z: 0 },
        true,
      );
    const angle = 2 * Math.atan2(this.body.rotation().z, this.body.rotation().w),
      desired = grounded ? 0 : input.pitch * 0.349;
    this.body.setAngvel({ x: 0, y: 0, z: clamp((desired - angle) * 6, -1.5, 1.5) }, true);
    this.world.gravity.y = -BIOMES[biomeIndex(p.x)].gravity;
    this.vehicle.updateVehicle(dt);
    this.world.step();
    this.current.copy(this.body.translation());
    if (this.current.y < -5.5) {
      this.hurt(35);
      if (s.phase === 'playing') {
        let x = this.current.x + 14;
        while (baseHeight(x) < -1) x += 2;
        this.body.setTranslation({ x, y: baseHeight(x) + 3, z: 0 }, true);
        this.body.setLinvel({ x: 18, y: 0, z: 0 }, true);
        this.current.copy(this.body.translation());
        this.previous.copy(this.current);
        this.invulnerable = 2;
        this.announce('RECOVERY JETS · HULL DAMAGED');
      }
    }
    if (s.phase !== 'playing') return;
    s.distance = Math.max(s.distance, this.current.x);
    s.speed = Math.max(0, this.body.linvel().x);
    s.sector = sectorIndex(s.distance);
    s.biome = biomeIndex(s.distance);
    s.score += s.speed * dt * 0.35;
    this.terrain.update(this.current.x);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.rearCooldown = Math.max(0, this.rearCooldown - dt);
    this.fireCooldown -= dt;
    this.skyCooldown -= dt;
    if (input.fire && !input.vent && s.lockout <= 0) this.fire();
    if (input.vent && s.heat > 5) {
      for (const e of this.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) < 4) e.hp -= dt * 5;
      if (Math.random() < 0.3) this.burst(p.x, p.y, 2);
    }
    if (boosting && Math.random() < 0.65) this.burst(p.x - 2, p.y - 0.2, 2);
    this.updateEnemies(dt, boosting);
    this.updateShots(dt);
    this.updateStrikes(dt);
    this.updateParticles(dt);
    if (s.phase !== 'playing') return;
    if (this.elapsed > this.spawnAt) {
      this.wave();
      this.spawnAt = this.elapsed + Math.max(2.8, 5 - s.biome * 0.4);
    }
    if (s.sector !== this.sectorBefore) {
      this.sectorBefore = s.sector;
      this.announce(
        'SECTOR ' + String.fromCharCode(65 + s.sector) + ' · ' + BIOMES[s.biome].name.toUpperCase(),
      );
      this.audio.checkpoint();
    }
    if (s.distance >= this.nextReport * SECTOR_LENGTH && this.nextReport < 26) {
      this.checkpoint();
      this.nextReport = this.nextReport === 20 ? 26 : this.nextReport + 5;
    }
    if (s.distance > 25 * SECTOR_LENGTH && !this.bossSpawned) {
      this.bossSpawned = true;
      this.spawn('boss', s.distance + 35, 14);
      this.announce('MOTHERSHIP · DESTROY THE CORE');
    }
    if (s.distance >= FINISH - 40 && s.boss > 0) {
      this.body.setTranslation({ x: FINISH - 40, y: this.current.y, z: 0 }, true);
      this.current.x = FINISH - 40;
    }
    if (s.distance >= FINISH && s.boss <= 0) {
      s.phase = 'complete';
      s.score += 5000;
      this.saveBest();
      this.audio.checkpoint();
      this.emit();
    }
    if (this.elapsed > this.noticeUntil) s.notice = '';
    s.warning =
      s.lockout > 0
        ? 'THERMAL LOCKOUT'
        : s.hull < 30
          ? 'HULL CRITICAL'
          : this.strikes.some((x) => !x.fired)
            ? 'ORBITAL STRIKE · CHANGE SPEED'
            : this.enemies.some((e) => e.kind === 'bomber' && Math.abs(e.x - p.x) < 40)
              ? 'HEAVY BOMBER INBOUND'
              : '';
  }
  private fire() {
    const p = this.body.translation();
    const s = this.state;
    if (this.fireCooldown <= 0) {
      const w = this.loadout.ground,
        heat = w === 'pulse' ? 7 : w === 'beam' ? 5 : 20;
      if (addHeat(s, heat)) {
        const damage = w === 'pulse' ? 1 : w === 'beam' ? 1.5 : 5;
        this.shoot(
          w === 'pulse' ? 'pulse' : w === 'beam' ? 'beam' : 'seismic',
          p.x + 2.6,
          p.y + 0.45,
          70,
          w === 'seismic' ? -4 : 0,
          damage,
          false,
        );
        this.fireCooldown = w === 'pulse' ? 0.15 : w === 'beam' ? 0.07 : 0.7;
        this.audio.shot();
      }
    }
    if (this.skyCooldown <= 0 && s.lockout <= 0) {
      const w = this.loadout.sky;
      const target = this.enemies
        .filter((e) => e.y > 4 && Math.abs(e.x - p.x) < 45)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      const angle = target
        ? clamp(Math.atan2(target.y - p.y, target.x - p.x), Math.PI / 4, (Math.PI * 3) / 4)
        : Math.PI / 2;
      if (addHeat(s, w === 'rail' ? 16 : w === 'seeker' ? 12 : 6)) {
        for (let i = 0; i < (w === 'seeker' ? 4 : 1); i++)
          this.shoot(
            w,
            p.x - 0.6,
            p.y + 2.3,
            Math.cos(angle + (i - 1.5) * (w === 'seeker' ? 0.07 : 0)) * 40,
            Math.sin(angle) * 40,
            w === 'rail' ? 7 : 2,
            false,
          );
        this.skyCooldown = w === 'rail' ? 1.1 : w === 'seeker' ? 0.85 : 0.36;
      }
    }
  }
  private shoot(
    type: Shot['type'],
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    enemy: boolean,
  ) {
    const shot = this.shots.find((s) => !s.active && s.enemy === enemy);
    if (!shot) return;
    Object.assign(shot, {
      active: true,
      type,
      x,
      y,
      vx,
      vy,
      damage,
      life: enemy ? 5 : type === 'flak' ? 0.62 : 2,
    });
    shot.mesh.visible = true;
    shot.hit.clear();
    shot.mesh.scale.set(
      type === 'beam' ? 2.8 : type === 'rail' ? 0.16 : 0.45,
      type === 'rail' ? 2 : 0.16,
      0.16,
    );
  }
  private updateShots(dt: number) {
    const p = this.current;
    for (const s of this.shots) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.type === 'seeker') {
        const target = this.enemies
          .filter((e) => e.y > 3 && e.hp > 0)
          .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
        if (target) {
          const a = Math.atan2(target.y - s.y, target.x - s.x);
          s.vx += (Math.cos(a) * 45 - s.vx) * dt * 5;
          s.vy += (Math.sin(a) * 45 - s.vy) * dt * 5;
        }
      }
      if (s.enemy) s.vy -= dt * 8;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.mesh.position.set(s.x, s.y, 0.2);
      s.mesh.rotation.z = Math.atan2(s.vy, s.vx);
      if (s.enemy && Math.hypot(s.x - p.x, s.y - p.y) < 2) {
        this.hurt(16);
        s.life = 0;
      }
      if (!s.enemy)
        for (const e of this.enemies) {
          const radius = e.kind === 'boss' ? 5 : e.kind === 'bomber' ? 2.5 : 1.5;
          if (e.hp > 0 && !s.hit.has(e) && Math.hypot(s.x - e.x, s.y - e.y) < radius) {
            e.hp -= s.damage;
            s.hit.add(e);
            this.burst(s.x, s.y, 5);
            if (e.kind === 'drone') e.diving = true;
            if (s.type !== 'rail') s.life = 0;
            break;
          }
        }
      if (s.y < this.terrain.heightAt(s.x) + 0.15) {
        if (s.enemy) {
          this.terrain.carve(s.x, this.terrain.heightAt(s.x), 5, 4);
          this.burst(s.x, s.y, 55);
          this.audio.blast(clamp((s.x - p.x) / 35, -1, 1));
          this.trauma = 0.4;
        }
        if (s.type === 'seismic') {
          for (const e of this.enemies) if (e.y < 3 && Math.abs(e.x - s.x) < 12) e.hp -= 5;
          this.burst(s.x, s.y, 25);
        }
        s.life = 0;
      }
      if (s.life <= 0 || Math.abs(s.x - p.x) > 120) {
        if (s.type === 'flak') {
          this.burst(s.x, s.y, 16);
          for (const e of this.enemies) if (Math.hypot(e.x - s.x, e.y - s.y) < 5) e.hp -= 2;
        }
        s.active = false;
        s.mesh.visible = false;
      }
    }
  }
  private spawn(kind: EnemyKind, x: number, y: number) {
    const group = makeEnemy(kind);
    group.position.set(x, y, 0);
    this.scene.add(group);
    this.enemies.push({
      group,
      kind,
      x,
      y,
      hp:
        kind === 'boss'
          ? 100
          : kind === 'bomber'
            ? 10
            : kind === 'rock'
              ? 3
              : kind === 'hunter'
                ? 7
                : 2,
      timer: 0,
      seed: x,
      diving: false,
    });
  }
  private wave() {
    const x = this.current.x + 70,
      b = this.state.biome,
      n = Math.floor(this.elapsed / 4),
      r = randomAt(n + 91);
    if (r < 0.4) {
      for (let i = 0; i < 3 + b; i++) this.spawn('drone', x + i * 4, 9 + Math.abs(i - 1) * 2);
    } else if (r < 0.59) this.spawn('bomber', x, 15);
    else if (r < 0.73 && b > 0) this.spawn('hunter', x, 11);
    else if (r < 0.85 && b > 1) this.spawn('interceptor', x, 19);
    else this.spawn('skimmer', x, this.terrain.heightAt(x) + 1);
    const gx = x + 15;
    this.spawn(b > 0 && r > 0.5 ? 'mine' : 'rock', gx, this.terrain.heightAt(gx) + 1);
    if (b >= 2 && n % 3 === 0) this.spawn('leech', gx + 20, -2);
  }
  private updateEnemies(dt: number, boost: boolean) {
    const p = this.current;
    for (const e of this.enemies) {
      e.timer += dt;
      const prevX = e.x;
      if (e.kind === 'drone') {
        e.x -= dt * (e.diving ? 22 : 6);
        e.y += Math.cos(this.elapsed * 2 + e.seed) * dt * 2;
        if (e.diving) e.y += (p.y - e.y) * dt * 1.8;
      }
      if (e.kind === 'bomber' || e.kind === 'boss') {
        e.x = e.kind === 'boss' ? p.x + 13 : e.x - dt * 2;
        e.y = 14 + Math.sin(this.elapsed * 0.8 + e.seed);
        if (e.timer > (e.kind === 'boss' ? 1.25 : 2.4) && Math.abs(e.x - p.x) < 55) {
          this.shoot('bomb', e.x, e.y, -2, -3, 1, true);
          e.timer = 0;
        }
        if (e.kind === 'boss') this.state.boss = Math.max(0, e.hp);
      }
      if (e.kind === 'hunter') {
        e.x -= dt * 3;
        e.y = 10 + Math.sin(this.elapsed);
        if (Math.abs(e.x - p.x) < 4 && !boost) {
          this.body.applyImpulse({ x: 0, y: this.body.mass() * 22 * dt, z: 0 }, true);
          this.announce('TRACTOR BEAM · BOOST TO ESCAPE');
        }
      }
      if (e.kind === 'interceptor') {
        e.x -= dt * 30;
        if (e.timer > 1 && e.timer < 2) {
          this.strike(p.x + 20);
          e.timer = 3;
        }
      }
      if (e.kind === 'skimmer') {
        e.x -= dt * 8;
        e.y = this.terrain.heightAt(e.x) + 0.6;
        if (e.timer > 2 && e.x - p.x < 40) {
          this.shoot('bomb', e.x, e.y + 1, -30, 3, 1, true);
          e.timer = 0;
        }
      }
      if (e.kind === 'mine') {
        e.y = this.terrain.heightAt(e.x) + 1.3 + Math.sin(this.elapsed * 3) * 0.3;
        if (Math.abs(e.x - p.x) < 20 && this.state.speed < 13) e.x += Math.sign(p.x - e.x) * dt * 5;
      }
      if (e.kind === 'leech') {
        e.y = -2 + Math.max(0, 1 - Math.abs(e.x - p.x) / 12) * 8;
      }
      e.group.position.set(e.x, e.y, 0);
      if (e.kind === 'drone') e.group.rotation.z = (e.x - prevX) * 0.4;
      if (Math.hypot(e.x - p.x, e.y - p.y) < (e.kind === 'rock' ? 2.6 : 2.3)) {
        this.hurt(e.kind === 'rock' ? 18 : 22);
        e.hp = 0;
      }
      if (e.hp <= 0) {
        this.state.kills += e.kind === 'rock' ? 0 : 1;
        this.state.score += e.kind === 'boss' ? 4000 : e.kind === 'rock' ? 75 : 200;
        this.burst(e.x, e.y, e.kind === 'boss' ? 100 : 35);
        this.audio.blast(clamp((e.x - p.x) / 35, -1, 1));
        this.trauma = 0.25;
        if (e.kind === 'mine') this.terrain.carve(e.x, this.terrain.heightAt(e.x), 3, 2);
        if (e.kind === 'boss') this.state.boss = 0;
      }
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hp <= 0 || e.x < p.x - 25) {
        disposeGroup(e.group);
        this.enemies.splice(i, 1);
      }
    }
  }
  private strike(x: number) {
    const mesh = new T.Mesh(
      new T.CylinderGeometry(0.08, 0.08, 40, 6),
      new T.MeshBasicMaterial({ color: '#ff5358', transparent: true, opacity: 0.6 }),
    );
    mesh.position.set(x, 18, 0);
    this.scene.add(mesh);
    this.strikes.push({ x, timer: 1.5, mesh, fired: false });
    this.audio.tone(880, 0.3, 'square', 0.08);
  }
  private updateStrikes(dt: number) {
    for (const s of this.strikes) {
      s.timer -= dt;
      if (s.timer <= 0 && !s.fired) {
        s.fired = true;
        s.mesh.scale.set(22, 1, 22);
        s.timer = 0.3;
        this.burst(s.x, 1, 65);
        this.terrain.carve(s.x, this.terrain.heightAt(s.x), 5, 6);
        if (Math.abs(this.current.x - s.x) < 5) this.hurt(35);
        this.audio.blast();
        this.trauma = 0.7;
      }
    }
    for (let i = this.strikes.length - 1; i >= 0; i--)
      if (this.strikes[i].timer <= 0 && this.strikes[i].fired) {
        disposeGroup(this.strikes[i].mesh);
        this.strikes.splice(i, 1);
      }
  }
  private rearDefense() {
    if (this.state.phase !== 'playing' || this.rearCooldown > 0 || this.state.capacitor < 20)
      return;
    this.state.capacitor -= 20;
    this.rearCooldown = 3;
    this.burst(this.current.x - 3, this.current.y, 40);
    for (const e of this.enemies) if (e.x < this.current.x && e.x > this.current.x - 20) e.hp -= 8;
    this.announce('REAR EMP DISCHARGED');
    this.audio.blast();
  }
  private hurt(amount: number) {
    if (this.invulnerable > 0) return;
    this.state.hull = Math.max(0, this.state.hull - amount);
    this.reportMark.damage += amount;
    this.invulnerable = 1.2;
    this.trauma = 0.8;
    this.audio.blast();
    this.burst(this.current.x, this.current.y, 35);
    const pad = navigator.getGamepads?.()[0];
    const actuator = pad?.vibrationActuator;
    try {
      void actuator
        ?.playEffect('dual-rumble', { duration: 160, strongMagnitude: 0.5, weakMagnitude: 0.25 })
        .catch(() => {});
    } catch {}
    if (this.state.hull <= 0) {
      this.state.phase = 'dead';
      this.saveBest();
      this.emit();
    }
  }
  private checkpoint() {
    const s = this.state;
    s.reportTime = s.time - this.reportMark.time;
    s.reportKills = s.kills - this.reportMark.kills;
    s.reportClean = s.clean - this.reportMark.clean;
    s.reportDamage = this.reportMark.damage;
    s.reportBonus = checkpointBonus(s.reportTime, s.reportKills, s.reportClean, s.reportDamage);
    s.score += s.reportBonus;
    s.phase = 'report';
    this.keys.clear();
    this.touch.clear();
    this.reportMark = { time: s.time, kills: s.kills, clean: s.clean, damage: 0 };
    this.audio.checkpoint();
    this.saveBest();
    this.emit();
  }
  private saveBest() {
    this.state.best = Math.max(this.state.best, Math.floor(this.state.score));
    try {
      localStorage.setItem('void-runner-best', String(this.state.best));
    } catch {}
  }
  private burst(x: number, y: number, count: number) {
    for (const p of this.particles) {
      if (p.life > 0) continue;
      Object.assign(p, {
        x,
        y,
        z: (Math.random() - 0.5) * 2,
        vx: (Math.random() - 0.5) * 10,
        vy: Math.random() * 8,
        vz: (Math.random() - 0.5) * 7,
        life: 0.5 + Math.random() * 0.8,
        max: 1,
      });
      if (--count <= 0) break;
    }
  }
  private updateParticles(dt: number) {
    for (const p of this.particles)
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 10 * dt;
        if (p.y < this.terrain.heightAt(p.x)) {
          p.y = this.terrain.heightAt(p.x) + 0.1;
          p.vy = Math.abs(p.vy) * 0.35;
        }
      }
  }
  private render(dt: number, input: Input) {
    const menu = this.state.phase === 'menu',
      p = this.previous.clone().lerp(this.current, clamp(this.accumulator / FIXED_DT, 0, 1));
    this.rover.group.position.copy(p);
    this.rover.group.quaternion.copy(this.body.rotation());
    this.rover.group.visible = !(
      this.invulnerable > 0 &&
      Math.floor(this.elapsed * 12) % 2 === 0 &&
      this.state.hull < 100
    );
    for (let i = 0; i < 6; i++) {
      this.rover.wheels[i].position.y = -0.1 - (this.vehicle.wheelSuspensionLength(i) ?? 0.6);
      this.rover.wheels[i].rotation.z = -(this.vehicle.wheelRotation(i) ?? 0);
    }
    const boost = this.state.phase === 'playing' && input.boost && this.state.capacitor > 0;
    this.rover.flame.visible = boost;
    this.rover.flame.scale.x = 0.8 + Math.random() * 0.7;
    const target = this.enemies.find((e) => e.y > 4 && e.x > p.x && e.x < p.x + 35);
    this.rover.turret.rotation.z = target
      ? -clamp(Math.atan2(target.x - p.x, target.y - p.y), -0.75, 0.75)
      : 0;
    const fov = menu ? 45 : boost ? 60 : 48;
    this.camera.fov = T.MathUtils.lerp(this.camera.fov, fov, 1 - Math.exp(-dt * 3));
    this.camera.updateProjectionMatrix();
    const narrow = this.camera.aspect < 1;
    const distance = (menu ? 32 : 34) * (narrow ? Math.min(2.2, 1 / this.camera.aspect) : 1);
    const targetPos = new T.Vector3(
      p.x + (narrow ? 5 : menu ? 7 : 12),
      menu ? 8.8 : 10.2,
      distance,
    );
    this.camera.position.lerp(targetPos, 1 - Math.exp(-dt * 5));
    this.trauma = Math.max(0, this.trauma - dt * 2);
    this.camera.position.y += Math.sin(this.elapsed * 75) * this.trauma * 0.15;
    this.camera.lookAt(p.x + (narrow ? (menu ? 2 : 6) : menu ? 9 : 14), 3.6, 0);
    this.backdrop.group.position.x = p.x * 0.98;
    this.light.position.x = p.x - 25;
    this.light.target.position.x = p.x + 10;
    const biome = BIOMES[this.state.biome];
    (this.scene.background as T.Color).lerp(new T.Color(biome.sky), dt * 2);
    (this.scene.fog as T.FogExp2).color.copy(this.scene.background as T.Color);
    for (let i = 0; i < this.particles.length; i++) {
      const q = this.particles[i];
      this.dummy.position.set(q.x, q.y, q.z);
      this.dummy.scale.setScalar(q.life > 0 ? Math.min(1, q.life * 3) : 0);
      this.dummy.rotation.set(q.life * 4, q.life * 2, 0);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }
  private clearEntities() {
    for (const e of this.enemies) disposeGroup(e.group);
    this.enemies = [];
    for (const s of this.shots) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const s of this.strikes) disposeGroup(s.mesh);
    this.strikes = [];
    for (const p of this.particles) p.life = 0;
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.visibility);
    this.audio.dispose();
    if (this.ready) {
      this.clearEntities();
      this.terrain.dispose();
      this.world.free();
      disposeGroup(this.scene);
      this.compute.dispose();
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
  }
}
