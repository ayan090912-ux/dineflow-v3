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
    default: 'bg-slate-800/80 text-slate-300 border border-slate-700/50',
    neutral: 'bg-slate-800/80 text-slate-300 border border-slate-700/50',
    success: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
    info: 'bg-sky-500/10 text-sky-400 border border-sky-500/20',
    outline: 'border border-slate-700/80 text-slate-400 bg-slate-900/40',
    brand: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
  };

  const sizeStyles = {
    sm: 'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider',
    md: 'text-xs px-2.5 py-0.5 rounded-full font-semibold whitespace-nowrap',
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
