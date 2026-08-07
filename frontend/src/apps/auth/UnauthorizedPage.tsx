import React from 'react';
import { ShieldAlert, ArrowRight, LogOut, Home, KeyRound } from 'lucide-react';
import { Button, Card, Badge } from '../../packages/ui';
import { api } from '../../packages/api/client';

interface UnauthorizedPageProps {
  requiredRole: string;
  userRole?: string;
  userEmail?: string;
  targetPath: string;
  onNavigate: (path: string) => void;
}

export const UnauthorizedPage: React.FC<UnauthorizedPageProps> = ({
  requiredRole,
  userRole,
  userEmail,
  targetPath,
  onNavigate,
}) => {
  const getAuthorizedPathForRole = (role?: string) => {
    switch (role) {
      case 'PLATFORM_ADMIN':
        return '/admin/dashboard';
      case 'RESTAURANT_OWNER':
        return '/restaurant/dashboard';
      case 'CHEF':
        return '/kitchen/dashboard';
      case 'WAITER':
      case 'HOST':
      case 'CASHIER':
      case 'BARTENDER':
        return '/waiter/dashboard';
      default:
        return '/restaurant/login';
    }
  };

  const authorizedPath = getAuthorizedPathForRole(userRole);

  const handleLogoutAndSwitch = async () => {
    await api.logout();
    if (targetPath.includes('admin')) {
      onNavigate('/admin/login');
    } else if (targetPath.includes('kitchen')) {
      onNavigate('/kitchen/login');
    } else if (targetPath.includes('waiter')) {
      onNavigate('/waiter/login');
    } else {
      onNavigate('/restaurant/login');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-rose-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-lg space-y-6 relative z-10 text-center">
        <div className="mx-auto w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 shadow-2xl">
          <ShieldAlert className="w-10 h-10 animate-pulse" />
        </div>

        <div className="space-y-2">
          <Badge variant="danger" className="px-3 py-1 text-xs uppercase font-mono font-bold tracking-wider">
            403 - Forbidden Access
          </Badge>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Unauthorized Access Attempt
          </h1>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Your current session does not possess the required role permissions to open{' '}
            <code className="text-rose-400 font-mono font-bold bg-slate-900 px-2 py-0.5 rounded-md">{targetPath}</code>.
          </p>
        </div>

        <Card className="bg-slate-900/90 border-slate-800 p-6 space-y-4 text-left rounded-3xl shadow-2xl">
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400 font-semibold">Active User Email:</span>
              <span className="font-mono text-white font-bold">{userEmail || 'Not Logged In'}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-800">
              <span className="text-slate-400 font-semibold">Current Account Role:</span>
              <Badge variant="warning">{userRole || 'GUEST'}</Badge>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-slate-400 font-semibold">Required Portal Role:</span>
              <Badge variant="brand">{requiredRole}</Badge>
            </div>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-[11px] text-amber-300">
            Role-Based Access Control (RBAC) enforces strict portal isolation. You can return to your authorized dashboard or log into the required portal with authorized credentials.
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <Button
              variant="brand"
              className="w-full text-xs font-bold py-2.5"
              onClick={() => onNavigate(authorizedPath)}
              icon={<Home className="w-4 h-4" />}
            >
              Go to My Authorized Dashboard
            </Button>
            
            <Button
              variant="outline"
              className="w-full text-xs font-bold py-2.5 border-slate-700 text-slate-300 hover:text-white"
              onClick={handleLogoutAndSwitch}
              icon={<KeyRound className="w-4 h-4 text-amber-400" />}
            >
              Switch Role Credentials
            </Button>
          </div>
        </Card>

        <p className="text-[11px] text-slate-500">
          Need access? Contact your Restaurant Owner or Platform Administrator.
        </p>
      </div>
    </div>
  );
};
