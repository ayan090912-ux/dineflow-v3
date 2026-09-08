import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface Column<T> {
  key: string;
  header: string | React.ReactNode;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

export interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  className?: string;
}

export function Table<T>({
  data,
  columns,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'No items found',
  onRowClick,
  className,
}: TableProps<T>) {
  return (
    <div className={twMerge('w-full overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0e1117] shadow-lg font-sans', className)}>
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-white/[0.08] bg-[#12151b]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={twMerge('px-4 py-3 font-mono font-medium text-[10px] text-white/50 uppercase tracking-wider', col.className)}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.06]">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, idx) => (
              <tr key={idx} className="animate-pulse">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3.5">
                    <div className="h-3.5 bg-white/[0.06] rounded w-3/4"></div>
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-white/40 text-xs">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr
                key={keyExtractor(item)}
                onClick={() => onRowClick?.(item)}
                className={clsx(
                  'transition-colors hover:bg-white/[0.02]',
                  onRowClick && 'cursor-pointer'
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={twMerge('px-4 py-3 text-white/80 font-normal', col.className)}>
                    {col.render ? col.render(item) : (item as Record<string, unknown>)[col.key] as React.ReactNode}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
