import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'brand';
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
    primary: 'bg-rose-600 text-white hover:bg-rose-500 shadow-sm focus:ring-rose-500',
    secondary: 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700/60 focus:ring-slate-600',
    outline: 'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800/80 hover:text-white focus:ring-slate-700',
    ghost: 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 focus:ring-slate-700',
    danger: 'bg-rose-600/90 text-white hover:bg-rose-500 border border-rose-500/40 shadow-sm focus:ring-rose-500',
    brand: 'bg-rose-600 text-white hover:bg-rose-500 shadow-sm focus:ring-rose-500',
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
