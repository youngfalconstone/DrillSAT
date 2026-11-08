import { useEffect } from 'react';
import { useStore, type Screen } from './store';
import ChatPanel from './components/ChatPanel';
import { BankIcon, ChatIcon, ChevronDown, HelpIcon, HomeIcon, Logo, PerfIcon, PracticeIcon, SettingsIcon, ToolsIcon } from './components/icons';
import Home from './screens/Home';
import QuestionBank from './screens/QuestionBank';
import Practice from './screens/Practice';
import Performance from './screens/Performance';
import StudyTools from './screens/StudyTools';
import Settings from './screens/Settings';
import Help from './screens/Help';

const NAV: { id: Screen; label: string; icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'bank', label: 'Question Bank', icon: BankIcon },
  { id: 'practice', label: 'Practice', icon: PracticeIcon },
  { id: 'performance', label: 'Performance', icon: PerfIcon },
  { id: 'study', label: 'Study Tools', icon: ToolsIcon },
];
const TITLES: Record<Screen, [string, string]> = {
  home: ['SAT Practice', 'Practice with official SAT questions, build your skills, and track your progress.'],
  bank: ['SAT Question Bank', 'Browse and filter all 3,770 official questions, plus your AI-generated ones.'],
  practice: ['Practice', 'Answer questions one at a time with a timer, feedback, and the graphing calculator.'],
  performance: ['Performance', 'Accuracy by topic and difficulty, streaks, and session history.'],
  study: ['Study Tools', 'Generate new AI questions and get step-by-step solutions.'],
  settings: ['Settings', 'API keys, model, calculator, theme and timer.'],
  help: ['Help', 'Keyboard shortcuts, setup and troubleshooting.'],
};

export default function App() {
  const { ready, loadError, screen, nav, init, chatOpen, toggleChat, toast, session, settings } = useStore();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        toggleChat(false);
        (document.activeElement as HTMLElement | null)?.blur?.();
        return;
      }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === 't') toggleChat();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [toggleChat]);

  if (!ready) return <div className="empty" style={{ paddingTop: 120 }}><span className="spinner" /><div className="mt">Loading question bank…</div></div>;
  if (loadError) return <div className="page"><div className="error">Could not load the question bank: {loadError}</div></div>;

  const [title, sub] = TITLES[screen];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Logo /> SAT Practice</div>
        <div className="program">SAT <ChevronDown style={{ width: 22 }} /></div>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.id} className={screen === n.id ? 'active' : ''} onClick={() => nav(n.id)}><n.icon /> {n.label}{n.id === 'practice' && session ? ' •' : ''}</button>
          ))}
          <div className="divider" />
          <button className={screen === 'settings' ? 'active' : ''} onClick={() => nav('settings')}><SettingsIcon /> Settings</button>
          <button className={screen === 'help' ? 'active' : ''} onClick={() => nav('help')}><HelpIcon /> Help</button>
        </nav>
        <div className="spacer" />
        <div className="foot">{settings.hasLlmKey ? 'AI: connected' : 'AI: add a key in Settings'}<br />{navigator.onLine ? 'Online' : 'Offline — bank only'}</div>
      </aside>
      <div className="main">
        <header className="header">
          <div><h1>{title}</h1><div className="sub">{sub}</div></div>
          <div className="right">
            <button className={'btn sm' + (chatOpen ? ' primary' : '')} onClick={() => toggleChat()} title="AI tutor (T)"><ChatIcon /> AI Tutor</button>
            <div className="avatar">ME</div>
          </div>
        </header>
        <div className="content">
          <main className="page">
            {screen === 'home' && <Home />}
            {screen === 'bank' && <QuestionBank />}
            {screen === 'practice' && <Practice />}
            {screen === 'performance' && <Performance />}
            {screen === 'study' && <StudyTools />}
            {screen === 'settings' && <Settings />}
            {screen === 'help' && <Help />}
          </main>
          {chatOpen && <ChatPanel />}
        </div>
      </div>
      {toast && <div className={'toast ' + toast.kind}>{toast.text}</div>}
    </div>
  );
}
