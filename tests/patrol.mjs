import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

await fs.mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
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
    await page.screenshot({ path: `test-results/patrol-${mode}-menu.png` });
    await page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true }).click();
    const outcome = await page.evaluate(async () => {
      const g = window.__voidRunner;

      const step = g.step.bind(g);
      g.step = () => {};
      const none = { brake: false, boost: false, jump: false, fire: false, vent: false, pitch: 0 };
      const run = (target, damage = false) => {
        g.start();
        g.spawnAt = Infinity;
        g.nextReport = 26;
        for (const e of g.enemies) g.enemyModels.release(e.group);
        g.enemies.length = 0;
        g.invulnerable = 0;
        const takeoff = target === 'rock' ? 61 : 94;
        g.body.setTranslation(
          { x: takeoff - 9, y: g.terrain.heightAt(takeoff - 9) + 1.5, z: 0 },
          true,
        );
        g.body.setLinvel({ x: 20, y: 0, z: 0 }, true);
        g.current.copy(g.body.translation());
        g.previous.copy(g.current);
        if (target === 'rock') g.spawn('rock', 75, g.terrain.heightAt(75) + 1);
        let jumped = false,
          banked = '',
          hurt = false,
          airborne = false;
        for (let i = 0; i < 240 && g.state.phase === 'playing'; i++) {
          const jump = !jumped && g.current.x >= takeoff;
          if (jump) jumped = true;
          step({ ...none, jump });
          airborne ||= g.launched;
          if (damage && airborne && !hurt) {
            g.hurt(1);
            hurt = true;
          }
          if (g.state.notice.includes('CLEARANCE')) banked = g.state.notice;
          if (jumped && airborne && !g.launched) break;
        }
        return {
          banked,
          hull: g.state.hull,
          clean: g.state.clean,
          distance: g.current.x,
          airborne,
          score: g.state.score,
        };
      };
      const rock = run('rock'),
        gap = run('gap'),
        damaged = run('rock', true);
      g.start();
      g.step = () => {};
      g.spawnAt = Infinity;
      for (const e of g.enemies) g.enemyModels.release(e.group);
      g.enemies.length = 0;
      g.current.set(20, 2, 0);
      g.previous.copy(g.current);
      g.body.setTranslation({ x: 20, y: 2, z: 0 }, true);
      for (const [kind, x, y] of [
        ['drone', 27, 13],
        ['bomber', 40, 14],
        ['hunter', 56, 10],
        ['interceptor', 69, 17],
        ['rock', 32, 1.5],
        ['mine', 44, 1.5],
        ['skimmer', 57, 1],
        ['leech', 68, 1],
      ])
        g.spawn(kind, x, y);
      const bomber = g.enemies.find((e) => e.kind === 'bomber');
      bomber.timer = 2;
      g.updateEnemies(0, false);
      const warning = bomber.group.userData.warningLight.emissiveIntensity;
      g.updateEnemies(0.41, false);
      const bombs = g.shots.filter((s) => s.active && s.enemy).length;
      const hunter = g.enemies.find((e) => e.kind === 'hunter');
      g.current.x = hunter.x;
      g.updateEnemies(0, false);
      const tractorActive = hunter.group.userData.tractorBeam.material.opacity;
      g.updateEnemies(0, true);
      const tractorEscaped = hunter.group.userData.tractorBeam.material.opacity;
      for (const e of g.enemies) g.enemyModels.release(e.group);
      g.enemies.length = 0;
      for (const shot of g.shots) {
        shot.active = false;
        shot.mesh.visible = false;
      }
      for (const particle of g.particles) particle.life = 0;
      for (const [kind, x, y] of [
        ['drone', 29, 9],
        ['bomber', 40, 11],
        ['hunter', 51, 9],
        ['interceptor', 61, 12],
        ['rock', 32, 1.5],
        ['mine', 41, 1.5],
        ['skimmer', 50, 1],
        ['leech', 60, 1],
      ])
        g.spawn(kind, x, y);
      g.current.set(20, 2, 0);
      g.state.distance = 20;
      g.state.notice = 'PATROL FIELD GUIDE · IDENTIFY THE THREAT';
      g.emit();
      return {
        backend: g.state.backend,
        rock,
        gap,
        damaged,
        warning,
        bombs,
        tractorActive,
        tractorEscaped,
      };
    });
    console.log(mode, outcome);
    assert(outcome.rock.banked.includes('100'), 'safe rock jump must bank +100');
    assert.equal(outcome.rock.hull, 100);
    assert(outcome.gap.banked.includes('50'), 'safe gap jump must bank +50');
    assert.equal(outcome.gap.hull, 100);
    assert.equal(outcome.damaged.banked, '');
    assert.equal(outcome.damaged.hull, 99);
    assert(outcome.warning > 2);
    assert(outcome.bombs >= 1);
    assert(outcome.tractorActive > outcome.tractorEscaped);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/patrol-${mode}-threats.png` });
    await page.evaluate(async () => {
      const g = window.__voidRunner;

      for (const e of g.enemies) g.enemyModels.release(e.group);
      g.enemies.length = 0;
      g.spawn('boss', 45, 13);
      g.state.boss = 100;
      g.state.notice = 'MOTHERSHIP · DESTROY THE CORE';
      g.emit();
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `test-results/patrol-${mode}-boss.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/patrol-${mode}-mobile-gameplay.png` });
    await page.getByRole('button', { name: 'Flight manual', exact: true }).click();
    assert(await page.getByText(/PATROL CLEARANCE: JUMP ROCKS/).isVisible());
    await page.getByRole('button', { name: 'UNDERSTOOD' }).scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/patrol-${mode}-mobile.png` });
    await page.getByRole('button', { name: 'UNDERSTOOD' }).click();
    assert.deepEqual(errors, []);
    results.push({ ...outcome, errors });
    await page.close();
  }
  await fs.writeFile('test-results/patrol.json', JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
