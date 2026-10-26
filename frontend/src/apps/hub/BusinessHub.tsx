import React, { useState, useEffect, useMemo } from 'react';
import {
  UtensilsCrossed,
  Wine,
  Truck,
  Sparkles,
  Plus,
  ArrowRight,
  Building2,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Search,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Users,
  Settings,
  Layers,
  Store,
  ExternalLink,
  Phone,
  RefreshCw,
  X,
} from 'lucide-react';
import { api, realtimeBus } from '../../packages/api/client';
import { Restaurant, User, BusinessType } from '../../packages/types';
import { getTenantUrl, setSharedTenantCookie } from '../../packages/utils/tenantResolver';
import { DinelyLogo, Button, Input } from '../../packages/ui';

interface BusinessHubProps {
  user?: User | null;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
}

interface BusinessHubItem {
  id: string;
  name: string;
  slug: string;
  publicSlug?: string;
  businessType: 'RESTAURANT' | 'BAR' | 'SMALL_CART' | 'WEDDING_EVENT';
  rawBusinessType?: string;
  osType: 'RESTAURANT_OS' | 'BAR_OS' | 'CART_OS' | 'WEDDINGS_OS';
  launchRoute: string;
  lifecycleStatus: string;
  isApproved: boolean;
  status: string;
  address?: string;
  phone?: string;
  hasBar?: boolean;
  hasTables?: boolean;
  hasKitchen?: boolean;
  hasWaiter?: boolean;
  enabledModules?: string[];
  createdAt?: string;
}

const BUSINESS_TYPE_CONFIG = {
  RESTAURANT: {
    label: 'Restaurant',
    tagline: 'Full-Service & Casual Dining',
    description: 'Floorplans, waiter terminals, kitchen KDS, POS ordering, and multi-course dining.',
    osName: 'Restaurant OS',
    icon: UtensilsCrossed,
    colorBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    colorAccent: 'text-emerald-400',
    buttonBg: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    route: '/restaurant/dashboard',
  },
  BAR: {
    label: 'Bar & Lounge',
    tagline: 'Nightlife, Pubs & Mixology',
    description: 'Craft cocktail queue, drink service terminal, open tabs, pour inventory, and beer taps.',
    osName: 'Restaurant & Bar OS',
    icon: Wine,
    colorBadge: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    colorAccent: 'text-violet-400',
    buttonBg: 'bg-violet-600 hover:bg-violet-500 text-white',
    route: '/restaurant/dashboard',
  },
  SMALL_CART: {
    label: 'Small Cart',
    tagline: 'Stalls, Kiosks & Food Carts',
    description: 'High-speed quick-counter POS, compact menus, rapid QR pickup, and zero-table workflows.',
    osName: 'Small Cart OS',
    icon: Truck,
    colorBadge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    colorAccent: 'text-sky-400',
    buttonBg: 'bg-sky-600 hover:bg-sky-500 text-white',
    route: '/cart/dashboard',
  },
  WEDDING_EVENT: {
    label: 'Wedding & Events',
    tagline: 'Banquet Halls & Event Venues',
    description: 'Multi-event timelines, guest table QR codes, banquet course routing, and host billing.',
    osName: 'Wedding & Events OS',
    icon: Sparkles,
    colorBadge: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    colorAccent: 'text-rose-400',
    buttonBg: 'bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white',
    route: '/weddings/dashboard',
  },
};

export const BusinessHub: React.FC<BusinessHubProps> = ({
  user,
  onNavigate,
  onLogout,
}) => {
  const [businesses, setBusinesses] = useState<BusinessHubItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  // Creation Modal State
  const [newBusinessType, setNewBusinessType] = useState<'RESTAURANT' | 'BAR' | 'SMALL_CART' | 'WEDDING_EVENT'>('RESTAURANT');
  const [newBusinessName, setNewBusinessName] = useState<string>('');
  const [newBusinessCity, setNewBusinessCity] = useState<string>('Bengaluru');
  const [newBusinessAddress, setNewBusinessAddress] = useState<string>('');
  const [newBusinessPhone, setNewBusinessPhone] = useState<string>('');
  const [isSubmittingNew, setIsSubmittingNew] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string>('');

  const currentUser = user || api.getCurrentUser();
  const userName = currentUser?.name || currentUser?.firstName || currentUser?.email?.split('@')[0] || 'Operator';

  const loadBusinesses = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const email = currentUser?.email;
      const uid = currentUser?.id;
      const rawList = await api.getHubBusinesses(email, uid);
      const mapped: BusinessHubItem[] = rawList.map((item: any) => {
        let bType: 'RESTAURANT' | 'BAR' | 'SMALL_CART' | 'WEDDING_EVENT' = 'RESTAURANT';
        const raw = String(item.businessType || item.rawBusinessType || 'RESTAURANT').toUpperCase();
        if (raw.includes('CART') || raw.includes('TRUCK')) {
          bType = 'SMALL_CART';
        } else if (raw.includes('WEDDING') || raw.includes('EVENT')) {
          bType = 'WEDDING_EVENT';
        } else if (raw === 'BAR') {
          bType = 'BAR';
        }
        const cfg = BUSINESS_TYPE_CONFIG[bType];
        return {
          id: item.id,
          name: item.name || 'Untitled Business',
          slug: item.slug || item.id,
          publicSlug: item.publicSlug || item.slug,
          businessType: bType,
          rawBusinessType: item.rawBusinessType || bType,
          osType: item.osType || (bType === 'RESTAURANT' || bType === 'BAR' ? 'RESTAURANT_OS' : bType === 'SMALL_CART' ? 'CART_OS' : 'WEDDINGS_OS'),
          launchRoute: item.launchRoute || cfg.route,
          lifecycleStatus: item.lifecycleStatus || (item.isApproved ? 'LIVE' : 'PENDING_APPROVAL'),
          isApproved: Boolean(item.isApproved || item.lifecycleStatus === 'LIVE' || item.lifecycleStatus === 'APPROVED'),
          status: item.status || 'OPEN',
          address: item.address || '',
          phone: item.phone || '',
          hasBar: item.hasBar,
          hasTables: item.hasTables,
          hasKitchen: item.hasKitchen,
          hasWaiter: item.hasWaiter,
          enabledModules: item.enabledModules || [],
          createdAt: item.createdAt,
        };
      });
      setBusinesses(mapped);
    } catch (err: any) {
      console.error('Failed to load businesses for hub:', err);
      setErrorMessage(err?.message || 'Unable to connect to Dinely Cloud Business Hub.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBusinesses();

    const unsub = realtimeBus.subscribe((event: any) => {
      if (['RESTAURANT_APPROVED', 'RESTAURANT_REJECTED', 'RestaurantStatusUpdated'].includes(event.type)) {
        loadBusinesses();
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const handleLaunchOS = async (biz: BusinessHubItem) => {
    setOpeningId(biz.id);
    try {
      await api.switchActiveRestaurant(biz.id);
      api.setCurrentRestaurantId(biz.id);
      if (typeof window !== 'undefined') {
        localStorage.setItem('dinely_active_restaurant_id', biz.id);
        sessionStorage.setItem('dinely_active_restaurant_id', biz.id);
      }

      const targetRoute = biz.launchRoute || BUSINESS_TYPE_CONFIG[biz.businessType]?.route || '/restaurant/dashboard';
      const token =
        (typeof window !== 'undefined'
          ? localStorage.getItem('dinely_auth_token') || sessionStorage.getItem('dinely_auth_token')
          : null) || ((api as any).base?.currentTokensByScope?.['OWNER']?.accessToken ?? null);

      // Persist cross-subdomain shared cookie on .dinely.food
      if (token) {
        setSharedTenantCookie('dinely_auth_token', token);
      }
      setSharedTenantCookie('dinely_active_restaurant_id', biz.id);

      // Determine canonical destination URL for this business
      let targetUrl = getTenantUrl(biz, targetRoute);

      // Attach auth handoff token and bizId
      try {
        const parsed = new URL(targetUrl, typeof window !== 'undefined' ? window.location.origin : 'https://dinely.food');
        if (token) {
          parsed.searchParams.set('auth_token', token);
        }
        parsed.searchParams.set('bizId', biz.id);
        targetUrl = parsed.toString();
      } catch (_) {
        const sep = targetUrl.includes('?') ? '&' : '?';
        targetUrl = `${targetUrl}${sep}bizId=${encodeURIComponent(biz.id)}${token ? `&auth_token=${encodeURIComponent(token)}` : ''}`;
      }

      // Check whether targetUrl is on a different hostname or if running in production
      const currentHost = (typeof window !== 'undefined' ? window.location.hostname : '').toLowerCase();
      let targetHost = currentHost;
      try {
        targetHost = (new URL(targetUrl, window.location.origin)).hostname.toLowerCase();
      } catch (_) {}

      if (currentHost !== targetHost || currentHost.endsWith('.dinely.food')) {
        // ALWAYS do a full browser redirect when switching businesses or when on a tenant subdomain
        window.location.href = targetUrl;
      } else {
        // Local dev on same host
        if (onNavigate) {
          const parsed = new URL(targetUrl, window.location.origin);
          onNavigate(`${parsed.pathname}${parsed.search}`);
        } else {
          window.location.href = targetUrl;
        }
      }
    } catch (e) {
      console.error('Failed to launch OS:', e);
      setOpeningId(null);
    }
  };

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!newBusinessName.trim()) {
      setCreateError('Please enter a business name.');
      return;
    }
    if (!newBusinessAddress.trim() || !newBusinessCity.trim()) {
      setCreateError('Please enter the street address and city.');
      return;
    }

    setIsSubmittingNew(true);
    try {
      const email = currentUser?.email || 'owner@dinely.food';
      const uid = currentUser?.id || 'owner-uid';

      // Cleanly isolated module set per business type
      let modules: string[] = ['billing', 'inventory'];
      let hasTables = true;
      let hasBar = false;
      let hasWaiter = true;
      let hasKitchen = true;

      if (newBusinessType === 'RESTAURANT') {
        modules = ['kitchen', 'waiter', 'inventory', 'billing', 'tables', 'bar'];
        hasBar = true;
      } else if (newBusinessType === 'BAR') {
        modules = ['bar', 'inventory', 'billing', 'tables', 'waiter'];
        hasBar = true;
        hasKitchen = false;
      } else if (newBusinessType === 'SMALL_CART') {
        modules = ['kitchen', 'inventory', 'billing'];
        hasTables = false;
        hasWaiter = false;
      } else if (newBusinessType === 'WEDDING_EVENT') {
        modules = ['weddings', 'kitchen', 'bar', 'hookah', 'tables', 'billing'];
        hasBar = true;
      }

      const created = await api.createRestaurantForOwner({
        name: newBusinessName.trim(),
        businessType: newBusinessType as any,
        hasBar,
        hasTables,
        hasKitchen,
        hasWaiter,
        tableCount: hasTables ? 10 : 0,
        address: `${newBusinessAddress.trim()}, ${newBusinessCity.trim()}`,
        city: newBusinessCity.trim(),
        phone: newBusinessPhone.trim() || '+91 98765 43210',
        email,
        ownerName: userName,
        ownerEmail: email,
        ownerUid: uid,
        enabledModules: modules,
      });

      await api.submitRestaurantLaunch({
        id: created.id,
        restaurantName: newBusinessName.trim(),
        businessType: newBusinessType,
        hasBar,
        hasTables,
        hasKitchen,
        hasWaiter,
        hasInventory: true,
        hasBilling: true,
        enabledModules: modules,
        address: `${newBusinessAddress.trim()}, ${newBusinessCity.trim()}`,
        city: newBusinessCity.trim(),
        country: 'India',
        phone: newBusinessPhone.trim() || '+91 98765 43210',
        email,
        tables: { indoor: hasTables ? 10 : 0, outdoor: 0, vip: 0 },
        totalTablesCount: hasTables ? 10 : 0,
      });

      setIsCreateModalOpen(false);
      setNewBusinessName('');
      setNewBusinessAddress('');
      setNewBusinessPhone('');

      // Refresh list and immediately launch the newly created workspace
      await loadBusinesses();
      await handleLaunchOS({
        id: created.id,
        name: newBusinessName.trim(),
        slug: created.slug || created.id,
        businessType: newBusinessType,
        osType: newBusinessType === 'RESTAURANT' || newBusinessType === 'BAR' ? 'RESTAURANT_OS' : newBusinessType === 'SMALL_CART' ? 'CART_OS' : 'WEDDINGS_OS',
        launchRoute: BUSINESS_TYPE_CONFIG[newBusinessType].route,
        lifecycleStatus: 'PENDING_APPROVAL',
        isApproved: false,
        status: 'OPEN',
      });
    } catch (err: any) {
      console.error('Failed to create business:', err);
      setCreateError(err?.message || 'Failed to create business workspace.');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const filteredBusinesses = useMemo(() => {
    return businesses.filter((b) => {
      const matchesSearch =
        searchQuery === '' ||
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (b.address && b.address.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType =
        selectedTypeFilter === 'ALL' || b.businessType === selectedTypeFilter;
      return matchesSearch && matchesType;
    });
  }, [businesses, searchQuery, selectedTypeFilter]);

  const counts = useMemo(() => {
    return {
      all: businesses.length,
      restaurant: businesses.filter((b) => b.businessType === 'RESTAURANT').length,
      bar: businesses.filter((b) => b.businessType === 'BAR').length,
      cart: businesses.filter((b) => b.businessType === 'SMALL_CART').length,
      weddings: businesses.filter((b) => b.businessType === 'WEDDING_EVENT').length,
    };
  }, [businesses]);

  return (
    <div className="min-h-screen bg-[#07090d] text-slate-100 flex flex-col font-sans selection:bg-[#f97316] selection:text-[#07090d]">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-[#0d1017]/90 backdrop-blur-md border-b border-[#1b202c] px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <DinelyLogo size="sm" />
            <div className="h-5 w-px bg-[#222938]" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded">
                Central Hub
              </span>
              <span className="hidden sm:inline text-xs text-slate-400">
                Multi-Business Control Plane
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold text-xs transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Business</span>
            </button>

            <div className="h-5 w-px bg-[#222938] hidden sm:block" />

            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300">
              <div className="w-7 h-7 rounded-full bg-[#1b202c] border border-[#273043] flex items-center justify-center font-bold text-orange-400 text-xs">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="font-medium max-w-[120px] truncate">{userName}</span>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                title="Sign out of Dinely Cloud"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Hub Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Welcome & Overview Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-[#1b202c] bg-gradient-to-r from-[#11151f] via-[#0d1017] to-[#121622] p-8 shadow-xl">
          <div className="relative z-10 max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#191f2c] border border-[#273147] text-[11px] font-mono text-slate-300">
              <Layers className="w-3.5 h-3.5 text-orange-400" />
              <span>4 Independent Business Operating Systems</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Welcome to DineFlow Business Hub
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Launch and manage your independent business workspaces. Each business type operates on its own dedicated OS with isolated operational terminals, menus, and data.
            </p>
          </div>

          {/* Quick Metrics Counter Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-[#1b202c]">
            <div className="p-3 bg-[#0a0d13]/60 rounded-xl border border-[#1a1f2b]">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Restaurants</span>
              <div className="text-xl font-bold text-emerald-400 mt-0.5">{counts.restaurant}</div>
            </div>
            <div className="p-3 bg-[#0a0d13]/60 rounded-xl border border-[#1a1f2b]">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Bars & Lounges</span>
              <div className="text-xl font-bold text-violet-400 mt-0.5">{counts.bar}</div>
            </div>
            <div className="p-3 bg-[#0a0d13]/60 rounded-xl border border-[#1a1f2b]">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Small Carts</span>
              <div className="text-xl font-bold text-sky-400 mt-0.5">{counts.cart}</div>
            </div>
            <div className="p-3 bg-[#0a0d13]/60 rounded-xl border border-[#1a1f2b]">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Wedding & Events</span>
              <div className="text-xl font-bold text-rose-400 mt-0.5">{counts.weddings}</div>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-[#0d1017] border border-[#1b202c] rounded-xl overflow-x-auto text-xs">
            <button
              onClick={() => setSelectedTypeFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedTypeFilter === 'ALL'
                  ? 'bg-orange-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Workspaces ({counts.all})
            </button>
            <button
              onClick={() => setSelectedTypeFilter('RESTAURANT')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedTypeFilter === 'RESTAURANT'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Restaurants ({counts.restaurant})
            </button>
            <button
              onClick={() => setSelectedTypeFilter('BAR')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedTypeFilter === 'BAR'
                  ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Bars ({counts.bar})
            </button>
            <button
              onClick={() => setSelectedTypeFilter('SMALL_CART')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedTypeFilter === 'SMALL_CART'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Small Carts ({counts.cart})
            </button>
            <button
              onClick={() => setSelectedTypeFilter('WEDDING_EVENT')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
                selectedTypeFilter === 'WEDDING_EVENT'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Wedding & Events ({counts.weddings})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search business name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0d1017] border border-[#1b202c] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Business Grid */}
        {loading ? (
          <div className="p-16 text-center space-y-3 border border-[#1b202c] rounded-2xl bg-[#0d1017]">
            <RefreshCw className="w-6 h-6 animate-spin text-orange-400 mx-auto" />
            <p className="text-xs text-slate-400">Loading authorized businesses...</p>
          </div>
        ) : filteredBusinesses.length === 0 ? (
          <div className="p-16 text-center space-y-4 border border-[#1b202c] rounded-2xl bg-[#0d1017]">
            <div className="w-12 h-12 rounded-xl bg-[#131722] border border-[#1f2637] flex items-center justify-center text-slate-400 mx-auto">
              <Store className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">No businesses found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery || selectedTypeFilter !== 'ALL'
                  ? 'No business matches your current filter criteria.'
                  : "You haven't created any businesses yet. Choose a business type to get started."}
              </p>
            </div>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold text-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Your First Business</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredBusinesses.map((biz) => {
              const config = BUSINESS_TYPE_CONFIG[biz.businessType];
              const Icon = config.icon;
              const isLaunching = openingId === biz.id;

              return (
                <div
                  key={biz.id}
                  onClick={() => handleLaunchOS(biz)}
                  className="rounded-2xl border border-[#1b202c] hover:border-[#2b3346] bg-[#0d1017] p-5 flex flex-col justify-between space-y-5 transition-all shadow-md group relative overflow-hidden cursor-pointer"
                >
                  <div className="space-y-4">
                    {/* Top Row: Type Badge & Status */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold uppercase tracking-wider ${config.colorBadge}`}>
                        <Icon className="w-3.5 h-3.5" />
                        <span>{config.label}</span>
                      </span>

                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                          biz.isApproved
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {biz.isApproved ? 'LIVE' : biz.lifecycleStatus}
                      </span>
                    </div>

                    {/* Business Name & Tagline */}
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-orange-400 transition-colors">
                        {biz.name}
                      </h3>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-1">
                        <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{biz.address || 'Central Venue'}</span>
                      </p>
                    </div>

                    {/* Operational Highlights */}
                    <div className="p-3 bg-[#080a0f] rounded-xl border border-[#171b26] space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="flex items-center gap-1">
                          <Layers className="w-3 h-3 text-slate-500" />
                          <span>Operating System:</span>
                        </span>
                        <span className={`font-mono font-bold ${config.colorAccent}`}>{config.osName}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Modules:</span>
                        <span className="font-mono text-slate-300">
                          {biz.enabledModules?.length || 0} active
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Launch OS Button */}
                  <div className="pt-2">
                    <button
                      onClick={() => handleLaunchOS(biz)}
                      disabled={isLaunching}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer ${config.buttonBg}`}
                    >
                      {isLaunching ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Launching {config.osName}...</span>
                        </>
                      ) : (
                        <>
                          <span>Enter {config.osName}</span>
                          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* "Create New Business" Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#0d1017] border border-[#202737] rounded-2xl shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#1b202c]">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Create Independent Business</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select a business model to provision a dedicated operational workspace.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-[#1b202c] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateBusiness} className="p-6 space-y-6">
              {createError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {/* Step 1: Business Type Cards */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                  Select Business Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(Object.keys(BUSINESS_TYPE_CONFIG) as Array<keyof typeof BUSINESS_TYPE_CONFIG>).map((key) => {
                    const cfg = BUSINESS_TYPE_CONFIG[key];
                    const Icon = cfg.icon;
                    const isSelected = newBusinessType === key;

                    return (
                      <div
                        key={key}
                        onClick={() => setNewBusinessType(key)}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                          isSelected
                            ? 'bg-[#151a24] border-orange-500 ring-1 ring-orange-500 shadow-md'
                            : 'bg-[#090b10] border-[#1b202c] hover:border-[#273044]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`p-2 rounded-lg ${cfg.colorBadge}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          {isSelected && (
                            <span className="text-[10px] font-mono font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded border border-orange-500/20">
                              Selected
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-white text-sm">{cfg.label}</div>
                          <div className="text-[11px] text-slate-400 leading-snug mt-1">{cfg.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Basic Information */}
              <div className="space-y-4 pt-2 border-t border-[#1b202c]">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Business / Venue Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Copper Chimney Bistro or Skyline Cocktail Bar"
                    value={newBusinessName}
                    onChange={(e) => setNewBusinessName(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-[#090b10] border border-[#1b202c] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">City *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Bengaluru"
                      value={newBusinessCity}
                      onChange={(e) => setNewBusinessCity(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs bg-[#090b10] border border-[#1b202c] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-300">Contact Phone</label>
                    <input
                      type="text"
                      placeholder="+91 98765 43210"
                      value={newBusinessPhone}
                      onChange={(e) => setNewBusinessPhone(e.target.value)}
                      className="w-full px-3.5 py-2 text-xs bg-[#090b10] border border-[#1b202c] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-300">Street Address *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 42 MG Road, Indiranagar"
                    value={newBusinessAddress}
                    onChange={(e) => setNewBusinessAddress(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs bg-[#090b10] border border-[#1b202c] rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1b202c]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-slate-950 font-bold text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingNew ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Provisioning OS...</span>
                    </>
                  ) : (
                    <>
                      <span>Launch {BUSINESS_TYPE_CONFIG[newBusinessType].osName}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
