import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { gameUrl, launchBrowser } from './helpers/browser.mjs';
import { assetProvenance } from './helpers/asset-provenance.mjs';

const stage = process.env.ASSET_STAGE ?? 'current';
const provenance = await assetProvenance();
assert(/^[a-z0-9-]+$/.test(stage));
await fs.mkdir('test-results/asset-pass', { recursive: true });
const browser = await launchBrowser(),
  errors = [],
  results = [];
const contrast = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const analysis = await browser.newPage();
  const measure = async (image, bounds, hidden) =>
    analysis.evaluate(
      async ({ image, bounds, hidden }) => {
        const load = async (data) => {
          const img = new Image();
          img.src = 'data:image/png;base64,' + data;
          await img.decode();
          return img;
        };
        const img = await load(image),
          blank = await load(hidden);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const x = Math.max(0, Math.floor(bounds.x)),
          y = Math.max(0, Math.floor(bounds.y));
        const w = Math.max(1, Math.min(img.width - x, Math.ceil(bounds.w))),
          h = Math.max(1, Math.min(img.height - y, Math.ceil(bounds.h)));
        const data = ctx.getImageData(x, y, w, h).data;
        ctx.drawImage(blank, 0, 0);
        const under = ctx.getImageData(x, y, w, h).data;
        const linear = (v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        const light = (pixels, i) =>
          0.2126 * linear(pixels[i]) +
          0.7152 * linear(pixels[i + 1]) +
          0.0722 * linear(pixels[i + 2]);
        const actors = [],
          backgrounds = [];
        // Difference mask removes empty corners of wide/spiky model bounds. The two
        // frames use the same frozen simulation; only the actor's meshes are hidden.
        for (let i = 0; i < data.length; i += 4)
          if (
            Math.max(
              Math.abs(data[i] - under[i]),
              Math.abs(data[i + 1] - under[i + 1]),
              Math.abs(data[i + 2] - under[i + 2]),
            ) > 8
          ) {
            actors.push(light(data, i));
            backgrounds.push(light(under, i));
          }
        const summarize = (values) => {
          values.sort((a, b) => a - b);
          return {
            mean: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
            p90: values[Math.floor(values.length * 0.9)] ?? 0,
          };
        };
        const actor = summarize(actors),
          background = summarize(backgrounds);
        return {
          actor,
          background,
          ratio:
            (Math.max(actor.mean, background.mean) + 0.05) /
            (Math.min(actor.mean, background.mean) + 0.05),
          visiblePixels: actors.length,
          bounds,
        };
      },
      { image: image.toString('base64'), hidden: hidden.toString('base64'), bounds },
    );
  const actorBounds = async (rover = false) =>
    page.evaluate(async (rover) => {
      const T = await import('/node_modules/.vite/deps/three_webgpu.js');
      const g = window.__voidRunner,
        actor = rover ? g.rover.group : g.enemies[0].group;
      const box = new T.Box3();
      actor.updateMatrixWorld(true);
      actor.traverse((o) => {
        if (o.isMesh && o.visible && o !== actor.userData.tractorBeam)
          box.union(new T.Box3().setFromObject(o));
      });
      const points = [];
      for (const x of [box.min.x, box.max.x])
        for (const y of [box.min.y, box.max.y])
          for (const z of [box.min.z, box.max.z])
            points.push(new T.Vector3(x, y, z).project(g.camera));
      const xs = points.map((p) => (p.x + 1) * 720),
        ys = points.map((p) => (1 - p.y) * 450);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    }, rover);
  const measureActor = async (shot, rover = false) => {
    const bounds = await actorBounds(rover);
    await page.evaluate((rover) => {
      const g = window.__voidRunner,
        actor = rover ? g.rover.group : g.enemies[0].group;
      window.__hiddenMeshes = [];
      actor.traverse((o) => {
        if (o.isMesh) {
          window.__hiddenMeshes.push([o, o.visible]);
          o.visible = false;
        }
      });
    }, rover);
    try {
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      return await measure(shot, bounds, await page.screenshot());
    } finally {
      await page.evaluate(() => {
        for (const [mesh, visible] of window.__hiddenMeshes) mesh.visible = visible;
        delete window.__hiddenMeshes;
      });
    }
  };
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(gameUrl({ renderer: 'webgl' }));
  await expect(page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })).toBeEnabled({
    timeout: 120000,
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `test-results/asset-pass/${stage}-title.png` });
  await page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true }).click();
  const stageScene = async (biome, x) => {
    await page.evaluate(
      async ({ biome, x }) => {
        const g = window.__voidRunner;
        const { baseHeight, SECTOR_LENGTH } = await import('/src/game/rules.ts');
        g.step = () => {};
        g.clearEntities();
        g.audio.enabled = false;
        g.invulnerable = 999;
        g.body.setTranslation({ x, y: baseHeight(x) + 1.5, z: 0 }, true);
        g.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        g.current.set(x, baseHeight(x) + 1.5, 0);
        g.previous.copy(g.current);
        g.state.biome = biome;
        g.state.distance = x;
        g.state.sector = Math.min(25, Math.floor(x / SECTOR_LENGTH));
        g.state.hull = 100;
        g.state.warning = '';
        g.state.notice = '';
        g.state.radar = [];
        g.terrain.update(x);
        g.hazards.reset();
        g.hazards.stream(x);
        g.lighting.update(biome, g.current, 100);
        g.emit();
      },
      { biome, x },
    );
  };
  for (const [biome, x] of [32, 1200, 2300, 3400, 4500].entries()) {
    await stageScene(biome, x);
    await page.waitForTimeout(800);
    results.push(
      await page.evaluate(() => {
        const g = window.__voidRunner;
        return {
          biome: g.state.biome,
          draws: g.renderer.info.render.drawCalls,
          triangles: g.renderer.info.render.triangles,
          memory: { ...g.renderer.info.memory },
        };
      }),
    );
    const shot = await page.screenshot({
      path: `test-results/asset-pass/${stage}-biome-${biome}.png`,
    });
    contrast.push({ kind: 'rover', biome, ...(await measureActor(shot, true)) });
  }
  for (const kind of [
    'drone',
    'bomber',
    'hunter',
    'interceptor',
    'skimmer',
    'leech',
    'mine',
    'rock',
    'boss',
  ]) {
    for (const [biome, x] of [32, 1200, 2300, 3400, 4500].entries()) {
      await stageScene(biome, x);
      await page.evaluate(
        ({ kind, x }) => {
          const g = window.__voidRunner;
          const airborne = ['drone', 'bomber', 'hunter', 'interceptor', 'boss'].includes(kind);
          g.spawn(
            kind,
            x + 20,
            airborne ? 10 : g.terrain.heightAt(x + 20) + (kind === 'mine' ? 1.15 : 1.4),
          );
        },
        { kind, x },
      );
      await page.waitForTimeout(700);
      const shot = await page.screenshot({
        path: `test-results/asset-pass/${stage}-ingame-${kind}${biome ? '-biome-' + biome : ''}.png`,
      });
      contrast.push({ kind, biome, ...(await measureActor(shot)) });
    }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `test-results/asset-pass/${stage}-scenes.json`,
    JSON.stringify({ results, contrast, errors, provenance }, null, 2),
  );
  // A coarse regression gate for crushed-black art, not a human readability score.
  assert.deepEqual(await assetProvenance(), provenance, 'Source changed during capture');
  for (const sample of contrast) {
    assert(sample.visiblePixels > 40, `${sample.kind} biome ${sample.biome}: no visible actor`);
    assert(sample.actor.p90 > 0.04, `${sample.kind} biome ${sample.biome}: actor crushed to black`);
    if (sample.kind === 'interceptor')
      assert(sample.bounds.h >= 25, 'Interceptor side profile collapsed');
  }
  console.log(JSON.stringify({ stage, results, errors }));
} finally {
  await browser.close();
}
