import type { Solution } from '@shared/ai';
import { mdToHtml, textToHtml } from '@shared/ai';
import QuestionHtml from './QuestionHtml';
import { LinesSkeleton } from './Skeleton';
import { CheckIcon, SparkIcon } from './icons';

export type SolutionState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; solution: Solution }
  | { kind: 'fallback'; text: string }
  | { kind: 'error'; message: string };

const BulbIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.5h6c0-1.2.4-1.9 1-2.5A6 6 0 0 0 12 3z" /></svg>
);
const ListIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.2" /><circle cx="4.5" cy="12" r="1.2" /><circle cx="4.5" cy="18" r="1.2" /></svg>
);
const WarnIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></svg>
);

/** Designed rendering of an AI step-by-step solution (structured), with skeleton, fallback and error states. */
export default function SolutionPanel({ state, onSolve }: { state: SolutionState; onSolve: () => void }) {
  if (state.kind === 'idle') {
    return (
      <div className="sol-cta">
        <button className="btn sm" onClick={onSolve}><SparkIcon /> Show AI step-by-step solution</button>
      </div>
    );
  }
  if (state.kind === 'loading') {
    return (
      <div className="sol" aria-busy="true" aria-live="polite">
        <div className="sol-head"><SparkIcon /> Working out the solution…</div>
        <div className="sol-callout skel"><LinesSkeleton lines={2} /></div>
        <div className="stepper skel">
          {[0, 1, 2].map((i) => <div key={i} className="step"><span className="step-num skeleton" /><div className="step-body"><LinesSkeleton lines={1} /></div></div>)}
        </div>
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="sol-cta">
        <button className="btn sm" onClick={onSolve}><SparkIcon /> Try again</button>
        <span className="error" role="alert">{state.message}</span>
      </div>
    );
  }
  if (state.kind === 'fallback') {
    return (
      <div className="sol qenter">
        <div className="sol-head"><SparkIcon /> AI step-by-step solution</div>
        <QuestionHtml html={mdToHtml(state.text)} latex className="sol-md" />
      </div>
    );
  }
  const s = state.solution;
  return (
    <div className="sol qenter">
      <div className="sol-head"><SparkIcon /> AI step-by-step solution</div>

      <section className="sol-section">
        <h4 className="sol-label"><BulbIcon /> Key concept</h4>
        <div className="sol-callout"><QuestionHtml html={textToHtml(s.keyConcept)} latex /></div>
      </section>

      <section className="sol-section">
        <h4 className="sol-label"><ListIcon /> Steps</h4>
        <ol className="stepper">
          {s.steps.map((st, i) => (
            <li key={i} className="step">
              <span className="step-num" aria-hidden="true">{i + 1}</span>
              <div className="step-body">
                <QuestionHtml html={textToHtml(st.text)} latex />
                {st.math && <QuestionHtml html={`<p class="step-math">$$${st.math}$$</p>`} latex />}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="sol-section">
        <div className="sol-answer">
          <span className="sol-answer-badge"><CheckIcon /> Answer</span>
          <strong className="sol-answer-label">{s.answer.label}</strong>
          {s.answer.reason && <span className="sol-answer-reason"><QuestionHtml html={textToHtml(s.answer.reason)} latex /></span>}
        </div>
      </section>

      {s.trap && (
        <section className="sol-section">
          <div className="sol-trap">
            <span className="sol-trap-badge"><WarnIcon /> Common trap</span>
            <QuestionHtml html={textToHtml(s.trap)} latex />
          </div>
        </section>
      )}
    </div>
  );
}
