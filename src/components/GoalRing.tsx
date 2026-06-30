type Props = {
  /** 0..1 fill. */
  ratio: number;
  /** Big centered text (e.g. "18m"). */
  label: string;
  /** Small text under the label (e.g. "/ 30m"). */
  sub: string;
  size?: number;
};

/** Circular progress ring for the daily goal. */
export function GoalRing({ ratio, label, sub, size = 96 }: Props) {
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(ratio, 1)));
  const done = ratio >= 1;

  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-alt)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={done ? 'var(--success)' : 'var(--primary)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="ring-label">
        <strong>{label}</strong>
        <span>{done ? '¡meta!' : sub}</span>
      </div>
    </div>
  );
}
