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
          'bg-white dark:bg-slate-900 rounded-2xl transition-all duration-200',
          bordered && 'border border-slate-200/80 dark:border-slate-800/80',
          hoverEffect && 'hover:shadow-lg hover:-translate-y-0.5 hover:border-slate-300 dark:hover:border-slate-700',
          glass && 'bg-white/70 dark:bg-slate-900/70 backdrop-blur-md',
          'p-5 shadow-xs',
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  );
};
