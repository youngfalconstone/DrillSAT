import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { generateQuestion, type GenerateSpec } from '@shared/ai';
import type { Difficulty, Question, Section } from '@shared/types';
import { DIFFICULTY_LABEL, DOMAINS, SECTION_LABEL } from '@shared/types';
import { filterQuestions, shuffle } from '@shared/search';
import { complete, AIRequestError } from '../api';
import QuestionView from '../components/QuestionView';
import { ChevronLeft, SparkIcon, TrashIcon } from '../components/icons';

export default function StudyTools() {
  const { index, aiQuestions, getQuestion, addAIQuestion, removeAIQuestion, settings, nav, progress, toggleReviewFlag, startSession } = useStore();
  const [section, setSection] = useState<Section>('math');
  const [skill, setSkill] = useState('');
  const [diff, setDiff] = useState<Difficulty>('M');
  const [type, setType] = useState<'mcq' | 'spr'>('mcq');
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const skills = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of index) if (e.section === section) m.set(e.skill, e.domain);
    return [...m.entries()].sort((a, b) => DOMAINS[section].indexOf(a[1]) - DOMAINS[section].indexOf(b[1]) || a[0].localeCompare(b[0]));
  }, [index, section]);
  const effSkill = skill && skills.some(([s]) => s === skill) ? skill : skills[0]?.[0] ?? '';
  const domain = skills.find(([s]) => s === effSkill)?.[1] ?? '';

  const generate = async () => {
    setBusy(true);
    setErr(null);
    let made = 0;
    try {
      for (let i = 0; i < count; i++) {
        setProgressText(`Generating ${i + 1} of ${count}…`);
        const pool = filterQuestions(index, { section, skills: [effSkill], difficulties: [diff], types: section === 'math' ? [type] : ['mcq'] });
        const exIds = shuffle(pool.length ? pool : filterQuestions(index, { section, skills: [effSkill] }), Date.now() + i).slice(0, 3).map((e) => e.id);
        const examples = await Promise.all(exIds.map((id) => getQuestion(id)));
        const spec: GenerateSpec = { section, domain, skill: effSkill, difficulty: diff, type: section === 'math' ? type : 'mcq', examples };
        const bank = index.filter((e) => e.skill === effSkill);
        const q = await generateQuestion(spec, [...bank, ...aiQuestions.map((x) => ({ text: x.text ?? '' }))], complete);
        await addAIQuestion(q);
        made++;
      }
    } catch (e) {
      setErr((e instanceof AIRequestError ? e.message : (e as Error).message) + (made ? ` (${made} generated before the error)` : ''));
    } finally {
      setBusy(false);
      setProgressText('');
    }
  };

  if (open) {
    return (
      <div>
        <div className="row mb" style={{ justifyContent: 'space-between' }}>
          <button className="btn sm" onClick={() => setOpen(null)}><ChevronLeft /> Back</button>
          <button className="btn sm danger" onClick={() => { void removeAIQuestion(open.id); setOpen(null); }}><TrashIcon /> Delete this question</button>
        </div>
        <QuestionView question={open} answer={answer} submitted={submitted} marked={progress.reviewFlags.includes(open.id)} onAnswer={setAnswer} onSubmit={() => setSubmitted(true)} onToggleMark={() => toggleReviewFlag(open.id)} />
      </div>
    );
  }

  return (
    <div className="grid2">
      <div className="card">
        <h2><SparkIcon style={{ width: 18, verticalAlign: '-3px' }} /> Generate new questions</h2>
        <p className="muted small">The AI writes an original question in the style of three bank questions with the same topic and difficulty, then the app validates it (one correct answer, explanation present, four distinct options, not a duplicate of the bank). Generated questions are tagged <span className="badge ai">AI</span> everywhere.</p>
        {!settings.hasLlmKey && <div className="info">Add an LLM API key in <button className="btn sm" onClick={() => nav('settings')}>Settings</button> to generate questions.</div>}
        <label className="field mt"><span>Section</span><select className="select" value={section} onChange={(e) => { setSection(e.target.value as Section); setSkill(''); }}><option value="math">Math</option><option value="rw">Reading and Writing</option></select></label>
        <label className="field mt"><span>Topic</span><select className="select" value={effSkill} onChange={(e) => setSkill(e.target.value)}>{skills.map(([s, d]) => <option key={s} value={s}>{d} — {s}</option>)}</select></label>
        <div className="grid2 mt">
          <label className="field"><span>Difficulty</span><select className="select" value={diff} onChange={(e) => setDiff(e.target.value as Difficulty)}><option value="E">Easy</option><option value="M">Medium</option><option value="H">Hard</option></select></label>
          <label className="field"><span>Format</span><select className="select" value={section === 'math' ? type : 'mcq'} disabled={section !== 'math'} onChange={(e) => setType(e.target.value as 'mcq' | 'spr')}><option value="mcq">Multiple choice</option><option value="spr">Grid-in</option></select></label>
        </div>
        <label className="field mt"><span>How many: {count}</span><input type="range" min={1} max={5} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
        <button className="btn primary block" style={{ marginTop: 16 }} onClick={generate} disabled={busy || !settings.hasLlmKey || !effSkill}>{busy ? <><span className="spinner" /> {progressText}</> : 'Generate'}</button>
        {err && <div className="error mt">{err}</div>}
      </div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Your AI-generated questions ({aiQuestions.length})</h2>
          {aiQuestions.length > 0 && <button className="btn sm primary" onClick={() => startSession({ section: aiQuestions[aiQuestions.length - 1].section, skills: [], difficultyMode: 'mixed', count: aiQuestions.length, includeAI: true, onlyUnseen: false }, aiQuestions.map((q) => q.id))}>Practice all</button>}
        </div>
        {aiQuestions.length === 0 ? <div className="empty"><SparkIcon /><div>Nothing generated yet.</div></div> : (
          <div className="qlist">
            {[...aiQuestions].reverse().map((q) => (
              <button key={q.id} className="qitem" onClick={() => { setOpen(q); setAnswer(null); setSubmitted(false); }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="meta"><span className="badge ai">AI</span><span className={'badge ' + q.difficulty}>{DIFFICULTY_LABEL[q.difficulty]}</span><span>{SECTION_LABEL[q.section]} · {q.skill} · {q.type === 'spr' ? 'Grid-in' : 'MCQ'}</span><span>{new Date(q.createdAt ?? 0).toLocaleDateString()}</span></div>
                  <div className="prev">{q.text?.split('\n')[0]}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
