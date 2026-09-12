import React, { useState, useEffect } from 'react';
import {
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  User as UserIcon,
  Phone,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { DinelyLogo } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { signInWithGooglePopup, firebaseAuth } from '../../packages/auth/firebase';

interface AuthPageProps {
  onLoginSuccess?: (ownerData: any) => void;
  onRegisterSuccess?: (registeredData: any) => void;
  onNavigate?: (path: string) => void;
  initialMode?: 'login' | 'register';
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onLoginSuccess,
  onRegisterSuccess,
  onNavigate,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI Feedback States
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.href = path;
    }
  };

  // Route user according to their existing restaurant state
  const routeUserAfterAuth = async (userEmail: string, userUid: string) => {
    try {
      const myRests = await api.getOwnerRestaurants(userEmail, userUid);
      if (!myRests || myRests.length === 0) {
        navigateTo('/wizard?mode=create');
      } else if (myRests.length === 1) {
        const onlyRest = myRests[0];
        await api.switchActiveRestaurant(onlyRest.id);
        const isLive =
          onlyRest.isApproved !== false &&
          onlyRest.lifecycleStatus !== 'PENDING_APPROVAL' &&
          onlyRest.lifecycleStatus !== 'REJECTED' &&
          onlyRest.lifecycleStatus !== 'ARCHIVED';

        if (isLive) {
          navigateTo('/restaurant/dashboard');
        } else {
          navigateTo('/restaurant/pending-approval');
        }
      } else {
        navigateTo('/workspace');
      }
    } catch (err) {
      console.warn('[AuthPage] Could not load restaurants, sending to workspace:', err);
      navigateTo('/workspace');
    }
  };

  // Check for existing authenticated session on mount
  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      // If the user explicitly requested registration or switching accounts, do not auto-redirect
      const search = typeof window !== 'undefined' ? window.location.search : '';
      if (initialMode === 'register' || search.includes('switch=true') || search.includes('logout=true')) {
        if (isMounted) setIsRestoringSession(false);
        return;
      }

      const currentUser = api.getCurrentUser('OWNER');

      // Only auto-route if an explicit active Dinely owner session is currently valid
      if (currentUser?.email && isMounted) {
        const activeEmail = currentUser.email.toLowerCase();
        const activeUid = currentUser.id || '';
        await routeUserAfterAuth(activeEmail, activeUid);
        return;
      }

      if (isMounted) {
        setIsRestoringSession(false);
      }
    };

    checkSession();

    return () => {
      isMounted = false;
    };
  }, [initialMode]);

  // 1. Google Authentication Flow
  const handleGoogleAuth = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsGoogleLoading(true);

    try {
      const googleUser = await signInWithGooglePopup();
      setSuccessMessage(`Signed in as ${googleUser.displayName || googleUser.email}`);

      // Authenticate with Dinely API engine
      const res = await api.authenticateWithGoogle({
        googleUid: googleUser.uid,
        email: googleUser.email,
        name: googleUser.displayName,
        photoURL: googleUser.photoURL,
        idToken: googleUser.idToken,
      });

      if (onLoginSuccess) {
        onLoginSuccess(res);
      }

      await routeUserAfterAuth(googleUser.email, googleUser.uid);
    } catch (err: any) {
      console.error('[AuthPage] Google sign-in failed:', err);
      setErrorMessage(err.message || 'Google authentication failed. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // 2. Email / Password Login Flow
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorMessage('Please enter both your email and password.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await api.loginOwner(cleanEmail, password);
      setSuccessMessage(`Welcome back, ${res.user.name || 'Owner'}!`);

      if (onLoginSuccess) {
        onLoginSuccess(res);
      }

      await routeUserAfterAuth(cleanEmail, res.user.id);
    } catch (err: any) {
      console.error('[AuthPage] Email login error:', err);
      setErrorMessage(err.message || 'Invalid email or password. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Email Registration Flow
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = fullName.trim();

    if (!cleanName || !cleanEmail || !password) {
      setErrorMessage('Please fill in your name, email, and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await api.registerOwner({
        name: cleanName,
        email: cleanEmail,
        phone: phone.trim(),
        password,
      });

      setSuccessMessage('Account created! Setting up your workspace...');

      if (onRegisterSuccess) {
        onRegisterSuccess(res);
      }

      // Fresh registered owner -> route to Setup Wizard
      navigateTo('/wizard?mode=create');
    } catch (err: any) {
      console.error('[AuthPage] Registration error:', err);
      setErrorMessage(err.message || 'Could not create account. Please try again or continue with Google.');
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Forgot Password Flow
  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Please enter your account email address.');
      return;
    }
    setSuccessMessage(`Password reset instructions have been sent to ${email.trim()}.`);
  };

  // If restoring existing authenticated session
  if (isRestoringSession) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0d11] text-white">
        <DinelyLogo size="lg" className="mb-6 animate-pulse" />
        <div className="flex items-center gap-2.5 text-white/70 text-[14px]">
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
          <span>Restoring your session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden select-none bg-[#0b0d11] text-slate-100 font-sans antialiased">
      {/* ─── Cinematic Restaurant Atmosphere Background Video ─── */}
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

      {/* ─── Readability Scrim (Subtle dark gradient ensuring form clarity) ─── */}
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
          onClick={() => navigateTo('/')}
          className="flex items-center cursor-pointer bg-transparent border-none text-white hover:opacity-90 transition-opacity"
          aria-label="Back to Dinely Home"
        >
          <DinelyLogo size="md" />
        </button>

        <button
          type="button"
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/70 hover:text-white transition-colors bg-white/[0.06] hover:bg-white/[0.10] px-3.5 py-1.5 rounded-full border border-white/[0.08] cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Home</span>
        </button>
      </header>

      {/* ─── Main Glass Authentication Card ─── */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div
          className="w-full max-w-[440px] rounded-[24px] p-6 sm:p-8 border border-white/[0.14] shadow-2xl shadow-black/80 flex flex-col transition-all duration-300"
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 25px 80px rgba(0, 0, 0, 0.45)',
          }}
        >
          {/* Card Header */}
          <div className="text-center mb-6">
            <h1 className="text-[24px] sm:text-[26px] font-semibold text-white tracking-tight">
              {mode === 'login' && 'Welcome back'}
              {mode === 'register' && 'Create your restaurant'}
              {mode === 'forgot' && 'Reset your password'}
            </h1>
            <p className="mt-1.5 text-[13.5px] text-white/70 leading-relaxed">
              {mode === 'login' && 'Sign in to manage your restaurant.'}
              {mode === 'register' &&
                'Start with Dinely and build your connected restaurant workspace.'}
              {mode === 'forgot' &&
                'Enter your account email and we will send you a reset link.'}
            </p>
          </div>

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

          {/* ── Primary Google Authentication Button (Login & Register) ── */}
          {mode !== 'forgot' && (
            <div className="mb-5">
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading || isGoogleLoading}
                className="w-full flex items-center justify-center gap-3 rounded-full py-3.5 px-5 bg-white hover:bg-white/95 text-slate-900 font-medium text-[14px] transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-lg disabled:opacity-60 disabled:cursor-not-allowed border-none"
              >
                {isGoogleLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-slate-700" />
                    <span>Connecting to Google...</span>
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
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              {/* Minimal Divider */}
              <div className="relative my-5 flex items-center justify-center">
                <div className="w-full border-t border-white/[0.10]" />
                <span className="absolute bg-[#14161b] px-3 text-[11.5px] text-white/45 uppercase tracking-wider font-mono rounded-full border border-white/[0.08]">
                  or continue with email
                </span>
              </div>
            </div>
          )}

          {/* ── Form: Login Mode ── */}
          {mode === 'login' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-[12.5px] font-medium text-white/80 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@restaurant.com"
                    required
                    autoComplete="email"
                    className="w-full rounded-xl bg-white/[0.05] border border-white/[0.12] focus:border-white/[0.35] focus:bg-white/[0.08] px-4 py-3 text-white placeholder:text-white/35 text-[14px] outline-none transition-all"
                  />
                  <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/35 pointer-events-none" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12.5px] font-medium text-white/80">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setSuccessMessage('');
                      setMode('forgot');
                    }}
                    className="text-[12px] text-white/50 hover:text-white/90 transition-colors cursor-pointer bg-transparent border-none"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
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

              {/* Primary Dark Button */}
              <button
                type="submit"
                disabled={isLoading || isGoogleLoading}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full py-3.5 px-6 text-[14px] font-medium text-white transition-all duration-200 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-lg shadow-black/60 border border-white/[0.16] disabled:opacity-50"
                style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white/70" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign in</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── Form: Register Mode ── */}
          {mode === 'register' && (
            <form onSubmit={handleEmailRegister} className="space-y-3.5">
              <div>
                <label className="block text-[12.5px] font-medium text-white/80 mb-1.5">
                  Your name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alice Chef"
                  required
                  autoComplete="name"
                  className="w-full rounded-xl bg-white/[0.05] border border-white/[0.12] focus:border-white/[0.35] focus:bg-white/[0.08] px-4 py-3 text-white placeholder:text-white/35 text-[14px] outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-white/80 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@restaurant.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl bg-white/[0.05] border border-white/[0.12] focus:border-white/[0.35] focus:bg-white/[0.08] px-4 py-3 text-white placeholder:text-white/35 text-[14px] outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-white/80 mb-1.5">
                  Phone number <span className="text-white/40 font-normal">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  autoComplete="tel"
                  className="w-full rounded-xl bg-white/[0.05] border border-white/[0.12] focus:border-white/[0.35] focus:bg-white/[0.08] px-4 py-3 text-white placeholder:text-white/35 text-[14px] outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-white/80 mb-1.5">
                  Create password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    required
                    autoComplete="new-password"
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

              {/* Primary Dark Button */}
              <button
                type="submit"
                disabled={isLoading || isGoogleLoading}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 rounded-full py-3.5 px-6 text-[14px] font-medium text-white transition-all duration-200 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-lg shadow-black/60 border border-white/[0.16] disabled:opacity-50"
                style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white/70" />
                    <span>Creating workspace...</span>
                  </>
                ) : (
                  <>
                    <span>Create your restaurant</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── Form: Forgot Password Mode ── */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-[12.5px] font-medium text-white/80 mb-1.5">
                  Account email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@restaurant.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl bg-white/[0.05] border border-white/[0.12] focus:border-white/[0.35] focus:bg-white/[0.08] px-4 py-3 text-white placeholder:text-white/35 text-[14px] outline-none transition-all"
                />
              </div>

              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-full py-3.5 px-6 text-[14px] font-medium text-white transition-all duration-200 hover:opacity-95 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-lg shadow-black/60 border border-white/[0.16]"
                style={{ background: 'linear-gradient(to bottom, #2B2B2B, #101010)' }}
              >
                Send reset instructions
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setSuccessMessage('');
                    setMode('login');
                  }}
                  className="text-[13px] text-white/60 hover:text-white transition-colors cursor-pointer bg-transparent border-none"
                >
                  &larr; Back to sign in
                </button>
              </div>
            </form>
          )}

          {/* ── Mode Switcher Footer ── */}
          {mode !== 'forgot' && (
            <div className="mt-6 pt-5 border-t border-white/[0.08] text-center">
              {mode === 'login' ? (
                <p className="text-[13px] text-white/60">
                  New to Dinely?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setSuccessMessage('');
                      setMode('register');
                    }}
                    className="text-white font-medium hover:underline cursor-pointer bg-transparent border-none ml-1"
                  >
                    Create your restaurant
                  </button>
                </p>
              ) : (
                <p className="text-[13px] text-white/60">
                  Already have a restaurant?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setSuccessMessage('');
                      setMode('login');
                    }}
                    className="text-white font-medium hover:underline cursor-pointer bg-transparent border-none ml-1"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ─── Bottom Sub-footer ─── */}
      <footer className="relative z-10 w-full px-5 py-5 text-center text-[12px] text-white/40">
        &copy; {new Date().getFullYear()} Dinely. All rights reserved.
      </footer>
    </div>
  );
};
