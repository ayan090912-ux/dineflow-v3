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
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { Restaurant, Order, MenuItem } from '../../packages/types';
import { DinelyLogo, Button, QRCodeDisplay } from '../../packages/ui';
import { realtimeBus } from '../../packages/api/realtime';
import { getRestaurantCustomerUrl, getRestaurantPublicDomain } from '../../packages/utils/tenantResolver';

interface CartAppProps {
  business?: Restaurant | null;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
}

type CartTab = 'pos' | 'orders' | 'menu' | 'qr' | 'billing' | 'overview' | 'settings';

interface CartMenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  isAvailable: boolean;
  stockQuantity?: number;
  trackInventory?: boolean;
}

export const CartApp: React.FC<CartAppProps> = ({
  business,
  onNavigate,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<CartTab>('pos');
  const [currentCart, setCurrentCart] = useState<Restaurant | null>(business || null);
  const [liveOrders, setLiveOrders] = useState<Order[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

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

  // New Item Modal State
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Snacks');
  const [newItemPrice, setNewItemPrice] = useState(100);
  const [newItemStock, setNewItemStock] = useState(20);

  const cartId = currentCart?.id || api.getCurrentRestaurantId() || '';

  // 1. Initial Load: Live Orders & Menu from Backend
  const fetchLiveOrders = async () => {
    if (!cartId) return;
    try {
      setIsLoadingOrders(true);
      const ords = await api.getOrders(cartId);
      if (Array.isArray(ords)) {
        setLiveOrders(ords);
      }
    } catch (err) {
      console.warn('Failed to load cart live orders:', err);
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
            isAvailable: i.isAvailable !== false,
            stockQuantity: typeof i.stockQuantity === 'number' ? i.stockQuantity : 25,
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
  }, [cartId]);

  // 2. Real-Time Bus Subscription for Incoming QR Orders and Status Changes
  useEffect(() => {
    const unsub = realtimeBus.subscribe((evt: any) => {
      const p = evt.payload || evt.data || evt;
      const evtRestId = p.restaurantId || p.restaurant_id || evt.restaurantId;

      if (!cartId || evtRestId === cartId) {
        if (evt.type === 'OrderCreated' || evt.type === 'order_created') {
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
    }
  };

  // Pickup Code Redemption Workflow
  const handleRedeemCode = async (codeToRedeem: string) => {
    if (!codeToRedeem.trim()) return;
    try {
      setIsRedeeming(true);
      setRedemptionError(null);
      setRedemptionSuccess(null);

      const redeemed = await api.redeemOrderPickupCode(cartId, codeToRedeem.trim(), 'Cart Cashier');
      setLiveOrders((prev) =>
        prev.map((o) => (o.id === redeemed.id ? redeemed : o))
      );
      setRedemptionSuccess(`Pickup Coupon ${redeemed.pickupCode || codeToRedeem} Verified & Completed! Hand over food to customer.`);
      setLookupQuery('');
      setTimeout(() => setRedemptionSuccess(null), 5000);
    } catch (err: any) {
      setRedemptionError(err?.message || `Failed to redeem code '${codeToRedeem}'.`);
      setTimeout(() => setRedemptionError(null), 6000);
    } finally {
      setIsRedeeming(false);
    }
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
      await api.updateMenuItem(itemId, { isAvailable: nextAvail });
    } catch (err) {
      console.warn('Failed to toggle availability:', err);
    }
  };

  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || newItemPrice <= 0) return;

    try {
      const created = await api.createMenuItem({
        restaurantId: cartId,
        name: newItemName.trim(),
        categoryId: newItemCategory,
        price: newItemPrice,
        stockQuantity: newItemStock,
        trackInventory: true,
        isAvailable: newItemStock > 0,
      } as any);

      setMenuItems((prev) => [
        ...prev,
        {
          id: created.id,
          name: created.name,
          category: newItemCategory,
          price: created.price,
          stockQuantity: newItemStock,
          trackInventory: true,
          isAvailable: newItemStock > 0,
        },
      ]);

      setIsNewItemModalOpen(false);
      setNewItemName('');
      setNewItemPrice(100);
      setNewItemStock(20);
    } catch (err: any) {
      alert(err?.message || 'Failed to create menu item.');
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
  const activeQueueCount = liveOrders.filter((o) => o.status === 'PENDING' || o.status === 'PREPARING' || o.status === 'READY').length;

  // Single-Scan QR Target URL
  const cartPublicSlug = currentCart?.publicSlug || currentCart?.slug || currentCart?.id || 'street-cart';
  const cartOrderingUrl = `https://${cartPublicSlug}.dinely.food`;

  const navItems = [
    { id: 'pos' as CartTab, label: 'Quick-Counter POS', icon: ShoppingBag, badge: 'FAST' },
    { id: 'orders' as CartTab, label: 'Live Queue & Coupons', icon: Clock, badge: activeQueueCount > 0 ? `${activeQueueCount}` : undefined },
    { id: 'menu' as CartTab, label: 'Menu & Stock Sync', icon: Package },
    { id: 'qr' as CartTab, label: 'Counter QR Code', icon: QrCode, badge: 'SCAN' },
    { id: 'billing' as CartTab, label: 'Daily Settlement', icon: Receipt },
    { id: 'overview' as CartTab, label: 'Cart Performance', icon: LayoutDashboard },
    { id: 'settings' as CartTab, label: 'Cart Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-[#07090e] text-slate-100 font-sans overflow-hidden">
      {/* Small Cart OS Dedicated Sidebar */}
      <aside className="w-64 bg-[#0b0e14] border-r border-[#1a1f2b] p-4 flex flex-col justify-between shrink-0">
        <div className="space-y-4">
          {/* Logo & Product OS Tag */}
          <div className="flex items-center justify-between pb-3 border-b border-[#1a1f2b]">
            <DinelyLogo size="sm" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded">
              Food Cart OS
            </span>
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
                  onClick={() => setActiveTab(item.id)}
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
        {/* Sub-View: Quick-Counter POS */}
        {activeTab === 'pos' && (
          <div className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
            {/* Left: Quick Tap Menu Grid */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    <span>Quick-Counter POS</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      High-Velocity Mode
                    </span>
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tap any item to add. Stock decrements automatically upon order dispatch.
                  </p>
                </div>

                {/* Counter Pickup Code Fast Redemption Mini-Bar & Customer Storefront Link */}
                <div className="flex items-center gap-2">
                  <a
                    href={cartOrderingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 font-bold text-xs flex items-center gap-1.5 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Customer QR Menu</span>
                  </a>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Enter Pickup Code (e.g. C-101)..."
                      value={lookupQuery}
                      onChange={(e) => setLookupQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRedeemCode(lookupQuery);
                      }}
                      className="px-3 py-1.5 pl-8 rounded-xl bg-[#111622] border border-[#21293a] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 w-52"
                    />
                    <Ticket className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                  <button
                    onClick={() => handleRedeemCode(lookupQuery)}
                    disabled={!lookupQuery.trim() || isRedeeming}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Redeem Code</span>
                  </button>
                </div>
              </div>

              {checkoutSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">{checkoutSuccess}</span>
                </div>
              )}

              {redemptionSuccess && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                  <Ticket className="w-4 h-4 shrink-0 text-amber-400" />
                  <span className="font-semibold">{redemptionSuccess}</span>
                </div>
              )}

              {redemptionError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{redemptionError}</span>
                </div>
              )}

              {/* Fast Item Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {menuItems.map((it) => {
                  const isSoldOut = !it.isAvailable || (it.trackInventory && it.stockQuantity === 0);
                  return (
                    <button
                      key={it.id}
                      onClick={() => addToBasket(it)}
                      disabled={isSoldOut}
                      className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between space-y-2 cursor-pointer ${
                        !isSoldOut
                          ? 'bg-[#0e121a] border-[#1d2331] hover:border-sky-500 hover:bg-[#131822]'
                          : 'bg-[#080a0e] border-[#141822] opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono uppercase text-slate-400">{it.category}</span>
                          {it.trackInventory && (
                            <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                              isSoldOut
                                ? 'bg-rose-500/20 text-rose-300'
                                : (it.stockQuantity || 0) <= 5
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-slate-800 text-slate-300'
                            }`}>
                              {isSoldOut ? 'SOLD OUT' : `${it.stockQuantity} left`}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-white mt-1 leading-snug">{it.name}</div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-mono font-bold text-sky-400">₹{it.price}</span>
                        <span className={`p-1 rounded ${isSoldOut ? 'bg-slate-900 text-slate-600' : 'bg-[#1a202c] text-slate-300'}`}>
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Rapid Checkout Basket */}
            <div className="w-full lg:w-80 bg-[#0c0f16] border-t lg:border-t-0 lg:border-l border-[#1a1f2b] p-5 flex flex-col justify-between shrink-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#1a1f2b]">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Current Counter Ticket</span>
                  <span className="text-xs font-mono text-slate-400">{basket.length} items</span>
                </div>

                {basket.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                    <ShoppingBag className="w-8 h-8 mx-auto text-slate-600" />
                    <p>Ticket is empty. Tap menu items to add.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {basket.map(({ item, quantity }) => (
                      <div key={item.id} className="flex items-center justify-between p-2 rounded-lg bg-[#111620] border border-[#1b212e] text-xs">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="font-semibold text-white truncate">{item.name}</div>
                          <div className="text-[10px] font-mono text-slate-400">₹{item.price} each</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-5 h-5 rounded bg-[#1c2230] hover:bg-[#283247] flex items-center justify-center text-white cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold text-white w-4 text-center">{quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-5 h-5 rounded bg-[#1c2230] hover:bg-[#283247] flex items-center justify-center text-white cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Checkout Controls */}
              <div className="space-y-4 pt-4 border-t border-[#1a1f2b]">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Total Payable:</span>
                  <span className="text-xl font-mono font-bold text-white">₹{basketSubtotal}</span>
                </div>

                {/* Payment Mode Selector */}
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#111620] rounded-xl border border-[#1b212e]">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('UPI')}
                    className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      paymentMode === 'UPI' ? 'bg-sky-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>UPI</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('CASH')}
                    className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      paymentMode === 'CASH' ? 'bg-sky-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMode('CARD')}
                    className={`py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      paymentMode === 'CARD' ? 'bg-sky-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Card</span>
                  </button>
                </div>

                {/* Instant Pay & Dispatch */}
                <button
                  onClick={handleQuickCheckout}
                  disabled={basket.length === 0 || isSubmitting}
                  className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Dispatching...' : `Instant Pay & Dispatch (₹${basketSubtotal})`}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-View: Live Queue & Coupon Verification */}
        {activeTab === 'orders' && (
          <div className="p-8 space-y-6 max-w-5xl mx-auto w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Live Cart Orders & Coupon Redemption</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Customers present their confirmation code at pickup. Enter the code below to verify and fulfill.
                </p>
              </div>

              <button
                onClick={fetchLiveOrders}
                disabled={isLoadingOrders}
                className="px-3 py-1.5 rounded-xl bg-[#111622] hover:bg-[#182030] border border-[#21293a] text-xs font-semibold text-slate-300 flex items-center gap-2 self-start cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                <span>Refresh Stream</span>
              </button>
            </div>

            {/* Quick Coupon Redemption Action Bar */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-[#111622] to-sky-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-2 text-amber-400 shrink-0">
                <Ticket className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-wider">Redeem Pickup Code</span>
              </div>
              <div className="flex-1 w-full relative">
                <input
                  type="text"
                  placeholder="Enter or scan customer's code (e.g. C-101 or #C-101)..."
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRedeemCode(lookupQuery);
                  }}
                  className="w-full px-4 py-2 pl-9 rounded-xl bg-[#090c12] border border-[#21293a] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
                />
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              </div>
              <button
                onClick={() => handleRedeemCode(lookupQuery)}
                disabled={!lookupQuery.trim() || isRedeeming}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shrink-0 shadow-md shadow-amber-900/20"
              >
                <Check className="w-4 h-4" />
                <span>{isRedeeming ? 'Verifying...' : 'Verify & Hand Over'}</span>
              </button>
            </div>

            {redemptionSuccess && (
              <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                <span className="font-semibold">{redemptionSuccess}</span>
              </div>
            )}

            {redemptionError && (
              <div className="p-4 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center gap-3">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
                <span>{redemptionError}</span>
              </div>
            )}

            {/* Orders Stream Cards */}
            {filteredOrders.length === 0 ? (
              <div className="p-12 text-center bg-[#0c0f16] border border-[#1a1f2b] rounded-2xl space-y-3">
                <Clock className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-sm font-bold text-white">No Matching Orders in Queue</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Orders placed by customers via QR code or counter POS will appear here in real time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredOrders.map((ord) => {
                  const isRedeemed = ord.pickupStatus === 'REDEEMED' || ord.status === 'COMPLETED';
                  const codeBadge = ord.pickupCode || ord.displayOrderNumber || `#${ord.id.slice(-4)}`;

                  return (
                    <div
                      key={ord.id}
                      className={`p-5 rounded-2xl border transition-all space-y-4 ${
                        isRedeemed
                          ? 'bg-[#090b10] border-[#151a24] opacity-75'
                          : ord.status === 'READY'
                          ? 'bg-[#0d121c] border-emerald-500/30 shadow-lg shadow-emerald-950/20'
                          : 'bg-[#0c0f16] border-[#1a1f2b]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base font-mono font-black text-amber-300 px-2.5 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            {codeBadge}
                          </span>
                          <span className="text-xs text-slate-300 font-semibold">• {ord.customerName || 'Customer'}</span>
                        </div>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
                            isRedeemed
                              ? 'bg-slate-800 text-slate-400 border-slate-700'
                              : ord.status === 'READY'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                        >
                          {isRedeemed ? '✓ REDEEMED' : ord.status}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-300 bg-[#07090e] p-3 rounded-xl border border-[#141924]">
                        {(ord.items || []).map((it: any, i: number) => (
                          <div key={i} className="flex justify-between items-center">
                            <span>
                              <b className="text-white">{it.quantity}x</b> {it.name}
                            </span>
                            <span className="font-mono text-slate-400">₹{(it.price || 0) * (it.quantity || 1)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-[#1a1f2b] flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          Total: <b className="text-white font-mono">₹{ord.totalAmount}</b> ({ord.paymentMethod || 'PAID'})
                        </span>

                        <div className="flex items-center gap-2">
                          {!isRedeemed && (
                            <>
                              {ord.status === 'PENDING' || ord.status === 'PREPARING' ? (
                                <button
                                  onClick={() => updateOrderStatus(ord.id, 'READY')}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer shadow-sm"
                                >
                                  Mark Ready
                                </button>
                              ) : null}

                              <button
                                onClick={() => handleRedeemCode(ord.pickupCode || ord.id)}
                                disabled={isRedeeming}
                                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] cursor-pointer flex items-center gap-1 shadow-sm"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Redeem Pickup</span>
                              </button>
                            </>
                          )}
                          {isRedeemed && (
                            <span className="text-[10px] font-mono text-slate-500">
                              Fulfilled & Complete
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sub-View: Menu & Real-Time Stock Sync */}
        {activeTab === 'menu' && (
          <div className="p-8 space-y-6 max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Menu & Real-Time Stock Management</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Adjust stock levels, pricing, or toggle availability. The customer mobile menu syncs immediately.
                </p>
              </div>

              <button
                onClick={() => setIsNewItemModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>Add Street Food Item</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {menuItems.map((item) => (
                <div
                  key={item.id}
                  className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b] space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-400">{item.category}</span>
                      <h3 className="text-sm font-bold text-white mt-0.5">{item.name}</h3>
                    </div>
                    <button
                      onClick={() => handleToggleAvailability(item.id)}
                      className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold cursor-pointer transition-all ${
                        item.isAvailable
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {item.isAvailable ? 'AVAILABLE' : 'OFFLINE'}
                    </button>
                  </div>

                  <div className="p-3 bg-[#080a0e] rounded-xl border border-[#161a25] flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-mono">Current Stock</div>
                      <div className="text-lg font-mono font-bold text-white mt-0.5">
                        {item.stockQuantity !== undefined ? item.stockQuantity : 'Unlimited'}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleStockAdjust(item.id, -1)}
                        className="w-7 h-7 rounded-lg bg-[#141822] hover:bg-[#1f2636] text-slate-200 flex items-center justify-center font-bold text-xs cursor-pointer"
                        title="Reduce 1"
                      >
                        -1
                      </button>
                      <button
                        onClick={() => handleStockAdjust(item.id, 5)}
                        className="px-2.5 h-7 rounded-lg bg-[#141822] hover:bg-[#1f2636] text-slate-200 flex items-center justify-center font-bold text-xs cursor-pointer"
                        title="Add 5"
                      >
                        +5
                      </button>
                      <button
                        onClick={() => handleStockAdjust(item.id, 20)}
                        className="px-2.5 h-7 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 flex items-center justify-center font-bold text-xs cursor-pointer"
                        title="Restock 20"
                      >
                        +20
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-[#1a1f2b]">
                    <span>Item Price: <b className="text-sky-400 font-mono">₹{item.price}</b></span>
                    <span className="text-[10px] text-slate-500">Auto-disables at 0 stock</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal: Add Cart Menu Item */}
            {isNewItemModalOpen && (
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-[#0e121a] border border-[#212737] rounded-2xl p-6 max-w-md w-full space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#212737]">
                    <h3 className="text-sm font-bold text-white">Add New Street Food Item</h3>
                    <button
                      onClick={() => setIsNewItemModalOpen(false)}
                      className="text-slate-400 hover:text-white text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleCreateNewItem} className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Item Name</label>
                      <input
                        type="text"
                        required
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        placeholder="e.g. Masala Dosa Roll"
                        className="w-full px-3 py-2 rounded-xl bg-[#141822] border border-[#212737] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Category</label>
                        <input
                          type="text"
                          value={newItemCategory}
                          onChange={(e) => setNewItemCategory(e.target.value)}
                          placeholder="e.g. Snacks, Drinks"
                          className="w-full px-3 py-2 rounded-xl bg-[#141822] border border-[#212737] text-xs text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Price (₹)</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={newItemPrice}
                          onChange={(e) => setNewItemPrice(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 rounded-xl bg-[#141822] border border-[#212737] text-xs text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-400 block mb-1">Starting Stock Count</label>
                      <input
                        type="number"
                        min="0"
                        value={newItemStock}
                        onChange={(e) => setNewItemStock(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl bg-[#141822] border border-[#212737] text-xs text-white focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div className="pt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsNewItemModalOpen(false)}
                        className="flex-1 py-2 rounded-xl bg-[#141822] hover:bg-[#1a202c] text-slate-300 text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold cursor-pointer"
                      >
                        Add to Cart Menu
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sub-View: Single-Scan QR Setup & Counter Display */}
        {activeTab === 'qr' && (
          <div className="p-8 space-y-6 max-w-4xl mx-auto w-full">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Single-Scan Cart QR Setup</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-bold">
                  Zero App Required
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Display this QR code at your cart counter. Customers scan with their phone camera to instantly browse and place orders.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {/* Standee Preview Card */}
              <div className="p-6 rounded-3xl bg-gradient-to-b from-[#10141e] to-[#090c12] border border-[#1f2638] flex flex-col items-center text-center space-y-5 shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Truck className="w-6 h-6" />
                </div>

                <div>
                  <h3 className="text-lg font-extrabold text-white">{currentCart?.name || 'Street Food Express Cart'}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Scan to View Menu & Order Takeaway</p>
                </div>

                <div className="p-4 bg-white rounded-2xl shadow-xl">
                  <QRCodeDisplay
                    value={cartOrderingUrl}
                    size={200}
                    tableNumber="COUNTER"
                    restaurantName={currentCart?.name || 'Street Food Cart'}
                    isPickup={true}
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-mono font-bold text-amber-300 flex items-center justify-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Instant Confirmation Codes on Order</span>
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Direct web ordering • Fast UPI / Cash payments • Live ticket tracking
                  </p>
                </div>
              </div>

              {/* Instructions & Actions */}
              <div className="space-y-5">
                <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b] space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">Cart Ordering URL</h3>
                  <div className="p-3 bg-[#07090e] rounded-xl border border-[#171c26] flex items-center justify-between gap-2">
                    <span className="text-xs font-mono text-sky-400 truncate">{cartOrderingUrl}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(cartOrderingUrl);
                        alert('Copied ordering URL!');
                      }}
                      className="p-1.5 rounded-lg bg-[#161a25] hover:bg-[#202738] text-slate-300 cursor-pointer"
                      title="Copy URL"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Works on all smartphones without installing an app or registering an account.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b] space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">How the Single-Scan Flow Works</h3>
                  <ul className="text-xs text-slate-300 space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-sky-400 font-bold">1.</span>
                      <span>Customer scans the QR code at your cart counter with their phone camera.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-sky-400 font-bold">2.</span>
                      <span>Your branded menu opens instantly showing prices, real-time stock, and modifiers.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-sky-400 font-bold">3.</span>
                      <span>Customer submits order and receives a unique pickup code (e.g. <b>#C-101</b>).</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-sky-400 font-bold">4.</span>
                      <span>Order pops up on your screen. When ready, enter their code to redeem and complete.</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => window.open(cartOrderingUrl, '_blank')}
                  className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Preview Customer Mobile Menu</span>
                </button>
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
      </main>
    </div>
  );
};
