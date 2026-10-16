import React, { useState, useEffect } from 'react';
import {
  Crown,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  ArrowLeft,
  Loader2,
  Sparkles,
  Clock,
  Building2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../packages/api/client';
import {
  signInWithGoogle,
  handleGoogleRedirectResult,
  firebaseAuth,
  authStateMachine,
  signOutFirebase,
} from '../../packages/auth/firebase';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { DinelyLogo, Button } from '../../packages/ui';

interface WeddingLoginPageProps {
  onNavigate?: (path: string) => void;
  onLoginSuccess?: (user: any) => void;
}

export const WeddingLoginPage: React.FC<WeddingLoginPageProps> = ({
  onNavigate,
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'forgot' | 'track' | 'pending' | 'rejected' | 'no_workspace'>('login');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Tracking Fields
  const [trackRefId, setTrackRefId] = useState('');
  const [trackEmail, setTrackEmail] = useState('');
  const [trackResult, setTrackResult] = useState<any | null>(null);

  // Applicant Status Context (post-auth inspection)
  const [applicantRequest, setApplicantRequest] = useState<any | null>(null);
  const [userRestaurants, setUserRestaurants] = useState<any[]>([]);
  const [authenticatedUser, setAuthenticatedUser] = useState<any | null>(null);

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.location.href = path;
    }
  };

  // Inspect user status and route intelligently
  const handlePostAuthRouting = async (userEmail: string, userUid: string) => {
    try {
      // 1. Check for approved wedding workspaces
      const weddingRes = await api.getMyWeddingWorkspaces(userEmail);
      if (weddingRes?.workspaces && weddingRes.workspaces.length > 0) {
        navigateTo('/weddings/dashboard');
        return;
      }

      // 2. Check if user has a submitted/under_review or rejected wedding application
      const statusRes = await api.getWeddingApplicantStatus(userEmail);
      if (statusRes?.hasApplication && statusRes.application) {
        setApplicantRequest(statusRes.application);
        const lifecycle = (statusRes.application.lifecycleStatus || '').toUpperCase();
        if (lifecycle === 'APPROVED' && statusRes.application.workspaceId) {
          // Approved! Transition directly into dashboard
          navigateTo('/weddings/dashboard');
          return;
        } else if (lifecycle === 'SUBMITTED' || lifecycle === 'UNDER_REVIEW') {
          setMode('pending');
          return;
        } else if (lifecycle === 'REJECTED') {
          setMode('rejected');
          return;
        }
      }

      // 3. Check if user is a restaurant owner who doesn't have a wedding workspace
      try {
        const myRests = await api.getOwnerRestaurants(userEmail, userUid);
        if (myRests && myRests.length > 0) {
          setUserRestaurants(myRests);
          setMode('no_workspace');
          return;
        }
      } catch (_) {}

      // 4. Default: User authenticated but has no wedding application
      setMode('no_workspace');
    } catch (err: any) {
      console.warn('[WeddingLogin] Error during post-auth routing:', err);
      setErrorMessage(err.message || 'Could not verify wedding organizer workspace.');
    }
  };

  // Session check on mount
  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      if (search.includes('switch=true') || search.includes('logout=true')) {
        if (isMounted) setIsRestoringSession(false);
        return;
      }

      // 1. Check pending Google OAuth redirect result
      try {
        const redirectUser = await handleGoogleRedirectResult();
        if (redirectUser && isMounted) {
          setIsGoogleLoading(true);
          const res = await api.authenticateWithGoogle({
            googleUid: redirectUser.uid,
            email: redirectUser.email,
            name: redirectUser.displayName,
            photoURL: redirectUser.photoURL,
            idToken: redirectUser.idToken,
          });

          setAuthenticatedUser(res?.user || redirectUser);
          if (onLoginSuccess) onLoginSuccess(res?.user || redirectUser);
          await handlePostAuthRouting(redirectUser.email, redirectUser.uid);
          return;
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('[WeddingLogin] Google redirect error:', err);
          if (err.code !== 'auth/popup-closed-by-user' && !err.isCancelled) {
            setErrorMessage(err.message || 'Google sign-in could not be completed.');
          }
        }
      }

      // 2. Check active user session
      const currentUser = api.getCurrentUser('OWNER');
      if (currentUser?.email && isMounted) {
        setAuthenticatedUser(currentUser);
        await handlePostAuthRouting(currentUser.email.toLowerCase(), currentUser.id || '');
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
  }, []);

  // Google OAuth Flow
  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsGoogleLoading(true);

    try {
      const googleUser = await signInWithGoogle();
      if (!googleUser) {
        // Redirect flow in flight (mobile Safari / partitioned storage)
        return;
      }

      // Authenticate with backend engine
      const res = await api.authenticateWithGoogle({
        googleUid: googleUser.uid,
        email: googleUser.email,
        name: googleUser.displayName,
        photoURL: googleUser.photoURL,
        idToken: googleUser.idToken,
      });

      const user = res?.user || googleUser;
      setAuthenticatedUser(user);
      if (onLoginSuccess) onLoginSuccess(user);

      await handlePostAuthRouting(googleUser.email, googleUser.uid);
    } catch (err: any) {
      console.error('[WeddingLogin] Google sign-in failed:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.isCancelled) {
        authStateMachine.handleGoogleCancellation();
        setErrorMessage('Google sign-in popup was closed. Please click below to try again.');
      } else {
        setErrorMessage(err.message || 'Google authentication failed. Please verify your connection.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  // Email / Password Login Flow
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setIsLoading(true);

    try {
      // First try Dinely backend owner login
      let user: any = null;
      try {
        const res = await api.loginOwner(cleanEmail, password);
        user = res?.user;
      } catch (backendErr: any) {
        // Fallback to Firebase client SDK signInWithEmailAndPassword
        const fbRes = await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password);
        const idToken = await fbRes.user.getIdToken();
        const res = await api.authenticateWithGoogle({
          googleUid: fbRes.user.uid,
          email: cleanEmail,
          name: fbRes.user.displayName || cleanEmail.split('@')[0],
          idToken,
        });
        user = res?.user || fbRes.user;
      }

      setAuthenticatedUser(user);
      if (onLoginSuccess) onLoginSuccess(user);
      await handlePostAuthRouting(cleanEmail, user?.id || user?.uid || '');
    } catch (err: any) {
      console.error('[WeddingLogin] Email login error:', err);
      setErrorMessage(err.message || 'Invalid email or password. Please verify your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot Password Flow
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage('Please enter your account email address.');
      return;
    }

    setIsLoading(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, cleanEmail);
      setSuccessMessage(`Password reset link dispatched to ${cleanEmail}. Please check your inbox.`);
    } catch (err: any) {
      console.error('[WeddingLogin] Password reset error:', err);
      setErrorMessage(err.message || 'Unable to send password reset email. Please verify the address.');
    } finally {
      setIsLoading(false);
    }
  };

  // Application Reference Lookup Flow
  const handleLookupRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanId = trackRefId.trim();
    if (!cleanId) {
      setErrorMessage('Please provide an application reference ID (e.g. wreq-b4228c74ec).');
      return;
    }

    setIsLoading(true);
    try {
      const effEmail = trackEmail.trim().toLowerCase() || undefined;
      const res = await api.getWeddingRequestStatus(cleanId, effEmail);
      setTrackResult(res);
    } catch (err: any) {
      setErrorMessage(err.message || 'Application reference not found. Please double-check your ID.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOutAndReset = async () => {
    try {
      await signOutFirebase();
    } catch (_) {}
    setAuthenticatedUser(null);
    setApplicantRequest(null);
    setUserRestaurants([]);
    setMode('login');
    setErrorMessage('');
    setSuccessMessage('');
  };

  // Session Restoration Loader
  if (isRestoringSession) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0d11] text-white">
        <DinelyLogo size="lg" className="mb-6 animate-pulse" />
        <div className="flex items-center gap-2.5 text-white/70 text-[14px]">
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
          <span>Verifying wedding organizer session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-x-hidden select-none bg-[#0b0d11] text-slate-100 font-sans antialiased">
      {/* ─── Ambient Candlelit Banquet Background Glow ─── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-br from-amber-600/10 via-amber-800/5 to-transparent blur-[140px]" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-tl from-amber-500/10 via-amber-900/5 to-transparent blur-[140px]" />
        <div className="absolute inset-0 bg-[#0b0d11]/80 backdrop-blur-[60px]" />
      </div>

      {/* ─── Top Brand Navigation Bar ─── */}
      <header className="relative z-10 w-full px-6 py-5 flex items-center justify-between border-b border-white/[0.06] bg-[#0b0d11]/40 backdrop-blur-md">
        <button
          type="button"
          onClick={() => navigateTo('/weddings')}
          className="flex items-center gap-2.5 bg-transparent border-none text-white hover:opacity-90 transition-opacity p-0 cursor-pointer"
        >
          <DinelyLogo size="md" />
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono tracking-wider uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Weddings &amp; Events
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigateTo('/weddings')}
          className="flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white transition-colors bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-3.5 py-1.5 rounded-full cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Weddings</span>
        </button>
      </header>

      {/* ─── Main Content Container ─── */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-auto">
        <div className="w-full max-w-[440px] rounded-3xl bg-[#141620]/90 border border-amber-400/20 p-7 sm:p-9 shadow-2xl backdrop-blur-2xl text-left transition-all">
          
          {/* Header Crown Icon */}
          <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/25 flex items-center justify-center mx-auto mb-5 text-amber-300 shadow-inner">
            <Crown className="w-7 h-7" />
          </div>

          {/* Feedback Messages */}
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2.5 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2.5 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW: 1. ORGANIZER SIGN IN                                     */}
          {/* ============================================================== */}
          {mode === 'login' && (
            <div>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-serif font-bold text-amber-100">
                  Wedding Organizer Studio
                </h1>
                <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
                  Sign in to manage your celebration ordering and banquet table QR codes.
                </p>
              </div>

              {/* Continue with Google */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isLoading}
                className="w-full h-11 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-medium text-xs flex items-center justify-center gap-3 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-60 cursor-pointer"
              >
                {isGoogleLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                <span>Continue with Google</span>
              </button>

              <div className="relative my-5 flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/[0.08]" />
                </div>
                <span className="relative bg-[#141620] px-3 text-[10px] uppercase font-mono tracking-wider text-white/40">
                  Or continue with email
                </span>
              </div>

              {/* Email & Password Form */}
              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1.5">
                    Account Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="email"
                      required
                      placeholder="host@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-white/[0.04] border border-white/[0.1] focus:border-amber-400 focus:bg-white/[0.06] text-xs text-white placeholder-white/30 outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-medium text-white/70">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-[11px] text-amber-300/80 hover:text-amber-200 underline transition-colors cursor-pointer bg-transparent border-none p-0"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full h-11 pl-10 pr-10 rounded-xl bg-white/[0.04] border border-white/[0.1] focus:border-amber-400 focus:bg-white/[0.06] text-xs text-white placeholder-white/30 outline-none transition-all font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors cursor-pointer bg-transparent border-none p-0"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || isGoogleLoading}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-semibold text-xs transition-all shadow-lg shadow-amber-900/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 mt-1"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <>
                      <span>Sign In to Wedding Studio</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Secondary Navigation Links */}
              <div className="mt-6 pt-5 border-t border-white/[0.08] space-y-2.5 text-center">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setSuccessMessage('');
                      setMode('track');
                    }}
                    className="text-xs text-amber-300 hover:text-amber-200 transition-colors cursor-pointer bg-transparent border-none font-medium"
                  >
                    Track Existing Wedding Application &rarr;
                  </button>
                </div>

                <p className="text-[11px] text-white/40">
                  New to Dinely Weddings?{' '}
                  <button
                    type="button"
                    onClick={() => navigateTo('/weddings')}
                    className="text-white/70 hover:text-white underline cursor-pointer bg-transparent border-none p-0"
                  >
                    Plan your celebration
                  </button>
                </p>

                <p className="text-[11px] text-white/30">
                  Restaurant partner?{' '}
                  <button
                    type="button"
                    onClick={() => navigateTo('/restaurant/login')}
                    className="text-white/50 hover:text-white/80 underline cursor-pointer bg-transparent border-none p-0"
                  >
                    Sign in to Restaurant OS
                  </button>
                </p>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW: 2. FORGOT PASSWORD                                       */}
          {/* ============================================================== */}
          {mode === 'forgot' && (
            <div>
              <div className="text-center mb-6">
                <h2 className="text-xl font-serif font-bold text-amber-100">
                  Reset Password
                </h2>
                <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
                  Enter your organizer account email and we'll dispatch password recovery instructions.
                </p>
              </div>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1.5">
                    Account Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="email"
                      required
                      placeholder="host@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-white/[0.04] border border-white/[0.1] focus:border-amber-400 text-xs text-white placeholder-white/30 outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <span>Send Reset Instructions</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setSuccessMessage('');
                    setMode('login');
                  }}
                  className="w-full h-10 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/70 text-xs font-medium transition-colors cursor-pointer"
                >
                  Back to Sign In
                </button>
              </form>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW: 3. TRACK APPLICATION REFERENCE                           */}
          {/* ============================================================== */}
          {mode === 'track' && (
            <div>
              <div className="text-center mb-6">
                <h2 className="text-xl font-serif font-bold text-amber-100">
                  Track Application Status
                </h2>
                <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
                  Look up your submitted celebration request with your unique reference identifier.
                </p>
              </div>

              <form onSubmit={handleLookupRequest} className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">
                    Application Reference ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. wreq-b4228c74ec"
                    value={trackRefId}
                    onChange={(e) => setTrackRefId(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl bg-white/[0.04] border border-white/[0.1] focus:border-amber-400 text-xs text-white placeholder-white/30 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-white/70 mb-1">
                    Applicant Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="host@example.com"
                    value={trackEmail}
                    onChange={(e) => setTrackEmail(e.target.value)}
                    className="w-full h-10 px-3.5 rounded-xl bg-white/[0.04] border border-white/[0.1] focus:border-amber-400 text-xs text-white placeholder-white/30 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  ) : (
                    <span>Check Review Status</span>
                  )}
                </button>
              </form>

              {/* Tracking Result Card */}
              {trackResult && (
                <div className="mt-5 p-4 rounded-2xl bg-[#0b0d13] border border-amber-400/20 text-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{trackResult.weddingName}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                        trackResult.lifecycleStatus === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : trackResult.lifecycleStatus === 'REJECTED'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {trackResult.lifecycleStatus}
                    </span>
                  </div>

                  <p className="text-white/60 text-[11px]">
                    Event Date: {trackResult.eventDate} • Venue: {trackResult.venueName || trackResult.venueCity}
                  </p>

                  {trackResult.reviewNotes && (
                    <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[11px] text-white/70 italic">
                      "{trackResult.reviewNotes}"
                    </div>
                  )}

                  {trackResult.lifecycleStatus === 'APPROVED' && (
                    <button
                      type="button"
                      onClick={() => navigateTo('/weddings/dashboard')}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md mt-2 cursor-pointer"
                    >
                      <span>Open Wedding Organizer Studio</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setSuccessMessage('');
                  setMode('login');
                }}
                className="w-full h-10 mt-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/70 text-xs font-medium transition-colors cursor-pointer"
              >
                Back to Sign In
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW: 4. APPLICATION PENDING REVIEW                            */}
          {/* ============================================================== */}
          {mode === 'pending' && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/30 text-amber-300 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>

              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Review in Progress
                </span>
                <h2 className="text-xl font-serif font-bold text-amber-100 mt-2">
                  Application Under Review
                </h2>
                <p className="text-xs text-white/60 mt-2 leading-relaxed">
                  Your celebration request for{' '}
                  <strong className="text-white">{applicantRequest?.weddingName}</strong> is currently being reviewed by Dinely Platform Administration.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#0b0d13] border border-white/[0.08] text-xs space-y-1.5 text-left font-mono">
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/40">Reference ID:</span>
                  <span className="text-amber-300 font-bold">{applicantRequest?.id}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/40">Applicant:</span>
                  <span className="text-white/80">{applicantRequest?.applicantEmail}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-white/40">Target Date:</span>
                  <span className="text-white/80">{applicantRequest?.eventDate}</span>
                </div>
              </div>

              <p className="text-[11px] text-white/50 leading-relaxed">
                As soon as the Platform Admin approves your request and assigns the catering partner, your Organizer Studio will activate automatically.
              </p>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => handlePostAuthRouting(applicantRequest?.applicantEmail, '')}
                  className="w-full h-10 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Check Fresh Approval Status</span>
                </button>

                <button
                  type="button"
                  onClick={handleSignOutAndReset}
                  className="w-full h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/60 text-xs transition-colors cursor-pointer"
                >
                  Sign In with Different Account
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW: 5. APPLICATION DECLINED                                  */}
          {/* ============================================================== */}
          {mode === 'rejected' && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>

              <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-rose-500/10 text-rose-300 border border-rose-500/20">
                  Application Declined
                </span>
                <h2 className="text-xl font-serif font-bold text-white mt-2">
                  Request Not Approved
                </h2>
                <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
                  Your celebration inquiry for{' '}
                  <strong className="text-white">{applicantRequest?.weddingName}</strong> was reviewed by Platform Admin and could not be provisioned at this time.
                </p>
              </div>

              {applicantRequest?.reviewNotes && (
                <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-white/80 italic text-left">
                  <span className="text-[10px] text-white/40 block not-italic uppercase font-mono mb-1">Review Feedback</span>
                  "{applicantRequest.reviewNotes}"
                </div>
              )}

              <p className="text-[11px] text-white/50 leading-relaxed">
                If you have questions, please reach out to our event operations desk at{' '}
                <a href="mailto:contact@dinely.food" className="text-amber-300 underline">contact@dinely.food</a>.
              </p>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => navigateTo('/weddings')}
                  className="w-full h-10 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <span>Submit New Celebration Inquiry</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleSignOutAndReset}
                  className="w-full h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/60 text-xs transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW: 6. NO WORKSPACE FOUND FOR ACCOUNT                        */}
          {/* ============================================================== */}
          {mode === 'no_workspace' && (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/30 text-amber-300 flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>

              <div>
                <h2 className="text-xl font-serif font-bold text-amber-100">
                  No Wedding Workspace
                </h2>
                <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
                  We signed you in as <strong className="text-white">{authenticatedUser?.email}</strong>, but there is no approved celebration workspace associated with this address.
                </p>
              </div>

              {/* If user is also a restaurant owner */}
              {userRestaurants.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-[#0b0d13] border border-amber-400/20 text-xs text-left space-y-2">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                    <Building2 className="w-4 h-4" />
                    <span>Connected Restaurant Found</span>
                  </div>
                  <p className="text-white/60 text-[11px]">
                    You own <strong className="text-white">{userRestaurants[0].name}</strong>. You can open your restaurant operating terminal or request wedding access for an event.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigateTo('/restaurant/dashboard')}
                    className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>Enter Restaurant OS ({userRestaurants[0].name})</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => navigateTo('/weddings')}
                  className="w-full h-10 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <span>Request Wedding Ordering Access</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleSignOutAndReset}
                  className="w-full h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white/60 text-xs transition-colors cursor-pointer"
                >
                  Sign In with Another Email
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* ─── Minimal Luxury Footer ─── */}
      <footer className="relative z-10 w-full py-4 text-center text-[11px] text-white/30 border-t border-white/[0.04]">
        <span>&copy; {new Date().getFullYear()} Dinely Weddings &amp; Luxury Events. All rights reserved.</span>
      </footer>
    </div>
  );
};
