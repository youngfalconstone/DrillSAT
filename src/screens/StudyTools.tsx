import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { generateQuestion, type GenerateSpec } from '@shared/ai';
import type { Difficulty, Question, Section } from '@shared/types';
import { DIFFICULTY_LABEL, SECTION_LABEL } from '@shared/types';
import { topicLabel, topicsByDomain } from '@shared/topics';
import { TopicSelect } from '../components/TopicPicker';
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

  const groups = useMemo(() => topicsByDomain(index, section), [index, section]);
  const allSkills = groups.flatMap((g) => g.skills);
  const effSkill = skill && allSkills.includes(skill) ? skill : allSkills[0] ?? '';
  const domain = groups.find((g) => g.skills.includes(effSkill))?.domain ?? '';

  const generate = async () => {
    setBusy(true);
    setErr(null);
    let made = 0;
    try {
      for (let i = 0; i < count; i++) {
        setProgressText(`Writing and checking ${i + 1} of ${count}…`);
        const qType = section === 'math' ? type : 'mcq';
        // style examples: official items of exactly this skill, difficulty and answer type
        const pool = filterQuestions(index, { section, skills: [effSkill], difficulties: [diff], types: [qType] });
        const exIds = shuffle(pool.length ? pool : filterQuestions(index, { section, skills: [effSkill], difficulties: [diff] }), Date.now() + i).slice(0, 3).map((e) => e.id);
        const examples = await Promise.all(exIds.map((id) => getQuestion(id)));
        // calibration anchors for the reviewer: one official item of this skill at each difficulty,
        // distinct from the style examples
        const anchors: GenerateSpec['anchors'] = {};
        for (const d of ['E', 'M', 'H'] as Difficulty[]) {
          const cands = filterQuestions(index, { section, skills: [effSkill], difficulties: [d] }).filter((e) => !exIds.includes(e.id));
          const pick = shuffle(cands, Date.now() + i + d.charCodeAt(0))[0];
          if (pick) anchors[d] = await getQuestion(pick.id);
        }
        const spec: GenerateSpec = { section, domain, skill: effSkill, difficulty: diff, type: qType, examples, anchors };
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
        <p className="muted small">New SAT-style questions, checked against official ones for format, answer and difficulty. Tagged <span className="badge ai">AI</span>.</p>
        {!settings.hasLlmKey && <div className="info">Add an LLM API key in <button className="btn sm" onClick={() => nav('settings')}>Settings</button> to generate questions.</div>}
        <label className="field mt"><span>Section</span><select className="select" value={section} onChange={(e) => { setSection(e.target.value as Section); setSkill(''); }}><option value="math">Math</option><option value="rw">Reading and Writing</option></select></label>
        <label className="field mt"><span>Topic</span><TopicSelect groups={groups} value={effSkill} onChange={setSkill} /></label>
        <div className="grid2 mt">
          <label className="field"><span>Difficulty</span><select className="select" value={diff} onChange={(e) => setDiff(e.target.value as Difficulty)}><option value="E">Easy</option><option value="M">Medium</option><option value="H">Hard</option></select></label>
          <label className="field"><span>Format</span><select className="select" value={section === 'math' ? type : 'mcq'} disabled={section !== 'math'} onChange={(e) => setType(e.target.value as 'mcq' | 'spr')}><option value="mcq">Multiple choice</option><option value="spr">Grid-in</option></select></label>
        </div>
        <label className="field mt"><span>How many: {count}</span><input type="range" min={1} max={5} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
        <button className="btn primary block" style={{ marginTop: 24 }} onClick={generate} disabled={busy || !settings.hasLlmKey || !effSkill}>{busy ? <><span className="spinner" /> {progressText}</> : 'Generate'}</button>
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
                  <div className="meta"><span className="badge ai">AI</span><span className={'badge ' + q.difficulty}>{DIFFICULTY_LABEL[q.difficulty]}</span><span>{SECTION_LABEL[q.section]} · {topicLabel(q.skill)} · {q.type === 'spr' ? 'Grid-in' : 'MCQ'}</span><span>{new Date(q.createdAt ?? 0).toLocaleDateString()}</span></div>
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
