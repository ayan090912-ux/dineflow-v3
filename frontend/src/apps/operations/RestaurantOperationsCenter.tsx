import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  Beer,
  Bell,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock,
  DollarSign,
  Eye,
  Flame,
  Globe,
  HelpCircle,
  History,
  Layers,
  LogOut,
  Package,
  Pause,
  PhoneCall,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User,
  Utensils,
  Volume2,
  VolumeX,
  Wine,
  X,
  Zap,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  DinelyLogo,
  EmptyState,
  Input,
  Modal,
  SearchInput,
} from '../../packages/ui';
import {
  CustomerRequest,
  CustomerRequestStatus,
  CustomerRequestType,
  Employee,
  InventoryItem,
  Order,
  OrderItem,
  OrderStatus,
  Restaurant,
  Table,
  TableSession,
} from '../../packages/types';
import { api, getApiBaseUrl } from '../../packages/api/client';
import { realtimeBus, RealTimeEventPayload } from '../../packages/api/realtime';

// --- Web Audio Synthesizers for Professional Operations Alerts ---
const playChime = (type: 'ORDER' | 'WAITER' | 'READY' | 'ALERT') => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'WAITER') {
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      gain1.gain.setValueAtTime(0.18, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.25);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain2.gain.setValueAtTime(0.18, ctx.currentTime + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.1);
      osc2.stop(ctx.currentTime + 0.35);
    } else if (type === 'ORDER') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'READY') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(784, ctx.currentTime); // G5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {}
};

export type OperationsTab =
  | 'operations'
  | 'orders'
  | 'tables'
  | 'kitchen'
  | 'bar'
  | 'waiter'
  | 'inventory'
  | 'billing';

interface RestaurantOperationsCenterProps {
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
  initialTab?: OperationsTab;
}

export const RestaurantOperationsCenter: React.FC<RestaurantOperationsCenterProps> = ({
  onLogout,
  onNavigate,
  initialTab = 'operations',
}) => {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<OperationsTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'LIVE' | 'RECONNECTING' | 'OFFLINE'>('LIVE');

  // Authoritative Core Datasets
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeSessions, setActiveSessions] = useState<TableSession[]>([]);
  const [customerRequests, setCustomerRequests] = useState<CustomerRequest[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<Array<{ id: string; time: string; text: string; type: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals & Action States
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedTableForClose, setSelectedTableForClose] = useState<Table | null>(null);
  const [selectedTableForDetails, setSelectedTableForDetails] = useState<Table | null>(null);
  const [isClosingTable, setIsClosingTable] = useState(false);
  const [toast, setToast] = useState<{ title: string; desc: string; type: 'success' | 'warning' | 'info' } | null>(null);

  const currentUser = api.getCurrentUser();
  const urlRestParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('restaurant') || new URLSearchParams(window.location.search).get('restaurantId') : null;
  const currentRestaurantId = urlRestParam || api.getCurrentRestaurantId() || currentUser?.restaurantId || '';
  const staffName = currentUser?.name || 'Staff Member';

  const showToast = (title: string, desc: string, type: 'success' | 'warning' | 'info' = 'info') => {
    setToast({ title, desc, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Clock
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setCurrentTime(d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  // Comprehensive Data Fetcher
  const loadAllOperationsData = async (silent: boolean = false) => {
    try {
      if (!silent) setIsLoading(true);
      const restId = currentRestaurantId;

      const [restData, ordData, tblData, sessionData, reqData, invData] = await Promise.all([
        api.getRestaurantDetails(restId),
        api.getOrders(restId),
        api.getTables(restId),
        api.getActiveTableSessions(restId),
        api.getCustomerRequests(restId),
        api.getInventory(restId),
      ]);

      if (restData) setRestaurant(restData);
      setOrders(ordData || []);
      setTables(tblData || []);
      setActiveSessions(sessionData || []);
      setCustomerRequests(reqData || []);
      setInventory(invData || []);
      setConnectionStatus('LIVE');
    } catch (err) {
      console.error('Operations Center data sync error:', err);
      setConnectionStatus('RECONNECTING');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Initial Load & Realtime Subscriptions
  useEffect(() => {
    loadAllOperationsData(false);

    // Auto-poll fallback every 60 seconds when visible (replaces aggressive 4s storm)
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadAllOperationsData(true);
      }
    }, 60000);

    // Connect WebSocket
    const restId = currentRestaurantId;
    realtimeBus.connect(restId, currentUser?.role || 'RESTAURANT_OWNER');

    const handledEventIds = new Set<string>();

    const unsubscribe = realtimeBus.subscribe((event: RealTimeEventPayload) => {
      const evtRestId = event.restaurantId || (event as any).restaurant_id;
      if (evtRestId) {
        const normEvt = String(evtRestId).toLowerCase();
        const normCurr = String(restId).toLowerCase();
        if (normEvt !== normCurr && !normEvt.includes(normCurr) && !normCurr.includes(normEvt)) {
          return;
        }
      }

      const evtId = event.eventId || (event as any).event_id;
      if (evtId) {
        if (handledEventIds.has(evtId)) return;
        handledEventIds.add(evtId);
      }

      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const tblNum = (event as any).tableNumber || (event as any).table_number || 'Floor';

      // Targeted Event Handling
      if (event.type === 'service_request_created' || event.type === 'CustomerRequestCreated') {
        const reqType = (event as any).requestType || 'WATER';
        if (!isAudioMuted) playChime('WAITER');
        showToast(`Customer Request 🛎️`, `${tblNum} requested ${reqType}`, 'warning');
        api.getCustomerRequests(restId).then(setCustomerRequests).catch(() => {});
        setAuditEvents((prev) => [
          { id: `ev-${Date.now()}`, time: nowStr, text: `${tblNum}: Requested ${reqType}`, type: 'WAITER' },
          ...prev.slice(0, 40),
        ]);
      } else if (event.type === 'order_created' || event.type === 'OrderCreated') {
        if (!isAudioMuted) playChime('ORDER');
        showToast(`New Order Placed 🔥`, `Order #${(event.orderId || '').slice(-4)} from ${tblNum}`, 'success');
        api.getOrders(restId).then(setOrders).catch(() => {});
        api.getActiveTableSessions(restId).then(setActiveSessions).catch(() => {});
        setAuditEvents((prev) => [
          { id: `ev-${Date.now()}`, time: nowStr, text: `New Order: ${tblNum} (Total: ₹${(event as any).grandTotal || '0'})`, type: 'ORDER' },
          ...prev.slice(0, 40),
        ]);
      } else if (event.type === 'order_ready' || event.type === 'OrderReady') {
        if (!isAudioMuted) playChime('READY');
        showToast(`Plate Ready to Serve 🍽️`, `Order for ${tblNum} is ready at pickup counter`, 'info');
        setOrders((prev) =>
          prev.map((o) => (o.id === event.orderId ? { ...o, status: 'READY', kitchenStatus: 'READY' } : o))
        );
        setAuditEvents((prev) => [
          { id: `ev-${Date.now()}`, time: nowStr, text: `Kitchen: Order for ${tblNum} is READY`, type: 'KITCHEN' },
          ...prev.slice(0, 40),
        ]);
      } else if (event.type === 'table_session_closed' || event.type === 'TableSessionClosed') {
        const sessId = (event as any).tableSessionId || (event as any).sessionId;
        showToast(`Table Session Closed 🧹`, `Table ${tblNum} session closed & cleared`, 'info');
        if (sessId) {
          setActiveSessions((prev) => prev.filter((s) => s.id !== sessId));
        }
        setTables((prev) =>
          prev.map((t) => (t.tableNumber === tblNum || (t as any).number === tblNum ? { ...t, status: 'AVAILABLE', isOccupied: false } : t))
        );
        setAuditEvents((prev) => [
          { id: `ev-${Date.now()}`, time: nowStr, text: `Floor: Table ${tblNum} session closed`, type: 'TABLE' },
          ...prev.slice(0, 40),
        ]);
      }
    });

    return () => {
      clearInterval(pollInterval);
      unsubscribe();
    };
  }, [currentRestaurantId, isAudioMuted]);

  // --- Derived Collections ---

  // Active Sessions (strictly ACTIVE in Neon)
  const activeSessionsList = useMemo(() => {
    return activeSessions.filter((s) => s.status === 'ACTIVE');
  }, [activeSessions]);

  // Active Tables list based strictly on active sessions
  const activeOccupiedTables = useMemo(() => {
    const activeSessionTableIds = new Set(activeSessionsList.flatMap((s) => [s.tableId, s.tableNumber?.toLowerCase()].filter(Boolean)));
    return tables.filter((t) => {
      const match =
        activeSessionTableIds.has(t.id) ||
        (t.tableNumber && activeSessionTableIds.has(t.tableNumber.toLowerCase())) ||
        activeSessionsList.some((s) => s.tableId === t.id || s.tableNumber?.toLowerCase() === t.tableNumber?.toLowerCase());
      return match;
    });
  }, [tables, activeSessionsList]);

  // Pending & In-Progress Waiter Requests
  const pendingWaiterRequests = useMemo(() => {
    return customerRequests.filter((r) => r.status === 'PENDING' || r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS');
  }, [customerRequests]);

  // Kitchen Orders (Items where targetDestination !== 'BAR')
  const kitchenOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status === 'CANCELLED' || o.status === 'COMPLETED' || o.status === 'DELIVERED') return false;
      return o.items.some((i) => (i.targetDestination || 'KITCHEN') !== 'BAR');
    });
  }, [orders]);

  // Bar Orders (Items where targetDestination === 'BAR')
  const barOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.status === 'CANCELLED' || o.status === 'COMPLETED' || o.status === 'DELIVERED') return false;
      return o.items.some((i) => (i.targetDestination || '').toUpperCase() === 'BAR' || i.isAlcoholic);
    });
  }, [orders]);

  // Inventory Critical Stock Alerts
  const inventoryAlerts = useMemo(() => {
    return inventory.filter((item) => {
      const threshold = item.minThreshold || (item as any).minimumThreshold || 5;
      const stock = item.currentStock ?? item.quantity ?? 0;
      return stock <= threshold || item.status === 'LOW_STOCK' || item.status === 'OUT_OF_STOCK';
    });
  }, [inventory]);

  // Billing Metrics
  const billingSummary = useMemo(() => {
    const activeTotalRevenue = orders
      .filter((o) => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const unbilledTablesCount = activeSessionsList.length;
    const pendingPaymentOrders = orders.filter((o) => o.paymentStatus === 'UNPAID' && o.status !== 'CANCELLED');
    return {
      activeTotalRevenue,
      unbilledTablesCount,
      pendingPaymentOrdersCount: pendingPaymentOrders.length,
    };
  }, [orders, activeSessionsList]);

  // --- Operational Actions ---

  // 1. Waiter Request: Accept
  const handleAcceptRequest = async (requestId: string) => {
    try {
      await api.updateCustomerRequest(requestId, 'IN_PROGRESS', staffName);
      setCustomerRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'IN_PROGRESS' as CustomerRequestStatus, assignedWaiterName: staffName } : r))
      );
      showToast('Request Accepted 🛎️', 'Status updated to IN_PROGRESS', 'info');
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to accept request', 'warning');
    }
  };

  // 2. Waiter Request: Complete
  const handleCompleteRequest = async (requestId: string) => {
    try {
      await api.updateCustomerRequest(requestId, 'COMPLETED', staffName);
      // Immediately evict from pending list
      setCustomerRequests((prev) => prev.filter((r) => r.id !== requestId));
      showToast('Request Completed ✅', 'Request cleared from floor queue', 'success');
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to complete request', 'warning');
    }
  };

  // 3. Kitchen Item / Order Bump
  const handleKitchenStatusUpdate = async (
    orderId: string,
    newStatus: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED'
  ) => {
    try {
      await api.updateKitchenStatus(orderId, newStatus);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, kitchenStatus: newStatus, status: newStatus as OrderStatus } : o))
      );
      showToast('Kitchen Status Updated', `Order #${orderId.slice(-4)} marked ${newStatus}`, 'success');
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to update kitchen status', 'warning');
    }
  };

  // 4. Bar Item / Order Bump
  const handleBarStatusUpdate = async (
    orderId: string,
    newStatus: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED'
  ) => {
    try {
      await api.updateBarStatus(orderId, newStatus);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, barStatus: newStatus } : o))
      );
      showToast('Bar Status Updated 🍸', `Drink #${orderId.slice(-4)} marked ${newStatus}`, 'success');
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to update bar status', 'warning');
    }
  };

  // 5. Close Table Session
  const handleExecuteCloseTable = async () => {
    if (!selectedTableForClose) return;
    setIsClosingTable(true);
    try {
      const tbl = selectedTableForClose;
      const activeSession = activeSessionsList.find(
        (s) => s.tableId === tbl.id || (s.tableNumber && s.tableNumber.toLowerCase() === tbl.tableNumber.toLowerCase())
      );

      const targetSessionId = activeSession?.id || tbl.activeSessionId;

      await api.closeTableSession({
        restaurantId: currentRestaurantId,
        tableId: tbl.id,
        tableSessionId: targetSessionId,
        waiterName: staffName,
      });

      // Immediate eviction from state
      setActiveSessions((prev) => prev.filter((s) => s.id !== targetSessionId && s.tableId !== tbl.id));
      setTables((prev) =>
        prev.map((t) => (t.id === tbl.id ? { ...t, isOccupied: false, status: 'AVAILABLE', activeSessionId: undefined } : t))
      );

      showToast('Table Closed & Reset 🧹', `${tbl.tableNumber} is now AVAILABLE. Session permanently closed.`, 'success');
      setSelectedTableForClose(null);
    } catch (err: any) {
      showToast('Close Table Failed', err.message || 'Failed to close table session', 'warning');
    } finally {
      setIsClosingTable(false);
    }
  };

  // Helper for elapsed time format
  const getElapsedString = (isoString?: string) => {
    if (!isoString) return 'Just now';
    const mins = Math.max(0, Math.floor((Date.now() - new Date(isoString).getTime()) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      {/* =========================================================================
          PERSISTENT TOP NAVIGATION BAR (COMMERCIAL RESTAURANT OPERATIONS BAR)
          ========================================================================= */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 sticky top-0 z-50 flex items-center justify-between gap-3 shadow-xl">
        {/* Left: Brand, Restaurant, Live Indicator */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('operations')}>
            <DinelyLogo size="sm" />
            <div className="hidden sm:block">
              <span className="text-xs font-black tracking-wider text-white uppercase block leading-none">
                {restaurant?.name || 'Restaurant Workspace'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                <span>OP-CENTER</span>
                <span className="text-slate-600">•</span>
                <span>{currentTime}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Center: Realtime Operations Nav Tabs */}
        <nav className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/90 overflow-x-auto scrollbar-none no-scrollbar">
          <button
            onClick={() => setActiveTab('operations')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'operations'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Operations</span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'orders'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Utensils className="w-3.5 h-3.5 text-indigo-400" />
            <span>Orders</span>
            {orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-500/30 text-indigo-200">
                {orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('tables')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'tables'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tables</span>
            {activeSessionsList.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/30 text-emerald-200">
                {activeSessionsList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('kitchen')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'kitchen'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ChefHat className="w-3.5 h-3.5 text-amber-400" />
            <span>Kitchen</span>
            {kitchenOrders.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/30 text-amber-200">
                {kitchenOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('bar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'bar'
                ? 'bg-sky-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Wine className="w-3.5 h-3.5 text-sky-400" />
            <span>Bar</span>
            {barOrders.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-500/30 text-sky-200">
                {barOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('waiter')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'waiter'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
            <span>Waiter</span>
            {pendingWaiterRequests.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950 animate-pulse">
                {pendingWaiterRequests.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'inventory'
                ? 'bg-rose-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-rose-400" />
            <span>Inventory</span>
            {inventoryAlerts.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/30 text-rose-300">
                {inventoryAlerts.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('billing')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeTab === 'billing'
                ? 'bg-violet-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-violet-400" />
            <span>Billing</span>
          </button>
        </nav>

        {/* Right: Connection, Audio, Profile, Refresh & Logout */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Connection Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border ${
              connectionStatus === 'LIVE'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400'
                : connectionStatus === 'RECONNECTING'
                ? 'bg-amber-950/80 border-amber-500/40 text-amber-400 animate-pulse'
                : 'bg-rose-950/80 border-rose-500/40 text-rose-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'LIVE'
                  ? 'bg-emerald-400'
                  : connectionStatus === 'RECONNECTING'
                  ? 'bg-amber-400'
                  : 'bg-rose-400'
              }`}
            />
            <span className="hidden sm:inline">{connectionStatus}</span>
          </div>

          {/* Audio Chime Toggle */}
          <button
            onClick={() => setIsAudioMuted(!isAudioMuted)}
            className={`p-1.5 rounded-lg border transition-colors ${
              isAudioMuted
                ? 'bg-slate-900 border-slate-800 text-slate-500'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:text-white'
            }`}
            title={isAudioMuted ? 'Unmute Operational Chimes' : 'Mute Operational Chimes'}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Manual Data Refresh */}
          <button
            onClick={() => loadAllOperationsData(false)}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Force Synchronize with Cloud Server"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
          </button>

          {/* User / Role info */}
          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
              {staffName.charAt(0).toUpperCase()}
            </div>
            <div className="text-left">
              <span className="text-[11px] font-bold text-slate-200 block leading-tight truncate max-w-[90px]">
                {staffName}
              </span>
              <span className="text-[9px] text-slate-400 font-mono uppercase block leading-tight">
                {currentUser?.role || 'STAFF'}
              </span>
            </div>
          </div>

          {/* Logout */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-400 hover:bg-rose-900/60 hover:text-white transition-colors ml-1"
              title="Sign Out of Operations Center"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* =========================================================================
          OPERATIONAL KPI STRIP
          ========================================================================= */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-4 py-2 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <div
          onClick={() => setActiveTab('orders')}
          className="bg-slate-950/80 border border-slate-800 hover:border-indigo-500/50 p-2 rounded-xl flex items-center justify-between cursor-pointer transition-all"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">Active Orders</span>
            <span className="text-base font-black text-white">
              {orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length}
            </span>
          </div>
          <Utensils className="w-4 h-4 text-indigo-400" />
        </div>

        <div
          onClick={() => setActiveTab('kitchen')}
          className="bg-slate-950/80 border border-slate-800 hover:border-amber-500/50 p-2 rounded-xl flex items-center justify-between cursor-pointer transition-all"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">Kitchen KDS</span>
            <span className="text-base font-black text-amber-400">{kitchenOrders.length}</span>
          </div>
          <ChefHat className="w-4 h-4 text-amber-400" />
        </div>

        <div
          onClick={() => setActiveTab('bar')}
          className="bg-slate-950/80 border border-slate-800 hover:border-sky-500/50 p-2 rounded-xl flex items-center justify-between cursor-pointer transition-all"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">Bar Orders</span>
            <span className="text-base font-black text-sky-400">{barOrders.length}</span>
          </div>
          <Wine className="w-4 h-4 text-sky-400" />
        </div>

        <div
          onClick={() => setActiveTab('waiter')}
          className="bg-slate-950/80 border border-slate-800 hover:border-amber-500/50 p-2 rounded-xl flex items-center justify-between cursor-pointer transition-all"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">Waiter Calls</span>
            <span className={`text-base font-black ${pendingWaiterRequests.length > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
              {pendingWaiterRequests.length}
            </span>
          </div>
          <PhoneCall className="w-4 h-4 text-amber-400" />
        </div>

        <div
          onClick={() => setActiveTab('tables')}
          className="bg-slate-950/80 border border-slate-800 hover:border-emerald-500/50 p-2 rounded-xl flex items-center justify-between cursor-pointer transition-all"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">Active Tables</span>
            <span className="text-base font-black text-emerald-400">{activeSessionsList.length}</span>
          </div>
          <Layers className="w-4 h-4 text-emerald-400" />
        </div>

        <div
          onClick={() => setActiveTab('inventory')}
          className="bg-slate-950/80 border border-slate-800 hover:border-rose-500/50 p-2 rounded-xl flex items-center justify-between cursor-pointer transition-all"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">Low Stock</span>
            <span className={`text-base font-black ${inventoryAlerts.length > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
              {inventoryAlerts.length}
            </span>
          </div>
          <Package className="w-4 h-4 text-rose-400" />
        </div>

        <div
          onClick={() => setActiveTab('billing')}
          className="bg-slate-950/80 border border-slate-800 hover:border-violet-500/50 p-2 rounded-xl flex items-center justify-between cursor-pointer transition-all col-span-2 sm:col-span-1"
        >
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block">Active Sales</span>
            <span className="text-base font-black text-violet-400 font-mono">₹{billingSummary.activeTotalRevenue.toFixed(0)}</span>
          </div>
          <DollarSign className="w-4 h-4 text-violet-400" />
        </div>
      </div>

      {/* =========================================================================
          MAIN MULTI-PANEL VIEW / TABBED CONTENT
          ========================================================================= */}
      <main className="flex-1 p-4 overflow-y-auto">
        {/* VIEW 1: UNIFIED OPERATIONS CENTER (MAIN SIMULTANEOUS GRID) */}
        {activeTab === 'operations' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* COLUMN 1 (4 COLS): ACTIVE ORDERS & BILLING ALERTS */}
            <div className="lg:col-span-4 space-y-4">
              {/* Active Orders Panel */}
              <Card className="bg-slate-900 border-slate-800 p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-indigo-400" />
                    <h2 className="text-sm font-black text-white uppercase tracking-wide">Live Orders</h2>
                    <Badge variant="brand">
                      {orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('orders')} className="text-xs text-indigo-400 p-0 h-auto">
                    View All
                  </Button>
                </div>

                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length === 0 ? (
                    <div className="p-6 text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
                      No active orders right now.
                    </div>
                  ) : (
                    orders
                      .filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED')
                      .slice(0, 5)
                      .map((ord) => (
                        <div
                          key={ord.id}
                          onClick={() => setSelectedOrder(ord)}
                          className="bg-slate-950 p-3 rounded-xl border border-slate-800/90 hover:border-indigo-500/40 transition-all cursor-pointer space-y-2 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-white font-mono">{ord.tableNumber}</span>
                              <span className="text-[11px] text-slate-400 font-mono">#{ord.id.slice(-4)}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                              {getElapsedString(ord.createdAt)}
                            </span>
                          </div>

                          <div className="text-xs text-slate-300 line-clamp-2">
                            {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[11px]">
                            <span className="font-bold text-white font-mono">₹{ord.totalAmount.toFixed(2)}</span>
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={
                                  ord.kitchenStatus === 'READY'
                                    ? 'success'
                                    : ord.kitchenStatus === 'PREPARING'
                                    ? 'warning'
                                    : 'neutral'
                                }
                              >
                                K: {ord.kitchenStatus || ord.status}
                              </Badge>
                              {ord.items.some((i) => (i.targetDestination || '').toUpperCase() === 'BAR') && (
                                <Badge variant="info">Bar: {ord.barStatus || 'NEW'}</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </Card>

              {/* Billing & Sales Snapshot */}
              <Card className="bg-slate-900 border-slate-800 p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-violet-400" />
                    <h2 className="text-sm font-black text-white uppercase tracking-wide">Billing & Payments</h2>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('billing')} className="text-xs text-violet-400 p-0 h-auto">
                    Manage
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block font-mono">UNBILLED TABLES</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">{billingSummary.unbilledTablesCount} Tables</span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                    <span className="text-[10px] text-slate-400 block font-mono">PENDING PAYMENTS</span>
                    <span className="text-sm font-bold text-amber-400 mt-0.5 block">{billingSummary.pendingPaymentOrdersCount} Orders</span>
                  </div>
                </div>
              </Card>
            </div>

            {/* COLUMN 2 (4 COLS): WAITER REQUESTS & ACTIVE FLOOR TABLES */}
            <div className="lg:col-span-4 space-y-4">
              {/* Waiter Requests Panel */}
              <Card className="bg-slate-900 border-slate-800 p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-black text-white uppercase tracking-wide">Waiter Requests</h2>
                    {pendingWaiterRequests.length > 0 && (
                      <Badge variant="warning">{pendingWaiterRequests.length} Pending</Badge>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('waiter')} className="text-xs text-amber-400 p-0 h-auto">
                    View
                  </Button>
                </div>

                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {pendingWaiterRequests.length === 0 ? (
                    <div className="p-6 text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1.5" />
                      All table requests handled.
                    </div>
                  ) : (
                    pendingWaiterRequests.map((req) => (
                      <div
                        key={req.id}
                        className="bg-slate-950 p-3 rounded-xl border border-amber-500/40 hover:border-amber-400 transition-all space-y-2.5 shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-white font-mono">{req.tableNumber}</span>
                            <Badge variant={req.requestType === 'BILL' ? 'danger' : 'warning'}>{req.requestType}</Badge>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                            {getElapsedString(req.requestedAt)}
                          </span>
                        </div>

                        {req.customerNotes && (
                          <p className="text-xs text-slate-300 italic bg-slate-900 p-2 rounded-lg border border-slate-800">
                            "{req.customerNotes}"
                          </p>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          {req.status === 'PENDING' ? (
                            <Button
                              variant="brand"
                              size="sm"
                              className="w-full text-xs font-bold py-1.5"
                              onClick={() => handleAcceptRequest(req.id)}
                            >
                              ACCEPT
                            </Button>
                          ) : (
                            <Button
                              variant="success"
                              size="sm"
                              className="w-full text-xs font-bold py-1.5"
                              onClick={() => handleCompleteRequest(req.id)}
                            >
                              COMPLETE
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Active Floor Tables Panel */}
              <Card className="bg-slate-900 border-slate-800 p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-black text-white uppercase tracking-wide">Active Tables</h2>
                    <Badge variant="success">{activeSessionsList.length} Occupied</Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('tables')} className="text-xs text-emerald-400 p-0 h-auto">
                    Floor Plan
                  </Button>
                </div>

                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {activeOccupiedTables.length === 0 ? (
                    <div className="p-5 text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
                      All tables are available.
                    </div>
                  ) : (
                    activeOccupiedTables.map((tbl) => {
                      const session = activeSessionsList.find(
                        (s) => s.tableId === tbl.id || (s.tableNumber && s.tableNumber.toLowerCase() === tbl.tableNumber.toLowerCase())
                      );
                      const tableOrders = orders.filter(
                        (o) => (o.tableId === tbl.id || o.tableNumber === tbl.tableNumber) && o.status !== 'CANCELLED'
                      );
                      const runningTotal = tableOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

                      return (
                        <div
                          key={tbl.id}
                          className="bg-slate-950 p-2.5 rounded-xl border border-emerald-500/30 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-white font-mono">{tbl.tableNumber}</span>
                              <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-500/20">
                                ACTIVE
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                              {tableOrders.length} {tableOrders.length === 1 ? 'order' : 'orders'} • Total: ₹{runningTotal.toFixed(0)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[10px] px-2 py-1 h-auto"
                              onClick={() => setSelectedTableForDetails(tbl)}
                            >
                              VIEW
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              className="text-[10px] px-2 py-1 h-auto bg-rose-950/80 border-rose-500/40 text-rose-300 hover:bg-rose-900"
                              onClick={() => setSelectedTableForClose(tbl)}
                            >
                              CLOSE
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            </div>

            {/* COLUMN 3 (4 COLS): KITCHEN & BAR EXPEDITION TICKETS + INVENTORY ALERTS */}
            <div className="lg:col-span-4 space-y-4">
              {/* Kitchen KDS Live Panel */}
              <Card className="bg-slate-900 border-slate-800 p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ChefHat className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-black text-white uppercase tracking-wide">Kitchen Production</h2>
                    <Badge variant="warning">{kitchenOrders.length}</Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('kitchen')} className="text-xs text-amber-400 p-0 h-auto">
                    KDS View
                  </Button>
                </div>

                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {kitchenOrders.length === 0 ? (
                    <div className="p-6 text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
                      No kitchen tickets in queue.
                    </div>
                  ) : (
                    kitchenOrders.slice(0, 4).map((ord) => {
                      const kitchenItems = ord.items.filter((i) => (i.targetDestination || 'KITCHEN') !== 'BAR');
                      return (
                        <div
                          key={ord.id}
                          className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-white font-mono">{ord.tableNumber}</span>
                            <Badge
                              variant={
                                ord.kitchenStatus === 'READY'
                                  ? 'success'
                                  : ord.kitchenStatus === 'PREPARING'
                                  ? 'warning'
                                  : 'neutral'
                              }
                            >
                              {ord.kitchenStatus || ord.status}
                            </Badge>
                          </div>

                          <div className="text-xs text-slate-300 space-y-0.5">
                            {kitchenItems.map((item, idx) => (
                              <div key={idx} className="flex justify-between font-mono text-[11px]">
                                <span>
                                  {item.quantity}x {item.name}
                                </span>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-1.5 pt-1">
                            {ord.kitchenStatus !== 'PREPARING' && ord.kitchenStatus !== 'READY' && (
                              <Button
                                variant="brand"
                                size="sm"
                                className="w-full text-[11px] py-1 h-auto"
                                onClick={() => handleKitchenStatusUpdate(ord.id, 'PREPARING')}
                              >
                                START PREP
                              </Button>
                            )}
                            {ord.kitchenStatus === 'PREPARING' && (
                              <Button
                                variant="success"
                                size="sm"
                                className="w-full text-[11px] py-1 h-auto"
                                onClick={() => handleKitchenStatusUpdate(ord.id, 'READY')}
                              >
                                MARK READY
                              </Button>
                            )}
                            {ord.kitchenStatus === 'READY' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-[11px] py-1 h-auto"
                                onClick={() => handleKitchenStatusUpdate(ord.id, 'COMPLETED')}
                              >
                                BUMP TICKET
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>

              {/* Inventory Stock Alerts */}
              <Card className="bg-slate-900 border-slate-800 p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-rose-400" />
                    <h2 className="text-sm font-black text-white uppercase tracking-wide">Inventory Alerts</h2>
                    {inventoryAlerts.length > 0 && <Badge variant="danger">{inventoryAlerts.length} Critical</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('inventory')} className="text-xs text-rose-400 p-0 h-auto">
                    Inventory
                  </Button>
                </div>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {inventoryAlerts.length === 0 ? (
                    <div className="p-4 text-center bg-slate-950/60 rounded-xl border border-dashed border-slate-800 text-slate-400 text-xs">
                      All inventory stock levels optimal.
                    </div>
                  ) : (
                    inventoryAlerts.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="bg-slate-950 p-2.5 rounded-xl border border-rose-500/30 flex items-center justify-between"
                      >
                        <div>
                          <span className="text-xs font-bold text-white block">{item.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            Stock: <strong className="text-rose-400">{item.currentStock}</strong> {item.unit || 'units'}
                          </span>
                        </div>
                        <Badge variant="danger">{item.currentStock === 0 ? 'OUT' : 'LOW'}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* VIEW 2: FULL ORDERS WORKSPACE */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-black text-white">Live Orders Management</h1>
              <SearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search by Order #, Table, Customer..."
                className="max-w-xs"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders
                .filter((o) => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    o.tableNumber.toLowerCase().includes(q) ||
                    o.id.toLowerCase().includes(q) ||
                    o.customerName?.toLowerCase().includes(q)
                  );
                })
                .map((ord) => (
                  <Card
                    key={ord.id}
                    className="bg-slate-900 border-slate-800 p-4 space-y-3 hover:border-indigo-500/40 transition-all cursor-pointer"
                    onClick={() => setSelectedOrder(ord)}
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div>
                        <span className="text-base font-black text-white font-mono">{ord.tableNumber}</span>
                        <span className="text-xs text-slate-400 font-mono block">#{ord.id.slice(-6)}</span>
                      </div>
                      <Badge
                        variant={
                          ord.status === 'COMPLETED'
                            ? 'success'
                            : ord.status === 'READY'
                            ? 'warning'
                            : 'brand'
                        }
                      >
                        {ord.status}
                      </Badge>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      {ord.items.map((i, idx) => (
                        <div key={idx} className="flex justify-between text-slate-300">
                          <span>
                            {i.quantity}x {i.name}
                          </span>
                          <span className="font-mono text-slate-400">₹{(i.price * i.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs font-mono">
                      <span className="text-slate-400">Total</span>
                      <span className="text-sm font-black text-white">₹{ord.totalAmount.toFixed(2)}</span>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {/* VIEW 3: FULL TABLES & FLOOR MANAGEMENT */}
        {activeTab === 'tables' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-black text-white">Floor Tables & Live Sessions</h1>
              <span className="text-xs font-mono text-slate-400">
                {activeSessionsList.length} Occupied / {tables.length} Total Tables
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {tables.map((tbl) => {
                const session = activeSessionsList.find(
                  (s) => s.tableId === tbl.id || (s.tableNumber && s.tableNumber.toLowerCase() === tbl.tableNumber.toLowerCase())
                );
                const isOccupied = Boolean(session);
                const tableOrders = orders.filter(
                  (o) => (o.tableId === tbl.id || o.tableNumber === tbl.tableNumber) && o.status !== 'CANCELLED'
                );
                const runningTotal = tableOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

                return (
                  <Card
                    key={tbl.id}
                    className={`p-4 space-y-3 transition-all ${
                      isOccupied
                        ? 'bg-slate-900 border-emerald-500/50 shadow-lg shadow-emerald-950/20'
                        : 'bg-slate-950 border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-black text-white font-mono">{tbl.tableNumber}</span>
                      <Badge variant={isOccupied ? 'success' : 'neutral'}>{isOccupied ? 'OCCUPIED' : 'AVAILABLE'}</Badge>
                    </div>

                    <div className="text-xs text-slate-400 space-y-1 font-mono">
                      <div>Capacity: {tbl.capacity || 4} Guests</div>
                      {isOccupied && (
                        <>
                          <div>Orders: {tableOrders.length} placed</div>
                          <div>Subtotal: ₹{runningTotal.toFixed(2)}</div>
                          <div>Duration: {getElapsedString(session?.sessionStartedAt)}</div>
                        </>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                      {isOccupied ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs"
                            onClick={() => setSelectedTableForDetails(tbl)}
                          >
                            VIEW TAB
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            className="w-full text-xs bg-rose-950 border-rose-500/40 text-rose-300"
                            onClick={() => setSelectedTableForClose(tbl)}
                          >
                            CLOSE
                          </Button>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-500 text-center w-full font-mono py-1">
                          Ready for Guest QR Scan
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 4: KITCHEN KDS STATION */}
        {activeTab === 'kitchen' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-black text-white">Kitchen KDS Production Display</h1>
              <Badge variant="warning">{kitchenOrders.length} Active Orders</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {kitchenOrders.map((ord) => {
                const kitchenItems = ord.items.filter((i) => (i.targetDestination || 'KITCHEN') !== 'BAR');
                return (
                  <Card key={ord.id} className="bg-slate-900 border-slate-800 p-4 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div>
                        <span className="text-base font-black text-white font-mono">{ord.tableNumber}</span>
                        <span className="text-xs text-slate-400 font-mono block">Order #{ord.id.slice(-4)}</span>
                      </div>
                      <span className="text-xs font-mono text-slate-400">{getElapsedString(ord.createdAt)}</span>
                    </div>

                    <div className="space-y-2 text-xs">
                      {kitchenItems.map((item, idx) => (
                        <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                          <div className="flex justify-between font-bold text-white">
                            <span>
                              {item.quantity}x {item.name}
                            </span>
                          </div>
                          {item.notes && <p className="text-[11px] text-amber-300/80 italic mt-0.5">"{item.notes}"</p>}
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                      {ord.kitchenStatus !== 'PREPARING' && ord.kitchenStatus !== 'READY' && (
                        <Button
                          variant="brand"
                          size="sm"
                          className="w-full text-xs font-bold"
                          onClick={() => handleKitchenStatusUpdate(ord.id, 'PREPARING')}
                        >
                          START PREP
                        </Button>
                      )}
                      {ord.kitchenStatus === 'PREPARING' && (
                        <Button
                          variant="success"
                          size="sm"
                          className="w-full text-xs font-bold"
                          onClick={() => handleKitchenStatusUpdate(ord.id, 'READY')}
                        >
                          MARK READY
                        </Button>
                      )}
                      {ord.kitchenStatus === 'READY' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs font-bold"
                          onClick={() => handleKitchenStatusUpdate(ord.id, 'COMPLETED')}
                        >
                          BUMP / CLEAR
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 5: BAR TERMINAL STATION */}
        {activeTab === 'bar' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-black text-white">Bar Lounge Production Display</h1>
              <Badge variant="info">{barOrders.length} Drink Orders</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {barOrders.map((ord) => {
                const barItems = ord.items.filter((i) => (i.targetDestination || '').toUpperCase() === 'BAR' || i.isAlcoholic);
                return (
                  <Card key={ord.id} className="bg-slate-900 border-slate-800 p-4 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <div>
                        <span className="text-base font-black text-white font-mono">{ord.tableNumber}</span>
                        <span className="text-xs text-slate-400 font-mono block">Drink #{ord.id.slice(-4)}</span>
                      </div>
                      <Badge variant="info">{ord.barStatus || 'PENDING'}</Badge>
                    </div>

                    <div className="space-y-2 text-xs">
                      {barItems.map((item, idx) => (
                        <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                          <div className="flex justify-between font-bold text-white">
                            <span>
                              {item.quantity}x {item.name}
                            </span>
                            {item.isAlcoholic && <span className="text-[10px] text-amber-400">21+</span>}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                      {ord.barStatus !== 'PREPARING' && ord.barStatus !== 'READY' && (
                        <Button
                          variant="brand"
                          size="sm"
                          className="w-full text-xs font-bold"
                          onClick={() => handleBarStatusUpdate(ord.id, 'PREPARING')}
                        >
                          START MIXING
                        </Button>
                      )}
                      {ord.barStatus === 'PREPARING' && (
                        <Button
                          variant="success"
                          size="sm"
                          className="w-full text-xs font-bold"
                          onClick={() => handleBarStatusUpdate(ord.id, 'READY')}
                        >
                          DRINK READY
                        </Button>
                      )}
                      {ord.barStatus === 'READY' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs font-bold"
                          onClick={() => handleBarStatusUpdate(ord.id, 'COMPLETED')}
                        >
                          SERVED
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 6: WAITER TERMINAL WORKSPACE */}
        {activeTab === 'waiter' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-black text-white">Floor Waiter Calls & Requests</h1>
              <Badge variant="warning">{pendingWaiterRequests.length} Pending</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingWaiterRequests.map((req) => (
                <Card key={req.id} className="bg-slate-950 p-4 rounded-2xl border border-amber-500/40 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-white font-mono">{req.tableNumber}</span>
                    <Badge variant={req.requestType === 'BILL' ? 'danger' : 'warning'}>{req.requestType}</Badge>
                  </div>

                  {req.customerNotes && (
                    <p className="text-xs text-slate-300 italic bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                      "{req.customerNotes}"
                    </p>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                    <span>Requested</span>
                    <span>{getElapsedString(req.requestedAt)}</span>
                  </div>

                  <div className="pt-2 border-t border-slate-900 flex items-center gap-2">
                    {req.status === 'PENDING' ? (
                      <Button
                        variant="brand"
                        size="sm"
                        className="w-full text-xs font-bold"
                        onClick={() => handleAcceptRequest(req.id)}
                      >
                        ACCEPT REQUEST
                      </Button>
                    ) : (
                      <Button
                        variant="success"
                        size="sm"
                        className="w-full text-xs font-bold"
                        onClick={() => handleCompleteRequest(req.id)}
                      >
                        COMPLETE & CLEAR
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 7: INVENTORY OS */}
        {activeTab === 'inventory' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-black text-white">Stock & Inventory Management</h1>
              <Badge variant="danger">{inventoryAlerts.length} Stock Alerts</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {inventory.map((item) => (
                <Card key={item.id} className="bg-slate-900 border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{item.name}</span>
                    <Badge
                      variant={
                        item.currentStock === 0
                          ? 'danger'
                          : item.currentStock <= (item.minThreshold || 5)
                          ? 'warning'
                          : 'success'
                      }
                    >
                      {item.currentStock === 0 ? 'OUT OF STOCK' : item.currentStock <= (item.minThreshold || 5) ? 'LOW STOCK' : 'IN STOCK'}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                    <span>Current Stock</span>
                    <span className="text-sm font-bold text-white">
                      {item.currentStock} {item.unit || 'units'}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 8: BILLING & POS PAYMENTS */}
        {activeTab === 'billing' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-black text-white">Billing & POS Settle Center</h1>
              <span className="text-sm font-bold text-violet-400 font-mono">
                Total Live Revenue: ₹{billingSummary.activeTotalRevenue.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeOccupiedTables.map((tbl) => {
                const session = activeSessionsList.find(
                  (s) => s.tableId === tbl.id || (s.tableNumber && s.tableNumber.toLowerCase() === tbl.tableNumber.toLowerCase())
                );
                const tableOrders = orders.filter(
                  (o) => (o.tableId === tbl.id || o.tableNumber === tbl.tableNumber) && o.status !== 'CANCELLED'
                );
                const runningTotal = tableOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

                return (
                  <Card key={tbl.id} className="bg-slate-900 border-slate-800 p-4 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-base font-black text-white font-mono">{tbl.tableNumber}</span>
                      <Badge variant="warning">BILL PENDING</Badge>
                    </div>

                    <div className="text-xs space-y-1 font-mono text-slate-300">
                      <div>Orders: {tableOrders.length} placed</div>
                      <div>Total Bill: ₹{runningTotal.toFixed(2)}</div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                      <Button
                        variant="brand"
                        size="sm"
                        className="w-full text-xs font-bold"
                        onClick={() => setSelectedTableForDetails(tbl)}
                      >
                        SETTLE / PRINT
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => setSelectedTableForClose(tbl)}
                      >
                        CLOSE TABLE
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* =========================================================================
          MODALS: ORDER DETAILS, TABLE DETAILS, CLOSE TABLE CONFIRMATION
          ========================================================================= */}

      {/* Order Details Modal */}
      {selectedOrder && (
        <Modal isOpen={Boolean(selectedOrder)} onClose={() => setSelectedOrder(null)} title={`Order #${selectedOrder.id.slice(-6)}`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-mono border-b border-slate-800 pb-2">
              <span className="text-slate-400">Table: <strong className="text-white">{selectedOrder.tableNumber}</strong></span>
              <span className="text-slate-400">Status: <strong className="text-rose-400">{selectedOrder.status}</strong></span>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block font-mono">Ordered Items</span>
              {selectedOrder.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs">
                  <div>
                    <span className="font-bold text-white">{item.quantity}x {item.name}</span>
                    <span className="text-[10px] text-slate-400 block font-mono">Station: {item.targetDestination || 'KITCHEN'}</span>
                  </div>
                  <span className="font-mono font-bold text-slate-200">₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-sm font-mono">
              <span className="text-slate-400">Grand Total</span>
              <span className="text-base font-black text-white">₹{selectedOrder.totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </Modal>
      )}

      {/* Table Details & Active Orders Modal */}
      {selectedTableForDetails && (
        <Modal
          isOpen={Boolean(selectedTableForDetails)}
          onClose={() => setSelectedTableForDetails(null)}
          title={`Table ${selectedTableForDetails.tableNumber} - Running Tab`}
        >
          <div className="space-y-4">
            {orders.filter(
              (o) =>
                (o.tableId === selectedTableForDetails.id || o.tableNumber === selectedTableForDetails.tableNumber) &&
                o.status !== 'CANCELLED'
            ).length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No active orders placed on this table yet.</p>
            ) : (
              orders
                .filter(
                  (o) =>
                    (o.tableId === selectedTableForDetails.id || o.tableNumber === selectedTableForDetails.tableNumber) &&
                    o.status !== 'CANCELLED'
                )
                .map((ord) => (
                  <div key={ord.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between font-mono">
                      <span className="font-bold text-white">Order #{ord.id.slice(-4)}</span>
                      <span className="text-slate-400">₹{ord.totalAmount.toFixed(2)}</span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </div>
                  </div>
                ))
            )}

            <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedTableForDetails(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Close Table Confirmation Modal */}
      {selectedTableForClose && (
        <Modal
          isOpen={Boolean(selectedTableForClose)}
          onClose={() => setSelectedTableForClose(null)}
          title={`Close Session: ${selectedTableForClose.tableNumber}`}
        >
          <div className="space-y-4">
            <div className="bg-rose-950/40 border border-rose-500/30 p-3.5 rounded-xl text-xs text-rose-300 space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span>Confirm Permanent Session Closure</span>
              </div>
              <p>
                Closing <strong>{selectedTableForClose.tableNumber}</strong> will mark the table as <strong>AVAILABLE</strong> in Neon PostgreSQL and clear active orders.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedTableForClose(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="bg-rose-600 hover:bg-rose-500 font-bold"
                onClick={handleExecuteCloseTable}
                disabled={isClosingTable}
              >
                {isClosingTable ? 'Closing...' : 'Close & Reset Table'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Toast Notification Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 duration-300">
          <div
            className={`p-3.5 rounded-xl border shadow-2xl flex items-center gap-3 text-xs max-w-sm ${
              toast.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
                : toast.type === 'warning'
                ? 'bg-amber-950/95 border-amber-500/50 text-amber-200'
                : 'bg-slate-900/95 border-slate-800 text-slate-200'
            }`}
          >
            <Bell className="w-4 h-4 shrink-0 text-amber-400" />
            <div>
              <span className="font-bold block text-white">{toast.title}</span>
              <span className="text-[11px] text-slate-300">{toast.desc}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
