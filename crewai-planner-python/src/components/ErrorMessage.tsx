interface Props {
  text: string;
}

export function ErrorMessage({ text }: Props) {
  return (
    <div className="animate-fade-in" style={{ padding: '12px 16px', margin: '8px 16px' }}>
      <div
        style={{
          background: 'rgba(240, 112, 112, 0.08)',
          border: '1px solid rgba(240, 112, 112, 0.25)',
          borderRadius: 10,
          padding: '12px 16px',
        }}
      >
        <div className="flex items-start" style={{ gap: 10 }}>
          <span style={{ fontSize: 16, lineHeight: '22px', flexShrink: 0 }}>⚠️</span>
          <p
            style={{
              fontSize: 13,
              lineHeight: '20px',
              color: 'var(--accent-red)',
              margin: 0,
              wordBreak: 'break-word',
            }}
          >
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}
