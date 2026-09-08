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
  Modal,
  DinelyLogo,
} from '../../packages/ui';
import { api } from '../../packages/api/client';
import {
  Order,
  Table,
  TableSession,
  CustomerRequest,
  CustomerRequestType,
  CustomerRequestStatus,
  WaiterNotification,
  getFulfillmentStation,
} from '../../packages/types';
import { realtimeBus, ConnectionStatusType } from '../../packages/api/realtime';
import { matchTableNumber } from '../../packages/utils/tableUtils';
import { useTheme } from '../../packages/theme/ThemeEngine';

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
  const [wsStatus, setWsStatus] = useState<ConnectionStatusType>('CONNECTING');

  // Core Data State
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeSessions, setActiveSessions] = useState<TableSession[]>([]);
  const [notifications, setNotifications] = useState<WaiterNotification[]>([]);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Table Modal States
  const [selectedTableForView, setSelectedTableForView] = useState<Table | null>(null);
  const [selectedTableForClose, setSelectedTableForClose] = useState<Table | null>(null);
  const [isClosingTableLoading, setIsClosingTableLoading] = useState(false);

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
  const urlRestParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('restaurant') || new URLSearchParams(window.location.search).get('restaurantId') : null;
  const currentRestaurantId = urlRestParam || api.getCurrentRestaurantId() || currentUser?.restaurantId || '';
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
  const loadData = async (silent: boolean = false) => {
    try {
      if (!silent) setIsErrorState(false);
      const targetRestId = currentRestaurantId;

      const [reqData, ordData, tblData, notifData, sessionData] = await Promise.all([
        api.getCustomerRequests(targetRestId),
        api.getOrders(targetRestId),
        api.getTables(targetRestId),
        api.getWaiterNotifications(targetRestId),
        api.getActiveTableSessions(targetRestId),
      ]);

      setRequests(reqData);
      setOrders(ordData);
      setTables(tblData);
      setNotifications(notifData);
      setActiveSessions(sessionData || []);
      setIsErrorState(false);
    } catch (err) {
      console.error('Failed to load Waiter Terminal data:', err);
      if (!silent) setIsErrorState(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Realtime WebSocket Connection & Connection Status Sync
  useEffect(() => {
    if (currentRestaurantId) {
      realtimeBus.connect(currentRestaurantId, 'WAITER');
    }
    const unsubStatus = realtimeBus.subscribeStatus((status) => {
      setWsStatus(status);
      if (status === 'CONNECTED') {
        // Silently reconcile state on connect / reconnect
        loadData(true);
      }
    });
    return () => {
      unsubStatus();
    };
  }, [currentRestaurantId]);

  // Real-Time Granular Event-Driven State Dispatch (Zero-Latency, No Full Page Reloads)
  useEffect(() => {
    loadData(false);

    // Safety-net reconciliation sync (relaxed 60s interval to prevent UI freezing)
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    }, 60000);

    const handledEventIds = new Set<string>();

    const unsubscribe = realtimeBus.subscribe((event) => {
      // 1. Strict multi-tenant isolation
      const evtRestId = (event as any).restaurantId || (event as any).restaurant_id;
      if (evtRestId) {
        const resolvedCurrentRestId = api.getCurrentRestaurantId();
        const normEvt = String(evtRestId).toLowerCase();
        const normCurr = String(currentRestaurantId).toLowerCase();
        const normResolved = String(resolvedCurrentRestId).toLowerCase();
        const isMatchingTenant =
          normEvt === normCurr ||
          normEvt === normResolved ||
          normEvt.includes(normCurr) ||
          normCurr.includes(normEvt);
        if (!isMatchingTenant) {
          return;
        }
      }

      // 2. Event deduplication
      const evtId = (event as any).eventId || (event as any).event_id;
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

      // 3. Play chime for call/ready events
      const isChimeEvent =
        event.type === 'service_request_created' ||
        event.type === 'order_ready' ||
        event.type === 'CustomerRequestCreated' ||
        event.type === 'OrderReady';

      if (isChimeEvent && !isAudioMuted) {
        playNotificationChime();
      }

      const tblNum = (event as any).tableNumber || (event as any).table_number || (event as any).payload?.tableNumber || (event as any).payload?.table_number || 'Table';
      const reqTitle = (event as any).customTitle || (event as any).requestType || (event as any).payload?.customTitle || (event as any).payload?.requestType || 'Assistance';

      // 4. Granular instant state dispatch
      if (event.type === 'service_request_created' || event.type === 'CustomerRequestCreated' || event.type === 'WaiterCalled') {
        const payloadData = (event as any).payload || event;
        const newReq: CustomerRequest = {
          id: payloadData.id || (event as any).id || `req-${Date.now()}`,
          restaurantId: payloadData.restaurantId || payloadData.restaurant_id || currentRestaurantId,
          tableId: payloadData.tableId || payloadData.table_id,
          tableNumber: payloadData.tableNumber || payloadData.table_number || tblNum,
          requestType: (payloadData.requestType || payloadData.request_type || 'WATER').toUpperCase() as CustomerRequestType,
          customTitle: payloadData.customTitle || payloadData.custom_title || payloadData.message || reqTitle,
          message: payloadData.message || payloadData.customerNotes || payloadData.customer_notes || '',
          customerNotes: payloadData.customerNotes || payloadData.customer_notes || payloadData.message || '',
          priority: (payloadData.priority || 'HIGH') as any,
          status: (payloadData.status || 'PENDING').toUpperCase() as CustomerRequestStatus,
          requestedAt: payloadData.requestedAt || payloadData.requested_at || payloadData.created_at || (event as any).timestamp || new Date().toISOString(),
          tableSessionId: payloadData.tableSessionId || payloadData.table_session_id,
          assignedWaiterName: payloadData.waiterName || payloadData.waiter_name || payloadData.assignedWaiterName,
        };

        // Instant optimistic addition to requests queue
        setRequests((prev) => {
          if (prev.some((r) => r.id === newReq.id)) return prev;
          return [newReq, ...prev];
        });

        showToast(
          'Customer Service Call 🛎️',
          `${tblNum} requested ${String(reqTitle).toLowerCase()}`,
          'warning'
        );
      } else if (event.type === 'service_request_updated' || event.type === 'CustomerRequestUpdated') {
        const payloadData = (event as any).payload || event;
        const reqId = payloadData.id || (event as any).id;
        const updatedStatus = (payloadData.status || (event as any).status || '').toUpperCase();
        const assignedStaff = payloadData.waiterName || payloadData.waiter_name || payloadData.assignedWaiterName;

        if (reqId && updatedStatus) {
          setRequests((prev) =>
            prev.map((r) =>
              r.id === reqId
                ? {
                    ...r,
                    status: updatedStatus as CustomerRequestStatus,
                    assignedWaiterName: assignedStaff || r.assignedWaiterName,
                  }
                : r
            )
          );
        }
      } else if (event.type === 'order_created' || event.type === 'OrderCreated') {
        const payloadOrder = (event as any).order || (event as any).payload?.order;
        if (payloadOrder && payloadOrder.id) {
          setOrders((prev) => {
            if (prev.some((o) => o.id === payloadOrder.id)) {
              return prev.map((o) => (o.id === payloadOrder.id ? payloadOrder : o));
            }
            return [payloadOrder, ...prev];
          });
        } else {
          api.getOrders(currentRestaurantId).then(setOrders).catch(() => {});
        }
      } else if (event.type === 'order_ready' || event.type === 'OrderReady') {
        const orderId = (event as any).orderId || (event as any).order_id || (event as any).payload?.orderId;
        if (orderId) {
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, status: 'READY', kitchenStatus: 'READY' } : o))
          );
        }
        showToast(
          'Order Plated & Ready 🔥',
          `Order for ${tblNum} is ready for pickup`,
          'success'
        );
      } else if (event.type === 'order_status_updated' || event.type === 'OrderStatusUpdated') {
        const orderId = (event as any).orderId || (event as any).order_id || (event as any).payload?.orderId;
        const newStatus = (event as any).status || (event as any).payload?.status;
        if (orderId && newStatus) {
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
          );
        }
      } else if (event.type === 'table_session_closed' || event.type === 'TableSessionClosed') {
        const tblId = (event as any).tableId || (event as any).table_id || (event as any).payload?.tableId;
        const sessId = (event as any).tableSessionId || (event as any).table_session_id || (event as any).sessionId;

        setTables((prev) =>
          prev.map((t) =>
            t.id === tblId || (t as any).number === tblNum || t.tableNumber === tblNum
              ? { ...t, status: 'AVAILABLE', isOccupied: false, activeSessionId: undefined }
              : t
          )
        );
        if (sessId) {
          setActiveSessions((prev) => prev.filter((s) => s.id !== sessId));
          setRequests((prev) => prev.filter((r) => r.tableSessionId !== sessId));
        }
        showToast('Table Session Closed 🧹', `Table ${tblNum} session ended`, 'info');
      } else if (event.type === 'table_session_created' || event.type === 'TableSessionCreated' || event.type === 'table_status_updated' || event.type === 'TableStatusUpdated') {
        const sess = (event as any).session || (event as any).payload?.session;
        const tblId = (event as any).tableId || sess?.tableId;
        if (sess && sess.id) {
          setActiveSessions((prev) => [sess, ...prev.filter((s) => s.id !== sess.id)]);
          if (tblId) {
            setTables((prev) =>
              prev.map((t) =>
                t.id === tblId || (t as any).number === sess.tableNumber || t.tableNumber === sess.tableNumber
                  ? { ...t, status: 'OCCUPIED', isOccupied: true, activeSessionId: sess.id }
                  : t
              )
            );
          }
        } else {
          api.getActiveTableSessions(currentRestaurantId).then(setActiveSessions).catch(() => {});
          api.getTables(currentRestaurantId).then(setTables).catch(() => {});
        }
      } else if (event.type === 'BillRequested' || event.type === 'bill_updated') {
        showToast('Bill Check Request 🧾', `${tblNum} requested final bill`, 'info');
      }
    });

    return () => {
      clearInterval(pollInterval);
      unsubscribe();
    };
  }, [isAudioMuted, currentRestaurantId]);

  // Request Actions with Instant Optimistic UI Response
  const handleAcceptRequest = async (requestId: string) => {
    // Instant optimistic state update
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId ? { ...r, status: 'IN_PROGRESS', assignedStaffName: waiterName } : r
      )
    );
    showToast('Request Accepted ✅', 'Customer request accepted.', 'success');
    try {
      await api.updateCustomerRequest(requestId, 'IN_PROGRESS', waiterName);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to accept request', 'warning');
      loadData(true);
    }
  };

  const handleCompleteRequest = async (requestId: string) => {
    // Instant optimistic state update
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: 'COMPLETED' } : r))
    );
    showToast('Request Completed ✅', 'Request fulfilled and cleared.', 'success');
    try {
      await api.updateCustomerRequest(requestId, 'COMPLETED', waiterName);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to complete request', 'warning');
      loadData(true);
    }
  };

  // Order Delivery Handler (Valid transition: READY -> DELIVERED)
  const handleDeliverOrder = async (orderId: string) => {
    // Instant optimistic state update
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'DELIVERED' } : o))
    );
    showToast('Order Delivered 🎉', `Order #${orderId} delivered to customer`, 'success');
    try {
      await api.deliverOrder(orderId);
    } catch (err: any) {
      showToast('Delivery Error ⚠️', err.message || 'Failed to deliver order', 'warning');
      loadData(true);
    }
  };

  // Computed data collections
  const activeTablesList = useMemo(() => {
    const activeSessionTableIds = new Set(
      activeSessions
        .filter((s) => s.status === 'ACTIVE')
        .flatMap((s) => [s.tableId, s.tableNumber?.toLowerCase()].filter(Boolean))
    );

    return tables.filter((t) => {
      const isSessionActive =
        activeSessionTableIds.has(t.id) ||
        (t.tableNumber && activeSessionTableIds.has(t.tableNumber.toLowerCase())) ||
        activeSessions.some((s) => s.status === 'ACTIVE' && matchTableNumber(s.tableNumber, t.tableNumber));

      if (!isSessionActive) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.tableNumber.toLowerCase().includes(q) ||
          (t.assignedWaiterName && t.assignedWaiterName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [tables, activeSessions, searchQuery]);

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
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col font-sans antialiased">
      {/* TOAST NOTIFICATION POPUP */}
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

      {/* HEADER BAR */}
      <header className="bg-[#0e1117] border-b border-[#1e232e] sticky top-0 z-40 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#141822] border border-[#222838] flex items-center justify-center font-bold text-orange-400 shrink-0">
            <PhoneCall className="w-4.5 h-4.5 text-orange-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <DinelyLogo size="sm" />
              <h1 className="text-base font-bold text-white tracking-tight">Waiter Terminal OS</h1>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#161b24] text-slate-400 border border-[#242c3d]">STAFF</span>
            </div>
            {wsStatus === 'CONNECTED' ? (
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                <span className="text-emerald-400 font-mono text-[11px]">Live Sync Active</span>
              </p>
            ) : wsStatus === 'RECONNECTING' ? (
              <p className="text-xs text-amber-400 flex items-center gap-1.5 mt-0.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                <span className="font-mono text-[11px]">Reconnecting...</span>
              </p>
            ) : (
              <p className="text-xs text-rose-400 flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                <span className="font-mono text-[11px]">Offline</span>
              </p>
            )}
          </div>
        </div>

        {/* Authenticated Staff Info & Actions */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-300">
          <div className="flex items-center gap-2 bg-[#12151b] px-3 py-1.5 rounded-lg border border-[#1e232e]">
            <Avatar src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100" name={waiterName} size="sm" />
            <div>
              <p className="font-semibold text-white text-xs">{waiterName}</p>
              <p className="text-[10px] text-emerald-400 font-mono">ON SHIFT</p>
            </div>
          </div>

          {/* Clock */}
          <div className="bg-[#12151b] px-2.5 py-1.5 rounded-lg border border-[#1e232e] flex items-center gap-1.5 font-mono text-slate-300 text-xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentTime || '08:42 PM'}</span>
          </div>

          {/* Audio Chime Toggle */}
          <button
            onClick={() => setIsAudioMuted(!isAudioMuted)}
            className="p-2 rounded-lg bg-[#12151b] hover:bg-[#181d27] text-slate-400 hover:text-white transition-colors border border-[#1e232e] h-8 w-8 flex items-center justify-center"
            title={isAudioMuted ? 'Enable Audio Chime' : 'Mute Audio Chime'}
          >
            {isAudioMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await api.logout();
              if (onLogout) onLogout();
              else window.location.href = '/waiter/login';
            }}
            className="text-xs bg-[#12151b] border-[#1e232e] hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 flex items-center gap-1.5 h-8"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </Button>
        </div>
      </header>

      {/* ERROR / RECONNECT BANNER */}
      {isErrorState && (
        <div className="bg-rose-950/80 border-b border-rose-800 px-4 py-2.5 text-xs text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Unable to connect to restaurant server. Realtime events may be paused.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData()} className="text-xs border-rose-700 hover:bg-rose-900 flex items-center gap-1 h-7">
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </Button>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full lg:w-60 bg-[#0e1117] border-r border-[#1e232e] p-3 flex lg:flex-col justify-between shrink-0 overflow-x-auto lg:overflow-y-auto scrollbar-none">
          <div className="flex lg:flex-col gap-1 w-full min-w-[500px] lg:min-w-0">
            <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-500 hidden lg:block">
              Floor Terminal
            </div>

            {/* Tab 1: Dashboard Overview */}
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left w-full ${
                activeTab === 'dashboard'
                  ? 'bg-[#181d27] text-white border border-[#2d3545]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#141822]'
              }`}
            >
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Overview</span>
            </button>

            {/* Tab 2: Active Tables */}
            <button
              onClick={() => setActiveTab('active-tables')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left w-full ${
                activeTab === 'active-tables'
                  ? 'bg-[#181d27] text-white border border-[#2d3545]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#141822]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Utensils className="w-4 h-4 text-sky-400" />
                <span>Active Tables</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#141822] text-slate-300 border border-[#222838]">
                {activeTablesList.length}
              </span>
            </button>

            {/* Tab 3: Pending Calls */}
            <button
              onClick={() => setActiveTab('pending-calls')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left w-full ${
                activeTab === 'pending-calls'
                  ? 'bg-[#181d27] text-white border border-[#2d3545]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#141822]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <PhoneCall className="w-4 h-4 text-amber-400" />
                <span>Pending Calls</span>
              </div>
              {pendingCallsList.length > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  {pendingCallsList.length}
                </span>
              )}
            </button>

            {/* Tab 4: Ready Plates */}
            <button
              onClick={() => setActiveTab('ready-plates')}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left w-full ${
                activeTab === 'ready-plates'
                  ? 'bg-[#181d27] text-white border border-[#2d3545]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#141822]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Flame className="w-4 h-4 text-orange-400" />
                <span>Ready Plates</span>
              </div>
              {readyPlatesList.length > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  {readyPlatesList.length}
                </span>
              )}
            </button>
          </div>
        </aside>

        {/* MAIN DISPLAY AREA */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5 bg-[#0b0d11]">
          {/* SEARCH & REFRESH BAR */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0e1117] p-2.5 rounded-xl border border-[#1e232e]">
            <div className="flex-1 min-w-[240px]">
              <SearchInput
                value={searchQuery}
                onChange={(val) => setSearchQuery(typeof val === 'string' ? val : (val as any).target.value)}
                placeholder="Search table, order #, or customer request..."
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData()}
              disabled={isLoading}
              className="text-xs bg-[#12151b] border-[#1e232e] hover:bg-[#181d27] text-slate-300 flex items-center gap-1.5 h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
          </div>

          {/* COUNTERS HEADER */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() => setActiveTab('active-tables')}
              className="bg-[#12151b] border border-[#1e232e] p-4 rounded-xl space-y-1 cursor-pointer hover:border-sky-500/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-sky-400 font-medium">Active Tables</span>
                <Utensils className="w-4 h-4 text-sky-400" />
              </div>
              <p className="text-2xl font-bold text-white font-mono">{activeTablesList.length}</p>
              <p className="text-[11px] text-slate-400">Occupied tables on floor</p>
            </div>

            <div
              onClick={() => setActiveTab('pending-calls')}
              className="bg-[#12151b] border border-[#1e232e] p-4 rounded-xl space-y-1 cursor-pointer hover:border-amber-500/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-amber-400 font-medium">Pending Calls</span>
                <PhoneCall className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-amber-400 font-mono">{pendingCallsList.length}</p>
              <p className="text-[11px] text-slate-400">Customer requests waiting</p>
            </div>

            <div
              onClick={() => setActiveTab('ready-plates')}
              className="bg-[#12151b] border border-[#1e232e] p-4 rounded-xl space-y-1 cursor-pointer hover:border-emerald-500/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-emerald-400 font-medium">Ready Plates</span>
                <Flame className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-emerald-400 font-mono">{readyPlatesList.length}</p>
              <p className="text-[11px] text-slate-400">Plated orders at kitchen pass</p>
            </div>
          </div>

          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Quick Section 1: Active Tables Preview */}
              <div className="bg-[#12151b] border border-[#1e232e] p-5 space-y-4 rounded-xl">
                <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
                  <div className="flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-sky-400" />
                    <h2 className="text-sm font-semibold text-white">Active Floor Tables</h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#161b24] text-sky-300 border border-[#222838]">
                      {activeTablesList.length} Active
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('active-tables')} className="text-xs border-[#1e232e] bg-[#12151b] text-slate-300 hover:text-white h-7">
                    <span>View Floorplan</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>

                {activeTablesList.length === 0 ? (
                  <div className="p-8 text-center bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1.5">
                    <Utensils className="w-6 h-6 text-slate-600 mx-auto" />
                    <p className="text-xs font-semibold text-slate-300">No active tables right now.</p>
                    <p className="text-[11px] text-slate-400">Tables will appear when customer sessions begin or orders are placed.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {activeTablesList.slice(0, 6).map((table) => {
                      const activeSession = activeSessions.find(
                        (s) => s.status === 'ACTIVE' && (s.tableId === table.id || matchTableNumber(s.tableNumber, table.tableNumber))
                      );
                      const tableOrders = activeSession
                        ? orders.filter(
                            (o) => o.tableSessionId === activeSession.id && o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
                          )
                        : [];
                      const itemCount = tableOrders.reduce((sum, o) => sum + o.items.reduce((iSum, i) => iSum + i.quantity, 0), 0);
                      const sessionTotal = tableOrders.reduce((sum, o) => sum + o.totalAmount, 0);
                      const latestOrder = tableOrders[0];

                      return (
                        <div
                          key={table.id}
                          className="bg-[#12151b] p-4 rounded-xl border border-[#1e232e] hover:border-[#2a3243] transition-colors space-y-3 flex flex-col justify-between"
                        >
                          <div className="space-y-2.5">
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="text-base font-bold text-white font-mono tracking-tight">{table.tableNumber}</h3>
                                <div className="mt-0.5">{getTableStatusBadge(table.status)}</div>
                              </div>
                              <span className="text-[11px] font-mono text-slate-300 bg-[#0c0e14] border border-[#1e232e] px-2 py-0.5 rounded flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {getOccupiedDuration(table.sessionStartedAt || activeSession?.sessionStartedAt, latestOrder?.createdAt)}
                              </span>
                            </div>

                            <div className="space-y-1 text-xs text-slate-300 bg-[#0c0e14] p-2.5 rounded-lg border border-[#1e232e]">
                              <p className="font-medium text-white text-xs">
                                {tableOrders.length > 1
                                  ? `${tableOrders.length} Orders (${tableOrders.map((o) => `#${o.id}`).join(', ')})`
                                  : latestOrder
                                  ? `Order #${latestOrder.id}`
                                  : 'No active order'}
                              </p>
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span>Item count:</span>
                                <span className="font-mono text-slate-200">{itemCount} items</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span>Session Total:</span>
                                <span className="font-mono font-semibold text-emerald-400">₹{sessionTotal.toFixed(2)}</span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-slate-400">
                                <span>Assigned Waiter:</span>
                                <span className="text-slate-200">{table.assignedWaiterName || waiterName}</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1e232e]">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs py-1.5 bg-[#141822] border-[#222838] hover:bg-[#1a202c] text-slate-200 h-8"
                              onClick={() => setSelectedTableForView(table)}
                            >
                              View Details
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              className="w-full text-xs py-1.5 bg-rose-600 hover:bg-rose-500 text-white h-8"
                              onClick={() => setSelectedTableForClose(table)}
                            >
                              Close Table
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Quick Section 2: Pending Calls Preview */}
              <div className="bg-[#12151b] border border-[#1e232e] p-5 space-y-4 rounded-xl">
                <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-semibold text-white">Pending Customer Requests</h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                      {pendingCallsList.length} Pending
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('pending-calls')} className="text-xs border-[#1e232e] bg-[#12151b] text-slate-300 hover:text-white h-7">
                    <span>View Pending Calls</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>

                {pendingCallsList.length === 0 ? (
                  <div className="p-8 text-center bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1.5">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
                    <p className="text-xs font-semibold text-slate-300">No pending customer requests.</p>
                    <p className="text-[11px] text-slate-400">All table requests have been handled.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {pendingCallsList.slice(0, 4).map((req) => (
                      <div
                        key={req.id}
                        className="bg-[#0e1117] p-3.5 rounded-xl border border-amber-500/30 hover:border-amber-500/50 transition-colors space-y-2.5"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-base font-bold text-white font-mono">{req.tableNumber}</span>
                            <div className="mt-0.5">{getRequestBadge(req.requestType, req.customTitle)}</div>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 bg-[#141822] px-2 py-0.5 rounded border border-[#1e232e]">
                            {getTimeElapsed(req.requestedAt)}
                          </span>
                        </div>

                        {req.customerNotes && (
                          <p className="text-xs text-slate-300 bg-[#12151b] p-2 rounded-lg border border-[#1e232e] italic">
                            "{req.customerNotes}"
                          </p>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                          {req.status === 'PENDING' ? (
                            <Button
                              variant="brand"
                              size="sm"
                              className="w-full text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 h-7"
                              onClick={() => handleAcceptRequest(req.id)}
                            >
                              Accept Call
                            </Button>
                          ) : (
                            <Button
                              variant="success"
                              size="sm"
                              className="w-full text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white h-7"
                              onClick={() => handleCompleteRequest(req.id)}
                            >
                              Mark Completed
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Section 3: Ready Plates Preview */}
              <div className="bg-[#12151b] border border-[#1e232e] p-5 space-y-4 rounded-xl">
                <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-white">Kitchen Ready Plates Pass</h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                      {readyPlatesList.length} Ready
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab('ready-plates')} className="text-xs border-[#1e232e] bg-[#12151b] text-slate-300 hover:text-white h-7">
                    <span>View Ready Plates</span>
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>

                {readyPlatesList.length === 0 ? (
                  <div className="p-8 text-center bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1.5">
                    <Coffee className="w-6 h-6 text-slate-500 mx-auto" />
                    <p className="text-xs font-semibold text-slate-300">No ready plates right now.</p>
                    <p className="text-[11px] text-slate-400">Kitchen staff will mark orders READY when prep completes.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {readyPlatesList.slice(0, 4).map((order) => (
                      <div
                        key={order.id}
                        className="bg-[#0e1117] p-3.5 rounded-xl border border-emerald-500/30 hover:border-emerald-500/50 transition-colors space-y-2.5"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono text-emerald-400 font-semibold block">ORDER #{order.id}</span>
                            <h3 className="text-base font-bold text-white font-mono">{order.tableNumber}</h3>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            READY
                          </span>
                        </div>

                        <div className="bg-[#12151b] p-2.5 rounded-lg border border-[#1e232e] space-y-1">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between items-center text-xs text-slate-200">
                              <span>{item.name}</span>
                              <span className="font-mono text-emerald-400 font-semibold">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        <Button
                          variant="success"
                          size="sm"
                          className="w-full text-xs font-medium py-2 bg-emerald-600 hover:bg-emerald-500 text-white h-8"
                          onClick={() => handleDeliverOrder(order.id)}
                        >
                          Deliver to Table
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ACTIVE TABLES */}
          {activeTab === 'active-tables' && (
            <div className="space-y-4 font-sans">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white tracking-tight">Active Tables Floor View</h2>
                  <p className="text-xs text-slate-400">Tables currently occupied with live customer sessions</p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-[#141822] text-slate-300 border border-[#222838]">
                  {activeTablesList.length} Active Tables
                </span>
              </div>

              {activeTablesList.length === 0 ? (
                <div className="bg-[#0e1117] border border-[#1e232e] p-10 text-center space-y-2 rounded-xl">
                  <Utensils className="w-8 h-8 text-slate-600 mx-auto" />
                  <h3 className="text-sm font-semibold text-white">No active tables right now.</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    All tables are clear and available. When guests scan table QR codes or open sessions, occupied tables will automatically appear here in real-time.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeTablesList.map((table) => {
                    const activeSession = activeSessions.find(
                      (s) => s.status === 'ACTIVE' && (s.tableId === table.id || matchTableNumber(s.tableNumber, table.tableNumber))
                    );
                    const tableOrders = activeSession ? orders.filter((o) => o.tableSessionId === activeSession.id) : [];
                    const itemCount = tableOrders.reduce((sum, o) => sum + o.items.reduce((iSum, i) => iSum + i.quantity, 0), 0);
                    const sessionTotal = tableOrders.reduce((sum, o) => sum + o.totalAmount, 0);
                    const latestOrder = tableOrders[0];

                    return (
                      <div
                        key={table.id}
                        className="bg-[#12151b] border border-[#1e232e] p-4 space-y-3 rounded-xl hover:border-[#2a3243] transition-colors flex flex-col justify-between"
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xl font-bold text-white font-mono tracking-tight">
                                  {table.tableNumber}
                                </span>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30">
                                  OCCUPIED
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                {activeSession ? `Session #${activeSession.id.slice(-6)}` : 'Active Session'}
                              </p>
                            </div>
                            <span className="text-[11px] font-mono text-slate-300 bg-[#0c0e14] border border-[#1e232e] px-2 py-0.5 rounded flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {getOccupiedDuration(table.sessionStartedAt || activeSession?.sessionStartedAt, latestOrder?.createdAt)}
                            </span>
                          </div>

                          <div className="space-y-1.5 bg-[#0c0e14] p-3 rounded-lg border border-[#1e232e] text-xs font-mono">
                            <div className="flex justify-between items-center pb-1 border-b border-[#1e232e]">
                              <span className="text-slate-400">Active Orders:</span>
                              <span className="font-semibold text-white">{tableOrders.length}</span>
                            </div>

                            <div className="flex justify-between items-center py-0.5">
                              <span className="text-slate-400">Total Items:</span>
                              <span className="text-slate-200">{itemCount}</span>
                            </div>

                            <div className="flex justify-between items-center py-0.5">
                              <span className="text-slate-400">Current Bill:</span>
                              <span className="font-bold text-emerald-400 text-sm">₹{sessionTotal.toFixed(2)}</span>
                            </div>

                            {latestOrder && (
                              <div className="flex flex-col gap-1 py-1.5 border-t border-b border-[#1e232e] text-[11px]">
                                {latestOrder.items.some((i) => getFulfillmentStation(i) === 'KITCHEN') && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Kitchen:</span>
                                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                                      latestOrder.kitchenStatus === 'READY' || (!latestOrder.kitchenStatus && latestOrder.status === 'READY')
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    }`}>
                                      {latestOrder.kitchenStatus === 'READY' ? 'READY' : latestOrder.kitchenStatus || 'COOKING'}
                                    </span>
                                  </div>
                                )}
                                {latestOrder.items.some((i) => getFulfillmentStation(i) === 'BAR') && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Bar:</span>
                                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                                      latestOrder.barStatus === 'READY' || (!latestOrder.barStatus && latestOrder.status === 'READY')
                                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    }`}>
                                      {latestOrder.barStatus === 'READY' ? 'READY' : latestOrder.barStatus || 'PREPARING'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex justify-between items-center pt-1 border-t border-[#1e232e] text-[11px]">
                              <span className="text-slate-400">Waiter:</span>
                              <span className="text-slate-200">{table.assignedWaiterName || waiterName}</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1e232e]">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs py-1.5 bg-[#141822] border-[#222838] hover:bg-[#1a202c] text-slate-200 h-8"
                            onClick={() => setSelectedTableForView(table)}
                          >
                            View Details
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            className="w-full text-xs py-1.5 bg-rose-600 hover:bg-rose-500 text-white h-8"
                            onClick={() => setSelectedTableForClose(table)}
                          >
                            Close Table
                          </Button>
                        </div>
                      </div>
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
                  <h2 className="text-base font-bold text-white tracking-tight">Pending Customer Requests</h2>
                  <p className="text-xs text-slate-400">Floor assistance, cutlery, water calls and bill check requests</p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  {pendingCallsList.length} Pending
                </span>
              </div>

              {pendingCallsList.length === 0 ? (
                <div className="bg-[#0e1117] border border-[#1e232e] p-10 text-center space-y-2 rounded-xl">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h3 className="text-sm font-semibold text-white">No pending customer requests.</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    There are no pending assistance calls right now. New customer requests will pop up in real-time.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingCallsList.map((req) => (
                    <div
                      key={req.id}
                      className="bg-[#12151b] border border-amber-500/30 p-4 space-y-3 rounded-xl hover:border-amber-500/50 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xl font-bold text-white font-mono tracking-tight">{req.tableNumber}</span>
                          <div className="mt-1">{getRequestBadge(req.requestType, req.customTitle)}</div>
                        </div>
                        <span className="text-xs font-mono text-slate-400 bg-[#0c0e14] px-2 py-0.5 rounded border border-[#1e232e]">
                          {getTimeElapsed(req.requestedAt)}
                        </span>
                      </div>

                      <div className="space-y-1.5 bg-[#0c0e14] p-3 rounded-lg border border-[#1e232e] text-xs font-mono">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-400">Status</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            {req.status}
                          </span>
                        </div>

                        <div className="flex justify-between items-center pt-1 border-t border-[#1e232e]">
                          <span className="text-slate-400">Assigned Waiter</span>
                          <span className="text-slate-200">
                            {req.assignedWaiterName || waiterName}
                          </span>
                        </div>
                      </div>

                      {req.customerNotes && (
                        <p className="text-xs text-slate-300 bg-[#0c0e14] p-2.5 rounded-lg border border-[#1e232e] italic">
                          "{req.customerNotes}"
                        </p>
                      )}

                      <div className="pt-1">
                        {req.status === 'PENDING' ? (
                          <Button
                            variant="brand"
                            size="sm"
                            className="w-full text-xs font-medium py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 h-8"
                            onClick={() => handleAcceptRequest(req.id)}
                          >
                            Accept Call
                          </Button>
                        ) : (
                          <Button
                            variant="success"
                            size="sm"
                            className="w-full text-xs font-medium py-2 bg-emerald-600 hover:bg-emerald-500 text-white h-8"
                            onClick={() => handleCompleteRequest(req.id)}
                          >
                            Mark Completed
                          </Button>
                        )}
                      </div>
                    </div>
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
                  <h2 className="text-base font-bold text-white tracking-tight">Ready Kitchen Plates Pass</h2>
                  <p className="text-xs text-slate-400">Orders marked READY by Kitchen waiting for floor delivery</p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                  {readyPlatesList.length} Ready
                </span>
              </div>

              {readyPlatesList.length === 0 ? (
                <div className="bg-[#0e1117] border border-[#1e232e] p-10 text-center space-y-2 rounded-xl">
                  <Coffee className="w-8 h-8 text-slate-500 mx-auto" />
                  <h3 className="text-sm font-semibold text-white">No ready plates right now.</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    The kitchen pass is clear. Plated dishes marked READY by chefs will appear here immediately for delivery.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {readyPlatesList.map((order) => (
                    <div
                      key={order.id}
                      className="bg-[#12151b] border border-emerald-500/30 p-4 space-y-3 rounded-xl hover:border-emerald-500/60 transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-mono text-emerald-400 font-semibold block">ORDER #{order.id}</span>
                          <h3 className="text-xl font-bold text-white font-mono tracking-tight">{order.tableNumber}</h3>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                            READY
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {getTimeElapsed(order.readyAt || order.updatedAt)}
                          </span>
                        </div>
                      </div>

                      {/* Food Items & Quantity */}
                      <div className="bg-[#0c0e14] p-3 rounded-lg border border-[#1e232e] space-y-1.5">
                        <span className="text-[10px] font-mono uppercase text-slate-400 block border-b border-[#1e232e] pb-1">
                          Items to Deliver
                        </span>
                        <div className="space-y-1">
                          {order.items.map((item) => (
                            <div key={item.id} className="flex justify-between items-center text-xs text-slate-200">
                              <span>{item.name}</span>
                              <span className="font-mono text-emerald-400 font-semibold">
                                x{item.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* DELIVER Action */}
                      <Button
                        variant="success"
                        size="sm"
                        className="w-full text-xs font-medium py-2 bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 h-8"
                        onClick={() => handleDeliverOrder(order.id)}
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>Deliver to Table</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* VIEW TABLE DETAILS MODAL */}
      {selectedTableForView && (
        <Modal
          isOpen={Boolean(selectedTableForView)}
          onClose={() => setSelectedTableForView(null)}
          title={`Table Details — ${selectedTableForView.tableNumber}`}
          maxWidth="lg"
        >
          {(() => {
            const activeSession = activeSessions.find(
              (s) => s.tableId === selectedTableForView.id && s.status === 'ACTIVE'
            );
            const sessionOrders = activeSession ? orders.filter((o) => o.tableSessionId === activeSession.id) : [];
            const sessionTotal = sessionOrders.reduce((sum, o) => sum + o.totalAmount, 0);
            const tableRequests = requests.filter(
              (r) => r.tableNumber.toLowerCase() === selectedTableForView.tableNumber.toLowerCase() && r.status !== 'COMPLETED'
            );

            return (
              <div className="space-y-4 font-sans text-slate-100">
                {/* Header Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl text-xs font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Session ID:</span>
                    <strong className="text-amber-300">{activeSession ? `#${activeSession.id}` : 'No Session'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Status:</span>
                    <strong className="text-emerald-400">ACTIVE</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Orders Count:</span>
                    <strong className="text-white">{sessionOrders.length} Orders</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Amount:</span>
                    <strong className="text-emerald-400 text-sm">₹{sessionTotal.toFixed(2)}</strong>
                  </div>
                </div>

                {/* Session Orders List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Session Orders ({sessionOrders.length})
                  </h4>
                  {sessionOrders.length === 0 ? (
                    <div className="p-6 text-center bg-slate-950/60 rounded-2xl border border-dashed border-slate-800 text-xs text-slate-500">
                      No orders placed yet for this active table session.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {sessionOrders.map((ord) => (
                        <div key={ord.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="font-bold font-mono text-white">Order #{ord.id}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant={ord.paymentStatus === 'PAID' ? 'success' : 'warning'} className="text-[10px]">
                                {ord.paymentStatus || 'UNPAID'}
                              </Badge>
                              <Badge variant="outline" className="text-[10px]">
                                {ord.status}
                              </Badge>
                            </div>
                          </div>

                          <div className="space-y-1 py-1 border-y border-slate-900">
                            {ord.items.map((it, idx) => (
                              <div key={idx} className="flex justify-between text-slate-300">
                                <span>{it.quantity}x {it.name}</span>
                                <span className="font-mono font-bold text-slate-200">₹{(it.price * it.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer Requests */}
                {tableRequests.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <PhoneCall className="w-3.5 h-3.5" /> Pending Service Requests ({tableRequests.length})
                    </h4>
                    <div className="space-y-1.5">
                      {tableRequests.map((r) => (
                        <div key={r.id} className="p-2.5 bg-amber-950/40 border border-amber-800/50 rounded-xl flex justify-between items-center text-xs">
                          <span className="text-amber-200 font-medium">{r.requestType.replace('_', ' ')}</span>
                          <Button size="sm" variant="brand" className="text-[10px] py-1" onClick={() => handleCompleteRequest(r.id)}>
                            Mark Done ✓
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={() => setSelectedTableForView(null)} className="border-slate-800 text-slate-300">
                    Close Window
                  </Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* CLOSE TABLE CONFIRMATION MODAL */}
      {selectedTableForClose && (
        <Modal
          isOpen={Boolean(selectedTableForClose)}
          onClose={() => setSelectedTableForClose(null)}
          title={`Close Table ${selectedTableForClose.tableNumber} Confirmation`}
          maxWidth="md"
        >
          {(() => {
            const activeSession = activeSessions.find(
              (s) => s.tableId === selectedTableForClose.id && s.status === 'ACTIVE'
            );
            const sessionOrders = activeSession ? orders.filter((o) => o.tableSessionId === activeSession.id) : [];
            const sessionTotal = sessionOrders.reduce((sum, o) => sum + o.totalAmount, 0);
            const allPaid = sessionOrders.every((o) => o.paymentStatus === 'PAID' || o.status === 'COMPLETED');

            return (
              <div className="space-y-4 font-sans text-slate-100">
                <div className="p-4 bg-rose-950/50 border border-rose-800/60 rounded-2xl space-y-1 text-rose-200">
                  <h4 className="font-black text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400" /> Confirm Session Closure & Reset
                  </h4>
                  <p className="text-xs text-rose-300/80">
                    Closing <strong className="text-white">{selectedTableForClose.tableNumber}</strong> will mark the table <strong>VACANT</strong> and reset the customer session. Session history will remain stored safely in database archives.
                  </p>
                </div>

                <div className="space-y-2 bg-slate-900 border border-slate-800 p-4 rounded-2xl text-xs font-mono">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                    <span className="text-slate-400">Session ID:</span>
                    <span className="font-bold text-amber-300">{activeSession ? `#${activeSession.id}` : 'ACTIVE'}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Total Orders Placed:</span>
                    <span className="font-bold text-white">{sessionOrders.length} Orders</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400">Payment Status:</span>
                    <Badge variant={allPaid ? 'success' : 'warning'} className="text-[10px]">
                      {allPaid ? 'PAID' : 'PAYMENT PENDING / UNPAID'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-sm">
                    <span className="font-bold text-white">TOTAL BILL AMOUNT:</span>
                    <span className="font-black text-emerald-400 text-base">₹{sessionTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedTableForClose(null)}
                    disabled={isClosingTableLoading}
                    className="border-slate-800 text-slate-300"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    disabled={isClosingTableLoading}
                    onClick={async () => {
                      setIsClosingTableLoading(true);
                      try {
                        const targetTbl = selectedTableForClose;
                        const activeSess = activeSessions.find(
                          (s) => s.status === 'ACTIVE' && (s.tableId === targetTbl.id || matchTableNumber(s.tableNumber, targetTbl.tableNumber))
                        );
                        await api.closeTableSession({
                          restaurantId: currentRestaurantId,
                          tableId: targetTbl.id,
                          waiterName: waiterName,
                          tableSessionId: activeSess?.id,
                        });
                        showToast('Table Session Closed 🧹', `${targetTbl.tableNumber} is now available for new guests`, 'success');
                        setSelectedTableForClose(null);

                        // Optimistically clear closed session from React state
                        setActiveSessions((prev) =>
                          prev.filter(
                            (s) =>
                              s.id !== activeSess?.id &&
                              s.tableId !== targetTbl.id &&
                              !matchTableNumber(s.tableNumber, targetTbl.tableNumber)
                          )
                        );
                        setTables((prev) =>
                          prev.map((t) =>
                            t.id === targetTbl.id || matchTableNumber(t.tableNumber, targetTbl.tableNumber)
                              ? { ...t, status: 'AVAILABLE', isOccupied: false, activeSessionId: undefined }
                              : t
                          )
                        );

                        await loadData();
                      } catch (err: any) {
                        showToast('Error', err.message || 'Failed to close table session', 'warning');
                      } finally {
                        setIsClosingTableLoading(false);
                      }
                    }}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold"
                  >
                    {isClosingTableLoading ? 'Closing Session...' : 'Close & Reset Table 🧹'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
};
