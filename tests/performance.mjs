import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';

// Controlled render comparison, not the full PRD acceptance workload.
await fs.mkdir('test-results', { recursive: true });
const label = process.argv[2] ?? 'current';
const quality = process.argv[3] ?? 'balanced';
const scenario = process.argv[4] ?? 'idle';
const frameCount = Number(process.env.PERF_FRAMES ?? 600);
assert(Number.isInteger(frameCount) && frameCount >= 240 && frameCount <= 3600);
assert(/^[a-z0-9-]+$/i.test(label), 'Use a simple filename label');
assert(['performance', 'balanced', 'cinematic'].includes(quality), 'Use a valid graphics preset');
assert(['idle', 'weapons'].includes(scenario), 'Use idle or weapons');
const headless = process.env.HEADED !== '1';
const gpuProfile = process.env.GPU_PROFILE === '1';
const quiet = process.env.QUIET === '1';
const bundles = process.env.BUNDLES === '1';
const uiSweep = process.env.UI_SWEEP === '1';
const browser = await chromium.launch({ channel: 'msedge', headless });
const results = [];
try {
  for (const mode of process.env.BACKEND ? [process.env.BACKEND] : ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1184 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const url = new URL(process.env.GAME_URL ?? 'http://127.0.0.1:5173/');
    url.searchParams.set('quality', quality);
    if (mode === 'webgl') url.searchParams.set('renderer', 'webgl');
    await page.goto(url.href);
    if (scenario === 'weapons') {
      await page.getByRole('button', { name: 'CONFIGURE ROVER' }).click();
      await page.getByRole('button', { name: /Resonance Beam/ }).click();
      await page.getByRole('button', { name: /Tachyon Railgun/ }).click();
      await page.getByRole('button', { name: 'CONFIRM LOADOUT' }).click();
    }
    await page
      .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
      .click({ timeout: 60000 });
    const metrics = await page.evaluate(
      async ({ scenario, frameCount, gpuProfile, quiet, bundles, uiSweep }) => {
        const g = window.__voidRunner;
        const uiModes = uiSweep
          ? [
              'normal',
              'visual',
              'normal',
              'telemetry',
              'normal',
              'audio',
              'normal',
              'grain',
              'normal',
            ]
          : ['normal'];
        const uiFrames = uiModes.map((mode) => ({ mode, frames: [] }));
        const uiElements = [...document.querySelectorAll('.app > :not(.scene)')].map((element) => ({
          element,
          display: element.style.display,
        }));
        const onState = g.onState,
          audioUpdate = g.audio.update,
          audioEnabled = g.audio.enabled;
        const setUi = (mode) => {
          g.onState = mode === 'telemetry' ? () => {} : onState;
          g.audio.enabled = mode === 'audio' ? false : audioEnabled;
          g.audio.update = mode === 'audio' ? () => {} : audioUpdate;
          for (const { element, display } of uiElements)
            element.style.display =
              mode === 'visual' || (mode === 'grain' && element.classList.contains('grain'))
                ? 'none'
                : display;
        };
        if (bundles)
          for (const region of g.terrain.sceneryRegions.values()) {
            // Diagnostic equivalent of THREE.BundleGroup; no shipping behavior changes.
            region.isBundleGroup = true;
            region.static = true;
            region.version = 0;
            region.traverse((object) => {
              object.frustumCulled = false;
            });
          }
        const gpuMs = [],
          renderCpuMs = [];
        let pending = false;
        if (gpuProfile && g.renderer.backend.device?.features.has('timestamp-query'))
          g.renderer.backend.trackTimestamp = true;
        const render = g.graphics.render.bind(g.graphics);
        if (gpuProfile)
          g.graphics.render = (...args) => {
            const start = performance.now();
            render(...args);
            renderCpuMs.push(performance.now() - start);
            if (g.renderer.backend.trackTimestamp && !pending) {
              pending = true;
              g.renderer
                .resolveTimestampsAsync()
                .then((ms) => {
                  if (ms !== undefined) gpuMs.push(ms);
                })
                .finally(() => {
                  pending = false;
                });
            }
          };
        if (quiet) {
          g.onState = () => {};
          g.audio.enabled = false;
          g.audio.update = () => {};
          document.querySelectorAll('.app > :not(.scene)').forEach((element) => {
            element.style.display = 'none';
          });
        }
        g.invulnerable = 999;
        g.spawnAt = Infinity;
        const originalStep = g.step.bind(g);
        let weaponTick = 0;
        const fill = () => {
          // Fixed camera/terrain window; real physics and combat continue stepping.
          g.body.setTranslation({ x: 32, y: 3, z: 0 }, true);
          g.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          g.current.set(32, 3, 0);
          g.previous.copy(g.current);
          for (let i = 0; i < g.shots.length; i++) {
            const s = g.shots[i];
            s.active = i < 80 || (i >= 120 && i < 140);
            if (!s.active) continue;
            const n = i < 120 ? i : i - 40;
            Object.assign(s, {
              x: 21 + (n % 20) * 2,
              y: 6 + Math.floor(n / 20) * 1.1,
              vx: 4,
              vy: 0,
              life: 10,
              damage: 0,
              type: 'pulse',
            });
            s.mesh.visible = true;
            s.mesh.position.set(s.x, s.y, 0.2);
            s.mesh.rotation.set(0, 0, 0);
            s.mesh.scale.set(0.45, 0.16, 0.16);
          }
          for (let i = 0; i < g.particles.length; i++) {
            Object.assign(g.particles[i], {
              x: 23 + (i % 40),
              y: 2 + Math.floor(i / 40) * 0.45,
              z: (i % 5) * 0.2,
              vx: 0,
              vy: 0,
              vz: 0,
              life: i < 600 ? 1 : 0,
              max: 1,
            });
          }
          if (scenario === 'weapons') {
            // Sustain the graphics workload; thermal balance is covered by weapons.mjs.
            g.state.heat = 0;
            g.state.lockout = 0;
            g.weaponEffects.pools.forEach((pool, i) =>
              Object.assign(pool, {
                x: 28 + (i % 4) * 5,
                y: g.terrain.heightAt(28 + (i % 4) * 5),
                life: 4,
              }),
            );
          }
        };
        g.step = (input) => {
          originalStep(
            scenario === 'weapons' ? { ...input, fire: ++weaponTick % 84 !== 0 } : input,
          );
          fill();
        };
        fill();
        const frames = [],
          shots = [],
          particles = [],
          calls = [],
          geometries = [],
          energy = [],
          slag = [];
        let previous,
          ticks = 0;
        await new Promise((resolve) => {
          let stage = 0,
            stageTick = 0;
          const tick = (now) => {
            if (ticks++ >= 90 && previous !== undefined) {
              if (uiSweep && stageTick++ < 30) {
                previous = now;
                requestAnimationFrame(tick);
                return;
              }
              frames.push(now - previous);
              uiFrames[stage].frames.push(now - previous);
              shots.push(g.shots.filter((s) => s.active).length);
              particles.push(g.particles.filter((p) => p.life > 0).length);
              // render.calls is cumulative in Three r180; drawCalls is per frame.
              calls.push(g.renderer.info.render.drawCalls);
              geometries.push(g.renderer.info.memory.geometries);
              energy.push(g.weaponEffects.energy.count);
              slag.push(g.weaponEffects.slag.count);
              if (uiFrames[stage].frames.length === frameCount && stage < uiModes.length - 1) {
                stage++;
                stageTick = 0;
                setUi(uiModes[stage]);
              }
            }
            previous = now;
            if (frames.length < frameCount * uiModes.length) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        const summarize = (values) => {
          const sorted = [...values].sort((a, b) => a - b);
          return {
            min: sorted[0],
            median: sorted[Math.floor(sorted.length / 2)],
            p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
            p99: sorted[Math.ceil(sorted.length * 0.99) - 1],
            max: sorted.at(-1),
            mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
          };
        };
        const adapter = await navigator.gpu?.requestAdapter({
          powerPreference: 'high-performance',
        });
        const info = adapter?.info;
        return {
          backend: g.state.backend,
          quality: g.state.quality,
          bloom: g.graphics?.bloomEnabled,
          adapter: info
            ? {
                vendor: info.vendor,
                architecture: info.architecture,
                device: info.device,
                description: info.description,
              }
            : null,
          userAgent: navigator.userAgent,
          viewport: [innerWidth, innerHeight],
          drawingBuffer: [g.renderer.domElement.width, g.renderer.domElement.height],
          frames: frames.length,
          frameMs: summarize(frames),
          activeShots: summarize(shots),
          activeParticles: summarize(particles),
          drawCalls: summarize(calls),
          geometries: summarize(geometries),
          energyInstances: summarize(energy),
          slagInstances: summarize(slag),
          rawFrameMs: frames,
          gpuMs: gpuMs.length ? summarize(gpuMs) : null,
          renderCpuMs: renderCpuMs.length ? summarize(renderCpuMs) : null,
          uiSweep: uiSweep
            ? uiFrames.map(({ mode, frames }) => ({ mode, frameMs: summarize(frames) }))
            : null,
        };
      },
      { scenario, frameCount, gpuProfile, quiet, bundles, uiSweep },
    );
    assert.equal(metrics.backend, mode === 'webgpu' ? 'WEBGPU' : 'WEBGL 2');
    assert.equal(metrics.quality, quality);
    assert.deepEqual(metrics.drawingBuffer, [1920, 1080]);
    assert(metrics.activeShots.min >= 100, 'Stress fixture lost projectile occupancy');
    assert(metrics.activeParticles.min >= 600, 'Stress fixture lost debris occupancy');
    if (scenario === 'weapons') {
      assert(metrics.energyInstances.min > 0 && metrics.energyInstances.max <= 6);
      assert.equal(metrics.slagInstances.min, 16);
      assert.equal(metrics.slagInstances.max, 16);
    }
    assert.deepEqual(errors, []);
    results.push({ mode, ...metrics, errors });
    console.log('PERFORMANCE', JSON.stringify({ ...results.at(-1), rawFrameMs: undefined }));
    await page.screenshot({ path: `test-results/performance-${label}-${mode}.png` });
    await page.close();
  }
  await fs.writeFile(
    `test-results/performance-${label}.json`,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        headless,
        gpuProfile,
        quiet,
        bundles,
        uiSweep,
        browser: browser.version(),
        machine: {
          cpu: os.cpus()[0]?.model,
          logicalCpus: os.cpus().length,
          memoryGB: os.totalmem() / 2 ** 30,
          platform: os.platform(),
          release: os.release(),
        },
        fixture: `fixed arena; real simulation; 100 projectiles; 600 CPU debris; 90 warmup + ${frameCount} sampled frames; native 1920x1080 canvas`,
        acceptance: false,
        scenario,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
