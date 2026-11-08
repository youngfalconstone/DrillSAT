/**
 * The shared topic picker: grouped by domain with short names, a domain tick selects all of its
 * topics, and Study Tools uses the same grouping in a dropdown. Also writes review screenshots.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app: ElectronApplication;
let page: Page;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'drillsat-topics-'));
const shots = path.resolve(__dirname, 'screenshots');

test.beforeAll(async () => {
  const exe = process.env.SAT_E2E_EXE;
  app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [path.resolve(__dirname, '..', '..')] }),
    env: { ...process.env, SAT_USER_DATA: userData },
  });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForSelector('.sidebar');
});
test.afterAll(async () => {
  await app?.close();
  fs.rmSync(userData, { recursive: true, force: true });
});

test('practice topics: short names, domain tick selects its topics, one spelling of Cross-Text', async () => {
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Start session' }).waitFor();
  await expect(page.locator('.topic-domain')).toHaveCount(4);
  await expect(page.getByText('Nonlinear equations and systems')).toBeVisible();
  await expect(page.getByText(/one variable and systems of equations in two variables/)).toHaveCount(0);
  await page.getByLabel('Problem-Solving and Data Analysis').check();
  await expect(page.locator('.topic input:checked')).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Clear (7)' })).toBeVisible();
  await page.screenshot({ path: path.join(shots, '10-practice-topics.png') });
  await page.getByRole('button', { name: 'Clear (7)' }).click();
  await expect(page.locator('.topic input:checked')).toHaveCount(0);
  await page.locator('select.select').first().selectOption('rw');
  await expect(page.locator('.topic', { hasText: /Cross-text/i })).toHaveCount(1);
});

test('study tools takes several topics and whole domains', async () => {
  await page.getByRole('button', { name: 'Study Tools', exact: true }).click();
  await expect(page.locator('.topic-domain')).toHaveCount(4);
  await expect(page.getByText('All topics')).toBeVisible();
  await page.getByLabel('Geometry and Trigonometry').check();
  await page.getByLabel('Percentages').check();
  await expect(page.locator('.topic input:checked')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Clear (5)' })).toBeVisible();
  const labels = await page.locator('.topic span').allTextContents();
  expect(labels.every((l) => l.length <= 34)).toBe(true);
  await page.screenshot({ path: path.join(shots, '11-study-tools.png') });
  await page.getByRole('button', { name: 'Clear (5)' }).click();
});

test('question bank uses the same topic list', async () => {
  await page.getByRole('button', { name: 'Question Bank' }).click();
  await page.locator('.qlist .qitem').first().waitFor();
  await page.locator('select.select').first().selectOption('math');
  const before = await page.locator('.qlist .qitem').count();
  await page.getByLabel('Circles').check();
  await expect(page.locator('.qlist .qitem').first()).toContainText('Circles');
  expect(await page.locator('.qlist .qitem').count()).toBeLessThanOrEqual(before);
  await page.screenshot({ path: path.join(shots, '12-bank-topics.png') });
});
