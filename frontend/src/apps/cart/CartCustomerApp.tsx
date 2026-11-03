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
  Star,
  QrCode,
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { Restaurant, Order, MenuItem } from '../../packages/types';
import { DinelyLogo, Button } from '../../packages/ui';
import { realtimeBus } from '../../packages/api/realtime';
import { getTenantFromHostname } from '../../packages/utils/tenantResolver';
import { resolveCartTheme } from './cartThemes';

export const getStreetFoodDishImage = (item: MenuItem): string => {
  if (
    item.imageUrl &&
    item.imageUrl.startsWith('http') &&
    !item.imageUrl.includes('placeholder') &&
    !item.imageUrl.startsWith('data:')
  ) {
    return item.imageUrl;
  }
  if (
    item.image &&
    item.image.startsWith('http') &&
    !item.image.includes('placeholder') &&
    !item.image.startsWith('data:')
  ) {
    return item.image;
  }

  const text = `${item.name} ${item.category || ''} ${(item as any).categoryName || ''} ${item.description || ''}`.toLowerCase();

  if (text.includes('fries') || text.includes('peri') || text.includes('chips') || text.includes('finger')) {
    return 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&auto=format&fit=crop&q=80';
  }
  if (text.includes('roll') || text.includes('wrap') || text.includes('kathi') || text.includes('frankie')) {
    return 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80';
  }
  if (text.includes('burger') || text.includes('patty') || text.includes('sandwich') || text.includes('slider')) {
    return 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80';
  }
  if (text.includes('chaat') || text.includes('puri') || text.includes('samosa') || text.includes('bhel') || text.includes('tikki')) {
    return 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80';
  }
  if (text.includes('noodle') || text.includes('hakka') || text.includes('chow') || text.includes('wok') || text.includes('fried rice') || text.includes('momo') || text.includes('dimsum')) {
    return 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80';
  }
  if (text.includes('coffee') || text.includes('frappe') || text.includes('latte') || text.includes('cappuccino') || text.includes('shake')) {
    return 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80';
  }
  if (text.includes('shikanji') || text.includes('cooler') || text.includes('lemonade') || text.includes('mojito') || text.includes('drink') || text.includes('beverage') || text.includes('tea') || text.includes('chai')) {
    return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80';
  }
  if (text.includes('brownie') || text.includes('dessert') || text.includes('cake') || text.includes('sweet') || text.includes('chocolate') || text.includes('ice cream')) {
    return 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80';
  }
  if (text.includes('paneer') || text.includes('tikka') || text.includes('curry') || text.includes('gravy')) {
    return 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80';
  }
  if (text.includes('chicken') || text.includes('meat') || text.includes('kebab') || text.includes('wings')) {
    return 'https://images.unsplash.com/photo-1562967914-608f82629710?w=600&auto=format&fit=crop&q=80';
  }

  // Universal street food fallback
  return 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80';
};

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
      <div className="min-h-screen font-sans pb-12 w-full max-w-full sm:max-w-md mx-auto relative sm:border-x border-white/[0.12] liquid-glass-viewport text-[#F7F7F5] shadow-2xl selection:bg-amber-500/30 overflow-x-hidden box-border min-w-0">
        {/* Dynamic Ambient Radiant Glows */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-[360px] h-[360px] rounded-full blur-[100px] bg-amber-500/25 pointer-events-none opacity-80" />
          <div className="absolute top-[45%] right-0 translate-x-1/4 w-[300px] h-[300px] rounded-full blur-[110px] bg-amber-500/15 pointer-events-none opacity-60" />
        </div>

        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-[#0B0F15]/80 backdrop-blur-2xl border-b border-white/[0.08] px-4 py-3.5 shadow-xl">
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-950/40">
                <Truck className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-sm font-black text-white tracking-tight">{cartName}</h1>
                <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Live Counter Voucher
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsViewingMenu(true)}
              className="text-xs px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white transition-all font-bold border border-white/10 flex items-center gap-1.5 active:scale-95 cursor-pointer"
            >
              <span>Menu</span>
              <ChevronRight className="w-3.5 h-3.5 text-white/50" />
            </button>
          </div>
        </header>

        {/* Voucher Main Content */}
        <main className="w-full px-4 py-5 space-y-4 flex-1 relative z-10">
          {/* HIGH VISIBILITY CELEBRATION BANNER: READY FOR PICKUP */}
          {isReady && (
            <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-500/25 via-amber-400/30 to-amber-500/25 border-2 border-amber-400/80 text-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.35)] animate-pulse text-center space-y-1">
              <div className="flex items-center justify-center gap-2 text-white font-black text-base sm:text-lg">
                <Sparkles className="w-5 h-5 text-amber-300" />
                <span>🎉 YOUR FOOD IS READY!</span>
              </div>
              <p className="text-xs text-amber-200/90 font-medium">
                Please collect your order at the cart counter. Show coupon <b className="font-mono text-white underline">{pickupCode}</b> to staff.
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
          <div className="rounded-3xl liquid-glass-card border border-white/[0.12] p-5 sm:p-6 text-center shadow-2xl space-y-5 relative overflow-hidden">
            {/* Ambient inner glow */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-20 bg-amber-500/15 blur-2xl pointer-events-none rounded-full" />

            <div className="space-y-1 relative z-10">
              <span className="text-[11px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                Counter Pickup Token
              </span>
              <p className="text-xs text-white/50">Show this code at the cart counter to collect your food</p>
            </div>

            {/* Huge Prominent Voucher Code Box */}
            <div
              className={`p-5 rounded-2xl relative border-2 border-dashed transition-all ${
                isReady
                  ? 'bg-amber-500/20 border-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.4)]'
                  : 'bg-gradient-to-b from-amber-500/10 to-transparent border-amber-500/40 shadow-inner'
              }`}
            >
              <div
                className={`text-4xl sm:text-5xl font-black tracking-widest font-mono drop-shadow-md ${
                  isReady ? 'text-amber-300' : 'text-amber-400'
                }`}
              >
                {pickupCode}
              </div>

              <button
                onClick={handleCopyCode}
                className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] text-white transition-all border border-white/10 active:scale-95 cursor-pointer"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-amber-400 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied to Clipboard!' : 'Copy Code'}</span>
              </button>
            </div>

            {/* Real preparation time or pickup instruction */}
            <div className="flex items-center justify-between text-xs text-white/70 bg-white/[0.03] p-3 rounded-xl border border-white/[0.08]">
              <div className="flex items-center gap-1.5 text-white/60">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>Estimated Turnaround:</span>
              </div>
              <span className="font-mono font-bold text-amber-400">~{prepMinutes} mins</span>
            </div>

            {/* 4-Step Progress Stepper */}
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-4 gap-1.5 text-[9px] sm:text-[10px] text-center font-bold uppercase tracking-wider font-mono">
                {/* 1. Received */}
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 flex flex-col items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                  <span>Received</span>
                </div>
                {/* 2. Cooking */}
                <div
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    isRedeemed || isReady || isPreparing
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                      : 'bg-white/[0.02] text-white/30 border-white/5'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPreparing ? 'animate-spin text-amber-400' : ''}`} />
                  <span>Cooking</span>
                </div>
                {/* 3. Ready */}
                <div
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    isRedeemed || isReady
                      ? 'bg-amber-500/30 text-amber-200 border-amber-400/80 font-black shadow-[0_0_15px_rgba(245,158,11,0.4)] animate-pulse'
                      : 'bg-white/[0.02] text-white/30 border-white/5'
                  }`}
                >
                  <Ticket className="w-3.5 h-3.5 text-amber-400" />
                  <span>Ready</span>
                </div>
                {/* 4. Collected */}
                <div
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    isRedeemed
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-white/[0.02] text-white/30 border-white/5'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Done</span>
                </div>
              </div>
            </div>

            {/* Order Items Breakdown */}
            <div className="pt-4 border-t border-white/[0.08] text-left space-y-2">
              <span className="text-[11px] font-bold text-white/50 uppercase tracking-wider font-mono">
                Order Summary
              </span>
              <div className="space-y-1.5 text-xs text-white/80">
                {confirmedOrder.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center py-0.5">
                    <span className="truncate">
                      <span className="font-bold text-white font-mono">{it.quantity}x</span> {it.name}
                    </span>
                    <span className="font-mono text-white/60">₹{(it.price * it.quantity).toFixed(0)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-2 flex justify-between items-center border-t border-white/[0.08] font-bold text-sm text-white">
                <span>Total Amount</span>
                <span className="text-amber-400 font-mono text-base font-black">
                  ₹{confirmedOrder.totalAmount?.toFixed(0) || basketTotal}
                </span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="p-3 bg-white/[0.03] rounded-xl text-left text-[11px] text-white/60 flex items-center justify-between border border-white/[0.08]">
              <div>
                <span className="text-white/40">Customer:</span>{' '}
                <span className="text-white font-semibold">{confirmedOrder.customerName || customerName}</span>
              </div>
              <div>
                <span className="text-white/40">Payment:</span>{' '}
                <span className="text-amber-400 font-semibold font-mono">
                  {confirmedOrder.paymentMethod || paymentMethod} (Pay at Stall)
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={() => setIsViewingMenu(true)}
                className="w-full py-3 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/10 transition-all active:scale-98 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Browse Menu • Order More</span>
              </button>

              {isRedeemed && (
                <button
                  type="button"
                  onClick={handleClearActiveOrder}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition-all active:scale-98 shadow-xl shadow-amber-950/50 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>Start New Order</span>
                </button>
              )}
            </div>
          </div>
        </main>

        <footer className="w-full text-center py-4 border-t border-white/[0.08] text-[11px] text-white/40 relative z-10 font-mono">
          Powered by <span className="text-white font-bold">Dinely Food Cart OS</span> • Rapid Street Food Ordering
        </footer>
      </div>
    );
  }

  // -------------------------------------------------------------
  // VIEW: MAIN CUSTOMER MOBILE STOREFRONT (RESTAURANT OS LIQUID GLASS)
  // -------------------------------------------------------------
  return (
    <div className="min-h-screen font-sans pb-36 w-full max-w-full sm:max-w-md mx-auto relative sm:border-x border-white/[0.12] liquid-glass-viewport text-[#F7F7F5] shadow-2xl selection:bg-amber-500/30 overflow-x-hidden box-border min-w-0">
      {/* Dynamic Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 w-full max-w-full contain-paint">
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-[340px] sm:w-[380px] h-[340px] sm:h-[380px] rounded-full blur-[90px] bg-gradient-to-b from-amber-500/30 via-amber-400/15 to-transparent pointer-events-none opacity-80" />
        <div className="absolute top-[35%] right-0 translate-x-1/4 w-[280px] sm:w-[320px] h-[320px] sm:h-[360px] rounded-full blur-[95px] bg-gradient-to-tr from-amber-500/25 via-emerald-500/15 to-transparent pointer-events-none opacity-65" />
        <div className="absolute top-[65%] left-0 -translate-x-1/4 w-[280px] sm:w-[320px] h-[320px] sm:h-[360px] rounded-full blur-[100px] bg-gradient-to-tr from-emerald-500/20 via-amber-500/15 to-transparent pointer-events-none opacity-60" />
      </div>

      {/* Sticky Active Order Reminder Banner when customer is browsing menu */}
      {confirmedOrder && isViewingMenu && (
        <div
          onClick={() => setIsViewingMenu(false)}
          className="sticky top-0 z-50 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 px-4 py-2.5 flex items-center justify-between shadow-xl cursor-pointer hover:brightness-105 transition-all border-b border-amber-600/50"
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
                  ? 'bg-slate-950 text-amber-300 animate-pulse'
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
            <ChevronRight className="w-4 h-4 stroke-[3]" />
          </div>
        </div>
      )}

      {/* Atmospheric Luxury Street Food Hero */}
      <div className="relative h-48 sm:h-52 w-full max-w-full bg-[#11151B] overflow-hidden z-10 box-border">
        <img
          src={
            business?.theme?.bannerUrl ||
            'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80'
          }
          alt={cartName}
          className="w-full h-full object-cover brightness-[0.62] transition-all duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07090D] via-[#07090D]/60 to-black/30" />

        {/* Top Header Floating Liquid-Glass Badges */}
        <div className="absolute top-3.5 left-3.5 right-3.5 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full liquid-glass-pill text-[11px] text-white font-mono font-medium shadow-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="truncate">{isCartOpen ? 'Counter Station • Open' : 'Currently Closed'}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 rounded-full liquid-glass-pill text-[11px] text-amber-300 font-mono font-medium shadow-md">
              Prep: ~10m
            </span>
            {onNavigateStaff && (
              <button
                onClick={onNavigateStaff}
                className="px-3 py-1.5 rounded-full liquid-glass-pill hover:bg-white/[0.15] text-[11px] text-slate-300 hover:text-white transition-all shadow-md active:scale-95 cursor-pointer"
              >
                Staff POS
              </button>
            )}
          </div>
        </div>

        {/* Cart Branding Header Row */}
        <div className="absolute bottom-3.5 left-3.5 right-3.5 flex items-end gap-3 z-10">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border border-white/20 shadow-2xl bg-[#080A0D] shrink-0 flex items-center justify-center">
            {business?.theme?.logo ? (
              <img
                src={business.theme.logo}
                alt={cartName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-500/20 to-emerald-500/20 flex items-center justify-center text-amber-400">
                <Truck className="w-7 h-7" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl font-bold text-white tracking-tight truncate drop-shadow-md">
              {cartName}
            </h1>
            <div className="text-[11px] text-white/70 font-medium flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full liquid-glass-pill text-amber-400 font-semibold text-[10px]">
                <Star className="w-3 h-3 fill-amber-400" />
                <span>4.9</span>
              </span>
              <span>•</span>
              <span className="text-white/60 truncate">
                {business?.description || 'Authentic Street Food & Snacks'}
              </span>
              <span>•</span>
              <span className="text-emerald-400 font-mono text-[10px]">Takeaway Pickup</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action & Category Liquid-Glass Sticky Dock */}
      <div className="sticky top-0 z-30 px-3.5 py-2.5 bg-[#07090D]/85 backdrop-blur-2xl border-b border-white/[0.10] shadow-xl w-full max-w-full box-border space-y-2">
        {/* Dietary Filters & Search Button */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setDietaryFilter('ALL')}
              className={`text-xs px-3 py-1 rounded-xl font-bold whitespace-nowrap transition-all border cursor-pointer active:scale-95 ${
                dietaryFilter === 'ALL'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-950/40'
                  : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setDietaryFilter('VEG')}
              className={`text-xs px-3 py-1 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border cursor-pointer active:scale-95 ${
                dietaryFilter === 'VEG'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-950/40'
                  : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Pure Veg
            </button>
            <button
              onClick={() => setDietaryFilter('NON_VEG')}
              className={`text-xs px-3 py-1 rounded-xl font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border cursor-pointer active:scale-95 ${
                dietaryFilter === 'NON_VEG'
                  ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-950/40'
                  : 'bg-white/[0.04] text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Non-Veg
            </button>
          </div>

          <button
            onClick={() => setIsSearchVisible((v) => !v)}
            className={`p-1.5 rounded-xl transition-all border cursor-pointer active:scale-95 ${
              isSearchVisible ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-white/[0.05] text-slate-300 hover:text-white border-white/10'
            }`}
            title="Search dishes"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Collapsible Search Input */}
        {isSearchVisible && (
          <div className="relative animate-in fade-in slide-in-from-top-2 duration-200">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search rolls, fries, burgers, drinks..."
              className="w-full pl-9 pr-9 py-2 bg-white/[0.05] border border-white/15 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-all shadow-inner backdrop-blur-xl"
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

        {/* Category Horizontal Scrolling Tabs */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none pt-0.5">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`text-[11px] px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({menuItems.length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`text-[11px] px-2.5 py-1 rounded-lg font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat.key
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Dishes List */}
      <main className="px-3.5 py-4 space-y-3 flex-1 relative z-10 w-full max-w-full box-border">
        {/* Loading State */}
        {isLoadingMenu && (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-mono">Loading {cartName} menu...</p>
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
              className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-xs font-bold text-white transition-all shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty Menu State */}
        {!isLoadingMenu && !menuError && filteredItems.length === 0 && (
          <div className="py-20 text-center space-y-2 rounded-2xl bg-white/[0.02] border border-white/5 p-6">
            <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">No dishes match your filter</p>
            <p className="text-xs text-slate-500">Try changing categories or clearing search keywords.</p>
          </div>
        )}

        {/* Food Item Cards: Liquid-Glass Horizontal Layout (Matching Restaurant OS) */}
        {!isLoadingMenu && !menuError && (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const inBasket = basket.find((b) => b.item.id === item.id);
              const isOutOfStock = item.isAvailable === false;
              const isVeg = item.isVegetarian !== false;
              const dishImage = getStreetFoodDishImage(item);

              return (
                <div
                  key={item.id}
                  className={`p-3 sm:p-4 flex gap-3 sm:gap-3.5 transition-all duration-300 rounded-3xl liquid-glass-card shadow-xl w-full max-w-full min-w-0 box-border overflow-hidden border border-white/20 hover:border-white/35 hover:shadow-[0_20px_50px_rgba(0,0,0,0.7)] ${
                    isOutOfStock ? 'opacity-50 border-white/[0.08]' : 'active:scale-[0.99]'
                  }`}
                >
                  {/* High Quality Food Photo */}
                  <div className="relative shrink-0">
                    <img
                      src={dishImage}
                      alt={item.name}
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&auto=format&fit=crop&q=80';
                      }}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-white/25 shadow-lg bg-[#11151B] shrink-0 ring-1 ring-white/10"
                    />
                  </div>

                  {/* Dish Details */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between overflow-hidden py-0.5">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold font-mono shrink-0 shadow-sm ${
                              isVeg
                                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                                : 'border-rose-500/50 bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            <span>{isVeg ? 'VEG' : 'NON-VEG'}</span>
                          </span>
                          <h3 className="text-[15px] sm:text-base font-bold text-white tracking-tight truncate font-display">
                            {item.name}
                          </h3>
                        </div>

                        {isOutOfStock && (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-rose-500/25 text-rose-300 border border-rose-500/40 font-bold shrink-0">
                            SOLD OUT
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-[11px] sm:text-xs text-white/65 line-clamp-2 mt-1 leading-relaxed font-normal">
                          {item.description}
                        </p>
                      )}
                    </div>

                    {/* Bottom Price & Add/Counter */}
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.10] gap-1.5 min-w-0">
                      <span className="text-sm sm:text-base font-mono font-black text-amber-300 shrink-0 tracking-tight drop-shadow-[0_1px_6px_rgba(245,158,11,0.35)]">
                        ₹{item.price}
                      </span>

                      <div className="shrink-0">
                        {!isOutOfStock && (
                          inBasket ? (
                            <div
                              className="flex items-center gap-1 liquid-glass-pill border-amber-400/60 rounded-xl p-1 shadow-md shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => handleUpdateQuantity(item.id, -1)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-300 hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="w-3.5 h-3.5 stroke-[3]" />
                              </button>
                              <span className="font-mono text-xs font-extrabold text-white min-w-[18px] text-center">
                                {inBasket.quantity}
                              </span>
                              <button
                                onClick={() => handleUpdateQuantity(item.id, 1)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-300 hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
                                aria-label="Increase quantity"
                              >
                                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleAddToBasket(item)}
                              className="px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-md shadow-amber-950/40 cursor-pointer active:scale-95 transition-all"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Add</span>
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar (Restaurant OS Liquid-Glass Pill) */}
      {basketCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 z-40 px-3.5 pointer-events-none">
          <div className="max-w-md mx-auto w-full pointer-events-auto">
            <button
              onClick={() => setIsCheckoutOpen(true)}
              className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-black flex items-center justify-between shadow-2xl shadow-amber-950/60 hover:brightness-105 active:scale-[0.98] transition-all border border-amber-300/40 cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-xl bg-slate-950 text-amber-400 flex items-center justify-center text-xs font-mono font-black shadow-inner">
                  {basketCount}
                </span>
                <span className="text-sm tracking-tight font-black">View Order Summary</span>
              </div>
              <div className="flex items-center gap-1 text-sm font-mono font-black">
                <span>₹{basketTotal.toFixed(0)}</span>
                <ChevronRight className="w-4 h-4 ml-1 stroke-[3]" />
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Checkout Drawer / Modal (Liquid-Glass Sheet) */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0F141C]/95 liquid-glass-card border-x-0 border-b-0 sm:border rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
            {/* Top Amber Radiant Highlight */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-64 h-24 bg-amber-500/20 blur-2xl pointer-events-none rounded-full" />

            {/* Drawer Header */}
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02] relative z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white tracking-tight">Your Pickup Order</h2>
                  <p className="text-[10px] text-white/50 font-mono">Counter Collection • {cartName}</p>
                </div>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white flex items-center justify-center transition-all cursor-pointer border border-white/10 active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form & Items Container */}
            <form onSubmit={handleSubmitOrder} className="flex-1 overflow-y-auto p-4 space-y-4 relative z-10">
              {/* Items List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono font-bold text-white/50 uppercase tracking-wider">
                  <span>Selected Dishes ({basketCount})</span>
                  <button
                    type="button"
                    onClick={() => { setBasket([]); setIsCheckoutOpen(false); }}
                    className="text-white/40 hover:text-rose-400 transition-colors text-[10px]"
                  >
                    Clear All
                  </button>
                </div>

                <div className="space-y-2 divide-y divide-white/[0.06]">
                  {basket.map(({ item, quantity }) => (
                    <div key={item.id} className="pt-2 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-sm border flex items-center justify-center shrink-0 ${
                              item.isVegetarian !== false
                                ? 'border-emerald-500 bg-emerald-950/40'
                                : 'border-rose-500 bg-rose-950/40'
                            }`}
                          >
                            <span
                              className={`w-1 h-1 rounded-full ${
                                item.isVegetarian !== false ? 'bg-emerald-400' : 'bg-rose-400'
                              }`}
                            />
                          </span>
                          <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                        </div>
                        <span className="text-[11px] text-amber-400 font-mono font-bold pl-4">₹{item.price.toFixed(0)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 liquid-glass-pill rounded-xl p-1 shrink-0 border-white/10">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.id, -1)}
                          className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/80 active:scale-90 transition-all cursor-pointer"
                        >
                          <Minus className="w-3 h-3 stroke-[3]" />
                        </button>
                        <span className="text-xs font-mono font-black text-white w-5 text-center">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.id, 1)}
                          className="w-6 h-6 rounded-lg bg-amber-500 hover:bg-amber-400 flex items-center justify-center text-slate-950 font-black active:scale-90 transition-all cursor-pointer"
                        >
                          <Plus className="w-3 h-3 stroke-[3]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-mono font-bold text-white/60 tracking-wider block">
                  Select Payment Option at Counter
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CASH')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                      paymentMethod === 'CASH'
                        ? 'bg-amber-500/15 border-amber-400/60 shadow-lg shadow-amber-950/30'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] text-white/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Banknote className={`w-4 h-4 ${paymentMethod === 'CASH' ? 'text-amber-400' : 'text-white/40'}`} />
                      <span className={`w-2 h-2 rounded-full ${paymentMethod === 'CASH' ? 'bg-amber-400 ring-4 ring-amber-400/20' : 'bg-white/20'}`} />
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${paymentMethod === 'CASH' ? 'text-white' : 'text-white/80'}`}>Cash at Counter</p>
                      <p className="text-[10px] text-white/40 leading-tight">Pay notes/coins when food is ready</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('UPI')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                      paymentMethod === 'UPI'
                        ? 'bg-amber-500/15 border-amber-400/60 shadow-lg shadow-amber-950/30'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] text-white/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <QrCode className={`w-4 h-4 ${paymentMethod === 'UPI' ? 'text-amber-400' : 'text-white/40'}`} />
                      <span className={`w-2 h-2 rounded-full ${paymentMethod === 'UPI' ? 'bg-amber-400 ring-4 ring-amber-400/20' : 'bg-white/20'}`} />
                    </div>
                    <div>
                      <p className={`text-xs font-bold ${paymentMethod === 'UPI' ? 'text-white' : 'text-white/80'}`}>UPI / QR Code</p>
                      <p className="text-[10px] text-white/40 leading-tight">Scan GPay, PhonePe or Paytm</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Customer Required Name Field */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-white/70 block font-mono tracking-wider">
                  Your Calling Name <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-white/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your name (e.g. Rahul S)"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-white/[0.04] border border-white/15 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-400 focus:bg-white/[0.07] transition-all"
                  />
                </div>
              </div>

              {/* Optional Phone & Cooking Notes Accordion */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowCustomization((prev) => !prev)}
                  className="w-full py-2 px-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 text-[11px] font-medium text-white/60 hover:text-white flex items-center justify-between transition-all cursor-pointer"
                >
                  <span>{showCustomization ? 'Hide special requests' : '+ Add phone or cooking notes'}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCustomization ? 'rotate-180' : ''}`} />
                </button>

                {showCustomization && (
                  <div className="mt-2.5 p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5 animate-in fade-in duration-200">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-white/50 block mb-1 font-mono">
                        Mobile Number (Optional SMS alert)
                      </label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="e.g. 9876543210"
                          className="w-full pl-8 pr-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] uppercase font-bold text-white/50 block mb-1 font-mono">
                        Special Instructions / Cooking Notes
                      </label>
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="e.g. Extra crispy, less spicy, pack separately"
                        className="w-full px-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="p-3.5 bg-white/[0.03] rounded-2xl border border-white/10 space-y-1.5 text-xs">
                <div className="flex justify-between text-white/60">
                  <span>Subtotal ({basketCount} items)</span>
                  <span className="font-mono text-white font-medium">₹{basketTotal.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-white/60">
                  <span>Cart Packaging & Pickup</span>
                  <span className="text-amber-400 font-bold uppercase text-[10px] font-mono">Free</span>
                </div>
                <div className="pt-2 border-t border-white/10 flex justify-between font-bold text-sm text-white">
                  <span>Total Payable at Counter</span>
                  <span className="text-amber-400 font-mono text-base font-black">₹{basketTotal.toFixed(0)}</span>
                </div>
              </div>

              {submitError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Checkout Submit CTA */}
              <div className="pt-1 pb-2">
                <button
                  type="submit"
                  disabled={isSubmitting || basket.length === 0}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-2xl shadow-amber-950/60 disabled:opacity-50 hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer font-sans tracking-tight"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                      <span>Transmitting Order to {cartName}...</span>
                    </>
                  ) : (
                    <>
                      <Ticket className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                      <span>Confirm Order • ₹{basketTotal.toFixed(0)}</span>
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
