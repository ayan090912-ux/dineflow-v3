import React, { useState } from 'react';
import {
  UtensilsCrossed,
  Lock,
  Mail,
  User as UserIcon,
  Phone,
  Building,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Globe,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  ChevronRight,
  Check,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Badge,
  DinelyLogo,
} from '../../packages/ui';
import { api } from '../../packages/api/client';
import { User, AuthTokens, Organization } from '../../packages/types';
import { signInWithGooglePopup } from '../../packages/auth/firebase';

interface AuthPageProps {
  onLoginSuccess?: (ownerData: any) => void;
  onRegisterSuccess?: (registeredData: any) => void;
  onContinueFreeTrial?: () => void;
  onNavigate?: (path: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onLoginSuccess,
  onRegisterSuccess,
  onContinueFreeTrial,
  onNavigate,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'verify' | 'create_org' | 'forgot'>('login');

  // Login Form state
  const [loginEmail, setLoginEmail] = useState('owner@lumiere.com');
  const [loginPassword, setLoginPassword] = useState('password123');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Registration Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  // Email Verification state
  const [verificationCode, setVerificationCode] = useState('123456');
  const [verifiedUser, setVerifiedUser] = useState<User | null>(null);
  const [jwtTokens, setJwtTokens] = useState<AuthTokens | null>(null);

  // Create Organization state
  const [orgName, setOrgName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [gstVatNumber, setGstVatNumber] = useState('');
  const [country, setCountry] = useState('India');
  const [currency, setCurrency] = useState('INR (₹)');
  const [timezone, setTimezone] = useState('Asia/Kolkata (IST)');
  const [businessAddress, setBusinessAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [createdOrg, setCreatedOrg] = useState<Organization | null>(null);

  // Forgot password email
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Handle Login Submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!loginEmail || !loginPassword) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.loginOwner(loginEmail, loginPassword);
      const restName = (res as any).restaurant?.name || 'Dashboard';
      setSuccessMessage(`Welcome back, ${res.user.name}! Loading ${restName}...`);
      setTimeout(() => {
        if (onLoginSuccess) {
          onLoginSuccess(res);
        } else if (onNavigate) {
          onNavigate('/workspace');
        } else {
          window.location.href = '/workspace';
        }
      }, 500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google OAuth Popup
  const handleGoogleAuth = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);
    try {
      const googleUser = await signInWithGooglePopup();
      const res = await api.authenticateWithGoogle({
        googleUid: googleUser.uid,
        email: googleUser.email || '',
        name: googleUser.displayName || 'Owner',
        photoURL: googleUser.photoURL || undefined,
      });

      setSuccessMessage(`Authenticated with Google! Welcome, ${res.user.name}.`);

      setTimeout(() => {
        setIsLoading(false);
        if (res.hasRestaurant) {
          if (onLoginSuccess) {
            onLoginSuccess(res);
          } else if (onNavigate) {
            onNavigate('/workspace');
          } else {
            window.location.href = '/workspace';
          }
        } else {
          if (onContinueFreeTrial) {
            onContinueFreeTrial();
          } else if (onRegisterSuccess) {
            onRegisterSuccess(res);
          } else if (onLoginSuccess) {
            onLoginSuccess(res);
          } else if (onNavigate) {
            onNavigate('/wizard?mode=create');
          } else {
            window.location.href = '/wizard?mode=create';
          }
        }
      }, 400);
    } catch (err: any) {
      setIsLoading(false);
      console.error('Google Sign-in failed:', err);
      setErrorMessage(err.message || 'Google Sign-In failed. Please try email login.');
    }
  };

  // Step 1: Handle Registration Submit
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!firstName || !lastName || !regEmail || !regPassword) {
      setErrorMessage('Please complete all required fields.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (regPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (!acceptTerms) {
      setErrorMessage('Please accept the Terms of Service to continue.');
      return;
    }

    setIsLoading(true);
    try {
      await api.registerOwner({
        name: `${firstName} ${lastName}`,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
      });

      setIsLoading(false);
      setSuccessMessage(`Verification code sent to ${regEmail}.`);
      setMode('verify');
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Registration failed.');
    }
  };

  // Step 1.5: Handle Email Verification
  const handleVerifyEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!verificationCode) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.verifyOwnerEmail(regEmail, verificationCode);
      setIsLoading(false);
      setVerifiedUser(res.user);
      setJwtTokens(res.tokens);

      setSupportEmail(regEmail);
      setContactNumber(regPhone);
      setOrgName(`${firstName}'s Hospitality Group`);
      setLegalName(`${firstName} ${lastName} Dining Services LLC`);
      setMode('create_org');
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Verification failed.');
    }
  };

  // Step 2: Handle Create Organization
  const handleCreateOrgSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!orgName || !legalName || !businessAddress || !contactNumber || !supportEmail) {
      setErrorMessage('Please complete all mandatory organization fields.');
      return;
    }

    setIsLoading(true);
    try {
      const newOrg = await api.createOrganization({
        name: orgName,
        legalBusinessName: legalName,
        gstVatNumber,
        country,
        currency,
        timezone,
        businessAddress,
        contactNumber,
        supportEmail,
        ownerEmail: regEmail || '',
        ownerName: verifiedUser ? verifiedUser.name : `${firstName} ${lastName}`,
      });

      setIsLoading(false);
      setCreatedOrg(newOrg);
      setSuccessMessage('Organization created successfully. Launching setup wizard...');

      setTimeout(() => {
        if (onRegisterSuccess) {
          onRegisterSuccess({
            ownerName: verifiedUser ? verifiedUser.name : `${firstName} ${lastName}`,
            restaurantName: `${orgName} Flagship Branch`,
            email: regEmail,
            phone: regPhone,
            org: newOrg,
          });
        }
      }, 700);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Failed to create organization.');
    }
  };

  // Handle Forgot Password Submit
  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      setErrorMessage('Please enter your account email.');
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setForgotSent(true);
    }, 700);
  };

  return (
    <div className="min-h-screen bg-[#0b0d11] text-[#f3f4f6] flex flex-col justify-between font-sans selection:bg-[#f97316] selection:text-[#0b0d11]">
      {/* Minimal Top Brand Bar */}
      <div className="w-full border-b border-[#1e232e] bg-[#0b0d11]/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div
            className="flex items-center cursor-pointer text-white"
            onClick={() => {
              if (onNavigate) onNavigate('/');
              else window.location.href = '/';
            }}
          >
            <DinelyLogo size="sm" />
          </div>

          <div className="flex items-center gap-3">
            {mode === 'login' ? (
              <button
                onClick={() => { setMode('register'); setErrorMessage(''); setSuccessMessage(''); }}
                className="text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                Create Account →
              </button>
            ) : (
              <button
                onClick={() => { setMode('login'); setErrorMessage(''); setSuccessMessage(''); }}
                className="text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                Sign In →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Authentication Card Container */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-12">
        <div className="w-full max-w-md space-y-6">
          {/* LOGIN FORM */}
          {mode === 'login' && (
            <div className="bg-[#12151b] border border-[#1e232e] rounded-2xl p-7 sm:p-8 space-y-6 shadow-xl text-left">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold text-white tracking-tight font-display">
                  Sign in to your restaurant
                </h1>
                <p className="text-xs text-slate-400">
                  Manage your venues, live orders, kitchen stations, and billing.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Single-Click Google Authentication */}
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-[#2d3545] bg-[#1a1e27] hover:bg-[#222734] hover:border-slate-500 text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
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

              <div className="relative flex items-center justify-center my-2">
                <div className="w-full border-t border-[#1e232e]" />
                <span className="absolute bg-[#12151b] px-2.5 text-[10px] uppercase font-mono text-slate-500">
                  or email
                </span>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Work Email</label>
                  <input
                    type="email"
                    placeholder="owner@restaurant.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-[#f97316] transition-colors"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">Password</label>
                    <button
                      type="button"
                      onClick={() => setMode('forgot')}
                      className="text-xs text-[#f97316] hover:underline"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3.5 py-2.5 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-[#f97316] transition-colors pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
                  {!isLoading && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </form>

              <div className="text-center text-xs text-slate-400 pt-2 border-t border-[#1e232e]">
                New to Dinely?{' '}
                <button
                  onClick={() => setMode('register')}
                  className="text-[#f97316] font-semibold hover:underline cursor-pointer"
                >
                  Create a free restaurant account
                </button>
              </div>
            </div>
          )}

          {/* REGISTER FORM */}
          {mode === 'register' && (
            <div className="bg-[#12151b] border border-[#1e232e] rounded-2xl p-7 sm:p-8 space-y-6 shadow-xl text-left">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold text-white tracking-tight font-display">
                  Create your owner account
                </h1>
                <p className="text-xs text-slate-400">
                  Step 1 of 3: Set up your profile to manage multi-tenant venues.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-[#2d3545] bg-[#1a1e27] hover:bg-[#222734] text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="relative flex items-center justify-center my-2">
                <div className="w-full border-t border-[#1e232e]" />
                <span className="absolute bg-[#12151b] px-2.5 text-[10px] uppercase font-mono text-slate-500">
                  or register with email
                </span>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">First Name</label>
                    <input
                      type="text"
                      placeholder="Elena"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Last Name</label>
                    <input
                      type="text"
                      placeholder="Rostova"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Business Email</label>
                  <input
                    type="email"
                    placeholder="elena@hospitality.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Phone</label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Password</label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Confirm Password</label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2 pt-1 cursor-pointer text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 rounded border-[#2d3545] bg-[#0b0d11]"
                  />
                  <span>I agree to the Terms of Service & Privacy Policy.</span>
                </label>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  <span>{isLoading ? 'Creating account...' : 'Continue to Verification'}</span>
                  {!isLoading && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </form>

              <div className="text-center text-xs text-slate-400 pt-2 border-t border-[#1e232e]">
                Already registered?{' '}
                <button
                  onClick={() => setMode('login')}
                  className="text-[#f97316] font-semibold hover:underline cursor-pointer"
                >
                  Sign in
                </button>
              </div>
            </div>
          )}

          {/* VERIFY EMAIL FORM */}
          {mode === 'verify' && (
            <div className="bg-[#12151b] border border-[#1e232e] rounded-2xl p-7 sm:p-8 space-y-6 shadow-xl text-left">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold text-white tracking-tight font-display">
                  Verify your email
                </h1>
                <p className="text-xs text-slate-400">
                  Step 2 of 3: Enter the 6-digit code sent to <span className="text-slate-200">{regEmail}</span>.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleVerifyEmailSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">6-Digit Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="123456"
                    className="w-full text-center tracking-[0.5em] font-mono text-xl px-3.5 py-3 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-[#f97316] font-bold focus:outline-none focus:border-[#f97316]"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>{isLoading ? 'Verifying...' : 'Verify Email'}</span>
                  {!isLoading && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </form>

              <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-[#1e232e]">
                <span>Didn't receive code?</span>
                <button
                  type="button"
                  onClick={() => setSuccessMessage('New verification code sent!')}
                  className="text-[#f97316] hover:underline cursor-pointer font-semibold"
                >
                  Resend Code
                </button>
              </div>
            </div>
          )}

          {/* CREATE ORGANIZATION FORM */}
          {mode === 'create_org' && (
            <div className="bg-[#12151b] border border-[#1e232e] rounded-2xl p-7 sm:p-8 space-y-6 shadow-xl text-left">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold text-white tracking-tight font-display">
                  Set up your organization
                </h1>
                <p className="text-xs text-slate-400">
                  Step 3 of 3: Primary legal business entity and address.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleCreateOrgSubmit} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Organization Name *</label>
                  <input
                    type="text"
                    placeholder="Gourmet Hospitality Group"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Legal Entity Name *</label>
                  <input
                    type="text"
                    placeholder="Gourmet Hospitality Group LLC"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">GST / Tax ID</label>
                    <input
                      type="text"
                      placeholder="27AABCU9603R1ZN"
                      value={gstVatNumber}
                      onChange={(e) => setGstVatNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Currency</label>
                    <div className="px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-slate-300">
                      INR (₹) - Rupee
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Business Address *</label>
                  <input
                    type="text"
                    placeholder="101 MG Road, Bengaluru, Karnataka 560001"
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Support Phone *</label>
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Support Email *</label>
                    <input
                      type="email"
                      placeholder="support@hospitality.com"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 mt-2"
                >
                  <span>{isLoading ? 'Setting up...' : 'Create Organization & Open Setup'}</span>
                  {!isLoading && <ArrowRight className="w-3.5 h-3.5" />}
                </button>
              </form>
            </div>
          )}

          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <div className="bg-[#12151b] border border-[#1e232e] rounded-2xl p-7 sm:p-8 space-y-6 shadow-xl text-left">
              <div className="space-y-1.5">
                <h1 className="text-2xl font-bold text-white tracking-tight font-display">
                  Reset your password
                </h1>
                <p className="text-xs text-slate-400">
                  Enter your email address to receive reset instructions.
                </p>
              </div>

              {forgotSent ? (
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 space-y-3">
                  <p>A recovery link has been dispatched to {forgotEmail}.</p>
                  <button
                    onClick={() => setMode('login')}
                    className="w-full py-2 rounded-lg bg-[#1a1e27] border border-[#2d3545] text-white font-semibold"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Account Email</label>
                    <input
                      type="email"
                      placeholder="owner@restaurant.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#0b0d11] border border-[#2d3545] rounded-lg text-sm text-white focus:outline-none focus:border-[#f97316]"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{isLoading ? 'Sending...' : 'Send Recovery Link'}</span>
                    {!isLoading && <ArrowRight className="w-3.5 h-3.5" />}
                  </button>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      ← Return to sign in
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-[#1e232e] py-6 px-4 text-center text-xs text-slate-500">
        Dinely Restaurant Operating System • Enterprise Multi-Tenant Architecture
      </footer>
    </div>
  );
};
