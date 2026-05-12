import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AGENT_CONFIG } from '../types';
import { t } from '../i18n';

interface Props {
  agent: string;
  status: 'running' | 'completed';
  content: string;
  startTime: number;
  elapsed?: string;
}

const AVATAR_STYLES: Record<string, { bg: string; border: string }> = {
  'Senior Product Manager': { bg: 'var(--agent-pm-bg)', border: 'var(--agent-pm-border)' },
  'Senior Tech Lead': { bg: 'var(--agent-dev-bg)', border: 'var(--agent-dev-border)' },
  'VP of Product': { bg: 'var(--agent-boss-bg)', border: 'var(--agent-boss-border)' },
};

export function ChatMessage({ agent, status, content, startTime, elapsed }: Props) {
  const config = AGENT_CONFIG[agent] || { avatar: '🤖', color: 'var(--text-muted)', crewTagKey: '', shortNameKey: '' };
  const shortName = config.shortNameKey ? t(config.shortNameKey) : agent;
  const avatarStyle = AVATAR_STYLES[agent] || { bg: 'rgba(91,147,245,0.08)', border: 'rgba(91,147,245,0.18)' };

  // Debounced content for markdown rendering
  const [rendered, setRendered] = useState(content);
  useEffect(() => {
    if (status === 'completed') {
      setRendered(content);
      return;
    }
    const timer = setTimeout(() => setRendered(content), 80);
    return () => clearTimeout(timer);
  }, [content, status]);

  // Live elapsed
  const [liveElapsed, setLiveElapsed] = useState('');
  useEffect(() => {
    if (status === 'completed') return;
    const interval = setInterval(() => {
      setLiveElapsed(`${Math.round((Date.now() - startTime) / 1000)}s`);
    }, 1000);
    return () => clearInterval(interval);
  }, [status, startTime]);

  const displayElapsed = elapsed || liveElapsed;
  const crewTag = config.crewTagKey ? t(config.crewTagKey) : '';
  const isRunning = status === 'running';

  return (
    <div className="flex animate-fade-in-up" style={{ gap: 12, padding: '14px 0' }}>
      {/* ─── Avatar ─── */}
      <div style={{ flexShrink: 0 }}>
        {isRunning ? (
          /* Spinning ring wrapper → inner avatar counter-rotates */
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              border: '2px solid transparent',
              borderTopColor: config.color,
              animation: 'avatar-spin 1s linear infinite',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: avatarStyle.bg,
                border: `1px solid ${avatarStyle.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 17,
                animation: 'avatar-spin 1s linear infinite reverse',
              }}
            >
              {config.avatar}
            </div>
          </div>
        ) : (
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: avatarStyle.bg,
              border: `1px solid ${avatarStyle.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
            }}
          >
            {config.avatar}
          </div>
        )}
      </div>

      {/* ─── Body ─── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Meta row */}
        <div className="flex items-baseline" style={{ gap: 8, marginBottom: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: config.color }}>{shortName}</span>
          {crewTag && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 7px',
                borderRadius: 3,
                background: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
              }}
            >
              {crewTag}
            </span>
          )}
          <span
            style={{
              fontSize: 11,
              marginLeft: 'auto',
              color: isRunning ? config.color : 'var(--text-muted)',
              fontWeight: isRunning ? 500 : 400,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {isRunning ? `● ${displayElapsed}` : displayElapsed}
          </span>
        </div>

        {/* Content bubble */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${config.color}`,
            borderRadius: '2px 10px 10px 10px',
            padding: '14px 16px',
            fontSize: 13,
            lineHeight: 1.75,
          }}
        >
          {rendered ? (
            <div className={isRunning ? 'cursor-blink' : ''}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '14px 0 6px' }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '14px 0 5px' }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: '10px 0 4px' }}>{children}</h3>,
                  h4: ({ children }) => <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '10px 0 3px' }}>{children}</h4>,
                  p: ({ children }) => <p style={{ color: 'var(--text-secondary)', margin: '4px 0' }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ color: 'var(--text-secondary)', listStyle: 'none', padding: 0, margin: '4px 0' }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ color: 'var(--text-secondary)', paddingLeft: 18, margin: '4px 0' }}>{children}</ol>,
                  li: ({ children }) => (
                    <li style={{ paddingLeft: 14, position: 'relative', marginBottom: 2 }}>
                      <span style={{ position: 'absolute', left: 2, color: 'var(--text-muted)' }}>•</span>
                      {children}
                    </li>
                  ),
                  strong: ({ children }) => <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{children}</strong>,
                  code: ({ children }) => (
                    <code style={{ padding: '1px 5px', borderRadius: 4, fontSize: 12, background: 'var(--bg-tertiary)', color: 'var(--accent-amber)' }}>
                      {children}
                    </code>
                  ),
                }}
              >
                {rendered}
              </ReactMarkdown>
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('msg.thinking')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
