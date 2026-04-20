import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode
} from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'honey' | 'ghost' | 'danger';
export type ButtonSize = 'lg' | 'md' | 'sm';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void | Promise<unknown>;
}

// 同步 onClick 的冷卻時間，避免快速連點（例如手殘雙擊、touch 誤觸）
const SYNC_COOLDOWN_MS = 400;

const BASE =
  'press inline-flex items-center justify-center gap-2 font-bold rounded-btn transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const SIZES: Record<ButtonSize, string> = {
  lg: 'min-h-[64px] text-[20px] px-6 w-full',
  md: 'min-h-[52px] text-[17px] px-5',
  sm: 'min-h-[40px] text-[15px] px-4'
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-sage text-white hover:bg-sage-deep',
  secondary: 'bg-white border-2 border-ink text-ink hover:bg-hint',
  honey: 'bg-white border-2 border-honey text-honey hover:bg-hint',
  ghost: 'bg-transparent text-ink hover:bg-hint',
  danger: 'bg-white border-2 border-red-700 text-red-700 hover:bg-red-50'
};

export default function Button({
  children,
  variant = 'primary',
  size = 'lg',
  icon,
  className = '',
  onClick,
  disabled,
  ...props
}: ButtonProps) {
  const [running, setRunning] = useState(false);
  const lockRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (lockRef.current || disabled) return;
    if (!onClick) return;
    lockRef.current = true;

    let result: void | Promise<unknown>;
    try {
      result = onClick(e);
    } catch (err) {
      lockRef.current = false;
      throw err;
    }

    if (result && typeof (result as Promise<unknown>).then === 'function') {
      // 非同步：鎖到 Promise 結束
      setRunning(true);
      (result as Promise<unknown>).finally(() => {
        lockRef.current = false;
        if (mountedRef.current) setRunning(false);
      });
    } else {
      // 同步：短暫冷卻，擋快速連點
      setTimeout(() => {
        lockRef.current = false;
      }, SYNC_COOLDOWN_MS);
    }
  };

  return (
    <button
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      onClick={onClick ? handleClick : undefined}
      disabled={disabled || running}
      {...props}
    >
      {icon && <span className="text-[1.1em]">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
