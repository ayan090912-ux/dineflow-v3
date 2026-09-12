import React from 'react';
import { ShieldAlert, LogOut, ArrowLeft } from 'lucide-react';
import { DinelyLogo } from './DinelyLogo';

export interface AccessDeniedScreenProps {
  tenantName?: string;
  resourceName?: string;
  requiredRole?: string;
  message?: string;
  onLogout?: () => void;
  onGoHome?: () => void;
  onBack?: () => void;
}

export function AccessDeniedScreen({
  tenantName,
  resourceName,
  requiredRole,
  message,
  onLogout,
  onGoHome,
  onBack,
}: AccessDeniedScreenProps) {
  return (
    <div className="relative min-h-screen w-full bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-6 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Top Brand */}
      <div className="absolute top-8 left-8 flex items-center gap-3">
        <DinelyLogo size={32} />
        <span className="font-semibold text-lg tracking-tight text-white/90">Dinely</span>
        <span className="px-2 py-0.5 text-xs font-mono bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">
          TENANT BOUNDARY
        </span>
      </div>

      {/* Glass Card */}
      <div className="relative z-10 w-full max-w-lg p-8 md:p-10 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/10 shadow-[0_25px_80px_rgba(0,0,0,0.55)] flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-6 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
          <ShieldAlert size={32} />
        </div>

        <span className="text-xs font-mono uppercase tracking-widest text-red-400 mb-2">
          HTTP 403 • FORBIDDEN
        </span>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">
          Cross-Tenant Access Denied
        </h1>

        <p className="text-white/60 text-sm md:text-base leading-relaxed mb-6">
          {message || (
            <>
              Your authenticated credentials do not grant access to operational terminals for{' '}
              <strong className="text-white">{resourceName || tenantName || 'this restaurant'}</strong>. Each restaurant tenant on Dinely maintains isolated staff permissions and data boundaries.
            </>
          )}
        </p>

        {requiredRole && (
          <div className="w-full mb-6 py-2.5 px-4 rounded-xl bg-white/[0.02] border border-white/[0.08] text-xs font-mono text-white/50 flex items-center justify-between">
            <span>Required Role:</span>
            <span className="text-amber-400 font-semibold">{requiredRole}</span>
          </div>
        )}

        <div className="w-full flex flex-col sm:flex-row items-center gap-3">
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full py-3 px-5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-sm transition-all border border-white/10 flex items-center justify-center gap-2"
            >
              <LogOut size={16} />
              Switch Account
            </button>
          )}

          <button
            onClick={onBack || onGoHome || (() => { window.location.href = 'https://dinely.food/workspace'; })}
            className="w-full py-3 px-5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-medium text-sm transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} />
            {onBack ? 'Back' : 'My Workspace'}
          </button>
        </div>
      </div>

      {/* Footer copyright */}
      <div className="absolute bottom-6 text-xs text-white/30 font-mono">
        Dinely Multi-Tenant Restaurant OS • Strict Tenant Isolation
      </div>
    </div>
  );
}
