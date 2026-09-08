import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Button } from './Button';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
  className,
  ...props
}) => {
  return (
    <div
      className={twMerge(
        clsx(
          'bg-[#0e1117] border border-white/[0.08] rounded-xl p-8 text-center space-y-4 max-w-md mx-auto my-6 font-sans',
          className
        )
      )}
      {...props}
    >
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-[#12151b] border border-white/[0.08] flex items-center justify-center text-white/40 mx-auto">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {description && <p className="text-xs text-white/50 leading-relaxed">{description}</p>}
      </div>
      {actionLabel && onAction && (
        <div className="pt-2">
          <Button variant="brand" size="sm" onClick={onAction} icon={actionIcon}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
};
