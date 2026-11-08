/**
 * Motion and performance checks: animations use the shared tokens, reduced-motion disables them,
 * and scrolling a long list keeps frame times low.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let page: Page;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'drillsat-motion-'));

test.beforeAll(async () => {
  const exe = process.env.SAT_E2E_EXE;
  app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [path.resolve(__dirname, '..', '..')] }),
    env: { ...process.env, SAT_USER_DATA: userData },
  });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.waitForSelector('.sidebar');
});
test.afterAll(async () => {
  await app?.close();
  fs.rmSync(userData, { recursive: true, force: true });
});

test('screen and choice transitions use the motion tokens', async () => {
  await page.getByRole('button', { name: 'Question Bank' }).click();
  const screenAnim = await page.locator('.screen').evaluate((el) => getComputedStyle(el).animationDuration);
  expect(screenAnim).toBe('0.28s');
  await page.locator('.qlist .qitem').first().click();
  await page.locator('.qcard').waitFor();
  const t = await page.locator('.choice, .spr input').first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(t).toContain('0.15s');
});

test('reduced motion disables non-essential animation', async () => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Help' }).click();
  const d = await page.locator('.screen').evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(d)).toBeLessThan(0.001);
  const b = await page.locator('.btn').first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(b)).toBeLessThan(0.001);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'Home' }).click();
  const d2 = await page.locator('.screen').evaluate((el) => getComputedStyle(el).animationDuration);
  expect(d2).toBe('0.28s');
});

test('scrolling the full question list has no sustained jank', async () => {
  await page.getByRole('button', { name: 'Question Bank' }).click();
  await page.locator('.qlist .qitem').first().waitFor();
  // show more rows so the list is long
  for (let i = 0; i < 3; i++) {
    const more = page.getByRole('button', { name: /Show more/ });
    if (await more.isVisible()) await more.click();
  }
  await page.locator('.qlist').hover();
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__frames = [];
    w.__stop = false;
    let last = performance.now();
    const tick = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(40);
  }
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(40);
  }
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__stop = true;
    return w.__frames;
  });
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const long = frames.filter((f) => f > 50).length;
  console.log(`frames=${frames.length} p50=${sorted[Math.floor(sorted.length / 2)].toFixed(1)}ms p95=${p95.toFixed(1)}ms long(>50ms)=${long}`);
  expect(frames.length).toBeGreaterThan(60);
  expect(p95).toBeLessThan(34); // two 60 Hz frames
  expect(long / frames.length).toBeLessThan(0.03);
});
