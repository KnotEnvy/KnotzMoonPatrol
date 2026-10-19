import { gameUrl, launchBrowser } from './helpers/browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';

await fs.mkdir('test-results', { recursive: true });
const label = process.argv[2] ?? 'current';
assert(/^[a-z0-9-]+$/i.test(label), 'Use a simple capture label');
const browser = await launchBrowser();
const results = [];
try {
  for (const mode of process.env.BACKEND ? [process.env.BACKEND] : ['webgpu', 'webgl']) {
    // The game now fills the viewport; this produces a native 1920x1080 canvas.
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(
      gameUrl({ quality: 'balanced', renderer: mode === 'webgl' ? 'webgl' : undefined }),
    );
    await page
      .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
      .click({ timeout: 90000 });
    const metrics = await page.evaluate(async () => {
      const g = window.__voidRunner;
      g.invulnerable = 999;
      g.nextReport = 26;
      const originalStep = g.step.bind(g);
      const fill = () => {
        g.body.setTranslation({ x: 20, y: 3, z: 0 }, true);
        g.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        g.current.set(20, 3, 0);
        g.previous.copy(g.current);
        for (let i = 0; i < g.shots.length; i++) {
          const shot = g.shots[i];
          shot.active = i < 80 || (i >= 120 && i < 140);
          if (!shot.active) continue;
          const n = i < 120 ? i : i - 40;
          Object.assign(shot, {
            x: 21 + (n % 20) * 2,
            y: 6 + Math.floor(n / 20) * 1.1,
            vx: 4,
            vy: 0,
            life: 10,
            damage: 0,
            type: 'pulse',
          });
          shot.mesh.visible = true;
          shot.mesh.position.set(shot.x, shot.y, 0.2);
          shot.mesh.rotation.set(0, 0, 0);
          shot.mesh.scale.set(0.45, 0.16, 0.16);
        }
        for (let i = 0; i < g.particles.length; i++)
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
      };
      g.step = (input) => {
        originalStep(input);
        fill();
      };
      fill();
      const samples = [],
        frameMs = [],
        commits = [],
        occupancies = [];
      const nextFrame = () => new Promise(requestAnimationFrame);
      const ray = (x) => {
        const hit = g.world.castRay(
          { origin: { x, y: 20, z: 0 }, dir: { x: 0, y: -1, z: 0 } },
          100,
          true,
          undefined,
          undefined,
          undefined,
          g.body,
        );
        return hit ? 20 - hit.timeOfImpact : null;
      };
      for (let i = 0; i < 48; i++) {
        const frameStart = i === 0 ? null : await nextFrame();
        const x = i % 2 ? 64 : 32;
        const before = g.terrain.heightAt(x),
          start = performance.now();
        await g.terrain.carve(x, before, 5, 0.15);
        const ms = performance.now() - start;
        g.world.step();
        const probes = [x - 0.1, x, x + 0.1].map((x) => ({
          mesh: g.terrain.heightAt(x),
          collider: ray(x),
        }));
        const after = g.terrain.heightAt(x);
        samples.push(ms);
        commits.push({ x, ms, backend: g.compute.lastBackend, before, after, probes });
        if (i === 0) for (let warmup = 0; warmup < 90; warmup++) await nextFrame();
        const now = await nextFrame();
        if (frameStart !== null) frameMs.push(now - frameStart);
        occupancies.push([
          g.shots.filter((s) => s.active).length,
          g.particles.filter((p) => p.life > 0).length,
        ]);
      }
      // Check a burst of ordered overlapping edits and unchanged collider identity.
      const beforeBurst = g.terrain.heightAt(64),
        burstAt = performance.now();
      await Promise.all([0.2, 0.4, 0.6].map((depth) => g.terrain.carve(64, beforeBurst, 5, depth)));
      const burstMs = performance.now() - burstAt;
      g.world.step();
      const chunk = g.terrain.chunks.get(1),
        handle = chunk.collider.handle,
        version = chunk.version;
      await g.terrain.carve(64, beforeBurst + 10, 5, 0.1);
      const noOp = {
        sameCollider: chunk.collider.handle === handle,
        sameVersion: chunk.version === version,
      };
      const burst = {
        ms: burstMs,
        before: beforeBurst,
        after: g.terrain.heightAt(64),
        collider: ray(64),
        seam: [g.terrain.heightAt(63.999), g.terrain.heightAt(64.001)],
        noOp,
      };
      const summarize = (values) => {
        const sorted = [...values].sort((a, b) => a - b);
        return {
          min: sorted[0],
          median: sorted[Math.floor(sorted.length / 2)],
          p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
          max: sorted.at(-1),
        };
      };
      // Validate the retained WGSL path separately; its readback is not part of the small-brush budget.
      let equivalence = null;
      if (g.compute.available) {
        const { TerrainCompute } = await import('/src/game/terrain-compute.ts');
        const cpu = new TerrainCompute();
        const vertices = g.terrain.chunks.get(0).vertices.slice();
        const y = g.terrain.heightAt(32) - 0.5;
        const a = await cpu.carve(vertices, 32, y, 7, 2, 'cpu');
        const b = await g.compute.carve(vertices, 32, y, 7, 2, 'gpu');
        equivalence = {
          backend: g.compute.lastBackend,
          maxError: Math.max(...a.map((v, i) => Math.abs(v - b[i]))),
        };
      }
      const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
      const info = adapter?.info;
      return {
        backend: g.state.backend,
        canvas: [g.renderer.domElement.width, g.renderer.domElement.height],
        adapter: info
          ? { vendor: info.vendor, architecture: info.architecture, device: info.device }
          : null,
        coldMs: samples[0],
        commitMs: summarize(samples),
        frameMs: summarize(frameMs),
        rawFrameMs: frameMs,
        samples: commits,
        occupancies,
        burst,
        equivalence,
      };
    });
    assert.equal(metrics.backend, mode === 'webgpu' ? 'WEBGPU' : 'WEBGL 2');
    assert.deepEqual(metrics.canvas, [1920, 1080]);
    assert(metrics.occupancies.every(([shots, particles]) => shots >= 100 && particles >= 600));
    for (const commit of metrics.samples) {
      assert.equal(commit.backend, 'cpu');
      assert(commit.after < commit.before - 0.149);
      assert(
        commit.probes.every((p) => p.collider !== null && Math.abs(p.mesh - p.collider) < 0.02),
      );
    }
    assert(metrics.burst.after < metrics.burst.before - 0.599);
    assert(Math.abs(metrics.burst.collider - metrics.burst.after) < 0.02);
    assert(Math.abs(metrics.burst.seam[0] - metrics.burst.seam[1]) < 0.02);
    assert(metrics.burst.noOp.sameCollider && metrics.burst.noOp.sameVersion);
    if (mode === 'webgpu') {
      assert.equal(metrics.equivalence?.backend, 'gpu');
      assert(metrics.equivalence.maxError < 0.0001);
    }
    assert.deepEqual(errors, []);
    results.push({ mode, ...metrics, errors });
    console.log(
      'TERRAIN PERFORMANCE',
      JSON.stringify({
        ...results.at(-1),
        samples: undefined,
        rawFrameMs: undefined,
        occupancies: undefined,
      }),
    );
    await page.screenshot({
      path: `test-results/terrain-${label}-${mode}.jpg`,
      type: 'jpeg',
      quality: 75,
    });
    await page.close();
  }
  await fs.writeFile(
    `test-results/terrain-${label}.json`,
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
          'native 1080p; fixed arena with real simulation; 100 projectiles; 600 CPU debris; 48 single/seam commits plus overlapping burst; 90 warmup frames after cold commit',
        acceptance: false,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
