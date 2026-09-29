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
          'bg-[#12151b] text-slate-100 rounded-xl transition-all duration-200',
          bordered && 'border border-[#1e232e]',
          hoverEffect && 'hover:border-[#2d3545] hover:bg-[#151922]',
          glass && 'bg-[#12151b]/80 backdrop-blur-md',
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
