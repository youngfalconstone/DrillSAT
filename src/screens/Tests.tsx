import { useEffect, useMemo, useState } from 'react';
import { testRemaining, useStore, type ActiveTest } from '../store';
import type { Question, Section, TestRecord } from '@shared/types';
import { DOMAINS, SECTION_LABEL } from '@shared/types';
import { BREAK_MINUTES, MODULE_SPEC } from '@shared/testForm';
import { fmtSeconds, pacingSummary } from '@shared/pacing';
import QuestionView from '../components/QuestionView';
import { QuestionSkeleton } from '../components/Skeleton';
import { ScoreExplainer } from '../components/ScoreCard';
import { BookmarkIcon, ChevronLeft, ClockIcon, TestIcon } from '../components/icons';

const SECTION_SETS: { id: string; label: string; sections: Section[]; minutes: number }[] = [
  { id: 'full', label: 'Full test', sections: ['rw', 'math'], minutes: 2 * MODULE_SPEC.rw.minutes + 2 * MODULE_SPEC.math.minutes + BREAK_MINUTES },
  { id: 'rw', label: 'Reading and Writing only', sections: ['rw'], minutes: 2 * MODULE_SPEC.rw.minutes },
  { id: 'math', label: 'Math only', sections: ['math'], minutes: 2 * MODULE_SPEC.math.minutes },
];

function clock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function Tests() {
  const { test, lastTest } = useStore();
  if (test) return <TestPlayer t={test} />;
  if (lastTest) return <TestResults rec={lastTest} />;
  return <TestHome />;
}

// ---------------- start ----------------
function TestHome() {
  const { startTest, progress, openTestResult } = useStore();
  const [pick, setPick] = useState('full');
  const set = SECTION_SETS.find((s) => s.id === pick)!;
  const tests = [...(progress.tests ?? [])].reverse();
  return (
    <div className="grid2">
      <div className="card">
        <h2>Full-length practice test</h2>
        <p className="muted">Timed like the digital SAT: each section has two modules, and module 2 gets harder or easier depending on how module 1 went. No answers are shown until the end. Desmos and the reference sheet are available in Math.</p>
        <div className="checks mt" role="radiogroup" aria-label="Test length">
          {SECTION_SETS.map((s) => (
            <label key={s.id} className="check">
              <input type="radio" name="testset" checked={pick === s.id} onChange={() => setPick(s.id)} />
              <span>{s.label} <span className="muted small">· {Math.floor(s.minutes / 60)} h {s.minutes % 60} min</span></span>
            </label>
          ))}
        </div>
        <ul className="muted small mt">
          {set.sections.includes('rw') && <li>Reading and Writing: 2 modules × {MODULE_SPEC.rw.count} questions, {MODULE_SPEC.rw.minutes} minutes each</li>}
          {set.sections.length > 1 && <li>{BREAK_MINUTES}-minute break</li>}
          {set.sections.includes('math') && <li>Math: 2 modules × {MODULE_SPEC.math.count} questions, {MODULE_SPEC.math.minutes} minutes each</li>}
        </ul>
        <button className="btn primary block" style={{ marginTop: 24 }} onClick={() => void startTest(set.sections)}>Start test</button>
        <p className="muted small mt">Your progress saves as you go. If you close the app, the test resumes where you left off with the clock paused.</p>
      </div>
      <div className="card">
        <h2>Past tests</h2>
        {tests.length === 0 ? <div className="empty"><TestIcon /><div>No tests yet.</div></div> : (
          <table className="tbl"><thead><tr><th>Date</th><th>R&amp;W</th><th>Math</th><th>Total</th><th /></tr></thead><tbody>
            {tests.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.startedAt).toLocaleDateString()}</td>
                <td>{t.scores.rw ? t.scores.rw.score : '—'}</td>
                <td>{t.scores.math ? t.scores.math.score : '—'}</td>
                <td>{t.total ? t.total.score : '—'}</td>
                <td><button className="btn sm" onClick={() => openTestResult(t)}>View</button></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
    </div>
  );
}

// ---------------- player ----------------
function TestPlayer({ t }: { t: ActiveTest }) {
  const { getQuestion, testGoto, testSetAnswer, testToggleMark, testShowReview, testSubmitModule, testEndBreak, testAbandon, nav } = useStore();
  const mod = t.modules[t.modules.length - 1];
  const id = mod.questionIds[t.idx];
  const [q, setQ] = useState<Question | null>(null);
  const [now, setNow] = useState(Date.now());
  const [hideClock, setHideClock] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'submit' | 'exit'>(null);
  const remaining = testRemaining(t, now);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(iv);
  }, []);
  // time is up: the module is submitted as is; a break simply ends
  useEffect(() => {
    if (remaining > 0) return;
    if (t.phase === 'break') void testEndBreak();
    else void testSubmitModule();
  }, [remaining, t.phase, testEndBreak, testSubmitModule]);
  useEffect(() => {
    let live = true;
    setQ(null);
    if (t.phase === 'module' && id) void getQuestion(id).then((x) => live && setQ(x));
    return () => { live = false; };
  }, [id, t.phase, getQuestion]);

  const title = `${SECTION_LABEL[mod.section]} · Module ${mod.no}`;
  const unanswered = mod.questionIds.filter((x) => !t.answers[x]?.answer).length;

  if (t.phase === 'break') {
    return (
      <div className="card test-break">
        <h2>Break</h2>
        <div className="big-clock" aria-live="polite">{clock(remaining)}</div>
        <p className="muted">Next: {SECTION_LABEL[t.sections[t.sections.indexOf(mod.section) + 1]]}. The test continues automatically when the break ends.</p>
        <button className="btn primary" onClick={() => void testEndBreak()}>Resume testing</button>
      </div>
    );
  }

  const grid = (
    <div className="qgrid">
      {mod.questionIds.map((qid, i) => {
        const a = t.answers[qid];
        return (
          <button key={qid} className={'qcell' + (a?.answer ? ' answered' : '') + (i === t.idx && t.phase === 'module' ? ' current' : '')}
            onClick={() => { setGridOpen(false); testGoto(i); }} aria-label={`Question ${i + 1}${a?.answer ? ', answered' : ', unanswered'}${a?.marked ? ', marked for review' : ''}`}>
            {i + 1}{a?.marked && <BookmarkIcon filled className="qcell-flag" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      <div className="sessionbar testbar">
        <span className="count">{title}</span>
        <span className={'timer' + (remaining < 5 * 60000 ? ' warn' : '')} aria-live="off">
          <ClockIcon /> {hideClock ? <span className="muted">hidden</span> : clock(remaining)}
          <button className="linkbtn" onClick={() => setHideClock(!hideClock)}>{hideClock ? 'Show' : 'Hide'}</button>
        </span>
        <span className="muted small">{mod.questionIds.length - unanswered} of {mod.questionIds.length} answered</span>
        <button className="btn sm" onClick={() => setConfirm('exit')}>Exit</button>
      </div>

      {t.phase === 'review' ? (
        <div className="card">
          <h2>Check your work</h2>
          <p className="muted">On test day you can't come back to a module after you submit it. Unanswered: {unanswered}. Marked for review: {mod.questionIds.filter((x) => t.answers[x]?.marked).length}.</p>
          {grid}
          <div className="row mt" style={{ justifyContent: 'space-between' }}>
            <button className="btn" onClick={() => testGoto(mod.questionIds.length - 1)}><ChevronLeft /> Back</button>
            <button className="btn primary" onClick={() => (unanswered ? setConfirm('submit') : void testSubmitModule())}>Submit module</button>
          </div>
        </div>
      ) : !q ? <QuestionSkeleton /> : (
        <div className="qenter" key={q.id}>
          <QuestionView
            mode="test" testLabel={`Question ${t.idx + 1}`}
            question={q} answer={t.answers[id]?.answer ?? null} submitted={false} marked={!!t.answers[id]?.marked}
            onAnswer={testSetAnswer} onSubmit={() => undefined} onToggleMark={testToggleMark}
            onPrev={() => testGoto(t.idx - 1)} prevDisabled={t.idx === 0}
            onNext={t.idx + 1 >= mod.questionIds.length ? testShowReview : () => testGoto(t.idx + 1)}
            nextLabel={t.idx + 1 >= mod.questionIds.length ? 'Review' : 'Next'}
          />
          <div className="row mt" style={{ justifyContent: 'center' }}>
            <button className="btn sm" onClick={() => setGridOpen(!gridOpen)} aria-expanded={gridOpen}>Question {t.idx + 1} of {mod.questionIds.length} ▴</button>
          </div>
          {gridOpen && <div className="card mt">{grid}<div className="row mt"><button className="btn sm" onClick={() => { setGridOpen(false); testShowReview(); }}>Go to review page</button></div></div>}
        </div>
      )}

      {confirm && (
        <div className="modal-bg" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {confirm === 'submit' ? (
              <>
                <h2>Submit with {unanswered} unanswered?</h2>
                <p className="muted">Unanswered questions count as incorrect. There is no penalty for guessing.</p>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setConfirm(null)}>Keep working</button>
                  <button className="btn primary" onClick={() => { setConfirm(null); void testSubmitModule(); }}>Submit module</button>
                </div>
              </>
            ) : (
              <>
                <h2>Leave the test?</h2>
                <p className="muted">Your answers are saved. You can come back to this test from Practice Tests; the clock keeps the time you have left.</p>
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setConfirm(null)}>Keep going</button>
                  <button className="btn danger" onClick={() => { setConfirm(null); void testAbandon(); }}>Discard test</button>
                  <button className="btn primary" onClick={() => { setConfirm(null); nav('home'); }}>Save and leave</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- results ----------------
function TestResults({ rec }: { rec: TestRecord }) {
  const { getQuestion, settings, openTestResult, index } = useStore();
  const [open, setOpen] = useState<{ q: Question; answer: string | null; timeMs: number } | null>(null);
  const byId = useMemo(() => new Map(index.map((e) => [e.id, e])), [index]);
  const pace = pacingSummary(rec.answers);

  if (open) {
    return (
      <div>
        <button className="btn sm mb" onClick={() => setOpen(null)}><ChevronLeft /> Back to results</button>
        <QuestionView question={open.q} answer={open.answer} submitted marked={false} timeMs={open.timeMs}
          onAnswer={() => undefined} onSubmit={() => undefined} onToggleMark={() => undefined} />
      </div>
    );
  }

  return (
    <div>
      <div className="row mb" style={{ justifyContent: 'space-between' }}>
        <span className="muted">{new Date(rec.startedAt).toLocaleString()}</span>
        <button className="btn sm" onClick={() => openTestResult(null)}>All tests</button>
      </div>
      <div className="grid3 scores">
        {rec.total && (
          <div className="stat"><div className="v">{rec.total.score}</div><div className="l">Total · likely {rec.total.low}–{rec.total.high}</div></div>
        )}
        {rec.sections.map((s) => {
          const sc = rec.scores[s]!;
          return <div key={s} className="stat"><div className="v">{sc.score}</div><div className="l">{SECTION_LABEL[s]} · likely {sc.low}–{sc.high} · {sc.correct}/{sc.total} correct</div></div>;
        })}
      </div>
      <ScoreExplainer context="test" />

      <div className="grid2" style={{ marginTop: 32 }}>
        <div className="card">
          <h2>By domain</h2>
          <table className="tbl"><thead><tr><th>Domain</th><th>Correct</th></tr></thead><tbody>
            {rec.sections.flatMap((s) => DOMAINS[s].map((d) => {
              const list = rec.answers.filter((a) => a.section === s && a.domain === d);
              return list.length ? <tr key={s + d}><td>{d}<div className="muted small">{SECTION_LABEL[s]}</div></td><td>{list.filter((a) => a.correct).length}/{list.length}</td></tr> : null;
            }))}
          </tbody></table>
        </div>
        <div className="card">
          <h2>Modules</h2>
          <table className="tbl"><thead><tr><th>Module</th><th>Correct</th><th>Time used</th></tr></thead><tbody>
            {rec.modules.map((m) => {
              const ids = new Set(m.questionIds);
              const list = rec.answers.filter((a) => ids.has(a.questionId));
              return (
                <tr key={m.section + m.no}>
                  <td>{SECTION_LABEL[m.section]} {m.no}{m.no === 2 && <div className="muted small">{m.level === 'harder' ? 'Harder module' : 'Easier module'}</div>}</td>
                  <td>{list.filter((a) => a.correct).length}/{list.length}</td>
                  <td>{clock(m.timeUsedMs)} <span className="muted small">of {clock(m.timeLimitMs)}</span></td>
                </tr>
              );
            })}
          </tbody></table>
          {settings.pacingFeedback && pace.map((p) => (
            <p key={p.section} className="small mt">
              <strong>{SECTION_LABEL[p.section]} pacing:</strong> {fmtSeconds(p.avgMs)} per question on average (test pace {fmtSeconds(p.targetMs)}); {p.slow} question{p.slow === 1 ? '' : 's'} took more than 1.5× the pace.
            </p>
          ))}
        </div>
      </div>

      {rec.modules.map((m) => (
        <div key={'q' + m.section + m.no} className="card" style={{ marginTop: 32 }}>
          <h2>{SECTION_LABEL[m.section]} · Module {m.no}</h2>
          <div className="qgrid">
            {m.questionIds.map((qid, i) => {
              const a = rec.answers.find((x) => x.questionId === qid);
              return (
                <button key={qid} className={'qcell result ' + (a?.correct ? 'ok' : a?.answer ? 'bad' : 'skip')}
                  title={`${byId.get(qid)?.skill ?? ''}${a?.answer ? '' : ' (no answer)'}`}
                  onClick={() => void getQuestion(qid).then((q) => setOpen({ q, answer: a?.answer ?? null, timeMs: a?.timeMs ?? 0 }))}
                  aria-label={`Question ${i + 1}, ${a?.correct ? 'correct' : a?.answer ? 'incorrect' : 'unanswered'}`}>
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
