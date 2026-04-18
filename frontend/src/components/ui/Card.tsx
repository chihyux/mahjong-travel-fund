import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: string;
}

export default function Card({
  children,
  className = '',
  padding = 'p-6',
  ...props
}: CardProps) {
  return (
    <div className={`card ${padding} ${className}`} {...props}>
      {children}
    </div>
  );
}
