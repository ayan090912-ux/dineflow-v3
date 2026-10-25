import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { api } from '../../packages/api/client';
import { Restaurant, Order, MenuItem } from '../../packages/types';
import { DinelyLogo, Button } from '../../packages/ui';
import { realtimeBus } from '../../packages/api/realtime';
import { getRestaurantCustomerUrl, getRestaurantPublicDomain, getTenantUrl } from '../../packages/utils/tenantResolver';
import { CART_THEMES, resolveCartTheme, CartTheme, CartThemeId } from './cartThemes';

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

  const playAlertBeep = () => {
    if (!soundAlertEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Audio autoplay restrictions catch
    }
  };

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
              if (o.status === 'PENDING' || o.status === 'NEW') {
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
    fetchLiveOrders();
    fetchMenuItems();
    // 5-second resilient polling fallback
    const interval = setInterval(() => {
      fetchLiveOrders();
    }, 5000);
    return () => clearInterval(interval);
  }, [cartId]);

  // 2. Real-Time Bus Subscription for Incoming QR Orders and Status Changes
  useEffect(() => {
    const unsub = realtimeBus.subscribe((evt: any) => {
      const p = evt.payload || evt.data || evt;
      const evtRestId = p.restaurantId || p.restaurant_id || evt.restaurantId;

      if (!cartId || evtRestId === cartId) {
        if (evt.type === 'OrderCreated' || evt.type === 'order_created') {
          const newId = p.orderId || p.id || evt.orderId;
          if (newId && !seenOrderIdsRef.current.has(newId)) {
            seenOrderIdsRef.current.add(newId);
            playAlertBeep();
          }
          fetchLiveOrders();
        } else if (evt.type === 'OrderUpdated' || evt.type === 'order_updated' || evt.type === 'order_redeemed') {
          fetchLiveOrders();
        } else if (evt.type === 'MenuItemCreated' || evt.type === 'menu_item_created' || evt.type === 'menu_item_updated') {
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
      setCheckoutSuccess(`Order ${created.pickupCode || created.displayOrderNumber || '#' + created.id} paid via ${paymentMode}!`);
      setTimeout(() => setCheckoutSuccess(null), 4000);
    } catch (err: any) {
      console.error('POS Checkout failed:', err);
      alert(err?.message || 'Failed to dispatch order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status transitions
  const updateOrderStatus = async (orderId: string, nextStatus: string) => {
    try {
      await api.updateOrderStatus(orderId, nextStatus);
      setLiveOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus as any } : o))
      );
    } catch (err: any) {
      console.error('Failed to update status:', err);
      alert('Status transition failed: ' + (err?.message || 'Error'));
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

      const redeemed = await api.redeemOrderPickupCode(cartId, codeToRedeem.trim(), 'Terminal Staff', force);
      setLiveOrders((prev) =>
        prev.map((o) => (o.id === redeemed.id ? redeemed : o))
      );
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

  // Metrics for overview & settlement
  const todayTotalSales = liveOrders
    .filter((o) => o.status !== 'CANCELLED')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const upiSales = liveOrders
    .filter((o) => o.status !== 'CANCELLED' && o.paymentMethod === 'UPI')
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const cashSales = liveOrders
    .filter((o) => o.status !== 'CANCELLED' && (o.paymentMethod === 'CASH' || !o.paymentMethod))
    .reduce((sum, o) => sum + (o.totalAmount || 0), 0);

  // Single-Scan QR Canonical URL (dynamic for every cart tenant)
  const cartPublicSlug = currentCart?.publicSlug || currentCart?.slug || currentCart?.id || '';
  const cartOrderingUrl = getTenantUrl(currentCart);

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

  const newOrdersCount = liveOrders.filter((o) => o.status === 'PENDING').length;
  const preparingOrdersCount = liveOrders.filter((o) => o.status === 'ACCEPTED' || o.status === 'PREPARING').length;
  const readyOrdersCount = liveOrders.filter((o) => o.status === 'READY' && o.pickupStatus !== 'REDEEMED' && o.status !== 'COMPLETED').length;
  const completedOrdersCount = liveOrders.filter((o) => o.status === 'COMPLETED' || o.pickupStatus === 'REDEEMED').length;
  const cancelledOrdersCount = liveOrders.filter((o) => o.status === 'CANCELLED').length;
  const activeQueueCount = newOrdersCount + preparingOrdersCount + readyOrdersCount;

  const displayedTerminalOrders = useMemo(() => {
    return liveOrders.filter((ord) => {
      const isRedeemed = ord.pickupStatus === 'REDEEMED' || ord.status === 'COMPLETED';
      const isCancelled = ord.status === 'CANCELLED';
      if (terminalFilter === 'NEW') return ord.status === 'PENDING';
      if (terminalFilter === 'PREPARING') return ord.status === 'ACCEPTED' || ord.status === 'PREPARING';
      if (terminalFilter === 'READY') return ord.status === 'READY' && !isRedeemed;
      if (terminalFilter === 'COMPLETED') return isRedeemed;
      if (terminalFilter === 'CANCELLED') return isCancelled;
      return !isRedeemed && !isCancelled;
    }).sort((a, b) => {
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
  }, [liveOrders, terminalFilter]);

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
            {/* Terminal Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#1a1f2b]">
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                    <BellRing className="w-6 h-6 text-amber-400" />
                    <span>Order Receiving Terminal</span>
                  </h1>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    LIVE DISPATCH
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Incoming QR storefront & counter orders. Prepare items, verify customer pickup codes, and complete handovers.
                </p>
              </div>

              {/* Status Controls, Walk-in Button & Live Connection Badge */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Live Feed Status Badge */}
                <div className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-semibold flex items-center gap-2 ${
                  isLiveConnected
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span>{isLiveConnected ? 'Live Feed Connected' : 'Reconnecting...'}</span>
                </div>

                {/* Audio Alert Toggle */}
                <button
                  onClick={() => setSoundAlertEnabled(!soundAlertEnabled)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                    soundAlertEnabled
                      ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                  title={soundAlertEnabled ? 'Mute incoming order alert sound' : 'Unmute incoming order alert sound'}
                >
                  {soundAlertEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span>{soundAlertEnabled ? 'Sound ON' : 'Muted'}</span>
                </button>

                {/* Refresh Orders */}
                <button
                  onClick={fetchLiveOrders}
                  disabled={isLoadingOrders}
                  className="p-1.5 rounded-xl bg-[#11151e] border border-[#212737] text-slate-300 hover:text-white cursor-pointer disabled:opacity-50"
                  title="Refresh Queue"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingOrders ? 'animate-spin text-sky-400' : ''}`} />
                </button>



                {/* Customer QR Menu Link */}
                <a
                  href={cartOrderingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Customer QR Menu</span>
                </a>
              </div>
            </div>

            {/* Quick Pickup Code Verification & Lookup Bar */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-[#111622] to-sky-500/10 border-2 border-amber-500/20 flex flex-col sm:flex-row items-center gap-3 shadow-md">
              <div className="flex items-center gap-2 text-amber-400 shrink-0">
                <Ticket className="w-5 h-5 text-amber-400" />
                <span className="text-xs font-black uppercase tracking-wider">Pickup Code Verification</span>
              </div>
              <div className="flex-1 w-full relative">
                <input
                  type="text"
                  placeholder="Enter or scan customer pickup code (e.g. K7P4, C-104, #ORD-1)..."
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLookupAndVerify(lookupQuery);
                  }}
                  className="w-full px-4 py-2.5 pl-10 rounded-xl bg-[#080a0f] border border-[#21293a] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono tracking-wider font-bold"
                />
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
              <button
                onClick={() => handleLookupAndVerify(lookupQuery)}
                disabled={!lookupQuery.trim() || isRedeeming}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shrink-0 shadow-lg shadow-amber-900/30"
              >
                <Check className="w-4 h-4" />
                <span>{isRedeeming ? 'Verifying...' : 'Lookup & Redeem Code'}</span>
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
              <div className="p-4 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-200 text-xs flex items-center gap-3 shadow-md">
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

            {/* Filter Section Tabs with Live Counts */}
            <div className="flex flex-wrap items-center gap-2 border-b border-[#1a1f2b] pb-3">
              {[
                { id: 'ACTIVE', label: 'All Active Queue', count: activeQueueCount },
                { id: 'NEW', label: 'New Orders', count: newOrdersCount },
                { id: 'PREPARING', label: 'Preparing', count: preparingOrdersCount },
                { id: 'READY', label: 'Ready for Pickup', count: readyOrdersCount },
                { id: 'COMPLETED', label: 'Completed / Recent', count: completedOrdersCount },
                { id: 'CANCELLED', label: 'Cancelled', count: cancelledOrdersCount },
              ].map((tab) => {
                const isSelected = terminalFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setTerminalFilter(tab.id as any)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-900/20'
                        : 'bg-[#0e121a] text-slate-400 hover:text-white hover:bg-[#131822] border border-[#1b2230]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-md font-mono text-[10px] font-extrabold ${
                      isSelected ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Orders Stream / Empty State */}
            {displayedTerminalOrders.length === 0 ? (
              <div className="p-12 text-center bg-[#0c0f16] border border-[#1a1f2b] rounded-2xl space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
                  <BellRing className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-white">
                    {terminalFilter === 'ACTIVE'
                      ? 'No Active Orders in Queue'
                      : `No Orders in "${terminalFilter}" State`}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    When customers scan the QR code and place orders via the Cart Storefront, they will appear here instantly with live sound alerts and unique pickup coupons.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <a
                    href={cartOrderingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-900/30 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Customer Storefront</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {displayedTerminalOrders.map((ord) => {
                  const isRedeemed = ord.pickupStatus === 'REDEEMED' || ord.status === 'COMPLETED';
                  const isCancelled = ord.status === 'CANCELLED';
                  const isWalkIn = ord.orderType === 'COUNTER_WALK_IN' || ord.tableNumber === 'COUNTER';
                  const codeBadge = ord.pickupCode || ord.displayOrderNumber || `#${ord.id.slice(-4)}`;

                  return (
                    <div
                      key={ord.id}
                      className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                        isRedeemed
                          ? 'bg-[#090b10] border-[#161c28] opacity-80'
                          : isCancelled
                          ? 'bg-[#0c090a] border-rose-950/40 opacity-70'
                          : ord.status === 'READY'
                          ? 'bg-[#0d121c] border-emerald-500/40 shadow-xl shadow-emerald-950/20'
                          : ord.status === 'PREPARING'
                          ? 'bg-[#0c0f18] border-indigo-500/30 shadow-lg shadow-indigo-950/15'
                          : 'bg-[#0c0f16] border-[#1d2433] hover:border-amber-500/30 shadow-md'
                      }`}
                    >
                      {/* Order Card Top Line */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-300">
                              #{ord.displayOrderNumber || ord.id.slice(-4)}
                            </span>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              QR Storefront
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-400" />
                              <span>{formatOrderTime(ord.createdAt)}</span>
                            </span>
                            <span className="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                              ~{ord.estimatedPrepTimeMinutes || (ord as any).estimated_prep_time_minutes || 15}m prep
                            </span>
                          </div>
                        </div>

                        {/* Large High-Visibility Pickup Code Banner */}
                        <div className={`p-3 rounded-xl border-2 flex items-center justify-between ${
                          isRedeemed
                            ? 'bg-slate-900/60 border-slate-800 text-slate-400'
                            : ord.status === 'READY'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        }`}>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Pickup Coupon
                            </div>
                            <div className="text-xl sm:text-2xl font-black font-mono tracking-wider">
                              {codeBadge}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-[10px] font-bold font-mono px-2 py-1 rounded-md border uppercase ${
                              isRedeemed
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : ord.status === 'READY'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : ord.status === 'PREPARING'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                : ord.status === 'ACCEPTED'
                                ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                                : isCancelled
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                            }`}>
                              {isRedeemed ? '✓ FULFILLED' : ord.status === 'PENDING' ? 'NEW ORDER' : ord.status}
                            </span>
                          </div>
                        </div>

                        {/* Ordered Items List with Dish Photos */}
                        <div className="space-y-2 py-1">
                          {(ord.items || []).map((it: any, i: number) => {
                            const dishImg = getDishThumbnail(it);
                            return (
                              <div
                                key={i}
                                className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-[#07090e] border border-[#141822]"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {dishImg ? (
                                    <img
                                      src={dishImg}
                                      alt={it.name}
                                      className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[#212737]"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-lg bg-[#141924] border border-[#212737] flex items-center justify-center text-slate-500 shrink-0">
                                      <UtensilsCrossed className="w-4 h-4 text-slate-400" />
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                                      <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-[10px] font-black shrink-0">
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

                      {/* Card Bottom: Total, Payment & Lifecycle Actions */}
                      <div className="space-y-3 pt-3 border-t border-[#1a1f2b]">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Payable</div>
                            <div className="text-sm font-black font-mono text-white">₹{ord.totalAmount}</div>
                          </div>
                          <div>
                            {ord.paymentStatus === 'PAID' ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-[11px] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>PAID • {ord.paymentMethod || 'CASH'}</span>
                              </span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-[10px]">
                                  UNPAID
                                </span>
                                <button
                                  onClick={() => handleMarkPaid(ord.id, 'CASH')}
                                  className="px-1.5 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white text-[10px] font-bold border border-emerald-500/30 transition-all cursor-pointer"
                                  title="Mark Paid via Cash"
                                >
                                  Cash
                                </button>
                                <button
                                  onClick={() => handleMarkPaid(ord.id, 'UPI')}
                                  className="px-1.5 py-0.5 rounded bg-sky-600/30 hover:bg-sky-600 text-sky-300 hover:text-white text-[10px] font-bold border border-sky-500/30 transition-all cursor-pointer"
                                  title="Mark Paid via UPI"
                                >
                                  UPI
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Operational Lifecycle Buttons */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          {(ord.status === 'PENDING' || ord.status === 'NEW' || ord.status === 'ACCEPTED') && (
                            <>
                              <button
                                onClick={() => updateOrderStatus(ord.id, 'CANCELLED')}
                                className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold text-xs cursor-pointer transition-all"
                              >
                                Cancel Order
                              </button>
                              <button
                                onClick={() => updateOrderStatus(ord.id, 'PREPARING')}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-indigo-900/30 cursor-pointer transition-all flex-1"
                              >
                                <ChefHat className="w-4 h-4" />
                                <span>Start Preparing</span>
                              </button>
                            </>
                          )}

                          {ord.status === 'PREPARING' && (
                            <>
                              <button
                                onClick={() => updateOrderStatus(ord.id, 'CANCELLED')}
                                className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-bold text-xs cursor-pointer transition-all"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => updateOrderStatus(ord.id, 'READY')}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-900/30 cursor-pointer transition-all flex-1"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Mark Ready for Pickup</span>
                              </button>
                            </>
                          )}

                          {ord.status === 'READY' && (
                            <button
                              onClick={() => {
                                setSelectedOrderForHandover(ord);
                                setHandoverInputCode(ord.pickupCode || ord.id);
                                setHandoverError(null);
                              }}
                              className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30 cursor-pointer transition-all"
                            >
                              <Ticket className="w-4 h-4" />
                              <span>Verify Pickup Code & Hand Over</span>
                            </button>
                          )}

                          {isRedeemed && (
                            <div className="w-full py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5">
                              <CheckCheck className="w-4 h-4 text-emerald-400" />
                              <span>✓ Handed Over & Completed</span>
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

            {/* Handover & Code Verification Modal */}
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
                className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Add Street Food Item</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {menuItems.map((item) => {
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

                      {/* Action buttons: Status badge & Edit */}
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
                        <button
                          onClick={() => openEditItemModal(item)}
                          className="px-2.5 py-1 rounded-lg bg-[#141822] hover:bg-[#1f2636] text-slate-300 hover:text-white border border-[#212737] flex items-center gap-1 text-[10px] font-semibold cursor-pointer transition-all"
                          title="Edit Item & Photo"
                        >
                          <Pencil className="w-3 h-3 text-sky-400" />
                          <span>Edit</span>
                        </button>
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
          <div className="p-8 space-y-6 max-w-5xl mx-auto w-full">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Cart Daily Settlement & Shift</h1>
              <p className="text-xs text-slate-400 mt-1">
                Authoritative business-day attribution for counter sales, cash collections, and UPI revenue.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b]">
                <div className="text-xs text-slate-400">Total Settled Sales</div>
                <div className="text-2xl font-bold text-white mt-1">₹{todayTotalSales}</div>
                <div className="text-[10px] text-emerald-400 mt-1">{liveOrders.length} total orders recorded</div>
              </div>
              <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b]">
                <div className="text-xs text-slate-400">UPI Payments Collected</div>
                <div className="text-2xl font-bold text-sky-400 mt-1">₹{upiSales}</div>
                <div className="text-[10px] text-slate-400 mt-1">Digital QR collections</div>
              </div>
              <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b]">
                <div className="text-xs text-slate-400">Cash in Register</div>
                <div className="text-2xl font-bold text-amber-400 mt-1">₹{cashSales}</div>
                <div className="text-[10px] text-slate-400 mt-1">Physical currency collected</div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b] space-y-4">
              <h3 className="text-sm font-bold text-white">Continuous Business-Day Attribution</h3>
              <p className="text-xs text-slate-400">
                Operating under restaurant timezone {currentCart?.timezone || 'Asia/Kolkata'}. Daily shift rolls over automatically at 04:00 AM local time. No manual close required.
              </p>
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Automatic Shift Lifecycle Active</span>
              </div>
            </div>
          </div>
        )}

        {/* Sub-View: Analytics */}
        {activeTab === 'overview' && (
          <div className="p-8 space-y-6 max-w-5xl mx-auto w-full">
            <h1 className="text-2xl font-bold text-white tracking-tight">Small Cart Performance & Analytics</h1>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b]">
                <div className="text-xs text-slate-400">Total Revenue</div>
                <div className="text-2xl font-bold text-white mt-1">₹{todayTotalSales}</div>
                <div className="text-[10px] text-emerald-400 mt-1">{liveOrders.length} orders recorded</div>
              </div>
              <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b]">
                <div className="text-xs text-slate-400">Average Ticket Size</div>
                <div className="text-2xl font-bold text-white mt-1">
                  ₹{liveOrders.length > 0 ? Math.round(todayTotalSales / liveOrders.length) : 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Per counter customer</div>
              </div>
              <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b]">
                <div className="text-xs text-slate-400">Fulfillment Velocity</div>
                <div className="text-2xl font-bold text-sky-400 mt-1">2.8 Mins</div>
                <div className="text-[10px] text-slate-400 mt-1">Rapid street-food turnaround</div>
              </div>
            </div>
          </div>
        )}

        {/* Sub-View: Settings */}
        {activeTab === 'settings' && (
          <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
            <h1 className="text-xl font-bold text-white">Cart Configuration</h1>
            <div className="p-6 border border-[#1a1f2b] rounded-2xl bg-[#0c0f16] space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Cart Business Name</label>
                <div className="text-sm font-bold text-white">{currentCart?.name || 'Street Food Express Cart'}</div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Operating Location / Stall</label>
                <div className="text-sm text-slate-300">{currentCart?.city || 'Bengaluru Stalls'}</div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Product Type</label>
                <div className="text-xs font-mono text-sky-400">FOOD_CART / SMALL_CART OS (No table reservations required)</div>
              </div>
            </div>
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
