import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
async function capture(page, path) {
  await page.evaluate(() => {
    const g = window.__voidRunner;
    window.__capture = { step: g.step, phase: g.state.phase, invulnerable: g.invulnerable };
    g.step = () => {};
    g.state.phase = 'playing';
    g.invulnerable = 0;
    g.emit();
  });
  await page.locator('.mission-screen').waitFor({ state: 'detached', timeout: 20000 });
  await page.locator('.modal-backdrop').waitFor({ state: 'detached', timeout: 20000 });
  await page.locator('.hud').waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path, type: 'jpeg', quality: 75 });
  await page.evaluate(() => {
    const g = window.__voidRunner,
      saved = window.__capture;
    g.step = saved.step;
    g.state.phase = saved.phase;
    g.invulnerable = saved.invulnerable;
    g.emit();
  });
}
try {
  for (const mode of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto('http://127.0.0.1:5173/' + (mode === 'webgl' ? '?renderer=webgl' : ''));
    await page
      .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
      .waitFor({ timeout: 60000 });
    const setup = await page.evaluate(async () => {
      const { HAZARDS } = await import('/src/game/route.ts');
      window.__testHazards = HAZARDS;
      window.__parkHazard = (kind, lead, invulnerable = 999, ground = 'pulse') => {
        const g = window.__voidRunner,
          def = HAZARDS.find((h) => h.kind === kind);
        g.start({ ground, sky: 'flak' });
        g.spawnAt = Infinity;
        g.nextReport = 26;
        g.invulnerable = invulnerable;
        g.tutorialStage = 2;
        const x = def.x - lead;
        g.terrain.update(x);
        g.hazards.stream(x);
        const y = g.hazards.surfaceHeight(x, g.terrain.heightAt(x)) + 1.8;
        g.body.setTranslation({ x, y, z: 0 }, true);
        g.body.setLinvel({ x: 20, y: 0, z: 0 }, true);
        g.current.set(x, y, 0);
        g.previous.copy(g.current);
        g.camera.position.set(x + 12, 10.2, 34);
        return {
          g,
          def,
          none: { brake: false, boost: false, jump: false, fire: false, vent: false, pitch: 0 },
          h: g.hazards.active.get(def.id),
        };
      };
      return { backend: window.__voidRunner.state.backend };
    });
    const plate = await page.evaluate(() => {
      const { g, def, none, h } = window.__parkHazard('plate', 12);
      let ticks = 0;
      while (h.phase === 'idle' && ticks++ < 240) g.step({ ...none, brake: true });
      const contacts = Array.from(
        { length: 6 },
        (_, i) => g.vehicle.wheelGroundObject(i)?.handle,
      ).filter((x) => x === h.collider?.handle).length;
      const arming = { phase: h.phase, remaining: h.remaining, contacts, position: g.current.x };
      g.pause();
      return arming;
    });
    assert.equal(plate.phase, 'charging');
    assert(plate.contacts > 0);
    assert(plate.remaining > 0.7);
    if (mode === 'webgpu') {
      await capture(page, 'test-results/plate-warning.jpg');
    }
    const collapse = await page.evaluate(() => {
      const g = window.__voidRunner,
        h = [...g.hazards.active.values()].find(
          (h) => h.def.kind === 'plate' && h.phase === 'charging',
        ),
        none = { brake: true, boost: false, jump: false, fire: false, vent: false, pitch: 0 };
      g.state.phase = 'playing';
      let ticks = 0;
      while (h.collider && ticks++ < 65) g.step(none);
      g.world.step();
      const ray = g.world.castRay(
        { origin: { x: h.def.x, y: 20, z: 0 }, dir: { x: 0, y: -1, z: 0 } },
        40,
        true,
        undefined,
        undefined,
        undefined,
        g.body,
      );
      g.pause();
      return {
        ticks,
        collider: !!h.collider,
        phase: h.phase,
        surface: ray ? 20 - ray.timeOfImpact : null,
      };
    });
    console.log('COLLAPSE', mode, collapse);
    assert.equal(collapse.collider, false);
    assert(collapse.surface < -5);
    assert(collapse.ticks <= 49);
    const ordnance = await page.evaluate(() => {
      const results = [];
      for (const type of ['seismic', 'bomb', 'orbital']) {
        const { g, def, h, none } = window.__parkHazard('plate', 18);
        if (type === 'orbital') {
          g.strike(def.x);
          g.strikes[0].timer = 0.001;
        } else g.shoot(type, def.x, h.y + 1, 0, -15, 5, type === 'bomb');
        let ticks = 0;
        while (h.collider && ticks++ < 12) g.step(none);
        results.push({ type, ticks, collider: !!h.collider });
        g.pause();
      }
      return results;
    });
    assert(ordnance.every((o) => !o.collider && o.ticks <= 7));
    const vent = await page.evaluate(() => {
      const { g, h, none } = window.__parkHazard('vent', 30);
      let maxY = g.current.y,
        maxVy = 0;
      for (let i = 0; i < 170; i++) {
        g.step(none);
        maxY = Math.max(maxY, g.current.y);
        maxVy = Math.max(maxVy, g.body.linvel().y);
        if (maxY > 7) break;
      }
      g.pause();
      return { launched: h.launched, maxY, maxVy };
    });
    assert(vent.launched);
    assert(vent.maxVy > 10);
    if (mode === 'webgpu') {
      await capture(page, 'test-results/magma-vent.jpg');
    }
    const crystal = await page.evaluate(() => {
      const { g, h, none } = window.__parkHazard('crystal', 28);
      for (let i = 0; i < 150 && h.hp > 0; i++) g.step({ ...none, fire: true });
      g.pause();
      return { hp: h.hp, phase: h.phase, score: g.state.score };
    });
    assert(crystal.hp <= 0);
    assert.equal(crystal.phase, 'spent');
    assert(crystal.score >= 150);
    const laser = await page.evaluate(() => {
      const { g, h, none } = window.__parkHazard('laser', 28, 0);
      for (let i = 0; i < 140 && g.state.hull === 100; i++) g.step(none);
      g.pause();
      return { phase: h.phase, hull: g.state.hull, remaining: h.remaining };
    });
    assert.equal(laser.hull, 78);
    assert.equal(laser.phase, 'active');
    if (mode === 'webgpu') {
      await capture(page, 'test-results/laser-barrier.jpg');
    }
    const canopy = await page.evaluate(() => {
      const { g, h, def, none } = window.__parkHazard('canopy', 25);
      g.step({ ...none, brake: true });
      g.pause();
      g.world.step();
      const ray = g.world.castRay(
        { origin: { x: def.x, y: 20, z: 0 }, dir: { x: 0, y: -1, z: 0 } },
        40,
        true,
        undefined,
        undefined,
        undefined,
        g.body,
      );
      return { phase: h.phase, solid: !!h.collider, surface: ray ? 20 - ray.timeOfImpact : null };
    });
    assert.equal(canopy.solid, false);
    assert(canopy.surface < -6);
    assert.equal(canopy.phase, 'charging');
    if (mode === 'webgpu') {
      await capture(page, 'test-results/concealed-gap.jpg');
    }
    const gravity = await page.evaluate(() => {
      const { g, h, def, none } = window.__parkHazard('lowGravity', 10);
      g.step({ ...none, jump: true });
      const inside = { gravity: g.world.gravity.y, telemetry: g.state.lowGravity };
      g.pause();
      return { inside, x: def.x };
    });
    assert.equal(gravity.inside.gravity, -3);
    assert.equal(gravity.inside.telemetry, true);
    if (mode === 'webgpu') {
      await capture(page, 'test-results/low-gravity.jpg');
    }
    const after = await page.evaluate((x) => {
      const g = window.__voidRunner;
      g.body.setTranslation({ x: x + 32, y: 5, z: 0 }, true);
      g.current.set(x + 32, 5, 0);
      g.previous.copy(g.current);
      g.state.phase = 'playing';
      g.step({ brake: false, boost: false, jump: false, fire: false, vent: false, pitch: 0 });
      g.pause();
      return { gravity: g.world.gravity.y, low: g.state.lowGravity };
    }, gravity.x);
    assert.equal(after.gravity, -12);
    assert.equal(after.low, false);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      window.__parkHazard('laser', 28);
      window.__voidRunner.step({
        brake: true,
        boost: false,
        jump: false,
        fire: false,
        vent: false,
        pitch: 0,
      });
      window.__voidRunner.pause();
    });
    await page.waitForTimeout(350);
    const radar = await page.evaluate(() => window.__voidRunner.state.radar);
    assert(radar.every((r) => r.x >= 20 && r.x <= 76));
    // Show the scanner for the captured frame without advancing physics.
    await page.evaluate(() => {
      const g = window.__voidRunner;
      g.state.phase = 'playing';
      const original = g.step;
      g.step = () => {};
      g.emit();
      window.__restoreStep = () => {
        g.step = original;
      };
    });
    await page.waitForTimeout(150);
    const boxes = await page.locator('.threat-marker').evaluateAll((elements) =>
      elements.map((e) => {
        const b = e.getBoundingClientRect();
        return { left: b.left, right: b.right };
      }),
    );
    assert(boxes.length > 0);
    assert(boxes.every((b) => b.left >= 0 && b.right <= 390));
    if (mode === 'webgpu')
      await page.screenshot({
        path: 'test-results/mobile-hazard-scanner.jpg',
        type: 'jpeg',
        quality: 75,
      });
    assert.deepEqual(errors, []);
    const result = {
      mode,
      setup,
      plate,
      collapse,
      ordnance,
      vent,
      crystal,
      laser,
      canopy,
      gravity,
      after,
      radar,
      errors,
    };
    results.push(result);
    console.log('HAZARDS PASS', JSON.stringify(result));
    await page.close();
  }
  await fs.writeFile('test-results/hazard-results.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
