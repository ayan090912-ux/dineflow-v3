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
          'text-slate-100 rounded-xl transition-colors duration-150',
          glass ? 'bg-[#12151b]' : 'bg-[#12151b]',
          bordered && 'border border-[#1e232e]',
          hoverEffect && 'hover:border-[#2c3344]',
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
