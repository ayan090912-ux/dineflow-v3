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
          'bg-slate-900/60 border border-slate-800/80 rounded-3xl p-10 text-center space-y-4 max-w-md mx-auto my-6',
          className
        )
      )}
      {...props}
    >
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-slate-400 mx-auto">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-base font-bold text-slate-100">{title}</h3>
        {description && <p className="text-xs text-slate-400 leading-relaxed">{description}</p>}
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
