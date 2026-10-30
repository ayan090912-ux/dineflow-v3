import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Flame,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Volume2,
  VolumeX,
  LogOut,
  RefreshCw,
  CheckSquare,
  Plus,
  Activity,
  Wind,
} from 'lucide-react';
import {
  Button,
  Badge,
  Avatar,
  SearchInput,
  Modal,
  DinelyLogo,
} from '../../packages/ui';
import { api } from '../../packages/api/client';
import { normalizeOrder } from '../../packages/api/core/helpers';
import { Order, OrderItem, MenuItem, Table, getFulfillmentStation } from '../../packages/types';
import { realtimeBus, ConnectionStatusType } from '../../packages/api/realtime';
import { formatStandardTableNumber } from '../../packages/utils/tableUtils';

// Web Audio API Chime Synthesizer for notifications
const playNotificationChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.25);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.35);
  } catch (e) {}
};

// Live elapsed time calculator (e.g. "45s ago", "3m ago", "1h 12m ago")
const formatElapsed = (timestamp?: string) => {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  if (m === 0) return `${s}s ago`;
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

interface HookahTerminalProps {
  restaurant?: any;
  onLogout?: () => void;
}

export const HookahTerminal: React.FC<HookahTerminalProps> = ({ restaurant, onLogout }) => {
  const restaurantName = restaurant?.name || 'Hookah Lounge';
  const [orders, setOrders] = useState<Order[]>([]);
  const [completedHistory, setCompletedHistory] = useState<
    Array<{ id: string; title: string; time: string; details: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const isAudioMutedRef = useRef(false);
  const notifiedOrderIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);

  // View mode: 'active' (Dual-Section 1-Screen Floor) or 'history' (Shift Work Audit)
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string; type: 'info' | 'success' | 'warning' } | null>(null);
  const [isErrorState, setIsErrorState] = useState(false);
  const [wsStatus, setWsStatus] = useState<ConnectionStatusType>(realtimeBus.getStatus());

  // Processing protection set for duplicate action prevention
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState<number>(0);

  // Counter dispatch modal state
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [newOrderForm, setNewOrderForm] = useState({
    tableNumber: '',
    selectedItemId: '',
    flavor: 'Double Apple & Mint',
    bowl: 'Clay Head',
    coals: 'Coconut Shell (3 Cubes)',
    quantity: 1,
    notes: '',
    isSubmitting: false,
  });

  useEffect(() => {
    isAudioMutedRef.current = isAudioMuted;
  }, [isAudioMuted]);

  // Live clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      );
    };
    updateClock();
    const clockTimer = setInterval(updateClock, 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // Tick for elapsed times
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto clear toast
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Realtime connection & events
  useEffect(() => {
    const currentRestId = restaurant?.id || api.getCurrentRestaurantId() || '';
    if (currentRestId) {
      if (!api.getCurrentRestaurantId()) {
        api.setCurrentRestaurantId(currentRestId);
      }
      realtimeBus.connect(currentRestId, 'HOOKAH');
    }

    const unsubStatus = realtimeBus.subscribeStatus((status) => {
      setWsStatus(status);
    });

    const unsubscribe = realtimeBus.subscribe((event: any) => {
      if (!event) return;
      if (
        event.type === 'order_created' ||
        event.type === 'OrderCreated' ||
        event.type === 'order_status_updated' ||
        event.type === 'OrderStatusUpdated' ||
        event.type === 'order_ready' ||
        event.type === 'OrderReady' ||
        event.type === 'HookahStatusUpdated' ||
        event.type === 'order_collected' ||
        event.type === 'OrderCollected' ||
        event.type === 'order_delivered' ||
        event.type === 'OrderDelivered' ||
        (event.type === 'FulfillmentTicketUpdated' && event.station === 'HOOKAH')
      ) {
        // Fast-path instant reactive state ingestion
        const rawPayload = event.payload || event.data;
        if (rawPayload && rawPayload.id) {
          const norm = normalizeOrder(rawPayload);
          setOrders((prev) => {
            const exists = prev.some((o) => o.id === norm.id);
            if (exists) {
              return prev.map((o) => (o.id === norm.id ? { ...o, ...norm } : o));
            }
            if (isHookahOrder(norm)) {
              if (hasInitializedRef.current && !isAudioMutedRef.current && !notifiedOrderIdsRef.current.has(norm.id)) {
                playNotificationChime();
                notifiedOrderIdsRef.current.add(norm.id);
              }
              return [norm, ...prev];
            }
            return prev;
          });
        }
        loadData(false);
      }
    });

    return () => {
      unsubStatus();
      unsubscribe();
    };
  }, [restaurant?.id]);

  // Initial load
  useEffect(() => {
    loadData(true);
    loadAuxiliaryData();
    const interval = setInterval(() => loadData(false), 5000);
    return () => clearInterval(interval);
  }, [restaurant?.id]);

  const loadAuxiliaryData = async () => {
    try {
      const restId = api.getCurrentRestaurantId() || restaurant?.id || undefined;
      const [menuRes, tablesRes] = await Promise.allSettled([
        api.getMenuItems(restId),
        api.getTables(restId),
      ]);
      if (menuRes.status === 'fulfilled' && Array.isArray(menuRes.value)) {
        const hookahItems = menuRes.value.filter(
          (i: MenuItem) =>
            i.targetDestination === 'HOOKAH' ||
            getFulfillmentStation(i) === 'HOOKAH' ||
            i.name.toLowerCase().includes('hookah') ||
            i.name.toLowerCase().includes('shisha')
        );
        setMenuItems(hookahItems.length > 0 ? hookahItems : menuRes.value);
        if (hookahItems.length > 0 && !newOrderForm.selectedItemId) {
          setNewOrderForm((prev) => ({ ...prev, selectedItemId: hookahItems[0].id }));
        }
      }
      if (tablesRes.status === 'fulfilled' && Array.isArray(tablesRes.value)) {
        setTables(tablesRes.value);
        if (tablesRes.value.length > 0 && !newOrderForm.tableNumber) {
          setNewOrderForm((prev) => ({ ...prev, tableNumber: tablesRes.value[0].tableNumber }));
        }
      }
    } catch (err) {
      console.warn('Failed to load auxiliary tables/menu items:', err);
    }
  };

  const loadData = async (isManual = false) => {
    if (isManual) setIsLoading(true);
    try {
      const restId = api.getCurrentRestaurantId() || restaurant?.id || undefined;
      const isNotWedding = (restaurant as any)?.businessType !== 'WEDDING_ORDERING';
      const allOrders = await api.getOrders(restId, {
        station: 'HOOKAH',
        activeOnly: true,
        excludeEvents: isNotWedding,
      });

      setIsErrorState(false);
      if (Array.isArray(allOrders)) {
        // Sound check for incoming new orders
        if (hasInitializedRef.current && !isAudioMutedRef.current) {
          const hasNewPending = allOrders.some(
            (o) =>
              (o.hookahStatus === 'PENDING' || (!o.hookahStatus && o.status === 'PENDING')) &&
              !notifiedOrderIdsRef.current.has(o.id)
          );
          if (hasNewPending) {
            playNotificationChime();
          }
        }
        allOrders.forEach((o) => notifiedOrderIdsRef.current.add(o.id));
        hasInitializedRef.current = true;
        setOrders(allOrders);
      }
    } catch (err) {
      console.error('Failed to load hookah orders:', err);
      setIsErrorState(true);
    } finally {
      if (isManual) setIsLoading(false);
    }
  };

  // Filter orders by Hookah relevance
  const isHookahOrder = (order: Order) => {
    if (order.hookahStatus && ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.hookahStatus)) {
      return true;
    }
    return (order.items || []).some(
      (item) =>
        item.targetDestination === 'HOOKAH' ||
        getFulfillmentStation(item) === 'HOOKAH' ||
        item.name.toLowerCase().includes('hookah') ||
        item.name.toLowerCase().includes('shisha') ||
        (item.selectedOptions &&
          typeof item.selectedOptions === 'object' &&
          Object.keys(item.selectedOptions).some((k) =>
            ['flavor', 'flavour', 'coal', 'coals', 'bowl'].includes(k.toLowerCase())
          ))
    );
  };

  const relevantOrders = useMemo(() => orders.filter(isHookahOrder), [orders]);

  // Section A: Active orders requiring station preparation
  const activeOrders = useMemo(() => {
    return relevantOrders
      .filter((o) => {
        const s = o.hookahStatus || 'PENDING';
        return ['PENDING', 'ACCEPTED', 'PREPARING'].includes(s) && o.status !== 'CANCELLED' && o.hookahStatus !== 'COMPLETED';
      })
      .filter((o) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          o.tableNumber?.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          (o.items || []).some((i) => i.name.toLowerCase().includes(q))
        );
      });
  }, [relevantOrders, searchQuery]);

  // Section B: Prepared orders sent to waiter awaiting pickup/delivery
  const sentToWaiterOrders = useMemo(() => {
    return relevantOrders
      .filter((o) => {
        return (
          o.hookahStatus === 'READY' &&
          o.status !== 'CANCELLED' &&
          o.hookahStatus !== 'COMPLETED'
        );
      })
      .filter((o) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
          o.tableNumber?.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          (o.items || []).some((i) => i.name.toLowerCase().includes(q))
        );
      });
  }, [relevantOrders, searchQuery]);

  // Extract hookah items from order
  const getHookahItems = (order: Order) => {
    const list = (order.items || []).filter(
      (item) =>
        item.targetDestination === 'HOOKAH' ||
        getFulfillmentStation(item) === 'HOOKAH' ||
        item.name.toLowerCase().includes('hookah') ||
        item.name.toLowerCase().includes('shisha') ||
        (item.selectedOptions &&
          typeof item.selectedOptions === 'object' &&
          Object.keys(item.selectedOptions).some((k) =>
            ['flavor', 'flavour', 'coal', 'coals', 'bowl'].includes(k.toLowerCase())
          ))
    );
    return list.length > 0 ? list : order.items || [];
  };

  // State Transitions
  const handleStartPreparing = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    try {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, hookahStatus: 'PREPARING' } : o))
      );
      await api.updateFulfillmentTicketStatus(orderId, 'PREPARING', 'HOOKAH');
      await api.updateHookahStatus(orderId, 'PREPARING');
      setToastMessage({
        title: 'Preparation Started',
        desc: `Order #${orderId.slice(-4)} is now being prepared.`,
        type: 'info',
      });
      loadData(false);
    } catch (err: any) {
      console.error('Failed to start hookah preparation:', err);
      setToastMessage({
        title: 'Update Failed',
        desc: err.message || 'Could not update order status.',
        type: 'warning',
      });
      loadData(false);
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const handleMarkReady = async (order: Order) => {
    const orderId = order.id;
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((prev) => new Set(prev).add(orderId));
    try {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, hookahStatus: 'READY' } : o))
      );
      await api.updateFulfillmentTicketStatus(orderId, 'READY', 'HOOKAH');
      await api.updateHookahStatus(orderId, 'READY');
      await api.requestWaiter(orderId, 'HOOKAH');
      setCompletedHistory((prev) => [
        {
          id: `${order.id}-${Date.now()}`,
          title: `Order #${order.id.slice(-4)} (${order.tableNumber || 'Lounge'}) Sent to Waiter`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          details: getHookahItems(order).map((i) => `${i.quantity}x ${i.name}`).join(', '),
        },
        ...prev.slice(0, 19),
      ]);
      setToastMessage({
        title: 'Dispatched to Waiter',
        desc: `Order #${orderId.slice(-4)} marked READY and moved to Sent to Waiter.`,
        type: 'success',
      });
      loadData(false);
    } catch (err: any) {
      console.error('Failed to mark hookah order ready:', err);
      setToastMessage({
        title: 'Action Failed',
        desc: err.message || 'Could not send order to waiter.',
        type: 'warning',
      });
      loadData(false);
    } finally {
      setProcessingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Dispatch Counter Order
  const handleCreateCounterOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderForm.tableNumber) {
      setToastMessage({
        title: 'Missing Table',
        desc: 'Please select a table or lounge destination.',
        type: 'warning',
      });
      return;
    }
    const selectedItem = menuItems.find((i) => i.id === newOrderForm.selectedItemId) || menuItems[0];
    const itemName = selectedItem ? selectedItem.name : 'Custom Shisha Pipe';
    const itemPrice = selectedItem ? selectedItem.price : 450;

    setNewOrderForm((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const payload: any = {
        tableNumber: newOrderForm.tableNumber,
        items: [
          {
            id: `item-${Date.now()}`,
            menuItemId: selectedItem?.id || 'hookah-pipe-counter',
            name: `${itemName} - ${newOrderForm.flavor}`,
            quantity: Number(newOrderForm.quantity) || 1,
            price: itemPrice,
            targetDestination: 'HOOKAH',
            selectedOptions: {
              flavor: newOrderForm.flavor,
              bowl: newOrderForm.bowl,
              coals: newOrderForm.coals,
            } as any,
            notes: newOrderForm.notes,
          },
        ],
        notes: `[HOOKAH COUNTER DISPATCH] Bowl: ${newOrderForm.bowl} | Coals: ${newOrderForm.coals} | ${newOrderForm.notes}`.trim(),
        paymentMethod: 'CASH',
        source: 'COUNTER',
      };

      const res = await api.createOrder(payload);
      setShowNewOrderModal(false);
      setToastMessage({
        title: 'Order Dispatched',
        desc: `Order #${(res?.id || 'NEW').slice(-4)} created for ${newOrderForm.tableNumber}.`,
        type: 'success',
      });
      playNotificationChime();
      loadData(true);
    } catch (err: any) {
      console.error('Failed to dispatch counter order:', err);
      setToastMessage({
        title: 'Dispatch Failed',
        desc: err.message || 'Failed to dispatch hookah order.',
        type: 'warning',
      });
    } finally {
      setNewOrderForm((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col font-sans antialiased">
      {/* TOAST FEEDBACK NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-xs font-medium ${
              toastMessage.type === 'success'
                ? 'bg-[#12151b] border-emerald-500/40 text-emerald-300'
                : toastMessage.type === 'warning'
                ? 'bg-[#12151b] border-amber-500/40 text-amber-300'
                : 'bg-[#12151b] border-[#222838] text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="font-semibold text-white">{toastMessage.title}</p>
              <p className="text-slate-400 text-[11px]">{toastMessage.desc}</p>
            </div>
          </div>
        </div>
      )}

      {/* HEADER BAR (Matches WaiterTerminalOS Exactly) */}
      <header className="bg-[#0e1117] border-b border-[#1e232e] sticky top-0 z-40 px-3 sm:px-6 py-2.5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-center text-amber-400 shrink-0">
            <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
              <DinelyLogo size="sm" />
              <h1 className="text-xs sm:text-base font-bold text-white tracking-tight uppercase truncate">
                {restaurantName}
              </h1>
              <Badge variant="brand" className="text-[9px] sm:text-[10px] px-1.5 py-0.2 sm:px-2 sm:py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30">
                HOOKAH
              </Badge>
              <Badge variant="outline" className="hidden xs:inline-flex text-amber-400 border-amber-500/30 text-[9px] sm:text-[10px] font-mono">
                LOUNGE OS
              </Badge>
              {wsStatus === 'CONNECTED' ? (
                <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                </span>
              ) : wsStatus === 'RECONNECTING' ? (
                <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Reconnecting
                </span>
              ) : (
                <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/25 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 hidden sm:block">
              Lounge pipe requests, active coal servicing & flavour preparation
            </p>
          </div>
        </div>

        {/* Staff Shift Info & Utility Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 sm:gap-2 bg-[#12151b] px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-[#1e232e]">
            <Avatar src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100" name="Hookah Master" size="sm" />
            <div className="hidden xs:block">
              <p className="font-semibold text-white text-xs truncate max-w-[80px] sm:max-w-none">Hookah Staff</p>
              <p className="text-[9px] sm:text-[10px] text-emerald-400 font-mono">ON SHIFT</p>
            </div>
          </div>

          {/* Clock */}
          <div className="hidden md:flex bg-[#12151b] px-2.5 py-1.5 rounded-lg border border-[#1e232e] items-center gap-1.5 font-mono text-slate-300 text-xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentTime || '03:20 PM'}</span>
          </div>

          {/* Audio Chime Toggle */}
          <button
            onClick={() => setIsAudioMuted(!isAudioMuted)}
            className="p-1.5 sm:p-2 rounded-lg bg-[#12151b] hover:bg-[#181d27] text-slate-400 hover:text-white transition-colors border border-[#1e232e] h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center shrink-0"
            title={isAudioMuted ? 'Enable Audio Chime' : 'Mute Audio Chime'}
          >
            {isAudioMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await api.logout();
              if (onLogout) onLogout();
              else window.location.href = '/staff/login';
            }}
            className="text-xs bg-[#12151b] border-[#1e232e] hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* ERROR / RECONNECT BANNER */}
      {isErrorState && (
        <div className="bg-rose-950/80 border-b border-rose-800 px-3 sm:px-4 py-2 text-xs text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">Unable to sync orders with server. Realtime events may be paused.</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            className="text-xs border-rose-700 hover:bg-rose-900 flex items-center gap-1 h-6 px-2 shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </Button>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-3.5 sm:space-y-4 bg-[#0b0d11]">
        {/* TOP OPERATIONAL BAR: Live Queue Selector, + New Pipe Request, Search & Refresh */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#0e1117] p-2.5 sm:p-3 rounded-xl border border-[#1e232e]">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setViewMode('active')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-colors shrink-0 touch-manipulation ${
                viewMode === 'active'
                  ? 'bg-emerald-500 text-slate-950 border border-emerald-400 shadow-sm'
                  : 'bg-[#12151b] text-slate-300 hover:text-white border border-[#1e232e]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Queue</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                viewMode === 'active'
                  ? 'bg-slate-950/20 text-slate-950'
                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
              }`}>
                {activeOrders.length + sentToWaiterOrders.length}
              </span>
            </button>

            <button
              onClick={() => setShowNewOrderModal(true)}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-colors shrink-0 touch-manipulation bg-[#12151b] text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-500/50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Pipe Request</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-xl justify-end">
            <div className="flex-1">
              <SearchInput
                value={searchQuery}
                onChange={(val) => setSearchQuery(typeof val === 'string' ? val : (val as any).target.value)}
                placeholder="Search table, ticket #, flavour..."
                className="w-full text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={isLoading}
              className="text-xs bg-[#12151b] border-[#1e232e] hover:bg-[#181d27] text-slate-300 flex items-center gap-1.5 h-8 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* ONE-SCREEN SUB-HEADER STRIP */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0e1117] p-3 rounded-xl border border-[#1e232e]">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
              One-Screen Operational Floor
            </span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              · Real-time pipe preparation & waiter handoff
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors flex items-center gap-1.5 ${
                viewMode === 'active'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-[#12151b] text-slate-400 hover:text-white border border-[#1e232e]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Queue ({activeOrders.length + sentToWaiterOrders.length})</span>
            </button>

            <button
              onClick={() => setViewMode('history')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors flex items-center gap-1.5 ${
                viewMode === 'history'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-[#12151b] text-slate-400 hover:text-white border border-[#1e232e]'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Recent Completed ({completedHistory.length})</span>
            </button>
          </div>
        </div>

        {/* VIEW MODE: HISTORY AUDIT */}
        {viewMode === 'history' ? (
          <div className="bg-[#12151b] border border-[#1e232e] p-5 rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-white">Recent Completed Shift Work</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#181d27] text-slate-300 border border-[#2d3545]">
                  {completedHistory.length} Cleared Tasks
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode('active')}
                className="text-xs border-[#1e232e] bg-[#141822] text-slate-300 hover:text-white h-7"
              >
                ← Back to Live Queue
              </Button>
            </div>

            {completedHistory.length === 0 ? (
              <div className="p-8 text-center bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
                <CheckSquare className="w-6 h-6 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">No completed tasks recorded in this session yet.</p>
                <p className="text-[11px] text-slate-400">Pipes dispatched to waiters will appear here for shift audit.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {completedHistory.map((item) => (
                  <div
                    key={item.id}
                    className="bg-[#0e1117] p-3 rounded-lg border border-[#1e232e] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <div>
                        <p className="font-semibold text-white">{item.title}</p>
                        <p className="text-[11px] text-slate-400">{item.details}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* DUAL-SECTION OPERATIONAL FLOOR: Section A (Active Orders) & Section B (Sent to Waiter) */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            {/* SECTION A: ACTIVE ORDERS */}
            <div className="bg-[#12151b] border border-[#1e232e] p-4 lg:p-5 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-tight">
                    Section A: Active Orders
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
                    {activeOrders.length} Active
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Pipe Preparation Queue
                </span>
              </div>

              {activeOrders.length === 0 ? (
                <div className="p-10 text-center bg-[#0e1117] rounded-xl border border-dashed border-[#1e232e] space-y-2">
                  <Flame className="w-7 h-7 text-slate-600 mx-auto" />
                  <p className="text-xs font-semibold text-slate-300">No active orders in queue</p>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    New hookah orders from customer QR menus, waiters, or the counter will appear here instantly.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {activeOrders.map((order) => {
                    const hookahItems = getHookahItems(order);
                    const isProcessing = processingOrderIds.has(order.id);
                    const formattedTable = formatStandardTableNumber(order.tableNumber);
                    const isPrep = order.hookahStatus === 'PREPARING';

                    return (
                      <div
                        key={order.id}
                        className={`p-4 rounded-xl border transition-colors space-y-3.5 shadow-xs bg-[#0e1117] ${
                          isPrep
                            ? 'border-amber-500/40 hover:border-amber-500/60'
                            : 'border-[#1e232e] hover:border-slate-700'
                        }`}
                      >
                        {/* Ticket Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded bg-[#181d27] text-white border border-[#2d3545] text-xs font-mono font-bold">
                              {formattedTable}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              #{order.id.slice(-4)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                              HOOKAH
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              isPrep
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}>
                              {order.hookahStatus || 'PENDING'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 font-mono text-xs text-amber-400 shrink-0">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatElapsed(order.createdAt)}</span>
                          </div>
                        </div>

                        {/* Order Items & Flavours */}
                        <div className="space-y-2 pt-1 border-t border-[#1e232e]/80">
                          {hookahItems.map((item: OrderItem, idx: number) => {
                            const opts: any = item.selectedOptions || {};
                            const flavor = opts.flavor || opts.flavour || item.notes || 'Standard Mix';
                            const bowl = opts.bowl || 'Clay Head';
                            const coals = opts.coals || opts.coal || 'Coconut Shell';

                            return (
                              <div key={idx} className="bg-[#12151b] p-2.5 rounded-lg border border-[#1e232e] space-y-1.5">
                                <div className="flex items-center justify-between text-xs font-semibold text-white">
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-amber-400 font-mono font-bold">{item.quantity}x</span>
                                    <span>{item.name}</span>
                                  </span>
                                </div>

                                <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25 flex items-center gap-1">
                                    <Wind className="w-3 h-3" /> {flavor}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-[#181d27] text-slate-300 border border-[#2d3545]">
                                    {bowl}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-[#181d27] text-slate-300 border border-[#2d3545]">
                                    {coals}
                                  </span>
                                </div>
                              </div>
                            );
                          })}

                          {order.notes && (
                            <p className="text-[11px] text-amber-200/80 bg-amber-950/20 px-2.5 py-1.5 rounded border border-amber-900/30 italic">
                              "{order.notes}"
                            </p>
                          )}
                        </div>

                        {/* Primary Prominent Action */}
                        <div className="pt-2">
                          {!isPrep ? (
                            <Button
                              variant="brand"
                              size="sm"
                              onClick={() => handleStartPreparing(order.id)}
                              disabled={isProcessing}
                              className="w-full justify-center bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono text-xs py-2.5 rounded-lg flex items-center gap-2 shadow-sm transition-all"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>{isProcessing ? 'Starting...' : 'START PREPARING'}</span>
                            </Button>
                          ) : (
                            <Button
                              variant="brand"
                              size="sm"
                              onClick={() => handleMarkReady(order)}
                              disabled={isProcessing}
                              className="w-full justify-center bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-mono text-xs py-2.5 rounded-lg flex items-center gap-2 shadow-sm transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isProcessing ? 'Dispatching...' : 'READY — SEND TO WAITER'}</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION B: SENT TO WAITER */}
            <div className="bg-[#12151b] border border-[#1e232e] p-4 lg:p-5 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-tight">
                    Section B: Sent to Waiter
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold">
                    {sentToWaiterOrders.length} Ready
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Awaiting Waiter Pickup
                </span>
              </div>

              {sentToWaiterOrders.length === 0 ? (
                <div className="p-10 text-center bg-[#0e1117] rounded-xl border border-dashed border-[#1e232e] space-y-2">
                  <CheckCircle2 className="w-7 h-7 text-slate-600 mx-auto" />
                  <p className="text-xs font-semibold text-slate-300">All prepared pipes collected</p>
                  <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                    Pipes marked ready will appear here until floor waiters collect and deliver them to lounge guests.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {sentToWaiterOrders.map((order) => {
                    const hookahItems = getHookahItems(order);
                    const formattedTable = formatStandardTableNumber(order.tableNumber);

                    return (
                      <div
                        key={order.id}
                        className="p-4 rounded-xl border transition-colors space-y-3 shadow-xs bg-[#0e1117] border-emerald-500/30"
                      >
                        {/* Ticket Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-0.5 rounded bg-[#181d27] text-white border border-[#2d3545] text-xs font-mono font-bold">
                              {formattedTable}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              #{order.id.slice(-4)}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> WAITING FOR WAITER
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 font-mono text-xs text-emerald-400 shrink-0">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formatElapsed(order.updatedAt || order.createdAt)}</span>
                          </div>
                        </div>

                        {/* Order Item Summary */}
                        <div className="space-y-1.5 pt-1 border-t border-[#1e232e]/80">
                          {hookahItems.map((item: OrderItem, idx: number) => {
                            const opts: any = item.selectedOptions || {};
                            return (
                              <div key={idx} className="flex items-center justify-between text-xs text-slate-200">
                                <span className="font-medium">
                                  <span className="text-amber-400 font-mono">{item.quantity}x</span> {item.name}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  {opts.flavor || 'Custom Blend'}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Runner / Delivery State */}
                        <div className="bg-[#12151b] p-2.5 rounded-lg border border-[#1e232e] flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Handover Status:</span>
                          <span className="font-mono text-emerald-400 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {order.claimedBy ? `Collected by ${order.claimedBy}` : 'Awaiting Floor Runner'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MODAL: + NEW PIPE REQUEST (Counter Dispatch) */}
      {showNewOrderModal && (
        <Modal
          isOpen={showNewOrderModal}
          onClose={() => setShowNewOrderModal(false)}
          title="Dispatch New Hookah Pipe"
          size="md"
        >
          <form onSubmit={handleCreateCounterOrder} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Table / Lounge Area</label>
              <select
                value={newOrderForm.tableNumber}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, tableNumber: e.target.value })}
                className="w-full bg-[#0e1117] border border-[#1e232e] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                required
              >
                <option value="">Select Table / Lounge Area</option>
                {tables.length > 0 ? (
                  tables.map((t) => (
                    <option key={t.id} value={t.tableNumber}>
                      {formatStandardTableNumber(t.tableNumber)} ({t.status})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="Table 1">Table 1</option>
                    <option value="Table 2">Table 2</option>
                    <option value="Lounge 1">Lounge 1 (VIP)</option>
                    <option value="Lounge 2">Lounge 2 (Terrace)</option>
                    <option value="Lounge 3">Lounge 3</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Shisha Item</label>
              <select
                value={newOrderForm.selectedItemId}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, selectedItemId: e.target.value })}
                className="w-full bg-[#0e1117] border border-[#1e232e] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
              >
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} - ₹{item.price}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Flavour Blend</label>
                <input
                  type="text"
                  value={newOrderForm.flavor}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, flavor: e.target.value })}
                  placeholder="e.g. Double Apple + Mint"
                  className="w-full bg-[#0e1117] border border-[#1e232e] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Bowl Preference</label>
                <select
                  value={newOrderForm.bowl}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, bowl: e.target.value })}
                  className="w-full bg-[#0e1117] border border-[#1e232e] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="Clay Head">Clay Head</option>
                  <option value="Phunnel Bowl">Phunnel Bowl</option>
                  <option value="Silicone Head">Silicone Head</option>
                  <option value="Vortex Bowl">Vortex Bowl</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Coals</label>
                <select
                  value={newOrderForm.coals}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, coals: e.target.value })}
                  className="w-full bg-[#0e1117] border border-[#1e232e] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                >
                  <option value="Coconut Shell (3 Cubes)">Coconut Shell (3 Cubes)</option>
                  <option value="Quick-Light (2 Discs)">Quick-Light (2 Discs)</option>
                  <option value="4 Cubes (High Heat)">4 Cubes (High Heat)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newOrderForm.quantity}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, quantity: Number(e.target.value) })}
                  className="w-full bg-[#0e1117] border border-[#1e232e] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Preparation Notes</label>
              <textarea
                value={newOrderForm.notes}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, notes: e.target.value })}
                placeholder="Ice in base, extra foil, guest preferences..."
                rows={2}
                className="w-full bg-[#0e1117] border border-[#1e232e] rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setShowNewOrderModal(false)}
                className="text-xs border-[#1e232e] bg-[#141822] text-slate-300"
              >
                Cancel
              </Button>
              <Button
                variant="brand"
                size="sm"
                type="submit"
                disabled={newOrderForm.isSubmitting}
                className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
              >
                {newOrderForm.isSubmitting ? 'Dispatching...' : 'Dispatch to Queue'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
