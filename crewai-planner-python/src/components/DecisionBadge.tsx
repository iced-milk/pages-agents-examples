interface Props {
  decision: 'GO' | 'NO-GO' | 'CONDITIONAL GO';
}

const STYLES: Record<string, { bg: string; text: string; border: string }> = {
  'GO': {
    bg: 'rgba(61, 217, 160, 0.12)',
    text: 'var(--accent-green)',
    border: 'rgba(61, 217, 160, 0.25)',
  },
  'NO-GO': {
    bg: 'rgba(240, 112, 112, 0.12)',
    text: 'var(--accent-red)',
    border: 'rgba(240, 112, 112, 0.25)',
  },
  'CONDITIONAL GO': {
    bg: 'rgba(245, 200, 66, 0.12)',
    text: 'var(--accent-amber)',
    border: 'rgba(245, 200, 66, 0.25)',
  },
};

export function DecisionBadge({ decision }: Props) {
  const style = STYLES[decision] || STYLES['CONDITIONAL GO'];

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 14px',
        borderRadius: 5,
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: '0.3px',
        marginTop: 6,
      }}
    >
      {decision}
    </span>
  );
}
