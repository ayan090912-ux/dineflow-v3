import React from 'react';
import { Card, Button, Badge, DinelyLogo } from '../../packages/ui';
import { AlertCircle, ArrowLeft, Layers, ShieldAlert, Sparkles } from 'lucide-react';
import { Restaurant } from '../../packages/types';

interface ModuleNotEnabledPageProps {
  moduleName: string;
  restaurant?: Restaurant | null;
  onNavigate: (path: string) => void;
}

export const ModuleNotEnabledPage: React.FC<ModuleNotEnabledPageProps> = ({
  moduleName,
  restaurant,
  onNavigate,
}) => {
  const businessType = restaurant?.businessType || 'RESTAURANT';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 relative font-sans overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10 text-center">
        <DinelyLogo size="md" className="justify-center mb-2" />

        <Card className="bg-slate-900/90 border-slate-800 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6 rounded-3xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center">
            <Layers className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <Badge variant="warning" className="text-[10px] uppercase font-mono">
              Module Not Enabled
            </Badge>
            <h2 className="text-2xl font-black text-white tracking-tight">
              {moduleName} is not active
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              This terminal is currently disabled for <strong className="text-white">{restaurant?.name || 'this venue'}</strong> ({businessType}).
            </p>
          </div>

          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-xs text-slate-400 text-left space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase block">How to enable:</span>
            <p className="text-slate-300">
              The business owner can activate optional terminals anytime in <strong className="text-rose-400">Settings → Workspace / Terminals</strong>.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="brand"
              onClick={() => onNavigate('/restaurant/dashboard')}
              className="w-full text-xs font-bold py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-lg"
              icon={<ArrowLeft className="w-4 h-4 mr-1" />}
            >
              Return to Owner Dashboard
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigate('/workspace')}
              className="w-full text-xs text-slate-300 border-slate-800 hover:bg-slate-800"
            >
              Select Another Workspace
            </Button>
          </div>
        </Card>

        <footer className="text-[11px] text-slate-500">
          Dinely Configurable Restaurant Operating System
        </footer>
      </div>
    </div>
  );
};
