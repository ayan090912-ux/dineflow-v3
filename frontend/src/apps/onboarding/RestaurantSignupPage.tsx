import React, { useState, useEffect } from 'react';
import {
  Building2,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Globe,
  Loader2,
  Utensils,
  Store,
  ChefHat,
  Lock,
  Mail,
  User as UserIcon,
  Phone,
  ExternalLink
} from 'lucide-react';
import { DinelyLogo, Button, Input } from '../../packages/ui';
import { getApiBaseUrl } from '../../packages/api/client';

interface RestaurantSignupPageProps {
  onNavigate?: (path: string) => void;
}

export const RestaurantSignupPage: React.FC<RestaurantSignupPageProps> = ({ onNavigate }) => {
  const [restaurantName, setRestaurantName] = useState('');
  const [desiredSlug, setDesiredSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [cuisine, setCuisine] = useState('Multi-Cuisine');
  const [businessType, setBusinessType] = useState('RESTAURANT');

  const [slugStatus, setSlugStatus] = useState<'IDLE' | 'CHECKING' | 'AVAILABLE' | 'TAKEN'>('IDLE');
  const [suggestedSlug, setSuggestedSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState<{
    restaurantId: string;
    restaurantName: string;
    slug: string;
    domain: string;
    token?: string;
  } | null>(null);

  // Auto-generate slug from name if not manually edited
  useEffect(() => {
    if (!slugManuallyEdited && restaurantName) {
      const autoSlug = restaurantName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setDesiredSlug(autoSlug);
    }
  }, [restaurantName, slugManuallyEdited]);

  // Debounced check-slug availability
  useEffect(() => {
    if (!desiredSlug || desiredSlug.length < 2) {
      setSlugStatus('IDLE');
      setSuggestedSlug(null);
      return;
    }

    setSlugStatus('CHECKING');
    const timer = setTimeout(async () => {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/restaurants/check-slug?slug=${encodeURIComponent(desiredSlug)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.available) {
            setSlugStatus('AVAILABLE');
            setSuggestedSlug(null);
          } else {
            setSlugStatus('TAKEN');
            setSuggestedSlug(data.suggested || null);
          }
        } else {
          setSlugStatus('IDLE');
        }
      } catch (err) {
        setSlugStatus('IDLE');
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [desiredSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanName = restaurantName.trim();
    const cleanOwner = ownerName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanSlug = desiredSlug.trim().toLowerCase();

    if (!cleanName) {
      setErrorMessage('Please enter your restaurant name.');
      return;
    }
    if (!cleanOwner) {
      setErrorMessage('Please enter the owner name.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Please enter a valid owner email.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Please enter a password of at least 6 characters.');
      return;
    }

    setIsLoading(true);

    try {
      const apiBase = getApiBaseUrl();
      const payload = {
        restaurantName: cleanName,
        desiredSlug: cleanSlug || undefined,
        ownerName: cleanOwner,
        email: cleanEmail,
        password: password,
        phone: phone.trim() || undefined,
        cuisine: cuisine || 'Multi-Cuisine',
        businessType: businessType || 'RESTAURANT',
      };

      const res = await fetch(`${apiBase}/restaurants/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ detail: 'Failed to create restaurant.' }));
        throw new Error(errJson.detail || errJson.message || `Signup error (HTTP ${res.status})`);
      }

      const data = await res.json();
      const tenant = data.tenant || {};
      const generatedSlug = tenant.slug || tenant.publicSlug || cleanSlug;
      const domainUrl = `https://${generatedSlug}.dinely.food`;

      setSuccessData({
        restaurantId: tenant.id,
        restaurantName: tenant.name || cleanName,
        slug: generatedSlug,
        domain: domainUrl,
        token: data.token,
      });

      if (data.token && typeof window !== 'undefined') {
        localStorage.setItem('dinely_auth_token', data.token);
        localStorage.setItem('dinely_active_restaurant_id', tenant.id);
        sessionStorage.setItem('dinely_active_restaurant_id', tenant.id);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Restaurant signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-white flex flex-col justify-between relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-amber-500/10 via-rose-500/5 to-transparent blur-3xl pointer-events-none" />

      {/* Navigation Header */}
      <header className="relative z-10 w-full px-6 py-5 flex items-center justify-between border-b border-white/[0.06] backdrop-blur-md bg-slate-950/40">
        <div 
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => onNavigate ? onNavigate('/') : (window.location.href = 'https://dinely.food')}
        >
          <DinelyLogo size={36} />
          <span className="text-xl font-bold tracking-tight text-white font-serif">Dinely</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate ? onNavigate('/restaurant/login') : (window.location.href = '/restaurant/login')}
            className="text-xs text-white/70 hover:text-white transition-colors"
          >
            Already have an account? <span className="text-amber-400 font-semibold underline">Sign In</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 my-6">
        <div className="w-full max-w-2xl">
          {successData ? (
            /* Success confirmation screen */
            <div className="bg-[#0e1117] border border-emerald-500/30 rounded-3xl p-8 sm:p-10 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 size={36} />
              </div>

              <div>
                <span className="text-xs font-mono font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  TENANT PROVISIONED LIVE
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mt-3">
                  {successData.restaurantName} is Ready!
                </h2>
                <p className="text-sm text-white/60 max-w-md mx-auto mt-2">
                  Your isolated multi-tenant restaurant instance has been provisioned with database records, menu starter items, and tables.
                </p>
              </div>

              <div className="bg-[#141822] p-5 rounded-2xl border border-white/[0.08] text-left space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <span className="text-white/40">Restaurant ID:</span>
                  <span className="text-amber-400">{successData.restaurantId}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                  <span className="text-white/40">Slug:</span>
                  <span className="text-white">{successData.slug}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/40">Tenant Domain:</span>
                  <a
                    href={successData.domain}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                  >
                    {successData.domain}
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href={`${successData.domain}/restaurant/dashboard`}
                  className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <span>Open Restaurant Dashboard</span>
                  <ArrowRight size={16} />
                </a>
                <a
                  href={`${successData.domain}/customer`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 border border-white/[0.08]"
                >
                  <span>View Customer Menu</span>
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>
          ) : (
            /* Signup Form */
            <div className="bg-[#0e1117] border border-white/[0.08] rounded-3xl p-7 sm:p-10 shadow-2xl relative">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-3">
                  <Sparkles size={13} />
                  <span>Instant Multi-Tenant Provisioning</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  Launch Your Restaurant on Dinely
                </h1>
                <p className="text-sm text-white/50 mt-1 max-w-md mx-auto">
                  One canonical platform. Completely isolated data, branding, menu, and custom subdomain.
                </p>
              </div>

              {errorMessage && (
                <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{errorMessage}</p>
                    {suggestedSlug && (
                      <p className="mt-1 text-white/80">
                        Try available slug:{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setDesiredSlug(suggestedSlug);
                            setSlugManuallyEdited(true);
                            setErrorMessage('');
                          }}
                          className="text-amber-400 underline font-bold"
                        >
                          {suggestedSlug}
                        </button>
                      </p>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* 1. Restaurant Name & Subdomain */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5 font-mono">
                      Restaurant Name *
                    </label>
                    <div className="relative">
                      <Store size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                      <input
                        type="text"
                        required
                        value={restaurantName}
                        onChange={(e) => setRestaurantName(e.target.value)}
                        placeholder="e.g. THE Fly or Pizza House"
                        className="w-full bg-[#141822] border border-white/[0.08] focus:border-amber-500/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-white/80 uppercase tracking-wider font-mono">
                        Desired Subdomain *
                      </label>
                      {slugStatus === 'CHECKING' && <Loader2 size={12} className="animate-spin text-amber-400" />}
                      {slugStatus === 'AVAILABLE' && <span className="text-[11px] text-emerald-400 font-semibold">Available</span>}
                      {slugStatus === 'TAKEN' && <span className="text-[11px] text-rose-400 font-semibold">Taken</span>}
                    </div>
                    <div className="relative">
                      <Globe size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                      <input
                        type="text"
                        required
                        value={desiredSlug}
                        onChange={(e) => {
                          setDesiredSlug(e.target.value.toLowerCase().replace(/[^a-z0-9\-]/g, ''));
                          setSlugManuallyEdited(true);
                        }}
                        placeholder="e.g. the-fly"
                        className={`w-full bg-[#141822] border rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono text-white placeholder:text-white/30 focus:outline-none transition-all ${
                          slugStatus === 'AVAILABLE'
                            ? 'border-emerald-500/60'
                            : slugStatus === 'TAKEN'
                            ? 'border-rose-500/60'
                            : 'border-white/[0.08] focus:border-amber-500/60'
                        }`}
                      />
                    </div>
                  </div>
                </div>

                {/* Subdomain URL live preview banner */}
                <div className="bg-[#121620] border border-white/[0.06] rounded-xl px-4 py-2.5 flex items-center justify-between text-xs font-mono">
                  <span className="text-white/40">Your Production Domain:</span>
                  <span className="text-amber-300 font-semibold truncate max-w-[280px]">
                    https://{desiredSlug || 'your-restaurant'}.dinely.food
                  </span>
                </div>

                {/* 2. Owner Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5 font-mono">
                      Owner Full Name *
                    </label>
                    <div className="relative">
                      <UserIcon size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                      <input
                        type="text"
                        required
                        value={ownerName}
                        onChange={(e) => setOwnerName(e.target.value)}
                        placeholder="e.g. Ayan"
                        className="w-full bg-[#141822] border border-white/[0.08] focus:border-amber-500/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5 font-mono">
                      Owner Email *
                    </label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="owner@example.com"
                        className="w-full bg-[#141822] border border-white/[0.08] focus:border-amber-500/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Password & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5 font-mono">
                      Account Password *
                    </label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 6 characters"
                        className="w-full bg-[#141822] border border-white/[0.08] focus:border-amber-500/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5 font-mono">
                      Contact Phone (Optional)
                    </label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full bg-[#141822] border border-white/[0.08] focus:border-amber-500/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Business Type & Cuisine */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5 font-mono">
                      Business Type
                    </label>
                    <select
                      value={businessType}
                      onChange={(e) => setBusinessType(e.target.value)}
                      className="w-full bg-[#141822] border border-white/[0.08] focus:border-amber-500/60 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none transition-all"
                    >
                      <option value="RESTAURANT">Dine-In Restaurant</option>
                      <option value="CAFE">Cafe & Bakery</option>
                      <option value="BAR">Bar & Pub</option>
                      <option value="FOOD_TRUCK">QSR / Food Truck</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 uppercase tracking-wider mb-1.5 font-mono">
                      Cuisine Style
                    </label>
                    <input
                      type="text"
                      value={cuisine}
                      onChange={(e) => setCuisine(e.target.value)}
                      placeholder="e.g. Italian, Continental, Indian"
                      className="w-full bg-[#141822] border border-white/[0.08] focus:border-amber-500/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={isLoading || slugStatus === 'TAKEN'}
                    className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 font-bold text-sm shadow-xl shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        <span>Provisioning Restaurant Infrastructure...</span>
                      </>
                    ) : (
                      <>
                        <span>Create Restaurant & Claim Subdomain</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full py-4 text-center border-t border-white/[0.06] text-xs text-white/40 font-mono">
        Dinely Cloud SaaS · Multi-Tenant Restaurant OS · Mumbai (ap-south-1)
      </footer>
    </div>
  );
};
