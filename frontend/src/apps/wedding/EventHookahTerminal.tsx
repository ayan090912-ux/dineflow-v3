import React, { useState, useMemo } from 'react';
import {
  Flame,
  Clock,
  CheckCircle,
  Search,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
  ShieldAlert,
  AlertCircle,
  Bell,
} from 'lucide-react';
import { Card, Badge, Button, Input } from '../../packages/ui';
import { Order, MenuItem, WeddingEvent, getFulfillmentStation } from '../../packages/types';
import { cleanTableBadge } from '../restaurant/WeddingsTab';

export interface EventHookahTerminalProps {
  restaurantId: string;
  eventId: string;
  event?: WeddingEvent | null;
  orders: Order[];
  menuItems?: MenuItem[];
  currentStaffName?: string;
  onUpdateStatus?: (orderId: string, status: 'ACCEPTED' | 'PREPARING' | 'READY') => Promise<void>;
  onRefresh?: () => Promise<void>;
  onToast?: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

export const EventHookahTerminal: React.FC<EventHookahTerminalProps> = ({
  restaurantId,
  eventId,
  event,
  orders,
  menuItems = [],
  currentStaffName = 'Hookah Master',
  onUpdateStatus,
  onRefresh,
  onToast,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'PENDING' | 'PREPARING' | 'READY' | 'ALL'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check if restaurant / event has any eligible hookah items configured
  const hookahCatalogItems = useMemo(() => {
    return menuItems.filter((i) => getFulfillmentStation(i) === 'HOOKAH');
  }, [menuItems]);

  // Extract orders that have Hookah items
  const hookahOrders = useMemo(() => {
    return orders.filter((o) => {
      const hasHookahItem = (o.items || []).some((i) => getFulfillmentStation(i) === 'HOOKAH');
      const hasHookahStatus = Boolean(o.hookahStatus && o.hookahStatus !== 'NOT_REQUIRED');
      return hasHookahItem || hasHookahStatus;
    });
  }, [orders]);

  // Summary Metrics
  const summary = useMemo(() => {
    let pendingCount = 0;
    let preparingCount = 0;
    let readyCount = 0;
    let completedCount = 0;

    hookahOrders.forEach((o) => {
      const hStatus = o.hookahStatus || 'PENDING';
      if (hStatus === 'PENDING' || hStatus === 'ACCEPTED') pendingCount++;
      else if (hStatus === 'PREPARING') preparingCount++;
      else if (hStatus === 'READY') readyCount++;
      else if (hStatus === 'COMPLETED' || o.status === 'DELIVERED') completedCount++;
    });

    return {
      total: hookahOrders.length,
      pending: pendingCount,
      preparing: preparingCount,
      ready: readyCount,
      completed: completedCount,
    };
  }, [hookahOrders]);

  const activeOrders = useMemo(() => {
    return hookahOrders.filter((o) => {
      const hStatus = o.hookahStatus || 'PENDING';
      const isFinished = hStatus === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'CANCELLED' || o.deliveryStatus === 'DELIVERED';
      if (isFinished) return false;
      return hStatus !== 'READY';
    });
  }, [hookahOrders]);

  const sentToWaiterOrders = useMemo(() => {
    return hookahOrders.filter((o) => {
      const hStatus = o.hookahStatus || 'PENDING';
      const isFinished = hStatus === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'CANCELLED' || o.deliveryStatus === 'DELIVERED';
      if (isFinished) return false;
      return hStatus === 'READY';
    });
  }, [hookahOrders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return hookahOrders.filter((order) => {
      const hStatus = order.hookahStatus || 'PENDING';

      // Status filter
      if (statusFilter === 'ACTIVE') {
        if (hStatus === 'COMPLETED' || order.status === 'DELIVERED' || order.status === 'CANCELLED') {
          return false;
        }
      } else if (statusFilter === 'PENDING') {
        if (hStatus !== 'PENDING' && hStatus !== 'ACCEPTED') return false;
      } else if (statusFilter === 'PREPARING') {
        if (hStatus !== 'PREPARING') return false;
      } else if (statusFilter === 'READY') {
        if (hStatus !== 'READY') return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTable = (order.tableNumber || '').toLowerCase().includes(q);
        const matchesGuest = (order.customerName || order.notes || '').toLowerCase().includes(q);
        const matchesFlavor = (order.items || []).some(
          (i) => getFulfillmentStation(i) === 'HOOKAH' && (i.name || '').toLowerCase().includes(q)
        );
        if (!matchesTable && !matchesGuest && !matchesFlavor) return false;
      }

      return true;
    });
  }, [hookahOrders, statusFilter, searchQuery]);

  const handleAdvance = async (orderId: string, nextStatus: 'ACCEPTED' | 'PREPARING' | 'READY') => {
    if (!onUpdateStatus) return;
    setUpdatingOrderId(orderId);
    try {
      await onUpdateStatus(orderId, nextStatus);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleManualRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatElapsed = (dateStr?: string) => {
    if (!dateStr) return 'Just now';
    try {
      const created = new Date(dateStr).getTime();
      const diffSec = Math.max(0, Math.floor((Date.now() - created) / 1000));
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m ago`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-amber-950/40 via-[#1e1511] to-[#120f0d] p-5 rounded-2xl border border-amber-500/30">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                Event Hookah & Shisha Lounge Terminal
                <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] tracking-wider uppercase font-mono">
                  Lounge Queue Live
                </Badge>
              </h1>
              <p className="text-xs text-amber-200/70">
                Live charcoal heating and tobacco preparation queue for banquet tables. Multi-station synchronized.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="text-xs border-[#3a281d] text-slate-300 hover:text-white"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400 mr-1.5" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500 mr-1.5" />}
            {soundEnabled ? 'Chime On' : 'Muted'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="text-xs border-amber-500/30 text-amber-200 hover:bg-amber-900/30"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Setup Warning if Hookah enabled on event but 0 catalog items */}
      {hookahCatalogItems.length === 0 && (
        <div className="bg-amber-950/30 border border-amber-500/50 rounded-2xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold text-amber-200">Catalog Notice: No Shisha Flavors Available</h4>
            <p className="text-amber-300/80 leading-relaxed">
              Hookah & Shisha service is enabled for this event, but there are currently no hookah flavor items in your catalog.
              Add shisha flavors in the Event Menu tab so guests can order hookah service from their banquet table standee.
            </p>
          </div>
        </div>
      )}





      {/* SECTION 1: ACTIVE ORDERS (Top, Full Width, Single Column) */}
      <section className="space-y-2.5 w-full" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.08] w-full">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold font-mono tracking-wider text-white uppercase flex items-center gap-2">
              <span>ACTIVE ORDERS</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {activeOrders.length}
              </span>
            </h2>
          </div>
        </div>

        {activeOrders.length === 0 ? (
          <div className="py-2.5 px-3 rounded-lg bg-[#0e121a]/60 border border-white/[0.06] text-xs text-slate-400 font-mono">
            No active hookah orders. New orders appear here automatically.
          </div>
        ) : (
          <div className="w-full flex flex-col space-y-2" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {activeOrders.map((order) => {
              const hStatus = order.hookahStatus || 'PENDING';
              const isPreparing = hStatus === 'PREPARING';
              const isNew = !isPreparing;
              const hookahItems = (order.items || []).filter((i) => getFulfillmentStation(i) === 'HOOKAH');
              const displayItems = hookahItems.length > 0 ? hookahItems : (order.items || []);
              const isUpdating = updatingOrderId === order.id;

              return (
                <div
                  key={order.id}
                  className={`w-full rounded-xl border p-3 sm:p-3.5 transition-all shadow-sm ${
                    isNew
                      ? 'bg-[#18120e] border-amber-500/40 hover:border-amber-400'
                      : 'bg-[#1c140f] border-amber-500/50 hover:border-amber-400/60'
                  }`}
                  style={{ width: '100%' }}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
                    {/* Left */}
                    <div className="flex items-center flex-wrap gap-2 sm:gap-2.5 shrink-0">
                      <span className="px-2.5 py-1 rounded-md text-sm font-black font-mono bg-white/10 text-white border border-white/20">
                        Table {cleanTableBadge(order.tableNumber)}
                      </span>
                      <span className="text-xs font-bold font-mono text-slate-300">
                        #{order.id.slice(-4)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {formatElapsed(order.createdAt)}
                      </span>
                      {isNew ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          NEW
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-500/20 text-amber-200 border border-amber-500/40 flex items-center gap-1">
                          <Flame className="w-3 h-3 text-amber-400" />
                          HEATING COALS
                        </span>
                      )}
                      {order.customerName && (
                        <span className="text-[11px] text-slate-400 font-medium truncate max-w-[120px]">
                          ({order.customerName})
                        </span>
                      )}
                    </div>

                    {/* Center */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white">
                        {displayItems.map((item, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1">
                            <strong className="text-amber-400 font-mono">{item.quantity}×</strong>
                            <span className="font-medium">{item.name}</span>
                            {item.notes && <span className="text-xs text-amber-300 italic">"{item.notes}"</span>}
                          </span>
                        ))}
                      </div>
                      {order.notes && (
                        <div className="inline-flex items-center gap-1 text-[11px] bg-rose-500/15 text-rose-200 px-2 py-0.5 rounded border border-rose-500/30 max-w-full">
                          <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
                          <span className="truncate"><strong>Note:</strong> {order.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Right */}
                    <div className="shrink-0 flex items-center gap-2">
                      {isNew ? (
                        <button
                          type="button"
                          onClick={() => handleAdvance(order.id, 'PREPARING')}
                          disabled={isUpdating}
                          className="px-4 py-2 rounded-lg font-bold font-mono text-xs tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 whitespace-nowrap"
                        >
                          {isUpdating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>START PREPARING</span>}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAdvance(order.id, 'READY')}
                          disabled={isUpdating}
                          className="px-4 py-2 rounded-lg font-bold font-mono text-xs tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 whitespace-nowrap"
                        >
                          {isUpdating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <span>READY — SEND TO WAITER</span>}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: SENT TO WAITER (Below Active Orders, Full Width, Read-Only) */}
      <section className="space-y-2.5 w-full pt-2" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.08] w-full">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold font-mono tracking-wider text-white uppercase flex items-center gap-2">
              <span>SENT TO WAITER</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {sentToWaiterOrders.length}
              </span>
            </h2>
          </div>
        </div>

        {sentToWaiterOrders.length === 0 ? (
          <div className="py-2.5 px-3 rounded-lg bg-[#0e121a]/60 border border-white/[0.06] text-xs text-slate-400 font-mono">
            No orders awaiting delivery.
          </div>
        ) : (
          <div className="w-full flex flex-col space-y-2" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            {sentToWaiterOrders.map((order) => {
              const hookahItems = (order.items || []).filter((i) => getFulfillmentStation(i) === 'HOOKAH');
              const displayItems = hookahItems.length > 0 ? hookahItems : (order.items || []);

              return (
                <div
                  key={order.id}
                  className="w-full rounded-xl border border-blue-500/30 bg-[#0f171d] p-3 sm:p-3.5 shadow-sm"
                  style={{ width: '100%' }}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
                    <div className="flex items-center flex-wrap gap-2 sm:gap-2.5 shrink-0">
                      <span className="px-2.5 py-1 rounded-md text-sm font-black font-mono bg-white/10 text-white border border-white/20">
                        Table {cleanTableBadge(order.tableNumber)}
                      </span>
                      <span className="text-xs font-bold font-mono text-slate-300">
                        #{order.id.slice(-4)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {formatElapsed(order.createdAt)}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white">
                        {displayItems.map((item, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1">
                            <strong className="text-blue-300 font-mono">{item.quantity}×</strong>
                            <span className="font-medium">{item.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center">
                      <div className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-blue-500/15 text-blue-200 border border-blue-500/30 flex items-center gap-1.5 animate-pulse">
                        <Bell className="w-3.5 h-3.5 text-blue-300" />
                        <span>WAITING FOR WAITER</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
