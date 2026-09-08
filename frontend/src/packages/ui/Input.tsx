import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, leftIcon, rightIcon, helperText, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    const activeLeftIcon = leftIcon || icon;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-slate-300">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {activeLeftIcon && (
            <div className="absolute left-3.5 text-slate-400 pointer-events-none flex items-center justify-center">
              {activeLeftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            className={twMerge(
              clsx(
                'w-full bg-[#12151b] text-white text-xs rounded-xl border border-white/[0.08] transition-all duration-200 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-amber-400/40 focus:border-amber-400/50 disabled:opacity-50 disabled:bg-white/[0.02]',
                activeLeftIcon ? 'pl-10 pr-3.5 py-2.5' : 'px-3.5 py-2.5',
                rightIcon ? 'pr-10' : '',
                error && 'border-rose-500/60 focus:ring-rose-500/40 focus:border-rose-500',
                className
              )
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3.5 text-slate-400 pointer-events-none flex items-center justify-center">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
        {helperText && !error && <p className="text-xs text-slate-400">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
