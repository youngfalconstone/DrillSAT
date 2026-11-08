/**
 * Live check of AI question generation with the user's real LLM key, against a packaged or installed exe.
 * Opt-in: SAT_LIVE=1 and SAT_E2E_EXE=<exe>. Runs in a throwaway user-data folder that holds only a copy of
 * the user's settings (and Chromium's "Local State", which holds the key that decrypts them), so generated
 * questions never land in the real profile. Logs each accepted item for a human read-through.
 */
import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test.skip(!process.env.SAT_LIVE || !process.env.SAT_E2E_EXE, 'set SAT_LIVE=1 and SAT_E2E_EXE');

const CASES = [
  { section: 'rw', topic: 'Words in Context', difficulty: 'H', format: null },
  { section: 'rw', topic: 'Rhetorical Synthesis', difficulty: 'E', format: null },
  { section: 'math', topic: 'Linear functions', difficulty: 'M', format: 'spr' },
  { section: 'math', topic: 'Nonlinear functions', difficulty: 'H', format: 'mcq' },
];

test('generates SAT-format questions at the requested difficulty', async () => {
  test.setTimeout(900000);
  const real = path.join(process.env.APPDATA!, 'DrillSAT');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drillsat-gen-'));
  for (const f of ['settings.json', 'Local State']) fs.copyFileSync(path.join(real, f), path.join(tmp, f));
  const app = await electron.launch({ executablePath: process.env.SAT_E2E_EXE!, args: [], env: { ...process.env, SAT_USER_DATA: tmp } });
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('.sidebar');
    await expect(page.locator('.sidebar .foot')).toContainText('AI: connected');
    await page.getByRole('button', { name: 'Study Tools', exact: true }).click();
    const results: string[] = [];
    for (const c of CASES) {
      await page.getByLabel('Section').selectOption(c.section);
      const clear = page.getByRole('button', { name: /^Clear \(/ });
      if (await clear.count()) await clear.click();
      await page.getByLabel('How many: ').fill('1');
      await page.getByLabel(c.topic, { exact: true }).check();
      await page.getByLabel('Difficulty').selectOption(c.difficulty);
      if (c.format) await page.getByLabel('Format').selectOption(c.format);
      const before = await page.locator('.qlist .qitem').count();
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled({ timeout: 300000 });
      const err = page.locator('.card .error');
      if (await err.count()) {
        results.push(`${c.topic} ${c.difficulty}: REJECTED - ${await err.textContent()}`);
        continue;
      }
      await expect(page.locator('.qlist .qitem')).toHaveCount(before + 1);
      const stored = JSON.parse(fs.readFileSync(path.join(tmp, 'ai-questions.json'), 'utf-8'));
      const q = stored[stored.length - 1];
      expect(q.difficulty).toBe(c.difficulty);
      expect(q.skill).toBe(c.topic);
      results.push(`${c.topic} ${c.difficulty}: ACCEPTED\n${q.text}\nkey=${(q.correct ?? q.keys).join(',')}`);
    }
    console.log(results.join('\n\n---\n\n'));
    // at least most cases must yield an accepted item; a rejection is a quality gate working, not a crash
    expect(results.filter((r) => r.includes('ACCEPTED')).length).toBeGreaterThanOrEqual(3);

    // several topics at once: two questions spread over two topics, one each
    await page.getByLabel('Section').selectOption('math');
    const clear = page.getByRole('button', { name: /^Clear \(/ });
    if (await clear.count()) await clear.click();
    await page.getByLabel('Difficulty').selectOption('E');
    await page.getByLabel('Format').selectOption('mcq');
    await page.getByLabel('Percentages', { exact: true }).check();
    await page.getByLabel('Circles', { exact: true }).check();
    await page.getByLabel('How many: ').fill('2');
    const n0 = JSON.parse(fs.readFileSync(path.join(tmp, 'ai-questions.json'), 'utf-8')).length;
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeEnabled({ timeout: 600000 });
    const added = JSON.parse(fs.readFileSync(path.join(tmp, 'ai-questions.json'), 'utf-8')).slice(n0);
    console.log('multi-topic:', added.map((q: { skill: string }) => q.skill), await page.locator('.card .error').allTextContents());
    for (const q of added) expect(['Percentages', 'Circles']).toContain(q.skill);
    if (added.length === 2) expect(new Set(added.map((q: { skill: string }) => q.skill)).size).toBe(2);
    expect(added.length).toBeGreaterThanOrEqual(1);
  } finally {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
