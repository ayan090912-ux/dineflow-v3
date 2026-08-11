import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rounded',
  width,
  height,
  style,
  ...props
}) => {
  const variantClasses = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-xl',
  };

  return (
    <div
      className={twMerge(
        clsx('skeleton-shimmer bg-slate-800/80 shrink-0', variantClasses[variant], className)
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      {...props}
    />
  );
};

export const SkeletonCard: React.FC<{ rows?: number; className?: string }> = ({
  rows = 3,
  className,
}) => {
  return (
    <div className={twMerge('bg-slate-900 border border-slate-800/80 p-5 rounded-2xl space-y-4', className)}>
      <div className="flex items-center justify-between">
        <Skeleton variant="text" width="40%" height={20} />
        <Skeleton variant="rounded" width="25%" height={24} />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, idx) => (
          <Skeleton key={idx} variant="text" width={idx === rows - 1 ? '60%' : '100%'} height={14} />
        ))}
      </div>
    </div>
  );
};

export const SkeletonMetrics: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="bg-slate-900 border border-slate-800/80 p-5 rounded-2xl space-y-3">
          <Skeleton variant="text" width="50%" height={14} />
          <Skeleton variant="text" width="70%" height={28} />
        </div>
      ))}
    </div>
  );
};
