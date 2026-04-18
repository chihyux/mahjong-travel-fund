interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}

export default function Stepper({ value, onChange, min = 0, max = 99 }: StepperProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={dec}
        className="press w-14 h-14 rounded-xl bg-hint border-2 border-divider text-2xl font-bold text-ink disabled:opacity-40"
        disabled={value <= min}
        aria-label="減少"
      >
        −
      </button>
      <div className="flex-1 min-w-[72px] h-14 rounded-xl bg-white border-2 border-divider flex items-center justify-center num text-2xl">
        {value}
      </div>
      <button
        type="button"
        onClick={inc}
        className="press w-14 h-14 rounded-xl bg-sage text-white text-2xl font-bold disabled:opacity-40"
        disabled={value >= max}
        aria-label="增加"
      >
        ＋
      </button>
    </div>
  );
}
