import { useState } from 'react';
import { useStore } from '../store';
import { liveStreak, skillStats } from '@shared/adaptive';
import type { Difficulty } from '@shared/types';
import { DIFFICULTY_LABEL, SECTION_LABEL } from '@shared/types';
import { FlameIcon } from '../components/icons';

export default function Performance() {
  const { progress, setLevel, resetProgress, index } = useStore();
  const [confirm, setConfirm] = useState(false);
  const answers = progress.sessions.flatMap((s) => s.answers);
  const correct = answers.filter((a) => a.correct).length;
  const stats = skillStats(answers);
  const byDiff = (['E', 'M', 'H'] as Difficulty[]).map((d) => {
    const list = answers.filter((a) => a.difficulty === d);
    return { d, attempts: list.length, correct: list.filter((a) => a.correct).length, avg: list.length ? list.reduce((x, a) => x + a.timeMs, 0) / list.length : 0 };
  });
  const domains = [...new Set(index.map((e) => e.domain))].map((dom) => {
    const list = answers.filter((a) => a.domain === dom);
    return { dom, attempts: list.length, correct: list.filter((a) => a.correct).length };
  }).filter((x) => x.attempts);
  const allSkills = [...new Map(index.map((e) => [e.skill, e])).values()].sort((a, b) => a.section.localeCompare(b.section) || a.domain.localeCompare(b.domain) || a.skill.localeCompare(b.skill));

  return (
    <div>
      <div className="grid3">
        <div className="stat"><div className="v">{answers.length}</div><div className="l">Questions answered in {progress.sessions.length} session{progress.sessions.length === 1 ? '' : 's'}</div></div>
        <div className="stat"><div className="v">{answers.length ? Math.round((100 * correct) / answers.length) : 0}%</div><div className="l">Overall accuracy</div></div>
        <div className="stat"><div className="v" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FlameIcon style={{ width: 26, color: '#f97316' }} />{liveStreak(progress.streak, Date.now())}</div><div className="l">Day streak · best {progress.streak.best}</div></div>
      </div>

      <div className="grid2" style={{ marginTop: 32 }}>
        <div className="card">
          <h2>By difficulty</h2>
          <table className="tbl"><thead><tr><th>Level</th><th>Accuracy</th><th>Attempts</th><th>Avg time</th></tr></thead><tbody>
            {byDiff.map((x) => <tr key={x.d}><td><span className={'badge ' + x.d}>{DIFFICULTY_LABEL[x.d]}</span></td><td><div className="row"><div className="bar"><div style={{ width: `${x.attempts ? Math.round((100 * x.correct) / x.attempts) : 0}%` }} /></div>{x.attempts ? Math.round((100 * x.correct) / x.attempts) : 0}%</div></td><td>{x.attempts}</td><td>{Math.round(x.avg / 1000)}s</td></tr>)}
          </tbody></table>
          <h3>By domain</h3>
          {domains.length === 0 ? <div className="muted">No data yet.</div> : (
            <table className="tbl"><tbody>
              {domains.map((x) => <tr key={x.dom}><td>{x.dom}</td><td style={{ width: 160 }}><div className="row"><div className="bar"><div style={{ width: `${Math.round((100 * x.correct) / x.attempts)}%` }} /></div>{Math.round((100 * x.correct) / x.attempts)}%</div></td><td>{x.correct}/{x.attempts}</td></tr>)}
            </tbody></table>
          )}
        </div>
        <div className="card">
          <h2>Session history</h2>
          {progress.sessions.length === 0 ? <div className="muted">No sessions yet.</div> : (
            <table className="tbl"><thead><tr><th>Date</th><th>Section</th><th>Mode</th><th>Score</th></tr></thead><tbody>
              {[...progress.sessions].reverse().slice(0, 30).map((s) => {
                const c = s.answers.filter((a) => a.correct).length;
                return <tr key={s.id}><td>{new Date(s.startedAt).toLocaleDateString()} <span className="muted small">{new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td><td>{SECTION_LABEL[s.section]}</td><td>{s.difficultyMode === 'adaptive' ? 'Adaptive' : s.difficultyMode === 'mixed' ? 'Mixed' : DIFFICULTY_LABEL[s.difficultyMode]}</td><td>{c}/{s.answers.length}</td></tr>;
              })}
            </tbody></table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 32 }}>
        <h2>Accuracy by topic &amp; adaptive level</h2>
        <div className="muted small mb">The adaptive level is the difficulty a new adaptive session starts at for that topic. Set it manually to override; choose “Auto” to go back to the computed level.</div>
        <table className="tbl"><thead><tr><th>Skill</th><th>Accuracy</th><th>E / M / H</th><th>Avg time</th><th>Level</th></tr></thead><tbody>
          {allSkills.map((e) => {
            const st = stats.find((s) => s.skill === e.skill);
            const manual = progress.levels['manual:' + e.skill];
            const level = progress.levels[e.skill];
            return (
              <tr key={e.skill}>
                <td>{e.skill}<div className="muted small">{SECTION_LABEL[e.section]} · {e.domain}</div></td>
                <td>{st ? <div className="row"><div className="bar"><div style={{ width: `${Math.round(st.accuracy * 100)}%` }} /></div>{Math.round(st.accuracy * 100)}% <span className="muted small">({st.correct}/{st.attempts})</span></div> : <span className="muted">—</span>}</td>
                <td className="small">{st ? (['E', 'M', 'H'] as Difficulty[]).map((d) => `${st.byDifficulty[d].correct}/${st.byDifficulty[d].attempts}`).join(' · ') : '—'}</td>
                <td>{st ? Math.round(st.avgTimeMs / 1000) + 's' : '—'}</td>
                <td>
                  <select className="select" style={{ minHeight: 32, padding: '4px 8px', width: 130 }} value={manual ?? 'auto'} onChange={(ev) => setLevel(e.skill, ev.target.value === 'auto' ? null : (ev.target.value as Difficulty))}>
                    <option value="auto">Auto ({level ? DIFFICULTY_LABEL[level] : 'Medium'})</option>
                    <option value="E">Easy</option><option value="M">Medium</option><option value="H">Hard</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody></table>
      </div>

      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        {confirm ? (
          <><span className="muted small">Delete all progress, sessions and streaks?</span><button className="btn sm danger" onClick={() => { void resetProgress(); setConfirm(false); }}>Yes, delete</button><button className="btn sm" onClick={() => setConfirm(false)}>Cancel</button></>
        ) : <button className="btn sm" onClick={() => setConfirm(true)}>Reset progress…</button>}
      </div>
    </div>
  );
}
