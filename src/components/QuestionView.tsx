import { useEffect, useState } from 'react';
import type { Question } from '@shared/types';
import { DIFFICULTY_LABEL, SECTION_LABEL } from '@shared/types';
import { checkAnswer, correctAnswerLabel, parseSpr } from '@shared/answerCheck';
import { buildSolvePrompt, parseSolution } from '@shared/ai';
import { complete, AIRequestError } from '../api';
import { useStore } from '../store';
import QuestionHtml from './QuestionHtml';
import DesmosPanel from './DesmosPanel';
import SolutionPanel, { type SolutionState } from './Solution';
import { BookmarkIcon, CalcIcon, CheckIcon, ChevronLeft, ChevronRight, CloseIcon } from './icons';

export interface QuestionViewProps {
  question: Question;
  answer: string | null;
  submitted: boolean;
  marked: boolean;
  onAnswer: (a: string | null) => void;
  onSubmit: () => void;
  onToggleMark: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  /** show rationale after submit (practice feedback) */
  showRationale?: boolean;
}

/** The question card + answer card used by practice mode and the bank detail view. */
export default function QuestionView(p: QuestionViewProps) {
  const q = p.question;
  const { calcOpen, toggleCalc, settings, calcWidth, setCalcWidth, setCurrent } = useStore();
  const [sol, setSol] = useState<SolutionState>({ kind: 'idle' });
  const isCorrect = p.submitted && checkAnswer(q, p.answer);
  const showCalc = q.section === 'math' && settings.desmosEnabled && calcOpen;

  useEffect(() => {
    setSol({ kind: 'idle' });
  }, [q.id]);
  useEffect(() => {
    setCurrent(q, p.answer, p.submitted);
  }, [q, p.answer, p.submitted, setCurrent]);

  // keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        if (e.key === 'Enter' && t.tagName === 'INPUT' && !p.submitted && p.answer) { p.onSubmit(); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (q.type === 'mcq' && !p.submitted && ['a', 'b', 'c', 'd', '1', '2', '3', '4'].includes(k)) {
        const letter = /[1-4]/.test(k) ? 'ABCD'[Number(k) - 1] : k.toUpperCase();
        p.onAnswer(letter);
      } else if (e.key === 'Enter') {
        if (!p.submitted && p.answer) p.onSubmit();
        else if (p.submitted && p.onNext && !p.nextDisabled) p.onNext();
      } else if (e.key === 'ArrowRight' && p.onNext && !p.nextDisabled) p.onNext();
      else if (e.key === 'ArrowLeft' && p.onPrev && !p.prevDisabled) p.onPrev();
      else if (k === 'm') p.onToggleMark();
      else if (k === 'g' && q.section === 'math' && settings.desmosEnabled) toggleCalc();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [p, q, settings.desmosEnabled, toggleCalc]);

  const solve = async () => {
    setSol({ kind: 'loading' });
    try {
      const text = await complete(buildSolvePrompt(q));
      const parsed = parseSolution(text);
      setSol(parsed ? { kind: 'ready', solution: parsed } : { kind: 'fallback', text });
    } catch (err) {
      setSol({ kind: 'error', message: err instanceof AIRequestError ? err.message : (err as Error).message });
    }
  };

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = calcWidth;
    const move = (ev: MouseEvent) => setCalcWidth(startW - (ev.clientX - startX));
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const sprValue = p.answer ?? '';
  const sprValid = q.type !== 'spr' || sprValue === '' || parseSpr(sprValue) !== null;
  // Long answer choices (typical for Reading & Writing) read better full-width under the question
  // than squeezed into a side column, so those questions use a stacked layout.
  const stacked = q.type === 'mcq' && (q.options ?? []).some((o) => o.html.replace(/<[^>]+>/g, '').length > 110);

  return (
    <div className="calcwrap">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={'qlayout' + (showCalc ? ' wide' : '') + (stacked ? ' stacked' : '')}>
          <div className="card qcard">
            <div className="qmeta">
              <span className="row" style={{ gap: 8 }}>
                <span className={'tag' + (q.source === 'ai' ? ' ai' : '')}>{q.source === 'ai' ? 'AI-generated' : SECTION_LABEL[q.section]} | {q.domain}</span>
                <span className={'badge ' + q.difficulty}>{DIFFICULTY_LABEL[q.difficulty]}</span>
                <span className="muted small">{q.skill}</span>
              </span>
              {q.section === 'math' && settings.desmosEnabled && (
                <button className={'iconbtn' + (calcOpen ? ' on' : '')} title="Graphing calculator (G)" aria-label="Graphing calculator" onClick={() => toggleCalc()}><CalcIcon /></button>
              )}
            </div>
            {q.stimulus && <div className="stimulus"><QuestionHtml html={q.stimulus} latex={q.source === 'ai'} /></div>}
            <QuestionHtml html={q.stem} latex={q.source === 'ai'} className="stem" />
            {p.submitted && p.showRationale !== false && (
              <div className="rationale">
                <h3>{q.source === 'ai' ? 'Explanation (AI-generated)' : 'Official explanation'}</h3>
                <QuestionHtml html={q.rationale} latex={q.source === 'ai'} />
              </div>
            )}
            <div className="rationale aisol">
              <SolutionPanel state={sol} onSolve={solve} />
            </div>
          </div>

          <div className="card acard">
            {q.type === 'mcq' ? (
              <div className="choices">
                {q.options!.map((o) => {
                  const sel = p.answer === o.id;
                  const isKey = p.submitted && q.correct!.includes(o.id);
                  const cls = isKey ? ' correct' : p.submitted && sel ? ' wrong' : !p.submitted && sel ? ' selected' : '';
                  const label = isKey ? (sel ? 'Correct' : 'Correct answer') : p.submitted && sel ? 'Your answer, incorrect' : sel ? 'Selected' : '';
                  return (
                    <button
                      key={o.id} className={'choice' + cls} disabled={p.submitted} onClick={() => p.onAnswer(sel ? null : o.id)}
                      aria-pressed={!p.submitted ? sel : undefined} aria-label={`Choice ${o.id}${label ? `, ${label}` : ''}`}
                    >
                      <span className="letter" aria-hidden="true">
                        <span className="letter-text">{o.id}</span>
                        {cls && <span className="letter-badge">{cls === ' wrong' ? <CloseIcon /> : <CheckIcon />}</span>}
                      </span>
                      <QuestionHtml html={o.html} latex={q.source === 'ai'} className="choice-text" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="spr">
                <label className="field">
                  Your answer (number, fraction or decimal)
                  <input
                    className={p.submitted ? (isCorrect ? 'ok' : 'bad') : sprValid ? '' : 'bad'} value={sprValue} disabled={p.submitted}
                    placeholder="e.g. 12, 3/4, -0.5" onChange={(e) => p.onAnswer(e.target.value || null)} autoFocus
                  />
                </label>
                {!sprValid && <span className="small" style={{ color: 'var(--red)' }}>Enter a number such as 12, 3/4 or .75 (no mixed numbers or units).</span>}
                <span className="muted small">Decimals may be rounded or truncated to 4 digits. Fractions need not be reduced.</span>
              </div>
            )}

            {p.submitted && (
              <div className={'result ' + (isCorrect ? 'ok' : 'bad')} role="status">
                {isCorrect ? <CheckIcon /> : <CloseIcon />}
                <span>{isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${correctAnswerLabel(q)}`}</span>
              </div>
            )}

            <div className="actions">
              {!p.submitted && <button className="btn primary block" onClick={p.onSubmit} disabled={!p.answer || !sprValid}>Check answer</button>}
              <button className="btn tertiary block" onClick={p.onToggleMark}>
                <BookmarkIcon filled={p.marked} /> {p.marked ? 'Marked for review' : 'Add to Review'}
              </button>
              {(p.onPrev || p.onNext) && (
                <div className="navrow">
                  {p.onPrev && <button className="btn" onClick={p.onPrev} disabled={p.prevDisabled}><ChevronLeft /> Previous</button>}
                  {p.onNext && <button className="btn primary" onClick={p.onNext} disabled={p.nextDisabled}>{p.nextLabel ?? 'Next'} <ChevronRight /></button>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {showCalc && (
        <>
          <div className="resizer" onMouseDown={startResize} title="Drag to resize" />
          <DesmosPanel questionId={q.id} onClose={() => toggleCalc(false)} />
        </>
      )}
    </div>
  );
}
