import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RotateCcw,
  RefreshCw,
  ChefHat,
  Wine,
  Flame,
  Truck,
  Users,
  Layers,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  Plus,
  Play,
  Pause,
  Info,
  Timer,
  FileText,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Modal,
} from '../../packages/ui';
import { WeddingEvent, Order, EventTable } from '../../packages/types';
import { api } from '../../packages/api/client';

interface EventDayManagementViewProps {
  currentRestaurant: any;
  currentUser?: any;
  onNavigateTab: (tab: string) => void;
  onRefreshData?: () => Promise<void>;
  addToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

export const EventDayManagementView: React.FC<EventDayManagementViewProps> = ({
  currentRestaurant,
  currentUser,
  onNavigateTab,
  onRefreshData,
  addToast,
}) => {
  const restId = currentRestaurant?.id || api.getCurrentRestaurantId();

  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [readinessData, setReadinessData] = useState<any>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [tables, setTables] = useState<EventTable[]>([]);

  // Action states
  const [isTogglingOrdering, setIsTogglingOrdering] = useState(false);
  const [isExtensionModalOpen, setIsExtensionModalOpen] = useState(false);
  const [extensionMinutes, setExtensionMinutes] = useState(60);
  const [customEndDateTime, setCustomEndDateTime] = useState('');
  const [extensionMode, setExtensionMode] = useState<'minutes' | 'custom'>('minutes');
  const [extensionReason, setExtensionReason] = useState('');
  const [isExtending, setIsExtending] = useState(false);

  // Close service modal
  const [isCloseServiceModalOpen, setIsCloseServiceModalOpen] = useState(false);
  const [isClosingService, setIsClosingService] = useState(false);

  // 1. Load all events
  const loadEvents = async () => {
    if (!restId) return;
    setLoadingEvents(true);
    try {
      const list = await api.getWeddingEvents(restId);
      const evs = Array.isArray(list) ? list : [];
      setEvents(evs);

      // Select active event or first upcoming event if none selected
      if (evs.length > 0) {
        if (!selectedEventId || !evs.some((e) => e.id === selectedEventId)) {
          const activeEv = evs.find((e) => e.status === 'ACTIVE') || evs[0];
          setSelectedEventId(activeEv.id);
        }
      } else {
        setSelectedEventId('');
      }
    } catch (err: any) {
      console.warn('[EventDayManagementView] Failed to load events:', err);
      addToast('error', 'Failed to load events', err.message || 'Could not fetch event records.');
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [restId]);

  const selectedEvent = useMemo(() => {
    return events.find((e) => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  // 2. Load readiness and orders for selected event
  const loadEventDetails = async (eventId: string) => {
    if (!restId || !eventId) return;
    setLoadingReadiness(true);
    setLoadingOrders(true);

    try {
      const [readiness, ords, tbls] = await Promise.all([
        api.getEventReadiness(eventId, restId).catch(() => null),
        api.getEventOrders(eventId, restId).catch(() => []),
        api.getWeddingTables(restId, eventId).catch(() => []),
      ]);

      setReadinessData(readiness);
      setOrders(Array.isArray(ords) ? ords : []);
      setTables(Array.isArray(tbls) ? tbls : []);
    } catch (err) {
      console.warn('[EventDayManagementView] Failed to load event details:', err);
    } finally {
      setLoadingReadiness(false);
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadEventDetails(selectedEventId);
    } else {
      setReadinessData(null);
      setOrders([]);
      setTables([]);
    }
  }, [selectedEventId, restId]);

  // 3. Toggle ordering
  const handleToggleOrdering = async () => {
    if (!selectedEvent || isTogglingOrdering || !restId) return;
    setIsTogglingOrdering(true);
    try {
      const res = await api.toggleEventOrdering(selectedEvent.id, restId);
      const newStatus = res?.isOrderingOpen;
      addToast(
        'success',
        newStatus ? 'Guest Ordering Active' : 'Guest Ordering Paused',
        newStatus
          ? `Guests at ${selectedEvent.title} can now submit orders from table QR codes.`
          : `Ordering has been paused for ${selectedEvent.title}. Existing orders remain in prep.`
      );
      await loadEvents();
      if (selectedEvent.id) {
        await loadEventDetails(selectedEvent.id);
      }
    } catch (err: any) {
      console.error('[EventDayManagementView] Failed to toggle ordering:', err);
      addToast('error', 'Operation Failed', err.message || 'Could not toggle guest ordering status.');
    } finally {
      setIsTogglingOrdering(false);
    }
  };

  // 4. Extend service window
  const handleExtendService = async () => {
    if (!selectedEvent || !restId || isExtending) return;
    if (!extensionReason.trim()) {
      addToast('warning', 'Audit Reason Required', 'Please provide a clear reason for the service extension (e.g. speeches ran late).');
      return;
    }

    setIsExtending(true);
    try {
      const payload: any = {
        reason: extensionReason.trim(),
      };

      if (extensionMode === 'minutes') {
        payload.extensionMinutes = extensionMinutes;
      } else {
        if (!customEndDateTime) {
          addToast('warning', 'Time Required', 'Please select a valid new end date and time.');
          setIsExtending(false);
          return;
        }
        payload.newEndDatetimeUtc = new Date(customEndDateTime).toISOString();
      }

      await api.extendEventServicePeriod(selectedEvent.id, payload, restId);
      addToast(
        'success',
        'Service Window Extended',
        `Service for ${selectedEvent.title} has been extended. Audit record logged.`
      );
      setIsExtensionModalOpen(false);
      setExtensionReason('');
      await loadEvents();
      if (selectedEvent.id) {
        await loadEventDetails(selectedEvent.id);
      }
    } catch (err: any) {
      console.error('[EventDayManagementView] Failed to extend service:', err);
      addToast('error', 'Extension Failed', err.message || 'Could not extend service window.');
    } finally {
      setIsExtending(false);
    }
  };

  // 5. Close / Complete Event Service
  const handleCloseService = async () => {
    if (!selectedEvent || !restId || isClosingService) return;
    setIsClosingService(true);
    try {
      await api.updateWeddingEvent(selectedEvent.id, {
        status: 'COMPLETED',
        isOrderingOpen: false,
      }, restId);

      addToast(
        'info',
        'Event Service Closed',
        `${selectedEvent.title} service is marked completed. Guest QR ordering is closed.`
      );
      setIsCloseServiceModalOpen(false);
      await loadEvents();
      if (selectedEvent.id) {
        await loadEventDetails(selectedEvent.id);
      }
    } catch (err: any) {
      console.error('[EventDayManagementView] Failed to close service:', err);
      addToast('error', 'Close Failed', err.message || 'Could not close event service.');
    } finally {
      setIsClosingService(false);
    }
  };

  // Operational order metrics (strictly zero billing / cash settlement)
  const orderMetrics = useMemo(() => {
    const total = orders.length;
    const newCount = orders.filter((o) => o.status === 'PENDING' || o.status === 'RECEIVED').length;
    const preparingCount = orders.filter((o) => o.status === 'PREPARING' || o.status === 'READY_FOR_PICKUP').length;
    const outCount = orders.filter((o) => o.status === 'OUT_FOR_DELIVERY' || o.deliveryStatus === 'OUT_FOR_DELIVERY').length;
    const deliveredCount = orders.filter((o) => o.status === 'DELIVERED' || o.deliveryStatus === 'DELIVERED' || o.status === 'COMPLETED').length;

    return {
      total,
      newCount,
      preparingCount,
      outCount,
      deliveredCount,
    };
  }, [orders]);

  // Multi-day schedule items
  const scheduleDays = useMemo(() => {
    if (!selectedEvent) return [];
    const count = selectedEvent.serviceDays || 1;
    const startDate = new Date(selectedEvent.eventDate || Date.now());
    const days = [];

    for (let i = 0; i < count; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        dayNumber: i + 1,
        date: dateStr,
        startTime: selectedEvent.startTime || '18:00',
        endTime: selectedEvent.endTime || '23:30',
        timezone: selectedEvent.timezone || 'Asia/Kolkata',
      });
    }
    return days;
  }, [selectedEvent]);

  // Clean table badge helper
  const cleanTableBadge = (tableNumber?: string) => {
    if (!tableNumber) return '01';
    return tableNumber.replace(/^(Table|T|Banquet)\s*/i, '').trim();
  };

  return (
    <div className="space-y-6 pb-12 text-slate-100 font-sans">
      {/* ─── Luxury Header & Event Selector ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2a241b] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber-500/30 text-amber-300">
              <RotateCcw className="w-5 h-5 text-amber-400" />
            </span>
            <div>
              <h1 className="text-2xl font-bold font-serif tracking-tight text-white flex items-center gap-2">
                Event Day & Operations Schedule
              </h1>
              <p className="text-xs text-amber-200/70 font-sans">
                Real-time service controls, multi-day scheduling, station readiness & live fulfillment tracking
              </p>
            </div>
          </div>
        </div>

        {/* Event Selector & Quick Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {events.length > 0 && (
            <div className="flex items-center gap-2 bg-[#14120e] border border-amber-500/30 px-3 py-1.5 rounded-xl shadow-inner">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="bg-transparent text-xs font-serif font-bold text-amber-100 focus:outline-none cursor-pointer pr-2"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-[#181512] text-white">
                    {ev.title} ({ev.eventType || 'Event'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadEvents();
              if (selectedEventId) loadEventDetails(selectedEventId);
            }}
            className="border-amber-500/30 text-amber-200 hover:bg-amber-500/10 text-xs gap-1.5"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${loadingEvents || loadingReadiness ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          <Button
            variant="brand"
            size="sm"
            onClick={() => onNavigateTab('weddings')}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs gap-1.5 shadow-lg shadow-amber-500/20"
            icon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Event Command Center
          </Button>
        </div>
      </div>

      {/* ─── Warning / Empty State ─── */}
      {!selectedEvent && !loadingEvents && (
        <Card className="bg-[#14120e] border border-amber-500/20 p-12 text-center rounded-2xl max-w-xl mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <Calendar className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold font-serif text-white">No Event Configured</h3>
          <p className="text-xs text-amber-200/70 max-w-md mx-auto">
            Onboard your wedding, reception, or corporate banquet to open live event day management.
          </p>
          <Button
            variant="brand"
            onClick={() => onNavigateTab('weddings')}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-6 py-2.5 rounded-xl shadow-lg"
          >
            Create New Event in Command Center
          </Button>
        </Card>
      )}

      {selectedEvent && (
        <>
          {/* ─── Top Operational Status Bar ─── */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Status Card */}
            <div className="bg-gradient-to-br from-[#181512] to-[#12100d] border border-amber-500/30 rounded-2xl p-4 shadow-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80 font-bold">Event Status</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-full ${
                      selectedEvent.status === 'ACTIVE'
                        ? 'bg-emerald-400 animate-pulse'
                        : selectedEvent.status === 'SCHEDULED'
                        ? 'bg-blue-400'
                        : 'bg-slate-400'
                    }`}
                  />
                  <h3 className="text-lg font-bold font-serif text-white uppercase tracking-wide">
                    {selectedEvent.status}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {selectedEvent.isOrderingOpen ? 'QR Ordering Active' : 'QR Ordering Paused'}
                </p>
              </div>
              <div className="text-right">
                <Badge
                  variant={selectedEvent.status === 'ACTIVE' ? 'success' : 'outline'}
                  className="text-[10px] uppercase font-mono font-bold"
                >
                  {selectedEvent.eventType || 'WEDDING'}
                </Badge>
              </div>
            </div>

            {/* Service Window Card */}
            <div className="bg-gradient-to-br from-[#181512] to-[#12100d] border border-amber-500/30 rounded-2xl p-4 shadow-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80 font-bold">Service Window</p>
                <h3 className="text-base font-bold font-mono text-white mt-1">
                  {selectedEvent.startTime || '18:00'} – {selectedEvent.endTime || '23:30'}
                </h3>
                <p className="text-[11px] text-amber-300/80 font-mono mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  {selectedEvent.timezone || 'Asia/Kolkata'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-400 block">Duration</span>
                <span className="text-xs font-mono font-bold text-amber-400">
                  {selectedEvent.durationFormatted || `${selectedEvent.serviceDays || 1} Day(s)`}
                </span>
              </div>
            </div>

            {/* Banquet Tables Card */}
            <div className="bg-gradient-to-br from-[#181512] to-[#12100d] border border-amber-500/30 rounded-2xl p-4 shadow-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80 font-bold">Banquet Tables</p>
                <h3 className="text-2xl font-bold font-mono text-white mt-1">
                  {tables.length}
                </h3>
                <p className="text-[11px] text-emerald-400 font-mono mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  All QRs Generated
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-slate-400 block">Guests</span>
                <span className="text-xs font-mono font-bold text-slate-300">
                  ~{selectedEvent.estimatedGuestCount || 100} Pax
                </span>
              </div>
            </div>

            {/* Readiness Score Card */}
            <div className="bg-gradient-to-br from-[#181512] to-[#12100d] border border-amber-500/30 rounded-2xl p-4 shadow-xl flex items-center justify-between">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-amber-400/80 font-bold">Setup Readiness</p>
                <div className="flex items-center gap-2 mt-1">
                  <h3 className="text-2xl font-bold font-mono text-emerald-400">
                    {readinessData?.isFullyReady ? '8 / 8' : 'Configured'}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  {readinessData?.isFullyReady ? 'Ready for Live Service' : 'Verification In Progress'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* ─── Main Operations Grid: Service Controls & Schedule ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Service Schedule & Multi-Day Breakdown */}
            <div className="lg:col-span-2 space-y-6">
              {/* Event Information & Service Period Card */}
              <Card className="bg-[#12100d] border border-amber-500/30 p-6 rounded-2xl shadow-xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#231e17] pb-4">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                      {selectedEvent.venueName || currentRestaurant?.name || 'Grand Ballroom'}
                    </span>
                    <h2 className="text-xl font-bold font-serif text-white mt-0.5">
                      {selectedEvent.title}
                    </h2>
                    {selectedEvent.coupleNames && (
                      <p className="text-xs font-serif italic text-amber-200/80 mt-0.5">
                        Honoring {selectedEvent.coupleNames}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant={selectedEvent.isOrderingOpen ? 'outline' : 'brand'}
                      size="sm"
                      onClick={handleToggleOrdering}
                      disabled={isTogglingOrdering}
                      className={
                        selectedEvent.isOrderingOpen
                          ? 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs font-bold'
                          : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-black shadow-md shadow-emerald-500/20'
                      }
                      icon={selectedEvent.isOrderingOpen ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    >
                      {selectedEvent.isOrderingOpen ? 'Pause Guest Ordering' : 'Open Guest Ordering'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsExtensionModalOpen(true)}
                      className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10 text-xs font-bold gap-1.5"
                      icon={<Timer className="w-3.5 h-3.5 text-amber-400" />}
                    >
                      Extend Window
                    </Button>
                  </div>
                </div>

                {/* Multi-Day Schedule Breakdown */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-amber-400" />
                      Service Periods & Multi-Day Schedule ({scheduleDays.length} Period{scheduleDays.length > 1 ? 's' : ''})
                    </h4>
                    <span className="text-[11px] font-mono text-slate-400">
                      Dates: {selectedEvent.eventDate} {selectedEvent.endDate && selectedEvent.endDate !== selectedEvent.eventDate ? `to ${selectedEvent.endDate}` : ''}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {scheduleDays.map((day) => (
                      <div
                        key={day.dayNumber}
                        className="bg-[#181512] border border-amber-500/20 rounded-xl p-3.5 space-y-2 hover:border-amber-500/40 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold border border-amber-500/30">
                            Day {day.dayNumber} Service
                          </span>
                          <span className="text-xs font-mono font-bold text-white">
                            {day.date}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
                          <span>Hours:</span>
                          <span className="font-bold text-amber-200">{day.startTime} – {day.endTime}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span>Timezone:</span>
                          <span>{day.timezone}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Extension & Audit History Alert */}
                {selectedEvent.extendedAt && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-3 text-xs text-amber-200">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold text-white">
                        Service Window Extended at {new Date(selectedEvent.extendedAt).toLocaleTimeString()}
                      </p>
                      <p className="text-amber-200/80">
                        {selectedEvent.extendedReason ? `Reason: "${selectedEvent.extendedReason}"` : 'Extended by event coordinator'}
                        {selectedEvent.extendedBy ? ` · Authorized by: ${selectedEvent.extendedBy}` : ''}
                      </p>
                    </div>
                  </div>
                )}

                {/* Close Service Control Button */}
                <div className="border-t border-[#231e17] pt-4 flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    End of event service closes guest QR ordering and finalizes delivery tasks.
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCloseServiceModalOpen(true)}
                    className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs font-bold"
                  >
                    Close Event Service
                  </Button>
                </div>
              </Card>

              {/* Live Operational Order Stream (ZERO Billing, ZERO Cash Closing) */}
              <Card className="bg-[#12100d] border border-amber-500/30 p-6 rounded-2xl shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#231e17] pb-3">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold font-serif text-white uppercase tracking-wider">
                      Live Order Stream & Fulfillment Status
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-slate-400">Total: <strong className="text-white">{orderMetrics.total}</strong></span>
                    <span className="text-amber-400">In Prep: <strong className="text-amber-300">{orderMetrics.preparingCount}</strong></span>
                    <span className="text-emerald-400">Delivered: <strong className="text-emerald-300">{orderMetrics.deliveredCount}</strong></span>
                  </div>
                </div>

                {orders.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs font-mono space-y-1">
                    <p>No banquet orders placed yet for this event.</p>
                    <p className="text-[11px] text-slate-500">
                      As guests scan banquet table QR codes, tickets will stream directly to assigned stations.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {orders.slice(0, 10).map((ord) => (
                      <div
                        key={ord.id}
                        className="bg-[#181512] border border-[#262017] rounded-xl p-3 flex items-center justify-between text-xs hover:border-amber-500/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-black text-xs border border-amber-500/30">
                            Table {cleanTableBadge(ord.tableNumber)}
                          </span>
                          <div>
                            <p className="font-bold text-white font-mono">
                              #{ord.displayOrderNumber || ord.id.slice(-6)} · {ord.customerName}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {(ord.items || []).map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex items-center gap-2">
                          <Badge
                            variant={
                              ord.status === 'DELIVERED' || ord.deliveryStatus === 'DELIVERED'
                                ? 'success'
                                : ord.status === 'READY_FOR_PICKUP' || ord.status === 'READY'
                                ? 'brand'
                                : ord.status === 'OUT_FOR_DELIVERY' || ord.deliveryStatus === 'OUT_FOR_DELIVERY'
                                ? 'warning'
                                : 'outline'
                            }
                            className="text-[10px] font-mono font-bold uppercase"
                          >
                            {ord.deliveryStatus || ord.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Right Col: 8-Point Setup Checklist & Station Readiness */}
            <div className="space-y-6">
              {/* 8-Point Setup Readiness Checklist */}
              <Card className="bg-[#12100d] border border-amber-500/30 p-5 rounded-2xl shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#231e17] pb-3">
                  <h3 className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    8-Point Setup Checklist
                  </h3>
                  <Badge variant="outline" className="text-[10px] font-mono text-amber-300 border-amber-500/30">
                    AUTHORITATIVE
                  </Badge>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  {/* Point 1: Event Details */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#181512] border border-[#231e17]">
                    <span className="flex items-center gap-2 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>1. Event Details & Venue</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400">READY</span>
                  </div>

                  {/* Point 2: Catering Kitchen */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#181512] border border-[#231e17]">
                    <span className="flex items-center gap-2 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>2. Catering Kitchen</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400">CONNECTED</span>
                  </div>

                  {/* Point 3: Available Menu */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#181512] border border-[#231e17]">
                    <span className="flex items-center gap-2 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>3. Menu Catalog</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400">
                      {readinessData?.checklist?.availableMenu?.itemCount || 10}+ ITEMS
                    </span>
                  </div>

                  {/* Point 4: Event Tables */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#181512] border border-[#231e17]">
                    <span className="flex items-center gap-2 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>4. Banquet Tables</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400">
                      {tables.length} TABLES
                    </span>
                  </div>

                  {/* Point 5: QR Codes */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#181512] border border-[#231e17]">
                    <span className="flex items-center gap-2 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>5. Table QR Codes</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400">
                      {tables.length} VERIFIED
                    </span>
                  </div>

                  {/* Point 6: Station Routing */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#181512] border border-[#231e17]">
                    <span className="flex items-center gap-2 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>6. Station Routing</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400">ACTIVE</span>
                  </div>

                  {/* Point 7: Service Window */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#181512] border border-[#231e17]">
                    <span className="flex items-center gap-2 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>7. Schedule & Timezone</span>
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400">CONFIRMED</span>
                  </div>

                  {/* Point 8: Publication & Ordering */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-[#181512] border border-[#231e17]">
                    <span className="flex items-center gap-2 text-slate-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>8. Guest Ordering</span>
                    </span>
                    <span className={`text-[10px] font-bold ${selectedEvent.isOrderingOpen ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {selectedEvent.isOrderingOpen ? 'OPEN' : 'PAUSED'}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Station Readiness Status */}
              <Card className="bg-[#12100d] border border-amber-500/30 p-5 rounded-2xl shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-[#231e17] pb-3">
                  <h3 className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-400" />
                    Station Readiness
                  </h3>
                </div>

                <div className="space-y-3">
                  {/* Kitchen Station */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#181512] border border-[#231e17]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                        <ChefHat className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Kitchen KDS</p>
                        <p className="text-[10px] text-slate-400 font-mono">Food preparation queue</p>
                      </div>
                    </div>
                    <Badge variant="success" className="text-[9px] font-mono font-bold">READY</Badge>
                  </div>

                  {/* Bar Station */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#181512] border border-[#231e17]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 flex items-center justify-center">
                        <Wine className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Bar Mixology Terminal</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {currentRestaurant?.has_bar !== false ? 'Beverage & cocktail routing' : 'Disabled for this venue'}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={currentRestaurant?.has_bar !== false ? 'brand' : 'outline'}
                      className="text-[9px] font-mono font-bold"
                    >
                      {currentRestaurant?.has_bar !== false ? 'ACTIVE' : 'DISABLED'}
                    </Badge>
                  </div>

                  {/* Hookah Station */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#181512] border border-[#231e17]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                        <Flame className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Hookah & Shisha Terminal</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          {currentRestaurant?.has_hookah ? 'Lounge & charcoal station' : 'Not configured'}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={currentRestaurant?.has_hookah ? 'warning' : 'outline'}
                      className="text-[9px] font-mono font-bold"
                    >
                      {currentRestaurant?.has_hookah ? 'ACTIVE' : 'OPTIONAL'}
                    </Badge>
                  </div>

                  {/* Runner & Delivery Station */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#181512] border border-[#231e17]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Runner & Delivery Dispatch</p>
                        <p className="text-[10px] text-slate-400 font-mono">Table dispatch & fulfillment</p>
                      </div>
                    </div>
                    <Badge variant="success" className="text-[9px] font-mono font-bold">READY</Badge>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* ─── Service Extension Modal with Mandatory Audit Trail ─── */}
      <Modal
        isOpen={isExtensionModalOpen}
        onClose={() => setIsExtensionModalOpen(false)}
        title="Extend Event Service Window"
      >
        <div className="space-y-4 text-slate-100 font-sans">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200 flex items-start gap-2.5">
            <Timer className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p>
              Extensions immediately update the backend service window so banquet guest QR ordering remains open. An authoritative audit log entry will be saved with your name and reason.
            </p>
          </div>

          {/* Preset or Custom Picker */}
          <div className="space-y-2">
            <label className="text-xs font-mono font-bold text-slate-300 uppercase">Extension Duration</label>
            <div className="grid grid-cols-4 gap-2">
              {[30, 60, 90, 120].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    setExtensionMode('minutes');
                    setExtensionMinutes(mins);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition-all ${
                    extensionMode === 'minutes' && extensionMinutes === mins
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                      : 'bg-[#181512] text-slate-300 border-[#2b2419] hover:border-amber-500/40'
                  }`}
                >
                  +{mins} Mins
                </button>
              ))}
            </div>
          </div>

          {/* Mandatory Reason Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono font-bold text-slate-300 uppercase">
              Audit Reason <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Speeches ran overtime; Host requested 1 extra hour of bar service"
              value={extensionReason}
              onChange={(e) => setExtensionReason(e.target.value)}
              className="w-full bg-[#181512] border border-[#2b2419] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="pt-3 border-t border-[#231e17] flex justify-end gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExtensionModalOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={handleExtendService}
              disabled={isExtending || !extensionReason.trim()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
            >
              {isExtending ? 'Extending...' : 'Confirm Extension'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Close Service Confirmation Modal ─── */}
      <Modal
        isOpen={isCloseServiceModalOpen}
        onClose={() => setIsCloseServiceModalOpen(false)}
        title="Confirm Close Event Service"
      >
        <div className="space-y-4 text-slate-100 font-sans">
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p>
              Closing service will mark <strong>{selectedEvent?.title}</strong> as completed. Guest table QR codes will no longer accept orders.
            </p>
          </div>

          <p className="text-xs text-slate-400">
            Note: Outstanding items in the kitchen and bar queue can still be delivered by runners to complete fulfillment.
          </p>

          <div className="pt-3 border-t border-[#231e17] flex justify-end gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCloseServiceModalOpen(false)}
              className="text-xs"
            >
              Keep Service Active
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={handleCloseService}
              disabled={isClosingService}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
            >
              {isClosingService ? 'Closing...' : 'Close Service Now'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
