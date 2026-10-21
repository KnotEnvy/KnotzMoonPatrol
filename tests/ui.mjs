import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { gameUrl, launchBrowser } from './helpers/browser.mjs';

// Exercise menu input, modal handoff, and crowded HUD states at actual viewport sizes.
await fs.mkdir('test-results', { recursive: true });
const browser = await launchBrowser();
const errors = [],
  results = [];
const sizes = [
  [1440, 900],
  [390, 844],
  [320, 568],
  [601, 800],
  [700, 600],
  [844, 390],
  [1920, 1080],
];
const intersects = (a, b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(gameUrl({ renderer: 'webgl' }));
  const launch = page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true });
  await expect(launch).toBeEnabled({ timeout: 90000 });
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(700);
    const title = await page.evaluate(() => {
      const box = (n) => {
        const r = n.getBoundingClientRect();
        return {
          label: n.textContent,
          ...Object.fromEntries(
            ['x', 'y', 'right', 'bottom', 'width', 'height'].map((k) => [k, r[k]]),
          ),
        };
      };
      const visible = (n) => n && getComputedStyle(n).display !== 'none';
      return {
        menu: [...document.querySelectorAll('.title-menu button')].map(box),
        // Title furniture that must never cover a menu option.
        furniture: [
          ...document.querySelectorAll('.title-record, .title-footer, .game-title, .game-tools'),
        ]
          .filter(visible)
          .map(box),
        title: box(document.querySelector('h1')),
        canvas: box(document.querySelector('canvas')),
        scroll: document.documentElement.scrollWidth,
      };
    });
    assert.equal(title.scroll, width);
    assert.equal(title.canvas.width, width);
    assert.equal(title.canvas.height, height);
    assert(title.title.x >= 0 && title.title.right <= width, 'Title wordmark clipped');
    assert.equal(title.menu.length, 4);
    for (const b of title.menu) {
      assert(b.height >= 42 && b.y >= 0 && b.bottom <= height, 'Menu inaccessible');
      for (const item of title.furniture)
        assert(
          !intersects(b, item),
          'Title furniture covers main menu: ' + JSON.stringify({ width, height, b, item }),
        );
    }
    await page.screenshot({ path: `test-results/ui-title-${width}.png` });
    results.push({ width, height, title });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('body').click({ position: { x: 700, y: 850 } });
  await page.keyboard.press('ArrowDown');
  await expect(launch).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: 'Flight manual', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Flight manual', exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => window.__voidRunner.state.phase), 'menu');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  // Focus returns to the opener; WASD mirrors the arrows and the cursor follows focus.
  await expect(page.getByRole('button', { name: 'Flight manual', exact: true })).toBeFocused();
  await page.keyboard.press('KeyW');
  await expect(page.getByRole('button', { name: 'Graphics settings', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Graphics settings', exact: true })).toHaveClass(
    /is-selected/,
  );
  await page.keyboard.press('KeyS');
  await expect(page.getByRole('button', { name: 'Flight manual', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'CONFIGURE ROVER', exact: true }).click();
  await page.getByRole('button', { name: /Resonance Beam/ }).click();
  await page.getByRole('button', { name: /Tachyon Railgun/ }).click();
  await page.getByRole('button', { name: 'CONFIRM LOADOUT' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.locator('body').click({ position: { x: 700, y: 850 } });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__voidRunner.state.phase === 'playing');
  assert.deepEqual(await page.evaluate(() => window.__voidRunner.loadout), {
    ground: 'beam',
    sky: 'rail',
  });
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: 'GRAPHICS', exact: true }).click();
  await page.waitForTimeout(600);
  assert(
    await page.evaluate(
      () =>
        document.activeElement.closest('[role="dialog"]')?.getAttribute('aria-label') ===
        'Graphics',
    ),
    'Modal handoff lost focus',
  );
  for (const key of ['Tab', 'Shift+Tab', 'Tab', 'Tab']) {
    await page.keyboard.press(key);
    assert(
      await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')),
      'Focus escaped Graphics',
    );
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'RESUME EXPEDITION' }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.evaluate(() => {
    const g = window.__voidRunner;
    g.step = () => {};
    g.clearEntities();
    g.audio.enabled = false;
    g.body.setTranslation({ x: 85, y: 2, z: 0 }, true);
    g.current.set(85, 2, 0);
    g.previous.copy(g.current);
    g.state.distance = 85;
    g.state.speed = 20;
    g.state.score = 12450;
    g.state.best = 38400;
    g.state.hull = 23;
    g.state.heat = 100;
    g.state.capacitor = 46;
    g.state.lockout = 2.5;
    g.state.railCharge = 0.73;
    g.state.warning = 'THERMAL LOCKOUT · VENT CORE';
    g.state.notice = 'CHECKPOINT RECOVERY · ROVER REPAIRED · SCORE RESTORED';
    g.spawn('bomber', 102, 12);
    g.spawn('drone', 94, 10);
    g.emit();
  });
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(700);
    const layout = await page.evaluate(() => {
      const box = (n) => {
        const r = n.getBoundingClientRect();
        return {
          label: n.className,
          ...Object.fromEntries(
            ['x', 'y', 'right', 'bottom', 'width', 'height'].map((k) => [k, r[k]]),
          ),
          clipped: n.scrollWidth > n.clientWidth + 1,
        };
      };
      return {
        panels: [
          ...document.querySelectorAll(
            '.scoreboard,.route,.telemetry,.weapon-status,.speed,.game-tools,.notice,.warning-banner,.touch-controls',
          ),
        ]
          .filter((n) => getComputedStyle(n).display !== 'none')
          .map(box),
        buttons: [...document.querySelectorAll('.touch-controls button')].map(box),
        radar: [...document.querySelectorAll('.threat-marker')].map(box),
        aircraft: window.__voidRunner.enemies
          .filter((e) => ['drone', 'bomber'].includes(e.kind))
          .map((e) => {
            const g = window.__voidRunner;
            e.group.updateMatrixWorld(true);
            const points = [];
            e.group.traverse((o) => {
              if (!o.geometry) return;
              o.geometry.computeBoundingBox();
              const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
              for (const x of [b.min.x, b.max.x])
                for (const y of [b.min.y, b.max.y])
                  for (const z of [b.min.z, b.max.z]) {
                    const p = g.current.clone().set(x, y, z).project(g.camera);
                    points.push({
                      x: ((p.x + 1) * innerWidth) / 2,
                      y: ((1 - p.y) * innerHeight) / 2,
                    });
                  }
            });
            return {
              kind: e.kind,
              x: Math.min(...points.map((p) => p.x)),
              right: Math.max(...points.map((p) => p.x)),
              y: Math.min(...points.map((p) => p.y)),
              bottom: Math.max(...points.map((p) => p.y)),
            };
          }),
        criticalColor: getComputedStyle(document.querySelector('.hull > b')).color,
        scroll: document.documentElement.scrollWidth,
      };
    });
    assert.equal(layout.scroll, width);
    assert.equal(layout.criticalColor, 'rgb(255, 142, 127)');
    for (const b of layout.panels) {
      assert(
        b.x >= 0 && b.right <= width + 1 && b.y >= 0 && b.bottom <= height + 1,
        `HUD outside viewport: ${JSON.stringify({ width, height, b })}`,
      );
      assert(!b.clipped, `HUD text clipped: ${JSON.stringify({ width, height, b })}`);
    }
    for (let i = 0; i < layout.panels.length; i++)
      for (const b of layout.panels.slice(i + 1))
        assert(
          !intersects(layout.panels[i], b),
          `HUD overlap: ${JSON.stringify({ width, height, a: layout.panels[i], b })}`,
        );
    assert(layout.radar.length > 0, 'Threat cues disappeared');
    for (const cue of layout.radar)
      for (const panel of layout.panels)
        assert(
          !intersects(cue, panel),
          'Threat covers instrument: ' + JSON.stringify({ width, height, cue, panel }),
        );
    assert.equal(layout.aircraft.length, 2);
    for (const actor of layout.aircraft)
      for (const panel of [...layout.panels, ...layout.radar])
        assert(
          !intersects(actor, panel),
          'Aircraft obscured: ' + JSON.stringify({ width, height, actor, panel }),
        );
    if (width <= 600 || height <= 500)
      for (const b of layout.buttons)
        assert(b.width >= 44 && b.height >= 44, 'Touch target too small');
    await page.screenshot({ path: `test-results/ui-active-${width}.png` });
    results.find((r) => r.width === width).active = layout;
  }
  await fs.writeFile('test-results/ui-results.json', JSON.stringify({ results, errors }, null, 2));
  assert.deepEqual(errors, []);
  console.log(
    'UI PASS',
    JSON.stringify({
      sizes,
      menuKeyboard: true,
      selectedLoadoutEnter: true,
      modalFocus: true,
      criticalHealth: true,
      errors,
    }),
  );
} finally {
  await browser.close();
}
