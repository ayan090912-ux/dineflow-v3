import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Flame,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Bell,
  Package,
  Check,
  LogOut,
  RefreshCw,
  Volume2,
  VolumeX,
  History,
  X,
  User,
} from 'lucide-react';
import { api } from '../../packages/api/client';
import { Order, getFulfillmentStation } from '../../packages/types';
import { realtimeBus } from '../../packages/api/realtime';
import { getCurrencySymbol } from '../../packages/utils/currency';
import { formatStandardTableNumber } from '../../packages/utils/tableUtils';

interface HookahTerminalProps {
  restaurant?: any;
  onLogout?: () => void;
}

// Live elapsed time calculator (e.g. "2m ago", "14m ago")
const formatElapsed = (timestamp?: string) => {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  if (m === 0) return `${s}s ago`;
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

export const HookahTerminal: React.FC<HookahTerminalProps> = ({ restaurant, onLogout }) => {
  const currencySymbol = useMemo(() => getCurrencySymbol(restaurant?.currency || 'INR (₹)'), [restaurant?.currency]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [completedHistory, setCompletedHistory] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = useRef(true);
  const notifiedOrderIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState<number>(0);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Toast auto-clear
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(''), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Live timer tick every second for real-time elapsed timestamps
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
    const pollInterval = setInterval(() => loadHookahOrders(false), 15000);

    const handledEventIds = new Set<string>();

    const unsubscribe = realtimeBus.subscribe((event: any) => {
      const evtRestId = event.restaurantId || event.restaurant_id;
      if (evtRestId && currentRestId && String(evtRestId).toLowerCase() !== String(currentRestId).toLowerCase()) {
        return;
      }

      if (event.type === 'FulfillmentTicketUpdated' && event.station && event.station !== 'HOOKAH') {
        return;
      }

      // Business Day lifecycle
      if (event.type === 'DayClosed' || event.type === 'BusinessDayClosed') {
        setOrders([]);
        setCompletedHistory([]);
        notifiedOrderIdsRef.current.clear();
        setToastMessage('Business day closed 🌅 Queue reset.');
        return;
      }

      if (event.type === 'DayOpened' || event.type === 'BusinessDayOpened') {
        setOrders([]);
        setCompletedHistory([]);
        loadHookahOrders(false);
        setToastMessage('New business day opened ☀️ Ready for orders.');
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
            setToastMessage(`New pipe order #${String(orderId).slice(-4)} for ${formatStandardTableNumber(event.tableNumber, 'Lounge')}`);
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
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
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
          const hasHookahStatus = Boolean((o as any).hookahStatus && ((o as any).hookahStatus as string) !== 'NOT_REQUIRED');
          return hasHookahItems || hasHookahStatus;
        })
        .map((o) => {
          const hookahItemsOnly = (o.items || []).filter((i) => getFulfillmentStation(i) === 'HOOKAH');
          const isFinished = o.status === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'CANCELLED';
          const effHookahStatus = isFinished ? 'COMPLETED' : ((o as any).hookahStatus || 'PENDING');
          return {
            ...o,
            items: hookahItemsOnly.length > 0 ? hookahItemsOnly : o.items,
            hookahStatus: effHookahStatus,
          };
        });

      setOrders(hookahOrders as any);

      // Collect delivered history
      const delivered = hookahOrders.filter((o) => o.status === 'DELIVERED' || o.status === 'COMPLETED' || (o as any).hookahStatus === 'COMPLETED');
      if (delivered.length > 0) {
        setCompletedHistory((prev) => {
          const combined = [...delivered];
          prev.forEach((p) => {
            if (!combined.some((c) => c.id === p.id)) combined.push(p);
          });
          return combined.slice(0, 50);
        });
      }
    } catch (err: any) {
      console.error('Failed to load hookah orders:', err);
      setActionError(err?.message || 'Unable to sync with live hookah queue.');
    } finally {
      setIsLoading(false);
    }
  };

  // ACTION 1: START PREPARING (For new orders)
  const handleStartPreparing = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    setActionError('');
    try {
      setOrders((prev) =>
        prev.map((ord) => (ord.id === orderId ? { ...ord, hookahStatus: 'PREPARING' } : ord))
      );
      await api.updateFulfillmentTicketStatus(orderId, 'PREPARING', 'HOOKAH');
      await api.updateHookahStatus(orderId, 'PREPARING');
      await loadHookahOrders(false);
    } catch (err: any) {
      console.error('Failed to start preparing hookah order:', err);
      setActionError(err?.message || 'Failed to start preparation. Please retry.');
      await loadHookahOrders(false);
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // ACTION 2: READY — SEND TO WAITER (For orders being prepared)
  const handleReadyAndSendToWaiter = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    setActionError('');
    try {
      setOrders((prev) =>
        prev.map((ord) => (ord.id === orderId ? { ...ord, hookahStatus: 'READY', deliveryStatus: 'WAITING_FOR_WAITER' } : ord))
      );
      await api.updateFulfillmentTicketStatus(orderId, 'READY', 'HOOKAH');
      await api.updateHookahStatus(orderId, 'READY');
      await api.requestWaiter(orderId, 'HOOKAH');
      setToastMessage(`Order #${orderId.slice(-4)} sent to waiter ✓`);
      await loadHookahOrders(false);
    } catch (err: any) {
      console.error('Failed to mark ready & send to waiter:', err);
      setActionError(err?.message || 'Failed to send to waiter. Please try again.');
      await loadHookahOrders(false);
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // =========================================================================
  // ONLY TWO SECTIONS:
  // 1. ACTIVE ORDERS: New & preparing orders not yet sent to waiter
  // 2. SENT TO WAITER: Ready orders handed over to waiter workflow
  // =========================================================================

  const activeOrders = useMemo(() => {
    return orders.filter((o) => {
      const isFinished = o.status === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'CANCELLED' || (o as any).hookahStatus === 'COMPLETED';
      if (isFinished) return false;
      return (o as any).hookahStatus !== 'READY';
    });
  }, [orders]);

  const sentToWaiterOrders = useMemo(() => {
    return orders.filter((o) => {
      const isFinished = o.status === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'CANCELLED' || (o as any).hookahStatus === 'COMPLETED';
      if (isFinished) return false;
      return (o as any).hookahStatus === 'READY';
    });
  }, [orders]);

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-purple-500 selection:text-white">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-purple-500 text-slate-950 font-bold px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2 text-sm border border-purple-400"
          >
            <CheckCircle2 className="w-4 h-4 text-slate-950 shrink-0" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alert Banner for Errors */}
      {actionError && (
        <div className="bg-rose-950/90 border-b border-rose-800/50 text-rose-200 px-6 py-2.5 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError('')} className="underline text-[11px] text-rose-300 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* COMPACT CLEAN HEADER */}
      <header className="bg-[#0b0e14] border-b border-[#1c2230] px-5 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-md">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-white tracking-tight">Hookah Terminal</h1>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {restaurant?.name || 'Hookah & Lounge Station'}
            </p>
          </div>
        </div>

        {/* Compact Counts & Quick Controls */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-2 bg-[#121620] px-3 py-1.5 rounded-xl border border-[#1e2536] text-xs font-medium">
            <span className="flex items-center gap-1.5 text-purple-300">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <strong>{activeOrders.length}</strong> Active
            </span>
            <span className="text-slate-600">|</span>
            <span className="flex items-center gap-1.5 text-teal-300">
              <span className="w-2 h-2 rounded-full bg-teal-400" />
              <strong>{sentToWaiterOrders.length}</strong> Sent
            </span>
          </div>

          {completedHistory.length > 0 && (
            <button
              onClick={() => setShowHistoryModal(true)}
              className="p-2 sm:px-3 sm:py-2 rounded-xl border border-[#1e2536] bg-[#121620] text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="View past delivered history"
            >
              <History className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline">History ({completedHistory.length})</span>
            </button>
          )}

          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className={`p-2 rounded-xl border transition-colors ${
              soundEnabled
                ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
                : 'border-[#1e2536] bg-[#121620] text-slate-500 hover:text-slate-300'
            }`}
            title={soundEnabled ? 'Mute alert chime' : 'Enable alert chime'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => loadHookahOrders()}
            className="p-2 rounded-xl border border-[#1e2536] bg-[#121620] text-slate-300 hover:text-white transition-colors"
            title="Refresh hookah queue"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
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
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTENT: TWO SECTIONS VERTICALLY */}
      <main className="flex-1 p-4 lg:p-8 w-full max-w-5xl mx-auto space-y-10 overflow-y-auto">

        {/* ========================================================================= */}
        {/* SECTION 1: ACTIVE ORDERS (Primary Attention)                              */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1c2230]">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2.5">
                <span>ACTIVE ORDERS</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {activeOrders.length}
                </span>
              </h2>
              <span className="text-xs text-slate-400 hidden sm:inline">· Pipes requiring preparation</span>
            </div>
          </div>

          {/* Empty state for Active Orders */}
          {activeOrders.length === 0 ? (
            <div className="py-10 px-4 text-center bg-[#0b0e14]/50 rounded-2xl border border-dashed border-[#1c2230] space-y-1.5">
              <Flame className="w-7 h-7 text-slate-600 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-300">No active orders</h3>
              <p className="text-xs text-slate-500">New orders will appear here automatically.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
              <AnimatePresence mode="popLayout">
                {activeOrders.map((ord) => {
                  const hookahItems = (ord.items || []).filter((i) => getFulfillmentStation(i) === 'HOOKAH');
                  const elapsed = formatElapsed(ord.createdAt);
                  const isProcessing = processingOrderIds.has(ord.id);
                  const isPreparing = (ord as any).hookahStatus === 'PREPARING' || (ord as any).hookahStatus === 'ACCEPTED';
                  const isNew = !isPreparing;

                  return (
                    <motion.div
                      key={ord.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className={`rounded-2xl border flex flex-col justify-between overflow-hidden shadow-lg transition-all ${
                        isNew
                          ? 'bg-[#0e121a] border-purple-500/40 hover:border-purple-400 shadow-purple-950/10'
                          : 'bg-[#0e141f] border-teal-500/40 hover:border-teal-400 shadow-teal-950/10'
                      }`}
                    >
                      {/* CARD TOP ROW: Order #, Prominent Table Badge, Elapsed Time */}
                      <div className="p-4 sm:p-5 border-b border-white/[0.06] space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base sm:text-lg font-black font-mono px-3.5 py-1 rounded-xl bg-white/10 text-white border border-white/20 shadow-sm">
                              {formatStandardTableNumber(ord.tableNumber, 'Lounge')}
                            </span>
                            <span className="text-sm font-bold font-mono text-slate-300">
                              Order #{ord.id.slice(-4)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>{elapsed}</span>
                          </div>
                        </div>

                        {ord.customerName && (
                          <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                            <User className="w-3 h-3 text-slate-500" />
                            <span>Guest: {ord.customerName}</span>
                          </div>
                        )}

                        {/* Status Badge */}
                        <div>
                          {isNew ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                              NEW ORDER
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-teal-500/15 text-teal-300 border border-teal-500/30">
                              <Flame className="w-3.5 h-3.5 text-teal-400 animate-bounce" />
                              PREPARING
                            </span>
                          )}
                        </div>
                      </div>

                      {/* CARD MIDDLE: Ordered Items & Instructions */}
                      <div className="p-4 sm:p-5 space-y-3 flex-1">
                        <div className="space-y-2.5">
                          {hookahItems.map((item, idx) => {
                            const flavor = (item as any).flavor || (item as any).flavour;
                            const coalType = (item as any).coalType;
                            const headType = (item as any).headType;

                            return (
                              <div key={idx} className="space-y-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <div className="flex items-baseline gap-2.5 text-base font-semibold text-white">
                                    <span className="font-mono font-bold text-purple-400 text-lg">
                                      {item.quantity}×
                                    </span>
                                    <span>{item.name}</span>
                                  </div>
                                  <span className="font-mono text-slate-400 text-xs shrink-0">
                                    {currencySymbol}{(item.price * item.quantity).toFixed(2)}
                                  </span>
                                </div>

                                {/* Customization details only when present */}
                                {(flavor || coalType || headType) && (
                                  <div className="text-xs font-mono pl-7 flex flex-wrap gap-2 pt-0.5">
                                    {flavor && (
                                      <span className="bg-purple-500/15 text-purple-200 px-2 py-0.5 rounded border border-purple-500/30">
                                        Flavour: {flavor}
                                      </span>
                                    )}
                                    {coalType && (
                                      <span className="bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                                        Coals: {coalType}
                                      </span>
                                    )}
                                    {headType && (
                                      <span className="bg-sky-500/15 text-sky-300 px-2 py-0.5 rounded border border-sky-500/30">
                                        Bowl: {headType}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {item.notes && (
                                  <span className="text-xs text-amber-300 italic block pl-7">
                                    "{item.notes}"
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Special Instructions callout */}
                        {ord.specialInstructions && (
                          <div className="mt-2 text-xs bg-rose-500/15 text-rose-200 p-2.5 rounded-xl border border-rose-500/30 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <span><strong className="font-semibold">Instructions:</strong> {ord.specialInstructions}</span>
                          </div>
                        )}
                      </div>

                      {/* CARD BOTTOM: ONE PROMINENT PRIMARY BUTTON */}
                      <div className="p-4 sm:p-5 bg-[#090c12]/80 border-t border-white/[0.06]">
                        {isNew ? (
                          <button
                            type="button"
                            onClick={() => handleStartPreparing(ord.id)}
                            disabled={isProcessing}
                            className="w-full h-12 rounded-xl font-bold font-mono text-sm tracking-wide bg-purple-500 hover:bg-purple-400 text-slate-950 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation active:scale-[0.98]"
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
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReadyAndSendToWaiter(ord.id)}
                            disabled={isProcessing}
                            className="w-full h-12 rounded-xl font-bold font-mono text-sm tracking-wide bg-gradient-to-r from-purple-500 to-teal-400 hover:from-purple-400 hover:to-teal-300 text-slate-950 transition-all shadow-md shadow-purple-500/10 flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation active:scale-[0.98]"
                          >
                            {isProcessing ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Bell className="w-4 h-4" />
                                <span>READY — SEND TO WAITER</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* ========================================================================= */}
        {/* SECTION 2: SENT TO WAITER (Read-Only)                                     */}
        {/* ========================================================================= */}
        <section className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#1c2230]">
            <div className="flex items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2.5">
                <span>SENT TO WAITER</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  {sentToWaiterOrders.length}
                </span>
              </h2>
              <span className="text-xs text-slate-400 hidden sm:inline">· Awaiting floor delivery · Read-only</span>
            </div>
          </div>

          {/* Empty state for Sent to Waiter */}
          {sentToWaiterOrders.length === 0 ? (
            <div className="py-10 px-4 text-center bg-[#0b0e14]/50 rounded-2xl border border-dashed border-[#1c2230] space-y-1.5">
              <Package className="w-7 h-7 text-slate-600 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-300">Nothing waiting for delivery</h3>
              <p className="text-xs text-slate-500">Orders marked ready will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
              <AnimatePresence mode="popLayout">
                {sentToWaiterOrders.map((ord) => {
                  const hookahItems = (ord.items || []).filter((i) => getFulfillmentStation(i) === 'HOOKAH');
                  const elapsed = formatElapsed(ord.createdAt);
                  const isCollected = ord.deliveryStatus === 'COLLECTED' || Boolean(ord.claimedBy);

                  return (
                    <motion.div
                      key={ord.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className={`rounded-2xl border flex flex-col justify-between overflow-hidden shadow-md ${
                        isCollected
                          ? 'bg-[#0d121c] border-indigo-500/40'
                          : 'bg-[#0d151c] border-teal-500/40'
                      }`}
                    >
                      {/* CARD TOP ROW */}
                      <div className="p-4 sm:p-5 border-b border-white/[0.06] space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base sm:text-lg font-black font-mono px-3.5 py-1 rounded-xl bg-white/10 text-white border border-white/20 shadow-sm">
                              {formatStandardTableNumber(ord.tableNumber, 'Lounge')}
                            </span>
                            <span className="text-sm font-bold font-mono text-slate-300">
                              Order #{ord.id.slice(-4)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>{elapsed}</span>
                          </div>
                        </div>

                        {/* Large, Readable Status */}
                        <div>
                          {isCollected ? (
                            <div className="w-full py-2 px-3 rounded-xl text-xs font-bold font-mono bg-indigo-500/15 text-indigo-200 border border-indigo-500/30 flex items-center justify-between">
                              <span className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-indigo-400" />
                                <span>COLLECTED BY {ord.claimedBy || 'WAITER'}</span>
                              </span>
                              <span className="text-[10px] bg-indigo-500/30 px-2 py-0.5 rounded text-indigo-200 uppercase font-mono">
                                EN ROUTE
                              </span>
                            </div>
                          ) : (
                            <div className="w-full py-2 px-3 rounded-xl text-xs font-bold font-mono bg-teal-500/15 text-teal-200 border border-teal-500/30 flex items-center justify-between animate-pulse">
                              <span className="flex items-center gap-2">
                                <Bell className="w-4 h-4 text-teal-400" />
                                <span>WAITING FOR WAITER</span>
                              </span>
                              <span className="text-[10px] bg-teal-500/30 px-2 py-0.5 rounded text-teal-200 uppercase font-mono">
                                AT HOOKAH PASS
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* CARD MIDDLE: Items */}
                      <div className="p-4 sm:p-5 space-y-2 flex-1">
                        <div className="space-y-1.5">
                          {hookahItems.map((item, idx) => (
                            <div key={idx} className="space-y-0.5 text-sm">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-slate-200">
                                  <strong className="text-teal-400 mr-2 font-mono">{item.quantity}×</strong>
                                  {item.name}
                                </span>
                              </div>
                              {((item as any).flavor || (item as any).flavour) && (
                                <span className="text-xs font-mono text-purple-300 block pl-7">
                                  Flavour: {(item as any).flavor || (item as any).flavour}
                                </span>
                              )}
                              {item.notes && (
                                <span className="text-xs text-amber-300 italic truncate block pl-7">
                                  "{item.notes}"
                                </span>
                              )}
                            </div>
                          ))}
                        </div>

                        {ord.specialInstructions && (
                          <p className="text-xs text-slate-400 italic pt-1">
                            Note: {ord.specialInstructions}
                          </p>
                        )}
                      </div>

                      {/* READ-ONLY FOOTER */}
                      <div className="px-4 py-3 bg-[#090c12]/70 border-t border-white/[0.06] text-xs font-mono text-slate-500 flex items-center justify-between">
                        <span>Read-only</span>
                        <span>Auto-clears when delivered</span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>

      </main>

      {/* COMPLETED HISTORY MODAL */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0e14] border border-[#1c2230] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#1c2230] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-sm font-mono">Completed History</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-white/10 text-slate-300">
                  {completedHistory.length} Delivered
                </span>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {completedHistory.map((ord) => (
                <div key={ord.id} className="p-3 rounded-xl bg-[#07090e] border border-white/[0.06] flex items-center justify-between text-xs font-mono">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-white">{formatStandardTableNumber(ord.tableNumber, 'Lounge')}</strong>
                      <span className="text-slate-500">#{ord.id.slice(-4)}</span>
                      <span className="text-purple-400 flex items-center gap-1 font-bold">
                        <Check className="w-3 h-3" /> DELIVERED
                      </span>
                    </div>
                    <div className="text-slate-400 mt-1">
                      {(ord.items || []).filter((i) => getFulfillmentStation(i) === 'HOOKAH').map((i) => `${i.quantity}× ${i.name}`).join(', ')}
                    </div>
                  </div>
                  <div className="text-slate-500 text-[11px] shrink-0">
                    {ord.deliveredAt ? new Date(ord.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Delivered'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
