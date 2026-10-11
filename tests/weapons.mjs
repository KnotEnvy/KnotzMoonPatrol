import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

await fs.mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
const frames = (page, count = 6) =>
  page.evaluate(
    (count) =>
      new Promise((resolve) => {
        const tick = () => (--count > 0 ? requestAnimationFrame(tick) : resolve());
        requestAnimationFrame(tick);
      }),
    count,
  );
try {
  for (const mode of ['webgpu', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(
      'http://127.0.0.1:5173/?quality=balanced' + (mode === 'webgl' ? '&renderer=webgl' : ''),
    );
    await page
      .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
      .waitFor({ timeout: 90000 });
    await page.getByRole('button', { name: 'CONFIGURE ROVER' }).click();
    await page.getByRole('button', { name: /Resonance Beam/ }).click();
    await page.getByRole('button', { name: /Tachyon Railgun/ }).click();
    await page.getByRole('button', { name: 'CONFIRM LOADOUT' }).click();
    await page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true }).click();
    const beam = await page.evaluate(() => {
      const g = window.__voidRunner;
      const step = g.step.bind(g);
      const none = { brake: false, boost: false, jump: false, fire: false, vent: false, pitch: 0 };
      window.__weaponPark = (ground = 'beam', sky = 'rail') => {
        g.start({ ground, sky });
        g.invulnerable = 999;
        g.spawnAt = Infinity;
        g.nextReport = 26;
        g.step = () => {};
        window.__weaponTick = (input = {}) => {
          g.body.setTranslation({ x: 20, y: 2, z: 0 }, true);
          g.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          g.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
          g.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          g.current.set(20, 2, 0);
          g.previous.copy(g.current);
          step({ ...none, ...input });
        };
      };
      window.__weaponPark();
      g.spawn('rock', 34, 2.3);
      g.spawn('rock', 44, 2.3);
      const first = g.enemies[0],
        behind = g.enemies[1];
      window.__beamRock = first;
      for (let i = 0; i < 20; i++) window.__weaponTick({ fire: true });
      g.emit();
      return {
        frontHp: first.hp,
        melt: first.melt,
        scale: first.group.scale.y,
        behindHp: behind.hp,
        heat: g.state.heat,
        active: g.beam.active,
        length: g.beam.length,
        shots: g.shots.filter((s) => s.active).length,
      };
    });
    assert(beam.frontHp < 3 && beam.frontHp > 0);
    assert(beam.melt > 0 && beam.scale < 1);
    assert.equal(beam.behindHp, 3);
    assert(beam.active && beam.length < 15 && beam.heat > 0);
    assert.equal(beam.shots, 0);
    await frames(page);
    await page.screenshot({
      path: `test-results/weapons-${mode}-beam.jpg`,
      type: 'jpeg',
      quality: 80,
    });
    const melt = await page.evaluate(() => {
      const g = window.__voidRunner;
      for (let i = 0; i < 12; i++) window.__weaponTick({ fire: true });
      const result = {
        melted: window.__beamRock.melted,
        hp: window.__beamRock.hp,
        debris: g.particles.filter((p) => p.life > 0).length,
        pools: g.weaponEffects.pools.filter((p) => p.life > 0).length,
      };
      window.__weaponTick();
      result.released = !g.beam.active;
      g.emit();
      return result;
    });
    assert(melt.melted && melt.hp <= 0 && melt.released);
    assert.equal(melt.debris, 0);
    assert.equal(melt.pools, 1);
    await frames(page);
    await page.screenshot({
      path: `test-results/weapons-${mode}-slag.jpg`,
      type: 'jpeg',
      quality: 80,
    });
    const heat = await page.evaluate(() => {
      const g = window.__voidRunner;
      window.__weaponPark();
      let ticks = 0;
      while (!g.state.lockout && ticks++ < 240) window.__weaponTick({ fire: true });
      const locked = {
        ticks,
        lockout: g.state.lockout,
        beam: g.beam.active,
        charge: g.state.railCharge,
      };
      for (let i = 0; i < 190; i++) window.__weaponTick({ vent: true });
      window.__weaponTick({ fire: true });
      return { locked, recovered: g.beam.active && g.state.lockout === 0 };
    });
    assert(heat.locked.lockout > 0 && heat.locked.ticks < 240);
    assert.equal(heat.locked.beam, false);
    assert.equal(heat.locked.charge, 0);
    assert(heat.recovered);
    const rail = await page.evaluate(() => {
      const g = window.__voidRunner;
      window.__weaponPark('pulse', 'rail');
      for (let i = 0; i < 52; i++) window.__weaponTick({ fire: true });
      g.spawn('drone', 19.4, 8);
      g.spawn('drone', 19.4, 13);
      g.spawn('drone', 31, 9);
      const targets = g.enemies.slice();
      const charge = g.state.railCharge,
        before = targets.map((e) => e.hp);
      window.__weaponTick();
      g.emit();
      return {
        charge,
        before,
        after: targets.map((e) => e.hp),
        kills: g.state.kills,
        flash: g.railFlash.life,
        railShots: g.shots.filter((s) => s.active && s.type === 'rail').length,
      };
    });
    assert.equal(rail.charge, 1);
    assert.equal(rail.kills, 2);
    assert(rail.after[0] <= 0 && rail.after[1] <= 0 && rail.after[2] === 2);
    assert(rail.flash > 0);
    assert.equal(rail.railShots, 0);
    await frames(page);
    await page.screenshot({
      path: `test-results/weapons-${mode}-rail.jpg`,
      type: 'jpeg',
      quality: 80,
    });
    const partial = await page.evaluate(() => {
      const g = window.__voidRunner;
      const damage = [];
      for (const ticks of [30, 52]) {
        window.__weaponPark('pulse', 'rail');
        for (let i = 0; i < ticks; i++) window.__weaponTick({ fire: true });
        g.spawn('drone', 19.4, 8);
        const target = g.enemies[0];
        target.hp = 50;
        target.maxHp = 50;
        window.__weaponTick();
        damage.push(50 - target.hp);
      }
      return damage;
    });
    assert(partial[0] > 3 && partial[0] < partial[1]);
    assert.equal(partial[1], 10);
    const occlusion = await page.evaluate(() => {
      const g = window.__voidRunner;
      window.__weaponPark();
      g.terrain.heightAt = (x) => (x >= 28 && x <= 31 ? 5 : 0);
      g.body.setTranslation({ x: 20, y: 2, z: 0 }, true);
      g.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      g.spawn('rock', 34, 2.3);
      const target = g.enemies[0];
      for (let i = 0; i < 60; i++) g.fire({ fire: true, vent: false }, 1 / 60);
      return { hp: target.hp, length: g.beam.length };
    });
    assert.equal(occlusion.hp, 3);
    assert(occlusion.length < 6);
    const safety = await page.evaluate(() => {
      const g = window.__voidRunner;
      const cases = [];
      for (const action of ['vent', 'pause', 'blur', 'death', 'report']) {
        window.__weaponPark();
        for (let i = 0; i < 30; i++) window.__weaponTick({ fire: true });
        if (action === 'vent') window.__weaponTick({ vent: true });
        if (action === 'pause') g.pause();
        if (action === 'blur') window.dispatchEvent(new Event('blur'));
        if (action === 'death') {
          g.invulnerable = 0;
          g.hurt(100);
        }
        if (action === 'report') g.checkpoint();
        cases.push({
          action,
          charge: g.state.railCharge,
          beam: g.beam.active,
          flash: g.railFlash.life,
        });
      }
      window.__weaponPark('pulse', 'rail');
      for (let i = 0; i < 6; i++) window.__weaponTick({ fire: true });
      window.__weaponTick();
      const tap = g.railFlash.life;
      window.__weaponPark('pulse', 'rail');
      for (let i = 0; i < 30; i++) window.__weaponTick({ fire: true });
      g.state.lockout = 3;
      window.__weaponTick();
      return { cases, tap, lockoutCharge: g.state.railCharge, lockoutFlash: g.railFlash.life };
    });
    assert(safety.cases.every((c) => c.charge === 0 && !c.beam && c.flash === 0));
    assert.equal(safety.tap, 0);
    assert.equal(safety.lockoutCharge, 0);
    assert.equal(safety.lockoutFlash, 0);
    const core = await page.evaluate(async () => {
      const g = window.__voidRunner;
      const { HAZARDS } = await import('/src/game/route.ts');
      const def = HAZARDS.find((h) => h.kind === 'crystal');
      window.__weaponPark();
      g.terrain.update(def.x);
      g.hazards.stream(def.x);
      const h = g.hazards.active.get(def.id),
        x = def.x - 15;
      g.body.setTranslation({ x, y: h.y + 0.4, z: 0 }, true);
      g.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      g.current.set(x, h.y + 0.4, 0);
      g.previous.copy(g.current);
      for (let i = 0; i < 70 && h.phase !== 'spent'; i++)
        g.fire({ fire: true, vent: false }, 1 / 60);
      return { hp: h.hp, phase: h.phase };
    });
    assert.equal(core.phase, 'spent');
    assert(core.hp <= 0);
    await page.evaluate(() => {
      window.__weaponPark();
      for (let i = 0; i < 52; i++) window.__weaponTick({ fire: true });
      window.__voidRunner.emit();
    });
    await frames(page);
    assert.equal(
      await page.getByRole('progressbar', { name: 'Tachyon charge' }).getAttribute('aria-valuenow'),
      '100',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await frames(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await page.screenshot({
      path: `test-results/weapons-${mode}-mobile.jpg`,
      type: 'jpeg',
      quality: 80,
    });
    // Real keyboard release, focus loss, and touch controls use the shared input path.
    await page.evaluate(() => {
      const g = window.__voidRunner;
      g.menu();
    });
    await page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true }).click();
    await page.evaluate(() => {
      const g = window.__voidRunner;
      g.step = Object.getPrototypeOf(g).step.bind(g);
      g.invulnerable = 999;
      g.spawnAt = Infinity;
    });
    await page.keyboard.down('KeyJ');
    await page.waitForFunction(() => window.__voidRunner.state.railCharge > 0.3);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__voidRunner.state.railCharge), 0);
    await page.keyboard.up('KeyJ');
    await page.getByRole('button', { name: 'RESUME EXPEDITION' }).click();
    await page.keyboard.down('KeyJ');
    await page.waitForFunction(() => window.__voidRunner.state.railCharge >= 1);
    await page.keyboard.up('KeyJ');
    await page.waitForFunction(() => window.__voidRunner.railFlash.life > 0);
    const input = await page.evaluate(() => ({
      phase: window.__voidRunner.state.phase,
      charge: window.__voidRunner.state.railCharge,
    }));
    assert.equal(input.charge, 0);
    await page.evaluate(() => {
      const g = window.__voidRunner;
      g.start({ ground: 'beam', sky: 'rail' });
      g.invulnerable = 999;
      g.spawnAt = Infinity;
    });
    const fireButton = page.getByRole('button', { name: 'FIRE', exact: true });
    const bounds = await fireButton.boundingBox();
    assert(bounds);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.waitForFunction(() => window.__voidRunner.state.railCharge >= 1);
    await page.mouse.up();
    await page.waitForFunction(() => window.__voidRunner.railFlash.life > 0);
    input.touchRelease = true;
    await page.evaluate(() => {
      const g = window.__voidRunner;
      g.start({ ground: 'beam', sky: 'rail' });
      g.invulnerable = 999;
      g.spawnAt = Infinity;
    });
    await page.mouse.down();
    await page.waitForFunction(() => window.__voidRunner.state.railCharge > 0.3);
    await fireButton.dispatchEvent('pointercancel', { pointerId: 1 });
    await page.mouse.up();
    await frames(page, 3);
    assert.equal(await page.evaluate(() => window.__voidRunner.state.railCharge), 0);
    assert.equal(await page.evaluate(() => window.__voidRunner.railFlash.life), 0);
    input.touchCancel = true;
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.__voidRunner.menu());
    await frames(page, 12);
    const before = await page.evaluate(() => ({ ...window.__voidRunner.renderer.info.memory }));
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => {
        window.__voidRunner.start();
        window.__voidRunner.menu();
      });
      await frames(page, 6);
    }
    const after = await page.evaluate(() => ({ ...window.__voidRunner.renderer.info.memory }));
    assert(after.geometries <= before.geometries);
    assert(after.textures <= before.textures);
    results.push({
      mode,
      beam,
      melt,
      heat,
      rail,
      partial,
      occlusion,
      safety,
      core,
      input,
      before,
      after,
      errors,
    });
    console.log('WEAPONS PASS', JSON.stringify(results.at(-1)));
    await page.close();
  }
  await fs.writeFile('test-results/weapons-results.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
