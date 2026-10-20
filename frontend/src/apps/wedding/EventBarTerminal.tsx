import React, { useState, useMemo, useCallback } from 'react';
import {
  Wine,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
  Flame,
  Utensils,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { Card, Badge, Button, Input } from '../../packages/ui';
import { Order, MenuItem, WeddingEvent, getFulfillmentStation } from '../../packages/types';
import { cleanTableBadge } from '../restaurant/WeddingsTab';

export interface EventBarTerminalProps {
  restaurantId: string;
  eventId: string;
  event?: WeddingEvent | null;
  orders: Order[];
  menuItems?: MenuItem[];
  currentStaffName?: string;
  onUpdateStatus?: (orderId: string, status: 'ACCEPTED' | 'PREPARING' | 'READY') => Promise<void>;
  onRefresh?: () => Promise<void>;
  onToast?: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

export const EventBarTerminal: React.FC<EventBarTerminalProps> = ({
  restaurantId,
  eventId,
  event,
  orders,
  menuItems = [],
  currentStaffName = 'Bartender Staff',
  onUpdateStatus,
  onRefresh,
  onToast,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'PENDING' | 'PREPARING' | 'READY' | 'ALL'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check if restaurant / event has any eligible bar items configured
  const barCatalogItems = useMemo(() => {
    return menuItems.filter((i) => getFulfillmentStation(i) === 'BAR');
  }, [menuItems]);

  // Extract orders that have Bar items
  const barOrders = useMemo(() => {
    return orders.filter((o) => {
      const hasBarItem = (o.items || []).some((i) => getFulfillmentStation(i) === 'BAR');
      const hasBarStatus = Boolean(o.barStatus && o.barStatus !== 'NOT_REQUIRED');
      return hasBarItem || hasBarStatus;
    });
  }, [orders]);

  // Summary Metrics
  const summary = useMemo(() => {
    let pendingCount = 0;
    let preparingCount = 0;
    let readyCount = 0;
    let completedCount = 0;

    barOrders.forEach((o) => {
      const bStatus = o.barStatus || 'PENDING';
      if (bStatus === 'PENDING' || bStatus === 'ACCEPTED') pendingCount++;
      else if (bStatus === 'PREPARING') preparingCount++;
      else if (bStatus === 'READY') readyCount++;
      else if (bStatus === 'COMPLETED' || o.status === 'DELIVERED') completedCount++;
    });

    return {
      total: barOrders.length,
      pending: pendingCount,
      preparing: preparingCount,
      ready: readyCount,
      completed: completedCount,
    };
  }, [barOrders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return barOrders.filter((order) => {
      const bStatus = order.barStatus || 'PENDING';

      // Status filter
      if (statusFilter === 'ACTIVE') {
        if (bStatus === 'COMPLETED' || order.status === 'DELIVERED' || order.status === 'CANCELLED') {
          return false;
        }
      } else if (statusFilter === 'PENDING') {
        if (bStatus !== 'PENDING' && bStatus !== 'ACCEPTED') return false;
      } else if (statusFilter === 'PREPARING') {
        if (bStatus !== 'PREPARING') return false;
      } else if (statusFilter === 'READY') {
        if (bStatus !== 'READY') return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTable = (order.tableNumber || '').toLowerCase().includes(q);
        const matchesGuest = (order.customerName || order.notes || '').toLowerCase().includes(q);
        const matchesDrink = (order.items || []).some(
          (i) => getFulfillmentStation(i) === 'BAR' && (i.name || '').toLowerCase().includes(q)
        );
        if (!matchesTable && !matchesGuest && !matchesDrink) return false;
      }

      return true;
    });
  }, [barOrders, statusFilter, searchQuery]);

  const handleAdvance = async (orderId: string, nextStatus: 'ACCEPTED' | 'PREPARING' | 'READY') => {
    if (!onUpdateStatus) return;
    setUpdatingOrderId(orderId);
    try {
      await onUpdateStatus(orderId, nextStatus);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleManualRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatElapsed = (dateStr?: string) => {
    if (!dateStr) return 'Just now';
    try {
      const created = new Date(dateStr).getTime();
      const diffSec = Math.max(0, Math.floor((Date.now() - created) / 1000));
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m ago`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-purple-950/40 via-[#181324] to-[#110f1c] p-5 rounded-2xl border border-purple-500/30">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center border border-purple-500/40">
              <Wine className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                Event Bar & Beverage Terminal
                <Badge variant="outline" className="border-purple-500/40 text-purple-300 text-[10px] tracking-wider uppercase font-mono">
                  Station Live
                </Badge>
              </h1>
              <p className="text-xs text-purple-200/70">
                Authoritative drink-order queue for banquet tables. Multi-station readiness synchronized.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="text-xs border-[#2c263d] text-slate-300 hover:text-white"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-purple-400 mr-1.5" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500 mr-1.5" />}
            {soundEnabled ? 'Chime On' : 'Muted'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="text-xs border-purple-500/30 text-purple-200 hover:bg-purple-900/30"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Setup Warning if Bar enabled on event but 0 catalog items */}
      {barCatalogItems.length === 0 && (
        <div className="bg-amber-950/30 border border-amber-500/50 rounded-2xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold text-amber-200">Catalog Notice: No Beverage Items Available</h4>
            <p className="text-amber-300/80 leading-relaxed">
              Bar service is enabled for this event, but there are currently no beverage or cocktail items mapped to the Bar station in your restaurant catalog.
              Add drink items in the Event Menu tab so guests can order cocktails and refreshments from their table standee.
            </p>
          </div>
        </div>
      )}

      {/* Station KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 rounded-xl bg-[#14121f] border border-purple-900/30">
          <div className="text-[11px] font-mono uppercase tracking-wider text-purple-300/70">Pending Mixing</div>
          <div className="text-2xl font-bold font-serif text-amber-400 mt-1">{summary.pending}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Awaiting bar intake</div>
        </Card>

        <Card className="p-4 rounded-xl bg-[#14121f] border border-purple-900/30">
          <div className="text-[11px] font-mono uppercase tracking-wider text-purple-300/70">In Preparation</div>
          <div className="text-2xl font-bold font-serif text-purple-300 mt-1">{summary.preparing}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Pouring & shaker active</div>
        </Card>

        <Card className="p-4 rounded-xl bg-[#14121f] border border-purple-900/30">
          <div className="text-[11px] font-mono uppercase tracking-wider text-purple-300/70">Drinks Ready</div>
          <div className="text-2xl font-bold font-serif text-emerald-400 mt-1">{summary.ready}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">At pickup counter</div>
        </Card>

        <Card className="p-4 rounded-xl bg-[#14121f] border border-purple-900/30">
          <div className="text-[11px] font-mono uppercase tracking-wider text-purple-300/70">Total Drinks Shift</div>
          <div className="text-2xl font-bold font-serif text-white mt-1">{summary.total}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{summary.completed} delivered</div>
        </Card>
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'ACTIVE', label: 'Active Queue', count: summary.pending + summary.preparing + summary.ready },
            { id: 'PENDING', label: 'Pending', count: summary.pending },
            { id: 'PREPARING', label: 'Mixing', count: summary.preparing },
            { id: 'READY', label: 'Ready', count: summary.ready },
            { id: 'ALL', label: 'All Orders', count: summary.total },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-serif font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                statusFilter === tab.id
                  ? 'bg-purple-600 text-white font-bold shadow-md shadow-purple-900/30'
                  : 'bg-[#151322] border border-purple-900/30 text-purple-200/70 hover:text-white hover:bg-purple-950/40'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                statusFilter === tab.id ? 'bg-purple-800 text-white' : 'bg-[#1f1a33] text-purple-300'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-purple-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search table or drink..."
            className="pl-9 h-9 text-xs bg-[#13111f] border-purple-900/30 text-white placeholder:text-slate-500 rounded-xl"
          />
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="p-16 text-center bg-[#13111f] rounded-2xl border border-purple-950/40 space-y-3">
          <Wine className="w-10 h-10 text-purple-600/50 mx-auto" />
          <h3 className="text-base font-serif font-bold text-white">Bar Queue Clear</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {searchQuery
              ? `No drink orders match "${searchQuery}".`
              : 'There are no active beverage orders awaiting bar preparation right now.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const bStatus = order.barStatus || 'PENDING';
            const barItems = (order.items || []).filter((i) => getFulfillmentStation(i) === 'BAR');
            const displayItems = barItems.length > 0 ? barItems : (order.items || []);
            const isUpdating = updatingOrderId === order.id;

            // Multi-station status indicators for parent order
            const kStatus = order.kitchenStatus;
            const hStatus = order.hookahStatus;

            return (
              <Card
                key={order.id}
                className={`p-4 rounded-2xl bg-[#13111f] border transition-all space-y-4 flex flex-col justify-between ${
                  bStatus === 'READY'
                    ? 'border-emerald-500/40 bg-[#12181b]'
                    : bStatus === 'PREPARING'
                    ? 'border-purple-500/60 bg-[#171328] shadow-lg shadow-purple-950/40'
                    : 'border-amber-500/40 bg-[#17131d]'
                }`}
              >
                <div className="space-y-3">
                  {/* Top: Table & Elapsed */}
                  <div className="flex items-center justify-between border-b border-[#231d38] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-base text-white bg-purple-900/40 px-2.5 py-1 rounded-lg border border-purple-500/30">
                        Table {cleanTableBadge(order.tableNumber)}
                      </span>
                      {order.customerName && (
                        <span className="text-xs text-purple-200/80 font-medium truncate max-w-[120px]">
                          {order.customerName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-purple-400" />
                        {formatElapsed(order.createdAt)}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">#{order.id.slice(-6)}</span>
                    </div>
                  </div>

                  {/* Multi-Station Context Badge */}
                  {(kStatus || hStatus) && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                      <span className="text-slate-400">Other Stations:</span>
                      {kStatus && (
                        <span className={`px-1.5 py-0.5 rounded ${
                          kStatus === 'READY' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-[#1e1b2b] text-slate-400'
                        }`}>
                          Kitchen: {kStatus}
                        </span>
                      )}
                      {hStatus && (
                        <span className={`px-1.5 py-0.5 rounded ${
                          hStatus === 'READY' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-[#1e1b2b] text-slate-400'
                        }`}>
                          Hookah: {hStatus}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Drinks Items List */}
                  <div className="space-y-2 py-1">
                    {displayItems.map((item, idx) => (
                      <div key={idx} className="bg-[#1b172d] p-2 rounded-xl border border-purple-900/30 flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium text-white flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-purple-600/30 text-purple-300 text-xs flex items-center justify-center font-bold">
                              {item.quantity}
                            </span>
                            <span>{item.name}</span>
                          </div>
                          {item.notes && (
                            <div className="text-[11px] text-amber-300/90 pl-7 italic">
                              "{item.notes}"
                            </div>
                          )}
                        </div>

                        {item.isAlcoholic ? (
                          <span className="text-[9px] font-mono uppercase bg-purple-900/50 text-purple-300 px-1.5 py-0.5 rounded border border-purple-500/30">
                            Alcoholic
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono uppercase bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                            Beverage
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {order.notes && (
                    <div className="text-xs text-slate-400 bg-[#161224] p-2 rounded-lg border border-purple-950">
                      <span className="text-purple-400 font-medium">Guest Note:</span> {order.notes}
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="pt-2 border-t border-[#231d38] flex items-center justify-between gap-2">
                  <Badge
                    variant={
                      bStatus === 'READY' ? 'success' : bStatus === 'PREPARING' ? 'brand' : 'warning'
                    }
                    className="text-[10px] font-mono tracking-wider"
                  >
                    {bStatus === 'ACCEPTED' ? 'PENDING' : bStatus}
                  </Badge>

                  <div className="flex items-center gap-2">
                    {bStatus !== 'PREPARING' && bStatus !== 'READY' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isUpdating}
                        onClick={() => handleAdvance(order.id, 'PREPARING')}
                        className="text-xs border-purple-500/50 text-purple-200 hover:bg-purple-900/40"
                      >
                        Start Mixing
                      </Button>
                    )}

                    {bStatus === 'PREPARING' && (
                      <Button
                        size="sm"
                        variant="brand"
                        disabled={isUpdating}
                        onClick={() => handleAdvance(order.id, 'READY')}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      >
                        Drinks Ready ✓
                      </Button>
                    )}

                    {bStatus === 'READY' && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Ready for Runner
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
