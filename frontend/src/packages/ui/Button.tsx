import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'brand' | 'success';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className,
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-slate-700 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 rounded-xl gap-1.5',
    md: 'text-xs sm:text-sm px-4 py-2 rounded-xl gap-2',
    lg: 'text-sm sm:text-base px-5 py-2.5 rounded-2xl gap-2.5',
  };

  const variantStyles = {
    primary: 'bg-white text-slate-950 hover:bg-white/90 shadow-sm focus:ring-white/20',
    secondary: 'bg-white/[0.06] text-white hover:bg-white/[0.1] border border-white/[0.08] focus:ring-white/20',
    outline: 'border border-white/[0.08] bg-transparent text-white/80 hover:bg-white/[0.04] hover:text-white focus:ring-white/20',
    ghost: 'text-white/60 hover:bg-white/[0.04] hover:text-white focus:ring-white/20',
    danger: 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 shadow-sm focus:ring-rose-500/30',
    brand: 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-sm focus:ring-amber-500/30',
    success: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 shadow-sm focus:ring-emerald-500/30',
  };

  return (
    <button
      className={twMerge(clsx(baseStyles, sizeStyles[size], variantStyles[variant], className))}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        icon
      )}
      {children}
    </button>
  );
};
