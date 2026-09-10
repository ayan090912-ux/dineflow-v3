import React, { useState } from 'react';
import {
  Building2,
  ChefHat,
  PhoneCall,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Wine,
  Package,
  ArrowLeft,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { DinelyLogo } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { signInPlatformAdminWithGoogle } from '../../packages/auth/firebase';
import { AuthPage } from './AuthPage';

export type PortalType = 'restaurant' | 'kitchen' | 'waiter' | 'bar' | 'inventory' | 'admin';

interface RoleLoginPageProps {
  portal: PortalType;
  onNavigate: (path: string) => void;
  onLoginSuccess: (role: string, user: any) => void;
}

interface PortalConfig {
  title: string;
  subtitle: string;
  roleBadge: string;
  icon: React.ReactNode;
  targetDashboard: string;
  identifierLabel: string;
  identifierPlaceholder: string;
}

const PORTAL_CONFIGS: Record<PortalType, PortalConfig> = {
  admin: {
    title: 'Platform Administrator',
    subtitle: 'Internal Dinely Control Plane & Multi-Tenant Infrastructure',
    roleBadge: 'SUPER_ADMIN',
    icon: <Building2 className="w-5 h-5 text-purple-300" />,
    targetDashboard: '/admin/dashboard',
    identifierLabel: 'Administrator Email / Key',
    identifierPlaceholder: 'admin@dinely.food',
  },
  restaurant: {
    title: 'Restaurant Owner Login',
    subtitle: 'Manage your connected restaurant workspace',
    roleBadge: 'RESTAURANT_OWNER',
    icon: <Building2 className="w-5 h-5 text-amber-300" />,
    targetDashboard: '/restaurant/dashboard',
    identifierLabel: 'Account Email',
    identifierPlaceholder: 'name@restaurant.com',
  },
  kitchen: {
    title: 'Kitchen Display System',
    subtitle: 'Order preparation queues, stations & prep timings',
    roleBadge: 'KITCHEN_STATION',
    icon: <ChefHat className="w-5 h-5 text-amber-300" />,
    targetDashboard: '/kitchen/dashboard',
    identifierLabel: 'Staff ID or Email',
    identifierPlaceholder: 'chef@restaurant.com or staff ID',
  },
  waiter: {
    title: 'Waiter Service Terminal',
    subtitle: 'Floor service dispatch, call management & table billing',
    roleBadge: 'WAITER_TERMINAL',
    icon: <PhoneCall className="w-5 h-5 text-emerald-300" />,
    targetDashboard: '/waiter',
    identifierLabel: 'Staff ID or Email',
    identifierPlaceholder: 'server@restaurant.com or staff ID',
  },
  bar: {
    title: 'Bar Mixology Terminal',
    subtitle: 'Beverage queue, drinks preparation & bar dispatch',
    roleBadge: 'BAR_TERMINAL',
    icon: <Wine className="w-5 h-5 text-indigo-300" />,
    targetDashboard: '/bar/dashboard',
    identifierLabel: 'Staff ID or Email',
    identifierPlaceholder: 'bartender@restaurant.com or staff ID',
  },
  inventory: {
    title: 'Inventory OS Terminal',
    subtitle: 'Stock levels, ingredient deductions & supply logs',
    roleBadge: 'INVENTORY_TERMINAL',
    icon: <Package className="w-5 h-5 text-rose-300" />,
    targetDashboard: '/inventory/terminal',
    identifierLabel: 'Staff ID or Email',
    identifierPlaceholder: 'inventory@restaurant.com or staff ID',
  },
};

export const RoleLoginPage: React.FC<RoleLoginPageProps> = ({
  portal,
  onNavigate,
  onLoginSuccess,
}) => {
  // If this is the public owner portal, render the canonical unified AuthPage
  if (portal === 'restaurant') {
    return (
      <AuthPage
        onNavigate={onNavigate}
        onLoginSuccess={(res) => {
          const user = res?.user || res;
          onLoginSuccess('RESTAURANT_OWNER', user);
        }}
      />
    );
  }

  const config = PORTAL_CONFIGS[portal] || PORTAL_CONFIGS.kitchen;

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdminGoogleLoading, setIsAdminGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const portalScope = portal === 'admin' ? 'ADMIN' : 'STAFF';
  const currentUser = api.getCurrentUser(portalScope);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier || !password) {
      setErrorMessage('Please enter both your credentials and password.');
      return;
    }

    setIsLoading(true);

    try {
      let result: any;
      if (portal === 'admin') {
        result = await api.loginPlatformAdmin(cleanIdentifier, password);
      } else if (portal === 'kitchen') {
        result = await api.loginKitchen(cleanIdentifier, password);
      } else if (portal === 'waiter') {
        result = await api.loginWaiter(cleanIdentifier, password);
      } else if (portal === 'bar') {
        result = await api.loginBar(cleanIdentifier, password);
      } else if (portal === 'inventory') {
        result = await api.loginInventory(cleanIdentifier, password);
      }

      setSuccessMessage(`Authenticated successfully. Loading terminal...`);
      setTimeout(() => {
        onLoginSuccess(result?.user?.role || portal, result?.user);
        onNavigate(config.targetDashboard);
      }, 400);
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminGoogleAuth = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsAdminGoogleLoading(true);

    try {
      const googleUser = await signInPlatformAdminWithGoogle();
      const idToken = googleUser.idToken || googleUser.email;
      const res = await api.loginPlatformAdmin(idToken, googleUser.email);

      setSuccessMessage(`Platform Administrator verified. Loading Control Plane...`);
      setTimeout(() => {
        setIsAdminGoogleLoading(false);
        onLoginSuccess('PLATFORM_ADMIN', res.user);
        onNavigate('/admin/dashboard');
      }, 400);
    } catch (err: any) {
      setIsAdminGoogleLoading(false);
      const msg = err.message || '';
      if (msg.includes('403') || msg.includes('not authorized') || msg.includes('Access denied')) {
        setErrorMessage('Access denied. This Google account is not authorized for Dinely Platform Administration.');
      } else {
        setErrorMessage(msg || 'Platform Admin authentication failed. Please try again.');
      }
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden select-none bg-[#0b0d11] text-slate-100 font-sans antialiased">
      {/* ─── Cinematic Restaurant Background Video ─── */}
      <video
        className="fixed inset-0 h-full w-full object-cover pointer-events-none"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      >
        <source
          src="https://cdn.pixabay.com/video/2022/11/30/141046-776768279_large.mp4"
          type="video/mp4"
        />
        <source
          src="https://cdn.pixabay.com/video/2015/10/27/1192-143842659_large.mp4"
          type="video/mp4"
        />
      </video>

      {/* ─── Dark Readability Scrim ─── */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            'linear-gradient(to top, rgba(11,13,17,0.92) 0%, rgba(11,13,17,0.70) 50%, rgba(11,13,17,0.50) 100%)',
        }}
      />

      {/* ─── Top Header Navigation ─── */}
      <header className="relative z-10 w-full px-5 py-5 sm:px-8 sm:py-6 lg:px-12 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onNavigate('/')}
          className="flex items-center cursor-pointer bg-transparent border-none text-white hover:opacity-90 transition-opacity"
          aria-label="Back to Dinely Home"
        >
          <DinelyLogo size="md" />
        </button>

        {portal !== 'admin' && (
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/70 hover:text-white transition-colors bg-white/[0.06] hover:bg-white/[0.10] px-3.5 py-1.5 rounded-full border border-white/[0.08] cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Home</span>
          </button>
        )}
      </header>

      {/* ─── Glass Authentication Card ─── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div
          className="w-full max-w-[440px] rounded-[24px] p-6 sm:p-8 border border-white/[0.14] flex flex-col transition-all duration-300"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 25px 80px rgba(0, 0, 0, 0.45)',
          }}
        >
          {/* Card Title & Icon */}
          <div className="text-center mb-6">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-white/[0.08] border border-white/[0.14] flex items-center justify-center mb-3 shadow-inner">
              {config.icon}
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.10] text-[11px] font-mono uppercase tracking-wider text-white/70 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span>{config.roleBadge}</span>
            </div>

            <h1 className="text-[22px] sm:text-[24px] font-semibold text-white tracking-tight">
              {config.title}
            </h1>
            <p className="mt-1 text-[13px] text-white/65 leading-relaxed">
              {config.subtitle}
            </p>
          </div>

          {/* Active Session Notice if already signed in */}
          {currentUser && (
            <div className="mb-5 rounded-xl bg-white/[0.05] border border-white/[0.10] p-3 flex items-center justify-between text-[12.5px]">
              <span className="text-white/60">Signed in as <strong className="text-white font-medium">{currentUser.name || currentUser.email}</strong></span>
              <button
                type="button"
                onClick={() => onNavigate(config.targetDashboard)}
                className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer bg-transparent border-none"
              >
                Open &rarr;
              </button>
            </div>
          )}

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="mb-5 rounded-xl bg-rose-500/15 border border-rose-500/30 p-3.5 flex items-start gap-2.5 text-rose-300 text-[13px] leading-snug">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 p-3.5 flex items-start gap-2.5 text-emerald-300 text-[13px] leading-snug">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Platform Admin Dedicated Google Auth */}
          {portal === 'admin' && (
            <div className="mb-5">
              <button
                type="button"
                onClick={handleAdminGoogleAuth}
                disabled={isLoading || isAdminGoogleLoading}
                className="w-full flex items-center justify-center gap-3 rounded-full py-3.5 px-5 bg-white hover:bg-white/95 text-slate-900 font-medium text-[14px] transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-lg disabled:opacity-60 disabled:cursor-not-allowed border-none"
              >
                {isAdminGoogleLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-slate-700" />
                    <span>Verifying Admin Access...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Admin Google ID</span>
                  </>
                )}
              </button>

              <div className="relative my-5 flex items-center justify-center">
                <div className="w-full border-t border-white/[0.10]" />
                <span className="absolute bg-[#14161b] px-3 text-[11.5px] text-white/45 uppercase tracking-wider font-mono rounded-full border border-white/[0.08]">
                  or master admin credentials
                </span>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[12.5px] font-medium text-white/80 mb-1.5">
                {config.identifierLabel}
              </label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={config.identifierPlaceholder}
                required
                className="w-full rounded-xl bg-white/[0.05] border border-white/[0.12] focus:border-white/[0.35] focus:bg-white/[0.08] px-4 py-3 text-white placeholder:text-white/35 text-[14px] outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-[12.5px] font-medium text-white/80 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl bg-white/[0.05] border border-white/[0.12] focus:border-white/[0.35] focus:bg-white/[0.08] px-4 py-3 text-white placeholder:text-white/35 text-[14px] outline-none transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer bg-transparent border-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || isAdminGoogleLoading}
              className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full py-3.5 px-6 text-[14px] font-medium text-white transition-all duration-200 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-lg shadow-black/60 border border-white/[0.16] disabled:opacity-50"
              style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white/70" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Authenticate Terminal</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Security & Isolation Notice */}
          <div className="mt-6 pt-4 border-t border-white/[0.08] text-center">
            {portal === 'admin' ? (
              <p className="text-[11.5px] text-purple-300/70 leading-relaxed font-mono flex items-center justify-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                <span>Internal control plane. Access strictly logged and monitored.</span>
              </p>
            ) : (
              <p className="text-[12px] text-white/45">
                Terminal credentials provided by your restaurant manager.
              </p>
            )}
          </div>
        </div>
      </main>

      {/* ─── Bottom Sub-footer ─── */}
      <footer className="relative z-10 w-full px-5 py-5 text-center text-[12px] text-white/40">
        &copy; {new Date().getFullYear()} Dinely. All rights reserved.
      </footer>
    </div>
  );
};
