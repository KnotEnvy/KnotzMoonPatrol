import { chromium } from '@playwright/test';

/** Keep Edge on Windows; use Playwright Chromium elsewhere, with explicit overrides. */
export function launchBrowser() {
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const channel =
    process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  return chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADLESS !== '0',
    ...(executablePath ? { executablePath } : channel ? { channel } : {}),
  });
}

export function gameUrl(parameters = {}) {
  const url = new URL(process.env.GAME_URL ?? 'http://127.0.0.1:5173/');
  for (const [name, value] of Object.entries(parameters))
    if (value !== undefined) url.searchParams.set(name, value);
  return url.href;
}
