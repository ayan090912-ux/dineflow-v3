import React, { useState, useEffect } from 'react';
import {
  Wine,
  GlassWater,
  Beer,
  LayoutDashboard,
  Tv,
  ShoppingBag,
  Package,
  Users,
  Receipt,
  Settings,
  Grid,
  Layers,
  ArrowLeft,
  Search,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  DollarSign,
  TrendingUp,
  Percent,
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { Restaurant, User, Order } from '../../packages/types';
import { DinelyLogo, Button } from '../../packages/ui';
import { BarTerminal } from './BarTerminal';

interface BarAppProps {
  business?: Restaurant | null;
  onNavigate?: (path: string) => void;
  onLogout?: () => void;
}

type BarTab = 'overview' | 'terminal' | 'orders' | 'menu' | 'inventory' | 'staff' | 'billing' | 'settings';

export const BarApp: React.FC<BarAppProps> = ({
  business,
  onNavigate,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<BarTab>('overview');
  const [currentBar, setCurrentBar] = useState<Restaurant | null>(business || null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Drink Menu State
  const [drinkItems, setDrinkItems] = useState<any[]>([
    { id: 'b-1', name: 'Smoked Old Fashioned', category: 'Cocktails', price: 650, alcoholByVolume: '38%', isAvailable: true, inStockCount: 45 },
    { id: 'b-2', name: 'Elderflower Gin & Tonic', category: 'Cocktails', price: 580, alcoholByVolume: '14%', isAvailable: true, inStockCount: 30 },
    { id: 'b-3', name: 'Single Malt 12Y (60ml)', category: 'Spirits', price: 950, alcoholByVolume: '40%', isAvailable: true, inStockCount: 18 },
    { id: 'b-4', name: 'Belgian Witbier Draught (Pint)', category: 'Beer on Tap', price: 420, alcoholByVolume: '5.2%', isAvailable: true, inStockCount: 65 },
    { id: 'b-5', name: 'Cabernet Sauvignon Glass', category: 'Wine Cellar', price: 720, alcoholByVolume: '13.5%', isAvailable: false, inStockCount: 0 },
    { id: 'b-6', name: 'Passionfruit Mint Mocktail', category: 'Zero-Proof', price: 340, alcoholByVolume: '0%', isAvailable: true, inStockCount: 50 },
  ]);

  // Inventory State
  const [liquorStock, setLiquorStock] = useState<any[]>([
    { id: 'liq-1', item: 'Bourbon Whiskey (750ml)', category: 'Bourbon', bottles: 12, parLevel: 8, status: 'OPTIMAL' },
    { id: 'liq-2', item: 'Artisanal Dry Gin (700ml)', category: 'Gin', bottles: 6, parLevel: 6, status: 'REORDER_SOON' },
    { id: 'liq-3', item: 'Belgian Witbier Keg (50L)', category: 'Draught Keg', bottles: 2, parLevel: 3, status: 'LOW_STOCK' },
    { id: 'liq-4', item: 'Italian Sweet Vermouth', category: 'Fortified Wine', bottles: 8, parLevel: 4, status: 'OPTIMAL' },
  ]);

  const loadBarData = async () => {
    setIsLoading(true);
    try {
      const restId = currentBar?.id || api.getCurrentRestaurantId();
      if (restId) {
        const details = await api.getRestaurantDetails(restId);
        if (details) setCurrentBar(details);
        const ords = await api.getOrders(restId, { station: 'BAR' });
        setOrders(ords || []);
      }
    } catch (e) {
      console.warn('Failed to load Bar OS data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBarData();
  }, []);

  const toggleItemAvailability = (id: string) => {
    setDrinkItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, isAvailable: !it.isAvailable } : it))
    );
  };

  const navItems = [
    { id: 'overview' as BarTab, label: 'Bar Overview', icon: LayoutDashboard },
    { id: 'terminal' as BarTab, label: 'Drink Service KDS', icon: Tv, badge: 'LIVE' },
    { id: 'orders' as BarTab, label: 'Bar POS & Tabs', icon: ShoppingBag },
    { id: 'menu' as BarTab, label: 'Cocktails & Spirits', icon: Wine },
    { id: 'inventory' as BarTab, label: 'Bottle & Keg Stock', icon: Package },
    { id: 'staff' as BarTab, label: 'Bartenders & Shifts', icon: Users },
    { id: 'billing' as BarTab, label: 'Tabs & Invoices', icon: Receipt },
    { id: 'settings' as BarTab, label: 'Bar Configuration', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-[#07090e] text-slate-100 font-sans overflow-hidden">
      {/* Bar OS Dedicated Sidebar */}
      <aside className="w-64 bg-[#0c0f17] border-r border-[#1b202c] p-4 flex flex-col justify-between shrink-0">
        <div className="space-y-4">
          {/* Logo & Product OS Tag */}
          <div className="flex items-center justify-between pb-3 border-b border-[#1b202c]">
            <DinelyLogo size="sm" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded">
              Bar OS
            </span>
          </div>

          {/* Return to Central Business Hub Button */}
          <button
            onClick={() => {
              if (onNavigate) onNavigate('/hub');
              else window.location.href = '/hub';
            }}
            className="w-full px-3 py-2 rounded-xl bg-[#131722] hover:bg-[#1a202e] border border-[#232b3d] text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-between transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <Grid className="w-3.5 h-3.5 text-violet-400" />
              <span>Business Hub</span>
            </div>
            <ArrowLeft className="w-3.5 h-3.5 text-slate-500 group-hover:-translate-x-0.5 transition-transform" />
          </button>

          {/* Active Bar Business Identity Badge */}
          <div className="p-3 bg-[#111520] border border-[#1d2434] rounded-xl flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shrink-0">
              <Wine className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xs font-bold text-white truncate">
                {currentBar?.name || 'Artisanal Bar & Lounge'}
              </h2>
              <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <span>{currentBar?.city || 'Bengaluru'}</span>
                <span className="text-emerald-400 font-mono font-bold">● LIVE</span>
              </p>
            </div>
          </div>

          {/* Bar Navigation Menu */}
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
                      ? 'bg-violet-600 text-white font-bold shadow-md shadow-violet-900/20'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Bar Info */}
        <div className="pt-3 border-t border-[#1b202c] flex items-center justify-between text-xs text-slate-400">
          <span className="text-[10px] font-mono">DineFlow Bar OS v3.0</span>
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

      {/* Main Bar Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Sub-View: Overview */}
        {activeTab === 'overview' && (
          <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Bar Operations Dashboard</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Real-time mixology metrics, drink volume, open tabs, and draught stock alerts.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('terminal')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                <Tv className="w-4 h-4" />
                <span>Open Drink Service Terminal</span>
              </button>
            </div>

            {/* Quick KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-[#0c0f17] border border-[#1b202c]">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Today's Bar Revenue</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">₹1,48,250</div>
                <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> +18.4% vs last week
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#0c0f17] border border-[#1b202c]">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Drinks Poured Today</span>
                  <Wine className="w-4 h-4 text-violet-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">384 Pours</div>
                <div className="text-[11px] text-slate-400 mt-1">Avg 2.4m prep time</div>
              </div>

              <div className="p-5 rounded-2xl bg-[#0c0f17] border border-[#1b202c]">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Active Bar Tabs</span>
                  <ShoppingBag className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">14 Open</div>
                <div className="text-[11px] text-amber-400 mt-1">₹34,600 pending settlement</div>
              </div>

              <div className="p-5 rounded-2xl bg-[#0c0f17] border border-[#1b202c]">
                <div className="flex items-center justify-between text-slate-400 text-xs">
                  <span>Low Stock Warnings</span>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl font-bold text-rose-400 mt-2">1 Keg Low</div>
                <div className="text-[11px] text-slate-400 mt-1">Belgian Witbier draught</div>
              </div>
            </div>

            {/* Top-Selling Cocktails & Drink Velocity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl bg-[#0c0f17] border border-[#1b202c] space-y-4">
                <h3 className="text-sm font-bold text-white">Top Mixology & Drinks</h3>
                <div className="space-y-3">
                  {drinkItems.slice(0, 4).map((it, idx) => (
                    <div key={it.id} className="flex items-center justify-between p-3 rounded-xl bg-[#121622] border border-[#1c2233]">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-violet-500/10 text-violet-400 text-xs font-mono font-bold flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-white">{it.name}</div>
                          <div className="text-[10px] text-slate-400">{it.category} • ABV {it.alcoholByVolume}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-white">₹{it.price}</div>
                        <div className="text-[10px] text-emerald-400">{it.inStockCount} served</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-[#0c0f17] border border-[#1b202c] space-y-4">
                <h3 className="text-sm font-bold text-white">Live Bottle & Keg Alert Status</h3>
                <div className="space-y-3">
                  {liquorStock.map((liq) => (
                    <div key={liq.id} className="flex items-center justify-between p-3 rounded-xl bg-[#121622] border border-[#1c2233]">
                      <div>
                        <div className="text-xs font-bold text-white">{liq.item}</div>
                        <div className="text-[10px] text-slate-400">{liq.category}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-slate-200">{liq.bottles} left</span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
                          liq.status === 'OPTIMAL'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : liq.status === 'LOW_STOCK'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {liq.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sub-View: Bar Terminal (Mounts the live operational BarTerminal component) */}
        {activeTab === 'terminal' && (
          <div className="flex-1 flex flex-col h-full bg-[#07090e]">
            <BarTerminal restaurant={currentBar} />
          </div>
        )}

        {/* Sub-View: Drinks & Spirits Menu */}
        {activeTab === 'menu' && (
          <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Bar Beverage & Cocktail Menu</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Manage signature cocktails, spirit pours, tap beers, and instant 86-item availability.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#1b202c] bg-[#0c0f17] overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#121622] text-slate-400 uppercase text-[10px] font-mono border-b border-[#1b202c]">
                  <tr>
                    <th className="py-3 px-4">Item Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">ABV</th>
                    <th className="py-3 px-4">Price</th>
                    <th className="py-3 px-4">Availability</th>
                    <th className="py-3 px-4 text-right">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1b202c]">
                  {drinkItems.map((item) => (
                    <tr key={item.id} className="hover:bg-[#121622]/50 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">{item.name}</td>
                      <td className="py-3.5 px-4 text-slate-400">{item.category}</td>
                      <td className="py-3.5 px-4 font-mono text-violet-400">{item.alcoholByVolume}</td>
                      <td className="py-3.5 px-4 font-mono font-bold text-white">₹{item.price}</td>
                      <td className="py-3.5 px-4">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-bold ${
                          item.isAvailable
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}>
                          {item.isAvailable ? 'Available' : '86 / Sold Out'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => toggleItemAvailability(item.id)}
                          className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                            item.isAvailable
                              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {item.isAvailable ? 'Mark 86' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Other Tabs: Fallback Render */}
        {['orders', 'inventory', 'staff', 'billing', 'settings'].includes(activeTab) && (
          <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
            <h1 className="text-xl font-bold text-white capitalize">Bar {activeTab} Management</h1>
            <div className="p-12 border border-[#1b202c] rounded-2xl bg-[#0c0f17] text-center space-y-3">
              <Wine className="w-8 h-8 text-violet-400 mx-auto" />
              <div className="text-sm font-bold text-white">Bar-Specific {activeTab} Workspace Active</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Isolated data scope for {currentBar?.name || 'Bar Workspace'}. No restaurant dining tickets or event data leaks into this view.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
