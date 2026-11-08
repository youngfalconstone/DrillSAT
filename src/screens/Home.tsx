import { useStore } from '../store';
import { liveStreak, skillStats } from '@shared/adaptive';
import { DIFFICULTY_LABEL } from '@shared/types';
import { FlameIcon } from '../components/icons';

export default function Home() {
  const { progress, nav, session, startSession, index, aiQuestions, settings } = useStore();
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
        <h2>{session ? 'You have a session in progress' : 'Ready to practice?'}</h2>
        <p>{session ? 'Pick up where you left off.' : `${index.length.toLocaleString()} official questions${aiQuestions.length ? ` and ${aiQuestions.length} AI-generated` : ''} are ready. Quick sessions adapt to your level per topic.`}</p>
        <div className="row">
          {session ? (
            <button className="btn primary" onClick={() => nav('practice')}>Continue session</button>
          ) : (
            <>
              <button className="btn primary" onClick={() => quick('math')}>Quick Math session (10)</button>
              <button className="btn primary" onClick={() => quick('rw')}>Quick Reading &amp; Writing (10)</button>
              <button className="btn" style={{ color: '#fff', borderColor: '#94a3b8', background: 'transparent' }} onClick={() => nav('practice')}>Custom session…</button>
            </>
          )}
        </div>
      </div>

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
                <tr key={w.skill}><td>{w.skill}<div className="muted small">{w.domain}</div></td><td style={{ width: 120 }}><div className="bar"><div style={{ width: `${Math.round(w.accuracy * 100)}%` }} /></div></td><td style={{ width: 60 }}>{Math.round(w.accuracy * 100)}%</td>
                  <td style={{ width: 90 }}><button className="btn sm" onClick={() => startSession({ section: w.section as 'math' | 'rw', skills: [w.skill], difficultyMode: 'adaptive', count: 8, includeAI: false, onlyUnseen: true })}>Drill</button></td></tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="card">
          <h2>Last session</h2>
          {!last ? <div className="muted">No sessions yet.</div> : (
            <div>
              <div>{new Date(last.startedAt).toLocaleString()} · {last.section === 'math' ? 'Math' : 'Reading and Writing'} · {last.difficultyMode === 'adaptive' ? 'Adaptive' : last.difficultyMode === 'mixed' ? 'Mixed' : DIFFICULTY_LABEL[last.difficultyMode]}</div>
              <div className="mt"><span className="pill green">{last.answers.filter((a) => a.correct).length} / {last.answers.length} correct</span></div>
              {last.review && <p className="muted small">{last.review.summary}</p>}
              <button className="btn sm mt" onClick={() => nav('performance')}>View performance</button>
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
