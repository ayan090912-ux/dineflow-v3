import React, { useState } from 'react';
import {
  Button,
  Card,
  Input,
  Badge,
} from '../../packages/ui';
import {
  Utensils,
  Sparkles,
  Lock,
  Mail,
  User as UserIcon,
  Phone,
  Building,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Zap,
  Globe,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  ChevronRight,
  FileText,
  MapPin,
  CreditCard,
  Check,
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { User, AuthTokens, Organization } from '../../packages/types';

interface AuthPageProps {
  onLoginSuccess?: (ownerData: any) => void;
  onRegisterSuccess?: (registeredData: any) => void;
  onContinueFreeTrial?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onLoginSuccess,
  onRegisterSuccess,
  onContinueFreeTrial,
}) => {
  const [mode, setMode] = useState<'landing' | 'login' | 'register' | 'verify' | 'create_org' | 'forgot'>('landing');

  // Login Form state
  const [loginEmail, setLoginEmail] = useState('owner@lumiere.com');
  const [loginPassword, setLoginPassword] = useState('password123');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Step 1: Registration Form state
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

  // Step 2: Create Organization state
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
      setSuccessMessage(`Welcome back, ${res.user.name}! Directing to ${res.restaurant?.name || 'Dashboard'}...`);
      setTimeout(() => {
        if (onLoginSuccess) {
          onLoginSuccess(res);
        }
      }, 600);
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google Auth Demo
  const handleGoogleAuth = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setSuccessMessage('Google Account authenticated! Directing...');
      setTimeout(() => {
        if (onLoginSuccess) {
          onLoginSuccess({
            name: 'Google Workspace Owner',
            email: 'owner@google-auth.com',
            restaurantName: 'New Restaurant Outlet',
          });
        }
      }, 800);
    }, 800);
  };

  // Step 1: Handle Register Owner Submit
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!firstName || !lastName || !regEmail || !regPassword) {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    if (!acceptTerms) {
      setErrorMessage('You must accept the terms of service.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.registerOwner({
        name: `${firstName} ${lastName}`,
        email: regEmail,
        phone: regPhone,
        password: regPassword,
      });

      setIsLoading(false);
      setSuccessMessage('Owner account registered! Verification code dispatched.');
      setMode('verify');
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err.message || 'Failed to register account.');
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
      setSuccessMessage('Email address verified successfully! JWT access token granted.');

      // Auto pre-fill organization contact & support email
      setSupportEmail(regEmail);
      setContactNumber(regPhone);
      setOrgName(`${firstName}'s Hospitality Group`);
      setLegalName(`${firstName} ${lastName} Dining Services LLC`);
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
        ownerEmail: regEmail || 'owner@dineflow.app',
        ownerName: verifiedUser ? verifiedUser.name : `${firstName} ${lastName}`,
      });

      setIsLoading(false);
      setCreatedOrg(newOrg);
      setSuccessMessage(`Organization "${newOrg.name}" provisioned successfully! Proceeding to setup wizard...`);

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
      }, 1000);
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
    }, 800);
  };

  return (
    <div className="min-h-[calc(100vh-65px)] bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
      {/* Background Glows */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-rose-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[250px] bg-amber-500/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Hero Header Banner */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12 w-full">
        <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto">
          <Badge variant="brand" className="px-3 py-1 text-xs font-mono tracking-wider uppercase flex items-center gap-1.5 shadow-lg shadow-rose-900/20">
            <Sparkles className="w-3.5 h-3.5 text-rose-300" /> DineFlow Cloud Self-Service Platform
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Next-Gen Restaurant <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-500 via-amber-400 to-rose-400">Onboarding Engine</span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base max-w-2xl leading-relaxed">
            Multi-Tenant SaaS architecture for restaurant owners, hospitality groups, and multi-branch chains.
          </p>

          {/* Tab Navigation Pill Bar */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800/80 shadow-2xl backdrop-blur-md mt-4">
            <button
              onClick={() => { setMode('landing'); setErrorMessage(''); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                mode === 'landing' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> Platform Overview
            </button>
            <button
              onClick={() => { setMode('login'); setErrorMessage(''); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                mode === 'login' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" /> Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setErrorMessage(''); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                mode === 'register' || mode === 'verify' || mode === 'create_org' ? 'bg-rose-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5" /> Start Free Trial
            </button>
          </div>
        </div>

        {/* Dynamic Section Content */}
        <div className="mt-10 max-w-5xl mx-auto">
          {/* LANDING / HERO OVERVIEW */}
          {mode === 'landing' && (
            <div className="space-y-12">
              {/* Feature Highlight Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-slate-900/80 border-slate-800 p-6 space-y-3 hover:border-rose-500/40 transition-all group">
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:bg-rose-600 group-hover:text-white transition-all">
                    <Utensils className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-white">1. Owner Registration</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Instant owner account creation with email verification and secure JWT session issuance.
                  </p>
                </Card>

                <Card className="bg-slate-900/80 border-slate-800 p-6 space-y-3 hover:border-amber-500/40 transition-all group">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-all">
                    <Building className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-white">2. Organization Creation</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Establish your parent hospitality entity, legal GST/tax identifier, address, and base currency.
                  </p>
                </Card>

                <Card className="bg-slate-900/80 border-slate-800 p-6 space-y-3 hover:border-emerald-500/40 transition-all group">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-white">3. Auto Provisioning</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Zero-developer provisioning of custom branch subdomains, QR codes, KDS screens, and POS terminals.
                  </p>
                </Card>
              </div>

              {/* Call to Action Banner */}
              <div className="p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-rose-950/60 to-slate-900 border border-rose-500/30 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
                <div className="space-y-2 text-center md:text-left">
                  <h3 className="text-xl font-bold text-white">Ready to register your restaurant organization?</h3>
                  <p className="text-xs text-slate-300">
                    Get started in 3 steps: Create Owner Account → Verify Email → Create Organization.
                  </p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                  <Button
                    variant="brand"
                    className="w-full md:w-auto px-6 py-3 font-bold text-sm shadow-xl shadow-rose-900/40"
                    onClick={() => setMode('register')}
                  >
                    Start Free Trial <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full md:w-auto px-6 py-3 font-bold text-sm"
                    onClick={() => setMode('login')}
                  >
                    Sign In
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* LOGIN FORM */}
          {mode === 'login' && (
            <Card className="bg-slate-900/90 border-slate-800 p-8 max-w-md mx-auto shadow-2xl backdrop-blur-xl relative overflow-hidden">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Restaurant Owner Sign In</h2>
                  <p className="text-xs text-slate-400 mt-1">Access your POS dashboard, KDS orders, and revenue insights.</p>
                </div>

                {errorMessage && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-start gap-2">
                    <span className="font-bold">Error:</span> {errorMessage}
                  </div>
                )}

                {successMessage && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    {successMessage}
                  </div>
                )}

                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <Input
                    label="Business Email"
                    type="email"
                    placeholder="owner@restaurant.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                  />

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300">Password</label>
                      <button
                        type="button"
                        onClick={() => setMode('forgot')}
                        className="text-xs text-rose-400 hover:text-rose-300 font-medium"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-rose-500 transition-colors pr-10"
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

                  <div className="flex items-center justify-between py-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-rose-600 focus:ring-rose-500"
                      />
                      Remember me for 30 days
                    </label>
                  </div>

                  <Button
                    type="submit"
                    variant="brand"
                    className="w-full py-3 font-bold text-sm shadow-lg shadow-rose-950/50"
                    isLoading={isLoading}
                  >
                    Sign In to POS Dashboard <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-800" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-slate-900 px-3 text-slate-500 font-mono">Or continue with</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 text-xs font-bold text-slate-200 transition-all"
                >
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
                  Google Workspace SSO
                </button>

                <p className="text-center text-xs text-slate-500 pt-2">
                  Don't have an account yet?{' '}
                  <button onClick={() => setMode('register')} className="text-rose-400 font-bold hover:underline">
                    Create a free trial
                  </button>
                </p>
              </div>
            </Card>
          )}

          {/* STEP 1: REGISTER OWNER ACCOUNT FORM */}
          {mode === 'register' && (
            <Card className="bg-slate-900/90 border-slate-800 p-8 max-w-lg mx-auto shadow-2xl backdrop-blur-xl">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant="brand" className="mb-2">Sprint 1 • Step 1</Badge>
                    <h2 className="text-2xl font-black text-white tracking-tight">Create Owner Account</h2>
                    <p className="text-xs text-slate-400 mt-1">Register as a Restaurant Owner on DineFlow Cloud.</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-sm">
                    1/3
                  </div>
                </div>

                {errorMessage && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                    <span className="font-bold">Error:</span> {errorMessage}
                  </div>
                )}

                {successMessage && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    {successMessage}
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="First Name *"
                      placeholder="e.g. Elena"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                    <Input
                      label="Last Name *"
                      placeholder="e.g. Rostova"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Business Email *"
                      type="email"
                      placeholder="elena@gourmethg.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                    />
                    <Input
                      label="Phone Number"
                      placeholder="+91 98765 43210"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Password *"
                      type="password"
                      placeholder="••••••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                    />
                    <Input
                      label="Confirm Password *"
                      type="password"
                      placeholder="••••••••••••"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="pt-2">
                    <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={(e) => setAcceptTerms(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded bg-slate-950 border-slate-800 text-rose-600 focus:ring-rose-500"
                      />
                      <span>
                        I agree to the <a href="#" className="text-rose-400 underline">Terms of Service</a>, <a href="#" className="text-rose-400 underline">Privacy Policy</a>, and consent to account verification.
                      </span>
                    </label>
                  </div>

                  <Button
                    type="submit"
                    variant="brand"
                    className="w-full py-3.5 font-bold text-sm shadow-xl shadow-rose-950/50 mt-4"
                    isLoading={isLoading}
                  >
                    Register & Send Verification Code <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </form>

                <p className="text-center text-xs text-slate-500 pt-2">
                  Already registered?{' '}
                  <button onClick={() => setMode('login')} className="text-rose-400 font-bold hover:underline">
                    Sign In
                  </button>
                </p>
              </div>
            </Card>
          )}

          {/* STEP 1.5: EMAIL VERIFICATION & JWT DISPLAY */}
          {mode === 'verify' && (
            <Card className="bg-slate-900/90 border-slate-800 p-8 max-w-lg mx-auto shadow-2xl backdrop-blur-xl space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Badge variant="brand" className="mb-2">Sprint 1 • Email Verification</Badge>
                  <h2 className="text-2xl font-black text-white tracking-tight">Verify Email Address</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Enter the 6-digit verification code dispatched to <strong className="text-slate-200">{regEmail}</strong>.
                  </p>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-sm">
                  1.5
                </div>
              </div>

              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                  <span className="font-bold">Error:</span> {errorMessage}
                </div>
              )}

              {jwtTokens ? (
                /* Verification Successful Card with JWT Tokens Display */
                <div className="p-5 rounded-2xl bg-slate-950 border border-emerald-500/40 space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    Email Verified! JWT Auth Tokens Issued
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <span className="text-slate-400 font-bold text-[10px] uppercase block">Access Token (Bearer 3600s)</span>
                      <p className="text-rose-400 truncate text-[11px]">{jwtTokens.accessToken}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                      <span className="text-slate-400 font-bold text-[10px] uppercase block">Refresh Token</span>
                      <p className="text-amber-400 truncate text-[11px]">{jwtTokens.refreshToken}</p>
                    </div>
                  </div>

                  <Button
                    variant="brand"
                    onClick={() => {
                      setSuccessMessage('');
                      setMode('create_org');
                    }}
                    className="w-full py-3.5 font-bold text-sm shadow-xl shadow-rose-950/50"
                  >
                    Proceed to Step 2: Create Organization <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              ) : (
                /* 6-Digit Code Verification Form */
                <form onSubmit={handleVerifyEmailSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Enter 6-Digit Code (Demo: 123456)</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="123456"
                      className="w-full text-center tracking-[1em] font-mono text-2xl px-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-rose-400 focus:outline-none focus:border-rose-500 font-bold"
                      required
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Didn't receive the code?</span>
                    <button
                      type="button"
                      onClick={() => setSuccessMessage('Verification code re-dispatched to email!')}
                      className="text-rose-400 font-bold hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Resend Code
                    </button>
                  </div>

                  <Button
                    type="submit"
                    variant="brand"
                    className="w-full py-3.5 font-bold text-sm shadow-xl shadow-rose-950/50"
                    isLoading={isLoading}
                  >
                    Verify Email & Generate JWT Token <ShieldCheck className="w-4 h-4 ml-2" />
                  </Button>
                </form>
              )}
            </Card>
          )}

          {/* STEP 2: CREATE ORGANIZATION FORM */}
          {mode === 'create_org' && (
            <Card className="bg-slate-900/90 border-slate-800 p-8 max-w-2xl mx-auto shadow-2xl backdrop-blur-xl">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant="brand" className="mb-2">Sprint 1 • Step 2</Badge>
                    <h2 className="text-2xl font-black text-white tracking-tight">Create Organization</h2>
                    <p className="text-xs text-slate-400 mt-1">Set up your top-level parent hospitality entity and legal details.</p>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-sm">
                    2/3
                  </div>
                </div>

                {errorMessage && (
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                    <span className="font-bold">Error:</span> {errorMessage}
                  </div>
                )}

                {successMessage && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    {successMessage}
                  </div>
                )}

                <form onSubmit={handleCreateOrgSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Organization Display Name *"
                      placeholder="e.g. Gourmet Hospitality Group"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                    />
                    <Input
                      label="Legal Business Name *"
                      placeholder="e.g. Gourmet Hospitality Group LLC"
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="GST / VAT / Tax Identifier"
                      placeholder="e.g. 27AABCU9603R1ZN"
                      value={gstVatNumber}
                      onChange={(e) => setGstVatNumber(e.target.value)}
                    />
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Country *</label>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-rose-500"
                      >
                        <option value="India">India</option>
                        <option value="United States">United States</option>
                        <option value="United Kingdom">United Kingdom</option>
                        <option value="United Arab Emirates">United Arab Emirates</option>
                        <option value="Japan">Japan</option>
                        <option value="Singapore">Singapore</option>
                        <option value="Canada">Canada</option>
                        <option value="Australia">Australia</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Base Currency *</label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-rose-500"
                      >
                        <option value="INR (₹)">INR (₹) - Indian Rupee</option>
                        <option value="USD ($)">USD ($) - US Dollar</option>
                        <option value="EUR (€)">EUR (€) - Euro</option>
                        <option value="GBP (£)">GBP (£) - British Pound</option>
                        <option value="AED (AED)">AED (AED) - UAE Dirham</option>
                        <option value="JPY (¥)">JPY (¥) - Japanese Yen</option>
                        <option value="CAD ($)">CAD ($) - Canadian Dollar</option>
                        <option value="AUD ($)">AUD ($) - Australian Dollar</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">Operational Timezone *</label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-rose-500"
                      >
                        <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST)</option>
                        <option value="America/Los_Angeles (PST)">America/Los_Angeles (PST)</option>
                        <option value="America/New_York (EST)">America/New_York (EST)</option>
                        <option value="Europe/London (GMT)">Europe/London (GMT)</option>
                        <option value="Asia/Dubai (GST)">Asia/Dubai (GST)</option>
                        <option value="Asia/Tokyo (JST)">Asia/Tokyo (JST)</option>
                        <option value="Asia/Singapore (SGT)">Asia/Singapore (SGT)</option>
                      </select>
                    </div>
                  </div>

                  <Input
                    label="Business Address *"
                    placeholder="e.g. 101 MG Road, Bengaluru, Karnataka 560001"
                    value={businessAddress}
                    onChange={(e) => setBusinessAddress(e.target.value)}
                    required
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Contact Number *"
                      placeholder="+91 98765 43210"
                      value={contactNumber}
                      onChange={(e) => setContactNumber(e.target.value)}
                      required
                    />
                    <Input
                      label="Support Email *"
                      type="email"
                      placeholder="support@gourmethg.com"
                      value={supportEmail}
                      onChange={(e) => setSupportEmail(e.target.value)}
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="brand"
                    className="w-full py-3.5 font-bold text-sm shadow-xl shadow-rose-950/50 mt-4"
                    isLoading={isLoading}
                  >
                    Provision Organization & Launch Setup Wizard <Building className="w-4 h-4 ml-2" />
                  </Button>
                </form>
              </div>
            </Card>
          )}

          {/* FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <Card className="bg-slate-900/90 border-slate-800 p-8 max-w-md mx-auto shadow-2xl backdrop-blur-xl">
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">Reset Password</h2>
                  <p className="text-xs text-slate-400 mt-1">Enter your business email to receive reset instructions.</p>
                </div>

                {forgotSent ? (
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs space-y-3">
                    <div className="flex items-center gap-2 font-bold text-emerald-400">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Reset email dispatched!
                    </div>
                    <p>We sent a secure password reset link to <strong className="text-white">{forgotEmail}</strong>.</p>
                    <Button variant="outline" className="w-full text-xs" onClick={() => setMode('login')}>
                      Back to Sign In
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} className="space-y-4">
                    <Input
                      label="Business Email"
                      type="email"
                      placeholder="owner@restaurant.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      required
                    />

                    <Button type="submit" variant="brand" className="w-full py-3 font-bold text-sm" isLoading={isLoading}>
                      Send Recovery Link
                    </Button>

                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="w-full text-center text-xs text-slate-400 hover:text-white font-medium"
                    >
                      ← Return to Login
                    </button>
                  </form>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Footer Branding */}
      <footer className="border-t border-slate-900 py-6 px-4 text-center text-xs text-slate-600">
        DineFlow Cloud Platform &copy; 2026. Self-Service Architecture & Tenant Isolation Engine.
      </footer>
    </div>
  );
};
