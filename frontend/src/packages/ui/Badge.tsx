import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'brand' | 'neutral';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className,
  ...props
}) => {
  const variantStyles = {
    default: 'bg-[#181d27] text-slate-300 border border-[#2d3545]',
    neutral: 'bg-[#181d27] text-slate-300 border border-[#2d3545]',
    success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/25',
    danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/25',
    info: 'bg-sky-500/10 text-sky-400 border border-sky-500/25',
    outline: 'border border-[#1e232e] text-slate-400 bg-transparent',
    brand: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  };

  const sizeStyles = {
    sm: 'text-[10px] font-mono px-2 py-0.5 rounded font-medium uppercase tracking-wider',
    md: 'text-xs font-mono px-2.5 py-0.5 rounded font-medium whitespace-nowrap',
  };

  return (
    <span
      className={twMerge(clsx('inline-flex items-center gap-1 font-medium transition-colors', variantStyles[variant], sizeStyles[size], className))}
      {...props}
    >
      {children}
    </span>
  );
};
