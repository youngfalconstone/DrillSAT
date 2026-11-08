/**
 * Captures the frames used for the README/landing-page GIF and screenshots (not a test of behaviour).
 * Run: npx playwright test -c tests/e2e/playwright.config.ts capture
 */
import { test, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('capture UI frames', async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'drillsat-capture-'));
  const dir = path.resolve(__dirname, 'screenshots', 'frames');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const app = await electron.launch({ args: [path.resolve(__dirname, '..', '..')], env: { ...process.env, SAT_USER_DATA: userData } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 760 });
  await page.waitForSelector('.sidebar');
  let n = 0;
  const shot = async (ms = 450) => {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: path.join(dir, `f${String(n++).padStart(2, '0')}.png`) });
  };
  await shot(600);
  await page.getByRole('button', { name: 'Question Bank' }).click();
  await shot();
  await page.locator('.qlist').hover();
  await page.mouse.wheel(0, 500);
  await shot();
  await page.getByPlaceholder('keyword or question ID').fill('3f5a3602');
  await shot();
  await page.locator('.qlist .qitem').first().click();
  await page.locator('.qcard').waitFor();
  await shot();
  await page.keyboard.press('d');
  await shot(300);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await shot();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await shot();
  await page.locator('select.select').first().selectOption('rw');
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.locator('.choice').first().waitFor();
  await shot();
  await page.keyboard.press('b');
  await shot(300);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await shot();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.choice').first().waitFor();
  await shot();
  await page.getByRole('button', { name: 'AI Tutor' }).click();
  await shot();
  await app.close();
  fs.rmSync(userData, { recursive: true, force: true });
});
