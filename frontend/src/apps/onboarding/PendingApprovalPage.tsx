import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  LogOut,
  Building,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  XCircle,
  MapPin,
  Mail,
  Phone,
  Grid,
  FileText,
  Utensils,
  Check,
  ExternalLink,
  Store,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { api, realtimeBus } from '../../packages/api/client';
import { Restaurant } from '../../packages/types';
import { getTenantUrl } from '../../packages/utils/tenantResolver';
import { Button, Card, Modal, Input, DinelyLogo, Badge, Avatar } from '../../packages/ui';

interface PendingApprovalPageProps {
  restaurantId?: string;
  onNavigate: (path: string) => void;
  onLogout?: () => void;
}

export const PendingApprovalPage: React.FC<PendingApprovalPageProps> = ({
  restaurantId,
  onNavigate,
  onLogout,
}) => {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isResubmitModalOpen, setIsResubmitModalOpen] = useState(false);

  // Resubmit Form State
  const [resubmitName, setResubmitName] = useState('');
  const [resubmitAddress, setResubmitAddress] = useState('');
  const [resubmitCity, setResubmitCity] = useState('');
  const [resubmitPhone, setResubmitPhone] = useState('');
  const [resubmitTables, setResubmitTables] = useState<number>(10);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState('');

  // Current authenticated user context
  const currentUser = api.getCurrentUser('OWNER') || api.getCurrentUser();

  useEffect(() => {
    // Connect to restaurant-specific channel when we know the tenant ID.
    // Never use 'global' — that channel is reserved for Platform Admins only.
    if (restaurantId) {
      realtimeBus.connect(restaurantId, 'OWNER');
    }
    loadRestaurantData();
    const interval = setInterval(() => {
      loadRestaurantDataSilent();
    }, 3000);

    const unsub = realtimeBus.subscribe((event: any) => {
      const evtType = event?.type;
      if (
        evtType === 'RESTAURANT_APPROVED' ||
        evtType === 'RestaurantStatusUpdated' ||
        evtType === 'RESTAURANT_REJECTED' ||
        evtType === 'RestaurantRegistrationSubmitted' ||
        evtType === 'RESTAURANT_DISMISSED'
      ) {
        const evtRestId = event.restaurantId || event.restaurant_id;
        if (!restaurantId || !evtRestId || evtRestId === restaurantId || (restaurant && evtRestId === restaurant.id)) {
          loadRestaurantDataSilent();
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [restaurantId]);

  useEffect(() => {
    if (
      restaurant &&
      (restaurant.isApproved ||
        restaurant.lifecycleStatus === 'APPROVED' ||
        restaurant.lifecycleStatus === 'LIVE' ||
        restaurant.lifecycleStatus === 'ACTIVE')
    ) {
      const timer = setTimeout(() => {
        window.location.href = getTenantUrl(restaurant, '/restaurant/dashboard');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [restaurant, onNavigate]);

  const loadRestaurantData = async () => {
    setIsLoading(true);
    try {
      const rest = await api.getRestaurantDetails(restaurantId);
      setRestaurant(rest);
      if (rest) {
        setResubmitName(rest.name || '');
        setResubmitAddress(rest.address || '');
        setResubmitCity(rest.city || 'Mumbai');
        setResubmitPhone(rest.phone || '');
        setResubmitTables(rest.tablesCount || rest.indoorTablesCount || 10);
      }
    } catch (err) {
      console.error('Failed to load restaurant details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRestaurantDataSilent = async () => {
    try {
      const rest = await api.getRestaurantDetails(restaurantId);
      if (rest) {
        setRestaurant(rest);
      }
    } catch (e) {}
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const rest = await api.getRestaurantDetails(restaurantId);
      setRestaurant(rest);
      if (
        rest &&
        (rest.isApproved ||
          rest.lifecycleStatus === 'APPROVED' ||
          rest.lifecycleStatus === 'LIVE' ||
          rest.lifecycleStatus === 'ACTIVE')
      ) {
        window.location.href = getTenantUrl(rest, '/restaurant/dashboard');
      }
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    if (onLogout) {
      onLogout();
    } else {
      onNavigate('/restaurant/login');
    }
  };

  const handleResubmitApplication = async () => {
    if (!restaurant) return;
    setResubmitError('');
    setIsResubmitting(true);

    try {
      const updated = await api.submitRestaurantLaunch({
        id: restaurant.id,
        restaurantName: resubmitName,
        address: resubmitAddress,
        city: resubmitCity,
        phone: resubmitPhone,
        totalTablesCount: resubmitTables,
      });

      setRestaurant(updated);
      setIsResubmitting(false);
      setIsResubmitModalOpen(false);
    } catch (err: any) {
      setIsResubmitting(false);
      setResubmitError(err.message || 'Failed to resubmit application.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="text-center space-y-4">
          <div className="relative w-12 h-12 mx-auto">
            <div className="w-12 h-12 border-2 border-white/[0.08] border-t-amber-400 rounded-full animate-spin" />
          </div>
          <p className="text-xs text-white/50 font-mono tracking-wider uppercase">Loading application status...</p>
        </div>
      </div>
    );
  }

  const isApproved =
    restaurant?.isApproved ||
    restaurant?.lifecycleStatus === 'APPROVED' ||
    restaurant?.lifecycleStatus === 'LIVE' ||
    restaurant?.lifecycleStatus === 'ACTIVE';

  const isRejected =
    restaurant?.lifecycleStatus === 'REJECTED' ||
    restaurant?.lifecycleStatus === 'CHANGES_REQUESTED';

  const restLogo =
    restaurant?.theme?.logo ||
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&auto=format&fit=crop&q=80';

  const restName = restaurant?.name || 'Your Restaurant';
  const appId = restaurant?.id
    ? restaurant.id.replace(/^rest-/, 'APP-').slice(0, 8).toUpperCase()
    : 'APP-1790';

  // Format submission date if available
  const formattedDate = (() => {
    const rawDate = (restaurant as any)?.submittedAt || (restaurant as any)?.createdAt;
    if (!rawDate) return 'Today';
    try {
      const d = new Date(rawDate);
      return isNaN(d.getTime()) ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Today';
    }
  })();

  const ownerDisplayName = currentUser?.name || restaurant?.ownerName || 'Restaurant Owner';
  const ownerDisplayEmail = currentUser?.email || restaurant?.ownerEmail || '';

  return (
    <div className="min-h-screen w-full bg-[#0b0d11] text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950 font-sans antialiased relative overflow-x-hidden">
      {/* Ambient Radial Glow Lighting */}
      <div
        className="absolute top-12 left-1/2 -translate-x-1/2 w-[800px] sm:w-[1100px] h-[450px] bg-gradient-to-tr from-amber-500/10 via-rose-600/10 to-indigo-600/10 blur-[160px] rounded-full pointer-events-none -z-0"
        aria-hidden="true"
      />

      {/* 1. TOP NAVIGATION */}
      <header className="sticky top-0 z-40 w-full bg-[#0b0d11]/85 backdrop-blur-xl border-b border-white/[0.08] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          {/* Left: Dinely Logo + Brand */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="flex items-center cursor-pointer bg-transparent border-none text-white hover:opacity-90 transition-opacity"
              aria-label="Dinely Home"
            >
              <DinelyLogo size="md" />
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium text-white/50 bg-white/[0.04] border border-white/[0.08]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
              Tenant Onboarding
            </span>
          </div>

          {/* Right: Authenticated User & Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => onNavigate('/workspace')}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
            >
              <Store className="w-3.5 h-3.5" />
              <span>All Restaurants</span>
            </button>

            {/* User Profile Pill */}
            <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-white/[0.08]">
              <div className="relative">
                <Avatar
                  name={ownerDisplayName}
                  src={currentUser?.avatar}
                  size="sm"
                  className="ring-1 ring-white/20"
                />
              </div>
              <div className="hidden sm:block text-left max-w-[130px] md:max-w-[170px] truncate">
                <p className="text-xs font-semibold text-white/90 truncate leading-tight">{ownerDisplayName}</p>
                {ownerDisplayEmail && (
                  <p className="text-[10px] text-white/40 font-mono truncate leading-tight">{ownerDisplayEmail}</p>
                )}
              </div>
            </div>

            {/* Logout Action */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-white/60 hover:text-rose-400 hover:bg-rose-500/10 px-2.5 py-1.5 rounded-xl border border-transparent hover:border-rose-500/20"
              title="Sign out"
              icon={<LogOut className="w-4 h-4" />}
            >
              <span className="hidden sm:inline text-xs">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 z-10 flex flex-col space-y-8">
        
        {/* 2. MAIN HERO AREA */}
        <div className="text-center space-y-3 pt-2 sm:pt-4">
          {/* Subtle Review Badge */}
          <div className="inline-flex items-center justify-center">
            {isApproved ? (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-medium tracking-wide shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                APPLICATION APPROVED
              </span>
            ) : isRejected ? (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs font-medium tracking-wide shadow-sm">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                ACTION REQUIRED
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-medium tracking-wide shadow-sm">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                APPLICATION UNDER REVIEW
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-[-0.02em] text-white">
            {isApproved
              ? 'Your restaurant is ready to go live'
              : isRejected
              ? 'Application requires attention'
              : 'Your restaurant is under review'}
          </h1>

          <p className="text-sm sm:text-base text-white/70 max-w-2xl mx-auto leading-relaxed">
            {isApproved
              ? 'Your restaurant has been verified and your custom domain workspace is activated.'
              : isRejected
              ? 'Our verification team reviewed your details and requested a few updates before activation.'
              : "Our team is reviewing your restaurant application. We'll let you know as soon as your restaurant is ready to go live."}
          </p>
        </div>

        {/* 3 & 7. RESTAURANT APPLICATION CARD & PREVIEW */}
        <div className="bg-[#0e1117]/85 backdrop-blur-xl border border-white/[0.08] rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden space-y-8">
          
          {/* Restaurant Header & Status Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6 border-b border-white/[0.08]">
            {/* Left: Compact Restaurant Preview */}
            <div className="flex items-center gap-4 sm:gap-5 min-w-0">
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-slate-800 border border-white/[0.12] shadow-lg shrink-0 flex items-center justify-center">
                <img
                  src={restLogo}
                  alt={restName}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                    {restName}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
                  <span className="font-mono font-medium text-white/80">Application #{appId}</span>
                  <span className="text-white/20 hidden sm:inline">•</span>
                  <span>Submitted on {formattedDate}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-white/50">
                  {restaurant?.city && (
                    <span className="inline-flex items-center gap-1 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.06]">
                      <MapPin className="w-3 h-3 text-white/40" />
                      {restaurant.city}
                    </span>
                  )}
                  {(restaurant?.cuisine || restaurant?.businessType) && (
                    <span className="inline-flex items-center gap-1 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.06]">
                      <Utensils className="w-3 h-3 text-white/40" />
                      {restaurant.cuisine || restaurant.businessType}
                    </span>
                  )}
                  {(restaurant?.tablesCount || restaurant?.indoorTablesCount) && (
                    <span className="inline-flex items-center gap-1 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.06]">
                      <Grid className="w-3 h-3 text-white/40" />
                      {restaurant.tablesCount || restaurant.indoorTablesCount} Tables
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Status Badge */}
            <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-2 shrink-0">
              <span className="text-[11px] uppercase tracking-wider font-mono text-white/40 font-semibold hidden sm:block">
                Application Status
              </span>
              {isApproved ? (
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Approved & Live</span>
                </span>
              ) : isRejected ? (
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Changes Requested</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
                  </span>
                  <span>Under Review</span>
                </span>
              )}
            </div>
          </div>

          {/* 4. APPLICATION PROGRESS COMPONENT */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-mono text-white/50 font-bold">
                Application Progress
              </span>
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/90 transition-colors disabled:opacity-50"
                title="Refresh application status"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
                <span className="hidden sm:inline">Check status</span>
              </button>
            </div>

            {/* Desktop Horizontal Stepper */}
            <div className="hidden md:flex items-center justify-between relative py-2">
              {/* Step 1: Account created */}
              <div className="flex items-center gap-3 z-10">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-xs shadow-sm">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-white">Account created</p>
                  <p className="text-[11px] text-white/40">Verified & authorized</p>
                </div>
              </div>

              {/* Connecting Track 1 -> 2 */}
              <div className="flex-1 h-0.5 mx-4 bg-emerald-500/40 rounded-full" />

              {/* Step 2: Restaurant submitted */}
              <div className="flex items-center gap-3 z-10">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-xs shadow-sm">
                  <Check className="w-4 h-4 stroke-[3]" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-white">Restaurant submitted</p>
                  <p className="text-[11px] text-white/40">Application received</p>
                </div>
              </div>

              {/* Connecting Track 2 -> 3 */}
              <div
                className={`flex-1 h-0.5 mx-4 rounded-full ${
                  isApproved
                    ? 'bg-emerald-500/40'
                    : isRejected
                    ? 'bg-rose-500/40'
                    : 'bg-gradient-to-r from-emerald-500/40 via-amber-500/50 to-amber-500/30'
                }`}
              />

              {/* Step 3: Dinely review */}
              <div className="flex items-center gap-3 z-10">
                {isApproved ? (
                  <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-xs shadow-sm">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                ) : isRejected ? (
                  <div className="w-9 h-9 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center font-bold text-xs shadow-sm">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="relative w-9 h-9 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold text-xs ring-4 ring-amber-500/10 shadow-lg shadow-amber-500/15">
                    <Clock className="w-4 h-4 animate-spin-slow" />
                  </div>
                )}
                <div className="text-left">
                  <p
                    className={`text-xs font-semibold ${
                      isApproved
                        ? 'text-white'
                        : isRejected
                        ? 'text-rose-300'
                        : 'text-amber-300'
                    }`}
                  >
                    Dinely review
                  </p>
                  <p className="text-[11px] text-white/40">
                    {isApproved
                      ? 'Review complete'
                      : isRejected
                      ? 'Action needed'
                      : 'In progress'}
                  </p>
                </div>
              </div>

              {/* Connecting Track 3 -> 4 */}
              <div
                className={`flex-1 h-0.5 mx-4 rounded-full ${
                  isApproved ? 'bg-emerald-500/40' : 'bg-white/[0.08]'
                }`}
              />

              {/* Step 4: Restaurant activated */}
              <div className="flex items-center gap-3 z-10">
                {isApproved ? (
                  <div className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-lg shadow-emerald-500/30">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-full bg-white/[0.04] text-white/30 border border-white/[0.08] flex items-center justify-center font-medium text-xs">
                    4
                  </div>
                )}
                <div className="text-left">
                  <p
                    className={`text-xs font-semibold ${
                      isApproved ? 'text-emerald-300 font-bold' : 'text-white/40'
                    }`}
                  >
                    Restaurant activated
                  </p>
                  <p className="text-[11px] text-white/30">
                    {isApproved ? 'Live on web' : 'Ready for launch'}
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile Vertical Stepper */}
            <div className="md:hidden flex flex-col space-y-4 pt-2">
              {/* Step 1 */}
              <div className="flex items-start gap-3 relative">
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div className="flex-1 pb-3 border-b border-white/[0.06]">
                  <p className="text-xs font-semibold text-white">Account created</p>
                  <p className="text-[11px] text-white/40">Verified & authorized</p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex items-start gap-3 relative">
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
                <div className="flex-1 pb-3 border-b border-white/[0.06]">
                  <p className="text-xs font-semibold text-white">Restaurant submitted</p>
                  <p className="text-[11px] text-white/40">Application received</p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex items-start gap-3 relative">
                {isApproved ? (
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                ) : isRejected ? (
                  <div className="w-7 h-7 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ring-2 ring-amber-500/20">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="flex-1 pb-3 border-b border-white/[0.06]">
                  <p
                    className={`text-xs font-semibold ${
                      isApproved
                        ? 'text-white'
                        : isRejected
                        ? 'text-rose-300'
                        : 'text-amber-300'
                    }`}
                  >
                    Dinely review
                  </p>
                  <p className="text-[11px] text-white/40">
                    {isApproved
                      ? 'Review complete'
                      : isRejected
                      ? 'Action needed'
                      : 'In progress'}
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex items-start gap-3 relative">
                {isApproved ? (
                  <div className="w-7 h-7 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-white/[0.04] text-white/30 border border-white/[0.08] flex items-center justify-center font-medium text-xs shrink-0 mt-0.5">
                    4
                  </div>
                )}
                <div className="flex-1">
                  <p
                    className={`text-xs font-semibold ${
                      isApproved ? 'text-emerald-300' : 'text-white/40'
                    }`}
                  >
                    Restaurant activated
                  </p>
                  <p className="text-[11px] text-white/30">
                    {isApproved ? 'Live on web' : 'Ready for launch'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 5. REVIEW STATUS PANEL */}
          {isApproved ? (
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-white">Application Approved & Activated</h3>
                  <p className="text-xs text-emerald-200/80 leading-relaxed">
                    Your restaurant workspace, digital menus, QR tables, Waiter OS, and Kitchen KDS are now active and ready.
                  </p>
                </div>
              </div>
              <Button
                variant="brand"
                size="md"
                onClick={() => {
                  window.location.href = getTenantUrl(restaurant, '/restaurant/dashboard');
                }}
                className="w-full sm:w-auto shrink-0 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950/50"
                icon={<ArrowRight className="w-4 h-4 ml-1" />}
              >
                Launch Restaurant OS
              </Button>
            </div>
          ) : isRejected ? (
            <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-5 sm:p-6 space-y-3.5">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Feedback & Required Changes</h3>
                  <p className="text-xs text-rose-200/80 leading-relaxed">
                    Our verification team noted the following feedback for your restaurant application:
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-black/40 border border-rose-500/20 rounded-xl text-xs text-rose-200 font-mono">
                "{restaurant?.rejectionReason || 'Please verify business details, address, and table configuration.'}"
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <p className="text-xs text-white/50">
                  Update your business information and resubmit for immediate review.
                </p>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => setIsResubmitModalOpen(true)}
                  className="w-full sm:w-auto shrink-0 bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold text-xs"
                  icon={<RotateCcw className="w-3.5 h-3.5 mr-1" />}
                >
                  Resubmit Application
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-white">Application received</h3>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Your restaurant details have been successfully submitted. Our team is currently reviewing your application.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400 font-mono">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <span>Real-time sync active</span>
                </div>
              </div>
            </div>
          )}

          {/* 6. WHAT HAPPENS NEXT */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs uppercase tracking-wider font-mono text-white/50 font-bold">
              What happens next
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Step 01 */}
              <div className="bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl p-4 sm:p-5 transition-colors space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-white/30">01</span>
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                </div>
                <h4 className="text-xs font-bold text-white">Application review</h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Our onboarding team checks menu, configuration, and compliance details.
                </p>
              </div>

              {/* Step 02 */}
              <div className="bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl p-4 sm:p-5 transition-colors space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-white/30">02</span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                  </div>
                </div>
                <h4 className="text-xs font-bold text-white">Restaurant approval</h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Once verified, your custom tenant domain and OS terminals are provisioned.
                </p>
              </div>

              {/* Step 03 */}
              <div className="bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl p-4 sm:p-5 transition-colors space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold text-white/30">03</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                </div>
                <h4 className="text-xs font-bold text-white">Restaurant goes live</h4>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Digital menus, QR tables, Waiter OS, and Kitchen KDS become instantly accessible.
                </p>
              </div>
            </div>
          </div>

          {/* 8. ACTION AREA */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-white/[0.08]">
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <Button
                variant="outline"
                size="md"
                onClick={() => onNavigate('/workspace')}
                className="w-full sm:w-auto text-xs font-medium border-white/[0.1] text-white/80 hover:text-white hover:bg-white/[0.06]"
              >
                ← Back to Dinely
              </Button>

              <Button
                variant="secondary"
                size="md"
                onClick={() => setIsDetailsModalOpen(true)}
                className="w-full sm:w-auto text-xs font-medium bg-white/[0.06] border-white/[0.08] hover:bg-white/[0.1]"
                icon={<Building className="w-3.5 h-3.5 mr-1" />}
              >
                View Submitted Info
              </Button>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              {isApproved && (
                <Button
                  variant="brand"
                  size="md"
                  onClick={() => {
                    window.location.href = getTenantUrl(restaurant, '/restaurant/dashboard');
                  }}
                  className="w-full sm:w-auto text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                  icon={<ArrowRight className="w-3.5 h-3.5 ml-1" />}
                >
                  Open Restaurant OS
                </Button>
              )}

              {isRejected && (
                <Button
                  variant="brand"
                  size="md"
                  onClick={() => setIsResubmitModalOpen(true)}
                  className="w-full sm:w-auto text-xs font-bold bg-gradient-to-r from-rose-600 to-amber-500 text-white"
                  icon={<RotateCcw className="w-3.5 h-3.5 mr-1" />}
                >
                  Resubmit Application
                </Button>
              )}

              <Button
                variant="ghost"
                size="md"
                onClick={handleLogout}
                className="w-full sm:w-auto text-xs text-white/50 hover:text-rose-400 hover:bg-rose-500/10"
                icon={<LogOut className="w-3.5 h-3.5" />}
              >
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* SUBMITTED SETUP DETAILS MODAL */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={`Submitted Application Details`}
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-center gap-3 text-amber-200">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="font-bold text-amber-300">Under Onboarding Review</p>
              <p className="text-[11px] text-amber-200/80">Submitted on {formattedDate}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-white/[0.03] rounded-xl border border-white/[0.08] space-y-1">
              <span className="text-[10px] text-white/40 uppercase font-mono font-semibold">Restaurant Name</span>
              <p className="font-bold text-white text-sm">{restName}</p>
            </div>
            <div className="p-3.5 bg-white/[0.03] rounded-xl border border-white/[0.08] space-y-1">
              <span className="text-[10px] text-white/40 uppercase font-mono font-semibold">Application ID</span>
              <p className="font-mono font-bold text-amber-400 text-sm">#{appId}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 bg-white/[0.03] rounded-xl border border-white/[0.08] space-y-1">
              <span className="text-[10px] text-white/40 uppercase font-mono font-semibold">Type & Cuisine</span>
              <p className="font-bold text-white text-xs mt-0.5">
                {restaurant?.businessType || restaurant?.cuisine || 'Restaurant'}
              </p>
            </div>
            <div className="p-3.5 bg-white/[0.03] rounded-xl border border-white/[0.08] space-y-1">
              <span className="text-[10px] text-white/40 uppercase font-mono font-semibold">Total Tables</span>
              <p className="font-bold text-emerald-400 text-xs mt-0.5">
                {restaurant?.tablesCount || restaurant?.indoorTablesCount || 10} Tables Configured
              </p>
            </div>
          </div>

          <div className="p-3.5 bg-white/[0.03] rounded-xl border border-white/[0.08] space-y-1.5">
            <span className="text-[10px] text-white/40 uppercase font-mono font-semibold block">Location & Contact</span>
            <p className="font-medium text-white">{restaurant?.address || 'Address provided'}</p>
            <p className="text-[11px] text-white/50">
              {restaurant?.city && `${restaurant.city} • `}
              {ownerDisplayName} • {ownerDisplayEmail}
              {restaurant?.phone && ` • ${restaurant.phone}`}
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDetailsModalOpen(false)}
              className="text-xs border-white/[0.1] text-white/70"
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* RESUBMIT APPLICATION MODAL */}
      <Modal
        isOpen={isResubmitModalOpen}
        onClose={() => setIsResubmitModalOpen(false)}
        title="Resubmit Restaurant Application"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          {resubmitError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold">
              {resubmitError}
            </div>
          )}

          <Input
            label="Restaurant Name *"
            value={resubmitName}
            onChange={(e) => setResubmitName(e.target.value)}
          />
          <Input
            label="Street Address *"
            value={resubmitAddress}
            onChange={(e) => setResubmitAddress(e.target.value)}
          />
          <Input
            label="City *"
            value={resubmitCity}
            onChange={(e) => setResubmitCity(e.target.value)}
          />
          <Input
            label="Contact Phone Number *"
            value={resubmitPhone}
            onChange={(e) => setResubmitPhone(e.target.value)}
          />
          <div>
            <label className="text-xs font-bold text-white/70 block mb-1">Total Tables Count *</label>
            <input
              type="number"
              min={1}
              max={100}
              value={resubmitTables}
              onChange={(e) => setResubmitTables(parseInt(e.target.value) || 10)}
              className="w-full px-3 py-2 bg-[#0e1117] border border-white/[0.1] rounded-xl text-white text-sm font-bold focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsResubmitModalOpen(false)}
              disabled={isResubmitting}
              className="text-xs border-white/[0.08] text-white/60"
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={handleResubmitApplication}
              isLoading={isResubmitting}
              className="text-xs font-bold px-5 py-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
            >
              Confirm Resubmission →
            </Button>
          </div>
        </div>
      </Modal>

      {/* FOOTER */}
      <footer className="w-full border-t border-white/[0.06] bg-[#07090c] py-8 mt-auto z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <div className="flex items-center gap-2">
            <DinelyLogo size="xs" />
            <span>&copy; {new Date().getFullYear()} Dinely. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="hover:text-white transition-colors bg-transparent border-none cursor-pointer text-white/40"
            >
              Home
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/workspace')}
              className="hover:text-white transition-colors bg-transparent border-none cursor-pointer text-white/40"
            >
              My Workspace
            </button>
            <a
              href="mailto:support@dinely.food"
              className="hover:text-white transition-colors text-white/40"
            >
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
