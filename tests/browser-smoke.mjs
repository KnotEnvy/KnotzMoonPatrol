import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('http://127.0.0.1:5173');
  await page
    .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
    .waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/menu.png' });
  await page.getByRole('button', { name: 'CONFIGURE ROVER' }).click();
  await page.getByRole('button', { name: /Tachyon Railgun/ }).click();
  await page.getByRole('button', { name: 'CONFIRM LOADOUT' }).click();
  await page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true }).click();
  await page.waitForTimeout(1700);
  const driving = await page.evaluate(() => ({
    x: window.__voidRunner.state.distance,
    contacts: Array.from({ length: 6 }, (_, i) =>
      window.__voidRunner.vehicle.wheelIsInContact(i),
    ).filter(Boolean).length,
    loadout: window.__voidRunner.loadout,
  }));
  assert(driving.x > 20);
  assert(driving.contacts >= 4);
  assert.equal(driving.loadout.sky, 'rail');
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(650);
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyJ');
  const jump = await page.evaluate(() => ({
    y: window.__voidRunner.body.translation().y,
    heat: window.__voidRunner.state.heat,
    cap: window.__voidRunner.state.capacitor,
  }));
  assert(jump.y > 3);
  assert(jump.heat > 0);
  assert(jump.cap < 100);
  await page.screenshot({ path: 'test-results/gameplay.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__voidRunner.state.phase), 'paused');
  const paused = await page.evaluate(() => window.__voidRunner.state.distance);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__voidRunner.state.distance), paused);
  await page.getByRole('button', { name: 'RESUME EXPEDITION' }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__voidRunner.state.phase), 'playing');
  await page.getByRole('button', { name: 'Flight manual', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__voidRunner.state.phase), 'paused');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__voidRunner.state.phase), 'paused');
  await page.getByRole('button', { name: 'RESUME EXPEDITION' }).click();
  const scenarios = await page
    .evaluate(async () => {
      const g = window.__voidRunner,
        none = { brake: false, boost: false, jump: false, fire: false, vent: false, pitch: 0 };
      g.start();
      g.spawnAt = Infinity;
      const before = g.terrain.heightAt(32);
      const t = performance.now();
      g.terrain.carve(32, before, 5, 4);
      await g.terrain.queue;
      const crater = {
        gpu: g.compute.available,
        before,
        after: g.terrain.heightAt(32),
        ms: performance.now() - t,
      };
      g.world.step();
      const ray = g.world.castRay(
        { origin: { x: 32, y: 20, z: 0 }, dir: { x: 0, y: -1, z: 0 } },
        100,
        true,
      );
      crater.colliderY = ray ? 20 - ray.timeOfImpact : null;
      return crater;
    })
    .catch((e) => ({ error: String(e) }));
  console.log('CRATER', scenarios);
  assert(!scenarios.error);
  assert(scenarios.after < scenarios.before - 3.9);
  assert(Math.abs(scenarios.colliderY - scenarios.after) < 0.05);
  const result = await page.evaluate(() => {
    const g = window.__voidRunner,
      none = { brake: false, boost: false, jump: false, fire: false, vent: false, pitch: 0 };
    g.start();
    g.spawnAt = Infinity;
    g.state.hull = 50;
    g.body.setTranslation({ x: 1099, y: 2, z: 0 }, true);
    g.body.setLinvel({ x: 20, y: 0, z: 0 }, true);
    g.current.set(1099, 2, 0);
    g.previous.copy(g.current);
    for (let i = 0; i < 12 && g.state.phase === 'playing'; i++) g.step(none);
    const checkpoint = { phase: g.state.phase, sector: g.state.sector, bonus: g.state.reportBonus };
    g.continue();
    const serviced = g.state.hull;
    g.start({ ground: 'pulse', sky: 'rail' });
    g.spawnAt = Infinity;
    g.invulnerable = 999;
    g.nextReport = 26;
    g.body.setTranslation({ x: 5680, y: 2, z: 0 }, true);
    g.body.setLinvel({ x: 20, y: 0, z: 0 }, true);
    g.current.set(5680, 2, 0);
    g.previous.copy(g.current);
    let locked = false;
    for (let i = 0; i < 4200 && g.state.phase === 'playing'; i++) {
      g.step({ ...none, fire: true });
      locked ||= g.state.lockout > 0;
    }
    const boss = { hp: g.state.boss, phase: g.state.phase, distance: g.state.distance, locked };
    g.start();
    g.invulnerable = 0;
    g.hurt(100);
    const death = g.state.phase;
    g.start();
    const restart = {
      phase: g.state.phase,
      hull: g.state.hull,
      heat: g.state.heat,
      distance: g.state.distance,
    };
    g.pause();
    return { checkpoint, serviced, boss, death, restart };
  });
  console.log('SCENARIOS', JSON.stringify(result));
  assert.equal(result.checkpoint.phase, 'report');
  assert.equal(result.serviced, 75);
  assert(result.boss.locked);
  assert.equal(result.boss.hp, 0);
  assert.equal(result.boss.phase, 'complete');
  assert.equal(result.death, 'dead');
  assert.equal(result.restart.hull, 100);
  await page.evaluate(() => window.__voidRunner.menu());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(900);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  await page.screenshot({ path: 'test-results/mobile.png' });
  await page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/mobile-gameplay.png' });
  console.log(
    'PASS driving, suspension, jump, hover, loadout, firing, pause, modal input, checkpoint, service, overheat, boss, completion, death, restart, responsive width',
  );
  console.log('ERRORS', errors);
  assert.deepEqual(errors, []);
  await fs.writeFile(
    'test-results/browser-results.json',
    JSON.stringify({ driving, jump, result, scenarios, errors }, null, 2),
  );
} finally {
  await browser.close();
}
