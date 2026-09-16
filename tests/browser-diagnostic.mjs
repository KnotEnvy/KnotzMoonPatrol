import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.stack));
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
  await page.goto('http://127.0.0.1:5173/?renderer=webgl');
  console.log('NAVIGATED');
  await page
    .getByRole('button', { name: 'BEGIN EXPEDITION', exact: true })
    .click({ timeout: 60000 });
  await page.evaluate(() => {
    const r = window.__voidRunner.renderer,
      orig = r._handleObjectFunction;
    r._handleObjectFunction = function (...args) {
      try {
        return orig.apply(this, args);
      } catch (e) {
        console.log(
          'FAILED DRAW',
          JSON.stringify({
            geo: args[0].geometry?.type,
            pos: args[0].position,
            mat: args[1].type,
            color: args[1].color,
            map: args[1].map?.uuid,
            bump: args[1].bumpMap?.uuid,
          }),
        );
        throw e;
      }
    };
    const init = r._bindings._init;
    r._bindings._init = function (b) {
      for (const t of b.bindings)
        if (t.isSampledTexture && !t.texture)
          console.log('INVALID BINDING', t.name, Object.keys(t), Object.keys(t.textureNode ?? {}));
      return init.call(this, b);
    };
  });
  await page.waitForTimeout(10000);
  console.log('TEXT', await page.locator('body').innerText());
  console.log(
    'GPU',
    await page.evaluate(async () => ({
      gpu: !!navigator.gpu,
      adapter: !!(await navigator.gpu?.requestAdapter()),
      state: window.__voidRunner?.state,
    })),
  );
  await page.screenshot({ path: 'test-results/diagnostic.png' });
} finally {
  await browser.close();
}
