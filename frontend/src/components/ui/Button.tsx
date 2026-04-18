import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'honey' | 'ghost' | 'danger';
export type ButtonSize = 'lg' | 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

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
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {icon && <span className="text-[1.1em]">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
