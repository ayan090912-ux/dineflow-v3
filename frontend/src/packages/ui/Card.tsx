import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
  glass?: boolean;
  bordered?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  hoverEffect = false,
  glass = false,
  bordered = true,
  ...props
}) => {
  return (
    <div
      className={twMerge(
        clsx(
          'text-slate-100 rounded-2xl transition-all duration-300',
          glass
            ? 'liquid-glass'
            : 'bg-gradient-to-b from-white/[0.075] to-white/[0.025] backdrop-blur-xl border-t-white/30 shadow-[0_12px_36px_-6px_rgba(0,0,0,0.55),inset_0_1px_1px_rgba(255,255,255,0.25)]',
          bordered && 'border border-white/[0.12]',
          hoverEffect && 'hover:border-white/25 hover:shadow-2xl hover:translate-y-[-1px]',
          'p-5',
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
};
