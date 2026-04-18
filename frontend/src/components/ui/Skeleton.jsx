export default function Skeleton({ h = 20, className = '' }) {
  return (
    <div
      className={`shimmer rounded-lg bg-divider ${className}`}
      style={{ height: h }}
    />
  );
}
