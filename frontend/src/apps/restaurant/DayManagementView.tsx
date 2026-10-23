import React, { useState, useEffect } from 'react';
import {
  Calendar,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  ShoppingBag,
  UtensilsCrossed,
  History,
  RefreshCw,
  Check,
  ShieldCheck,
  ChevronRight,
  Eye,
  Receipt,
  PhoneCall,
  Wine,
  ChefHat,
  ArrowRight,
  X,
  CreditCard,
  Percent,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Modal,
} from '../../packages/ui';
import { formatCurrency } from '../../packages/utils/currency';
import { BusinessDay, Order, Table, Bill, getFulfillmentStation } from '../../packages/types';
import { api } from '../../packages/api/client';
import { realtimeBus } from '../../packages/api/realtime';

interface DayManagementViewProps {
  currentRestaurant: any;
  currentBusinessDay: BusinessDay | null;
  businessDayHistory: BusinessDay[];
  orders: Order[];
  tables: Table[];
  bills: Bill[];
  theme: any;
  currentUser?: any;
  onNavigateTab: (tab: string) => void;
  onRefreshData: () => Promise<void>;
  addToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

export const DayManagementView: React.FC<DayManagementViewProps> = ({
  currentRestaurant,
  currentBusinessDay,
  businessDayHistory,
  orders,
  tables,
  bills,
  theme,
  currentUser,
  onNavigateTab,
  onRefreshData,
  addToast,
}) => {
  const [selectedHistoricalDay, setSelectedHistoricalDay] = useState<BusinessDay | null>(null);
  const [historicalOrders, setHistoricalOrders] = useState<Order[]>([]);
  const [isHistOrdersLoading, setIsHistOrdersLoading] = useState(false);
  const [activeHistTab, setActiveHistTab] = useState<'summary' | 'orders'>('summary');
  const [precheck, setPrecheck] = useState<any>(null);
  const [isPrecheckLoading, setIsPrecheckLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncError, setIsSyncError] = useState(false);
  const [lastSynchronized, setLastSynchronized] = useState<Date>(new Date());

  const restId = currentRestaurant?.id || api.getCurrentRestaurantId();

  // Load historical orders when a historical day is opened
  useEffect(() => {
    if (selectedHistoricalDay && restId) {
      setIsHistOrdersLoading(true);
      setActiveHistTab('summary');
      api.getBusinessDayOrders(restId, selectedHistoricalDay.id)
        .then((ords) => setHistoricalOrders(ords || []))
        .catch(() => setHistoricalOrders([]))
        .finally(() => setIsHistOrdersLoading(false));
    } else {
      setHistoricalOrders([]);
    }
  }, [selectedHistoricalDay?.id, restId]);

  // Load precheck & reconciliation data
  const loadPrecheck = async () => {
    if (!restId) return;
    setIsPrecheckLoading(true);
    try {
      const data = await api.getBusinessDayPrecheck(restId);
      setPrecheck(data);
      setIsSyncError(false);
      setLastSynchronized(new Date());
    } catch (err: any) {
      console.warn('[DayManagementView] Failed to load precheck:', err);
      setIsSyncError(true);
    } finally {
      setIsPrecheckLoading(false);
    }
  };

  useEffect(() => {
    loadPrecheck();
  }, [restId, currentBusinessDay?.id]);

  // Automated Real-time Synchronization across all terminals
  useEffect(() => {
    const unsubscribe = realtimeBus.subscribe((event) => {
      const t = event.type;
      if (
        t === 'BusinessDayOpened' ||
        t === 'BusinessDayClosed' ||
        t === 'DayOpened' ||
        t === 'DayClosed' ||
        t === 'BillPaid' ||
        t === 'BillPaymentRecorded' ||
        t === 'payment_updated' ||
        t === 'payment_status_updated' ||
        t === 'order_created' ||
        t === 'OrderCreated' ||
        t === 'order_status_updated' ||
        t === 'OrderStatusUpdated' ||
        t === 'order_delivered' ||
        t === 'table_session_closed' ||
        t === 'TableSessionClosed' ||
        t === 'table_status_updated' ||
        t === 'TableStatusUpdated'
      ) {
        loadPrecheck();
        onRefreshData();
        setLastSynchronized(new Date());
      }
    });

    // Reliable 30-second heartbeat polling to guarantee synchronization even if network reconnects
    const heartbeat = setInterval(() => {
      loadPrecheck();
      onRefreshData();
      setLastSynchronized(new Date());
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(heartbeat);
    };
  }, [restId]);

  // Determine current day metrics
  const isDayOpen = currentBusinessDay?.status === 'OPEN';
  const openBday = currentBusinessDay;

  // Filter orders strictly belonging to this active business day shift
  const dayOrders = orders.filter((o) => {
    if (o.restaurantId !== currentRestaurant?.id) return false;
    if (!openBday) return true;
    if (o.businessDayId) return o.businessDayId === openBday.id;
    if (openBday.openedAt) {
      return new Date(o.createdAt).getTime() >= new Date(openBday.openedAt).getTime();
    }
    return true;
  });

  const completedOrders = dayOrders.filter(
    (o) => o.status === 'DELIVERED' || o.status === 'COMPLETED' || o.paymentStatus === 'PAID'
  );
  const cancelledOrders = dayOrders.filter((o) => o.status === 'CANCELLED');

  let foodSales = 0;
  let barSales = 0;
  let foodOrdersCount = 0;
  let barOrdersCount = 0;

  dayOrders.forEach((o) => {
    if (o.status !== 'CANCELLED') {
      let orderHasFood = false;
      let orderHasBar = false;
      o.items.forEach((item) => {
        const itemTotal = item.price * item.quantity;
        if (getFulfillmentStation(item) === 'BAR') {
          barSales += itemTotal;
          orderHasBar = true;
        } else {
          foodSales += itemTotal;
          orderHasFood = true;
        }
      });
      if (orderHasFood) foodOrdersCount++;
      if (orderHasBar) barOrdersCount++;
    }
  });

  // Filter bills strictly belonging to this active business day shift
  const shiftBills = (bills || []).filter((b) => {
    if (b.restaurantId !== currentRestaurant?.id) return false;
    if (!openBday) return true;
    if (b.businessDayId) return b.businessDayId === openBday.id;
    if (openBday.openedAt) {
      return new Date(b.createdAt).getTime() >= new Date(openBday.openedAt).getTime();
    }
    return true;
  });

  const shiftPaidBills = shiftBills.filter((b) => b.status === 'PAID' || b.paymentStatus === 'PAID');
  const paidBillsTotal = shiftPaidBills.reduce((sum, b) => sum + (b.grandTotal || 0), 0);

  // Live clock in restaurant timezone
  const tz = (currentBusinessDay as any)?.restaurantTimezone || currentRestaurant?.timezone || 'Asia/Kolkata';
  const [currentLiveTime, setCurrentLiveTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-IN', {
          timeZone: tz,
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });
        setCurrentLiveTime(formatter.format(now));
      } catch {
        setCurrentLiveTime(new Date().toLocaleTimeString());
      }
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [tz]);

  // Authoritative financial ledger numbers
  const backendBday = currentBusinessDay as any;
  const settledSales = backendBday?.settledSales ?? backendBday?.totalSales ?? paidBillsTotal;
  const grossSales = backendBday?.grossSales ?? backendBday?.orderValue ?? dayOrders.reduce((sum, o) => sum + (o.status !== 'CANCELLED' ? (o.totalAmount || 0) : 0), 0);
  const unbilledOrdersAmount = backendBday?.unbilledOrdersAmount ?? precheck?.unbilled_orders_amount ?? Math.max(0, grossSales - settledSales);
  const unbilledOrdersCount = backendBday?.unbilledOrdersCount ?? precheck?.unbilled_orders_count ?? 0;
  const unpaidBillsAmount = backendBday?.unpaidBillsAmount ?? precheck?.unpaid_bills_amount ?? 0;
  const outstandingReceivables = backendBday?.outstandingReceivables ?? (unbilledOrdersAmount + unpaidBillsAmount);
  const cashSales = backendBday?.cashSales ?? 0;
  const cardSales = backendBday?.cardSales ?? 0;
  const upiSales = backendBday?.upiSales ?? 0;
  const taxAmount = backendBday?.taxAmount ?? 0;
  const discountAmount = backendBday?.discountAmount ?? 0;
  const serviceChargeAmount = backendBday?.serviceChargeAmount ?? 0;
  const netSales = backendBday?.netSales ?? Math.max(0, grossSales - discountAmount);

  // Authoritative totalSales
  const totalSales = settledSales;

  // Live counters strictly excluding completed/delivered orders
  const activeTablesCount = precheck?.active_tables_count ?? currentBusinessDay?.activeTablesCount ?? tables.filter((t) => t.status === 'OCCUPIED' || t.isOccupied).length;
  const activeSessionsCount = precheck?.active_sessions_count ?? currentBusinessDay?.activeSessionsCount ?? 0;
  const unpaidBillsCount = precheck?.unpaid_bills_count ?? currentBusinessDay?.unpaidBillsCount ?? shiftBills.filter((b) => b.status !== 'PAID' && b.status !== 'CANCELLED' && b.paymentStatus !== 'PAID').length;
  const kitchenPendingCount = precheck?.uncompletedKitchenOrdersCount ?? currentBusinessDay?.kitchenPendingCount ?? orders.filter((o) => (o.kitchenStatus === 'PENDING' || o.kitchenStatus === 'PREPARING') && !['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(o.status)).length;
  const barPendingCount = precheck?.uncompletedBarOrdersCount ?? currentBusinessDay?.barPendingCount ?? orders.filter((o) => (o.barStatus === 'PENDING' || o.barStatus === 'PREPARING') && !['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(o.status)).length;
  const waiterPendingCount = precheck?.open_waiter_requests_count ?? currentBusinessDay?.waiterPendingCount ?? 0;

  // Authoritative Dates
  const currentBusinessDate = currentBusinessDay?.date || backendBday?.business_date || 'Today';
  const currentLocalDate = backendBday?.currentLocalDate || backendBday?.current_local_date;
  const nextBusinessDate = backendBday?.nextBusinessDate || backendBday?.next_business_date || 'Next Operational Day';
  const requiresRollover = Boolean(currentBusinessDay?.requiresRollover || backendBday?.isStaleShift || backendBday?.requires_rollover);
  const isStaleShift = Boolean(backendBday?.isStaleShift || backendBday?.is_stale_shift);
  const nextRolloverAt = backendBday?.nextRolloverAt ? new Date(backendBday.nextRolloverAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '04:00 AM';

  // Manual trigger for ledger synchronization if network was disconnected
  const handleManualSync = async () => {
    if (!restId) return;
    setIsSyncing(true);
    try {
      await onRefreshData();
      await loadPrecheck();
      setIsSyncError(false);
      setLastSynchronized(new Date());
      addToast('info', 'Synchronized', 'Operational metrics updated from ledger.');
    } catch (err: any) {
      setIsSyncError(true);
      addToast('error', 'Sync Failed', err?.message || 'Failed to reach synchronization service.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle Stale Shift Recovery / Synchronize & Advance
  const handleSyncAndAdvance = async () => {
    if (!restId) return;
    setIsActionLoading(true);
    try {
      const res = await api.syncAndAdvanceBusinessDay(restId);
      addToast('success', 'Day Synchronized ☀️', `Shift cleanly synchronized and advanced to ${res?.activeDay?.business_date || 'Today'}. Historical ledger archived.`);
      await onRefreshData();
      await loadPrecheck();
    } catch (err: any) {
      addToast('error', 'Sync Error', err?.message || 'Failed to synchronize business day.');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1e232e] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                Day Management
                <Badge
                  variant="success"
                  className="font-mono text-[10px] px-2.5 py-0.5 ml-2 bg-emerald-950/60 text-emerald-400 border-emerald-800/60"
                >
                  AUTOMATIC LIFECYCLE ACTIVE
                </Badge>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Continuous automated business-day lifecycle, real-time timezone tracking, shift reconciliation, and audit ledger.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="border-[#1e232e] bg-[#12151b] text-slate-300 hover:text-white text-xs px-3.5 py-2 font-mono"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncing || isPrecheckLoading ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />}
          >
            {isSyncing ? 'Syncing...' : 'Sync Ledger'}
          </Button>
        </div>
      </div>

      {/* Live Synchronization Status */}
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1 -mt-2">
        {isSyncError ? (
          <span className="flex items-center gap-1.5 text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            Sync Disconnected / Stale — Check Connection
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Automatic Continuous Sync Active ({tz})
          </span>
        )}
        <span>
          Last Synchronized: {lastSynchronized ? lastSynchronized.toLocaleTimeString() : 'Pending'}
        </span>
      </div>

      {/* Shift Rollover Alert Banner */}
      {requiresRollover && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="flex items-start sm:items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-amber-300 text-sm">
                  Automatic Rollover Scheduled — Active Shift: {currentBusinessDate}
                </span>
                {isStaleShift && (
                  <Badge variant="warning" className="text-[10px] bg-amber-900/60 text-amber-300 border-amber-700/60 font-mono">
                    Prior-Day Shift Active ({currentLocalDate || 'Today'})
                  </Badge>
                )}
              </div>
              <p className="text-amber-200/90 text-[11px] leading-relaxed">
                The continuous background service advances the business day automatically at {nextRolloverAt} ({tz}). All orders and payments continue to be attributed accurately to this operational shift.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
            <Button
              variant="brand"
              size="sm"
              onClick={handleSyncAndAdvance}
              disabled={isActionLoading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-1.5 shadow-sm"
              icon={isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            >
              Sync to {currentLocalDate || 'Today'}
            </Button>
          </div>
        </div>
      )}

      {/* Main Operational Hero Card */}
      <Card className="bg-[#12151b] border-[#1e232e] p-6 rounded-2xl shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-[#1e232e]">
          {/* Current Business Date */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold block">
                Current Business Date
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {tz}
              </span>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">
                {currentBusinessDate}
              </span>
              <Badge variant="success" className="text-[10px] font-mono bg-emerald-950/60 text-emerald-400 border-emerald-800/60">
                ACTIVE OPERATIONAL DAY
              </Badge>
              {isStaleShift && (
                <Badge variant="warning" className="text-[9px] bg-amber-950/60 text-amber-300 border-amber-800/60 font-mono">
                  ROLLOVER SCHEDULED
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 pt-0.5 text-xs font-mono text-emerald-400">
              <Clock className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
              <span>{currentLiveTime || 'Syncing live clock...'}</span>
            </div>
            <p className="text-xs text-slate-400 pt-0.5">
              All live POS, KDS, Bar, and Table orders continuously belong to this operational shift.
            </p>
          </div>

          {/* Opened / Closed Metadata */}
          <div className="space-y-2 border-t md:border-t-0 md:border-l border-[#1e232e] md:pl-6 pt-4 md:pt-0">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold block">
              Shift Attribution & Schedule
            </span>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-emerald-400" /> Opened At:
                </span>
                <span className="font-semibold text-white">
                  {currentBusinessDay?.openedAt ? new Date(currentBusinessDay.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-500">Opened By:</span>
                <span className="text-slate-200 truncate max-w-[150px]">
                  {currentBusinessDay?.openedBy || 'System / Auto-Rollover Daemon'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-500">Auto-Rollover Cutoff:</span>
                <span className="text-amber-300 font-semibold">{nextRolloverAt}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-[#1e232e]">
                <span className="text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-400" /> Service Mode:
                </span>
                <span className="text-emerald-400 font-semibold text-[11px]">
                  Continuous Automatic Rollover
                </span>
              </div>
            </div>
          </div>

          {/* Next Business Date & Actions */}
          <div className="space-y-2 border-t md:border-t-0 md:border-l border-[#1e232e] md:pl-6 pt-4 md:pt-0">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold block">
              Next Business Day Cycle
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xl font-bold font-mono text-emerald-400">
                {nextBusinessDate}
              </span>
              {isStaleShift && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncAndAdvance}
                  disabled={isActionLoading}
                  className="h-6 px-2 text-[10px] border-emerald-700/60 text-emerald-400 hover:bg-emerald-950/40"
                  icon={isActionLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                >
                  Advance
                </Button>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Operational date advances authoritatively across midnight using restaurant timezone ({tz}) and rollover cutoff ({nextRolloverAt}).
            </p>
          </div>
        </div>

        {/* Live Operational Counters (8 Cards) */}
        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Live Station & Operational Metrics ({currentBusinessDate})
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            {/* 1. Collected Revenue (Paid Bills) */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Collected Revenue</span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-400 tracking-tight">
                {formatCurrency(settledSales, theme.currency)}
              </p>
              <span className="text-[10px] text-slate-400 block truncate">
                Cash: {formatCurrency(cashSales, theme.currency)} • Card: {formatCurrency(cardSales, theme.currency)} • UPI: {formatCurrency(upiSales, theme.currency)}
              </span>
              <span className="text-[9px] text-slate-500 block">
                {paidBillsTotal === 0 && grossSales > 0 ? '⚠️ Zero bills settled yet' : 'Realized register receipts'}
              </span>
            </div>

            {/* 2. Gross Order Demand */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Gross Order Demand</span>
                <ShoppingBag className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {formatCurrency(grossSales, theme.currency)}
              </p>
              <span className="text-[10px] text-slate-400 block truncate">
                Food: {formatCurrency(foodSales, theme.currency)} • Bar: {formatCurrency(barSales, theme.currency)}
              </span>
              <span className="text-[9px] text-slate-500 block">
                {dayOrders.length} placed • {completedOrders.length} fulfilled
              </span>
            </div>

            {/* 3. Pending Receivables */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Pending Receivables</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateTab('billing')}
                  className="h-5 px-1.5 text-[9px] border-[#1e232e] text-slate-400 hover:text-white"
                >
                  Billing
                </Button>
              </div>
              <p className={`text-xl sm:text-2xl font-bold tracking-tight ${outstandingReceivables > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                {formatCurrency(outstandingReceivables, theme.currency)}
              </p>
              <span className="text-[10px] text-slate-400 block truncate">
                {unbilledOrdersCount} unbilled ({formatCurrency(unbilledOrdersAmount, theme.currency)}) • {unpaidBillsCount} unpaid ({formatCurrency(unpaidBillsAmount, theme.currency)})
              </span>
              <span className="text-[9px] text-slate-500 block">
                {outstandingReceivables > 0 ? '⚠️ Uncollected shift orders' : 'All orders settled'}
              </span>
            </div>

            {/* 4. Current Orders */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Day Orders</span>
                <Receipt className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {dayOrders.length}
              </p>
              <span className="text-[10px] text-slate-400 block">
                {completedOrders.length} Delivered • {cancelledOrders.length} Cancelled
              </span>
              <span className="text-[9px] text-slate-500 block">
                {dayOrders.filter(o => !['COMPLETED', 'DELIVERED', 'CANCELLED'].includes(o.status)).length} active in prep
              </span>
            </div>

            {/* 5. Active Tables */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Active Tables</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateTab('tables')}
                  className="h-5 px-1.5 text-[9px] border-[#1e232e] text-slate-400 hover:text-white"
                >
                  View
                </Button>
              </div>
              <p className={`text-xl sm:text-2xl font-bold tracking-tight ${activeTablesCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                {activeTablesCount}
              </p>
              <span className="text-[10px] text-slate-400 block">
                {activeTablesCount === 0 ? 'All tables available' : `${activeTablesCount} occupied dining`}
              </span>
            </div>

            {/* 6. Open Sessions */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Open Sessions</span>
                <Clock className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <p className={`text-xl sm:text-2xl font-bold tracking-tight ${activeSessionsCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                {activeSessionsCount}
              </p>
              <span className="text-[10px] text-slate-400 block">
                Customer table sessions
              </span>
            </div>

            {/* 7. Kitchen Pending */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Kitchen Pending</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateTab('kitchen')}
                  className="h-5 px-1.5 text-[9px] border-[#1e232e] text-slate-400 hover:text-white"
                >
                  KDS
                </Button>
              </div>
              <p className={`text-xl sm:text-2xl font-bold tracking-tight ${kitchenPendingCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                {kitchenPendingCount}
              </p>
              <span className="text-[10px] text-slate-400 block">
                Orders in prep / ready
              </span>
            </div>

            {/* 8. Bar Pending */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Bar Pending</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateTab('bar')}
                  className="h-5 px-1.5 text-[9px] border-[#1e232e] text-slate-400 hover:text-white"
                >
                  Bar
                </Button>
              </div>
              <p className={`text-xl sm:text-2xl font-bold tracking-tight ${barPendingCount > 0 ? 'text-purple-400' : 'text-slate-300'}`}>
                {barPendingCount}
              </p>
              <span className="text-[10px] text-slate-400 block">
                Beverage queue tickets
              </span>
            </div>
          </div>
        </div>

        {/* Daily Financial Reconciliation Ledger Panel */}
        <div className="p-5 rounded-2xl bg-[#0e1117] border border-[#1e232e] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1e232e] pb-3">
            <div className="space-y-0.5">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-400" />
                Daily Financial Reconciliation Ledger
              </h4>
              <p className="text-xs text-slate-400">
                Authoritative double-entry comparison reconciling gross order demand against settled cash flow.
              </p>
            </div>
            <Badge
              variant={outstandingReceivables > 0 ? 'warning' : 'success'}
              className="font-mono text-[10px] self-start sm:self-center"
            >
              {outstandingReceivables > 0 ? 'RECONCILIATION PENDING' : 'LEDGER BALANCED'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
            {/* Column 1: Order Demand & Value Analysis */}
            <div className="p-4 bg-[#12151b] rounded-xl border border-[#1e232e] space-y-2">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block pb-1 border-b border-[#1e232e]">
                1. Order Demand & Value Analysis
              </span>
              <div className="flex justify-between items-center text-slate-300">
                <span>Gross Order Value:</span>
                <span className="font-bold text-white">{formatCurrency(grossSales, theme.currency)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400 pl-2 text-[11px]">
                <span>├─ Food Orders:</span>
                <span className="text-slate-300">{formatCurrency(foodSales, theme.currency)} ({foodOrdersCount})</span>
              </div>
              <div className="flex justify-between items-center text-slate-400 pl-2 text-[11px]">
                <span>└─ Beverage / Bar Orders:</span>
                <span className="text-slate-300">{formatCurrency(barSales, theme.currency)} ({barOrdersCount})</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between items-center text-slate-300">
                  <span>Discounts Applied:</span>
                  <span className="text-rose-400">-{formatCurrency(discountAmount, theme.currency)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-slate-300">
                <span>Net Sales (Pre-Tax):</span>
                <span className="font-semibold text-slate-200">{formatCurrency(netSales, theme.currency)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Applicable Taxes:</span>
                <span className="text-slate-300">{formatCurrency(taxAmount, theme.currency)}</span>
              </div>
              {serviceChargeAmount > 0 && (
                <div className="flex justify-between items-center text-slate-300">
                  <span>Service Charges:</span>
                  <span className="text-slate-300">{formatCurrency(serviceChargeAmount, theme.currency)}</span>
                </div>
              )}
            </div>

            {/* Column 2: Payment Realization & Receivables */}
            <div className="p-4 bg-[#12151b] rounded-xl border border-[#1e232e] space-y-2">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block pb-1 border-b border-[#1e232e]">
                2. Payment Realization & Receivables
              </span>
              <div className="flex justify-between items-center text-slate-300">
                <span className="font-bold text-emerald-400">Total Settled Revenue (Paid Bills):</span>
                <span className="font-bold text-emerald-400 text-sm">{formatCurrency(settledSales, theme.currency)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400 pl-2 text-[11px]">
                <span>├─ Cash Receipts:</span>
                <span className="text-slate-300">{formatCurrency(cashSales, theme.currency)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400 pl-2 text-[11px]">
                <span>├─ UPI / QR Collections:</span>
                <span className="text-slate-300">{formatCurrency(upiSales, theme.currency)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400 pl-2 text-[11px]">
                <span>└─ Card Collections:</span>
                <span className="text-slate-300">{formatCurrency(cardSales, theme.currency)}</span>
              </div>
              <div className="pt-1 border-t border-[#1e232e] flex justify-between items-center text-slate-300">
                <span className={unbilledOrdersAmount > 0 ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                  Unbilled Orders ({unbilledOrdersCount} completed):
                </span>
                <span className={unbilledOrdersAmount > 0 ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                  {formatCurrency(unbilledOrdersAmount, theme.currency)}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className={unpaidBillsAmount > 0 ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
                  Unpaid Bills ({unpaidBillsCount} pending):
                </span>
                <span className={unpaidBillsAmount > 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                  {formatCurrency(unpaidBillsAmount, theme.currency)}
                </span>
              </div>
              <div className="pt-1 border-t border-[#1e232e] flex justify-between items-center font-bold">
                <span className={outstandingReceivables > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                  Total Outstanding Receivables:
                </span>
                <span className={`text-sm ${outstandingReceivables > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {formatCurrency(outstandingReceivables, theme.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Audit Explanation Banner */}
          {outstandingReceivables > 0 ? (
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/30 flex items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start sm:items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                <span className="text-amber-200/90 font-mono text-[11px]">
                  <strong>Ledger Reconciliation Notice:</strong> Collected sales shows {formatCurrency(settledSales, theme.currency)} because exactly {formatCurrency(settledSales, theme.currency)} in bills have been paid. {unbilledOrdersCount > 0 ? `${unbilledOrdersCount} order(s) worth ${formatCurrency(unbilledOrdersAmount, theme.currency)} were completed without a paid bill.` : ''} {unpaidBillsCount > 0 ? `${unpaidBillsCount} bill(s) worth ${formatCurrency(unpaidBillsAmount, theme.currency)} await payment.` : ''}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigateTab('billing')}
                className="h-6 px-2.5 text-[10px] border-amber-700/60 text-amber-300 hover:bg-amber-900/30 shrink-0"
              >
                Go to Billing
              </Button>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-800/30 flex items-center gap-2 text-xs font-mono text-emerald-300 text-[11px]">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Audit Reconciled:</strong> All customer order demand is fully billed, collected, and balanced against settled cash and digital receipts.
              </span>
            </div>
          )}
        </div>

        {/* Active Station Operational Notice */}
        {isDayOpen && precheck && !precheck.can_close_safely && (
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Active Shift Station Notice ({precheck.blocking_reasons?.length || precheck.warnings?.length || 0} active items)
              </h5>
              <span className="text-[11px] font-mono text-amber-300/80">
                Live stations requiring attention
              </span>
            </div>

            <div className="space-y-1.5">
              {precheck.blocking_reasons && precheck.blocking_reasons.length > 0 ? (
                precheck.blocking_reasons.map((item: any, idx: number) => {
                  let targetTab = 'billing';
                  let actionText = 'View Bill';
                  if (item.type === 'TABLE' || item.link === '/tables') {
                    targetTab = 'tables';
                    actionText = 'View Table';
                  } else if (item.type === 'KITCHEN' || item.link === '/kitchen') {
                    targetTab = 'kitchen';
                    actionText = 'View Kitchen';
                  } else if (item.type === 'BAR' || item.link === '/bar') {
                    targetTab = 'bar';
                    actionText = 'View Bar';
                  } else if (item.type === 'HOOKAH' || item.link === '/hookah') {
                    targetTab = 'hookah';
                    actionText = 'View Hookah';
                  } else if (item.type === 'WAITER' || item.link === '/waiter') {
                    targetTab = 'waiter';
                    actionText = 'View Requests';
                  }

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 rounded-lg bg-[#0e1117]/80 border border-amber-800/20 text-xs"
                    >
                      <span className="text-slate-300 font-mono flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        {item.label}
                      </span>
                      {item.link && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onNavigateTab(targetTab)}
                          className="h-6 px-2 text-[10px] border-amber-700/50 text-amber-300 hover:bg-amber-900/30 shrink-0 ml-2"
                        >
                          {actionText}
                        </Button>
                      )}
                    </div>
                  );
                })
              ) : (
                precheck.warnings?.map((w: string, idx: number) => (
                  <div key={idx} className="text-xs text-amber-200/90 font-mono flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    {w}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Business Day History Ledger */}
      <Card className="bg-[#12151b] border-[#1e232e] p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#1e232e] pb-4">
          <div className="space-y-0.5">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-400" /> Business Day History Ledger
            </h3>
            <p className="text-xs text-slate-400">
              Permanently archived end-of-day financial records and operational audit metrics. Read-only.
            </p>
          </div>
          <Badge variant="outline" className="border-[#1e232e] text-slate-300 font-mono text-xs">
            {businessDayHistory.length} Days Archived
          </Badge>
        </div>

        {businessDayHistory.length === 0 ? (
          <div className="p-8 text-center bg-[#0e1117] rounded-xl border border-dashed border-[#1e232e] text-xs text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">No closed business days in history ledger yet.</p>
            <p>Historical financial statements will appear here automatically as daily rollovers occur.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[#1e232e] text-slate-400 uppercase text-[10px]">
                  <th className="pb-3 px-3">Business Date</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3">Orders</th>
                  <th className="pb-3 px-3">Food</th>
                  <th className="pb-3 px-3">Bar</th>
                  <th className="pb-3 px-3">Settled Sales</th>
                  <th className="pb-3 px-3">Order Demand</th>
                  <th className="pb-3 px-3">Closed By</th>
                  <th className="pb-3 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e232e]">
                {businessDayHistory.map((b) => {
                  const bSummary = (b.summary || {}) as any;
                  const bOrders = bSummary.totalOrders ?? (b as any).totalOrders ?? (b as any).total_orders ?? 0;
                  const bFoodSales = bSummary.foodSales ?? (b as any).foodSales ?? (b as any).food_sales ?? 0;
                  const bBarSales = bSummary.barSales ?? (b as any).barSales ?? (b as any).bar_sales ?? 0;
                  const bSettledSales = bSummary.settledSales ?? bSummary.totalSales ?? (b as any).settled_sales ?? (b as any).totalSales ?? (b as any).total_sales ?? 0;
                  const bGrossSales = bSummary.grossSales ?? bSummary.orderValue ?? (b as any).gross_sales ?? bSettledSales;
                  const bReqRecon = Boolean(bSummary.requiresReconciliation ?? (b as any).requires_reconciliation);

                  return (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedHistoricalDay(b)}
                      className="hover:bg-[#141822]/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-3 font-bold text-white group-hover:text-emerald-400 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <span>{b.date || (b as any).business_date}</span>
                          {bReqRecon && (
                            <Badge variant="warning" className="text-[9px] py-0 px-1 border-amber-800/60 text-amber-300">
                              Recon
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="text-[10px] border-[#1e232e] text-slate-300">
                          {b.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-slate-300">{bOrders}</td>
                      <td className="py-3 px-3 text-emerald-400">{formatCurrency(bFoodSales, theme.currency)}</td>
                      <td className="py-3 px-3 text-purple-400">{formatCurrency(bBarSales, theme.currency)}</td>
                      <td className="py-3 px-3 font-bold text-emerald-400">
                        {formatCurrency(bSettledSales, theme.currency)}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {formatCurrency(bGrossSales, theme.currency)}
                      </td>
                      <td className="py-3 px-3 text-slate-400 truncate max-w-[120px]">
                        {b.closedBy || (b as any).closed_by || 'Owner'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedHistoricalDay(b);
                          }}
                          className="h-6 px-2 text-[10px] border-[#1e232e] text-slate-300 hover:text-white"
                          icon={<Eye className="w-3 h-3 text-slate-400" />}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>



      {/* Historical Day Read-Only Detail Modal */}
      {selectedHistoricalDay && (
        <Modal
          isOpen={!!selectedHistoricalDay}
          onClose={() => setSelectedHistoricalDay(null)}
          title={`Business Day Ledger: ${selectedHistoricalDay.date || (selectedHistoricalDay as any).business_date}`}
          maxWidth="md"
        >
          <div className="space-y-4 font-sans text-xs">
            {/* Header Badge & Timestamp */}
            <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 font-mono text-[10px]">
                  STATUS: {selectedHistoricalDay.status}
                </Badge>
                <span className="text-slate-400 font-mono text-[11px]">
                  Archived Historical Record
                </span>
              </div>
              <span className="text-slate-500 font-mono text-[11px]">
                READ ONLY
              </span>
            </div>

            {/* Shift Attribution Details */}
            <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between items-center text-slate-400">
                <span>Opened At:</span>
                <span className="text-white">
                  {selectedHistoricalDay.openedAt ? new Date(selectedHistoricalDay.openedAt).toLocaleString() : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Opened By:</span>
                <span className="text-white">{selectedHistoricalDay.openedBy || (selectedHistoricalDay as any).opened_by || 'Manager'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400 pt-1 border-t border-[#1e232e]">
                <span>Closed At:</span>
                <span className="text-amber-400">
                  {selectedHistoricalDay.closedAt ? new Date(selectedHistoricalDay.closedAt).toLocaleString() : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Closed By:</span>
                <span className="text-white">{selectedHistoricalDay.closedBy || (selectedHistoricalDay as any).closed_by || 'Owner'}</span>
              </div>
            </div>

            {/* Modal Sub-Tabs: Financial Statement vs Orders Breakdown */}
            <div className="flex items-center gap-1 bg-[#0e1117] p-1 rounded-xl border border-[#1e232e]">
              <button
                type="button"
                onClick={() => setActiveHistTab('summary')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-mono font-medium transition-colors ${
                  activeHistTab === 'summary'
                    ? 'bg-[#181d27] text-emerald-400 border border-[#2d3545]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Financial Summary
              </button>
              <button
                type="button"
                onClick={() => setActiveHistTab('orders')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-mono font-medium transition-colors ${
                  activeHistTab === 'orders'
                    ? 'bg-[#181d27] text-emerald-400 border border-[#2d3545]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Historical Orders ({isHistOrdersLoading ? '...' : historicalOrders.length})
              </button>
            </div>

            {/* Tab 1: Financial Summary Breakdown */}
            {activeHistTab === 'summary' && (() => {
              const summary = (selectedHistoricalDay.summary || {}) as any;
              const tOrders = summary.totalOrders ?? (selectedHistoricalDay as any).total_orders ?? 0;
              const fSales = summary.foodSales ?? (selectedHistoricalDay as any).food_sales ?? 0;
              const bSales = summary.barSales ?? (selectedHistoricalDay as any).bar_sales ?? 0;
              const tSales = summary.settledSales ?? summary.totalSales ?? (selectedHistoricalDay as any).settled_sales ?? (selectedHistoricalDay as any).total_sales ?? 0;
              const gSales = summary.grossSales ?? summary.orderValue ?? (selectedHistoricalDay as any).gross_sales ?? tSales;
              const unbilledAmt = summary.unbilledOrdersAmount ?? (selectedHistoricalDay as any).unbilled_orders_amount ?? 0;
              const unpaidAmt = summary.unpaidBillsAmount ?? (selectedHistoricalDay as any).unpaid_bills_amount ?? 0;
              const cashSales = summary.cashSales ?? (selectedHistoricalDay as any).cash_sales ?? 0;
              const cardSales = summary.cardSales ?? (selectedHistoricalDay as any).card_sales ?? 0;
              const upiSales = summary.upiSales ?? (selectedHistoricalDay as any).upi_sales ?? 0;
              const taxAmt = summary.taxAmount ?? (selectedHistoricalDay as any).tax_amount ?? 0;
              const discountAmt = summary.discountAmount ?? (selectedHistoricalDay as any).discount_amount ?? 0;
              const aov = summary.averageOrderValue ?? (tOrders > 0 ? gSales / tOrders : 0);
              const hasReconNotice = unbilledAmt > 0 || unpaidAmt > 0 || Boolean((selectedHistoricalDay as any).requires_reconciliation || summary.requiresReconciliation);

              return (
                <div className="space-y-3 font-mono">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e]">
                      <span className="text-[10px] text-slate-400 uppercase block">Settled Revenue</span>
                      <span className="text-base font-bold text-emerald-400 mt-1 block">
                        {formatCurrency(tSales, theme.currency)}
                      </span>
                    </div>

                    <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e]">
                      <span className="text-[10px] text-slate-400 uppercase block">Gross Demand</span>
                      <span className="text-base font-bold text-white mt-1 block">
                        {formatCurrency(gSales, theme.currency)}
                      </span>
                    </div>

                    <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e]">
                      <span className="text-[10px] text-slate-400 uppercase block">Orders / Avg Value</span>
                      <span className="text-base font-bold text-sky-400 mt-1 block">
                        {tOrders} • {formatCurrency(aov, theme.currency)}
                      </span>
                    </div>
                  </div>

                  {hasReconNotice && (
                    <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl text-xs space-y-1">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5 text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        Reconciliation Notice at Shift Close
                      </span>
                      <p className="text-amber-200/80 text-[11px]">
                        This shift was sealed with pending receivables. {unbilledAmt > 0 ? `Unbilled orders: ${formatCurrency(unbilledAmt, theme.currency)}. ` : ''}{unpaidAmt > 0 ? `Unpaid bills: ${formatCurrency(unpaidAmt, theme.currency)}.` : ''} All items remain intact in historical audit records.
                      </p>
                    </div>
                  )}

                  {/* Payment Breakdown */}
                  <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1.5 text-[11px]">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block pb-1 border-b border-[#1e232e]">
                      Settlement & Payment Method Breakdown
                    </span>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>UPI Payments:</span>
                      <span className="font-bold text-white">{formatCurrency(upiSales, theme.currency)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Card Payments:</span>
                      <span className="font-bold text-white">{formatCurrency(cardSales, theme.currency)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Cash Payments:</span>
                      <span className="font-bold text-white">{formatCurrency(cashSales, theme.currency)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-[#1e232e]">
                      <span className="text-slate-400">Food Sales vs Bar Sales:</span>
                      <span className="text-slate-300">
                        {formatCurrency(fSales, theme.currency)} / {formatCurrency(bSales, theme.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-300">
                      <span className="text-slate-400">Taxes Collected:</span>
                      <span className="text-slate-300">{formatCurrency(taxAmt, theme.currency)}</span>
                    </div>
                    {discountAmt > 0 && (
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="text-slate-400">Discounts Applied:</span>
                        <span className="text-rose-400">-{formatCurrency(discountAmt, theme.currency)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Tab 2: Historical Orders Breakdown */}
            {activeHistTab === 'orders' && (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {isHistOrdersLoading ? (
                  <div className="p-6 text-center text-slate-400 font-mono text-xs">
                    Loading historical order receipts...
                  </div>
                ) : historicalOrders.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 font-mono text-xs bg-[#0e1117] rounded-xl border border-[#1e232e]">
                    No individual order receipts recorded for this historical shift.
                  </div>
                ) : (
                  historicalOrders.map((ord) => {
                    const barItems = (ord.items || []).filter((i) => getFulfillmentStation(i) === 'BAR');
                    const foodItems = (ord.items || []).filter((i) => getFulfillmentStation(i) !== 'BAR');

                    return (
                      <div
                        key={ord.id}
                        className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-2 font-mono text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{ord.orderNumber || `#${ord.id.slice(-4)}`}</span>
                            <span className="text-slate-400">Table {ord.tableNumber}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] border-[#1e232e] text-slate-300">
                              {ord.status}
                            </Badge>
                            <span className="font-bold text-emerald-400">
                              {formatCurrency(ord.totalAmount, theme.currency)}
                            </span>
                          </div>
                        </div>

                        {/* Station Breakdown */}
                        <div className="flex items-center gap-2 text-[10px]">
                          {foodItems.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                              Kitchen ({foodItems.length} items)
                            </span>
                          )}
                          {barItems.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              Bar ({barItems.length} items)
                            </span>
                          )}
                          <span className="text-slate-500 ml-auto">
                            {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Order Items summary */}
                        <div className="text-[11px] text-slate-300 divide-y divide-[#1e232e]/50 pt-1">
                          {(ord.items || []).map((it, idx) => (
                            <div key={idx} className="flex justify-between py-0.5">
                              <span>
                                {it.quantity}x {it.name}
                              </span>
                              <span className="text-slate-400">
                                {formatCurrency(it.price * it.quantity, theme.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Read-Only Footer */}
            <div className="flex justify-between items-center pt-3 border-t border-[#1e232e]">
              <span className="text-[10px] text-slate-500 font-mono">
                🔒 Security Verified: Historical ledger cannot be modified.
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedHistoricalDay(null)}
                className="border-[#1e232e] text-slate-300 hover:text-white text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
