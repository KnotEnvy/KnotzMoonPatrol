import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';

const label = process.argv[2] ?? 'current';
const pacing = process.argv[3] ?? 'audit';
const backend = process.argv[4] ?? 'both';
const recovery = process.env.RECOVERY === '1';
const runSeconds = Number(process.env.RUN_SECONDS ?? 420);
const quality = process.env.QUALITY ?? 'balanced';
const startDistance = Number(process.env.START_DISTANCE ?? 0);
const profile = process.env.PROFILE === '1';
const enforceFloor = process.argv.includes('--gate');
if (enforceFloor)
  assert(
    pacing === 'paced' &&
      runSeconds === 420 &&
      startDistance === 0 &&
      !profile &&
      quality !== 'performance',
    'The 40 FPS gate requires an unprofiled, normal-speed full route with detailed graphics',
  );
assert(Number.isFinite(runSeconds) && runSeconds >= 10 && runSeconds <= 420);
assert(Number.isFinite(startDistance) && startDistance >= 0 && startDistance < 5500);
assert(
  startDistance === 0 || (pacing === 'paced' && runSeconds < 420),
  'Positioned samples are short diagnostics, never full-run audits',
);
assert(['performance', 'balanced', 'cinematic'].includes(quality));
const gameUrl =
  process.env.GAME_URL ?? (enforceFloor ? 'http://127.0.0.1:4174/' : 'http://127.0.0.1:5173/');
const pilotSource = (
  await fs.readFile(new URL('./helpers/patrol-pilot.mjs', import.meta.url), 'utf8')
).replace('export function createPatrolPilot', 'window.createPatrolPilot = function');
assert(/^[a-z0-9-]+$/i.test(label));
assert(['audit', 'paced'].includes(pacing));
assert(['both', 'webgpu', 'webgl'].includes(backend));
await fs.mkdir('test-results', { recursive: true });
const headless = process.env.HEADED !== '1';
const browser = await chromium.launch({ channel: 'msedge', headless });
const runs = [];
try {
  for (const mode of backend === 'both' ? ['webgpu', 'webgl'] : [backend]) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1184 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
      if (m.text().startsWith('RUN CHECKPOINT')) console.log(mode, m.text());
    });
    const url = new URL(gameUrl);
    url.searchParams.set('quality', quality);
    if (mode === 'webgl') url.searchParams.set('renderer', 'webgl');
    await page.goto(url.href);
    await page
      .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
      .click({ timeout: 90000 });
    await page.addScriptTag({ content: pilotSource });
    const cdp = profile ? await page.context().newCDPSession(page) : null;
    if (cdp) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
      await cdp.send('Profiler.start');
    }
    for (const loadout of pacing === 'paced'
      ? [{ ground: 'pulse', sky: 'flak' }]
      : [
          { ground: 'pulse', sky: 'flak' },
          { ground: 'beam', sky: 'rail' },
          { ground: 'seismic', sky: 'seeker' },
        ]) {
      const result = await page.evaluate(
        async ({ loadout, pacing, recovery, runSeconds, startDistance }) => {
          const { createPatrolPilot } = window;
          const g = window.__voidRunner;
          g.audio.enabled = pacing === 'paced';
          const step = g.step.bind(g),
            hurt = g.hurt.bind(g);
          let pilot = createPatrolPilot();
          const injuries = [],
            reports = [],
            sectors = [],
            frames = [],
            costs = [];
          const recoveries = [];
          const longFrames = [];
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              longFrames.push({ x: g.current.x, ...entry.toJSON() });
          });
          observer.observe({ type: 'long-animation-frame', buffered: false });
          const work = { terrain: [], hazards: [], spawn: [], render: [] };
          const wrap = (owner, key, bucket) => {
            const original = owner[key].bind(owner);
            owner[key] = (...args) => {
              const t = performance.now();
              const result = original(...args);
              const ms = performance.now() - t;
              if (ms > 1) bucket.push({ x: g.state.distance, ms });
              return result;
            };
            return () => {
              owner[key] = original;
            };
          };
          g.start(loadout);
          if (startDistance > 0) {
            g.terrain.update(startDistance);
            g.hazards.stream(startDistance);
            g.body.setTranslation(
              { x: startDistance, y: g.terrain.heightAt(startDistance) + 2, z: 0 },
              true,
            );
            g.current.copy(g.body.translation());
            g.previous.copy(g.current);
            g.camera.position.set(startDistance + 12, 10.2, 34);
            g.nextReport = 26;
          }
          const memoryBefore = { ...g.renderer.info.memory };
          const restore = [
            wrap(g.terrain, 'update', work.terrain),
            wrap(g.hazards, 'stream', work.hazards),
            wrap(g, 'spawn', work.spawn),
            wrap(g.graphics, 'render', work.render),
          ];
          let ticks = 0,
            sector = -1,
            previousFrame;
          g.hurt = (amount) => {
            const before = g.state.hull;
            const origin = new Error().stack?.split('\n')[2]?.trim();
            hurt(amount);
            if (g.state.hull < before)
              injuries.push({ x: g.current.x, y: g.current.y, amount, hull: g.state.hull, origin });
          };
          const advance = () => {
            if (g.state.phase === 'report') {
              reports.push({
                sector: g.state.sector,
                hull: g.state.hull,
                time: g.state.reportTime,
                damage: g.state.reportDamage,
              });
              console.log('RUN CHECKPOINT', g.state.sector, 'HULL', g.state.hull);
              g.continue();
            }
            if (g.state.phase !== 'playing') return;
            const t = performance.now();
            step(pilot(g));
            const ms = performance.now() - t;
            if (ms > 2) costs.push({ x: g.current.x, ms });
            ticks++;
            if (sector !== g.state.sector) {
              sector = g.state.sector;
              sectors.push({
                sector,
                hull: g.state.hull,
                time: g.state.time,
                kills: g.state.kills,
              });
            }
          };
          g.step = pacing === 'paced' ? advance : () => {};
          const started = performance.now();
          try {
            await new Promise((resolve) => {
              const frame = async (now) => {
                if (
                  g.state.phase === 'dead' &&
                  recovery &&
                  g.state.checkpoint > 0 &&
                  recoveries.length < 3
                ) {
                  recoveries.push({
                    x: g.state.distance,
                    checkpoint: g.state.checkpoint,
                    score: g.state.score,
                  });
                  g.retryCheckpoint();
                  pilot = createPatrolPilot();
                }
                if (pacing === 'paced' && g.state.phase === 'report') advance();
                if (previousFrame !== undefined && pacing === 'paced')
                  frames.push({ x: g.current.x, ms: now - previousFrame });
                previousFrame = now;
                if (pacing === 'audit') {
                  for (
                    let i = 0;
                    i < 60 && g.state.phase !== 'dead' && g.state.phase !== 'complete';
                    i++
                  ) {
                    const queue = g.terrain.queue;
                    advance();
                    if (g.terrain.queue !== queue) await g.terrain.queue;
                  }
                }
                if (
                  g.state.phase === 'complete' ||
                  (g.state.phase === 'dead' &&
                    !(recovery && g.state.checkpoint > 0 && recoveries.length < 3)) ||
                  ticks > 60 * runSeconds ||
                  performance.now() - started > 600000
                )
                  resolve();
                else requestAnimationFrame(frame);
              };
              requestAnimationFrame(frame);
            });
            return {
              loadout,
              phase: g.state.phase,
              distance: g.state.distance,
              hull: g.state.hull,
              score: Math.floor(g.state.score),
              time: g.state.time,
              boss: g.state.boss,
              ticks,
              injuries,
              recoveries,
              reports,
              sectors,
              frames,
              costs,
              work,
              longFrames,
              memory: {
                before: memoryBefore,
                after: { ...g.renderer.info.memory },
                chunks: g.terrain.prepared.size,
                actors: g.enemyModels.warmupGroups.length,
              },
              canvas: [g.renderer.domElement.width, g.renderer.domElement.height],
            };
          } finally {
            g.step = step;
            g.hurt = hurt;
            restore.forEach((fn) => fn());
            observer.disconnect();
            g.pause();
          }
        },
        { loadout, pacing, recovery, runSeconds, startDistance },
      );
      runs.push({ mode, ...result, errors: [...errors] });
      assert.deepEqual(result.canvas, [1920, 1080]);
      if (recovery && runSeconds === 420)
        assert.equal(
          result.phase,
          'complete',
          'Route must finish within three checkpoint recoveries',
        );
      const sorted = result.frames.map((f) => f.ms).sort((a, b) => a - b);
      result.frameSummary = sorted.length
        ? {
            frames: sorted.length,
            median: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
            max: sorted.at(-1),
            minimumFps: 1000 / sorted.at(-1),
            framesOver25: sorted.filter((x) => x > 25).length,
            over25Percent: (sorted.filter((x) => x > 25).length / sorted.length) * 100,
            over50: sorted.filter((x) => x > 50).length,
          }
        : null;
      runs.at(-1).frameSummary = result.frameSummary;
      runs.at(-1).floorPass =
        result.phase === 'complete' && sorted.length > 0 && sorted.at(-1) <= 25;
      console.log(
        'FULL RUN',
        JSON.stringify({
          mode,
          ...result,
          frames: result.frames.length,
          longFrames: result.longFrames.length,
          costs: result.costs.sort((a, b) => b.ms - a.ms).slice(0, 8),
          work: Object.fromEntries(
            Object.entries(result.work).map(([key, values]) => [
              key,
              values.sort((a, b) => b.ms - a.ms).slice(0, 5),
            ]),
          ),
        }),
      );
      await page.screenshot({
        path: `test-results/full-run-${label}-${mode}-${loadout.ground}.png`,
      });
    }
    assert.deepEqual(errors, []);
    if (cdp) {
      const { profile: cpu } = await cdp.send('Profiler.stop');
      await fs.writeFile(`test-results/profile-${label}-${mode}.json`, JSON.stringify(cpu));
      await cdp.detach();
    }
    await page.close();
  }
} finally {
  await fs.writeFile(
    `test-results/full-run-${label}.json`,
    JSON.stringify(
      {
        pacing,
        gameUrl,
        recovery,
        runSeconds,
        quality,
        startDistance,
        profile,
        headless,
        frameBudgetMs: 25,
        enforceFloor,
        browser: browser.version(),
        cpu: os.cpus()[0]?.model,
        runs,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
if (enforceFloor)
  assert(
    runs.length > 0 && runs.every((run) => run.floorPass),
    '40 FPS floor failed: see raw frame times in test-results. Percentiles cannot override this gate.',
  );
