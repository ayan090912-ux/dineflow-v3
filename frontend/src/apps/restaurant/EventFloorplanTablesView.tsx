import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Grid,
  Plus,
  QrCode,
  Search,
  Filter,
  Users,
  UtensilsCrossed,
  Printer,
  Copy,
  Download,
  ExternalLink,
  Edit2,
  Trash2,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ChefHat,
  Truck,
  Wine,
  Flame,
  Check,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button, Card, Badge, Modal, Input } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { WeddingEvent, EventTable, Order } from '../../packages/types';

interface EventFloorplanTablesViewProps {
  currentRestaurant: any;
  activeRestaurant?: any;
  currentUser?: any;
  addToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  onNavigateToTab?: (tabId: string) => void;
}

export const EventFloorplanTablesView: React.FC<EventFloorplanTablesViewProps> = ({
  currentRestaurant,
  activeRestaurant,
  currentUser,
  addToast,
  onNavigateToTab,
}) => {
  const restaurantId = currentRestaurant?.id || activeRestaurant?.id || api.getCurrentRestaurantId() || '';

  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [tables, setTables] = useState<EventTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE_ORDERS' | 'READY' | 'IDLE'>('ALL');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  // Form states
  const [newTable, setNewTable] = useState({ tableNumber: '', tableLabel: '', capacity: 8 });
  const [editingTable, setEditingTable] = useState<EventTable | null>(null);
  const [selectedTableForDetail, setSelectedTableForDetail] = useState<EventTable | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Helper to resolve currently selected event object
  const currentEvent = useMemo(() => {
    if (!events || events.length === 0) return null;
    if (selectedEventId) {
      const found = events.find((e) => e.id === selectedEventId);
      if (found) return found;
    }
    const active = events.find((e) => e.status === 'ACTIVE');
    return active || events[0];
  }, [events, selectedEventId]);

  // Load events for this venue
  const loadEvents = useCallback(async () => {
    if (!restaurantId) return;
    try {
      const res = await api.getWeddingEvents(restaurantId).catch(() => []);
      setEvents(res || []);
      if (res && res.length > 0 && !selectedEventId) {
        const active = res.find((e: WeddingEvent) => e.status === 'ACTIVE');
        setSelectedEventId(active ? active.id : res[0].id);
      }
    } catch (err: any) {
      console.warn('[EventFloorplan] Failed to load events:', err);
    }
  }, [restaurantId, selectedEventId]);

  // Load tables & orders for selected event
  const loadTablesAndOrders = useCallback(async (eventId: string, showIndicator = true) => {
    if (!restaurantId || !eventId) {
      setTables([]);
      setOrders([]);
      setIsLoading(false);
      return;
    }
    if (showIndicator) setIsLoading(true);
    try {
      const [tList, oList] = await Promise.all([
        api.getEventTables(eventId, restaurantId).catch((err) => {
          console.warn('[EventFloorplan] getEventTables error:', err);
          return [];
        }),
        api.getEventOrders(eventId, restaurantId).catch((err) => {
          console.warn('[EventFloorplan] getEventOrders error:', err);
          return [];
        }),
      ]);
      setTables(tList || []);
      setOrders(oList || []);
    } catch (err: any) {
      console.warn('[EventFloorplan] Load error:', err);
      addToast('error', 'Tables Load Notice', err?.message || 'Failed to fetch event tables.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [restaurantId, addToast]);

  // Initial load
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // When selected event changes, load tables
  useEffect(() => {
    if (currentEvent?.id) {
      loadTablesAndOrders(currentEvent.id);
    } else {
      setIsLoading(false);
    }
  }, [currentEvent?.id, loadTablesAndOrders]);

  // Clean table badge helper
  const cleanTableBadge = (tbl: string) => {
    return (tbl || '').replace(/^Table\s*/i, '').trim();
  };

  // Construct guest ordering link for QR
  const getEventGuestUrl = (eventId: string, tableNumber: string) => {
    const slug = currentRestaurant?.publicSlug || currentRestaurant?.slug || currentRestaurant?.id || 'event';
    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1'));
    const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : '';
    const cleanNum = cleanTableBadge(tableNumber);
    if (isLocalhost) {
      return `${window.location.protocol}//${window.location.hostname}${port}/event/${eventId}?table=${encodeURIComponent(cleanNum)}`;
    }
    return `https://${slug}.dinely.food/event/${eventId}?table=${encodeURIComponent(cleanNum)}`;
  };

  // Copy link helper
  const handleCopyLink = (url: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(url);
      addToast('success', 'Link Copied ✨', 'Guest ordering link copied to clipboard.');
    }
  };

  // Download QR PNG
  const handleDownloadQR = (tableNumber: string, canvasId: string) => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) {
      addToast('warning', 'Download Notice', 'QR canvas is rendering, please try again in a moment.');
      return;
    }
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `Event_Table_${cleanTableBadge(tableNumber)}_QR.png`;
    a.click();
    addToast('success', 'QR Downloaded', `Saved QR standee for Table ${cleanTableBadge(tableNumber)}.`);
  };

  // Add single banquet table
  const handleCreateTable = async () => {
    if (!currentEvent?.id) {
      addToast('error', 'Event Required', 'Please select or create an active event first.');
      return;
    }
    const rawNum = newTable.tableNumber.trim();
    if (!rawNum) {
      addToast('error', 'Validation Error', 'Table Number (e.g. 01, 16, VIP-1) is required.');
      return;
    }

    const cleanNum = cleanTableBadge(rawNum);
    // Client-side duplicate check
    const exists = tables.some((t) => cleanTableBadge(t.tableNumber).toLowerCase() === cleanNum.toLowerCase());
    if (exists) {
      addToast('error', 'Duplicate Table', `Table "${cleanNum}" already exists in this event.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await api.createEventTable(
        currentEvent.id,
        {
          tableNumber: cleanNum,
          tableLabel: newTable.tableLabel.trim() || `Table ${cleanNum}`,
          capacity: Number(newTable.capacity) || 8,
        },
        restaurantId
      );

      if (created) {
        setTables((prev) => [...prev, created]);
        addToast('success', 'Banquet Table Created ✨', `Table ${cleanNum} added with QR code.`);
        setIsCreateModalOpen(false);
        setNewTable({ tableNumber: '', tableLabel: '', capacity: 8 });
      }
    } catch (err: any) {
      addToast('error', 'Creation Failed', err?.message || 'Could not create table.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick provision 10 tables
  const handleQuickProvision = async () => {
    if (!currentEvent?.id) return;
    setIsSubmitting(true);
    try {
      const existingNums = new Set(tables.map((t) => cleanTableBadge(t.tableNumber).toLowerCase()));
      const toAdd: string[] = [];
      let count = 1;
      while (toAdd.length < 10 && count <= 50) {
        const candidate = count < 10 ? `0${count}` : `${count}`;
        if (!existingNums.has(candidate.toLowerCase())) {
          toAdd.push(candidate);
        }
        count++;
      }

      let createdCount = 0;
      for (const num of toAdd) {
        try {
          const created = await api.createEventTable(
            currentEvent.id,
            { tableNumber: num, tableLabel: `Table ${num}`, capacity: 8 },
            restaurantId
          );
          if (created) {
            setTables((prev) => [...prev, created]);
            createdCount++;
          }
        } catch {
          // ignore individual conflict
        }
      }

      addToast('success', 'Tables Provisioned ✨', `Successfully generated ${createdCount} banquet tables with QR codes.`);
    } catch (err: any) {
      addToast('error', 'Provisioning Failed', err?.message || 'Failed to provision tables.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit table
  const handleUpdateTable = async () => {
    if (!currentEvent?.id || !editingTable) return;
    const rawNum = editingTable.tableNumber.trim();
    if (!rawNum) {
      addToast('error', 'Validation Error', 'Table Number cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await api.updateEventTable(
        currentEvent.id,
        editingTable.id,
        {
          tableNumber: cleanTableBadge(rawNum),
          tableLabel: editingTable.tableLabel?.trim() || `Table ${cleanTableBadge(rawNum)}`,
          capacity: Number(editingTable.capacity) || 8,
          isActive: editingTable.isActive !== false,
        },
        restaurantId
      );

      if (updated) {
        setTables((prev) => prev.map((t) => (t.id === editingTable.id ? updated : t)));
        if (selectedTableForDetail?.id === editingTable.id) {
          setSelectedTableForDetail(updated);
        }
        addToast('success', 'Table Updated', `Table ${updated.tableNumber} updated successfully.`);
        setIsEditModalOpen(false);
        setEditingTable(null);
      }
    } catch (err: any) {
      addToast('error', 'Update Failed', err?.message || 'Could not update table.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe delete table
  const handleDeleteTable = async (table: EventTable) => {
    if (!currentEvent?.id) return;

    // Check if table has active orders
    const cleanNum = cleanTableBadge(table.tableNumber);
    const tableOrders = orders.filter((o) => cleanTableBadge(o.tableNumber) === cleanNum);
    const activeOrders = tableOrders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');

    if (activeOrders.length > 0) {
      addToast(
        'warning',
        'Cannot Delete Table',
        `Table ${cleanNum} has ${activeOrders.length} active orders in progress. Fulfill or clear orders first.`
      );
      return;
    }

    setIsDeletingId(table.id);
    try {
      await api.deleteEventTable(currentEvent.id, table.id, restaurantId);
      setTables((prev) => prev.filter((t) => t.id !== table.id));
      if (selectedTableForDetail?.id === table.id) {
        setSelectedTableForDetail(null);
        setIsDetailModalOpen(false);
      }
      addToast('success', 'Table Removed', `Table ${cleanNum} removed from event.`);
    } catch (err: any) {
      addToast('error', 'Delete Failed', err?.message || 'Could not remove table.');
    } finally {
      setIsDeletingId(null);
    }
  };

  // Compute stats
  const totalCapacity = useMemo(() => {
    return tables.reduce((sum, t) => sum + (Number(t.capacity) || 8), 0);
  }, [tables]);

  const activeOrdersCount = useMemo(() => {
    return orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
  }, [orders]);

  const readyForDeliveryCount = useMemo(() => {
    return orders.filter((o) => o.status === 'READY' || (o.kitchenStatus === 'READY' && o.status !== 'DELIVERED')).length;
  }, [orders]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter((tbl) => {
      const cleanNum = cleanTableBadge(tbl.tableNumber);
      const label = (tbl.tableLabel || '').toLowerCase();
      const q = searchQuery.trim().toLowerCase();

      const matchesSearch = !q || cleanNum.toLowerCase().includes(q) || label.includes(q);
      if (!matchesSearch) return false;

      const tblOrders = orders.filter((o) => cleanTableBadge(o.tableNumber) === cleanNum);
      const activeTblOrders = tblOrders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
      const hasReady = activeTblOrders.some((o) => o.status === 'READY' || o.kitchenStatus === 'READY');

      if (statusFilter === 'ACTIVE_ORDERS') return activeTblOrders.length > 0;
      if (statusFilter === 'READY') return hasReady;
      if (statusFilter === 'IDLE') return activeTblOrders.length === 0;

      return true;
    });
  }, [tables, orders, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Event Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0e1117] p-5 rounded-2xl border border-[#1e232e]">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/25">
              <Grid className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Event Floorplan & Table Management
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px] uppercase font-mono">
                  Event-Only
                </Badge>
              </h2>
              <p className="text-xs text-slate-400">
                Independent banquet table tokens decoupled from daily restaurant dining. Generates dynamic QR standees with zero-payment ordering.
              </p>
            </div>
          </div>
        </div>

        {/* Event Selector & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {events.length > 0 && (
            <div className="flex items-center gap-2 bg-[#141822] px-3 py-1.5 rounded-xl border border-[#222b3b]">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none cursor-pointer"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-[#121622] text-white">
                    {ev.title} ({ev.eventDate}) — {ev.status}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (currentEvent?.id) {
                setIsRefreshing(true);
                loadTablesAndOrders(currentEvent.id, false);
              }
            }}
            disabled={isRefreshing || !currentEvent?.id}
            className="text-xs text-slate-300 hover:text-white"
            icon={<RotateCcw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPrintModalOpen(true)}
            disabled={tables.length === 0}
            className="text-xs border-[#222b3b] text-slate-200 hover:text-white"
            icon={<Printer className="w-3.5 h-3.5 text-amber-400" />}
          >
            Print Standee Sheet
          </Button>

          <Button
            variant="brand"
            size="sm"
            onClick={() => {
              setNewTable({
                tableNumber: tables.length > 0 ? `${tables.length + 1}` : '01',
                tableLabel: '',
                capacity: 8,
              });
              setIsCreateModalOpen(true);
            }}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Banquet Table
          </Button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-[#0e1117] border border-[#1e232e] p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Banquet Tables</p>
            <p className="text-xl font-bold text-white mt-1 font-mono">{tables.length}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-slate-800/60 flex items-center justify-center text-slate-300">
            <Grid className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-[#0e1117] border border-[#1e232e] p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Seating Capacity</p>
            <p className="text-xl font-bold text-amber-300 mt-1 font-mono">{totalCapacity} seats</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-[#0e1117] border border-[#1e232e] p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Active Orders</p>
            <p className="text-xl font-bold text-sky-400 mt-1 font-mono">{activeOrdersCount}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <UtensilsCrossed className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-[#0e1117] border border-[#1e232e] p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Ready for Delivery</p>
            <p className="text-xl font-bold text-emerald-400 mt-1 font-mono">{readyForDeliveryCount}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Truck className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0e1117] p-3 rounded-xl border border-[#1e232e]">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search table number or label..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#12151b] border border-[#1e232e] rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === 'ALL'
                ? 'bg-[#181d27] text-white border border-[#2d3545]'
                : 'text-slate-400 hover:text-white bg-[#12151b] border border-[#1e232e]'
            }`}
          >
            All Tables ({tables.length})
          </button>
          <button
            onClick={() => setStatusFilter('ACTIVE_ORDERS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === 'ACTIVE_ORDERS'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-sky-300 bg-[#12151b] border border-[#1e232e]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            <span>Active Orders ({activeOrdersCount})</span>
          </button>
          <button
            onClick={() => setStatusFilter('READY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === 'READY'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-emerald-300 bg-[#12151b] border border-[#1e232e]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Ready ({readyForDeliveryCount})</span>
          </button>
          <button
            onClick={() => setStatusFilter('IDLE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              statusFilter === 'IDLE'
                ? 'bg-[#181d27] text-white border border-[#2d3545]'
                : 'text-slate-400 hover:text-white bg-[#12151b] border border-[#1e232e]'
            }`}
          >
            Idle Tables
          </button>
        </div>
      </div>

      {/* Main Tables Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-16 bg-[#0e1117] rounded-2xl border border-[#1e232e]">
          <RotateCcw className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
          <p className="text-sm font-semibold text-slate-200">Loading Event Tables...</p>
          <p className="text-xs text-slate-400 mt-1">Retrieving banquet table mappings and active QR codes</p>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="p-12 text-center bg-[#0e1117] rounded-2xl border border-[#1e232e] space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
            <Grid className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {tables.length === 0 ? 'No Banquet Tables Configured' : 'No Matching Tables Found'}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              {tables.length === 0
                ? 'Provision dedicated tables for this wedding or banquet event. Each table gets a unique QR code allowing guests to order without online payment.'
                : 'No tables match the current filter or search criteria.'}
            </p>
          </div>
          {tables.length === 0 && currentEvent?.id && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="brand"
                size="sm"
                onClick={() => {
                  setNewTable({ tableNumber: '01', tableLabel: 'Table 01', capacity: 8 });
                  setIsCreateModalOpen(true);
                }}
                icon={<Plus className="w-4 h-4" />}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                Create First Table
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleQuickProvision}
                disabled={isSubmitting}
                icon={<Sparkles className="w-4 h-4 text-amber-400" />}
              >
                {isSubmitting ? 'Provisioning...' : 'Quick Provision 10 Tables'}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredTables.map((tbl) => {
            const cleanNum = cleanTableBadge(tbl.tableNumber);
            const tblOrders = orders.filter((o) => cleanTableBadge(o.tableNumber) === cleanNum);
            const activeTblOrders = tblOrders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
            const hasReady = activeTblOrders.some((o) => o.status === 'READY' || o.kitchenStatus === 'READY');
            const hasPrep = activeTblOrders.some((o) => o.status === 'PREPARING' || o.kitchenStatus === 'PREPARING');
            const guestUrl = getEventGuestUrl(currentEvent?.id || '', tbl.tableNumber);

            return (
              <div
                key={tbl.id}
                className={`group rounded-2xl p-4 border transition-all flex flex-col justify-between space-y-3 relative overflow-hidden bg-[#0e1117] hover:shadow-lg ${
                  hasReady
                    ? 'border-emerald-500/60 bg-emerald-950/20 shadow-emerald-500/10'
                    : hasPrep
                    ? 'border-amber-500/50 bg-amber-950/15'
                    : activeTblOrders.length > 0
                    ? 'border-sky-500/40 bg-sky-950/15'
                    : 'border-[#1e232e] hover:border-slate-600'
                }`}
              >
                {/* Header row: Table Number & Seats */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-base font-bold text-white font-mono">
                        Table {cleanNum}
                      </p>
                      {tbl.isActive === false && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold">
                          Disabled
                        </span>
                      )}
                    </div>
                    {tbl.tableLabel && tbl.tableLabel !== `Table ${cleanNum}` && (
                      <p className="text-[11px] text-amber-200/90 font-serif italic truncate max-w-[140px]">
                        {tbl.tableLabel}
                      </p>
                    )}
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono bg-[#141822] px-2 py-0.5 rounded-md border border-[#222b3b]">
                    {tbl.capacity || 8} seats
                  </span>
                </div>

                {/* QR Preview & Order Status Indicator */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#090b0f] border border-[#1a1f2c]">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-white p-1 rounded-lg flex items-center justify-center shrink-0">
                      <QRCodeCanvas
                        id={`qr-thumb-${tbl.id}`}
                        value={guestUrl}
                        size={32}
                        level="M"
                      />
                    </div>
                    <div className="text-[10px] space-y-0.5">
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" /> QR Active
                      </span>
                      <p className="text-slate-400 truncate max-w-[90px] font-mono">
                        {cleanNum}
                      </p>
                    </div>
                  </div>

                  {/* Order indicator */}
                  <div className="text-right">
                    {hasReady ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 animate-pulse bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                        <Truck className="w-3 h-3" /> Ready
                      </span>
                    ) : hasPrep ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                        <ChefHat className="w-3 h-3" /> Prep
                      </span>
                    ) : activeTblOrders.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/30">
                        <Clock className="w-3 h-3" /> {activeTblOrders.length} ord
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-medium">
                        Idle
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Controls */}
                <div className="flex items-center justify-between pt-1 border-t border-[#1a1f2c] gap-1">
                  <button
                    onClick={() => {
                      setSelectedTableForDetail(tbl);
                      setIsDetailModalOpen(true);
                    }}
                    className="flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-all flex items-center justify-center gap-1.5"
                    title="View QR Code & Table Orders"
                  >
                    <QrCode className="w-3 h-3" />
                    <span>View QR</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingTable({ ...tbl });
                      setIsEditModalOpen(true);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#181d27] border border-transparent hover:border-[#2d3545] transition-all"
                    title="Edit Table"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteTable(tbl)}
                    disabled={isDeletingId === tbl.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition-all"
                    title="Delete Table"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE TABLE MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add Banquet Table"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Provision an event table. An authoritative, isolated QR token is minted immediately.
          </p>

          <Input
            label="Table Number / Code *"
            placeholder="e.g. 01, 16, VIP-1"
            value={newTable.tableNumber}
            onChange={(e) => setNewTable({ ...newTable, tableNumber: e.target.value })}
          />

          <Input
            label="Table Label / Section (Optional)"
            placeholder="e.g. Groom Family, VIP Lounge"
            value={newTable.tableLabel}
            onChange={(e) => setNewTable({ ...newTable, tableLabel: e.target.value })}
          />

          <Input
            label="Seating Capacity (Guests) *"
            type="number"
            min={1}
            max={50}
            value={newTable.capacity}
            onChange={(e) => setNewTable({ ...newTable, capacity: parseInt(e.target.value) || 8 })}
          />

          <div className="p-3 rounded-xl bg-[#090b0f] border border-[#1a1f2c] text-[11px] text-slate-400 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>Guests scanning this table's QR will be bound strictly to this table number and current event.</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={handleCreateTable}
              disabled={isSubmitting || !newTable.tableNumber.trim()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
            >
              {isSubmitting ? 'Creating...' : 'Create Table & Mint QR'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* EDIT TABLE MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingTable(null);
        }}
        title={`Edit Table ${editingTable ? cleanTableBadge(editingTable.tableNumber) : ''}`}
      >
        {editingTable && (
          <div className="space-y-4">
            <Input
              label="Table Number / Code *"
              value={editingTable.tableNumber}
              onChange={(e) => setEditingTable({ ...editingTable, tableNumber: e.target.value })}
            />

            <Input
              label="Table Label / Section"
              placeholder="e.g. Bride Family"
              value={editingTable.tableLabel || ''}
              onChange={(e) => setEditingTable({ ...editingTable, tableLabel: e.target.value })}
            />

            <Input
              label="Seating Capacity"
              type="number"
              min={1}
              value={editingTable.capacity || 8}
              onChange={(e) => setEditingTable({ ...editingTable, capacity: parseInt(e.target.value) || 8 })}
            />

            <div className="flex items-center justify-between p-3 rounded-xl bg-[#090b0f] border border-[#1a1f2c]">
              <div>
                <p className="text-xs font-semibold text-white">Table Active Status</p>
                <p className="text-[10px] text-slate-400">Enable or disable guest ordering for this specific table</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTable({ ...editingTable, isActive: editingTable.isActive === false ? true : false })}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  editingTable.isActive !== false
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {editingTable.isActive !== false ? 'Active' : 'Disabled'}
              </button>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingTable(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="brand"
                size="sm"
                onClick={handleUpdateTable}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* TABLE DETAIL & QR STUDIO MODAL */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedTableForDetail(null);
        }}
        title={`Table ${selectedTableForDetail ? cleanTableBadge(selectedTableForDetail.tableNumber) : ''} — QR Studio & Orders`}
      >
        {selectedTableForDetail && currentEvent && (
          <div className="space-y-5">
            {/* Table Meta Header */}
            <div className="flex items-center justify-between bg-[#090b0f] p-3.5 rounded-xl border border-[#1a1f2c]">
              <div>
                <p className="text-sm font-bold text-white font-mono">
                  Table {cleanTableBadge(selectedTableForDetail.tableNumber)}
                </p>
                <p className="text-xs text-amber-300 font-serif italic">
                  {selectedTableForDetail.tableLabel || `Table ${cleanTableBadge(selectedTableForDetail.tableNumber)}`}
                </p>
              </div>
              <span className="text-xs text-slate-400 font-mono bg-[#141822] px-2.5 py-1 rounded-lg border border-[#222b3b]">
                {selectedTableForDetail.capacity || 8} Seats
              </span>
            </div>

            {/* QR Code Display Canvas */}
            <div className="flex flex-col items-center justify-center p-6 bg-[#07090e] rounded-2xl border border-[#181e2b] space-y-3">
              <div className="bg-white p-3 rounded-2xl shadow-xl border border-amber-300/40">
                <QRCodeCanvas
                  id={`detail-qr-canvas-${selectedTableForDetail.id}`}
                  value={getEventGuestUrl(currentEvent.id, selectedTableForDetail.tableNumber)}
                  size={190}
                  level="H"
                  marginSize={1}
                />
              </div>

              <div className="w-full text-center space-y-1">
                <p className="text-[11px] text-slate-300 font-mono break-all px-4 py-1.5 rounded-lg bg-[#0d1017] border border-[#1c2230]">
                  {getEventGuestUrl(currentEvent.id, selectedTableForDetail.tableNumber)}
                </p>
                <a
                  href={getEventGuestUrl(currentEvent.id, selectedTableForDetail.tableNumber)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 font-medium mt-1"
                >
                  <span>Open guest mobile ordering screen</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Action Buttons: Copy / Download / Print */}
              <div className="flex items-center gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyLink(getEventGuestUrl(currentEvent.id, selectedTableForDetail.tableNumber))}
                  className="text-xs"
                  icon={<Copy className="w-3.5 h-3.5 text-amber-400" />}
                >
                  Copy Link
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadQR(selectedTableForDetail.tableNumber, `detail-qr-canvas-${selectedTableForDetail.id}`)}
                  className="text-xs"
                  icon={<Download className="w-3.5 h-3.5 text-emerald-400" />}
                >
                  Download PNG
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;
                    const canvas = document.getElementById(`detail-qr-canvas-${selectedTableForDetail.id}`) as HTMLCanvasElement;
                    const qrDataUrl = canvas ? canvas.toDataURL('image/png') : '';
                    printWindow.document.write(`
                      <!DOCTYPE html>
                      <html>
                      <head>
                        <title>Table ${cleanTableBadge(selectedTableForDetail.tableNumber)} - Standee</title>
                        <style>
                          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fff; }
                          .card { border: 2px solid #111; border-radius: 16px; padding: 32px; width: 320px; text-align: center; }
                          .title { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
                          .subtitle { font-size: 13px; color: #555; margin-bottom: 20px; font-style: italic; }
                          .tbl { font-size: 32px; font-weight: 900; margin: 12px 0; letter-spacing: 1px; }
                          .qr-img { width: 200px; height: 200px; margin: 0 auto; }
                          .inst { font-size: 11px; color: #444; margin-top: 16px; line-height: 1.4; }
                        </style>
                      </head>
                      <body>
                        <div class="card">
                          <div class="title">${currentEvent.title}</div>
                          <div class="subtitle">${currentEvent.venueName || currentRestaurant?.name || 'Wedding Banquet'}</div>
                          <div class="tbl">TABLE ${cleanTableBadge(selectedTableForDetail.tableNumber)}</div>
                          <img class="qr-img" src="${qrDataUrl}" />
                          <div class="inst">Scan with your smartphone camera to order banquet food & drinks directly to your table.<br/><strong>No payment required.</strong></div>
                        </div>
                        <script>
                          window.onload = function() { window.print(); };
                        </script>
                      </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }}
                  className="text-xs"
                  icon={<Printer className="w-3.5 h-3.5 text-sky-400" />}
                >
                  Print Standee
                </Button>
              </div>
            </div>

            {/* Active Table Orders */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span>Orders for Table {cleanTableBadge(selectedTableForDetail.tableNumber)}</span>
                <span className="text-slate-400 font-mono text-[11px]">
                  {orders.filter((o) => cleanTableBadge(o.tableNumber) === cleanTableBadge(selectedTableForDetail.tableNumber)).length} orders
                </span>
              </h4>

              {orders.filter((o) => cleanTableBadge(o.tableNumber) === cleanTableBadge(selectedTableForDetail.tableNumber)).length === 0 ? (
                <div className="p-4 rounded-xl bg-[#090b0f] border border-[#1a1f2c] text-center text-xs text-slate-500">
                  No orders have been placed from this table yet.
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {orders
                    .filter((o) => cleanTableBadge(o.tableNumber) === cleanTableBadge(selectedTableForDetail.tableNumber))
                    .map((ord) => (
                      <div
                        key={ord.id}
                        className="p-3 rounded-xl bg-[#090b0f] border border-[#1a1f2c] flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-white">#{ord.id.slice(-6).toUpperCase()}</span>
                            <span className="text-[10px] text-slate-400">{ord.guestName || 'Event Guest'}</span>
                          </div>
                          <p className="text-[11px] text-slate-300 mt-0.5">
                            {ord.items?.map((i) => `${i.quantity}x ${i.name}`).join(', ') || 'No items listed'}
                          </p>
                        </div>

                        <div className="text-right">
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-mono ${
                              ord.status === 'DELIVERED' || ord.status === 'COMPLETED'
                                ? 'border-purple-500/40 text-purple-300 bg-purple-500/10'
                                : ord.status === 'READY'
                                ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10 animate-pulse'
                                : 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                            }`}
                          >
                            {ord.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* PRINT BATCH STANDEES MODAL */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title="Print Banquet Standee Sheet"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300">
            Preview standees for all {tables.length} tables in {currentEvent?.title}. Click "Print Full Sheet" to send them to your printer.
          </p>

          <div className="grid grid-cols-2 gap-3 max-h-72 overflow-y-auto p-2 bg-[#090b0f] rounded-xl border border-[#1a1f2c]">
            {tables.map((tbl) => (
              <div key={tbl.id} className="p-3 bg-white text-slate-950 rounded-xl text-center space-y-2 border border-slate-300">
                <p className="text-xs font-bold uppercase truncate">{currentEvent?.title}</p>
                <p className="text-lg font-black font-mono">TABLE {cleanTableBadge(tbl.tableNumber)}</p>
                <div className="flex justify-center">
                  <QRCodeCanvas
                    id={`batch-qr-${tbl.id}`}
                    value={getEventGuestUrl(currentEvent?.id || '', tbl.tableNumber)}
                    size={90}
                    level="M"
                  />
                </div>
                <p className="text-[9px] text-slate-600 font-medium">Scan to order banquet dishes</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsPrintModalOpen(false)}>
              Close
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                const printWindow = window.open('', '_blank');
                if (!printWindow) return;
                const cardsHtml = tables
                  .map((tbl) => {
                    const canvas = document.getElementById(`batch-qr-${tbl.id}`) as HTMLCanvasElement;
                    const qrDataUrl = canvas ? canvas.toDataURL('image/png') : '';
                    return `
                    <div class="card">
                      <div class="title">${currentEvent?.title || 'Wedding Event'}</div>
                      <div class="venue">${currentEvent?.venueName || currentRestaurant?.name || 'Banquet Dining'}</div>
                      <div class="table-badge">TABLE ${cleanTableBadge(tbl.tableNumber)}</div>
                      ${tbl.tableLabel ? `<div class="table-label">${tbl.tableLabel}</div>` : ''}
                      <img class="qr-img" src="${qrDataUrl}" />
                      <div class="inst">Scan with smartphone camera to view menu and order.<br/><strong>Complimentary Hospitality — No Payment</strong></div>
                    </div>
                  `;
                  })
                  .join('');

                printWindow.document.write(`
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <title>${currentEvent?.title} - Table Standees</title>
                    <style>
                      @page { size: A4; margin: 15mm; }
                      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; background: #fff; color: #111; }
                      .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; page-break-inside: avoid; }
                      .card { border: 2px solid #222; border-radius: 14px; padding: 24px; text-align: center; box-sizing: border-box; page-break-inside: avoid; break-inside: avoid; margin-bottom: 16px; }
                      .title { font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
                      .venue { font-size: 12px; color: #555; margin-top: 2px; margin-bottom: 12px; }
                      .table-badge { font-size: 28px; font-weight: 900; letter-spacing: 1px; margin: 8px 0 4px 0; }
                      .table-label { font-size: 12px; font-style: italic; color: #777; margin-bottom: 10px; }
                      .qr-img { width: 160px; height: 160px; margin: 0 auto; }
                      .inst { font-size: 11px; color: #444; margin-top: 12px; line-height: 1.4; }
                    </style>
                  </head>
                  <body>
                    <div class="sheet">
                      ${cardsHtml}
                    </div>
                    <script>
                      window.onload = function() { window.print(); };
                    </script>
                  </body>
                  </html>
                `);
                printWindow.document.close();
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              icon={<Printer className="w-3.5 h-3.5" />}
            >
              Print Full Sheet
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EventFloorplanTablesView;
