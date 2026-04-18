export default function Segmented({ options, value, onChange }) {
  return (
    <div className="flex p-1 rounded-btn bg-hint border-2 border-divider">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 press min-h-[52px] rounded-[12px] font-medium text-[17px] transition-colors ${
              active
                ? 'bg-white text-ink shadow-sm'
                : 'bg-transparent text-ink-3'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
