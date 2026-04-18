interface SkeletonProps {
  h?: number;
  className?: string;
}

export default function Skeleton({ h = 20, className = '' }: SkeletonProps) {
  return (
    <div
      className={`shimmer rounded-lg bg-divider ${className}`}
      style={{ height: h }}
    />
  );
}
