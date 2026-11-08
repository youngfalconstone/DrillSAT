/**
 * Practice-screen screenshots with an answer selected and the AI solution open, at common window
 * sizes. Opt-in (SAT_LIVE=1, SAT_E2E_EXE) because the AI solution needs the user's real key.
 * Writes tests/e2e/screenshots/<SHOT_TAG>-<size>.png. Never submits an answer, so no progress is saved.
 */
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

test.skip(!process.env.SAT_LIVE, 'live only');

test('practice screenshots', async () => {
  test.setTimeout(240000);
  const tag = process.env.SHOT_TAG ?? 'shot';
  const exe = process.env.SAT_E2E_EXE;
  const app = await electron.launch(exe ? { executablePath: exe, args: [] } : { args: [path.resolve(__dirname, '..', '..')] });
  const page = await app.firstWindow();
  await page.waitForSelector('.sidebar');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Start session' }).waitFor();
  // deterministic question: use the bank route instead when a specific id is wanted; sessions pick randomly
  await page.locator('select.select').first().selectOption('math');
  await page.locator('select.select').nth(1).selectOption('M');
  await page.getByLabel('Nonlinear functions').check();
  await page.getByRole('button', { name: 'Start session' }).click();
  await page.locator('.choice, .spr input').first().waitFor();
  // the comparison wants a multiple-choice question with an answer selected: skip grid-ins
  for (let i = 0; i < 9 && (await page.locator('.choice').count()) === 0; i++) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.locator('.choice, .spr input').first().waitFor();
  }
  await page.locator('.choice').nth(1).click();
  await page.getByRole('button', { name: 'Show AI step-by-step solution' }).click();
  await expect(page.locator('.sol-answer, .sol-md, .sol-cta .error').first()).toBeVisible({ timeout: 120000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.resolve(__dirname, 'screenshots', `${tag}-1366x768.png`) });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve(__dirname, 'screenshots', `${tag}-1920x1080.png`) });
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'Discard' }).click();
  await app.close();
});
