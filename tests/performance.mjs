import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('http://127.0.0.1:5173');
  await page
    .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
    .waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true }).click();
  await page.evaluate(() => {
    const g = window.__voidRunner;
    g.invulnerable = 999;
    g.spawnAt = Infinity;
    window.__stress = setInterval(() => {
      for (let i = 0; i < 60; i++)
        g.shoot(
          'pulse',
          g.current.x + 5 + Math.random() * 35,
          9 + Math.random() * 10,
          4,
          0,
          0,
          false,
        );
      g.burst(g.current.x + 15, 8, 100);
    }, 250);
  });
  await page.waitForTimeout(2500);
  const metrics = await page.evaluate(async () => {
    const g = window.__voidRunner,
      frames = [],
      shots = [];
    let previous = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        frames.push(now - previous);
        previous = now;
        shots.push(g.shots.filter((x) => x.active).length);
        if (frames.length < 180) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    frames.sort((a, b) => a - b);
    clearInterval(window.__stress);
    g.pause();
    const adapter = await navigator.gpu?.requestAdapter();
    return {
      backend: g.state.backend,
      adapter: adapter?.info,
      viewport: [1920, 1080],
      frames: frames.length,
      medianFrameMs: frames[90],
      p95FrameMs: frames[Math.floor(frames.length * 0.95)],
      meanFrameMs: frames.reduce((a, b) => a + b, 0) / frames.length,
      minShots: Math.min(...shots),
      maxShots: Math.max(...shots),
      calls: g.renderer.info.render.calls,
    };
  });
  console.log('PERFORMANCE', JSON.stringify(metrics));
  await fs.writeFile('test-results/performance.json', JSON.stringify(metrics, null, 2));
  await page.goto('http://127.0.0.1:5173/?renderer=webgl');
  await page
    .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
    .waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true }).click();
  await page.waitForTimeout(1000);
  console.log(
    'FALLBACK',
    await page.evaluate(() => ({
      backend: window.__voidRunner.state.backend,
      gpuBrush: window.__voidRunner.compute.available,
      distance: window.__voidRunner.state.distance,
    })),
  );
} finally {
  await browser.close();
}
