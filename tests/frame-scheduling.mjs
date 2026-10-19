import { launchBrowser } from './helpers/browser.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';

// Empty-page calibration, never a game-performance acceptance result.
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1184 } });
  await page.goto('about:blank');
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const frames = [];
        let start, previous;
        const tick = (now) => {
          start ??= now;
          if (previous !== undefined && now - start > 1000) frames.push(now - previous);
          previous = now;
          if (now - start >= 61000) resolve(frames);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  const sorted = [...frames].sort((a, b) => a - b);
  const result = {
    capturedAt: new Date().toISOString(),
    fixture: 'Empty page; no game, WebGPU scene, React, or audio; 1 s warmup plus 60 s sampling',
    acceptance: false,
    browser: browser.version(),
    cpu: os.cpus()[0]?.model,
    summary: {
      frames: frames.length,
      median: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      max: sorted.at(-1),
      framesOver25: frames.filter((ms) => ms > 25).length,
    },
    frames,
  };
  await fs.mkdir('test-results', { recursive: true });
  await fs.writeFile('test-results/frame-scheduling.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, frames: undefined }));
} finally {
  await browser.close();
}
