import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const external = process.env.PAGES_URL;
const base = new URL(external ?? 'http://127.0.0.1:4173/KnotzMoonPatrol/');
assert(base.pathname.endsWith('/'), 'PAGES_URL must include a trailing slash');
let server, browser;
let serverLog = '';
const errors = [],
  results = [];
try {
  if (!external) {
    await fs.access(path.join(root, 'dist/index.html'));
    server = spawn(
      process.execPath,
      [
        path.join(root, 'node_modules/vite/bin/vite.js'),
        'preview',
        '--mode',
        'pages',
        '--host',
        '127.0.0.1',
        '--port',
        '4173',
        '--strictPort',
      ],
      { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    server.stdout.on('data', (chunk) => {
      serverLog = (serverLog + chunk).slice(-8000);
    });
    server.stderr.on('data', (chunk) => {
      serverLog = (serverLog + chunk).slice(-8000);
    });
    let startupError;
    server.on('error', (error) => {
      startupError = error;
    });
    const deadline = Date.now() + 20000;
    let ready = false;
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (server.exitCode !== null) throw new Error('Preview exited: ' + serverLog);
      try {
        const response = await fetch(base, { signal: AbortSignal.timeout(1500) });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    assert(ready, 'Preview did not start: ' + serverLog);
  }
  const channel =
    process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
  for (const mode of ['auto', 'webgl']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) pageErrors.push(response.status() + ' ' + response.url());
    });
    const url = new URL(base);
    if (mode === 'webgl') url.searchParams.set('renderer', 'webgl');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    const launch = page.getByRole('button', { name: 'BEGIN EXPEDITION', exact: true });
    await expect(launch).toBeEnabled({ timeout: 90000 });
    assert.equal(
      await page.evaluate(() => typeof window.__voidRunner),
      'undefined',
      'Development controls leaked into production',
    );
    const favicon = await page.request.get(new URL('favicon.svg', base).href);
    assert.equal(favicon.status(), 200);
    assert((await favicon.text()).includes('<svg'));
    const assets = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('script[src],link[rel="stylesheet"],link[rel="icon"]'),
      ).map((e) => e.src || e.href),
    );
    assert(
      assets.every((asset) => new URL(asset).pathname.startsWith(base.pathname)),
      'An asset escaped the Pages project path',
    );
    const backend = await page.locator('.engine-label').innerText();
    if (mode === 'webgl') assert(backend.includes('WEBGL 2'));
    await launch.click();
    await page.locator('.mission-screen').waitFor({ state: 'detached', timeout: 20000 });
    await page.locator('.hud').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForFunction(
      () => {
        const text = document.querySelector('.scoreboard > span')?.textContent ?? '';
        const match = text.match(/([\d,]+)\s*M\b/);
        return !!match && Number(match[1].replaceAll(',', '')) > 20;
      },
      {},
      { timeout: 40000 },
    );
    await page.keyboard.down('Space');
    await page.keyboard.down('KeyJ');
    await page.waitForTimeout(350);
    await page.keyboard.up('Space');
    await page.keyboard.up('KeyJ');
    const heat = Number.parseInt(
      await page.locator('.meter').nth(1).locator('div').first().locator('span').innerText(),
    );
    assert(heat > 0, 'Production fire input did not change the core heat');
    await page.keyboard.press('Escape');
    await page
      .getByRole('dialog', { name: 'A moment of silence.' })
      .waitFor({ state: 'visible', timeout: 15000 });
    const paused = await page.locator('.scoreboard > span').innerText();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.scoreboard > span').innerText(), paused);
    await page.getByRole('button', { name: 'RESUME EXPEDITION' }).click();
    await page.locator('.modal-backdrop').waitFor({ state: 'detached', timeout: 20000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.touch-controls')).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    assert.deepEqual(pageErrors, []);
    errors.push(...pageErrors);
    results.push({ mode, backend, heat, assets, errors: pageErrors });
    await page.screenshot({
      path: path.join(root, 'test-results/pages-' + mode + '.jpg'),
      type: 'jpeg',
      quality: 70,
    });
    await page.close();
  }
  await fs.writeFile(
    path.join(root, 'test-results/pages-results.json'),
    JSON.stringify({ url: base.href, results, errors }, null, 2),
  );
  console.log('PAGES PASS', JSON.stringify({ url: base.href, results }));
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await stopped;
  }
}
