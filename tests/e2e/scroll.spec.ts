/**
 * Scrolling must work with wheel, keyboard (PgDn/PgUp/Space/arrows/Home/End) and programmatic
 * scrollbar movement on every screen; the question list keeps its position when you open a
 * question and come back. Runs against the built app (npm run build) or SAT_E2E_EXE.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let page: Page;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'drillsat-scroll-'));

const scrollTop = () => page.evaluate(() => (document.querySelector('main.page') as HTMLElement).scrollTop);
const maxScroll = () => page.evaluate(() => {
  const el = document.querySelector('main.page') as HTMLElement;
  return el.scrollHeight - el.clientHeight;
});

test.beforeAll(async () => {
  const exe = process.env.SAT_E2E_EXE;
  app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [path.resolve(__dirname, '..', '..')] }),
    env: { ...process.env, SAT_USER_DATA: userData },
  });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1200, height: 640 });
  await page.waitForSelector('.sidebar');
});
test.afterAll(async () => {
  await app?.close();
  fs.rmSync(userData, { recursive: true, force: true });
});

test('the layout never exceeds the viewport; only main.page scrolls', async () => {
  await page.getByRole('button', { name: 'Question Bank' }).click();
  await page.locator('.qlist .qitem').first().waitFor();
  const m = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight, inner: window.innerHeight,
    main: (document.querySelector('.main') as HTMLElement).offsetHeight,
    page: (document.querySelector('main.page') as HTMLElement).clientHeight,
    pageScroll: (document.querySelector('main.page') as HTMLElement).scrollHeight,
  }));
  expect(m.doc).toBe(m.inner);
  expect(m.main).toBe(m.inner);
  expect(m.pageScroll).toBeGreaterThan(m.page + 500);
});

test('wheel, keyboard and scrollbar all scroll the question list', async () => {
  await page.locator('.qlist').hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(scrollTop).toBeGreaterThan(300);
  const afterWheel = await scrollTop();
  await page.keyboard.press('PageDown');
  await expect.poll(scrollTop).toBeGreaterThan(afterWheel + 100);
  await page.keyboard.press('End');
  await expect.poll(async () => Math.abs((await scrollTop()) - (await maxScroll()))).toBeLessThan(2);
  await page.keyboard.press('Home');
  await expect.poll(scrollTop).toBe(0);
  await page.keyboard.press('Space');
  await expect.poll(scrollTop).toBeGreaterThan(100);
  const afterSpace = await scrollTop();
  await page.keyboard.press('ArrowDown');
  await expect.poll(scrollTop).toBeGreaterThan(afterSpace);
  await page.keyboard.press('PageUp');
  await expect.poll(scrollTop).toBeLessThan(afterSpace);
  // scrollbar / programmatic
  await page.evaluate(() => ((document.querySelector('main.page') as HTMLElement).scrollTop = 900));
  await expect.poll(scrollTop).toBe(900);
});

test('list scroll position survives opening a question and coming back; detail starts at top', async () => {
  await page.evaluate(() => ((document.querySelector('main.page') as HTMLElement).scrollTop = 700));
  await expect.poll(scrollTop).toBe(700);
  const item = page.locator('.qlist .qitem').nth(8);
  await item.scrollIntoViewIfNeeded(); // Playwright would do this on click anyway; measure after it
  await page.waitForTimeout(100);
  const before = await scrollTop();
  expect(before).toBeGreaterThan(0);
  await item.click();
  await page.locator('.qcard').waitFor();
  expect(await scrollTop()).toBe(0);
  await page.getByRole('button', { name: 'Back to results' }).click();
  await page.locator('.qlist .qitem').first().waitFor();
  await expect.poll(scrollTop).toBe(before);
});

test('long question detail and other screens scroll', async () => {
  await page.getByPlaceholder('keyword or question ID').fill('f1bfbed3'); // long R&W passage
  await page.locator('.qlist .qitem').first().click();
  await page.locator('.qcard').waitFor();
  await page.setViewportSize({ width: 1000, height: 480 });
  await page.locator('.qcard').hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(scrollTop).toBeGreaterThan(100);
  await page.setViewportSize({ width: 1200, height: 640 });
  await page.waitForTimeout(400); // let the wheel's smooth scroll finish before navigating
  for (const name of ['Help', 'Settings', 'Performance']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(100);
    expect(await scrollTop()).toBeLessThan(2); // new screen starts at the top
    const max = await maxScroll();
    if (max > 0) {
      await page.keyboard.press('End');
      await expect.poll(scrollTop).toBeGreaterThan(0);
    }
  }
});

test('modal does not lock scrolling after it closes', async () => {
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.locator('.choice, .spr').first().waitFor();
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.locator('.modal')).toBeVisible();
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(page.locator('.modal')).toHaveCount(0);
  await page.setViewportSize({ width: 1000, height: 480 });
  await page.locator('.qcard').hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(scrollTop).toBeGreaterThan(50);
  await page.setViewportSize({ width: 1200, height: 640 });
});
