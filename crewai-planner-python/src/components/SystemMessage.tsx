interface Props {
  text: string;
}

export function SystemMessage({ text }: Props) {
  return (
    <div className="flex items-center justify-center animate-fade-in" style={{ gap: 10, padding: '8px 0', margin: '2px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span
        className="flex items-center"
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
          gap: 5,
          padding: '0 2px',
        }}
      >
        {text}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  );
}
