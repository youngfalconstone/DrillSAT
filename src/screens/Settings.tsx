import { useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import type { LLMProvider } from '@shared/types';

const ANTHROPIC_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-4-8', 'claude-sonnet-4-6'];
const OPENAI_MODELS = ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'o3'];

export default function Settings() {
  const { settings, updateSettings, setSecret, appInfo, showToast } = useStore();
  const [llmKey, setLlmKey] = useState('');
  const [desmosKey, setDesmosKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const models = settings.llmProvider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS;
  const modelIsCustom = !models.includes(settings.llmModel);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const r = await api.ai.test();
    setTestResult(r.ok ? `Connected · model ${r.model} replied "${r.text}"` : `Failed: ${r.error.message}`);
    setTesting(false);
  };

  return (
    <div className="grid2">
      <div>
        <div className="card">
          <h2>AI (LLM)</h2>
          <label className="field"><span>Provider</span>
            <select className="select" value={settings.llmProvider} onChange={(e) => { const p = e.target.value as LLMProvider; void updateSettings({ llmProvider: p, llmModel: p === 'anthropic' ? ANTHROPIC_MODELS[0] : OPENAI_MODELS[0] }); }}>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI-compatible (OpenAI, Azure, local servers…)</option>
            </select>
          </label>
          <label className="field mt"><span>Model</span>
            <select className="select" value={modelIsCustom ? '__custom' : settings.llmModel} onChange={(e) => { if (e.target.value === '__custom') setCustomModel(settings.llmModel); else void updateSettings({ llmModel: e.target.value }); }}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="__custom">Custom…</option>
            </select>
          </label>
          {(modelIsCustom || customModel) && (
            <div className="row mt"><input className="input" placeholder="model id" value={customModel || settings.llmModel} onChange={(e) => setCustomModel(e.target.value)} /><button className="btn sm" onClick={() => { void updateSettings({ llmModel: customModel.trim() }); setCustomModel(''); }}>Use</button></div>
          )}
          {settings.llmProvider === 'openai' && (
            <label className="field mt"><span>Base URL</span><input className="input" value={settings.openaiBaseUrl} onChange={(e) => void updateSettings({ openaiBaseUrl: e.target.value })} /></label>
          )}
          <label className="field mt"><span>API key {settings.hasLlmKey ? <span className="pill green" style={{ padding: '1px 8px', fontSize: 11 }}>saved</span> : <span className="pill amber" style={{ padding: '1px 8px', fontSize: 11 }}>not set</span>}</span>
            <div className="row"><input className="input" type="password" placeholder={settings.hasLlmKey ? '•••••••• (saved — paste a new key to replace)' : 'sk-…'} value={llmKey} onChange={(e) => setLlmKey(e.target.value)} />
              <button className="btn sm primary" disabled={!llmKey.trim()} onClick={async () => { await setSecret('llm', llmKey); setLlmKey(''); showToast('API key saved'); }}>Save</button>
              {settings.hasLlmKey && <button className="btn sm" onClick={() => void setSecret('llm', null)}>Remove</button>}
            </div>
          </label>
          <div className="row mt"><button className="btn sm" onClick={test} disabled={testing || !settings.hasLlmKey}>{testing ? <span className="spinner" /> : null} Test connection</button>{testResult && <span className={'small ' + (testResult.startsWith('Failed') ? 'error' : 'info')}>{testResult}</span>}</div>
          <div className="muted small mt">Keys are stored {settings.secureStorage ? 'encrypted with the operating system’s secure storage (DPAPI)' : 'obfuscated only — OS secure storage is unavailable here (common under Wine)'} in {appInfo?.userData}. They are never sent anywhere except the provider you chose.</div>
        </div>

        <div className="card">
          <h2>Calculator (Desmos)</h2>
          <label className="switch mb"><input type="checkbox" checked={settings.desmosEnabled} onChange={(e) => void updateSettings({ desmosEnabled: e.target.checked })} /> Show the graphing calculator on Math questions</label>
          <label className="field mt"><span>Desmos API key {settings.hasDesmosKey ? <span className="pill green" style={{ padding: '1px 8px', fontSize: 11 }}>saved</span> : <span className="pill amber" style={{ padding: '1px 8px', fontSize: 11 }}>not set</span>}</span>
            <div className="row"><input className="input" type="password" placeholder={settings.hasDesmosKey ? '•••••••• (saved)' : 'Desmos API key'} value={desmosKey} onChange={(e) => setDesmosKey(e.target.value)} />
              <button className="btn sm primary" disabled={!desmosKey.trim()} onClick={async () => { await setSecret('desmos', desmosKey); setDesmosKey(''); showToast('Desmos key saved'); }}>Save</button>
              {settings.hasDesmosKey && <button className="btn sm" onClick={() => void setSecret('desmos', null)}>Remove</button>}
            </div>
          </label>
          <div className="muted small mt">Get a free key at <a href="#" onClick={(e) => { e.preventDefault(); void api.app.openExternal('https://www.desmos.com/api'); }}>desmos.com/api</a>. The calculator loads from desmos.com and needs an internet connection; everything else works offline.</div>
        </div>
      </div>

      <div>
        <div className="card">
          <h2>Practice</h2>
          <label className="switch"><input type="checkbox" checked={settings.timerEnabled} onChange={(e) => void updateSettings({ timerEnabled: e.target.checked })} /> Show timers (per question and per session)</label>
          <div className="mt"><label className="switch"><input type="checkbox" checked={settings.adaptiveEnabled} onChange={(e) => void updateSettings({ adaptiveEnabled: e.target.checked })} /> Adaptive difficulty (adjusts per topic from your recent answers)</label></div>
          <label className="field mt"><span>Theme</span>
            <select className="select" value={settings.theme} onChange={(e) => void updateSettings({ theme: e.target.value as 'light' | 'dark' })}><option value="light">Light (matches College Board)</option><option value="dark">Dark</option></select>
          </label>
        </div>
        <div className="card">
          <h2>About</h2>
          <table className="tbl"><tbody>
            <tr><td>App version</td><td>{appInfo?.version}</td></tr>
            <tr><td>Electron / Chromium</td><td>{appInfo?.electron} / {appInfo?.chrome}</td></tr>
            <tr><td>Running under Wine</td><td>{appInfo?.wine ? 'Yes (GPU acceleration disabled)' : 'No'}</td></tr>
            <tr><td>Secure key storage</td><td>{appInfo?.secureStorage ? 'Available' : 'Unavailable'}</td></tr>
            <tr><td>Data folder</td><td className="small" style={{ wordBreak: 'break-all' }}>{appInfo?.userData}</td></tr>
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
