import React, { useState, useEffect } from 'react';
import { ChefHat, RefreshCw, ArrowRight, ShieldCheck, Activity } from 'lucide-react';
import { DinelyLogo } from './DinelyLogo';
import { Button } from './Button';

export interface LoadingScreenProps {
  restaurantName?: string;
  status?: string;
  substatus?: string;
  onRetry?: () => void;
  onChooseRestaurant?: () => void;
  timeoutSeconds?: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  restaurantName,
  status = 'Initializing Restaurant OS & Terminal Data...',
  substatus = 'Synchronizing real-time telemetry, tickets & menu engine',
  onRetry,
  onChooseRestaurant,
  timeoutSeconds = 6,
}) => {
  const [showEscapeHatch, setShowEscapeHatch] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => {
        if (prev + 1 >= timeoutSeconds) {
          setShowEscapeHatch(true);
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeoutSeconds]);

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans select-none">
      {/* Ambient background glow orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Glassmorphic Card */}
      <div className="relative z-10 max-w-md w-full bg-[#0e121a]/90 backdrop-blur-2xl border border-[#1e2536] p-8 rounded-3xl shadow-2xl text-center space-y-6">
        {/* Animated Brand Halo */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          {/* Outer dual spinning pulse rings */}
          <div className="absolute inset-0 rounded-full border-2 border-rose-500/20 border-t-rose-500 animate-spin" style={{ animationDuration: '1.2s' }} />
          <div className="absolute inset-1 rounded-full border-2 border-indigo-500/20 border-b-indigo-400 animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />

          {/* Central Logo Container */}
          <div className="w-14 h-14 rounded-2xl bg-[#141924] border border-[#252e42] flex items-center justify-center shadow-inner">
            <DinelyLogo size="sm" variant="icon" />
          </div>
        </div>

        {/* Text & Status Telemetry */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#141924] border border-[#232c3d] text-[11px] font-medium text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate max-w-[200px]">{restaurantName || 'Dinely Operating System'}</span>
          </div>

          <h2 className="text-base font-bold text-white tracking-tight">
            {restaurantName ? `${restaurantName}` : 'Restaurant Workspace'}
          </h2>

          <p className="text-xs text-slate-400 font-mono tracking-tight flex items-center justify-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
            <span>{status}</span>
          </p>

          <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
            {substatus}
          </p>
        </div>

        {/* Shimmer Progress Track */}
        <div className="space-y-1.5 pt-1">
          <div className="w-full h-1 bg-[#161c28] rounded-full overflow-hidden relative">
            <div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-rose-500 to-transparent rounded-full animate-[shimmer_1.8s_infinite]"
                 style={{
                   animation: 'shimmer 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                 }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-1">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-slate-400" /> Multi-Tenant Active
            </span>
            <span>{elapsed}s elapsed</span>
          </div>
        </div>

        {/* Escape hatch / Fallback controls if network is slow */}
        {showEscapeHatch && (
          <div className="pt-2 border-t border-[#1a2130] space-y-2 animate-fadeIn">
            <p className="text-[11px] text-slate-400">Taking longer than expected to connect?</p>
            <div className="flex items-center justify-center gap-2">
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  className="text-xs border-[#252e42] bg-[#121622] hover:bg-[#1a2030] text-slate-200"
                  icon={<RefreshCw className="w-3 h-3" />}
                >
                  Force Refresh
                </Button>
              )}
              {onChooseRestaurant && (
                <Button
                  variant="brand"
                  size="sm"
                  onClick={onChooseRestaurant}
                  className="text-xs bg-rose-600 hover:bg-rose-500 text-white"
                  icon={<ArrowRight className="w-3 h-3" />}
                >
                  Return to Outlets
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
