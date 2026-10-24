import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Truck,
  ShoppingBag,
  Search,
  Plus,
  Minus,
  CheckCircle2,
  Clock,
  QrCode,
  AlertCircle,
  Sparkles,
  Ticket,
  ChevronRight,
  ArrowLeft,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Phone,
  User,
  RefreshCw,
  Copy,
  Check,
  Flame,
  Leaf,
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { Restaurant, Order, MenuItem } from '../../packages/types';
import { DinelyLogo, Button } from '../../packages/ui';
import { realtimeBus } from '../../packages/api/realtime';

import { getTenantFromHostname } from '../../packages/utils/tenantResolver';

interface CartCustomerAppProps {
  business?: Restaurant | null;
  onNavigateStaff?: () => void;
}

export const CartCustomerApp: React.FC<CartCustomerAppProps> = ({
  business: propBusiness,
  onNavigateStaff,
}) => {
  const [business, setBusiness] = useState<Restaurant | null>(propBusiness || null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoadingMenu, setIsLoadingMenu] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');

  // Basket State: { item: MenuItem, quantity: number, notes?: string }
  const [basket, setBasket] = useState<Array<{ item: MenuItem; quantity: number; notes?: string }>>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Customer Checkout Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Confirmed Order State
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Load business & menu
  const targetRestId = business?.id || api.getCurrentRestaurantId() || '';

  const fetchMenu = useCallback(async (restId: string) => {
    if (!restId) return;
    try {
      setIsLoadingMenu(true);
      setMenuError(null);
      const items = await api.getMenuItems(restId);
      if (Array.isArray(items)) {
        setMenuItems(items);
      }
    } catch (err: any) {
      console.warn('Failed to load menu items:', err);
      setMenuError(err?.message || 'Could not load menu items. Please check connection.');
    } finally {
      setIsLoadingMenu(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      if (!business) {
        try {
          const domainRes = getTenantFromHostname();
          if (domainRes.isTenantSubdomain && domainRes.slug) {
            const r = await api.resolveRestaurantBySlug(domainRes.slug);
            if (r) {
              setBusiness(r);
              fetchMenu(r.id);
              return;
            }
          }
          const currId = api.getCurrentRestaurantId();
          if (currId) {
            const r = await api.getRestaurantDetails(currId);
            if (r) {
              setBusiness(r);
              fetchMenu(r.id);
              return;
            }
          }
        } catch (e) {
          console.warn('Could not resolve cart tenant:', e);
        }
      } else {
        fetchMenu(business.id);
      }
    }
    init();
  }, [business?.id, fetchMenu]);

  // Subscribe to realtime updates for stock and live order status
  useEffect(() => {
    if (!targetRestId) return;

    realtimeBus.connect(targetRestId, 'CUSTOMER');

    const unsubscribe = realtimeBus.subscribe((evt: any) => {
      const p = evt.payload || evt.data || evt;
      const evtRestId = p.restaurantId || p.restaurant_id || evt.restaurantId;
      if (evtRestId && evtRestId !== targetRestId) return;

      if (
        evt.type === 'menu_item_created' ||
        evt.type === 'menu_item_updated' ||
        evt.type === 'menu_item_deleted' ||
        evt.type === 'stock_update'
      ) {
        fetchMenu(targetRestId);
      }

      if (confirmedOrder) {
        const orderId = p.orderId || p.id || evt.orderId;
        if (orderId === confirmedOrder.id) {
          if (evt.type === 'order_updated' || evt.type === 'order_status_updated' || evt.type === 'order_redeemed') {
            setConfirmedOrder((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                status: p.status || prev.status,
                pickupStatus: p.pickupStatus || (p.pickup_status) || prev.pickupStatus,
                claimedAt: p.claimedAt || (p.claimed_at) || prev.claimedAt,
              };
            });
          }
        }
      }
    });

    return () => unsubscribe();
  }, [targetRestId, confirmedOrder, fetchMenu]);

  // Polling fallback when an order is actively waiting for pickup
  useEffect(() => {
    if (!confirmedOrder || !targetRestId || confirmedOrder.pickupStatus === 'REDEEMED') return;

    const interval = setInterval(async () => {
      try {
        const lookup = await api.lookupOrderPickupCode(targetRestId, confirmedOrder.pickupCode || confirmedOrder.id);
        if (lookup && lookup.id === confirmedOrder.id) {
          setConfirmedOrder(lookup);
        }
      } catch (e) {
        // Silent catch for background poll
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [confirmedOrder?.id, confirmedOrder?.pickupStatus, targetRestId]);

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach((item) => {
      const cat = (item as any).categoryName || (item as any).category || item.categoryId;
      if (cat && typeof cat === 'string') set.add(cat.trim());
    });
    return Array.from(set).sort();
  }, [menuItems]);

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      // 1. Availability filter: show available or display as out of stock
      // 2. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesDesc = (item.description || '').toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      // 3. Category
      if (selectedCategory !== 'ALL') {
        const cat = (item as any).categoryName || (item as any).category || item.categoryId;
        if (cat !== selectedCategory) return false;
      }
      // 4. Dietary
      if (dietaryFilter === 'VEG' && item.isVegetarian === false) return false;
      if (dietaryFilter === 'NON_VEG' && item.isVegetarian !== false) return false;

      return true;
    });
  }, [menuItems, searchQuery, selectedCategory, dietaryFilter]);

  // Basket Calculations
  const basketTotal = useMemo(() => {
    return basket.reduce((acc, curr) => acc + curr.item.price * curr.quantity, 0);
  }, [basket]);

  const basketCount = useMemo(() => {
    return basket.reduce((acc, curr) => acc + curr.quantity, 0);
  }, [basket]);

  const handleAddToBasket = (item: MenuItem) => {
    if (item.isAvailable === false || (typeof item.stockQuantity === 'number' && item.stockQuantity <= 0)) {
      return;
    }
    setBasket((prev) => {
      const existing = prev.find((i) => i.item.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setBasket((prev) => {
      return prev
        .map((i) => {
          if (i.item.id === itemId) {
            const newQ = i.quantity + delta;
            return newQ > 0 ? { ...i, quantity: newQ } : null;
          }
          return i;
        })
        .filter(Boolean) as Array<{ item: MenuItem; quantity: number; notes?: string }>;
    });
  };

  // Submit Order via real backend API
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (basket.length === 0 || isSubmitting) return;

    if (!customerName.trim()) {
      setSubmitError('Please enter your name for pickup identification.');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const clientOrderId = `ord-cart-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const orderPayload: Partial<Order> = {
        id: clientOrderId,
        restaurantId: targetRestId,
        tableNumber: 'PICKUP',
        orderType: 'TAKEAWAY',
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        notes: orderNotes.trim() || undefined,
        paymentStatus: 'UNPAID',
        paymentMethod: paymentMethod,
        totalAmount: basketTotal,
        items: basket.map((b) => ({
          id: `oi-${b.item.id}-${Date.now()}`,
          menuItemId: b.item.id,
          name: b.item.name,
          quantity: b.quantity,
          price: b.item.price,
          targetDestination: 'KITCHEN',
          specialInstructions: b.notes,
        })),
        idempotencyKey: clientOrderId,
      };

      const created = await api.createOrder(orderPayload);
      setConfirmedOrder(created);
      setBasket([]);
      setIsCheckoutOpen(false);
    } catch (err: any) {
      console.error('Order submission error:', err);
      setSubmitError(err?.message || 'Failed to submit order. Please try again or ask counter staff.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = () => {
    if (!confirmedOrder?.pickupCode) return;
    navigator.clipboard?.writeText(confirmedOrder.pickupCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const cartName = business?.name || 'MAX KART';

  // -------------------------------------------------------------
  // VIEW: CONFIRMATION / PICKUP COUPON VOUCHER SCREEN
  // -------------------------------------------------------------
  if (confirmedOrder) {
    const isRedeemed = confirmedOrder.pickupStatus === 'REDEEMED' || confirmedOrder.status === 'COMPLETED';
    const pickupCode = confirmedOrder.pickupCode || confirmedOrder.displayOrderNumber || `#${confirmedOrder.id.slice(-4).toUpperCase()}`;

    return (
      <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between p-4 sm:p-6 font-sans antialiased selection:bg-amber-500 selection:text-black">
        {/* Header */}
        <header className="max-w-md w-full mx-auto flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide">{cartName}</h1>
              <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Digital Pickup Ticket
              </span>
            </div>
          </div>
          <button
            onClick={() => setConfirmedOrder(null)}
            className="text-xs px-3 py-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-slate-300 transition-all font-medium border border-slate-700/50"
          >
            New Order
          </button>
        </header>

        {/* Main Content */}
        <main className="max-w-md w-full mx-auto my-auto py-6 space-y-6">
          {/* Coupon Ticket Box */}
          <div className="relative rounded-3xl bg-gradient-to-b from-[#131722] to-[#0c0f17] border border-amber-500/30 p-6 sm:p-8 text-center shadow-2xl overflow-hidden">
            {/* Background Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Your Counter Pickup Coupon
              </span>
              <p className="text-xs text-slate-500">Show this code at the cart counter to collect food</p>
            </div>

            {/* Huge Prominent Voucher Code */}
            <div className="my-5 p-5 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-amber-500/15 border-2 border-dashed border-amber-500/50 rounded-2xl relative">
              <div className="text-4xl sm:text-5xl font-black tracking-widest font-mono text-amber-400 drop-shadow-md">
                {pickupCode}
              </div>

              <button
                onClick={handleCopyCode}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-all"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            {/* Status Indicator */}
            <div className="space-y-3">
              <div className={`p-3 rounded-2xl border text-xs font-semibold flex items-center justify-center gap-2 ${
                isRedeemed
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : confirmedOrder.status === 'PREPARING'
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-400 animate-pulse'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}>
                {isRedeemed ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Order Collected & Completed! Enjoy your meal.</span>
                  </>
                ) : confirmedOrder.status === 'PREPARING' ? (
                  <>
                    <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />
                    <span>In Kitchen • Fresh Food Being Cooked</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>Order Received • Waiting for Counter Pickup</span>
                  </>
                )}
              </div>

              {/* Progress Stepper */}
              <div className="grid grid-cols-3 gap-2 pt-2 text-[10px] text-center font-bold uppercase tracking-wider">
                <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex flex-col items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Received</span>
                </div>
                <div className={`p-2 rounded-xl border flex flex-col items-center gap-1 ${
                  isRedeemed || confirmedOrder.status === 'PREPARING'
                    ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                    : 'bg-slate-800/40 text-slate-500 border-slate-700/30'
                }`}>
                  <RefreshCw className={`w-3.5 h-3.5 ${confirmedOrder.status === 'PREPARING' ? 'animate-spin' : ''}`} />
                  <span>Cooking</span>
                </div>
                <div className={`p-2 rounded-xl border flex flex-col items-center gap-1 ${
                  isRedeemed
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-800/40 text-slate-500 border-slate-700/30'
                }`}>
                  <Ticket className="w-3.5 h-3.5" />
                  <span>{isRedeemed ? 'Claimed' : 'Pickup'}</span>
                </div>
              </div>
            </div>

            {/* Order Items Breakdown */}
            <div className="mt-6 pt-5 border-t border-slate-800 text-left space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Order Summary</span>
              <div className="space-y-1.5 text-xs text-slate-300">
                {confirmedOrder.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center py-0.5">
                    <span className="truncate">
                      <span className="font-bold text-white">{it.quantity}x</span> {it.name}
                    </span>
                    <span className="font-mono text-slate-400">₹{(it.price * it.quantity).toFixed(0)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 flex justify-between items-center border-t border-slate-800/60 font-bold text-sm text-white">
                <span>Total Amount</span>
                <span className="text-amber-400 font-mono">₹{confirmedOrder.totalAmount?.toFixed(0) || basketTotal}</span>
              </div>
            </div>

            {/* Customer Details info */}
            <div className="mt-4 p-3 bg-slate-900/60 rounded-xl text-left text-[11px] text-slate-400 flex items-center justify-between">
              <div>
                <span className="text-slate-500">Customer:</span>{' '}
                <span className="text-white font-medium">{confirmedOrder.customerName || customerName}</span>
              </div>
              <div>
                <span className="text-slate-500">Payment:</span>{' '}
                <span className="text-amber-300 font-medium">{confirmedOrder.paymentMethod || paymentMethod} (Pay at Pickup)</span>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="max-w-md w-full mx-auto text-center pt-4 border-t border-slate-800/80 text-[11px] text-slate-500">
          Powered by <span className="text-slate-300 font-bold">Dinely Small Cart OS</span> • Fast QR Street Food Ordering
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: MAIN CUSTOMER MOBILE STOREFRONT
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans antialiased selection:bg-amber-500 selection:text-black pb-28">
      {/* Top Banner / Navigation */}
      <header className="sticky top-0 z-40 bg-[#07090e]/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 font-black">
              <Truck className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-white tracking-tight leading-tight">{cartName}</h1>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold uppercase tracking-wider">
                  Open
                </span>
              </div>
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>Instant QR Pickup • No App Needed</span>
              </p>
            </div>
          </div>

          {onNavigateStaff && (
            <button
              onClick={onNavigateStaff}
              className="text-xs px-2.5 py-1.5 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-white transition-all border border-slate-700/40"
              title="Switch to Staff POS"
            >
              Staff POS
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl w-full mx-auto px-4 py-4 space-y-4 flex-1">
        {/* Search Bar & Dietary Filter */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search burgers, rolls, drinks, snacks..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#0e121a] border border-slate-800/90 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Dietary Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setDietaryFilter('ALL')}
              className={`text-xs px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all border ${
                dietaryFilter === 'ALL'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-[#0e121a] text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setDietaryFilter('VEG')}
              className={`text-xs px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                dietaryFilter === 'VEG'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                  : 'bg-[#0e121a] text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Pure Veg
            </button>
            <button
              onClick={() => setDietaryFilter('NON_VEG')}
              className={`text-xs px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                dietaryFilter === 'NON_VEG'
                  ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/20'
                  : 'bg-[#0e121a] text-slate-400 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Non-Veg
            </button>
          </div>

          {/* Category Tabs */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-slate-800/60 pt-1">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`text-xs pb-2 font-bold whitespace-nowrap border-b-2 transition-all ${
                  selectedCategory === 'ALL'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Everything ({menuItems.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-xs pb-2 font-bold whitespace-nowrap border-b-2 transition-all ${
                    selectedCategory === cat
                      ? 'border-amber-400 text-amber-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading / Error States */}
        {isLoadingMenu && (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading {cartName} menu...</p>
          </div>
        )}

        {menuError && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <div className="flex-1">
              <p className="font-bold">Failed to load menu</p>
              <p className="text-rose-400/80 mt-0.5">{menuError}</p>
            </div>
            <button
              onClick={() => fetchMenu(targetRestId)}
              className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 rounded-xl text-xs font-bold text-white transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {/* Menu Grid: Large card-style item layout */}
        {!isLoadingMenu && !menuError && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
            {filteredItems.map((item) => {
              const inBasket = basket.find((b) => b.item.id === item.id);
              const isOutOfStock = item.isAvailable === false || (typeof item.stockQuantity === 'number' && item.stockQuantity <= 0);
              const isLowStock = typeof item.stockQuantity === 'number' && item.stockQuantity > 0 && item.stockQuantity <= 5;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    isOutOfStock
                      ? 'bg-[#0b0e14]/50 border-slate-800/40 opacity-60'
                      : 'bg-gradient-to-b from-[#10141d] to-[#0a0d14] border-slate-800/80 hover:border-slate-700/80 shadow-md'
                  }`}
                >
                  <div className="space-y-1.5">
                    {/* Top Row: Veg indicator & Category */}
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-3 h-3 rounded-md border flex items-center justify-center p-0.5 ${
                          item.isVegetarian !== false
                            ? 'border-emerald-500 text-emerald-400'
                            : 'border-rose-500 text-rose-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${item.isVegetarian !== false ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                        </span>
                        <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                          {(item as any).categoryName || (item as any).category || 'Food'}
                        </span>
                      </div>

                      {/* Stock badge */}
                      {isOutOfStock ? (
                        <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                          Sold Out
                        </span>
                      ) : isLowStock ? (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          Only {item.stockQuantity} left
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          In Stock
                        </span>
                      )}
                    </div>

                    {/* Item Name & Description */}
                    <h3 className="text-sm font-bold text-white tracking-tight pt-1 leading-snug">{item.name}</h3>
                    {item.description && (
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{item.description}</p>
                    )}
                  </div>

                  {/* Bottom Row: Price & Add to Cart button */}
                  <div className="pt-4 mt-2 border-t border-slate-800/60 flex items-center justify-between">
                    <span className="text-base font-extrabold font-mono text-amber-400">
                      ₹{item.price.toFixed(0)}
                    </span>

                    {isOutOfStock ? (
                      <span className="text-xs text-slate-500 font-semibold py-1.5 px-3">Unavailable</span>
                    ) : inBasket ? (
                      <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 rounded-xl p-1">
                        <button
                          onClick={() => handleUpdateQuantity(item.id, -1)}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-200 transition-all"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-mono font-bold text-white w-5 text-center">
                          {inBasket.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateQuantity(item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-amber-500 hover:bg-amber-400 flex items-center justify-center text-slate-950 font-bold transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAddToBasket(item)}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/10"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoadingMenu && filteredItems.length === 0 && !menuError && (
          <div className="py-16 text-center space-y-2">
            <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">No items match your filter</p>
            <p className="text-xs text-slate-500">Try changing categories or clearing search keywords.</p>
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {basketCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 z-40 px-4 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              onClick={() => setIsCheckoutOpen(true)}
              className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-extrabold flex items-center justify-between shadow-2xl shadow-amber-500/30 hover:brightness-105 active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-slate-950 text-amber-400 flex items-center justify-center text-xs font-mono font-bold">
                  {basketCount}
                </span>
                <span className="text-sm tracking-wide">View Order</span>
              </div>
              <div className="flex items-center gap-1 text-sm font-mono font-black">
                <span>₹{basketTotal.toFixed(0)}</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Checkout Drawer / Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-[#0c0f17] border border-slate-800 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-[#0e121a]">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-400" />
                <h2 className="text-sm font-extrabold text-white">Your Pickup Order</h2>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-800/70 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form & Items Container */}
            <form onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Items List */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Review Items</span>
                <div className="space-y-2 divide-y divide-slate-800/50">
                  {basket.map(({ item, quantity, notes }) => (
                    <div key={item.id} className="pt-2 flex items-center justify-between gap-3">
                      <div className="flex-1 truncate">
                        <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                        <span className="text-[11px] text-amber-400 font-mono">₹{item.price.toFixed(0)} each</span>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/60 rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.id, -1)}
                          className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-200"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-mono font-bold text-white w-4 text-center">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.id, 1)}
                          className="w-6 h-6 rounded-lg bg-amber-500 hover:bg-amber-400 flex items-center justify-center text-slate-950 font-bold"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer Contact Details */}
              <div className="space-y-3 pt-3 border-t border-slate-800/80">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Pickup Details</span>
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 mb-1 block">Your Name *</label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full pl-9 pr-3 py-2 bg-[#121622] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 mb-1 block">Mobile Number (Optional)</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="e.g. 9876543210"
                        className="w-full pl-9 pr-3 py-2 bg-[#121622] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 mb-1 block">Cooking Notes / Requests</label>
                    <input
                      type="text"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="e.g. Extra spicy, no onions, pack separately"
                      className="w-full px-3 py-2 bg-[#121622] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Mode Selection */}
              <div className="space-y-2 pt-3 border-t border-slate-800/80">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Payment Method</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CASH')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                      paymentMethod === 'CASH'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md'
                        : 'bg-[#121622] border-slate-700/80 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-amber-400" />
                    <div>
                      <p className="text-xs font-bold leading-tight">Pay at Counter</p>
                      <span className="text-[10px] text-slate-400">Cash / UPI on pickup</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('UPI')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all ${
                      paymentMethod === 'UPI'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-md'
                        : 'bg-[#121622] border-slate-700/80 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-amber-400" />
                    <div>
                      <p className="text-xs font-bold leading-tight">Counter UPI</p>
                      <span className="text-[10px] text-slate-400">Scan QR at window</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="p-3 bg-slate-900/60 rounded-2xl border border-slate-800/80 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal ({basketCount} items)</span>
                  <span className="font-mono">₹{basketTotal.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Cart Packaging & Pickup</span>
                  <span className="text-emerald-400 font-bold uppercase text-[10px]">Free</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between font-bold text-sm text-white">
                  <span>Total Payable</span>
                  <span className="text-amber-400 font-mono">₹{basketTotal.toFixed(0)}</span>
                </div>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || basket.length === 0}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 disabled:opacity-50 hover:brightness-105 active:scale-[0.99] transition-all"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Placing Order with {cartName}...</span>
                    </>
                  ) : (
                    <>
                      <Ticket className="w-4 h-4" />
                      <span>Confirm Order • Get Pickup Code</span>
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

export default CartCustomerApp;
