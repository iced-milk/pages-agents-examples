import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { AGENT_CONFIG } from '../types';
import { t } from '../i18n';

interface Props {
  agent: string;
  status: 'running' | 'completed';
  content: string;
}

const AVATAR_STYLES: Record<string, { bg: string; border: string }> = {
  'Senior Product Manager': { bg: 'var(--agent-pm-bg)', border: 'var(--agent-pm-border)' },
  'Senior Tech Lead': { bg: 'var(--agent-dev-bg)', border: 'var(--agent-dev-border)' },
};

export function ChatMessage({ agent, status, content }: Props) {
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
                remarkPlugins={[remarkGfm, remarkBreaks]}
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
                  table: ({ children }) => (
                    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => <thead style={{ borderBottom: '1.5px solid var(--border)' }}>{children}</thead>,
                  th: ({ children }) => <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{children}</th>,
                  td: ({ children }) => <td style={{ padding: '5px 10px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>{children}</td>,
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


// ─── Options card (A/B/C buttons + inline input + done) ───

interface OptionsCardProps {
  choices: { key: string; text: string }[];
  selected?: string;
  onSelect: (key: string, text: string) => void;
  onDone?: () => void;
}

export function OptionsCard({ choices, selected, onSelect, onDone }: OptionsCardProps) {
  const [customText, setCustomText] = useState('');
  const [expanded, setExpanded] = useState(!selected);

  // Auto-collapse after selection
  useEffect(() => {
    if (selected) setExpanded(false);
  }, [selected]);

  const handleCustomSubmit = () => {
    const v = customText.trim();
    if (v && !selected) {
      onSelect('custom', v);
    }
  };

  const isDisabled = !!selected;

  // After selection: collapse to show only selected item with expand toggle
  if (isDisabled && !expanded) {
    const selectedChoice = selected === 'custom'
      ? { key: '✏️', text: customText }
      : selected === 'done'
        ? { key: '✓', text: t('options.done') }
        : choices.find((c) => c.key === selected);
    return (
      <div style={{ padding: '2px 0 6px', marginLeft: 50 }}>
        <button
          onClick={() => setExpanded(true)}
          className="cursor-pointer flex items-center"
          style={{
            gap: 6,
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--border-light)',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: 11,
            fontFamily: 'inherit',
            fontWeight: 400,
            cursor: 'pointer',
            maxWidth: '70%',
          }}
        >
          <span style={{ fontSize: 10, flexShrink: 0 }}>{selectedChoice?.key || '?'}.</span>
          <span style={{ opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedChoice?.text || ''}</span>
          <span style={{ fontSize: 10, flexShrink: 0, opacity: 0.5 }}>▾</span>
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up" style={{ padding: isDisabled ? '4px 0 8px' : '8px 0 12px', marginLeft: 50 }}>
      <div className="flex flex-col" style={{ gap: isDisabled ? 6 : 8 }}>
        {/* Collapse toggle after selection */}
        {isDisabled && (
          <button
            onClick={() => setExpanded(false)}
            className="cursor-pointer"
            style={{
              alignSelf: 'flex-end',
              padding: '2px 8px',
              borderRadius: 4,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 10,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {t('doc.collapse')}
          </button>
        )}

        {choices.map((c) => {
          const isSelected = selected === c.key;
          // After selection: all items use muted styling
          const muted = isDisabled;
          return (
            <button
              key={c.key}
              onClick={() => !isDisabled && onSelect(c.key, c.text)}
              disabled={isDisabled}
              className="cursor-pointer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: muted ? '7px 12px' : '10px 14px',
                borderRadius: 10,
                border: isSelected && !muted
                  ? '1.5px solid var(--accent-blue)'
                  : '1px solid var(--border-light)',
                background: isSelected && !muted
                  ? 'rgba(91, 147, 245, 0.08)'
                  : 'var(--bg-secondary)',
                color: muted
                  ? isSelected ? 'var(--text-secondary)' : 'var(--text-muted)'
                  : isSelected ? 'var(--accent-blue)' : 'var(--text-secondary)',
                fontSize: muted ? 12 : 13,
                fontFamily: 'inherit',
                fontWeight: isSelected ? 500 : 400,
                textAlign: 'left',
                cursor: isDisabled ? 'default' : 'pointer',
                opacity: muted && !isSelected ? 0.4 : muted ? 0.85 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              <span
                style={{
                  width: muted ? 18 : 22,
                  height: muted ? 18 : 22,
                  borderRadius: '50%',
                  border: isSelected && !muted
                    ? '2px solid var(--accent-blue)'
                    : '1.5px solid var(--border)',
                  background: isSelected && !muted ? 'var(--accent-blue)' : 'transparent',
                  color: isSelected && !muted ? '#fff' : 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {c.key}
              </span>
              <span>{c.text}</span>
            </button>
          );
        })}

        {/* Inline custom input */}
        {!isDisabled && (
          <div
            className="flex items-center"
            style={{
              gap: 8,
              padding: '6px 14px',
              borderRadius: 10,
              border: '1px dashed var(--border-light)',
              background: 'var(--bg-tertiary)',
            }}
          >
            <span style={{ fontSize: 14, color: 'var(--text-muted)', flexShrink: 0 }}>✏️</span>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
              placeholder={t('options.custom')}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            {customText.trim() && (
              <button
                onClick={handleCustomSubmit}
                className="cursor-pointer"
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'var(--accent-blue)',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {t('chat.send')}
              </button>
            )}
          </div>
        )}
        {selected === 'custom' && (
          <div
            style={{
              padding: '5px 12px',
              borderRadius: 10,
              border: '1px solid var(--border-light)',
              background: 'var(--bg-secondary)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              fontWeight: 400,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: 0.85,
            }}
          >
            <span style={{ fontSize: 12 }}>✏️</span>
            <span>{customText || '...'}</span>
          </div>
        )}

        {/* Done button */}
        {!isDisabled && onDone && (
          <button
            onClick={onDone}
            className="cursor-pointer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 14px',
              borderRadius: 10,
              border: '1px solid var(--border-light)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-muted)',
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 13 }}>✓</span>
            <span>{t('options.done')}</span>
          </button>
        )}
        {/* Done selected (muted) */}
        {isDisabled && selected === 'done' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 12px',
              borderRadius: 10,
              border: '1px solid var(--border-light)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              opacity: 0.85,
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 12 }}>✓</span>
            <span>{t('options.done')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── User message bubble (right-aligned) ───

interface UserMsgProps {
  content: string;
}

export function UserMessage({ content }: UserMsgProps) {
  return (
    <div className="flex animate-fade-in-up" style={{ justifyContent: 'flex-end', padding: '10px 0' }}>
      <div
        style={{
          maxWidth: '78%',
          padding: '9px 14px',
          background: 'var(--accent-blue)',
          color: '#fff',
          fontSize: 13,
          lineHeight: 1.6,
          borderRadius: '12px 12px 2px 12px',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </div>
    </div>
  );
}
