import React from 'react';
import { clsx } from 'clsx';

export interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  status,
  className,
}) => {
  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-xs',
    lg: 'w-11 h-11 text-sm',
    xl: 'w-14 h-14 text-base',
  };

  const getInitials = (n: string) => {
    return n
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className="relative inline-block">
      {src ? (
        <img
          src={src}
          alt={name}
          className={clsx('rounded-full object-cover border border-slate-200 dark:border-slate-800', sizeClasses[size], className)}
        />
      ) : (
        <div
          className={clsx(
            'flex items-center justify-center rounded-full font-bold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs',
            sizeClasses[size],
            className
          )}
        >
          {getInitials(name)}
        </div>
      )}
      {status && (
        <span
          className={clsx(
            'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900',
            status === 'online' && 'bg-emerald-500',
            status === 'offline' && 'bg-slate-400',
            status === 'busy' && 'bg-amber-500'
          )}
        />
      )}
    </div>
  );
};
