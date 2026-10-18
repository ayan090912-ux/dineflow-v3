import React, { useState, useEffect, useRef, useMemo } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { api } from '../../packages/api/client';
import {
  WeddingEvent,
  EventTable,
  Restaurant,
  Order,
  MenuCategory,
  MenuItem,
  isModuleEnabled,
} from '../../packages/types';
import { getCurrencySymbol } from '../../packages/utils/currency';
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
  Search,
  Timer,
  CalendarClock,
  ChefHat,
  Send,
  RefreshCw,
  TableProperties,
  Flame,
  Truck,
  Check,
  Radio,
  Layers,
  ChevronDown,
  Info,
} from 'lucide-react';

export const cleanTableBadge = (tbl?: string): string => {
  if (!tbl) return '';
  return tbl.replace(/^table\s*/i, '').trim();
};

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

export const EVENT_TYPES: Record<string, { label: string; icon: string; honoreeLabel: string; prefix: string }> = {
  WEDDING: { label: 'Wedding Ceremony & Banquet', icon: '💍', honoreeLabel: 'Couple Names (e.g. Aria & Julian)', prefix: 'In honor of' },
  RECEPTION: { label: 'Evening Reception', icon: '🥂', honoreeLabel: 'Honoring Couple / Hosts', prefix: 'Hosted by' },
  BIRTHDAY: { label: 'Birthday Celebration', icon: '🎂', honoreeLabel: 'Celebrant Name (e.g. Maya’s 30th)', prefix: 'Celebrating' },
  CORPORATE: { label: 'Corporate Gala & Conference', icon: '🏢', honoreeLabel: 'Host Company / Organization', prefix: 'Presented by' },
  PARTY: { label: 'Private Party & Cocktail Night', icon: '🎉', honoreeLabel: 'Host / Organizer Names', prefix: 'Hosted by' },
  ANNIVERSARY: { label: 'Anniversary Celebration', icon: '✨', honoreeLabel: 'Couple / Honorees', prefix: 'Honoring' },
  GALA: { label: 'Charity & Formal Gala Dinner', icon: '🌟', honoreeLabel: 'Beneficiary / Host Foundation', prefix: 'Benefiting' },
  CATERING: { label: 'Banquet & Catered Dining', icon: '🍽️', honoreeLabel: 'Host / Organizer', prefix: 'Catered for' },
  ENGAGEMENT: { label: 'Engagement Celebration', icon: '💎', honoreeLabel: 'Engaged Couple', prefix: 'Celebrating' },
  SANGEET: { label: 'Sangeet & Cocktail Night', icon: '🎶', honoreeLabel: 'Couple / Families', prefix: 'In honor of' },
};

export const COMMON_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST · UTC+5:30)' },
  { value: 'UTC', label: 'Coordinated Universal Time (UTC)' },
  { value: 'America/New_York', label: 'Eastern Time (ET · US/Canada)' },
  { value: 'America/Chicago', label: 'Central Time (CT · US/Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT · US/Canada)' },
  { value: 'Europe/London', label: 'British Time (GMT/BST · London)' },
  { value: 'Europe/Paris', label: 'Central European Time (CET · Paris)' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (GST · Dubai)' },
  { value: 'Asia/Singapore', label: 'Singapore Time (SGT · Singapore)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AEST · Sydney)' },
];

export const WeddingsTab: React.FC<WeddingsTabProps> = ({ currentRestaurant, currentUser, addToast }) => {
  const currencySymbol = useMemo(
    () => getCurrencySymbol(currentRestaurant?.currency || 'INR (₹)'),
    [currentRestaurant?.currency]
  );
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SCHEDULED' | 'CLOSED' | 'PAUSED' | 'DRAFT' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Primary Operating Mode: 'terminal' (Event Operations Terminal) vs 'catalog' (All Events List)
  const [viewMode, setViewMode] = useState<'terminal' | 'catalog'>('terminal');
  const [selectedEventId, setSelectedEventId] = useState<string>('');

  // Terminal Sub-Views: 'orders' | 'tables' | 'delivery'
  const [terminalView, setTerminalView] = useState<'orders' | 'tables' | 'delivery'>('orders');
  const [orderSubFilter, setOrderSubFilter] = useState<'ALL' | 'NEW' | 'PREPARING' | 'READY' | 'DELIVERED'>('ALL');

  // Terminal Active Event Data
  const [terminalOrders, setTerminalOrders] = useState<Order[]>([]);
  const [terminalTables, setTerminalTables] = useState<EventTable[]>([]);
  const [loadingTerminalData, setLoadingTerminalData] = useState(false);
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);
  const [readinessData, setReadinessData] = useState<any>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<Record<string, boolean>>({});

  // Selected Table Drawer / Detail Modal
  const [selectedTableDetail, setSelectedTableDetail] = useState<EventTable | null>(null);

  // Creation/Edit Wizard Modal State
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  // Wizard Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formCoupleNames, setFormCoupleNames] = useState('');
  const [formEventType, setFormEventType] = useState('WEDDING');
  const [formEventDate, setFormEventDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('18:00');
  const [formEndTime, setFormEndTime] = useState('23:30');
  const [formTimezone, setFormTimezone] = useState('Asia/Kolkata');
  const [formServiceDays, setFormServiceDays] = useState(1);
  const [formIsMultiDay, setFormIsMultiDay] = useState(false);
  const [formAutoActivate, setFormAutoActivate] = useState(true);
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

  // Wizard table live edit state for Step 3
  const [wizardTables, setWizardTables] = useState<EventTable[]>([]);
  const [loadingWizardTables, setLoadingWizardTables] = useState(false);

  // Platform Admin Request & Capability State
  const [applicantStatus, setApplicantStatus] = useState<any>(null);
  const [isApplicantStatusLoading, setIsApplicantStatusLoading] = useState(false);
  const [isApplyingModalOpen, setIsApplyingModalOpen] = useState(false);
  const [applyWeddingName, setApplyWeddingName] = useState('');
  const [applyEventType, setApplyEventType] = useState('WEDDING');
  const [applyDate, setApplyDate] = useState('');
  const [applyPhone, setApplyPhone] = useState('');
  const [applyNotes, setApplyNotes] = useState('');
  const [isSubmittingApplication, setIsSubmittingApplication] = useState(false);
  const [isSeedingMenu, setIsSeedingMenu] = useState(false);

  // Extension Modal State
  const [extendingEvent, setExtendingEvent] = useState<WeddingEvent | null>(null);
  const [extensionMinutes, setExtensionMinutes] = useState(60);
  const [extensionReason, setExtensionReason] = useState('Host requested dining extension');
  const [customExtensionDate, setCustomExtensionDate] = useState('');
  const [customExtensionTime, setCustomExtensionTime] = useState('');
  const [isExtending, setIsExtending] = useState(false);

  // Restaurant Menu Data (for Restricted Menu Step)
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // Tables & QR Studio Modal State (for Catalog View)
  const [selectedEventForTables, setSelectedEventForTables] = useState<WeddingEvent | null>(null);
  const [eventTables, setEventTables] = useState<EventTable[]>([]);
  const [newTableNumber, setNewTableNumber] = useState('');
  const [newTableLabel, setNewTableLabel] = useState('');
  const [newTableCapacity, setNewTableCapacity] = useState(8);
  const [isAddingTable, setIsAddingTable] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Selected event object
  const currentEvent = useMemo(() => {
    if (!events || events.length === 0) return null;
    if (selectedEventId) {
      const match = events.find((e) => e.id === selectedEventId);
      if (match) return match;
    }
    // Default to first active event, or first available event
    const activeEvt = events.find((e) => e.status === 'ACTIVE');
    return activeEvt || events[0];
  }, [events, selectedEventId]);

  // Keep selectedEventId synced with currentEvent
  useEffect(() => {
    if (currentEvent && currentEvent.id !== selectedEventId) {
      setSelectedEventId(currentEvent.id);
    }
  }, [currentEvent?.id]);

  // Load applicant status from Platform Admin approval queue
  const loadApplicantStatus = async () => {
    if (!currentRestaurant?.id) return;
    setIsApplicantStatusLoading(true);
    try {
      const res = await api.getWeddingApplicantStatus(currentUser?.email, currentRestaurant.id);
      setApplicantStatus(res?.application || (res?.hasApplication ? res : null));
    } catch (e) {
      console.warn('Failed to load applicant status:', e);
    } finally {
      setIsApplicantStatusLoading(false);
    }
  };

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

  // Load Terminal Active Event Data (Orders, Tables, Readiness)
  const loadTerminalData = async (silent = false) => {
    if (!currentRestaurant?.id || !currentEvent?.id) return;
    if (!silent) setLoadingTerminalData(true);
    try {
      const [ords, evDetail, readiness] = await Promise.all([
        api.getEventOrders(currentEvent.id, currentRestaurant.id),
        api.getEvent(currentRestaurant.id, currentEvent.id).catch(() => null),
        api.getEventReadiness(currentEvent.id, currentRestaurant.id).catch(() => null),
      ]);

      setTerminalOrders(ords || []);
      if (evDetail?.tables) {
        setTerminalTables(evDetail.tables);
      }
      if (readiness) {
        setReadinessData(readiness);
      }
    } catch (err: any) {
      console.warn('Failed to refresh terminal event data:', err);
    } finally {
      if (!silent) setLoadingTerminalData(false);
    }
  };

  useEffect(() => {
    loadEvents();
    loadApplicantStatus();
    if (currentRestaurant?.id) {
      api.getMenuItems(currentRestaurant.id).then(setMenuItems).catch(() => {});
    }
  }, [currentRestaurant?.id, currentUser?.email]);

  useEffect(() => {
    if (currentEvent?.id) {
      loadTerminalData();
    }
  }, [currentEvent?.id]);

  // Periodic polling for live event operations (every 7 seconds)
  useEffect(() => {
    if (!currentEvent?.id) return;
    const interval = setInterval(() => {
      loadTerminalData(true);
    }, 7000);
    return () => clearInterval(interval);
  }, [currentEvent?.id, currentRestaurant?.id]);

  // Load Menu items & categories when wizard opens
  useEffect(() => {
    if (isWizardOpen && currentRestaurant?.id) {
      api.getCategories(currentRestaurant.id).then(setMenuCategories).catch(() => {});
      api.getMenuItems(currentRestaurant.id).then(setMenuItems).catch(() => {});
    }
  }, [isWizardOpen, currentRestaurant?.id]);

  // Station Progress Derivation
  const getStationProgress = (order: Order) => {
    const rawItems = order.items || [];
    let hasKitchen = false;
    let hasBar = false;
    let hasHookah = false;

    rawItems.forEach((it) => {
      const dest = (it.targetDestination || (it as any).target_destination || '').toUpperCase();
      if (dest === 'HOOKAH') hasHookah = true;
      else if (dest === 'BAR' || it.isAlcoholic) hasBar = true;
      else hasKitchen = true;
    });

    const kStatus = order.kitchenStatus || 'PENDING';
    const bStatus = order.barStatus || 'PENDING';
    const hStatus = order.hookahStatus || 'PENDING';

    const kReady = !hasKitchen || ['READY', 'COMPLETED', 'DELIVERED', 'SERVED'].includes(kStatus);
    const bReady = !hasBar || ['READY', 'COMPLETED', 'DELIVERED', 'SERVED'].includes(bStatus);
    const hReady = !hasHookah || ['READY', 'COMPLETED', 'DELIVERED', 'SERVED'].includes(hStatus);

    const isFullyReady = kReady && bReady && hReady;

    return {
      hasKitchen,
      kitchenStatus: hasKitchen ? kStatus : 'NOT_REQUIRED',
      hasBar,
      barStatus: hasBar ? bStatus : 'NOT_REQUIRED',
      hasHookah,
      hookahStatus: hasHookah ? hStatus : 'NOT_REQUIRED',
      isFullyReady,
    };
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

  // Order Delivery Actions
  const handleClaimOrder = async (order: Order) => {
    if (!order.id || isUpdatingStatus[order.id]) return;
    setIsUpdatingStatus((prev) => ({ ...prev, [order.id]: true }));
    try {
      const staffName = currentUser?.name || currentUser?.firstName || currentUser?.email?.split('@')[0] || 'Banquet Server';
      await api.updateOrderStatus(order.id, {
        claimedBy: staffName,
        deliveryStatus: 'CLAIMED',
      });
      if (addToast) {
        addToast({ type: 'success', title: 'Order Claimed', message: `Order #${cleanTableBadge(order.tableNumber)} claimed by ${staffName}` });
      }
      await loadTerminalData(true);
    } catch (err: any) {
      console.error('Failed to claim order:', err);
      if (addToast) addToast({ type: 'error', title: 'Claim Failed', message: err.message });
    } finally {
      setIsUpdatingStatus((prev) => ({ ...prev, [order.id]: false }));
    }
  };

  const handleOutForDelivery = async (order: Order) => {
    if (!order.id || isUpdatingStatus[order.id]) return;
    setIsUpdatingStatus((prev) => ({ ...prev, [order.id]: true }));
    try {
      const staffName = order.claimedBy || currentUser?.name || currentUser?.email?.split('@')[0] || 'Banquet Server';
      await api.updateOrderStatus(order.id, {
        status: 'OUT_FOR_DELIVERY',
        deliveryStatus: 'OUT_FOR_DELIVERY',
        claimedBy: staffName,
      });
      if (addToast) {
        addToast({ type: 'info', title: 'Out for Delivery', message: `Order for Table ${cleanTableBadge(order.tableNumber)} is on the way` });
      }
      await loadTerminalData(true);
    } catch (err: any) {
      console.error('Failed to mark out for delivery:', err);
      if (addToast) addToast({ type: 'error', title: 'Update Failed', message: err.message });
    } finally {
      setIsUpdatingStatus((prev) => ({ ...prev, [order.id]: false }));
    }
  };

  const handleConfirmDelivered = async (order: Order) => {
    if (!order.id || isUpdatingStatus[order.id]) return;
    setIsUpdatingStatus((prev) => ({ ...prev, [order.id]: true }));
    try {
      await api.updateOrderStatus(order.id, {
        status: 'DELIVERED',
        deliveryStatus: 'DELIVERED',
      });
      if (addToast) {
        addToast({ type: 'success', title: 'Delivered Successfully', message: `Table ${cleanTableBadge(order.tableNumber)} order marked delivered.` });
      }
      await loadTerminalData(true);
    } catch (err: any) {
      console.error('Failed to confirm delivery:', err);
      if (addToast) addToast({ type: 'error', title: 'Delivery Failed', message: err.message });
    } finally {
      setIsUpdatingStatus((prev) => ({ ...prev, [order.id]: false }));
    }
  };

  // Toggle Live Ordering
  const handleToggleOrdering = async (ev: WeddingEvent) => {
    if (!currentRestaurant?.id) return;
    try {
      const res = await api.toggleEventOrdering(ev.id, currentRestaurant.id);
      setEvents((prev) =>
        prev.map((item) => (item.id === ev.id ? { ...item, isOrderingOpen: res.isOrderingOpen } : item))
      );
      if (addToast) {
        addToast({
          type: res.isOrderingOpen ? 'success' : 'info',
          title: res.isOrderingOpen ? 'Ordering Opened' : 'Ordering Paused',
          message: `Guest orders are now ${res.isOrderingOpen ? 'actively accepted' : 'temporarily paused'}.`,
        });
      }
      await loadTerminalData(true);
    } catch (err: any) {
      console.error('Failed to toggle event ordering:', err);
      if (addToast) addToast({ type: 'error', title: 'Update Failed', message: err.message });
    }
  };

  // Open Wizard for new event
  const handleOpenNewWizard = () => {
    setEditingEventId(null);
    setWizardStep(1);
    setWizardTables([]);
    setFormTitle('');
    setFormCoupleNames('');
    setFormEventType('WEDDING');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7);
    const startStr = tomorrow.toISOString().split('T')[0];
    setFormEventDate(startStr);
    setFormEndDate(startStr);
    setFormStartTime('18:00');
    setFormEndTime('23:30');
    setFormTimezone('Asia/Kolkata');
    setFormServiceDays(1);
    setFormIsMultiDay(false);
    setFormAutoActivate(true);
    setFormVenueName(currentRestaurant?.name || '');
    setFormWelcomeMessage('Welcome to our banquet! Scan the QR code at your table to explore our curated dishes and place your dining order.');
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
  const handleOpenEditWizard = async (ev: WeddingEvent) => {
    setEditingEventId(ev.id);
    setWizardStep(1);
    setFormTitle(ev.title);
    setFormCoupleNames(ev.coupleNames || '');
    setFormEventType(ev.eventType || 'WEDDING');
    setFormEventDate(ev.eventDate);
    setFormEndDate(ev.endDate || ev.eventDate);
    setFormStartTime(ev.startTime || '18:00');
    setFormEndTime(ev.endTime || '23:30');
    setFormTimezone(ev.timezone || 'Asia/Kolkata');
    setFormServiceDays(ev.serviceDays || 1);
    setFormIsMultiDay(Boolean(ev.serviceDays && ev.serviceDays > 1) || (Boolean(ev.endDate) && ev.endDate !== ev.eventDate));
    setFormAutoActivate(ev.autoActivate !== false);
    setFormVenueName(ev.venueName || '');
    setFormWelcomeMessage(ev.welcomeMessage || '');
    setFormThemeColor(ev.themeColor || 'champagne');
    setFormStatus((ev.status === 'DRAFT' ? 'DRAFT' : 'ACTIVE') as any);
    setFormMenuSelectionType(ev.menuSelectionType || 'FULL_MENU');
    setFormAllowedCategoryIds(ev.allowedCategoryIds || []);
    setFormAllowedItemIds(ev.allowedItemIds || []);
    setFormEstimatedGuestCount(ev.estimatedGuestCount || 100);
    setFormTableCount(ev.tableCount || 10);
    setFormNotes(ev.notes || '');

    if (currentRestaurant?.id) {
      setLoadingWizardTables(true);
      try {
        const fullEvt = await api.getEvent(currentRestaurant.id, ev.id);
        setWizardTables(fullEvt.tables || []);
      } catch (e) {
        console.warn('Failed to load event tables for editing:', e);
      } finally {
        setLoadingWizardTables(false);
      }
    }

    setIsWizardOpen(true);
  };

  // Resume Draft
  const handleResumeDraft = (draft: WeddingEvent) => {
    handleOpenEditWizard(draft);
  };

  // Seed sample menu
  const handleSeedSampleMenu = async () => {
    if (!currentRestaurant?.id || isSeedingMenu) return;
    setIsSeedingMenu(true);
    try {
      const items = await api.seedSampleMenu(currentRestaurant.id);
      setMenuItems(items);
      if (addToast) {
        addToast({
          type: 'success',
          title: 'Catering Menu Initialized',
          message: `Created 9 chef-curated banquet dishes across Appetizers, Entrees, Bread, and Desserts.`,
        });
      }
      await loadTerminalData(true);
    } catch (e: any) {
      if (addToast) addToast({ type: 'error', title: 'Menu Seed Failed', message: e.message });
    } finally {
      setIsSeedingMenu(false);
    }
  };

  // Extend Service Period
  const handleExtendServicePeriod = async () => {
    if (!extendingEvent || !currentRestaurant?.id) return;
    setIsExtending(true);
    try {
      const payload: any = {
        reason: extensionReason.trim() || 'Host requested dining extension',
      };
      if (customExtensionDate && customExtensionTime) {
        payload.newEndDate = customExtensionDate;
        payload.newEndTime = customExtensionTime;
      } else {
        payload.extensionMinutes = Number(extensionMinutes) || 60;
      }

      await api.extendEventServicePeriod(extendingEvent.id, payload, currentRestaurant.id);
      if (addToast) {
        addToast({
          type: 'success',
          title: 'Dining Period Extended',
          message: `Event window lengthened. Live guest ordering restored.`,
        });
      }
      setExtendingEvent(null);
      await loadEvents();
      await loadTerminalData(true);
    } catch (err: any) {
      if (addToast) addToast({ type: 'error', title: 'Extension Failed', message: err.message });
    } finally {
      setIsExtending(false);
    }
  };

  // Delete event
  const handleDeleteEvent = async (ev: WeddingEvent) => {
    if (!currentRestaurant?.id) return;
    const confirmDel = window.confirm(`Are you sure you want to delete event "${ev.title}"? All event tables and order records will be cleared.`);
    if (!confirmDel) return;

    try {
      await api.deleteEvent(ev.id, currentRestaurant.id);
      setEvents((prev) => prev.filter((item) => item.id !== ev.id));
      if (addToast) addToast({ type: 'info', title: 'Event Deleted', message: `Event "${ev.title}" removed.` });
    } catch (err: any) {
      if (addToast) addToast({ type: 'error', title: 'Delete Failed', message: err.message });
    }
  };

  // Save wizard event
  const handleSaveWizardEvent = async (isDraft = false) => {
    if (!currentRestaurant?.id || isSaving) return;
    if (!formTitle.trim()) {
      if (addToast) addToast({ type: 'error', title: 'Title Required', message: 'Please provide an event title.' });
      return;
    }
    if (!formEventDate) {
      if (addToast) addToast({ type: 'error', title: 'Start Date Required', message: 'Please select an event date.' });
      return;
    }

    setIsSaving(true);
    try {
      const payload: any = {
        title: formTitle.trim(),
        coupleNames: formCoupleNames.trim(),
        eventType: formEventType,
        eventDate: formEventDate,
        endDate: formIsMultiDay && formEndDate ? formEndDate : formEventDate,
        startTime: formStartTime || '18:00',
        endTime: formEndTime || '23:30',
        timezone: formTimezone || 'Asia/Kolkata',
        serviceDays: formIsMultiDay ? formServiceDays : 1,
        autoActivate: formAutoActivate,
        venueName: formVenueName.trim(),
        welcomeMessage: formWelcomeMessage.trim(),
        themeColor: formThemeColor,
        status: isDraft ? 'DRAFT' : 'ACTIVE',
        isOrderingOpen: !isDraft,
        menuSelectionType: formMenuSelectionType,
        allowedCategoryIds: formMenuSelectionType === 'RESTRICTED' ? formAllowedCategoryIds : [],
        allowedItemIds: formMenuSelectionType === 'RESTRICTED' ? formAllowedItemIds : [],
        estimatedGuestCount: Number(formEstimatedGuestCount) || 100,
        tableCount: Math.max(1, Number(formTableCount) || 10),
        notes: formNotes.trim(),
      };

      if (editingEventId) {
        await api.updateEvent(editingEventId, payload, currentRestaurant.id);
        if (addToast) addToast({ type: 'success', title: 'Event Updated', message: `Changes saved successfully.` });
      } else {
        await api.createEvent(payload, currentRestaurant.id);
        if (addToast) {
          addToast({
            type: 'success',
            title: isDraft ? 'Draft Saved' : 'Event Created & Activated 🎉',
            message: `Banquet "${formTitle}" is configured with dedicated QR tables.`,
          });
        }
      }

      setIsWizardOpen(false);
      await loadEvents();
      await loadTerminalData(true);
    } catch (err: any) {
      if (addToast) addToast({ type: 'error', title: 'Save Failed', message: err.message });
    } finally {
      setIsSaving(false);
    }
  };

  // Add Table to Active Event
  const handleAddTableToEvent = async () => {
    if (!currentRestaurant?.id || !currentEvent?.id || !newTableNumber.trim() || isAddingTable) return;
    setIsAddingTable(true);
    try {
      const cleanNum = cleanTableBadge(newTableNumber);
      const created = await api.createEventTable(
        currentEvent.id,
        {
          tableNumber: cleanNum,
          tableLabel: newTableLabel.trim() || `Table ${cleanNum}`,
          capacity: Number(newTableCapacity) || 8,
        },
        currentRestaurant.id
      );

      setTerminalTables((prev) => [...prev, created]);
      setNewTableNumber('');
      setNewTableLabel('');
      setNewTableCapacity(8);
      if (addToast) addToast({ type: 'success', title: 'Table Added', message: `Table ${cleanNum} provisioned.` });
    } catch (err: any) {
      if (addToast) addToast({ type: 'error', title: 'Add Table Failed', message: err.message });
    } finally {
      setIsAddingTable(false);
    }
  };

  // Delete Table from Active Event
  const handleDeleteTableFromEvent = async (tableId: string) => {
    if (!currentRestaurant?.id || !currentEvent?.id) return;
    const confirmDel = window.confirm('Delete this event table? Printed QR codes for this table will no longer resolve.');
    if (!confirmDel) return;

    try {
      await api.deleteEventTable(currentEvent.id, tableId, currentRestaurant.id);
      setTerminalTables((prev) => prev.filter((t) => t.id !== tableId));
      if (selectedTableDetail?.id === tableId) {
        setSelectedTableDetail(null);
      }
      if (addToast) addToast({ type: 'info', title: 'Table Removed' });
    } catch (err: any) {
      if (addToast) addToast({ type: 'error', title: 'Delete Failed', message: err.message });
    }
  };

  // Compute Real Metric Counts from Persisted Orders
  const liveMetrics = useMemo(() => {
    const orders = terminalOrders || [];
    let newCount = 0;
    let prepCount = 0;
    let readyCount = 0;
    let delivCount = 0;

    orders.forEach((o) => {
      const st = (o.status || 'PENDING').toUpperCase();
      const prog = getStationProgress(o);

      if (st === 'DELIVERED' || st === 'COMPLETED') {
        delivCount++;
      } else if (st === 'READY' || st === 'OUT_FOR_DELIVERY' || prog.isFullyReady) {
        readyCount++;
      } else if (st === 'PREPARING' || o.kitchenStatus === 'PREPARING' || o.barStatus === 'PREPARING' || o.hookahStatus === 'PREPARING') {
        prepCount++;
      } else {
        newCount++;
      }
    });

    return {
      newOrders: newCount,
      preparing: prepCount,
      readyToDeliver: readyCount,
      delivered: delivCount,
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    };
  }, [terminalOrders]);

  // Filtered Orders for Terminal
  const filteredTerminalOrders = useMemo(() => {
    let list = terminalOrders || [];

    if (orderSubFilter !== 'ALL') {
      list = list.filter((o) => {
        const st = (o.status || 'PENDING').toUpperCase();
        const prog = getStationProgress(o);
        if (orderSubFilter === 'NEW') return st === 'PENDING' || st === 'ACCEPTED';
        if (orderSubFilter === 'PREPARING') return st === 'PREPARING' && !prog.isFullyReady;
        if (orderSubFilter === 'READY') return st === 'READY' || st === 'OUT_FOR_DELIVERY' || (st !== 'DELIVERED' && st !== 'COMPLETED' && prog.isFullyReady);
        if (orderSubFilter === 'DELIVERED') return st === 'DELIVERED' || st === 'COMPLETED';
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((o) => {
        const ordNum = (o.displayOrderNumber || '').toLowerCase();
        const tblNum = (o.tableNumber || '').toLowerCase();
        const cust = (o.customerName || '').toLowerCase();
        return ordNum.includes(q) || tblNum.includes(q) || cust.includes(q);
      });
    }

    return list;
  }, [terminalOrders, orderSubFilter, searchQuery]);

  // Delivery Orders (Ready to Deliver or Out for Delivery)
  const deliveryOrders = useMemo(() => {
    return (terminalOrders || []).filter((o) => {
      const st = (o.status || 'PENDING').toUpperCase();
      const prog = getStationProgress(o);
      return st === 'READY' || st === 'OUT_FOR_DELIVERY' || (st !== 'DELIVERED' && st !== 'COMPLETED' && st !== 'CANCELLED' && prog.isFullyReady);
    });
  }, [terminalOrders]);

  // Format timestamp helper (zero ETA, actual time received)
  const formatReceivedTime = (iso?: string) => {
    if (!iso) return 'Just now';
    try {
      const d = new Date(iso);
      const diffMs = Date.now() - d.getTime();
      const mins = Math.max(0, Math.floor(diffMs / 60000));
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (mins < 1) return `Just now (${timeStr})`;
      if (mins === 1) return `1 min ago (${timeStr})`;
      return `${mins} mins ago (${timeStr})`;
    } catch (e) {
      return 'Received recently';
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* ========================================================================= */}
      {/* PRIMARY EVENT OPERATIONS TERMINAL HEADER */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-[#181d28] via-[#1b2234] to-[#161a24] border border-[#2d3748] rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            {/* Module Brand Badge & Event Switcher */}
            <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
              <span className="p-2 rounded-xl bg-gradient-to-tr from-amber-500/20 to-yellow-500/10 text-amber-300 border border-amber-500/30">
                <Sparkles className="w-5 h-5" />
              </span>

              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                  Event Operations Terminal
                </span>
                <span className="text-[10px] font-sans font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live Sync
                </span>
              </div>

              {/* Event Selector Dropdown (When multiple events exist) */}
              {events.length > 1 && (
                <div className="relative inline-block ml-1">
                  <select
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    className="bg-[#0f131d] border border-amber-500/40 text-amber-200 text-xs font-semibold rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({ev.eventDate}) — {ev.status}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Selected Event Title & Details */}
            {currentEvent ? (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-2xl font-bold text-white tracking-tight font-serif">
                    {currentEvent.title}
                  </h1>
                  <span
                    className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                      currentEvent.status === 'ACTIVE'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : currentEvent.status === 'SCHEDULED'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : currentEvent.status === 'PAUSED'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-700/60 text-slate-300 border border-slate-600'
                    }`}
                  >
                    {currentEvent.status === 'ACTIVE'
                      ? '● ACTIVE'
                      : currentEvent.status === 'SCHEDULED'
                      ? '○ SCHEDULED'
                      : currentEvent.status}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#161c27] text-slate-300 border border-[#273245]">
                    {currentEvent.tableCount || terminalTables.length || 0} Tables
                  </span>
                </div>

                <p className="text-xs text-slate-300 flex flex-wrap items-center gap-3 pt-0.5">
                  <span className="flex items-center gap-1.5 text-amber-200/90 font-serif italic">
                    <Heart className="w-3.5 h-3.5 text-amber-400" />
                    {currentEvent.coupleNames || currentEvent.venueName || 'Banquet Dining'}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {currentEvent.eventDate} {currentEvent.endDate && currentEvent.endDate !== currentEvent.eventDate ? `→ ${currentEvent.endDate}` : ''} ({currentEvent.startTime} - {currentEvent.endTime})
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {currentEvent.venueName || currentRestaurant?.name}
                  </span>
                </p>
              </div>
            ) : (
              <div>
                <h1 className="text-xl font-bold text-white font-serif">Wedding & Event Operations</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  No active events configured. Create your first banquet event to activate live ordering.
                </p>
              </div>
            )}
          </div>

          {/* Prominent Header Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {currentEvent && (
              <>
                {/* Live Ordering Pause / Open Button */}
                <button
                  onClick={() => handleToggleOrdering(currentEvent)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg flex items-center gap-2 ${
                    currentEvent.isOrderingOpen
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950 shadow-emerald-500/20'
                      : 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                  }`}
                  title="Toggle guest ordering on/off"
                >
                  <span className={`w-2 h-2 rounded-full ${currentEvent.isOrderingOpen ? 'bg-slate-950 animate-pulse' : 'bg-white'}`} />
                  <span>{currentEvent.isOrderingOpen ? 'Live Ordering Open' : 'Ordering Paused'}</span>
                </button>

                {/* Manual Refresh */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadTerminalData()}
                  disabled={loadingTerminalData}
                  className="bg-[#121620] border-[#252f42] text-slate-300 hover:text-white text-xs h-9 px-3 flex items-center gap-1.5"
                  title="Refresh order and table status"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingTerminalData ? 'animate-spin text-amber-400' : ''}`} />
                  <span>Refresh</span>
                </Button>

                {/* Setup Readiness Toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsReadinessOpen(!isReadinessOpen)}
                  className={`text-xs h-9 px-3 flex items-center gap-1.5 border transition-colors ${
                    isReadinessOpen
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-[#121620] border-[#252f42] text-slate-300 hover:text-white'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Readiness {readinessData?.isFullyReady ? '(Ready ✓)' : '(Review)'}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isReadinessOpen ? 'rotate-180' : ''}`} />
                </Button>

                {/* Extend Duration */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setExtendingEvent(currentEvent);
                    setExtensionMinutes(60);
                    setExtensionReason('Host requested dining extension');
                    setCustomExtensionDate(currentEvent.endDate || currentEvent.eventDate);
                    setCustomExtensionTime(currentEvent.endTime || '23:30');
                  }}
                  className="bg-[#121620] border-[#252f42] text-amber-300 hover:text-amber-200 text-xs h-9 px-3 flex items-center gap-1.5"
                >
                  <Timer className="w-3.5 h-3.5 text-amber-400" />
                  <span>Extend</span>
                </Button>
              </>
            )}

            {/* Create New Event */}
            <Button
              variant="brand"
              onClick={handleOpenNewWizard}
              className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-950 font-bold shadow-lg shadow-amber-500/20 px-3.5 py-2 text-xs flex items-center gap-1.5 h-9"
            >
              <Plus className="w-4 h-4" />
              <span>New Event</span>
            </Button>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* COMPACT SETUP & READINESS CHECKLIST PANEL (EXPANDABLE) */}
        {/* ======================================================================= */}
        {isReadinessOpen && currentEvent && (
          <div className="mt-5 pt-5 border-t border-[#262f40] animate-fadeIn">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  8-Point Event Setup & Station Readiness
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                    readinessData?.isFullyReady
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {readinessData?.isFullyReady ? 'ALL CHECKS PASSED · READY TO SERVE' : 'SETUP ACTION REQUIRED'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Authoritative verification verified by backend before opening dining.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* 1. Event Details */}
              <div className="bg-[#10141d] border border-[#202838] rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200">1. Details</span>
                    <span className="text-emerald-400">✓ Ready</span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{currentEvent.title}</p>
                </div>
                <button
                  onClick={() => handleOpenEditWizard(currentEvent)}
                  className="text-[10px] text-amber-400 hover:text-amber-300 text-left mt-2 font-medium"
                >
                  Edit Details →
                </button>
              </div>

              {/* 2. Catering Kitchen */}
              <div className="bg-[#10141d] border border-[#202838] rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200">2. Caterer</span>
                    <span className="text-emerald-400">✓ Ready</span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{currentRestaurant?.name || 'Assigned Kitchen'}</p>
                </div>
                <span className="text-[10px] text-slate-500 mt-2 font-mono">ID: {currentRestaurant?.id.slice(-6)}</span>
              </div>

              {/* 3. Available Menu */}
              <div className="bg-[#10141d] border border-[#202838] rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200">3. Menu</span>
                    <span className={menuItems.length > 0 ? 'text-emerald-400' : 'text-amber-400'}>
                      {menuItems.length > 0 ? '✓ Ready' : '⚠ 0 Dishes'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{menuItems.length} dishes available</p>
                </div>
                {menuItems.length === 0 ? (
                  <button
                    onClick={handleSeedSampleMenu}
                    disabled={isSeedingMenu}
                    className="text-[10px] text-sky-400 hover:text-sky-300 text-left mt-2 font-bold"
                  >
                    {isSeedingMenu ? 'Seeding...' : '+ Seed 9 Dishes →'}
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-500 mt-2">Active catalog</span>
                )}
              </div>

              {/* 4. Event Tables */}
              <div className="bg-[#10141d] border border-[#202838] rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200">4. Tables</span>
                    <span className={terminalTables.length > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {terminalTables.length > 0 ? '✓ Ready' : '✕ None'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{terminalTables.length} dedicated tables</p>
                </div>
                <button
                  onClick={() => setTerminalView('tables')}
                  className="text-[10px] text-amber-400 hover:text-amber-300 text-left mt-2 font-medium"
                >
                  Manage Tables →
                </button>
              </div>

              {/* 5. Table QR Codes */}
              <div className="bg-[#10141d] border border-[#202838] rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200">5. QRs</span>
                    <span className="text-emerald-400">✓ Ready</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{terminalTables.length} QR Standees</p>
                </div>
                <button
                  onClick={() => setIsPrintModalOpen(true)}
                  className="text-[10px] text-amber-400 hover:text-amber-300 text-left mt-2 font-medium"
                >
                  Print Standees →
                </button>
              </div>

              {/* 6. Stations Enabled */}
              <div className="bg-[#10141d] border border-[#202838] rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200">6. Stations</span>
                    <span className="text-emerald-400">✓ Ready</span>
                  </div>
                  <p className="text-[11px] text-slate-400">Kitchen · Bar · Hookah</p>
                </div>
                <span className="text-[10px] text-slate-500 mt-2">Auto-routed</span>
              </div>

              {/* 7. Service Window */}
              <div className="bg-[#10141d] border border-[#202838] rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200">7. Window</span>
                    <span className="text-emerald-400">✓ Configured</span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">{currentEvent.startTime} - {currentEvent.endTime}</p>
                </div>
                <span className="text-[10px] text-slate-500 mt-2 font-mono">{currentEvent.timezone || 'IST'}</span>
              </div>

              {/* 8. Publication */}
              <div className="bg-[#10141d] border border-[#202838] rounded-xl p-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200">8. Status</span>
                    <span className={currentEvent.isOrderingOpen ? 'text-emerald-400' : 'text-amber-400'}>
                      {currentEvent.isOrderingOpen ? '✓ Open' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{currentEvent.status}</p>
                </div>
                <button
                  onClick={() => handleToggleOrdering(currentEvent)}
                  className="text-[10px] text-amber-400 hover:text-amber-300 text-left mt-2 font-medium"
                >
                  {currentEvent.isOrderingOpen ? 'Pause Orders' : 'Open Orders'} →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* LIVE SUMMARY KPI METRICS (CALCULATED FROM PERSISTED ORDERS) */}
        {/* ======================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-[#262f40]">
          {/* New Orders */}
          <div
            onClick={() => {
              setTerminalView('orders');
              setOrderSubFilter('NEW');
            }}
            className={`cursor-pointer rounded-xl p-3.5 transition-all border ${
              terminalView === 'orders' && orderSubFilter === 'NEW'
                ? 'bg-sky-500/15 border-sky-500/50'
                : 'bg-[#10141d]/80 border-[#202838] hover:border-sky-500/30'
            }`}
          >
            <p className="text-[11px] font-mono text-sky-400 uppercase font-semibold flex items-center justify-between">
              <span>New Orders</span>
              <span className="w-2 h-2 rounded-full bg-sky-400" />
            </p>
            <p className="text-2xl font-bold text-white mt-1">{liveMetrics.newOrders}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Awaiting station start</p>
          </div>

          {/* Preparing */}
          <div
            onClick={() => {
              setTerminalView('orders');
              setOrderSubFilter('PREPARING');
            }}
            className={`cursor-pointer rounded-xl p-3.5 transition-all border ${
              terminalView === 'orders' && orderSubFilter === 'PREPARING'
                ? 'bg-amber-500/15 border-amber-500/50'
                : 'bg-[#10141d]/80 border-[#202838] hover:border-amber-500/30'
            }`}
          >
            <p className="text-[11px] font-mono text-amber-400 uppercase font-semibold flex items-center justify-between">
              <span>Preparing</span>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            </p>
            <p className="text-2xl font-bold text-white mt-1">{liveMetrics.preparing}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Cooking / In production</p>
          </div>

          {/* Ready to Deliver */}
          <div
            onClick={() => {
              setTerminalView('delivery');
            }}
            className={`cursor-pointer rounded-xl p-3.5 transition-all border ${
              terminalView === 'delivery'
                ? 'bg-emerald-500/20 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                : 'bg-[#10141d]/80 border-emerald-500/30 hover:border-emerald-500/50'
            }`}
          >
            <p className="text-[11px] font-mono text-emerald-400 uppercase font-bold flex items-center justify-between">
              <span>Ready to Deliver</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            </p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{liveMetrics.readyToDeliver}</p>
            <p className="text-[10px] text-slate-300 mt-0.5">All required stations ready</p>
          </div>

          {/* Delivered */}
          <div
            onClick={() => {
              setTerminalView('orders');
              setOrderSubFilter('DELIVERED');
            }}
            className={`cursor-pointer rounded-xl p-3.5 transition-all border ${
              terminalView === 'orders' && orderSubFilter === 'DELIVERED'
                ? 'bg-purple-500/15 border-purple-500/50'
                : 'bg-[#10141d]/80 border-[#202838] hover:border-purple-500/30'
            }`}
          >
            <p className="text-[11px] font-mono text-purple-400 uppercase font-semibold flex items-center justify-between">
              <span>Delivered</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
            </p>
            <p className="text-2xl font-bold text-white mt-1">{liveMetrics.delivered}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Served to guest tables</p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3 PRIMARY OPERATIONAL VIEW TABS & TOOLBAR */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#11151e] border border-[#1e2533] p-2.5 rounded-xl">
        {/* Navigation View Switcher */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setTerminalView('orders')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              terminalView === 'orders'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161c27]'
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>Live Orders ({terminalOrders.length})</span>
          </button>

          <button
            onClick={() => setTerminalView('tables')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              terminalView === 'tables'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161c27]'
            }`}
          >
            <TableProperties className="w-3.5 h-3.5" />
            <span>Tables & Floorplan ({terminalTables.length})</span>
          </button>

          <button
            onClick={() => setTerminalView('delivery')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
              terminalView === 'delivery'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#161c27]'
            }`}
          >
            <Truck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Delivery Dispatch ({deliveryOrders.length})</span>
            {deliveryOrders.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search table, order #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPrintModalOpen(true)}
            className="text-xs bg-[#151a25] border-[#252f40] text-slate-300 hover:text-white h-8 px-2.5 flex items-center gap-1.5"
            title="Print Standees"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Print QRs</span>
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* OPERATIONAL VIEW 1: LIVE ORDERS STREAM */}
      {/* ========================================================================= */}
      {terminalView === 'orders' && (
        <div className="space-y-4">
          {/* Sub-Filters: All, New, Preparing, Ready, Delivered */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
            {(['ALL', 'NEW', 'PREPARING', 'READY', 'DELIVERED'] as const).map((filterKey) => (
              <button
                key={filterKey}
                onClick={() => setOrderSubFilter(filterKey)}
                className={`px-3 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  orderSubFilter === filterKey
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#151922]'
                }`}
              >
                {filterKey === 'ALL' && 'All Orders'}
                {filterKey === 'NEW' && `New (${liveMetrics.newOrders})`}
                {filterKey === 'PREPARING' && `Preparing (${liveMetrics.preparing})`}
                {filterKey === 'READY' && `Ready to Deliver (${liveMetrics.readyToDeliver})`}
                {filterKey === 'DELIVERED' && `Delivered (${liveMetrics.delivered})`}
              </button>
            ))}
          </div>

          {filteredTerminalOrders.length === 0 ? (
            <div className="bg-[#121620] border border-[#1e2533] rounded-2xl p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#18202d] text-slate-400 flex items-center justify-center mx-auto">
                <UtensilsCrossed className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-white">No Orders Found</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {orderSubFilter !== 'ALL'
                  ? `There are currently no orders in the '${orderSubFilter}' queue for this event.`
                  : 'Guests scanning table QR standees will submit orders here. All orders flow directly into Kitchen, Bar, and Hookah queues.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredTerminalOrders.map((ord) => {
                const prog = getStationProgress(ord);
                const isReady = prog.isFullyReady || ord.status === 'READY';
                const isDelivered = ord.status === 'DELIVERED' || ord.status === 'COMPLETED';

                return (
                  <div
                    key={ord.id}
                    className={`bg-[#131722] border rounded-2xl p-5 shadow-lg transition-all flex flex-col justify-between space-y-4 ${
                      isDelivered
                        ? 'border-[#1f2838] opacity-80'
                        : isReady
                        ? 'border-emerald-500/50 shadow-emerald-500/5'
                        : 'border-[#232c3d]'
                    }`}
                  >
                    <div>
                      {/* Card Header: Table Badge, Order #, Time Received */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-mono font-bold text-sm border border-amber-500/40">
                            Table {cleanTableBadge(ord.tableNumber)}
                          </span>
                          <div>
                            <span className="text-xs font-bold text-white font-mono">
                              {ord.displayOrderNumber || ord.id.slice(-6)}
                            </span>
                            <p className="text-[10px] text-slate-400">
                              {formatReceivedTime(ord.createdAt)}
                            </p>
                          </div>
                        </div>

                        {/* Overall Status Badge */}
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold ${
                            isDelivered
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : isReady
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                              : ord.status === 'PREPARING'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          }`}
                        >
                          {isDelivered
                            ? 'DELIVERED ✓'
                            : isReady
                            ? 'READY FOR DELIVERY'
                            : ord.status}
                        </span>
                      </div>

                      {/* Guest Notes */}
                      {ord.notes && (
                        <div className="mt-2.5 bg-[#0d1017] p-2 rounded-lg border border-[#1b2230] text-[11px] text-amber-200/90 italic flex items-start gap-1.5">
                          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>{ord.notes}</span>
                        </div>
                      )}

                      {/* ========================================================= */}
                      {/* STATION COORDINATION BOX (Kitchen, Bar, Hookah) */}
                      {/* ========================================================= */}
                      <div className="mt-3 bg-[#0c0f16] p-3 rounded-xl border border-[#1c2434] space-y-2">
                        <div className="flex items-center justify-between text-[11px] border-b border-[#18202d] pb-1.5">
                          <span className="font-semibold text-slate-300 flex items-center gap-1.5 font-mono uppercase text-[10px]">
                            <Layers className="w-3 h-3 text-amber-400" />
                            Station Coordination
                          </span>
                          <span
                            className={`text-[10px] font-mono font-semibold ${
                              isReady ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {isReady
                              ? 'All Stations Ready ✓'
                              : 'In Production'}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                          {/* Kitchen */}
                          <div className="p-1.5 rounded-lg bg-[#111622] border border-[#20293b]">
                            <div className="text-slate-400 font-semibold mb-0.5">Kitchen</div>
                            <span
                              className={`font-mono font-bold ${
                                prog.kitchenStatus === 'NOT_REQUIRED'
                                  ? 'text-slate-600'
                                  : ['READY', 'COMPLETED', 'DELIVERED'].includes(prog.kitchenStatus)
                                  ? 'text-emerald-400'
                                  : prog.kitchenStatus === 'PREPARING'
                                  ? 'text-amber-400'
                                  : 'text-sky-400'
                              }`}
                            >
                              {prog.kitchenStatus === 'NOT_REQUIRED' ? 'Not Required' : prog.kitchenStatus}
                            </span>
                          </div>

                          {/* Bar */}
                          <div className="p-1.5 rounded-lg bg-[#111622] border border-[#20293b]">
                            <div className="text-slate-400 font-semibold mb-0.5">Bar</div>
                            <span
                              className={`font-mono font-bold ${
                                prog.barStatus === 'NOT_REQUIRED'
                                  ? 'text-slate-600'
                                  : ['READY', 'COMPLETED', 'DELIVERED'].includes(prog.barStatus)
                                  ? 'text-emerald-400'
                                  : prog.barStatus === 'PREPARING'
                                  ? 'text-amber-400'
                                  : 'text-sky-400'
                              }`}
                            >
                              {prog.barStatus === 'NOT_REQUIRED' ? 'Not Required' : prog.barStatus}
                            </span>
                          </div>

                          {/* Hookah */}
                          <div className="p-1.5 rounded-lg bg-[#111622] border border-[#20293b]">
                            <div className="text-slate-400 font-semibold mb-0.5">Hookah</div>
                            <span
                              className={`font-mono font-bold ${
                                prog.hookahStatus === 'NOT_REQUIRED'
                                  ? 'text-slate-600'
                                  : ['READY', 'COMPLETED', 'DELIVERED'].includes(prog.hookahStatus)
                                  ? 'text-emerald-400'
                                  : prog.hookahStatus === 'PREPARING'
                                  ? 'text-amber-400'
                                  : 'text-sky-400'
                              }`}
                            >
                              {prog.hookahStatus === 'NOT_REQUIRED' ? 'Not Required' : prog.hookahStatus}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Items List */}
                      <div className="mt-3 space-y-1.5">
                        {(ord.items || []).map((it, idx) => {
                          const itDest = (it.targetDestination || (it as any).target_destination || 'KITCHEN').toUpperCase();
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-[#0e121a] border border-[#1b2230]"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-amber-300 w-5">
                                  {it.quantity}x
                                </span>
                                <span className="text-slate-200 font-medium">{it.name}</span>
                                {it.notes && (
                                  <span className="text-[10px] text-amber-200/80 italic">({it.notes})</span>
                                )}
                              </div>

                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${
                                  itDest === 'HOOKAH'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : itDest === 'BAR'
                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                }`}
                              >
                                {itDest}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Order Action Buttons */}
                    <div className="pt-3 border-t border-[#1e2533] flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-400">
                        {ord.claimedBy && (
                          <span>
                            Claimed by <strong className="text-slate-200">{ord.claimedBy}</strong>
                          </span>
                        )}
                        {ord.deliveredAt && (
                          <span className="text-purple-300 font-medium ml-1">
                            · Delivered at {new Date(ord.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!isDelivered && (
                          <>
                            {!ord.claimedBy && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleClaimOrder(ord)}
                                disabled={isUpdatingStatus[ord.id]}
                                className="text-xs bg-[#171c26] border-[#293244] text-slate-200 hover:text-white h-8 px-3"
                              >
                                {isUpdatingStatus[ord.id] ? 'Claiming...' : 'Claim Order'}
                              </Button>
                            )}

                            {isReady && (
                              <Button
                                variant="brand"
                                size="sm"
                                onClick={() => handleConfirmDelivered(ord)}
                                disabled={isUpdatingStatus[ord.id]}
                                className="text-xs bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold h-8 px-3.5 shadow-md flex items-center gap-1.5"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{isUpdatingStatus[ord.id] ? 'Saving...' : 'Confirm Delivered'}</span>
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* OPERATIONAL VIEW 2: TABLES & FLOORPLAN GRID */}
      {/* ========================================================================= */}
      {terminalView === 'tables' && (
        <div className="space-y-4">
          {/* Studio Actions Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#10141d] p-3.5 rounded-xl border border-[#1e2535]">
            <div>
              <p className="text-xs font-semibold text-white">Event Table Grid ({terminalTables.length} Tables)</p>
              <p className="text-[10px] text-slate-400">
                Persistent banquet table tokens decoupled from daily restaurant dining. Click any table to inspect orders and view its QR standee.
              </p>
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

          {/* Add Table Form */}
          <div className="bg-[#121622] border border-[#232c3d] p-3 rounded-xl flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-medium text-slate-300">Add Banquet Table:</span>
            <input
              type="text"
              placeholder="Number (e.g. 16 or VIP-2)"
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
              onClick={handleAddTableToEvent}
              disabled={isAddingTable || !newTableNumber.trim()}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold h-7 px-3"
            >
              {isAddingTable ? 'Adding...' : 'Add Table'}
            </Button>
          </div>

          {/* Tables Visual Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {terminalTables.map((tbl) => {
              const cleanNum = cleanTableBadge(tbl.tableNumber);
              const tblOrders = terminalOrders.filter((o) => cleanTableBadge(o.tableNumber) === cleanNum);
              const activeTblOrders = tblOrders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
              const hasReady = activeTblOrders.some((o) => getStationProgress(o).isFullyReady || o.status === 'READY');
              const hasPrep = activeTblOrders.some((o) => o.status === 'PREPARING');

              return (
                <div
                  key={tbl.id}
                  onClick={() => setSelectedTableDetail(tbl)}
                  className={`cursor-pointer rounded-2xl p-4 border transition-all flex flex-col justify-between space-y-3 relative overflow-hidden ${
                    hasReady
                      ? 'bg-emerald-500/10 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                      : hasPrep
                      ? 'bg-amber-500/10 border-amber-500/50'
                      : activeTblOrders.length > 0
                      ? 'bg-sky-500/10 border-sky-500/40'
                      : tblOrders.length > 0
                      ? 'bg-[#121622] border-[#222b3b]'
                      : 'bg-[#0f131c] border-[#1d2433] hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-lg font-bold text-white font-mono">
                        Table {cleanNum}
                      </p>
                      {tbl.tableLabel && tbl.tableLabel !== `Table ${cleanNum}` && (
                        <p className="text-[11px] text-amber-200/90 font-serif italic truncate max-w-[130px]">
                          {tbl.tableLabel}
                        </p>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono">
                      {tbl.capacity || 8} seats
                    </span>
                  </div>

                  <div>
                    {/* Status Indicator */}
                    <div className="flex items-center justify-between text-[11px]">
                      <span
                        className={`font-mono font-bold ${
                          hasReady
                            ? 'text-emerald-400 animate-pulse'
                            : hasPrep
                            ? 'text-amber-400'
                            : activeTblOrders.length > 0
                            ? 'text-sky-400'
                            : tblOrders.length > 0
                            ? 'text-purple-300'
                            : 'text-slate-500'
                        }`}
                      >
                        {hasReady
                          ? '● Ready to Deliver'
                          : hasPrep
                          ? '● Preparing'
                          : activeTblOrders.length > 0
                          ? '● Orders Placed'
                          : tblOrders.length > 0
                          ? 'Delivered'
                          : 'Available'}
                      </span>

                      <span className="font-mono text-slate-300 text-[10px]">
                        {activeTblOrders.length} active
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 mt-2 flex items-center justify-between border-t border-white/5 pt-1.5">
                      <span>Inspect table →</span>
                      <QrCode className="w-3.5 h-3.5 text-amber-400" />
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OPERATIONAL VIEW 3: DELIVERY DISPATCH TERMINAL */}
      {/* ========================================================================= */}
      {terminalView === 'delivery' && (
        <div className="space-y-4">
          <div className="bg-[#10141d] border border-emerald-500/30 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white font-mono uppercase tracking-wide">
                  Banquet Delivery Dispatch
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Orders with all required kitchen and bar stations ready. Claim order, mark out for delivery, and confirm table delivery.
              </p>
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                {deliveryOrders.length} Orders Ready
              </span>
            </div>
          </div>

          {deliveryOrders.length === 0 ? (
            <div className="bg-[#121620] border border-[#1e2533] rounded-2xl p-16 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white">All Orders Dispatched</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                No orders are currently waiting for table delivery. As kitchen chefs and bartenders complete prep, ready orders will immediately alert here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deliveryOrders.map((ord) => {
                const prog = getStationProgress(ord);
                const isOut = ord.status === 'OUT_FOR_DELIVERY' || ord.deliveryStatus === 'OUT_FOR_DELIVERY';

                return (
                  <div
                    key={ord.id}
                    className="bg-gradient-to-br from-[#121824] to-[#0f131c] border-2 border-emerald-500/60 rounded-2xl p-6 shadow-xl space-y-4 flex flex-col justify-between"
                  >
                    <div>
                      {/* Event & Table Banner */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-2xl font-black text-white font-mono tracking-tight">
                              TABLE {cleanTableBadge(ord.tableNumber)}
                            </span>
                            <span className="text-xs font-sans px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-extrabold uppercase">
                              READY FOR DELIVERY
                            </span>
                          </div>
                          <p className="text-xs text-amber-300 font-mono font-bold mt-0.5">
                            {selectedEvent?.title || ord.eventName || 'Wedding & Banquet'}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">
                            Order #{ord.displayOrderNumber || ord.id.slice(-6)} · {formatReceivedTime(ord.createdAt)}
                          </p>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-mono text-emerald-400 font-bold block">
                            {ord.items?.length || 0} Items
                          </span>
                          <span className="text-[11px] text-slate-300">{ord.customerName}</span>
                          {ord.claimedBy && (
                            <span className="mt-1 inline-block text-[10px] font-mono font-bold text-amber-300 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30">
                              Claimed by {ord.claimedBy}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Items to Deliver */}
                      <div className="mt-4 bg-[#090c12] p-3 rounded-xl border border-[#1a2333] space-y-2">
                        <div className="text-[11px] font-mono text-slate-400 uppercase font-semibold">
                          Items to Deliver:
                        </div>
                        {(ord.items || []).map((it, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs text-slate-200">
                            <span className="font-semibold text-white">
                              {it.quantity}x {it.name}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              {it.targetDestination || 'KITCHEN'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Station Readiness Status */}
                      <div className="mt-3 flex items-center gap-2 text-xs text-emerald-300 font-mono">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>All station items prepared and verified</span>
                      </div>
                    </div>

                    {/* Big Touch-Friendly Action Buttons */}
                    <div className="space-y-2 pt-2 border-t border-[#1c2434]">
                      {!ord.claimedBy && !isOut && (
                        <Button
                          variant="outline"
                          onClick={() => handleClaimOrder(ord)}
                          disabled={isUpdatingStatus[ord.id]}
                          className="w-full bg-[#181d27] border-amber-500/40 text-amber-300 font-bold text-xs h-10 rounded-xl hover:bg-amber-500/10"
                        >
                          Claim Delivery Task
                        </Button>
                      )}

                      {!isOut ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            onClick={() => handleOutForDelivery(ord)}
                            disabled={isUpdatingStatus[ord.id]}
                            className="bg-[#171e2c] border-emerald-500/40 text-emerald-300 font-bold text-xs h-12 rounded-xl hover:bg-emerald-500/10"
                          >
                            Mark Out for Delivery
                          </Button>
                          <Button
                            variant="brand"
                            onClick={() => handleConfirmDelivered(ord)}
                            disabled={isUpdatingStatus[ord.id]}
                            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs h-12 rounded-xl shadow-lg shadow-emerald-500/20"
                          >
                            Confirm Delivered ✓
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="brand"
                          onClick={() => handleConfirmDelivered(ord)}
                          disabled={isUpdatingStatus[ord.id]}
                          className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-sm h-14 rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
                        >
                          <Check className="w-5 h-5 stroke-[3]" />
                          <span>Delivered to Table {cleanTableBadge(ord.tableNumber)} ✓</span>
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

      {/* ========================================================================= */}
      {/* TABLE DETAIL & QR DRAWER / MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!selectedTableDetail}
        onClose={() => setSelectedTableDetail(null)}
        title={`Table ${cleanTableBadge(selectedTableDetail?.tableNumber)} — Banquet Table Detail`}
        maxWidth="2xl"
      >
        {selectedTableDetail && currentEvent && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#10141d] p-4 rounded-xl border border-[#1e2535]">
              <div>
                <h3 className="text-lg font-bold text-white font-mono">
                  Table {cleanTableBadge(selectedTableDetail.tableNumber)}
                </h3>
                <p className="text-xs text-amber-200/90 font-serif italic">
                  {selectedTableDetail.tableLabel || `Table ${selectedTableDetail.tableNumber}`} · {selectedTableDetail.capacity || 8} Seats
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopyLink(getEventGuestUrl(currentEvent.id, selectedTableDetail.tableNumber))}
                  className="bg-[#151a24] text-slate-300 text-xs h-8 px-2.5 flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </Button>

                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => handleDownloadQR(selectedTableDetail.tableNumber, `detail-qr-canvas-${selectedTableDetail.id}`)}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs h-8 px-3 flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Standee</span>
                </Button>
              </div>
            </div>

            {/* QR Canvas */}
            <div className="flex flex-col items-center justify-center p-6 bg-[#0a0d14] rounded-2xl border border-[#1c2333] space-y-3">
              <div className="bg-white p-3 rounded-xl shadow-lg border border-amber-300/40">
                <QRCodeCanvas
                  id={`detail-qr-canvas-${selectedTableDetail.id}`}
                  value={getEventGuestUrl(currentEvent.id, selectedTableDetail.tableNumber)}
                  size={180}
                  level="H"
                  marginSize={1}
                />
              </div>
              <p className="text-xs text-slate-300 font-mono">
                {getEventGuestUrl(currentEvent.id, selectedTableDetail.tableNumber)}
              </p>
              <a
                href={getEventGuestUrl(currentEvent.id, selectedTableDetail.tableNumber)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium"
              >
                <span>Open guest mobile ordering screen</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Table Orders */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-white font-mono uppercase tracking-wider">
                Orders for Table {cleanTableBadge(selectedTableDetail.tableNumber)} (
                {terminalOrders.filter((o) => cleanTableBadge(o.tableNumber) === cleanTableBadge(selectedTableDetail.tableNumber)).length}
                )
              </h4>

              {terminalOrders.filter((o) => cleanTableBadge(o.tableNumber) === cleanTableBadge(selectedTableDetail.tableNumber)).length === 0 ? (
                <p className="text-xs text-slate-500 italic">No orders received from this table yet.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {terminalOrders
                    .filter((o) => cleanTableBadge(o.tableNumber) === cleanTableBadge(selectedTableDetail.tableNumber))
                    .map((o) => (
                      <div
                        key={o.id}
                        className="bg-[#0e121a] p-3 rounded-xl border border-[#1b2230] flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-mono font-bold text-white">{o.displayOrderNumber}</span>
                          <span className="text-slate-400 ml-2">({(o.items || []).length} items)</span>
                          <div className="text-[11px] text-slate-400">{formatReceivedTime(o.createdAt)}</div>
                        </div>

                        <span
                          className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded ${
                            o.status === 'DELIVERED'
                              ? 'bg-purple-500/20 text-purple-300'
                              : o.status === 'READY'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {o.status}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#1e2533] flex justify-between items-center">
              <button
                onClick={() => handleDeleteTableFromEvent(selectedTableDetail.id)}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove Table</span>
              </button>

              <Button variant="outline" size="sm" onClick={() => setSelectedTableDetail(null)} className="text-xs">
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 4-STEP GUIDED EVENT SETUP & EDITING WIZARD MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        title={editingEventId ? 'Edit Wedding & Banquet Details' : 'Guided Event Ordering Setup'}
        maxWidth="2xl"
      >
        <div className="space-y-6">
          {/* Wizard Step Progress Bar */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { num: 1, label: '1. Event Details' },
              { num: 2, label: '2. Menu & Kitchen' },
              { num: 3, label: '3. Tables & QR' },
              { num: 4, label: '4. Review & Activate' },
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
                  placeholder="e.g. Aria & Julian's Wedding Banquet, or Tech Gala 2026"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Event Type</label>
                  <select
                    value={formEventType}
                    onChange={(e) => setFormEventType(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    {Object.entries(EVENT_TYPES).map(([code, meta]) => (
                      <option key={code} value={code}>
                        {meta.icon} {meta.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    {EVENT_TYPES[formEventType]?.honoreeLabel || 'Host / Honoree Names'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aria Montgomery & Julian Vance"
                    value={formCoupleNames}
                    onChange={(e) => setFormCoupleNames(e.target.value)}
                    className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Service Dates and Timings */}
              <div className="bg-[#0b0e14] border border-[#1e2535] rounded-xl p-3 space-y-3">
                <span className="text-xs font-semibold text-slate-200">Service Timings & Date</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Event Date <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="date"
                      value={formEventDate}
                      onChange={(e) => {
                        setFormEventDate(e.target.value);
                        if (!formIsMultiDay) setFormEndDate(e.target.value);
                      }}
                      className="w-full bg-[#121620] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="w-full bg-[#121620] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">End Time</label>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="w-full bg-[#121620] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Venue Name</label>
                  <input
                    type="text"
                    value={formVenueName}
                    onChange={(e) => setFormVenueName(e.target.value)}
                    placeholder={currentRestaurant?.name || 'Grand Ballroom'}
                    className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Estimated Guests</label>
                  <input
                    type="number"
                    min={1}
                    value={formEstimatedGuestCount}
                    onChange={(e) => setFormEstimatedGuestCount(parseInt(e.target.value) || 100)}
                    className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Theme Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Visual Palette & Styling</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {THEME_OPTIONS.map((th) => (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => setFormThemeColor(th.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                        formThemeColor === th.id
                          ? 'border-amber-400 bg-amber-500/15'
                          : 'border-[#222b3b] bg-[#0f131c] hover:border-slate-500'
                      }`}
                    >
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: th.accent }} />
                      <span className="text-xs text-white truncate font-medium">{th.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: MENU SELECTION & KITCHEN */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="bg-[#10141d] p-3.5 rounded-xl border border-[#20293b] space-y-2">
                <span className="text-xs font-semibold text-white">Guest Menu Availability</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormMenuSelectionType('FULL_MENU')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      formMenuSelectionType === 'FULL_MENU'
                        ? 'border-amber-500 bg-amber-500/15 text-white'
                        : 'border-[#20293b] bg-[#0c1017] text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs">Full Catering Menu</div>
                    <div className="text-[10px] mt-0.5">All dishes in catalog available to guests</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMenuSelectionType('RESTRICTED')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      formMenuSelectionType === 'RESTRICTED'
                        ? 'border-amber-500 bg-amber-500/15 text-white'
                        : 'border-[#20293b] bg-[#0c1017] text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs">Custom Curated Selection</div>
                    <div className="text-[10px] mt-0.5">Limit dining to specific dishes</div>
                  </button>
                </div>
              </div>

              {/* Station Routing Preview */}
              <div className="bg-[#0f141f] border border-[#20293b] rounded-xl p-3.5 space-y-3">
                <span className="text-xs font-semibold text-slate-200">Catalog Station Routing</span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-[#131926] border border-[#243044] rounded-lg">
                    <span className="text-amber-400 font-semibold">Kitchen KDS</span>
                    <p className="text-base font-bold text-white mt-1">
                      {menuItems.filter((i) => (i.targetDestination || (i.isAlcoholic ? 'BAR' : 'KITCHEN')) !== 'BAR').length} Dishes
                    </p>
                  </div>
                  <div className="p-3 bg-[#131926] border border-[#243044] rounded-lg">
                    <span className="text-purple-400 font-semibold">Bar Station</span>
                    <p className="text-base font-bold text-white mt-1">
                      {menuItems.filter((i) => (i.targetDestination || (i.isAlcoholic ? 'BAR' : 'KITCHEN')) === 'BAR').length} Beverages
                    </p>
                  </div>
                </div>

                {menuItems.length === 0 && (
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={handleSeedSampleMenu}
                    disabled={isSeedingMenu}
                    className="w-full bg-sky-500 hover:bg-sky-600 text-slate-950 font-semibold text-xs"
                  >
                    {isSeedingMenu ? 'Seeding...' : 'Seed Sample Banquet Dishes'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: TABLES & QR CODE PROVISIONING */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="bg-[#0d1017] p-3.5 rounded-xl border border-[#222b3b] space-y-2">
                <label className="block text-xs font-semibold text-slate-200">
                  Initial Dedicated Table Count
                </label>
                <p className="text-[11px] text-slate-400">
                  Each banquet table receives a dedicated token decoupled from ordinary restaurant seating.
                </p>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={formTableCount}
                  onChange={(e) => setFormTableCount(Math.max(1, parseInt(e.target.value) || 10))}
                  className="bg-[#131926] border border-[#28354a] rounded-lg px-3 py-1.5 text-sm text-white w-28 font-mono font-bold"
                />
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW & ACTIVATE */}
          {wizardStep === 4 && (
            <div className="space-y-4">
              <div className="bg-[#0e121a] p-4 rounded-xl border border-[#222c3e] space-y-3 text-xs">
                <span className="font-bold text-white uppercase font-mono">Banquet Configuration Summary</span>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div>Title: <strong className="text-white">{formTitle}</strong></div>
                  <div>Event Type: <strong className="text-white">{formEventType}</strong></div>
                  <div>Date: <strong className="text-white">{formEventDate}</strong></div>
                  <div>Timings: <strong className="text-white">{formStartTime} - {formEndTime}</strong></div>
                  <div>Tables: <strong className="text-white">{formTableCount}</strong></div>
                  <div>Caterer: <strong className="text-white">{currentRestaurant?.name}</strong></div>
                </div>
              </div>
            </div>
          )}

          {/* Wizard Footer Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-[#1e2533]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (wizardStep > 1) setWizardStep(wizardStep - 1);
                else setIsWizardOpen(false);
              }}
              className="text-xs bg-[#161c28] border-[#252f42] text-slate-300"
            >
              {wizardStep > 1 ? 'Back' : 'Cancel'}
            </Button>

            <div className="flex items-center gap-2">
              {wizardStep < 4 ? (
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => setWizardStep(wizardStep + 1)}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-4"
                >
                  Continue →
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSaveWizardEvent(true)}
                    disabled={isSaving}
                    className="text-xs bg-[#161c28] border-amber-500/40 text-amber-300"
                  >
                    Save Draft
                  </Button>
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => handleSaveWizardEvent(false)}
                    disabled={isSaving}
                    className="text-xs bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold px-4"
                  >
                    {isSaving ? 'Saving...' : editingEventId ? 'Save & Update' : 'Publish & Activate Event Ordering 🎉'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* EXTEND SERVICE PERIOD MODAL */}
      {/* ========================================================================= */}
      <Modal
        isOpen={!!extendingEvent}
        onClose={() => setExtendingEvent(null)}
        title="Extend Event Service Period"
        maxWidth="md"
      >
        {extendingEvent && (
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              Lengthen service duration for <strong>{extendingEvent.title}</strong> without losing active table associations or orders.
            </p>

            <div className="grid grid-cols-3 gap-2">
              {[30, 60, 120].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setExtensionMinutes(mins)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                    extensionMinutes === mins
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-[#121620] text-slate-400 border-[#222b3b]'
                  }`}
                >
                  +{mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Reason (Audited)</label>
              <input
                type="text"
                value={extensionReason}
                onChange={(e) => setExtensionReason(e.target.value)}
                className="w-full bg-[#0d1017] border border-[#232b3b] rounded-lg px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#1e2533]">
              <Button variant="outline" size="sm" onClick={() => setExtendingEvent(null)} className="text-xs">
                Cancel
              </Button>
              <Button
                variant="brand"
                size="sm"
                onClick={handleExtendServicePeriod}
                disabled={isExtending}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs"
              >
                {isExtending ? 'Extending...' : 'Confirm Extension'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* PRINT-READY STANDEE MODAL */}
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
              Formatted for standard A6 or cardstock standees. Click <strong>Print Standees</strong> to open browser print preview.
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

          <div className="grid grid-cols-2 gap-4 max-h-[500px] overflow-y-auto p-4 bg-slate-900 rounded-xl print:bg-white print:text-black print:overflow-visible print:max-h-none">
            {terminalTables.map((tbl) => {
              const guestUrl = getEventGuestUrl(currentEvent?.id || '', tbl.tableNumber);

              return (
                <div
                  key={tbl.id}
                  className="bg-[#faf8f5] text-slate-900 border-2 border-[#d4af37] rounded-2xl p-6 text-center space-y-3 shadow-md flex flex-col items-center justify-between page-break-inside-avoid"
                >
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-widest text-[#94762c] font-serif font-bold">
                      {currentEvent?.venueName || currentRestaurant?.name || 'Exclusive Banquet'}
                    </p>
                    <h3 className="text-base font-serif font-bold text-slate-900">
                      {currentEvent?.coupleNames || currentEvent?.title}
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
    </div>
  );
};

export default WeddingsTab;
