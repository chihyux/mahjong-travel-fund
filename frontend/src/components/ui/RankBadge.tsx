interface RankBadgeProps {
  rank: number;
  size?: number;
}

interface RankStyle {
  bg: string;
  color: string;
}

const STYLES: Record<number, RankStyle> = {
  1: { bg: '#2F4A2F', color: '#F5E9CC' },
  2: { bg: '#D9A441', color: '#FFFFFF' },
  3: { bg: '#8A8074', color: '#FFFFFF' }
};

const DEFAULT_STYLE: RankStyle = { bg: '#E5E0D0', color: '#6B7A6B' };

export default function RankBadge({ rank, size = 56 }: RankBadgeProps) {
  const s = STYLES[rank] ?? DEFAULT_STYLE;
  const fontSize = size >= 56 ? 28 : size >= 44 ? 22 : 18;

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 num"
      style={{
        width: size,
        height: size,
        background: s.bg,
        color: s.color,
        fontSize,
        fontWeight: 900
      }}
    >
      {rank}
    </div>
  );
}
