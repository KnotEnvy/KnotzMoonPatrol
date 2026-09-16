import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  for (const mode of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('http://127.0.0.1:5173/' + (mode === 'webgl' ? '?renderer=webgl' : ''));
    await page
      .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
      .click({ timeout: 60000 });
    await page.evaluate(() => {
      window.__voidRunner.invulnerable = 999;
    });
    await page.waitForFunction(
      () => window.__voidRunner.state.distance > 170,
      {},
      { timeout: 30000 },
    );
    const streaming = await page.evaluate(() => {
      const g = window.__voidRunner;
      return {
        backend: g.state.backend,
        distance: g.state.distance,
        seconds: g.state.time,
        gpuBrush: g.compute.available,
        chunks: g.terrain.chunks.size,
        materials: g.terrain.materials.size,
      };
    });
    assert(streaming.chunks <= 7);
    assert.equal(streaming.gpuBrush, mode === 'webgpu');
    // Render each biome after moving the active streaming window. This catches
    // texture/material lifecycle failures which pure simulation cannot observe.
    for (const x of [1200, 2300, 3400, 4500]) {
      await page.evaluate((x) => {
        const g = window.__voidRunner;
        g.nextReport = 26;
        g.body.setTranslation({ x, y: 3, z: 0 }, true);
        g.current.set(x, 3, 0);
        g.previous.copy(g.current);
      }, x);
      await page.waitForTimeout(650);
    }
    await page.evaluate(() => window.__voidRunner.menu());
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true }).click();
    await page.waitForFunction(() => window.__voidRunner.state.distance > 10);
    assert.deepEqual(errors, []);
    results.push({ mode, streaming, errors });
    console.log('STREAMING PASS', JSON.stringify(results.at(-1)));
    await page.close();
  }
  await fs.writeFile('test-results/streaming-results.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
