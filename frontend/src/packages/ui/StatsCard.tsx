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
    <Card hoverEffect className="relative overflow-hidden bg-[#12151b] border border-[#1e232e] p-5 rounded-xl shadow-xs">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono font-medium text-slate-400 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-bold font-mono text-white mt-1 tracking-tight">{value}</h3>
          {change && (
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className={`inline-flex items-center text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${
                  change.isPositive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-rose-500/10 text-rose-400 border border-rose-500/25'
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
          <div className="p-2.5 bg-[#181d27] border border-[#2d3545] rounded-xl text-slate-300">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};
