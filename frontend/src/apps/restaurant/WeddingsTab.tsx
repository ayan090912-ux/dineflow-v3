import React, { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { api } from '../../packages/api/client';
import { WeddingEvent, EventTable, Restaurant, Order, MenuCategory, MenuItem } from '../../packages/types';
import { Modal } from '../../packages/ui/Modal';
import { Button } from '../../packages/ui/Button';
import { Badge } from '../../packages/ui/Badge';
import {
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Users,
  QrCode,
  Printer,
  Download,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Eye,
  Share2,
  ChevronRight,
  ChevronLeft,
  X,
  UtensilsCrossed,
  DollarSign,
  Heart,
  GlassWater,
  Copy,
  ExternalLink,
  ShieldCheck,
  Search
} from 'lucide-react';

interface WeddingsTabProps {
  currentRestaurant: Restaurant | null;
  currentUser: any;
  addToast?: (toast: { type: 'success' | 'error' | 'info'; title: string; message?: string }) => void;
}

const THEME_OPTIONS = [
  { id: 'champagne', name: 'Champagne & Gold', bg: 'bg-[#fcfaf7]', accent: '#d4af37', text: 'text-amber-800', border: 'border-amber-300' },
  { id: 'ivory_gold', name: 'Ivory Elegance', bg: 'bg-[#fffef8]', accent: '#c5a059', text: 'text-amber-900', border: 'border-yellow-300' },
  { id: 'blush_rose', name: 'Blush & Rose', bg: 'bg-[#fff5f6]', accent: '#e07a86', text: 'text-rose-900', border: 'border-rose-300' },
  { id: 'emerald_elegance', name: 'Emerald Velvet', bg: 'bg-[#06241b]', accent: '#10b981', text: 'text-emerald-300', border: 'border-emerald-500' },
  { id: 'burgundy_velvet', name: 'Royal Burgundy', bg: 'bg-[#290812]', accent: '#e2b868', text: 'text-amber-200', border: 'border-rose-900' },
  { id: 'midnight_navy', name: 'Midnight Starlight', bg: 'bg-[#0a1128]', accent: '#93c5fd', text: 'text-sky-200', border: 'border-sky-800' },
];

export const WeddingsTab: React.FC<WeddingsTabProps> = ({ currentRestaurant, currentUser, addToast }) => {
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DRAFT' | 'PAUSED' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Creation/Edit Wizard Modal State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Wizard Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formCoupleNames, setFormCoupleNames] = useState('');
  const [formEventType, setFormEventType] = useState('WEDDING');
  const [formEventDate, setFormEventDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('18:00');
  const [formEndTime, setFormEndTime] = useState('23:30');
  const [formVenueName, setFormVenueName] = useState('');
  const [formWelcomeMessage, setFormWelcomeMessage] = useState('');
  const [formThemeColor, setFormThemeColor] = useState('champagne');
  const [formStatus, setFormStatus] = useState<'DRAFT' | 'ACTIVE'>('ACTIVE');
  const [formMenuSelectionType, setFormMenuSelectionType] = useState<'FULL_MENU' | 'RESTRICTED'>('FULL_MENU');
  const [formAllowedCategoryIds, setFormAllowedCategoryIds] = useState<string[]>([]);
  const [formAllowedItemIds, setFormAllowedItemIds] = useState<string[]>([]);
  const [formEstimatedGuestCount, setFormEstimatedGuestCount] = useState(100);
  const [formTableCount, setFormTableCount] = useState(10);
  const [formNotes, setFormNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Restaurant Menu Data (for Restricted Menu Step)
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // Tables & QR Studio Modal State
  const [selectedEventForTables, setSelectedEventForTables] = useState<WeddingEvent | null>(null);
  const [eventTables, setEventTables] = useState<EventTable[]>([]);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableLabel, setNewTableLabel] = useState('');
  const [newTableCapacity, setNewTableCapacity] = useState(8);
  const [isAddingTable, setIsAddingTable] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Live Orders Modal State
  const [selectedEventForOrders, setSelectedEventForOrders] = useState<WeddingEvent | null>(null);
  const [eventOrders, setEventOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Load events
  const loadEvents = async () => {
    if (!currentRestaurant?.id) return;
    setLoading(true);
    try {
      const data = await api.getEvents(currentRestaurant.id);
      setEvents(data);
    } catch (err: any) {
      console.error('Failed to load wedding events:', err);
      if (addToast) {
        addToast({ type: 'error', title: 'Failed to load events', message: err.message });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [currentRestaurant?.id]);

  // Load Menu items when wizard opens
  useEffect(() => {
    if (isWizardOpen && currentRestaurant?.id) {
      api.getCategories(currentRestaurant.id).then(setMenuCategories).catch(() => {});
      api.getMenuItems(currentRestaurant.id).then(setMenuItems).catch(() => {});
    }
  }, [isWizardOpen, currentRestaurant?.id]);

  // Open Wizard for new event
  const handleOpenNewWizard = () => {
    setEditingEventId(null);
    setWizardStep(1);
    setFormTitle('');
    setFormCoupleNames('');
    setFormEventType('WEDDING');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
    setFormEventDate(tomorrow.toISOString().split('T')[0]);
    setFormStartTime('18:00');
    setFormEndTime('23:30');
    setFormVenueName(currentRestaurant?.name || '');
    setFormWelcomeMessage('Welcome to our wedding banquet! Scan the QR code at your table to explore our curated dishes and place your dining order.');
    setFormThemeColor('champagne');
    setFormStatus('ACTIVE');
    setFormMenuSelectionType('FULL_MENU');
    setFormAllowedCategoryIds([]);
    setFormAllowedItemIds([]);
    setFormEstimatedGuestCount(100);
    setFormTableCount(10);
    setFormNotes('');
    setIsWizardOpen(true);
  };

  // Open Wizard for edit
  const handleOpenEditWizard = (ev: WeddingEvent) => {
    setEditingEventId(ev.id);
    setWizardStep(1);
    setFormTitle(ev.title);
    setFormCoupleNames(ev.coupleNames || '');
    setFormEventType(ev.eventType || 'WEDDING');
    setFormEventDate(ev.eventDate);
    setFormStartTime(ev.startTime || '18:00');
    setFormEndTime(ev.endTime || '23:30');
    setFormVenueName(ev.venueName || '');
    setFormWelcomeMessage(ev.welcomeMessage || '');
    setFormThemeColor(ev.themeColor || 'champagne');
    setFormStatus(ev.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE');
    setFormMenuSelectionType(ev.menuSelectionType || 'FULL_MENU');
    setFormAllowedCategoryIds(ev.allowedCategoryIds || []);
    setFormAllowedItemIds(ev.allowedItemIds || []);
    setFormEstimatedGuestCount(ev.estimatedGuestCount || 100);
    setFormTableCount(ev.tableCount || 5);
    setFormNotes(ev.notes || '');
    setIsWizardOpen(true);
  };

  // Save Event from Wizard
  const handleSaveWizard = async () => {
    if (!currentRestaurant?.id || !formTitle || !formEventDate) return;
    setIsSaving(true);
    try {
      const payload: any = {
        title: formTitle.trim(),
        coupleNames: formCoupleNames.trim(),
        eventType: formEventType,
        eventDate: formEventDate,
        startTime: formStartTime,
        endTime: formEndTime,
        venueName: formVenueName.trim(),
        welcomeMessage: formWelcomeMessage.trim(),
        themeColor: formThemeColor,
        status: formStatus,
        isOrderingOpen: true,
        menuSelectionType: formMenuSelectionType,
        allowedCategoryIds: formAllowedCategoryIds,
        allowedItemIds: formAllowedItemIds,
        estimatedGuestCount: Number(formEstimatedGuestCount) || 100,
        notes: formNotes.trim(),
      };

      if (editingEventId) {
        await api.updateEvent(editingEventId, payload, currentRestaurant.id);
        if (addToast) addToast({ type: 'success', title: 'Event updated successfully' });
      } else {
        payload.tableCount = Number(formTableCount) || 10;
        await api.createEvent(payload, currentRestaurant.id);
        if (addToast) addToast({ type: 'success', title: 'Event created with tables provisioned' });
      }
      setIsWizardOpen(false);
      await loadEvents();
    } catch (err: any) {
      console.error('Save event failed:', err);
      if (addToast) addToast({ type: 'error', title: 'Save failed', message: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Quick toggle ordering
  const handleToggleOrdering = async (ev: WeddingEvent) => {
    if (!currentRestaurant?.id) return;
    try {
      const res = await api.toggleEventOrdering(ev.id, currentRestaurant.id);
      setEvents((prev) =>
        prev.map((e) => (e.id === ev.id ? { ...e, isOrderingOpen: res.isOrderingOpen } : e))
      );
      if (addToast) {
        addToast({
          type: res.isOrderingOpen ? 'success' : 'info',
          title: res.isOrderingOpen ? 'Ordering is now LIVE' : 'Ordering PAUSED',
          message: `Guest dining for "${ev.title}" is now ${res.isOrderingOpen ? 'OPEN' : 'PAUSED'}.`,
        });
      }
    } catch (err: any) {
      if (addToast) addToast({ type: 'error', title: 'Failed to toggle ordering', message: err.message });
    }
  };

  // Delete event
  const handleDeleteEvent = async (ev: WeddingEvent) => {
    if (!currentRestaurant?.id) return;
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${ev.title}"? All event tables and guest QR codes will be permanently removed.`
    );
    if (!confirmDelete) return;

    try {
      await api.deleteEvent(ev.id, currentRestaurant.id);
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
      if (addToast) addToast({ type: 'success', title: 'Event deleted' });
    } catch (err: any) {
      if (addToast) addToast({ type: 'error', title: 'Delete failed', message: err.message });
    }
  };

  // Open Tables Modal
  const handleOpenTablesModal = async (ev: WeddingEvent) => {
    if (!currentRestaurant?.id) return;
    setSelectedEventForTables(ev);
    try {
      const fullEv = await api.getEvent(ev.id, currentRestaurant.id);
      setEventTables(fullEv.tables || []);
    } catch (e) {
      console.error('Failed to load event tables:', e);
    }
  };

  // Add Table to Event
  const handleAddTable = async () => {
    if (!currentRestaurant?.id || !selectedEventForTables || !newTableNumber.trim()) return;
    setIsAddingTable(true);
    try {
      const created = await api.addEventTable(
        selectedEventForTables.id,
        {
          tableNumber: newTableNumber.trim(),
          tableLabel: newTableLabel.trim() || undefined,
          capacity: Number(newTableCapacity) || 8,
        },
        currentRestaurant.id
      );
      setEventTables((prev) => [...prev, created]);
      setNewTableNumber('');
      setNewTableLabel('');
      if (addToast) addToast({ type: 'success', title: `Table ${created.tableNumber} added` });
    } catch (err: any) {
      if (addToast) addToast({ type: 'error', title: 'Failed to add table', message: err.message });
    } finally {
      setIsAddingTable(false);
    }
  };

  // Delete Table from Event
  const handleDeleteTable = async (tableId: string) => {
    if (!currentRestaurant?.id || !selectedEventForTables) return;
    try {
      await api.deleteEventTable(selectedEventForTables.id, tableId, currentRestaurant.id);
      setEventTables((prev) => prev.filter((t) => t.id !== tableId));
      if (addToast) addToast({ type: 'success', title: 'Table deleted' });
    } catch (err: any) {
      if (addToast) addToast({ type: 'error', title: 'Failed to delete table', message: err.message });
    }
  };

  // Open Live Orders Modal
  const handleOpenOrdersModal = async (ev: WeddingEvent) => {
    if (!currentRestaurant?.id) return;
    setSelectedEventForOrders(ev);
    setLoadingOrders(true);
    try {
      const orders = await api.getEventOrders(ev.id, currentRestaurant.id);
      setEventOrders(orders);
    } catch (err: any) {
      console.error('Failed to load event orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Helper to construct guest link
  const getEventGuestUrl = (eventId: string, tableNumber: string) => {
    const slug = currentRestaurant?.publicSlug || currentRestaurant?.slug || currentRestaurant?.id || 'event';
    const isLocalhost = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
    const port = window.location.port ? `:${window.location.port}` : '';
    if (isLocalhost) {
      return `${window.location.protocol}//${window.location.hostname}${port}/event/${eventId}?table=${encodeURIComponent(tableNumber)}`;
    }
    return `https://${slug}.dinely.food/event/${eventId}?table=${encodeURIComponent(tableNumber)}`;
  };

  // Download QR as PNG
  const handleDownloadQR = (tableNumber: string, canvasId: string) => {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `Wedding_Table_${tableNumber}_QR.png`;
    a.click();
  };

  // Copy link to clipboard
  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    if (addToast) addToast({ type: 'success', title: 'Link copied to clipboard' });
  };

  // Filtered Events
  const filteredEvents = events.filter((ev) => {
    if (statusFilter !== 'ALL' && ev.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (ev.title || '').toLowerCase().includes(q);
      const matchCouple = (ev.coupleNames || '').toLowerCase().includes(q);
      const matchVenue = (ev.venueName || '').toLowerCase().includes(q);
      if (!matchTitle && !matchCouple && !matchVenue) return false;
    }
    return true;
  });

  // Calculate High-Level Metrics
  const totalEventsCount = events.length;
  const activeEventsCount = events.filter((e) => e.status === 'ACTIVE').length;
  const totalTablesCount = events.reduce((acc, e) => acc + (e.tableCount || 0), 0);
  const totalOrdersCount = events.reduce((acc, e) => acc + (e.orderCount || 0), 0);
  const totalRevenueSum = events.reduce((acc, e) => acc + (e.totalRevenue || 0), 0);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner / KPIs */}
      <div className="bg-gradient-to-r from-[#181d28] via-[#1b2234] to-[#161a24] border border-[#2d3748] rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-2 rounded-xl bg-gradient-to-tr from-amber-500/20 to-yellow-500/10 text-amber-300 border border-amber-500/30">
                <Sparkles className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2 font-serif">
                Weddings & Luxury Events
                <span className="text-[11px] font-sans font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  ENTERPRISE MODULE
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Curate bespoke luxury dining banquets, wedding receptions, and private galas. Auto-provision dedicated event tables, generate print-ready QR standees decoupled from daily dining, and deliver a seamless guest ordering experience.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="brand"
              onClick={handleOpenNewWizard}
              className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-semibold shadow-lg shadow-amber-500/20 px-4 py-2.5 text-xs flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Event</span>
            </Button>
          </div>
        </div>

        {/* 5 KPI Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-[#262f40]">
          <div className="bg-[#10141d]/80 border border-[#202838] rounded-xl p-3.5">
            <p className="text-[11px] font-mono text-slate-400 uppercase">Total Banquets</p>
            <p className="text-xl font-bold text-white mt-1">{totalEventsCount}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Recorded in database</p>
          </div>
          <div className="bg-[#10141d]/80 border border-emerald-500/20 rounded-xl p-3.5">
            <p className="text-[11px] font-mono text-emerald-400 uppercase flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              Live & Active
            </p>
            <p className="text-xl font-bold text-emerald-400 mt-1">{activeEventsCount}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Accepting guest orders</p>
          </div>
          <div className="bg-[#10141d]/80 border border-[#202838] rounded-xl p-3.5">
            <p className="text-[11px] font-mono text-slate-400 uppercase">Dedicated Tables</p>
            <p className="text-xl font-bold text-sky-400 mt-1">{totalTablesCount}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Decoupled QR tables</p>
          </div>
          <div className="bg-[#10141d]/80 border border-[#202838] rounded-xl p-3.5">
            <p className="text-[11px] font-mono text-slate-400 uppercase">Event Orders</p>
            <p className="text-xl font-bold text-purple-400 mt-1">{totalOrdersCount}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Processed by KDS</p>
          </div>
          <div className="bg-[#10141d]/80 border border-amber-500/20 rounded-xl p-3.5">
            <p className="text-[11px] font-mono text-amber-400 uppercase">Event Revenue</p>
            <p className="text-xl font-bold text-amber-400 mt-1">₹{totalRevenueSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">All wedding orders</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#11151e] border border-[#1e2533] p-3 rounded-xl">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['ALL', 'ACTIVE', 'DRAFT', 'PAUSED', 'COMPLETED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#161c27]'
              }`}
            >
              {st === 'ALL' ? 'All Events' : st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search couple, title, venue..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Events List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-mono">Loading wedding banquets...</p>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-[#121620] border border-[#1e2533] rounded-2xl p-12 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center justify-center mx-auto">
            <Heart className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">No Wedding Events Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              {searchQuery
                ? 'No events match your current search query. Try searching for a different couple name or title.'
                : 'Host elegant wedding banquets and galas with dedicated tables and personalized menus.'}
            </p>
          </div>
          <Button
            variant="brand"
            size="sm"
            onClick={handleOpenNewWizard}
            className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs"
          >
            Create Your First Wedding Event
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredEvents.map((ev) => {
            const themeConfig = THEME_OPTIONS.find((t) => t.id === ev.themeColor) || THEME_OPTIONS[0];
            const isLive = ev.status === 'ACTIVE' && ev.isOrderingOpen;

            return (
              <div
                key={ev.id}
                className="bg-[#131722] border border-[#212a3a] hover:border-amber-500/40 rounded-2xl p-5 shadow-lg transition-all flex flex-col justify-between space-y-4"
              >
                <div>
                  {/* Card Header: Type, Status, Ordering Toggle */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {ev.eventType}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                          ev.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : ev.status === 'DRAFT'
                            ? 'bg-slate-700/40 text-slate-300 border border-slate-600'
                            : ev.status === 'PAUSED'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}
                      >
                        {ev.status}
                      </span>
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] bg-[#1a202d] text-slate-300 border border-[#2a3447]">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: themeConfig.accent }} />
                        <span>{themeConfig.name}</span>
                      </div>
                    </div>

                    {/* Quick Ordering Toggle Button */}
                    <button
                      onClick={() => handleToggleOrdering(ev)}
                      title="Toggle Live Ordering"
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                        ev.isOrderingOpen
                          ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${ev.isOrderingOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                      <span>{ev.isOrderingOpen ? 'Ordering Open' : 'Ordering Paused'}</span>
                    </button>
                  </div>

                  {/* Title & Couple */}
                  <div className="mt-3">
                    <h3 className="text-base font-bold text-white font-serif tracking-tight">{ev.title}</h3>
                    {ev.coupleNames && (
                      <p className="text-xs text-amber-200/90 font-serif italic mt-0.5">
                        In honor of {ev.coupleNames}
                      </p>
                    )}
                  </div>

                  {/* Date, Time, Venue Meta */}
                  <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span>{ev.eventDate}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span>{ev.startTime} - {ev.endTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <MapPin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="truncate">{ev.venueName || currentRestaurant?.name || 'Grand Ballroom'}</span>
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-3 gap-2 mt-4 bg-[#0d1017] p-2.5 rounded-xl border border-[#1b2230] text-center">
                    <div>
                      <p className="text-[10px] font-mono text-slate-400 uppercase">Tables</p>
                      <p className="text-sm font-bold text-white mt-0.5">{ev.tableCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono text-slate-400 uppercase">Orders</p>
                      <p className="text-sm font-bold text-purple-300 mt-0.5">{ev.orderCount || 0}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-mono text-slate-400 uppercase">Total Revenue</p>
                      <p className="text-sm font-bold text-emerald-400 mt-0.5">₹{(ev.totalRevenue || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-[#1e2533] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenTablesModal(ev)}
                      className="text-xs bg-[#171c26] hover:bg-[#1f2635] border-[#293244] text-slate-200 flex items-center gap-1.5 h-8 px-2.5"
                    >
                      <QrCode className="w-3.5 h-3.5 text-amber-400" />
                      <span>Tables & QR Studio</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenOrdersModal(ev)}
                      className="text-xs bg-[#171c26] hover:bg-[#1f2635] border-[#293244] text-slate-200 flex items-center gap-1.5 h-8 px-2.5"
                    >
                      <UtensilsCrossed className="w-3.5 h-3.5 text-purple-400" />
                      <span>Orders ({ev.orderCount || 0})</span>
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditWizard(ev)}
                      title="Edit Event"
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-[#1c2230] rounded-lg transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteEvent(ev)}
                      title="Delete Event"
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5-STEP EVENT CREATION & EDITING WIZARD MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        title={editingEventId ? 'Edit Wedding & Banquet Details' : 'Guided Wedding & Event Creator'}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* Wizard Step Progress Bar */}
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { num: 1, label: 'Details' },
              { num: 2, label: 'Theme' },
              { num: 3, label: 'Menu' },
              { num: 4, label: 'Tables' },
              { num: 5, label: 'Review' },
            ].map((st) => (
              <button
                key={st.num}
                onClick={() => setWizardStep(st.num)}
                className={`py-2 px-1 text-center rounded-lg transition-all ${
                  wizardStep === st.num
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                    : wizardStep > st.num
                    ? 'bg-[#18202d] text-emerald-400 border border-emerald-500/30'
                    : 'bg-[#10141d] text-slate-400 border border-[#1e2535]'
                }`}
              >
                <div className="text-[10px] font-mono">STEP {st.num}</div>
                <div className="text-xs truncate">{st.label}</div>
              </button>
            ))}
          </div>

          {/* STEP 1: EVENT DETAILS */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Event Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Aria & Julian's Black Tie Gala"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Couple / Host Names</label>
                  <input
                    type="text"
                    placeholder="e.g. Aria Montgomery & Julian Vance"
                    value={formCoupleNames}
                    onChange={(e) => setFormCoupleNames(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Event Type</label>
                  <select
                    value={formEventType}
                    onChange={(e) => setFormEventType(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="WEDDING">Wedding Ceremony & Banquet</option>
                    <option value="RECEPTION">Evening Reception</option>
                    <option value="ENGAGEMENT">Engagement Gala</option>
                    <option value="SANGEET">Sangeet & Cocktail Night</option>
                    <option value="ANNIVERSARY">Anniversary Celebration</option>
                    <option value="CELEBRATION">Private Luxury Gala</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Event Date <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={formEventDate}
                    onChange={(e) => setFormEventDate(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">End Time</label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Venue / Hall Name</label>
                <input
                  type="text"
                  placeholder="e.g. The Rose Conservatory Ballroom"
                  value={formVenueName}
                  onChange={(e) => setFormVenueName(e.target.value)}
                  className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* STEP 2: THEME & WELCOME */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Luxury Color Palette</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = formThemeColor === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setFormThemeColor(theme.id)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'bg-[#1a2130] border-amber-400 shadow-md shadow-amber-500/10'
                            : 'bg-[#0f131a] border-[#222b3b] hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ backgroundColor: theme.accent }} />
                          <span className="text-xs font-semibold text-white">{theme.name}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">Atmospheric wedding styling</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Welcome Message to Guests</label>
                <textarea
                  rows={3}
                  placeholder="Message displayed prominently on the wedding guest mobile ordering portal..."
                  value={formWelcomeMessage}
                  onChange={(e) => setFormWelcomeMessage(e.target.value)}
                  className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Special Banquet Notes (Internal / Staff)</label>
                <input
                  type="text"
                  placeholder="e.g. VIP table 01 reserved for couple; Champagne toast at 19:30"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          {/* STEP 3: DINING & MENU SELECTION */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Guest Menu Scope</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormMenuSelectionType('FULL_MENU')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      formMenuSelectionType === 'FULL_MENU'
                        ? 'bg-[#1b2230] border-amber-400 shadow-md'
                        : 'bg-[#0f131a] border-[#222b3b] text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <UtensilsCrossed className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-semibold text-white">Full Restaurant Menu</span>
                    </div>
                    <p className="text-[10px] text-slate-400">All available food and beverages are visible to guests.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormMenuSelectionType('RESTRICTED')}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      formMenuSelectionType === 'RESTRICTED'
                        ? 'bg-[#1b2230] border-amber-400 shadow-md'
                        : 'bg-[#0f131a] border-[#222b3b] text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-semibold text-white">Curated Banquet Menu</span>
                    </div>
                    <p className="text-[10px] text-slate-400">Restrict guest ordering to selected banquet categories.</p>
                  </button>
                </div>
              </div>

              {formMenuSelectionType === 'RESTRICTED' && (
                <div className="bg-[#0c0f16] border border-[#1e2535] rounded-xl p-3.5 space-y-3">
                  <p className="text-xs font-semibold text-slate-200">Select Allowed Categories for this Event:</p>
                  {menuCategories.length === 0 ? (
                    <p className="text-xs text-slate-400">No menu categories available.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {menuCategories.map((cat) => {
                        const isChecked = formAllowedCategoryIds.includes(cat.id);
                        return (
                          <label
                            key={cat.id}
                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                                : 'bg-[#121620] border-[#222a3a] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormAllowedCategoryIds([...formAllowedCategoryIds, cat.id]);
                                } else {
                                  setFormAllowedCategoryIds(formAllowedCategoryIds.filter((id) => id !== cat.id));
                                }
                              }}
                              className="rounded text-amber-500 focus:ring-0"
                            />
                            <span className="truncate">{cat.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: TABLE SETUP */}
          {wizardStep === 4 && (
            <div className="space-y-4">
              {!editingEventId ? (
                <>
                  <div className="bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-500/20 p-3.5 rounded-xl text-xs text-amber-200 leading-relaxed">
                    <strong>Decoupled Event Tables:</strong> Event tables are isolated from your everyday dining room floorplan. Creating an event auto-provisions dedicated tables (Table 01 through Table {formTableCount}) with unique QR code tokens.
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Number of Banquet Tables to Provision
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={formTableCount}
                        onChange={(e) => setFormTableCount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Generates Table 01 to Table {String(formTableCount).padStart(2, '0')}</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Estimated Total Guest Attendance</label>
                      <input
                        type="number"
                        min={1}
                        value={formEstimatedGuestCount}
                        onChange={(e) => setFormEstimatedGuestCount(parseInt(e.target.value) || 100)}
                        className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">Used for kitchen prep metrics & planning</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-[#111520] border border-[#222a3a] p-4 rounded-xl text-xs text-slate-300 space-y-2">
                  <p className="font-semibold text-white">Event Tables Already Configured</p>
                  <p className="text-slate-400">
                    Tables have already been provisioned for this event. You can add extra tables or download individual QR codes using the <strong>Tables & QR Studio</strong> button on the event card.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 5: REVIEW & PUBLISH */}
          {wizardStep === 5 && (
            <div className="space-y-4">
              <div className="bg-[#0e121a] border border-[#232c3d] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#1f2736] pb-2.5">
                  <span className="text-xs text-slate-400">Event Title</span>
                  <span className="text-xs font-bold text-white">{formTitle || 'Untitled Event'}</span>
                </div>
                {formCoupleNames && (
                  <div className="flex items-center justify-between border-b border-[#1f2736] pb-2.5">
                    <span className="text-xs text-slate-400">Honoring Couple</span>
                    <span className="text-xs font-serif text-amber-200">{formCoupleNames}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-b border-[#1f2736] pb-2.5">
                  <span className="text-xs text-slate-400">Date & Time</span>
                  <span className="text-xs text-white">{formEventDate} ({formStartTime} - {formEndTime})</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#1f2736] pb-2.5">
                  <span className="text-xs text-slate-400">Venue</span>
                  <span className="text-xs text-white">{formVenueName || currentRestaurant?.name}</span>
                </div>
                <div className="flex items-center justify-between border-b border-[#1f2736] pb-2.5">
                  <span className="text-xs text-slate-400">Menu Mode</span>
                  <span className="text-xs font-mono text-emerald-400">{formMenuSelectionType}</span>
                </div>
                {!editingEventId && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Tables Provisioned</span>
                    <span className="text-xs font-mono text-amber-300">{formTableCount} Tables</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Publication Status</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                    <input
                      type="radio"
                      name="formStatus"
                      checked={formStatus === 'ACTIVE'}
                      onChange={() => setFormStatus('ACTIVE')}
                      className="text-amber-500 focus:ring-0"
                    />
                    <span>Active (Ready for guest ordering)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="radio"
                      name="formStatus"
                      checked={formStatus === 'DRAFT'}
                      onChange={() => setFormStatus('DRAFT')}
                      className="text-amber-500 focus:ring-0"
                    />
                    <span>Draft (Saved privately)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Wizard Footer Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-[#1e2533]">
            {wizardStep > 1 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWizardStep(wizardStep - 1)}
                className="text-xs bg-[#161c28] border-[#252f42] text-slate-300 hover:text-white"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                Back
              </Button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsWizardOpen(false)}
                className="text-xs bg-[#161c28] border-[#252f42] text-slate-400 hover:text-white"
              >
                Cancel
              </Button>

              {wizardStep < 5 ? (
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => setWizardStep(wizardStep + 1)}
                  disabled={wizardStep === 1 && (!formTitle || !formEventDate)}
                  className="text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
                >
                  Continue
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              ) : (
                <Button
                  variant="brand"
                  size="sm"
                  onClick={handleSaveWizard}
                  disabled={isSaving || !formTitle || !formEventDate}
                  className="text-xs bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold px-4"
                >
                  {isSaving ? 'Saving...' : editingEventId ? 'Update Event' : 'Publish Banquet Event'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* TABLES & DEDICATED QR CODE STUDIO MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!selectedEventForTables}
        onClose={() => setSelectedEventForTables(null)}
        title={`Tables & QR Studio — ${selectedEventForTables?.title || ''}`}
        maxWidth="3xl"
      >
        {selectedEventForTables && (
          <div className="space-y-6">
            {/* Studio Actions Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#10141d] p-3.5 rounded-xl border border-[#1e2535]">
              <div>
                <p className="text-xs font-semibold text-white">Event Table Tokens ({eventTables.length})</p>
                <p className="text-[10px] text-slate-400">Strictly decoupled from daily dining floorplan.</p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => setIsPrintModalOpen(true)}
                  className="bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-semibold text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Standee Sheet</span>
                </Button>
              </div>
            </div>

            {/* Add Extra Table Inline Form */}
            <div className="bg-[#121622] border border-[#232c3d] p-3 rounded-xl flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-medium text-slate-300">Add Table:</span>
              <input
                type="text"
                placeholder="Number (e.g. 11 or VIP-Head)"
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(e.target.value)}
                className="bg-[#0c0e15] border border-[#273245] rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 w-36"
              />
              <input
                type="text"
                placeholder="Label (e.g. Groom Family)"
                value={newTableLabel}
                onChange={(e) => setNewTableLabel(e.target.value)}
                className="bg-[#0c0e15] border border-[#273245] rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 w-44"
              />
              <input
                type="number"
                min={1}
                value={newTableCapacity}
                onChange={(e) => setNewTableCapacity(parseInt(e.target.value) || 8)}
                className="bg-[#0c0e15] border border-[#273245] rounded-lg px-2 py-1 text-xs text-white w-16"
                title="Seats"
              />
              <Button
                variant="brand"
                size="sm"
                onClick={handleAddTable}
                disabled={isAddingTable || !newTableNumber.trim()}
                className="text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold h-7 px-3"
              >
                {isAddingTable ? 'Adding...' : 'Add Table'}
              </Button>
            </div>

            {/* Tables Grid with Direct QR */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 max-h-[480px] overflow-y-auto pr-1">
              {eventTables.map((tbl) => {
                const guestUrl = getEventGuestUrl(selectedEventForTables.id, tbl.tableNumber);
                const canvasId = `qr-canvas-${tbl.id}`;

                return (
                  <div
                    key={tbl.id}
                    className="bg-[#121622] border border-[#222b3b] hover:border-amber-500/50 rounded-xl p-3.5 space-y-3 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-amber-300 text-sm">
                          Table {tbl.tableNumber}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {tbl.capacity} seats
                        </span>
                      </div>
                      {tbl.tableLabel && (
                        <p className="text-[11px] text-slate-300 truncate mt-0.5">{tbl.tableLabel}</p>
                      )}
                    </div>

                    {/* QR Code Canvas */}
                    <div className="bg-white p-2.5 rounded-lg flex items-center justify-center shadow-inner">
                      <QRCodeCanvas
                        id={canvasId}
                        value={guestUrl}
                        size={110}
                        level="H"
                        marginSize={1}
                      />
                    </div>

                    {/* Actions */}
                    <div className="space-y-1.5 pt-2 border-t border-[#1c2330]">
                      <div className="flex items-center justify-between gap-1">
                        <button
                          onClick={() => handleDownloadQR(tbl.tableNumber, canvasId)}
                          className="flex-1 py-1 rounded bg-[#1b2230] hover:bg-[#252f42] text-slate-200 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                        >
                          <Download className="w-3 h-3 text-amber-400" />
                          <span>PNG</span>
                        </button>
                        <button
                          onClick={() => handleCopyLink(guestUrl)}
                          className="flex-1 py-1 rounded bg-[#1b2230] hover:bg-[#252f42] text-slate-200 text-[10px] font-medium flex items-center justify-center gap-1 transition-colors"
                        >
                          <Copy className="w-3 h-3 text-sky-400" />
                          <span>Copy</span>
                        </button>
                        <a
                          href={guestUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded bg-[#1b2230] hover:bg-[#252f42] text-slate-200 text-[10px] flex items-center justify-center transition-colors"
                          title="Open Guest View"
                        >
                          <ExternalLink className="w-3 h-3 text-emerald-400" />
                        </a>
                        <button
                          onClick={() => handleDeleteTable(tbl.id)}
                          className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                          title="Delete Table"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* PRINT-READY TABLE STANDEES MODAL / SHEET */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title="Print-Ready Wedding Standee Cards"
        maxWidth="3xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[#121622] p-3 rounded-xl border border-[#232c3d]">
            <p className="text-xs text-slate-300">
              Formatted for standard A6 or cardstock standees. Click <strong>Print Standees</strong> to open your browser print preview.
            </p>
            <Button
              variant="brand"
              size="sm"
              onClick={() => window.print()}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Standees</span>
            </Button>
          </div>

          {/* Printable Standees Container */}
          <div className="grid grid-cols-2 gap-4 max-h-[500px] overflow-y-auto p-4 bg-slate-900 rounded-xl print:bg-white print:text-black print:overflow-visible print:max-h-none">
            {eventTables.map((tbl) => {
              const guestUrl = getEventGuestUrl(selectedEventForTables?.id || '', tbl.tableNumber);

              return (
                <div
                  key={tbl.id}
                  className="bg-[#faf8f5] text-slate-900 border-2 border-[#d4af37] rounded-2xl p-6 text-center space-y-3 shadow-md flex flex-col items-center justify-between page-break-inside-avoid"
                >
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-[#94762c] font-serif font-bold">
                      {selectedEventForTables?.venueName || currentRestaurant?.name || 'Exclusive Banquet'}
                    </p>
                    <h3 className="text-base font-serif font-bold text-slate-900">
                      {selectedEventForTables?.coupleNames || selectedEventForTables?.title}
                    </h3>
                    <div className="w-12 h-0.5 bg-[#d4af37] mx-auto my-1" />
                  </div>

                  <div className="my-2 bg-white p-3 rounded-xl border border-amber-200 shadow-inner">
                    <QRCodeCanvas value={guestUrl} size={130} level="H" marginSize={1} />
                  </div>

                  <div className="space-y-1">
                    <div className="px-3 py-1 bg-amber-100/60 rounded-full text-xs font-mono font-bold text-amber-900 border border-amber-300 inline-block">
                      TABLE {tbl.tableNumber}
                    </div>
                    {tbl.tableLabel && (
                      <p className="text-[11px] font-serif italic text-slate-600">{tbl.tableLabel}</p>
                    )}
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Scan with camera to order</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* LIVE EVENT ORDERS MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!selectedEventForOrders}
        onClose={() => setSelectedEventForOrders(null)}
        title={`Live Orders Stream — ${selectedEventForOrders?.title || ''}`}
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[#0e121a] p-3 rounded-xl border border-[#202737]">
            <div>
              <p className="text-xs font-bold text-white">Event Orders: {eventOrders.length}</p>
              <p className="text-[10px] text-slate-400">Tagged with 💍 WEDDING EVENT and routed directly to Kitchen & Bar KDS</p>
            </div>
            <span className="font-mono text-emerald-400 font-bold text-sm">
              Total: ₹{eventOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0).toFixed(2)}
            </span>
          </div>

          {loadingOrders ? (
            <div className="py-12 flex justify-center text-slate-400 text-xs font-mono">
              Fetching event orders...
            </div>
          ) : eventOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No orders placed for this event yet. Orders placed via wedding guest table QR codes will appear here in real-time.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
              {eventOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-[#121622] border border-[#232c3d] rounded-xl p-3.5 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-400">
                        #{ord.id.slice(-4)}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        TABLE {ord.tableNumber}
                      </span>
                      <span className="text-slate-300 font-medium">{ord.customerName || 'Guest'}</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-400">
                      ₹{(ord.totalAmount || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-300 space-y-1 bg-[#0c0e16] p-2 rounded-lg border border-[#1b2232]">
                    {(ord.items || []).map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>• {it.quantity}x {it.name}</span>
                        <span className="text-slate-400 font-mono">₹{((it.price || (it as any).unitPrice || 0) * it.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Placed {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="font-mono font-semibold text-purple-400 uppercase">{ord.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
export default WeddingsTab;
