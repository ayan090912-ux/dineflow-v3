import React, { useState, useEffect } from 'react';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { DinelyLogoMark } from './DinelyLogo';
import { Button } from './Button';

export interface LoadingScreenProps {
  restaurantName?: string;
  status?: string;
  substatus?: string;
  onRetry?: () => void;
  onChooseRestaurant?: () => void;
  timeoutSeconds?: number;
  isError?: boolean;
  errorMessage?: string;
}

/**
 * Dinely Clean Minimal Tenant Loading Screen
 * Designed to seamlessly blend with the primary Dinely Restaurant Dashboard UI:
 * - Canvas Background: #0b0d11 (matches --color-bg-canvas)
 * - Container & Accents: #12151b & #1e232e (matches --color-bg-surface & --color-border-subtle)
 * - Static small brand icon, calm typography, and a single subtle animated indicator.
 */
export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  restaurantName,
  status,
  substatus,
  onRetry,
  onChooseRestaurant,
  timeoutSeconds = 8,
  isError = false,
  errorMessage,
}) => {
  const [showEscapeHatch, setShowEscapeHatch] = useState(false);

  useEffect(() => {
    if (isError) return;
    const timer = setTimeout(() => {
      setShowEscapeHatch(true);
    }, timeoutSeconds * 1000);
    return () => clearTimeout(timer);
  }, [timeoutSeconds, isError]);

  const displayName = restaurantName?.trim();
  const primaryTitle = isError ? 'Unable to open workspace' : 'Opening your workspace';
  const subtitle = isError
    ? errorMessage || 'Something went wrong while connecting to your restaurant.'
    : displayName
      ? `Connecting to ${displayName}...`
      : substatus || status || 'Connecting to your restaurant...';

  return (
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
      {/* Subtle, calm ambient background depth matching the main restaurant dashboard */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background: 'radial-gradient(circle at 50% 45%, rgba(30, 41, 59, 0.35) 0%, transparent 60%)',
        }}
      />

      {/* Main Centered Minimal Container */}
      <div className="relative z-10 max-w-sm w-full text-center flex flex-col items-center space-y-5 animate-fadeIn">
        {/* Static Small Dinely Brand Mark Container */}
        <div className="w-12 h-12 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-center shadow-sm">
          <DinelyLogoMark size={24} className="text-white" />
        </div>

        {/* Workspace & Tenant Typography */}
        <div className="space-y-1.5 w-full">
          {displayName && !isError && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#12151b] border border-[#1e232e] text-[11px] font-medium tracking-wide text-slate-300 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="truncate max-w-[220px] uppercase font-semibold">{displayName}</span>
            </div>
          )}

          <h1 className="text-lg font-semibold text-white tracking-tight">
            {primaryTitle}
          </h1>

          <p className="text-xs text-slate-400 font-normal leading-relaxed max-w-xs mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Single Subtle Loading Indicator (or Clean Retry Action in error state) */}
        {!isError ? (
          <div className="flex items-center justify-center gap-1.5 py-2" aria-label="Loading workspace">
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-bounce motion-reduce:animate-none"
              style={{ animationDuration: '1.2s', animationDelay: '0s' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-bounce motion-reduce:animate-none"
              style={{ animationDuration: '1.2s', animationDelay: '0.15s' }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-bounce motion-reduce:animate-none"
              style={{ animationDuration: '1.2s', animationDelay: '0.3s' }}
            />
          </div>
        ) : (
          <div className="pt-2">
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="text-xs border-[#1e232e] bg-[#12151b] hover:bg-[#1a1e27] text-slate-200 px-4 py-2"
                icon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Retry
              </Button>
            )}
          </div>
        )}

        {/* Subtle Escape Hatch (only shown if connection takes unusually long) */}
        {!isError && showEscapeHatch && (
          <div className="pt-4 border-t border-[#1e232e] w-full space-y-2.5 animate-fadeIn">
            <p className="text-[11px] text-slate-400">Taking longer than expected?</p>
            <div className="flex items-center justify-center gap-2">
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  className="text-xs border-[#1e232e] bg-[#12151b] hover:bg-[#1a1e27] text-slate-200 px-3 py-1.5"
                  icon={<RefreshCw className="w-3 h-3" />}
                >
                  Retry
                </Button>
              )}
              {onChooseRestaurant && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onChooseRestaurant}
                  className="text-xs border-[#1e232e] bg-[#12151b] hover:bg-[#1a1e27] text-slate-300 px-3 py-1.5"
                  icon={<ArrowRight className="w-3 h-3" />}
                >
                  All Outlets
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
