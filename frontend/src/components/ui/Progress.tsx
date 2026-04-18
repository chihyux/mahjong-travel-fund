interface ProgressProps {
  value: number;
  max?: number;
}

export default function Progress({ value, max = 100 }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
