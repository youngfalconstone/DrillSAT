import { useCallback, useEffect, useRef, useState } from 'react';
import type { Question } from '@shared/types';
import { topicLabel } from '@shared/topics';
import { DIFFICULTY_LABEL, SECTION_LABEL } from '@shared/types';
import { checkAnswer, correctAnswerLabel, parseSpr } from '@shared/answerCheck';
import { buildSolvePrompt, parseSolution } from '@shared/ai';
import { fmtSeconds, SLOW_FACTOR, TARGET_MS } from '@shared/pacing';
import { complete, AIRequestError } from '../api';
import { useStore } from '../store';
import QuestionHtml from './QuestionHtml';
import DesmosPanel from './DesmosPanel';
import SolutionPanel, { type SolutionState } from './Solution';
import { highlightSupported, ReferenceSheet, useHighlighter } from './AnswerTools';
import { BookmarkIcon, CalcIcon, CheckIcon, ChevronLeft, ChevronRight, CloseIcon, FormulaIcon, HighlightIcon, StrikeIcon } from './icons';

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
  /** 'test': timed test conditions - no checking, no explanations, no difficulty or AI help */
  mode?: 'practice' | 'test';
  /** time spent on this question, for pacing feedback after checking */
  timeMs?: number;
  /** label above the question in test mode, e.g. "Question 5" */
  testLabel?: string;
}

const NO_RANGES: [number, number][] = [];
const NO_LETTERS: string[] = [];

/** The question card + answer card used by practice, the bank detail view and practice tests. */
export default function QuestionView(p: QuestionViewProps) {
  const q = p.question;
  const test = p.mode === 'test';
  const { calcOpen, toggleCalc, settings, calcWidth, setCalcWidth, setCurrent, tools, setTools, toggleEliminated, setHighlights } = useStore();
  const eliminated = useStore((s) => s.eliminated[q.id] ?? NO_LETTERS);
  const ranges = useStore((s) => s.highlights[q.id] ?? NO_RANGES);
  const [sol, setSol] = useState<SolutionState>({ kind: 'idle' });
  const [refOpen, setRefOpen] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const isCorrect = p.submitted && checkAnswer(q, p.answer);
  const showCalc = q.section === 'math' && settings.desmosEnabled && calcOpen;
  const locked = p.submitted && !test;

  const onHl = useCallback((r: [number, number][]) => setHighlights(q.id, r), [q.id, setHighlights]);
  useHighlighter(textRef, ranges, tools.highlight, onHl, q.id);

  useEffect(() => {
    setSol({ kind: 'idle' });
  }, [q.id]);
  useEffect(() => {
    // the tutor must not see a test question
    setCurrent(test ? null : q, p.answer, p.submitted);
  }, [q, p.answer, p.submitted, setCurrent, test]);

  // keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        if (!test && e.key === 'Enter' && t.tagName === 'INPUT' && !p.submitted && p.answer) { p.onSubmit(); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal-bg')) return;
      const k = e.key.toLowerCase();
      if (q.type === 'mcq' && !locked && ['a', 'b', 'c', 'd', '1', '2', '3', '4'].includes(k)) {
        const letter = /[1-4]/.test(k) ? 'ABCD'[Number(k) - 1] : k.toUpperCase();
        p.onAnswer(letter);
      } else if (e.key === 'Enter') {
        if (!test && !p.submitted && p.answer) p.onSubmit();
        else if ((p.submitted || test) && p.onNext && !p.nextDisabled) p.onNext();
      } else if (e.key === 'ArrowRight' && p.onNext && !p.nextDisabled) p.onNext();
      else if (e.key === 'ArrowLeft' && p.onPrev && !p.prevDisabled) p.onPrev();
      else if (k === 'm') p.onToggleMark();
      else if (k === 'g' && q.section === 'math' && settings.desmosEnabled) toggleCalc();
      else if (k === 'x' && q.type === 'mcq') setTools({ eliminate: !tools.eliminate });
      else if (k === 'h' && highlightSupported()) setTools({ highlight: !tools.highlight });
      else if (k === 'r' && q.section === 'math') setRefOpen((v) => !v);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [p, q, settings.desmosEnabled, toggleCalc, test, locked, tools, setTools]);

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
  const target = TARGET_MS[q.section];
  const slow = p.timeMs !== undefined && p.timeMs > target * SLOW_FACTOR;

  return (
    <div className="calcwrap">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className={'qlayout' + (showCalc ? ' wide' : '') + (stacked ? ' stacked' : '')}>
          <div className={'card qcard' + (tools.highlight ? ' hl-on' : '')}>
            <div className="qmeta">
              <span className="row" style={{ gap: 8 }}>
                {test ? <span className="tag">{p.testLabel ?? SECTION_LABEL[q.section]}</span> : (
                  <>
                    <span className={'tag' + (q.source === 'ai' ? ' ai' : '')}>{q.source === 'ai' ? 'AI-generated' : SECTION_LABEL[q.section]} | {q.domain}</span>
                    <span className={'badge ' + q.difficulty}>{DIFFICULTY_LABEL[q.difficulty]}</span>
                    <span className="muted small" title={q.skill}>{topicLabel(q.skill)}</span>
                  </>
                )}
              </span>
              <span className="toolbar" role="toolbar" aria-label="Answer tools">
                {highlightSupported() && (
                  <button className={'iconbtn' + (tools.highlight ? ' on' : '')} title="Highlighter (H): select text to highlight, click a highlight to remove it" aria-label="Highlighter" aria-pressed={tools.highlight} onClick={() => setTools({ highlight: !tools.highlight })}><HighlightIcon /></button>
                )}
                {q.type === 'mcq' && (
                  <button className={'iconbtn' + (tools.eliminate ? ' on' : '')} title="Answer eliminator (X): cross out choices" aria-label="Answer eliminator" aria-pressed={tools.eliminate} onClick={() => setTools({ eliminate: !tools.eliminate })}><StrikeIcon /></button>
                )}
                {q.section === 'math' && (
                  <button className="iconbtn" title="Reference sheet (R)" aria-label="Reference sheet" onClick={() => setRefOpen(true)}><FormulaIcon /></button>
                )}
                {q.section === 'math' && settings.desmosEnabled && (
                  <button className={'iconbtn' + (calcOpen ? ' on' : '')} title="Graphing calculator (G)" aria-label="Graphing calculator" onClick={() => toggleCalc()}><CalcIcon /></button>
                )}
              </span>
            </div>
            <div ref={textRef} className="qtext">
              {q.stimulus && <div className="stimulus"><QuestionHtml html={q.stimulus} latex={q.source === 'ai'} /></div>}
              <QuestionHtml html={q.stem} latex={q.source === 'ai'} className="stem" />
            </div>
            {ranges.length > 0 && tools.highlight && <button className="btn sm mt" onClick={() => setHighlights(q.id, [])}>Clear highlights</button>}
            {!test && p.submitted && p.showRationale !== false && (
              <div className="rationale">
                <h3>{q.source === 'ai' ? 'Explanation (AI-generated)' : 'Official explanation'}</h3>
                <QuestionHtml html={q.rationale} latex={q.source === 'ai'} />
              </div>
            )}
            {!test && (
              <div className="rationale aisol">
                <SolutionPanel state={sol} onSolve={solve} />
              </div>
            )}
          </div>

          <div className="card acard">
            {q.type === 'mcq' ? (
              <div className={'choices' + (tools.eliminate && !locked ? ' eliminating' : '')}>
                {q.options!.map((o) => {
                  const sel = p.answer === o.id;
                  const struck = eliminated.includes(o.id) && !sel;
                  const isKey = locked && q.correct!.includes(o.id);
                  const cls = isKey ? ' correct' : locked && sel ? ' wrong' : !locked && sel ? ' selected' : '';
                  const label = isKey ? (sel ? 'Correct' : 'Correct answer') : locked && sel ? 'Your answer, incorrect' : sel ? 'Selected' : struck ? 'Crossed out' : '';
                  return (
                    <div key={o.id} className="choice-row">
                      <button
                        className={'choice' + cls + (struck ? ' struck' : '')} disabled={locked}
                        onClick={() => {
                          if (struck) toggleEliminated(q.id, o.id); // choosing a crossed-out answer restores it
                          p.onAnswer(sel ? null : o.id);
                        }}
                        aria-pressed={!locked ? sel : undefined} aria-label={`Choice ${o.id}${label ? `, ${label}` : ''}`}
                      >
                        <span className="letter" aria-hidden="true">
                          <span className="letter-text">{o.id}</span>
                          {cls && <span className="letter-badge">{cls === ' wrong' ? <CloseIcon /> : <CheckIcon />}</span>}
                        </span>
                        <QuestionHtml html={o.html} latex={q.source === 'ai'} className="choice-text" />
                      </button>
                      {tools.eliminate && !locked && (
                        <button className={'strike-btn' + (struck ? ' on' : '')} onClick={() => toggleEliminated(q.id, o.id)}
                          aria-label={struck ? `Undo cross-out of choice ${o.id}` : `Cross out choice ${o.id}`} title={struck ? 'Undo' : `Cross out ${o.id}`}>
                          {struck ? 'Undo' : <span className="strike-letter">{o.id}</span>}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="spr">
                <label className="field">
                  Your answer (number, fraction or decimal)
                  <input
                    className={locked ? (isCorrect ? 'ok' : 'bad') : sprValid ? '' : 'bad'} value={sprValue} disabled={locked}
                    placeholder="e.g. 12, 3/4, -0.5" onChange={(e) => p.onAnswer(e.target.value || null)} autoFocus={!test}
                  />
                </label>
                {!sprValid && <span className="small" style={{ color: 'var(--red)' }}>Enter a number such as 12, 3/4 or .75 (no mixed numbers or units).</span>}
                <span className="muted small">Decimals may be rounded or truncated to 4 digits. Fractions need not be reduced.</span>
              </div>
            )}

            {locked && (
              <div className={'result ' + (isCorrect ? 'ok' : 'bad')} role="status">
                {isCorrect ? <CheckIcon /> : <CloseIcon />}
                <span>{isCorrect ? 'Correct!' : `Incorrect. Correct answer: ${correctAnswerLabel(q)}`}</span>
              </div>
            )}
            {locked && settings.pacingFeedback && p.timeMs !== undefined && p.timeMs > 0 && (
              <div className={'pace small' + (slow ? ' slow' : '')} data-testid="pace">
                {fmtSeconds(p.timeMs)} on this question · SAT pace about {fmtSeconds(target)}
              </div>
            )}

            <div className="actions">
              {!test && !p.submitted && <button className="btn primary block" onClick={p.onSubmit} disabled={!p.answer || !sprValid}>Check answer</button>}
              <button className="btn tertiary block" onClick={p.onToggleMark}>
                <BookmarkIcon filled={p.marked} /> {p.marked ? 'Marked for review' : test ? 'Mark for Review' : 'Add to Review'}
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
      {refOpen && <ReferenceSheet onClose={() => setRefOpen(false)} />}
    </div>
  );
}
