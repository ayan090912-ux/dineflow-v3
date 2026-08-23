import React from 'react';
import { Card } from './Card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: string;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
  subtitle?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({ title, value, change, icon, subtitle }) => {
  return (
    <Card hoverEffect className="relative overflow-hidden bg-slate-900 border border-slate-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-black text-slate-100 mt-1 tracking-tight">{value}</h3>
          {change && (
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className={`inline-flex items-center text-xs font-bold px-1.5 py-0.5 rounded-md ${
                  change.isPositive ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950/40 text-rose-400 border border-rose-800/40'
                }`}
              >
                {change.isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                {change.value}
              </span>
              {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className="p-3 bg-slate-800/80 rounded-2xl text-slate-200">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};
