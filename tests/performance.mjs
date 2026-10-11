import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';

// Controlled render comparison, not the full PRD acceptance workload.
await fs.mkdir('test-results', { recursive: true });
const label = process.argv[2] ?? 'current';
const quality = process.argv[3] ?? 'balanced';
const scenario = process.argv[4] ?? 'idle';
assert(/^[a-z0-9-]+$/i.test(label), 'Use a simple filename label');
assert(['performance', 'balanced', 'cinematic'].includes(quality), 'Use a valid graphics preset');
assert(['idle', 'weapons'].includes(scenario), 'Use idle or weapons');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const mode of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const url = new URL('http://127.0.0.1:5173/');
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
    const metrics = await page.evaluate(async (scenario) => {
      const g = window.__voidRunner;
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
        originalStep(scenario === 'weapons' ? { ...input, fire: ++weaponTick % 84 !== 0 } : input);
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
        const tick = (now) => {
          if (ticks++ >= 90 && previous !== undefined) {
            frames.push(now - previous);
            shots.push(g.shots.filter((s) => s.active).length);
            particles.push(g.particles.filter((p) => p.life > 0).length);
            // render.calls is cumulative in Three r180; drawCalls is per frame.
            calls.push(g.renderer.info.render.drawCalls);
            geometries.push(g.renderer.info.memory.geometries);
            energy.push(g.weaponEffects.energy.count);
            slag.push(g.weaponEffects.slag.count);
          }
          previous = now;
          if (frames.length < 240) requestAnimationFrame(tick);
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
          max: sorted.at(-1),
          mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        };
      };
      const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
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
      };
    }, scenario);
    assert.equal(metrics.backend, mode === 'webgpu' ? 'WEBGPU' : 'WEBGL 2');
    assert.equal(metrics.quality, quality);
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
        browser: browser.version(),
        machine: {
          cpu: os.cpus()[0]?.model,
          logicalCpus: os.cpus().length,
          memoryGB: os.totalmem() / 2 ** 30,
          platform: os.platform(),
          release: os.release(),
        },
        fixture:
          'fixed arena; real simulation; 100 projectiles; 600 CPU debris; 90 warmup + 240 sampled frames',
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
