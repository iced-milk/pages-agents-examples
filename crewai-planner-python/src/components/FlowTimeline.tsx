import { AGENT_CONFIG } from '../types';
import type { AgentTimelineNode } from '../types';
import { t } from '../i18n';

interface Props {
  agents: AgentTimelineNode[];
}

export function FlowTimeline({ agents }: Props) {
  return (
    <div className="flex items-center justify-center" style={{ padding: '14px 24px', gap: 0 }}>
      {agents.map((node, i) => {
        const config = AGENT_CONFIG[node.role];
        const shortName = config?.shortNameKey ? t(config.shortNameKey) : node.role;
        const isLast = i === agents.length - 1;
        const isCompleted = node.status === 'completed';
        const isRunning = node.status === 'running';

        return (
          <div key={node.role} className="flex items-center">
            {/* Node */}
            <div className="flex flex-col items-center" style={{ gap: 5 }}>
              <div
                className="flex items-center justify-center"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: `2px solid ${
                    isCompleted ? 'var(--accent-green)'
                    : isRunning ? (config?.color || 'var(--accent-blue)')
                    : 'var(--border)'
                  }`,
                  background: isCompleted ? 'var(--accent-green)' : 'var(--bg-secondary)',
                  color: isCompleted ? '#fff' : isRunning ? (config?.color || 'var(--accent-blue)') : 'var(--text-muted)',
                  fontSize: isCompleted ? 12 : 13,
                  fontWeight: 700,
                  transition: 'all 0.4s ease',
                  animation: isRunning ? 'pulse-ring 2s infinite' : 'none',
                }}
              >
                {isCompleted ? '✓' : config?.avatar || '?'}
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: node.status === 'pending' ? 'var(--text-muted)' : 'var(--text-secondary)',
                  transition: 'color 0.3s ease',
                }}
              >
                {shortName}
              </span>
            </div>

            {/* Connector */}
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
                {/* Animated flow on active connector */}
                {isRunning && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: '-100%',
                      width: '100%',
                      height: '100%',
                      background: `linear-gradient(90deg, transparent, ${config?.color || 'var(--accent-blue)'}, transparent)`,
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
