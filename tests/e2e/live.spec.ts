/**
 * Live check with the user's real settings (keys): Desmos renders and the AI tutor answers.
 * Opt-in: SAT_LIVE=1 and SAT_E2E_EXE=<installed exe>. Uses the real user-data folder, so it never
 * starts a practice session; it only opens a question, toggles the calculator and sends one message.
 */
import { test, expect, _electron as electron } from '@playwright/test';

test.skip(!process.env.SAT_LIVE, 'set SAT_LIVE=1 to run against real settings');

test('desmos loads and the tutor replies with the configured keys', async () => {
  const app = await electron.launch({ executablePath: process.env.SAT_E2E_EXE!, args: [] });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.waitForSelector('.sidebar');
  await expect(page.locator('.sidebar .foot')).toContainText('AI: connected');

  await page.getByRole('button', { name: 'Question Bank' }).click();
  await page.getByPlaceholder('keyword or question ID').fill('3f5a3602');
  await page.locator('.qlist .qitem').first().click();
  await page.locator('.qcard').waitFor();
  await page.keyboard.press('g');
  await expect(page.locator('.calcpanel')).toBeVisible();
  await expect(page.locator('.calcpanel .dcg-container')).toBeVisible({ timeout: 40000 });
  // start from an empty calculator: state persists per question in the real profile
  await page.getByTitle('Clear calculator').click();
  await page.locator('.calcpanel .dcg-mq-editable-field').first().click();
  await page.keyboard.type('y=2x+1');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'tests/e2e/screenshots/08-desmos-live.png' });
  await page.getByRole('button', { name: 'Back to results' }).click();
  await page.locator('.qlist .qitem').first().click();
  await page.locator('.qcard').waitFor();
  if (!(await page.locator('.calcpanel').isVisible())) await page.keyboard.press('g');
  await expect(page.locator('.calcpanel .dcg-expressionitem').first()).toContainText('2', { timeout: 20000 }); // state persisted

  await page.getByRole('button', { name: 'AI Tutor' }).click();
  await page.getByPlaceholder('Ask the tutor').fill('In one sentence, what does this question test? Do not give the answer.');
  await page.keyboard.press('Enter');
  await expect(page.locator('.chatpanel .msg.assistant').last()).not.toContainText('Thinking', { timeout: 90000 });
  const reply = await page.locator('.chatpanel .msg.assistant').last().textContent();
  console.log('tutor:', reply?.slice(0, 200));
  expect((reply ?? '').length).toBeGreaterThan(20);
  await expect(page.locator('.chatpanel .error')).toHaveCount(0);
  await page.screenshot({ path: 'tests/e2e/screenshots/09-tutor-live.png' });
  await app.close();
});
