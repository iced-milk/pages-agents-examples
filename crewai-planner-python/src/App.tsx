import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useSSE } from './hooks/useSSE';
import { InputPanel } from './components/InputPanel';
import { FlowTimeline } from './components/FlowTimeline';
import { ChatMessage } from './components/ChatMessage';
import { RoleDivider } from './components/RoleDivider';
import { SystemMessage } from './components/SystemMessage';
import type { AgentTimelineNode, ChatItem, FlowStatus } from './types';
import { AGENT_CONFIG } from './types';
import { t, getLocaleName, toggleLang, onLangChange } from './i18n';

// --- State ---
interface AppState {
  flowStatus: FlowStatus;
  messages: ChatItem[];
  timeline: AgentTimelineNode[];
  totalStartTime: number | null;
}

const INITIAL_TIMELINE: AgentTimelineNode[] = Object.keys(AGENT_CONFIG).map((role) => ({
  role,
  status: 'pending' as const,
}));

const INITIAL_STATE: AppState = {
  flowStatus: 'idle',
  messages: [],
  timeline: INITIAL_TIMELINE,
  totalStartTime: null,
};

// --- Reducer ---
type Action =
  | { type: 'RESET' }
  | { type: 'FLOW_START' }
  | { type: 'AGENT_START'; agent: string }
  | { type: 'CHUNK'; agent: string; content: string }
  | { type: 'AGENT_END'; agent: string }
  | { type: 'DONE' }
  | { type: 'ERROR'; message: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'RESET':
      return { ...INITIAL_STATE, timeline: INITIAL_TIMELINE.map((n) => ({ ...n, status: 'pending' })) };

    case 'FLOW_START':
      return { ...state, flowStatus: 'running', totalStartTime: Date.now() };

    case 'AGENT_START': {
      const now = Date.now();
      return {
        ...state,
        timeline: state.timeline.map((n) =>
          n.role === action.agent ? { ...n, status: 'running' } : n,
        ),
        messages: [
          ...state.messages,
          { type: 'divider' as const, agent: action.agent },
          { type: 'message' as const, agent: action.agent, status: 'running', content: '', startTime: now },
        ],
      };
    }

    case 'CHUNK': {
      const msgs = [...state.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.type === 'message' && m.agent === action.agent && m.status === 'running') {
          msgs[i] = { ...m, content: m.content + action.content };
          break;
        }
      }
      return { ...state, messages: msgs };
    }

    case 'AGENT_END': {
      const now = Date.now();
      return {
        ...state,
        timeline: state.timeline.map((n) =>
          n.role === action.agent ? { ...n, status: 'completed' } : n,
        ),
        messages: state.messages.map((m) => {
          if (m.type === 'message' && m.agent === action.agent && m.status === 'running') {
            const elapsed = `${Math.round((now - m.startTime) / 1000)}s`;
            return { ...m, status: 'completed' as const, elapsed };
          }
          return m;
        }),
      };
    }

    case 'DONE': {
      const totalElapsed = state.totalStartTime
        ? `${Math.round((Date.now() - state.totalStartTime) / 1000)}s`
        : '';
      return {
        ...state,
        flowStatus: 'completed',
        messages: [
          ...state.messages,
          { type: 'system' as const, text: `${t('msg.done')} · ${totalElapsed}` },
        ],
      };
    }

    case 'ERROR':
      return {
        ...state,
        flowStatus: 'error',
        messages: [
          ...state.messages,
          { type: 'system' as const, text: `❌ ${action.message}` },
        ],
      };

    default:
      return state;
  }
}

// --- App ---
export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { events, start } = useSSE();
  const processedRef = useRef(0);

  // Force re-render on language change
  const [, setLangTick] = useState(0);
  useEffect(() => {
    return onLangChange(() => setLangTick((n) => n + 1));
  }, []);

  // Smart auto-scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [state.messages]);

  // Process SSE events
  useEffect(() => {
    const newEvents = events.slice(processedRef.current);
    processedRef.current = events.length;

    for (const event of newEvents) {
      switch (event.type) {
        case 'flow_start':
          dispatch({ type: 'FLOW_START' });
          break;
        case 'agent_start':
          if (event.agent) dispatch({ type: 'AGENT_START', agent: event.agent });
          break;
        case 'chunk':
          if (event.agent && event.content) dispatch({ type: 'CHUNK', agent: event.agent, content: event.content });
          break;
        case 'agent_end':
          if (event.agent) dispatch({ type: 'AGENT_END', agent: event.agent });
          break;
        case 'done':
          dispatch({ type: 'DONE' });
          break;
        case 'error':
          dispatch({ type: 'ERROR', message: event.message || 'Unknown error' });
          break;
      }
    }
  }, [events]);

  const handleSubmit = (productName: string) => {
    dispatch({ type: 'RESET' });
    dispatch({ type: 'FLOW_START' });  // Immediately show loading state
    isNearBottomRef.current = true;
    start(productName, getLocaleName());
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Top Bar */}
      <header
        className="flex items-center justify-between px-5 flex-shrink-0"
        style={{
          height: 52,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}
      >
        {/* Left: logo + title + status */}
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center"
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: 'linear-gradient(135deg, #5b93f5 0%, #7c3aed 100%)',
              fontSize: 12,
            }}
          >
            ⚡
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>
            CrewAI Product Planner
          </span>
          {/* Status indicator */}
          <div className="flex items-center gap-1.5" style={{ marginLeft: 4 }}>
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background:
                  state.flowStatus === 'running' ? 'var(--accent-amber)'
                  : state.flowStatus === 'completed' ? 'var(--accent-green)'
                  : state.flowStatus === 'error' ? 'var(--accent-red)'
                  : 'var(--text-muted)',
                animation: state.flowStatus === 'running' ? 'blink 1.2s infinite' : 'none',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
              {t(`status.${state.flowStatus}`)}
            </span>
          </div>
        </div>

        {/* Right: language toggle */}
        <button
          onClick={toggleLang}
          className="cursor-pointer"
          style={{
            padding: '3px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 11,
            fontWeight: 500,
            fontFamily: 'inherit',
            transition: 'var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-light)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          {t('lang.switch')}
        </button>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <aside
          className="flex-shrink-0 overflow-y-auto"
          style={{
            width: 300,
            padding: 20,
            borderRight: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
          }}
        >
          <InputPanel
            onSubmit={handleSubmit}
            isRunning={state.flowStatus === 'running'}
          />
        </aside>

        {/* Right Content */}
        <main className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
          {/* Timeline bar */}
          {state.flowStatus !== 'idle' && (
            <div
              className="flex-shrink-0"
              style={{
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
              }}
            >
              <FlowTimeline agents={state.timeline} />
            </div>
          )}

          {/* Messages area */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
          >
            {state.flowStatus === 'idle' ? (
              /* Empty State — welcoming & visible */
              <div
                className="h-full flex flex-col items-center justify-center"
                style={{ padding: '0 24px' }}
              >
                {/* Glowing icon */}
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 20,
                    background: 'linear-gradient(145deg, var(--bg-tertiary), var(--bg-elevated))',
                    border: '1px solid var(--border-light)',
                    fontSize: 36,
                    marginBottom: 24,
                    boxShadow: '0 4px 24px rgba(99, 150, 245, 0.08), 0 0 0 1px rgba(99, 150, 245, 0.05)',
                    animation: 'float 4s ease-in-out infinite',
                  }}
                >
                  🚀
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                  {t('empty.title')}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 360, textAlign: 'center', lineHeight: 1.7 }}>
                  {t('empty.desc')}
                </p>

                {/* Decorative agent preview chips */}
                <div className="flex items-center gap-3" style={{ marginTop: 32 }}>
                  {Object.entries(AGENT_CONFIG).map(([role, cfg]) => (
                    <div
                      key={role}
                      className="flex items-center gap-2"
                      style={{
                        padding: '6px 14px',
                        borderRadius: 20,
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{cfg.avatar}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {t(cfg.shortNameKey)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Message Stream */
              <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 28px 32px' }}>
                {state.flowStatus === 'running' && state.messages.length === 0 && (
                  <SystemMessage text={t('msg.generating')} />
                )}
                {state.messages.map((item, i) => {
                  if (item.type === 'divider') return <RoleDivider key={i} agent={item.agent} />;
                  if (item.type === 'system') return <SystemMessage key={i} text={item.text} />;
                  if (item.type === 'message') {
                    return (
                      <ChatMessage
                        key={i}
                        agent={item.agent}
                        status={item.status}
                        content={item.content}
                        startTime={item.startTime}
                        elapsed={item.elapsed}
                      />
                    );
                  }
                  return null;
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
