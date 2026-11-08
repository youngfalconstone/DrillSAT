import { useEffect, useRef, type ReactNode } from 'react';
import { topicLabel, type TopicGroup } from '@shared/topics';

/**
 * The one topic list used everywhere: skills grouped under their domain, short names, official name on
 * hover. Ticking a domain selects or clears all of its topics. Nothing selected means "all topics".
 */
export function TopicPicker({ groups, value, onChange, badge }: {
  groups: TopicGroup[];
  value: string[];
  onChange: (skills: string[]) => void;
  badge?: (skill: string) => ReactNode;
}) {
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <div className="topics">
      {groups.map((g) => {
        const on = g.skills.filter((s) => value.includes(s)).length;
        const setAll = () => onChange(on === g.skills.length ? value.filter((s) => !g.skills.includes(s)) : [...new Set([...value, ...g.skills])]);
        return (
          <div key={g.domain} className="topic-group">
            <DomainCheck label={g.domain} state={on === 0 ? 'none' : on === g.skills.length ? 'all' : 'some'} onChange={setAll} />
            {g.skills.map((s) => (
              <label key={s} className="check topic" title={topicLabel(s) === s ? undefined : s}>
                <input type="checkbox" checked={value.includes(s)} onChange={() => toggle(s)} />
                <span>{topicLabel(s)}</span>
                {badge?.(s)}
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DomainCheck({ label, state, onChange }: { label: string; state: 'none' | 'some' | 'all'; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <label className="check topic-domain">
      <input ref={ref} type="checkbox" checked={state === 'all'} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

/** Single-topic dropdown with the same grouping and short names. */
export function TopicSelect({ groups, value, onChange }: { groups: TopicGroup[]; value: string; onChange: (skill: string) => void }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.map((g) => (
        <optgroup key={g.domain} label={g.domain}>
          {g.skills.map((s) => <option key={s} value={s}>{topicLabel(s)}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
