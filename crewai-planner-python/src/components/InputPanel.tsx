import { useState } from 'react';
import { t, getLang } from '../i18n';
import type { HistoryItem } from '../hooks/useSSE';

interface Props {
  /** True if no messages yet — show product-name CTA + examples. */
  isFirstTurn: boolean;
  /** True while a turn is streaming — disable input. */
  isRunning: boolean;
  onSubmit: (text: string) => void;
  history: HistoryItem[];
  onSelectHistory: (id: string) => void;
  onRemoveHistory: (id: string) => void;
  onNewChat: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const zh = getLang() === 'zh';

  if (minutes < 1) return zh ? '刚刚' : 'just now';
  if (minutes < 60) return zh ? `${minutes} 分钟前` : `${minutes}m ago`;
  if (hours < 24) return zh ? `${hours} 小时前` : `${hours}h ago`;
  if (days < 7) return zh ? `${days} 天前` : `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(zh ? 'zh-CN' : 'en-US');
}

/**
 * Sidebar input panel.
 * - First turn: prompts the boss to enter a product name (with quick examples).
 * - Subsequent turns: shows just the history list and a "new chat" button.
 *   The actual chat input lives at the bottom of the main chat column.
 */
export function InputPanel({
  isFirstTurn,
  isRunning,
  onSubmit,
  history,
  onSelectHistory,
  onRemoveHistory,
  onNewChat,
}: Props) {
  const [value, setValue] = useState('');

  const examples = [t('example.1'), t('example.2'), t('example.3')];

  const handleSubmit = () => {
    const name = value.trim();
    if (name && !isRunning) {
      onSubmit(name);
      setValue('');
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ gap: 20 }}>
      {/* ─── Product-name input ─── */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1.2px',
          }}
        >
          {t('input.label')}
        </label>

        <input
          type="text"
          value={value}
          onChange={(e) => !isRunning && setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !isRunning && handleSubmit()}
          placeholder={t('input.placeholder')}
          disabled={isRunning}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
            opacity: isRunning ? 0.5 : 1,
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={isRunning || !value.trim()}
          className="cursor-pointer"
          style={{
            width: '100%',
            padding: '10px 0',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: isRunning
              ? 'var(--accent-amber)'
              : 'linear-gradient(135deg, #5b93f5 0%, #7c6bf5 100%)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            opacity: isRunning || !value.trim() ? 0.55 : 1,
            cursor: isRunning || !value.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            boxShadow: isRunning || !value.trim()
              ? 'none'
              : '0 2px 12px rgba(91, 147, 245, 0.25)',
          }}
        >
          {isRunning && (
            <span
              style={{
                width: 13,
                height: 13,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTopColor: '#fff',
                animation: 'spin 0.8s linear infinite',
                display: 'inline-block',
              }}
            />
          )}
          {isRunning ? t('input.running') : t('input.start')}
        </button>
      </div>

      {/* Quick examples */}
      <div className="flex flex-col" style={{ gap: 10 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1.2px',
          }}
        >
          {t('input.examples')}
        </span>
        <div className="flex flex-wrap" style={{ gap: 6 }}>
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => !isRunning && setValue(ex)}
              disabled={isRunning}
              className="cursor-pointer"
              style={{
                padding: '5px 12px',
                borderRadius: 16,
                border: '1px solid var(--border-light)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontFamily: 'inherit',
                opacity: isRunning ? 0.4 : 1,
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* ─── History ─── */}
      {history.length > 0 && (
        <div className="flex flex-col" style={{ gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '1.2px',
            }}
          >
            {t('history.title')}
          </span>
          <div className="flex flex-col" style={{ gap: 4 }}>
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center"
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-tertiary)',
                  gap: 8,
                }}
              >
                <button
                  onClick={() => onSelectHistory(item.id)}
                  disabled={isRunning}
                  className="cursor-pointer"
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontFamily: 'inherit',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    opacity: isRunning ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    {item.productName}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {formatRelativeTime(item.timestamp)}
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveHistory(item.id); }}
                  className="cursor-pointer"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 4px',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    borderRadius: 4,
                  }}
                  title={t('history.delete')}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

