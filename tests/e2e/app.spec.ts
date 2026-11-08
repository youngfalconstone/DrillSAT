/**
 * End-to-end smoke test: launches the built Electron app (run `npm run build` first),
 * with a throw-away user-data folder, and walks through the main flows.
 *
 *   npx playwright test -c tests/e2e/playwright.config.ts
 *
 * Set DESMOS_API_KEY to also verify that the Desmos calculator loads (needs internet).
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let page: Page;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'drillsat-e2e-'));
const shots = path.resolve(__dirname, 'screenshots');
fs.mkdirSync(shots, { recursive: true });

test.beforeAll(async () => {
  // SAT_E2E_EXE=release/win-unpacked/DrillSAT.exe runs the same suite against the packaged build.
  const exe = process.env.SAT_E2E_EXE;
  app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [path.resolve(__dirname, '..', '..')] }),
    env: { ...process.env, SAT_USER_DATA: userData },
  });
  page = await app.firstWindow();
  await page.waitForSelector('.sidebar', { timeout: 30000 });
});

test.afterAll(async () => {
  await app?.close();
  fs.rmSync(userData, { recursive: true, force: true });
});

test('home loads with the full bank', async () => {
  await expect(page.locator('.home-hero')).toContainText('3,770 official questions');
  await page.screenshot({ path: path.join(shots, '01-home.png') });
});

test('question bank filters, search and opens a question with MathML', async () => {
  await page.getByRole('button', { name: 'Question Bank' }).click();
  await expect(page.locator('.qlist .qitem').first()).toBeVisible();
  await page.locator('select.select').first().selectOption('math');
  await page.getByLabel('Algebra').check();
  await page.getByPlaceholder('keyword or question ID').fill('ac472881');
  await expect(page.locator('.qlist .qitem')).toHaveCount(1);
  await page.locator('.qlist .qitem').first().click();
  await expect(page.locator('.qcard math').first()).toBeVisible();
  await expect(page.locator('.spr input')).toBeVisible();
  await page.locator('.spr input').fill('403');
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(page.locator('.result')).toContainText('Correct');
  await expect(page.locator('.rationale').first()).toContainText('correct answer is');
  await page.screenshot({ path: path.join(shots, '02-bank-question.png') });
  await page.getByRole('button', { name: 'Back to results' }).click();
});

test('practice session: answer MCQs, timer, mark for review, summary', async () => {
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Start session' }).waitFor();
  await page.locator('select.select').first().selectOption('rw');
  await page.locator('select.select').nth(1).selectOption('mixed');
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.locator('.sessionbar')).toContainText('Question 1 of');
  await expect(page.locator('.timer')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.locator('.choice').first().waitFor();
    await page.keyboard.press('b');
    await expect(page.locator('.choice.selected')).toHaveCount(1);
    if (i === 0) {
      await page.getByRole('button', { name: 'Add to Review' }).click();
      await expect(page.getByRole('button', { name: 'Marked for review' })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    await expect(page.locator('.result')).toBeVisible();
    await expect(page.locator('.choice.correct')).toHaveCount(1);
    if (i === 0) await page.screenshot({ path: path.join(shots, '03-practice.png') });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.sessionbar')).toContainText(`Question ${i + 2} of`);
    await expect(page.locator('.choice.selected')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'End session' }).click();
  await page.getByRole('button', { name: 'End and review' }).click();
  await expect(page.locator('.stat').first()).toContainText('/ 3');
  await page.screenshot({ path: path.join(shots, '04-summary.png') });
  await page.getByRole('button', { name: 'Performance' }).first().click();
  await expect(page.locator('.stat').first()).toContainText('3');
});

test('settings: keys are stored and reported, AI errors are clear without a key', async () => {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('.card').first()).toContainText('not set');
  await page.getByPlaceholder('sk-…').fill('sk-test-not-a-real-key');
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.locator('.card').first()).toContainText('saved');
  const stored = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf-8'));
  expect(stored.secrets.llm.data).not.toContain('sk-test-not-a-real-key');
  await page.getByRole('button', { name: 'Remove' }).first().click();
  await expect(page.locator('.card').first()).toContainText('not set');
  // tutor with no key -> clear error
  await page.getByRole('button', { name: 'AI Tutor' }).click();
  await page.getByPlaceholder('Ask the tutor').fill('hello');
  await page.keyboard.press('Enter');
  await expect(page.locator('.chatpanel .error')).toContainText(/API key|offline/);
  await page.screenshot({ path: path.join(shots, '05-settings-tutor.png') });
  await page.keyboard.press('Escape');
  // dark theme renders and persists
  await page.locator('select.select').filter({ hasText: 'Light (matches' }).selectOption('dark');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.getByRole('button', { name: 'Question Bank' }).click();
  await page.getByPlaceholder('keyword or question ID').fill('f1bfbed3');
  await page.locator('.qlist .qitem').first().click();
  await page.locator('.choice').first().waitFor();
  await page.keyboard.press('b');
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await page.locator('.result').waitFor();
  await page.waitForTimeout(400); // let entrance animations finish before the screenshot
  await page.screenshot({ path: path.join(shots, '07-dark.png') });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('select.select').filter({ hasText: 'Light (matches' }).selectOption('light');
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
});

test('desmos calculator panel', async () => {
  await page.getByRole('button', { name: 'Question Bank' }).click();
  await page.getByPlaceholder('keyword or question ID').fill('3f5a3602');
  await page.locator('.qlist .qitem').first().click();
  await page.locator('.qcard').waitFor();
  await page.keyboard.press('g');
  await expect(page.locator('.calcpanel')).toBeVisible();
  const key = process.env.DESMOS_API_KEY;
  if (!key) {
    await expect(page.locator('.calcpanel .error')).toContainText('No Desmos API key');
    test.info().annotations.push({ type: 'note', description: 'DESMOS_API_KEY not set: verified the no-key message only' });
    return;
  }
  await expect(page.locator('.chatpanel')).toHaveCount(0); // Escape closed the tutor
  await page.locator('.calcpanel').getByRole('button', { name: 'Open Settings' }).click();
  await page.getByPlaceholder('Desmos API key').fill(key);
  await page.getByRole('button', { name: 'Save' }).nth(1).click();
  await page.getByRole('button', { name: 'Question Bank' }).click();
  await page.getByPlaceholder('keyword or question ID').fill('3f5a3602');
  await page.locator('.qlist .qitem').first().click();
  await page.locator('.qcard').waitFor();
  if (!(await page.locator('.calcpanel').isVisible())) await page.keyboard.press('g');
  // either the calculator renders, or Desmos rejected the key (clear message, question still usable)
  await expect(page.locator('.calcpanel .dcg-container, .calcpanel .error')).toBeVisible({ timeout: 30000 });
  if (await page.locator('.calcpanel .error').isVisible()) {
    const msg = await page.locator('.calcpanel .error').textContent();
    expect(msg).toContain('rejected the API key');
    await expect(page.locator('.qcard figure svg').first()).toBeVisible(); // question view not broken
    await expect(page.locator('.choice math').first()).toBeVisible();
    await page.screenshot({ path: path.join(shots, '06-desmos-badkey.png') });
    test.info().annotations.push({ type: 'note', description: `Desmos rejected DESMOS_API_KEY: ${msg}` });
    return;
  }
  // type an expression and check it persists per question
  await page.locator('.calcpanel .dcg-mq-editable-field').first().click();
  await page.keyboard.type('y=2x+1');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('.calcpanel .dcg-expressionitem').first()).toContainText('2');
  await page.screenshot({ path: path.join(shots, '06-desmos.png') });
});
