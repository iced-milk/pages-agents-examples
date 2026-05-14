import { useState } from 'react';
import { t, getLang } from '../i18n';
import type { HistoryItem } from '../hooks/useSSE';

interface Props {
  onSubmit: (productName: string) => void;
  isRunning: boolean;
  history: HistoryItem[];
  onSelectHistory: (id: string) => void;
  onRemoveHistory: (id: string) => void;
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

export function InputPanel({ onSubmit, isRunning, history, onSelectHistory, onRemoveHistory }: Props) {
  const [value, setValue] = useState('');

  const examples = [t('example.1'), t('example.2'), t('example.3')];

  const handleSubmit = () => {
    const name = value.trim();
    if (name) onSubmit(name);
  };

  return (
    <div className="flex flex-col h-full" style={{ gap: 20 }}>
      {/* ─── Input Section ─── */}
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
          onChange={(e) => setValue(e.target.value)}
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
            transition: 'var(--transition)',
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
            transition: 'var(--transition)',
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

      {/* ─── Quick Examples ─── */}
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
              onClick={() => setValue(ex)}
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
                transition: 'var(--transition-fast)',
                opacity: isRunning ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isRunning) {
                  e.currentTarget.style.borderColor = 'var(--accent-blue)';
                  e.currentTarget.style.color = 'var(--accent-blue)';
                  e.currentTarget.style.background = 'rgba(91, 147, 245, 0.06)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.background = 'transparent';
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
                  transition: 'var(--transition-fast)',
                  gap: 8,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-blue)';
                  const del = e.currentTarget.querySelector('[data-delete]') as HTMLElement;
                  if (del) del.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-light)';
                  const del = e.currentTarget.querySelector('[data-delete]') as HTMLElement;
                  if (del) del.style.opacity = '0';
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
                  data-delete
                  onClick={(e) => { e.stopPropagation(); onRemoveHistory(item.id); }}
                  className="cursor-pointer"
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 4px',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    opacity: 0,
                    transition: 'var(--transition-fast)',
                    fontFamily: 'inherit',
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--accent-red)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-muted)';
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

      {/* ─── Concepts (anchored to bottom) ─── */}
      <div
        style={{
          marginTop: 'auto',
          padding: 14,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-light)',
          background: 'var(--bg-elevated)',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
          {t('input.concepts')}
        </div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          {['concept.flow', 'concept.crew', 'concept.agent', 'concept.task'].map((key) => (
            <div key={key} className="flex items-center" style={{ gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
              <span
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'var(--accent-blue)',
                  flexShrink: 0,
                  opacity: 0.8,
                }}
              />
              {t(key)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
