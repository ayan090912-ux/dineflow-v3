import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { Restaurant, Order } from '../../packages/types';
import { DinelyLogo, Button } from '../../packages/ui';

interface CartAppProps {
  business?: Restaurant | null;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
}

type CartTab = 'pos' | 'orders' | 'overview' | 'menu' | 'billing' | 'settings';

interface CartMenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  isAvailable: boolean;
}

export const CartApp: React.FC<CartAppProps> = ({
  business,
  onNavigate,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<CartTab>('pos');
  const [currentCart, setCurrentCart] = useState<Restaurant | null>(business || null);
  const [liveOrders, setLiveOrders] = useState<any[]>([
    {
      id: 'ord-cart-101',
      orderNumber: '#C-101',
      customerName: 'Aman K.',
      items: [{ name: 'Spicy Masala Aloo Tikki Burger', quantity: 2, price: 120 }],
      total: 240,
      paymentMethod: 'UPI',
      status: 'PREPARING',
      time: '3 mins ago',
    },
    {
      id: 'ord-cart-102',
      orderNumber: '#C-102',
      customerName: 'Priya S.',
      items: [{ name: 'Loaded Cheese Fries Box', quantity: 1, price: 160 }, { name: 'Cold Coffee Frappe', quantity: 1, price: 90 }],
      total: 250,
      paymentMethod: 'CASH',
      status: 'READY',
      time: '1 min ago',
    },
  ]);

  // Compact Street Food / Cart Menu
  const [menuItems, setMenuItems] = useState<CartMenuItem[]>([
    { id: 'cm-1', name: 'Spicy Masala Burger', category: 'Burgers', price: 120, isAvailable: true },
    { id: 'cm-2', name: 'Crispy Paneer Wrap', category: 'Wraps', price: 150, isAvailable: true },
    { id: 'cm-3', name: 'Loaded Cheese Fries', category: 'Sides', price: 160, isAvailable: true },
    { id: 'cm-4', name: 'Veg Hakka Noodles Box', category: 'Wok Boxes', price: 140, isAvailable: true },
    { id: 'cm-5', name: 'Cold Coffee Frappe', category: 'Drinks', price: 90, isAvailable: true },
    { id: 'cm-6', name: 'Masala Lemonade (300ml)', category: 'Drinks', price: 50, isAvailable: true },
    { id: 'cm-7', name: 'Double Chocolate Brownie', category: 'Desserts', price: 80, isAvailable: false },
  ]);

  // Quick Counter POS Active Basket
  const [basket, setBasket] = useState<Array<{ item: CartMenuItem; quantity: number }>>([]);
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'CASH' | 'CARD'>('UPI');
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null);

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

  const handleQuickCheckout = () => {
    if (basket.length === 0) return;
    const newOrderNum = `#C-${Math.floor(100 + Math.random() * 900)}`;
    const newOrder = {
      id: `ord-cart-${Date.now()}`,
      orderNumber: newOrderNum,
      customerName: 'Counter Customer',
      items: basket.map((b) => ({ name: b.item.name, quantity: b.quantity, price: b.item.price })),
      total: basketSubtotal,
      paymentMethod: paymentMode,
      status: 'PREPARING',
      time: 'Just now',
    };
    setLiveOrders([newOrder, ...liveOrders]);
    setBasket([]);
    setCheckoutSuccess(`Order ${newOrderNum} paid via ${paymentMode}!`);
    setTimeout(() => setCheckoutSuccess(null), 3000);
  };

  const updateOrderStatus = (orderId: string, nextStatus: string) => {
    setLiveOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
    );
  };

  const navItems = [
    { id: 'pos' as CartTab, label: 'Quick-Counter POS', icon: ShoppingBag, badge: 'FAST' },
    { id: 'orders' as CartTab, label: 'Live Cart Queue', icon: Clock, badge: `${liveOrders.length}` },
    { id: 'overview' as CartTab, label: 'Cart Analytics', icon: LayoutDashboard },
    { id: 'menu' as CartTab, label: 'Compact Menu', icon: Truck },
    { id: 'billing' as CartTab, label: 'Daily Settlement', icon: Receipt },
    { id: 'settings' as CartTab, label: 'Cart Configuration', icon: Settings },
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
              Small Cart OS
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
                <span>{currentCart?.city || 'Bengaluru Stalls'}</span>
                <span className="text-emerald-400 font-mono font-bold">● ACTIVE</span>
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
          <span className="text-[10px] font-mono">DineFlow Cart OS v3.0</span>
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
                  <h1 className="text-xl font-bold text-white tracking-tight">Quick-Counter POS</h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tap any item to add instantly. Designed for high-speed street food and counter takeaways.
                  </p>
                </div>
              </div>

              {checkoutSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{checkoutSuccess}</span>
                </div>
              )}

              {/* Fast Item Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {menuItems.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => addToBasket(it)}
                    disabled={!it.isAvailable}
                    className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between space-y-2 cursor-pointer ${
                      it.isAvailable
                        ? 'bg-[#0e121a] border-[#1d2331] hover:border-sky-500 hover:bg-[#131822]'
                        : 'bg-[#080a0e] border-[#141822] opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      <span className="text-[9px] font-mono uppercase text-slate-400">{it.category}</span>
                      <div className="text-xs font-bold text-white mt-0.5 leading-snug">{it.name}</div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-mono font-bold text-sky-400">₹{it.price}</span>
                      <span className="p-1 rounded bg-[#1a202c] text-slate-300">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Rapid Checkout Basket */}
            <div className="w-full lg:w-80 bg-[#0c0f16] border-t lg:border-t-0 lg:border-l border-[#1a1f2b] p-5 flex flex-col justify-between shrink-0">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#1a1f2b]">
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Current Ticket</span>
                  <span className="text-xs font-mono text-slate-400">{basket.length} items</span>
                </div>

                {basket.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500 space-y-2">
                    <ShoppingBag className="w-8 h-8 mx-auto text-slate-600" />
                    <p>Ticket is empty. Tap items to add.</p>
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
                {/* Total */}
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
                  disabled={basket.length === 0}
                  className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>Instant Pay & Dispatch (₹{basketSubtotal})</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-View: Live Cart Queue */}
        {activeTab === 'orders' && (
          <div className="p-8 space-y-6 max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Live Cart Orders Stream</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Active takeaway tickets. Move tickets to Ready when packed and Completed when collected.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {liveOrders.map((ord) => (
                <div key={ord.id} className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b] space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-mono font-bold text-white">{ord.orderNumber}</span>
                      <span className="text-xs text-slate-400">• {ord.customerName}</span>
                    </div>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
                      ord.status === 'READY'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {ord.status}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-300">
                    {ord.items.map((it: any, i: number) => (
                      <div key={i} className="flex justify-between">
                        <span>{it.quantity}x {it.name}</span>
                        <span className="font-mono text-slate-400">₹{it.price * it.quantity}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-3 border-t border-[#1a1f2b] flex items-center justify-between text-xs">
                    <span className="text-slate-400">Total: <b className="text-white font-mono">₹{ord.total}</b> ({ord.paymentMethod})</span>
                    {ord.status === 'PREPARING' ? (
                      <button
                        onClick={() => updateOrderStatus(ord.id, 'READY')}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer"
                      >
                        Mark Ready
                      </button>
                    ) : (
                      <button
                        onClick={() => updateOrderStatus(ord.id, 'COMPLETED')}
                        className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] cursor-pointer"
                      >
                        Completed
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sub-View: Analytics */}
        {activeTab === 'overview' && (
          <div className="p-8 space-y-6 max-w-5xl mx-auto w-full">
            <h1 className="text-2xl font-bold text-white tracking-tight">Small Cart Analytics</h1>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b]">
                <div className="text-xs text-slate-400">Today's Counter Sales</div>
                <div className="text-2xl font-bold text-white mt-1">₹18,450</div>
                <div className="text-[10px] text-emerald-400 mt-1">78 orders dispatched</div>
              </div>
              <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b]">
                <div className="text-xs text-slate-400">Average Order Value</div>
                <div className="text-2xl font-bold text-white mt-1">₹236</div>
                <div className="text-[10px] text-slate-400 mt-1">1.8 items per customer</div>
              </div>
              <div className="p-5 rounded-2xl bg-[#0c0f16] border border-[#1a1f2b]">
                <div className="text-xs text-slate-400">Avg Prep Velocity</div>
                <div className="text-2xl font-bold text-sky-400 mt-1">3.2 Mins</div>
                <div className="text-[10px] text-slate-400 mt-1">Rapid quick-service turnaround</div>
              </div>
            </div>
          </div>
        )}

        {/* Fallback other tabs */}
        {['menu', 'billing', 'settings'].includes(activeTab) && (
          <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
            <h1 className="text-xl font-bold text-white capitalize">Cart {activeTab} Management</h1>
            <div className="p-12 border border-[#1a1f2b] rounded-2xl bg-[#0c0f16] text-center space-y-3">
              <Truck className="w-8 h-8 text-sky-400 mx-auto" />
              <div className="text-sm font-bold text-white">Small Cart {activeTab} Workspace Active</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Dedicated configuration for {currentCart?.name || 'Small Cart Business'}. Operates without restaurant table requirements.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
