export default function RankBadge({ rank, size = 56 }) {
  const styles = {
    1: { bg: '#2F4A2F', color: '#F5E9CC' },
    2: { bg: '#D9A441', color: '#FFFFFF' },
    3: { bg: '#8A8074', color: '#FFFFFF' }
  };
  const s = styles[rank] || { bg: '#E5E0D0', color: '#6B7A6B' };
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
