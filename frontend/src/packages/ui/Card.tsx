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
          'bg-slate-900/90 rounded-2xl transition-all duration-200',
          bordered && 'border border-slate-800/80',
          hoverEffect && 'hover:border-slate-700/80 hover:bg-slate-900',
          glass && 'bg-slate-900/80 backdrop-blur-md',
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
