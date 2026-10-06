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
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [selectedHistoricalDay, setSelectedHistoricalDay] = useState<BusinessDay | null>(null);
  const [precheck, setPrecheck] = useState<any>(null);
  const [isPrecheckLoading, setIsPrecheckLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [closingNotes, setClosingNotes] = useState('');
  const [forceCloseChecked, setForceCloseChecked] = useState(false);

  const restId = currentRestaurant?.id || api.getCurrentRestaurantId();

  // Load precheck whenever the modal opens or data changes
  const loadPrecheck = async () => {
    if (!restId) return;
    setIsPrecheckLoading(true);
    try {
      const data = await api.getBusinessDayPrecheck(restId);
      setPrecheck(data);
    } catch (err: any) {
      console.warn('[DayManagementView] Failed to load precheck:', err);
    } finally {
      setIsPrecheckLoading(false);
    }
  };

  useEffect(() => {
    loadPrecheck();
  }, [restId, currentBusinessDay?.id]);

  useEffect(() => {
    if (isCloseModalOpen) {
      loadPrecheck();
    }
  }, [isCloseModalOpen]);

  // Determine current day metrics
  const isDayOpen = currentBusinessDay?.status === 'OPEN';
  const openBday = currentBusinessDay;

  // Filter orders belonging to this business day
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

  const totalSales = foodSales + barSales;

  // Live counters
  const activeTablesCount = precheck?.active_tables_count ?? tables.filter((t) => t.status === 'OCCUPIED' || t.isOccupied).length;
  const activeSessionsCount = precheck?.active_sessions_count ?? 0;
  const unpaidBillsCount = precheck?.unpaid_bills_count ?? bills.filter((b) => b.status !== 'PAID' && b.status !== 'CANCELLED').length;
  const kitchenPendingCount = precheck?.uncompletedKitchenOrdersCount ?? orders.filter((o) => o.kitchenStatus === 'PENDING' || o.kitchenStatus === 'PREPARING').length;
  const barPendingCount = precheck?.uncompletedBarOrdersCount ?? orders.filter((o) => o.barStatus === 'PENDING' || o.barStatus === 'PREPARING').length;
  const waiterPendingCount = precheck?.open_waiter_requests_count ?? 0;

  // Authoritative Dates
  const currentBusinessDate = currentBusinessDay?.date || (currentBusinessDay as any)?.business_date || 'Today';
  const nextBusinessDate = (currentBusinessDay as any)?.nextBusinessDate || (currentBusinessDay as any)?.next_business_date || 'Next Operational Day';

  // Handle Close Day
  const handleConfirmCloseDay = async () => {
    if (!restId) return;
    setIsActionLoading(true);
    try {
      await api.closeBusinessDay(restId, currentUser?.name || currentUser?.email || 'Owner', {
        closingNotes,
        forceCloseActiveTables: forceCloseChecked,
        forceFinalizeOrders: forceCloseChecked,
      });
      addToast('success', 'Business Day Closed 🌅', `Operational day ${currentBusinessDate} safely sealed and archived.`);
      setIsCloseModalOpen(false);
      setClosingNotes('');
      setForceCloseChecked(false);
      await onRefreshData();
      await loadPrecheck();
    } catch (err: any) {
      addToast('error', 'Close Day Error', err?.message || 'Failed to close business day.');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handle Start / Restart Next Day
  const handleStartNextDay = async () => {
    if (!restId) return;
    setIsActionLoading(true);
    try {
      const opened = await api.openBusinessDay(restId, currentUser?.name || currentUser?.email || 'Owner');
      addToast('success', 'Business Day Started ☀️', `Operational day ${opened?.date || nextBusinessDate} is now OPEN.`);
      await onRefreshData();
      await loadPrecheck();
    } catch (err: any) {
      addToast('error', 'Start Day Error', err?.message || 'Failed to start business day.');
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
                  variant={isDayOpen ? 'success' : 'warning'}
                  className="font-mono text-[10px] px-2 py-0.5 ml-2"
                >
                  {isDayOpen ? 'STATUS: OPEN' : 'STATUS: CLOSED'}
                </Badge>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Authoritative business-day lifecycle control, operational reset, and financial summary auditing.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await onRefreshData();
              await loadPrecheck();
              addToast('info', 'Refreshed', 'Day operational counters synchronized.');
            }}
            className="border-[#1e232e] bg-[#12151b] text-slate-300 hover:text-white text-xs px-3 py-2"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isPrecheckLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          {isDayOpen ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsCloseModalOpen(true)}
              className="bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs px-4 py-2"
              icon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              CLOSE DAY
            </Button>
          ) : (
            <Button
              variant="brand"
              size="sm"
              onClick={handleStartNextDay}
              disabled={isActionLoading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-4 py-2"
              icon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              START {nextBusinessDate.toUpperCase()}
            </Button>
          )}
        </div>
      </div>

      {/* Main Operational Hero Card */}
      <Card className="bg-[#12151b] border-[#1e232e] p-6 rounded-2xl shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-6 border-b border-[#1e232e]">
          {/* Current Business Date */}
          <div className="space-y-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold block">
              Current Business Date
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold font-mono text-white tracking-tight">
                {currentBusinessDate}
              </span>
              <Badge variant={isDayOpen ? 'success' : 'outline'} className="text-[10px] font-mono">
                {isDayOpen ? 'ACTIVE DAY' : 'SEALED'}
              </Badge>
            </div>
            <p className="text-xs text-slate-400">
              {isDayOpen
                ? 'All live POS, KDS, Bar, and Table orders belong to this operational shift.'
                : 'Operational shift closed. No new customer orders will post to this day.'}
            </p>
          </div>

          {/* Opened / Closed Metadata */}
          <div className="space-y-2 border-t md:border-t-0 md:border-l border-[#1e232e] md:pl-6 pt-4 md:pt-0">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold block">
              Shift Attribution
            </span>
            <div className="space-y-1 text-xs font-mono">
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
                  {currentBusinessDay?.openedBy || 'Manager'}
                </span>
              </div>
              {!isDayOpen && currentBusinessDay?.closedAt && (
                <div className="flex justify-between items-center text-slate-300 pt-1 border-t border-[#1e232e]">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-amber-400" /> Closed At:
                  </span>
                  <span className="font-semibold text-amber-300">
                    {new Date(currentBusinessDay.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Next Business Date & Actions */}
          <div className="space-y-2 border-t md:border-t-0 md:border-l border-[#1e232e] md:pl-6 pt-4 md:pt-0">
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold block">
              Next Business Day Cycle
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-emerald-400">
                {nextBusinessDate}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              System authoritatively advances date, preserving timezone and cross-midnight rules.
            </p>
          </div>
        </div>

        {/* Operational Reset Banner if Closed */}
        {!isDayOpen && (
          <div className="p-5 rounded-xl bg-emerald-950/20 border border-emerald-800/30 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Business Day Closed Successfully
                </h4>
                <p className="text-xs text-slate-300">
                  Previous Day <span className="font-mono font-bold text-white">({currentBusinessDate})</span> is sealed.
                  Live operational tables and station queues have been cleanly reset.
                </p>
              </div>

              <Button
                variant="brand"
                onClick={handleStartNextDay}
                disabled={isActionLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 shrink-0"
                icon={<RotateCcw className="w-4 h-4" />}
              >
                START {nextBusinessDate.toUpperCase()}
              </Button>
            </div>

            {/* Checklist of what reset cleanly */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-emerald-800/30 text-[11px] font-mono text-slate-300">
              <div className="flex items-center gap-1.5 text-emerald-300">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Tables AVAILABLE
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Sessions CLOSED
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> KDS queue cleared
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Bar queue cleared
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Waiter queue reset
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Orders preserved
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Bills preserved
              </div>
              <div className="flex items-center gap-1.5 text-emerald-300">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Ledger intact
              </div>
            </div>
          </div>
        )}

        {/* Live Operational Counters (8 Cards) */}
        <div className="space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Live Station & Operational Metrics ({currentBusinessDate})
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            {/* 1. Current Sales */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Current Sales</span>
                <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-emerald-400 tracking-tight">
                {formatCurrency(totalSales, theme.currency)}
              </p>
              <span className="text-[10px] text-slate-400 block">
                Food: {formatCurrency(foodSales, theme.currency)} • Bar: {formatCurrency(barSales, theme.currency)}
              </span>
            </div>

            {/* 2. Current Orders */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Current Orders</span>
                <ShoppingBag className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {dayOrders.length}
              </p>
              <span className="text-[10px] text-slate-400 block">
                {completedOrders.length} Completed • {cancelledOrders.length} Cancelled
              </span>
            </div>

            {/* 3. Active Tables */}
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

            {/* 4. Open Sessions */}
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

            {/* 5. Unpaid Bills */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Unpaid Bills</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateTab('billing')}
                  className="h-5 px-1.5 text-[9px] border-[#1e232e] text-slate-400 hover:text-white"
                >
                  View
                </Button>
              </div>
              <p className={`text-xl sm:text-2xl font-bold tracking-tight ${unpaidBillsCount > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                {unpaidBillsCount}
              </p>
              <span className="text-[10px] text-slate-400 block">
                {unpaidBillsCount === 0 ? 'Zero pending checks' : 'Awaiting payment settlement'}
              </span>
            </div>

            {/* 6. Kitchen Pending */}
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

            {/* 7. Bar Pending */}
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

            {/* 8. Waiter Pending */}
            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-semibold">
                <span>Waiter Pending</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateTab('waiter')}
                  className="h-5 px-1.5 text-[9px] border-[#1e232e] text-slate-400 hover:text-white"
                >
                  OS
                </Button>
              </div>
              <p className={`text-xl sm:text-2xl font-bold tracking-tight ${waiterPendingCount > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
                {waiterPendingCount}
              </p>
              <span className="text-[10px] text-slate-400 block">
                Customer call requests
              </span>
            </div>
          </div>
        </div>

        {/* Precheck Warnings & Action Banner if Open */}
        {isDayOpen && precheck && !precheck.can_close_safely && (
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Active Shift Pre-Check Notice ({precheck.warnings?.length || 0} active items)
              </h5>
              <span className="text-[11px] font-mono text-amber-300/80">
                Resolve before closing day
              </span>
            </div>

            <div className="space-y-1.5">
              {precheck.blocking_reasons && precheck.blocking_reasons.length > 0 ? (
                precheck.blocking_reasons.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#0e1117]/80 border border-amber-800/20 text-xs"
                  >
                    <span className="text-slate-300 font-mono flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      {item.label}
                    </span>
                    {item.link && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onNavigateTab(item.link === '/tables' ? 'tables' : 'billing')}
                        className="h-6 px-2 text-[10px] border-amber-700/50 text-amber-300 hover:bg-amber-900/30"
                      >
                        {item.type === 'TABLE' ? 'View Table' : 'View Bill'}
                      </Button>
                    )}
                  </div>
                ))
              ) : (
                precheck.warnings?.map((w: string, idx: number) => (
                  <div key={idx} className="text-xs text-amber-200/90 font-mono flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
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
            <p>When you close an operational shift, its verified financial statement will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[#1e232e] text-slate-400 uppercase text-[10px]">
                  <th className="pb-3 px-3">Business Date</th>
                  <th className="pb-3 px-3">Status</th>
                  <th className="pb-3 px-3">Orders</th>
                  <th className="pb-3 px-3">Food Sales</th>
                  <th className="pb-3 px-3">Bar Sales</th>
                  <th className="pb-3 px-3">Total Sales</th>
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
                  const bTotalSales = bSummary.totalSales ?? (b as any).totalSales ?? (b as any).total_sales ?? 0;

                  return (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedHistoricalDay(b)}
                      className="hover:bg-[#141822]/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-3 font-bold text-white group-hover:text-emerald-400 transition-colors">
                        {b.date || (b as any).business_date}
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
                        {formatCurrency(bTotalSales, theme.currency)}
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

      {/* Confirmation Modal: Close Business Day */}
      <Modal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        title="Close Operational Business Day"
        maxWidth="md"
      >
        <div className="space-y-4 font-sans text-xs">
          {/* Notice Banner */}
          <div className="p-4 bg-amber-950/30 border border-amber-800/40 rounded-xl space-y-1.5 text-amber-200">
            <h4 className="font-bold text-sm flex items-center gap-2 text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              End of Operational Shift Confirmation
            </h4>
            <p className="text-amber-300/80 leading-relaxed">
              This action closes the business day for <span className="font-bold text-white font-mono">{currentBusinessDate}</span>.
              All active tables and table sessions will be marked available/closed.
              Historical financial records, orders, bills, and payments remain permanently preserved.
            </p>
          </div>

          {/* Operational Precheck Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
                Operational Precheck Status
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                precheck?.can_close_safely
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              }`}>
                {precheck?.can_close_safely ? '✓ All Stations Clear' : `⚠️ ${precheck?.warnings?.length || 0} Open Items`}
              </span>
            </div>

            {precheck && !precheck.can_close_safely && (
              <div className="p-3 bg-[#0e1117] rounded-xl border border-amber-800/30 space-y-2">
                <p className="text-[11px] text-amber-300/90 font-medium">
                  The following items are still active in the restaurant:
                </p>
                <div className="space-y-1 font-mono text-[11px]">
                  {precheck.warnings?.map((w: string, i: number) => (
                    <div key={i} className="text-amber-200/80 flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-amber-400" />
                      {w}
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-amber-900/30 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="forceCloseCheck"
                    checked={forceCloseChecked}
                    onChange={(e) => setForceCloseChecked(e.target.checked)}
                    className="rounded border-amber-700 text-amber-500 focus:ring-amber-500"
                  />
                  <label htmlFor="forceCloseCheck" className="text-[11px] text-slate-300 font-medium cursor-pointer">
                    Force close remaining active tables and open tickets cleanly
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Summary Box */}
          <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-2 font-mono">
            <div className="flex justify-between items-center text-slate-400 pb-2 border-b border-[#1e232e]">
              <span>Business Date:</span>
              <span className="font-bold text-white">{currentBusinessDate}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Orders Processed:</span>
              <span className="font-bold text-white">{dayOrders.length}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Food Sales:</span>
              <span className="text-emerald-400">{formatCurrency(foodSales, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Bar Sales:</span>
              <span className="text-purple-400">{formatCurrency(barSales, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400 pt-2 border-t border-[#1e232e] text-sm font-bold">
              <span className="text-white">Total Shift Sales:</span>
              <span className="text-emerald-400 text-base">{formatCurrency(totalSales, theme.currency)}</span>
            </div>
          </div>

          {/* Optional Closing Notes */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
              Closing Shift Notes (Optional)
            </label>
            <input
              type="text"
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="e.g. Clean register close, weekend evening shift"
              className="w-full px-3 py-2 bg-[#0e1117] border border-[#1e232e] rounded-xl text-xs text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-[#1e232e]">
            <Button
              variant="outline"
              onClick={() => setIsCloseModalOpen(false)}
              disabled={isActionLoading}
              className="border-[#1e232e] text-slate-300 hover:text-white text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmCloseDay}
              disabled={isActionLoading || (!precheck?.can_close_safely && !forceCloseChecked)}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4"
              icon={isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : undefined}
            >
              {isActionLoading ? 'Closing Business Day...' : 'CONFIRM & CLOSE BUSINESS DAY'}
            </Button>
          </div>
        </div>
      </Modal>

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

            {/* Financial Summary Breakdown */}
            {(() => {
              const summary = (selectedHistoricalDay.summary || {}) as any;
              const tOrders = summary.totalOrders ?? (selectedHistoricalDay as any).total_orders ?? 0;
              const fSales = summary.foodSales ?? (selectedHistoricalDay as any).food_sales ?? 0;
              const bSales = summary.barSales ?? (selectedHistoricalDay as any).bar_sales ?? 0;
              const tSales = summary.totalSales ?? (selectedHistoricalDay as any).total_sales ?? 0;
              const cashSales = summary.cashSales ?? (selectedHistoricalDay as any).cash_sales ?? 0;
              const cardSales = summary.cardSales ?? (selectedHistoricalDay as any).card_sales ?? 0;
              const upiSales = summary.upiSales ?? (selectedHistoricalDay as any).upi_sales ?? 0;
              const taxAmt = summary.taxAmount ?? (selectedHistoricalDay as any).tax_amount ?? 0;
              const discountAmt = summary.discountAmount ?? (selectedHistoricalDay as any).discount_amount ?? 0;
              const aov = summary.averageOrderValue ?? (tOrders > 0 ? tSales / tOrders : 0);

              return (
                <div className="space-y-3 font-mono">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e]">
                      <span className="text-[10px] text-slate-400 uppercase block">Total Sales</span>
                      <span className="text-base font-bold text-emerald-400 mt-1 block">
                        {formatCurrency(tSales, theme.currency)}
                      </span>
                    </div>

                    <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e]">
                      <span className="text-[10px] text-slate-400 uppercase block">Total Orders</span>
                      <span className="text-base font-bold text-white mt-1 block">
                        {tOrders}
                      </span>
                    </div>

                    <div className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e]">
                      <span className="text-[10px] text-slate-400 uppercase block">Avg Order Value</span>
                      <span className="text-base font-bold text-sky-400 mt-1 block">
                        {formatCurrency(aov, theme.currency)}
                      </span>
                    </div>
                  </div>

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
