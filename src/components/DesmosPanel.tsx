import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { CloseIcon, TrashIcon } from './icons';

const DESMOS_API = 'https://www.desmos.com/api/v1.11/calculator.js';
const LOAD_TIMEOUT_MS = 20000;

interface DesmosCalc {
  setState(s: unknown): void;
  getState(): unknown;
  setBlank(): void;
  resize(): void;
  destroy(): void;
  observeEvent(name: string, cb: () => void): void;
  unobserveEvent(name: string): void;
}
interface DesmosGlobal {
  GraphingCalculator(el: HTMLElement, opts?: Record<string, unknown>): DesmosCalc;
}
declare global {
  interface Window {
    Desmos?: DesmosGlobal;
  }
}

let loadPromise: Promise<DesmosGlobal> | null = null;
let loadedKey: string | null = null;

/** Load the Desmos API script once per app run (needs a connection). */
function loadDesmos(apiKey: string): Promise<DesmosGlobal> {
  if (window.Desmos && loadedKey === apiKey) return Promise.resolve(window.Desmos);
  if (loadPromise && loadedKey === apiKey) return loadPromise;
  loadedKey = apiKey;
  loadPromise = new Promise(async (resolve, reject) => {
    if (!navigator.onLine) {
      loadPromise = null;
      reject(new Error('offline'));
      return;
    }
    // Pre-flight so we can tell "bad key" (HTTP 403) from "blocked/offline" (script onerror has no status).
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), LOAD_TIMEOUT_MS);
      const res = await fetch(`${DESMOS_API}?apiKey=${encodeURIComponent(apiKey)}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.status === 403 || res.status === 401) {
        loadPromise = null;
        reject(new Error('badkey'));
        return;
      }
      if (!res.ok) {
        loadPromise = null;
        reject(new Error(`Desmos returned HTTP ${res.status}.`));
        return;
      }
    } catch (e) {
      loadPromise = null;
      reject(new Error((e as Error).name === 'AbortError' ? 'timeout' : 'blocked'));
      return;
    }
    const s = document.createElement('script');
    s.src = `${DESMOS_API}?apiKey=${encodeURIComponent(apiKey)}`;
    s.async = true;
    const timer = setTimeout(() => {
      loadPromise = null;
      s.remove();
      reject(new Error('timeout'));
    }, LOAD_TIMEOUT_MS);
    s.onload = () => {
      clearTimeout(timer);
      if (window.Desmos) resolve(window.Desmos);
      else {
        loadPromise = null;
        reject(new Error('Desmos did not initialize (invalid API key?)'));
      }
    };
    s.onerror = () => {
      clearTimeout(timer);
      loadPromise = null;
      s.remove();
      reject(new Error('blocked'));
    };
    document.head.appendChild(s);
  });
  return loadPromise;
}

interface Props {
  questionId: string;
  onClose: () => void;
}

/** Desmos graphing calculator panel; state is kept per question id for the whole app session. */
export default function DesmosPanel({ questionId, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const calcRef = useRef<DesmosCalc | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const calcStates = useStore((s) => s.calcStates);
  const saveCalcState = useStore((s) => s.saveCalcState);
  const nav = useStore((s) => s.nav);
  const calcWidth = useStore((s) => s.calcWidth);
  const statesRef = useRef(calcStates);
  statesRef.current = calcStates;

  // create the calculator once
  useEffect(() => {
    let disposed = false;
    setStatus('loading');
    (async () => {
      const key = await api.settings.getDesmosKey();
      if (!key) {
        setError('No Desmos API key is set. Add one in Settings → Calculator (request a free key at desmos.com/api).');
        setStatus('error');
        return;
      }
      try {
        const D = await loadDesmos(key);
        if (disposed || !hostRef.current) return;
        if (typeof D.GraphingCalculator !== 'function') {
          const feats = (D as unknown as { enabledFeatures?: Record<string, boolean> }).enabledFeatures ?? {};
          const on = Object.entries(feats).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none';
          throw new Error(`This Desmos API key does not enable the graphing calculator (enabled products: ${on}). Request a key with the Graphing Calculator enabled at desmos.com/my-api.`);
        }
        const calc = D.GraphingCalculator(hostRef.current, {
          keypad: true, expressions: true, settingsMenu: true, zoomButtons: true, expressionsTopbar: true, border: false,
          lockViewport: false, showResetButtonOnGraphpaper: true,
        });
        calcRef.current = calc;
        setStatus('ready');
      } catch (err) {
        const m = (err as Error).message;
        setError(
          m === 'offline' ? 'You are offline. The Desmos calculator needs an internet connection; the question still works.'
          : m === 'badkey' ? 'Desmos rejected the API key ("Unrecognized API key"). Enter a valid key from desmos.com/my-api in Settings.'
          : m === 'timeout' ? 'Desmos took too long to load. Check your connection and retry.'
          : m === 'blocked' ? 'Desmos could not be loaded (blocked by network or firewall).'
          : m,
        );
        setStatus('error');
      }
    })();
    return () => {
      disposed = true;
      calcRef.current?.destroy();
      calcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // swap state when the question changes
  useEffect(() => {
    const calc = calcRef.current;
    if (!calc || status !== 'ready') return;
    const saved = statesRef.current[questionId];
    if (saved) calc.setState(saved);
    else calc.setBlank();
    const handler = () => saveCalcState(questionId, calc.getState());
    calc.observeEvent('change.app', handler);
    return () => calc.unobserveEvent('change.app');
  }, [questionId, status, saveCalcState]);

  useEffect(() => {
    calcRef.current?.resize();
  }, [calcWidth]);

  const clear = () => {
    calcRef.current?.setBlank();
    saveCalcState(questionId, null);
  };

  return (
    <div className="calcpanel" style={{ width: calcWidth, flex: 'none' }}>
      <div className="bar">
        <span>Graphing calculator</span>
        <span className="row" style={{ gap: 6 }}>
          <button className="iconbtn" title="Clear calculator" onClick={clear} disabled={status !== 'ready'}><TrashIcon /></button>
          <button className="iconbtn" title="Hide calculator (G)" onClick={onClose}><CloseIcon /></button>
        </span>
      </div>
      <div className="body">
        <div className="desmos" ref={hostRef} />
        {status === 'loading' && <div className="msg"><div><span className="spinner" /><div className="mt">Loading Desmos…</div></div></div>}
        {status === 'error' && (
          <div className="msg" style={{ background: 'var(--card)' }}>
            <div>
              <div className="error">{error}</div>
              <div className="row mt" style={{ justifyContent: 'center' }}>
                <button className="btn sm" onClick={() => setAttempt((a) => a + 1)}>Retry</button>
                <button className="btn sm" onClick={() => nav('settings')}>Open Settings</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
