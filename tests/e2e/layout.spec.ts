/**
 * Layout guarantees: selecting an answer never moves or re-wraps its text, and the practice screen has
 * no overflow at common window sizes.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let page: Page;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'drillsat-layout-'));

test.beforeAll(async () => {
  const exe = process.env.SAT_E2E_EXE;
  app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [path.resolve(__dirname, '..', '..')] }),
    env: { ...process.env, SAT_USER_DATA: userData },
  });
  page = await app.firstWindow();
  await page.waitForSelector('.sidebar');
});
test.afterAll(async () => {
  await app?.close();
  fs.rmSync(userData, { recursive: true, force: true });
});

// positions relative to the first choice, so page scrolling (e.g. Playwright scrolling into view) does not matter
const textBoxes = () => page.$$eval('.choice .choice-text', (els) => { const y0 = els[0].getBoundingClientRect().y; return els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y - y0), Math.round(r.width), Math.round(r.height)]; }); });
const choiceStyle = () => page.$$eval('.choice', (els) => els.map((e) => { const s = getComputedStyle(e); const t = getComputedStyle(e.querySelector('.choice-text p') ?? e.querySelector('.choice-text')!); return [s.borderTopWidth, s.paddingLeft, s.paddingTop, t.fontSize, t.fontWeight, t.letterSpacing, t.lineHeight].join('|'); }));

test('selecting, hovering and checking answers never changes the text layout', async () => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Question Bank' }).click();
  // a question with long wrapping choices
  await page.getByPlaceholder('keyword or question ID').fill('f1bfbed3');
  await page.locator('.qlist .qitem').first().click();
  await page.locator('.choice').first().waitFor();
  await page.waitForTimeout(350);
  const base = await textBoxes();
  const baseStyle = await choiceStyle();
  for (const key of ['a', 'b', 'c', 'd']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(80);
    expect(await textBoxes(), `after selecting ${key}`).toEqual(base);
    expect(await choiceStyle()).toEqual(baseStyle);
  }
  await page.locator('.choice').nth(2).hover();
  await page.waitForTimeout(80);
  expect(await textBoxes(), 'on hover').toEqual(base);
  await page.locator('.choice').nth(1).focus();
  expect(await textBoxes(), 'on focus').toEqual(base);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await page.locator('.result').waitFor();
  await page.waitForTimeout(350);
  expect(await textBoxes(), 'after check').toEqual(base);
  expect(await choiceStyle()).toEqual(baseStyle);
});

test('no horizontal overflow and answers read in few lines at common sizes', async () => {
  const back = page.getByRole('button', { name: 'Back to results' });
  if (await back.isVisible()) await back.click();
  else await page.getByRole('button', { name: 'Question Bank' }).click();
  await page.getByPlaceholder('keyword or question ID').fill('f1bfbed3');
  await page.locator('.qlist .qitem').first().click();
  await page.locator('.choice').first().waitFor();
  for (const [w, h] of [[1366, 768], [1920, 1080], [1600, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const pg = document.querySelector('main.page') as HTMLElement;
      const lines = [...document.querySelectorAll('.choice .choice-text')].map((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
      return { docW: document.documentElement.scrollWidth, inner: window.innerWidth, pageOverflowX: pg.scrollWidth - pg.clientWidth, lines };
    });
    expect(m.docW, `${w}x${h}`).toBeLessThanOrEqual(m.inner);
    expect(m.pageOverflowX, `${w}x${h}`).toBeLessThanOrEqual(0);
    for (const l of m.lines) expect(l, `${w}x${h} lines`).toBeLessThanOrEqual(3);
  }
});
