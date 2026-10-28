import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wine,
  GlassWater,
  Beer,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Check,
  ChevronRight,
  Flame,
  User,
  LogOut,
  RefreshCw,
  Search,
  Filter,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Activity,
  ArrowRight,
  SlidersHorizontal,
  Bell,
} from 'lucide-react';
import { Badge, DinelyLogo } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { Order, OrderItem, OrderStatus, getFulfillmentStation } from '../../packages/types';
import { realtimeBus } from '../../packages/api/realtime';
import { getCurrencySymbol } from '../../packages/utils/currency';
import { formatStandardTableNumber } from '../../packages/utils/tableUtils';

interface BarTerminalProps {
  restaurant?: any;
  onLogout?: () => void;
}

export const BarTerminal: React.FC<BarTerminalProps> = ({ restaurant, onLogout }) => {
  const currencySymbol = React.useMemo(() => getCurrencySymbol(restaurant?.currency || 'INR (₹)'), [restaurant?.currency]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [recentDispatches, setRecentDispatches] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const soundEnabledRef = React.useRef(true);
  const notifiedOrderIdsRef = React.useRef<Set<string>>(new Set());
  const hasInitializedRef = React.useRef(false);
  const [lastNotification, setLastNotification] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');

  // Keep soundEnabledRef in sync without triggering effect re-registration
  React.useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    const currentRestId = api.getCurrentRestaurantId() || '';
    if (currentRestId) {
      realtimeBus.connect(currentRestId, 'BAR');
    }

    loadBarOrders(true);
    setTimeout(() => { hasInitializedRef.current = true; }, 2000);
    const pollInterval = setInterval(() => loadBarOrders(false), 30000);

    // Per-session event deduplication — stable, not recreated on sound toggle
    const handledEventIds = new Set<string>();

    const unsubscribe = realtimeBus.subscribe((event: any) => {
      const evtRestId = event.restaurantId || event.restaurant_id;
      if (evtRestId && currentRestId && String(evtRestId).toLowerCase() !== String(currentRestId).toLowerCase()) {
        return;
      }

      // Ignore updates for other stations
      if (event.type === 'FulfillmentTicketUpdated' && event.station && event.station !== 'BAR') {
        return;
      }

      // Day Closed Reset
      if (event.type === 'DayClosed' || event.type === 'BusinessDayClosed') {
        setOrders([]);
        setRecentDispatches([]);
        notifiedOrderIdsRef.current.clear();
        setLastNotification('Business Day Closed 🌅 Bar queue reset for new day.');
        return;
      }

      // Day Opened
      if (event.type === 'DayOpened' || event.type === 'BusinessDayOpened') {
        setOrders([]);
        setRecentDispatches([]);
        loadBarOrders(false);
        setLastNotification('New Business Day Opened ☀️ Ready for new beverage orders.');
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
        event.type === 'table_session_closed' ||
        event.type === 'TableSessionClosed' ||
        (event.type === 'FulfillmentTicketUpdated' && event.station === 'BAR')
      ) {
        // Reload data silently for all order-related events
        loadBarOrders(false);

        const evtId = event.eventId || event.event_id;
        if (evtId && handledEventIds.has(evtId)) {
          return;
        }
        if (evtId) {
          handledEventIds.add(evtId);
          if (handledEventIds.size > 500) {
            const first = Array.from(handledEventIds)[0];
            handledEventIds.delete(first);
          }
        }

        // Alert only on genuine new BAR-destined orders, after initial load, once per order
        const isNewBarOrder =
          event.type === 'order_created' ||
          event.type === 'OrderCreated' ||
          (event.type === 'FulfillmentTicketUpdated' && event.status === 'PENDING' && event.station === 'BAR');

        if (isNewBarOrder && hasInitializedRef.current) {
          const orderId = event.orderId || event.parentOrderId || event.id || evtId;
          // Verify this event actually has BAR-destined items or is a FulfillmentTicket for BAR
          const isBarFulfillment = event.type === 'FulfillmentTicketUpdated' && event.station === 'BAR';
          const items: any[] = (event as any).items || (event as any).payload?.items || [];
          const hasBarItems = isBarFulfillment || items.some((i: any) => getFulfillmentStation(i) === 'BAR');

          if (hasBarItems && orderId && !notifiedOrderIdsRef.current.has(orderId)) {
            notifiedOrderIdsRef.current.add(orderId);
            if (notifiedOrderIdsRef.current.size > 200) {
              const first = Array.from(notifiedOrderIdsRef.current)[0];
              notifiedOrderIdsRef.current.delete(first);
            }
            setLastNotification(
              `New Beverage Ticket #${String(orderId).slice(-4)} for ${formatStandardTableNumber(event.tableNumber, 'Bar')}`
            );
            if (soundEnabledRef.current) {
              playNotificationSound();
            }
          }
        }
      } else if (event.type === 'RECONNECTED') {
        // Silent data refresh on reconnect
        loadBarOrders(false);
      }
    });

    const unsubStatus = realtimeBus.subscribeStatus((status) => {
      if (status === 'CONNECTED') {
        // Silently refresh on reconnect — no sound
        loadBarOrders(false);
      }
    });

    return () => {
      clearInterval(pollInterval);
      unsubscribe();
      unsubStatus();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps — sound managed via soundEnabledRef, not re-registration

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

  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState<number>(0);

  // Live timer tick for real-time elapsed time calculation
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleUpdateStatus = async (
    orderId: string,
    newStatus: OrderStatus,
    options?: { estimatedPrepTimeMinutes?: number; etaTargetTimestamp?: string }
  ) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    setActionError('');
    try {
      const stationStatus =
        newStatus === 'READY'
          ? 'READY'
          : newStatus === 'PREPARING' || newStatus === 'PREPARING_DRINKS'
          ? 'PREPARING'
          : 'COMPLETED';
      await api.updateFulfillmentTicketStatus(orderId, stationStatus, 'BAR');
      await api.updateBarStatus(orderId, stationStatus, undefined, options);

      if (stationStatus === 'COMPLETED' || newStatus === 'DELIVERED') {
        const completedOrd = orders.find((o) => o.id === orderId);
        if (completedOrd) {
          setRecentDispatches((prev) => [
            { ...completedOrd, barStatus: 'COMPLETED', status: 'COMPLETED' },
            ...prev.filter((x) => x.id !== orderId),
          ].slice(0, 8));
        }
      }

      await loadBarOrders(false);
    } catch (err: any) {
      console.error('Failed to update drink order status:', err);
      setActionError(err?.message || 'Failed to update bar status. Please try again.');
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
    await handleUpdateStatus(orderId, 'PREPARING', {
      estimatedPrepTimeMinutes: newMins,
      etaTargetTimestamp: newTarget,
    });
  };

  const [waiterRequestedOrderIds, setWaiterRequestedOrderIds] = useState<Set<string>>(new Set());

  const handleRequestWaiter = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    setWaiterRequestedOrderIds((prev) => new Set(prev).add(orderId));
    setActionError('');
    try {
      await api.requestWaiter(orderId, 'BAR');
      await loadBarOrders(false);
    } catch (err: any) {
      console.error('Failed to request waiter:', err);
      setActionError(err?.message || 'Failed to request waiter. Please retry.');
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Divide orders into Bar Pipeline stages based strictly on authoritative station and order status
  const pendingOrders = orders.filter(
    (o) =>
      (o.barStatus === 'PENDING' || !o.barStatus) &&
      o.barStatus !== 'PREPARING' &&
      o.barStatus !== 'ACCEPTED' &&
      o.barStatus !== 'READY' &&
      o.barStatus !== 'COMPLETED' &&
      o.status !== 'CANCELLED' &&
      o.status !== 'COMPLETED' &&
      o.status !== 'DELIVERED'
  );
  const preparingOrders = orders.filter(
    (o) =>
      (o.barStatus === 'PREPARING' || o.barStatus === 'ACCEPTED') &&
      o.status !== 'COMPLETED' &&
      o.status !== 'DELIVERED' &&
      o.status !== 'CANCELLED'
  );
  const readyOrders = orders.filter(
    (o) =>
      o.barStatus === 'READY' &&
      o.status !== 'COMPLETED' &&
      o.status !== 'DELIVERED' &&
      o.status !== 'CANCELLED'
  );
  const isRecentDispatch = (timestamp?: string) => {
    if (!timestamp) return false;
    const diffHours = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60);
    return diffHours <= 4;
  };
  const completedOrders = recentDispatches.length > 0
    ? recentDispatches
    : orders.filter((o) => o.barStatus === 'COMPLETED' && isRecentDispatch(o.createdAt));

  return (
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Error Alert Banner */}
      {actionError && (
        <div className="bg-rose-950/70 border-b border-rose-800/50 text-rose-200 px-6 py-2.5 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError('')}
            className="text-rose-400/80 hover:text-rose-100 text-xs px-2 py-0.5 rounded transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Banner Notification */}
      {lastNotification && (
        <div className="bg-emerald-950/60 border-b border-emerald-800/40 text-emerald-200 px-6 py-2.5 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{lastNotification}</span>
          </div>
          <button
            onClick={() => setLastNotification('')}
            className="text-emerald-400/60 hover:text-emerald-200 text-xs px-2 py-0.5 rounded transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Bar Terminal Top Navigation Header */}
      <header className="bg-[#0e1117] border-b border-[#1e232e] px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-center text-slate-200">
            <Wine className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <DinelyLogo size="sm" />
              <h1 className="text-base font-bold text-white tracking-tight uppercase">{restaurant?.name || 'THE START'}</h1>
              <Badge variant="brand">BAR TERMINAL</Badge>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Beverage queue & mixology fulfillment
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Metrics */}
          <div className="hidden md:flex items-center gap-4 px-4 py-2 rounded-xl bg-[#12151b] border border-[#1e232e] text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-slate-400">Queue:</span>
              <strong className="text-white font-semibold">{pendingOrders.length + preparingOrders.length}</strong>
            </div>
            <span className="text-slate-600">/</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-400">Ready:</span>
              <strong className="text-emerald-400 font-semibold">{readyOrders.length}</strong>
            </div>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border text-xs transition-colors ${
              soundEnabled
                ? 'border-[#1e232e] bg-[#12151b] text-slate-200 hover:text-white'
                : 'border-[#1e232e] bg-[#12151b] text-slate-500 hover:text-slate-300'
            }`}
            title={soundEnabled ? 'Mute alert chime' : 'Enable alert chime'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => loadBarOrders()}
            className="p-2.5 rounded-xl border border-[#1e232e] bg-[#12151b] text-slate-300 hover:text-white transition-colors"
            title="Refresh order queue"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={async () => {
              await api.logout();
              if (onLogout) onLogout();
              else window.location.href = '/bar/login';
            }}
            className="px-3 py-2 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/10 text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Operational Summary Bar */}
      {(() => {
        const received = pendingOrders.length;
        const preparing = preparingOrders.length;
        const ready = readyOrders.length;
        const completed = completedOrders.length;

        return (
          <div className="bg-[#0e1117] border-b border-[#1e232e] px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <span className="text-slate-400 uppercase text-[11px] tracking-wider flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Shift Metrics</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-[#12151b] border border-[#1e232e] text-slate-300">
                Incoming: <strong className="text-amber-400 font-semibold">{received}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#12151b] border border-[#1e232e] text-slate-300">
                Mixology: <strong className="text-sky-400 font-semibold">{preparing}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#12151b] border border-[#1e232e] text-slate-300">
                At Pass: <strong className="text-emerald-400 font-semibold">{ready}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#12151b] border border-[#1e232e] text-slate-400">
                Dispatched: <strong className="text-slate-200 font-semibold">{completed}</strong>
              </span>
            </div>
          </div>
        );
      })()}

      {/* Main Bar Preparation KanBan Pipeline */}
      <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 w-full">
          {/* COLUMN 1: INCOMING DRINK ORDERS */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-medium text-xs">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>1. Incoming Queue</span>
              </div>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25">
                {pendingOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {pendingOrders.map((ord) => (
                <BarOrderCard
                  key={ord.id}
                  order={ord}
                  currencySymbol={currencySymbol}
                  actionLabel="Confirm Order"
                  actionVariant="primary"
                  isProcessing={processingOrderIds.has(ord.id)}
                  onAction={() => handleUpdateStatus(ord.id, 'PREPARING')}
                  onQuickEta={(delta) => handleQuickEta(ord.id, ord, delta)}
                />
              ))}
              {pendingOrders.length === 0 && (
                <div className="p-8 text-center bg-[#12151b]/40 border border-dashed border-[#1e232e] rounded-xl text-slate-500 text-xs">
                  No pending beverage tickets
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 2: PREPARING DRINKS */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-medium text-xs">
                <Wine className="w-3.5 h-3.5 text-sky-400" />
                <span>2. Mixology & Pouring</span>
              </div>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/25">
                {preparingOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {preparingOrders.map((ord) => (
                <BarOrderCard
                  key={ord.id}
                  order={ord}
                  currencySymbol={currencySymbol}
                  actionLabel="Mark Ready (To Pass)"
                  actionVariant="success"
                  isProcessing={processingOrderIds.has(ord.id)}
                  onAction={() => handleUpdateStatus(ord.id, 'READY')}
                  onQuickEta={(delta) => handleQuickEta(ord.id, ord, delta)}
                />
              ))}
              {preparingOrders.length === 0 && (
                <div className="p-8 text-center bg-[#12151b]/40 border border-dashed border-[#1e232e] rounded-xl text-slate-500 text-xs">
                  No drinks currently in preparation
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 3: READY FOR PICKUP */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-medium text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>3. Ready at Bar Pass</span>
              </div>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                {readyOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {readyOrders.map((ord) => {
                const isWaiterRequested = Boolean(
                  (ord as any).barWaiterRequested ||
                  waiterRequestedOrderIds.has(ord.id) ||
                  ord.deliveryStatus === 'WAITING_FOR_WAITER' ||
                  ord.deliveryStatus === 'COLLECTED'
                );

                return (
                  <BarOrderCard
                    key={ord.id}
                    order={ord}
                    currencySymbol={currencySymbol}
                    isProcessing={processingOrderIds.has(ord.id)}
                    customAction={
                      <div className="space-y-1.5 pt-1">
                        {isWaiterRequested ? (
                          <div className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30">
                            <span className="flex items-center gap-1.5 font-mono">
                              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                              <span>Waiter Requested</span>
                            </span>
                            <span className="text-[10px] text-amber-400 font-mono bg-amber-500/20 px-1.5 py-0.5 rounded">
                              Dispatched
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRequestWaiter(ord.id)}
                            disabled={processingOrderIds.has(ord.id)}
                            className="w-full py-2 px-3 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 flex items-center justify-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                          >
                            {processingOrderIds.has(ord.id) ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Bell className="w-3.5 h-3.5" />
                                <span>Request Waiter</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(ord.id, 'COMPLETED')}
                          disabled={processingOrderIds.has(ord.id)}
                          className="w-full py-1.5 px-2 rounded-lg text-[11px] font-medium bg-[#181d27] text-slate-300 hover:text-white hover:bg-[#222838] border border-[#2d3545] flex items-center justify-center gap-1 transition-colors"
                        >
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Direct Bar Handover</span>
                        </button>
                      </div>
                    }
                  />
                );
              })}
              {readyOrders.length === 0 && (
                <div className="p-8 text-center bg-[#12151b]/40 border border-dashed border-[#1e232e] rounded-xl text-slate-500 text-xs">
                  Pass is clear
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 4: COMPLETED ORDERS */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300 font-medium text-xs">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>4. Recent Dispatches</span>
              </div>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-[#181d27] text-slate-300 border border-[#2d3545]">
                {completedOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {completedOrders.slice(0, 5).map((ord) => (
                <BarOrderCard key={ord.id} order={ord} currencySymbol={currencySymbol} isCompleted />
              ))}
              {completedOrders.length === 0 && (
                <div className="p-8 text-center bg-[#12151b]/40 border border-dashed border-[#1e232e] rounded-xl text-slate-500 text-xs">
                  No completed orders yet
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// Helper for elapsed time calculation
const calculateElapsedTime = (timestamp?: string) => {
  if (!timestamp) return 'Just now';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
};

// Helper for remaining ETA calculation (only when ETA is explicitly set)
const calculateRemainingEta = (etaTimestamp?: string) => {
  if (!etaTimestamp) return null;
  const diff = Math.floor((new Date(etaTimestamp).getTime() - Date.now()) / 1000);
  if (diff < 0) {
    const overdue = Math.abs(diff);
    const m = Math.floor(overdue / 60);
    const s = overdue % 60;
    return { formatted: `+${m}:${s.toString().padStart(2, '0')} LATE`, isLate: true };
  }
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return { formatted: `${m}:${s.toString().padStart(2, '0')}`, isLate: false };
};

// Bar Order Card Component
const BarOrderCard: React.FC<{
  order: Order;
  actionLabel?: string;
  actionVariant?: 'primary' | 'success' | 'neutral';
  onAction?: () => void;
  onQuickEta?: (deltaMins: number) => void;
  isProcessing?: boolean;
  isCompleted?: boolean;
  currencySymbol?: string;
  customAction?: React.ReactNode;
}> = ({
  order,
  actionLabel,
  actionVariant = 'primary',
  onAction,
  onQuickEta,
  isProcessing = false,
  isCompleted,
  currencySymbol = '₹',
  customAction,
}) => {
  const drinkItems = (order.items || []).filter((i) => getFulfillmentStation(i) === 'BAR');
  if (drinkItems.length === 0) {
    return null;
  }

  const elapsed = calculateElapsedTime(order.createdAt);
  const remainingEta = calculateRemainingEta(order.etaTargetTimestamp);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <div className={`p-4 rounded-xl bg-[#12151b] border ${isCompleted ? 'border-[#1e232e]/60 opacity-60' : 'border-[#1e232e] hover:border-[#2d3545]'} transition-colors space-y-3 shadow-xs`}>
        {/* Header Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-[#181d27] text-slate-200 border border-[#2d3545] text-xs font-mono font-medium whitespace-nowrap">
              {formatStandardTableNumber(order.tableNumber, 'Bar')}
            </span>
            <span className="text-[11px] font-mono text-slate-400">#{order.id.slice(-4)}</span>
            {Boolean((order as any).eventName || (order as any).metadata?.eventName) && (
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold uppercase tracking-wider">
                BANQUET · {(order as any).eventName || (order as any).metadata?.eventName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-slate-400 flex items-center gap-1" title="Time elapsed since received">
              <Clock className="w-3 h-3 text-slate-500" />
              <span>{elapsed}</span>
            </span>
            <span className="text-slate-500 text-[10px]">
              ({order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ordered'})
            </span>
          </div>
        </div>

        {order.customerName && (
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <User className="w-3 h-3 text-slate-500" />
            <span>{order.customerName}</span>
          </div>
        )}

        {/* ETA Display (Only displayed if staff explicitly set an ETA) */}
        {remainingEta && !isCompleted && (
          <div className={`px-2.5 py-1 rounded-lg border text-xs font-mono flex items-center justify-between ${
            remainingEta.isLate
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
          }`}>
            <span className="flex items-center gap-1.5 text-[11px]">
              <Clock className="w-3 h-3" />
              <span>Prep ETA:</span>
            </span>
            <span className="font-bold">{remainingEta.formatted}</span>
          </div>
        )}

        {/* Drink Items List */}
        <div className="space-y-2 py-2 border-y border-[#1e232e]">
          {drinkItems.map((item, idx) => (
            <div key={idx} className="flex items-start justify-between gap-2 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-bold text-white text-xs">{item.quantity}x</span>
                  <span className="font-medium text-slate-200">{item.name}</span>
                </div>
                {item.glassSize && (
                  <span className="text-[10px] font-mono text-slate-400 block">
                    Serving: {item.glassSize} {item.alcoholPercentage ? `• ${item.alcoholPercentage}% ABV` : ''}
                  </span>
                )}
                {item.notes && (
                  <span className="text-[10px] text-amber-300 italic block">
                    Note: "{item.notes}"
                  </span>
                )}
              </div>
              <span className="font-mono text-slate-400 text-[11px] shrink-0">
                {currencySymbol}{(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* Special Instructions */}
        {order.specialInstructions && (
          <div className="text-xs bg-rose-500/10 text-rose-300 p-2 rounded-lg border border-rose-500/20 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
            <span>Note: {order.specialInstructions}</span>
          </div>
        )}

        {/* Quick ETA Controls (Optional, does not block 1-click workflows) */}
        {!isCompleted && onQuickEta && (
          <div className="flex items-center justify-between gap-1 pt-1 text-[11px] font-mono text-slate-400">
            <span className="text-[10px] text-slate-500">Optional ETA:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onQuickEta(5)}
                disabled={isProcessing}
                className="px-2 py-0.5 rounded bg-[#181d27] border border-[#2d3545] hover:border-sky-500 text-sky-400 text-[10px] transition-colors disabled:opacity-50"
                title="Add 5 minutes to prep estimate"
              >
                +5m
              </button>
              <button
                type="button"
                onClick={() => onQuickEta(10)}
                disabled={isProcessing}
                className="px-2 py-0.5 rounded bg-[#181d27] border border-[#2d3545] hover:border-sky-500 text-sky-400 text-[10px] transition-colors disabled:opacity-50"
                title="Add 10 minutes to prep estimate"
              >
                +10m
              </button>
            </div>
          </div>
        )}

        {/* Custom or Primary Action Button */}
        {!isCompleted && customAction}
        {!isCompleted && !customAction && onAction && actionLabel && (
          <button
            onClick={onAction}
            disabled={isProcessing}
            className={`w-full min-h-[44px] py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 touch-manipulation ${
              actionVariant === 'primary' || actionVariant === 'success'
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-xs'
                : 'bg-[#181d27] text-white hover:bg-[#222838] border border-[#2d3545]'
            }`}
          >
            {isProcessing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <span>{actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
};

