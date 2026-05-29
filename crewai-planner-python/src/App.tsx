import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useSSE, getHistory, removeHistory as removeHistoryItem } from './hooks/useSSE';
import type { HistoryItem } from './hooks/useSSE';
import { InputPanel } from './components/InputPanel';
import { FlowTimeline } from './components/FlowTimeline';
import { ChatMessage, OptionsCard, UserMessage } from './components/ChatMessage';
import { RoleDivider } from './components/RoleDivider';
import { ErrorMessage } from './components/ErrorMessage';
import type { ChatItem, FlowStatus, Phase, PhaseNode } from './types';
import { t, getLocaleName, toggleLang, onLangChange } from './i18n';

// --- Phase nodes (the timeline) ---

const INITIAL_PHASES: PhaseNode[] = [
  { phase: 'discover', status: 'pending' },
  { phase: 'draft', status: 'pending' },
  { phase: 'iterate', status: 'pending' },
];

function phasesFor(current: Phase | null, completed: Set<Phase>): PhaseNode[] {
  return INITIAL_PHASES.map((p) => ({
    ...p,
    status: completed.has(p.phase)
      ? 'completed'
      : current === p.phase
        ? 'running'
        : 'pending',
  }));
}

// --- App state ---

interface AppState {
  flowStatus: FlowStatus;
  messages: ChatItem[];
  currentPhase: Phase | null;
  completedPhases: Set<Phase>;
  isHistoryView: boolean;
}

const INITIAL_STATE: AppState = {
  flowStatus: 'idle',
  messages: [],
  currentPhase: null,
  completedPhases: new Set(),
  isHistoryView: false,
};

// --- Reducer ---

type Action =
  | { type: 'RESET' }
  | { type: 'USER_MESSAGE'; content: string }
  | { type: 'TURN_START' }
  | { type: 'PHASE'; phase: Phase }
  | { type: 'AGENT_START'; agent: string }
  | { type: 'CHUNK'; agent: string; content: string }
  | { type: 'AGENT_END'; agent: string }
  | { type: 'OPTIONS'; choices: { key: string; text: string }[]; canFinish?: boolean }
  | { type: 'SELECT_OPTION'; key: string }
  | { type: 'DONE' }
  | { type: 'ERROR'; message: string }
  | { type: 'RESTORE'; messages: ChatItem[]; phase: Phase | null; completed: Set<Phase> };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'RESET':
      return { ...INITIAL_STATE, completedPhases: new Set(), isHistoryView: false };

    case 'USER_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, { type: 'user', content: action.content }],
      };

    case 'TURN_START':
      return { ...state, flowStatus: 'running' };

    case 'PHASE': {
      // Mark previous phase completed when switching to a different one.
      const completed = new Set(state.completedPhases);
      if (state.currentPhase && state.currentPhase !== action.phase) {
        completed.add(state.currentPhase);
      }
      return { ...state, currentPhase: action.phase, completedPhases: completed };
    }

    case 'AGENT_START': {
      return {
        ...state,
        messages: [
          ...state.messages,
          { type: 'divider' as const, agent: action.agent },
          { type: 'message' as const, agent: action.agent, status: 'running', content: '' },
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
      const msgs = [...state.messages];

      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.type === 'message' && m.agent === action.agent && m.status === 'running') {
          // Strip markers for display
          let displayContent = m.content
            .replace(/\[READY\]/g, '')
            .replace(/\[PRD_UPDATED\]/g, '')
            .replace(/\[SPEC_UPDATED\]/g, '')
            .trim();

          msgs[i] = { ...m, status: 'completed' as const, content: displayContent };
          break;
        }
      }
      return { ...state, messages: msgs };
    }

    case 'DONE': {
      // If there are pending options, flow is waiting for user — show as idle not completed
      const hasPendingOptions = state.messages.some(
        (m) => m.type === 'options' && !m.selected
      );
      if (hasPendingOptions) {
        return { ...state, flowStatus: 'idle' };
      }
      // Mark current phase as completed when flow truly ends
      const allCompleted = new Set(state.completedPhases);
      if (state.currentPhase) {
        allCompleted.add(state.currentPhase);
      }
      return { ...state, flowStatus: 'completed', completedPhases: allCompleted, currentPhase: null };
    }

    case 'OPTIONS':
      return {
        ...state,
        messages: [...state.messages, { type: 'options' as const, choices: action.choices, canFinish: action.canFinish }],
      };

    case 'SELECT_OPTION': {
      const msgs = [...state.messages];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].type === 'options' && !(msgs[i] as any).selected) {
          msgs[i] = { ...msgs[i], selected: action.key } as any;
          break;
        }
      }
      return { ...state, messages: msgs };
    }

    case 'ERROR':
      return {
        ...state,
        flowStatus: 'error',
        messages: [
          ...state.messages,
          { type: 'error' as const, text: action.message },
        ],
      };

    case 'RESTORE':
      return {
        ...state,
        flowStatus: 'completed',
        messages: action.messages,
        currentPhase: action.phase,
        completedPhases: action.completed,
        isHistoryView: true,
      };

    default:
      return state;
  }
}

// --- App ---

export default function App() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { events, send, loadHistory, resetConversation } = useSSE();
  const processedRef = useRef(0);

  const [history, setHistory] = useState<HistoryItem[]>(getHistory);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const refreshHistory = useCallback(() => setHistory(getHistory()), []);

  const handleRemoveHistory = useCallback((id: string) => {
    removeHistoryItem(id);
    refreshHistory();
  }, [refreshHistory]);

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
          dispatch({ type: 'TURN_START' });
          break;
        case 'phase':
          if (event.phase) dispatch({ type: 'PHASE', phase: event.phase });
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
        case 'options':
          if (event.choices) dispatch({ type: 'OPTIONS', choices: event.choices, canFinish: event.canFinish });
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

  const isFirstTurn = state.messages.length === 0;

  const handleSubmit = useCallback((text: string) => {
    // If previous conversation ended, reset before starting new one
    if (!isFirstTurn) {
      dispatch({ type: 'RESET' });
      resetConversation();
      processedRef.current = 0;
    }
    dispatch({ type: 'USER_MESSAGE', content: text });
    dispatch({ type: 'TURN_START' });
    isNearBottomRef.current = true;
    send(text, getLocaleName(), { isFirstTurn: true });
    setTimeout(refreshHistory, 100);
  }, [send, isFirstTurn, resetConversation, refreshHistory]);

  const handleNewChat = useCallback(() => {
    dispatch({ type: 'RESET' });
    resetConversation();
    processedRef.current = 0;
  }, [resetConversation]);

  const handleSelectOption = useCallback((key: string, text: string) => {
    dispatch({ type: 'SELECT_OPTION', key });
    dispatch({ type: 'USER_MESSAGE', content: text });
    dispatch({ type: 'TURN_START' });
    isNearBottomRef.current = true;
    send(text, getLocaleName(), { isFirstTurn: false });
  }, [send]);

  const handleDone = useCallback(() => {
    const text = t('options.finalize');
    dispatch({ type: 'SELECT_OPTION', key: 'done' });
    dispatch({ type: 'USER_MESSAGE', content: text });
    dispatch({ type: 'TURN_START' });
    isNearBottomRef.current = true;
    send(text, getLocaleName(), { isFirstTurn: false });
  }, [send]);

  const handleSelectHistory = useCallback(async (id: string) => {
    setIsLoadingHistory(true);
    dispatch({ type: 'RESET' });
    processedRef.current = 0;
    const messages = await loadHistory(id);

    const restored: ChatItem[] = [];
    let lastPhase: Phase | null = null;
    const completed = new Set<Phase>();

    for (const msg of messages) {
      const meta = (msg.metadata || {}) as Record<string, unknown>;
      const agent = meta.agent as string | undefined;
      const phase = meta.phase as Phase | undefined;

      if (msg.role === 'user') {
        restored.push({ type: 'user', content: msg.content });
        continue;
      }

      // Track phase progression for the timeline
      if (phase) {
        if (lastPhase && lastPhase !== phase) completed.add(lastPhase);
        lastPhase = phase;
      }

      if (agent) {
        // Hide Reviewer messages (same as live streaming)
        if (agent === 'Product Reviewer') continue;
        restored.push({ type: 'divider', agent });
        restored.push({
          type: 'message',
          agent,
          status: 'completed',
          content: msg.content,
        });
      }
    }

    // Promote the last seen phase as the current phase (if not yet completed elsewhere)
    if (lastPhase) completed.delete(lastPhase);

    dispatch({
      type: 'RESTORE',
      messages: restored,
      phase: lastPhase,
      completed,
    });
    setIsLoadingHistory(false);
  }, [loadHistory]);

  // Auto-restore from URL ?id= on mount
  const hasAutoLoaded = useRef(false);
  useEffect(() => {
    if (hasAutoLoaded.current) return;
    hasAutoLoaded.current = true;
    const urlId = new URLSearchParams(window.location.search).get('id');
    if (urlId) {
      handleSelectHistory(urlId);
    }
  }, [handleSelectHistory]);

  const phaseNodes = phasesFor(state.currentPhase, state.completedPhases);

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
          }}
        >
          {t('lang.switch')}
        </button>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
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
            isFirstTurn={isFirstTurn}
            isRunning={!isFirstTurn && state.flowStatus !== 'completed'}
            onSubmit={handleSubmit}
            history={history}
            onSelectHistory={handleSelectHistory}
            onRemoveHistory={handleRemoveHistory}
            onNewChat={handleNewChat}
          />
        </aside>

        {/* Right Content */}
        <main className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
          {/* Phase timeline */}
          {!isFirstTurn && (
            <div
              className="flex-shrink-0"
              style={{
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
              }}
            >
              <FlowTimeline phases={phaseNodes} />
            </div>
          )}

          {/* Messages area */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
          >
            {isLoadingHistory ? (
              <div
                className="h-full flex flex-col items-center justify-center"
                style={{ padding: '0 24px' }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: '3px solid var(--border-light)',
                    borderTopColor: 'var(--accent-blue)',
                    animation: 'spin 0.8s linear infinite',
                    display: 'inline-block',
                    marginBottom: 12,
                  }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {t('history.loading')}
                </span>
              </div>
            ) : isFirstTurn ? (
              /* Empty state */
              <div
                className="h-full flex flex-col items-center justify-center"
                style={{ padding: '0 24px' }}
              >
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
                <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>
                  {t('empty.title')}
                </h3>
                <div className="flex flex-col" style={{ gap: 0, maxWidth: 320 }}>
                  {['empty.step1', 'empty.step2', 'empty.step3'].map((key, i, arr) => (
                    <div key={key} className="flex items-stretch" style={{ gap: 12 }}>
                      {/* Left: number + connector line */}
                      <div className="flex flex-col items-center" style={{ width: 20 }}>
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            border: '1.5px solid var(--accent-blue)',
                            background: 'transparent',
                            color: 'var(--accent-blue)',
                            fontSize: 10,
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {i + 1}
                        </span>
                        {i < arr.length - 1 && (
                          <div style={{ width: 1, flex: 1, background: 'var(--border)', margin: '4px 0' }} />
                        )}
                      </div>
                      {/* Right: text */}
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, paddingBottom: i < arr.length - 1 ? 14 : 0, paddingTop: 1 }}>
                        {t(key)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Message stream */
              <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 28px 32px' }}>
                {state.messages.map((item, i) => {
                  if (item.type === 'user') return <UserMessage key={i} content={item.content} />;
                  if (item.type === 'divider') return <RoleDivider key={i} agent={item.agent} />;
                  if (item.type === 'error') return <ErrorMessage key={i} text={item.text} />;
                  if (item.type === 'options') {
                    return (
                      <OptionsCard
                        key={i}
                        choices={item.choices}
                        selected={item.selected}
                        onSelect={handleSelectOption}
                        onDone={item.canFinish ? handleDone : undefined}
                      />
                    );
                  }
                  if (item.type === 'message') {
                    return (
                      <ChatMessage
                        key={i}
                        agent={item.agent}
                        status={item.status}
                        content={item.content}
                      />
                    );
                  }
                  return null;
                })}
                {/* Loading indicator: shows when running but no agent is streaming and no options waiting */}
                {state.flowStatus === 'running' && !state.messages.some(
                  (m) => m.type === 'message' && m.status === 'running'
                ) && !state.messages.some(
                  (m) => m.type === 'options' && !m.selected
                ) && (
                  <div className="flex items-center" style={{ gap: 4, padding: '14px 0', marginLeft: 50 }}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--accent-blue)',
                          opacity: 0.6,
                          animation: `dot-bounce 1.2s ${i * 0.2}s infinite ease-in-out`,
                        }}
                      />
                    ))}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Conversation ended / history hint */}
          {((state.isHistoryView) || (!isFirstTurn && !state.isHistoryView && state.flowStatus === 'completed' && !state.messages.some(
            (m) => m.type === 'options' && !m.selected
          ))) && (
            <div
              className="flex items-center justify-center"
              style={{
                padding: '10px 24px',
                borderTop: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {t('msg.ended')}
              </span>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
