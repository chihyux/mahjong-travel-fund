export default function PlayerChips({ players, value, onChange, multi = false, recentIds = [] }) {
  const list = [...players];
  // 最近自摸的置頂
  if (recentIds.length) {
    list.sort((a, b) => {
      const ai = recentIds.indexOf(a.id);
      const bi = recentIds.indexOf(b.id);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return 0;
    });
  }

  const isSelected = (id) => {
    if (multi) return Array.isArray(value) && value.includes(id);
    return value === id;
  };

  const toggle = (id) => {
    if (multi) {
      const arr = Array.isArray(value) ? value : [];
      if (arr.includes(id)) onChange(arr.filter((x) => x !== id));
      else onChange([...arr, id]);
    } else {
      onChange(id);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {list.map((p) => {
        const selected = isSelected(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            className={`press min-h-[56px] px-5 rounded-2xl text-[18px] font-medium border-2 transition-colors ${
              selected
                ? 'bg-sage text-white border-sage-deep'
                : 'bg-white text-ink border-divider'
            }`}
          >
            {p.name}
          </button>
        );
      })}
      {list.length === 0 && (
        <div className="text-ink-3 text-base">還沒有玩家，先到「玩家」分頁新增</div>
      )}
    </div>
  );
}
