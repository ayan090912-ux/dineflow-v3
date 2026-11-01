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
    default: 'bg-white/[0.08] text-slate-200 border border-white/15 backdrop-blur-md',
    neutral: 'bg-white/[0.08] text-slate-200 border border-white/15 backdrop-blur-md',
    success: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-[0_0_12px_rgba(52,211,153,0.2)]',
    warning: 'bg-amber-500/20 text-amber-300 border border-amber-400/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]',
    danger: 'bg-rose-500/20 text-rose-300 border border-rose-400/40 shadow-[0_0_12px_rgba(244,63,94,0.2)]',
    info: 'bg-sky-500/20 text-sky-300 border border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.2)]',
    outline: 'border border-white/15 text-slate-300 bg-white/[0.03] backdrop-blur-md',
    brand: 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-[0_0_12px_rgba(52,211,153,0.25)]',
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
