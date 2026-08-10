import React, { useState, useEffect, useMemo } from 'react';
import {
  Flame,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Pause,
  Play,
  Plus,
  Minus,
  ChefHat,
  Bell,
  BarChart2,
  TrendingUp,
  History,
  X,
  Users,
  UtensilsCrossed,
  ShieldCheck,
  Volume2,
  VolumeX,
  Search,
  RefreshCw,
  RotateCcw,
  Send,
  Layers,
  MessageSquare,
  CheckSquare,
  Zap,
  Coffee,
  HelpCircle,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { Button, Card, Badge, Modal, Input, SearchInput, StatsCard, Avatar } from '../../packages/ui';
import { Order, OrderItem, getFulfillmentStation } from '../../packages/types';
import { api } from '../../packages/api/client';
import { realtimeBus, RealTimeEventPayload } from '../../packages/api/realtime';

// Web Audio API Synthesizer for Kitchen Chimes & Overdue Alerts
const playKitchenChime = (type: 'NEW_ORDER' | 'OVERDUE' | 'BUMP') => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'NEW_ORDER') {
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain1.gain.setValueAtTime(0.2, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.3);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.45);
    } else if (type === 'OVERDUE') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'BUMP') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (err) {
    // Audio context play blocked
  }
};

interface KitchenETADashboardProps {
  orders: Order[];
  onRefreshOrders: () => void;
  activeRole?: 'KITCHEN' | 'WAITER' | 'OWNER';
  onLogout?: () => void;
}

export const KitchenETADashboard: React.FC<KitchenETADashboardProps> = ({
  orders: initialOrders,
  onRefreshOrders,
  activeRole = 'KITCHEN',
  onLogout,
}) => {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [viewMode, setViewMode] = useState<'KDS' | 'WAITER' | 'COMPLETED' | 'ANALYTICS'>(
    activeRole === 'WAITER' ? 'WAITER' : activeRole === 'OWNER' ? 'ANALYTICS' : 'KDS'
  );

  // Sound preference
  const [isMuted, setIsMuted] = useState(false);

  // Live Clock Time State
  const [currentTime, setCurrentTime] = useState<string>('');

  // Search Filter State
  const [searchQuery, setSearchQuery] = useState('');

  // Item Prep Checkboxes State (itemId -> boolean)
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Modals State
  const [selectedOrderToAccept, setSelectedOrderToAccept] = useState<Order | null>(null);
  const [chosenPrepTime, setChosenPrepTime] = useState<number>(15);
  const [customPrepInput, setCustomPrepInput] = useState<string>('15');
  const [smartEtaData, setSmartEtaData] = useState<{
    recommendedMinutes: number;
    kitchenLoadFactor: string;
    reasons: string[];
  } | null>(null);

  const [selectedOrderForEta, setSelectedOrderForEta] = useState<Order | null>(null);
  const [customEtaInput, setCustomEtaInput] = useState<string>('20');
  const [etaChangeReason, setEtaChangeReason] = useState<string>('');

  const [historyOrder, setHistoryOrder] = useState<Order | null>(null);
  const [isDelayModalOpen, setIsDelayModalOpen] = useState(false);
  const [delayMessage, setDelayMessage] = useState('');

  const [isRecallModalOpen, setIsRecallModalOpen] = useState(false);
  const [bumpedHistory, setBumpedHistory] = useState<Order[]>([]);

  // Toast Feedback
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' | 'warning' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Analytics State
  const [analytics, setAnalytics] = useState<any>(null);

  // Sync initial prop orders
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  // Clock tick & time updates
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Timer Tick State to force re-render every second for live timers
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load analytics when on analytics view
  useEffect(() => {
    if (viewMode === 'ANALYTICS') {
      const restId = api.getCurrentRestaurantId() || undefined;
      api.getKitchenAnalytics(restId).then(setAnalytics);
    }
  }, [viewMode]);

  // Subscribe to Realtime Bus Events (Scoped by restaurant_id)
  useEffect(() => {
    const unsubscribe = realtimeBus.subscribe((event: RealTimeEventPayload) => {
      const currentRestId = api.getCurrentRestaurantId();
      if (event.restaurantId && currentRestId && event.restaurantId !== currentRestId) {
        return;
      }
      if ((event as any).type === 'FulfillmentTicketUpdated' && (event as any).station === 'BAR') {
        return; // Ignore Bar-only ticket updates in Kitchen KDS
      }
      onRefreshOrders();
      if (!isMuted && (event.type === 'OrderCreated' || event.type === 'WaiterCalled')) {
        playKitchenChime('NEW_ORDER');
      }
      if (event.type === 'TableMerged') {
        showToast(`🔗 Large Gathering Table Merge: ${event.data?.mergedGroupLabel || 'Tables Combined'}`, 'info');
      }
    });
    return () => unsubscribe();
  }, [onRefreshOrders, isMuted]);

  // Handlers
  const handleOpenAcceptModal = async (order: Order) => {
    setSelectedOrderToAccept(order);
    const rec = await api.getSmartETARecommendation(order.id);
    setSmartEtaData(rec);
    setChosenPrepTime(rec.recommendedMinutes);
    setCustomPrepInput(String(rec.recommendedMinutes));
  };

  const handleConfirmAcceptOrder = async () => {
    if (!selectedOrderToAccept) return;
    const finalMins = parseInt(customPrepInput, 10) || chosenPrepTime || 15;
    await api.updateFulfillmentTicketStatus(selectedOrderToAccept.id, 'PREPARING', 'KITCHEN');
    await api.updateKitchenStatus(selectedOrderToAccept.id, 'PREPARING');
    await api.acceptOrder(selectedOrderToAccept.id, finalMins);
    if (!isMuted) playKitchenChime('BUMP');
    showToast(`Order #${selectedOrderToAccept.id} Kitchen Ticket Accepted! Timer set to ${finalMins} mins.`, 'success');
    setSelectedOrderToAccept(null);
    onRefreshOrders();
  };

  const handleEtaDelta = async (orderId: string, delta: number) => {
    await api.updateOrderETA(orderId, delta, undefined, `Adjusted by ${delta > 0 ? '+' : ''}${delta} mins`);
    showToast(`ETA updated by ${delta > 0 ? '+' : ''}${delta} mins for #${orderId}`, 'info');
    onRefreshOrders();
  };

  const handleSaveCustomEta = async () => {
    if (!selectedOrderForEta) return;
    const mins = parseInt(customEtaInput, 10);
    if (isNaN(mins) || mins <= 0) return;
    await api.updateOrderETA(selectedOrderForEta.id, mins, etaChangeReason || 'Manual custom ETA set by Chef');
    showToast(`ETA set to ${mins} mins for Order #${selectedOrderForEta.id}`, 'success');
    setSelectedOrderForEta(null);
    setEtaChangeReason('');
    onRefreshOrders();
  };

  const handleToggleTimer = async (orderId: string) => {
    await api.toggleOrderTimer(orderId);
    onRefreshOrders();
  };

  const handleMarkReady = async (order: Order) => {
    await api.updateFulfillmentTicketStatus(order.id, 'READY', 'KITCHEN');
    await api.updateKitchenStatus(order.id, 'READY');
    setBumpedHistory((prev) => [order, ...prev.slice(0, 19)]);
    if (!isMuted) playKitchenChime('BUMP');
    showToast(`Order #${order.id} Kitchen Ticket Plated & Ready! ✨`, 'success');
    onRefreshOrders();
  };

  const handleDeliverOrder = async (orderId: string) => {
    await api.deliverOrder(orderId);
    showToast(`Order #${orderId} Delivered to Table. Completed!`, 'success');
    onRefreshOrders();
  };

  const handleRecallOrder = async (order: Order) => {
    await api.updateOrderStatus(order.id, 'IN_KITCHEN');
    setBumpedHistory((prev) => prev.filter((o) => o.id !== order.id));
    showToast(`Order #${order.id} Recalled back to Cooking Grid!`, 'warning');
    setIsRecallModalOpen(false);
    onRefreshOrders();
  };

  const handleBroadcastDelay = () => {
    if (!delayMessage.trim()) return;
    realtimeBus.emit('BroadcastMessage', {
      data: {
        message: delayMessage,
        sender: 'Chef Head Line',
        timestamp: new Date().toISOString(),
      },
    });
    showToast(`Delay alert broadcasted to all Waiter Terminals!`, 'warning');
    setDelayMessage('');
    setIsDelayModalOpen(false);
  };

  const toggleItemCheck = (itemId: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  // Remaining time helper
  const getRemainingTime = (order: Order) => {
    if (!order.etaTargetTimestamp) return { formatted: '--:--', isOverdue: false, secondsLeft: 0, progressPct: 100 };
    const target = new Date(order.etaTargetTimestamp).getTime();
    const now = Date.now();
    const diff = Math.floor((target - now) / 1000);

    if (diff < 0) {
      const overdueSecs = Math.abs(diff);
      const mins = Math.floor(overdueSecs / 60);
      const secs = overdueSecs % 60;
      return {
        formatted: `+${mins}:${secs.toString().padStart(2, '0')} LATE`,
        isOverdue: true,
        secondsLeft: diff,
        progressPct: 100,
      };
    } else {
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      const totalSecs = (order.estimatedPrepTimeMinutes || 15) * 60;
      const elapsedSecs = totalSecs - diff;
      const progressPct = Math.min(100, Math.max(0, (elapsedSecs / totalSecs) * 100));

      return {
        formatted: `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
        isOverdue: false,
        secondsLeft: diff,
        progressPct,
      };
    }
  };

  const getElapsedMinutes = (createdAtStr: string) => {
    const createdMs = new Date(createdAtStr).getTime();
    const nowMs = Date.now();
    return Math.floor((nowMs - createdMs) / 60000);
  };

  // Filtered Orders Logic: ONLY orders containing kitchen items
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const hasKitchenItems = order.items.some((i) => getFulfillmentStation(i) === 'KITCHEN');
      if (!hasKitchenItems) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesId = order.id.toLowerCase().includes(q);
        const matchesTable = order.tableNumber.toLowerCase().includes(q);
        const matchesCustomer = (order.customerName || '').toLowerCase().includes(q);
        const matchesItem = order.items.some((i) => i.name.toLowerCase().includes(q));
        return matchesId || matchesTable || matchesCustomer || matchesItem;
      }
      return true;
    });
  }, [orders, searchQuery]);

  const pendingOrders = filteredOrders.filter(
    (o) => (o.kitchenStatus === 'PENDING' || (!o.kitchenStatus && o.status === 'PENDING')) && o.status !== 'CANCELLED' && o.status !== 'DELIVERED' && o.status !== 'COMPLETED'
  );
  const inKitchenOrders = filteredOrders.filter(
    (o) => o.kitchenStatus === 'PREPARING' || o.kitchenStatus === 'ACCEPTED' || (!o.kitchenStatus && (o.status === 'IN_KITCHEN' || o.status === 'PREPARING' || o.status === 'IN_PREPARATION'))
  );
  const readyOrders = filteredOrders.filter((o) => o.kitchenStatus === 'READY' || (!o.kitchenStatus && o.status === 'READY'));
  const completedOrders = filteredOrders.filter((o) => o.kitchenStatus === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'COMPLETED');

  const overdueCount = orders.filter((o) => (o.kitchenStatus === 'PREPARING' || o.status === 'IN_KITCHEN') && getRemainingTime(o).isOverdue).length;

  return (
    <div className="bg-slate-950 text-slate-100 flex flex-col font-sans relative w-full rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
      {/* Toast Banner */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 p-4 rounded-2xl bg-emerald-500/95 text-slate-950 font-black text-xs shadow-2xl flex items-center gap-2 animate-fadeIn border border-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* TOP COMPACT KITCHEN CONTROL HEADER */}
      <div className="bg-slate-900 border-b border-slate-800 px-5 py-4 space-y-4">
        {/* Row 1: Title, Status Pills, Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 via-amber-500 to-amber-400 flex items-center justify-center font-black text-white text-xl shadow-lg shrink-0">
              <ChefHat className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                  KITCHEN DISPLAY SYSTEM (KDS)
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold uppercase">
                  Station v2.4
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Socket
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Main Hot Line • Chef Marcus Dispatch
              </p>
            </div>
          </div>

          {/* Quick Stats & Controls Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Ticket Counter Pills */}
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-mono font-bold shrink-0">
              <span className="text-amber-400">{pendingOrders.length} New</span>
              <span className="text-slate-700">|</span>
              <span className="text-rose-400">{inKitchenOrders.length} Cooking</span>
              <span className="text-slate-700">|</span>
              <span className="text-emerald-400">{readyOrders.length} Ready</span>
              {overdueCount > 0 && (
                <>
                  <span className="text-slate-700">|</span>
                  <span className="text-rose-400 font-black animate-pulse">
                    ⚠️ {overdueCount} LATE
                  </span>
                </>
              )}
            </div>

            {/* Audio Toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsMuted(!isMuted)}
              className={`border-slate-800 text-xs font-bold ${isMuted ? 'text-slate-500' : 'text-amber-400 hover:bg-amber-500/10'}`}
              icon={isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            >
              {isMuted ? 'Muted' : 'Audio On'}
            </Button>

            {/* Delay Broadcast */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDelayModalOpen(true)}
              className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs font-bold"
              icon={<AlertTriangle className="w-4 h-4" />}
            >
              Delay Alert
            </Button>

            {/* Recall Order */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRecallModalOpen(true)}
              className="border-slate-800 text-slate-300 hover:bg-slate-800 text-xs font-bold"
              icon={<RotateCcw className="w-4 h-4" />}
            >
              Recall ({bumpedHistory.length})
            </Button>

            {/* Real Operational Stats Bar */}
            {(() => {
              const foodOrders = orders.filter((o) =>
                o.items.some((i) => getFulfillmentStation(i) === 'KITCHEN')
              );
              const received = foodOrders.filter((o) => o.kitchenStatus === 'PENDING' || (!o.kitchenStatus && (o.status === 'PENDING' || o.status === 'CONFIRMED'))).length;
              const preparing = foodOrders.filter((o) => o.kitchenStatus === 'PREPARING' || o.kitchenStatus === 'ACCEPTED' || (!o.kitchenStatus && (o.status === 'IN_KITCHEN' || o.status === 'PREPARING' || o.status === 'IN_PREPARATION'))).length;
              const ready = foodOrders.filter((o) => o.kitchenStatus === 'READY' || (!o.kitchenStatus && o.status === 'READY')).length;
              const completed = foodOrders.filter((o) => o.kitchenStatus === 'COMPLETED' || (!o.kitchenStatus && (o.status === 'DELIVERED' || o.status === 'COMPLETED'))).length;

              return (
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                  <span className="font-bold text-slate-300 font-sans flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
                    <Activity className="w-3.5 h-3.5 text-rose-400" /> Today's Kitchen Stats:
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1.5 text-amber-300 bg-amber-950/40 border border-amber-800/50 px-2.5 py-1 rounded-lg">
                      <span>Received:</span> <span className="font-black text-amber-400">{received}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-300 bg-rose-950/40 border border-rose-800/50 px-2.5 py-1 rounded-lg">
                      <span>Preparing:</span> <span className="font-black text-rose-400">{preparing}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-lg">
                      <span>Ready:</span> <span className="font-black text-emerald-400">{ready}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-sky-300 bg-sky-950/40 border border-sky-800/50 px-2.5 py-1 rounded-lg">
                      <span>Completed Today:</span> <span className="font-black text-sky-400">{completed}</span>
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Clock */}
            <div className="font-mono text-xs text-amber-400 font-bold bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 shrink-0">
              {currentTime}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await api.logout();
                if (onLogout) onLogout();
                else window.location.href = '/kitchen/login';
              }}
              className="border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 text-xs font-bold"
            >
              Logout
            </Button>
          </div>
        </div>

        {/* Row 2: View Tabs & Search Filter */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1 border-t border-slate-800/60">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none no-scrollbar pb-1 md:pb-0">
            {[
              { id: 'KDS', label: 'Live Bump Board', icon: <Flame className="w-4 h-4 text-rose-500" /> },
              { id: 'WAITER', label: 'Pass Pickup Window', icon: <Bell className="w-4 h-4 text-amber-400" />, badge: readyOrders.length },
              { id: 'COMPLETED', label: 'Completed Shift Orders', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />, badge: completedOrders.length },
              { id: 'ANALYTICS', label: 'Kitchen Performance', icon: <BarChart2 className="w-4 h-4 text-sky-400" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  viewMode === tab.id
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="w-full md:w-64">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search table #, ticket #, dish..."
              className="w-full text-xs"
            />
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="p-5 overflow-y-auto w-full">
        {/* VIEW 1: LIVE BUMP BOARD */}
        {viewMode === 'KDS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* COLUMN 1: NEW INCOMING ORDERS */}
            <div className="space-y-4">
              <div className="p-3 bg-slate-900 rounded-2xl border border-amber-500/40 flex justify-between items-center shadow-md">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-400 animate-bounce" /> 1. New Incoming Queue ({pendingOrders.length})
                </span>
                <Badge variant="warning">{pendingOrders.length}</Badge>
              </div>

              {pendingOrders.length === 0 ? (
                <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-500 text-xs">
                  <CheckCircle2 className="w-7 h-7 text-emerald-500/40 mx-auto mb-2" />
                  <p className="font-bold text-slate-400">Incoming Queue Clear</p>
                  <p className="text-[11px] text-slate-500 mt-1">No unaccepted tickets waiting.</p>
                </div>
              ) : (
                pendingOrders.map((order) => (
                  <Card
                    key={order.id}
                    className="bg-slate-900 border-2 border-amber-500/50 p-4 space-y-3.5 shadow-xl hover:border-amber-400 transition-all rounded-2xl"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-amber-400 text-xl">#{order.id}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            NEW
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 font-semibold mt-0.5">
                          {order.customerName || 'Walk-in Guest'} • {order.orderType === 'PICKUP' || order.tableNumber === 'COUNTER' ? 'Pickup Order' : 'Dine-in'}
                        </p>
                      </div>
                      <Badge variant={order.orderType === 'PICKUP' || order.tableNumber === 'COUNTER' ? 'warning' : 'brand'} className="px-3 py-1 text-xs font-black">
                        {order.tableNumber && order.tableNumber !== 'COUNTER' ? `📍 Table ${order.tableNumber}` : '🛍️ PICKUP ORDER'}
                      </Badge>
                    </div>

                    <div className="text-xs text-slate-300 flex items-center justify-between bg-slate-950 p-2 rounded-xl border border-slate-800">
                      <span>Submitted: <strong className="text-amber-400">{getElapsedMinutes(order.createdAt)} mins ago</strong></span>
                      <span className="font-mono text-emerald-400 font-bold">${order.totalAmount.toFixed(2)}</span>
                    </div>

                    {/* Dish Items list with check toggles */}
                    <div className="space-y-1.5 border-y border-slate-800/80 py-2.5">
                      {(() => {
                        const kitchenItems = order.items.filter((i) => getFulfillmentStation(i) === 'KITCHEN');
                        return (
                          <>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dish Items ({kitchenItems.length}):</p>
                            {kitchenItems.map((item) => {
                              const isChecked = checkedItems[item.id] || false;
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => toggleItemCheck(item.id)}
                                  className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border ${
                                    isChecked
                                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 line-through'
                                      : 'bg-slate-950/80 border-slate-800 text-white hover:border-slate-700'
                                  }`}
                                >
                                  <span className="flex items-center gap-2 font-semibold">
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold ${isChecked ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'border-slate-600'}`}>
                                      {isChecked && '✓'}
                                    </span>
                                    <span>
                                      <strong className="text-amber-400 font-black">{item.quantity}x</strong> {item.name}
                                    </span>
                                  </span>
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}

                      {order.specialInstructions && (
                        <div className="mt-2 text-xs bg-rose-500/15 text-rose-300 p-2.5 rounded-xl border border-rose-500/30 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                          <span><strong>Note:</strong> {order.specialInstructions}</span>
                        </div>
                      )}
                    </div>

                    {/* Primary Bump Action */}
                    <Button
                      variant="brand"
                      size="md"
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-2 text-xs"
                      onClick={() => handleOpenAcceptModal(order)}
                      icon={<Sparkles className="w-4 h-4" />}
                    >
                      Accept Ticket & Set ETA
                    </Button>
                  </Card>
                ))
              )}
            </div>

            {/* COLUMN 2: ACTIVE COOKING STATION */}
            <div className="space-y-4">
              <div className="p-3 bg-slate-900 rounded-2xl border border-rose-500/40 flex justify-between items-center shadow-md">
                <span className="text-xs font-black text-rose-400 uppercase tracking-wider flex items-center gap-2">
                  <Flame className="w-4 h-4 text-rose-500 animate-pulse" /> 2. Active Cooking Station ({inKitchenOrders.length})
                </span>
                <Badge variant="brand">{inKitchenOrders.length}</Badge>
              </div>

              {inKitchenOrders.length === 0 ? (
                <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-500 text-xs">
                  <Coffee className="w-7 h-7 text-slate-600 mx-auto mb-2" />
                  <p className="font-bold text-slate-400">Cooking Station Idle</p>
                  <p className="text-[11px] text-slate-500 mt-1">Accept pending tickets to start cooking timers.</p>
                </div>
              ) : (
                inKitchenOrders.map((order) => {
                  const timerData = getRemainingTime(order);
                  return (
                    <Card
                      key={order.id}
                      className={`bg-slate-900 p-4 space-y-3.5 shadow-xl transition-all rounded-2xl border-2 ${
                        timerData.isOverdue
                          ? 'border-rose-500 ring-2 ring-rose-500/40 bg-rose-950/20 animate-pulse'
                          : 'border-rose-500/50'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-white text-xl">#{order.id}</span>
                            {timerData.isOverdue && (
                              <Badge variant="danger" className="text-[10px] font-black animate-bounce px-2 py-0.5">
                                OVERDUE
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-300 font-semibold mt-0.5">
                            {order.customerName || 'Guest'} • {order.orderType === 'PICKUP' || order.tableNumber === 'COUNTER' ? 'Pickup Order' : 'Dine-in'}
                          </p>
                        </div>
                        <Badge variant={order.orderType === 'PICKUP' || order.tableNumber === 'COUNTER' ? 'warning' : 'brand'} className="px-3 py-1 text-xs font-black">
                          {order.tableNumber && order.tableNumber !== 'COUNTER' ? `📍 Table ${order.tableNumber}` : '🛍️ PICKUP ORDER'}
                        </Badge>
                      </div>

                      {/* COUNTDOWN DISPLAY BOX */}
                      <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-rose-400" /> Prep Countdown
                          </span>
                          <div
                            className={`font-mono text-2xl font-black ${
                              timerData.isOverdue ? 'text-rose-500' : 'text-emerald-400'
                            }`}
                          >
                            {timerData.formatted}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-2 text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-xl"
                            onClick={() => handleToggleTimer(order.id)}
                            title={order.isTimerPaused ? 'Resume Timer' : 'Pause Timer'}
                          >
                            {order.isTimerPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-400" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-2 text-slate-300 hover:text-sky-300 bg-slate-900 border border-slate-800 rounded-xl"
                            onClick={() => setHistoryOrder(order)}
                            title="View ETA Audit History"
                          >
                            <History className="w-4 h-4 text-sky-400" />
                          </Button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full transition-all duration-1000 ${
                            timerData.isOverdue ? 'bg-rose-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${timerData.progressPct}%` }}
                        />
                      </div>

                      {/* ETA Quick Adjusters */}
                      <div className="flex items-center justify-between bg-slate-950/70 p-2 rounded-xl border border-slate-800/80">
                        <span className="text-[11px] text-slate-400 font-bold">Target ({order.estimatedPrepTimeMinutes || 15}m):</span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="px-2 py-0.5 text-[11px] border-slate-700 hover:bg-rose-500/20 text-rose-300 font-bold"
                            onClick={() => handleEtaDelta(order.id, 5)}
                          >
                            +5m
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="px-2 py-0.5 text-[11px] border-slate-700 hover:bg-emerald-500/20 text-emerald-300 font-bold"
                            onClick={() => handleEtaDelta(order.id, -5)}
                          >
                            -5m
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="px-2 py-0.5 text-[11px] border-slate-700 text-slate-300 hover:bg-slate-800"
                            onClick={() => {
                              setSelectedOrderForEta(order);
                              setCustomEtaInput((order.estimatedPrepTimeMinutes || 15).toString());
                            }}
                          >
                            Custom
                          </Button>
                        </div>
                      </div>

                      {/* Dish Item Checklist */}
                      <div className="space-y-1.5 border-y border-slate-800/80 py-2.5">
                        {order.items.filter((i) => getFulfillmentStation(i) === 'KITCHEN').map((item) => {
                          const isChecked = checkedItems[item.id] || false;
                          return (
                            <div
                              key={item.id}
                              onClick={() => toggleItemCheck(item.id)}
                              className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border ${
                                isChecked
                                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 line-through'
                                  : 'bg-slate-950/80 border-slate-800 text-white hover:border-slate-700'
                              }`}
                            >
                              <span className="flex items-center gap-2 font-semibold">
                                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] font-bold ${isChecked ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'border-slate-600'}`}>
                                  {isChecked && '✓'}
                                </span>
                                <span>
                                  <strong className="text-rose-400 font-bold">{item.quantity}x</strong> {item.name}
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Primary Bump Action */}
                      <Button
                        variant="secondary"
                        size="md"
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2.5 rounded-xl shadow-lg flex items-center justify-center gap-2 text-xs"
                        onClick={() => handleMarkReady(order)}
                        icon={<CheckCircle2 className="w-4 h-4" />}
                      >
                        Plated & Bump to Waiter Pass ✨
                      </Button>
                    </Card>
                  );
                })
              )}
            </div>

            {/* COLUMN 3: PLATED & READY FOR PASS PICKUP */}
            <div className="space-y-4">
              <div className="p-3 bg-slate-900 rounded-2xl border border-emerald-500/40 flex justify-between items-center shadow-md">
                <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 3. Plated & Ready ({readyOrders.length})
                </span>
                <Badge variant="success">{readyOrders.length}</Badge>
              </div>

              {readyOrders.length === 0 ? (
                <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-500 text-xs">
                  <UtensilsCrossed className="w-7 h-7 text-slate-600 mx-auto mb-2" />
                  <p className="font-bold text-slate-400">Pass Window Clean</p>
                  <p className="text-[11px] text-slate-500 mt-1">No dishes awaiting pickup.</p>
                </div>
              ) : (
                readyOrders.map((order) => (
                  <Card
                    key={order.id}
                    className="bg-slate-900 border-2 border-emerald-500 p-4 space-y-3.5 shadow-xl rounded-2xl"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono font-black text-emerald-400 text-xl">#{order.id}</span>
                        <p className="text-xs text-emerald-300 font-bold mt-0.5">Plated & Ready!</p>
                      </div>
                      <Badge variant={order.orderType === 'PICKUP' || order.tableNumber === 'COUNTER' ? 'warning' : 'brand'} className="px-3 py-1 text-xs font-black">
                        {order.tableNumber && order.tableNumber !== 'COUNTER' ? `📍 Table ${order.tableNumber}` : '🛍️ PICKUP READY'}
                      </Badge>
                    </div>

                    <div className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1">
                      <p className="font-bold text-slate-200 mb-1">Items Ready to Serve:</p>
                      {order.items.filter((i) => getFulfillmentStation(i) === 'KITCHEN').map((i) => (
                        <div key={i.id} className="text-slate-300 flex justify-between font-semibold">
                          <span>• {i.quantity}x {i.name}</span>
                          <span className="text-emerald-400 text-[10px]">Plated ✓</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      variant="outline"
                      size="md"
                      className="w-full border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 font-bold py-2 rounded-xl text-xs"
                      onClick={() => handleDeliverOrder(order.id)}
                      icon={<CheckCircle2 className="w-4 h-4" />}
                    >
                      Table Served (Complete Ticket)
                    </Button>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* VIEW 2: WAITER PASS & PICKUP BOARD */}
        {viewMode === 'WAITER' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-amber-400 animate-bounce" /> Hot Pass Waiter Pickup Dashboard
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Plated dishes ready for immediate table delivery
                </p>
              </div>
              <Badge variant="brand" className="text-xs px-3 py-1.5 font-bold bg-emerald-500 text-slate-950">
                {readyOrders.length} Tables Ready For Pickup
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {readyOrders.map((order) => (
                <Card key={order.id} className="bg-slate-900 border-2 border-emerald-500 p-5 space-y-4 shadow-xl rounded-2xl">
                  <div className="flex justify-between items-center">
                    <Badge variant="success" className="px-3 py-1 font-bold text-xs uppercase">
                      ✨ READY TO SERVE
                    </Badge>
                    <span className="font-mono font-black text-white text-xl">#{order.id}</span>
                  </div>

                  <div className="p-4 bg-slate-950 rounded-2xl border border-emerald-500/30 text-center">
                    <p className="text-3xl font-black text-emerald-400 font-mono tracking-tight">TABLE {order.tableNumber}</p>
                    <p className="text-xs text-slate-300 font-medium mt-1">Guest: {order.customerName || 'Walk-in'}</p>
                  </div>

                  <div className="space-y-2 border-y border-slate-800 py-3">
                    <p className="text-xs font-bold text-slate-400">Plated Items:</p>
                    {order.items.filter((i) => getFulfillmentStation(i) === 'KITCHEN').map((i) => (
                      <div key={i.id} className="flex justify-between text-xs text-white font-bold">
                        <span>{i.quantity}x {i.name}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="brand"
                    size="md"
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-2.5 rounded-xl shadow-lg text-xs"
                    onClick={() => handleDeliverOrder(order.id)}
                    icon={<CheckCircle2 className="w-4 h-4" />}
                  >
                    Mark Table Served
                  </Button>
                </Card>
              ))}

              {readyOrders.length === 0 && (
                <div className="col-span-full p-12 text-center bg-slate-900/60 rounded-3xl border border-slate-800 space-y-3">
                  <UtensilsCrossed className="w-10 h-10 text-slate-600 mx-auto" />
                  <h4 className="text-base font-bold text-slate-300">Pass Window Clear</h4>
                  <p className="text-xs text-slate-500">No dishes currently waiting on the kitchen pass window.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: KITCHEN PERFORMANCE ANALYTICS */}
        {viewMode === 'ANALYTICS' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Avg Preparation Time"
                value={`${analytics?.avgPrepTimeMinutes || '14.2'} min`}
                change={{ value: '2.1m faster than SLA target', isPositive: true }}
                icon={<Clock className="w-5 h-5 text-amber-400" />}
              />
              <StatsCard
                title="ETA Accuracy SLA"
                value={`${analytics?.etaAccuracyPercent || '94.8'}%`}
                change={{ value: 'Target ±2 min window', isPositive: true }}
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              />
              <StatsCard
                title="Kitchen Load Factor"
                value={`${analytics?.kitchenLoadPercent || '62'}%`}
                change={{ value: 'Optimal Grill Capacity', isPositive: true }}
                icon={<Flame className="w-5 h-5 text-rose-500" />}
              />
              <StatsCard
                title="Late / Overdue Tickets"
                value={overdueCount.toString()}
                change={{ value: overdueCount === 0 ? 'Zero active delays' : 'Action needed', isPositive: overdueCount === 0 }}
                icon={<AlertTriangle className="w-5 h-5 text-rose-400" />}
              />
            </div>

            <Card className="bg-slate-900 border-slate-800 p-6 space-y-4 rounded-2xl">
              <h4 className="text-base font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-400" /> Station Cooking Throughput & SLA Trends
              </h4>

              <div className="grid grid-cols-7 gap-2 pt-4">
                {(analytics?.dailyPerformance || [
                  { day: 'Mon', avgTime: 12.4 },
                  { day: 'Tue', avgTime: 13.8 },
                  { day: 'Wed', avgTime: 11.9 },
                  { day: 'Thu', avgTime: 14.2 },
                  { day: 'Fri', avgTime: 16.5 },
                  { day: 'Sat', avgTime: 17.1 },
                  { day: 'Sun', avgTime: 15.0 },
                ]).map((item: any) => (
                  <div key={item.day} className="space-y-2 text-center">
                    <div className="h-36 bg-slate-950 rounded-xl flex flex-col justify-end p-1 border border-slate-800">
                      <div
                        className="w-full bg-gradient-to-t from-amber-600 via-rose-500 to-rose-400 rounded-lg"
                        style={{ height: `${(item.avgTime / 20) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-300 block">{item.day}</span>
                    <span className="text-[10px] font-mono text-amber-400 block">{item.avgTime}m</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {viewMode === 'COMPLETED' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" /> Completed Shift Orders
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Archived kitchen tickets completed during the current business day
                </p>
              </div>
              <Badge variant="brand" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs font-mono font-bold">
                {completedOrders.length} Tickets Completed Today
              </Badge>
            </div>

            {completedOrders.length === 0 ? (
              <Card className="bg-slate-900 border-slate-800 p-12 text-center text-slate-400 rounded-2xl">
                <CheckCircle2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="font-bold text-white text-base">No Completed Kitchen Orders Yet</p>
                <p className="text-xs text-slate-500 mt-1">Completed kitchen tickets will automatically appear in this ledger.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedOrders.map((order) => {
                  const kitchenItems = order.items.filter((i) => getFulfillmentStation(i) === 'KITCHEN');
                  return (
                    <Card key={order.id} className="bg-slate-900 border-slate-800 p-4 space-y-3 rounded-2xl shadow-xl hover:border-slate-700 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-white text-base">#{order.id}</span>
                          <Badge variant="brand" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] font-mono">
                            📍 {order.tableNumber}
                          </Badge>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {order.kitchenCompletedAt ? new Date(order.kitchenCompletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (order.readyAt ? new Date(order.readyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Today')}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 font-semibold">
                        Guest: {order.customerName || 'Guest'}
                      </p>

                      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1.5 font-mono text-xs">
                        {kitchenItems.map((item) => (
                          <div key={item.id} className="flex justify-between items-center text-slate-200">
                            <span><strong className="text-rose-400 font-bold">{item.quantity}x</strong> {item.name}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <span className="text-slate-400 font-mono">Kitchen Ticket Status:</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> COMPLETED
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: ACCEPT ORDER & SMART ETA */}
      {selectedOrderToAccept && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedOrderToAccept(null)}
          title={`Accept Ticket #${selectedOrderToAccept.id} — Table ${selectedOrderToAccept.tableNumber}`}
        >
          <div className="space-y-5">
            {smartEtaData && (
              <div className="p-4 bg-slate-950 rounded-2xl border border-rose-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-400" /> Smart Kitchen AI ETA Recommendation
                  </span>
                  <Badge variant="brand">{smartEtaData.kitchenLoadFactor} KITCHEN LOAD</Badge>
                </div>
                <div className="text-2xl font-black text-white font-mono">
                  {smartEtaData.recommendedMinutes} minutes
                </div>
                <ul className="text-xs text-slate-400 space-y-1 pt-1">
                  {smartEtaData.reasons.map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-2">Select Target Prep Time:</label>
              <div className="grid grid-cols-4 gap-2">
                {[10, 15, 20, 30].map((mins) => (
                  <Button
                    key={mins}
                    variant={parseInt(customPrepInput, 10) === mins ? 'brand' : 'outline'}
                    size="md"
                    className="font-mono font-bold"
                    onClick={() => {
                      setChosenPrepTime(mins);
                      setCustomPrepInput(String(mins));
                    }}
                  >
                    {mins} Min
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Custom Prep Time (minutes):</label>
              <Input
                type="number"
                value={customPrepInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomPrepInput(val);
                  const parsed = parseInt(val, 10);
                  if (!isNaN(parsed) && parsed > 0) {
                    setChosenPrepTime(parsed);
                  }
                }}
                className="bg-slate-950 border-slate-800 font-mono text-lg font-bold text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="ghost" onClick={() => setSelectedOrderToAccept(null)}>
                Cancel
              </Button>
              <Button variant="brand" onClick={handleConfirmAcceptOrder} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold">
                Confirm & Start Kitchen Timer
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 2: CUSTOM ETA CHANGE */}
      {selectedOrderForEta && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedOrderForEta(null)}
          title={`Adjust Target ETA — Order #${selectedOrderForEta.id}`}
        >
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">New Target ETA (minutes from now):</label>
              <Input
                type="number"
                value={customEtaInput}
                onChange={(e) => setCustomEtaInput(e.target.value)}
                className="bg-slate-950 border-slate-800 font-mono text-lg font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Reason for ETA Change:</label>
              <Input
                type="text"
                placeholder="e.g. Wagyu steak resting, kitchen rush..."
                value={etaChangeReason}
                onChange={(e) => setEtaChangeReason(e.target.value)}
                className="bg-slate-950 border-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <Button variant="ghost" onClick={() => setSelectedOrderForEta(null)}>
                Cancel
              </Button>
              <Button variant="brand" onClick={handleSaveCustomEta}>
                Save New ETA
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 3: BROADCAST DELAY ALERT */}
      {isDelayModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsDelayModalOpen(false)}
          title="Broadcast Kitchen Delay to Waiter Terminals"
          description="Send an instant push notification to all active waiter terminals."
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-300">
              Broadcast kitchen delays or ingredient shortages (e.g. "Grill line backed up by 15 mins", "Ribeye out of stock").
            </p>
            <div className="space-y-1">
              <label className="font-bold text-slate-200">Alert Message:</label>
              <Input
                type="text"
                placeholder="e.g. Hot line delay 10 mins due to high rush..."
                value={delayMessage}
                onChange={(e) => setDelayMessage(e.target.value)}
                className="bg-slate-950 border-slate-800 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setIsDelayModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="brand" onClick={handleBroadcastDelay} className="bg-amber-500 text-slate-950 font-bold">
                Broadcast Alert Now
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL 4: RECALL BUMPED ORDER */}
      {isRecallModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsRecallModalOpen(false)}
          title="Recall Bumped Orders Log"
          description="Un-bump recently completed tickets back to active cooking status."
        >
          <div className="space-y-3 text-xs max-h-96 overflow-y-auto">
            {bumpedHistory.length === 0 ? (
              <p className="text-slate-500 text-center py-6">No recently bumped orders to recall.</p>
            ) : (
              bumpedHistory.map((order) => (
                <div key={order.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-amber-400">#{order.id}</span>
                    <p className="text-[11px] text-slate-400">Table {order.tableNumber} • {order.items.length} items</p>
                  </div>
                  <Button variant="brand" size="sm" onClick={() => handleRecallOrder(order)} className="text-xs">
                    Recall Ticket
                  </Button>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}

      {/* MODAL 5: ETA AUDIT HISTORY */}
      {historyOrder && (
        <Modal
          isOpen={true}
          onClose={() => setHistoryOrder(null)}
          title={`ETA Audit History — Ticket #${historyOrder.id}`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <p className="font-bold text-white">Table: {historyOrder.tableNumber}</p>
              <p className="text-slate-400">Current ETA: {historyOrder.estimatedPrepTimeMinutes || 15} mins</p>
            </div>

            <div className="space-y-2">
              {historyOrder.etaHistory && historyOrder.etaHistory.length > 0 ? (
                historyOrder.etaHistory.map((h, i) => (
                  <div key={i} className="p-3 bg-slate-900 rounded-xl border border-slate-800 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-amber-400">{h.changedBy}</span>
                      <span className="text-[10px] text-slate-500">{new Date(h.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-slate-200">
                      ETA: {h.oldEta}m → <strong className="text-emerald-400">{h.newEta}m</strong>
                    </p>
                    {h.reason && <p className="text-slate-400 italic">"{h.reason}"</p>}
                  </div>
                ))
              ) : (
                <p className="text-slate-500 text-center py-4">No prior ETA adjustments recorded.</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setHistoryOrder(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
