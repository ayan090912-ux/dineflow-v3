import React from 'react';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '../../packages/ui';

interface NotFoundPageProps {
  onNavigate?: (path: string) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onNavigate }) => {
  const handleHome = () => {
    if (onNavigate) {
      onNavigate('/');
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-2">
          <span className="text-4xl font-extrabold text-indigo-400 font-mono">404</span>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Page Not Found
          </h1>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            The page you are looking for does not exist or you don't have permission to access it.
          </p>
        </div>

        <div className="pt-2 flex items-center justify-center gap-3">
          <Button
            variant="brand"
            className="text-xs font-bold px-5 py-2.5 rounded-xl cursor-pointer"
            onClick={handleHome}
            icon={<Home className="w-3.5 h-3.5" />}
          >
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};
