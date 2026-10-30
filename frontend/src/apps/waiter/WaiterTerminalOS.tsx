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
  Check,
  Package,
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
  restaurant?: Restaurant;
  onLogout?: () => void;
}

export const WaiterTerminalOS: React.FC<WaiterTerminalOSProps> = ({ restaurant, onLogout }) => {
  const { formatPrice } = useTheme();

  // Navigation view state: 'floor' (Default: 1-Screen Live Service Floor) or 'tables' (Floor Management)
  const [waiterView, setWaiterView] = useState<'floor' | 'tables'>('floor');

  // Preferences & Status State
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(false);
  // Ref so mute/unmute does NOT re-register the event subscription effect
  const isAudioMutedRef = React.useRef<boolean>(false);
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
  const [bills, setBills] = useState<Bill[]>([]);

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

      const isNotWedding = (restaurant as any)?.businessType !== 'WEDDING_ORDERING';
      const [reqData, ordData, tblData, notifData, sessionData, billData] = await Promise.all([
        api.getCustomerRequests(targetRestId),
        api.getOrders(targetRestId, { excludeEvents: isNotWedding }),
        api.getTables(targetRestId),
        api.getWaiterNotifications(targetRestId),
        api.getActiveTableSessions(targetRestId),
        api.getBills(targetRestId),
      ]);

      setRequests(reqData);
      const cleanOrders = (ordData || []).filter(
        (o: Order) => !isNotWedding || (o.orderType !== 'WEDDING_EVENT' && !o.eventId)
      );
      setOrders(cleanOrders);
      setTables(tblData);
      setNotifications(notifData);
      setActiveSessions(sessionData || []);
      setBills(billData || []);
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

  // Task 6.4: Realtime Reliability & Dropped WebSocket Fallback Polling
  // Aggressive adaptive interval (8s when WS is DISCONNECTED/RECONNECTING, 30s background safety when healthy)
  useEffect(() => {
    const pollIntervalMs = wsStatus === 'CONNECTED' ? 30000 : 8000;
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

      // 3. Play chime for call/ready events — read mute state from ref (stable, no closure staleness)
      const isChimeEvent =
        event.type === 'service_request_created' ||
        event.type === 'order_ready' ||
        event.type === 'CustomerRequestCreated' ||
        event.type === 'OrderReady';

      if (isChimeEvent && !isAudioMutedRef.current) {
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
          api.getOrders(currentRestaurantId).then((fresh) => {
            if (fresh && Array.isArray(fresh)) setOrders(fresh);
          }).catch(() => {});
        } else {
          api.getOrders(currentRestaurantId).then((fresh) => {
            if (fresh && Array.isArray(fresh)) setOrders(fresh);
          }).catch(() => {});
        }
        showToast(
          station ? `${station} Item Ready 🛎️` : 'Order Plated & Ready 🔥',
          `Order for ${tblNum} is ready for collection`,
          'success'
        );
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
        event.type === 'HookahStatusUpdated' ||
        event.type === 'BarStatusUpdated'
      ) {
        const payloadData = (event as any).payload || event;
        const orderId = (event as any).orderId || (event as any).order_id || payloadData.orderId || payloadData.order_id || payloadData.id;
        const newStatus = (event as any).status || payloadData.status;
        const newKitchenStatus = (event as any).kitchenStatus || payloadData.kitchenStatus;
        const newBarStatus = (event as any).barStatus || payloadData.barStatus;
        const newHookahStatus = (event as any).hookahStatus || payloadData.hookahStatus;
        const newDeliveryStatus = (event as any).deliveryStatus || payloadData.deliveryStatus || (event as any).delivery_status;
        const newClaimedBy = (event as any).claimedBy || payloadData.claimedBy || (event as any).claimed_by;

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
              };
            })
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
        showToast('Payment Update 💳', `Bill for ${tblNum} is ${newStatus}`, 'success');
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
        showToast('Bill Check Request 🧾', `${tblNum} requested final bill`, 'info');
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
        showToast('Business Day Closed 🌅', 'Live operational queues and active sessions reset for the new day.', 'info');
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

  // Order Delivery Handler (Valid transition: READY -> DELIVERED)
  const handleDeliverOrder = async (orderId: string, tableNumber?: string) => {
    if (deliveringOrderIds.has(orderId)) return;
    setDeliveringOrderIds((prev) => new Set(prev).add(orderId));
    const ordToDeliver = orders.find((o) => o.id === orderId);
    // Instant optimistic state update
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'DELIVERED', kitchenStatus: 'COMPLETED', barStatus: 'COMPLETED', hookahStatus: 'COMPLETED' } : o))
    );
    if (ordToDeliver) {
      setRecentCompletedHistory((prev) => [
        {
          id: orderId,
          type: 'ORDER_DELIVERED',
          title: `Table ${ordToDeliver.tableNumber || tableNumber} · Order #${orderId.slice(-4)} Delivered`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          details: (ordToDeliver.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', '),
        },
        ...prev,
      ].slice(0, 25));
    }
    const tblFormatted = tableNumber ? (tableNumber.startsWith('Table') ? tableNumber : `Table ${tableNumber}`) : 'Table';
    showToast('Order Delivered 🎉', `Order delivered to ${tblFormatted}`, 'success');
    try {
      await api.deliverOrder(orderId);
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

  // Helper to find matching bill for a customer request
  const getBillForRequest = (req: CustomerRequest): Bill | undefined => {
    if (req.tableSessionId) {
      const bySess = bills.find((b) => b.tableSessionId === req.tableSessionId);
      if (bySess) return bySess;
    }
    return bills.find((b) => matchTableNumber(b.tableNumber, req.tableNumber));
  };

  // Helper to resolve amount for a customer request
  const getAmountForRequest = (req: CustomerRequest, matchingBill?: Bill): number => {
    if (matchingBill && matchingBill.grandTotal) return matchingBill.grandTotal;
    const sess = activeSessions.find(
      (s) => (req.tableSessionId && s.id === req.tableSessionId) || matchTableNumber(s.tableNumber, req.tableNumber)
    );
    if (sess) {
      const tableOrders = orders.filter((o) => o.tableSessionId === sess.id);
      const total = tableOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      if (total > 0) return total;
    }
    const ordersByTable = orders.filter(
      (o) => matchTableNumber(o.tableNumber, req.tableNumber) && o.status !== 'CANCELLED'
    );
    return ordersByTable.reduce((sum, o) => sum + o.totalAmount, 0);
  };

  // Record Bill Payment (CASH / UPI / CARD) & Auto-complete Service Request
  const handleRecordPayment = async (
    billId: string | undefined,
    tableNum: string,
    sessionId?: string,
    method: PaymentMethod = 'CASH',
    requestId?: string
  ) => {
    setIsProcessingPayment(true);
    try {
      let activeBillId = billId;
      if (!activeBillId) {
        const b = await api.requestTableBill(currentRestaurantId, tableNum, sessionId);
        if (b) activeBillId = b.id;
      }

      if (!activeBillId) {
        showToast('Error', 'Unable to resolve bill for payment', 'warning');
        return;
      }

      const updatedBill = await api.markBillPayment(currentRestaurantId, activeBillId, method, waiterName);

      // Optimistic update of bills
      if (updatedBill) {
        setBills((prev) =>
          prev.map((b) => (b.id === activeBillId ? { ...b, ...updatedBill, paymentStatus: 'PAID', status: 'PAID' } : b))
        );
      }

      showToast('Payment Recorded 💳', `Bill for ${tableNum} marked as PAID via ${method}`, 'success');

      if (requestId) {
        await handleCompleteRequest(requestId);
      }

      setSelectedBillForAction(null);
      await loadData(true);
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
      const isSessionActive =
        t.status === 'OCCUPIED' ||
        t.status === 'BILL_REQUESTED' ||
        activeSessionTableIds.has(t.id) ||
        (t.tableNumber && activeSessionTableIds.has(t.tableNumber.toLowerCase())) ||
        activeSessions.some((s) => s.status !== 'CLOSED' && matchTableNumber(s.tableNumber, t.tableNumber));

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

  const getOrderReadiness = (o: Order) => {
    const allItems = o.items || [];
    const kitchenItems = allItems.filter((i) => getFulfillmentStation(i) === 'KITCHEN');
    const barItems = allItems.filter((i) => getFulfillmentStation(i) === 'BAR');
    const hookahItems = allItems.filter((i) => getFulfillmentStation(i) === 'HOOKAH');

    const hasKitchen = kitchenItems.length > 0;
    const hasBar = barItems.length > 0;
    const hasHookah = hookahItems.length > 0;

    const isKitchenReady = !hasKitchen || o.kitchenStatus === 'READY' || o.kitchenStatus === 'COMPLETED';
    const isBarReady = !hasBar || o.barStatus === 'READY' || o.barStatus === 'COMPLETED';
    const isHookahReady = !hasHookah || o.hookahStatus === 'READY' || o.hookahStatus === 'COMPLETED';

    const readyItems: Array<{ item: OrderItem; station: string }> = [];
    const outstandingItems: Array<{ item: OrderItem; station: string; stationStatus: string }> = [];

    if (hasKitchen) {
      if (o.kitchenStatus === 'READY' || o.kitchenStatus === 'COMPLETED') {
        kitchenItems.forEach((i) => readyItems.push({ item: i, station: 'KITCHEN' }));
      } else {
        kitchenItems.forEach((i) =>
          outstandingItems.push({ item: i, station: 'KITCHEN', stationStatus: o.kitchenStatus || 'Cooking' })
        );
      }
    }

    if (hasBar) {
      if (o.barStatus === 'READY' || o.barStatus === 'COMPLETED') {
        barItems.forEach((i) => readyItems.push({ item: i, station: 'BAR' }));
      } else {
        barItems.forEach((i) =>
          outstandingItems.push({ item: i, station: 'BAR', stationStatus: o.barStatus || 'Mixology' })
        );
      }
    }

    if (hasHookah) {
      if (o.hookahStatus === 'READY' || o.hookahStatus === 'COMPLETED') {
        hookahItems.forEach((i) => readyItems.push({ item: i, station: 'HOOKAH' }));
      } else {
        hookahItems.forEach((i) =>
          outstandingItems.push({ item: i, station: 'HOOKAH', stationStatus: o.hookahStatus || 'Heating' })
        );
      }
    }

    // Fallback if no specific stations marked but order is marked READY
    if (readyItems.length === 0 && o.status === 'READY') {
      allItems.forEach((i) => readyItems.push({ item: i, station: getFulfillmentStation(i) }));
    }

    const isCompleteOrderReady = (hasKitchen || hasBar || hasHookah)
      ? (isKitchenReady && isBarReady && isHookahReady)
      : o.status === 'READY';

    return {
      readyItems,
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
      <header className="bg-[#0e1117] border-b border-[#1e232e] sticky top-0 z-40 px-3 sm:px-6 py-2.5 sm:py-3.5 flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-center text-slate-200 shrink-0">
            <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap">
              <DinelyLogo size="sm" />
              <h1 className="text-xs sm:text-base font-bold text-white tracking-tight uppercase truncate">{restaurantName}</h1>
              <Badge variant="brand" className="text-[9px] sm:text-[10px] px-1.5 py-0.2 sm:px-2 sm:py-0.5">WAITER</Badge>
              <Badge variant="outline" className="hidden xs:inline-flex text-emerald-400 border-emerald-500/30 text-[9px] sm:text-[10px] font-mono">{assignedTerminal}</Badge>
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
              Floor service requests, active table sessions & dish delivery
            </p>
          </div>
        </div>

        {/* Authenticated Staff Info & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 sm:gap-2 bg-[#12151b] px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-[#1e232e]">
            <Avatar src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100" name={waiterName} size="sm" />
            <div className="hidden xs:block">
              <p className="font-semibold text-white text-xs truncate max-w-[80px] sm:max-w-none">{waiterName}</p>
              <p className="text-[9px] sm:text-[10px] text-emerald-400 font-mono">ON SHIFT</p>
            </div>
          </div>

          {/* Clock */}
          <div className="hidden md:flex bg-[#12151b] px-2.5 py-1.5 rounded-lg border border-[#1e232e] items-center gap-1.5 font-mono text-slate-300 text-xs">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentTime || '08:42 PM'}</span>
          </div>

          {/* Audio Chime Toggle */}
          <button
            onClick={() => setIsAudioMuted(!isAudioMuted)}
            className="p-1.5 sm:p-2 rounded-lg bg-[#12151b] hover:bg-[#181d27] text-slate-400 hover:text-white transition-colors border border-[#1e232e] h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center shrink-0"
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
            <span className="truncate">Unable to connect to server. Realtime events may be paused.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData()} className="text-xs border-rose-700 hover:bg-rose-900 flex items-center gap-1 h-6 px-2 shrink-0">
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </Button>
        </div>
      )}

      {/* ONE-SCREEN WAITER OPERATIONAL INTERFACE */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-3.5 sm:space-y-4 bg-[#0b0d11]">
        {/* TOP OPERATIONAL BAR: Stage Selector, Live Counts, Search & Refresh */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#0e1117] p-2.5 sm:p-3 rounded-xl border border-[#1e232e]">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setWaiterView('floor')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-colors shrink-0 touch-manipulation ${
                waiterView === 'floor'
                  ? 'bg-emerald-500 text-slate-950 border border-emerald-400 shadow-sm'
                  : 'bg-[#12151b] text-slate-300 hover:text-white border border-[#1e232e]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Floor</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${waiterView === 'floor' ? 'bg-slate-950/20 text-slate-950' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`}>
                {readyPlatesList.length + pendingCallsList.length}
              </span>
            </button>

            <button
              onClick={() => setWaiterView('tables')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg text-xs font-mono font-bold uppercase transition-colors shrink-0 touch-manipulation ${
                waiterView === 'tables'
                  ? 'bg-sky-500 text-slate-950 border border-sky-400 shadow-sm'
                  : 'bg-[#12151b] text-slate-300 hover:text-white border border-[#1e232e]'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Tables & Sessions</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${waiterView === 'tables' ? 'bg-slate-950/20 text-slate-950' : 'bg-[#181d27] text-slate-300 border border-[#2d3545]'}`}>
                {activeTablesList.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-xl justify-end">
            <div className="flex-1">
              <SearchInput
                value={searchQuery}
                onChange={(val) => setSearchQuery(typeof val === 'string' ? val : (val as any).target.value)}
                placeholder="Search table, ticket #, customer call..."
                className="w-full text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData()}
              disabled={isLoading}
              className="text-xs bg-[#12151b] border-[#1e232e] hover:bg-[#181d27] text-slate-300 flex items-center gap-1.5 h-8 shrink-0"
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
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0e1117] p-3 rounded-xl border border-[#1e232e]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
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
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors flex items-center gap-1.5 ${
                      viewMode === 'active'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-[#12151b] text-slate-400 hover:text-white border border-[#1e232e]'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Live Queue ({readyPlatesList.length + pendingCallsList.length})</span>
                  </button>

                  <button
                    onClick={() => setViewMode('history')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-colors flex items-center gap-1.5 ${
                      viewMode === 'history'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-[#12151b] text-slate-400 hover:text-white border border-[#1e232e]'
                    }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
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
                  {/* SECTION A: READY FOR SERVICE */}
                  <div className="bg-[#12151b] border border-[#1e232e] p-4 lg:p-5 rounded-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
                      <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 text-emerald-400" />
                        <h2 className="text-sm font-bold text-white uppercase tracking-tight">
                          Section A: Ready for Service
                        </h2>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold">
                          {readyPlatesList.length} Ready
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        Kitchen & Bar Passes
                      </span>
                    </div>

                    {readyPlatesList.length === 0 ? (
                      <div className="p-10 text-center bg-[#0e1117] rounded-xl border border-dashed border-[#1e232e] space-y-2">
                        <Coffee className="w-7 h-7 text-slate-600 mx-auto" />
                        <p className="text-xs font-semibold text-slate-300">No ready tickets at the pass</p>
                        <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                          Dishes and beverages will appear here instantly as soon as kitchen, bar, or hookah staff mark them ready.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {readyPlatesList.map((order) => {
                          const readiness = getOrderReadiness(order);
                          const isDelivering = deliveringOrderIds.has(order.id);
                          const formattedTable = order.tableNumber && order.tableNumber !== 'COUNTER'
                            ? (order.tableNumber.startsWith('Table') ? order.tableNumber : `Table ${order.tableNumber}`)
                            : 'Counter';

                          return (
                            <div
                              key={order.id}
                              className={`p-4 rounded-xl border transition-colors space-y-3 shadow-xs ${
                                readiness.isCompleteOrderReady
                                  ? 'bg-[#0e1117] border-emerald-500/40 hover:border-emerald-500/60'
                                  : 'bg-[#0e1117] border-amber-500/40 hover:border-amber-500/60'
                              }`}
                            >
                              {/* Ticket Header */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="px-2.5 py-0.5 rounded bg-[#181d27] text-white border border-[#2d3545] text-xs font-mono font-bold">
                                      {formattedTable}
                                    </span>
                                    <span className="text-[11px] font-mono text-slate-400">
                                      #{order.id.slice(-4)}
                                    </span>
                                    {readiness.readyItems.some(r => r.station === 'BAR') && (
                                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-mono font-bold">
                                        BAR
                                      </span>
                                    )}
                                    {readiness.readyItems.some(r => r.station === 'HOOKAH') && (
                                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold">
                                        HOOKAH
                                      </span>
                                    )}
                                    {readiness.readyItems.some(r => r.station === 'KITCHEN') && (
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                                        KITCHEN
                                      </span>
                                    )}
                                    {order.deliveryStatus === 'COLLECTED' ? (
                                      <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                                        <Package className="w-3 h-3 text-sky-400" />
                                        Collected by {order.claimedBy || 'Waiter'}
                                      </span>
                                    ) : ((order as any).kitchenWaiterRequested || (order as any).barWaiterRequested || (order as any).hookahWaiterRequested || order.deliveryStatus === 'WAITING_FOR_WAITER') ? (
                                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold flex items-center gap-1 animate-pulse">
                                        <Bell className="w-3 h-3 text-amber-400" />
                                        Waiter Requested
                                      </span>
                                    ) : readiness.isCompleteOrderReady ? (
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                        All Items Ready
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold flex items-center gap-1">
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
                                    Ready: {getTimeElapsed(order.readyAt || order.updatedAt)}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    Ordered {order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                              </div>

                              {/* Ready Items List with Station Breakdown */}
                              <div className="bg-[#12151b] p-3 rounded-lg border border-[#1e232e] space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold border-b border-[#1e232e] pb-1.5">
                                  <span>Ready for Collection:</span>
                                  <span>{readiness.readyItems.length} items</span>
                                </div>
                                <div className="space-y-1.5">
                                  {readiness.readyItems.map((r, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-emerald-400 text-xs">
                                          {r.item.quantity}x
                                        </span>
                                        <span className="text-white font-medium">{r.item.name}</span>
                                      </div>
                                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#181d27] text-slate-300 border border-[#2d3545]">
                                        {r.station === 'BAR' ? '🍸 Bar' : r.station === 'HOOKAH' ? '💨 Hookah' : '🍳 Kitchen'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Outstanding Items List (if multi-station order still has dishes cooking) */}
                              {readiness.outstandingItems.length > 0 && (
                                <div className="bg-[#12151b]/70 p-3 rounded-lg border border-amber-500/20 space-y-1.5">
                                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-amber-300 font-medium border-b border-[#1e232e] pb-1">
                                    <span>Still In Preparation:</span>
                                    <span className="text-amber-400">{readiness.outstandingItems.length} items pending</span>
                                  </div>
                                  <div className="space-y-1">
                                    {readiness.outstandingItems.map((oItem, idx) => (
                                      <div key={idx} className="flex items-center justify-between text-xs text-slate-400">
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono text-slate-400">{oItem.item.quantity}x</span>
                                          <span>{oItem.item.name}</span>
                                        </div>
                                        <span className="text-[10px] font-mono text-amber-300/80">
                                          {oItem.station}: {oItem.stationStatus}
                                        </span>
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
                                {order.deliveryStatus !== 'COLLECTED' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCollectOrder(order.id, order.tableNumber)}
                                    disabled={collectingOrderIds.has(order.id) || isDelivering}
                                    className="flex-1 min-h-[44px] py-2.5 px-3 rounded-lg text-xs font-bold font-mono transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 bg-sky-600 text-white hover:bg-sky-500 touch-manipulation"
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
                                  onClick={() => handleDeliverOrder(order.id, order.tableNumber)}
                                  disabled={isDelivering || collectingOrderIds.has(order.id)}
                                  className={`min-h-[44px] py-2.5 px-4 rounded-lg text-xs font-bold font-mono transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 touch-manipulation ${
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
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* SECTION B: CUSTOMER REQUESTS */}
                  <div className="bg-[#12151b] border border-[#1e232e] p-4 lg:p-5 rounded-xl space-y-4">
                    <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
                      <div className="flex items-center gap-2">
                        <PhoneCall className="w-4 h-4 text-amber-400" />
                        <h2 className="text-sm font-bold text-white uppercase tracking-tight">
                          Section B: Customer Requests
                        </h2>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
                          {pendingCallsList.length} Active
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400">
                        Live Floor Assistance
                      </span>
                    </div>

                    {pendingCallsList.length === 0 ? (
                      <div className="p-10 text-center bg-[#0e1117] rounded-xl border border-dashed border-[#1e232e] space-y-2">
                        <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto" />
                        <p className="text-xs font-semibold text-slate-300">All customer requests handled</p>
                        <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
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
                              className={`p-4 rounded-xl border transition-colors space-y-3 shadow-xs ${
                                isBillReq
                                  ? 'bg-amber-950/15 border-amber-500/50 hover:border-amber-400'
                                  : isPending
                                  ? 'bg-[#0e1117] border-amber-500/30 hover:border-amber-500/50'
                                  : 'bg-[#0e1117] border-sky-500/30 hover:border-sky-500/50'
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
                                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                        isPending
                                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                          : 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                                      }`}
                                    >
                                      {req.status}
                                    </span>
                                  </div>
                                  {req.assignedWaiterName && (
                                    <p className="text-[11px] text-slate-400 mt-1">
                                      Assigned: <span className="text-slate-200">{req.assignedWaiterName}</span>
                                    </p>
                                  )}
                                </div>

                                <span className="text-[11px] font-mono text-slate-400 bg-[#12151b] px-2 py-0.5 rounded border border-[#1e232e]">
                                  {getTimeElapsed(req.requestedAt)}
                                </span>
                              </div>

                              {/* Bill Context if applicable */}
                              {isBillReq ? (
                                <div className="bg-[#12151b] p-2.5 rounded-lg border border-[#1e232e] flex justify-between items-center text-xs font-mono">
                                  <div>
                                    <span className="text-slate-400 block text-[10px]">TOTAL PAYABLE</span>
                                    <span className="text-emerald-400 font-bold text-sm">₹{billAmt.toFixed(2)}</span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-slate-400 block text-[10px]">STATUS</span>
                                    {payStatus === 'PAID' ? (
                                      <span className="text-emerald-400 font-bold text-[11px]">PAID</span>
                                    ) : payStatus === 'PAYMENT_AWAITING_CONFIRMATION' ? (
                                      <span className="text-amber-300 font-bold text-[11px] animate-pulse">AWAITING VERIFY</span>
                                    ) : (
                                      <span className="text-rose-400 font-bold text-[11px]">UNPAID</span>
                                    )}
                                  </div>
                                </div>
                              ) : req.customerNotes ? (
                                <div className="text-xs bg-[#12151b] p-2.5 rounded-lg border border-[#1e232e] text-slate-300 italic">
                                  "{req.customerNotes}"
                                </div>
                              ) : null}

                              {/* Simple 1-Click Action Buttons */}
                              <div className="flex items-center gap-2 pt-1">
                                {isBillReq ? (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-1/2 text-xs border-[#1e232e] bg-[#141822] hover:bg-[#1a202c] text-slate-200 h-8"
                                      onClick={() => openBillActionModal(req.tableNumber, req.tableSessionId, req, matchingBill)}
                                    >
                                      View Bill
                                    </Button>
                                    <Button
                                      variant="brand"
                                      size="sm"
                                      disabled={isProcessing}
                                      className="w-1/2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white h-8 font-semibold"
                                      onClick={() => openBillActionModal(req.tableNumber, req.tableSessionId, req, matchingBill)}
                                    >
                                      {payStatus === 'PAID' ? 'Confirm & Close' : 'Collect Payment'}
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    {isPending && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        disabled={isProcessing}
                                        className="w-1/2 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold h-8"
                                        onClick={() => handleAcceptRequest(req.id)}
                                      >
                                        Acknowledge
                                      </Button>
                                    )}
                                    <Button
                                      variant="success"
                                      size="sm"
                                      disabled={isProcessing}
                                      className={`${isPending ? 'w-1/2' : 'w-full'} text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-8 flex items-center justify-center gap-1.5`}
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
                                  </>
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
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
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
                          className="w-full text-xs py-1.5 bg-[#141822] border-[#222838] hover:bg-[#1a202c] text-slate-200 h-9 font-medium touch-manipulation"
                          onClick={() => setSelectedTableForView(table)}
                        >
                          View Details
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          className="w-full text-xs py-1.5 bg-rose-600 hover:bg-rose-500 text-white h-9 font-bold touch-manipulation"
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
      </main>

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
              ? orders.filter((o) => o.tableSessionId === activeSession.id)
              : orders.filter((o) => matchTableNumber(o.tableNumber, tableNum));
            const calculatedTotal =
              bill?.grandTotal || sessionOrders.reduce((sum, o) => sum + o.totalAmount, 0);
            const currentPayStatus =
              bill?.paymentStatus ||
              (sessionOrders.length > 0 && sessionOrders.every((o) => o.paymentStatus === 'PAID')
                ? 'PAID'
                : 'UNPAID');

            return (
              <div className="space-y-4 font-sans text-slate-100">
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

                {/* Payment Actions */}
                {currentPayStatus !== 'PAID' ? (
                  <div className="space-y-3 pt-2 border-t border-[#1e232e]">
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

                    <div className="flex justify-end gap-2 pt-2">
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
                            req?.id
                          )
                        }
                        className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        {isProcessingPayment
                          ? 'Recording...'
                          : currentPayStatus === 'PAYMENT_AWAITING_CONFIRMATION'
                          ? `Verify & Confirm Payment (₹${calculatedTotal.toFixed(2)})`
                          : `Record ${selectedPaymentMethod} Payment (₹${calculatedTotal.toFixed(2)})`}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center pt-2 border-t border-[#1e232e]">
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Payment Confirmed & Completed
                    </span>
                    <div className="flex gap-2">
                      {req && req.status !== 'COMPLETED' && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => {
                            handleCompleteRequest(req.id);
                            setSelectedBillForAction(null);
                          }}
                          className="text-xs"
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
              (s) => (s.tableId === selectedTableForClose.id || matchTableNumber(s.tableNumber, selectedTableForClose.tableNumber)) && s.status !== 'CLOSED'
            );
            const sessionOrders = activeSession ? orders.filter((o) => o.tableSessionId === activeSession.id) : [];
            const sessionTotal = sessionOrders.reduce((sum, o) => sum + o.totalAmount, 0);
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
                      {allPaid ? 'PAID / ZERO BALANCE' : 'PAYMENT PENDING'}
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
                          (s) => s.status !== 'CLOSED' && (s.tableId === targetTbl.id || matchTableNumber(s.tableNumber, targetTbl.tableNumber))
                        );
                        await api.closeTableSession({
                          restaurantId: currentRestaurantId,
                          tableId: targetTbl.id,
                          waiterName: waiterName,
                          tableSessionId: activeSess?.id,
                          force: true,
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
