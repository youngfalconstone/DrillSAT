import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { complete, AIRequestError } from '../api';
import { buildChatSystem, progressSummary, textToHtml } from '@shared/ai';
import QuestionHtml from './QuestionHtml';
import { CloseIcon, TrashIcon } from './icons';

export default function ChatPanel() {
  const { currentQuestion, currentAnswer, currentAnswered, chatMessages, pushChat, clearChat, toggleChat, progress, settings, nav } = useStore();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chatMessages, busy]);
  useEffect(() => {
    taRef.current?.focus();
  }, []);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput('');
    setError(null);
    pushChat({ role: 'user', content: t });
    setBusy(true);
    try {
      const system = buildChatSystem({
        question: currentQuestion, userAnswer: currentAnswer, answered: currentAnswered,
        progressSummary: progressSummary(progress.sessions.flatMap((s) => s.answers)),
      });
      const history = [...useStore.getState().chatMessages].slice(-16);
      const reply = await complete({ system, messages: history, maxTokens: 1500 });
      pushChat({ role: 'assistant', content: reply.trim() });
    } catch (err) {
      setError(err instanceof AIRequestError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const quick = currentQuestion
    ? currentAnswered
      ? ['Explain the answer', 'Why is my answer wrong?', 'Show a faster method']
      : ['Give me a hint', 'What concept is this testing?', 'Where do I start?']
    : ['What should I study next?', 'How does adaptive difficulty work?'];

  return (
    <aside className="chatpanel">
      <div className="top">
        <span>AI Tutor</span>
        <span className="row" style={{ gap: 6 }}>
          <button className="iconbtn" title="Clear chat" onClick={clearChat}><TrashIcon /></button>
          <button className="iconbtn" title="Close (T)" onClick={() => toggleChat(false)}><CloseIcon /></button>
        </span>
      </div>
      <div className="ctx">
        {currentQuestion ? `Knows the current question: ${currentQuestion.skill} (${currentQuestion.source === 'ai' ? 'AI-generated' : currentQuestion.id})` : 'No question open — ask anything about the SAT or your progress.'}
      </div>
      <div className="msgs" ref={listRef}>
        {chatMessages.length === 0 && (
          <div className="muted small">Hi! I can explain concepts, give hints, and review your progress. I won’t give away the answer to the current question unless you ask.</div>
        )}
        {chatMessages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="msg user">{m.content}</div>
          ) : (
            <div key={i} className="msg assistant"><QuestionHtml html={textToHtml(m.content)} latex /></div>
          ),
        )}
        {busy && <div className="msg assistant"><span className="spinner" /> Thinking…</div>}
        {error && (
          <div className="error">
            {error}
            {!settings.hasLlmKey && <div className="mt"><button className="btn sm" onClick={() => nav('settings')}>Open Settings</button></div>}
          </div>
        )}
      </div>
      <div className="quick">{quick.map((q) => <button key={q} onClick={() => send(q)} disabled={busy}>{q}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea
          ref={taRef} className="input" value={input} placeholder="Ask the tutor… (Enter to send)" onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
        />
        <button className="btn primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </aside>
  );
}
