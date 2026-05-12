import { AGENT_CONFIG } from '../types';
import { t } from '../i18n';

interface Props {
  agent: string;
}

export function RoleDivider({ agent }: Props) {
  const config = AGENT_CONFIG[agent];
  const color = config?.color || 'var(--text-muted)';
  const shortName = config?.shortNameKey ? t(config.shortNameKey) : agent;

  return (
    <div className="flex items-center animate-fade-in" style={{ gap: 10, padding: '14px 0 4px', marginTop: 4 }}>
      <div
        style={{
          flex: 1,
          height: 1,
          background: 'linear-gradient(90deg, transparent 0%, var(--border) 100%)',
        }}
      />
      <div
        className="flex items-center"
        style={{
          gap: 6,
          padding: '3px 11px',
          borderRadius: 16,
          border: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
        <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          {shortName} {t('msg.speaking')}
        </span>
      </div>
      <div
        style={{
          flex: 1,
          height: 1,
          background: 'linear-gradient(90deg, var(--border) 0%, transparent 100%)',
        }}
      />
    </div>
  );
}
