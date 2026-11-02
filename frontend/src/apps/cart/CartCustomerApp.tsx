import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Truck,
  ShoppingBag,
  Search,
  Plus,
  Minus,
  CheckCircle2,
  Clock,
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
  UtensilsCrossed,
  ChevronDown,
  AlertCircle,
  MapPin,
  Store,
  Share2,
  BellRing,
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { Restaurant, Order, MenuItem } from '../../packages/types';
import { DinelyLogo, Button } from '../../packages/ui';
import { realtimeBus } from '../../packages/api/realtime';
import { getTenantFromHostname } from '../../packages/utils/tenantResolver';
import { resolveCartTheme } from './cartThemes';

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

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');
  const [isSearchVisible, setIsSearchVisible] = useState(false);

  // Basket State: { item: MenuItem, quantity: number, notes?: string }
  const [basket, setBasket] = useState<Array<{ item: MenuItem; quantity: number; notes?: string }>>([]);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Customer Checkout Details
  const [customerName, setCustomerName] = useState(() => {
    return (typeof window !== 'undefined' ? localStorage.getItem('dinely_customer_name') : '') || '';
  });
  const [customerPhone, setCustomerPhone] = useState(() => {
    return (typeof window !== 'undefined' ? localStorage.getItem('dinely_customer_phone') : '') || '';
  });
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showCustomization, setShowCustomization] = useState(false);
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState<string | null>(null);

  // Confirmed Order State & Navigation Persistence
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);
  const [isViewingMenu, setIsViewingMenu] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Target Restaurant ID
  const targetRestId = business?.id || api.getCurrentRestaurantId() || '';

  // Theme resolution
  const activeTheme = useMemo(() => {
    return resolveCartTheme(business?.theme);
  }, [business?.theme]);

  // Restore basket from localStorage
  useEffect(() => {
    if (!targetRestId) return;
    try {
      const stored = localStorage.getItem(`dinely_cart_basket_${targetRestId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setBasket(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, [targetRestId]);

  // Persist basket to localStorage
  useEffect(() => {
    if (!targetRestId) return;
    try {
      if (basket.length > 0) {
        localStorage.setItem(`dinely_cart_basket_${targetRestId}`, JSON.stringify(basket));
      } else {
        localStorage.removeItem(`dinely_cart_basket_${targetRestId}`);
      }
    } catch {
      // ignore
    }
  }, [basket, targetRestId]);

  // Fetch Menu
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
      setMenuError(err?.message || 'Could not load menu items. Please check your network connection.');
    } finally {
      setIsLoadingMenu(false);
    }
  }, []);

  // Sync prop business
  useEffect(() => {
    if (propBusiness) {
      setBusiness(propBusiness);
      api.setCurrentRestaurantId(propBusiness.id);
      fetchMenu(propBusiness.id);
    }
  }, [propBusiness, fetchMenu]);

  // Tenant Resolution
  useEffect(() => {
    async function init() {
      if (!business) {
        try {
          const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
          const queryCartId =
            searchParams.get('cartId') ||
            searchParams.get('restaurantId') ||
            searchParams.get('cart') ||
            searchParams.get('slug') ||
            searchParams.get('tenant');

          const pathSegments = typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean) : [];
          let pathCartId: string | undefined;
          if (pathSegments[0] === 'cart' && pathSegments.length >= 3 && (pathSegments[2] === 'menu' || pathSegments[2] === 'storefront')) {
            pathCartId = pathSegments[1];
          }

          const targetLookup = queryCartId || pathCartId;
          if (targetLookup) {
            let r = await api.getRestaurantDetails(targetLookup).catch(() => null);
            if (!r) {
              r = await api.resolveRestaurantBySlug(targetLookup).catch(() => null);
            }
            if (r) {
              setBusiness(r);
              api.setCurrentRestaurantId(r.id);
              fetchMenu(r.id);
              return;
            }
          }

          const domainRes = getTenantFromHostname();
          if (domainRes.isTenantSubdomain && domainRes.slug) {
            const r = await api.resolveRestaurantBySlug(domainRes.slug).catch(() => null);
            if (r) {
              setBusiness(r);
              api.setCurrentRestaurantId(r.id);
              fetchMenu(r.id);
              return;
            }
          }

          const currId = api.getCurrentRestaurantId();
          if (currId) {
            const r = await api.getRestaurantDetails(currId).catch(() => null);
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

  // Restore tracked order from URL or localStorage
  useEffect(() => {
    if (!targetRestId) return;
    const searchParams = new URLSearchParams(window.location.search);
    const trackParam = searchParams.get('trackOrder');

    let codeToLookup = trackParam;
    if (!codeToLookup) {
      try {
        const stored = localStorage.getItem(`dinely_active_cart_order_${targetRestId}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          codeToLookup = parsed.pickupCode || parsed.id;
        }
      } catch {
        // ignore
      }
    }

    if (codeToLookup) {
      api
        .lookupOrderPickupCode(targetRestId, codeToLookup)
        .then((ord) => {
          if (ord) {
            setConfirmedOrder(ord);
          }
        })
        .catch((err) => {
          console.warn('Could not restore tracked order:', err);
        });
    }
  }, [targetRestId]);

  // Sync confirmedOrder to localStorage
  useEffect(() => {
    if (!targetRestId) return;
    if (confirmedOrder) {
      try {
        localStorage.setItem(
          `dinely_active_cart_order_${targetRestId}`,
          JSON.stringify({ id: confirmedOrder.id, pickupCode: confirmedOrder.pickupCode })
        );
      } catch {
        // ignore
      }
    }
  }, [confirmedOrder, targetRestId]);

  const handleClearActiveOrder = () => {
    if (targetRestId) {
      try {
        localStorage.removeItem(`dinely_active_cart_order_${targetRestId}`);
      } catch {
        // ignore
      }
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('trackOrder');
    window.history.replaceState({}, '', url.toString());
    setConfirmedOrder(null);
    setIsViewingMenu(false);
  };

  // Real-time bus connection for live order tracking & menu updates
  useEffect(() => {
    if (!targetRestId) return;

    realtimeBus.connect(targetRestId, 'CUSTOMER');

    const unsubscribe = realtimeBus.subscribe((evt: any) => {
      if (!evt) return;
      const p = evt.payload || evt.data || evt;
      const evtRestId = p.restaurantId || p.restaurant_id || evt.restaurantId;
      if (
        evtRestId &&
        evtRestId !== targetRestId &&
        business &&
        evtRestId !== business.id &&
        evtRestId !== business.slug &&
        evtRestId !== business.publicSlug
      ) {
        return;
      }

      if (
        evt.type === 'menu_item_created' ||
        evt.type === 'MenuItemCreated' ||
        evt.type === 'menu_item_updated' ||
        evt.type === 'menu_item_deleted' ||
        evt.type === 'stock_update'
      ) {
        fetchMenu(targetRestId);
      }

      if (confirmedOrder) {
        const orderId = p.orderId || p.id || evt.orderId || p.order_id;
        if (orderId === confirmedOrder.id) {
          const t = evt.type;
          if (
            t === 'order_updated' ||
            t === 'OrderUpdated' ||
            t === 'order_status_updated' ||
            t === 'OrderStatusUpdated' ||
            t === 'order_ready' ||
            t === 'OrderReady' ||
            t === 'order_redeemed' ||
            t === 'OrderRedeemed' ||
            t === 'order_delivered' ||
            t === 'KitchenStatusUpdated'
          ) {
            setConfirmedOrder((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                status: p.status || prev.status,
                kitchenStatus: p.kitchenStatus || prev.kitchenStatus,
                pickupStatus: p.pickupStatus || p.pickup_status || prev.pickupStatus,
                claimedAt: p.claimedAt || p.claimed_at || prev.claimedAt,
                paymentStatus: p.paymentStatus || prev.paymentStatus,
                paymentMethod: p.paymentMethod || prev.paymentMethod,
              };
            });
          }
        }
      }
    });

    return () => unsubscribe();
  }, [targetRestId, business, confirmedOrder, fetchMenu]);

  // Polling fallback when order is active (every 3 seconds)
  useEffect(() => {
    if (
      !confirmedOrder ||
      !targetRestId ||
      confirmedOrder.pickupStatus === 'REDEEMED' ||
      confirmedOrder.status === 'COMPLETED' ||
      confirmedOrder.status === 'CANCELLED'
    ) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const lookup = await api.lookupOrderPickupCode(targetRestId, confirmedOrder.pickupCode || confirmedOrder.id);
        if (lookup && lookup.id === confirmedOrder.id) {
          setConfirmedOrder(lookup);
        }
      } catch {
        // silent catch
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [confirmedOrder?.id, confirmedOrder?.pickupStatus, confirmedOrder?.status, targetRestId]);

  // Helper to format raw category keys into clean human-readable titles
  const formatCategoryTitle = (rawNameOrId?: string): string => {
    if (!rawNameOrId) return 'General';
    if (!rawNameOrId.startsWith('cat-') && !rawNameOrId.includes('_')) return rawNameOrId;
    let clean = rawNameOrId.replace(/^cat-[a-z0-9]+-/, '').replace(/^cat-/, '');
    clean = clean.replace(/[-_]/g, ' ');
    return clean.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  // Categories list with human-readable labels
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    menuItems.forEach((item) => {
      const catKey = (item as any).categoryName || (item as any).category || item.categoryId || 'General';
      const cleanLabel = (item as any).categoryName || (item as any).category || formatCategoryTitle(item.categoryId);
      if (!map.has(catKey)) {
        map.set(catKey, cleanLabel);
      }
    });
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [menuItems]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesDesc = (item.description || '').toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }
      if (selectedCategory !== 'ALL') {
        const catKey = (item as any).categoryName || (item as any).category || item.categoryId;
        if (catKey !== selectedCategory) return false;
      }
      if (dietaryFilter === 'VEG' && item.isVegetarian === false) return false;
      if (dietaryFilter === 'NON_VEG' && item.isVegetarian !== false) return false;
      return true;
    });
  }, [menuItems, searchQuery, selectedCategory, dietaryFilter]);

  // Basket calculations
  const basketTotal = useMemo(() => {
    return basket.reduce((acc, curr) => acc + curr.item.price * curr.quantity, 0);
  }, [basket]);

  const basketCount = useMemo(() => {
    return basket.reduce((acc, curr) => acc + curr.quantity, 0);
  }, [basket]);

  const handleAddToBasket = (item: MenuItem) => {
    if (item.isAvailable === false) return;
    setBasket((prev) => {
      const existing = prev.find((i) => i.item.id === item.id);
      if (existing) {
        return prev.map((i) => (i.item.id === item.id ? { ...i, quantity: i.quantity + 1 } : i));
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

  // Submit Order to backend
  const handleSubmitOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (basket.length === 0 || isSubmitting) return;

    if (!customerName.trim()) {
      setSubmitError('Please enter your name so counter staff can call your order.');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      if (typeof window !== 'undefined') {
        localStorage.setItem('dinely_customer_name', customerName.trim());
        if (customerPhone.trim()) {
          localStorage.setItem('dinely_customer_phone', customerPhone.trim());
        }
      }

      const clientOrderId =
        checkoutIdempotencyKey || `ord-cart-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      if (!checkoutIdempotencyKey) {
        setCheckoutIdempotencyKey(clientOrderId);
      }

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
      setIsViewingMenu(false);
      setBasket([]);
      setIsCheckoutOpen(false);
      setCheckoutIdempotencyKey(null);

      if (targetRestId) {
        try {
          localStorage.removeItem(`dinely_cart_basket_${targetRestId}`);
          localStorage.setItem(
            `dinely_active_cart_order_${targetRestId}`,
            JSON.stringify({ id: created.id, pickupCode: created.pickupCode })
          );
        } catch {
          // ignore
        }
      }
      const url = new URL(window.location.href);
      url.searchParams.set('trackOrder', created.pickupCode || created.id);
      window.history.replaceState({}, '', url.toString());
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
  const isCartOpen = business?.status !== 'CLOSED';

  // -------------------------------------------------------------
  // VIEW: CONFIRMATION / PICKUP COUPON VOUCHER SCREEN
  // -------------------------------------------------------------
  if (confirmedOrder && !isViewingMenu) {
    const isRedeemed = confirmedOrder.pickupStatus === 'REDEEMED' || confirmedOrder.status === 'COMPLETED';
    const isReady = confirmedOrder.status === 'READY';
    const isPreparing = confirmedOrder.status === 'PREPARING';
    const isCancelled = confirmedOrder.status === 'CANCELLED';
    const pickupCode =
      confirmedOrder.pickupCode ||
      confirmedOrder.displayOrderNumber ||
      `#${confirmedOrder.id.slice(-4).toUpperCase()}`;
    const prepMinutes =
      confirmedOrder.estimatedPrepTimeMinutes || (confirmedOrder as any).estimated_prep_time_minutes || 15;

    return (
      <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-black relative">
        {/* Ambient Radial Background Glow */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-32 left-1/4 w-[500px] h-[500px] rounded-full blur-[140px] bg-emerald-600/10 opacity-70" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full blur-[140px] bg-teal-600/10 opacity-60" />
        </div>

        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-[#07090e]/80 backdrop-blur-2xl border-b border-white/[0.08] px-4 py-3.5 shadow-xl">
          <div className="max-w-md w-full mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <Truck className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white tracking-tight">{cartName}</h1>
                <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Pickup Voucher
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsViewingMenu(true)}
              className="text-xs px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 transition-all font-semibold border border-white/10 flex items-center gap-1.5 active:scale-95"
            >
              <span>Menu</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </header>

        {/* Voucher Main Content */}
        <main className="max-w-md w-full mx-auto px-4 py-6 space-y-4 flex-1 relative z-10">
          {/* HIGH VISIBILITY CELEBRATION BANNER: READY FOR PICKUP */}
          {isReady && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-emerald-500/25 via-emerald-600/30 to-teal-500/25 border-2 border-emerald-400/80 text-emerald-200 shadow-[0_0_30px_rgba(16,185,129,0.3)] animate-pulse text-center space-y-1">
              <div className="flex items-center justify-center gap-2 text-white font-black text-base sm:text-lg">
                <Sparkles className="w-5 h-5 text-emerald-300" />
                <span>🎉 YOUR FOOD IS READY!</span>
              </div>
              <p className="text-xs text-emerald-300 font-medium">
                Please collect your order at the cart counter. Show coupon <b>{pickupCode}</b> to staff.
              </p>
            </div>
          )}

          {isCancelled && (
            <div className="p-4 rounded-3xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-center space-y-1">
              <div className="flex items-center justify-center gap-2 font-bold text-base text-rose-200">
                <AlertCircle className="w-5 h-5 text-rose-400" />
                <span>Order Cancelled</span>
              </div>
              <p className="text-xs text-rose-400/80">This order was cancelled by the counter staff.</p>
            </div>
          )}

          {/* Liquid-Glass Coupon Card */}
          <div className="rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/[0.12] p-6 sm:p-7 text-center shadow-2xl space-y-5 relative overflow-hidden">
            <div className="space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                Counter Pickup Coupon
              </span>
              <p className="text-xs text-slate-400">Show this code at the cart counter to collect your food</p>
            </div>

            {/* Huge Prominent Voucher Code Box */}
            <div
              className={`p-5 rounded-2xl relative border-2 border-dashed transition-all ${
                isReady
                  ? 'bg-emerald-500/15 border-emerald-400/80 shadow-[0_0_24px_rgba(16,185,129,0.3)]'
                  : 'bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-emerald-500/10 border-emerald-500/40'
              }`}
            >
              <div
                className={`text-4xl sm:text-5xl font-black tracking-widest font-mono drop-shadow-md ${
                  isReady ? 'text-emerald-300' : 'text-emerald-400'
                }`}
              >
                {pickupCode}
              </div>

              <button
                onClick={handleCopyCode}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-slate-200 transition-all border border-white/10 active:scale-95"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            {/* Real preparation time or pickup instruction */}
            <div className="flex items-center justify-between text-xs text-slate-300 bg-white/[0.03] p-3 rounded-xl border border-white/8">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Estimated Preparation:</span>
              </div>
              <span className="font-mono font-bold text-emerald-400">~{prepMinutes} mins</span>
            </div>

            {/* 4-Step Progress Stepper */}
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-4 gap-1.5 text-[9px] sm:text-[10px] text-center font-bold uppercase tracking-wider font-mono">
                {/* 1. Received */}
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex flex-col items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Received</span>
                </div>
                {/* 2. Cooking */}
                <div
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    isRedeemed || isReady || isPreparing
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-bold'
                      : 'bg-white/[0.02] text-slate-500 border-white/5'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPreparing ? 'animate-spin text-emerald-400' : ''}`} />
                  <span>Cooking</span>
                </div>
                {/* 3. Ready */}
                <div
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    isRedeemed || isReady
                      ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/60 font-black shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                      : 'bg-white/[0.02] text-slate-500 border-white/5'
                  }`}
                >
                  <Ticket className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Ready</span>
                </div>
                {/* 4. Collected */}
                <div
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    isRedeemed
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-white/[0.02] text-slate-500 border-white/5'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Done</span>
                </div>
              </div>
            </div>

            {/* Order Items Breakdown */}
            <div className="pt-4 border-t border-white/10 text-left space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                Order Summary
              </span>
              <div className="space-y-1.5 text-xs text-slate-300">
                {confirmedOrder.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center py-0.5">
                    <span className="truncate">
                      <span className="font-bold text-white font-mono">{it.quantity}x</span> {it.name}
                    </span>
                    <span className="font-mono text-slate-400">₹{(it.price * it.quantity).toFixed(0)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 flex justify-between items-center border-t border-white/10 font-bold text-sm text-white">
                <span>Total Amount</span>
                <span className="text-emerald-400 font-mono text-base">
                  ₹{confirmedOrder.totalAmount?.toFixed(0) || basketTotal}
                </span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="p-3 bg-white/[0.03] rounded-xl text-left text-[11px] text-slate-400 flex items-center justify-between border border-white/8">
              <div>
                <span className="text-slate-500">Customer:</span>{' '}
                <span className="text-white font-medium">{confirmedOrder.customerName || customerName}</span>
              </div>
              <div>
                <span className="text-slate-500">Payment:</span>{' '}
                <span className="text-emerald-300 font-medium">
                  {confirmedOrder.paymentMethod || paymentMethod} (Pay at Pickup)
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => setIsViewingMenu(true)}
                className="w-full py-3 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/10 transition-all active:scale-98"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Browse Menu • Order More</span>
              </button>

              {isRedeemed && (
                <button
                  type="button"
                  onClick={handleClearActiveOrder}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-98 shadow-[0_4px_16px_rgba(16,185,129,0.4)]"
                >
                  <Plus className="w-4 h-4" />
                  <span>Start New Order</span>
                </button>
              )}
            </div>
          </div>
        </main>

        <footer className="max-w-md w-full mx-auto text-center py-4 border-t border-white/10 text-[11px] text-slate-500 relative z-10">
          Powered by <span className="text-slate-300 font-bold">Dinely Food Cart OS</span> • Fast QR Street Food Ordering
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: MAIN CUSTOMER MOBILE STOREFRONT
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-black relative pb-28">
      {/* Background Radial Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 contain-paint">
        <div className="absolute -top-32 left-1/3 w-[550px] h-[550px] rounded-full blur-[140px] bg-emerald-600/10 opacity-70" />
        <div className="absolute top-[40%] -right-24 w-[450px] h-[450px] rounded-full blur-[140px] bg-teal-600/10 opacity-60" />
      </div>

      {/* Sticky Active Order Reminder Banner when customer is browsing menu */}
      {confirmedOrder && isViewingMenu && (
        <div
          onClick={() => setIsViewingMenu(false)}
          className="sticky top-0 z-50 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 text-slate-950 px-4 py-2.5 flex items-center justify-between shadow-xl cursor-pointer hover:brightness-105 transition-all border-b border-emerald-600/50"
        >
          <div className="flex items-center gap-2 text-xs font-bold truncate">
            <Ticket className="w-4 h-4 text-slate-950 shrink-0 animate-bounce" />
            <span className="truncate">
              Active Ticket:{' '}
              <strong className="font-mono text-sm underline">
                {confirmedOrder.pickupCode || confirmedOrder.id.slice(-4)}
              </strong>
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase shrink-0 ${
                confirmedOrder.status === 'READY'
                  ? 'bg-slate-950 text-emerald-300 animate-pulse'
                  : 'bg-slate-950/20 text-slate-950'
              }`}
            >
              {confirmedOrder.status === 'READY'
                ? '🎉 FOOD READY!'
                : confirmedOrder.status === 'PREPARING'
                ? 'Cooking...'
                : confirmedOrder.status === 'COMPLETED'
                ? '✓ Completed'
                : 'Received'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs font-black shrink-0 ml-2">
            <span>View Ticket</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>
      )}

      {/* Premium Header */}
      <header
        className={`sticky ${
          confirmedOrder && isViewingMenu ? 'top-10' : 'top-0'
        } z-40 bg-[#07090e]/85 backdrop-blur-2xl border-b border-white/[0.08] px-4 py-3 shadow-xl transition-all`}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300 shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <Truck className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight truncate">{cartName}</h1>
                <span
                  className={`text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-mono flex items-center gap-1 ${
                    isCartOpen
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${isCartOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}
                  />
                  {isCartOpen ? 'Open Now' : 'Closed'}
                </span>
                <span className="hidden xs:inline-flex text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-slate-300 border border-white/10 font-mono">
                  COUNTER PICKUP
                </span>
              </div>
              <p className="text-[11px] text-white/50 truncate mt-0.5">
                {((business?.theme as any)?.tagline) || 'Instant QR Pickup • No App Needed'}
              </p>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsSearchVisible((v) => !v)}
              className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white transition-all border border-white/10 active:scale-95"
              title="Search menu"
            >
              <Search className="w-4 h-4" />
            </button>

            {basketCount > 0 && (
              <button
                onClick={() => setIsCheckoutOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all active:scale-95 shadow-[0_0_15px_rgba(16,185,129,0.35)]"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span className="font-mono font-black">{basketCount}</span>
              </button>
            )}

            {onNavigateStaff && (
              <button
                onClick={onNavigateStaff}
                className="hidden sm:inline-flex text-xs px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-400 hover:text-white transition-all border border-white/10"
              >
                Staff POS
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl w-full mx-auto px-4 py-4 space-y-4 flex-1 relative z-10">
        {/* Compact Hero Card */}
        <div className="relative rounded-3xl overflow-hidden border border-white/[0.08] bg-gradient-to-r from-emerald-950/30 via-[#0e1420] to-[#0a0d14] p-5 sm:p-6 shadow-2xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[10px] font-bold">
                  FAST STREET SERVICE
                </span>
                <span className="text-white/40 text-xs">•</span>
                <span className="text-xs text-white/60 font-medium">Order & Pay at Counter</span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                Freshly Prepared Street Food
              </h2>
              <p className="text-xs text-slate-400 max-w-lg">
                Pick your items, review your basket, and receive a single-use pickup voucher instantly on checkout.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="px-3.5 py-2 rounded-2xl bg-white/[0.05] border border-white/10 text-center">
                <p className="text-[10px] uppercase font-mono text-white/50 font-bold">Avg Prep</p>
                <p className="text-xs font-mono font-black text-emerald-400">~10-15m</p>
              </div>
              <div className="px-3.5 py-2 rounded-2xl bg-white/[0.05] border border-white/10 text-center">
                <p className="text-[10px] uppercase font-mono text-white/50 font-bold">Service</p>
                <p className="text-xs font-mono font-black text-teal-300">Takeaway</p>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible Search Input */}
        {isSearchVisible && (
          <div className="relative animate-in fade-in slide-in-from-top-2 duration-200">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes, rolls, burgers, drinks..."
              className="w-full pl-10 pr-10 py-2.5 bg-white/[0.05] border border-white/15 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition-all shadow-inner backdrop-blur-xl"
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
        )}

        {/* Filters Bar: Dietary Toggles & Horizontal Category Chips */}
        <div className="space-y-2.5">
          {/* Dietary Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setDietaryFilter('ALL')}
              className={`text-xs px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all border active:scale-95 ${
                dietaryFilter === 'ALL'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setDietaryFilter('VEG')}
              className={`text-xs px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border active:scale-95 ${
                dietaryFilter === 'VEG'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Pure Veg
            </button>
            <button
              onClick={() => setDietaryFilter('NON_VEG')}
              className={`text-xs px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border active:scale-95 ${
                dietaryFilter === 'NON_VEG'
                  ? 'bg-rose-500 text-white border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                  : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Non-Veg
            </button>
          </div>

          {/* Category Navigation Chips */}
          {categories.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none border-b border-white/10 pt-1">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`text-xs pb-2 font-bold whitespace-nowrap border-b-2 transition-all ${
                  selectedCategory === 'ALL'
                    ? 'border-emerald-400 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                All Categories ({menuItems.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`text-xs pb-2 font-bold whitespace-nowrap border-b-2 transition-all cursor-pointer ${
                    selectedCategory === cat.key
                      ? 'border-emerald-400 text-emerald-400 font-extrabold'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoadingMenu && (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading {cartName} menu...</p>
          </div>
        )}

        {/* Error State */}
        {menuError && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{menuError}</span>
            </div>
            <button
              onClick={() => fetchMenu(targetRestId)}
              className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-xs font-bold text-white transition-all shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty Menu State */}
        {!isLoadingMenu && !menuError && filteredItems.length === 0 && (
          <div className="py-20 text-center space-y-2 rounded-2xl bg-white/[0.02] border border-white/5 p-6">
            <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">No items match your filter</p>
            <p className="text-xs text-slate-500">Try changing categories or clearing search keywords.</p>
          </div>
        )}

        {/* Food Item Cards Grid: Responsive 1 col (mobile), 2 col (tablet), 3 col (desktop) */}
        {!isLoadingMenu && !menuError && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
            {filteredItems.map((item) => {
              const inBasket = basket.find((b) => b.item.id === item.id);
              const isOutOfStock = item.isAvailable === false;
              const hasPhoto = Boolean(item.imageUrl || item.image);

              return (
                <div
                  key={item.id}
                  className={`rounded-3xl border transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-xl liquid-glass-card ${
                    isOutOfStock
                      ? 'bg-white/[0.02] border-white/5 opacity-55'
                      : inBasket
                      ? 'bg-gradient-to-b from-[#101726] to-[#0a0d14] border-emerald-400/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                      : 'bg-gradient-to-b from-[#101520] to-[#080b12] border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Dish Photo or Clean Food Cart Placeholder */}
                  <div className="relative w-full h-44 bg-[#0d111a] overflow-hidden">
                    {hasPhoto ? (
                      <img
                        src={item.imageUrl || item.image}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                          const parent = (e.currentTarget as HTMLElement).parentElement;
                          if (parent) {
                            const fallback = parent.querySelector('.cart-dish-fallback');
                            if (fallback) (fallback as HTMLElement).classList.remove('hidden');
                          }
                        }}
                      />
                    ) : null}

                    {/* Clean Liquid-Glass Dish Placeholder */}
                    <div
                      className={`cart-dish-fallback absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-500 bg-gradient-to-br from-[#101522] to-[#080b12] ${
                        hasPhoto ? 'hidden' : 'flex'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 shadow-inner">
                        <UtensilsCrossed className="w-6 h-6 opacity-60 text-emerald-400" />
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 font-mono">
                        {(item as any).categoryName || (item as any).category || formatCategoryTitle(item.categoryId) || 'Street Food'}
                      </span>
                    </div>

                    {/* Veg / Non-Veg Badge */}
                    <div className="absolute top-3 left-3 z-10 flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/80 backdrop-blur-md border border-white/15 text-[10px]">
                      <span
                        className={`w-2.5 h-2.5 rounded-sm border flex items-center justify-center p-0.5 ${
                          item.isVegetarian !== false ? 'border-emerald-500' : 'border-rose-500'
                        }`}
                      >
                        <span
                          className={`w-1 h-1 rounded-full ${
                            item.isVegetarian !== false ? 'bg-emerald-400' : 'bg-rose-500'
                          }`}
                        />
                      </span>
                      <span className="text-slate-200 font-bold uppercase text-[9px] tracking-wider font-mono">
                        {item.isVegetarian !== false ? 'VEG' : 'NON-VEG'}
                      </span>
                    </div>

                    {/* Stock / Availability Badge */}
                    <div className="absolute top-3 right-3 z-10">
                      {isOutOfStock ? (
                        <span className="text-[10px] font-bold text-rose-200 bg-rose-600/90 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-rose-400/40 shadow-sm font-mono">
                          Sold Out
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-emerald-200 bg-emerald-600/80 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-emerald-400/30 shadow-sm font-mono">
                          Available
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dish Info & Action Bar */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-white tracking-tight leading-snug">{item.name}</h3>
                      {item.description ? (
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mt-1">{item.description}</p>
                      ) : null}
                    </div>

                    {/* Price & Add to Cart button */}
                    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                      <span className="text-base font-extrabold font-mono text-emerald-400">
                        ₹{item.price.toFixed(0)}
                      </span>

                      {isOutOfStock ? (
                        <span className="text-xs font-bold text-rose-400/90 py-1 px-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 font-mono">
                          Sold Out
                        </span>
                      ) : inBasket ? (
                        <div className="flex items-center gap-2 bg-white/[0.06] border border-white/15 rounded-xl p-1 shadow-sm">
                          <button
                            onClick={() => handleUpdateQuantity(item.id, -1)}
                            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-200 transition-all active:scale-95"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-mono font-bold text-white w-5 text-center">
                            {inBasket.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateQuantity(item.id, 1)}
                            className="w-7 h-7 rounded-lg bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center text-slate-950 font-bold transition-all active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddToBasket(item)}
                          className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_2px_12px_rgba(16,185,129,0.3)] active:scale-95 font-mono"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {basketCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 z-40 px-4 pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              onClick={() => setIsCheckoutOpen(true)}
              className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 text-slate-950 font-extrabold flex items-center justify-between shadow-[0_8px_30px_rgba(16,185,129,0.5)] hover:brightness-105 active:scale-[0.99] transition-all"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-slate-950 text-emerald-400 flex items-center justify-center text-xs font-mono font-black shadow-inner">
                  {basketCount}
                </span>
                <span className="text-sm tracking-tight font-black">View Order Summary</span>
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-md bg-[#090d14] border border-white/15 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Drawer Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-black text-white uppercase tracking-tight">Your Pickup Order</h2>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="w-8 h-8 rounded-full bg-white/[0.08] hover:bg-white/[0.15] text-slate-300 hover:text-white flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form & Items Container */}
            <form onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Items List */}
              <div className="space-y-2.5">
                <span className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                  Review Selected Items
                </span>
                <div className="space-y-2 divide-y divide-white/5">
                  {basket.map(({ item, quantity }) => (
                    <div key={item.id} className="pt-2 flex items-center justify-between gap-3">
                      <div className="flex-1 truncate">
                        <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                        <span className="text-[11px] text-emerald-400 font-mono">₹{item.price.toFixed(0)} each</span>
                      </div>
                      <div className="flex items-center gap-2 bg-white/[0.06] border border-white/10 rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.id, -1)}
                          className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-200"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-mono font-bold text-white w-4 text-center">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.id, 1)}
                          className="w-6 h-6 rounded-lg bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center text-slate-950 font-bold"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Notice */}
              <div className="p-3.5 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/25 rounded-2xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Pay at Counter</p>
                  <p className="text-[11px] text-emerald-300/80 leading-tight mt-0.5">
                    Pay with Cash or UPI upon pickup. No online payment required now.
                  </p>
                </div>
              </div>

              {/* Customer Required Name Field */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-300 block font-mono">
                  Your Name <span className="text-emerald-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your name (e.g. Rahul S)"
                    className="w-full pl-8 pr-3 py-2 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* Optional Requests Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowCustomization((prev) => !prev)}
                  className="w-full py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] font-medium text-slate-400 hover:text-slate-200 flex items-center justify-between transition-all"
                >
                  <span>{showCustomization ? 'Hide optional requests' : '+ Add phone or cooking notes'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCustomization ? 'rotate-180' : ''}`} />
                </button>

                {showCustomization && (
                  <div className="mt-2.5 p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5 animate-in fade-in duration-200">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 font-mono">
                        Mobile Number (Optional SMS alert)
                      </label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="e.g. 9876543210"
                          className="w-full pl-8 pr-3 py-1.5 bg-white/[0.05] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1 font-mono">
                        Cooking Notes / Special Requests
                      </label>
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="e.g. Extra crispy, less spicy, pack separately"
                        className="w-full px-3 py-1.5 bg-white/[0.05] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="p-3.5 bg-white/[0.03] rounded-2xl border border-white/10 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal ({basketCount} items)</span>
                  <span className="font-mono text-slate-200">₹{basketTotal.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Cart Packaging & Pickup</span>
                  <span className="text-emerald-400 font-bold uppercase text-[10px] font-mono">Free</span>
                </div>
                <div className="pt-2 border-t border-white/10 flex justify-between font-bold text-sm text-white">
                  <span>Total Payable at Counter</span>
                  <span className="text-emerald-400 font-mono text-base">₹{basketTotal.toFixed(0)}</span>
                </div>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Checkout Submit CTA */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || basket.length === 0}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(16,185,129,0.4)] disabled:opacity-50 hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer font-mono"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Placing Order with {cartName}...</span>
                    </>
                  ) : (
                    <>
                      <Ticket className="w-4 h-4" />
                      <span>Place Order • ₹{basketTotal.toFixed(0)}</span>
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
