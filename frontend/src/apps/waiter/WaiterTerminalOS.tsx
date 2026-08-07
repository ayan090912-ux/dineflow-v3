import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  AlertTriangle,
  Flame,
  DollarSign,
  Coffee,
  Sparkles,
  PhoneCall,
  Receipt,
  Eye,
  Search,
  Filter,
  Volume2,
  VolumeX,
  LogOut,
  UserCheck,
  Zap,
  MapPin,
  Utensils,
  ChevronRight,
  Send,
  MessageSquare,
  ShieldAlert,
  Sparkle,
  Layers,
  Activity,
  Award,
  TrendingUp,
  RefreshCw,
  Users,
  CheckSquare,
  XCircle,
  ArrowRightLeft,
  HelpCircle,
  Sparkles as SparklesIcon,
  Wine,
  FileText,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Input,
  Modal,
  StatsCard,
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
  ShiftSummaryData,
  Employee,
} from '../../packages/types';
import { realtimeBus } from '../../packages/api/realtime';
import { useTheme } from '../../packages/theme/ThemeEngine';

// Web Audio API Chime Synthesizer
const playNotificationChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // First tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.25);

    // Second tone (higher harmony)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.12);
    osc2.stop(ctx.currentTime + 0.45);
  } catch (err) {
    // Audio context play blocked or unsupported
  }
};

interface WaiterTerminalOSProps {
  onLogout?: () => void;
}

export const WaiterTerminalOS: React.FC<WaiterTerminalOSProps> = ({ onLogout }) => {
  // Navigation & View state
  const { formatPrice } = useTheme();
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'dispatch' | 'ready-orders' | 'floor-plan' | 'pending-calls' | 'table-sessions' | 'history' | 'profile' | 'settings'
  >('dashboard');

  // Audio mute preference
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);

  // Live Time state
  const [currentTime, setCurrentTime] = useState<string>('');

  // Core Data State
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [notifications, setNotifications] = useState<WaiterNotification[]>([]);
  const [shiftSummary, setShiftSummary] = useState<ShiftSummaryData | null>(null);

  // UI Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | 'URGENT' | 'HIGH' | 'MEDIUM'>('ALL');
  const [tableFilter, setTableFilter] = useState<'ALL' | 'OCCUPIED' | 'WAITING' | 'BILL' | 'VIP'>('ALL');

  // Modals & Drawers
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [selectedTableForSession, setSelectedTableForSession] = useState<Table | null>(null);
  const [selectedRequestForDetail, setSelectedRequestForDetail] = useState<CustomerRequest | null>(null);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastMessageText, setBroadcastMessageText] = useState('');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferRequestId, setTransferRequestId] = useState<string | null>(null);
  const [targetWaiterName, setTargetWaiterName] = useState('Jessica Tanaka');
  const [isReportProblemModalOpen, setIsReportProblemModalOpen] = useState(false);
  const [reportProblemOrder, setReportProblemOrder] = useState<Order | null>(null);
  const [problemDescription, setProblemDescription] = useState('');

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string; type: 'info' | 'success' | 'warning' } | null>(null);

  const showToast = (title: string, desc: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setToastMessage({ title, desc, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Clock tick
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch initial data
  const loadData = async () => {
    try {
      const [reqData, ordData, tblData, notifData, shiftData] = await Promise.all([
        api.getCustomerRequests('rest-1'),
        api.getOrders('rest-1'),
        api.getTables('rest-1'),
        api.getWaiterNotifications(),
        api.getWaiterShiftSummary(),
      ]);
      setRequests(reqData);
      setOrders(ordData);
      setTables(tblData);
      setNotifications(notifData);
      setShiftSummary(shiftData);
    } catch (err) {
      console.error('Failed to load Waiter Terminal OS data:', err);
    }
  };

  // Setup Real-time WebSockets / Event Bus Listener
  useEffect(() => {
    loadData();

    const unsubscribe = realtimeBus.subscribe((event) => {
      loadData();

      if (!isAudioMuted) {
        playNotificationChime();
      }

      if (event.type === 'CustomerRequestCreated') {
        showToast('New Customer Dispatch 🛎️', `${event.tableNumber} requested ${event.data?.requestType || 'Assistance'}`, 'warning');
      } else if (event.type === 'OrderReady') {
        showToast('Kitchen Order Plated 🔥', `Order #${event.orderId} for ${event.tableNumber} is ready for pickup`, 'success');
      } else if (event.type === 'WaiterCalled') {
        showToast('Table Service Call 🔔', `${event.tableNumber} called waiter`, 'warning');
      } else if (event.type === 'BillRequested') {
        showToast('Bill Request 🧾', `${event.tableNumber} requested final check`, 'info');
      } else if (event.type === 'ETAUpdated') {
        showToast('Kitchen ETA Adjusted ⏱️', `Order #${event.orderId} prep set to ${event.estimatedPrepTimeMinutes} mins`, 'info');
      } else if (event.type === 'TableMerged') {
        showToast('Tables Merged for Event 🔗', `${event.data?.mergedGroupLabel || 'Tables combined for gathering'}`, 'info');
      } else if (event.type === 'TableUnmerged') {
        showToast('Tables Unmerged 🔓', 'Table seating restored to individual layouts.', 'info');
      } else if (event.type === 'TableReserved') {
        showToast('Table Reserved 🔒', `${event.tableNumber} locked for ${event.data?.reservedForName || 'Guest'}`, 'info');
      } else if (event.type === 'BroadcastMessage') {
        showToast(`Floor Broadcast: ${event.actor}`, `${event.reason}`, 'info');
      }
    });

    return () => unsubscribe();
  }, [isAudioMuted]);

  // Request Action Handlers
  const handleAcceptRequest = async (requestId: string) => {
    try {
      await api.acceptCustomerRequest(requestId, 'Mateo Rossi');
      showToast('Request Accepted ✅', 'Assigned to your shift queue.', 'success');
      loadData();
    } catch (err) {
      showToast('Error', 'Failed to accept request', 'warning');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await api.rejectCustomerRequest(requestId, 'Staff Busy - Rerouted to Floor Lead');
      showToast('Request Rerouted ⚠️', 'Notified floor manager.', 'info');
      loadData();
    } catch (err) {
      showToast('Error', 'Failed to reject request', 'warning');
    }
  };

  const handleUpdateStatus = async (requestId: string, status: CustomerRequestStatus) => {
    try {
      await api.updateCustomerRequestStatus(requestId, status);
      showToast('Status Updated 🚀', `Request marked as ${status.replace('_', ' ')}`, 'success');
      loadData();
    } catch (err) {
      showToast('Error', 'Failed to update request status', 'warning');
    }
  };

  const handleConfirmTransfer = async () => {
    if (!transferRequestId) return;
    try {
      await api.transferCustomerRequest(transferRequestId, targetWaiterName);
      showToast('Request Transferred 🔄', `Reassigned to ${targetWaiterName}`, 'success');
      setIsTransferModalOpen(false);
      setTransferRequestId(null);
      loadData();
    } catch (err) {
      showToast('Error', 'Failed to transfer request', 'warning');
    }
  };

  // Deliver Order Handler
  const handleDeliverOrder = async (orderId: string) => {
    try {
      await api.updateOrderStatus(orderId, 'DELIVERED');
      showToast('Order Delivered 🎉', `Order #${orderId} delivered to table`, 'success');
      loadData();
    } catch (err) {
      showToast('Error', 'Failed to deliver order', 'warning');
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastMessageText.trim()) return;
    try {
      await api.sendWaiterBroadcast(broadcastMessageText, 'Mateo Rossi');
      showToast('Broadcast Sent 📢', 'Message broadcasted to floor team', 'success');
      setBroadcastMessageText('');
      setIsBroadcastModalOpen(false);
      loadData();
    } catch (err) {
      showToast('Error', 'Failed to send broadcast', 'warning');
    }
  };

  const handleReportProblem = async () => {
    if (!reportProblemOrder) return;
    showToast('Problem Reported ⚠️', `Notified Chef Antoine regarding Order #${reportProblemOrder.id}`, 'warning');
    setIsReportProblemModalOpen(false);
    setProblemDescription('');
    setReportProblemOrder(null);
  };

  const handleTableStatusChange = async (tableId: string, newStatus: Table['status']) => {
    try {
      await api.updateTableStatus(tableId, newStatus, 'Mateo Rossi');
      showToast('Table Updated 🪑', `Table status changed to ${newStatus}`, 'success');
      loadData();
    } catch (err) {
      showToast('Error', 'Failed to update table status', 'warning');
    }
  };

  // Filtered Collections
  const pendingRequests = useMemo(() => {
    return requests.filter((r) => r.status === 'PENDING');
  }, [requests]);

  const assignedRequests = useMemo(() => {
    return requests.filter((r) => r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS');
  }, [requests]);

  const readyOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'READY');
  }, [orders]);

  const unreadNotifCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  // Request Type Helpers
  const getRequestBadge = (type: CustomerRequestType, title?: string) => {
    switch (type) {
      case 'WATER':
        return <Badge variant="info" className="flex items-center gap-1"><Wine className="w-3 h-3" /> Water</Badge>;
      case 'BILL':
        return <Badge variant="warning" className="flex items-center gap-1"><Receipt className="w-3 h-3" /> Bill Check</Badge>;
      case 'EXTRA_SPOON':
      case 'EXTRA_PLATE':
      case 'CUTLERY':
        return <Badge variant="outline" className="flex items-center gap-1 border-amber-500/50 text-amber-300"><Utensils className="w-3 h-3" /> Cutlery</Badge>;
      case 'TISSUE':
      case 'NAPKINS':
        return <Badge variant="outline" className="flex items-center gap-1 border-purple-500/50 text-purple-300"><FileText className="w-3 h-3" /> Napkins/Tissue</Badge>;
      case 'CALL_WAITER':
        return <Badge variant="danger" className="flex items-center gap-1 animate-pulse"><PhoneCall className="w-3 h-3" /> Waiter Call</Badge>;
      case 'CUSTOM':
      default:
        return <Badge variant="brand" className="flex items-center gap-1"><SparklesIcon className="w-3 h-3" /> {title || 'Custom'}</Badge>;
    }
  };

  const getPriorityBadge = (priority: CustomerRequest['priority']) => {
    switch (priority) {
      case 'URGENT':
        return <Badge variant="danger" className="animate-pulse font-mono uppercase">URGENT</Badge>;
      case 'HIGH':
        return <Badge variant="warning" className="font-mono uppercase">HIGH</Badge>;
      case 'MEDIUM':
        return <Badge variant="info" className="font-mono uppercase">MEDIUM</Badge>;
      case 'LOW':
      default:
        return <Badge variant="outline" className="font-mono uppercase">LOW</Badge>;
    }
  };

  const getTableStatusColor = (status: Table['status']) => {
    switch (status) {
      case 'OCCUPIED':
        return 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400';
      case 'AVAILABLE':
        return 'bg-slate-800/60 border-slate-700/60 text-slate-400';
      case 'RESERVED':
        return 'bg-amber-500/10 border-amber-500/40 text-amber-400';
      case 'CLEANING':
        return 'bg-sky-500/10 border-sky-500/40 text-sky-400';
      case 'WAITING_FOR_SERVICE':
      case 'WAITER_CALLED':
      case 'BILL_REQUESTED':
        return 'bg-rose-500/10 border-rose-500/50 text-rose-400 animate-pulse';
      default:
        return 'bg-slate-800 border-slate-700 text-slate-300';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-rose-500 selection:text-white">
      {/* Toast Overlay */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center gap-3 min-w-[320px] ${
            toastMessage.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-100' :
            toastMessage.type === 'warning' ? 'bg-rose-950/90 border-rose-500/50 text-rose-100' :
            'bg-slate-900/90 border-sky-500/50 text-sky-100'
          }`}>
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
        {/* Brand & Branch */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 p-0.5 shadow-lg shadow-rose-950/50 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Utensils className="w-5 h-5 text-rose-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black text-white tracking-tight">Lumière Modern Bistro</h1>
              <Badge variant="brand" className="text-[10px] py-0 px-1.5 font-mono">Downtown Flagship</Badge>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              <span className="text-emerald-400 font-semibold">ONLINE & DISPATCH READY</span>
            </p>
          </div>
        </div>

        {/* Waiter Profile & Current Shift info */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
          <div className="hidden sm:flex items-center gap-3 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
            <Avatar src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80" name="Mateo Rossi" size="sm" />
            <div>
              <p className="font-bold text-white flex items-center gap-1">
                Mateo Rossi
                <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1 rounded">WTR-8842</span>
              </p>
              <p className="text-[11px] text-slate-400">Evening Shift (4 PM - 12 AM)</p>
            </div>
          </div>

          {/* Live Clock */}
          <div className="bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2 font-mono text-amber-400 font-bold">
            <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            <span>{currentTime || '08:42:15 PM'}</span>
          </div>

          {/* Audio Chime Toggle */}
          <button
            onClick={() => {
              setIsAudioMuted(!isAudioMuted);
              showToast(isAudioMuted ? 'Audio Alerts Enabled 🔔' : 'Audio Muted 🔇', isAudioMuted ? 'Sound chimes on new dispatch' : 'Muted audio notifications', 'info');
            }}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-all border border-slate-700/50"
            title={isAudioMuted ? 'Enable Audio Chime' : 'Mute Audio Chime'}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Notification Bell */}
          <button
            onClick={() => setIsNotificationDrawerOpen(true)}
            className="relative p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-all border border-slate-700/50"
          >
            <Bell className="w-4 h-4 text-slate-200" />
            {unreadNotifCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white font-bold text-[10px] rounded-full flex items-center justify-center animate-bounce shadow-md">
                {unreadNotifCount}
              </span>
            )}
          </button>

          {/* Shift Summary / Clock Out Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsShiftModalOpen(true)}
            className="text-xs bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-200 flex items-center gap-1.5"
          >
            <UserCheck className="w-3.5 h-3.5 text-rose-400" />
            Shift Summary
          </Button>

          {onLogout && (
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="text-xs bg-slate-900 border-slate-700 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              Logout
            </Button>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER WITH SIDEBAR & CONTENT */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full lg:w-64 bg-slate-900/60 border-r border-slate-800/80 p-3 flex lg:flex-col justify-between shrink-0 overflow-x-auto lg:overflow-y-auto scrollbar-none">
          <div className="flex lg:flex-col gap-1 w-full min-w-[600px] lg:min-w-0">
            <div className="px-3 py-2 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider hidden lg:block">
              Operations Center
            </div>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left w-full ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-lg shadow-rose-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Dashboard Overview</span>
            </button>

            <button
              onClick={() => setActiveTab('dispatch')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left w-full ${
                activeTab === 'dispatch'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-lg shadow-rose-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Live Dispatch</span>
              </div>
              {pendingRequests.length > 0 && (
                <Badge variant="danger" className="text-[10px] py-0 px-1.5 animate-pulse">
                  {pendingRequests.length}
                </Badge>
              )}
            </button>

            <button
              onClick={() => setActiveTab('ready-orders')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left w-full ${
                activeTab === 'ready-orders'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-lg shadow-rose-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Flame className="w-4 h-4 text-emerald-400" />
                <span>Ready Orders</span>
              </div>
              {readyOrders.length > 0 && (
                <Badge variant="success" className="text-[10px] py-0 px-1.5">
                  {readyOrders.length}
                </Badge>
              )}
            </button>

            <button
              onClick={() => setActiveTab('floor-plan')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left w-full ${
                activeTab === 'floor-plan'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-lg shadow-rose-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Layers className="w-4 h-4 text-sky-400" />
              <span>Floor Tables Map</span>
            </button>

            <button
              onClick={() => setActiveTab('pending-calls')}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left w-full ${
                activeTab === 'pending-calls'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-lg shadow-rose-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <PhoneCall className="w-4 h-4 text-rose-400" />
                <span>Assigned Requests</span>
              </div>
              {assignedRequests.length > 0 && (
                <Badge variant="info" className="text-[10px] py-0 px-1.5">
                  {assignedRequests.length}
                </Badge>
              )}
            </button>

            <button
              onClick={() => setActiveTab('table-sessions')}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left w-full ${
                activeTab === 'table-sessions'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-lg shadow-rose-950/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Receipt className="w-4 h-4 text-indigo-400" />
              <span>Table Sessions</span>
            </button>

            <div className="px-3 py-2 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider hidden lg:block mt-4">
              Staff & Support
            </div>

            <button
              onClick={() => setIsBroadcastModalOpen(true)}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left w-full text-amber-400 hover:bg-amber-500/10 border border-amber-500/20"
            >
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span>Broadcast Msg</span>
            </button>

            <button
              onClick={() => showToast('Manager Alerted 🚨', 'Floor Manager Claire Dubois notified.', 'warning')}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left w-full text-rose-400 hover:bg-rose-500/10 border border-rose-500/20"
            >
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Manager Panic</span>
            </button>
          </div>

          <div className="hidden lg:block pt-4 border-t border-slate-800/80">
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-medium">Shift Target</span>
                <span className="font-bold text-emerald-400">92% Met</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-rose-500 to-emerald-400 h-full w-[92%]" />
              </div>
              <p className="text-[10px] text-slate-400">Avg response time 1.8m (Goal &lt; 3m)</p>
            </div>
          </div>
        </aside>

        {/* MAIN DISPLAY AREA */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6 bg-slate-950/80">
          {/* SEARCH & QUICK FILTERS BAR */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <div className="flex-1 min-w-[240px]">
              <SearchInput
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search table, order #, dish or customer request..."
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold text-slate-400 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-slate-400" /> Priority:
              </span>
              {(['ALL', 'URGENT', 'HIGH', 'MEDIUM'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    priorityFilter === p
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* TOP 8 METRIC CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <Card className="bg-slate-900/90 border-slate-800 p-3.5 space-y-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Active Tables</span>
              <p className="text-lg font-black text-white">
                {tables.filter((t) => t.status === 'OCCUPIED' || t.status === 'WAITER_CALLED' || t.status === 'BILL_REQUESTED').length} / {tables.length}
              </p>
              <p className="text-[10px] text-emerald-400 font-medium">75% Capacity</p>
            </Card>

            <Card className="bg-slate-900/90 border-slate-800 p-3.5 space-y-1">
              <span className="text-[10px] font-mono text-amber-400 uppercase">Pending Calls</span>
              <p className="text-lg font-black text-amber-400">{pendingRequests.length}</p>
              <p className="text-[10px] text-slate-400">Needs Dispatch</p>
            </Card>

            <Card className="bg-slate-900/90 border-slate-800 p-3.5 space-y-1">
              <span className="text-[10px] font-mono text-emerald-400 uppercase">Ready Plated</span>
              <p className="text-lg font-black text-emerald-400">{readyOrders.length}</p>
              <p className="text-[10px] text-slate-400">At Kitchen Pass</p>
            </Card>

            <Card className="bg-slate-900/90 border-slate-800 p-3.5 space-y-1">
              <span className="text-[10px] font-mono text-sky-400 uppercase">Delivered</span>
              <p className="text-lg font-black text-sky-400">
                {orders.filter((o) => o.status === 'DELIVERED' || o.status === 'COMPLETED').length + 24}
              </p>
              <p className="text-[10px] text-slate-400">Today</p>
            </Card>

            <Card className="bg-slate-900/90 border-slate-800 p-3.5 space-y-1">
              <span className="text-[10px] font-mono text-indigo-400 uppercase">Avg Response</span>
              <p className="text-lg font-black text-indigo-400">1.8m</p>
              <p className="text-[10px] text-emerald-400">Fast Speed</p>
            </Card>

            <Card className="bg-slate-900/90 border-slate-800 p-3.5 space-y-1">
              <span className="text-[10px] font-mono text-rose-400 uppercase">Shift Tips</span>
              <p className="text-lg font-black text-rose-400">$184.50</p>
              <p className="text-[10px] text-slate-400">Collected</p>
            </Card>

            <Card className="bg-slate-900/90 border-slate-800 p-3.5 space-y-1">
              <span className="text-[10px] font-mono text-amber-300 uppercase">Rating</span>
              <p className="text-lg font-black text-amber-300">4.9 ★</p>
              <p className="text-[10px] text-slate-400">24 Reviews</p>
            </Card>

            <Card className="bg-slate-900/90 border-slate-800 p-3.5 space-y-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Shift Hours</span>
              <p className="text-lg font-black text-white">5.5h</p>
              <p className="text-[10px] text-slate-400">On Clock</p>
            </Card>
          </div>

          {/* TAB CONTENT RENDER */}

          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Live Dispatch Feed & Kitchen Pass */}
              <div className="lg:col-span-2 space-y-6">
                {/* Live Customer Dispatch Queue */}
                <Card className="bg-slate-900 border-slate-800 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-400 animate-bounce" />
                      <h3 className="text-base font-bold text-white">Live Customer Requests Dispatch</h3>
                      <Badge variant="warning">{pendingRequests.length} Pending</Badge>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('dispatch')} className="text-xs">
                      View All Dispatch
                    </Button>
                  </div>

                  {pendingRequests.length === 0 ? (
                    <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-dashed border-slate-800 space-y-2">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                      <p className="text-sm font-bold text-slate-300">No Pending Requests</p>
                      <p className="text-xs text-slate-400">All customer assistance calls have been dispatched and handled.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pendingRequests.map((req) => (
                        <div
                          key={req.id}
                          className="bg-slate-950 p-4 rounded-2xl border border-amber-500/30 hover:border-amber-500/60 transition-all space-y-3 shadow-lg"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-lg font-black text-white font-mono">{req.tableNumber}</span>
                              <div className="mt-1 flex items-center gap-2">
                                {getRequestBadge(req.requestType, req.customTitle)}
                                {getPriorityBadge(req.priority)}
                              </div>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded-md">
                              {new Date(req.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {req.customerNotes && (
                            <p className="text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 italic">
                              "{req.customerNotes}"
                            </p>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              variant="brand"
                              size="sm"
                              className="flex-1 text-xs font-bold"
                              onClick={() => handleAcceptRequest(req.id)}
                            >
                              Accept & Serve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs border-slate-700 hover:bg-slate-800"
                              onClick={() => handleRejectRequest(req.id)}
                            >
                              Reject
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Ready Food Pass Queue */}
                <Card className="bg-slate-900 border-slate-800 p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Flame className="w-5 h-5 text-emerald-400 animate-pulse" />
                      <h3 className="text-base font-bold text-white">Kitchen Pass: Ready for Pickup</h3>
                      <Badge variant="success">{readyOrders.length} Plated</Badge>
                    </div>
                  </div>

                  {readyOrders.length === 0 ? (
                    <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-dashed border-slate-800 space-y-2">
                      <Coffee className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-sm font-bold text-slate-300">Kitchen Pass Clear</p>
                      <p className="text-xs text-slate-400">Chefs are currently preparing active orders.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {readyOrders.map((ord) => (
                        <div
                          key={ord.id}
                          className="bg-slate-950 p-4 rounded-2xl border border-emerald-500/40 space-y-3 shadow-lg"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs font-mono font-bold text-emerald-400">Order #{ord.id}</span>
                              <h4 className="text-base font-black text-white">{ord.tableNumber}</h4>
                              {ord.customerName && <p className="text-xs text-slate-400">{ord.customerName}</p>}
                            </div>
                            <Badge variant="success">READY PLATED</Badge>
                          </div>

                          <div className="space-y-1 text-xs text-slate-300 border-y border-slate-800 py-2">
                            {ord.items.map((i) => (
                              <div key={i.id} className="flex justify-between font-bold">
                                <span>{i.quantity}x {i.name}</span>
                                <span className="text-slate-400">${(i.price * i.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                              onClick={() => handleDeliverOrder(ord.id)}
                            >
                              Deliver to Table
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs border-slate-700 hover:bg-slate-800 text-rose-400"
                              onClick={() => {
                                setReportProblemOrder(ord);
                                setIsReportProblemModalOpen(true);
                              }}
                            >
                              Report Issue
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* Right Col: Quick Actions & Live Operations Timeline */}
              <div className="space-y-6">
                {/* Quick Tactile Actions */}
                <Card className="bg-slate-900 border-slate-800 p-5 space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" /> Waiter Quick Actions
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => showToast('Kitchen Pinged 🛎️', 'Chefs notified to expedite Section A orders.', 'info')}
                      className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-left space-y-1 transition-all group"
                    >
                      <PhoneCall className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-bold text-white">Call Kitchen</p>
                      <p className="text-[10px] text-slate-400">Direct hotline ping</p>
                    </button>

                    <button
                      onClick={() => setIsBroadcastModalOpen(true)}
                      className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-left space-y-1 transition-all group"
                    >
                      <MessageSquare className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-bold text-white">Broadcast Msg</p>
                      <p className="text-[10px] text-slate-400">Announce to team</p>
                    </button>

                    <button
                      onClick={() => showToast('Cleaning Tagged 🧹', 'Table 08 flagged for busboy cleaning.', 'info')}
                      className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-left space-y-1 transition-all group"
                    >
                      <Layers className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-bold text-white">Mark Cleaning</p>
                      <p className="text-[10px] text-slate-400">Notify bus staff</p>
                    </button>

                    <button
                      onClick={() => showToast('Manager Panic 🚨', 'Emergency alert dispatched to Manager Claire Dubois.', 'warning')}
                      className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-left space-y-1 transition-all group"
                    >
                      <ShieldAlert className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-bold text-white">Manager Panic</p>
                      <p className="text-[10px] text-slate-400">Immediate assist</p>
                    </button>
                  </div>
                </Card>

                {/* Operations Activity Feed */}
                <Card className="bg-slate-900 border-slate-800 p-5 space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-sky-400" /> Recent Activity Timeline
                  </h3>
                  <div className="space-y-3 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-white">Table 01 — Order #ord-101 Delivered</p>
                        <p className="text-[10px] text-slate-400">2 min ago • Mateo Rossi</p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2">
                      <Wine className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-white">Table 03 — Sparkling Water Served</p>
                        <p className="text-[10px] text-slate-400">4 min ago • Mateo Rossi</p>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-2">
                      <Receipt className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-white">Table 02 — Bill Check Printed ($123.00)</p>
                        <p className="text-[10px] text-slate-400">6 min ago • Mateo Rossi</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE DISPATCH */}
          {activeTab === 'dispatch' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400" /> Live Customer Dispatch Center
                  </h3>
                  <p className="text-xs text-slate-400">Real-time incoming table service calls and requests</p>
                </div>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={async () => {
                    await api.createCustomerRequest({
                      tableNumber: 'Table 04',
                      requestType: 'WATER',
                      priority: 'URGENT',
                      customerNotes: 'Test sparkling water request',
                    });
                    showToast('Test Request Created 🧪', 'Emitted real-time request to dispatch.', 'info');
                    loadData();
                  }}
                  className="text-xs"
                >
                  <Plus className="w-3.5 h-3.5" /> Simulate Customer Request
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {requests.map((req) => (
                  <Card
                    key={req.id}
                    className={`p-5 space-y-4 bg-slate-900 border transition-all ${
                      req.status === 'PENDING'
                        ? 'border-amber-500/50 shadow-xl shadow-amber-950/20'
                        : req.status === 'ACCEPTED'
                        ? 'border-sky-500/40'
                        : 'border-slate-800 opacity-70'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xl font-black text-white font-mono">{req.tableNumber}</span>
                        <div className="mt-1 flex items-center gap-2">
                          {getRequestBadge(req.requestType, req.customTitle)}
                          {getPriorityBadge(req.priority)}
                        </div>
                      </div>
                      <Badge
                        variant={
                          req.status === 'PENDING'
                            ? 'warning'
                            : req.status === 'ACCEPTED'
                            ? 'info'
                            : req.status === 'COMPLETED'
                            ? 'success'
                            : 'outline'
                        }
                      >
                        {req.status}
                      </Badge>
                    </div>

                    {req.customerNotes && (
                      <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 italic">
                        "{req.customerNotes}"
                      </p>
                    )}

                    <div className="text-[11px] text-slate-400 space-y-1 font-mono">
                      <p>Requested: {new Date(req.requestedAt).toLocaleTimeString()}</p>
                      {req.assignedWaiterName && <p className="text-sky-300 font-bold">Assigned: {req.assignedWaiterName}</p>}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                      {req.status === 'PENDING' && (
                        <>
                          <Button
                            variant="brand"
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={() => handleAcceptRequest(req.id)}
                          >
                            Accept Request
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs border-slate-700 hover:bg-slate-800"
                            onClick={() => handleRejectRequest(req.id)}
                          >
                            Reject
                          </Button>
                        </>
                      )}

                      {req.status === 'ACCEPTED' && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                            onClick={() => handleUpdateStatus(req.id, 'COMPLETED')}
                          >
                            Mark Completed
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs border-slate-700 hover:bg-slate-800 text-amber-400"
                            onClick={() => {
                              setTransferRequestId(req.id);
                              setIsTransferModalOpen(true);
                            }}
                          >
                            Transfer
                          </Button>
                        </>
                      )}

                      {req.status === 'COMPLETED' && (
                        <div className="w-full text-center py-1 text-xs font-bold text-emerald-400 bg-emerald-950/40 rounded-xl border border-emerald-500/20">
                          ✓ Fulfilled & Served
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: READY ORDERS & LIVE ETA */}
          {activeTab === 'ready-orders' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Flame className="w-5 h-5 text-emerald-400 animate-pulse" /> Kitchen Pass Ready Orders & ETA
                  </h3>
                  <p className="text-xs text-slate-400">Live order readiness stream synchronized with Kitchen KDS</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {orders.map((ord) => (
                  <Card key={ord.id} className="bg-slate-900 border-slate-800 p-5 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-mono font-bold text-slate-400">#{ord.id}</span>
                        <h4 className="text-lg font-black text-white">{ord.tableNumber}</h4>
                        {ord.customerName && <p className="text-xs text-slate-400">{ord.customerName}</p>}
                      </div>
                      <Badge
                        variant={
                          ord.status === 'READY'
                            ? 'success'
                            : ord.status === 'IN_KITCHEN'
                            ? 'warning'
                            : ord.status === 'DELIVERED'
                            ? 'info'
                            : 'outline'
                        }
                      >
                        {ord.status}
                      </Badge>
                    </div>

                    {/* Items Breakdown */}
                    <div className="space-y-1.5 border-y border-slate-800 py-3 text-xs text-slate-200">
                      {ord.items.map((i) => (
                        <div key={i.id} className="flex justify-between font-bold">
                          <span>{i.quantity}x {i.name}</span>
                          <span className="text-slate-400">${(i.price * i.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Live Countdown ETA */}
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> Kitchen Prep ETA
                      </span>
                      <span className="font-mono font-black text-amber-400 text-sm">
                        {ord.status === 'READY' ? 'PLATED NOW' : `${ord.estimatedPrepTimeMinutes || 12} mins`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {ord.status === 'READY' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                          onClick={() => handleDeliverOrder(ord.id)}
                        >
                          Mark Delivered to Table
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs border-slate-700 hover:bg-slate-800 text-slate-300"
                          onClick={() => showToast('In Cooking 🔥', `Order #${ord.id} is on station grill.`, 'info')}
                        >
                          Check Cooking Status
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: FLOOR TABLES MAP */}
          {activeTab === 'floor-plan' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-sky-400" /> Interactive Restaurant Floor Plan
                  </h3>
                  <p className="text-xs text-slate-400">Real-time occupancy status, active bills, and table calls</p>
                </div>

                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Occupied</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-600" /> Vacant</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Reserved</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-sky-500" /> Cleaning</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" /> Call/Bill</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {tables.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTableForSession(t)}
                    className={`p-5 rounded-3xl border text-left transition-all hover:scale-[1.02] space-y-3 relative overflow-hidden ${getTableStatusColor(
                      t.status
                    )}`}
                  >
                    {t.isVip && (
                      <span className="absolute top-2 right-2 bg-amber-500 text-slate-950 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                        VIP
                      </span>
                    )}

                    <div className="space-y-0.5">
                      <span className="text-lg font-black text-white font-mono block">{t.tableNumber}</span>
                      <p className="text-[11px] font-medium opacity-80">{t.capacity} Guests Capacity</p>
                    </div>

                    <div className="text-[11px] font-mono space-y-1">
                      <p className="font-bold uppercase tracking-wider">{t.status.replace('_', ' ')}</p>
                      {t.assignedWaiterName && <p className="text-slate-300">Staff: {t.assignedWaiterName}</p>}
                    </div>

                    <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-bold text-white">
                      <span>View Session</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: ASSIGNED REQUESTS & CALLS */}
          {activeTab === 'pending-calls' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <PhoneCall className="w-5 h-5 text-rose-400" /> My Assigned Service Queue
                </h3>
                <p className="text-xs text-slate-400">Accepted customer calls currently in service</p>
              </div>

              {assignedRequests.length === 0 ? (
                <Card className="bg-slate-900 border-slate-800 p-8 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-sm font-bold text-slate-200">Queue Empty</p>
                  <p className="text-xs text-slate-400">Accept pending requests from Live Dispatch to serve guests.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {assignedRequests.map((req) => (
                    <Card key={req.id} className="bg-slate-900 border-sky-500/40 p-5 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-lg font-black text-white font-mono">{req.tableNumber}</span>
                          <div className="mt-1 flex items-center gap-2">
                            {getRequestBadge(req.requestType, req.customTitle)}
                            {getPriorityBadge(req.priority)}
                          </div>
                        </div>
                        <Badge variant="info">IN SERVICE</Badge>
                      </div>

                      {req.customerNotes && (
                        <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800 italic">
                          "{req.customerNotes}"
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                          onClick={() => handleUpdateStatus(req.id, 'COMPLETED')}
                        >
                          Mark Served & Complete
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: TABLE SESSIONS */}
          {activeTab === 'table-sessions' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-400" /> Table Sessions & Billing Overview
                </h3>
                <p className="text-xs text-slate-400">Deep dive into current open guest sessions and tab totals</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tables
                  .filter((t) => t.status !== 'AVAILABLE')
                  .map((t) => {
                    const activeOrd = orders.find((o) => o.id === t.activeOrderId || o.tableNumber === t.tableNumber);
                    return (
                      <Card key={t.id} className="bg-slate-900 border-slate-800 p-5 space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xl font-black text-white font-mono">{t.tableNumber}</span>
                            <p className="text-xs text-slate-400">Staff: {t.assignedWaiterName || 'Mateo Rossi'}</p>
                          </div>
                          <Badge variant="info">{t.status}</Badge>
                        </div>

                        {activeOrd ? (
                          <div className="space-y-3 bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs">
                            <div className="flex justify-between text-slate-300">
                              <span>Order Code:</span>
                              <span className="font-mono font-bold text-white">#{activeOrd.id}</span>
                            </div>
                            <div className="flex justify-between text-slate-300">
                              <span>Items Count:</span>
                              <span className="font-bold text-white">{activeOrd.items.length} dishes</span>
                            </div>
                            <div className="flex justify-between text-slate-300 border-t border-slate-800 pt-2 font-bold">
                              <span>Current Bill Total:</span>
                              <span className="text-emerald-400 text-sm font-mono">${activeOrd.totalAmount.toFixed(2)}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">No active order logged yet for this table.</p>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => setSelectedTableForSession(t)}
                        >
                          Manage Session Details
                        </Button>
                      </Card>
                    );
                  })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* NOTIFICATION DRAWER */}
      {isNotificationDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex justify-end">
          <div className="w-full max-w-md bg-slate-900 h-full border-l border-slate-800 p-6 flex flex-col justify-between space-y-6 shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-bold text-white">Waiter Notifications</h3>
                </div>
                <button
                  onClick={() => setIsNotificationDrawerOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-180px)] pr-1">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 hover:border-slate-700 transition-all"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-white">{n.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{n.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-300">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>

            <Button
              variant="outline"
              onClick={async () => {
                await api.markAllNotificationsRead();
                loadData();
                setIsNotificationDrawerOpen(false);
              }}
              className="w-full"
            >
              Mark All Read & Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* TABLE SESSION DRAWER MODAL */}
      {selectedTableForSession && (
        <Modal
          isOpen={!!selectedTableForSession}
          onClose={() => setSelectedTableForSession(null)}
          title={`Table Session: ${selectedTableForSession.tableNumber}`}
          size="lg"
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div>
                <span className="text-xs text-slate-400">Current Status</span>
                <p className="text-sm font-bold text-white">{selectedTableForSession.status}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Assigned Staff</span>
                <p className="text-sm font-bold text-sky-400">{selectedTableForSession.assignedWaiterName || 'Mateo Rossi'}</p>
              </div>
              <div>
                <span className="text-xs text-slate-400">Capacity</span>
                <p className="text-sm font-bold text-amber-400">{selectedTableForSession.capacity} Guests</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="text-xs border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-400"
                onClick={() => {
                  handleTableStatusChange(selectedTableForSession.id, 'AVAILABLE');
                  setSelectedTableForSession(null);
                }}
              >
                Mark Table Vacant & Cleared
              </Button>
              <Button
                variant="outline"
                className="text-xs border-sky-500/40 hover:bg-sky-500/10 text-sky-400"
                onClick={() => {
                  handleTableStatusChange(selectedTableForSession.id, 'CLEANING');
                  setSelectedTableForSession(null);
                }}
              >
                Mark Ready For Cleaning
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* SHIFT SUMMARY MODAL */}
      {isShiftModalOpen && shiftSummary && (
        <Modal
          isOpen={isShiftModalOpen}
          onClose={() => setIsShiftModalOpen(false)}
          title="Waiter Shift Summary & Performance"
          size="md"
        >
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/40 via-slate-900 to-slate-900 border border-rose-500/30 space-y-1">
              <span className="text-[10px] font-mono text-rose-400 uppercase font-bold">Evening Shift Statistics</span>
              <h4 className="text-xl font-black text-white">Mateo Rossi (WTR-8842)</h4>
              <p className="text-xs text-slate-400">{shiftSummary.assignedSection}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400">Hours Worked</span>
                <p className="text-base font-black text-white">{shiftSummary.hoursWorked} Hours</p>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400">Tables Served</span>
                <p className="text-base font-black text-emerald-400">{shiftSummary.tablesServed} Tables</p>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400">Orders Delivered</span>
                <p className="text-base font-black text-sky-400">{shiftSummary.ordersDelivered} Orders</p>
              </div>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <span className="text-slate-400">Avg Response Speed</span>
                <p className="text-base font-black text-amber-400">{shiftSummary.avgResponseTimeMinutes} Mins</p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex justify-between items-center">
              <div>
                <span className="text-xs text-slate-400">Today's Shift Tips</span>
                <p className="text-xl font-black text-rose-400 font-mono">{formatPrice(shiftSummary.totalTipsCollected)}</p>
              </div>
              <Badge variant="success">Rating: {shiftSummary.customerRating} ★</Badge>
            </div>

            <Button
              variant="brand"
              onClick={() => {
                showToast('Clocked Out 🕒', 'Shift summary saved & submitted to manager.', 'success');
                setIsShiftModalOpen(false);
              }}
              className="w-full"
            >
              Clock Out & Save Shift Log
            </Button>
          </div>
        </Modal>
      )}

      {/* BROADCAST MODAL */}
      {isBroadcastModalOpen && (
        <Modal
          isOpen={isBroadcastModalOpen}
          onClose={() => setIsBroadcastModalOpen(false)}
          title="Floor Broadcast Message"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              Send a real-time broadcast message to all waiters, kitchen chefs, and floor managers on duty.
            </p>
            <Input
              label="Broadcast Text"
              value={broadcastMessageText}
              onChange={(e) => setBroadcastMessageText(e.target.value)}
              placeholder="e.g. Table 05 requesting wine pairing assistance!"
            />
            <Button variant="brand" onClick={handleSendBroadcast} className="w-full">
              Send Broadcast
            </Button>
          </div>
        </Modal>
      )}

      {/* TRANSFER REQUEST MODAL */}
      {isTransferModalOpen && (
        <Modal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          title="Transfer Customer Request"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-400">Select waiter staff member to reassign this customer request:</p>
            <select
              value={targetWaiterName}
              onChange={(e) => setTargetWaiterName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl p-3 text-xs focus:ring-2 focus:ring-rose-500"
            >
              <option value="Jessica Tanaka">Jessica Tanaka (Floor B)</option>
              <option value="Marco Silva">Marco Silva (Bar Counter)</option>
              <option value="Claire Dubois">Claire Dubois (Floor Manager)</option>
            </select>
            <Button variant="brand" onClick={handleConfirmTransfer} className="w-full">
              Confirm Transfer
            </Button>
          </div>
        </Modal>
      )}

      {/* REPORT PROBLEM MODAL */}
      {isReportProblemModalOpen && reportProblemOrder && (
        <Modal
          isOpen={isReportProblemModalOpen}
          onClose={() => setIsReportProblemModalOpen(false)}
          title={`Report Issue for Order #${reportProblemOrder.id}`}
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-400">Select issue description to notify Kitchen Station Chef:</p>
            <Input
              label="Issue Notes"
              value={problemDescription}
              onChange={(e) => setProblemDescription(e.target.value)}
              placeholder="e.g. Medium rare steak overcooked, needs remake."
            />
            <Button variant="danger" onClick={handleReportProblem} className="w-full">
              Submit Issue to Kitchen Pass
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};
