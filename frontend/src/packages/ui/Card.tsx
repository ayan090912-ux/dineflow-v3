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
          'bg-[#0e1117] rounded-xl transition-all duration-200',
          bordered && 'border border-white/[0.08]',
          hoverEffect && 'hover:border-white/20 hover:bg-[#12151b]',
          glass && 'bg-[#0e1117]/80 backdrop-blur-md',
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
