import React from 'react';
import { clsx } from 'clsx';
import { Check, Clock } from 'lucide-react';

export interface TimelineStep {
  id: string;
  title: string;
  description?: string;
  time?: string;
  status: 'completed' | 'current' | 'upcoming';
  icon?: React.ReactNode;
}

export interface TimelineProps {
  steps: TimelineStep[];
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({ steps, className }) => {
  return (
    <div className={clsx('space-y-6', className)}>
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.id} className="relative flex items-start gap-4">
            {!isLast && (
              <div
                className={clsx(
                  'absolute left-4 top-8 -bottom-6 w-0.5 transition-colors',
                  step.status === 'completed' ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
                )}
              />
            )}

            <div
              className={clsx(
                'relative z-10 flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all shadow-xs',
                step.status === 'completed' && 'bg-emerald-500 text-white',
                step.status === 'current' && 'bg-[var(--brand-primary,#e11d48)] text-white ring-4 ring-rose-100 dark:ring-rose-950/50 animate-pulse',
                step.status === 'upcoming' && 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700'
              )}
            >
              {step.status === 'completed' ? (
                <Check className="w-4 h-4 stroke-[3]" />
              ) : step.icon ? (
                step.icon
              ) : (
                <Clock className="w-4 h-4" />
              )}
            </div>

            <div className="flex-1 pt-0.5">
              <div className="flex items-center justify-between">
                <h4
                  className={clsx(
                    'text-sm font-semibold',
                    step.status === 'completed' && 'text-slate-900 dark:text-slate-100',
                    step.status === 'current' && 'text-[var(--brand-primary,#e11d48)] font-bold',
                    step.status === 'upcoming' && 'text-slate-400 dark:text-slate-500'
                  )}
                >
                  {step.title}
                </h4>
                {step.time && <span className="text-xs text-slate-400 dark:text-slate-500">{step.time}</span>}
              </div>
              {step.description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{step.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
