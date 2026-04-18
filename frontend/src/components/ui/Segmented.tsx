export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (v: T) => void;
}

export default function Segmented<T extends string>({
  options,
  value,
  onChange
}: SegmentedProps<T>) {
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
              active ? 'bg-white text-ink shadow-sm' : 'bg-transparent text-ink-3'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
