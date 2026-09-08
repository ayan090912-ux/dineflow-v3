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
    <Card hoverEffect className="relative overflow-hidden bg-[#0e1117] border border-white/[0.08] p-5 rounded-xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono font-medium text-white/50 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-semibold font-mono text-white mt-1 tracking-tight">{value}</h3>
          {change && (
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className={`inline-flex items-center text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${
                  change.isPositive ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40' : 'bg-rose-950/40 text-rose-400 border border-rose-800/40'
                }`}
              >
                {change.isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                {change.value}
              </span>
              {subtitle && <span className="text-xs text-white/40">{subtitle}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className="p-2.5 bg-[#12151b] border border-white/[0.08] rounded-xl text-white/70">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};
