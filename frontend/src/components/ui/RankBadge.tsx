interface RankBadgeProps {
  rank: number;
  size?: number;
  variant?: 'default' | 'loser';
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

const LOSER_STYLES: Record<number, RankStyle> = {
  1: { bg: '#7F1D1D', color: '#FEE2E2' },
  2: { bg: '#B91C1C', color: '#FFFFFF' },
  3: { bg: '#DC2626', color: '#FFFFFF' }
};

const DEFAULT_STYLE: RankStyle = { bg: '#E5E0D0', color: '#6B7A6B' };

export default function RankBadge({ rank, size = 56, variant = 'default' }: RankBadgeProps) {
  const table = variant === 'loser' ? LOSER_STYLES : STYLES;
  const s = table[rank] ?? DEFAULT_STYLE;
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
