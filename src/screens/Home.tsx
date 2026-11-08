import { useStore } from '../store';
import { liveStreak, skillStats } from '@shared/adaptive';
import { modeLabel } from '@shared/types';
import { topicLabel } from '@shared/topics';
import { FlameIcon } from '../components/icons';
import { ScoreCard } from '../components/ScoreCard';
import { dueIds, nextDue } from '@shared/review';
import type { Section } from '@shared/types';

export default function Home() {
  const { progress, nav, session, startSession, index, aiQuestions, settings, test } = useStore();
  const now = Date.now();
  const queue = progress.review ?? {};
  const sectionOf = new Map<string, Section>([...index.map((e) => [e.id, e.section] as const), ...aiQuestions.map((q) => [q.id, q.section] as const)]);
  const due = dueIds(queue, now).filter((id) => sectionOf.has(id));
  const dueBy = (s: Section) => due.filter((id) => sectionOf.get(id) === s);
  const next = nextDue(queue, now);
  const startReview = (s: Section) => {
    const ids = dueBy(s);
    void startSession({ section: s, skills: [], difficultyMode: 'mixed', count: ids.length, includeAI: true, onlyUnseen: false, kind: 'review' }, ids);
  };
  const bigger: Section = dueBy('math').length >= dueBy('rw').length ? 'math' : 'rw';
  const answers = progress.sessions.flatMap((s) => s.answers);
  const correct = answers.filter((a) => a.correct).length;
  const streak = liveStreak(progress.streak, Date.now());
  const weak = skillStats(answers).filter((s) => s.attempts >= 3).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  const last = progress.sessions[progress.sessions.length - 1];

  const quick = (section: 'math' | 'rw') =>
    startSession({ section, skills: [], difficultyMode: settings.adaptiveEnabled ? 'adaptive' : 'mixed', count: 10, includeAI: false, onlyUnseen: true });

  return (
    <div>
      <div className="home-hero">
        <h2>{test ? 'You have a practice test in progress' : session ? 'You have a session in progress' : 'Ready to practice?'}</h2>
        <p>{session ? 'Pick up where you left off.' : `${index.length.toLocaleString()} official questions${aiQuestions.length ? ` and ${aiQuestions.length} AI-generated` : ''} are ready. Quick sessions adapt to your level per topic.`}</p>
        <div className="row">
          {test ? (
            <button className="btn primary" onClick={() => nav('tests')}>Resume test</button>
          ) : session ? (
            <button className="btn primary" onClick={() => nav('practice')}>Continue session</button>
          ) : (
            <>
              <button className="btn primary" onClick={() => quick('math')}>Quick Math session (10)</button>
              <button className="btn primary" onClick={() => quick('rw')}>Quick Reading &amp; Writing (10)</button>
              {due.length > 0 && <button className="btn primary" onClick={() => startReview(bigger)}>Review missed ({dueBy(bigger).length})</button>}
              <button className="btn" style={{ color: '#fff', borderColor: '#94a3b8', background: 'transparent' }} onClick={() => nav('practice')}>Custom session…</button>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 32 }}><ScoreCard /></div>

      <div className="grid3" style={{ marginTop: 32 }}>
        <div className="stat"><div className="v">{answers.length}</div><div className="l">Questions answered</div></div>
        <div className="stat"><div className="v">{answers.length ? Math.round((100 * correct) / answers.length) : 0}%</div><div className="l">Overall accuracy</div></div>
        <div className="stat"><div className="v" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FlameIcon style={{ width: 26, color: streak ? '#f97316' : 'var(--border-2)' }} />{streak}</div><div className="l">Day streak (best {progress.streak.best})</div></div>
      </div>

      <div className="grid2" style={{ marginTop: 32 }}>
        <div className="card">
          <h2>Weakest topics</h2>
          {weak.length === 0 ? <div className="muted">Answer a few questions and your weakest topics will show up here.</div> : (
            <table className="tbl"><tbody>
              {weak.map((w) => (
                <tr key={w.skill}><td title={w.skill}>{topicLabel(w.skill)}<div className="muted small">{w.domain}</div></td><td style={{ width: 120 }}><div className="bar"><div style={{ width: `${Math.round(w.accuracy * 100)}%` }} /></div></td><td style={{ width: 60 }}>{Math.round(w.accuracy * 100)}%</td>
                  <td style={{ width: 90 }}><button className="btn sm" onClick={() => startSession({ section: w.section as 'math' | 'rw', skills: [w.skill], difficultyMode: 'adaptive', count: 8, includeAI: false, onlyUnseen: true })}>Drill</button></td></tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="card">
          <h2>Last session</h2>
          {!last ? <div className="muted">No sessions yet.</div> : (
            <div>
              <div>{new Date(last.startedAt).toLocaleString()} · {last.section === 'math' ? 'Math' : 'Reading and Writing'} · {modeLabel(last.difficultyMode)}</div>
              <div className="mt"><span className="pill green">{last.answers.filter((a) => a.correct).length} / {last.answers.length} correct</span></div>
              {last.review && <p className="muted small">{last.review.summary}</p>}
              <button className="btn sm mt" onClick={() => nav('performance')}>View performance</button>
            </div>
          )}
          <h3>Spaced review</h3>
          <div className="muted small" data-testid="review-status">
            {due.length ? `${due.length} missed question${due.length === 1 ? '' : 's'} due today.` : Object.keys(queue).length ? `Nothing due today. ${Object.keys(queue).length} in the queue${next ? `, next on ${new Date(next).toLocaleDateString()}` : ''}.` : 'Questions you miss come back after 1, 3 and 7 days until you get them right.'}
          </div>
          {due.length > 0 && (
            <div className="row mt">
              {(['math', 'rw'] as Section[]).filter((x) => dueBy(x).length).map((x) => (
                <button key={x} className="btn sm" onClick={() => startReview(x)}>Review {x === 'math' ? 'Math' : 'Reading & Writing'} ({dueBy(x).length})</button>
              ))}
            </div>
          )}
          <h3>Marked for review</h3>
          <div className="muted small">{progress.reviewFlags.length} question{progress.reviewFlags.length === 1 ? '' : 's'} flagged.{' '}
            {progress.reviewFlags.length > 0 && <button className="btn sm" onClick={() => startSession({ section: 'math', skills: [], difficultyMode: 'mixed', count: progress.reviewFlags.length, includeAI: true, onlyUnseen: false }, progress.reviewFlags)}>Practice flagged</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
