import { useEffect, useMemo, useState } from 'react';
import { useStore, type SessionConfig } from '../store';
import type { Difficulty, Question, Section, SessionRecord } from '@shared/types';
import { DIFFICULTY_LABEL, SECTION_LABEL } from '@shared/types';
import { topicsByDomain } from '@shared/topics';
import { TopicPicker } from '../components/TopicPicker';
import { skillStats } from '@shared/adaptive';
import { reviewSession } from '@shared/ai';
import { complete, AIRequestError } from '../api';
import QuestionView from '../components/QuestionView';
import { QuestionSkeleton } from '../components/Skeleton';
import { ClockIcon, SparkIcon } from '../components/icons';
import { fmtSeconds, pacingSummary } from '@shared/pacing';

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
}

export default function Practice() {
  const session = useStore((s) => s.session);
  const lastSession = useStore((s) => s.lastSession);
  if (session) return <Player />;
  if (lastSession) return <Summary rec={lastSession} />;
  return <Setup />;
}

// ---------------- setup ----------------
function Setup() {
  const { index, aiQuestions, startSession, settings, progress } = useStore();
  const [section, setSection] = useState<Section>('math');
  const [picked, setPicked] = useState<string[]>([]);
  const [diff, setDiff] = useState<Difficulty | 'adaptive' | 'mixed'>(settings.adaptiveEnabled ? 'adaptive' : 'mixed');
  const [count, setCount] = useState(10);
  const [includeAI, setIncludeAI] = useState(true);
  const [onlyUnseen, setOnlyUnseen] = useState(true);

  const groups = useMemo(() => topicsByDomain(index, section), [index, section]);
  const effective = picked;
  const available = index.filter((e) => e.section === section && (!effective.length || effective.includes(e.skill))).length + (includeAI ? aiQuestions.filter((q) => q.section === section).length : 0);

  const go = () => {
    const cfg: SessionConfig = { section, skills: picked, difficultyMode: diff, count, includeAI, onlyUnseen };
    void startSession(cfg);
  };

  return (
    <div className="grid2">
      <div className="card">
        <h2>New practice session</h2>
        <label className="field"><span>Section</span>
          <select className="select" value={section} onChange={(e) => { setSection(e.target.value as Section); setPicked([]); }}>
            <option value="math">Math</option><option value="rw">Reading and Writing</option>
          </select>
        </label>
        <label className="field mt"><span>Difficulty</span>
          <select className="select" value={diff} onChange={(e) => setDiff(e.target.value as typeof diff)}>
            <option value="adaptive">Adaptive (adjusts per topic as you go)</option>
            <option value="mixed">Mixed</option>
            <option value="E">Easy only</option><option value="M">Medium only</option><option value="H">Hard only</option>
          </select>
        </label>
        <label className="field mt"><span>Number of questions: {count}</span>
          <input type="range" min={3} max={40} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        </label>
        <div className="mt"><label className="switch"><input type="checkbox" checked={includeAI} onChange={(e) => setIncludeAI(e.target.checked)} /> Include AI-generated questions ({aiQuestions.filter((q) => q.section === section).length})</label></div>
        <div className="mt"><label className="switch"><input type="checkbox" checked={onlyUnseen} onChange={(e) => setOnlyUnseen(e.target.checked)} /> Prefer questions I haven’t seen</label></div>
        <div className="mt muted small">{available.toLocaleString()} questions available · timer {settings.timerEnabled ? 'on' : 'off'} (Settings)</div>
        <button className="btn primary block" style={{ marginTop: 24 }} onClick={go} disabled={!available}>Start session</button>
        {diff === 'adaptive' && (
          <div className="mt muted small">
            Each topic starts at its current level (badge next to the topic, default Medium) and moves up or down from your answers.
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Topics</h2>
          {picked.length > 0 ? <button className="btn sm" onClick={() => setPicked([])}>Clear ({picked.length})</button> : <span className="muted small">All topics</span>}
        </div>
        <TopicPicker groups={groups} value={picked} onChange={setPicked}
          badge={(s) => diff === 'adaptive' && progress.levels[s] ? <span className={'badge ' + progress.levels[s]}>{progress.levels[s]}</span> : null} />
      </div>
    </div>
  );
}

// ---------------- player ----------------
function Player() {
  const { session, getQuestion, sessionSetAnswer, sessionSubmit, sessionToggleMark, sessionNext, sessionGoto, sessionEnd, sessionDiscard, settings, showToast } = useStore();
  const [q, setQ] = useState<Question | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirmEnd, setConfirmEnd] = useState(false);
  const s = session!;
  const id = s.questionIds[s.idx];
  const a = s.answers[id];

  useEffect(() => {
    let live = true;
    setQ(null);
    getQuestion(id).then((x) => live && setQ(x)).catch((e) => showToast('Could not load question: ' + (e as Error).message, 'error'));
    return () => { live = false; };
  }, [id, getQuestion, showToast]);

  useEffect(() => {
    if (!settings.timerEnabled) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [settings.timerEnabled]);

  const answered = Object.values(s.answers).filter((x) => x.submitted).length;
  const total = s.config.count;
  const atEnd = s.idx + 1 >= s.questionIds.length && s.questionIds.length >= total;
  const sessionMs = now - s.startedAt;
  const qMs = a?.submitted ? a.timeMs : (a?.timeMs ?? 0) + (now - s.questionStartedAt);
  const modeLabel = s.config.kind === 'review' ? 'Spaced review' : s.config.difficultyMode === 'adaptive' ? `Adaptive · ${q ? DIFFICULTY_LABEL[q.difficulty] : ''}` : s.config.difficultyMode === 'mixed' ? 'Mixed difficulty' : DIFFICULTY_LABEL[s.config.difficultyMode];

  return (
    <div>
      <div className="sessionbar">
        <span className="count">Question {s.idx + 1} <span className="muted">of {total}</span></span>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered} aria-label="Questions answered"><div style={{ width: '100%', transform: `scaleX(${answered / total})` }} /></div>
        {settings.timerEnabled && <span className="timer" title="This question / whole session"><ClockIcon /> {fmt(qMs)} <span className="muted">/ {fmt(sessionMs)}</span></span>}
        <span className="pill blue">{SECTION_LABEL[s.config.section]}: {modeLabel}</span>
        <button className="btn sm" onClick={() => setConfirmEnd(true)}>End session</button>
      </div>

      {!q ? <QuestionSkeleton /> : (
        <div className="qenter" key={q.id}>
          <QuestionView
            question={q} answer={a?.answer ?? null} submitted={!!a?.submitted} marked={!!a?.marked}
            onAnswer={sessionSetAnswer} onSubmit={() => void sessionSubmit()} onToggleMark={sessionToggleMark} timeMs={a?.submitted ? a.timeMs : undefined}
            onPrev={() => sessionGoto(s.idx - 1)} prevDisabled={s.idx === 0}
            onNext={atEnd ? () => setConfirmEnd(true) : () => void sessionNext()} nextLabel={atEnd ? 'Finish' : 'Next'}
          />
        </div>
      )}

      <div className="row mt" style={{ gap: 6 }}>
        {s.questionIds.map((qid, i) => {
          const x = s.answers[qid];
          const cls = x?.submitted ? (x.correct ? 'green' : 'red') : x?.answer ? 'blue' : 'gray';
          return <button key={qid} className={'pill ' + cls} style={{ padding: '2px 10px', fontSize: 12, outline: i === s.idx ? '2px solid var(--blue)' : 'none', border: 0 }} onClick={() => sessionGoto(i)}>{i + 1}{x?.marked ? ' ⚑' : ''}</button>;
        })}
      </div>

      {confirmEnd && (
        <div className="modal-bg" onClick={() => setConfirmEnd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>End this session?</h2>
            <p className="muted">{answered} of {total} questions answered. Answered questions are saved to your progress; unanswered ones are dropped.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirmEnd(false)}>Keep going</button>
              {answered === 0 && <button className="btn danger" onClick={() => { sessionDiscard(); }}>Discard</button>}
              <button className="btn primary" onClick={() => void sessionEnd()} disabled={answered === 0}>End and review</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- summary ----------------
function Summary({ rec }: { rec: SessionRecord }) {
  const { getQuestion, attachReview, startSession, nav, settings } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const correct = rec.answers.filter((a) => a.correct).length;
  const stats = skillStats(rec.answers);
  const totalMs = rec.answers.reduce((x, a) => x + a.timeMs, 0);
  const review = rec.review;

  const runReview = async () => {
    setBusy(true);
    setErr(null);
    try {
      const qs: Record<string, Question | undefined> = {};
      await Promise.all(rec.answers.map(async (a) => { qs[a.questionId] = await getQuestion(a.questionId).catch(() => undefined); }));
      const r = await reviewSession(rec.answers, qs, complete);
      await attachReview(rec.id, r);
    } catch (e) {
      setErr(e instanceof AIRequestError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!review && settings.hasLlmKey && navigator.onLine) void runReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.id]);

  return (
    <div>
      <div className="grid3">
        <div className="stat"><div className="v">{correct} / {rec.answers.length}</div><div className="l">Correct ({Math.round((100 * correct) / rec.answers.length)}%)</div></div>
        <div className="stat"><div className="v">{fmt(totalMs / rec.answers.length)}</div><div className="l">Average time per question</div></div>
        <div className="stat"><div className="v">{rec.answers.filter((a) => a.marked).length}</div><div className="l">Marked for review</div></div>
      </div>
      {settings.pacingFeedback && pacingSummary(rec.answers).map((p) => (
        <div key={p.section} className={'pace-card' + (p.verdict === 'slow' ? ' slow' : '')} data-testid="pace-summary">
          <strong>Pacing ({SECTION_LABEL[p.section]}):</strong> {fmtSeconds(p.avgMs)} per question on average; the real test allows about {fmtSeconds(p.targetMs)}.
          {p.verdict === 'slow' ? ' You are slower than test pace.' : p.verdict === 'fast' ? ' You are well ahead of test pace; check your work.' : ' You are on pace.'}
          {p.slow > 0 && ` ${p.slow} question${p.slow === 1 ? '' : 's'} took more than 1.5× the pace.`}
        </div>
      ))}
      <div className="grid2" style={{ marginTop: 32 }}>
        <div className="card">
          <h2>By topic</h2>
          <table className="tbl"><thead><tr><th>Skill</th><th>Correct</th><th>Avg time</th></tr></thead><tbody>
            {stats.map((st) => <tr key={st.skill}><td>{st.skill}</td><td>{st.correct}/{st.attempts}</td><td>{fmt(st.avgTimeMs)}</td></tr>)}
          </tbody></table>
          <div className="row mt">
            <button className="btn primary" onClick={() => startSession({ section: rec.section, skills: rec.skills, difficultyMode: rec.difficultyMode, count: rec.answers.length || 10, includeAI: true, onlyUnseen: true })}>Another session like this</button>
            <button className="btn" onClick={() => useStore.setState({ lastSession: null })}>New session…</button>
            <button className="btn" onClick={() => nav('performance')}>Performance</button>
          </div>
        </div>
        <div className="card">
          <h2><SparkIcon style={{ width: 18, verticalAlign: '-3px' }} /> AI review</h2>
          {busy && <div className="row"><span className="spinner" /> Analyzing your session…</div>}
          {err && <div className="error">{err} {!settings.hasLlmKey && <button className="btn sm" onClick={() => nav('settings')}>Settings</button>}</div>}
          {!review && !busy && !err && <div className="muted">{settings.hasLlmKey ? 'Not generated yet.' : 'Add an LLM API key in Settings to get an AI review of each session.'}</div>}
          {!review && !busy && settings.hasLlmKey && <button className="btn sm mt" onClick={runReview}>Generate review</button>}
          {review && (
            <div>
              <p>{review.summary}</p>
              {review.weakTopics.length > 0 && <><h3>Weak topics</h3><ul>{review.weakTopics.map((w) => <li key={w.skill}><strong>{w.skill}</strong> ({Math.round(w.accuracy * 100)}%): {w.note}</li>)}</ul></>}
              {review.mistakePatterns.length > 0 && <><h3>Mistake patterns</h3><ul>{review.mistakePatterns.map((m, i) => <li key={i}>{m}</li>)}</ul></>}
              {review.pacing && <><h3>Pacing</h3><p>{review.pacing}</p></>}
              <h3>Recommended next session</h3>
              <p>{SECTION_LABEL[review.nextSession.section]} · {review.nextSession.skills.join(', ') || 'all topics'} · {review.nextSession.difficulty === 'mixed' ? 'mixed' : DIFFICULTY_LABEL[review.nextSession.difficulty]} · {review.nextSession.count} questions<br /><span className="muted small">{review.nextSession.reason}</span></p>
              <button className="btn primary sm" onClick={() => startSession({ section: review.nextSession.section, skills: review.nextSession.skills, difficultyMode: review.nextSession.difficulty, count: review.nextSession.count, includeAI: true, onlyUnseen: true })}>Start recommended session</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
