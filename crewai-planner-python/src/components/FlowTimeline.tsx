import type { PhaseNode } from '../types';
import { t } from '../i18n';

interface Props {
  phases: PhaseNode[];
}

const PHASE_META: Record<string, { icon: string; labelKey: string; color: string }> = {
  discover: { icon: '📝', labelKey: 'phase.discover', color: 'var(--agent-pm)' },
  draft: { icon: '📄', labelKey: 'phase.draft', color: 'var(--agent-dev)' },
  iterate: { icon: '💡', labelKey: 'phase.iterate', color: 'var(--accent-blue)' },
};

export function FlowTimeline({ phases }: Props) {
  return (
    <div className="flex items-center justify-center" style={{ padding: '14px 24px', gap: 0 }}>
      {phases.map((node, i) => {
        const meta = PHASE_META[node.phase];
        const label = t(meta.labelKey);
        const isLast = i === phases.length - 1;
        const isCompleted = node.status === 'completed';
        const isRunning = node.status === 'running';

        return (
          <div key={node.phase} className="flex items-center">
            <div className="flex flex-col items-center" style={{ gap: 5 }}>
              <div
                className="flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: `2px solid ${
                    isCompleted ? 'var(--accent-green)'
                    : isRunning ? meta.color
                    : 'var(--border)'
                  }`,
                  background: isCompleted ? 'var(--accent-green)' : 'var(--bg-secondary)',
                  color: isCompleted ? '#fff' : isRunning ? meta.color : 'var(--text-muted)',
                  fontSize: isCompleted ? 12 : 14,
                  fontWeight: 700,
                  transition: 'all 0.4s ease',
                  animation: isRunning ? 'pulse-ring 2s infinite' : 'none',
                }}
              >
                {isCompleted ? '✓' : meta.icon}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: node.status === 'pending' ? 'var(--text-muted)' : 'var(--text-secondary)',
                  transition: 'color 0.3s ease',
                }}
              >
                {label}
              </span>
            </div>

            {!isLast && (
              <div
                style={{
                  width: 52,
                  height: 2,
                  margin: '0 3px',
                  marginBottom: 20,
                  borderRadius: 1,
                  background: isCompleted ? 'var(--accent-green)' : 'var(--border)',
                  transition: 'background 0.4s ease',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {isRunning && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '-100%',
                      width: '100%',
                      height: '100%',
                      background: `linear-gradient(90deg, transparent, ${meta.color}, transparent)`,
                      animation: 'connector-flow 1.5s infinite',
                    }}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
