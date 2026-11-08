import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { filterQuestions } from '@shared/search';
import type { Difficulty, Question, QuestionIndexEntry, Section } from '@shared/types';
import { DIFFICULTY_LABEL, DOMAINS } from '@shared/types';
import QuestionView from '../components/QuestionView';
import { ChevronLeft, SearchIcon } from '../components/icons';
import { useRestoreScroll } from '../pageScroll';

const PAGE = 60;

export default function QuestionBank() {
  const { allIndex, index, aiQuestions, getQuestion, startSession, progress, toggleReviewFlag } = useStore();
  const [section, setSection] = useState<Section | 'all'>('all');
  const [domains, setDomains] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [diffs, setDiffs] = useState<Difficulty[]>([]);
  const [types, setTypes] = useState<('mcq' | 'spr')[]>([]);
  const [sources, setSources] = useState<('official' | 'ai')[]>([]);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  useRestoreScroll(open === null); // list keeps its position across open/back; detail starts at top

  const all = useMemo(() => allIndex(), [index, aiQuestions]); // eslint-disable-line react-hooks/exhaustive-deps
  const skillOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of all) if ((section === 'all' || e.section === section) && (!domains.length || domains.includes(e.domain))) m.set(e.skill, e.domain);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  }, [all, section, domains]);
  const results = useMemo(
    () => filterQuestions(all, { section, domains, skills, difficulties: diffs, types, sources, query }),
    [all, section, domains, skills, diffs, types, sources, query],
  );
  useEffect(() => setLimit(PAGE), [section, domains, skills, diffs, types, sources, query]);

  const toggle = <T,>(arr: T[], v: T, set: (x: T[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const domainList = section === 'all' ? [...DOMAINS.math, ...DOMAINS.rw] : DOMAINS[section];

  const openQ = async (e: QuestionIndexEntry) => {
    setLoading(true);
    try {
      const q = await getQuestion(e.id);
      setOpen(q);
      setAnswer(null);
      setSubmitted(false);
    } finally {
      setLoading(false);
    }
  };
  const idx = open ? results.findIndex((r) => r.id === open.id) : -1;

  if (open) {
    return (
      <div>
        <div className="row mb" style={{ justifyContent: 'space-between' }}>
          <button className="btn sm" onClick={() => setOpen(null)}><ChevronLeft /> Back to results</button>
          <span className="muted small">Question {idx + 1} of {results.length} · ID {open.id}</span>
          <button className="btn sm primary" onClick={() => startSession({ section: open.section, skills: [open.skill], difficultyMode: 'adaptive', count: 10, includeAI: true, onlyUnseen: true })}>Practice this skill</button>
        </div>
        <QuestionView
          question={open} answer={answer} submitted={submitted} marked={progress.reviewFlags.includes(open.id)}
          onAnswer={setAnswer} onSubmit={() => setSubmitted(true)} onToggleMark={() => toggleReviewFlag(open.id)}
          onPrev={() => idx > 0 && openQ(results[idx - 1])} onNext={() => idx + 1 < results.length && openQ(results[idx + 1])}
          prevDisabled={idx <= 0} nextDisabled={idx + 1 >= results.length}
        />
      </div>
    );
  }

  return (
    <div className="banklayout">
      <div className="card filters">
        <label className="field">
          <span>Search</span>
          <span className="row" style={{ gap: 6 }}><SearchIcon style={{ width: 18, color: 'var(--muted)' }} /><input className="input" placeholder="keyword or question ID" value={query} onChange={(e) => setQuery(e.target.value)} /></span>
        </label>
        <label className="field mt">
          <span>Section</span>
          <select className="select" value={section} onChange={(e) => { setSection(e.target.value as Section | 'all'); setDomains([]); setSkills([]); }}>
            <option value="all">All sections</option><option value="math">Math</option><option value="rw">Reading and Writing</option>
          </select>
        </label>
        <div className="field mt"><span>Domain</span>
          <div className="checks">{domainList.map((d) => <label key={d} className="check"><input type="checkbox" checked={domains.includes(d)} onChange={() => { toggle(domains, d, setDomains); setSkills([]); }} />{d}</label>)}</div>
        </div>
        <div className="field mt"><span>Skill (subtopic)</span>
          <div className="checks">{skillOptions.map(([s]) => <label key={s} className="check"><input type="checkbox" checked={skills.includes(s)} onChange={() => toggle(skills, s, setSkills)} />{s}</label>)}</div>
        </div>
        <div className="field mt"><span>Difficulty</span>
          <div className="row">{(['E', 'M', 'H'] as Difficulty[]).map((d) => <label key={d} className="check"><input type="checkbox" checked={diffs.includes(d)} onChange={() => toggle(diffs, d, setDiffs)} />{DIFFICULTY_LABEL[d]}</label>)}</div>
        </div>
        <div className="field mt"><span>Format</span>
          <div className="row"><label className="check"><input type="checkbox" checked={types.includes('mcq')} onChange={() => toggle(types, 'mcq', setTypes)} />Multiple choice</label><label className="check"><input type="checkbox" checked={types.includes('spr')} onChange={() => toggle(types, 'spr', setTypes)} />Grid-in</label></div>
        </div>
        <div className="field mt"><span>Source</span>
          <div className="row"><label className="check"><input type="checkbox" checked={sources.includes('official')} onChange={() => toggle(sources, 'official', setSources)} />Official</label><label className="check"><input type="checkbox" checked={sources.includes('ai')} onChange={() => toggle(sources, 'ai', setSources)} />AI-generated</label></div>
        </div>
        <button className="btn sm mt" onClick={() => { setDomains([]); setSkills([]); setDiffs([]); setTypes([]); setSources([]); setQuery(''); setSection('all'); }}>Clear filters</button>
      </div>

      <div>
        <div className="row mb" style={{ justifyContent: 'space-between' }}>
          <span><strong>{results.length.toLocaleString()}</strong> question{results.length === 1 ? '' : 's'}{loading && <span className="spinner" style={{ marginLeft: 10, width: 14, height: 14 }} />}</span>
          <button className="btn sm primary" disabled={!results.length || section === 'all'} title={section === 'all' ? 'Pick a section first' : ''}
            onClick={() => startSession({ section: section as Section, skills, difficultyMode: diffs.length === 1 ? diffs[0] : 'mixed', count: Math.min(20, results.length), includeAI: true, onlyUnseen: false }, results.map((r) => r.id))}>
            Practice these
          </button>
        </div>
        {results.length === 0 ? (
          <div className="card empty"><SearchIcon /><div>No questions match these filters.</div></div>
        ) : (
          <div className="qlist">
            {results.slice(0, limit).map((e) => {
              const seen = progress.sessions.some((s) => s.questionIds.includes(e.id));
              return (
                <button key={e.id} className="qitem" onClick={() => openQ(e)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="meta">
                      <span className={'badge ' + e.difficulty}>{DIFFICULTY_LABEL[e.difficulty]}</span>
                      {e.source === 'ai' && <span className="badge ai">AI</span>}
                      <span>{e.section === 'math' ? 'Math' : 'R&W'} · {e.domain} · {e.skill}</span>
                      <span>{e.type === 'spr' ? 'Grid-in' : 'MCQ'}</span>
                      {e.hasFigure && <span>figure</span>}{e.hasTable && <span>table</span>}
                      {seen && <span className="pill gray" style={{ padding: '1px 8px', fontSize: 11 }}>seen</span>}
                      {progress.reviewFlags.includes(e.id) && <span className="pill amber" style={{ padding: '1px 8px', fontSize: 11 }}>review</span>}
                    </div>
                    <div className="prev">{e.preview || '(figure-only question)'}</div>
                  </div>
                  <span className="id">{e.source === 'ai' ? 'AI' : e.id}</span>
                </button>
              );
            })}
            {limit < results.length && <button className="btn" onClick={() => setLimit((l) => l + PAGE * 2)}>Show more ({results.length - limit} left)</button>}
          </div>
        )}
      </div>
    </div>
  );
}
