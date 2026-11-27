import React, { useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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
  Check,
  Package,
  Sparkles as SparklesIcon,
  Printer,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Avatar,
  SearchInput,
  Modal,
  QRCodeDisplay,
  DinelyLogo,
} from '../../packages/ui';
import { api } from '../../packages/api/client';
import {
  Order,
  OrderItem,
  Table,
  TableSession,
  CustomerRequest,
  CustomerRequestType,
  CustomerRequestStatus,
  WaiterNotification,
  getFulfillmentStation,
  Bill,
  PaymentMethod,
  Restaurant,
  isModuleEnabled,
} from '../../packages/types';
import { realtimeBus, ConnectionStatusType } from '../../packages/api/realtime';
import { matchTableNumber } from '../../packages/utils/tableUtils';
import { calculateAuthoritativeSessionBill } from '../../packages/utils/billingUtils';
import { useTheme } from '../../packages/theme/ThemeEngine';

// Shared Web Audio API Chime Synthesizer (singleton AudioContext avoids main-thread stalls)
let sharedAudioCtx: AudioContext | null = null;
const playNotificationChime = () => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    const ctx = sharedAudioCtx;

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

// Standalone Live Clock component to avoid re-rendering entire WaiterTerminalOS on each second
const LiveClock: React.FC = () => {
  const [time, setTime] = useState<string>('');
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);
  return <span className="font-tabular">{time || '08:42 PM'}</span>;
};

interface WaiterTerminalOSProps {
  restaurant?: Restaurant;
  onLogout?: () => void;
  isEmbedded?: boolean;
  initialOrders?: Order[];
  initialTables?: Table[];
  initialBills?: Bill[];
}

export const WaiterTerminalOS: React.FC<WaiterTerminalOSProps> = ({
  restaurant,
  onLogout,
  isEmbedded = false,
  initialOrders,
  initialTables,
  initialBills,
}) => {
  const { formatPrice } = useTheme();

  // Navigation view state: 'floor' (Default: 1-Screen Live Service Floor) or 'tables' (Floor Management)
  const [waiterView, setWaiterView] = useState<'floor' | 'tables'>('floor');

  // Preferences & Status State
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  // Ref so mute/unmute does NOT re-register the event subscription effect
  const isAudioMutedRef = React.useRef<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (initialOrders && initialOrders.length > 0) return false;
    if (typeof window !== 'undefined' && Array.isArray((api as any)?.orders) && (api as any).orders.length > 0) return false;
    return true;
  });
  const [isErrorState, setIsErrorState] = useState<boolean>(false);
  const [wsStatus, setWsStatus] = useState<ConnectionStatusType>('CONNECTING');

  // Core Data State - pre-populated from initial props or in-memory API cache for instant render without blank screen
  const [requests, setRequests] = useState<CustomerRequest[]>(() => {
    if (typeof window !== 'undefined' && Array.isArray((api as any)?.customerRequests)) {
      const restId = restaurant?.id || api.getCurrentRestaurantId();
      return (api as any).customerRequests.filter((r: any) => !restId || r.restaurantId === restId);
    }
    return [];
  });
  const [orders, setOrders] = useState<Order[]>(() => {
    if (initialOrders && initialOrders.length > 0) return initialOrders;
    if (typeof window !== 'undefined' && Array.isArray((api as any)?.orders)) {
      const restId = restaurant?.id || api.getCurrentRestaurantId();
      return (api as any).orders.filter((o: any) => !restId || o.restaurantId === restId);
    }
    return [];
  });
  const [tables, setTables] = useState<Table[]>(() => {
    if (initialTables && initialTables.length > 0) return initialTables;
    if (typeof window !== 'undefined' && Array.isArray((api as any)?.tables)) {
      const restId = restaurant?.id || api.getCurrentRestaurantId();
      return (api as any).tables.filter((t: any) => !restId || t.restaurantId === restId);
    }
    return [];
  });
  const [activeSessions, setActiveSessions] = useState<TableSession[]>(() => {
    if (typeof window !== 'undefined' && Array.isArray((api as any)?.tableSessions)) {
      const restId = restaurant?.id || api.getCurrentRestaurantId();
      return (api as any).tableSessions.filter((s: any) => !restId || s.restaurantId === restId);
    }
    return [];
  });
  const [notifications, setNotifications] = useState<WaiterNotification[]>([]);
  const [bills, setBills] = useState<Bill[]>(() => {
    if (initialBills && initialBills.length > 0) return initialBills;
    if (typeof window !== 'undefined' && Array.isArray((api as any)?.bills)) {
      const restId = restaurant?.id || api.getCurrentRestaurantId();
      return (api as any).bills.filter((b: any) => !restId || b.restaurantId === restId);
    }
    return [];
  });

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Table Modal States
  const [selectedTableForView, setSelectedTableForView] = useState<Table | null>(null);
  const [selectedTableForClose, setSelectedTableForClose] = useState<Table | null>(null);
  const [isClosingTableLoading, setIsClosingTableLoading] = useState(false);

  // Bill & Payment Action Modal State
  const [selectedBillForAction, setSelectedBillForAction] = useState<{
    bill: Bill | null;
    request?: CustomerRequest;
    tableNumber: string;
    tableSessionId?: string;
  } | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('CASH');
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);

  // Debounce protection and history view mode
  const [ticketFilter, setTicketFilter] = useState<'ready' | 'prep' | 'all'>('all');
  const isFetchingRef = React.useRef<boolean>(false);
  const [deliveringOrderIds, setDeliveringOrderIds] = useState<Set<string>>(new Set());
  const [collectingOrderIds, setCollectingOrderIds] = useState<Set<string>>(new Set());
  const [completingRequestIds, setCompletingRequestIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');
  const [recentCompletedHistory, setRecentCompletedHistory] = useState<
    Array<{ id: string; type: 'ORDER_DELIVERED' | 'REQUEST_FULFILLED'; title: string; time: string; details: string }>
  >([]);

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
  const currentUser = api.getCurrentUser('WAITER') || api.getCurrentUser('STAFF') || api.getCurrentUser();
  const urlRestParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('restaurant') || new URLSearchParams(window.location.search).get('restaurantId') : null;
  const currentRestaurantId = restaurant?.id || urlRestParam || api.getCurrentRestaurantId() || currentUser?.restaurantId || '';
  const restaurantName = restaurant?.name || api.restaurants.find((r) => r.id === currentRestaurantId)?.name || 'THE START';
  const waiterName = currentUser?.name || 'Ayaan';
  const assignedTerminal = (currentUser as any)?.assignedTerminal || 'WAITER-01';

  // Keep isAudioMutedRef in sync with state without re-registering effects
  useEffect(() => {
    isAudioMutedRef.current = isAudioMuted;
  }, [isAudioMuted]);

  // Robust session-scoped table order filter: ignores past orphaned test orders
  const filterOrdersForTableSession = (
    ordersList: Order[],
    tableNum: string,
    session?: any | null
  ): Order[] => {
    if (session) {
      const sessionStartTime = session.sessionStartedAt ? new Date(session.sessionStartedAt).getTime() : 0;
      return ordersList.filter((o) => {
        if (o.status === 'CANCELLED') return false;
        if (o.tableSessionId === session.id) return true;
        if (!o.tableSessionId && matchTableNumber(o.tableNumber, tableNum) && o.paymentStatus !== 'PAID') {
          if (sessionStartTime > 0) {
            const ordTime = o.createdAt ? new Date(o.createdAt).getTime() : 0;
            return ordTime >= (sessionStartTime - 10000);
          }
          return true;
        }
        return false;
      });
    }
    return ordersList.filter(
      (o) => matchTableNumber(o.tableNumber, tableNum) && o.paymentStatus !== 'PAID' && o.status !== 'CANCELLED'
    );
  };

  // Fetch data strictly for authenticated employee's restaurant
  const loadData = async (silent: boolean = false) => {
    if (isFetchingRef.current && silent) return;
    isFetchingRef.current = true;
    try {
      if (!silent) setIsErrorState(false);
      const targetRestId = currentRestaurantId;

      const isNotWedding = (restaurant as any)?.businessType !== 'WEDDING_ORDERING';
      
      // Consolidated high-speed snapshot (1 round-trip instead of 6 parallel queries)
      const [snapshot, notifData] = await Promise.all([
        api.getWaiterSnapshot(targetRestId),
        api.getWaiterNotifications(targetRestId).catch(() => []),
      ]);

      let reqData = snapshot.customerRequests;
      if (!Array.isArray(reqData)) {
        reqData = await api.getCustomerRequests(targetRestId, undefined, true).catch(() => []);
      }
      setRequests(reqData);
      const cleanOrders = (snapshot.orders || []).filter(
        (o: Order) => !isNotWedding || (o.orderType !== 'WEDDING_EVENT' && !o.eventId)
      );
      setOrders(cleanOrders);
      setTables(snapshot.tables || []);
      setNotifications(notifData);
      setActiveSessions(snapshot.activeSessions || []);
      setBills(snapshot.bills || []);
      setIsErrorState(false);
    } catch (err) {
      console.error('Failed to load Waiter Terminal data:', err);
      if (!silent) setIsErrorState(true);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
    }
  };

  // Realtime WebSocket Connection & Connection Status Sync
  useEffect(() => {
    if (currentRestaurantId) {
      realtimeBus.connect(currentRestaurantId, isEmbedded ? 'OWNER' : 'WAITER');
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
  }, [currentRestaurantId, isEmbedded]);

  // Task 6.4: Realtime Reliability & Dropped WebSocket Fallback Polling
  // Fast adaptive interval (2.5s when WS is DISCONNECTED/RECONNECTING, 6s background safety when healthy)
  useEffect(() => {
    const pollIntervalMs = wsStatus === 'CONNECTED' ? 3500 : 1500;
    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    }, pollIntervalMs);

    return () => clearInterval(pollInterval);
  }, [wsStatus, currentRestaurantId]);

  // Real-Time Granular Event-Driven State Dispatch (Zero-Latency, No Full Page Reloads)
  useEffect(() => {
    loadData(false);

    const handledEventIds = new Set<string>();

    const unsubscribe = realtimeBus.subscribe((event) => {
      // 1. Strict multi-tenant isolation with slug/UUID resilience
      const evtRestId = (event as any).restaurantId || (event as any).restaurant_id;
      if (evtRestId) {
        const resolvedCurrentRestId = api.getCurrentRestaurantId();
        const normEvt = String(evtRestId).toLowerCase();
        const normCurr = String(currentRestaurantId).toLowerCase();
        const normResolved = String(resolvedCurrentRestId).toLowerCase();
        const restId = (restaurant?.id || '').toLowerCase();
        const restSlug = (restaurant?.slug || '').toLowerCase();
        const restPubSlug = (restaurant?.publicSlug || '').toLowerCase();

        const isMatchingTenant =
          normEvt === normCurr ||
          normEvt === normResolved ||
          (restId && normEvt === restId) ||
          (restSlug && normEvt === restSlug) ||
          (restPubSlug && normEvt === restPubSlug) ||
          normEvt.includes(normCurr) ||
          normCurr.includes(normEvt) ||
          (restId && (normEvt.includes(restId) || restId.includes(normEvt))) ||
          (restSlug && (normEvt.includes(restSlug) || restSlug.includes(normEvt)));
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

      // 3. Play chime for call/ready events — read mute state from ref (stable, no closure staleness)
      const isChimeEvent =
        event.type === 'service_request_created' ||
        event.type === 'order_ready' ||
        event.type === 'CustomerRequestCreated' ||
        event.type === 'OrderReady' ||
        event.type === 'waiter_requested' ||
        event.type === 'WaiterRequested';

      if (isChimeEvent && !isAudioMutedRef.current) {
        playNotificationChime();
      }

      const tblNum = (event as any).tableNumber || (event as any).table_number || (event as any).payload?.tableNumber || (event as any).payload?.table_number || 'Table';
      const reqTitle = (event as any).customTitle || (event as any).requestType || (event as any).payload?.customTitle || (event as any).payload?.requestType || 'Assistance';

      // 4. Granular instant state dispatch
      if (
        event.type === 'ETAUpdated' ||
        (event as any).type === 'ETA_UPDATED' ||
        (event as any).type === 'eta_updated'
      ) {
        const payloadData = (event as any).payload || (event as any).data || event;
        const orderId = (event as any).orderId || (event as any).order_id || payloadData.orderId || payloadData.order_id || payloadData.id;
        const mins = payloadData.estimatedPrepTimeMinutes ?? (event as any).estimatedPrepTimeMinutes ?? (event as any).estimated_prep_time_minutes;
        const target = payloadData.etaTargetTimestamp ?? (event as any).etaTargetTimestamp ?? (event as any).eta_target_timestamp;
        if (orderId) {
          setOrders((prev) =>
            prev.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    estimatedPrepTimeMinutes: mins !== undefined ? mins : o.estimatedPrepTimeMinutes,
                    etaTargetTimestamp: target !== undefined ? target : o.etaTargetTimestamp,
                  }
                : o
            )
          );
        }
        return;
      } else if (event.type === 'waiter_requested' || event.type === 'WaiterRequested') {
        const payloadData = (event as any).payload || (event as any).data || event;
        const orderId = payloadData.orderId || payloadData.order_id || (event as any).orderId || (event as any).order_id;
        const station = (payloadData.station || (event as any).station || 'KITCHEN').toUpperCase();
        if (orderId) {
          setOrders((prev) =>
            prev.map((o) => {
              if (o.id !== orderId) return o;
              const patch: any = { deliveryStatus: 'WAITING_FOR_WAITER' };
              if (station === 'KITCHEN') {
                patch.kitchenWaiterRequested = true;
                if (!o.kitchenStatus || o.kitchenStatus === 'PREPARING') patch.kitchenStatus = 'READY';
              } else if (station === 'BAR') {
                patch.barWaiterRequested = true;
                if (!o.barStatus || o.barStatus === 'PREPARING') patch.barStatus = 'READY';
              } else if (station === 'HOOKAH') {
                patch.hookahWaiterRequested = true;
                if (!o.hookahStatus || o.hookahStatus === 'PREPARING') patch.hookahStatus = 'READY';
              }
              return { ...o, ...patch };
            })
          );
        }
      } else if (event.type === 'order_collected' || event.type === 'OrderCollected') {
        const payloadData = (event as any).payload || (event as any).data || event;
        const orderId = payloadData.orderId || payloadData.order_id || (event as any).orderId || (event as any).order_id;
        const waiterName = payloadData.waiterName || payloadData.waiter_name || (event as any).waiterName;
        if (orderId) {
          setOrders((prev) =>
            prev.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    deliveryStatus: 'COLLECTED',
                    claimedBy: waiterName || o.claimedBy || 'Floor Waiter',
                  }
                : o
            )
          );
        }
      } else if (event.type === 'service_request_created' || event.type === 'CustomerRequestCreated' || event.type === 'WaiterCalled') {
        const payloadData = (event as any).payload || (event as any).data || event;
        const reqType = (payloadData.requestType || payloadData.request_type || '').toUpperCase();
        // Station order ready passes belong strictly to Section A (Kitchen Pass & Orders), NOT Section B
        if (
          reqType === 'ORDER_READY' ||
          reqType === 'DISH_READY' ||
          reqType === 'BAR_READY' ||
          reqType === 'HOOKAH_READY' ||
          Boolean(payloadData.orderId) ||
          Boolean(payloadData.order_id)
        ) {
          return;
        }

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
      } else if (event.type === 'service_request_updated' || event.type === 'CustomerRequestUpdated') {
        const payloadData = (event as any).payload || (event as any).data || event;
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
        const payloadOrder = (event as any).order || (event as any).payload?.order || (event as any).payload || (event as any).data || ((event as any).items ? event : null);
        if (payloadOrder && payloadOrder.id) {
          setOrders((prev) => {
            if (prev.some((o) => o.id === payloadOrder.id)) {
              return prev.map((o) => (o.id === payloadOrder.id ? payloadOrder : o));
            }
            return [payloadOrder, ...prev];
          });
        } else {
          api.getOrders(currentRestaurantId, { activeOnly: true }).then(setOrders).catch(() => {});
        }
      } else if (event.type === 'order_ready' || event.type === 'OrderReady') {
        const payloadData = (event as any).payload || event;
        const incomingOrder = payloadData.order || (payloadData.id ? payloadData : (event as any).order);
        const orderId = payloadData.orderId || payloadData.order_id || incomingOrder?.id || (event as any).orderId || (event as any).order_id;
        const station = (payloadData.station || (event as any).station || '').toUpperCase();
        const stationPatch: any = { status: 'READY' };
        if (station === 'HOOKAH') {
          stationPatch.hookahStatus = 'READY';
          stationPatch.hookahWaiterRequested = true;
        } else if (station === 'BAR') {
          stationPatch.barStatus = 'READY';
          stationPatch.barWaiterRequested = true;
        } else if (station === 'KITCHEN') {
          stationPatch.kitchenStatus = 'READY';
          stationPatch.kitchenWaiterRequested = true;
        } else {
          if (incomingOrder?.kitchenStatus) stationPatch.kitchenStatus = incomingOrder.kitchenStatus;
          if (incomingOrder?.barStatus) stationPatch.barStatus = incomingOrder.barStatus;
          if (incomingOrder?.hookahStatus) stationPatch.hookahStatus = incomingOrder.hookahStatus;
        }

        if (incomingOrder && incomingOrder.id) {
          setOrders((prev) => {
            const exists = prev.some((o) => o.id === incomingOrder.id);
            if (exists) {
              return prev.map((o) => (o.id === incomingOrder.id ? { ...o, ...incomingOrder, ...stationPatch } : o));
            }
            return [{ ...incomingOrder, ...stationPatch }, ...prev];
          });
        } else if (orderId) {
          setOrders((prev) => {
            const exists = prev.some((o) => o.id === orderId);
            if (exists) {
              return prev.map((o) => (o.id === orderId ? { ...o, ...stationPatch } : o));
            }
            return prev;
          });
          api.getOrders(currentRestaurantId, { activeOnly: true }).then((fresh) => {
            if (fresh && Array.isArray(fresh)) setOrders(fresh);
          }).catch(() => {});
        } else {
          api.getOrders(currentRestaurantId, { activeOnly: true }).then((fresh) => {
            if (fresh && Array.isArray(fresh)) setOrders(fresh);
          }).catch(() => {});
        }
      } else if (event.type === 'order_delivered' || event.type === 'OrderDelivered') {
        const payloadData = (event as any).payload || event;
        const orderId = payloadData.orderId || payloadData.order_id || payloadData.id || (event as any).orderId || (event as any).order_id;
        const station = (payloadData.station || (event as any).station || '').toUpperCase();
        if (orderId) {
          setOrders((prev) =>
            prev.map((o) => {
              if (o.id !== orderId) return o;
              if (station === 'HOOKAH') {
                return { ...o, hookahStatus: 'COMPLETED' };
              }
              if (station === 'BAR') {
                return { ...o, barStatus: 'COMPLETED' };
              }
              if (station === 'KITCHEN') {
                return { ...o, kitchenStatus: 'COMPLETED' };
              }
              return {
                ...o,
                status: 'DELIVERED',
                deliveryStatus: 'DELIVERED',
                kitchenStatus: 'COMPLETED',
                barStatus: 'COMPLETED',
                hookahStatus: 'COMPLETED',
              };
            })
          );
        }
      } else if (
        event.type === 'order_status_updated' ||
        event.type === 'OrderStatusUpdated' ||
        event.type === 'KitchenStatusUpdated' ||
        event.type === 'kitchen_status_updated' ||
        event.type === 'HookahStatusUpdated' ||
        event.type === 'BarStatusUpdated'
      ) {
        const payloadData = (event as any).payload || (event as any).data || event;
        const orderId = (event as any).orderId || (event as any).order_id || payloadData.orderId || payloadData.order_id || payloadData.id;
        const newStatus = (event as any).status || payloadData.status;
        const newKitchenStatus = (event as any).kitchenStatus || (event as any).kitchen_status || payloadData.kitchenStatus || payloadData.kitchen_status;
        const newBarStatus = (event as any).barStatus || payloadData.barStatus;
        const newHookahStatus = (event as any).hookahStatus || payloadData.hookahStatus;
        const newDeliveryStatus = (event as any).deliveryStatus || payloadData.deliveryStatus || (event as any).delivery_status || payloadData.delivery_status;
        const newClaimedBy = (event as any).claimedBy || payloadData.claimedBy || (event as any).claimed_by || payloadData.claimed_by;
        const waiterRequested = (event as any).kitchenWaiterRequested ?? (event as any).kitchen_waiter_requested ?? payloadData.kitchenWaiterRequested ?? payloadData.kitchen_waiter_requested;
        const mins = (event as any).estimatedPrepTimeMinutes ?? (event as any).estimated_prep_time_minutes ?? payloadData.estimatedPrepTimeMinutes ?? payloadData.estimated_prep_time_minutes;
        const target = (event as any).etaTargetTimestamp ?? (event as any).eta_target_timestamp ?? payloadData.etaTargetTimestamp ?? payloadData.eta_target_timestamp;

        if (orderId) {
          setOrders((prev) =>
            prev.map((o) => {
              if (o.id !== orderId) return o;
              return {
                ...o,
                status: newStatus || o.status,
                kitchenStatus: newKitchenStatus !== undefined ? newKitchenStatus : o.kitchenStatus,
                barStatus: newBarStatus !== undefined ? newBarStatus : o.barStatus,
                hookahStatus: newHookahStatus !== undefined ? newHookahStatus : o.hookahStatus,
                deliveryStatus: newDeliveryStatus || o.deliveryStatus,
                claimedBy: newClaimedBy || o.claimedBy,
                kitchenWaiterRequested: waiterRequested !== undefined ? waiterRequested : o.kitchenWaiterRequested,
                estimatedPrepTimeMinutes: mins !== undefined ? mins : o.estimatedPrepTimeMinutes,
                etaTargetTimestamp: target !== undefined ? target : o.etaTargetTimestamp,
              };
            })
          );
        }
      } else if (event.type === 'table_session_closed' || event.type === 'TableSessionClosed') {
        const tblId = (event as any).tableId || (event as any).table_id || (event as any).payload?.tableId;
        const sessId = (event as any).tableSessionId || (event as any).table_session_id || (event as any).sessionId;

        setTables((prev) =>
          prev.map((t) =>
            t.id === tblId || (tblNum && tblNum !== 'Table' && matchTableNumber(t.tableNumber, tblNum))
              ? { ...t, status: 'AVAILABLE', isOccupied: false, activeSessionId: undefined, sessionStartedAt: undefined }
              : t
          )
        );
        setActiveSessions((prev) =>
          prev.filter((s) =>
            (sessId ? s.id !== sessId : true) &&
            (tblId ? s.tableId !== tblId : true) &&
            (tblNum && tblNum !== 'Table' ? !matchTableNumber(s.tableNumber, tblNum) : true)
          )
        );
        if (sessId) {
          setRequests((prev) => prev.filter((r) => r.tableSessionId !== sessId));
        }
      } else if (event.type === 'table_status_updated' || event.type === 'TableStatusUpdated') {
        const payloadData = (event as any).payload || event;
        const newStatus = payloadData.status || payloadData.table_status || payloadData.tableStatus;
        const isOccupied = payloadData.is_occupied ?? payloadData.isOccupied ?? (newStatus === 'OCCUPIED');
        const tblId = payloadData.tableId || payloadData.table_id;
        const sessId = payloadData.sessionId || payloadData.session_id || payloadData.table_session_id;

        if (newStatus === 'AVAILABLE' || isOccupied === false) {
          setTables((prev) =>
            prev.map((t) =>
              t.id === tblId || (tblNum && tblNum !== 'Table' && matchTableNumber(t.tableNumber, tblNum))
                ? { ...t, status: 'AVAILABLE', isOccupied: false, activeSessionId: undefined, sessionStartedAt: undefined }
                : t
            )
          );
          setActiveSessions((prev) =>
            prev.filter((s) =>
              (sessId ? s.id !== sessId : true) &&
              (tblId ? s.tableId !== tblId : true) &&
              (tblNum && tblNum !== 'Table' ? !matchTableNumber(s.tableNumber, tblNum) : true)
            )
          );
        } else {
          const sess = payloadData.session || (sessId ? { id: sessId, tableId: tblId, tableNumber: tblNum, status: 'ACTIVE' } : null);
          if (sess && sess.id) {
            setActiveSessions((prev) => [sess, ...prev.filter((s) => s.id !== sess.id)]);
          }
          if (tblId || (tblNum && tblNum !== 'Table')) {
            setTables((prev) =>
              prev.map((t) =>
                t.id === tblId || (tblNum && tblNum !== 'Table' && matchTableNumber(t.tableNumber, tblNum))
                  ? { ...t, status: 'OCCUPIED', isOccupied: true, activeSessionId: sess?.id || t.activeSessionId }
                  : t
              )
            );
          }
        }
      } else if (event.type === 'table_session_created' || event.type === 'TableSessionCreated') {
        const sess = (event as any).session || (event as any).payload?.session;
        const tblId = (event as any).tableId || sess?.tableId;
        if (sess && sess.id) {
          setActiveSessions((prev) => [sess, ...prev.filter((s) => s.id !== sess.id)]);
          if (tblId || sess.tableNumber) {
            setTables((prev) =>
              prev.map((t) =>
                t.id === tblId || matchTableNumber(t.tableNumber, sess.tableNumber)
                  ? { ...t, status: 'OCCUPIED', isOccupied: true, activeSessionId: sess.id }
                  : t
              )
            );
          }
        }
      } else if (event.type === 'payment_status_updated' || event.type === 'BillPaid') {
        const payloadData = (event as any).payload || event;
        const bId = payloadData.bill_id || payloadData.billId || payloadData.id;
        const newStatus = payloadData.status || payloadData.payment_status || payloadData.paymentStatus || 'PAID';
        if (bId) {
          setBills((prev) =>
            prev.map((b) => (b.id === bId ? { ...b, status: newStatus, paymentStatus: newStatus } : b))
          );
        }
        api.getBills(currentRestaurantId).then((fresh) => {
          if (Array.isArray(fresh)) setBills(fresh);
        }).catch(() => {});
      } else if (event.type === 'BillRequested' || event.type === 'bill_updated') {
        const payloadData = (event as any).payload || event;
        const incomingBill = payloadData.data || payloadData.bill || (payloadData.id ? payloadData : null);
        if (incomingBill && incomingBill.id) {
          setBills((prev) => {
            if (prev.some((b) => b.id === incomingBill.id)) {
              return prev.map((b) => (b.id === incomingBill.id ? incomingBill : b));
            }
            return [incomingBill, ...prev];
          });
        } else {
          api.getBills(currentRestaurantId).then((fresh) => {
            if (Array.isArray(fresh)) setBills(fresh);
          }).catch(() => {});
        }
      } else if (event.type === 'DayClosed' || event.type === 'BusinessDayClosed') {
        setRequests([]);
        setActiveSessions([]);
        setTables((prev) =>
          prev.map((t) => ({
            ...t,
            status: 'AVAILABLE',
            isOccupied: false,
            activeSessionId: undefined,
          }))
        );
      }
    });

    return () => {
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRestaurantId]); // isAudioMuted intentionally excluded — managed via ref

  // Request Actions with Instant Optimistic UI Response and Debounce Guard
  const handleAcceptRequest = async (requestId: string) => {
    if (completingRequestIds.has(requestId)) return;
    setCompletingRequestIds((prev) => new Set(prev).add(requestId));
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
    } finally {
      setCompletingRequestIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleCompleteRequest = async (requestId: string) => {
    if (completingRequestIds.has(requestId)) return;
    setCompletingRequestIds((prev) => new Set(prev).add(requestId));
    const reqToComplete = requests.find((r) => r.id === requestId);
    // Instant optimistic state update
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: 'COMPLETED' } : r))
    );
    if (reqToComplete) {
      setRecentCompletedHistory((prev) => [
        {
          id: requestId,
          type: 'REQUEST_FULFILLED',
          title: `Table ${reqToComplete.tableNumber} · ${reqToComplete.requestType} Completed`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          details: reqToComplete.customerNotes || reqToComplete.customTitle || 'Service request fulfilled',
        },
        ...prev,
      ].slice(0, 25));
    }
    showToast('Request Completed ✅', 'Request fulfilled and cleared from live queue.', 'success');
    try {
      await api.updateCustomerRequest(requestId, 'COMPLETED', waiterName);
    } catch (err: any) {
      showToast('Error', err.message || 'Failed to complete request', 'warning');
      loadData(true);
    } finally {
      setCompletingRequestIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  // Order Collection Handler (Transition: WAITING_FOR_WAITER/READY -> COLLECTED)
  const handleCollectOrder = async (orderId: string, tableNumber?: string) => {
    if (collectingOrderIds.has(orderId)) return;
    setCollectingOrderIds((prev) => new Set(prev).add(orderId));
    const waiterName = currentUser?.name || currentUser?.email || 'Floor Waiter';
    // Optimistic state update
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, deliveryStatus: 'COLLECTED', claimedBy: waiterName }
          : o
      )
    );
    const tblFormatted = tableNumber ? (tableNumber.startsWith('Table') ? tableNumber : `Table ${tableNumber}`) : 'Table';
    showToast('Order Accepted 🍽️', `Order #${orderId.slice(-4)} accepted for ${tblFormatted}. Collecting from pass...`, 'info');
    try {
      await api.collectOrder(orderId, undefined, waiterName);
    } catch (err: any) {
      showToast('Collection Notice ⚠️', err.message || 'Failed to record collection', 'warning');
      loadData(true);
    } finally {
      setCollectingOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Order Delivery Handler (Valid transition: READY -> DELIVERED, strictly respecting station isolation)
  const handleDeliverOrder = async (orderId: string, tableNumber?: string, station?: string) => {
    if (deliveringOrderIds.has(orderId)) return;
    setDeliveringOrderIds((prev) => new Set(prev).add(orderId));
    const ordToDeliver = orders.find((o) => o.id === orderId);

    // Instant optimistic state update strictly respecting station isolation
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        if (!station || station === 'ALL') {
          return {
            ...o,
            status: 'DELIVERED',
            deliveryStatus: 'DELIVERED',
            kitchenStatus: 'COMPLETED',
            barStatus: 'COMPLETED',
            hookahStatus: 'COMPLETED',
          };
        }
        const st = station.toUpperCase();
        const updated = {
          ...o,
          kitchenStatus: st === 'KITCHEN' ? 'COMPLETED' : o.kitchenStatus,
          barStatus: st === 'BAR' ? 'COMPLETED' : o.barStatus,
          hookahStatus: st === 'HOOKAH' ? 'COMPLETED' : o.hookahStatus,
        };
        const kDone = !updated.kitchenStatus || updated.kitchenStatus === 'COMPLETED';
        const bDone = !updated.barStatus || updated.barStatus === 'COMPLETED';
        const hDone = !updated.hookahStatus || updated.hookahStatus === 'COMPLETED';
        if (kDone && bDone && hDone) {
          updated.status = 'DELIVERED';
          updated.deliveryStatus = 'DELIVERED';
        } else {
          updated.deliveryStatus = 'PARTIALLY_DELIVERED';
        }
        return updated;
      })
    );
    setRequests((prev) =>
      prev.map((r) => {
        const rOrderId = (r as any).orderId || (r as any).order_id;
        const rStation = ((r as any).station || '').toUpperCase();
        if (rOrderId === orderId && (!station || station === 'ALL' || !rStation || rStation === station.toUpperCase())) {
          return { ...r, status: 'COMPLETED' };
        }
        return r;
      })
    );
    if (ordToDeliver) {
      setRecentCompletedHistory((prev) => [
        {
          id: orderId,
          type: 'ORDER_DELIVERED',
          title: `Table ${ordToDeliver.tableNumber || tableNumber} · Order #${orderId.slice(-4)} Delivered${station ? ` (${station})` : ''}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          details: (ordToDeliver.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', '),
        },
        ...prev,
      ].slice(0, 25));
    }
    const tblFormatted = tableNumber ? (tableNumber.startsWith('Table') ? tableNumber : `Table ${tableNumber}`) : 'Table';
    showToast('Order Delivered 🎉', `Order delivered to ${tblFormatted}`, 'success');
    try {
      await api.deliverOrder(orderId, station, waiterName);
    } catch (err: any) {
      showToast('Delivery Error ⚠️', err.message || 'Failed to deliver order', 'warning');
      loadData(true);
    } finally {
      setDeliveringOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  // Helper to find matching non-closed bill for a customer request
  const getBillForRequest = (req: CustomerRequest): Bill | undefined => {
    if (req.tableSessionId) {
      const bySess = bills.find((b) => b.tableSessionId === req.tableSessionId && b.status !== 'CLOSED' && b.status !== 'CANCELLED' && b.paymentStatus !== 'PAID');
      if (bySess) return bySess;
    }
    return bills.find((b) => matchTableNumber(b.tableNumber, req.tableNumber) && b.status !== 'CLOSED' && b.status !== 'CANCELLED' && b.paymentStatus !== 'PAID');
  };

  // Helper to resolve amount for a customer request
  const getAmountForRequest = (req: CustomerRequest, matchingBill?: Bill): number => {
    if (matchingBill && matchingBill.grandTotal) return matchingBill.grandTotal;
    const sess = activeSessions.find(
      (s) => (req.tableSessionId && s.id === req.tableSessionId) || (s.status !== 'CLOSED' && matchTableNumber(s.tableNumber, req.tableNumber))
    );
    const tableOrders = filterOrdersForTableSession(orders, req.tableNumber, sess);
    if (tableOrders.length > 0) {
      return calculateAuthoritativeSessionBill(tableOrders, restaurant).grandTotal;
    }
    return 0;
  };

  // Record Bill Payment (CASH / UPI / CARD) & Auto-complete Service Request & Close Table
  const handleRecordPayment = async (
    billId: string | undefined,
    tableNum: string,
    sessionId?: string,
    method: PaymentMethod = 'CASH',
    requestId?: string,
    autoCloseTable: boolean = true
  ) => {
    setIsProcessingPayment(true);
    try {
      let activeBillId = billId;
      if (!activeBillId) {
        activeBillId = `table-${tableNum.toLowerCase().replace(/\s+/g, '')}`;
      }

      // Single atomic call: marks bill paid AND closes table settlement in 1 request
      const updatedBill = await api.markBillPayment(
        currentRestaurantId,
        activeBillId,
        method,
        waiterName,
        undefined,
        {
          autoCloseTable,
          tableNumber: tableNum,
          tableSessionId: sessionId,
        }
      );

      // Instant optimistic update of bills
      if (updatedBill) {
        setBills((prev) =>
          prev.map((b) => (b.id === activeBillId || b.id === updatedBill.id ? { ...b, ...updatedBill, paymentStatus: 'PAID', status: 'PAID' } : b))
        );
      }

      // Instant optimistic reset of table & session
      if (autoCloseTable) {
        setTables((prev) =>
          prev.map((t) =>
            matchTableNumber(t.tableNumber, tableNum)
              ? { ...t, status: 'AVAILABLE', isOccupied: false, activeSessionId: undefined }
              : t
          )
        );
        if (sessionId) {
          setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
        }
      }

      showToast(
        autoCloseTable ? 'Payment Recorded & Table Closed! 🧹' : 'Payment Recorded 💳',
        `Table ${tableNum} bill settled via ${method}${autoCloseTable ? ' and reset to AVAILABLE' : ''}`,
        'success'
      );

      if (requestId) {
        handleCompleteRequest(requestId).catch((e) => console.warn('Complete request background error:', e));
      }

      setSelectedBillForAction(null);
      // Non-blocking silent background reconcile
      loadData(true).catch(() => {});
    } catch (err: any) {
      showToast('Payment Error', err.message || 'Failed to record payment', 'warning');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // Helper to open Bill Modal and load authoritative running bill from backend
  const openBillActionModal = async (
    tableNum: string,
    sessionId?: string,
    req?: CustomerRequest,
    existingBill?: Bill | null
  ) => {
    // Resolve preferred payment method chosen by the customer
    const requestedMethod: PaymentMethod =
      (req?.paymentMethod as PaymentMethod) ||
      (req?.message?.includes('via UPI') ? 'UPI' :
       req?.message?.includes('via CARD') ? 'CARD' :
       req?.message?.includes('via CASH') ? 'CASH' :
       existingBill?.paymentMethod || 'CASH');
    setSelectedPaymentMethod(requestedMethod);

    setSelectedBillForAction({
      bill: existingBill || null,
      request: req,
      tableNumber: tableNum,
      tableSessionId: sessionId,
    });

    try {
      const runningBill = await api.getRunningTableBill(currentRestaurantId, tableNum, sessionId);
      if (runningBill) {
        setSelectedBillForAction((prev) => {
          if (!prev || !matchTableNumber(prev.tableNumber, tableNum)) return prev;
          return {
            ...prev,
            bill: runningBill,
          };
        });
      }
    } catch (e) {
      console.warn('Failed to fetch authoritative running bill:', e);
    }
  };

  // Computed data collections
  const activeTablesList = useMemo(() => {
    const activeSessionTableIds = new Set(
      activeSessions
        .filter((s) => s.status !== 'CLOSED')
        .flatMap((s) => [s.tableId, s.tableNumber?.toLowerCase()].filter(Boolean))
    );

    return tables.filter((t) => {
      // If table is explicitly marked AVAILABLE and not occupied, it is clean and vacant
      const isExplicitlyAvailable = t.status === 'AVAILABLE' && !t.isOccupied && !t.activeSessionId;
      if (isExplicitlyAvailable) return false;

      const isSessionActive =
        t.status === 'OCCUPIED' ||
        t.status === 'BILL_REQUESTED' ||
        t.isOccupied ||
        Boolean(t.activeSessionId) ||
        activeSessionTableIds.has(t.id) ||
        (t.tableNumber && activeSessionTableIds.has(t.tableNumber.toLowerCase())) ||
        activeSessions.some((s) => s.status === 'ACTIVE' && (s.tableId === t.id || matchTableNumber(s.tableNumber, t.tableNumber)));

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

      // Exclude order ready passes — orders belong exclusively in Section A (Kitchen Pass & Orders)
      const isOrderPass =
        r.requestType === 'ORDER_READY' ||
        r.requestType === 'DISH_READY' ||
        r.requestType === 'BAR_READY' ||
        r.requestType === 'HOOKAH_READY' ||
        Boolean(r.orderId) ||
        Boolean((r as any).order_id);
      if (isOrderPass) return false;

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

  const getOrderReadiness = (o: Order) => {
    const allItems = o.items || [];
    const kitchenItems = allItems.filter((i) => getFulfillmentStation(i) === 'KITCHEN');
    const barItems = allItems.filter((i) => getFulfillmentStation(i) === 'BAR');
    const hookahItems = allItems.filter((i) => getFulfillmentStation(i) === 'HOOKAH');

    const hasKitchen = kitchenItems.length > 0;
    const hasBar = barItems.length > 0;
    const hasHookah = hookahItems.length > 0;

    const isStationReady = (s?: string) => s === 'READY' || s === 'READY_FOR_PICKUP';
    const isStationDelivered = (s?: string) => s === 'COMPLETED' || s === 'DELIVERED' || s === 'SERVED';

    const isKitchenDone = !hasKitchen || isStationReady(o.kitchenStatus) || isStationDelivered(o.kitchenStatus);
    const isBarDone = !hasBar || isStationReady(o.barStatus) || isStationDelivered(o.barStatus);
    const isHookahDone = !hasHookah || isStationReady(o.hookahStatus) || isStationDelivered(o.hookahStatus);

    const readyItems: Array<{ item: OrderItem; station: string }> = [];
    const deliveredItems: Array<{ item: OrderItem; station: string }> = [];
    const outstandingItems: Array<{ item: OrderItem; station: string; stationStatus: string }> = [];

    if (hasKitchen) {
      if (isStationReady(o.kitchenStatus)) {
        kitchenItems.forEach((i) => readyItems.push({ item: i, station: 'KITCHEN' }));
      } else if (isStationDelivered(o.kitchenStatus)) {
        kitchenItems.forEach((i) => deliveredItems.push({ item: i, station: 'KITCHEN' }));
      } else {
        kitchenItems.forEach((i) =>
          outstandingItems.push({ item: i, station: 'KITCHEN', stationStatus: o.kitchenStatus || 'Cooking' })
        );
      }
    }

    if (hasBar) {
      if (isStationReady(o.barStatus)) {
        barItems.forEach((i) => readyItems.push({ item: i, station: 'BAR' }));
      } else if (isStationDelivered(o.barStatus)) {
        barItems.forEach((i) => deliveredItems.push({ item: i, station: 'BAR' }));
      } else {
        barItems.forEach((i) =>
          outstandingItems.push({ item: i, station: 'BAR', stationStatus: o.barStatus || 'Mixology' })
        );
      }
    }

    if (hasHookah) {
      if (isStationReady(o.hookahStatus)) {
        hookahItems.forEach((i) => readyItems.push({ item: i, station: 'HOOKAH' }));
      } else if (isStationDelivered(o.hookahStatus)) {
        hookahItems.forEach((i) => deliveredItems.push({ item: i, station: 'HOOKAH' }));
      } else {
        hookahItems.forEach((i) =>
          outstandingItems.push({ item: i, station: 'HOOKAH', stationStatus: o.hookahStatus || 'Heating' })
        );
      }
    }

    // Fallback if no specific stations marked but order is marked READY
    if (readyItems.length === 0 && deliveredItems.length === 0 && o.status === 'READY') {
      allItems.forEach((i) => readyItems.push({ item: i, station: getFulfillmentStation(i) }));
    }

    const isCompleteOrderReady = (hasKitchen || hasBar || hasHookah)
      ? (isKitchenDone && isBarDone && isHookahDone)
      : o.status === 'READY';

    return {
      readyItems,
      deliveredItems,
      outstandingItems,
      isCompleteOrderReady,
      hasKitchen,
      hasBar,
      hasHookah,
    };
  };

  const readyPlatesList = useMemo(() => {
    return orders.filter((o) => {
      const isReady =
        o.status === 'READY' ||
        o.kitchenStatus === 'READY' ||
        o.barStatus === 'READY' ||
        o.hookahStatus === 'READY';
      const isDone = o.status === 'DELIVERED' || o.status === 'COMPLETED' || o.status === 'CANCELLED';
      if (!isReady || isDone) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          o.id.toLowerCase().includes(q) ||
          (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
          (o.customerName && o.customerName.toLowerCase().includes(q)) ||
          (o.items || []).some((i) => i.name.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [orders, searchQuery]);

  const cookingPlatesList = useMemo(() => {
    return orders.filter((o) => {
      const isDone = o.status === 'DELIVERED' || o.status === 'COMPLETED' || o.status === 'CANCELLED';
      if (isDone) return false;
      const isReady =
        o.status === 'READY' ||
        o.kitchenStatus === 'READY' ||
        o.barStatus === 'READY' ||
        o.hookahStatus === 'READY';
      if (isReady) return false;
      const isCooking =
        o.status === 'PREPARING' ||
        o.status === 'ACCEPTED' ||
        o.status === 'PENDING' ||
        o.kitchenStatus === 'PREPARING' ||
        o.kitchenStatus === 'ACCEPTED' ||
        o.kitchenStatus === 'PENDING' ||
        o.barStatus === 'PREPARING' ||
        o.hookahStatus === 'PREPARING' ||
        Boolean(o.estimatedPrepTimeMinutes || o.etaTargetTimestamp);
      if (!isCooking) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          o.id.toLowerCase().includes(q) ||
          (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
          (o.customerName && o.customerName.toLowerCase().includes(q)) ||
          (o.items || []).some((i) => i.name.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [orders, searchQuery]);

  const displayedPlatesList = useMemo(() => {
    if (ticketFilter === 'prep') return cookingPlatesList;
    if (ticketFilter === 'all') {
      const combined = [...readyPlatesList, ...cookingPlatesList];
      const seen = new Set<string>();
      const deduped: Order[] = [];
      for (const ord of combined) {
        if (!seen.has(ord.id)) {
          seen.add(ord.id);
          deduped.push(ord);
        }
      }
      return deduped.sort((a, b) => {
        const aReady = a.status === 'READY' || a.kitchenStatus === 'READY' || a.barStatus === 'READY' || a.hookahStatus === 'READY';
        const bReady = b.status === 'READY' || b.kitchenStatus === 'READY' || b.barStatus === 'READY' || b.hookahStatus === 'READY';
        if (aReady && !bReady) return -1;
        if (!aReady && bReady) return 1;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
    }
    return readyPlatesList;
  }, [ticketFilter, readyPlatesList, cookingPlatesList]);

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
        return <Badge variant="neutral" className="flex items-center gap-1"><Utensils className="w-3 h-3" /> Spoon / Cutlery</Badge>;
      case 'TISSUE':
      case 'NAPKINS':
        return <Badge variant="neutral" className="flex items-center gap-1"><FileText className="w-3 h-3" /> Tissue</Badge>;
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
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans antialiased relative selection:bg-emerald-500/30">
      {/* Background Ambient Radial Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 contain-paint">
        <div className="absolute -top-24 left-1/4 w-[500px] h-[500px] rounded-full blur-[120px] bg-emerald-600/10 opacity-70" />
        <div className="absolute top-[40%] -right-20 w-[450px] h-[450px] rounded-full blur-[130px] bg-amber-600/10 opacity-60" />
      </div>

      {/* TOAST NOTIFICATION POPUP */}
      {toastMessage && !isEmbedded && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border text-xs font-medium liquid-glass ${
              toastMessage.type === 'success'
                ? 'border-emerald-400/40 text-emerald-300'
                : toastMessage.type === 'warning'
                ? 'border-amber-400/40 text-amber-300'
                : 'border-white/20 text-slate-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="font-bold text-white">{toastMessage.title}</p>
              <p className="text-white/60 text-[11px]">{toastMessage.desc}</p>
            </div>
          </div>
        </div>
      )}

      {/* HEADER BAR (Standalone Mode) */}
      {!isEmbedded && (
        <header className="bg-[#0b0e14] border-b border-[#1e232e] sticky top-0 z-40 px-3 sm:px-6 py-2.5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          {/* Brand Header */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-slate-200 shrink-0">
              <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
                <DinelyLogo size="sm" />
                <h1 className="text-xs sm:text-base font-bold text-white tracking-tight uppercase truncate">{restaurantName}</h1>
                <Badge variant="brand" className="text-[9px] sm:text-[10px] px-1.5 py-0.2 sm:px-2 sm:py-0.5">WAITER</Badge>
                <Badge variant="outline" className="hidden xs:inline-flex text-emerald-400 border-emerald-500/30 text-[9px] sm:text-[10px] font-mono">{assignedTerminal}</Badge>
                {wsStatus === 'CONNECTED' ? (
                  <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                  </span>
                ) : wsStatus === 'RECONNECTING' ? (
                  <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Reconnecting
                  </span>
                ) : (
                  <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/25 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Offline
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/50 mt-0.5 hidden sm:block">
                Floor service requests, active table sessions & dish delivery
              </p>
            </div>
          </div>

          {/* Authenticated Staff Info & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs text-slate-300">
            <div className="flex items-center gap-1.5 sm:gap-2 bg-[#141822] px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-[#1e232e]">
              <div className="hidden xs:block">
                <p className="font-bold text-white text-xs truncate max-w-[80px] sm:max-w-none">{waiterName}</p>
                <p className="text-[9px] sm:text-[10px] text-emerald-400 font-mono font-bold">ON SHIFT</p>
              </div>
            </div>

            {/* Clock */}
            <div className="hidden md:flex bg-[#141822] px-2.5 py-1.5 rounded-xl border border-[#1e232e] items-center gap-1.5 font-mono text-slate-200 text-xs">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <LiveClock />
            </div>

            {/* Audio Chime Toggle */}
            <button
              onClick={() => setIsAudioMuted(!isAudioMuted)}
              className="p-1.5 sm:p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white transition-colors border border-white/15 h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center shrink-0 active:scale-95"
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
              className="text-xs bg-rose-500/10 border-rose-500/25 hover:bg-rose-500/20 text-rose-300 flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2 sm:px-3 shrink-0 rounded-xl active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Sign Out</span>
            </Button>
          </div>
        </header>
      )}

      {/* ERROR / RECONNECT BANNER */}
      {isErrorState && (
        <div className="bg-rose-950/80 backdrop-blur-md border-b border-rose-800 px-3 sm:px-4 py-2 text-xs text-rose-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="truncate">Unable to connect to server. Realtime events may be paused.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData()} className="text-xs border-rose-700 hover:bg-rose-900 flex items-center gap-1 h-6 px-2 shrink-0 rounded-lg">
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </Button>
        </div>
      )}

      {/* ONE-SCREEN WAITER OPERATIONAL INTERFACE */}
      <div className={`flex-1 ${isEmbedded ? '' : 'overflow-y-auto'} space-y-4 relative z-10 ${isEmbedded ? 'p-0' : 'p-3 sm:p-4 lg:p-6'}`}>
        {/* TOP OPERATIONAL BAR: Stage Selector, Live Counts, Search & Refresh */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#12151b] border border-[#1e232e] p-2.5 sm:p-3 rounded-xl">
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setWaiterView('floor')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-mono font-bold uppercase transition-all duration-200 shrink-0 cursor-pointer active:scale-95 touch-manipulation min-h-[40px] ${
                waiterView === 'floor'
                  ? 'bg-gradient-to-r from-emerald-500/25 to-teal-500/20 text-emerald-300 border border-emerald-400/40'
                  : 'bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.08]'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Live Floor</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${waiterView === 'floor' ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40' : 'bg-white/10 text-slate-400'}`}>
                {readyPlatesList.length + pendingCallsList.length}
              </span>
            </button>

            <button
              onClick={() => setWaiterView('tables')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-mono font-bold uppercase transition-all duration-200 shrink-0 cursor-pointer active:scale-95 touch-manipulation min-h-[40px] ${
                waiterView === 'tables'
                  ? 'bg-gradient-to-r from-sky-500/25 to-blue-500/20 text-sky-300 border border-sky-400/40'
                  : 'bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.08]'
              }`}
            >
              <Utensils className="w-3.5 h-3.5 text-sky-400" />
              <span>Tables & Sessions</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${waiterView === 'tables' ? 'bg-sky-500/30 text-sky-200 border border-sky-400/40' : 'bg-white/10 text-slate-400'}`}>
                {activeTablesList.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto md:flex-1 md:max-w-xl justify-end">
            <div className="flex-1 min-w-0">
              <SearchInput
                value={searchQuery}
                onChange={(val) => setSearchQuery(typeof val === 'string' ? val : (val as any).target.value)}
                placeholder="Search table, ticket #, customer call..."
                className="w-full text-xs"
              />
            </div>

            {isEmbedded && (
              <button
                onClick={() => setIsAudioMuted(!isAudioMuted)}
                className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white transition-colors border border-white/15 h-9 w-9 flex items-center justify-center shrink-0 active:scale-95 touch-manipulation"
                title={isAudioMuted ? 'Enable Audio Chime' : 'Mute Audio Chime'}
              >
                {isAudioMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              </button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData()}
              disabled={isLoading}
              className="text-xs border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 hover:text-white flex items-center gap-1.5 h-9 px-3 shrink-0 rounded-xl backdrop-blur-md shadow-sm active:scale-95 touch-manipulation"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* VIEW 1: ONE-SCREEN UNIFIED OPERATIONAL FLOOR (SECTION A + SECTION B) */}
        {waiterView === 'floor' && (
            <div className="space-y-4">
              {/* Operational View Switcher & Live Queue Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#12151b] p-3 sm:p-3.5 rounded-xl border border-[#1e232e]">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className=" absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    One-Screen Operational Floor
                  </span>
                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    · Real-time ready dishes, drinks & customer requests
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode('active')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-medium font-mono transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-95 ${
                      viewMode === 'active'
                        ? 'bg-gradient-to-r from-emerald-500/25 to-teal-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.08]'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Live Queue ({readyPlatesList.length + pendingCallsList.length})</span>
                  </button>

                  <button
                    onClick={() => setViewMode('history')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-medium font-mono transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-95 ${
                      viewMode === 'history'
                        ? 'bg-gradient-to-r from-emerald-500/25 to-teal-500/20 text-emerald-300 border border-emerald-400/40'
                        : 'bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.08]'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Recent Completed ({recentCompletedHistory.length})</span>
                  </button>
                </div>
              </div>

              {viewMode === 'history' ? (
                /* RECENT COMPLETED WORK HISTORY */
                <div className="bg-[#12151b] border border-[#1e232e] p-5 rounded-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <h2 className="text-sm font-semibold text-white">Recent Completed Shift Work</h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#181d27] text-slate-300 border border-[#2d3545]">
                        {recentCompletedHistory.length} Cleared Tasks
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

                  {recentCompletedHistory.length === 0 ? (
                    <div className="p-8 text-center bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
                      <CheckSquare className="w-6 h-6 text-slate-600 mx-auto" />
                      <p className="text-xs font-semibold text-slate-300">No completed tasks recorded in this session yet.</p>
                      <p className="text-[11px] text-slate-400">Delivered orders and resolved requests will appear here for audit.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentCompletedHistory.map((item) => (
                        <div
                          key={item.id}
                          className="bg-[#0e1117] p-3 rounded-lg border border-[#1e232e] flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full ${item.type === 'ORDER_DELIVERED' ? 'bg-emerald-400' : 'bg-sky-400'}`} />
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
                /* LIVE DUAL-SECTION OPERATIONAL FLOOR: Section A (Ready) & Section B (Requests) */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                  {/* SECTION A: READY FOR SERVICE & KITCHEN ETA PASS */}
                  <div className="bg-[#12151b] border border-[#1e232e] p-4 sm:p-5 lg:p-6 rounded-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#1e232e] pb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Flame className="w-4 h-4 text-emerald-400 shrink-0" />
                        <h2 className="text-sm font-bold text-white uppercase tracking-tight whitespace-nowrap">
                          Kitchen Pass & Orders
                        </h2>
                      </div>
                      <div className="flex items-center gap-1 bg-[#0b0e14] p-1 rounded-xl border border-[#1e232e] text-[11px] font-mono self-start sm:self-auto shrink-0">
                        <button
                          type="button"
                          onClick={() => setTicketFilter('ready')}
                          className={`px-2.5 py-1 rounded-lg transition-colors touch-manipulation cursor-pointer whitespace-nowrap shrink-0 ${
                            ticketFilter === 'ready'
                              ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Ready ({readyPlatesList.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTicketFilter('prep')}
                          className={`px-2.5 py-1 rounded-lg transition-colors touch-manipulation cursor-pointer whitespace-nowrap shrink-0 ${
                            ticketFilter === 'prep'
                              ? 'bg-amber-500/25 text-amber-300 border border-amber-400/40 font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Cooking ({cookingPlatesList.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTicketFilter('all')}
                          className={`px-2.5 py-1 rounded-lg transition-colors touch-manipulation cursor-pointer whitespace-nowrap shrink-0 ${
                            ticketFilter === 'all'
                              ? 'bg-[#1e232e] text-white border border-[#2d3545] font-bold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          All ({readyPlatesList.length + cookingPlatesList.length})
                        </button>
                      </div>
                    </div>

                    {displayedPlatesList.length === 0 ? (
                      <div className="p-10 text-center bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center mx-auto">
                          <Coffee className="w-6 h-6 text-emerald-400" />
                        </div>
                        <p className="text-sm font-bold text-white">
                          {ticketFilter === 'prep' ? 'No orders currently cooking' : 'No tickets in this view'}
                        </p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto">
                          {ticketFilter === 'prep'
                            ? 'New incoming tickets and active cooking times set by chefs will display here.'
                            : 'Dishes and beverages will appear here instantly as soon as kitchen, bar, or hookah staff update them.'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {displayedPlatesList.map((order) => {
                          const readiness = getOrderReadiness(order);
                          const isDelivering = deliveringOrderIds.has(order.id);
                          const isCookingOnly = !readiness.readyItems.length && !readiness.isCompleteOrderReady;
                          const formattedTable = order.tableNumber && order.tableNumber !== 'COUNTER'
                            ? (order.tableNumber.startsWith('Table') ? order.tableNumber : `Table ${order.tableNumber}`)
                            : 'Counter';

                          return (
                            <div
                              key={order.id}
                              className={`p-4 rounded-2xl border transition-all duration-300 space-y-3 shadow-xl liquid-glass-card ${
                                readiness.isCompleteOrderReady
                                  ? 'border-emerald-400/40 hover:border-emerald-400/60'
                                  : readiness.readyItems.length > 0
                                  ? 'border-amber-400/40 hover:border-amber-400/60'
                                  : 'border-slate-700/60 hover:border-slate-600 shadow-md'
                              }`}
                            >
                              {/* Ticket Header */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2.5 py-0.5 rounded-lg bg-white/10 text-white border border-white/20 text-xs font-mono font-bold">
                                      {formattedTable}
                                    </span>
                                    <span className="text-[11px] font-mono text-white/50">
                                      #{order.id.slice(-4)}
                                    </span>

                                    {/* Custom ETA Chip — Only rendered when ETA is set, never fabricated */}
                                    {(order.estimatedPrepTimeMinutes || order.etaTargetTimestamp) && (
                                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-400/30 text-[10px] font-mono font-bold flex items-center gap-1 shadow-sm">
                                        <Clock className="w-3 h-3 text-amber-400" />
                                        <span>ETA: ~{order.estimatedPrepTimeMinutes}m</span>
                                        {order.etaTargetTimestamp && (
                                          <span className="text-amber-400/80 text-[9px]">
                                            ({(() => {
                                              const diffMs = new Date(order.etaTargetTimestamp).getTime() - Date.now();
                                              const remMins = Math.round(diffMs / 60000);
                                              if (remMins > 0) return `${remMins}m left`;
                                              if (remMins === 0) return 'due now';
                                              return `${Math.abs(remMins)}m overdue`;
                                            })()})
                                          </span>
                                        )}
                                      </span>
                                    )}

                                    {readiness.readyItems.some(r => r.station === 'BAR') && (
                                      <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-400/30 text-[10px] font-mono font-bold">
                                        BAR
                                      </span>
                                    )}
                                    {readiness.readyItems.some(r => r.station === 'HOOKAH') && (
                                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-mono font-bold">
                                        HOOKAH
                                      </span>
                                    )}
                                    {readiness.readyItems.some(r => r.station === 'KITCHEN') && (
                                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-mono font-bold">
                                        KITCHEN
                                      </span>
                                    )}

                                    {order.deliveryStatus === 'COLLECTED' ? (
                                      <span className="px-2 py-0.5 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-400/30 text-[10px] font-mono font-bold flex items-center gap-1">
                                        <Package className="w-3 h-3 text-sky-400" />
                                        Collected by {order.claimedBy || 'Waiter'}
                                      </span>
                                    ) : ((order as any).kitchenWaiterRequested || (order as any).barWaiterRequested || (order as any).hookahWaiterRequested || order.deliveryStatus === 'WAITING_FOR_WAITER') ? (
                                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] font-mono font-bold flex items-center gap-1 animate-pulse">
                                        <Bell className="w-3 h-3 text-amber-400" />
                                        Waiter Requested
                                      </span>
                                    ) : readiness.isCompleteOrderReady ? (
                                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-400/30 text-[10px] font-mono font-bold flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                        All Items Ready
                                      </span>
                                    ) : isCookingOnly ? (
                                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-400/30 text-[10px] font-mono font-bold flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                                        In Kitchen Prep ({order.kitchenStatus || 'COOKING'})
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-400/30 text-[10px] font-mono font-bold flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-amber-400" />
                                        Partial · Other Items In Prep
                                      </span>
                                    )}
                                  </div>
                                  {order.customerName && (
                                    <p className="text-[11px] text-slate-400 mt-1">
                                      Guest: <span className="text-slate-200 font-medium">{order.customerName}</span>
                                    </p>
                                  )}
                                </div>

                                <div className="text-right text-[11px] font-mono text-slate-400 shrink-0">
                                  <span className="block text-slate-300 font-medium">
                                    {order.readyAt ? `Ready: ${getTimeElapsed(order.readyAt)}` : `Prep: ${order.kitchenStatus || 'IN PROGRESS'}`}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    Ordered {order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                              </div>

                              {/* Ready Items List with Station Breakdown */}
                              {readiness.readyItems.length > 0 && (
                              <div className="bg-[#0e1117] p-3 rounded-lg border border-[#1e232e] space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold border-b border-[#1e232e] pb-1.5">
                                  <span>Ready for Collection:</span>
                                  <span>{readiness.readyItems.length} items</span>
                                </div>
                                <div className="space-y-1.5">
                                  {readiness.readyItems.map((r, idx) => (
                                    <div key={idx} className="flex flex-col gap-1 py-1 border-b border-white/[0.05] last:border-0">
                                      <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono font-bold text-emerald-400 text-xs">
                                            {r.item.quantity}x
                                          </span>
                                          <span className="text-white font-medium">{r.item.name}</span>
                                        </div>
                                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#181d27] text-slate-300 border border-[#2d3545]">
                                          {r.station === 'BAR' ? 'Bar' : r.station === 'HOOKAH' ? 'Hookah' : 'Kitchen'}
                                        </span>
                                      </div>
                                      {r.item.notes && (
                                        <div className="flex flex-wrap items-center gap-1.5 pl-6 text-[10px]">
                                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-400/30 font-mono font-medium">
                                            {r.item.notes}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              )}

                              {/* Already Delivered Items Summary (for partially delivered multi-station orders) */}
                              {readiness.deliveredItems.length > 0 && (
                                <div className="bg-[#0e1117]/60 px-3 py-2 rounded-lg border border-[#1e232e] flex items-center justify-between text-[11px] font-mono text-slate-400">
                                  <span className="flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/70" />
                                    Delivered to table
                                  </span>
                                  <span>{readiness.deliveredItems.length} items served</span>
                                </div>
                              )}

                              {/* Outstanding Items List (if multi-station order still has dishes cooking) */}
                              {readiness.outstandingItems.length > 0 && (
                                <div className="bg-[#12151b]/70 p-3 rounded-lg border border-amber-500/20 space-y-1.5">
                                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-amber-300 font-medium border-b border-[#1e232e] pb-1">
                                    <span>Still In Preparation:</span>
                                    <span className="text-amber-400">{readiness.outstandingItems.length} items pending</span>
                                  </div>
                                  <div className="space-y-1">
                                    {readiness.outstandingItems.map((oItem, idx) => (
                                      <div key={idx} className="flex flex-col gap-0.5 py-0.5">
                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                          <div className="flex items-center gap-2">
                                            <span className="font-mono text-slate-400">{oItem.item.quantity}x</span>
                                            <span>{oItem.item.name}</span>
                                          </div>
                                          <span className="text-[10px] font-mono text-amber-300/80">
                                            {oItem.station}: {oItem.stationStatus}
                                          </span>
                                        </div>
                                        {oItem.item.notes && (
                                          <span className="text-[9px] font-mono text-amber-300/70 pl-6">
                                            ↳ {oItem.item.notes}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Special Customer Instructions */}
                              {order.specialInstructions && (
                                <div className="text-xs bg-rose-500/10 text-rose-300 p-2 rounded-lg border border-rose-500/20 flex items-start gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                                  <span>Note: {order.specialInstructions}</span>
                                </div>
                              )}

                                {/* 1-Click Action Workflow: Collect -> Served */}
                                <div className="flex items-center gap-2 pt-1">
                                  {readiness.readyItems.length === 0 ? (
                                    <div className="w-full min-h-[40px] py-2 px-3 rounded-xl bg-amber-500/10 border border-amber-400/20 text-amber-300 text-xs font-mono flex items-center justify-between">
                                      <span className="flex items-center gap-1.5">
                                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                                        {readiness.deliveredItems.length > 0 ? 'Partial Served · Remaining In Prep' : `In Kitchen Prep (${order.kitchenStatus || 'COOKING'})`}
                                      </span>
                                      {order.estimatedPrepTimeMinutes && (
                                        <span className="text-[11px] font-bold text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-400/30">
                                          ETA: ~{order.estimatedPrepTimeMinutes} min
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                  <>
                                    {order.deliveryStatus !== 'COLLECTED' && (
                                      <button
                                        type="button"
                                        onClick={() => handleCollectOrder(order.id, order.tableNumber)}
                                        disabled={collectingOrderIds.has(order.id) || isDelivering}
                                        className="flex-1 min-h-[44px] py-2.5 px-3 rounded-xl text-xs font-bold font-mono transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 bg-sky-600 text-white hover:bg-sky-500 touch-manipulation cursor-pointer active:scale-95"
                                      >
                                        {collectingOrderIds.has(order.id) ? (
                                          <RefreshCw className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <>
                                            <Package className="w-4 h-4" />
                                            <span>Accept & Collect</span>
                                          </>
                                        )}
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        const readyStations = Array.from(new Set(readiness.readyItems.map((r) => r.station).filter(Boolean)));
                                        const stationToDeliver = readyStations.length === 1 ? readyStations[0] : undefined;
                                        handleDeliverOrder(order.id, order.tableNumber, stationToDeliver);
                                      }}
                                      disabled={isDelivering || collectingOrderIds.has(order.id)}
                                      className={`min-h-[44px] py-2.5 px-4 rounded-xl text-xs font-bold font-mono transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 touch-manipulation cursor-pointer active:scale-95 ${
                                        order.deliveryStatus === 'COLLECTED'
                                          ? 'w-full bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                                          : 'border border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20'
                                      }`}
                                    >
                                      {isDelivering ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <>
                                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                          <span>
                                            {order.deliveryStatus === 'COLLECTED'
                                              ? `Mark Delivered (${formattedTable})`
                                              : `Mark Delivered`}
                                          </span>
                                        </>
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* SECTION B: CUSTOMER REQUESTS */}
                  <div className="bg-[#12151b] border border-[#1e232e] p-5 lg:p-6 rounded-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div className="flex items-center gap-2">
                        <PhoneCall className="w-4 h-4 text-amber-400" />
                        <h2 className="text-sm font-bold text-white uppercase tracking-tight">
                          Section B: Customer Requests
                        </h2>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/30 font-bold">
                          {pendingCallsList.length} Active
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-white/50">
                        Live Floor Assistance
                      </span>
                    </div>

                    {pendingCallsList.length === 0 ? (
                      <div className="p-10 text-center bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mx-auto">
                          <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                        </div>
                        <p className="text-sm font-bold text-white">All customer requests handled</p>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto">
                          Requests for water, napkins, cutlery, table assistance, or bill payments appear here with 1-click fulfillment.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {pendingCallsList.map((req) => {
                          const isBillReq = req.requestType === 'BILL';
                          const matchingBill = isBillReq ? getBillForRequest(req) : undefined;
                          const billAmt = isBillReq ? getAmountForRequest(req, matchingBill) : 0;
                          const payStatus = matchingBill?.paymentStatus || 'UNPAID';
                          const isProcessing = completingRequestIds.has(req.id);
                          const isPending = req.status === 'PENDING';

                          return (
                            <div
                              key={req.id}
                              className={`p-4 rounded-2xl border transition-all duration-300 space-y-3 shadow-xl liquid-glass-card ${
                                isBillReq
                                  ? 'border-amber-400/50'
                                  : isPending
                                  ? 'border-amber-400/35 hover:border-amber-400/55'
                                  : 'border-sky-400/35 hover:border-sky-400/55'
                              }`}
                            >
                              {/* Request Header */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base font-bold text-white font-mono">
                                      {req.tableNumber}
                                    </span>
                                    {getRequestBadge(req.requestType, req.customTitle)}
                                    <span
                                      className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border font-bold ${
                                        isPending
                                          ? 'bg-amber-500/15 text-amber-300 border-amber-400/30'
                                          : 'bg-sky-500/15 text-sky-300 border-sky-400/30'
                                      }`}
                                    >
                                      {req.status}
                                    </span>
                                  </div>
                                  {req.assignedWaiterName && (
                                    <p className="text-[11px] text-white/60 mt-1">
                                      Assigned: <span className="text-slate-200 font-bold">{req.assignedWaiterName}</span>
                                    </p>
                                  )}
                                </div>

                                <span className="text-[11px] font-mono text-white/60 bg-white/10 px-2 py-0.5 rounded-lg border border-white/15">
                                  {getTimeElapsed(req.requestedAt)}
                                </span>
                              </div>

                              {/* Bill Context if applicable */}
                              {isBillReq ? (
                                <div className="bg-white/[0.04] p-3 rounded-xl border border-white/10 flex justify-between items-center text-xs font-mono backdrop-blur-sm">
                                  <div>
                                    <span className="text-white/50 block text-[10px]">TOTAL PAYABLE</span>
                                    <span className="text-emerald-400 font-bold text-sm font-tabular">₹{billAmt.toFixed(2)}</span>
                                  </div>
                                  <div className="text-center">
                                    <span className="text-white/50 block text-[10px]">CHOSEN METHOD</span>
                                    {(() => {
                                      const pm = req.paymentMethod ||
                                        (req.message?.includes('via UPI') ? 'UPI' :
                                         req.message?.includes('via CARD') ? 'CARD' :
                                         req.message?.includes('via CASH') ? 'CASH' :
                                         matchingBill?.paymentMethod || 'UPI');
                                      return (
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                          pm === 'CASH' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                          pm === 'CARD' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                                          'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                        }`}>
                                          {pm === 'CASH' ? '💵 CASH' : pm === 'CARD' ? '💳 CARD' : '📱 UPI'}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  <div className="text-right">
                                    <span className="text-white/50 block text-[10px]">STATUS</span>
                                    {payStatus === 'PAID' ? (
                                      <span className="text-emerald-400 font-bold text-[11px]">PAID</span>
                                    ) : payStatus === 'PAYMENT_AWAITING_CONFIRMATION' ? (
                                      <span className="text-amber-300 font-bold text-[11px] animate-pulse">AWAITING VERIFY</span>
                                    ) : (
                                      <span className="text-rose-400 font-bold text-[11px]">UNPAID</span>
                                    )}
                                  </div>
                                </div>
                              ) : (req.customerNotes || req.message) ? (
                                <div className="text-xs bg-white/[0.04] p-3 rounded-xl border border-white/10 text-white/80 italic">
                                  "{(req.customerNotes || req.message || '').replace(/^Table\s+Table\s+/i, 'Table ')}"
                                </div>
                              ) : null}

                              {/* Simple 1-Click Action Buttons */}
                              <div className="flex items-center gap-2 pt-1">
                                {isBillReq ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-1/3 text-xs border-[#1e232e] bg-[#141822] hover:bg-[#1a202c] text-slate-200 h-9"
                                      onClick={() => openBillActionModal(req.tableNumber, req.tableSessionId, req, matchingBill)}
                                    >
                                      View Bill
                                    </Button>
                                    <Button
                                      variant="brand"
                                      size="sm"
                                      disabled={isProcessing}
                                      className="w-2/3 text-xs bg-emerald-600 hover:bg-emerald-500 text-white h-9 font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40"
                                      onClick={() => openBillActionModal(req.tableNumber, req.tableSessionId, req, matchingBill)}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                                      <span>Record Payment & Close Table</span>
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="success"
                                    size="sm"
                                    disabled={isProcessing}
                                    className="w-full text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-8 flex items-center justify-center gap-1.5"
                                    onClick={() => handleCompleteRequest(req.id)}
                                  >
                                    {isProcessing ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Mark Fulfilled</span>
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        {/* VIEW 2: ACTIVE TABLES FLOOR VIEW */}
        {waiterView === 'tables' && (
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
              <div className="bg-[#12151b] border border-[#1e232e] p-12 text-center space-y-3 rounded-xl">
                <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-center mx-auto">
                  <Utensils className="w-6 h-6 text-sky-400" />
                </div>
                <h3 className="text-sm font-bold text-white">No active tables right now</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  All tables are clear and available. When guests scan table QR codes or open sessions, occupied tables will automatically appear here in real-time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                {activeTablesList.map((table) => {
                  const activeSession = activeSessions.find(
                    (s) => s.status !== 'CLOSED' && (s.tableId === table.id || matchTableNumber(s.tableNumber, table.tableNumber))
                  );
                  const matchingBill = activeSession
                    ? bills.find((b) => b.tableSessionId === activeSession.id && b.status !== 'CLOSED' && b.status !== 'CANCELLED' && b.paymentStatus !== 'PAID')
                    : undefined;
                  const tableOrders = filterOrdersForTableSession(orders, table.tableNumber, activeSession);
                  const authCalc = calculateAuthoritativeSessionBill(tableOrders, restaurant, matchingBill);
                  const itemCount = authCalc.totalItems;
                  const sessionTotal = authCalc.grandTotal;
                  const latestOrder = tableOrders[0];

                  return (
                    <div
                      key={table.id}
                      className="bg-[#12151b] border border-[#1e232e] p-4 space-y-3 rounded-xl hover:border-[#2d3545] transition-colors flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xl font-bold text-white font-mono tracking-tight">
                                {table.tableNumber}
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/30 font-bold">
                                OCCUPIED
                              </span>
                            </div>
                            <p className="text-[11px] text-white/50 font-mono mt-0.5">
                              {activeSession ? `Session #${activeSession.id.slice(-6)}` : 'Active Session'}
                            </p>
                          </div>
                          <span className="text-[11px] font-mono text-white/70 bg-white/10 border border-white/15 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-400" />
                            {getOccupiedDuration(table.sessionStartedAt || activeSession?.sessionStartedAt, latestOrder?.createdAt)}
                          </span>
                        </div>

                        <div className="space-y-1.5 bg-white/[0.04] p-3 rounded-xl border border-white/10 text-xs font-mono backdrop-blur-sm">
                          <div className="flex justify-between items-center pb-1.5 border-b border-white/10">
                            <span className="text-white/50">Active Orders:</span>
                            <span className="font-bold text-white font-tabular">{tableOrders.length}</span>
                          </div>

                          <div className="flex justify-between items-center py-0.5">
                            <span className="text-white/50">Total Items:</span>
                            <span className="text-white font-bold font-tabular">{itemCount}</span>
                          </div>

                          <div className="flex justify-between items-center py-0.5">
                            <span className="text-white/50">Current Bill:</span>
                            <span className="font-bold text-emerald-400 text-sm font-tabular">₹{sessionTotal.toFixed(2)}</span>
                          </div>

                          {latestOrder && (
                            <div className="flex flex-col gap-1 py-1.5 border-t border-b border-white/10 text-[11px]">
                              {latestOrder.items.some((i) => getFulfillmentStation(i) === 'KITCHEN') && (
                                <div className="flex justify-between items-center">
                                  <span className="text-white/50">Kitchen:</span>
                                  <div className="flex items-center gap-1.5">
                                    {(latestOrder.estimatedPrepTimeMinutes || latestOrder.etaTargetTimestamp) && (
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-400/30 flex items-center gap-1 font-bold">
                                        <Clock className="w-2.5 h-2.5" />
                                        ~{latestOrder.estimatedPrepTimeMinutes}m
                                      </span>
                                    )}
                                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                                      latestOrder.kitchenStatus === 'READY' || (!latestOrder.kitchenStatus && latestOrder.status === 'READY')
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                                        : latestOrder.kitchenStatus === 'COMPLETED'
                                        ? 'bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                                    }`}>
                                      {latestOrder.kitchenStatus === 'READY' ? 'READY' : latestOrder.kitchenStatus || 'COOKING'}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {latestOrder.items.some((i) => getFulfillmentStation(i) === 'BAR') && (
                                <div className="flex justify-between items-center">
                                  <span className="text-white/50">Bar:</span>
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                                    latestOrder.barStatus === 'READY' || (!latestOrder.barStatus && latestOrder.status === 'READY')
                                      ? 'bg-purple-500/20 text-purple-300 border border-purple-400/30'
                                      : latestOrder.barStatus === 'COMPLETED'
                                      ? 'bg-purple-500/10 text-purple-400/80 border border-purple-500/20'
                                      : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                                  }`}>
                                    {latestOrder.barStatus === 'READY' ? 'READY' : latestOrder.barStatus || 'PREPARING'}
                                  </span>
                                </div>
                              )}
                              {latestOrder.items.some((i) => getFulfillmentStation(i) === 'HOOKAH') && (
                                <div className="flex justify-between items-center">
                                  <span className="text-white/50">Hookah:</span>
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                                    latestOrder.hookahStatus === 'READY' || (!latestOrder.hookahStatus && latestOrder.status === 'READY')
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                                      : latestOrder.hookahStatus === 'COMPLETED'
                                      ? 'bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20'
                                      : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                                  }`}>
                                    {latestOrder.hookahStatus === 'READY' ? 'READY' : latestOrder.hookahStatus || 'PREPARING'}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex justify-between items-center pt-1.5 border-t border-white/10 text-[11px]">
                            <span className="text-white/50">Waiter:</span>
                            <span className="text-white font-bold">{table.assignedWaiterName || waiterName}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs py-2 bg-white/[0.06] border-white/15 hover:bg-white/[0.12] text-slate-200 h-10 font-bold touch-manipulation rounded-xl"
                          onClick={() => setSelectedTableForView(table)}
                        >
                          View Details
                        </Button>
                        {sessionTotal > 0 ? (
                          <Button
                            variant="brand"
                            size="sm"
                            className="w-full text-xs py-2 bg-emerald-600 hover:bg-emerald-500 text-white h-10 font-bold touch-manipulation rounded-xl shadow-[0_2px_8px_rgba(16,185,129,0.3)] active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                            onClick={() => openBillActionModal(table.tableNumber, activeSession?.id, undefined, matchingBill)}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Settle & Close</span>
                          </Button>
                        ) : (
                          <Button
                            variant="danger"
                            size="sm"
                            className="w-full text-xs py-2 bg-rose-600/90 hover:bg-rose-500 text-white h-10 font-bold touch-manipulation rounded-xl shadow-[0_2px_8px_rgba(225,29,72,0.3)] active:scale-95"
                            onClick={() => setSelectedTableForClose(table)}
                          >
                            Close Table
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BILL & PAYMENT ACTION MODAL */}
      {selectedBillForAction && (
        <Modal
          isOpen={Boolean(selectedBillForAction)}
          onClose={() => setSelectedBillForAction(null)}
          title={`Bill & Payment — ${selectedBillForAction.tableNumber}`}
          maxWidth="md"
        >
          {(() => {
            const bill = selectedBillForAction.bill;
            const tableNum = selectedBillForAction.tableNumber;
            const sessId = selectedBillForAction.tableSessionId;
            const req = selectedBillForAction.request;

            const activeSession = activeSessions.find(
              (s) => (sessId && s.id === sessId) || matchTableNumber(s.tableNumber, tableNum)
            );
            const sessionOrders = activeSession
              ? orders.filter((o) => o.tableSessionId === activeSession.id && o.status !== 'CANCELLED')
              : [];
            const calculatedTotal =
              bill?.grandTotal !== undefined
                ? bill.grandTotal
                : sessionOrders.reduce((sum, o) => sum + o.totalAmount, 0);
            const currentPayStatus =
              bill?.paymentStatus ||
              (sessionOrders.length > 0 && sessionOrders.every((o) => o.paymentStatus === 'PAID')
                ? 'PAID'
                : 'UNPAID');

            return (
              <div className="space-y-4 font-sans text-slate-100 printable-receipt">
                <div className="flex justify-between items-center bg-[#0c0e14] p-3.5 rounded-xl border border-[#1e232e]">
                  <div>
                    <h3 className="text-base font-bold text-white font-mono">{tableNum}</h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Invoice: {bill?.invoiceNumber || 'Provisional Bill'}{' '}
                      {activeSession ? `• #${activeSession.id.slice(-6)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] font-mono text-slate-400">Payment Status</span>
                    {currentPayStatus === 'PAID' ? (
                      <Badge variant="success">PAID</Badge>
                    ) : currentPayStatus === 'PAYMENT_AWAITING_CONFIRMATION' ? (
                      <Badge variant="brand" className="animate-pulse">
                        AWAITING CONFIRMATION
                      </Badge>
                    ) : (
                      <Badge variant="warning">UNPAID</Badge>
                    )}
                  </div>
                </div>

                {/* Items Breakdown */}
                <div className="space-y-2 bg-[#0c0e14] p-3.5 rounded-xl border border-[#1e232e]">
                  <p className="text-[10px] font-mono uppercase text-slate-400 border-b border-[#1e232e] pb-1.5">
                    Order Items Breakdown:
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {bill?.items && bill.items.length > 0 ? (
                      bill.items.map((it: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs text-slate-200">
                          <span>
                            {it.quantity}x {it.name || it.itemName}
                          </span>
                          <span className="font-mono text-slate-300">
                            ₹{((it.price || it.unitPrice || 0) * (it.quantity || 1)).toFixed(2)}
                          </span>
                        </div>
                      ))
                    ) : sessionOrders.length > 0 ? (
                      sessionOrders
                        .flatMap((o) => o.items)
                        .map((it, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-slate-200">
                            <span>
                              {it.quantity}x {it.name}
                            </span>
                            <span className="font-mono text-slate-300">
                              ₹{(it.price * it.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))
                    ) : (
                      <p className="text-xs text-slate-500 py-2 text-center">
                        No orders recorded for this session.
                      </p>
                    )}
                  </div>

                  {/* Summary Totals */}
                  <div className="border-t border-[#1e232e] pt-2 space-y-1 text-xs font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>Subtotal:</span>
                      <span>₹{(bill?.subtotal !== undefined ? bill.subtotal : sessionOrders.reduce((sum, o) => sum + (o.subtotal || o.totalAmount), 0)).toFixed(2)}</span>
                    </div>
                    {bill && bill.discountAmount ? (
                      <div className="flex justify-between text-emerald-400">
                        <span>Discount {bill.discountPercentage ? `(${bill.discountPercentage}%)` : ''}:</span>
                        <span>-₹{bill.discountAmount.toFixed(2)}</span>
                      </div>
                    ) : null}
                    {(bill?.taxAmount || 0) > 0 ? (
                      <div className="flex justify-between text-slate-400">
                        <span>GST / Taxes:</span>
                        <span>₹{(bill?.taxAmount || 0).toFixed(2)}</span>
                      </div>
                    ) : sessionOrders.some((o) => (o.taxAmount || 0) > 0) ? (
                      <div className="flex justify-between text-slate-400">
                        <span>GST / Taxes:</span>
                        <span>₹{sessionOrders.reduce((sum, o) => sum + (o.taxAmount || 0), 0).toFixed(2)}</span>
                      </div>
                    ) : null}
                    {bill && (bill.serviceChargeAmount || 0) > 0 ? (
                      <div className="flex justify-between text-slate-400">
                        <span>Service Charge ({bill.serviceChargePercentage || 0}%):</span>
                        <span>₹{(bill.serviceChargeAmount || 0).toFixed(2)}</span>
                      </div>
                    ) : null}
                    {bill && bill.roundOffAmount !== undefined && bill.roundOffAmount !== 0 ? (
                      <div className="flex justify-between text-slate-400">
                        <span>Round Off:</span>
                        <span>{bill.roundOffAmount > 0 ? `+₹${bill.roundOffAmount.toFixed(2)}` : `-₹${Math.abs(bill.roundOffAmount).toFixed(2)}`}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between items-center text-sm font-bold text-white pt-1.5 border-t border-[#1e232e]">
                      <span>Grand Total:</span>
                      <span className="text-emerald-400 font-mono text-base">
                        ₹{calculatedTotal.toFixed(2)}
                      </span>
                    </div>
                    {bill && (bill.amountPaid || 0) > 0 ? (
                      <div className="flex justify-between text-xs font-mono text-emerald-400 pt-1">
                        <span>Amount Paid:</span>
                        <span>₹{(bill.amountPaid || 0).toFixed(2)}</span>
                      </div>
                    ) : null}
                    {bill && (bill.amountPaid || 0) > 0 ? (
                      <div className="flex justify-between text-xs font-mono font-bold text-amber-400 pt-1">
                        <span>Balance Due:</span>
                        <span>₹{(bill.balanceDue !== undefined ? bill.balanceDue : Math.max(0, calculatedTotal - (bill.amountPaid || 0))).toFixed(2)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Dynamic / Merchant UPI QR Code for physical bill print / guest scan */}
                {(() => {
                  const effectiveUpiId = (restaurant?.upiId || '').trim() ||
                    `${(restaurant?.slug || restaurant?.name || 'thestart').toLowerCase().replace(/[^a-z0-9]/g, '') || 'dinely.pos'}@icici`;
                  return (
                    <div className="bg-[#0c0e14] p-3.5 rounded-xl border border-[#1e232e] text-center space-y-2 qr-code-box">
                      <div className="flex items-center justify-between border-b border-[#1e232e] pb-1.5 text-[11px] font-mono">
                        <span className="text-amber-400 font-bold uppercase">UPI Payment QR</span>
                        <span className="text-emerald-400 font-bold">₹{calculatedTotal.toFixed(2)}</span>
                      </div>
                      <div className="w-36 h-36 bg-white p-2 rounded-xl shadow-md mx-auto flex items-center justify-center">
                        {bill?.qrDataUrl ? (
                          <img src={bill.qrDataUrl} alt="Bill UPI QR" className="w-full h-full object-contain" />
                        ) : bill?.paymentQrPayload ? (
                          <QRCodeSVG value={bill.paymentQrPayload} size={128} level="M" />
                        ) : (
                          <QRCodeSVG
                            value={`upi://pay?pa=${encodeURIComponent(effectiveUpiId)}&pn=${encodeURIComponent(restaurant?.name || 'Restaurant')}&am=${calculatedTotal.toFixed(2)}&cu=INR`}
                            size={128}
                            level="M"
                          />
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-slate-400">
                        UPI: <span className="text-slate-200 select-all font-bold">{effectiveUpiId}</span>
                      </p>
                      <p className="text-[10px] text-slate-400">Scan to pay via GPay, PhonePe, Paytm, BHIM</p>
                    </div>
                  );
                })()}

                {/* Payment Actions */}
                {currentPayStatus !== 'PAID' ? (
                  <div className="space-y-3 pt-2 border-t border-[#1e232e] no-print print:hidden">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Select Payment Method:
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['CASH', 'UPI', 'CARD'] as PaymentMethod[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setSelectedPaymentMethod(m)}
                            className={`py-2 px-3 rounded-lg text-xs font-mono font-semibold transition-colors border ${
                              selectedPaymentMethod === m
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                : 'bg-[#12151b] text-slate-400 border-[#1e232e] hover:text-white'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-between items-center gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => window.print()}
                        className="text-xs border-[#1e232e] bg-[#12151b] text-slate-100 hover:text-white flex items-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-400" />
                        <span>Print Bill & QR</span>
                      </Button>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setSelectedBillForAction(null)}
                          disabled={isProcessingPayment}
                          className="text-xs border-[#1e232e] text-slate-300"
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="success"
                          disabled={isProcessingPayment}
                          onClick={() =>
                            handleRecordPayment(
                              bill?.id,
                              tableNum,
                              sessId,
                              selectedPaymentMethod,
                              req?.id,
                              true
                            )
                          }
                          className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>
                            {isProcessingPayment
                              ? 'Recording & Closing Table...'
                              : currentPayStatus === 'PAYMENT_AWAITING_CONFIRMATION'
                              ? `Verify & Close Table (₹${calculatedTotal.toFixed(2)}) 🏁`
                              : `Record ${selectedPaymentMethod} & Close Table (₹${calculatedTotal.toFixed(2)}) 🏁`}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center pt-2 border-t border-[#1e232e] no-print print:hidden">
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Payment Confirmed & Completed
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => window.print()}
                        className="text-xs border-[#1e232e] bg-[#12151b] text-slate-100 hover:text-white flex items-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-400" />
                        <span>Print Bill</span>
                      </Button>
                      <Button
                        variant="brand"
                        size="sm"
                        disabled={isProcessingPayment}
                        onClick={async () => {
                          setIsProcessingPayment(true);
                          try {
                            if (bill?.id) {
                              await api.closeTableSettlement(currentRestaurantId, bill.id, waiterName);
                            }
                            await api.closeTableSession({
                              restaurantId: currentRestaurantId,
                              tableId: tableNum,
                              tableNumber: tableNum,
                              waiterName: waiterName,
                              tableSessionId: sessId,
                              force: true,
                              scope: 'WAITER',
                            });
                            if (req?.id) await handleCompleteRequest(req.id);
                            setSelectedBillForAction(null);
                            showToast('Table Closed 🧹', `${tableNum} session settled & reset to AVAILABLE`, 'success');
                            await loadData(true);
                          } catch (e: any) {
                            showToast('Error', e.message || 'Could not close table', 'warning');
                          } finally {
                            setIsProcessingPayment(false);
                          }
                        }}
                        className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Close Table & Reset 🏁</span>
                      </Button>
                      {req && req.status !== 'COMPLETED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            handleCompleteRequest(req.id);
                            setSelectedBillForAction(null);
                          }}
                          className="text-xs border-[#1e232e] text-slate-300"
                        >
                          Complete Request ✓
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedBillForAction(null)}
                        className="text-xs border-[#1e232e] text-slate-300"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </Modal>
      )}

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
              (s) => s.status !== 'CLOSED' && (s.tableId === selectedTableForView.id || matchTableNumber(s.tableNumber, selectedTableForView.tableNumber))
            );
            const sessionOrders = filterOrdersForTableSession(orders, selectedTableForView.tableNumber, activeSession);
            const matchingBill = activeSession ? bills.find((b) => b.tableSessionId === activeSession.id && b.status !== 'CLOSED' && b.status !== 'CANCELLED' && b.paymentStatus !== 'PAID') : undefined;
            const authCalc = calculateAuthoritativeSessionBill(sessionOrders, restaurant, matchingBill);
            const sessionTotal = authCalc.grandTotal;
            const tableRequests = requests.filter(
              (r) => r.tableNumber.toLowerCase() === selectedTableForView.tableNumber.toLowerCase() && r.status !== 'COMPLETED'
            );

            return (
              <div className="space-y-4 font-sans text-slate-100">
                {/* Header Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#12151b] border border-[#1e232e] p-4 rounded-2xl text-xs font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Session ID:</span>
                    <strong className="text-amber-300">{activeSession ? `#${activeSession.id}` : 'No Session'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Status:</span>
                    <strong className="text-emerald-400">{activeSession ? 'ACTIVE' : 'OCCUPIED'}</strong>
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
                    <div className="p-6 text-center bg-[#0a0c10]/60 rounded-2xl border border-dashed border-[#1e232e] text-xs text-slate-500">
                      No orders placed yet for this active table session.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {sessionOrders.map((ord) => (
                        <div key={ord.id} className="p-3.5 bg-[#0a0c10] border border-[#1e232e] rounded-2xl space-y-2 text-xs">
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
                              <div key={idx} className="flex flex-col gap-0.5">
                                <div className="flex justify-between text-slate-300">
                                  <span>{it.quantity}x {it.name}</span>
                                  <span className="font-mono font-bold text-slate-200">₹{(it.price * it.quantity).toFixed(2)}</span>
                                </div>
                                {it.notes && (
                                  <span className="text-[10px] text-amber-300/80 font-mono pl-3">
                                    ↳ {it.notes}
                                  </span>
                                )}
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
                  <div className="space-y-2 pt-2 border-t border-[#1e232e]">
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

                <div className="flex justify-between items-center pt-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      const tbl = selectedTableForView;
                      setSelectedTableForView(null);
                      setSelectedTableForClose(tbl);
                    }}
                    className="bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl touch-manipulation min-h-[36px]"
                  >
                    Close Table
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedTableForView(null)} className="border-[#1e232e] text-slate-300">
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
              (s) => (s.tableId === selectedTableForClose.id || matchTableNumber(s.tableNumber, selectedTableForClose.tableNumber)) && s.status !== 'CLOSED'
            );
            const sessionOrders = filterOrdersForTableSession(orders, selectedTableForClose.tableNumber, activeSession);
            const matchingBill = activeSession ? bills.find((b) => b.tableSessionId === activeSession.id && b.status !== 'CLOSED' && b.status !== 'CANCELLED' && b.paymentStatus !== 'PAID') : undefined;
            const authCalc = calculateAuthoritativeSessionBill(sessionOrders, restaurant, matchingBill);
            const sessionTotal = authCalc.grandTotal;
            const allPaid = sessionOrders.length === 0 || sessionOrders.every((o) => o.paymentStatus === 'PAID' || o.status === 'COMPLETED');

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

                <div className="space-y-2 bg-[#12151b] border border-[#1e232e] p-4 rounded-2xl text-xs font-mono">
                  <div className="flex justify-between items-center pb-2 border-b border-[#1e232e]">
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
                      {allPaid ? 'PAID / ZERO BALANCE' : 'PAYMENT PENDING'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-[#1e232e] text-sm">
                    <span className="font-bold text-white">TOTAL BILL AMOUNT:</span>
                    <span className="font-black text-emerald-400 text-base">₹{sessionTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedTableForClose(null)}
                    disabled={isClosingTableLoading}
                    className="border-[#1e232e] text-slate-300 min-h-[40px] px-4 touch-manipulation"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    disabled={isClosingTableLoading}
                    onClick={async () => {
                      setIsClosingTableLoading(true);
                      const targetTbl = selectedTableForClose;
                      const activeSess = activeSessions.find(
                        (s) => s.status !== 'CLOSED' && (s.tableId === targetTbl.id || matchTableNumber(s.tableNumber, targetTbl.tableNumber))
                      );

                      // Instant optimistic state update for ultra-snappy responsiveness
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
                            ? { ...t, status: 'AVAILABLE', isOccupied: false, activeSessionId: undefined, sessionStartedAt: undefined }
                            : t
                        )
                      );
                      setOrders((prev) =>
                        prev.map((o) =>
                          (activeSess && o.tableSessionId === activeSess.id) ||
                          o.tableId === targetTbl.id ||
                          (o.tableNumber && matchTableNumber(o.tableNumber, targetTbl.tableNumber))
                            ? { ...o, status: 'COMPLETED', paymentStatus: 'PAID' }
                            : o
                        )
                      );
                      setBills((prev) =>
                        prev.map((b) =>
                          (activeSess && b.tableSessionId === activeSess.id) ||
                          (b.tableNumber && matchTableNumber(b.tableNumber, targetTbl.tableNumber))
                            ? { ...b, status: 'CLOSED', paymentStatus: 'PAID' }
                            : b
                        )
                      );
                      setRequests((prev) =>
                        prev.filter(
                          (r) =>
                            r.tableId !== targetTbl.id &&
                            (!r.tableNumber || !matchTableNumber(r.tableNumber, targetTbl.tableNumber)) &&
                            (!activeSess || r.tableSessionId !== activeSess.id)
                        )
                      );

                      setSelectedTableForClose(null);
                      showToast('Table Session Closed 🧹', `${targetTbl.tableNumber} is now available for new guests`, 'success');

                      try {
                        await api.closeTableSession({
                          restaurantId: currentRestaurantId,
                          tableId: targetTbl.id,
                          tableNumber: targetTbl.tableNumber,
                          waiterName: waiterName,
                          tableSessionId: activeSess?.id,
                          force: true,
                          scope: 'WAITER',
                        });
                        setTimeout(() => loadData(true), 1200);
                      } catch (err: any) {
                        console.warn('Background closeTableSession sync warning:', err);
                        setTimeout(() => loadData(true), 1200);
                      } finally {
                        setIsClosingTableLoading(false);
                      }
                    }}
                    className="bg-rose-600 hover:bg-rose-500 text-white font-bold min-h-[40px] px-4 touch-manipulation active:scale-95 shadow-[0_2px_8px_rgba(225,29,72,0.3)]"
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
