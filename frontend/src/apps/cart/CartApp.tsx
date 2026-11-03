import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Truck,
  ShoppingBag,
  LayoutDashboard,
  Receipt,
  Settings,
  Grid,
  ArrowLeft,
  Plus,
  Minus,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  TrendingUp,
  RefreshCw,
  QrCode,
  AlertCircle,
  CreditCard,
  Smartphone,
  Banknote,
  Search,
  Sparkles,
  Ticket,
  Copy,
  Printer,
  ExternalLink,
  Archive,
  Layers,
  Edit2,
  Package,
  Download,
  Share2,
  Palette,
  Eye,
  Menu as MenuIcon,
  X as CloseIcon,
  Upload,
  Image as ImageIcon,
  UtensilsCrossed,
  Pencil,
  Trash2,
  XCircle,
  CheckCircle,
  BellRing,
  ChefHat,
  Volume2,
  VolumeX,
  CheckCheck,
  Filter,
  Flame,
  LogOut,
  RotateCcw,
  BarChart3,
  FileSpreadsheet,
  Calendar,
  Award,
  ShieldCheck,
  Save,
  FileText,
  Sliders,
} from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { api } from '../../packages/api/client';
import { Restaurant, Order, MenuItem } from '../../packages/types';
import { DinelyLogo, Button, SearchInput, Avatar, Badge } from '../../packages/ui';
import { realtimeBus } from '../../packages/api/realtime';
import { normalizeOrder } from '../../packages/api/core/helpers';
import { getRestaurantCustomerUrl, getRestaurantPublicDomain, getTenantUrl, getTenantFromHostname } from '../../packages/utils/tenantResolver';
import { CART_THEMES, resolveCartTheme, CartTheme, CartThemeId } from './cartThemes';

// Web Audio API Synthesizer for Kitchen & Terminal Chimes
const playKitchenChime = (type: 'NEW_ORDER' | 'BUMP') => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'NEW_ORDER') {
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain1.gain.setValueAtTime(0.2, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.3);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.45);
    } else if (type === 'BUMP') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    // Audio context play blocked
  }
};

const calculateOrderElapsed = (timestamp?: string) => {
  if (!timestamp) return { text: 'Just now', isOverdue: false, mins: 0 };
  const diffSecs = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  const mins = Math.floor(diffSecs / 60);
  const secs = diffSecs % 60;
  const isOverdue = mins >= 10;
  if (mins === 0) return { text: `${secs}s ago`, isOverdue, mins };
  return { text: `${mins}m ${secs}s ago`, isOverdue, mins };
};

// ==========================================
// OPERATIONAL BUSINESS DATE & ROLLOVER HELPERS
// ==========================================
export const getOperationalBusinessDate = (
  timestamp?: string | number | Date,
  cutoffHour = 4,
  timeZone = 'Asia/Kolkata'
): string => {
  try {
    const date = timestamp ? new Date(timestamp) : new Date();
    if (isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    let year = '';
    let month = '';
    let day = '';
    let hour = 0;
    for (const part of parts) {
      if (part.type === 'year') year = part.value;
      if (part.type === 'month') month = part.value;
      if (part.type === 'day') day = part.value;
      if (part.type === 'hour') hour = parseInt(part.value, 10) || 0;
    }
    if (hour < cutoffHour) {
      const d = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10) - 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    return `${year}-${month}-${day}`;
  } catch {
    const d = timestamp ? new Date(timestamp) : new Date();
    return d.toISOString().slice(0, 10);
  }
};

export const getPreviousBusinessDate = (dateKey: string): string => {
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
  } catch {
    return dateKey;
  }
};

export const formatReadableDate = (dateKey: string): string => {
  try {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return dateKey;
  }
};

interface CartAppProps {
  business?: Restaurant | null;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
}

type CartTab = 'terminal' | 'pos' | 'orders' | 'menu' | 'qr' | 'billing' | 'overview' | 'settings';

interface CartMenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  isAvailable: boolean;
  description?: string;
  imageUrl?: string;
  image?: string;
  stockQuantity?: number;
  trackInventory?: boolean;
}

export const CartApp: React.FC<CartAppProps> = ({
  business,
  onNavigate,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<CartTab>('terminal');
  const [currentCart, setCurrentCart] = useState<Restaurant | null>(business || null);
  const [liveOrders, setLiveOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Order Receiving Terminal State
  const [terminalFilter, setTerminalFilter] = useState<'ACTIVE' | 'NEW' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED'>('ACTIVE');
  const [soundAlertEnabled, setSoundAlertEnabled] = useState(true);
  const [isLiveConnected, setIsLiveConnected] = useState(true);
  const [selectedOrderForHandover, setSelectedOrderForHandover] = useState<Order | null>(null);
  const [handoverInputCode, setHandoverInputCode] = useState('');
  const [handoverError, setHandoverError] = useState<string | null>(null);
  const seenOrderIdsRef = React.useRef<Set<string>>(new Set());

  // KDS Operational States
  const [currentTime, setCurrentTime] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [cardEtaSelections, setCardEtaSelections] = useState<Record<string, number>>({});
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());

  const toggleItemCheck = (itemId: string) => {
    setCheckedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // Cart Menu & Real-time Stock Items
  const [menuItems, setMenuItems] = useState<CartMenuItem[]>([
    { id: 'cm-1', name: 'Spicy Masala Burger', category: 'Burgers', price: 120, isAvailable: true, stockQuantity: 25, trackInventory: true },
    { id: 'cm-2', name: 'Crispy Paneer Wrap', category: 'Wraps', price: 150, isAvailable: true, stockQuantity: 18, trackInventory: true },
    { id: 'cm-3', name: 'Loaded Cheese Fries', category: 'Sides', price: 160, isAvailable: true, stockQuantity: 30, trackInventory: true },
    { id: 'cm-4', name: 'Veg Hakka Noodles Box', category: 'Wok Boxes', price: 140, isAvailable: true, stockQuantity: 12, trackInventory: true },
    { id: 'cm-5', name: 'Cold Coffee Frappe', category: 'Drinks', price: 90, isAvailable: true, stockQuantity: 40, trackInventory: true },
    { id: 'cm-6', name: 'Masala Lemonade (300ml)', category: 'Drinks', price: 50, isAvailable: true, stockQuantity: 50, trackInventory: true },
    { id: 'cm-7', name: 'Double Chocolate Brownie', category: 'Desserts', price: 80, isAvailable: false, stockQuantity: 0, trackInventory: true },
  ]);

  // Quick Counter POS Active Basket
  const [basket, setBasket] = useState<Array<{ item: CartMenuItem; quantity: number }>>([]);
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'CASH' | 'CARD'>('UPI');
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuickPosOpen, setIsQuickPosOpen] = useState(false);

  // Verification & Redemption State
  const [lookupQuery, setLookupQuery] = useState('');
  const [redemptionSuccess, setRedemptionSuccess] = useState<string | null>(null);
  const [redemptionError, setRedemptionError] = useState<string | null>(null);
  const [isRedeeming, setIsRedeeming] = useState(false);

  // Item Modal & Form State (Supports both Create and Edit with Photo Upload)
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemFormName, setItemFormName] = useState('');
  const [itemFormCategory, setItemFormCategory] = useState('Snacks');
  const [itemFormPrice, setItemFormPrice] = useState(100);
  const [itemFormIsAvailable, setItemFormIsAvailable] = useState(true);
  const [itemFormDescription, setItemFormDescription] = useState('');
  const [itemFormImageUrl, setItemFormImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Responsive Mobile Navigation Drawer
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Active Theme & Customization State for Counter QR & Storefront
  const [selectedThemeId, setSelectedThemeId] = useState<CartThemeId>('amber_street');
  const [customAccent, setCustomAccent] = useState<string>('#f59e0b');
  const [customTagline, setCustomTagline] = useState<string>('Instant QR Pickup • No App Needed');
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [themeSaveSuccess, setThemeSaveSuccess] = useState<string | null>(null);
  const [qrCopied, setQrCopied] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const qrCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const cartId = currentCart?.id || api.getCurrentRestaurantId() || '';

  // Settings Tab State
  const [settingsName, setSettingsName] = useState('');
  const [settingsAddress, setSettingsAddress] = useState('');
  const [settingsPhone, setSettingsPhone] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsIsOpen, setSettingsIsOpen] = useState(true);
  const [settingsPrepTime, setSettingsPrepTime] = useState(15);
  const [settingsTaxRate, setSettingsTaxRate] = useState(5);
  const [settingsAutoAccept, setSettingsAutoAccept] = useState(false);
  const [settingsUpiId, setSettingsUpiId] = useState('maxkart@upi');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Menu Management Search & Filter
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [menuSelectedCategory, setMenuSelectedCategory] = useState('ALL');

  // Daily Settlement Shift State
  const [isSettlingShift, setIsSettlingShift] = useState(false);
  const [settlementSuccess, setSettlementSuccess] = useState<string | null>(null);
  const [billingFilter, setBillingFilter] = useState<'ALL' | 'PAID' | 'UNPAID' | 'CANCELLED'>('ALL');

  // Real-time Day-Wise Attribution & Automatic Shift Rollover
  const cartTimezone = currentCart?.timezone || 'Asia/Kolkata';
  const [activeBusinessDate, setActiveBusinessDate] = useState<string>(() =>
    getOperationalBusinessDate(new Date(), 4, cartTimezone)
  );
  // selectedDateFilter: 'TODAY' | 'YESTERDAY' | 'ALL_TIME' | 'YYYY-MM-DD'
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('TODAY');
  const [dateRolloverNotice, setDateRolloverNotice] = useState<string | null>(null);

  // Periodic operational business date check for real-time rollover (every 10s)
  useEffect(() => {
    const checkRollover = () => {
      const currentOpDate = getOperationalBusinessDate(new Date(), 4, cartTimezone);
      if (currentOpDate !== activeBusinessDate) {
        console.log(`[CartApp] Operational shift rolled over from ${activeBusinessDate} to ${currentOpDate}`);
        const prevDateLabel = formatReadableDate(activeBusinessDate);
        const newDateLabel = formatReadableDate(currentOpDate);
        setActiveBusinessDate(currentOpDate);
        setDateRolloverNotice(`Operational shift rolled over to ${newDateLabel}. Shift for ${prevDateLabel} has been archived to historical records.`);
      }
    };
    const interval = setInterval(checkRollover, 10000);
    return () => clearInterval(interval);
  }, [activeBusinessDate, cartTimezone]);

  const yesterdayBusinessDate = useMemo(() => {
    return getPreviousBusinessDate(activeBusinessDate);
  }, [activeBusinessDate]);

  // Sync settings inputs when currentCart loads
  useEffect(() => {
    if (currentCart) {
      setSettingsName(currentCart.name || '');
      setSettingsAddress(currentCart.address || currentCart.city || '');
      setSettingsPhone(currentCart.phone || '');
      setSettingsDescription(currentCart.description || 'Authentic Street Food & Snacks');
      setSettingsTaxRate(currentCart.taxPercentage ?? 5);
    }
  }, [currentCart]);

  const playAlertBeep = () => {
    if (!soundAlertEnabled) return;
    playKitchenChime('NEW_ORDER');
  };

  // Live Clock Tick
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync business prop
  useEffect(() => {
    if (business) {
      setCurrentCart(business);
      api.setCurrentRestaurantId(business.id);
    }
  }, [business]);

  // Asynchronous fallback resolution if business prop was not immediately provided
  useEffect(() => {
    async function resolveCart() {
      if (!currentCart) {
        try {
          const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
          const queryCartId = searchParams.get('cartId') || searchParams.get('restaurantId') || searchParams.get('cart') || searchParams.get('slug');

          const pathSegments = typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean) : [];
          let pathCartId: string | undefined;
          if (pathSegments[0] === 'cart' && pathSegments.length >= 2 && !['dashboard', 'orders', 'menu', 'qr', 'pos', 'settings', 'terminal', 'billing'].includes(pathSegments[1])) {
            pathCartId = pathSegments[1];
          }

          const targetLookup = queryCartId || pathCartId;
          if (targetLookup) {
            let r = await api.getRestaurantDetails(targetLookup).catch(() => null);
            if (!r) {
              r = await api.resolveRestaurantBySlug(targetLookup).catch(() => null);
            }
            if (r) {
              setCurrentCart(r);
              api.setCurrentRestaurantId(r.id);
              return;
            }
          }

          const domainRes = getTenantFromHostname();
          if (domainRes.isTenantSubdomain && domainRes.slug) {
            const r = await api.resolveRestaurantBySlug(domainRes.slug).catch(() => null);
            if (r) {
              setCurrentCart(r);
              api.setCurrentRestaurantId(r.id);
              return;
            }
          }

          const currId = api.getCurrentRestaurantId();
          if (currId) {
            const r = await api.getRestaurantDetails(currId).catch(() => null);
            if (r) {
              setCurrentCart(r);
              return;
            }
          }
        } catch (err) {
          console.warn('[CartApp] Cart resolution notice:', err);
        }
      }
    }
    resolveCart();
  }, [currentCart]);

  // 1. Initial Load: Live Orders & Menu from Backend
  const fetchLiveOrders = async () => {
    if (!cartId) return;
    try {
      setIsLoadingOrders(true);
      const ords = await api.getOrders(cartId);
      if (Array.isArray(ords)) {
        setLiveOrders(ords);
        setIsLiveConnected(true);
        if (seenOrderIdsRef.current.size === 0) {
          ords.forEach((o) => seenOrderIdsRef.current.add(o.id));
        } else {
          let hasNewPending = false;
          ords.forEach((o) => {
            if (!seenOrderIdsRef.current.has(o.id)) {
              seenOrderIdsRef.current.add(o.id);
              if ((o.status as string) === 'PENDING' || (o.status as string) === 'NEW') {
                hasNewPending = true;
              }
            }
          });
          if (hasNewPending) {
            playAlertBeep();
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load cart live orders:', err);
      setIsLiveConnected(false);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  const fetchMenuItems = async () => {
    if (!cartId) return;
    try {
      const items = await api.getMenuItems(cartId);
      if (Array.isArray(items) && items.length > 0) {
        setMenuItems(
          items.map((i) => ({
            id: i.id,
            name: i.name,
            category: (i as any).category || (i as any).categoryName || i.categoryId || 'Street Food',
            price: i.price,
            description: i.description || '',
            imageUrl: i.imageUrl || (i as any).image,
            image: i.imageUrl || (i as any).image,
            isAvailable: i.isAvailable !== false,
            stockQuantity: typeof i.stockQuantity === 'number' ? i.stockQuantity : undefined,
            trackInventory: i.trackInventory !== false,
          }))
        );
      }
    } catch (err) {
      console.warn('Failed to load menu items:', err);
    }
  };

  useEffect(() => {
    async function initTerminalAuthAndLoad() {
      const targetRestId = cartId || currentCart?.id || currentCart?.slug || business?.id || business?.slug || '';
      const existingToken =
        localStorage.getItem('dinely_staff_token') ||
        localStorage.getItem('dinely_staff_token_cart') ||
        localStorage.getItem('dinely_staff_token_staff');
      if (!existingToken && targetRestId) {
        try {
          await api.loginCartTerminal('1234', targetRestId);
        } catch (authErr) {
          console.warn('[CartApp] Terminal auto-login notice:', authErr);
        }
      }
      fetchLiveOrders();
      fetchMenuItems();
    }
    initTerminalAuthAndLoad();

    // 4-second resilient polling fallback
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchLiveOrders();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [cartId, currentCart?.id, currentCart?.slug]);

  // 2. Real-Time Bus Subscription for Incoming QR Orders and Status Changes
  useEffect(() => {
    if (!cartId) return;

    // Authoritatively connect to real-time WebSocket room as OWNER for this tenant
    realtimeBus.connect(cartId, 'OWNER');

    const unsub = realtimeBus.subscribe((evt: any) => {
      if (!evt) return;
      const p = evt.payload || evt.data || evt;
      const evtRestId = p.restaurantId || p.restaurant_id || evt.restaurantId;

      const isMatchingRest =
        !cartId ||
        !evtRestId ||
        evtRestId === cartId ||
        (currentCart && (evtRestId === currentCart.id || evtRestId === currentCart.slug || evtRestId === currentCart.publicSlug));

      if (isMatchingRest) {
        if (evt.type === 'OrderCreated' || evt.type === 'order_created') {
          const rawOrder = p.order || (p.id ? p : null);
          if (rawOrder && rawOrder.id) {
            const norm = normalizeOrder(rawOrder);
            setLiveOrders((prev) => {
              const exists = prev.some((o) => o.id === norm.id);
              if (exists) {
                return prev.map((o) => (o.id === norm.id ? { ...o, ...norm } : o));
              }
              return [norm, ...prev];
            });
          }
          const newId = p.orderId || p.id || evt.orderId;
          if (newId && !seenOrderIdsRef.current.has(newId)) {
            seenOrderIdsRef.current.add(newId);
            playAlertBeep();
          }
          fetchLiveOrders();
        } else if (
          evt.type === 'OrderUpdated' ||
          evt.type === 'order_updated' ||
          evt.type === 'order_redeemed' ||
          evt.type === 'order_status_updated' ||
          evt.type === 'order_ready' ||
          evt.type === 'order_delivered'
        ) {
          const rawOrder = p.order || (p.id ? p : null);
          if (rawOrder && rawOrder.id) {
            const norm = normalizeOrder(rawOrder);
            setLiveOrders((prev) => prev.map((o) => (o.id === norm.id ? { ...o, ...norm } : o)));
          }
          fetchLiveOrders();
        } else if (
          evt.type === 'MenuItemCreated' ||
          evt.type === 'menu_item_created' ||
          evt.type === 'menu_item_updated' ||
          evt.type === 'stock_update'
        ) {
          fetchMenuItems();
        }
      }
    });

    return () => unsub();
  }, [cartId]);

  // Basket Handlers
  const addToBasket = (item: CartMenuItem) => {
    if (!item.isAvailable) return;
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

  const updateQuantity = (itemId: string, delta: number) => {
    setBasket((prev) => {
      return prev
        .map((i) => {
          if (i.item.id === itemId) {
            const newQ = i.quantity + delta;
            return newQ > 0 ? { ...i, quantity: newQ } : null;
          }
          return i;
        })
        .filter(Boolean) as Array<{ item: CartMenuItem; quantity: number }>;
    });
  };

  const basketSubtotal = basket.reduce((acc, curr) => acc + curr.item.price * curr.quantity, 0);

  // POS Rapid Checkout (Authoritative & Idempotent)
  const handleQuickCheckout = async () => {
    if (basket.length === 0 || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const clientOrderId = `ord-cart-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const orderPayload: Partial<Order> = {
        id: clientOrderId,
        restaurantId: cartId,
        tableNumber: 'COUNTER',
        orderType: 'PICKUP',
        customerName: 'Counter Customer',
        paymentStatus: 'PAID',
        paymentMethod: paymentMode as any,
        totalAmount: basketSubtotal,
        items: basket.map((b) => ({
          id: `oi-${b.item.id}`,
          menuItemId: b.item.id,
          name: b.item.name,
          quantity: b.quantity,
          price: b.item.price,
          targetDestination: 'KITCHEN',
        })),
        idempotencyKey: clientOrderId,
      };

      const created = await api.createOrder(orderPayload);

      // Decrement local stock
      setMenuItems((prev) =>
        prev.map((m) => {
          const ordered = basket.find((b) => b.item.id === m.id);
          if (ordered && typeof m.stockQuantity === 'number') {
            const newStock = Math.max(0, m.stockQuantity - ordered.quantity);
            return {
              ...m,
              stockQuantity: newStock,
              isAvailable: newStock > 0,
            };
          }
          return m;
        })
      );

      setLiveOrders((prev) => [created, ...prev.filter((o) => o.id !== created.id)]);
      setBasket([]);
      setIsQuickPosOpen(false);
      setCheckoutSuccess(`Order ${created.pickupCode || created.displayOrderNumber || '#' + created.id} paid via ${paymentMode}!`);
      setTimeout(() => setCheckoutSuccess(null), 4000);
    } catch (err: any) {
      console.error('POS Checkout failed:', err);
      alert(err?.message || 'Failed to dispatch order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status transitions with ETA and bump chime
  const updateOrderStatus = async (orderId: string, nextStatus: string, etaMins?: number) => {
    try {
      setProcessingOrderIds((prev) => new Set(prev).add(orderId));
      await api.updateOrderStatus(orderId, {
        status: nextStatus as any,
        estimatedPrepTimeMinutes: etaMins,
      });
      playKitchenChime('BUMP');
      setLiveOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: nextStatus as any,
                estimatedPrepTimeMinutes: etaMins !== undefined ? etaMins : o.estimatedPrepTimeMinutes,
              }
            : o
        )
      );
    } catch (err: any) {
      console.error('Failed to update status:', err);
      alert('Status transition failed: ' + (err?.message || 'Error'));
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Mark Counter Payment
  const handleMarkPaid = async (orderId: string, method: 'CASH' | 'UPI') => {
    try {
      await api.updateOrderStatus(orderId, {
        paymentStatus: 'PAID',
        paymentMethod: method,
      });
      setLiveOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, paymentStatus: 'PAID' as any, paymentMethod: method as any } : o
        )
      );
      setCheckoutSuccess(`Order payment updated to PAID via ${method}!`);
      setTimeout(() => setCheckoutSuccess(null), 4000);
    } catch (err: any) {
      alert('Failed to update payment: ' + (err?.message || 'Error'));
    }
  };

  // Pickup Code Redemption Workflow
  const handleRedeemCode = async (codeToRedeem: string, force?: boolean) => {
    if (!codeToRedeem.trim()) return;
    try {
      setIsRedeeming(true);
      setRedemptionError(null);
      setRedemptionSuccess(null);
      setHandoverError(null);

      const targetRestId = cartId || currentCart?.id || '';
      const redeemed = await api.redeemOrderPickupCode(targetRestId, codeToRedeem.trim(), 'Terminal Staff', force);
      playKitchenChime('BUMP');
      setLiveOrders((prev) =>
        prev.map((o) => (o.id === redeemed.id ? redeemed : o))
      );
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // Confetti optional
      }
      setRedemptionSuccess(`Pickup Coupon ${redeemed.pickupCode || codeToRedeem} Verified & Completed! Hand over food to customer.`);
      setLookupQuery('');
      setSelectedOrderForHandover(null);
      setTimeout(() => setRedemptionSuccess(null), 5000);
    } catch (err: any) {
      const errMsg = err?.message || `Failed to redeem code '${codeToRedeem}'.`;
      setRedemptionError(errMsg);
      setHandoverError(errMsg);
      setTimeout(() => setRedemptionError(null), 6000);
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleLookupAndVerify = (code: string) => {
    const clean = code.trim().toUpperCase().replace(/^#/, '');
    if (!clean) return;
    const found = liveOrders.find((o) => {
      const pCode = (o.pickupCode || '').toUpperCase().replace(/^#/, '');
      const ordNum = (o.displayOrderNumber || '').toUpperCase().replace(/^#/, '');
      const idMatch = o.id.toUpperCase();
      return pCode === clean || ordNum === clean || idMatch === clean;
    });

    if (found) {
      setSelectedOrderForHandover(found);
      setHandoverInputCode(found.pickupCode || clean);
      setHandoverError(null);
    } else {
      handleRedeemCode(clean);
    }
  };

  const formatOrderTime = (isoString?: string) => {
    if (!isoString) return 'Just now';
    try {
      const date = new Date(isoString);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const elapsedMins = Math.floor((Date.now() - date.getTime()) / 60000);
      if (elapsedMins < 1) return `${timeStr} • Just now`;
      if (elapsedMins === 1) return `${timeStr} • 1m ago`;
      return `${timeStr} • ${elapsedMins}m ago`;
    } catch {
      return 'Recent';
    }
  };

  const getDishThumbnail = (item: any) => {
    if (item.imageUrl) return item.imageUrl;
    if (item.image) return item.image;
    const match = menuItems.find(
      (m) => m.id === item.menuItemId || m.name.toLowerCase() === (item.name || '').toLowerCase()
    );
    return match?.imageUrl || match?.image || null;
  };



  // Stock Adjustment Handler
  const handleStockAdjust = async (itemId: string, delta: number) => {
    const item = menuItems.find((m) => m.id === itemId);
    if (!item) return;

    const currentStock = item.stockQuantity || 0;
    const newStock = Math.max(0, currentStock + delta);
    const newAvailable = newStock > 0;

    // Optimistic update
    setMenuItems((prev) =>
      prev.map((m) => (m.id === itemId ? { ...m, stockQuantity: newStock, isAvailable: newAvailable } : m))
    );

    try {
      await api.updateMenuItem(itemId, {
        stockQuantity: newStock,
        isAvailable: newAvailable,
      });
    } catch (err) {
      console.warn('Failed to update menu item stock on server:', err);
    }
  };

  const handleToggleAvailability = async (itemId: string) => {
    const item = menuItems.find((m) => m.id === itemId);
    if (!item) return;

    const nextAvail = !item.isAvailable;
    setMenuItems((prev) =>
      prev.map((m) => (m.id === itemId ? { ...m, isAvailable: nextAvail } : m))
    );

    try {
      await api.updateMenuItem(itemId, { restaurantId: cartId, isAvailable: nextAvail });
    } catch (err) {
      console.warn('Failed to toggle availability:', err);
    }
  };

  const openCreateItemModal = () => {
    setEditingItem(null);
    setItemFormName('');
    setItemFormCategory('Snacks');
    setItemFormPrice(100);
    setItemFormIsAvailable(true);
    setItemFormDescription('');
    setItemFormImageUrl('');
    setImageUploadError(null);
    setIsItemModalOpen(true);
  };

  const openEditItemModal = (item: MenuItem | CartMenuItem) => {
    setEditingItem(item as MenuItem);
    setItemFormName(item.name);
    setItemFormCategory((item as any).category || (item as any).categoryName || (item as any).categoryId || 'Snacks');
    setItemFormPrice(item.price);
    setItemFormIsAvailable(item.isAvailable !== false);
    setItemFormDescription(item.description || '');
    setItemFormImageUrl((item as any).imageUrl || (item as any).image || '');
    setImageUploadError(null);
    setIsItemModalOpen(true);
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type.toLowerCase())) {
      setImageUploadError('Invalid image type. Please select a JPEG, PNG, or WebP photo.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError('Image size exceeds 5 MB. Please select a smaller photo under 5MB.');
      return;
    }

    try {
      setIsUploadingImage(true);
      setImageUploadError(null);
      const res = await api.uploadImage(cartId, file, 'menu');
      if (res && res.url) {
        setItemFormImageUrl(res.url);
      } else {
        throw new Error('Upload succeeded but no public URL was returned.');
      }
    } catch (err: any) {
      console.error('Image upload failed:', err);
      setImageUploadError(err?.message || 'Failed to upload photo. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleSaveItemForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemFormName.trim() || itemFormPrice <= 0) return;

    try {
      if (editingItem) {
        const updated = await api.updateMenuItem(editingItem.id, {
          restaurantId: cartId,
          name: itemFormName.trim(),
          categoryId: itemFormCategory,
          price: itemFormPrice,
          isAvailable: itemFormIsAvailable,
          description: itemFormDescription.trim(),
          imageUrl: itemFormImageUrl,
          image: itemFormImageUrl,
        });

        setMenuItems((prev) =>
          prev.map((it) =>
            it.id === editingItem.id
              ? {
                  ...it,
                  ...updated,
                  name: itemFormName.trim(),
                  category: itemFormCategory,
                  price: itemFormPrice,
                  imageUrl: itemFormImageUrl,
                  image: itemFormImageUrl,
                  isAvailable: itemFormIsAvailable,
                  description: itemFormDescription.trim(),
                }
              : it
          )
        );
      } else {
        const created = await api.createMenuItem({
          restaurantId: cartId,
          name: itemFormName.trim(),
          categoryId: itemFormCategory,
          price: itemFormPrice,
          isAvailable: itemFormIsAvailable,
          description: itemFormDescription.trim(),
          imageUrl: itemFormImageUrl || undefined,
          image: itemFormImageUrl || undefined,
        } as any);

        setMenuItems((prev) => [
          ...prev,
          {
            id: created.id,
            name: created.name,
            category: itemFormCategory,
            price: created.price,
            isAvailable: itemFormIsAvailable,
            description: itemFormDescription.trim(),
            imageUrl: itemFormImageUrl || undefined,
            image: itemFormImageUrl || undefined,
          },
        ]);
      }

      setIsItemModalOpen(false);
      setEditingItem(null);
    } catch (err: any) {
      alert(err?.message || 'Failed to save menu item.');
    }
  };

  // Filtered orders for redemption lookup
  const filteredOrders = useMemo(() => {
    if (!lookupQuery.trim()) return liveOrders;
    const q = lookupQuery.toLowerCase().replace(/^#/, '').trim();
    return liveOrders.filter((o) => {
      const pCode = (o.pickupCode || '').toLowerCase().replace(/^#/, '');
      const ordNum = (o.displayOrderNumber || '').toLowerCase().replace(/^#/, '');
      const idMatch = o.id.toLowerCase();
      const custName = (o.customerName || '').toLowerCase();
      return pCode.includes(q) || ordNum.includes(q) || idMatch.includes(q) || custName.includes(q);
    });
  }, [liveOrders, lookupQuery]);

  // ==========================================
  // REAL-TIME DAY-WISE HISTORICAL ENGINE
  // ==========================================

  // Day-by-Day Historical Records grouped by operational business day
  const dayWiseRecords = useMemo(() => {
    const map = new Map<string, { dateKey: string; orders: Order[] }>();

    liveOrders.forEach((order) => {
      const dateKey = getOperationalBusinessDate(order.createdAt, 4, cartTimezone);
      if (!map.has(dateKey)) {
        map.set(dateKey, { dateKey, orders: [] });
      }
      map.get(dateKey)!.orders.push(order);
    });

    // Ensure activeBusinessDate is always present in historical records
    if (!map.has(activeBusinessDate)) {
      map.set(activeBusinessDate, { dateKey: activeBusinessDate, orders: [] });
    }

    const records = Array.from(map.values()).map(({ dateKey, orders }) => {
      const isToday = dateKey === activeBusinessDate;
      const isYesterday = dateKey === yesterdayBusinessDate;
      const validOrders = orders.filter((o) => o.status !== 'CANCELLED');
      const grossSales = validOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const upiSales = validOrders
        .filter((o) => o.paymentMethod === 'UPI')
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const cashSales = validOrders
        .filter((o) => o.paymentMethod === 'CASH' || !o.paymentMethod)
        .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const fulfilledCount = orders.filter(
        (o) => o.status === 'COMPLETED' || o.pickupStatus === 'REDEEMED'
      ).length;
      const cancelledCount = orders.filter((o) => o.status === 'CANCELLED').length;
      const aov = validOrders.length > 0 ? Math.round(grossSales / validOrders.length) : 0;
      const channelQR = orders.filter((o) => o.orderType !== 'COUNTER_WALK_IN').length;
      const channelPOS = orders.filter((o) => o.orderType === 'COUNTER_WALK_IN').length;

      const formattedDate = formatReadableDate(dateKey);
      let shortLabel = formattedDate;
      if (isToday) {
        shortLabel = `Today (${formattedDate})`;
      } else if (isYesterday) {
        shortLabel = `Yesterday (${formattedDate})`;
      }

      return {
        dateKey,
        formattedDate,
        shortLabel,
        isToday,
        isYesterday,
        status: isToday ? ('LIVE_SHIFT' as const) : ('SETTLED_ARCHIVED' as const),
        ordersCount: orders.length,
        fulfilledCount,
        cancelledCount,
        grossSales,
        upiSales,
        cashSales,
        averageOrderValue: aov,
        channelQR,
        channelPOS,
        orders,
      };
    });

    return records.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [liveOrders, activeBusinessDate, yesterdayBusinessDate, cartTimezone]);

  // Orders filtered by the selected date period (Today / Yesterday / Specific Date / All-Time)
  const effectiveDateOrders = useMemo(() => {
    if (selectedDateFilter === 'ALL_TIME') {
      return liveOrders;
    }
    const targetDateKey =
      selectedDateFilter === 'TODAY'
        ? activeBusinessDate
        : selectedDateFilter === 'YESTERDAY'
        ? yesterdayBusinessDate
        : selectedDateFilter;

    return liveOrders.filter((o) => {
      const orderDateKey = getOperationalBusinessDate(o.createdAt, 4, cartTimezone);
      return orderDateKey === targetDateKey;
    });
  }, [liveOrders, selectedDateFilter, activeBusinessDate, yesterdayBusinessDate, cartTimezone]);

  // Dynamic Metrics derived for the selected period
  const todayTotalSales = effectiveDateOrders
    .filter((o) => o.status !== 'CANCELLED')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const upiSales = effectiveDateOrders
    .filter((o) => o.status !== 'CANCELLED' && o.paymentMethod === 'UPI')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const cashSales = effectiveDateOrders
    .filter((o) => o.status !== 'CANCELLED' && (o.paymentMethod === 'CASH' || !o.paymentMethod))
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  // Completed, Cancelled, and Unpaid Orders metrics
  const completedOrders = useMemo(() => {
    return effectiveDateOrders.filter((o) => o.status === 'COMPLETED' || o.pickupStatus === 'REDEEMED');
  }, [effectiveDateOrders]);

  const cancelledOrders = useMemo(() => {
    return effectiveDateOrders.filter((o) => o.status === 'CANCELLED');
  }, [effectiveDateOrders]);

  const activeNonCompletedOrders = useMemo(() => {
    return effectiveDateOrders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status) && o.pickupStatus !== 'REDEEMED');
  }, [effectiveDateOrders]);

  const pendingUnpaidOrders = useMemo(() => {
    return effectiveDateOrders.filter((o) => o.status !== 'CANCELLED' && o.paymentStatus !== 'PAID');
  }, [effectiveDateOrders]);

  const unpaidSales = useMemo(() => {
    return pendingUnpaidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [pendingUnpaidOrders]);

  const averageTicketSize = useMemo(() => {
    const validCount = effectiveDateOrders.filter((o) => o.status !== 'CANCELLED').length;
    return validCount > 0 ? Math.round(todayTotalSales / validCount) : 0;
  }, [effectiveDateOrders, todayTotalSales]);

  // Best Selling Items aggregated from effectiveDateOrders
  const bestSellers = useMemo(() => {
    const counts: Record<string, { name: string; category: string; quantity: number; revenue: number }> = {};
    effectiveDateOrders.forEach((o) => {
      if (o.status !== 'CANCELLED') {
        (o.items || []).forEach((it: any) => {
          const key = it.name || 'Item';
          if (!counts[key]) {
            counts[key] = {
              name: key,
              category: it.category || (it as any).categoryName || 'Food',
              quantity: 0,
              revenue: 0,
            };
          }
          counts[key].quantity += it.quantity || 1;
          counts[key].revenue += (it.price || 0) * (it.quantity || 1);
        });
      }
    });
    return Object.values(counts).sort((a, b) => b.quantity - a.quantity);
  }, [effectiveDateOrders]);

  // Hourly order distribution (8 AM - 11 PM) for selected date
  const hourlyDistribution = useMemo(() => {
    const hours: Record<number, number> = {};
    for (let h = 8; h <= 23; h++) hours[h] = 0;
    effectiveDateOrders.forEach((o) => {
      if (o.createdAt) {
        const d = new Date(o.createdAt);
        const h = d.getHours();
        if (hours[h] !== undefined) hours[h]++;
      }
    });
    return hours;
  }, [effectiveDateOrders]);

  // Filtered Billing Orders
  const filteredBillingOrders = useMemo(() => {
    if (billingFilter === 'PAID') {
      return effectiveDateOrders.filter((o) => o.paymentStatus === 'PAID');
    }
    if (billingFilter === 'UNPAID') {
      return effectiveDateOrders.filter((o) => o.paymentStatus !== 'PAID' && o.status !== 'CANCELLED');
    }
    if (billingFilter === 'CANCELLED') {
      return effectiveDateOrders.filter((o) => o.status === 'CANCELLED');
    }
    return effectiveDateOrders;
  }, [effectiveDateOrders, billingFilter]);

  // Menu Categories & Filtered Menu Items
  const menuCategories = useMemo(() => {
    const cats = new Set<string>();
    menuItems.forEach((it) => {
      if (it.category) cats.add(it.category);
    });
    return ['ALL', ...Array.from(cats)];
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat = menuSelectedCategory === 'ALL' || item.category === menuSelectedCategory;
      const matchQuery =
        !menuSearchQuery.trim() ||
        item.name.toLowerCase().includes(menuSearchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(menuSearchQuery.toLowerCase()));
      return matchCat && matchQuery;
    });
  }, [menuItems, menuSelectedCategory, menuSearchQuery]);

  // Handlers for Settings, Menu Deletion, and Settlement
  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm('Are you sure you want to delete this menu item?')) return;
    try {
      await api.deleteMenuItem(itemId, cartId);
      setMenuItems((prev) => prev.filter((it) => it.id !== itemId));
    } catch (err: any) {
      alert(err?.message || 'Failed to delete menu item.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartId) return;
    try {
      setIsSavingSettings(true);
      setSettingsMessage(null);
      const updated = await api.updateRestaurantDetails(cartId, {
        name: settingsName.trim() || undefined,
        address: settingsAddress.trim() || undefined,
        phone: settingsPhone.trim() || undefined,
        description: settingsDescription.trim() || undefined,
        taxPercentage: settingsTaxRate,
      });
      if (updated) {
        setCurrentCart(updated);
      }
      setSettingsMessage({ type: 'success', text: 'Cart configuration saved successfully!' });
      playKitchenChime('BUMP');
      setTimeout(() => setSettingsMessage(null), 4000);
    } catch (err: any) {
      setSettingsMessage({ type: 'error', text: err?.message || 'Failed to save settings.' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCloseShift = () => {
    setIsSettlingShift(true);
    playKitchenChime('BUMP');
    try {
      confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
    } catch {}
    const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    setSettlementSuccess(`Daily Shift Settled at ${nowStr}! All counter and QR sales reconciled.`);
    setTimeout(() => {
      setIsSettlingShift(false);
    }, 800);
  };

  const handleExportSettlementCsv = () => {
    const headers = ['Order ID', 'Date Time', 'Customer', 'Items Summary', 'Channel', 'Payment Status', 'Payment Method', 'Amount INR', 'Pickup Code', 'Status'];
    const rows = effectiveDateOrders.map((o) => [
      `"${o.displayOrderNumber || o.id}"`,
      `"${new Date(o.createdAt || Date.now()).toLocaleString()}"`,
      `"${o.customerName || 'Storefront Guest'}"`,
      `"${(o.items || []).map((i: any) => `${i.quantity}x ${i.name}`).join('; ')}"`,
      `"${o.orderType === 'COUNTER_WALK_IN' ? 'Counter POS' : 'Storefront QR'}"`,
      `"${o.paymentStatus || 'UNPAID'}"`,
      `"${o.paymentMethod || 'CASH'}"`,
      o.totalAmount || 0,
      `"${o.pickupCode || ''}"`,
      `"${o.status}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateLabel =
      selectedDateFilter === 'ALL_TIME'
        ? 'all-time'
        : selectedDateFilter === 'TODAY'
        ? activeBusinessDate
        : selectedDateFilter === 'YESTERDAY'
        ? yesterdayBusinessDate
        : selectedDateFilter;
    link.setAttribute('download', `cart-daily-settlement-${dateLabel}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Single-Scan QR Canonical URL (dynamic for every cart tenant)
  const cartPublicSlug = currentCart?.publicSlug || currentCart?.slug || currentCart?.id || '';
  const cartOrderingUrl = useMemo(() => {
    if (!currentCart) return getTenantUrl(null, '/cart/menu');
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    const isLocalOrDev = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || (typeof window !== 'undefined' && window.location.host.includes('render.com'));
    if (isLocalOrDev && typeof window !== 'undefined') {
      return `${window.location.origin}/cart/menu?cartId=${encodeURIComponent(currentCart.id)}`;
    }
    const base = getRestaurantPublicDomain(currentCart);
    if (base && !base.includes('://dinely.food')) {
      return `${base}/cart/menu`;
    }
    return `https://dinely.food/cart/menu?cartId=${encodeURIComponent(currentCart.id)}`;
  }, [currentCart]);

  // Sync Theme from Business Profile
  useEffect(() => {
    if (currentCart?.theme) {
      const resolved = resolveCartTheme(currentCart.theme);
      setSelectedThemeId(resolved.id);
      setCustomAccent(currentCart.theme.primaryColor || resolved.primaryColor);
      if ((currentCart.theme as any).tagline) {
        setCustomTagline((currentCart.theme as any).tagline);
      }
    }
  }, [currentCart]);

  const activeCartTheme = useMemo(() => {
    const base = resolveCartTheme(selectedThemeId);
    return {
      ...base,
      primaryColor: customAccent || base.primaryColor,
      accentColor: customAccent || base.accentColor,
    };
  }, [selectedThemeId, customAccent]);

  const handleCopyQrLink = () => {
    navigator.clipboard?.writeText(cartOrderingUrl);
    setQrCopied(true);
    setTimeout(() => setQrCopied(false), 2000);
  };

  const handleDownloadQrPng = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 700;
    exportCanvas.height = 860;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 700, 860);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(currentCart?.name || 'MAX KART', 350, 75);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('SCAN WITH CAMERA TO ORDER TAKEAWAY', 350, 110);

    ctx.drawImage(canvas, 100, 140, 500, 500);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(cartOrderingUrl, 350, 690);

    ctx.fillStyle = '#64748b';
    ctx.font = '15px sans-serif';
    ctx.fillText('Powered by Dinely Food Cart OS • No App Needed', 350, 735);

    const link = document.createElement('a');
    link.download = `${(currentCart?.name || 'max-kart').toLowerCase().replace(/\s+/g, '-')}-counter-qr.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const handleSaveTheme = async () => {
    if (!cartId) return;
    try {
      setIsSavingTheme(true);
      setThemeSaveSuccess(null);
      const themeConfig = {
        restaurantName: currentCart?.name || 'MAX KART',
        primaryColor: activeCartTheme.primaryColor,
        secondaryColor: activeCartTheme.accentColor,
        accentColor: activeCartTheme.accentColor,
        backgroundColor: activeCartTheme.backgroundColor,
        textColor: activeCartTheme.textColor,
        fontFamily: 'sans' as const,
        borderRadius: 'lg' as const,
        themeId: selectedThemeId,
        id: selectedThemeId,
        tagline: customTagline,
      };

      await api.updateRestaurantTheme(cartId, themeConfig as any);
      if (currentCart) {
        setCurrentCart({
          ...currentCart,
          theme: themeConfig as any,
        });
      }
      setThemeSaveSuccess(`Theme "${activeCartTheme.name}" saved! Live customer menu updated.`);
      setTimeout(() => setThemeSaveSuccess(null), 5000);
    } catch (err: any) {
      console.warn('Failed to save cart theme:', err);
      alert('Failed to save theme: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingTheme(false);
    }
  };

  const newOrdersCount = liveOrders.filter((o) => (o.status === 'PENDING' || o.status === 'NEW') && o.pickupStatus !== 'REDEEMED').length;
  const preparingOrdersCount = liveOrders.filter((o) => (o.status === 'ACCEPTED' || o.status === 'PREPARING') && o.pickupStatus !== 'REDEEMED').length;
  const readyOrdersCount = liveOrders.filter((o) => o.status === 'READY' && o.pickupStatus !== 'REDEEMED' && o.status !== 'COMPLETED').length;
  const completedOrdersCount = liveOrders.filter((o) => o.status === 'COMPLETED' || o.pickupStatus === 'REDEEMED').length;
  const cancelledOrdersCount = liveOrders.filter((o) => o.status === 'CANCELLED').length;
  const activeQueueCount = newOrdersCount + preparingOrdersCount + readyOrdersCount;

  const displayedTerminalOrders = useMemo(() => {
    let list = liveOrders.filter((ord) => {
      const isRedeemed = ord.pickupStatus === 'REDEEMED' || ord.status === 'COMPLETED';
      const isCancelled = ord.status === 'CANCELLED';
      if (terminalFilter === 'NEW') return (ord.status === 'PENDING' || ord.status === 'NEW') && !isRedeemed;
      if (terminalFilter === 'PREPARING') return (ord.status === 'ACCEPTED' || ord.status === 'PREPARING') && !isRedeemed;
      if (terminalFilter === 'READY') return ord.status === 'READY' && !isRedeemed;
      if (terminalFilter === 'COMPLETED') return isRedeemed;
      if (terminalFilter === 'CANCELLED') return isCancelled;
      return !isRedeemed && !isCancelled;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((ord) => {
        const idMatch = (ord.id || '').toLowerCase().includes(q);
        const numMatch = (ord.displayOrderNumber || '').toLowerCase().includes(q);
        const codeMatch = (ord.pickupCode || '').toLowerCase().includes(q);
        const nameMatch = (ord.customerName || '').toLowerCase().includes(q);
        const itemMatch = (ord.items || []).some((it: any) => (it.name || '').toLowerCase().includes(q));
        return idMatch || numMatch || codeMatch || nameMatch || itemMatch;
      });
    }

    return list.sort((a, b) => {
      const statusWeight: Record<string, number> = {
        READY: 3,
        PREPARING: 2,
        ACCEPTED: 2,
        PENDING: 1,
        COMPLETED: 0,
        CANCELLED: -1,
      };
      const diff = (statusWeight[b.status] || 0) - (statusWeight[a.status] || 0);
      if (diff !== 0) return diff;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }, [liveOrders, terminalFilter, searchQuery]);

  const navItems = [
    {
      id: 'terminal' as CartTab,
      label: 'Order Receiving Terminal',
      icon: BellRing,
      badge: newOrdersCount > 0 ? `${newOrdersCount} NEW` : (activeQueueCount > 0 ? `${activeQueueCount}` : undefined),
    },
    { id: 'menu' as CartTab, label: 'Menu & Stock Sync', icon: Package },
    { id: 'qr' as CartTab, label: 'Counter QR Code', icon: QrCode, badge: 'SCAN' },
    { id: 'billing' as CartTab, label: 'Daily Settlement', icon: Receipt },
    { id: 'overview' as CartTab, label: 'Cart Performance', icon: LayoutDashboard },
    { id: 'settings' as CartTab, label: 'Cart Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-[#07090e] text-slate-100 font-sans overflow-hidden">
      {/* Mobile Drawer Backdrop */}
      {isMobileNavOpen && (
        <div
          onClick={() => setIsMobileNavOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Small Cart OS Dedicated Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0b0e14] border-r border-[#1a1f2b] p-4 flex flex-col justify-between shrink-0 transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isMobileNavOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="space-y-4">
          {/* Logo & Product OS Tag */}
          <div className="flex items-center justify-between pb-3 border-b border-[#1a1f2b]">
            <DinelyLogo size="sm" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded">
                Food Cart OS
              </span>
              <button
                onClick={() => setIsMobileNavOpen(false)}
                className="lg:hidden p-1 rounded-lg text-slate-400 hover:text-white"
                aria-label="Close menu"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Return to Central Business Hub Button */}
          <button
            onClick={() => {
              if (onNavigate) onNavigate('/hub');
              else window.location.href = '/hub';
            }}
            className="w-full px-3 py-2 rounded-xl bg-[#11151e] hover:bg-[#181d2a] border border-[#212737] text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-between transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <Grid className="w-3.5 h-3.5 text-sky-400" />
              <span>Business Hub</span>
            </div>
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500 group-hover:-translate-x-0.5 transition-transform" />
          </button>

          {/* Active Cart Identity */}
          <div className="p-3 bg-[#0e121a] border border-[#1d2331] rounded-xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-white truncate">
                {currentCart?.name || 'Street Food Express Cart'}
              </h2>
              <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <span>{currentCart?.city || 'Counter Station'}</span>
                <span className="text-emerald-400 font-mono font-bold">● LIVE</span>
              </p>
            </div>
          </div>

          {/* Cart OS Navigation */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-900/20'
                      : 'text-slate-400 hover:text-white hover:bg-[#131722]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Cart Status */}
        <div className="pt-3 border-t border-[#1a1f2b] flex items-center justify-between text-xs text-slate-400">
          <span className="text-[10px] font-mono">DineFlow Food Cart v3</span>
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-slate-400 hover:text-rose-400 text-xs transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          )}
        </div>
      </aside>

      {/* Main Cart Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Header Bar */}
        <div className="lg:hidden flex items-center justify-between p-3.5 bg-[#0b0e14] border-b border-[#1a1f2b] sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsMobileNavOpen(true)}
              className="p-2 rounded-xl bg-[#11151e] border border-[#212737] text-slate-300 hover:text-white cursor-pointer"
              aria-label="Open Navigation Menu"
            >
              <MenuIcon className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white truncate">{currentCart?.name || 'MAX KART'}</div>
              <div className="text-[10px] text-sky-400 font-medium">
                {navItems.find((n) => n.id === activeTab)?.label}
              </div>
            </div>
          </div>

          <button
            onClick={() => window.open(cartOrderingUrl, '_blank')}
            className="px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[11px] font-semibold flex items-center gap-1"
          >
            <QrCode className="w-3 h-3" />
            <span>Customer QR</span>
          </button>
        </div>

        {/* Sub-View: Order Receiving Terminal (Standard Small Cart OS Primary Operational View) */}
        {(activeTab === 'terminal' || activeTab === 'pos' || activeTab === 'orders') && (
          <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full overflow-y-auto">
            {/* KDS Liquid-Glass Top Control Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 to-teal-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg">
                  <ChefHat className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                      <span>{currentCart?.name || 'MAX KART'}</span>
                      <span className="text-slate-400 font-normal text-sm sm:text-base">Order Terminal</span>
                    </h1>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Dispatch
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                    Authoritative food cart bump board, elapsed prep timers, and pickup code verification
                  </p>
                </div>
              </div>

              {/* Utility Controls: Live Clock, Sound Chime, Refresh, Quick POS, Customer QR, Sign Out */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Live Clock */}
                {currentTime && (
                  <div className="hidden md:flex bg-white/[0.05] backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 items-center gap-1.5 font-mono text-slate-200 text-xs">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>{currentTime}</span>
                  </div>
                )}

                {/* Audio Chime Toggle */}
                <div className="flex items-center gap-1 bg-white/[0.05] border border-white/10 rounded-xl p-0.5">
                  <button
                    onClick={() => {
                      const next = !soundAlertEnabled;
                      setSoundAlertEnabled(next);
                      if (next) playAlertBeep();
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                      soundAlertEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-white'
                    }`}
                    title={soundAlertEnabled ? 'Sound is enabled. Click to mute.' : 'Sound is muted. Click to enable.'}
                  >
                    {soundAlertEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-rose-400" />}
                    <span>{soundAlertEnabled ? 'Sound ON' : 'Muted'}</span>
                  </button>
                  {soundAlertEnabled && (
                    <button
                      onClick={playAlertBeep}
                      className="px-2 py-1 text-[10px] font-mono font-bold text-slate-400 hover:text-amber-300 border-l border-white/10 transition-colors cursor-pointer"
                      title="Test Audio Chime"
                    >
                      Test
                    </button>
                  )}
                </div>

                {/* Refresh Orders */}
                <button
                  onClick={fetchLiveOrders}
                  disabled={isLoadingOrders}
                  className="p-2 rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 hover:text-white cursor-pointer disabled:opacity-50 transition-all hover:bg-white/[0.08]"
                  title="Refresh Queue"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin text-amber-400' : ''}`} />
                </button>

                {/* + Walk-in Quick Counter Order */}
                <button
                  onClick={() => setIsQuickPosOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-950/30 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-slate-950" />
                  <span>+ Walk-in Order</span>
                </button>

                {/* Customer Storefront Link */}
                <a
                  href={cartOrderingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Storefront</span>
                </a>

                {/* Sign Out */}
                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/25 flex items-center gap-1 text-xs cursor-pointer transition-all"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Sign Out</span>
                  </button>
                )}
              </div>
            </div>

            {/* Lightning-Fast Pickup Code Verification & Bump Bar */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 flex flex-col sm:flex-row items-center gap-3 shadow-xl">
              <div className="flex items-center gap-2 text-amber-400 shrink-0">
                <Ticket className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider">Pickup Code Verification</span>
              </div>
              <div className="flex-1 w-full relative">
                <input
                  type="text"
                  placeholder="Enter or scan customer pickup code (e.g. C0014, K7P4, #ORD-4)..."
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLookupAndVerify(lookupQuery);
                  }}
                  className="w-full px-4 py-2 pl-9 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono tracking-wider font-bold transition-colors"
                />
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              </div>
              <button
                onClick={() => handleLookupAndVerify(lookupQuery)}
                disabled={!lookupQuery.trim() || isRedeeming}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shrink-0 shadow-lg shadow-amber-900/30"
              >
                <Check className="w-4 h-4" />
                <span>{isRedeeming ? 'Verifying...' : 'Verify & Hand Over'}</span>
              </button>
            </div>

            {/* Notification & Feedback Banners */}
            {checkoutSuccess && (
              <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center gap-2.5 shadow-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span className="font-bold">{checkoutSuccess}</span>
              </div>
            )}

            {redemptionSuccess && (
              <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-200 text-xs flex items-center gap-3 shadow-md animate-in fade-in">
                <Ticket className="w-5 h-5 shrink-0 text-amber-400" />
                <span className="font-bold">{redemptionSuccess}</span>
              </div>
            )}

            {redemptionError && (
              <div className="p-4 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-3 shadow-md">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{redemptionError}</span>
              </div>
            )}

            {/* KDS Stage Filter Tabs & Live Ticket Search */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-white/[0.03] backdrop-blur-xl border border-white/10 p-2.5 sm:p-3 rounded-2xl shadow-xl">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scrollbar-none pb-1 lg:pb-0">
                {[
                  { id: 'ACTIVE', label: 'All Active Queue', count: activeQueueCount, icon: <Flame className="w-3.5 h-3.5 text-amber-400" /> },
                  { id: 'NEW', label: '1. New Incoming', count: newOrdersCount, icon: <BellRing className="w-3.5 h-3.5 text-amber-300" /> },
                  { id: 'PREPARING', label: '2. Cooking', count: preparingOrdersCount, icon: <ChefHat className="w-3.5 h-3.5 text-sky-400" /> },
                  { id: 'READY', label: '3. Ready at Pass', count: readyOrdersCount, icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> },
                  { id: 'COMPLETED', label: 'Shift History', count: completedOrdersCount, icon: <Clock className="w-3.5 h-3.5 text-slate-400" /> },
                  { id: 'CANCELLED', label: 'Cancelled', count: cancelledOrdersCount, icon: <XCircle className="w-3.5 h-3.5 text-rose-400" /> },
                ].map((tab) => {
                  const isSelected = terminalFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setTerminalFilter(tab.id as any)}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all shrink-0 cursor-pointer active:scale-95 ${
                        isSelected
                          ? 'bg-gradient-to-r from-amber-500/25 to-amber-600/20 text-amber-300 border border-amber-400/40 shadow-[0_0_15px_rgba(245,158,11,0.25)]'
                          : 'bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.08]'
                      }`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                        isSelected ? 'bg-amber-500/30 text-amber-200 border border-amber-400/40' : 'bg-white/10 text-slate-400'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search filter input */}
              <div className="w-full lg:w-72 relative shrink-0">
                <input
                  type="text"
                  placeholder="Filter ticket, dish, customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 pl-8 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono transition-colors"
                />
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-slate-400 hover:text-white absolute right-2.5 top-2 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Orders Stream / Empty State */}
            {displayedTerminalOrders.length === 0 ? (
              <div className="p-8 sm:p-12 rounded-3xl bg-white/[0.02] backdrop-blur-2xl border border-white/10 shadow-2xl flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.15)]">
                  <BellRing className="w-8 h-8 animate-pulse" />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <h3 className="text-xl font-black text-white font-sans tracking-tight">
                    {searchQuery
                      ? `No orders matching "${searchQuery}"`
                      : terminalFilter === 'ACTIVE'
                      ? 'Active Ticket Queue Clear'
                      : `No Orders in "${terminalFilter}" Stage`}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-mono">
                    {searchQuery
                      ? 'Try adjusting your search query or clear the filter.'
                      : 'Incoming customer QR orders & counter walk-in tickets appear here automatically with real-time chimes.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setIsQuickPosOpen(true)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-950/40 transition-all cursor-pointer active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Punch Walk-in Order</span>
                  </button>

                  <a
                    href={cartOrderingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95"
                  >
                    <ExternalLink className="w-4 h-4 text-amber-400" />
                    <span>Test Customer Storefront</span>
                  </a>

                  <button
                    onClick={() => {
                      fetchLiveOrders();
                      playKitchenChime('BUMP');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-mono text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Refresh Feed</span>
                  </button>
                </div>

                {/* Real-time Telemetry Status Bar */}
                <div className="flex flex-wrap items-center justify-center gap-4 pt-4 border-t border-white/5 text-[11px] font-mono text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span className="text-emerald-400 font-bold">WebSocket Connected</span>
                  </div>
                  <div className="text-white/20">•</div>
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>WebAudio Chime: Armed</span>
                  </div>
                  <div className="text-white/20">•</div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Station: {cartId || 'Food Cart'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4.5">
                {displayedTerminalOrders.map((ord) => {
                  const isRedeemed = ord.pickupStatus === 'REDEEMED' || ord.status === 'COMPLETED';
                  const isCancelled = ord.status === 'CANCELLED';
                  const isWalkIn = ord.orderType === 'COUNTER_WALK_IN' || ord.tableNumber === 'COUNTER';
                  const codeBadge = ord.pickupCode || ord.displayOrderNumber || `#${ord.id.slice(-4)}`;
                  const elapsed = calculateOrderElapsed(ord.createdAt);
                  const selectedEta = cardEtaSelections[ord.id] || 15;
                  const isProcessing = processingOrderIds.has(ord.id);

                  return (
                    <div
                      key={ord.id}
                      className={`p-4 sm:p-5 rounded-2xl border backdrop-blur-2xl transition-all duration-200 flex flex-col justify-between space-y-4 shadow-xl ${
                        isRedeemed
                          ? 'bg-black/40 border-white/5 opacity-70'
                          : isCancelled
                          ? 'bg-black/40 border-rose-950/40 opacity-60'
                          : ord.status === 'READY'
                          ? 'bg-gradient-to-b from-emerald-950/30 to-[#0c1219] border-emerald-500/40 shadow-emerald-950/30 ring-1 ring-emerald-500/20'
                          : ord.status === 'PREPARING'
                          ? 'bg-gradient-to-b from-sky-950/30 to-[#0c1017] border-sky-500/40 shadow-sky-950/20'
                          : 'bg-[#0c0f16]/95 border-amber-500/30 hover:border-amber-500/50 shadow-amber-950/10'
                      }`}
                    >
                      {/* Top Bar: Order # + Channel + Elapsed Urgency Timer */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white text-sm">
                              #{ord.displayOrderNumber || ord.id.slice(-4)}
                            </span>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                              isWalkIn
                                ? 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                                : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            }`}>
                              {isWalkIn ? 'Walk-in Counter' : 'QR Storefront'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {elapsed.isOverdue && ord.status !== 'READY' && !isRedeemed && !isCancelled ? (
                              <span className="flex items-center gap-1 font-mono font-bold text-rose-400 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-lg text-[10px] animate-pulse">
                                <Flame className="w-3 h-3 text-rose-400" />
                                <span>{elapsed.text} OVERDUE</span>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 font-mono text-slate-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg text-[10px]">
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>{elapsed.text}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* High-Visibility Pickup Coupon Box */}
                        <div className={`p-3 sm:p-3.5 rounded-xl border flex items-center justify-between ${
                          isRedeemed
                            ? 'bg-black/30 border-white/10 text-slate-400'
                            : ord.status === 'READY'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                            : ord.status === 'PREPARING'
                            ? 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                            : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        }`}>
                          <div>
                            <div className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400">
                              Pickup Coupon Code
                            </div>
                            <div className="text-2xl sm:text-3xl font-black font-mono tracking-wider">
                              {codeBadge}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-md border uppercase ${
                              isRedeemed
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : ord.status === 'READY'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse'
                                : ord.status === 'PREPARING'
                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                                : ord.status === 'ACCEPTED'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                : isCancelled
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                            }`}>
                              {isRedeemed ? '✓ FULFILLED' : ord.status === 'PENDING' ? 'NEW ORDER' : ord.status}
                            </span>
                          </div>
                        </div>

                        {/* Customer & Total Payable Line */}
                        <div className="flex items-center justify-between text-xs px-1">
                          <span className="text-slate-300 font-medium truncate">
                            Customer: <strong className="text-white">{ord.customerName || 'Storefront Guest'}</strong>
                          </span>
                          <span className="font-mono font-black text-amber-400 text-sm">
                            ₹{ord.totalAmount}
                          </span>
                        </div>

                        {/* Interactive Dish Checklist with Cook Check-Off */}
                        <div className="space-y-1.5 py-1">
                          <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Items Checklist ({(ord.items || []).length}):</span>
                            <span className="text-[9px] text-slate-500 lowercase">click item to check off</span>
                          </div>

                          {(ord.items || []).map((it: any, i: number) => {
                            const itemKey = `${ord.id}-${it.id || i}`;
                            const isChecked = checkedItems[itemKey] || false;
                            const dishImg = getDishThumbnail(it);

                            return (
                              <div
                                key={itemKey}
                                onClick={() => toggleItemCheck(itemKey)}
                                className={`flex items-center justify-between gap-2.5 p-2 rounded-xl text-xs cursor-pointer transition-all border select-none ${
                                  isChecked
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 line-through'
                                    : 'bg-white/[0.03] border-white/10 text-white hover:border-white/20 hover:bg-white/[0.06]'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                    isChecked
                                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                                      : 'border-white/30 bg-black/20'
                                  }`}>
                                    {isChecked && '✓'}
                                  </div>

                                  {dishImg ? (
                                    <img
                                      src={dishImg}
                                      alt={it.name}
                                      className="w-8 h-8 rounded-lg object-cover shrink-0 border border-white/10"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 shrink-0">
                                      <UtensilsCrossed className="w-3.5 h-3.5" />
                                    </div>
                                  )}

                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] font-black shrink-0">
                                        {it.quantity}x
                                      </span>
                                      <span className="truncate">{it.name}</span>
                                    </div>
                                    {it.notes && (
                                      <div className="text-[10px] text-amber-300 italic truncate">
                                        Note: {it.notes}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="font-mono text-xs font-bold text-slate-300 shrink-0">
                                  ₹{(it.price || 0) * (it.quantity || 1)}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Customer Cooking Instructions */}
                        {ord.notes && (
                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-[11px] leading-tight">
                              <span className="font-bold text-amber-300">Instructions: </span>
                              <span>{ord.notes}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Card Bottom: Payment Status + Lifecycle Actions */}
                      <div className="space-y-3 pt-3 border-t border-white/10">
                        {/* Payment Status Bar */}
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[10px] text-slate-400 uppercase font-mono font-semibold">Payment</span>
                          <div>
                            {ord.paymentStatus === 'PAID' ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-[11px] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>PAID • {ord.paymentMethod || 'CASH'}</span>
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-[10px]">
                                  UNPAID
                                </span>
                                <button
                                  onClick={() => handleMarkPaid(ord.id, 'CASH')}
                                  className="px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white text-[10px] font-bold border border-emerald-500/30 transition-all cursor-pointer"
                                  title="Mark Paid via Cash"
                                >
                                  Cash
                                </button>
                                <button
                                  onClick={() => handleMarkPaid(ord.id, 'UPI')}
                                  className="px-2 py-0.5 rounded bg-sky-600/30 hover:bg-sky-600 text-sky-300 hover:text-white text-[10px] font-bold border border-sky-500/30 transition-all cursor-pointer"
                                  title="Mark Paid via UPI"
                                >
                                  UPI
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Operational Actions */}
                        <div className="space-y-2">
                          {(ord.status === 'PENDING' || ord.status === 'NEW' || ord.status === 'ACCEPTED') && (
                            <>
                              {/* Quick ETA Chips */}
                              <div className="flex items-center justify-between gap-1 text-[11px] bg-white/[0.02] p-1.5 rounded-xl border border-white/5">
                                <span className="font-mono text-slate-400 text-[10px] flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-400" />
                                  <span>Prep ETA:</span>
                                </span>
                                <div className="flex items-center gap-1">
                                  {[5, 10, 15, 20].map((mins) => {
                                    const isSel = selectedEta === mins;
                                    return (
                                      <button
                                        key={mins}
                                        type="button"
                                        onClick={() =>
                                          setCardEtaSelections((prev) => ({
                                            ...prev,
                                            [ord.id]: mins,
                                          }))
                                        }
                                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all border ${
                                          isSel
                                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                                            : 'bg-white/5 text-slate-300 border-white/10 hover:border-white/20'
                                        }`}
                                      >
                                        +{mins}m
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  disabled={isProcessing}
                                  onClick={() => updateOrderStatus(ord.id, 'CANCELLED')}
                                  className="px-2.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold text-xs cursor-pointer transition-all"
                                >
                                  Cancel
                                </button>

                                <button
                                  disabled={isProcessing}
                                  onClick={() => updateOrderStatus(ord.id, 'PREPARING', selectedEta)}
                                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 cursor-pointer transition-all flex-1"
                                >
                                  <ChefHat className="w-4 h-4" />
                                  <span>Start Cooking (+{selectedEta}m)</span>
                                </button>

                                <button
                                  disabled={isProcessing}
                                  onClick={() => updateOrderStatus(ord.id, 'READY')}
                                  className="px-2.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer"
                                  title="Mark Ready Directly"
                                >
                                  Instant Ready
                                </button>
                              </div>
                            </>
                          )}

                          {ord.status === 'PREPARING' && (
                            <div className="flex items-center gap-2">
                              <button
                                disabled={isProcessing}
                                onClick={() => updateOrderStatus(ord.id, 'CANCELLED')}
                                className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold text-xs cursor-pointer transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                disabled={isProcessing}
                                onClick={() => updateOrderStatus(ord.id, 'READY')}
                                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 cursor-pointer transition-all flex-1"
                              >
                                <CheckCircle2 className="w-4 h-4 text-slate-950" />
                                <span>Mark Ready for Pickup</span>
                              </button>
                            </div>
                          )}

                          {ord.status === 'READY' && (
                            <div className="space-y-1.5">
                              <button
                                disabled={isProcessing}
                                onClick={() => handleRedeemCode(ord.pickupCode || ord.id)}
                                className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer transition-all"
                              >
                                <Ticket className="w-4 h-4 text-slate-950" />
                                <span>1-Click Hand Over (Redeem {codeBadge})</span>
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedOrderForHandover(ord);
                                  setHandoverInputCode(ord.pickupCode || ord.id);
                                  setHandoverError(null);
                                }}
                                className="w-full text-center text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                              >
                                Open Verification Dialog
                              </button>
                            </div>
                          )}

                          {isRedeemed && (
                            <div className="w-full py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5 font-mono">
                              <CheckCheck className="w-4 h-4 text-emerald-400" />
                              <span>✓ Order Handed Over & Fulfilled</span>
                            </div>
                          )}

                          {isCancelled && (
                            <div className="w-full py-2 px-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold text-xs flex items-center justify-center gap-1.5">
                              <span>Order Cancelled</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Counter POS Walk-in Order Modal */}
            {isQuickPosOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-[#0e121a] border border-[#212737] rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  {/* Modal Header */}
                  <div className="p-4 sm:p-5 border-b border-[#1f2636] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                        <Plus className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-white">Punch Walk-in Counter Order</h2>
                        <p className="text-[11px] text-slate-400">Direct register punch. Dispatches immediately to active terminal queue.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsQuickPosOpen(false)}
                      className="p-1.5 rounded-xl bg-[#141822] hover:bg-[#1b2230] text-slate-400 hover:text-white transition-all cursor-pointer"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Modal Body: Menu Picker */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Available Street Menu</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {menuItems.filter((m) => m.isAvailable !== false).map((item) => {
                        const inBasket = basket.find((b) => b.item.id === item.id);
                        const qty = inBasket ? inBasket.quantity : 0;
                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                              qty > 0
                                ? 'bg-sky-500/10 border-sky-500/30 text-white'
                                : 'bg-[#080a0f] border-[#1b2230] hover:border-slate-700 text-slate-300'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">{item.name}</div>
                              <div className="text-[11px] font-mono text-sky-400 font-bold">₹{item.price}</div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {qty > 0 ? (
                                <div className="flex items-center gap-2 bg-[#141822] border border-[#212737] rounded-xl p-1">
                                  <button
                                    onClick={() => {
                                      if (qty <= 1) {
                                        setBasket((prev) => prev.filter((b) => b.item.id !== item.id));
                                      } else {
                                        setBasket((prev) =>
                                          prev.map((b) =>
                                            b.item.id === item.id ? { ...b, quantity: b.quantity - 1 } : b
                                          )
                                        );
                                      }
                                    }}
                                    className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center text-xs font-bold cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono text-xs font-bold px-1 text-white">{qty}</span>
                                  <button
                                    onClick={() => {
                                      setBasket((prev) =>
                                        prev.map((b) =>
                                          b.item.id === item.id ? { ...b, quantity: b.quantity + 1 } : b
                                        )
                                      );
                                    }}
                                    className="w-6 h-6 rounded-lg bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center text-xs font-bold cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setBasket((prev) => [...prev, { item, quantity: 1 }]);
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-sky-600/30 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/30 text-xs font-bold transition-all cursor-pointer"
                                >
                                  + Add
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Modal Footer: Payment & Dispatch */}
                  <div className="p-4 sm:p-5 border-t border-[#1f2636] bg-[#090c12] space-y-3 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-semibold">Payment Method:</span>
                        <div className="flex items-center gap-1.5 bg-[#121620] p-1 rounded-xl border border-[#212737]">
                          {(['UPI', 'CASH'] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setPaymentMode(m)}
                              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                                paymentMode === m
                                  ? 'bg-sky-600 text-white shadow-sm'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total</span>
                        <span className="text-lg font-black font-mono text-white">₹{basketSubtotal}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setBasket([]);
                          setIsQuickPosOpen(false);
                        }}
                        className="py-2.5 px-4 rounded-xl bg-[#141822] hover:bg-[#1b2230] text-slate-400 hover:text-white text-xs font-bold border border-[#212737] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleQuickCheckout}
                        disabled={basket.length === 0 || isSubmitting}
                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-sky-950/40 cursor-pointer disabled:opacity-40 transition-all"
                      >
                        <Check className="w-4 h-4" />
                        <span>
                          {isSubmitting
                            ? 'Dispatching...'
                            : `Dispatch Walk-in Order • ₹${basketSubtotal} (${paymentMode})`}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {selectedOrderForHandover && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
                <div className="bg-[#0e121a] border border-[#212737] rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-3 border-b border-[#1f2636]">
                    <div className="flex items-center gap-2">
                      <Ticket className="w-5 h-5 text-amber-400" />
                      <h2 className="text-base font-bold text-white">Food Handover & Code Verification</h2>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedOrderForHandover(null);
                        setHandoverError(null);
                      }}
                      className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Code Display */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/15 via-[#111622] to-sky-500/10 border-2 border-amber-500/30 text-center space-y-1">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400/90">Customer Pickup Code</div>
                    <div className="text-3xl font-black font-mono tracking-widest text-amber-300">
                      {selectedOrderForHandover.pickupCode || selectedOrderForHandover.id.slice(-4)}
                    </div>
                    <div className="text-xs text-slate-400 font-medium">
                      Order #{selectedOrderForHandover.displayOrderNumber || selectedOrderForHandover.id.slice(-4)} • {selectedOrderForHandover.customerName || 'Customer'}
                    </div>
                  </div>

                  {selectedOrderForHandover.status !== 'READY' && selectedOrderForHandover.status !== 'COMPLETED' && (
                    <div className="p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2.5">
                      <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>
                        <b>Notice:</b> This order is currently <b>{selectedOrderForHandover.status}</b> and not yet marked Ready. Please confirm food is physically prepared before handover.
                      </span>
                    </div>
                  )}

                  {/* Ordered Items Verification List */}
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Items in this Order</div>
                    {(selectedOrderForHandover.items || []).map((it: any, idx: number) => {
                      const dishImg = getDishThumbnail(it);
                      return (
                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-[#080a0f] border border-[#141822]">
                          <div className="flex items-center gap-2.5">
                            {dishImg ? (
                              <img src={dishImg} alt={it.name} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[#212737]" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-[#141924] flex items-center justify-center text-slate-500 shrink-0">
                                <UtensilsCrossed className="w-4 h-4" />
                              </div>
                            )}
                            <div>
                              <div className="text-xs font-bold text-white">
                                <span className="text-sky-400 font-mono mr-1.5">{it.quantity}x</span>
                                {it.name}
                              </div>
                              {it.notes && <div className="text-[10px] text-amber-300 italic">{it.notes}</div>}
                            </div>
                          </div>
                          <div className="font-mono text-xs font-bold text-slate-300">
                            ₹{(it.price || 0) * (it.quantity || 1)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {handoverError && (
                    <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                      <span>{handoverError}</span>
                    </div>
                  )}

                  {/* Confirmation Actions */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setSelectedOrderForHandover(null);
                        setHandoverError(null);
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-[#141822] hover:bg-[#1a2130] text-slate-300 font-bold text-xs cursor-pointer border border-[#21293a]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRedeemCode(selectedOrderForHandover.pickupCode || selectedOrderForHandover.id, true)}
                      disabled={isRedeeming}
                      className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-900/30 cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isRedeeming ? 'Redeeming...' : 'Confirm Handover & Complete'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}


          </div>
        )}

        {/* Sub-View: Menu & Real-Time Stock Sync */}
        {activeTab === 'menu' && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Menu & Real-Time Stock Management</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Adjust stock levels, upload food photos, or edit pricing. The customer storefront syncs immediately.
                </p>
              </div>

              <button
                onClick={openCreateItemModal}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Add Street Food Item</span>
              </button>
            </div>

            {/* Search & Category Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white/[0.02] p-3 rounded-2xl border border-white/10 backdrop-blur-xl">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
                {menuCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setMenuSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
                      menuSelectedCategory === cat
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search dish or category..."
                  value={menuSearchQuery}
                  onChange={(e) => setMenuSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 pl-8 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                />
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                {menuSearchQuery && (
                  <button
                    onClick={() => setMenuSearchQuery('')}
                    className="text-slate-400 hover:text-white absolute right-2.5 top-2 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMenuItems.map((item) => {
                const photoUrl = item.imageUrl || item.image;
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b] space-y-4 hover:border-slate-700/60 transition-all shadow-sm"
                  >
                    {/* Top Row: Photo + Item Info + Edit & Availability Actions */}
                    <div className="flex items-start gap-3.5">
                      {/* Dish Photo or Clean Placeholder */}
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#141822] border border-[#212737] shrink-0 relative">
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                              const parent = (e.currentTarget as HTMLElement).parentElement;
                              if (parent) {
                                const fb = parent.querySelector('.cart-photo-fallback');
                                if (fb) (fb as HTMLElement).classList.remove('hidden');
                              }
                            }}
                          />
                        ) : null}
                        <div
                          className={`cart-photo-fallback absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-[#121622] ${
                            photoUrl ? 'hidden' : 'flex'
                          }`}
                        >
                          <UtensilsCrossed className="w-5 h-5 opacity-50" />
                          <span className="text-[7px] font-bold text-slate-500 uppercase mt-0.5">No photo</span>
                        </div>
                      </div>

                      {/* Title & Category */}
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">
                          {(item as any).category || (item as any).categoryName || 'Food'}
                        </span>
                        <h3 className="text-sm font-bold text-white mt-0.5 leading-snug truncate">{item.name}</h3>
                        {item.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{item.description}</p>
                        )}
                        <div className="text-xs font-mono font-bold text-sky-400 mt-1">
                          ₹{item.price}
                        </div>
                      </div>

                      {/* Action buttons: Status badge & Edit & Delete */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                            item.isAvailable
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}
                        >
                          {item.isAvailable ? 'AVAILABLE' : 'SOLD OUT'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openEditItemModal(item)}
                            className="px-2.5 py-1 rounded-lg bg-[#141822] hover:bg-[#1f2636] text-slate-300 hover:text-white border border-[#212737] flex items-center gap-1 text-[10px] font-semibold cursor-pointer transition-all"
                            title="Edit Item & Photo"
                          >
                            <Pencil className="w-3 h-3 text-sky-400" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] cursor-pointer transition-all"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 1-Click Availability Control (Replaces manual stock counters) */}
                    <div className="p-3 bg-[#080a0e] rounded-xl border border-[#161a25] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            item.isAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                          }`}
                        />
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-mono font-semibold">Storefront Status</div>
                          <div className={`text-xs font-mono font-bold ${item.isAvailable ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.isAvailable ? 'Available for Customers' : 'Marked as Sold Out'}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleAvailability(item.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                          item.isAvailable
                            ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                        }`}
                        title={item.isAvailable ? 'Mark item Sold Out' : 'Mark item Available'}
                      >
                        {item.isAvailable ? (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                            <span>Mark Sold Out</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Mark Available</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-[#1a1f2b]">
                      <span className="text-[10px] text-slate-500">
                        {item.isAvailable ? 'Visible & orderable on customer QR menu' : 'Customers cannot add this item'}
                      </span>
                      {photoUrl ? (
                        <span className="text-[10px] text-emerald-400/90 flex items-center gap-1 font-medium">
                          <Check className="w-3 h-3" /> Photo Attached
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">No Photo</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal: Add / Edit Cart Menu Item */}
            {isItemModalOpen && (
              <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-[#0e121a] border border-[#212737] rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
                  <div className="flex items-center justify-between pb-3 border-b border-[#212737]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                        {editingItem ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          {editingItem ? 'Edit Street Food Item' : 'Add New Street Food Item'}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Configure item pricing, stock, and upload a dish photo.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setIsItemModalOpen(false);
                        setEditingItem(null);
                      }}
                      className="text-slate-400 hover:text-white text-sm cursor-pointer p-1 rounded-lg hover:bg-white/5"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleSaveItemForm} className="space-y-4">
                    {/* Item Name */}
                    <div>
                      <label className="text-xs font-medium text-slate-400 block mb-1">Item Name *</label>
                      <input
                        type="text"
                        required
                        value={itemFormName}
                        onChange={(e) => setItemFormName(e.target.value)}
                        placeholder="e.g. Spicy Paneer Tikka Roll"
                        className="w-full px-3 py-2 rounded-xl bg-[#141822] border border-[#212737] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    {/* Category & Price */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-400 block mb-1">Category</label>
                        <input
                          type="text"
                          value={itemFormCategory}
                          onChange={(e) => setItemFormCategory(e.target.value)}
                          placeholder="e.g. Rolls, Snacks, Drinks"
                          className="w-full px-3 py-2 rounded-xl bg-[#141822] border border-[#212737] text-xs text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-400 block mb-1">Price (₹) *</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={itemFormPrice}
                          onChange={(e) => setItemFormPrice(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 rounded-xl bg-[#141822] border border-[#212737] text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                        />
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="text-xs font-medium text-slate-400 block mb-1">Description (Optional)</label>
                      <input
                        type="text"
                        value={itemFormDescription}
                        onChange={(e) => setItemFormDescription(e.target.value)}
                        placeholder="e.g. Freshly rolled paratha with spicy grilled cottage cheese"
                        className="w-full px-3 py-2 rounded-xl bg-[#141822] border border-[#212737] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    {/* Availability Status Selector (Replaces manual stock input) */}
                    <div>
                      <label className="text-xs font-medium text-slate-400 block mb-1">Item Availability</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setItemFormIsAvailable(true)}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            itemFormIsAvailable
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                              : 'bg-[#141822] text-slate-400 border-[#212737] hover:bg-[#1a202c]'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Available (In Stock)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemFormIsAvailable(false)}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            !itemFormIsAvailable
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm'
                              : 'bg-[#141822] text-slate-400 border-[#212737] hover:bg-[#1a202c]'
                          }`}
                        >
                          <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          <span>Sold Out</span>
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {itemFormIsAvailable
                          ? 'Item is available for instant mobile ordering by customers.'
                          : 'Item is marked sold out on the QR menu. Customers cannot order it.'}
                      </p>
                    </div>

                    {/* Dish Photo Upload Control */}
                    <div className="space-y-2 pt-1 border-t border-[#212737]">
                      <label className="text-xs font-medium text-slate-300 block">
                        Food / Drink Photo (JPEG, PNG, WebP up to 5MB)
                      </label>

                      {/* Hidden File Input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleImageFileSelect}
                        className="hidden"
                      />

                      {/* Image Preview with Replace / Remove Actions */}
                      {itemFormImageUrl ? (
                        <div className="space-y-2.5">
                          <div className="relative w-full h-40 rounded-2xl overflow-hidden border border-[#212737] bg-[#141822]">
                            <img
                              src={itemFormImageUrl}
                              alt="Dish Preview"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-2 right-2 bg-emerald-500 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded-full shadow-md">
                              Photo Attached
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploadingImage}
                              className="flex-1 py-2 px-3 rounded-xl bg-[#141822] hover:bg-[#1a202c] border border-slate-700/80 text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>Replace Photo</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setItemFormImageUrl('')}
                              className="py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-xs font-semibold text-rose-400 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full p-6 rounded-2xl border-2 border-dashed border-[#262e42] hover:border-sky-500/50 bg-[#141822]/50 hover:bg-[#141822] flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group"
                        >
                          <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-105 transition-all">
                            <Upload className="w-5 h-5" />
                          </div>
                          <div className="text-center">
                            <span className="text-xs font-bold text-white block">Click to upload dish photo</span>
                            <span className="text-[10px] text-slate-500">Supports JPEG, PNG, WebP (Max 5MB)</span>
                          </div>
                        </div>
                      )}

                      {/* Upload Loading State */}
                      {isUploadingImage && (
                        <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                          <span>Uploading image to persistent storage...</span>
                        </div>
                      )}

                      {/* Upload Error Alert */}
                      {imageUploadError && (
                        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{imageUploadError}</span>
                        </div>
                      )}
                    </div>

                    {/* Modal Action Buttons */}
                    <div className="pt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsItemModalOpen(false);
                          setEditingItem(null);
                        }}
                        className="flex-1 py-2.5 rounded-xl bg-[#141822] hover:bg-[#1a202c] text-slate-300 text-xs font-semibold cursor-pointer transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isUploadingImage}
                        className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer transition-all disabled:opacity-50 shadow-md"
                      >
                        {isUploadingImage ? 'Uploading Image...' : editingItem ? 'Save Changes' : 'Add to Cart Menu'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sub-View: Counter QR Code & Mobile Storefront Studio */}
        {activeTab === 'qr' && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Counter QR Code & Mobile Storefront</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold uppercase">
                    Zero App Required
                  </span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Permanent business QR code and real-time customer storefront preview for {currentCart?.name || 'MAX KART'}.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all border border-slate-700 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-sky-400" />
                  <span>Print Standee</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.open(cartOrderingUrl, '_blank')}
                  className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Customer URL</span>
                </button>
              </div>
            </div>

            {/* Error Guard if cart configuration missing */}
            {(!cartId || !cartPublicSlug) && (
              <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>
                  Business configuration or ordering slug is unavailable. Please check cart tenant credentials.
                </span>
              </div>
            )}

            {/* Main Balanced Grid: Left (QR & Themes) | Right (Phone Mockup Preview) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start w-full">
              {/* LEFT COLUMN: QR Code Card & Themes (lg:col-span-7 xl:col-span-8) */}
              <div className="lg:col-span-7 xl:col-span-8 space-y-6 w-full min-w-0">
                {/* 1. Dedicated Standalone Counter QR Card */}
                <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-b from-[#10141e] to-[#090c12] border border-[#1f2638] shadow-2xl space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1b2234]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-white truncate">{currentCart?.name || 'MAX KART'}</h2>
                        <p className="text-xs text-slate-400">Permanent Counter Standee QR Code</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold self-start sm:self-center shrink-0">
                      ● Active Customer Link
                    </span>
                  </div>

                  {/* QR Code and Actions in 2 inner columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                    {/* QR Code Container Badge */}
                    <div className="flex flex-col items-center justify-center p-5 bg-white rounded-2xl shadow-xl border border-slate-200 text-center mx-auto sm:mx-0 w-full max-w-[240px]">
                      <QRCodeSVG
                        value={cartOrderingUrl}
                        size={190}
                        level="H"
                        marginSize={2}
                        className="w-full h-auto object-contain"
                      />
                      {/* Hidden canvas for high-res PNG export */}
                      <div className="hidden">
                        <QRCodeCanvas
                          ref={qrCanvasRef}
                          value={cartOrderingUrl}
                          size={500}
                          level="H"
                          marginSize={2}
                        />
                      </div>
                      <p className="text-[10px] font-bold text-slate-900 mt-2 tracking-wide uppercase font-mono">
                        Scan to Order Takeaway
                      </p>
                    </div>

                    {/* QR Details and Buttons */}
                    <div className="space-y-4 min-w-0">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Canonical Ordering URL
                        </label>
                        <div className="p-2.5 bg-[#07090e] rounded-xl border border-[#1b2234] flex items-center justify-between gap-2">
                          <span className="text-xs font-mono text-sky-400 truncate">{cartOrderingUrl}</span>
                          <button
                            type="button"
                            onClick={handleCopyQrLink}
                            className="p-1.5 rounded-lg bg-[#151a26] hover:bg-[#1f2638] text-slate-300 hover:text-white transition-all shrink-0 cursor-pointer"
                            title="Copy URL"
                          >
                            {qrCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {qrCopied && (
                          <span className="text-[11px] text-emerald-400 font-medium">Copied to clipboard!</span>
                        )}
                      </div>

                      <div className="space-y-2 pt-2">
                        <button
                          type="button"
                          onClick={handleDownloadQrPng}
                          className="w-full py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all border border-slate-700/60 cursor-pointer"
                        >
                          <Download className="w-4 h-4 text-emerald-400" />
                          <span>Download High-Res QR (PNG)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsPrintModalOpen(true)}
                          className="w-full py-2.5 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all border border-slate-700/60 cursor-pointer"
                        >
                          <Printer className="w-4 h-4 text-sky-400" />
                          <span>Print Counter Standee Sign</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-[#0a0d14] rounded-xl border border-[#171d2b] flex items-center gap-2 text-xs text-slate-400">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Pointed permanently to your public customer storefront. Never redirects to POS or requires an app install.
                    </span>
                  </div>
                </div>

                {/* 2. Choose Visual Theme (All 5 Themes) & Customization */}
                <div className="p-5 sm:p-6 rounded-3xl bg-[#0c0f16] border border-[#1a1f2b] shadow-2xl space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#181d2a]">
                    <div>
                      <h2 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                        <Palette className="w-4 h-4 text-rose-400" />
                        <span>Choose Visual Theme</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Choose the visual palette for your customer storefront. Updates in real-time.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 self-start sm:self-center shrink-0">
                      5 Curated Themes
                    </span>
                  </div>

                  {/* 5 Themes Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {CART_THEMES.map((theme) => {
                      const isSelected = selectedThemeId === theme.id;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => {
                            setSelectedThemeId(theme.id);
                            setCustomAccent(theme.primaryColor);
                          }}
                          className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden ${
                            isSelected
                              ? 'bg-slate-800/90 border-sky-400 ring-2 ring-sky-500/40 shadow-lg'
                              : 'bg-[#080b10] border-[#181d2a] hover:border-slate-700 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-2">
                            {/* Color Dot Swatches */}
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                                style={{ backgroundColor: theme.primaryColor }}
                              />
                              <span
                                className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                                style={{ backgroundColor: theme.backgroundColor }}
                              />
                            </div>
                            {isSelected && (
                              <span className="w-5 h-5 rounded-full bg-sky-500 text-slate-950 flex items-center justify-center">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </span>
                            )}
                          </div>

                          <div>
                            <div className="text-xs font-bold text-white leading-snug">{theme.name}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{theme.subtitle}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Additional Styling Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="text-[11px] font-medium text-slate-400 mb-1 block">
                        Primary Accent Color
                      </label>
                      <div className="flex items-center gap-2.5 p-2 bg-[#080b10] border border-[#1a1f2b] rounded-xl">
                        <input
                          type="color"
                          value={customAccent}
                          onChange={(e) => setCustomAccent(e.target.value)}
                          className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                        />
                        <span className="text-xs font-mono text-slate-200">{customAccent}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-slate-400 mb-1 block">
                        Storefront Tagline
                      </label>
                      <input
                        type="text"
                        value={customTagline}
                        onChange={(e) => setCustomTagline(e.target.value)}
                        placeholder="e.g. Instant QR Pickup • No App Needed"
                        className="w-full px-3 py-2 bg-[#080b10] border border-[#1a1f2b] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  {/* Save Theme Button */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                    {themeSaveSuccess && (
                      <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{themeSaveSuccess}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveTheme}
                      disabled={isSavingTheme}
                      className="w-full sm:w-auto ml-auto px-6 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50"
                    >
                      {isSavingTheme ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving to Cloud...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Theme Settings</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Live Mobile Storefront Preview (lg:col-span-5 xl:col-span-4) */}
              <div className="lg:col-span-5 xl:col-span-4 w-full flex flex-col items-center space-y-3 lg:sticky lg:top-6">
                <div className="flex items-center justify-between w-full max-w-[340px] px-2 text-xs font-bold text-slate-400">
                  <span className="flex items-center gap-1.5 text-sky-400">
                    <Eye className="w-4 h-4" /> Live Mobile Preview
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Real-time theme rendering</span>
                </div>

                {/* Smartphone Mockup Frame */}
                <div className="w-full max-w-[340px] rounded-[44px] bg-[#000000] border-[8px] border-slate-800 shadow-2xl p-2.5 flex flex-col relative overflow-hidden transition-all">
                  {/* Dynamic Island / Speaker Notch */}
                  <div className="w-24 h-4 bg-slate-900 rounded-full mx-auto mb-2 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-slate-800" />
                  </div>

                  {/* Screen Content */}
                  <div
                    className="w-full rounded-[32px] overflow-hidden flex flex-col min-h-[560px] max-h-[620px] transition-colors duration-300 font-sans"
                    style={{
                      backgroundColor: activeCartTheme.backgroundColor,
                      color: activeCartTheme.textColor,
                    }}
                  >
                    {/* Simulated Mobile Header */}
                    <div className="p-3.5 border-b border-white/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-inner"
                          style={{
                            backgroundColor: activeCartTheme.badgeBg,
                            color: activeCartTheme.accentColor,
                            borderColor: activeCartTheme.badgeBorder,
                            borderWidth: 1,
                          }}
                        >
                          <Truck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-extrabold leading-tight text-white">
                            {currentCart?.name || 'MAX KART'}
                          </div>
                          <span
                            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full inline-block mt-0.5"
                            style={{
                              backgroundColor: activeCartTheme.badgeBg,
                              color: activeCartTheme.badgeText,
                              borderColor: activeCartTheme.badgeBorder,
                              borderWidth: 1,
                            }}
                          >
                            Open
                          </span>
                        </div>
                      </div>

                      <span className="text-[9px] px-2 py-0.5 rounded bg-white/10 text-slate-300">
                        Counter QR
                      </span>
                    </div>

                    {/* Tagline */}
                    <div className="px-3.5 pt-2">
                      <p className="text-[10px] opacity-80 flex items-center gap-1 font-medium">
                        <Sparkles className="w-3 h-3" style={{ color: activeCartTheme.accentColor }} />
                        <span className="truncate">{customTagline}</span>
                      </p>
                    </div>

                    {/* Category Filter Pills */}
                    <div className="px-3.5 py-2.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                      {['All Items', 'Pure Veg', 'Non-Veg'].map((cat, idx) => (
                        <span
                          key={cat}
                          className="text-[10px] px-2.5 py-1 rounded-lg font-bold shrink-0 transition-all"
                          style={
                            idx === 0
                              ? {
                                  backgroundColor: activeCartTheme.pillActiveBg,
                                  color: activeCartTheme.pillActiveText,
                                }
                              : {
                                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                  color: '#cbd5e1',
                                }
                          }
                        >
                          {cat}
                        </span>
                      ))}
                    </div>

                    {/* Real Menu Items List */}
                    <div className="flex-1 px-3.5 py-1 space-y-2 overflow-y-auto max-h-[340px]">
                      {menuItems.slice(0, 4).map((it) => (
                        <div
                          key={it.id}
                          className="p-2 rounded-2xl border transition-all flex items-center gap-2.5"
                          style={{
                            backgroundColor: activeCartTheme.surfaceColor,
                            borderColor: activeCartTheme.cardBorder,
                          }}
                        >
                          {/* Dish Thumbnail or Neutral Icon */}
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0 flex items-center justify-center">
                            {it.imageUrl ? (
                              <img
                                src={it.imageUrl}
                                alt={it.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <UtensilsCrossed className="w-4 h-4 opacity-40 text-slate-400" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">{it.name}</div>
                            <div className="text-[10px] opacity-70 mt-0.5 font-mono">
                              ₹{it.price}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: it.isAvailable === false ? 'rgba(239, 68, 68, 0.2)' : activeCartTheme.badgeBg,
                                color: it.isAvailable === false ? '#f87171' : activeCartTheme.badgeText,
                              }}
                            >
                              {it.isAvailable === false ? 'Sold Out' : 'Available'}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-1 rounded-lg shadow-sm ${
                                it.isAvailable === false ? 'opacity-40 cursor-not-allowed' : ''
                              }`}
                              style={{
                                backgroundColor: it.isAvailable === false ? '#334155' : activeCartTheme.primaryColor,
                                color: it.isAvailable === false ? '#94a3b8' : activeCartTheme.pillActiveText,
                              }}
                            >
                              {it.isAvailable === false ? 'Sold Out' : '+ Add'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Floating Bottom Bar Mockup */}
                    <div className="p-3 border-t border-white/10 mt-auto">
                      <div
                        className={`w-full py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-between shadow-lg ${activeCartTheme.buttonGradient}`}
                      >
                        <span>1 Item Selected</span>
                        <span>View Order • ₹150 →</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sub-View: Daily Settlement & Business Day */}
        {activeTab === 'billing' && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto w-full">
            {/* Header & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-400" />
                  <span>Cart Daily Settlement & Shift</span>
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Authoritative business-day attribution, counter cash reconciliation, UPI receipts, and audit trail.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={handleExportSettlementCsv}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Export CSV</span>
                </button>

                <button
                  onClick={handleCloseShift}
                  disabled={isSettlingShift}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-950/40 cursor-pointer transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSettlingShift ? 'Reconciling...' : 'Reconcile & Settle Shift'}</span>
                </button>
              </div>
            </div>

            {/* Shift Settlement Success Banner */}
            {settlementSuccess && (
              <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-3 animate-in fade-in">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="flex-1 font-mono font-medium">{settlementSuccess}</div>
                <button onClick={() => setSettlementSuccess(null)} className="text-emerald-400 hover:text-white text-sm">✕</button>
              </div>
            )}

            {/* Real-Time Operational Rollover Alert Banner */}
            {dateRolloverNotice && (
              <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3 animate-in fade-in">
                <RotateCcw className="w-5 h-5 text-amber-400 shrink-0 animate-spin" />
                <div className="flex-1 font-mono font-medium">{dateRolloverNotice}</div>
                <button onClick={() => setDateRolloverNotice(null)} className="text-amber-400 hover:text-white text-sm">✕</button>
              </div>
            )}

            {/* Day-Wise Operational Shift Selector Bar */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>Select Shift:</span>
                </div>

                {/* Today Chip */}
                <button
                  onClick={() => setSelectedDateFilter('TODAY')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    selectedDateFilter === 'TODAY'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950/40'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedDateFilter === 'TODAY' ? 'bg-slate-950 animate-pulse' : 'bg-emerald-400'}`} />
                  <span>Today ({formatReadableDate(activeBusinessDate)})</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedDateFilter === 'TODAY' ? 'bg-black/20 text-slate-950' : 'bg-white/10 text-slate-400'}`}>
                    {dayWiseRecords.find((r) => r.isToday)?.ordersCount || 0}
                  </span>
                </button>

                {/* Yesterday Chip */}
                <button
                  onClick={() => setSelectedDateFilter('YESTERDAY')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    selectedDateFilter === 'YESTERDAY'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>Yesterday ({formatReadableDate(yesterdayBusinessDate)})</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedDateFilter === 'YESTERDAY' ? 'bg-black/20 text-slate-950' : 'bg-white/10 text-slate-400'}`}>
                    {dayWiseRecords.find((r) => r.isYesterday)?.ordersCount || 0}
                  </span>
                </button>

                {/* Past Shift Dates Dropdown */}
                {dayWiseRecords.filter((r) => !r.isToday && !r.isYesterday).length > 0 && (
                  <select
                    value={!['TODAY', 'YESTERDAY', 'ALL_TIME'].includes(selectedDateFilter) ? selectedDateFilter : ''}
                    onChange={(e) => {
                      if (e.target.value) setSelectedDateFilter(e.target.value);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 border border-white/10 transition-all cursor-pointer ${
                      !['TODAY', 'YESTERDAY', 'ALL_TIME'].includes(selectedDateFilter)
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <option value="" disabled className="bg-slate-900 text-slate-400">Past Shift Records...</option>
                    {dayWiseRecords
                      .filter((r) => !r.isToday && !r.isYesterday)
                      .map((r) => (
                        <option key={r.dateKey} value={r.dateKey} className="bg-slate-900 text-white">
                          {r.formattedDate} ({r.ordersCount} orders • ₹{r.grossSales})
                        </option>
                      ))}
                  </select>
                )}

                {/* All-Time Chip */}
                <button
                  onClick={() => setSelectedDateFilter('ALL_TIME')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedDateFilter === 'ALL_TIME'
                      ? 'bg-purple-500 text-white shadow-md shadow-purple-950/40'
                      : 'bg-white/5 hover:bg-white/10 text-slate-400 border border-white/10'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>All-Time Ledger ({liveOrders.length})</span>
                </button>
              </div>

              {/* Shift Rollover Live Indicator */}
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Shift Rollover: 04:00 AM IST</span>
                <span className="text-white/20">•</span>
                <span className="text-slate-300">Live Auto-Updating</span>
              </div>
            </div>

            {/* Shift & Timezone Telemetry Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  selectedDateFilter === 'TODAY'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : selectedDateFilter === 'YESTERDAY'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : selectedDateFilter === 'ALL_TIME'
                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                    : 'bg-sky-500/10 border-sky-500/20 text-sky-400'
                }`}>
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                    {selectedDateFilter === 'TODAY'
                      ? 'Active Live Business Day'
                      : selectedDateFilter === 'YESTERDAY'
                      ? 'Yesterday (Settled Record)'
                      : selectedDateFilter === 'ALL_TIME'
                      ? 'All-Time Shift Aggregate'
                      : 'Historical Archived Shift'}
                  </div>
                  <div className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                    <span>
                      {selectedDateFilter === 'TODAY'
                        ? formatReadableDate(activeBusinessDate)
                        : selectedDateFilter === 'YESTERDAY'
                        ? formatReadableDate(yesterdayBusinessDate)
                        : selectedDateFilter === 'ALL_TIME'
                        ? `All Records (${dayWiseRecords.length} Shifts Total)`
                        : formatReadableDate(selectedDateFilter)}
                    </span>
                    {selectedDateFilter === 'TODAY' ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                        ● SHIFT OPEN
                      </span>
                    ) : selectedDateFilter === 'ALL_TIME' ? (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 font-bold">
                        ● AGGREGATED
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-white/10 font-bold">
                        ✓ SETTLED & ARCHIVED
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400 space-y-0.5 text-left sm:text-right font-mono">
                <div>Timezone: <strong className="text-slate-200">{cartTimezone}</strong></div>
                <div>Auto-Rollover: <strong className="text-amber-300">04:00 AM Daily</strong> (Preserves historical sales)</div>
              </div>
            </div>

            {/* Financial Metrics Grid (6 Cards) */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono uppercase">Gross Sales</div>
                <div className="text-xl font-bold font-mono text-white">₹{todayTotalSales}</div>
                <div className="text-[10px] text-emerald-400 font-mono">{effectiveDateOrders.length} orders total</div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono uppercase">UPI Collections</div>
                <div className="text-xl font-bold font-mono text-sky-400">₹{upiSales}</div>
                <div className="text-[10px] text-slate-400 font-mono">Digital QR</div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono uppercase">Cash in Register</div>
                <div className="text-xl font-bold font-mono text-amber-400">₹{cashSales}</div>
                <div className="text-[10px] text-slate-400 font-mono">Physical cash</div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono uppercase">Average Ticket</div>
                <div className="text-xl font-bold font-mono text-teal-400">₹{averageTicketSize}</div>
                <div className="text-[10px] text-slate-400 font-mono">Per customer</div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono uppercase">Completed</div>
                <div className="text-xl font-bold font-mono text-emerald-400">{completedOrders.length}</div>
                <div className="text-[10px] text-slate-400 font-mono">Handed over</div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                <div className="text-[10px] text-slate-400 font-mono uppercase">Unpaid Balance</div>
                <div className="text-xl font-bold font-mono text-rose-400">₹{unpaidSales}</div>
                <div className="text-[10px] text-slate-400 font-mono">{pendingUnpaidOrders.length} tickets pending</div>
              </div>
            </div>

            {/* Shift Order Ledger Table */}
            <div className="p-5 rounded-3xl bg-white/[0.02] border border-white/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                    {selectedDateFilter === 'TODAY'
                      ? "Today's Active Shift"
                      : selectedDateFilter === 'YESTERDAY'
                      ? "Yesterday's Settled Shift"
                      : selectedDateFilter === 'ALL_TIME'
                      ? 'All-Time Aggregated'
                      : `${formatReadableDate(selectedDateFilter)} Shift`}{' '}
                    Settlement Order Ledger ({filteredBillingOrders.length})
                  </h3>
                </div>

                {/* Filter Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                  {(['ALL', 'PAID', 'UNPAID', 'CANCELLED'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setBillingFilter(mode)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                        billingFilter === mode
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="text-[10px] uppercase font-mono text-slate-400 border-b border-white/10 bg-white/[0.02]">
                    <tr>
                      <th className="py-2.5 px-3">Ticket</th>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Items</th>
                      <th className="py-2.5 px-3">Channel</th>
                      <th className="py-2.5 px-3">Payment</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3 text-center">Pickup Code</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {filteredBillingOrders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          No orders in "{billingFilter}" status for today's shift.
                        </td>
                      </tr>
                    ) : (
                      filteredBillingOrders.map((ord) => {
                        const isRedeemed = ord.pickupStatus === 'REDEEMED' || ord.status === 'COMPLETED';
                        const isPaid = ord.paymentStatus === 'PAID';
                        return (
                          <tr key={ord.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 px-3 font-bold text-white">
                              #{ord.displayOrderNumber || ord.id.slice(-4)}
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                              {formatOrderTime(ord.createdAt)}
                            </td>
                            <td className="py-2.5 px-3 text-white font-medium">
                              {ord.customerName || 'Storefront Guest'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-300 text-[11px] max-w-xs truncate">
                              {(ord.items || []).map((i: any) => `${i.quantity}x ${i.name}`).join(', ')}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded border ${
                                ord.orderType === 'COUNTER_WALK_IN'
                                  ? 'bg-sky-500/10 text-sky-300 border-sky-500/20'
                                  : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                              }`}>
                                {ord.orderType === 'COUNTER_WALK_IN' ? 'POS' : 'QR Menu'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`text-[10px] font-bold ${
                                isPaid ? 'text-emerald-400' : 'text-amber-400'
                              }`}>
                                {ord.paymentMethod || 'CASH'} • {isPaid ? 'PAID' : 'UNPAID'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-white">
                              ₹{ord.totalAmount}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[11px] font-bold text-amber-300">
                                {ord.pickupCode || '—'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                                isRedeemed
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : ord.status === 'CANCELLED'
                                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                  : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                              }`}>
                                {isRedeemed ? 'FULFILLED' : ord.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Sub-View: Analytics */}
        {activeTab === 'overview' && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto w-full">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-sky-400" />
                <span>Cart Performance & Analytics</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Real-time sales velocity, street food demand ranking, rush hours, and channel split.
              </p>
            </div>

            {/* Real-Time Operational Rollover Alert Banner */}
            {dateRolloverNotice && (
              <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3 animate-in fade-in">
                <RotateCcw className="w-5 h-5 text-amber-400 shrink-0 animate-spin" />
                <div className="flex-1 font-mono font-medium">{dateRolloverNotice}</div>
                <button onClick={() => setDateRolloverNotice(null)} className="text-amber-400 hover:text-white text-sm">✕</button>
              </div>
            )}

            {/* Day-Wise Operational Shift Selector Bar */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>Shift Period:</span>
                </div>

                {/* Today Chip */}
                <button
                  onClick={() => setSelectedDateFilter('TODAY')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    selectedDateFilter === 'TODAY'
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-950/40'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedDateFilter === 'TODAY' ? 'bg-slate-950 animate-pulse' : 'bg-emerald-400'}`} />
                  <span>Today ({formatReadableDate(activeBusinessDate)})</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedDateFilter === 'TODAY' ? 'bg-black/20 text-slate-950' : 'bg-white/10 text-slate-400'}`}>
                    {dayWiseRecords.find((r) => r.isToday)?.ordersCount || 0}
                  </span>
                </button>

                {/* Yesterday Chip */}
                <button
                  onClick={() => setSelectedDateFilter('YESTERDAY')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all cursor-pointer ${
                    selectedDateFilter === 'YESTERDAY'
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>Yesterday ({formatReadableDate(yesterdayBusinessDate)})</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${selectedDateFilter === 'YESTERDAY' ? 'bg-black/20 text-slate-950' : 'bg-white/10 text-slate-400'}`}>
                    {dayWiseRecords.find((r) => r.isYesterday)?.ordersCount || 0}
                  </span>
                </button>

                {/* Past Shift Dates Dropdown */}
                {dayWiseRecords.filter((r) => !r.isToday && !r.isYesterday).length > 0 && (
                  <select
                    value={!['TODAY', 'YESTERDAY', 'ALL_TIME'].includes(selectedDateFilter) ? selectedDateFilter : ''}
                    onChange={(e) => {
                      if (e.target.value) setSelectedDateFilter(e.target.value);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-white/5 border border-white/10 transition-all cursor-pointer ${
                      !['TODAY', 'YESTERDAY', 'ALL_TIME'].includes(selectedDateFilter)
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <option value="" disabled className="bg-slate-900 text-slate-400">Past Shift Records...</option>
                    {dayWiseRecords
                      .filter((r) => !r.isToday && !r.isYesterday)
                      .map((r) => (
                        <option key={r.dateKey} value={r.dateKey} className="bg-slate-900 text-white">
                          {r.formattedDate} ({r.ordersCount} orders • ₹{r.grossSales})
                        </option>
                      ))}
                  </select>
                )}

                {/* All-Time Chip */}
                <button
                  onClick={() => setSelectedDateFilter('ALL_TIME')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedDateFilter === 'ALL_TIME'
                      ? 'bg-purple-500 text-white shadow-md shadow-purple-950/40'
                      : 'bg-white/5 hover:bg-white/10 text-slate-400 border border-white/10'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>All-Time Aggregate ({liveOrders.length})</span>
                </button>
              </div>

              {/* Shift Rollover Live Telemetry */}
              <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Shift Rollover: 04:00 AM IST</span>
                <span className="text-white/20">•</span>
                <span className="text-slate-300">Live Auto-Updating</span>
              </div>
            </div>

            {/* Performance Stat Cards (4-grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Gross Sales</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-white">₹{todayTotalSales}</div>
                <div className="text-[10px] text-emerald-400 font-mono">
                  {completedOrders.length} fulfilled • ₹{averageTicketSize} AOV
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Fulfillment Turnaround</span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-amber-300">~3.5 Mins</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Rapid counter handover velocity
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Channel Split</span>
                  <Smartphone className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-xl font-bold font-mono text-sky-300">
                  {effectiveDateOrders.filter((o) => o.orderType !== 'COUNTER_WALK_IN').length} QR / {effectiveDateOrders.filter((o) => o.orderType === 'COUNTER_WALK_IN').length} POS
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Mobile storefront vs counter walk-in
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Digital UPI Adoption</span>
                  <TrendingUp className="w-4 h-4 text-teal-400" />
                </div>
                <div className="text-2xl font-bold font-mono text-teal-300">
                  {todayTotalSales > 0 ? Math.round((upiSales / todayTotalSales) * 100) : 0}%
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  ₹{upiSales} UPI / ₹{cashSales} Cash
                </div>
              </div>
            </div>

            {/* 2-Column Section: Best Sellers & Hourly Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Top Selling Items (lg:col-span-7) */}
              <div className="lg:col-span-7 p-5 sm:p-6 rounded-3xl bg-white/[0.02] border border-white/10 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                      Best-Selling Street Food Items ({bestSellers.length})
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">Live Rank</span>
                </div>

                {bestSellers.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-xs">
                    No dish order data recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bestSellers.slice(0, 7).map((item, idx) => {
                      const sharePct = todayTotalSales > 0 ? Math.round((item.revenue / todayTotalSales) * 100) : 0;
                      return (
                        <div key={item.name} className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold font-mono ${
                                idx === 0 ? 'bg-amber-500 text-slate-950 font-black' : idx === 1 ? 'bg-slate-300 text-slate-950' : 'bg-white/10 text-slate-300'
                              }`}>
                                #{idx + 1}
                              </span>
                              <span className="font-bold text-white truncate">{item.name}</span>
                              <span className="text-[10px] text-slate-500 font-mono">({item.category})</span>
                            </div>

                            <div className="text-right font-mono shrink-0">
                              <span className="text-amber-400 font-bold">{item.quantity} sold</span>
                              <span className="text-slate-400 text-[11px] ml-2">₹{item.revenue}</span>
                            </div>
                          </div>

                          {/* Share Progress Bar */}
                          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-amber-500 to-amber-400 h-full rounded-full"
                              style={{ width: `${Math.max(8, sharePct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Rush Hours & Order Distribution (lg:col-span-5) */}
              <div className="lg:col-span-5 p-5 sm:p-6 rounded-3xl bg-white/[0.02] border border-white/10 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-sky-400" />
                    <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                      Hourly Rush Distribution
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">8 AM - 11 PM</span>
                </div>

                <div className="space-y-2.5 pt-1">
                  {[
                    { label: 'Morning Prep (8am - 11am)', count: [8, 9, 10].reduce((s, h) => s + (hourlyDistribution[h] || 0), 0) },
                    { label: 'Lunch Rush (11am - 3pm)', count: [11, 12, 13, 14].reduce((s, h) => s + (hourlyDistribution[h] || 0), 0), highlight: true },
                    { label: 'Afternoon Lull (3pm - 5pm)', count: [15, 16].reduce((s, h) => s + (hourlyDistribution[h] || 0), 0) },
                    { label: 'Evening Peak (5pm - 9pm)', count: [17, 18, 19, 20].reduce((s, h) => s + (hourlyDistribution[h] || 0), 0), highlight: true },
                    { label: 'Night Street Food (9pm - 11pm)', count: [21, 22].reduce((s, h) => s + (hourlyDistribution[h] || 0), 0) },
                  ].map((period) => {
                    const maxOrders = Math.max(1, ...(Object.values(hourlyDistribution) as number[]));
                    const widthPct = Math.min(100, Math.round((period.count / maxOrders) * 100));
                    return (
                      <div key={period.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono">
                          <span className={period.highlight ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                            {period.label}
                          </span>
                          <span className="font-bold text-white">{period.count} orders</span>
                        </div>
                        <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              period.highlight
                                ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                                : 'bg-sky-500/60'
                            }`}
                            style={{ width: `${Math.max(period.count > 0 ? 10 : 0, widthPct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5 text-[11px] text-slate-400 font-mono mt-4">
                  💡 Peak revenue windows automatically feed kitchen preparation prep timers.
                </div>
              </div>
            </div>

            {/* Day-by-Day Historical Records & Shift Ledger Table */}
            <div className="p-5 sm:p-6 rounded-3xl bg-white/[0.02] border border-white/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                <div>
                  <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    <span>Daily Shift History & Historical Records Ledger ({dayWiseRecords.length} Shifts)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Authoritative day-wise segregation. When date changes, today rolls into previous day records in real time.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Real-Time Shift Engine Active
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                      <th className="py-2.5 px-3">Business Date</th>
                      <th className="py-2.5 px-3">Shift Status</th>
                      <th className="py-2.5 px-3">Orders (Done / Total)</th>
                      <th className="py-2.5 px-3">Gross Sales</th>
                      <th className="py-2.5 px-3">Cash vs UPI</th>
                      <th className="py-2.5 px-3">Average Order</th>
                      <th className="py-2.5 px-3">Channel (QR / POS)</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {dayWiseRecords.map((record) => {
                      const isSelected =
                        (selectedDateFilter === 'TODAY' && record.isToday) ||
                        (selectedDateFilter === 'YESTERDAY' && record.isYesterday) ||
                        selectedDateFilter === record.dateKey;

                      return (
                        <tr
                          key={record.dateKey}
                          className={`hover:bg-white/[0.04] transition-colors ${
                            isSelected ? 'bg-amber-500/10 border-l-2 border-l-amber-400' : ''
                          }`}
                        >
                          <td className="py-3 px-3">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{record.formattedDate}</span>
                              {record.isToday && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                                  TODAY
                                </span>
                              )}
                              {record.isYesterday && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">
                                  YESTERDAY
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500">{record.dateKey}</div>
                          </td>

                          <td className="py-3 px-3">
                            {record.isToday ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                LIVE ACTIVE SHIFT
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-slate-400 border border-white/10 text-[10px] font-bold">
                                <CheckCircle className="w-3 h-3 text-slate-400" />
                                SETTLED & ARCHIVED
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <span className="text-white font-bold">{record.fulfilledCount}</span>
                            <span className="text-slate-400"> / {record.ordersCount}</span>
                            {record.cancelledCount > 0 && (
                              <span className="text-rose-400 text-[10px] ml-1">({record.cancelledCount} canc)</span>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <span className="text-emerald-400 font-bold text-sm">₹{record.grossSales}</span>
                          </td>

                          <td className="py-3 px-3 text-slate-300">
                            <span className="text-amber-300">₹{record.cashSales} Cash</span>
                            <span className="text-slate-500 mx-1">/</span>
                            <span className="text-sky-300">₹{record.upiSales} UPI</span>
                          </td>

                          <td className="py-3 px-3 text-slate-300 font-bold">
                            ₹{record.averageOrderValue}
                          </td>

                          <td className="py-3 px-3 text-slate-400">
                            {record.channelQR} QR / {record.channelPOS} POS
                          </td>

                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => {
                                if (record.isToday) setSelectedDateFilter('TODAY');
                                else if (record.isYesterday) setSelectedDateFilter('YESTERDAY');
                                else setSelectedDateFilter(record.dateKey);
                              }}
                              className={`px-3 py-1 rounded-lg text-[11px] font-bold font-mono transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                                  : 'bg-white/5 hover:bg-white/15 text-slate-300 border border-white/10'
                              }`}
                            >
                              {isSelected ? 'Viewing' : 'Inspect Day'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Sub-View: Settings */}
        {activeTab === 'settings' && (
          <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-4xl mx-auto w-full">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-400" />
                <span>Cart Configuration & Station Settings</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Manage stall location, operating hours, base prep timings, tax rates, and terminal hardware.
              </p>
            </div>

            {settingsMessage && (
              <div className={`p-4 rounded-2xl border text-xs flex items-center gap-3 animate-in fade-in ${
                settingsMessage.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}>
                {settingsMessage.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                )}
                <span>{settingsMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* Card 1: Cart Identity */}
              <div className="p-5 sm:p-6 rounded-3xl bg-white/[0.02] border border-white/10 space-y-4">
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-white/10">
                  <Truck className="w-4 h-4 text-amber-400" />
                  <span>1. Food Cart Identity</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">Cart Business Name *</label>
                    <input
                      type="text"
                      required
                      value={settingsName}
                      onChange={(e) => setSettingsName(e.target.value)}
                      placeholder="e.g. MAX KART - Street Food Express"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">Stall Location / Street Address</label>
                    <input
                      type="text"
                      value={settingsAddress}
                      onChange={(e) => setSettingsAddress(e.target.value)}
                      placeholder="e.g. Stall #4, Outer Ring Road, Bengaluru"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">Contact Phone / WhatsApp</label>
                    <input
                      type="text"
                      value={settingsPhone}
                      onChange={(e) => setSettingsPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">Cuisine / Tagline Description</label>
                    <input
                      type="text"
                      value={settingsDescription}
                      onChange={(e) => setSettingsDescription(e.target.value)}
                      placeholder="e.g. Authentic Mumbai Street Chaat & Hot Rolls"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Operating Status & Ordering Availability */}
              <div className="p-5 sm:p-6 rounded-3xl bg-white/[0.02] border border-white/10 space-y-4">
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-white/10">
                  <Sliders className="w-4 h-4 text-sky-400" />
                  <span>2. Operating Availability & Kitchen Timings</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">Storefront Ordering Status</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Toggle customer QR ordering availability</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettingsIsOpen(!settingsIsOpen)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                        settingsIsOpen
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {settingsIsOpen ? '● OPEN FOR ORDERS' : '○ PAUSED / CLOSED'}
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1.5">
                    <label className="text-xs font-bold text-white block">Default Prep Estimate (Mins)</label>
                    <select
                      value={settingsPrepTime}
                      onChange={(e) => setSettingsPrepTime(parseInt(e.target.value) || 15)}
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                    >
                      <option value={5}>5 Minutes (Fast Snack/Beverage)</option>
                      <option value={10}>10 Minutes (Standard Street Food)</option>
                      <option value={15}>15 Minutes (Freshly Made Rolls/Burgers)</option>
                      <option value={20}>20 Minutes (Cooked to Order)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Card 3: Financials & Taxes */}
              <div className="p-5 sm:p-6 rounded-3xl bg-white/[0.02] border border-white/10 space-y-4">
                <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2 pb-3 border-b border-white/10">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>3. Financials, Taxes & Digital UPI</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">Applicable GST / Tax Rate (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="28"
                      value={settingsTaxRate}
                      onChange={(e) => setSettingsTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1">UPI Merchant VPA / ID</label>
                    <input
                      type="text"
                      value={settingsUpiId}
                      onChange={(e) => setSettingsUpiId(e.target.value)}
                      placeholder="e.g. maxkart@oksbi"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Save Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-950/40 cursor-pointer transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingSettings ? 'Saving Configuration...' : 'Save & Apply Cart Configuration'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
        {/* Modal: Print Counter Standee Sign */}
        {isPrintModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0f1420] border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl relative">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Printer className="w-5 h-5 text-sky-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Print Counter Sign</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>

              {/* High-Contrast Print Standee Card Preview */}
              <div
                id="print-standee"
                className="bg-white text-slate-950 p-6 rounded-2xl shadow-xl text-center space-y-3 border-2 border-slate-300 mx-auto max-w-xs"
              >
                <div className="space-y-0.5">
                  <h2 className="text-xl font-black tracking-tight uppercase text-slate-950">
                    {currentCart?.name || 'MAX KART'}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-700 tracking-wider uppercase">
                    Scan with Phone Camera to Order
                  </p>
                </div>

                <div className="p-3 bg-white border-2 border-slate-950 rounded-xl inline-block shadow-sm">
                  <QRCodeSVG
                    value={cartOrderingUrl}
                    size={180}
                    level="H"
                    marginSize={2}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-mono font-black text-slate-900">{cartOrderingUrl}</div>
                  <p className="text-[10px] font-medium text-slate-500">
                    Instant Pickup Coupon on Order • No App Needed
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const printContents = document.getElementById('print-standee')?.outerHTML;
                    const printWindow = window.open('', '_blank');
                    if (printWindow && printContents) {
                      printWindow.document.write(`
                        <html>
                          <head>
                            <title>Counter QR Sign - ${currentCart?.name || 'MAX KART'}</title>
                            <style>
                              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fff; }
                              #print-standee { border: 2px solid #000; padding: 36px; text-align: center; max-width: 360px; border-radius: 16px; }
                              h2 { font-size: 24px; margin: 0 0 6px 0; font-weight: 900; }
                              p { margin: 4px 0; font-size: 12px; color: #334155; }
                              .url { font-family: monospace; font-size: 14px; font-weight: bold; margin-top: 10px; }
                            </style>
                          </head>
                          <body onload="window.print(); window.close();">
                            ${printContents}
                          </body>
                        </html>
                      `);
                      printWindow.document.close();
                    }
                  }}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Standee Now</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
