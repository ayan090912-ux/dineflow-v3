import React, { useState, useMemo } from 'react';
import {
  Flame,
  Clock,
  CheckCircle,
  Search,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
  ShieldAlert,
} from 'lucide-react';
import { Card, Badge, Button, Input } from '../../packages/ui';
import { Order, MenuItem, WeddingEvent, getFulfillmentStation } from '../../packages/types';
import { cleanTableBadge } from '../restaurant/WeddingsTab';

export interface EventHookahTerminalProps {
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

export const EventHookahTerminal: React.FC<EventHookahTerminalProps> = ({
  restaurantId,
  eventId,
  event,
  orders,
  menuItems = [],
  currentStaffName = 'Hookah Master',
  onUpdateStatus,
  onRefresh,
  onToast,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'PENDING' | 'PREPARING' | 'READY' | 'ALL'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check if restaurant / event has any eligible hookah items configured
  const hookahCatalogItems = useMemo(() => {
    return menuItems.filter((i) => getFulfillmentStation(i) === 'HOOKAH');
  }, [menuItems]);

  // Extract orders that have Hookah items
  const hookahOrders = useMemo(() => {
    return orders.filter((o) => {
      const hasHookahItem = (o.items || []).some((i) => getFulfillmentStation(i) === 'HOOKAH');
      const hasHookahStatus = Boolean(o.hookahStatus && o.hookahStatus !== 'NOT_REQUIRED');
      return hasHookahItem || hasHookahStatus;
    });
  }, [orders]);

  // Summary Metrics
  const summary = useMemo(() => {
    let pendingCount = 0;
    let preparingCount = 0;
    let readyCount = 0;
    let completedCount = 0;

    hookahOrders.forEach((o) => {
      const hStatus = o.hookahStatus || 'PENDING';
      if (hStatus === 'PENDING' || hStatus === 'ACCEPTED') pendingCount++;
      else if (hStatus === 'PREPARING') preparingCount++;
      else if (hStatus === 'READY') readyCount++;
      else if (hStatus === 'COMPLETED' || o.status === 'DELIVERED') completedCount++;
    });

    return {
      total: hookahOrders.length,
      pending: pendingCount,
      preparing: preparingCount,
      ready: readyCount,
      completed: completedCount,
    };
  }, [hookahOrders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return hookahOrders.filter((order) => {
      const hStatus = order.hookahStatus || 'PENDING';

      // Status filter
      if (statusFilter === 'ACTIVE') {
        if (hStatus === 'COMPLETED' || order.status === 'DELIVERED' || order.status === 'CANCELLED') {
          return false;
        }
      } else if (statusFilter === 'PENDING') {
        if (hStatus !== 'PENDING' && hStatus !== 'ACCEPTED') return false;
      } else if (statusFilter === 'PREPARING') {
        if (hStatus !== 'PREPARING') return false;
      } else if (statusFilter === 'READY') {
        if (hStatus !== 'READY') return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTable = (order.tableNumber || '').toLowerCase().includes(q);
        const matchesGuest = (order.customerName || order.notes || '').toLowerCase().includes(q);
        const matchesFlavor = (order.items || []).some(
          (i) => getFulfillmentStation(i) === 'HOOKAH' && (i.name || '').toLowerCase().includes(q)
        );
        if (!matchesTable && !matchesGuest && !matchesFlavor) return false;
      }

      return true;
    });
  }, [hookahOrders, statusFilter, searchQuery]);

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-amber-950/40 via-[#1e1511] to-[#120f0d] p-5 rounded-2xl border border-amber-500/30">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-600/20 text-amber-400 flex items-center justify-center border border-amber-500/40">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                Event Hookah & Shisha Lounge Terminal
                <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] tracking-wider uppercase font-mono">
                  Lounge Queue Live
                </Badge>
              </h1>
              <p className="text-xs text-amber-200/70">
                Live charcoal heating and tobacco preparation queue for banquet tables. Multi-station synchronized.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="text-xs border-[#3a281d] text-slate-300 hover:text-white"
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400 mr-1.5" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500 mr-1.5" />}
            {soundEnabled ? 'Chime On' : 'Muted'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="text-xs border-amber-500/30 text-amber-200 hover:bg-amber-900/30"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Setup Warning if Hookah enabled on event but 0 catalog items */}
      {hookahCatalogItems.length === 0 && (
        <div className="bg-amber-950/30 border border-amber-500/50 rounded-2xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <h4 className="font-bold text-amber-200">Catalog Notice: No Shisha Flavors Available</h4>
            <p className="text-amber-300/80 leading-relaxed">
              Hookah & Shisha service is enabled for this event, but there are currently no hookah flavor items in your catalog.
              Add shisha flavors in the Event Menu tab so guests can order hookah service from their banquet table standee.
            </p>
          </div>
        </div>
      )}

      {/* Station KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 rounded-xl bg-[#18120e] border border-amber-900/30">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-300/70">Pending Prep</div>
          <div className="text-2xl font-bold font-serif text-amber-400 mt-1">{summary.pending}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Awaiting intake</div>
        </Card>

        <Card className="p-4 rounded-xl bg-[#18120e] border border-amber-900/30">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-300/70">Coals Heating</div>
          <div className="text-2xl font-bold font-serif text-orange-400 mt-1">{summary.preparing}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Burners & pack active</div>
        </Card>

        <Card className="p-4 rounded-xl bg-[#18120e] border border-amber-900/30">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-300/70">Ready for Table</div>
          <div className="text-2xl font-bold font-serif text-emerald-400 mt-1">{summary.ready}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Coals glowing & set</div>
        </Card>

        <Card className="p-4 rounded-xl bg-[#18120e] border border-amber-900/30">
          <div className="text-[11px] font-mono uppercase tracking-wider text-amber-300/70">Total Sessions</div>
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
            { id: 'PREPARING', label: 'Heating Coals', count: summary.preparing },
            { id: 'READY', label: 'Ready', count: summary.ready },
            { id: 'ALL', label: 'All Sessions', count: summary.total },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-serif font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                statusFilter === tab.id
                  ? 'bg-amber-600 text-white font-bold shadow-md shadow-amber-900/30'
                  : 'bg-[#181310] border border-amber-900/30 text-amber-200/70 hover:text-white hover:bg-amber-950/40'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                statusFilter === tab.id ? 'bg-amber-800 text-white' : 'bg-[#291b13] text-amber-300'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search table or flavor..."
            className="pl-9 h-9 text-xs bg-[#16110e] border-amber-900/30 text-white placeholder:text-slate-500 rounded-xl"
          />
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="p-16 text-center bg-[#16110e] rounded-2xl border border-amber-950/40 space-y-3">
          <Flame className="w-10 h-10 text-amber-600/50 mx-auto" />
          <h3 className="text-base font-serif font-bold text-white">Shisha Queue Clear</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {searchQuery
              ? `No shisha orders match "${searchQuery}".`
              : 'There are no active hookah orders awaiting preparation right now.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const hStatus = order.hookahStatus || 'PENDING';
            const hookahItems = (order.items || []).filter((i) => getFulfillmentStation(i) === 'HOOKAH');
            const isUpdating = updatingOrderId === order.id;

            // Multi-station status indicators for parent order
            const kStatus = order.kitchenStatus;
            const bStatus = order.barStatus;

            return (
              <Card
                key={order.id}
                className={`p-4 rounded-2xl bg-[#16110e] border transition-all space-y-4 flex flex-col justify-between ${
                  hStatus === 'READY'
                    ? 'border-emerald-500/40 bg-[#121915]'
                    : hStatus === 'PREPARING'
                    ? 'border-amber-500/60 bg-[#1f1510] shadow-lg shadow-amber-950/40'
                    : 'border-orange-500/40 bg-[#191310]'
                }`}
              >
                <div className="space-y-3">
                  {/* Top: Table & Elapsed */}
                  <div className="flex items-center justify-between border-b border-[#2b1e16] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-base text-white bg-amber-900/40 px-2.5 py-1 rounded-lg border border-amber-500/30">
                        Table {cleanTableBadge(order.tableNumber)}
                      </span>
                      {order.customerName && (
                        <span className="text-xs text-amber-200/80 font-medium truncate max-w-[120px]">
                          {order.customerName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        {formatElapsed(order.createdAt)}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">#{order.id.slice(-6)}</span>
                    </div>
                  </div>

                  {/* Multi-Station Context Badge */}
                  {(kStatus || bStatus) && (
                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                      <span className="text-slate-400">Other Stations:</span>
                      {kStatus && (
                        <span className={`px-1.5 py-0.5 rounded ${
                          kStatus === 'READY' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-[#221711] text-slate-400'
                        }`}>
                          Kitchen: {kStatus}
                        </span>
                      )}
                      {bStatus && (
                        <span className={`px-1.5 py-0.5 rounded ${
                          bStatus === 'READY' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30' : 'bg-[#221711] text-slate-400'
                        }`}>
                          Bar: {bStatus}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Hookah Items List */}
                  <div className="space-y-2 py-1">
                    {hookahItems.map((item, idx) => (
                      <div key={idx} className="bg-[#211712] p-2.5 rounded-xl border border-amber-900/30 space-y-1">
                        <div className="text-sm font-medium text-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-amber-600/30 text-amber-300 text-xs flex items-center justify-center font-bold">
                              {item.quantity}
                            </span>
                            <span>{item.name}</span>
                          </div>
                          <span className="text-[9px] font-mono uppercase bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                            Shisha Bowl
                          </span>
                        </div>
                        {item.notes && (
                          <div className="text-[11px] text-amber-300/90 pl-7 italic">
                            "{item.notes}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {order.notes && (
                    <div className="text-xs text-slate-400 bg-[#1a130f] p-2 rounded-lg border border-amber-950">
                      <span className="text-amber-400 font-medium">Guest Note:</span> {order.notes}
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="pt-2 border-t border-[#2b1e16] flex items-center justify-between gap-2">
                  <Badge
                    variant={
                      hStatus === 'READY' ? 'success' : hStatus === 'PREPARING' ? 'warning' : 'neutral'
                    }
                    className="text-[10px] font-mono tracking-wider"
                  >
                    {hStatus === 'ACCEPTED' ? 'PENDING' : hStatus}
                  </Badge>

                  <div className="flex items-center gap-2">
                    {hStatus !== 'PREPARING' && hStatus !== 'READY' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isUpdating}
                        onClick={() => handleAdvance(order.id, 'PREPARING')}
                        className="text-xs border-amber-500/50 text-amber-200 hover:bg-amber-900/40"
                      >
                        Heat Coals
                      </Button>
                    )}

                    {hStatus === 'PREPARING' && (
                      <Button
                        size="sm"
                        variant="brand"
                        disabled={isUpdating}
                        onClick={() => handleAdvance(order.id, 'READY')}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      >
                        Hookah Ready ✓
                      </Button>
                    )}

                    {hStatus === 'READY' && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Ready for Table
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
