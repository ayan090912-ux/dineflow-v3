import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  CheckCircle,
  Clock,
  UserCheck,
  RotateCcw,
  Sparkles,
  Users,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Check,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { Card, Badge, Button, Input } from '../../packages/ui';
import { api } from '../../packages/api/client';
import {
  EventAssistanceRequest,
  EventAssistanceSummary,
  EventAssistanceStatus,
  WeddingEvent,
} from '../../packages/types';

interface EventTableAssistanceTerminalProps {
  restaurantId: string;
  eventId: string;
  event?: WeddingEvent | null;
  currentStaffName?: string;
  onToast?: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

export const EventTableAssistanceTerminal: React.FC<EventTableAssistanceTerminalProps> = ({
  restaurantId,
  eventId,
  event,
  currentStaffName = 'Event Staff',
  onToast,
}) => {
  const [requests, setRequests] = useState<EventAssistanceRequest[]>([]);
  const [summary, setSummary] = useState<EventAssistanceSummary>({
    newRequestsCount: 0,
    acknowledgedCount: 0,
    inProgressCount: 0,
    completedCount: 0,
    waitingTablesCount: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'NEW' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'COMPLETED' | 'ALL'>('ACTIVE');
  const [searchTable, setSearchTable] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchAssistanceData = useCallback(async (isSilent = false) => {
    if (!restaurantId || !eventId) return;
    if (!isSilent) setRefreshing(true);
    try {
      const res = await api.getEventAssistanceRequests(restaurantId, eventId, statusFilter);
      if (res) {
        setRequests(res.requests || []);
        if (res.summary) {
          setSummary(res.summary);
        }
      }
    } catch (err: any) {
      if (!isSilent && onToast) {
        onToast('error', 'Assistance Queue Error', err.message || 'Could not fetch table assistance requests');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, eventId, statusFilter, onToast]);

  useEffect(() => {
    fetchAssistanceData();
    const interval = setInterval(() => {
      fetchAssistanceData(true);
    }, 7000);
    return () => clearInterval(interval);
  }, [fetchAssistanceData]);

  const handleUpdateStatus = async (
    requestId: string,
    targetStatus: EventAssistanceStatus,
    staffName?: string
  ) => {
    setUpdatingId(requestId);
    try {
      await api.updateEventAssistanceStatus(restaurantId, eventId, requestId, {
        status: targetStatus,
        assignedStaffName: staffName || currentStaffName,
      });
      if (onToast) {
        const actionLabel =
          targetStatus === 'ACKNOWLEDGED'
            ? 'Request claimed & acknowledged'
            : targetStatus === 'IN_PROGRESS'
            ? 'Marked in progress'
            : targetStatus === 'COMPLETED'
            ? 'Request completed'
            : 'Status updated';
        onToast('success', actionLabel, `Table assistance #${requestId.slice(-6)} updated.`);
      }
      await fetchAssistanceData(true);
    } catch (err: any) {
      if (onToast) {
        onToast('error', 'Update Failed', err.message || 'Could not update request status');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (searchTable.trim()) {
        const query = searchTable.trim().toLowerCase();
        const matchesTable = (r.tableNumber || '').toLowerCase().includes(query);
        const matchesGuest = (r.guestName || '').toLowerCase().includes(query);
        const matchesItems = (r.items || []).some((item) => (item.label || item.code || '').toLowerCase().includes(query));
        if (!matchesTable && !matchesGuest && !matchesItems) return false;
      }
      return true;
    });
  }, [requests, searchTable]);

  const formatElapsed = (dateStr?: string) => {
    if (!dateStr) return 'Just now';
    try {
      const created = new Date(dateStr).getTime();
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((now - created) / 1000));
      if (diffSec < 60) return `${diffSec}s ago`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      return `${diffHr}h ${diffMin % 60}m ago`;
    } catch {
      return dateStr;
    }
  };

  const getItemIcon = (code: string) => {
    const c = (code || '').toUpperCase();
    if (c.includes('PLATE')) return '🍽️';
    if (c.includes('NAPKIN') || c.includes('TISSUE')) return '🧻';
    if (c.includes('WATER')) return '💧';
    if (c.includes('GLASS') || c.includes('CUP')) return '🍷';
    if (c.includes('CUTLERY') || c.includes('SPOON') || c.includes('FORK') || c.includes('KNIFE')) return '🍴';
    if (c.includes('CLEAN')) return '🧹';
    if (c.includes('WAITER')) return '🛎️';
    if (c.includes('UTENSIL')) return '🥣';
    return '✨';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1c2233] pb-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Bell className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold text-white tracking-wide">
                Event Table Assistance Terminal
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Staff dispatch for guest napkins, cutlery, water, and table service — separated from kitchen food orders.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchAssistanceData()}
            disabled={refreshing}
            className="text-xs text-slate-300 border border-[#262c3e] hover:bg-[#1a2030] flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Operational Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="p-4 rounded-2xl bg-[#121520] border border-[#22293c]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">New Requests</span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{summary.newRequestsCount ?? summary.new ?? 0}</span>
            <span className="text-[10px] text-rose-400 font-medium">Requires Claim</span>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#121520] border border-[#22293c]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Acknowledged</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{summary.acknowledgedCount ?? summary.acknowledged ?? 0}</span>
            <span className="text-[10px] text-amber-400 font-medium">Assigned</span>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#121520] border border-[#22293c]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">In Progress</span>
            <UserCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{summary.inProgressCount ?? summary.inProgress ?? 0}</span>
            <span className="text-[10px] text-sky-400 font-medium">Delivering</span>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-[#121520] border border-[#22293c]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Completed</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">{summary.completedCount ?? summary.completed ?? 0}</span>
            <span className="text-[10px] text-emerald-400 font-medium">Fulfilled</span>
          </div>
        </Card>

        <Card className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-300">Waiting Tables</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-200 font-mono">{summary.waitingTablesCount ?? summary.waitingTables ?? 0}</span>
            <span className="text-[10px] text-amber-400 font-medium">Active Needs</span>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#11141e] p-3 rounded-2xl border border-[#1f2538]">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(
            [
              { key: 'ACTIVE', label: 'Active Queue' },
              { key: 'NEW', label: 'New' },
              { key: 'ACKNOWLEDGED', label: 'Acknowledged' },
              { key: 'IN_PROGRESS', label: 'In Progress' },
              { key: 'COMPLETED', label: 'Completed History' },
              { key: 'ALL', label: 'All Requests' },
            ] as const
          ).map((filter) => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                statusFilter === filter.key
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-[#1a2030]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={searchTable}
            onChange={(e) => setSearchTable(e.target.value)}
            placeholder="Search table or item..."
            className="pl-8 text-xs bg-[#161a26] border-[#262c3e] h-8 rounded-xl text-white placeholder-slate-500"
          />
        </div>
      </div>

      {/* Requests Queue Cards */}
      {loading ? (
        <div className="py-20 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Loading assistance queue...</p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <Card className="py-16 text-center rounded-2xl bg-[#11141e] border border-[#1e2335] space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <Check className="w-6 h-6" />
          </div>
          <h3 className="text-base font-serif font-bold text-white">All Clear! No Requests Waiting</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            All guest table requests in this view have been attended to. When a guest scans their table QR and taps “Request Table Assistance”, it appears here instantly.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredRequests.map((req) => {
            const isUpdating = updatingId === req.id;
            const isCompleted = req.status === 'COMPLETED';
            const isNew = req.status === 'NEW';
            const isInProg = req.status === 'IN_PROGRESS';
            const isAck = req.status === 'ACKNOWLEDGED';

            return (
              <Card
                key={req.id}
                className={`p-5 rounded-2xl border transition-all ${
                  isNew
                    ? 'bg-[#15131a] border-rose-500/40 shadow-lg shadow-rose-950/20 ring-1 ring-rose-500/30'
                    : isAck
                    ? 'bg-[#161822] border-amber-500/40 shadow-md shadow-amber-950/20'
                    : isInProg
                    ? 'bg-[#121824] border-sky-500/40 shadow-md shadow-sky-950/20'
                    : 'bg-[#10121a] border-[#1f2436] opacity-80'
                }`}
              >
                {/* Header: Table badge & Status */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider font-mono">
                        TABLE {req.tableNumber}
                      </span>
                      {req.guestName && (
                        <span className="text-xs text-slate-300 font-medium">({req.guestName})</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono mt-1">Ref: {req.id}</p>
                  </div>

                  <div className="text-right">
                    <Badge
                      variant={
                        isNew
                          ? 'danger'
                          : isAck
                          ? 'warning'
                          : isInProg
                          ? 'brand'
                          : 'success'
                      }
                      className="text-[10px] font-bold uppercase tracking-wider"
                    >
                      {req.status}
                    </Badge>
                    <p className="text-[10px] text-slate-400 mt-1 flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {formatElapsed(req.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Requested Items List */}
                <div className="mt-4 p-3 rounded-xl bg-[#0c0e16] border border-[#1a1f30] space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                    Requested Supplies & Assistance:
                  </p>
                  <div className="space-y-1.5">
                    {(req.items || req.requestItems || []).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs text-white">
                        <div className="flex items-center gap-2">
                          <span>{getItemIcon(item.code)}</span>
                          <span className="font-medium text-slate-200">{item.label || item.code}</span>
                        </div>
                        {item.quantity && item.quantity > 0 && (
                          <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-bold text-xs">
                            ×{item.quantity}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {req.guestNote && (
                    <div className="mt-2 pt-2 border-t border-[#1b2031] text-xs text-amber-300/90 italic flex items-start gap-1.5">
                      <span className="text-amber-400 font-bold not-italic">Note:</span>
                      <span>“{req.guestNote}”</span>
                    </div>
                  )}
                </div>

                {/* Assigned Staff Status */}
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400 px-1">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>
                      {req.assignedStaffName ? (
                        <span className="text-amber-300 font-medium">Claimed by {req.assignedStaffName}</span>
                      ) : (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </span>
                  </div>

                  {req.completedAt && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      Completed {formatElapsed(req.completedAt)}
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-4 pt-3 border-t border-[#1a1f30] flex items-center gap-2">
                  {isNew && (
                    <Button
                      size="sm"
                      disabled={isUpdating}
                      onClick={() => handleUpdateStatus(req.id, 'ACKNOWLEDGED')}
                      className="flex-1 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl py-2 flex items-center justify-center gap-1.5"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Claim & Acknowledge</span>
                    </Button>
                  )}

                  {isAck && (
                    <>
                      <Button
                        size="sm"
                        disabled={isUpdating}
                        onClick={() => handleUpdateStatus(req.id, 'IN_PROGRESS')}
                        className="flex-1 text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl py-2 flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Start Delivering</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isUpdating}
                        onClick={() => handleUpdateStatus(req.id, 'NEW', '')}
                        className="text-xs text-slate-400 hover:text-white border border-[#232a3d] rounded-xl px-2.5"
                        title="Release request back to unassigned queue"
                      >
                        Release
                      </Button>
                    </>
                  )}

                  {isInProg && (
                    <>
                      <Button
                        size="sm"
                        disabled={isUpdating}
                        onClick={() => handleUpdateStatus(req.id, 'COMPLETED')}
                        className="flex-1 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl py-2 flex items-center justify-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Mark Delivered & Completed</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isUpdating}
                        onClick={() => handleUpdateStatus(req.id, 'ACKNOWLEDGED')}
                        className="text-xs text-slate-400 hover:text-white border border-[#232a3d] rounded-xl px-2.5"
                      >
                        Back
                      </Button>
                    </>
                  )}

                  {isCompleted && (
                    <div className="w-full flex items-center justify-between text-xs text-slate-500 py-1">
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle className="w-4 h-4" />
                        <span>Request Fulfilled</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isUpdating}
                        onClick={() => handleUpdateStatus(req.id, 'IN_PROGRESS')}
                        className="text-[11px] text-slate-400 hover:text-white border border-[#232a3d] rounded-xl py-1 px-2.5"
                      >
                        Re-open
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
