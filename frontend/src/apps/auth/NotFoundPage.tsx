import React from 'react';
import { Home, ArrowLeft } from 'lucide-react';
import { Button, DinelyLogo } from '../../packages/ui';

interface NotFoundPageProps {
  onNavigate?: (path: string, options?: { replace?: boolean }) => void;
  title?: string;
  message?: string;
  onBackToHome?: () => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({
  onNavigate,
  title = 'Page Not Found',
  message = "The page you are looking for does not exist or you don't have permission to access it.",
  onBackToHome,
}) => {
  const handleHome = () => {
    if (onBackToHome) {
      onBackToHome();
    } else if (onNavigate) {
      onNavigate('/');
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex justify-center mb-2">
          <DinelyLogo size="md" />
        </div>
        <div className="space-y-2">
          <span className="text-4xl font-extrabold text-indigo-400 font-mono">404</span>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {title}
          </h1>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            {message}
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
