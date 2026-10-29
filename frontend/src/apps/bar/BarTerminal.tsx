import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wine,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Check,
  User,
  LogOut,
  RefreshCw,
  Volume2,
  VolumeX,
  Activity,
  Bell,
  Package,
  Layers,
  History,
  Sparkles,
  Search,
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { Order, OrderStatus, getFulfillmentStation } from '../../packages/types';
import { realtimeBus } from '../../packages/api/realtime';
import { getCurrencySymbol } from '../../packages/utils/currency';
import { formatStandardTableNumber } from '../../packages/utils/tableUtils';

interface BarTerminalProps {
  restaurant?: any;
  onLogout?: () => void;
}

// Live elapsed time calculator
const formatElapsed = (timestamp?: string) => {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  if (m === 0) return `${s}s ago`;
  if (m < 60) return `${m}m ${s}s ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

export const BarTerminal: React.FC<BarTerminalProps> = ({ restaurant, onLogout }) => {
  const currencySymbol = useMemo(() => getCurrencySymbol(restaurant?.currency || 'INR (₹)'), [restaurant?.currency]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [recentDispatches, setRecentDispatches] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = React.useRef(true);
  const notifiedOrderIdsRef = React.useRef<Set<string>>(new Set());
  const hasInitializedRef = React.useRef(false);
  const [lastNotification, setLastNotification] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [viewTab, setViewTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'NEW' | 'PREPARING' | 'WAITING' | 'COLLECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState<number>(0);

  // Keep soundEnabledRef in sync
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Live timer tick every second
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const currentRestId = api.getCurrentRestaurantId() || restaurant?.id || '';
    if (currentRestId) {
      realtimeBus.connect(currentRestId, 'BAR');
    }

    loadBarOrders(true);
    setTimeout(() => { hasInitializedRef.current = true; }, 2000);
    const pollInterval = setInterval(() => loadBarOrders(false), 20000);

    const handledEventIds = new Set<string>();

    const unsubscribe = realtimeBus.subscribe((event: any) => {
      const evtRestId = event.restaurantId || event.restaurant_id;
      if (evtRestId && currentRestId && String(evtRestId).toLowerCase() !== String(currentRestId).toLowerCase()) {
        return;
      }

      // Ignore updates specifically for other stations
      if (event.type === 'FulfillmentTicketUpdated' && event.station && event.station !== 'BAR') {
        return;
      }

      // Business Day resets
      if (event.type === 'DayClosed' || event.type === 'BusinessDayClosed') {
        setOrders([]);
        setRecentDispatches([]);
        notifiedOrderIdsRef.current.clear();
        setLastNotification('Business Day Closed 🌅 Bar queue reset for new day.');
        return;
      }

      if (event.type === 'DayOpened' || event.type === 'BusinessDayOpened') {
        setOrders([]);
        setRecentDispatches([]);
        loadBarOrders(false);
        setLastNotification('New Business Day Opened ☀️ Ready for beverage orders.');
        return;
      }

      if (
        event.type === 'order_created' ||
        event.type === 'OrderCreated' ||
        event.type === 'order_status_updated' ||
        event.type === 'OrderStatusUpdated' ||
        event.type === 'OrderAccepted' ||
        event.type === 'order_ready' ||
        event.type === 'OrderReady' ||
        event.type === 'BarStatusUpdated' ||
        event.type === 'order_collected' ||
        event.type === 'OrderCollected' ||
        event.type === 'order_delivered' ||
        event.type === 'OrderDelivered' ||
        event.type === 'table_session_closed' ||
        event.type === 'TableSessionClosed' ||
        (event.type === 'FulfillmentTicketUpdated' && event.station === 'BAR')
      ) {
        loadBarOrders(false);

        const evtId = event.eventId || event.event_id;
        if (evtId && handledEventIds.has(evtId)) return;
        if (evtId) {
          handledEventIds.add(evtId);
          if (handledEventIds.size > 500) {
            const first = Array.from(handledEventIds)[0];
            handledEventIds.delete(first);
          }
        }

        const isNewBarOrder =
          event.type === 'order_created' ||
          event.type === 'OrderCreated' ||
          (event.type === 'FulfillmentTicketUpdated' && event.status === 'PENDING' && event.station === 'BAR');

        if (isNewBarOrder && hasInitializedRef.current) {
          const orderId = event.orderId || event.parentOrderId || event.id || evtId;
          const isBarFulfillment = event.type === 'FulfillmentTicketUpdated' && event.station === 'BAR';
          const items: any[] = (event as any).items || (event as any).payload?.items || [];
          const hasBarItems = isBarFulfillment || items.some((i: any) => getFulfillmentStation(i) === 'BAR');

          if (hasBarItems && orderId && !notifiedOrderIdsRef.current.has(orderId)) {
            notifiedOrderIdsRef.current.add(orderId);
            setLastNotification(
              `New Drink Order #${String(orderId).slice(-4)} for ${formatStandardTableNumber(event.tableNumber, 'Bar')}`
            );
            if (soundEnabledRef.current) {
              playNotificationSound();
            }
          }
        }
      } else if (event.type === 'RECONNECTED') {
        loadBarOrders(false);
      }
    });

    const unsubStatus = realtimeBus.subscribeStatus((status) => {
      if (status === 'CONNECTED') {
        loadBarOrders(false);
      }
    });

    return () => {
      clearInterval(pollInterval);
      unsubscribe();
      unsubStatus();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
  };

  const loadBarOrders = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setActionError('');
    try {
      const restId = api.getCurrentRestaurantId() || restaurant?.id || undefined;
      const isNotWedding = (restaurant as any)?.businessType !== 'WEDDING_ORDERING';
      const allOrders = await api.getOrders(restId, { station: 'BAR', activeOnly: true, excludeEvents: isNotWedding });

      const barOrders = allOrders
        .filter((o) => {
          if ((restaurant as any)?.businessType !== 'WEDDING_ORDERING' && (o.orderType === 'WEDDING_EVENT' || o.eventId)) {
            return false;
          }
          const hasBarItems = o.items && o.items.some((i) => getFulfillmentStation(i) === 'BAR');
          const hasBarStatus = Boolean(o.barStatus && (o.barStatus as string) !== 'NOT_REQUIRED');
          return hasBarItems || hasBarStatus;
        })
        .map((o) => {
          const drinkItemsOnly = (o.items || []).filter((i) => getFulfillmentStation(i) === 'BAR');
          const isFinished = o.status === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'CANCELLED';
          const effBarStatus = isFinished ? 'COMPLETED' : (o.barStatus || 'PENDING');
          return {
            ...o,
            items: drinkItemsOnly.length > 0 ? drinkItemsOnly : o.items,
            barStatus: effBarStatus,
          };
        });

      setOrders(barOrders as any);
    } catch (err: any) {
      console.error('Failed to load bar orders:', err);
      setActionError(err?.message || 'Unable to sync with live bar queue.');
    } finally {
      setIsLoading(false);
    }
  };

  // ACTION 1: START PREPARING (1-Click)
  const handleStartPreparing = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    setActionError('');
    try {
      await api.updateFulfillmentTicketStatus(orderId, 'PREPARING', 'BAR');
      await api.updateBarStatus(orderId, 'PREPARING');
      await loadBarOrders(false);
    } catch (err: any) {
      console.error('Failed to start preparing beverage order:', err);
      setActionError(err?.message || 'Failed to start preparation. Please retry.');
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // ACTION 2: READY — NOTIFY WAITER (1-Click: Marks Ready + Dispatches Waiter)
  const handleMarkReadyAndNotifyWaiter = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    setActionError('');
    try {
      await api.updateFulfillmentTicketStatus(orderId, 'READY', 'BAR');
      await api.updateBarStatus(orderId, 'READY');
      await api.requestWaiter(orderId, 'BAR');
      await loadBarOrders(false);
    } catch (err: any) {
      console.error('Failed to mark ready & notify waiter:', err);
      setActionError(err?.message || 'Failed to notify waiter. Please try again.');
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Optional direct handover fallback (if guest takes drink at the bar pass)
  const handleDirectComplete = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    setActionError('');
    try {
      await api.updateFulfillmentTicketStatus(orderId, 'COMPLETED', 'BAR');
      await api.updateBarStatus(orderId, 'COMPLETED');
      const completedOrd = orders.find((o) => o.id === orderId);
      if (completedOrd) {
        setRecentDispatches((prev) => [
          { ...completedOrd, barStatus: 'COMPLETED', status: 'COMPLETED' },
          ...prev.filter((x) => x.id !== orderId),
        ].slice(0, 15));
      }
      await loadBarOrders(false);
    } catch (err: any) {
      console.error('Failed to complete bar order:', err);
      setActionError(err?.message || 'Failed to complete order. Please retry.');
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleQuickEta = async (orderId: string, currentOrder: Order, deltaMins: number) => {
    const currentMins = currentOrder.estimatedPrepTimeMinutes || 10;
    const newMins = Math.max(3, currentMins + deltaMins);
    const newTarget = new Date(Date.now() + newMins * 60000).toISOString();
    try {
      await api.updateBarStatus(orderId, 'PREPARING', undefined, {
        estimatedPrepTimeMinutes: newMins,
        etaTargetTimestamp: newTarget,
      });
      await loadBarOrders(false);
    } catch (e) {}
  };

  // AUTHORITATIVE ACTIVE ORDERS: Non-delivered, non-completed, non-cancelled
  const activeOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status !== 'COMPLETED' &&
        o.status !== 'DELIVERED' &&
        o.status !== 'CANCELLED' &&
        o.barStatus !== 'COMPLETED'
    );
  }, [orders]);

  // COMPLETED ORDERS: Completed / Delivered orders
  const completedOrders = useMemo(() => {
    const fromApi = orders.filter((o) => o.barStatus === 'COMPLETED' || o.status === 'COMPLETED' || o.status === 'DELIVERED');
    const combined = [...recentDispatches];
    fromApi.forEach((ord) => {
      if (!combined.some((c) => c.id === ord.id)) combined.push(ord);
    });
    return combined.slice(0, 30);
  }, [orders, recentDispatches]);

  // Order stage breakdown
  const pendingOrders = activeOrders.filter((o) => (o.barStatus === 'PENDING' || !o.barStatus) && o.barStatus !== 'PREPARING' && o.barStatus !== 'ACCEPTED' && o.barStatus !== 'READY');
  const preparingOrders = activeOrders.filter((o) => o.barStatus === 'PREPARING' || o.barStatus === 'ACCEPTED');
  const waitingOrders = activeOrders.filter((o) => o.barStatus === 'READY' && o.deliveryStatus !== 'COLLECTED');
  const collectedOrders = activeOrders.filter((o) => o.barStatus === 'READY' && o.deliveryStatus === 'COLLECTED');

  // Filtered active list for display
  const displayedActiveOrders = useMemo(() => {
    return activeOrders.filter((o) => {
      if (activeFilter === 'NEW') return (o.barStatus === 'PENDING' || !o.barStatus) && o.barStatus !== 'PREPARING' && o.barStatus !== 'READY';
      if (activeFilter === 'PREPARING') return o.barStatus === 'PREPARING' || o.barStatus === 'ACCEPTED';
      if (activeFilter === 'WAITING') return o.barStatus === 'READY' && o.deliveryStatus !== 'COLLECTED';
      if (activeFilter === 'COLLECTED') return o.barStatus === 'READY' && o.deliveryStatus === 'COLLECTED';
      return true;
    }).filter((o) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchesTable = (o.tableNumber || '').toLowerCase().includes(q);
      const matchesGuest = (o.customerName || '').toLowerCase().includes(q);
      const matchesDrink = (o.items || []).some((it) => (it.name || '').toLowerCase().includes(q));
      return matchesTable || matchesGuest || matchesDrink;
    });
  }, [activeOrders, activeFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Alert Banner */}
      {actionError && (
        <div className="bg-rose-950/80 border-b border-rose-800/50 text-rose-200 px-6 py-2.5 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError('')} className="underline text-[11px] text-rose-300 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {lastNotification && (
        <div className="bg-emerald-950/80 border-b border-emerald-800/40 text-emerald-200 px-6 py-2 text-xs font-mono flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{lastNotification}</span>
          </div>
          <button onClick={() => setLastNotification('')} className="text-emerald-400 hover:text-emerald-200 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* TOP HEADER */}
      <header className="bg-[#0b0e14] border-b border-[#1c2230] px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md">
            <Wine className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Bar Terminal</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  LIVE
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              {restaurant?.name || 'Beverage & Mixology Pass'} · 1-Click Service Workflow
            </p>
          </div>
        </div>

        {/* View Switcher Tabs: Active Queue vs Completed History */}
        <div className="flex items-center gap-2 bg-[#121620] p-1 rounded-xl border border-[#1e2536]">
          <button
            onClick={() => setViewTab('ACTIVE')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              viewTab === 'ACTIVE'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Active Orders</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              viewTab === 'ACTIVE' ? 'bg-slate-950 text-emerald-300' : 'bg-[#1a2130] text-slate-300'
            }`}>
              {activeOrders.length}
            </span>
          </button>

          <button
            onClick={() => setViewTab('COMPLETED')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              viewTab === 'COMPLETED'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Completed History</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              viewTab === 'COMPLETED' ? 'bg-slate-950 text-emerald-300' : 'bg-[#1a2130] text-slate-300'
            }`}>
              {completedOrders.length}
            </span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className={`p-2.5 rounded-xl border transition-colors ${
              soundEnabled
                ? 'border-[#1e2536] bg-[#121620] text-emerald-400'
                : 'border-[#1e2536] bg-[#121620] text-slate-500 hover:text-slate-300'
            }`}
            title={soundEnabled ? 'Mute alert chime' : 'Enable alert chime'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => loadBarOrders()}
            className="p-2.5 rounded-xl border border-[#1e2536] bg-[#121620] text-slate-300 hover:text-white transition-colors"
            title="Refresh order queue"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            onClick={async () => {
              await api.logout();
              if (onLogout) onLogout();
              else window.location.href = '/staff/login';
            }}
            className="px-3 py-2 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:text-rose-100 text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* METRICS STRIP */}
      <div className="bg-[#0b0e14]/60 border-b border-[#1c2230] px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="uppercase text-[11px] tracking-wider text-slate-400 font-bold">Live Shift Pulse</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1 rounded-lg bg-[#121620] border border-[#1e2536] text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>New: <strong className="text-amber-300 font-bold">{pendingOrders.length}</strong></span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-[#121620] border border-[#1e2536] text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            <span>Mixology: <strong className="text-sky-300 font-bold">{preparingOrders.length}</strong></span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-[#121620] border border-[#1e2536] text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Awaiting Pickup: <strong className="text-emerald-300 font-bold">{waitingOrders.length}</strong></span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-[#121620] border border-[#1e2536] text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span>In Delivery: <strong className="text-indigo-300 font-bold">{collectedOrders.length}</strong></span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-[#121620] border border-[#1e2536] text-slate-400">
            Dispatched Today: <strong className="text-white font-bold">{completedOrders.length}</strong>
          </span>
        </div>
      </div>

      {/* MAIN VIEW CONTENT */}
      <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
        {viewTab === 'ACTIVE' ? (
          <div className="space-y-5 max-w-7xl mx-auto">
            {/* Filter Pills & Search */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'ALL', label: 'All Active', count: activeOrders.length },
                  { id: 'NEW', label: 'New Tickets', count: pendingOrders.length },
                  { id: 'PREPARING', label: 'Mixology', count: preparingOrders.length },
                  { id: 'WAITING', label: 'Awaiting Waiter', count: waitingOrders.length },
                  { id: 'COLLECTED', label: 'In Delivery', count: collectedOrders.length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFilter(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                      activeFilter === tab.id
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-[#121620] text-slate-400 hover:text-white border border-[#1e2536]'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                      activeFilter === tab.id ? 'bg-slate-950/30 text-slate-950' : 'bg-white/10 text-slate-300'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search table, drink, guest..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#121620] border border-[#1e2536] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>
            </div>

            {/* EMPTY STATE */}
            {displayedActiveOrders.length === 0 && (
              <div className="p-16 text-center bg-[#0d1017] rounded-2xl border border-dashed border-[#1e2536] space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <Wine className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white">Bar Pass is Clear</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchQuery ? 'No active orders match your search query.' : 'New cocktail and beverage orders will appear here automatically with live sound alerts.'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-3 py-1.5 rounded-lg bg-[#181f2c] text-xs text-slate-300 hover:text-white border border-[#263145]"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            )}

            {/* RESPONSIVE ORDER GRID: 1 col on mobile, 2 cols on tablet, 3 cols on large desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <AnimatePresence mode="popLayout">
                {displayedActiveOrders.map((ord) => {
                  const drinkItems = (ord.items || []).filter((i) => getFulfillmentStation(i) === 'BAR');
                  const elapsed = formatElapsed(ord.createdAt);
                  const isProcessing = processingOrderIds.has(ord.id);

                  // Detailed stage determination
                  const isNew = (!ord.barStatus || ord.barStatus === 'PENDING') && ord.barStatus !== 'PREPARING' && ord.barStatus !== 'READY';
                  const isPreparing = ord.barStatus === 'PREPARING' || ord.barStatus === 'ACCEPTED';
                  const isWaiting = ord.barStatus === 'READY' && ord.deliveryStatus !== 'COLLECTED';
                  const isCollected = ord.barStatus === 'READY' && ord.deliveryStatus === 'COLLECTED';

                  return (
                    <motion.div
                      key={ord.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.92 }}
                      transition={{ duration: 0.2 }}
                      className={`rounded-2xl border flex flex-col justify-between overflow-hidden shadow-lg transition-all ${
                        isNew
                          ? 'bg-[#0f131c] border-amber-500/40 hover:border-amber-400'
                          : isPreparing
                          ? 'bg-[#0f141f] border-sky-500/40 hover:border-sky-400'
                          : isWaiting
                          ? 'bg-[#0e1619] border-emerald-500/50 hover:border-emerald-400 shadow-emerald-950/20'
                          : 'bg-[#10141f] border-indigo-500/40 hover:border-indigo-400'
                      }`}
                    >
                      {/* CARD HEADER */}
                      <div className="p-4 border-b border-white/[0.06] space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-bold px-3 py-1 bg-white/10 rounded-lg border border-white/20 text-white shadow-sm">
                              {formatStandardTableNumber(ord.tableNumber, 'Bar')}
                            </span>
                            <span className="text-xs font-mono font-semibold text-slate-400">
                              #{ord.id.slice(-4)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>{elapsed}</span>
                          </div>
                        </div>

                        {Boolean((ord as any).eventName || (ord as any).metadata?.eventName) && (
                          <div className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold uppercase tracking-wider">
                            BANQUET · {(ord as any).eventName || (ord as any).metadata?.eventName}
                          </div>
                        )}

                        {ord.customerName && (
                          <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                            <User className="w-3 h-3 text-slate-500" />
                            <span>Guest: {ord.customerName}</span>
                          </div>
                        )}

                        {/* HIGH-IMPACT STATUS BADGE BANNER */}
                        <div className="pt-1">
                          {isNew && (
                            <div className="w-full py-1.5 px-3 rounded-lg text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                <span>NEW ORDER — AWAITING PREPARATION</span>
                              </span>
                              <span className="text-[10px] text-amber-400 uppercase">Stage 1</span>
                            </div>
                          )}

                          {isPreparing && (
                            <div className="w-full py-1.5 px-3 rounded-lg text-xs font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Wine className="w-3.5 h-3.5 text-sky-400 animate-bounce" />
                                <span>MIXOLOGY & POURING IN PROGRESS</span>
                              </span>
                              <span className="text-[10px] text-sky-400 uppercase">Stage 2</span>
                            </div>
                          )}

                          {isWaiting && (
                            <div className="w-full py-2 px-3 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-500/50 flex items-center justify-between animate-pulse">
                              <span className="flex items-center gap-2">
                                <Bell className="w-4 h-4 text-emerald-400" />
                                <span>WAITING FOR WAITER</span>
                              </span>
                              <span className="text-[10px] bg-emerald-500/30 px-2 py-0.5 rounded text-emerald-200 uppercase font-mono">
                                AT BAR PASS
                              </span>
                            </div>
                          )}

                          {isCollected && (
                            <div className="w-full py-2 px-3 rounded-lg text-xs font-mono font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-500/40 flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-indigo-400" />
                                <span>COLLECTED BY {ord.claimedBy || 'WAITER'}</span>
                              </span>
                              <span className="text-[10px] bg-indigo-500/30 px-2 py-0.5 rounded text-indigo-200 uppercase font-mono">
                                EN ROUTE
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* CARD BODY: ORDER ITEMS */}
                      <div className="p-4 space-y-3 flex-1">
                        <div className="bg-[#080a0f] p-3.5 rounded-xl border border-white/[0.08] space-y-2.5">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-white/[0.06] pb-1.5 flex justify-between items-center">
                            <span>Drink Items ({drinkItems.length})</span>
                            <span className="text-slate-500">{ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>

                          <div className="space-y-2">
                            {drinkItems.map((item, idx) => (
                              <div key={idx} className="flex items-start justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="flex items-baseline gap-2">
                                    <span className="font-mono font-bold text-emerald-400 text-sm">
                                      {item.quantity}x
                                    </span>
                                    <span className="font-semibold text-white text-sm">
                                      {item.name}
                                    </span>
                                  </div>
                                  {item.glassSize && (
                                    <span className="text-[10px] font-mono text-slate-400 block">
                                      Serving: {item.glassSize} {item.alcoholPercentage ? `• ${item.alcoholPercentage}% ABV` : ''}
                                    </span>
                                  )}
                                  {item.notes && (
                                    <span className="text-[11px] text-amber-300 italic block">
                                      "{item.notes}"
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-slate-400 text-xs shrink-0 font-medium">
                                  {currencySymbol}{(item.price * item.quantity).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Special Instructions */}
                        {ord.specialInstructions && (
                          <div className="text-xs bg-rose-500/15 text-rose-200 p-2.5 rounded-xl border border-rose-500/30 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <span><strong className="font-semibold">Special Instructions:</strong> {ord.specialInstructions}</span>
                          </div>
                        )}

                        {/* Quick ETA controls when in preparation */}
                        {isPreparing && (
                          <div className="flex items-center justify-between gap-1 text-[11px] font-mono text-slate-400 pt-1">
                            <span className="text-slate-500">Adjust Prep Time:</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleQuickEta(ord.id, ord, 5)}
                                className="px-2 py-0.5 rounded bg-[#18202e] border border-[#26334a] hover:border-sky-400 text-sky-300 text-[10px] font-mono transition-colors"
                              >
                                +5m
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickEta(ord.id, ord, 10)}
                                className="px-2 py-0.5 rounded bg-[#18202e] border border-[#26334a] hover:border-sky-400 text-sky-300 text-[10px] font-mono transition-colors"
                              >
                                +10m
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* CARD FOOTER: 1-CLICK ACTION CONTROLS */}
                      <div className="p-4 bg-[#080a0f]/80 border-t border-white/[0.06]">
                        {isNew && (
                          <button
                            type="button"
                            onClick={() => handleStartPreparing(ord.id)}
                            disabled={isProcessing}
                            className="w-full py-3.5 px-4 rounded-xl font-bold font-mono text-sm tracking-wide bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation active:scale-[0.98]"
                          >
                            {isProcessing ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Play className="w-4 h-4 fill-current" />
                                <span>START PREPARING</span>
                              </>
                            )}
                          </button>
                        )}

                        {isPreparing && (
                          <button
                            type="button"
                            onClick={() => handleMarkReadyAndNotifyWaiter(ord.id)}
                            disabled={isProcessing}
                            className="w-full py-3.5 px-4 rounded-xl font-bold font-mono text-sm tracking-wide bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation active:scale-[0.98]"
                          >
                            {isProcessing ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Bell className="w-4 h-4" />
                                <span>READY — NOTIFY WAITER</span>
                              </>
                            )}
                          </button>
                        )}

                        {(isWaiting || isCollected) && (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => handleDirectComplete(ord.id)}
                              disabled={isProcessing}
                              className="w-full py-2 px-3 rounded-lg text-xs font-mono text-slate-300 hover:text-white bg-[#141a26] hover:bg-[#1a2333] border border-[#253045] flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Direct Bar Handover (Guest Pickup)</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          /* COMPLETED ORDERS HISTORY TAB */
          <div className="space-y-5 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Recent Beverage Dispatches</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Orders marked served and delivered to tables. Maintained for shift reconciliation.
                </p>
              </div>

              <span className="text-xs font-mono font-bold px-3 py-1 bg-[#121620] border border-[#1e2536] rounded-lg text-slate-300">
                {completedOrders.length} Dispatched
              </span>
            </div>

            {completedOrders.length === 0 ? (
              <div className="p-16 text-center bg-[#0d1017] rounded-2xl border border-dashed border-[#1e2536] space-y-2">
                <History className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-sm font-semibold text-slate-300">No Dispatched Orders Yet</h3>
                <p className="text-xs text-slate-500">Orders will appear here once delivered by the floor waiter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedOrders.map((ord) => {
                  const drinkItems = (ord.items || []).filter((i) => getFulfillmentStation(i) === 'BAR');
                  return (
                    <div
                      key={ord.id}
                      className="p-4 rounded-xl bg-[#0c0f16] border border-[#1c2230] space-y-3 opacity-80 hover:opacity-100 transition-opacity"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded bg-[#161d2b] text-white border border-[#232f45] text-xs font-mono font-bold">
                          {formatStandardTableNumber(ord.tableNumber, 'Bar')}
                        </span>
                        <span className="text-xs font-mono text-emerald-400 font-bold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>DELIVERED</span>
                        </span>
                      </div>

                      <div className="space-y-1 py-1">
                        {drinkItems.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-slate-300">
                            <span>{it.quantity}x {it.name}</span>
                            <span className="font-mono text-slate-500">{currencySymbol}{(it.price * it.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="text-[10px] font-mono text-slate-500 pt-1 border-t border-white/[0.06] flex justify-between items-center">
                        <span>Ticket #{ord.id.slice(-4)}</span>
                        <span>{ord.deliveredAt ? new Date(ord.deliveredAt).toLocaleTimeString() : 'Delivered'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
