import { gameUrl, launchBrowser } from './helpers/browser.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

await fs.mkdir('test-results', { recursive: true });
const browser = await launchBrowser();
const results = [];
const frames = (page, count = 12) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const tick = () => (--count > 0 ? requestAnimationFrame(tick) : resolve());
        requestAnimationFrame(tick);
      }),
    count,
  );
try {
  for (const mode of process.env.BACKEND ? [process.env.BACKEND] : ['webgpu', 'webgl']) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(gameUrl({ renderer: mode === 'webgl' ? 'webgl' : undefined }), {
      waitUntil: 'domcontentloaded',
    });
    await page
      .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
      .waitFor({ timeout: 90000 });
    assert.equal(
      await page.evaluate(() => window.__voidRunner.state.backend),
      mode === 'webgl' ? 'WEBGL 2' : 'WEBGPU',
    );
    await page.getByRole('button', { name: 'Graphics settings', exact: true }).click();
    const presets = [];
    for (const quality of ['performance', 'balanced', 'cinematic']) {
      await page.getByRole('button', { name: new RegExp('^' + quality, 'i') }).click();
      await frames(page);
      const settings = await page.evaluate(() => {
        const g = window.__voidRunner;
        return {
          quality: g.state.quality,
          bloom: g.graphics.bloomEnabled,
          ratio: g.renderer.getPixelRatio(),
          shadows: g.renderer.shadowMap.enabled,
          drawCalls: g.renderer.info.render.drawCalls,
        };
      });
      assert.equal(settings.quality, quality);
      assert.equal(settings.ratio, { performance: 1, balanced: 1.25, cinematic: 1.75 }[quality]);
      assert.equal(settings.bloom, mode === 'webgpu' && quality === 'cinematic');
      assert.equal(settings.shadows, mode === 'webgpu' && quality !== 'performance');
      assert(settings.drawCalls > 0);
      presets.push(settings);
    }
    // Repeated graph teardown must release HDR/bloom targets instead of accumulating them.
    const balanced = page.getByRole('button', { name: /^Balanced/ });
    const cinematic = page.getByRole('button', { name: /^Cinematic/ });
    await balanced.click();
    await frames(page);
    const before = await page.evaluate(() => ({ ...window.__voidRunner.renderer.info.memory }));
    for (let i = 0; i < 4; i++) {
      await cinematic.click();
      await frames(page);
      await balanced.click();
      await frames(page);
    }
    const after = await page.evaluate(() => ({ ...window.__voidRunner.renderer.info.memory }));
    assert(
      after.textures <= before.textures + 2,
      'Post-processing textures accumulated across switches',
    );
    assert(
      after.geometries <= before.geometries + 2,
      'Post-processing geometry accumulated across switches',
    );
    await cinematic.click();
    await page.getByRole('button', { name: 'DONE', exact: true }).click();
    await page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true }).click();
    await page.keyboard.down('ShiftLeft');
    await page.waitForFunction(() => {
      const g = window.__voidRunner;
      return g.state.capacitor < 98;
    });
    const boost = await page.evaluate(() => {
      const g = window.__voidRunner;
      return {
        fov: g.camera.fov,
        fringe: g.graphics.fringe.value,
        bloom: g.graphics.bloomEnabled,
        roverScreenX: g.current.clone().project(g.camera).x,
      };
    });
    assert.equal(boost.fov, 48);
    assert(boost.roverScreenX < 0);
    assert.equal(boost.fringe, 0, 'Boost must not distort the lens');
    await page.screenshot({
      path: `test-results/graphics-${mode}-boost.jpg`,
      type: 'jpeg',
      quality: 82,
    });
    await page.keyboard.up('ShiftLeft');
    const biomes = [];
    for (const [biome, x] of [32, 1200, 2300, 3400, 4500].entries()) {
      await page.evaluate((x) => {
        const g = window.__voidRunner;
        g.invulnerable = 999;
        g.nextReport = 26;
        g.director.take(x + 80);
        g.body.setTranslation({ x, y: 3, z: 0 }, true);
        g.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        g.current.set(x, 3, 0);
        g.previous.copy(g.current);
      }, x);
      await page.waitForFunction(
        ({ biome, sun }) => {
          const g = window.__voidRunner;
          return (
            g.state.biome === biome &&
            Math.abs(g.light.intensity - sun) < 0.15 &&
            (biome !== 3 || g.lighting.headlight.intensity > 350)
          );
        },
        { biome, sun: [4, 3.5, 2.5, 1.7, 3.2][biome] },
      );
      const surface = await page.evaluate(() => {
        const g = window.__voidRunner,
          material = g.terrain.materials.get(g.state.biome);
        return {
          biome: g.state.biome,
          quality: g.state.quality,
          chunks: g.terrain.chunks.size,
          roughness: material.roughness,
          metalness: material.metalness,
          colorSpace: material.map.colorSpace,
          heightSpace: material.bumpMap.colorSpace,
          separateHeight: material.map !== material.bumpMap,
          sun: g.light.intensity,
          headlight: g.lighting.headlight.intensity,
          castsHeadlightShadow: g.lighting.headlight.castShadow,
        };
      });
      assert.equal(surface.biome, biome);
      assert.equal(surface.quality, 'cinematic');
      assert.equal(surface.colorSpace, 'srgb');
      assert.equal(surface.heightSpace, '');
      assert(surface.separateHeight);
      assert(surface.chunks <= 7);
      assert(!surface.castsHeadlightShadow);
      if (biome === 3) {
        assert(surface.sun > 1.5 && surface.sun < 1.9);
        assert(surface.headlight > 320);
      }
      biomes.push(surface);
      await page.screenshot({
        path: `test-results/graphics-${mode}-biome-${biome}.jpg`,
        type: 'jpeg',
        quality: 82,
      });
    }
    // Settings pause active play; Escape closes settings without resuming or stealing input.
    await page.getByRole('button', { name: 'Graphics settings', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__voidRunner.state.phase), 'paused');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({
      path: `test-results/graphics-${mode}-mobile.jpg`,
      type: 'jpeg',
      quality: 82,
    });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__voidRunner.state.phase), 'paused');
    await page.getByRole('button', { name: 'RESUME EXPEDITION' }).click();
    assert.equal(await page.evaluate(() => window.__voidRunner.state.phase), 'playing');
    // UI-only controlled phases: settings must not stack over another active dialog.
    for (const [phase, title] of [
      ['report', 'Checkpoint secured'],
      ['dead', 'Rover destroyed'],
      ['complete', 'Expedition complete'],
    ]) {
      await page.evaluate((phase) => {
        const g = window.__voidRunner;
        g.state.phase = phase;
        g.emit();
      }, phase);
      const panel = page.getByRole('dialog', { name: title, exact: true });
      await panel.waitFor({ state: 'visible' });
      await panel.getByRole('button', { name: 'Graphics settings', exact: true }).click();
      await page.getByRole('dialog', { name: title }).waitFor({ state: 'detached' });
      assert.equal(await page.getByRole('dialog').count(), 1);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Graphics' }).waitFor({ state: 'detached' });
      await page.getByRole('dialog', { name: title }).waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => window.__voidRunner.state.phase), phase);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page
      .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
      .waitFor({ timeout: 90000 });
    assert.equal(await page.evaluate(() => window.__voidRunner.state.quality), 'cinematic');
    assert.deepEqual(errors, []);
    results.push({ mode, presets, before, after, boost, biomes, errors });
    console.log('GRAPHICS PASS', JSON.stringify(results.at(-1)));
    await page.close();
  }
  await fs.writeFile('test-results/graphics-results.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
