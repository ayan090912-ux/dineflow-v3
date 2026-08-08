import React, { useState } from 'react';
import {
  ShieldAlert,
  Building2,
  Utensils,
  ChefHat,
  PhoneCall,
  Lock,
  Mail,
  KeyRound,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Users,
  Info,
  Wine,
} from 'lucide-react';
import { Button, Card, Input, Badge } from '../../packages/ui';
import { api } from '../../packages/api/client';

export type PortalType = 'admin' | 'restaurant' | 'kitchen' | 'waiter' | 'bar';

interface RoleLoginPageProps {
  portal: PortalType;
  onNavigate: (path: string) => void;
  onLoginSuccess: (role: string, user: any) => void;
}

const PORTAL_CONFIGS: Record<PortalType, {
  title: string;
  subtitle: string;
  roleBadge: string;
  badgeVariant: 'brand' | 'warning' | 'info' | 'success';
  icon: React.ReactNode;
  demoEmail: string;
  demoPass: string;
  targetDashboard: string;
  accentGradient: string;
  description: string;
}> = {
  admin: {
    title: 'Platform Admin Login',
    subtitle: 'DineFlow Control Plane & Global Multi-Tenant Management',
    roleBadge: 'PLATFORM_ADMIN',
    badgeVariant: 'brand',
    icon: <Building2 className="w-6 h-6 text-indigo-400" />,
    demoEmail: 'admin@dineflow.com',
    demoPass: 'admin123',
    targetDashboard: '/admin/dashboard',
    accentGradient: 'from-indigo-500 to-purple-600',
    description: 'System control for platform administrators to verify restaurants, audit security logs, and monitor cloud health.',
  },
  restaurant: {
    title: 'Restaurant Owner Login',
    subtitle: 'Restaurant Operating System & Management Dashboard',
    roleBadge: 'RESTAURANT_OWNER',
    badgeVariant: 'brand',
    icon: <Utensils className="w-6 h-6 text-rose-400" />,
    demoEmail: 'owner@lumiere.com',
    demoPass: 'owner123',
    targetDashboard: '/restaurant/dashboard',
    accentGradient: 'from-rose-500 to-amber-500',
    description: 'Access restaurant POS, live table layout, menu pricing, staff credential management, and inventory analytics.',
  },
  kitchen: {
    title: 'Kitchen Staff Login',
    subtitle: 'Kitchen Display System (KDS) & Order Preparation',
    roleBadge: 'CHEF / KITCHEN',
    badgeVariant: 'warning',
    icon: <ChefHat className="w-6 h-6 text-amber-400" />,
    demoEmail: 'chef@lumiere.com',
    demoPass: 'kitchen123',
    targetDashboard: '/kitchen/dashboard',
    accentGradient: 'from-amber-500 to-orange-600',
    description: 'Real-time kitchen order queue, ETA adjustments, item prep status, and station chef timing controls.',
  },
  waiter: {
    title: 'Waiter Terminal Login',
    subtitle: 'Floor Waiter Terminal & Table Service Dispatch',
    roleBadge: 'WAITER / SERVER',
    badgeVariant: 'success',
    icon: <PhoneCall className="w-6 h-6 text-emerald-400" />,
    demoEmail: 'waiter@lumiere.com',
    demoPass: 'waiter123',
    targetDashboard: '/waiter',
    accentGradient: 'from-emerald-500 to-teal-600',
    description: 'Handheld terminal for floor staff to receive customer calls, deliver ready orders, process bills, and manage tables.',
  },
  bar: {
    title: 'Bar Terminal Login',
    subtitle: 'Bar Terminal & Mixology Order Queue',
    roleBadge: 'BAR_STAFF / BARTENDER',
    badgeVariant: 'brand',
    icon: <Wine className="w-6 h-6 text-purple-400" />,
    demoEmail: 'bartender@lumiere.com',
    demoPass: 'bar123',
    targetDashboard: '/bar/dashboard',
    accentGradient: 'from-purple-600 to-indigo-600',
    description: 'Dedicated terminal for bar staff to receive drink orders, manage alcohol prep queues, and mark beverages ready.',
  },
};

export const RoleLoginPage: React.FC<RoleLoginPageProps> = ({
  portal,
  onNavigate,
  onLoginSuccess,
}) => {
  const config = PORTAL_CONFIGS[portal] || PORTAL_CONFIGS.restaurant;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleQuickFill = () => {
    setEmail(config.demoEmail);
    setPassword(config.demoPass);
    setErrorMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !password) {
      setErrorMessage('Please enter both email address and password.');
      return;
    }

    setIsLoading(true);

    try {
      let result: any;
      if (portal === 'admin') {
        result = await api.loginPlatformAdmin(email, password);
      } else if (portal === 'restaurant') {
        result = await api.loginOwner(email, password);
      } else if (portal === 'kitchen') {
        result = await api.loginKitchen(email, password);
      } else if (portal === 'waiter') {
        result = await api.loginWaiter(email, password);
      }

      setSuccessMessage(`Authenticated successfully! Loading ${config.title}...`);
      setTimeout(() => {
        onLoginSuccess(result.user?.role || portal, result.user);
        
        if (portal === 'restaurant' && result.restaurant && (!result.restaurant.isApproved || result.restaurant.lifecycleStatus === 'PENDING_APPROVAL')) {
          onNavigate('/restaurant/pending-approval');
        } else {
          onNavigate(config.targetDashboard);
        }
      }, 500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentUser = api.getCurrentUser();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Dynamic Background Glow Elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-rose-600/10 via-amber-500/10 to-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            DineFlow Dedicated Role Portal
          </div>
          
          <div className="flex items-center justify-center gap-3">
            <div className={`p-3 rounded-2xl bg-gradient-to-br ${config.accentGradient} text-white shadow-xl flex items-center justify-center`}>
              {config.icon}
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">{config.title}</h1>
          </div>
          
          <p className="text-xs text-slate-400 max-w-sm mx-auto">{config.subtitle}</p>
        </div>

        {/* Login Card */}
        <Card className="bg-slate-900/90 border-slate-800/90 p-6 sm:p-8 backdrop-blur-xl shadow-2xl space-y-6 rounded-3xl">
          {/* Active Session Status */}
          {currentUser && (
            <div className="p-4 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-semibold">Active Logged-In User:</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1.5 truncate max-w-[180px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  {currentUser.name || currentUser.email}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => {
                    const dashboard = currentUser.role === 'PLATFORM_ADMIN' ? '/admin/dashboard' :
                                      currentUser.role === 'RESTAURANT_OWNER' ? '/restaurant/dashboard' :
                                      currentUser.role === 'CHEF' ? '/kitchen/dashboard' :
                                      currentUser.role === 'WAITER' ? '/waiter' : '/restaurant/dashboard';
                    onNavigate(dashboard);
                  }}
                  className="flex-1 text-xs py-2 font-bold"
                >
                  Go to Active Dashboard
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await api.logout();
                    onLoginSuccess('', null);
                    onNavigate(window.location.pathname);
                  }}
                  className="text-xs border-rose-500/40 text-rose-400 hover:bg-rose-500/10 py-2 font-bold"
                >
                  Log Out
                </Button>
              </div>
            </div>
          )}

          {/* Portal Info Banner */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl flex items-start gap-3">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-slate-300 leading-relaxed">
              <span className="font-bold text-white block mb-0.5">{config.description}</span>
              {portal === 'kitchen' || portal === 'waiter' ? (
                <span className="text-slate-400">
                  Staff credentials are generated by the Restaurant Owner via Staff Management.
                </span>
              ) : null}
            </div>
          </div>

          {/* Messages */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-xs text-rose-300 flex items-start gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-950/60 border border-emerald-800/80 rounded-2xl text-xs text-emerald-300 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Email Address</span>
                <span className="text-[10px] text-slate-500 font-mono">Role Email</span>
              </label>
              <div className="relative">
                <Input
                  type="email"
                  placeholder="enter email..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10"
                />
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Password</span>
                <span className="text-[10px] text-slate-500 font-mono">Secure Auth</span>
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 pr-10"
                />
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="brand"
              className="w-full py-3 text-xs font-bold shadow-lg mt-2"
              disabled={isLoading}
              icon={isLoading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            >
              {isLoading ? 'Authenticating...' : `Sign In to ${config.title}`}
            </Button>
          </form>

          {portal === 'restaurant' && (
            <div className="pt-2 text-center border-t border-slate-800">
              <p className="text-xs text-slate-400">
                New Restaurant Owner?{' '}
                <button
                  onClick={() => onNavigate('/wizard')}
                  className="text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer"
                >
                  Register Outlet Trial
                </button>
              </p>
            </div>
          )}
        </Card>

        {/* Portal Switcher Footer */}
        <div className="space-y-3 text-center bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
          <div className="space-y-1.5">
            <p className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
              Staff Terminals
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'kitchen', path: '/kitchen/login', label: 'Kitchen KDS', icon: <ChefHat className="w-3.5 h-3.5" /> },
                { id: 'waiter', path: '/waiter/login', label: 'Waiter OS', icon: <PhoneCall className="w-3.5 h-3.5" /> },
                { id: 'bar', path: '/bar/login', label: 'Bar Terminal', icon: <Wine className="w-3.5 h-3.5" /> },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => onNavigate(p.path)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[10px] font-bold border transition-all ${
                    portal === p.id
                      ? 'bg-amber-600 text-white border-amber-500 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {p.icon}
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <p className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wider">
              Management & Admin
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'restaurant', path: '/restaurant/login', label: 'Restaurant Owner OS', icon: <Utensils className="w-3.5 h-3.5" /> },
                { id: 'admin', path: '/admin/login', label: 'Platform Admin', icon: <Building2 className="w-3.5 h-3.5" /> },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => onNavigate(p.path)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[10px] font-bold border transition-all ${
                    portal === p.id
                      ? 'bg-rose-600 text-white border-rose-500 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {p.icon}
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Back to Home Link */}
        <div className="text-center">
          <button
            onClick={() => onNavigate('/')}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back to DineFlow Home Page
          </button>
        </div>
      </div>
    </div>
  );
};
