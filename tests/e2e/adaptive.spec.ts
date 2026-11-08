/**
 * Adaptive difficulty really adapts: questions served while answering everything right climb to College Board's
 * top score band; answering everything wrong comes down to Easy; "Hard only" serves only Hard; "Hardest only"
 * serves only score band 7. (1.6.0 and earlier stayed on Medium: levels moved per topic and a 10-question
 * session touches each topic about once.)
 */
import { test, expect, _electron as electron, type Page } from '@playwright/test';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const BANK = path.resolve(__dirname, '..', '..', 'data', 'bank');
const idx = new Map((JSON.parse(fs.readFileSync(path.join(BANK, 'index.json'), 'utf-8')).questions as { id: string; band: number; difficulty: string }[]).map((e) => [e.id, e]));
async function run(page: Page, start: () => Promise<void>, n: number, right = true) {
  await start();
  const seen: string[] = [];
  for (let i = 0; i < n; i++) {
    await page.locator('.qcard .badge').first().waitFor();
    const diff = await page.locator('.qcard .badge').first().textContent();
    // answer correctly using the key
    const label = await page.locator('.qcard').getAttribute('data-qid');
    const q = label ? JSON.parse(fs.readFileSync(path.join(BANK, 'q', label + '.json'), 'utf-8')) : null;
    if (q?.type === 'mcq') await page.getByRole('button', { name: new RegExp(`^Choice ${right ? q.correct[0] : 'ABCD'.replace(q.correct[0], '')[0]}`) }).click();
    else if (q) await page.locator('.spr input').fill(right ? q.keys[0] : '99999');
    await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    seen.push(`${diff}${label ? '/b' + idx.get(label)?.band : ''}`);
    const next = page.getByRole('button', { name: i + 1 < n ? 'Next' : 'Finish', exact: true });
    if (i + 1 < n) await next.click();
  }
  return seen;
}
test('adaptive practice climbs and falls with your answers; Hard and Hardest are what they say', async () => {
  test.setTimeout(300000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drillsat-adaptive-'));
  const exe = process.env.SAT_E2E_EXE;
  const app = await electron.launch({ ...(exe ? { executablePath: exe, args: [] } : { args: [path.resolve(__dirname, '..', '..')] }), env: { ...process.env, SAT_USER_DATA: dir } });
  const page = await app.firstWindow(); await page.waitForSelector('.sidebar');
  const quick = await run(page, async () => { await page.getByRole('button', { name: 'Quick Math session (10)' }).click(); }, 10);
  console.log('QUICK adaptive, all correct:', quick.join(' '));
  const band = (x: string) => Number(x.split('/b')[1]);
  expect(quick.slice(2).every((x) => x.startsWith('Hard'))).toBe(true);
  expect(quick.slice(4).every((x) => band(x) === 7)).toBe(true);
  const endIt = async () => { await page.getByRole('button', { name: 'End session' }).click(); await page.getByRole('button', { name: 'End and review' }).click(); };
  await endIt();
  await page.getByRole('button', { name: 'Home' }).click();
  const wrong = await run(page, async () => { await page.getByRole('button', { name: 'Quick Reading & Writing (10)' }).click(); }, 10, false);
  console.log('QUICK adaptive R&W, all wrong:', wrong.join(' '));
  expect(wrong.slice(4).every((x) => x.startsWith('Easy'))).toBe(true);
  await endIt();
  const custom = async (mode: string) => { await page.getByRole('button', { name: 'New session…' }).click().catch(() => undefined); await page.getByRole('button', { name: /^Practice( •)?$/ }).click(); await page.locator('select.select').first().selectOption('math'); await page.locator('select.select').nth(1).selectOption(mode); await page.getByRole('button', { name: 'Start session' }).click(); };
  const hard = await run(page, () => custom('H'), 8);
  console.log('HARD only:', hard.join(' '));
  expect(hard.every((x) => x.startsWith('Hard'))).toBe(true);
  await endIt();
  const hardest = await run(page, () => custom('hardest'), 8);
  console.log('HARDEST only:', hardest.join(' '));
  expect(hardest.every((x) => band(x) === 7)).toBe(true);
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
