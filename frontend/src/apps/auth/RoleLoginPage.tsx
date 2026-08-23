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
  Package,
} from 'lucide-react';
import { Button, Card, Input, Badge, DinelyLogo } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { signInWithGooglePopup, signInPlatformAdminWithGoogle } from '../../packages/auth/firebase';

export type PortalType = 'admin' | 'restaurant' | 'kitchen' | 'waiter' | 'bar' | 'inventory';

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
  targetDashboard: string;
  accentGradient: string;
  description: string;
}> = {
  admin: {
    title: 'Dinely Platform Administration',
    subtitle: 'Secure administrator access',
    roleBadge: 'PLATFORM_ADMIN',
    badgeVariant: 'brand',
    icon: <Building2 className="w-6 h-6 text-indigo-400" />,
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
    targetDashboard: '/bar/dashboard',
    accentGradient: 'from-purple-600 to-indigo-600',
    description: 'Dedicated terminal for bar staff to receive drink orders, manage alcohol prep queues, and mark beverages ready.',
  },
  inventory: {
    title: 'Inventory OS Login',
    subtitle: 'Raw Stock, Vendors & Supply Chain Terminal',
    roleBadge: 'INVENTORY_STAFF',
    badgeVariant: 'brand',
    icon: <Package className="w-6 h-6 text-rose-400" />,
    targetDashboard: '/inventory/terminal',
    accentGradient: 'from-rose-600 to-amber-600',
    description: 'Dedicated terminal for inventory staff to track raw materials, reorder thresholds, vendor deliveries, and stock consumption.',
  },
};

export const RoleLoginPage: React.FC<RoleLoginPageProps> = ({
  portal,
  onNavigate,
  onLoginSuccess,
}) => {
  const config = PORTAL_CONFIGS[portal] || PORTAL_CONFIGS.restaurant;

  // 2-Step Email-First Auth State for Restaurant Portal
  const [authStage, setAuthStage] = useState<'ENTER_EMAIL' | 'PASSWORD_LOGIN' | 'CREATE_ACCOUNT'>(
    portal === 'restaurant' ? 'ENTER_EMAIL' : 'PASSWORD_LOGIN'
  );
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');



  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    try {
      const exists = await api.checkUserExists(email);
      setIsLoading(false);
      if (exists) {
        setAuthStage('PASSWORD_LOGIN');
      } else {
        setAuthStage('CREATE_ACCOUNT');
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Failed to check account.');
    }
  };

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!fullName || !email || !password) {
      setErrorMessage('Please complete all required fields.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await api.registerOwner({
        name: fullName,
        email,
        phone: '',
        password,
      });

      setSuccessMessage('Account created successfully! Loading workspace...');
      setTimeout(() => {
        onLoginSuccess('RESTAURANT_OWNER', result.user);
        onNavigate('/workspace');
      }, 500);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Failed to create account.');
    }
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
      } else if (portal === 'bar') {
        result = await api.loginBar(email, password);
      } else if (portal === 'inventory') {
        result = await api.loginInventory(email, password);
      }

      setSuccessMessage(`Authenticated successfully! Loading ${config.title}...`);
      setTimeout(() => {
        onLoginSuccess(result.user?.role || portal, result.user);

        if (portal === 'restaurant') {
          onNavigate('/workspace');
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

  const handleGoogleAuth = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);
    try {
      const googleUser = await signInWithGooglePopup();
      const res = await api.authenticateWithGoogle({
        googleUid: googleUser.uid,
        email: googleUser.email,
        name: googleUser.displayName,
        photoURL: googleUser.photoURL,
      });

      setSuccessMessage(`Welcome, ${res.user.name}! Directing to Restaurant OS...`);
      setTimeout(() => {
        setIsLoading(false);
        onLoginSuccess('RESTAURANT_OWNER', res.user);
        if (res.hasRestaurant) {
          onNavigate('/restaurant/dashboard');
        } else {
          onNavigate('/wizard');
        }
      }, 500);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Google Authentication failed.');
    }
  };

  const handleAdminGoogleAuth = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);
    try {
      const googleUser = await signInPlatformAdminWithGoogle();
      const idToken = googleUser.idToken || googleUser.email;
      const res = await api.loginPlatformAdmin(idToken, googleUser.email);

      setSuccessMessage(`Authenticated Platform Administrator! Loading Control Plane...`);
      setTimeout(() => {
        setIsLoading(false);
        onLoginSuccess('PLATFORM_ADMIN', res.user);
        onNavigate('/admin/dashboard');
      }, 500);
    } catch (err: any) {
      setIsLoading(false);
      const msg = err.message || '';
      if (msg.includes('403') || msg.includes('not authorized') || msg.includes('Access denied')) {
        setErrorMessage('Access denied. This Google account is not authorized to access Dinely Platform Administration.');
      } else {
        setErrorMessage(msg || 'Platform Admin authentication failed. Please try again.');
      }
    }
  };


  const portalScope = portal === 'admin' ? 'ADMIN' : portal === 'restaurant' ? 'OWNER' : 'STAFF';
  const currentUser = api.getCurrentUser(portalScope);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Dynamic Background Glow Elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-rose-600/10 via-amber-500/10 to-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <DinelyLogo size="md" className="justify-center mb-1" />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {portal === 'restaurant' ? 'Dinely Owner Portal' : 'Dinely Dedicated Role Portal'}
          </div>
          
          <div className="flex items-center justify-center gap-3">
            <div className={`p-3 rounded-2xl bg-gradient-to-br ${config.accentGradient} text-white shadow-xl flex items-center justify-center`}>
              {config.icon}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {portal === 'restaurant' && authStage === 'ENTER_EMAIL' ? 'Start with Dinely' :
               portal === 'restaurant' && authStage === 'CREATE_ACCOUNT' ? 'Create your Dinely account' :
               portal === 'restaurant' && authStage === 'PASSWORD_LOGIN' ? 'Welcome back' : config.title}
            </h1>
          </div>
          
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {portal === 'restaurant' && authStage === 'ENTER_EMAIL' ? 'Enter your email to sign in or create an account' :
             portal === 'restaurant' && authStage === 'CREATE_ACCOUNT' ? 'Set up your credentials for Dinely Restaurant Cloud' :
             portal === 'restaurant' && authStage === 'PASSWORD_LOGIN' ? 'Enter your password to access your restaurant workspace' : config.subtitle}
          </p>
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
                                      currentUser.role === 'RESTAURANT_OWNER' ? '/workspace' :
                                      currentUser.role === 'CHEF' ? '/kitchen/dashboard' :
                                      currentUser.role === 'WAITER' ? '/waiter' : '/workspace';
                    onNavigate(dashboard);
                  }}
                  className="flex-1 text-xs py-2 font-bold"
                >
                  Go to Workspace Dashboard
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

          {/* STAGE 1: ENTER EMAIL (RESTAURANT PORTAL) */}
          {portal === 'restaurant' && authStage === 'ENTER_EMAIL' && (
            <form onSubmit={handleEmailContinue} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Email Address
                </label>
                <div className="relative">
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10"
                  />
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <Button
                type="submit"
                variant="brand"
                className="w-full py-3 text-xs font-bold shadow-lg mt-2 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white"
                disabled={isLoading}
                icon={isLoading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              >
                {isLoading ? 'Checking Email...' : 'Continue'}
              </Button>
            </form>
          )}

          {/* STAGE 2: CREATE ACCOUNT (NEW USER) */}
          {portal === 'restaurant' && authStage === 'CREATE_ACCOUNT' && (
            <form onSubmit={handleCreateAccountSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Full Name
                </label>
                <Input
                  placeholder="e.g. Ayaan Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAuthStage('ENTER_EMAIL')}
                  className="text-xs border-slate-800 text-slate-400"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="brand"
                  className="flex-1 py-3 text-xs font-bold shadow-lg bg-gradient-to-r from-rose-600 to-amber-500 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating Account...' : 'Create account'}
                </Button>
              </div>
            </form>
          )}

          {/* PLATFORM ADMIN EXCLUSIVE GOOGLE AUTHENTICATION FLOW */}
          {portal === 'admin' ? (
            <div className="space-y-5 text-center py-2">
              <div className="p-4 bg-indigo-950/30 border border-indigo-500/20 rounded-2xl space-y-2 text-left">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                  <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Platform Control Plane Isolation</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Access is strictly restricted to verified Platform Administrator Firebase credentials. Standard restaurant user or staff credentials cannot authenticate here.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAdminGoogleAuth}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-2xl border border-indigo-500/40 bg-gradient-to-r from-indigo-900/60 to-purple-900/60 hover:from-indigo-800/80 hover:to-purple-800/80 text-sm font-bold text-white shadow-xl hover:border-indigo-400 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
                )}
                <span>{isLoading ? 'Verifying Admin Identity...' : 'Continue with Google'}</span>
              </button>
            </div>
          ) : (
            /* STAGE 1b / REGULAR LOGIN (PASSWORD LOGIN) FOR NON-ADMIN PORTALS */
            (portal !== 'restaurant' || authStage === 'PASSWORD_LOGIN') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {(() => {
                  const isStaffPortal = portal === 'kitchen' || portal === 'waiter' || portal === 'bar' || portal === 'inventory';
                  return (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                        <span>{isStaffPortal ? 'Staff Name / Username' : 'Email Address'}</span>
                      </label>
                      <div className="relative">
                        <Input
                          type={isStaffPortal ? 'text' : 'email'}
                          placeholder={isStaffPortal ? 'Enter your assigned Staff Name (e.g. Marco Pierre)' : 'Enter your email'}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="pl-10"
                        />
                        {isStaffPortal ? (
                          <Users className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        ) : (
                          <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                    <span>Password</span>
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

                <div className="flex items-center justify-between gap-3 pt-2">
                  {portal === 'restaurant' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAuthStage('ENTER_EMAIL')}
                      className="text-xs border-slate-800 text-slate-400"
                    >
                      Change Email
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="brand"
                    className="flex-1 py-3 text-xs font-bold shadow-lg"
                    disabled={isLoading}
                    icon={isLoading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  >
                    {isLoading ? 'Authenticating...' : `Log in`}
                  </Button>
                </div>
              </form>
            )
          )}

          {portal === 'restaurant' && (
            <div className="space-y-3 pt-3 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-xl border border-slate-700/80 bg-slate-950 hover:bg-slate-800 text-xs font-bold text-slate-100 shadow-md hover:border-slate-600 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                <span>Continue with Google</span>
              </button>

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'kitchen', path: '/kitchen/login', label: 'Kitchen KDS', icon: <ChefHat className="w-3.5 h-3.5" /> },
                { id: 'waiter', path: '/waiter/login', label: 'Waiter OS', icon: <PhoneCall className="w-3.5 h-3.5" /> },
                { id: 'bar', path: '/bar/login', label: 'Bar Terminal', icon: <Wine className="w-3.5 h-3.5" /> },
                { id: 'inventory', path: '/inventory/login', label: 'Inventory OS', icon: <Package className="w-3.5 h-3.5" /> },
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
            ← Back to Dinely Home Page
          </button>
        </div>
      </div>
    </div>
  );
};
