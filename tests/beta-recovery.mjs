import { gameUrl, launchBrowser } from './helpers/browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

await fs.mkdir('test-results', { recursive: true });
const browser = await launchBrowser();
const results = [];
try {
  for (const mode of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(gameUrl({ renderer: mode === 'webgl' ? 'webgl' : undefined }));
    await page
      .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
      .click({ timeout: 90000 });
    const checkpoint = await page.evaluate(() => {
      const g = window.__voidRunner,
        step = g.step.bind(g);
      g.step = () => {};
      g.start();
      g.body.setTranslation({ x: 1099, y: 2, z: 0 }, true);
      g.body.setLinvel({ x: 20, y: 0, z: 0 }, true);
      g.current.copy(g.body.translation());
      g.previous.copy(g.current);
      for (let i = 0; i < 12 && g.state.phase === 'playing'; i++)
        step({ brake: false, boost: false, jump: false, fire: false, vent: false, pitch: 0 });
      g.continue();
      const saved = { score: g.state.score, time: g.state.time, checkpoint: g.state.checkpoint };
      g.state.score += 9000;
      g.state.time += 60;
      g.invulnerable = 0;
      g.hurt(100);
      g.emit();
      return saved;
    });
    assert.equal(checkpoint.checkpoint, 5);
    await page.getByRole('button', { name: 'RECOVER AT CHECKPOINT E' }).click();
    const recovered = await page.evaluate(() => {
      const g = window.__voidRunner;
      return {
        hull: g.state.hull,
        score: g.state.score,
        time: g.state.time,
        x: g.current.x,
        checkpoint: g.state.checkpoint,
        retries: g.state.retries,
        nextReport: g.nextReport,
        cap: g.state.capacitor,
        heat: g.state.heat,
      };
    });
    assert.equal(recovered.hull, 100);
    assert.equal(recovered.score, checkpoint.score);
    assert.equal(recovered.time, checkpoint.time);
    assert.equal(recovered.cap, 100);
    assert.equal(recovered.heat, 0);
    assert.equal(recovered.nextReport, 10);
    assert.equal(recovered.retries, 1);
    assert(recovered.x >= 1100 && recovered.x < 1140);
    const lifecycle = await page.evaluate(async () => {
      const g = window.__voidRunner;
      const initial = {
        prepared: g.terrain.prepared.size,
        actors: g.enemyModels.warmupGroups.length,
      };
      if (![...g.terrain.prepared.values()].every((c) => c.group.position.x === 0))
        throw new Error('Biome warmup left scenery offset from its physics surface');
      for (let i = 0; i < 3; i++) {
        g.invulnerable = 0;
        g.hurt(100);
        // A previously queued blast cannot crater the restored checkpoint.
        const before = g.terrain.heightAt(1110);
        const pending = g.terrain.carve(1110, before, 5, 4);
        g.retryCheckpoint();
        await pending;
        if (Math.abs(g.terrain.heightAt(1110) - before) > 0.01)
          throw new Error('Stale crater crossed restart');
      }
      const retries = g.state.retries,
        score = g.state.score;
      g.start();
      return {
        initial,
        after: { prepared: g.terrain.prepared.size, actors: g.enemyModels.warmupGroups.length },
        retries,
        score,
        freshCheckpoint: g.state.checkpoint,
        freshScore: g.state.score,
        colliders: g.world.colliders.len(),
      };
    });
    assert.deepEqual(lifecycle.after, lifecycle.initial);
    assert.equal(lifecycle.retries, 4);
    assert.equal(lifecycle.score, checkpoint.score);
    assert.equal(lifecycle.freshCheckpoint, 0);
    assert.equal(lifecycle.freshScore, 0);
    assert(lifecycle.colliders <= 7);
    const projectiles = await page.evaluate(() => {
      const g = window.__voidRunner;
      g.body.setLinvel({ x: 20, y: 0, z: 0 }, true);
      g.fire({ fire: true, vent: false }, 1 / 60);
      return g.shots
        .filter((s) => s.active && !s.enemy)
        .map((s) => ({ type: s.type, vx: s.vx, vy: s.vy }));
    });
    assert.equal(projectiles.find((s) => s.type === 'pulse').vx, 90);
    assert(projectiles.find((s) => s.type === 'flak').vx >= 20);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      const g = window.__voidRunner;
      g.state.phase = 'dead';
      g.state.checkpoint = 20;
      g.emit();
    });
    await page.getByRole('button', { name: 'RECOVER AT CHECKPOINT T' }).scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/beta-recovery-${mode}.png` });
    assert.deepEqual(errors, []);
    results.push({ mode, checkpoint, recovered, lifecycle, projectiles, errors });
    console.log('RECOVERY PASS', JSON.stringify(results.at(-1)));
    await page.close();
  }
  await fs.writeFile('test-results/beta-recovery.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
