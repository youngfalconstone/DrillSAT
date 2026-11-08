/**
 * 1.6.0 features end to end: answer tools (eliminator, highlighter, reference sheet), pacing feedback,
 * spaced review, the estimated score, clean bank previews, full-length practice tests (incl. resume after a
 * restart and the module timer running out) and the update status. Each test uses its own throw-away profile.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const shots = path.resolve(__dirname, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const BANK = path.resolve(__dirname, '..', '..', 'data', 'bank');
const index = JSON.parse(fs.readFileSync(path.join(BANK, 'index.json'), 'utf-8')).questions as { id: string; section: string; domain: string; skill: string; difficulty: string; type: string; band: number }[];

async function launch(userData: string): Promise<{ app: ElectronApplication; page: Page }> {
  const exe = process.env.SAT_E2E_EXE;
  const app = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: [path.resolve(__dirname, '..', '..')] }),
    env: { ...process.env, SAT_USER_DATA: userData },
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForSelector('.sidebar', { timeout: 30000 });
  return { app, page };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'drillsat-feat-'));
const readJson = (dir: string, f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));

function answerRecord(id: string, correct: boolean, at: number) {
  const e = index.find((x) => x.id === id)!;
  return { questionId: id, section: e.section, domain: e.domain, skill: e.skill, difficulty: e.difficulty, type: e.type, source: 'official', answer: correct ? 'A' : 'B', correct, timeMs: 60000, marked: false, at };
}

test('answer tools: eliminator, highlighter and reference sheet', async () => {
  const dir = tmp();
  const { app, page } = await launch(dir);
  try {
    await page.getByRole('button', { name: 'Question Bank' }).click();
    await page.getByPlaceholder('keyword or question ID').fill('3f5a3602'); // math multiple choice
    await page.locator('.qlist .qitem').first().click();
    await page.locator('.qcard').waitFor();

    // eliminator: cross out B, then choosing B restores it
    await page.getByRole('button', { name: 'Answer eliminator' }).click();
    await page.getByRole('button', { name: 'Cross out choice B' }).click();
    await expect(page.locator('.choice.struck')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Choice B, Crossed out' })).toBeVisible();
    await page.getByRole('button', { name: 'Undo cross-out of choice B' }).click();
    await expect(page.locator('.choice.struck')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cross out choice C' }).click();
    await page.getByRole('button', { name: 'Choice C, Crossed out' }).click();
    await expect(page.locator('.choice.struck')).toHaveCount(0);
    await expect(page.locator('.choice.selected')).toHaveCount(1);

    // highlighter: select the stem text with the tool on
    await page.getByRole('button', { name: 'Highlighter' }).click();
    await page.evaluate(() => {
      const stem = document.querySelector('.qtext .stem')!;
      const r = document.createRange();
      r.selectNodeContents(stem);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(r);
      document.querySelector('.qtext')!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => ((CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get('drillsat-hl')?.size ?? 0))).toBe(1);
    await page.screenshot({ path: path.join(shots, '13-answer-tools.png') });
    await page.getByRole('button', { name: 'Clear highlights' }).click();
    await expect.poll(() => page.evaluate(() => ((CSS as unknown as { highlights: Map<string, Set<Range>> }).highlights.get('drillsat-hl')?.size ?? 0))).toBe(0);

    // reference sheet with rendered math
    await page.getByRole('button', { name: 'Reference sheet' }).click();
    await expect(page.getByRole('dialog', { name: 'Reference sheet' })).toBeVisible();
    expect(await page.locator('.refsheet .katex').count()).toBeGreaterThan(10);
    await page.keyboard.press('Escape');
    await expect(page.locator('.refsheet')).toHaveCount(0);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bank previews show math, not spoken alt text', async () => {
  const dir = tmp();
  const { app, page } = await launch(dir);
  try {
    await page.getByRole('button', { name: 'Question Bank' }).click();
    await page.locator('select.select').first().selectOption('math');
    await page.locator('.qlist .qitem').first().waitFor();
    const text = (await page.locator('.qlist .qitem .prev').allTextContents()).join(' ');
    expect(text).not.toMatch(/StartFraction|left parenthesis|EndRoot|\[figure\]/);
    await page.getByPlaceholder('keyword or question ID').fill('ac472881');
    await expect(page.locator('.qlist .qitem .prev').first()).toContainText('(12x + 28)/4 − s/13 = r(x − 8)');
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pacing feedback after checking, and the setting turns it off', async () => {
  const dir = tmp();
  const { app, page } = await launch(dir);
  try {
    await page.getByRole('button', { name: 'Practice', exact: true }).click();
    await page.locator('select.select').first().selectOption('rw');
    await page.getByRole('button', { name: 'Start session' }).click();
    await page.locator('.choice').first().click();
    await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    await expect(page.getByTestId('pace')).toContainText('SAT pace about 1:11');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel(/Pacing feedback/).uncheck();
    await page.getByRole('button', { name: /^Practice( •)?$/ }).click(); // the nav shows "Practice •" during a session
    await expect(page.locator('.result')).toBeVisible();
    await expect(page.getByTestId('pace')).toHaveCount(0);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('spaced review: missed questions come back when due and move up a box', async () => {
  const dir = tmp();
  const mathMcq = index.filter((e) => e.section === 'math' && e.type === 'mcq').slice(0, 2).map((e) => e.id);
  const past = Date.now() - 2 * 86400000;
  fs.writeFileSync(path.join(dir, 'progress.json'), JSON.stringify({
    version: 1, sessions: [{ id: 's1', startedAt: past, endedAt: past, section: 'math', skills: [], difficultyMode: 'mixed', questionIds: mathMcq, answers: mathMcq.map((id) => answerRecord(id, false, past)) }],
    levels: {}, streak: { current: 0, best: 1, lastDay: null }, reviewFlags: [],
    review: Object.fromEntries(mathMcq.map((id) => [id, { id, box: 0, due: past + 86400000, added: past, lapses: 1 }])),
  }));
  const { app, page } = await launch(dir);
  try {
    await expect(page.getByTestId('review-status')).toContainText('2 missed questions due today');
    await page.getByRole('button', { name: 'Review Math (2)' }).click();
    await expect(page.locator('.sessionbar')).toContainText('Spaced review');
    // answer the first one correctly
    const first = mathMcq[0];
    const q = JSON.parse(fs.readFileSync(path.join(BANK, 'q', first + '.json'), 'utf-8'));
    await page.getByRole('button', { name: new RegExp(`^Choice ${q.correct[0]}`) }).click();
    await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    await page.getByRole('button', { name: 'End session' }).click();
    await page.getByRole('button', { name: 'End and review' }).click();
    const p = readJson(dir, 'progress.json');
    expect(p.review[first].box).toBe(1);
    expect(p.review[first].due).toBeGreaterThan(Date.now());
    expect(p.review[mathMcq[1]].box).toBe(0);
    expect(p.sessions[p.sessions.length - 1].kind).toBe('review');
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('estimated score: needs 20 official answers, then shows a score and range', async () => {
  const dir = tmp();
  const { app: a1, page: p1 } = await launch(dir);
  await expect(p1.getByTestId('score-card')).toContainText('20 more official questions needed');
  await a1.close();
  const rw = index.filter((e) => e.section === 'rw').slice(0, 30);
  const now = Date.now();
  fs.writeFileSync(path.join(dir, 'progress.json'), JSON.stringify({
    version: 1, sessions: [{ id: 's1', startedAt: now, endedAt: now, section: 'rw', skills: [], difficultyMode: 'mixed', questionIds: rw.map((e) => e.id), answers: rw.map((e, i) => answerRecord(e.id, e.band <= 5 || i % 3 === 0, now + i)) }],
    levels: {}, streak: { current: 0, best: 0, lastDay: null }, reviewFlags: [],
  }));
  const { app, page } = await launch(dir);
  try {
    const card = page.getByTestId('score-card');
    await expect(card).toContainText(/likely \d{3}–\d{3} · 30 questions/);
    await expect(card).toContainText('needs both sections');
    await card.getByText('How is this estimated?').click();
    await expect(card).toContainText('College Board score band');
    await page.screenshot({ path: path.join(shots, '14-score-card.png') });
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** Answer every question of the current module with A (or 5 for grid-ins) and go to the review page. */
async function answerModule(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await expect(page.locator('.qcard .tag')).toHaveText(`Question ${i + 1}`);
    if (await page.locator('.spr input').count()) await page.locator('.spr input').fill('5');
    else await page.locator('.choice').first().click();
    await page.getByRole('button', { name: i + 1 < n ? 'Next' : 'Review', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Check your work' })).toBeVisible();
}

test('full-length practice test: modules, routing, break, scores, saved to progress', async () => {
  test.setTimeout(300000);
  const dir = tmp();
  const { app, page } = await launch(dir);
  try {
    await page.getByRole('button', { name: 'Practice Tests' }).click();
    await page.getByLabel(/^Full test/).check();
    await page.getByRole('button', { name: 'Start test' }).click();
    await expect(page.locator('.testbar')).toContainText('Reading and Writing · Module 1');
    await expect(page.getByRole('button', { name: 'AI Tutor' })).toHaveCount(0); // no AI help during a test
    await expect(page.locator('.badge.E, .badge.M, .badge.H')).toHaveCount(0); // no difficulty shown
    await page.screenshot({ path: path.join(shots, '15-test-question.png') });
    await answerModule(page, 27);
    await page.screenshot({ path: path.join(shots, '16-test-review.png') });
    await page.getByRole('button', { name: 'Submit module' }).click();
    await expect(page.locator('.testbar')).toContainText('Reading and Writing · Module 2');
    await answerModule(page, 27);
    await page.getByRole('button', { name: 'Submit module' }).click();
    await expect(page.getByRole('heading', { name: 'Break' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume testing' }).click();
    await expect(page.locator('.testbar')).toContainText('Math · Module 1');
    await expect(page.getByRole('button', { name: 'Reference sheet' })).toBeVisible();
    await answerModule(page, 22);
    await page.getByRole('button', { name: 'Submit module' }).click();
    await answerModule(page, 22);
    await page.getByRole('button', { name: 'Submit module' }).click();

    await expect(page.locator('.scores .stat')).toHaveCount(3);
    await expect(page.locator('.scores')).toContainText(/Total · likely \d{3,4}–\d{3,4}/);
    await page.screenshot({ path: path.join(shots, '17-test-results.png') });
    const p = readJson(dir, 'progress.json');
    expect(p.tests).toHaveLength(1);
    const t = p.tests[0];
    expect(t.answers).toHaveLength(98);
    expect(t.modules.map((m: { section: string; no: number; questionIds: string[] }) => `${m.section}${m.no}:${m.questionIds.length}`)).toEqual(['rw1:27', 'rw2:27', 'math1:22', 'math2:22']);
    expect(new Set(t.answers.map((a: { questionId: string }) => a.questionId)).size).toBe(98); // no repeats
    expect(t.total.score).toBe(t.scores.rw.score + t.scores.math.score);
    expect(p.sessions.filter((s: { kind?: string }) => s.kind === 'test')).toHaveLength(2);
    expect(fs.readFileSync(path.join(dir, 'active-test.json'), 'utf-8')).toBe('null');
    // a wrong answer goes into spaced review
    expect(Object.keys(p.review ?? {}).length).toBe(t.answers.filter((a: { correct: boolean }) => !a.correct).length);
    // open one question from the results: explanation is shown
    await page.locator('.qcell.result').first().click();
    await expect(page.locator('.rationale').first()).toBeVisible();
    await page.getByRole('button', { name: 'Back to results' }).click();
    await page.getByRole('button', { name: 'All tests' }).click();
    await expect(page.locator('.tbl')).toContainText(String(t.total.score));
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a test resumes after a restart with the time left, and the module submits when time runs out', async () => {
  test.setTimeout(180000);
  const dir = tmp();
  let { app, page } = await launch(dir);
  try {
    await page.getByRole('button', { name: 'Practice Tests' }).click();
    await page.getByLabel(/^Math only/).check();
    await page.getByRole('button', { name: 'Start test' }).click();
    await page.locator('.qcard').waitFor();
    if (await page.locator('.spr input').count()) await page.locator('.spr input').fill('7');
    else await page.locator('.choice').nth(2).click();
    await expect.poll(() => readJson(dir, 'active-test.json')?.answers && Object.keys(readJson(dir, 'active-test.json').answers).length).toBe(1);
    await app.close();

    // pretend only 4 seconds are left, then reopen
    const saved = readJson(dir, 'active-test.json');
    saved.remainingMs = 4000;
    fs.writeFileSync(path.join(dir, 'active-test.json'), JSON.stringify(saved));
    ({ app, page } = await launch(dir));
    await expect(page.locator('.home-hero')).toContainText('practice test in progress');
    await page.getByRole('button', { name: 'Resume test' }).click();
    await expect(page.locator('.testbar')).toContainText('Math · Module 1');
    const firstId = saved.modules[0].questionIds[0];
    expect(saved.answers[firstId].answer).toBeTruthy();
    // time runs out -> module 2 starts with a fresh 35 minutes
    await expect(page.locator('.testbar')).toContainText('Math · Module 2', { timeout: 15000 });
    await expect(page.locator('.testbar .timer')).toContainText(/3[45]:\d\d/);
    const after = readJson(dir, 'active-test.json');
    expect(after.modules).toHaveLength(2);
    expect(['easier', 'harder']).toContain(after.modules[1].level);
    // leave and discard
    await page.getByRole('button', { name: 'Exit' }).click();
    await page.getByRole('button', { name: 'Discard test' }).click();
    await expect(page.getByRole('button', { name: 'Start test' })).toBeVisible();
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('update status is reported (off during tests)', async () => {
  const dir = tmp();
  const { app, page } = await launch(dir);
  try {
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByTestId('update-status')).toContainText('Automatic updates are off');
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
