import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Clock,
  CheckCircle2,
  AlertCircle,
  Flame,
  Coffee,
  Sparkles,
  PhoneCall,
  Receipt,
  Search,
  Filter,
  Volume2,
  VolumeX,
  LogOut,
  Zap,
  Utensils,
  ChevronRight,
  Activity,
  RefreshCw,
  Wine,
  FileText,
  CheckSquare,
  Sparkles as SparklesIcon,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Avatar,
  SearchInput,
} from '../../packages/ui';
import { api } from '../../packages/api/client';
import {
  Order,
  Table,
  CustomerRequest,
  CustomerRequestType,
  CustomerRequestStatus,
  WaiterNotification,
} from '../../packages/types';
import { realtimeBus } from '../../packages/api/realtime';
import { useTheme } from '../../packages/theme/ThemeEngine';

// Web Audio API Chime Synthesizer for notifications
const playNotificationChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

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
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.45);
  } catch (err) {
    // Audio context fallback
  }
};

interface WaiterTerminalOSProps {
  onLogout?: () => void;
}

export const WaiterTerminalOS: React.FC<WaiterTerminalOSProps> = ({ onLogout }) => {
  const { formatPrice } = useTheme();

  // Navigation tab state - ONLY the 4 required views allowed in Waiter Terminal MVP
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'active-tables' | 'pending-calls' | 'ready-plates'
  >('dashboard');

  // Preferences & Status State
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isErrorState, setIsErrorState] = useState<boolean>(false);

  // Core Data State
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [notifications, setNotifications] = useState<WaiterNotification[]>([]);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    desc: string;
    type: 'info' | 'success' | 'warning';
  } | null>(null);

  const showToast = (
    title: string,
    desc: string,
    type: 'info' | 'success' | 'warning' = 'info'
  ) => {
    setToastMessage({ title, desc, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Authenticated user & restaurant resolution
  const currentUser = api.getCurrentUser();
  const currentRestaurantId = api.getCurrentRestaurantId() || currentUser?.restaurantId || 'rest-1';
  const waiterName = currentUser?.name || 'Ayaan';

  // Live Clock Tick
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch data strictly for authenticated employee's restaurant
  const loadData = async () => {
    try {
      setIsErrorState(false);
      const targetRestId = currentRestaurantId;

      const [reqData, ordData, tblData, notifData] = await Promise.all([
        api.getCustomerRequests(targetRestId),
        api.getOrders(targetRestId),
        api.getTables(targetRestId),
        api.getWaiterNotifications(targetRestId),
      ]);

      setRequests(reqData);
      setOrders(ordData);
      setTables(tblData);
      setNotifications(notifData);
    } catch (err) {
      console.error('Failed to load Waiter Terminal data:', err);
      setIsErrorState(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Setup Real-time WebSockets / Event Bus Listener (Scoped by restaurant_id)
  useEffect(() => {
    loadData();

    const unsubscribe = realtimeBus.subscribe((event) => {
      // Filter events strictly by restaurantId for multi-tenant isolation
      if (event.restaurantId && event.restaurantId !== currentRestaurantId) {
        return;
      }

      loadData();

      if (!isAudioMuted) {
        playNotificationChime();
      }

      if (event.type === 'CustomerRequestCreated' || event.type === 'WaiterCalled') {
        showToast(
          'Customer Service Call 🛎️',
          `${event.tableNumber || 'Table'} requested assistance`,
          'warning'
        );
      } else if (event.type === 'OrderReady') {
        showToast(
          'Order Plated & Ready 🔥',
          `Order #${event.orderId} for ${event.tableNumber} is ready for pickup`,
          'success'
        );
      } else if (event.type === 'BillRequested') {
        showToast(
          'Bill Check Request 🧾',
          `${event.tableNumber || 'Table'} requested final bill`,
          'info'
        );
      } else if (event.type === 'TableStatusChanged' || event.type === 'TableStatusUpdated') {
        showToast('Table Session Updated 🪑', `Status updated for ${event.tableNumber || 'Table'}`, 'info');
      }
    });

    return () => unsubscribe();
  }, [isAudioMuted, currentRestaurantId]);

  // Request Actions (Workflow: PENDING -> ACCEPT -> IN_PROGRESS -> COMPLETE)
  const handleAcceptRequest = async (requestId: string) => {
    try {
      await api.acceptCustomerRequest(requestId, waiterName);
      showToast('Request Accepted ✅', 'Customer request accepted.', 'success');
      loadData();
    } catch (err) {
      showToast('Error', 'Failed to accept request', 'warning');
    }
  };

  const handleCompleteRequest = async (requestId: string) => {
    try {
      await api.updateCustomerRequestStatus(requestId, 'COMPLETED', waiterName);
      showToast('Request Completed ✅', 'Request fulfilled and cleared.', 'success');
      loadData();
    } catch (err) {
      showToast('Error', 'Failed to complete request', 'warning');
    }
  };

  // Order Delivery Handler (Valid transition: READY -> DELIVERED)
  const handleDeliverOrder = async (orderId: string) => {
    try {
      await api.deliverOrder(orderId);
      showToast('Order Delivered 🎉', `Order #${orderId} delivered to customer`, 'success');
      loadData();
    } catch (err: any) {
      showToast('Delivery Error ⚠️', err.message || 'Failed to deliver order', 'warning');
    }
  };

  // Computed data collections
  const activeTablesList = useMemo(() => {
    return tables.filter((t) => {
      // Find matching orders
      const tableOrders = orders.filter(
        (o) => t.tableNumber && o.tableNumber && o.tableNumber.toLowerCase() === t.tableNumber.toLowerCase() && o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
      );
      const isActive =
        t.status === 'OCCUPIED' ||
        t.status === 'WAITER_CALLED' ||
        t.status === 'BILL_REQUESTED' ||
        t.status === 'WAITING_FOR_SERVICE' ||
        t.isOccupied === true ||
        tableOrders.length > 0;

      if (!isActive) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.tableNumber.toLowerCase().includes(q) ||
          (t.assignedWaiterName && t.assignedWaiterName.toLowerCase().includes(q)) ||
          (tableOrder && tableOrder.id.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [tables, orders, searchQuery]);

  const pendingCallsList = useMemo(() => {
    return requests.filter((r) => {
      const isPendingOrActive = r.status === 'PENDING' || r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS';
      if (!isPendingOrActive) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.tableNumber.toLowerCase().includes(q) ||
          r.requestType.toLowerCase().includes(q) ||
          (r.customTitle && r.customTitle.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [requests, searchQuery]);

  const readyPlatesList = useMemo(() => {
    return orders.filter((o) => {
      if (o.status !== 'READY') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          o.id.toLowerCase().includes(q) ||
          o.tableNumber.toLowerCase().includes(q) ||
          o.items.some((i) => i.name.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [orders, searchQuery]);

  // Helper for Occupied Duration
  const getOccupiedDuration = (sessionStart?: string, orderCreated?: string) => {
    const timestamp = sessionStart || orderCreated;
    if (!timestamp) return '12 min';
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    return `${mins} min`;
  };

  // Helper for Request Time Elapsed
  const getTimeElapsed = (timestamp?: string) => {
    if (!timestamp) return 'Just now';
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    return mins === 0 ? 'Just now' : `${mins} min ago`;
  };

  // Request Badge Helper
  const getRequestBadge = (type: CustomerRequestType, title?: string) => {
    switch (type) {
      case 'WATER':
        return <Badge variant="info" className="flex items-center gap-1"><Wine className="w-3 h-3" /> Water</Badge>;
      case 'BILL':
        return <Badge variant="warning" className="flex items-center gap-1"><Receipt className="w-3 h-3" /> Bill</Badge>;
      case 'EXTRA_SPOON':
      case 'EXTRA_PLATE':
      case 'CUTLERY':
        return <Badge variant="outline" className="flex items-center gap-1 border-amber-500/50 text-amber-300"><Utensils className="w-3 h-3" /> Spoon / Cutlery</Badge>;
      case 'TISSUE':
      case 'NAPKINS':
        return <Badge variant="outline" className="flex items-center gap-1 border-purple-500/50 text-purple-300"><FileText className="w-3 h-3" /> Tissue</Badge>;
      case 'CALL_WAITER':
        return <Badge variant="danger" className="flex items-center gap-1 animate-pulse"><PhoneCall className="w-3 h-3" /> Call Waiter</Badge>;
      case 'CUSTOM':
      default:
        return <Badge variant="brand" className="flex items-center gap-1"><SparklesIcon className="w-3 h-3" /> {title || 'Custom'}</Badge>;
    }
  };

  const getTableStatusBadge = (status: Table['status']) => {
    switch (status) {
      case 'OCCUPIED':
        return <Badge variant="success">OCCUPIED</Badge>;
      case 'BILL_REQUESTED':
        return <Badge variant="warning" className="animate-pulse">BILL REQUESTED</Badge>;
      case 'WAITER_CALLED':
      case 'WAITING_FOR_SERVICE':
        return <Badge variant="danger" className="animate-pulse">CALL WAITER</Badge>;
      default:
        return <Badge variant="outline">OCCUPIED</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-rose-500 selection:text-white">
      {/* Toast Feedback Overlay */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center gap-3 min-w-[320px] ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-100'
                : toastMessage.type === 'warning'
                ? 'bg-rose-950/90 border-rose-500/50 text-rose-100'
                : 'bg-slate-900/90 border-sky-500/50 text-sky-100'
            }`}
          >
            <Sparkles className="w-5 h-5 text-amber-400 animate-spin" />
            <div>
              <p className="text-sm font-bold">{toastMessage.title}</p>
              <p className="text-xs opacity-90">{toastMessage.desc}</p>
            </div>
          </div>
        </div>
      )}

      {/* HEADER BAR */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-40 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-2xl">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-amber-500 p-0.5 shadow-lg shadow-emerald-950/50 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <PhoneCall className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white tracking-tight">Waiter Terminal OS</h1>
              <Badge variant="success" className="text-[10px] py-0 px-1.5 font-mono">MVP</Badge>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              <span className="text-emerald-400 font-semibold">ONLINE & REALTIME DISPATCH</span>
            </p>
          </div>
        </div>

        {/* Authenticated Staff Info & Actions */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-3 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
            <Avatar src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100" name={waiterName} size="sm" />
            <div>
              <p className="font-bold text-white flex items-center gap-1">
                <span>{waiterName}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" title="Online Status: ON_CLOCK" />
              </p>
              <p className="text-[10px] text-emerald-400 font-mono">🟢 ONLINE</p>
            </div>
          </div>

          {/* Clock */}
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2 font-mono text-amber-400 font-bold">
            <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            <span>{currentTime || '08:42 PM'}</span>
          </div>

          {/* Audio Chime Toggle */}
          <button
            onClick={() => setIsAudioMuted(!isAudioMuted)}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-all border border-slate-700/50"
            title={isAudioMuted ? 'Enable Audio Chime' : 'Mute Audio Chime'}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await api.logout();
              if (onLogout) onLogout();
              else window.location.href = '/waiter/login';
            }}
            className="text-xs bg-slate-900 border-slate-700 hover:bg-rose-500/10 text-slate-300 hover:text-rose-400 flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span>Logout</span>
          </Button>
        </div>
      </header>

      {/* ERROR / RECONNECT BANNER */}
      {isErrorState && (
        <div className="bg-rose-950/90 border-b border-rose-800 px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Unable to connect to restaurant server. Realtime events may be paused.</span>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="text-xs border-rose-700 hover:bg-rose-900 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            <span>RETRY</span>
          </Button>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* SIDEBAR NAVIGATION - CONTAINS ONLY REQUIRED 4 MODULES */}
        <aside className="w-full lg:w-64 bg-slate-900/60 border-r border-slate-800/80 p-3 flex lg:flex-col justify-between shrink-0 overflow-x-auto lg:overflow-y-auto scrollbar-none">
          <div className="flex lg:flex-col gap-1.5 w-full min-w-[500px] lg:min-w-0">
            <div className="px-3 py-2 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider hidden lg:block">
              Waiter Terminal Navigation
            </div>

            {/* Tab 1: Dashboard Overview */}
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all text-left w-full ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-4.5 h-4.5 text-emerald-300" />
              <span>Dashboard Overview</span>
            </button>

            {/* Tab 2: Active Tables */}
            <button
              onClick={() => setActiveTab('active-tables')}
              className={`flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all text-left w-full ${
                activeTab === 'active-tables'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Utensils className="w-4.5 h-4.5 text-sky-400" />
                <span>Active Tables</span>
              </div>
              <Badge variant="outline" className="text-[10px] py-0.5 px-2 border-sky-500/40 text-sky-300">
                {activeTablesList.length}
              </Badge>
            </button>

            {/* Tab 3: Pending Calls */}
            <button
              onClick={() => setActiveTab('pending-calls')}
              className={`flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all text-left w-full ${
                activeTab === 'pending-calls'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <PhoneCall className="w-4.5 h-4.5 text-amber-400" />
                <span>Pending Calls</span>
              </div>
              {pendingCallsList.length > 0 && (
                <Badge variant="warning" className="text-[10px] py-0.5 px-2 animate-pulse">
                  {pendingCallsList.length}
                </Badge>
              )}
            </button>

            {/* Tab 4: Ready Plates */}
            <button
              onClick={() => setActiveTab('ready-plates')}
              className={`flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition-all text-left w-full ${
                activeTab === 'ready-plates'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Flame className="w-4.5 h-4.5 text-rose-400" />
                <span>Ready Plates</span>
              </div>
              {readyPlatesList.length > 0 && (
                <Badge variant="success" className="text-[10px] py-0.5 px-2">
                  {readyPlatesList.length}
                </Badge>
              )}
            </button>
          </div>
        </aside>

        {/* MAIN DISPLAY AREA */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 bg-slate-950/80">
          {/* SEARCH & REFRESH BAR */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <div className="flex-1 min-w-[240px]">
              <SearchInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search table #, order #, or customer request..."
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="text-xs bg-slate-950 border-slate-800 hover:bg-slate-800 text-slate-300 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          </div>

          {/* COUNTERS HEADER */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              onClick={() => setActiveTab('active-tables')}
              className="bg-slate-900/90 border-slate-800 p-4 space-y-1.5 cursor-pointer hover:border-sky-500/50 transition-all shadow-xl group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider">Active Tables</span>
                <Utensils className="w-5 h-5 text-sky-400 group-hover:scale-110 transition-transform" />
              </div>
              <p className="text-2xl font-black text-white font-mono">{activeTablesList.length}</p>
              <p className="text-xs text-slate-400">Currently occupied or requiring service</p>
            </Card>

            <Card
              onClick={() => setActiveTab('pending-calls')}
              className="bg-slate-900/90 border-slate-800 p-4 space-y-1.5 cursor-pointer hover:border-amber-500/50 transition-all shadow-xl group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">Pending Calls</span>
                <PhoneCall className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
              </div>
              <p className="text-2xl font-black text-amber-400 font-mono">{pendingCallsList.length}</p>
              <p className="text-xs text-slate-400">Customer requests waiting for service</p>
            </Card>

            <Card
              onClick={() => setActiveTab('ready-plates')}
              className="bg-slate-900/90 border-slate-800 p-4 space-y-1.5 cursor-pointer hover:border-emerald-500/50 transition-all shadow-xl group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">Ready Plates</span>
                <Flame className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              </div>
              <p className="text-2xl font-black text-emerald-400 font-mono">{readyPlatesList.length}</p>
              <p className="text-xs text-slate-400">Plated orders ready at kitchen pass</p>
            </Card>
          </div>

          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Quick Section 1: Active Tables Preview */}
              <Card className="bg-slate-900/90 border-slate-800 p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-5 h-5 text-sky-400" />
                    <h2 className="text-base font-bold text-white">Active Floor Tables</h2>
                    <Badge variant="outline" className="border-sky-500/40 text-sky-300">
                      {activeTablesList.length} Active
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('active-tables')} className="text-xs">
                    <span>View Active Tables</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>

                {activeTablesList.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-dashed border-slate-800 space-y-2">
                    <Utensils className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-sm font-bold text-slate-300">No active tables right now.</p>
                    <p className="text-xs text-slate-400">Tables will show up when customer sessions begin or orders are placed.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeTablesList.slice(0, 6).map((table) => {
                      const tableOrders = orders.filter(
                        (o) => o.tableNumber.toLowerCase() === table.tableNumber.toLowerCase() && o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
                      );
                      const itemCount = tableOrders.reduce((sum, o) => sum + o.items.reduce((iSum, i) => iSum + i.quantity, 0), 0);
                      const latestOrder = tableOrders[0];

                      return (
                        <div
                          key={table.id}
                          className="bg-slate-950 p-4 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all space-y-3 shadow-lg"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-lg font-black text-white font-mono tracking-tight">{table.tableNumber}</h3>
                              <div className="mt-1">{getTableStatusBadge(table.status)}</div>
                            </div>
                            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2.5 py-1 rounded-lg">
                              ⏱️ {getOccupiedDuration(table.sessionStartedAt, latestOrder?.createdAt)}
                            </span>
                          </div>

                          <div className="space-y-1 text-xs text-slate-300 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                            <p className="font-semibold text-white">
                              {tableOrders.length > 1
                                ? `${tableOrders.length} Active Orders (${tableOrders.map((o) => `#${o.id}`).join(', ')})`
                                : latestOrder
                                ? `Order #${latestOrder.id}`
                                : 'No active order'}
                            </p>
                            <p className="text-slate-400 flex items-center justify-between">
                              <span>Item count:</span>
                              <span className="font-bold text-slate-200">{itemCount} items</span>
                            </p>
                            <p className="text-slate-400 flex items-center justify-between">
                              <span>Assigned waiter:</span>
                              <span className="font-bold text-emerald-400">{table.assignedWaiterName || waiterName}</span>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Quick Section 2: Pending Calls Preview */}
              <Card className="bg-slate-900/90 border-slate-800 p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-5 h-5 text-amber-400 animate-bounce" />
                    <h2 className="text-base font-bold text-white">Pending Customer Requests</h2>
                    <Badge variant="warning">{pendingCallsList.length} Pending</Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('pending-calls')} className="text-xs">
                    <span>View Pending Calls</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>

                {pendingCallsList.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-dashed border-slate-800 space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                    <p className="text-sm font-bold text-slate-300">No pending customer requests.</p>
                    <p className="text-xs text-slate-400">All table requests have been handled.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pendingCallsList.slice(0, 4).map((req) => (
                      <div
                        key={req.id}
                        className="bg-slate-950 p-4 rounded-2xl border border-amber-500/30 hover:border-amber-500/60 transition-all space-y-3 shadow-lg"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-lg font-black text-white font-mono">{req.tableNumber}</span>
                            <div className="mt-1">{getRequestBadge(req.requestType, req.customTitle)}</div>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded-md">
                            {getTimeElapsed(req.requestedAt)}
                          </span>
                        </div>

                        {req.customerNotes && (
                          <p className="text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 italic">
                            "{req.customerNotes}"
                          </p>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          {req.status === 'PENDING' ? (
                            <Button
                              variant="brand"
                              size="sm"
                              className="w-full text-xs font-bold"
                              onClick={() => handleAcceptRequest(req.id)}
                            >
                              ACCEPT
                            </Button>
                          ) : (
                            <Button
                              variant="success"
                              size="sm"
                              className="w-full text-xs font-bold"
                              onClick={() => handleCompleteRequest(req.id)}
                            >
                              COMPLETE
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Quick Section 3: Ready Plates Preview */}
              <Card className="bg-slate-900/90 border-slate-800 p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-emerald-400 animate-pulse" />
                    <h2 className="text-base font-bold text-white">Kitchen Ready Plates Pass</h2>
                    <Badge variant="success">{readyPlatesList.length} Ready</Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('ready-plates')} className="text-xs">
                    <span>View Ready Plates</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>

                {readyPlatesList.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-dashed border-slate-800 space-y-2">
                    <Coffee className="w-8 h-8 text-slate-500 mx-auto" />
                    <p className="text-sm font-bold text-slate-300">No ready plates right now.</p>
                    <p className="text-xs text-slate-400">Kitchen staff will mark orders READY when prep completes.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {readyPlatesList.slice(0, 4).map((order) => (
                      <div
                        key={order.id}
                        className="bg-slate-950 p-4 rounded-2xl border border-emerald-500/40 hover:border-emerald-500/70 transition-all space-y-3 shadow-lg"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono text-emerald-400 font-bold block">ORDER #{order.id}</span>
                            <h3 className="text-lg font-black text-white font-mono">{order.tableNumber}</h3>
                          </div>
                          <Badge variant="success">READY</Badge>
                        </div>

                        <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1.5">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between items-center text-xs text-slate-200">
                              <span className="font-semibold">{item.name}</span>
                              <span className="font-mono text-emerald-400 font-bold">×{item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        <Button
                          variant="success"
                          size="sm"
                          className="w-full text-xs font-bold py-2.5 shadow-lg"
                          onClick={() => handleDeliverOrder(order.id)}
                        >
                          DELIVER
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* TAB 2: ACTIVE TABLES */}
          {activeTab === 'active-tables' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">Active Floor Tables</h2>
                  <p className="text-xs text-slate-400">Real-time table status and active customer orders</p>
                </div>
                <Badge variant="outline" className="border-sky-500/40 text-sky-300 font-mono">
                  {activeTablesList.length} Active
                </Badge>
              </div>

              {activeTablesList.length === 0 ? (
                <Card className="bg-slate-900 border-slate-800 p-12 text-center space-y-3 rounded-3xl">
                  <Utensils className="w-12 h-12 text-slate-600 mx-auto" />
                  <h3 className="text-base font-bold text-white">No active tables right now.</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    All tables are currently clear. When customers scan table QR codes or open table sessions, active tables will be listed here in real-time.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeTablesList.map((table) => {
                    const tableOrders = orders.filter(
                      (o) => o.tableNumber.toLowerCase() === table.tableNumber.toLowerCase() && o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
                    );
                    const itemCount = tableOrders.reduce((sum, o) => sum + o.items.reduce((iSum, i) => iSum + i.quantity, 0), 0);
                    const latestOrder = tableOrders[0];

                    return (
                      <Card
                        key={table.id}
                        className="bg-slate-900/90 border-slate-800/90 p-5 space-y-4 rounded-3xl shadow-xl hover:border-slate-700 transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-2xl font-black text-white font-mono tracking-tight">
                              {table.tableNumber}
                            </span>
                            <div className="mt-1">{getTableStatusBadge(table.status)}</div>
                          </div>
                          <span className="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-3 py-1 rounded-xl">
                            ⏱️ {getOccupiedDuration(table.sessionStartedAt, latestOrder?.createdAt)}
                          </span>
                        </div>

                        <div className="space-y-2 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-xs">
                          <div className="flex justify-between items-center pb-1.5 border-b border-slate-800/80">
                            <span className="text-slate-400 font-medium">Active Orders</span>
                            <span className="font-bold text-white font-mono">
                              {tableOrders.length > 1
                                ? `${tableOrders.length} Orders (${tableOrders.map((o) => `#${o.id}`).join(', ')})`
                                : latestOrder
                                ? `Order #${latestOrder.id}`
                                : 'No active order'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center py-1">
                            <span className="text-slate-400 font-medium">Item Count</span>
                            <span className="font-bold text-slate-200 font-mono">{itemCount} items</span>
                          </div>

                          <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
                            <span className="text-slate-400 font-medium">Assigned Waiter</span>
                            <span className="font-bold text-emerald-400">{table.assignedWaiterName || waiterName}</span>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PENDING CALLS */}
          {activeTab === 'pending-calls' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">Pending Customer Requests</h2>
                  <p className="text-xs text-slate-400">Floor assistance, cutlery, water calls and bill check requests</p>
                </div>
                <Badge variant="warning" className="font-mono">
                  {pendingCallsList.length} Pending
                </Badge>
              </div>

              {pendingCallsList.length === 0 ? (
                <Card className="bg-slate-900 border-slate-800 p-12 text-center space-y-3 rounded-3xl">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                  <h3 className="text-base font-bold text-white">No pending customer requests.</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    There are no pending assistance calls right now. New customer requests will pop up in real-time.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingCallsList.map((req) => (
                    <Card
                      key={req.id}
                      className="bg-slate-900/90 border-amber-500/30 p-5 space-y-4 rounded-3xl shadow-xl hover:border-amber-500/60 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-2xl font-black text-white font-mono tracking-tight">{req.tableNumber}</span>
                          <div className="mt-1">{getRequestBadge(req.requestType, req.customTitle)}</div>
                        </div>
                        <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800">
                          {getTimeElapsed(req.requestedAt)}
                        </span>
                      </div>

                      <div className="space-y-2 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Status</span>
                          <Badge
                            variant={req.status === 'ACCEPTED' || req.status === 'IN_PROGRESS' ? 'info' : 'warning'}
                            className="font-mono"
                          >
                            {req.status}
                          </Badge>
                        </div>

                        <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                          <span className="text-slate-400">Assigned Waiter</span>
                          <span className="font-bold text-emerald-400">
                            {req.assignedWaiterName || waiterName}
                          </span>
                        </div>
                      </div>

                      {req.customerNotes && (
                        <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-2xl border border-slate-800 italic">
                          "{req.customerNotes}"
                        </p>
                      )}

                      <div className="pt-1">
                        {req.status === 'PENDING' ? (
                          <Button
                            variant="brand"
                            size="sm"
                            className="w-full text-xs font-bold py-2.5 shadow-lg"
                            onClick={() => handleAcceptRequest(req.id)}
                          >
                            ACCEPT
                          </Button>
                        ) : (
                          <Button
                            variant="success"
                            size="sm"
                            className="w-full text-xs font-bold py-2.5 shadow-lg"
                            onClick={() => handleCompleteRequest(req.id)}
                          >
                            COMPLETE
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: READY PLATES */}
          {activeTab === 'ready-plates' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">Ready Kitchen Plates Pass</h2>
                  <p className="text-xs text-slate-400">Orders marked READY by Kitchen waiting for floor delivery</p>
                </div>
                <Badge variant="success" className="font-mono">
                  {readyPlatesList.length} Ready
                </Badge>
              </div>

              {readyPlatesList.length === 0 ? (
                <Card className="bg-slate-900 border-slate-800 p-12 text-center space-y-3 rounded-3xl">
                  <Coffee className="w-12 h-12 text-slate-500 mx-auto" />
                  <h3 className="text-base font-bold text-white">No ready plates right now.</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    The kitchen pass is clear. Plated dishes marked READY by chefs will appear here immediately for delivery.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {readyPlatesList.map((order) => (
                    <Card
                      key={order.id}
                      className="bg-slate-900/90 border-emerald-500/40 p-5 space-y-4 rounded-3xl shadow-xl hover:border-emerald-500/70 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-mono font-bold text-emerald-400 block">ORDER #{order.id}</span>
                          <h3 className="text-2xl font-black text-white font-mono tracking-tight">{order.tableNumber}</h3>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="success" className="font-mono">READY</Badge>
                          <span className="text-[10px] font-mono text-slate-400">
                            {getTimeElapsed(order.readyAt || order.updatedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Food Items & Quantity */}
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-800 pb-1">
                          Food Items & Quantities
                        </span>
                        <div className="space-y-1.5">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between items-center text-xs text-slate-200">
                              <span className="font-semibold">{item.name}</span>
                              <span className="font-mono text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-lg">
                                ×{item.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* DELIVER Action */}
                      <Button
                        variant="success"
                        size="sm"
                        className="w-full text-xs font-bold py-3 shadow-lg flex items-center justify-center gap-2"
                        onClick={() => handleDeliverOrder(order.id)}
                      >
                        <CheckSquare className="w-4 h-4" />
                        <span>DELIVER</span>
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
