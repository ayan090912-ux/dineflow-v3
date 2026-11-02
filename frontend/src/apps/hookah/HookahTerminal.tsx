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
  Bell,
  XCircle,
  Loader2,
  ChevronRight,
  Zap,
} from 'lucide-react';
import {
  Button,
  Badge,
  SearchInput,
  Modal,
  DinelyLogo,
} from '../../packages/ui';
import { api } from '../../packages/api/client';
import { normalizeOrder } from '../../packages/api/core/helpers';
import { Order, OrderItem, MenuItem, Table, getFulfillmentStation } from '../../packages/types';
import { realtimeBus, ConnectionStatusType } from '../../packages/api/realtime';
import { formatStandardTableNumber } from '../../packages/utils/tableUtils';

// ─── Web Audio Chime ────────────────────────────────────────────────────────
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

// ─── Helpers ────────────────────────────────────────────────────────────────
const formatElapsed = (timestamp?: string) => {
  if (!timestamp) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  if (m === 0) return `${s}s ago`;
  if (m < 60) return `${m}m ${s}s ago`;
  return `${Math.floor(m / 60)}h ${m % 60}m ago`;
};

type TabKey = 'all' | 'pending' | 'preparing' | 'ready' | 'history' | 'cancelled';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  PENDING:   { label: 'New',      color: 'text-orange-300',  bg: 'bg-orange-500/15',  border: 'border-orange-400/40', dot: 'bg-orange-400' },
  ACCEPTED:  { label: 'Accepted', color: 'text-amber-300',   bg: 'bg-amber-500/15',   border: 'border-amber-400/40',  dot: 'bg-amber-400'  },
  PREPARING: { label: 'Preparing',color: 'text-amber-300',   bg: 'bg-amber-500/20',   border: 'border-amber-400/50',  dot: 'bg-amber-400'  },
  READY:     { label: 'Ready',    color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-400/40',dot: 'bg-emerald-400'},
  COMPLETED: { label: 'Completed',color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-600/30',  dot: 'bg-slate-500'  },
  CANCELLED: { label: 'Cancelled',color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',   dot: 'bg-rose-500'   },
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface HookahTerminalProps {
  restaurant?: any;
  onLogout?: () => void;
  isEmbedded?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────
export const HookahTerminal: React.FC<HookahTerminalProps> = ({ restaurant, onLogout, isEmbedded = false }) => {
  const restaurantName = restaurant?.name || 'Hookah Lounge';

  // ── State ─────────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<Order[]>([]);
  const [completedHistory, setCompletedHistory] = useState<
    Array<{ id: string; title: string; time: string; details: string }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [currentTime, setCurrentTime] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string; type: 'info' | 'success' | 'warning' } | null>(null);
  const [isErrorState, setIsErrorState] = useState(false);
  const [wsStatus, setWsStatus] = useState<ConnectionStatusType>(realtimeBus.getStatus());
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  // Counter dispatch modal
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

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isAudioMutedRef = useRef(false);
  const notifiedOrderIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);
  const isFetchingRef = useRef(false);

  useEffect(() => { isAudioMutedRef.current = isAudioMuted; }, [isAudioMuted]);

  // Live clock
  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Elapsed time ticker
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-clear toast
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const currentRestId = restaurant?.id || api.getCurrentRestaurantId() || '';
    if (currentRestId) {
      if (!api.getCurrentRestaurantId()) api.setCurrentRestaurantId(currentRestId);
      realtimeBus.connect(currentRestId, 'HOOKAH');
    }

    const unsubStatus = realtimeBus.subscribeStatus((status) => setWsStatus(status));

    const unsubscribe = realtimeBus.subscribe((event: any) => {
      if (!event) return;
      const relevantEvents = [
        'order_created', 'OrderCreated', 'order_status_updated', 'OrderStatusUpdated',
        'order_ready', 'OrderReady', 'HookahStatusUpdated', 'order_collected',
        'OrderCollected', 'order_delivered', 'OrderDelivered',
      ];
      const isFulfillment = event.type === 'FulfillmentTicketUpdated' && event.station === 'HOOKAH';
      if (!relevantEvents.includes(event.type) && !isFulfillment) return;

      const rawPayload = event.payload || event.data || (event as any).order || (event.items ? event : null);
      if (rawPayload?.id) {
        const norm = normalizeOrder(rawPayload);
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === norm.id);
          if (exists) return prev.map((o) => (o.id === norm.id ? { ...o, ...norm } : o));
          if (isHookahOrder(norm)) {
            if (hasInitializedRef.current && !isAudioMutedRef.current && !notifiedOrderIdsRef.current.has(norm.id)) {
              playNotificationChime();
              notifiedOrderIdsRef.current.add(norm.id);
            }
            return [norm, ...prev];
          }
          return prev;
        });
      } else {
        loadData(false);
      }
    });

    return () => { unsubStatus(); unsubscribe(); };
  }, [restaurant?.id]);

  // Adaptive polling
  useEffect(() => {
    loadData(true);
    loadAuxiliaryData();
    const pollMs = wsStatus === 'CONNECTED' ? 30000 : 8000;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadData(false);
    }, pollMs);
    return () => clearInterval(interval);
  }, [restaurant?.id, wsStatus]);

  // ── Data Loaders ─────────────────────────────────────────────────────────
  const loadAuxiliaryData = async () => {
    try {
      const restId = api.getCurrentRestaurantId() || restaurant?.id || undefined;
      const [menuRes, tablesRes] = await Promise.allSettled([api.getMenuItems(restId), api.getTables(restId)]);
      if (menuRes.status === 'fulfilled' && Array.isArray(menuRes.value)) {
        const hookahItems = menuRes.value.filter(
          (i: MenuItem) =>
            i.targetDestination === 'HOOKAH' || getFulfillmentStation(i) === 'HOOKAH' ||
            i.name.toLowerCase().includes('hookah') || i.name.toLowerCase().includes('shisha')
        );
        setMenuItems(hookahItems.length > 0 ? hookahItems : menuRes.value);
        if (hookahItems.length > 0 && !newOrderForm.selectedItemId)
          setNewOrderForm((p) => ({ ...p, selectedItemId: hookahItems[0].id }));
      }
      if (tablesRes.status === 'fulfilled' && Array.isArray(tablesRes.value)) {
        setTables(tablesRes.value);
        if (tablesRes.value.length > 0 && !newOrderForm.tableNumber)
          setNewOrderForm((p) => ({ ...p, tableNumber: tablesRes.value[0].tableNumber }));
      }
    } catch (err) {
      console.warn('Failed to load auxiliary data:', err);
    }
  };

  const loadData = async (isManual = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (isManual) setIsLoading(true);
    try {
      const restId = api.getCurrentRestaurantId() || restaurant?.id || undefined;
      const isNotWedding = (restaurant as any)?.businessType !== 'WEDDING_ORDERING';
      const allOrders = await api.getOrders(restId, { station: 'HOOKAH', activeOnly: true, excludeEvents: isNotWedding });
      setIsErrorState(false);
      if (Array.isArray(allOrders)) {
        if (hasInitializedRef.current && !isAudioMutedRef.current) {
          const hasNew = allOrders.some(
            (o) => (o.hookahStatus === 'PENDING' || (!o.hookahStatus && o.status === 'PENDING')) &&
              !notifiedOrderIdsRef.current.has(o.id)
          );
          if (hasNew) playNotificationChime();
        }
        allOrders.forEach((o) => notifiedOrderIdsRef.current.add(o.id));
        hasInitializedRef.current = true;
        setOrders(allOrders);
      }
    } catch (err) {
      console.error('Failed to load hookah orders:', err);
      setIsErrorState(true);
    } finally {
      isFetchingRef.current = false;
      if (isManual) setIsLoading(false);
    }
  };

  // ── Order Helpers ─────────────────────────────────────────────────────────
  const isHookahOrder = (order: Order) => {
    if (order.hookahStatus && ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(order.hookahStatus)) return true;
    return (order.items || []).some(
      (item) =>
        item.targetDestination === 'HOOKAH' || getFulfillmentStation(item) === 'HOOKAH' ||
        item.name.toLowerCase().includes('hookah') || item.name.toLowerCase().includes('shisha') ||
        (item.selectedOptions && typeof item.selectedOptions === 'object' &&
          Object.keys(item.selectedOptions).some((k) => ['flavor', 'flavour', 'coal', 'coals', 'bowl'].includes(k.toLowerCase())))
    );
  };

  const getHookahItems = (order: Order) => {
    const list = (order.items || []).filter(
      (item) =>
        item.targetDestination === 'HOOKAH' || getFulfillmentStation(item) === 'HOOKAH' ||
        item.name.toLowerCase().includes('hookah') || item.name.toLowerCase().includes('shisha') ||
        (item.selectedOptions && typeof item.selectedOptions === 'object' &&
          Object.keys(item.selectedOptions).some((k) => ['flavor', 'flavour', 'coal', 'coals', 'bowl'].includes(k.toLowerCase())))
    );
    return list.length > 0 ? list : order.items || [];
  };

  // ── Derived Order Buckets ─────────────────────────────────────────────────
  const relevantOrders = useMemo(() => orders.filter(isHookahOrder), [orders]);

  const filterBySearch = (list: Order[]) => {
    if (!searchQuery) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (o) =>
        o.tableNumber?.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (o.items || []).some((i) => i.name.toLowerCase().includes(q))
    );
  };

  const pendingOrders   = useMemo(() => filterBySearch(relevantOrders.filter((o) => (o.hookahStatus || 'PENDING') === 'PENDING' && o.status !== 'CANCELLED')), [relevantOrders, searchQuery]);
  const preparingOrders = useMemo(() => filterBySearch(relevantOrders.filter((o) => ['ACCEPTED', 'PREPARING'].includes(o.hookahStatus || '') && o.status !== 'CANCELLED')), [relevantOrders, searchQuery]);
  const readyOrders     = useMemo(() => filterBySearch(relevantOrders.filter((o) => o.hookahStatus === 'READY' && o.status !== 'CANCELLED')), [relevantOrders, searchQuery]);
  const cancelledOrders = useMemo(() => filterBySearch(relevantOrders.filter((o) => o.status === 'CANCELLED')), [relevantOrders, searchQuery]);
  const allActiveOrders = useMemo(() => [...pendingOrders, ...preparingOrders, ...readyOrders], [pendingOrders, preparingOrders, readyOrders]);

  const tabCounts: Record<TabKey, number> = {
    all:       allActiveOrders.length,
    pending:   pendingOrders.length,
    preparing: preparingOrders.length,
    ready:     readyOrders.length,
    history:   completedHistory.length,
    cancelled: cancelledOrders.length,
  };

  const displayedOrders = useMemo(() => {
    if (activeTab === 'all')       return allActiveOrders;
    if (activeTab === 'pending')   return pendingOrders;
    if (activeTab === 'preparing') return preparingOrders;
    if (activeTab === 'ready')     return readyOrders;
    if (activeTab === 'cancelled') return cancelledOrders;
    return [];
  }, [activeTab, allActiveOrders, pendingOrders, preparingOrders, readyOrders, cancelledOrders]);

  // ── State Transitions ─────────────────────────────────────────────────────
  const handleStartPreparing = async (orderId: string) => {
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((p) => new Set(p).add(orderId));
    try {
      setOrders((p) => p.map((o) => (o.id === orderId ? { ...o, hookahStatus: 'PREPARING' } : o)));
      await api.updateFulfillmentTicketStatus(orderId, 'PREPARING', 'HOOKAH');
      await api.updateHookahStatus(orderId, 'PREPARING');
      setToastMessage({ title: 'Preparation Started', desc: `Order #${orderId.slice(-4)} is now being prepared.`, type: 'info' });
      loadData(false);
    } catch (err: any) {
      setToastMessage({ title: 'Update Failed', desc: err.message || 'Could not update order status.', type: 'warning' });
      loadData(false);
    } finally {
      setProcessingOrderIds((p) => { const n = new Set(p); n.delete(orderId); return n; });
    }
  };

  const handleMarkReady = async (order: Order) => {
    const orderId = order.id;
    if (processingOrderIds.has(orderId)) return;
    setProcessingOrderIds((p) => new Set(p).add(orderId));
    try {
      setOrders((p) => p.map((o) => (o.id === orderId ? { ...o, hookahStatus: 'READY' } : o)));
      await api.updateFulfillmentTicketStatus(orderId, 'READY', 'HOOKAH');
      await api.updateHookahStatus(orderId, 'READY');
      await api.requestWaiter(orderId, 'HOOKAH');
      setCompletedHistory((p) => [
        {
          id: `${order.id}-${Date.now()}`,
          title: `Order #${order.id.slice(-4)} (${order.tableNumber || 'Lounge'}) → Sent to Waiter`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          details: getHookahItems(order).map((i) => `${i.quantity}x ${i.name}`).join(', '),
        },
        ...p.slice(0, 19),
      ]);
      setToastMessage({ title: 'Dispatched to Waiter', desc: `Order #${orderId.slice(-4)} marked READY.`, type: 'success' });
      loadData(false);
    } catch (err: any) {
      setToastMessage({ title: 'Action Failed', desc: err.message || 'Could not send order to waiter.', type: 'warning' });
      loadData(false);
    } finally {
      setProcessingOrderIds((p) => { const n = new Set(p); n.delete(orderId); return n; });
    }
  };

  const handleCreateCounterOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderForm.tableNumber) {
      setToastMessage({ title: 'Missing Table', desc: 'Please select a table or lounge destination.', type: 'warning' });
      return;
    }
    const selectedItem = menuItems.find((i) => i.id === newOrderForm.selectedItemId) || menuItems[0];
    const itemName = selectedItem ? selectedItem.name : 'Custom Shisha Pipe';
    const itemPrice = selectedItem ? selectedItem.price : 450;
    setNewOrderForm((p) => ({ ...p, isSubmitting: true }));
    try {
      const payload: any = {
        tableNumber: newOrderForm.tableNumber,
        items: [{
          id: `item-${Date.now()}`,
          menuItemId: selectedItem?.id || 'hookah-pipe-counter',
          name: `${itemName} - ${newOrderForm.flavor}`,
          quantity: Number(newOrderForm.quantity) || 1,
          price: itemPrice,
          targetDestination: 'HOOKAH',
          selectedOptions: { flavor: newOrderForm.flavor, bowl: newOrderForm.bowl, coals: newOrderForm.coals } as any,
          notes: newOrderForm.notes,
        }],
        notes: `[HOOKAH COUNTER DISPATCH] Bowl: ${newOrderForm.bowl} | Coals: ${newOrderForm.coals} | ${newOrderForm.notes}`.trim(),
        paymentMethod: 'CASH',
        source: 'COUNTER',
      };
      const res = await api.createOrder(payload);
      setShowNewOrderModal(false);
      setToastMessage({ title: 'Order Dispatched', desc: `Order #${(res?.id || 'NEW').slice(-4)} created for ${newOrderForm.tableNumber}.`, type: 'success' });
      playNotificationChime();
      loadData(true);
    } catch (err: any) {
      setToastMessage({ title: 'Dispatch Failed', desc: err.message || 'Failed to dispatch hookah order.', type: 'warning' });
    } finally {
      setNewOrderForm((p) => ({ ...p, isSubmitting: false }));
    }
  };

  // ── Sub-Components ────────────────────────────────────────────────────────
  const WsStatusBadge = () => {
    if (wsStatus === 'CONNECTED') return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        Live Feed Connected
      </span>
    );
    if (wsStatus === 'RECONNECTING') return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-semibold">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        Reconnecting...
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-semibold">
        <span className="w-2 h-2 rounded-full bg-rose-500" />
        Offline
      </span>
    );
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['PENDING'];
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    );
  };

  const TABS: { key: TabKey; label: string; icon?: React.ReactNode }[] = [
    { key: 'all',       label: 'All Active Queue' },
    { key: 'pending',   label: 'New Orders' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'ready',     label: 'Ready' },
    { key: 'history',   label: 'Completed / Recent' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const OrderCard = ({ order }: { order: Order }) => {
    const hookahItems = getHookahItems(order);
    const isProcessing = processingOrderIds.has(order.id);
    const formattedTable = formatStandardTableNumber(order.tableNumber);
    const status = order.hookahStatus || 'PENDING';
    const isPending   = status === 'PENDING';
    const isPreparing = ['ACCEPTED', 'PREPARING'].includes(status);
    const isReady     = status === 'READY';

    return (
      <div
        className={`rounded-2xl border transition-all duration-300 overflow-hidden ${
          isPreparing
            ? 'border-amber-400/50 shadow-[0_0_28px_rgba(245,158,11,0.18)]'
            : isReady
            ? 'border-emerald-400/40 shadow-[0_0_28px_rgba(16,185,129,0.15)]'
            : isPending
            ? 'border-orange-400/30 shadow-[0_0_18px_rgba(251,146,60,0.1)]'
            : 'border-white/10'
        } bg-[#111418]`}
      >
        {/* Card top accent bar */}
        <div className={`h-[3px] w-full ${isPreparing ? 'bg-gradient-to-r from-amber-500 to-orange-500' : isReady ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : isPending ? 'bg-gradient-to-r from-orange-500 to-amber-500' : 'bg-white/10'}`} />

        <div className="p-4 space-y-3.5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-white/8 border border-white/15 text-white text-xs font-mono font-bold">
                {formattedTable}
              </span>
              <span className="text-[11px] font-mono text-white/40">#{order.id.slice(-4)}</span>
              <StatusBadge status={status} />
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-white/40 shrink-0">
              <Clock className="w-3 h-3" />
              <span>{formatElapsed(order.createdAt)}</span>
            </div>
          </div>

          {/* Hookah items */}
          <div className="space-y-2 pt-0.5">
            {hookahItems.map((item: OrderItem, idx: number) => {
              const opts: any = item.selectedOptions || {};
              const flavor = opts.flavor || opts.flavour || item.notes || 'Standard Mix';
              const bowl   = opts.bowl   || 'Clay Head';
              const coals  = opts.coals  || opts.coal  || 'Coconut Shell';

              return (
                <div key={idx} className="bg-white/[0.035] rounded-xl border border-white/8 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <span className="w-5 h-5 rounded-md bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[10px] font-mono flex items-center justify-center shrink-0">
                      {item.quantity}
                    </span>
                    <span>{item.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/12 border border-amber-400/25 text-amber-200 text-[10px] font-mono">
                      <Wind className="w-3 h-3 text-amber-300/80" />{flavor}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white/8 border border-white/12 text-white/60 text-[10px] font-mono">{bowl}</span>
                    <span className="px-2 py-0.5 rounded-md bg-white/8 border border-white/12 text-white/60 text-[10px] font-mono">🔥 {coals}</span>
                  </div>
                </div>
              );
            })}

            {order.notes && (
              <p className="text-[11px] italic text-amber-200/70 bg-amber-500/8 px-3 py-2 rounded-lg border border-amber-400/15">
                📝 {order.notes}
              </p>
            )}
          </div>

          {/* Action buttons */}
          {!isReady && (
            <div className="pt-1">
              {isPending && (
                <button
                  onClick={() => handleStartPreparing(order.id)}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs font-mono transition-all active:scale-[0.98] shadow-[0_4px_18px_rgba(245,158,11,0.4)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  {isProcessing ? 'Starting...' : 'START PREPARING'}
                </button>
              )}
              {isPreparing && (
                <button
                  onClick={() => handleMarkReady(order)}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs font-mono transition-all active:scale-[0.98] shadow-[0_4px_18px_rgba(16,185,129,0.4)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {isProcessing ? 'Sending...' : 'READY — SEND TO WAITER'}
                </button>
              )}
            </div>
          )}

          {isReady && (
            <div className="bg-emerald-500/8 border border-emerald-400/20 rounded-xl px-3 py-2 flex items-center justify-between text-[11px]">
              <span className="text-white/50">Handover:</span>
              <span className="text-emerald-400 font-mono font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {(order as any).claimedBy ? `Collected by ${(order as any).claimedBy}` : 'Awaiting Floor Runner'}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const EmptyState = ({ tab }: { tab: TabKey }) => {
    const msgs: Record<TabKey, { icon: React.ReactNode; title: string; sub: string }> = {
      all:       { icon: <Bell className="w-8 h-8 text-amber-400/60" />,     title: 'No Active Orders in Queue',          sub: 'New hookah orders will appear here instantly via live feed.' },
      pending:   { icon: <Flame className="w-8 h-8 text-orange-400/60" />,   title: 'No New Orders Waiting',              sub: 'Fresh orders from guests will appear here.' },
      preparing: { icon: <Activity className="w-8 h-8 text-amber-400/60" />, title: 'Nothing in Preparation',             sub: 'Orders you start will show up here.' },
      ready:     { icon: <CheckCircle2 className="w-8 h-8 text-emerald-400/60" />, title: 'No Pipes Ready for Delivery',  sub: 'Completed pipes waiting for waiter pickup appear here.' },
      history:   { icon: <CheckSquare className="w-8 h-8 text-slate-500" />, title: 'No Shift History Yet',               sub: 'Completed dispatches will be logged here.' },
      cancelled: { icon: <XCircle className="w-8 h-8 text-rose-500/50" />,   title: 'No Cancelled Orders',                sub: 'Cancelled orders in this session will appear here.' },
    };
    const m = msgs[tab];
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/8 flex items-center justify-center">
          {m.icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">{m.title}</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs">{m.sub}</p>
        </div>
        {tab === 'all' && (
          <button
            onClick={() => setShowNewOrderModal(true)}
            className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all active:scale-95 shadow-[0_4px_18px_rgba(245,158,11,0.4)]"
          >
            <Plus className="w-3.5 h-3.5" />
            Dispatch Counter Order
          </button>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-100 flex flex-col font-sans antialiased selection:bg-amber-500/30">

      {/* Ambient background glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-32 left-1/3 w-[600px] h-[600px] rounded-full blur-[140px] bg-amber-700/8 opacity-80" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full blur-[120px] bg-emerald-900/10 opacity-60" />
      </div>

      {/* ── Toast ── */}
      {toastMessage && !isEmbedded && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className={`flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-2xl border text-xs font-medium backdrop-blur-xl bg-[#111418]/95 ${
            toastMessage.type === 'success' ? 'border-emerald-500/30' :
            toastMessage.type === 'warning' ? 'border-amber-500/30' : 'border-white/15'
          }`}>
            {toastMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> :
             toastMessage.type === 'warning' ? <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" /> :
             <Zap className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />}
            <div>
              <p className="font-bold text-white">{toastMessage.title}</p>
              <p className="text-white/50 text-[11px] mt-0.5">{toastMessage.desc}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      {!isEmbedded && (
        <header className="sticky top-0 z-40 bg-[#0D0F12]/90 backdrop-blur-2xl border-b border-white/[0.08] px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shadow-2xl">
          {/* Left: Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/12 border border-amber-400/25 flex items-center justify-center shrink-0 shadow-[0_0_16px_rgba(245,158,11,0.2)]">
              <Flame className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DinelyLogo size="sm" />
                <h1 className="text-sm font-bold text-white tracking-tight truncate">{restaurantName}</h1>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-[10px] font-mono font-bold">
                  HOOKAH TERMINAL
                </span>
              </div>
              <p className="text-[11px] text-white/35 mt-0.5 hidden sm:block">
                Shisha pipe requests, live coal servicing & flavour preparation
              </p>
            </div>
          </div>

          {/* Right: Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <WsStatusBadge />

            {/* Clock */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-xs font-mono text-slate-300">
              <Clock className="w-3.5 h-3.5 text-amber-400/70" />
              {currentTime || '--:--'}
            </div>

            {/* Sound */}
            <button
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              title={isAudioMuted ? 'Enable chime' : 'Mute chime'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                isAudioMuted
                  ? 'bg-white/[0.05] border-white/10 text-slate-400'
                  : 'bg-white/[0.07] border-amber-400/20 text-amber-300'
              }`}
            >
              {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isAudioMuted ? 'Sound OFF' : 'Sound ON'}</span>
            </button>

            {/* Refresh */}
            <button
              onClick={() => loadData(true)}
              disabled={isLoading}
              className="p-2 rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* New Order */}
            <button
              onClick={() => setShowNewOrderModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all active:scale-95 shadow-[0_4px_14px_rgba(245,158,11,0.4)]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Pipe Order</span>
            </button>

            {/* Logout */}
            <button
              onClick={async () => { await api.logout(); if (onLogout) onLogout(); else window.location.href = '/staff/login'; }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold transition-all active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </header>
      )}

      {/* Embedded controls row */}
      {isEmbedded && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/[0.07] bg-white/[0.02]">
          <WsStatusBadge />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              className="p-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-slate-400 hover:text-white transition-all active:scale-95"
            >
              {isAudioMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
            </button>
            <button
              onClick={() => loadData(true)}
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-slate-400 hover:text-white transition-all active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowNewOrderModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/25 text-amber-300 text-xs font-semibold transition-all active:scale-95"
            >
              <Plus className="w-3 h-3" />New
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {isErrorState && (
        <div className="bg-rose-950/80 backdrop-blur-md border-b border-rose-900/60 px-4 py-2 text-xs text-rose-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Unable to sync orders with server. Retrying automatically.</span>
          </div>
          <button
            onClick={() => loadData(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-700/50 hover:bg-rose-900/40 transition-all text-rose-300"
          >
            <RefreshCw className="w-3 h-3" />Retry
          </button>
        </div>
      )}

      {/* ── MAIN ── */}
      <main className={`flex-1 overflow-y-auto relative z-10 flex flex-col ${isEmbedded ? 'p-0' : 'p-4 sm:p-5 lg:p-6'} gap-4`}>

        {/* Tabs */}
        <div className="bg-[#0D0F12]/80 backdrop-blur-xl border border-white/[0.07] rounded-2xl p-1.5 flex items-center gap-1 overflow-x-auto shadow-xl">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            const count = tabCounts[tab.key];
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 active:scale-[0.97] shrink-0 ${
                  active
                    ? 'bg-amber-500 text-slate-950 shadow-[0_4px_14px_rgba(245,158,11,0.45)]'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <span>{tab.label}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                    active ? 'bg-slate-950/30 text-slate-950' : 'bg-white/10 text-slate-300'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <div className="flex-1 ml-2">
            <SearchInput
              value={searchQuery}
              onChange={(val) => setSearchQuery(typeof val === 'string' ? val : (val as any).target.value)}
              placeholder="Search table, ticket, flavour..."
              className="w-full text-xs"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          {isLoading && orders.length === 0 ? (
            /* Initial loading skeleton */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded-2xl border border-white/[0.07] bg-[#111418] overflow-hidden animate-pulse">
                  <div className="h-[3px] bg-white/10" />
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-20 rounded-lg bg-white/10" />
                      <div className="h-5 w-14 rounded-md bg-white/8" />
                    </div>
                    <div className="h-16 rounded-xl bg-white/[0.04] border border-white/8" />
                    <div className="h-10 rounded-xl bg-white/8" />
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'history' ? (
            /* History log */
            <div className="bg-[#0D0F12]/80 border border-white/[0.07] rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07]">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">Session Shift History</h2>
                  <span className="px-2 py-0.5 rounded-full bg-white/8 border border-white/10 text-slate-400 text-[10px] font-mono">
                    {completedHistory.length} dispatched
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab('all')}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Back to Live Queue <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              {completedHistory.length === 0 ? (
                <EmptyState tab="history" />
              ) : (
                <div className="divide-y divide-white/[0.05]">
                  {completedHistory.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{item.title}</p>
                          <p className="text-[11px] text-slate-500 truncate">{item.details}</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : displayedOrders.length === 0 ? (
            <EmptyState tab={activeTab} />
          ) : (
            /* Order cards grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayedOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* ── Modal: Counter Dispatch ── */}
      {showNewOrderModal && (
        <Modal isOpen={showNewOrderModal} onClose={() => setShowNewOrderModal(false)} title="Dispatch New Hookah Pipe" size="md">
          <form onSubmit={handleCreateCounterOrder} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Table / Lounge Area</label>
              <select
                value={newOrderForm.tableNumber}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, tableNumber: e.target.value })}
                className="w-full bg-[#0e1117] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500/60 transition-colors"
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
              <label className="block text-slate-300 font-medium mb-1.5">Shisha Item</label>
              <select
                value={newOrderForm.selectedItemId}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, selectedItemId: e.target.value })}
                className="w-full bg-[#0e1117] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500/60 transition-colors"
              >
                {menuItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} — ₹{item.price}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Flavour Blend</label>
                <input
                  type="text"
                  value={newOrderForm.flavor}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, flavor: e.target.value })}
                  placeholder="e.g. Double Apple + Mint"
                  className="w-full bg-[#0e1117] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500/60 transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Bowl Preference</label>
                <select
                  value={newOrderForm.bowl}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, bowl: e.target.value })}
                  className="w-full bg-[#0e1117] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500/60 transition-colors"
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
                <label className="block text-slate-300 font-medium mb-1.5">Coals</label>
                <select
                  value={newOrderForm.coals}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, coals: e.target.value })}
                  className="w-full bg-[#0e1117] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500/60 transition-colors"
                >
                  <option value="Coconut Shell (3 Cubes)">Coconut Shell (3 Cubes)</option>
                  <option value="Quick-Light (2 Discs)">Quick-Light (2 Discs)</option>
                  <option value="4 Cubes (High Heat)">4 Cubes (High Heat)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newOrderForm.quantity}
                  onChange={(e) => setNewOrderForm({ ...newOrderForm, quantity: Number(e.target.value) })}
                  className="w-full bg-[#0e1117] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500/60 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">Preparation Notes</label>
              <textarea
                value={newOrderForm.notes}
                onChange={(e) => setNewOrderForm({ ...newOrderForm, notes: e.target.value })}
                placeholder="Ice in base, extra foil, guest preferences..."
                rows={2}
                className="w-full bg-[#0e1117] border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-amber-500/60 transition-colors resize-none"
              />
            </div>

            <div className="pt-1 flex justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setShowNewOrderModal(false)}
                className="text-xs border-white/10 bg-white/[0.04] text-slate-300 hover:text-white rounded-xl"
              >
                Cancel
              </Button>
              <button
                type="submit"
                disabled={newOrderForm.isSubmitting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_14px_rgba(245,158,11,0.4)]"
              >
                {newOrderForm.isSubmitting ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />Dispatching...</>
                ) : (
                  <><Zap className="w-3.5 h-3.5" />Dispatch to Queue</>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
