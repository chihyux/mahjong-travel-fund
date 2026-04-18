export default function Button({
  children,
  variant = 'primary',
  size = 'lg',
  icon,
  className = '',
  disabled,
  ...props
}) {
  const base = 'press inline-flex items-center justify-center gap-2 font-bold rounded-btn transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = {
    lg: 'min-h-[64px] text-[20px] px-6 w-full',
    md: 'min-h-[52px] text-[17px] px-5',
    sm: 'min-h-[40px] text-[15px] px-4'
  };
  const variants = {
    primary: 'bg-sage text-white hover:bg-sage-deep',
    secondary: 'bg-white border-2 border-ink text-ink hover:bg-hint',
    honey: 'bg-white border-2 border-honey text-honey hover:bg-hint',
    ghost: 'bg-transparent text-ink hover:bg-hint',
    danger: 'bg-white border-2 border-red-700 text-red-700 hover:bg-red-50'
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="text-[1.1em]">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
