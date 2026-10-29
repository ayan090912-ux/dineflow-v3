import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Flame,
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

interface HookahTerminalProps {
  restaurant?: any;
  onLogout?: () => void;
}

const formatElapsed = (timestamp?: string) => {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  if (m === 0) return `${s}s ago`;
  if (m < 60) return `${m}m ${s}s ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

export const HookahTerminal: React.FC<HookahTerminalProps> = ({ restaurant, onLogout }) => {
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

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const currentRestId = api.getCurrentRestaurantId() || restaurant?.id || '';
    if (currentRestId) {
      realtimeBus.connect(currentRestId, 'HOOKAH');
    }

    loadHookahOrders(true);
    setTimeout(() => { hasInitializedRef.current = true; }, 2000);
    const pollInterval = setInterval(() => loadHookahOrders(false), 20000);

    const handledEventIds = new Set<string>();

    const unsubscribe = realtimeBus.subscribe((event: any) => {
      const evtRestId = event.restaurantId || event.restaurant_id;
      if (evtRestId && currentRestId && String(evtRestId).toLowerCase() !== String(currentRestId).toLowerCase()) {
        return;
      }

      if (event.type === 'FulfillmentTicketUpdated' && event.station && event.station !== 'HOOKAH') {
        return;
      }

      if (event.type === 'DayClosed' || event.type === 'BusinessDayClosed') {
        setOrders([]);
        setRecentDispatches([]);
        notifiedOrderIdsRef.current.clear();
        setLastNotification('Business Day Closed 🌅 Hookah queue reset.');
        return;
      }

      if (event.type === 'DayOpened' || event.type === 'BusinessDayOpened') {
        setOrders([]);
        setRecentDispatches([]);
        loadHookahOrders(false);
        setLastNotification('New Business Day Opened ☀️ Ready for hookah orders.');
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
        event.type === 'HookahStatusUpdated' ||
        event.type === 'order_collected' ||
        event.type === 'OrderCollected' ||
        event.type === 'order_delivered' ||
        event.type === 'OrderDelivered' ||
        event.type === 'table_session_closed' ||
        event.type === 'TableSessionClosed' ||
        (event.type === 'FulfillmentTicketUpdated' && event.station === 'HOOKAH')
      ) {
        loadHookahOrders(false);

        const evtId = event.eventId || event.event_id;
        if (evtId && handledEventIds.has(evtId)) return;
        if (evtId) {
          handledEventIds.add(evtId);
          if (handledEventIds.size > 500) {
            const first = Array.from(handledEventIds)[0];
            handledEventIds.delete(first);
          }
        }

        const isNewHookahOrder =
          event.type === 'order_created' ||
          event.type === 'OrderCreated' ||
          (event.type === 'FulfillmentTicketUpdated' && event.status === 'PENDING' && event.station === 'HOOKAH');

        if (isNewHookahOrder && hasInitializedRef.current) {
          const orderId = event.orderId || event.parentOrderId || event.id || evtId;
          const isHookahFulfillment = event.type === 'FulfillmentTicketUpdated' && event.station === 'HOOKAH';
          const items: any[] = (event as any).items || (event as any).payload?.items || [];
          const hasHookahItems = isHookahFulfillment || items.some((i: any) => getFulfillmentStation(i) === 'HOOKAH');

          if (hasHookahItems && orderId && !notifiedOrderIdsRef.current.has(orderId)) {
            notifiedOrderIdsRef.current.add(orderId);
            setLastNotification(
              `New Hookah Order #${String(orderId).slice(-4)} for ${formatStandardTableNumber(event.tableNumber, 'Lounge')}`
            );
            if (soundEnabledRef.current) {
              playNotificationSound();
            }
          }
        }
      } else if (event.type === 'RECONNECTED') {
        loadHookahOrders(false);
      }
    });

    const unsubStatus = realtimeBus.subscribeStatus((status) => {
      if (status === 'CONNECTED') {
        loadHookahOrders(false);
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
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}
  };

  const loadHookahOrders = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    setActionError('');
    try {
      const restId = api.getCurrentRestaurantId() || restaurant?.id || undefined;
      const isNotWedding = (restaurant as any)?.businessType !== 'WEDDING_ORDERING';
      const allOrders = await api.getOrders(restId, { station: 'HOOKAH', activeOnly: true, excludeEvents: isNotWedding });

      const hookahOrders = allOrders
        .filter((o) => {
          if ((restaurant as any)?.businessType !== 'WEDDING_ORDERING' && (o.orderType === 'WEDDING_EVENT' || o.eventId)) {
            return false;
          }
          const hasHookahItems = o.items && o.items.some((i) => getFulfillmentStation(i) === 'HOOKAH');
          const hasHookahStatus = Boolean(o.hookahStatus && (o.hookahStatus as string) !== 'NOT_REQUIRED');
          return hasHookahItems || hasHookahStatus;
        })
        .map((o) => {
          const hookahItemsOnly = (o.items || []).filter((i) => getFulfillmentStation(i) === 'HOOKAH');
          const isFinished = o.status === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'CANCELLED';
          const effHookahStatus = isFinished ? 'COMPLETED' : (o.hookahStatus || 'PENDING');
          return {
            ...o,
            items: hookahItemsOnly.length > 0 ? hookahItemsOnly : o.items,
            hookahStatus: effHookahStatus,
          };
        });

      setOrders(hookahOrders as any);
    } catch (err: any) {
      console.error('Failed to load hookah orders:', err);
      setActionError(err.message || 'Unable to sync with live hookah queue.');
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
      await api.updateFulfillmentTicketStatus(orderId, 'PREPARING', 'HOOKAH');
      await api.updateHookahStatus(orderId, 'PREPARING');
      await loadHookahOrders(false);
    } catch (err: any) {
      console.error('Failed to update hookah status:', err);
      setActionError(err.message || 'Failed to start hookah preparation.');
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
      await api.updateFulfillmentTicketStatus(orderId, 'READY', 'HOOKAH');
      await api.updateHookahStatus(orderId, 'READY');
      await api.requestWaiter(orderId, 'HOOKAH');
      await loadHookahOrders(false);
    } catch (err: any) {
      console.error('Failed to mark ready & notify waiter:', err);
      setActionError(err?.message || 'Failed to notify waiter. Please retry.');
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Optional direct lounge handover fallback
  const handleDirectComplete = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    setActionError('');
    try {
      await api.updateFulfillmentTicketStatus(orderId, 'COMPLETED', 'HOOKAH');
      await api.updateHookahStatus(orderId, 'COMPLETED');
      const completedOrd = orders.find((o) => o.id === orderId);
      if (completedOrd) {
        setRecentDispatches((prev) => [
          { ...completedOrd, hookahStatus: 'COMPLETED', status: 'COMPLETED' },
          ...prev.filter((x) => x.id !== orderId),
        ].slice(0, 15));
      }
      await loadHookahOrders(false);
    } catch (err: any) {
      console.error('Failed to complete hookah order:', err);
      setActionError(err.message || 'Failed to complete order. Please retry.');
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleQuickEta = async (orderId: string, currentOrder: Order, deltaMins: number) => {
    const currentMins = currentOrder.estimatedPrepTimeMinutes || 15;
    const newMins = Math.max(5, currentMins + deltaMins);
    const newTarget = new Date(Date.now() + newMins * 60000).toISOString();
    try {
      await api.updateHookahStatus(orderId, 'PREPARING', undefined, {
        estimatedPrepTimeMinutes: newMins,
        etaTargetTimestamp: newTarget,
      });
      await loadHookahOrders(false);
    } catch (e) {}
  };

  // AUTHORITATIVE ACTIVE HOOKAH ORDERS
  const activeOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status !== 'COMPLETED' &&
        o.status !== 'DELIVERED' &&
        o.status !== 'CANCELLED' &&
        o.hookahStatus !== 'COMPLETED'
    );
  }, [orders]);

  // COMPLETED HOOKAH ORDERS
  const completedOrders = useMemo(() => {
    const fromApi = orders.filter((o) => o.hookahStatus === 'COMPLETED' || o.status === 'COMPLETED' || o.status === 'DELIVERED');
    const combined = [...recentDispatches];
    fromApi.forEach((ord) => {
      if (!combined.some((c) => c.id === ord.id)) combined.push(ord);
    });
    return combined.slice(0, 30);
  }, [orders, recentDispatches]);

  const pendingOrders = activeOrders.filter((o) => (o.hookahStatus === 'PENDING' || !o.hookahStatus) && o.hookahStatus !== 'PREPARING' && o.hookahStatus !== 'ACCEPTED' && o.hookahStatus !== 'READY');
  const preparingOrders = activeOrders.filter((o) => o.hookahStatus === 'PREPARING' || o.hookahStatus === 'ACCEPTED');
  const waitingOrders = activeOrders.filter((o) => o.hookahStatus === 'READY' && o.deliveryStatus !== 'COLLECTED');
  const collectedOrders = activeOrders.filter((o) => o.hookahStatus === 'READY' && o.deliveryStatus === 'COLLECTED');

  const displayedActiveOrders = useMemo(() => {
    return activeOrders.filter((o) => {
      if (activeFilter === 'NEW') return (o.hookahStatus === 'PENDING' || !o.hookahStatus) && o.hookahStatus !== 'PREPARING' && o.hookahStatus !== 'READY';
      if (activeFilter === 'PREPARING') return o.hookahStatus === 'PREPARING' || o.hookahStatus === 'ACCEPTED';
      if (activeFilter === 'WAITING') return o.hookahStatus === 'READY' && o.deliveryStatus !== 'COLLECTED';
      if (activeFilter === 'COLLECTED') return o.hookahStatus === 'READY' && o.deliveryStatus === 'COLLECTED';
      return true;
    }).filter((o) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchesTable = (o.tableNumber || '').toLowerCase().includes(q);
      const matchesGuest = (o.customerName || '').toLowerCase().includes(q);
      const matchesPipe = (o.items || []).some((it) => (it.name || '').toLowerCase().includes(q));
      return matchesTable || matchesGuest || matchesPipe;
    });
  }, [activeOrders, activeFilter, searchQuery]);

  return (
    <div className="min-h-screen bg-[#07080c] text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
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
        <div className="bg-amber-950/80 border-b border-amber-800/40 text-amber-200 px-6 py-2 text-xs font-mono flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>{lastNotification}</span>
          </div>
          <button onClick={() => setLastNotification('')} className="text-amber-400 hover:text-amber-200 text-xs">
            ✕
          </button>
        </div>
      )}

      {/* TOP HEADER */}
      <header className="bg-[#0b0e14] border-b border-[#211b14] px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 to-orange-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-md">
            <Flame className="w-5 h-5 fill-amber-500/20" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Hookah Terminal</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  LOUNGE OS
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              {restaurant?.name || 'Shisha & Coals Station'} · 1-Click Service Workflow
            </p>
          </div>
        </div>

        {/* View Switcher Tabs: Active Queue vs Completed History */}
        <div className="flex items-center gap-2 bg-[#141219] p-1 rounded-xl border border-[#29221d]">
          <button
            onClick={() => setViewTab('ACTIVE')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              viewTab === 'ACTIVE'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Active Orders</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              viewTab === 'ACTIVE' ? 'bg-slate-950 text-amber-300' : 'bg-[#221c16] text-slate-300'
            }`}>
              {activeOrders.length}
            </span>
          </button>

          <button
            onClick={() => setViewTab('COMPLETED')}
            className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-2 ${
              viewTab === 'COMPLETED'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Completed History</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${
              viewTab === 'COMPLETED' ? 'bg-slate-950 text-amber-300' : 'bg-[#221c16] text-slate-300'
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
                ? 'border-[#29221d] bg-[#141219] text-amber-400'
                : 'border-[#29221d] bg-[#141219] text-slate-500 hover:text-slate-300'
            }`}
            title={soundEnabled ? 'Mute alert chime' : 'Enable alert chime'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => loadHookahOrders()}
            className="p-2.5 rounded-xl border border-[#29221d] bg-[#141219] text-slate-300 hover:text-white transition-colors"
            title="Refresh order queue"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
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
      <div className="bg-[#0e0c12]/60 border-b border-[#211b14] px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-400 text-xs">
          <Activity className="w-3.5 h-3.5 text-amber-400" />
          <span className="uppercase text-[11px] tracking-wider text-slate-400 font-bold">Lounge Operations Pulse</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1 rounded-lg bg-[#141219] border border-[#29221d] text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>New Tickets: <strong className="text-amber-300 font-bold">{pendingOrders.length}</strong></span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-[#141219] border border-[#29221d] text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-400" />
            <span>Heating Coals: <strong className="text-orange-300 font-bold">{preparingOrders.length}</strong></span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-[#141219] border border-[#29221d] text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Awaiting Waiter: <strong className="text-emerald-300 font-bold">{waitingOrders.length}</strong></span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-[#141219] border border-[#29221d] text-slate-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span>In Delivery: <strong className="text-indigo-300 font-bold">{collectedOrders.length}</strong></span>
          </span>
          <span className="px-3 py-1 rounded-lg bg-[#141219] border border-[#29221d] text-slate-400">
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
                  { id: 'ALL', label: 'All Active Pipes', count: activeOrders.length },
                  { id: 'NEW', label: 'New Tickets', count: pendingOrders.length },
                  { id: 'PREPARING', label: 'Heating & Packing', count: preparingOrders.length },
                  { id: 'WAITING', label: 'Awaiting Waiter', count: waitingOrders.length },
                  { id: 'COLLECTED', label: 'In Delivery', count: collectedOrders.length },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveFilter(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                      activeFilter === tab.id
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-[#141219] text-slate-400 hover:text-white border border-[#29221d]'
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
                  placeholder="Search table, shisha flavor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#141219] border border-[#29221d] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 font-sans"
                />
              </div>
            </div>

            {/* EMPTY STATE */}
            {displayedActiveOrders.length === 0 && (
              <div className="p-16 text-center bg-[#0d0a11] rounded-2xl border border-dashed border-[#29221d] space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                  <Flame className="w-8 h-8 fill-amber-500/20" />
                </div>
                <h3 className="text-base font-bold text-white">Hookah Station is Clear</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchQuery ? 'No active orders match your search query.' : 'New hookah tickets will appear here with live sound alerts as soon as guests place orders.'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-3 py-1.5 rounded-lg bg-[#1f1922] text-xs text-slate-300 hover:text-white border border-[#35293d]"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            )}

            {/* RESPONSIVE HOOKAH GRID: 1 col on mobile, 2 cols on tablet, 3 cols on desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <AnimatePresence mode="popLayout">
                {displayedActiveOrders.map((ord) => {
                  const hookahItems = (ord.items || []).filter((i) => getFulfillmentStation(i) === 'HOOKAH');
                  const elapsed = formatElapsed(ord.createdAt);
                  const isProcessing = processingOrderIds.has(ord.id);

                  const isNew = (!ord.hookahStatus || ord.hookahStatus === 'PENDING') && ord.hookahStatus !== 'PREPARING' && ord.hookahStatus !== 'READY';
                  const isPreparing = ord.hookahStatus === 'PREPARING' || ord.hookahStatus === 'ACCEPTED';
                  const isWaiting = ord.hookahStatus === 'READY' && ord.deliveryStatus !== 'COLLECTED';
                  const isCollected = ord.hookahStatus === 'READY' && ord.deliveryStatus === 'COLLECTED';

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
                          ? 'bg-[#120f18] border-amber-500/40 hover:border-amber-400'
                          : isPreparing
                          ? 'bg-[#140e11] border-orange-500/50 hover:border-orange-400 shadow-orange-950/20'
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
                              {formatStandardTableNumber(ord.tableNumber, 'Lounge')}
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

                        {/* STATUS BANNER */}
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
                            <div className="w-full py-1.5 px-3 rounded-lg text-xs font-mono font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Flame className="w-3.5 h-3.5 text-orange-400 animate-bounce fill-orange-400" />
                                <span>HEATING COALS & PACKING PIPE</span>
                              </span>
                              <span className="text-[10px] text-orange-400 uppercase">Stage 2</span>
                            </div>
                          )}

                          {isWaiting && (
                            <div className="w-full py-2 px-3 rounded-lg text-xs font-mono font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-500/50 flex items-center justify-between animate-pulse">
                              <span className="flex items-center gap-2">
                                <Bell className="w-4 h-4 text-emerald-400" />
                                <span>WAITING FOR WAITER</span>
                              </span>
                              <span className="text-[10px] bg-emerald-500/30 px-2 py-0.5 rounded text-emerald-200 uppercase font-mono">
                                AT HOOKAH PASS
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
                                SERVING LOUNGE
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* CARD BODY: HOOKAH ITEMS */}
                      <div className="p-4 space-y-3 flex-1">
                        <div className="bg-[#09070c] p-3.5 rounded-xl border border-white/[0.08] space-y-2.5">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-white/[0.06] pb-1.5 flex justify-between items-center">
                            <span>Hookah Selection ({hookahItems.length})</span>
                            <span className="text-slate-500">{ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>

                          <div className="space-y-2.5">
                            {hookahItems.map((item, idx) => (
                              <div key={idx} className="flex items-start justify-between gap-2">
                                <div className="space-y-1">
                                  <div className="flex items-baseline gap-2">
                                    <span className="font-mono font-bold text-amber-400 text-sm">
                                      {item.quantity}x
                                    </span>
                                    <span className="font-semibold text-white text-sm">
                                      {item.name}
                                    </span>
                                  </div>
                                  {item.notes && (
                                    <span className="text-[11px] text-amber-300 italic block">
                                      Blend: "{item.notes}"
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
                            <span><strong className="font-semibold">Lounge Instructions:</strong> {ord.specialInstructions}</span>
                          </div>
                        )}

                        {/* Quick Prep ETA buttons when preparing */}
                        {isPreparing && (
                          <div className="flex items-center justify-between gap-1 text-[11px] font-mono text-slate-400 pt-1">
                            <span className="text-slate-500">Adjust Coals Time:</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleQuickEta(ord.id, ord, 5)}
                                className="px-2 py-0.5 rounded bg-[#201826] border border-[#3b2b46] hover:border-orange-400 text-orange-300 text-[10px] font-mono transition-colors"
                              >
                                +5m
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickEta(ord.id, ord, 10)}
                                className="px-2 py-0.5 rounded bg-[#201826] border border-[#3b2b46] hover:border-orange-400 text-orange-300 text-[10px] font-mono transition-colors"
                              >
                                +10m
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* CARD FOOTER: 1-CLICK ACTION CONTROLS */}
                      <div className="p-4 bg-[#09070c]/80 border-t border-white/[0.06]">
                        {isNew && (
                          <button
                            type="button"
                            onClick={() => handleStartPreparing(ord.id)}
                            disabled={isProcessing}
                            className="w-full py-3.5 px-4 rounded-xl font-bold font-mono text-sm tracking-wide bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation active:scale-[0.98]"
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
                            className="w-full py-3.5 px-4 rounded-xl font-bold font-mono text-sm tracking-wide bg-gradient-to-r from-orange-500 to-emerald-500 hover:from-orange-400 hover:to-emerald-400 text-slate-950 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation active:scale-[0.98]"
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
                              className="w-full py-2 px-3 rounded-lg text-xs font-mono text-slate-300 hover:text-white bg-[#17131e] hover:bg-[#221c2c] border border-[#2d2438] flex items-center justify-center gap-1.5 transition-colors"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Direct Lounge Handover</span>
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
          /* COMPLETED HOOKAH ORDERS HISTORY TAB */
          <div className="space-y-5 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Recent Hookah Dispatches</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Pipes served and delivered to lounge tables. Kept for shift reconciliation.
                </p>
              </div>

              <span className="text-xs font-mono font-bold px-3 py-1 bg-[#141219] border border-[#29221d] rounded-lg text-slate-300">
                {completedOrders.length} Dispatched
              </span>
            </div>

            {completedOrders.length === 0 ? (
              <div className="p-16 text-center bg-[#0d0a11] rounded-2xl border border-dashed border-[#29221d] space-y-2">
                <History className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-sm font-semibold text-slate-300">No Dispatched Hookahs Yet</h3>
                <p className="text-xs text-slate-500">Completed pipes will appear here once delivered by floor staff.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedOrders.map((ord) => {
                  const hookahItems = (ord.items || []).filter((i) => getFulfillmentStation(i) === 'HOOKAH');
                  return (
                    <div
                      key={ord.id}
                      className="p-4 rounded-xl bg-[#0c0911] border border-[#241d2c] space-y-3 opacity-80 hover:opacity-100 transition-opacity"
                    >
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-0.5 rounded bg-[#1d1624] text-white border border-[#30243b] text-xs font-mono font-bold">
                          {formatStandardTableNumber(ord.tableNumber, 'Lounge')}
                        </span>
                        <span className="text-xs font-mono text-emerald-400 font-bold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>DELIVERED</span>
                        </span>
                      </div>

                      <div className="space-y-1 py-1">
                        {hookahItems.map((it, idx) => (
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
