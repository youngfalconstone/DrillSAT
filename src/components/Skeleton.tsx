/** Loading placeholder with the same footprint as a question + answer card, so nothing shifts. */
export function QuestionSkeleton({ choices = 4 }: { choices?: number }) {
  return (
    <div className="qlayout" aria-busy="true" aria-label="Loading question">
      <div className="card qcard">
        <div className="skel-stack">
          <div className="skeleton title" />
          <div className="skeleton line" />
          <div className="skeleton line" />
          <div className="skeleton line short" />
          <div className="skeleton line" />
          <div className="skeleton line short" />
        </div>
      </div>
      <div className="card">
        <div className="skel-stack">
          {Array.from({ length: choices }, (_, i) => <div key={i} className="skeleton choice" />)}
        </div>
      </div>
    </div>
  );
}

export function LinesSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skel-stack" aria-busy="true">
      {Array.from({ length: lines }, (_, i) => <div key={i} className={'skeleton line' + (i === lines - 1 ? ' short' : '')} />)}
    </div>
  );
}
