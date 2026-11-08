import { useEffect, useState } from 'react';
import { api, type UpdateState } from '../api';
import { useStore } from '../store';

/** Shared update state for the banner and the Settings page. */
export function useUpdateState(): UpdateState | null {
  const [st, setSt] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!api.update) return;
    let live = true;
    void api.update.get().then((s) => live && setSt(s));
    const off = api.update.onState((s) => setSt(s));
    return () => { live = false; off(); };
  }, []);
  return st;
}

/** A small banner when an update is ready (installed app) or available (portable). Never shown during a test. */
export default function UpdateBanner() {
  const st = useUpdateState();
  const test = useStore((s) => s.test);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!st || test) return null;
  const ready = st.status === 'ready';
  const portableNew = st.portable && st.status === 'available';
  if ((!ready && !portableNew) || dismissed === st.version) return null;
  return (
    <div className="update-banner" role="status">
      <span>DrillSAT {st.version} is {ready ? 'ready to install' : 'available'}.</span>
      <button className="btn sm primary" onClick={() => void api.update.install()}>{ready ? 'Restart to update' : 'Download'}</button>
      <button className="btn sm" onClick={() => setDismissed(st.version ?? '')}>Later</button>
    </div>
  );
}
