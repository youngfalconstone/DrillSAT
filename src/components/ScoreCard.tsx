import { useMemo } from 'react';
import { useStore } from '../store';
import type { Section } from '@shared/types';
import { SECTION_LABEL } from '@shared/types';
import { combineTotal, estimateFromHistory, isEstimate, MIN_ITEMS, RECENT_ITEMS, type ScoreEstimate } from '@shared/score';

/** Estimated SAT score from recent official questions (all practice and tests). */
export function ScoreCard({ compact }: { compact?: boolean }) {
  const { progress, index, nav } = useStore();
  const est = useMemo(() => {
    const byId = new Map(index.map((e) => [e.id, e]));
    const answers = progress.sessions.flatMap((s) => s.answers);
    const bandOf = (id: string) => {
      const e = byId.get(id);
      return e?.band ? { band: e.band, type: e.type } : undefined;
    };
    return { rw: estimateFromHistory('rw', answers, bandOf), math: estimateFromHistory('math', answers, bandOf) };
  }, [progress.sessions, index]);
  const total = isEstimate(est.rw) && isEstimate(est.math) ? combineTotal(est.rw, est.math) : null;

  const cell = (s: Section) => {
    const e = est[s];
    return (
      <div className="score-cell" key={s}>
        <div className="muted small">{SECTION_LABEL[s]}</div>
        {isEstimate(e) ? (
          <>
            <div className="score-v">{e.score}</div>
            <div className="muted small">likely {e.low}–{e.high} · {e.n} questions</div>
          </>
        ) : (
          <>
            <div className="score-v muted">—</div>
            <div className="muted small">{e.needed} more official question{e.needed === 1 ? '' : 's'} needed</div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="card score-card" data-testid="score-card">
      <div className="card-head">
        <h2>Estimated SAT score</h2>
        {!compact && <button className="btn sm" onClick={() => nav('tests')}>Take a practice test</button>}
      </div>
      <div className="score-row">
        <div className="score-cell">
          <div className="muted small">Total</div>
          {total ? (<><div className="score-v">{total.score}</div><div className="muted small">likely {total.low}–{total.high}</div></>) : (<><div className="score-v muted">—</div><div className="muted small">needs both sections</div></>)}
        </div>
        {cell('rw')}
        {cell('math')}
      </div>
      <ScoreExplainer context="history" />
    </div>
  );
}

export function ScoreExplainer({ context }: { context: 'history' | 'test' }) {
  return (
    <details className="explainer small">
      <summary>How is this estimated?</summary>
      <p>
        Every official question has a College Board score band (1–7). College Board placed each question in the lowest band whose
        students answer it correctly at least two thirds of the time, and publishes the score range of each band. DrillSAT uses those
        bands to place each question on the 200–800 scale and finds the scores that best explain your right and wrong answers, starting
        from the score distribution of SAT takers.
        {context === 'history'
          ? ` It uses your first try at each of your last ${RECENT_ITEMS} official questions per section (at least ${MIN_ITEMS}); AI-generated questions and repeats don't count.`
          : ' A practice test uses both modules of each section, like the real test.'}
      </p>
      <p>
        The range is where your score most likely falls (80% of the time in simulations). With a full section it is about as wide as the
        ±30 points College Board reports for real scores. Practising only your weakest topics pulls the estimate down; a full-length
        practice test gives the most reliable number. Above about 750 the official bank has few questions hard enough to tell scores
        apart, so the top of the scale is the least certain.
      </p>
    </details>
  );
}

export type { ScoreEstimate };
