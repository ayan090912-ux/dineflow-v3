import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline' | 'brand';
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
    default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/40',
    info: 'bg-sky-50 text-sky-700 border border-sky-200/60 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/40',
    outline: 'border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400',
    brand: 'bg-[var(--brand-primary,#e11d48)]/10 text-[var(--brand-primary,#e11d48)] border border-[var(--brand-primary,#e11d48)]/20',
  };

  const sizeStyles = {
    sm: 'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider',
    md: 'text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap',
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
