import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Users,
  Grid,
  UtensilsCrossed,
  ChefHat,
  Truck,
  Wine,
  Flame,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  ChevronDown,
  Layers,
  ArrowRight,
  RefreshCw,
  Search,
  Check,
  X,
  Share2,
  Copy,
  Printer,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  Sliders,
  DollarSign,
  Info,
  Bell,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button, Card, Badge, Modal, Input, DinelyLogo } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { realtimeBus } from '../../packages/api/realtime';
import { EventTableAssistanceTerminal } from './EventTableAssistanceTerminal';
import { EventBarTerminal } from './EventBarTerminal';
import { EventHookahTerminal } from './EventHookahTerminal';
import {
  WeddingEvent,
  EventTable,
  Order,
  Restaurant,
  User,
  MenuItem,
  MenuCategory,
  getFulfillmentStation,
} from '../../packages/types';
import { cleanTableBadge, WeddingsTab } from '../restaurant/WeddingsTab';
import { EventFloorplanTablesView } from '../restaurant/EventFloorplanTablesView';
import { EventDayManagementView } from '../restaurant/EventDayManagementView';

export interface WeddingEventPortalProps {
  activeRestaurant?: Restaurant | null;
  currentUser?: User | any;
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

export type EventPortalTab =
  | 'command_center'
  | 'day_management'
  | 'tables'
  | 'menu'
  | 'kitchen'
  | 'runner'
  | 'assistance'
  | 'bar'
  | 'hookah'
  | 'staff'
  | 'workspace_settings';

export const WeddingEventPortal: React.FC<WeddingEventPortalProps> = ({
  activeRestaurant,
  currentUser,
  onLogout,
  onNavigate,
}) => {
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(activeRestaurant || null);
  const restaurantId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';

  // Tab State
  const [activeTab, setActiveTab] = useState<EventPortalTab>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab')?.toLowerCase() as EventPortalTab;
      if ([
        'command_center',
        'day_management',
        'tables',
        'menu',
        'kitchen',
        'runner',
        'assistance',
        'bar',
        'hookah',
        'staff',
        'workspace_settings',
      ].includes(tabParam)) {
        return tabParam;
      }
      const p = window.location.pathname.toLowerCase();
      if (p.includes('/tables') || p.includes('/floorplan')) return 'tables';
      if (p.includes('/menu')) return 'menu';
      if (p.includes('/day') || p.includes('/schedule')) return 'day_management';
      if (p.includes('/kitchen') || p.includes('/kds')) return 'kitchen';
      if (p.includes('/runner') || p.includes('/delivery')) return 'runner';
      if (p.includes('/bar')) return 'bar';
      if (p.includes('/hookah') || p.includes('/shisha')) return 'hookah';
      if (p.includes('/staff')) return 'staff';
      if (p.includes('/settings') || p.includes('/setup')) return 'workspace_settings';
    }
    return 'command_center';
  });

  // Sync tab with URL
  useEffect(() => {
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      if (activeTab === 'command_center') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', activeTab);
      }
      window.history.replaceState(null, '', url.toString());
    }
  }, [activeTab]);

  // Events & Active Event Selection
  const [events, setEvents] = useState<WeddingEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [loadingEvents, setLoadingEvents] = useState<boolean>(true);

  // Event Scoped Data
  const [eventOrders, setEventOrders] = useState<Order[]>([]);
  const [eventTables, setEventTables] = useState<EventTable[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Toast Notification System
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error' | 'warning' | 'info'; title: string; message: string }>>([]);
  const addToast = useCallback((type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Active Assistance Requests Count (Real-time indicator)
  const [activeAssistanceCount, setActiveAssistanceCount] = useState<number>(0);
  const [togglingStation, setTogglingStation] = useState<string | null>(null);

  const loadAssistanceSummary = useCallback(async () => {
    if (!restaurantId || !selectedEventId) return;
    try {
      const res = await api.getEventAssistanceRequests(restaurantId, selectedEventId, 'ACTIVE');
      if (res && res.summary) {
        setActiveAssistanceCount(
          (res.summary.newRequestsCount ?? res.summary.new ?? 0) +
          (res.summary.inProgressCount ?? res.summary.inProgress ?? 0) +
          (res.summary.acknowledgedCount ?? res.summary.acknowledged ?? 0)
        );
      }
    } catch {
      // Non-blocking
    }
  }, [restaurantId, selectedEventId]);

  useEffect(() => {
    loadAssistanceSummary();
    const interval = setInterval(loadAssistanceSummary, 10000);
    return () => clearInterval(interval);
  }, [loadAssistanceSummary]);

  const handleToggleStation = async (field: 'hasFood' | 'hasBar' | 'hasHookah' | 'hasTableAssistance', currentValue?: boolean) => {
    if (!selectedEventId) return;
    const nextVal = currentValue === false ? true : false;
    setTogglingStation(field);
    try {
      const updated = await api.updateWeddingEvent(selectedEventId, { [field]: nextVal }, restaurantId);
      setEvents((prev) => prev.map((ev) => (ev.id === selectedEventId ? { ...ev, ...updated, [field]: nextVal } : ev)));
      addToast('success', 'Station Updated', `${field} has been ${nextVal ? 'enabled' : 'disabled'} for this banquet.`);
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Could not update station setting');
    } finally {
      setTogglingStation(null);
    }
  };

  // Staff Order Entry Modal State
  const [isStaffOrderModalOpen, setIsStaffOrderModalOpen] = useState<boolean>(false);
  const [staffOrderTable, setStaffOrderTable] = useState<string>('');
  const [staffOrderGuestName, setStaffOrderGuestName] = useState<string>('');
  const [staffOrderNotes, setStaffOrderNotes] = useState<string>('');
  const [staffOrderCart, setStaffOrderCart] = useState<Array<{ menuItemId: string; name: string; quantity: number; notes?: string }>>([]);
  const [isSubmittingStaffOrder, setIsSubmittingStaffOrder] = useState<boolean>(false);

  // Add / Edit Item Modal State
  const [isItemModalOpen, setIsItemModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemFormData, setItemFormData] = useState({
    name: '',
    description: '',
    price: '250',
    categoryId: '',
    dietaryType: 'VEG' as 'VEG' | 'NON_VEG',
    targetDestination: 'KITCHEN' as 'KITCHEN' | 'BAR' | 'HOOKAH',
    imageUrl: '',
    isAvailable: true,
  });
  const [isSavingItem, setIsSavingItem] = useState<boolean>(false);

  // Station Filter State for Event Menu Catalog
  const [menuStationFilter, setMenuStationFilter] = useState<'ALL' | 'KITCHEN' | 'BAR' | 'HOOKAH'>('ALL');
  const [menuSearchQuery, setMenuSearchQuery] = useState<string>('');

  // 1. Load Restaurant Details & Events
  const loadEvents = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setLoadingEvents(true);
      const evList = await api.getWeddingEvents(restaurantId);
      setEvents(evList);
      if (evList.length > 0) {
        // Default to first active or first event
        const active = evList.find((e) => e.status === 'ACTIVE') || evList[0];
        setSelectedEventId((prev) => (prev && evList.some((e) => e.id === prev) ? prev : active.id));
      }
    } catch (err: any) {
      console.error('[WeddingEventPortal] Failed to load events:', err);
      addToast('error', 'Error', err.message || 'Failed to load events.');
    } finally {
      setLoadingEvents(false);
    }
  }, [restaurantId, addToast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Selected Event Object
  const currentEvent = useMemo(() => {
    return events.find((e) => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  // 2. Load Event Scoped Data (Tables, Orders, Menu Items)
  const loadEventScopedData = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setLoadingData(true);
      const [fetchedTables, fetchedOrders, fetchedMenu] = await Promise.all([
        selectedEventId ? api.getEventTables(restaurantId, selectedEventId) : Promise.resolve([]),
        selectedEventId ? api.getOrders(restaurantId, { eventId: selectedEventId }) : api.getOrders(restaurantId),
        api.getMenuItems(restaurantId),
      ]);

      setEventTables(fetchedTables);

      // Filter orders strictly to this event (or all event orders if no event selected)
      const filtered = fetchedOrders.filter((o) => {
        const isEvOrder =
          o.orderType === 'WEDDING_EVENT' ||
          o.orderType === 'EVENT_ORDER' ||
          Boolean(o.eventId) ||
          Boolean((o as any).event_id);
        if (!selectedEventId) return isEvOrder;
        return (
          isEvOrder &&
          (o.eventId === selectedEventId ||
            (o as any).event_id === selectedEventId ||
            (!o.eventId && !(o as any).event_id))
        );
      });
      setEventOrders(filtered);
      setMenuItems(fetchedMenu);
    } catch (err: any) {
      console.error('[WeddingEventPortal] Error loading event-scoped data:', err);
    } finally {
      setLoadingData(false);
    }
  }, [restaurantId, selectedEventId]);

  useEffect(() => {
    loadEventScopedData();
    const interval = setInterval(loadEventScopedData, 15000);
    return () => clearInterval(interval);
  }, [loadEventScopedData]);

  // Subscribe to realtime order updates
  useEffect(() => {
    if (!restaurantId) return;
    realtimeBus.connect(restaurantId, 'OWNER');
    const unsubscribe = realtimeBus.subscribe((evt: any) => {
      const restId = evt.restaurantId || evt.restaurant_id;
      if (restId && String(restId).toLowerCase() === String(restaurantId).toLowerCase()) {
        loadEventScopedData();
      }
    });
    return () => unsubscribe();
  }, [restaurantId, loadEventScopedData]);

  // Toggle Event Live Status
  const handleToggleEventStatus = async (newStatus: 'ACTIVE' | 'PAUSED' | 'COMPLETED') => {
    if (!currentEvent || !restaurantId) return;
    try {
      const updated = await api.updateWeddingEvent(currentEvent.id, {
        status: newStatus,
        isOrderingOpen: newStatus === 'ACTIVE',
      }, restaurantId);
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      addToast('success', 'Status Updated', `Event service status changed to ${newStatus}.`);
    } catch (err: any) {
      addToast('error', 'Status Change Failed', err.message || 'Could not update event status.');
    }
  };

  // Staff Order Item Toggle in Cart
  const handleToggleStaffOrderItem = (item: MenuItem) => {
    setStaffOrderCart((prev) => {
      const existing = prev.find((i) => i.menuItemId === item.id);
      if (existing) {
        return prev.filter((i) => i.menuItemId !== item.id);
      }
      return [...prev, { menuItemId: item.id, name: item.name, quantity: 1 }];
    });
  };

  const handleUpdateStaffOrderQty = (menuItemId: string, delta: number) => {
    setStaffOrderCart((prev) =>
      prev
        .map((i) => {
          if (i.menuItemId === menuItemId) {
            const newQ = i.quantity + delta;
            return newQ > 0 ? { ...i, quantity: newQ } : null;
          }
          return i;
        })
        .filter(Boolean) as Array<{ menuItemId: string; name: string; quantity: number; notes?: string }>
    );
  };

  // Submit Staff Order (Zero Pricing, Real Event Order)
  const handleSubmitStaffOrder = async () => {
    if (!staffOrderTable) {
      addToast('error', 'Table Required', 'Please select a banquet table for this order.');
      return;
    }
    if (staffOrderCart.length === 0) {
      addToast('error', 'Items Required', 'Please select at least one course for this order.');
      return;
    }
    setIsSubmittingStaffOrder(true);
    try {
      const orderPayload = {
        restaurantId,
        eventId: selectedEventId || undefined,
        tableNumber: staffOrderTable,
        customerName: staffOrderGuestName.trim() || 'Guest (Staff Entered)',
        customerPhone: '',
        orderType: 'WEDDING_EVENT' as any,
        notes: staffOrderNotes.trim(),
        totalAmount: 0, // Event orders have zero billing
        items: staffOrderCart.map((i) => ({
          id: i.menuItemId,
          name: i.name,
          quantity: i.quantity,
          price: 0,
          notes: i.notes,
        })),
      };

      await api.createOrder(orderPayload);
      addToast('success', 'Order Submitted', `Event order sent to kitchen for Table ${cleanTableBadge(staffOrderTable)}.`);
      setIsStaffOrderModalOpen(false);
      setStaffOrderCart([]);
      setStaffOrderNotes('');
      setStaffOrderGuestName('');
      loadEventScopedData();
    } catch (err: any) {
      addToast('error', 'Order Submission Failed', err.message || 'Could not place staff order.');
    } finally {
      setIsSubmittingStaffOrder(false);
    }
  };

  // Open Add Item Modal
  const handleOpenAddItem = () => {
    setEditingItem(null);
    setItemFormData({
      name: '',
      description: '',
      price: '250',
      categoryId: categories[0]?.id || 'Starters & Appetizers',
      dietaryType: 'VEG',
      targetDestination: 'KITCHEN',
      imageUrl: '',
      isAvailable: true,
    });
    setIsItemModalOpen(true);
  };

  // Open Edit Item Modal
  const handleOpenEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name,
      description: item.description || '',
      price: item.price ? String(item.price) : '250',
      categoryId: item.categoryId || 'Starters & Appetizers',
      dietaryType: item.dietaryType || (item.isVegetarian !== false ? 'VEG' : 'NON_VEG'),
      targetDestination: item.targetDestination || (item.isAlcoholic ? 'BAR' : 'KITCHEN'),
      imageUrl: item.image || item.imageUrl || '',
      isAvailable: item.isAvailable !== false,
    });
    setIsItemModalOpen(true);
  };

  // Save Event Menu Item
  const handleSaveMenuItem = async () => {
    if (!itemFormData.name.trim()) {
      addToast('error', 'Validation Error', 'Dish or beverage name is required.');
      return;
    }
    const parsedPrice = parseFloat(String(itemFormData.price)) || 250;
    if (parsedPrice <= 0) {
      addToast('error', 'Validation Error', 'Item price must be greater than zero.');
      return;
    }
    setIsSavingItem(true);
    try {
      if (editingItem) {
        await api.updateMenuItem(editingItem.id, {
          name: itemFormData.name.trim(),
          description: itemFormData.description.trim(),
          categoryId: itemFormData.categoryId,
          dietaryType: itemFormData.dietaryType,
          isVegetarian: itemFormData.dietaryType === 'VEG',
          targetDestination: itemFormData.targetDestination,
          isAlcoholic: itemFormData.targetDestination === 'BAR',
          image: itemFormData.imageUrl.trim() || undefined,
          isAvailable: itemFormData.isAvailable,
          price: parsedPrice,
        });
        addToast('success', 'Item Updated', `${itemFormData.name} has been updated.`);
      } else {
        await api.addMenuItem({
          restaurantId,
          name: itemFormData.name.trim(),
          description: itemFormData.description.trim(),
          categoryId: itemFormData.categoryId || 'Starters & Appetizers',
          dietaryType: itemFormData.dietaryType,
          isVegetarian: itemFormData.dietaryType === 'VEG',
          targetDestination: itemFormData.targetDestination,
          isAlcoholic: itemFormData.targetDestination === 'BAR',
          image: itemFormData.imageUrl.trim() || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600',
          price: parsedPrice,
        });
        addToast('success', 'Item Added', `${itemFormData.name} added to banquet catalog.`);
      }
      setIsItemModalOpen(false);
      loadEventScopedData();
    } catch (err: any) {
      addToast('error', 'Save Failed', err.message || 'Could not save menu item.');
    } finally {
      setIsSavingItem(false);
    }
  };

  // Toggle Item Availability
  const handleToggleItemAvailability = async (item: MenuItem) => {
    try {
      const nextAvail = !item.isAvailable;
      await api.updateMenuItem(item.id, { isAvailable: nextAvail });
      setMenuItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, isAvailable: nextAvail } : m)));
      addToast('info', 'Availability Changed', `${item.name} is now ${nextAvail ? 'Available' : 'Unavailable'}.`);
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Could not toggle availability.');
    }
  };

  // Station progress calculations for Event Orders
  const getStationProgress = (order: Order) => {
    const items = order.items || [];
    const kitchenItems = items.filter((i) => getFulfillmentStation(i) === 'KITCHEN');
    const barItems = items.filter((i) => getFulfillmentStation(i) === 'BAR');
    const hookahItems = items.filter((i) => getFulfillmentStation(i) === 'HOOKAH');

    const kStatus = order.kitchenStatus || (kitchenItems.length === 0 ? 'NOT_APPLICABLE' : order.status);
    const bStatus = order.barStatus || (barItems.length === 0 ? 'NOT_APPLICABLE' : 'PENDING');
    const hStatus = order.hookahStatus || (hookahItems.length === 0 ? 'NOT_APPLICABLE' : 'PENDING');

    const isKitchenDone = kitchenItems.length === 0 || kStatus === 'READY' || (kStatus as any) === 'DELIVERED' || kStatus === 'COMPLETED';
    const isBarDone = barItems.length === 0 || bStatus === 'READY' || (bStatus as any) === 'DELIVERED' || bStatus === 'COMPLETED';
    const isHookahDone = hookahItems.length === 0 || hStatus === 'READY' || (hStatus as any) === 'DELIVERED' || hStatus === 'COMPLETED';

    const isFullyReady = isKitchenDone && isBarDone && isHookahDone;

    return {
      kitchenItems,
      barItems,
      hookahItems,
      kStatus,
      bStatus,
      hStatus,
      isFullyReady,
    };
  };

  // Advance Kitchen Station Status
  const handleAdvanceKitchenStatus = async (orderId: string, nextStatus: 'ACCEPTED' | 'PREPARING' | 'READY') => {
    if (!currentEvent || !restaurantId) return;
    try {
      await api.updateKitchenStatus(orderId, nextStatus);
      addToast('success', 'Station Updated', `Kitchen status updated to ${nextStatus}.`);
      loadEventScopedData();
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Could not advance station status.');
    }
  };

  // Advance Bar Station Status
  const handleAdvanceBarStatus = async (orderId: string, nextStatus: 'ACCEPTED' | 'PREPARING' | 'READY') => {
    if (!currentEvent || !restaurantId) return;
    try {
      await api.updateBarStatus(orderId, nextStatus);
      addToast('success', 'Bar Station Updated', `Drinks marked as ${nextStatus}.`);
      loadEventScopedData();
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Could not advance bar status.');
    }
  };

  // Advance Hookah Station Status
  const handleAdvanceHookahStatus = async (orderId: string, nextStatus: 'ACCEPTED' | 'PREPARING' | 'READY') => {
    if (!currentEvent || !restaurantId) return;
    try {
      await api.updateHookahStatus(orderId, nextStatus);
      addToast('success', 'Hookah Station Updated', `Hookah marked as ${nextStatus}.`);
      loadEventScopedData();
    } catch (err: any) {
      addToast('error', 'Update Failed', err.message || 'Could not advance hookah status.');
    }
  };

  // Advance Delivery Status
  const handleAdvanceDelivery = async (orderId: string, nextDeliveryStatus: 'OUT_FOR_DELIVERY' | 'DELIVERED') => {
    if (!currentEvent || !restaurantId) return;
    try {
      if (nextDeliveryStatus === 'DELIVERED') {
        await api.deliverOrder(orderId);
      } else {
        await api.updateOrderStatus(orderId, 'OUT_FOR_DELIVERY');
      }
      addToast('success', 'Delivery Updated', `Order marked as ${nextDeliveryStatus}.`);
      loadEventScopedData();
    } catch (err: any) {
      addToast('error', 'Delivery Update Failed', err.message || 'Could not update delivery.');
    }
  };

  // Filtered Menu Items for Banquet Catalog
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((i) => {
      const station = getFulfillmentStation(i);
      if (menuStationFilter === 'KITCHEN' && station !== 'KITCHEN') return false;
      if (menuStationFilter === 'BAR' && station !== 'BAR') return false;
      if (menuStationFilter === 'HOOKAH' && station !== 'HOOKAH') return false;

      if (menuSearchQuery.trim()) {
        const q = menuSearchQuery.toLowerCase();
        return i.name.toLowerCase().includes(q) || (i.description && i.description.toLowerCase().includes(q));
      }
      return true;
    });
  }, [menuItems, menuStationFilter, menuSearchQuery]);

  return (
    <div className="min-h-screen bg-[#0b0d13] text-slate-100 flex flex-col font-sans">
      {/* ========================================================================= */}
      {/* TOAST ALERTS */}
      {/* ========================================================================= */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-4 rounded-xl shadow-2xl text-xs max-w-sm flex items-start gap-3 border transition-all animate-in slide-in-from-top-2 duration-200 ${
              t.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
                : t.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
                : t.type === 'warning'
                ? 'bg-amber-950/90 text-amber-200 border-amber-500/40'
                : 'bg-slate-900/90 text-slate-200 border-slate-700'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : t.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            ) : (
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold">{t.title}</p>
              <p className="mt-0.5 opacity-90">{t.message}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* EVENT PORTAL TOP BAR (DISTINCT PRODUCT HEADER) */}
      {/* ========================================================================= */}
      <header className="h-16 bg-[#10131c] border-b border-[#1f2433] px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-amber-500/20">
            <Sparkles className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif font-bold text-sm tracking-wide text-white">
                Dinely · Wedding & Events
              </span>
              <Badge variant="brand" className="text-[9px] uppercase font-mono px-2 py-0 bg-amber-500/20 text-amber-300 border-amber-500/40">
                EVENT PORTAL
              </Badge>
            </div>
            <p className="text-[10px] text-slate-400 font-mono truncate max-w-xs sm:max-w-md">
              {currentRestaurant?.name || 'Grand Banquet Center'}
            </p>
          </div>
        </div>

        {/* Event Selector & Actions */}
        <div className="flex items-center gap-3">
          {events.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 bg-[#171b26] border border-[#272e42] rounded-xl px-3 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none font-medium cursor-pointer max-w-[200px] truncate"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id} className="bg-[#12151f] text-white">
                    {ev.title || ev.coupleNames || 'Untitled Event'} ({ev.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Service Window Control */}
          {currentEvent && (
            <div className="hidden md:flex items-center gap-1.5 bg-[#171b26] border border-[#272e42] rounded-xl p-1">
              {currentEvent.status === 'ACTIVE' ? (
                <button
                  onClick={() => handleToggleEventStatus('PAUSED')}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 flex items-center gap-1.5 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Ordering Active</span>
                </button>
              ) : currentEvent.status === 'PAUSED' ? (
                <button
                  onClick={() => handleToggleEventStatus('ACTIVE')}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 flex items-center gap-1.5 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Ordering Paused</span>
                </button>
              ) : (
                <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-slate-800 text-slate-300">
                  {currentEvent.status}
                </span>
              )}
            </div>
          )}

          {/* Staff Order Entry Trigger */}
          <Button
            size="sm"
            onClick={() => setIsStaffOrderModalOpen(true)}
            className="text-xs bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Enter Guest Order</span>
            <span className="sm:hidden">Order</span>
          </Button>

          {/* User / Sign Out */}
          <button
            onClick={onLogout}
            title="Sign Out of Event Portal"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MAIN CONTAINER: SIDEBAR + CONTENT VIEW */}
      {/* ========================================================================= */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-64 bg-[#0d1017] border-r border-[#191e2b] flex flex-col justify-between shrink-0 hidden lg:flex">
          <div className="p-4 space-y-6 overflow-y-auto">
            {/* Event Operations */}
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 px-3 mb-2">
                Event Operations
              </p>
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab('command_center')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'command_center'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Event Command Center</span>
                </button>

                <button
                  onClick={() => setActiveTab('day_management')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'day_management'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Event Day & Schedule</span>
                </button>

                <button
                  onClick={() => setActiveTab('tables')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'tables'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <Grid className="w-4 h-4 text-emerald-400" />
                  <span>Floorplan & Tables</span>
                </button>
              </nav>
            </div>

            {/* Event Station Terminals */}
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 px-3 mb-2">
                Fulfillment Stations
              </p>
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab('kitchen')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'kitchen'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ChefHat className="w-4 h-4 text-emerald-400" />
                    <span>Kitchen KDS Terminal</span>
                  </div>
                  {eventOrders.filter((o) => (o.status === 'PENDING' || o.status === 'ACCEPTED' || o.status === 'PREPARING')).length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                      {eventOrders.filter((o) => (o.status === 'PENDING' || o.status === 'ACCEPTED' || o.status === 'PREPARING')).length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('runner')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'runner'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Truck className="w-4 h-4 text-emerald-400" />
                    <span>Runner & Delivery</span>
                  </div>
                  {eventOrders.filter((o) => o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY').length > 0 && (
                    <span className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 font-bold text-[10px] flex items-center justify-center">
                      {eventOrders.filter((o) => o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY').length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('assistance')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'assistance'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4 text-amber-400" />
                    <span>Table Assistance</span>
                  </div>
                  {activeAssistanceCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center animate-pulse">
                      {activeAssistanceCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('bar')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'bar'
                      ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <Wine className="w-4 h-4 text-purple-400" />
                  <span>Bar Station Terminal</span>
                </button>

                <button
                  onClick={() => setActiveTab('hookah')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'hookah'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span>Hookah & Shisha Lounge</span>
                </button>
              </nav>
            </div>

            {/* Event Management */}
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 px-3 mb-2">
                Event Management
              </p>
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab('menu')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'menu'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <UtensilsCrossed className="w-4 h-4 text-amber-400" />
                  <span>Event Menu & Packages</span>
                </button>

                <button
                  onClick={() => setActiveTab('staff')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'staff'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>Event Staff & Roles</span>
                </button>

                <button
                  onClick={() => setActiveTab('workspace_settings')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    activeTab === 'workspace_settings'
                      ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-[#141824]'
                  }`}
                >
                  <Layers className="w-4 h-4 text-rose-400" />
                  <span>Stations & Setup</span>
                </button>
              </nav>
            </div>
          </div>

          {/* Footer Guest Link */}
          <div className="p-4 border-t border-[#191e2b] bg-[#090b10]">
            <a
              href={`/event/${selectedEventId || ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-3 rounded-xl bg-[#141824] hover:bg-[#1a2030] text-amber-300 text-xs font-medium flex items-center justify-between border border-amber-500/20 transition-colors"
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5" />
                Guest Menu Preview
              </span>
              <span className="text-[10px] font-mono text-slate-500">Live</span>
            </a>
          </div>
        </aside>

        {/* Content View */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#0b0d13]">
          {/* TAB 1: EVENT COMMAND CENTER */}
          {activeTab === 'command_center' && (
            <WeddingsTab
              currentRestaurant={currentRestaurant}
              currentUser={currentUser}
              addToast={(t: any) => {
                if (t && typeof t === 'object') {
                  addToast(t.type || 'info', t.title || '', t.message);
                }
              }}
            />
          )}

          {/* TAB 2: EVENT DAY & SCHEDULE */}
          {activeTab === 'day_management' && (
            <EventDayManagementView
              currentRestaurant={currentRestaurant}
              currentUser={currentUser}
              onNavigateTab={(t) => setActiveTab(t as EventPortalTab)}
              addToast={addToast}
            />
          )}

          {/* TAB 3: FLOORPLAN & TABLES */}
          {activeTab === 'tables' && (
            <EventFloorplanTablesView
              currentRestaurant={currentRestaurant}
              activeRestaurant={currentRestaurant}
              currentUser={currentUser}
              addToast={addToast}
              onNavigateToTab={(t) => setActiveTab(t as EventPortalTab)}
            />
          )}

          {/* TAB 4: EVENT MENU & PACKAGES (CLEAN OF ALL PRICES) */}
          {activeTab === 'menu' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                    <UtensilsCrossed className="w-5 h-5 text-amber-400" />
                    Banquet Menu & Dining Packages
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Manage food & beverage courses, banquet categories, dietary specifications, and live table availability. No prices or billing.
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <Button
                    variant="brand"
                    onClick={handleOpenAddItem}
                    className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Food / Drink Item</span>
                  </Button>
                </div>
              </div>

              {/* Station Filter & Search Bar */}
              <div className="bg-[#12151f] p-4 rounded-2xl border border-[#1f2536] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                  {(['ALL', 'KITCHEN', 'BAR', 'HOOKAH'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setMenuStationFilter(st)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium font-mono whitespace-nowrap transition-colors ${
                        menuStationFilter === st
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-[#181c2b] text-slate-400 border border-[#242b3d] hover:text-white'
                      }`}
                    >
                      {st === 'ALL' ? 'All Stations' : st === 'KITCHEN' ? 'Kitchen Food' : st === 'BAR' ? 'Bar & Drinks' : 'Hookah Lounge'}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search dishes or courses..."
                    value={menuSearchQuery}
                    onChange={(e) => setMenuSearchQuery(e.target.value)}
                    className="w-full bg-[#181c2b] border border-[#242b3d] rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Menu Items Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMenuItems.map((item) => {
                  const isVeg = item.dietaryType === 'VEG' || item.isVegetarian !== false;
                  const station = getFulfillmentStation(item);

                  return (
                    <Card
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all ${
                        item.isAvailable
                          ? 'bg-[#12151f] border-[#1f2536] hover:border-slate-700'
                          : 'bg-[#0f1118] border-[#181b24] opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${
                                isVeg ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-rose-400 shadow-sm shadow-rose-400/50'
                              }`}
                              title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                            />
                            <h4 className="font-bold text-sm text-white">{item.name}</h4>
                          </div>

                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {item.categoryId || 'Banquet Course'}
                            </Badge>
                            <Badge variant="brand" className="text-[10px] font-mono bg-amber-500/10 text-amber-300 border-amber-500/30">
                              ₹{typeof item.price === 'number' ? item.price.toFixed(2) : parseFloat(item.price as any || 250).toFixed(2)}
                            </Badge>
                            <span className="text-[10px] font-mono text-slate-400">
                              {station === 'BAR' ? '🍸 Bar Station' : station === 'HOOKAH' ? '💨 Hookah Station' : '🍳 Kitchen Station'}
                            </span>
                          </div>

                          {item.description && (
                            <p className="text-xs text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-16 h-16 rounded-xl object-cover border border-[#242b3d] shrink-0"
                          />
                        )}
                      </div>

                      {/* Availability & Actions */}
                      <div className="mt-4 pt-3 border-t border-[#1a1f2e] flex items-center justify-between gap-2">
                        <Button
                          size="sm"
                          variant={item.isAvailable ? 'secondary' : 'brand'}
                          onClick={() => handleToggleItemAvailability(item)}
                          className="text-xs"
                        >
                          {item.isAvailable ? 'Mark Unavailable (86)' : 'Enable for Guests'}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEditItem(item)}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" />
                          Edit Item
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {filteredMenuItems.length === 0 && (
                <div className="p-12 text-center bg-[#12151f] rounded-2xl border border-dashed border-[#242b3d] space-y-3">
                  <UtensilsCrossed className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-medium text-slate-300">No banquet courses found matching your filter.</p>
                  <Button variant="outline" onClick={handleOpenAddItem} className="text-xs">
                    + Add New Banquet Dish
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: EVENT KITCHEN TERMINAL */}
          {activeTab === 'kitchen' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                    <ChefHat className="w-5 h-5 text-emerald-400" />
                    Event Kitchen KDS Terminal
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Live food preparation queue for {currentEvent?.title || 'Current Event'}. Filtered strictly to event tickets with zero billing amounts.
                  </p>
                </div>

                <Badge variant="brand" className="text-xs font-mono">
                  {eventOrders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'DELIVERED').length} Active Tickets
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {eventOrders
                  .filter((o) => o.status !== 'COMPLETED' && o.status !== 'DELIVERED')
                  .map((order) => {
                    const prog = getStationProgress(order);
                    if (prog.kitchenItems.length === 0) return null;

                    return (
                      <Card key={order.id} className="p-4 rounded-2xl bg-[#12151f] border border-[#1f2536] space-y-3 shadow-lg">
                        <div className="flex items-center justify-between border-b border-[#1f2536] pb-2.5">
                          <span className="text-base font-bold font-mono text-amber-300">
                            Table {cleanTableBadge(order.tableNumber)}
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            #{order.id.slice(-6)}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                            Dish Courses ({prog.kitchenItems.length}):
                          </p>
                          {prog.kitchenItems.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-[#181c2b]">
                              <span className="font-medium text-white">{it.quantity}x {it.name}</span>
                              {it.notes && <span className="text-[10px] text-amber-300 italic">"{it.notes}"</span>}
                            </div>
                          ))}
                        </div>

                        {order.notes && (
                          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 italic">
                            Banquet Note: {order.notes}
                          </div>
                        )}

                        <div className="pt-2 flex items-center justify-between gap-2 border-t border-[#1f2536]">
                          <Badge variant={prog.kStatus === 'READY' ? 'success' : 'warning'} className="text-xs font-mono">
                            {prog.kStatus}
                          </Badge>

                          <div className="flex gap-2">
                            {prog.kStatus !== 'PREPARING' && prog.kStatus !== 'READY' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleAdvanceKitchenStatus(order.id, 'PREPARING')}
                                className="text-xs"
                              >
                                Start Prep
                              </Button>
                            )}
                            {prog.kStatus !== 'READY' && (
                              <Button
                                size="sm"
                                variant="brand"
                                onClick={() => handleAdvanceKitchenStatus(order.id, 'READY')}
                                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                              >
                                Mark Ready ✓
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
              </div>

              {eventOrders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'DELIVERED').length === 0 && (
                <div className="p-12 text-center bg-[#12151f] rounded-2xl border border-[#1f2536]">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-medium text-white">All event food tickets are fully prepared!</p>
                  <p className="text-xs text-slate-400 mt-1">New guest or staff table requests will appear here instantly.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: RUNNER & DELIVERY TERMINAL */}
          {activeTab === 'runner' && (
            <div className="space-y-6 max-w-7xl mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                    <Truck className="w-5 h-5 text-emerald-400" />
                    Runner & Table Delivery Dispatch
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Claim prepared courses and confirm delivery to banquet tables for {currentEvent?.title || 'Current Event'}.
                  </p>
                </div>

                <Badge variant="brand" className="text-xs font-mono">
                  {eventOrders.filter((o) => o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY').length} Ready to Deliver
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {eventOrders
                  .filter((o) => o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY')
                  .map((order) => (
                    <Card key={order.id} className="p-4 rounded-2xl bg-[#12151f] border border-[#1f2536] space-y-3">
                      <div className="flex items-center justify-between border-b border-[#1f2536] pb-2.5">
                        <span className="text-lg font-black font-mono text-emerald-400">
                          Table {cleanTableBadge(order.tableNumber)}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          #{order.id.slice(-6)}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Courses to Deliver:</p>
                        {order.items.map((it, idx) => (
                          <div key={idx} className="text-xs text-white font-medium py-0.5">
                            • {it.quantity}x {it.name}
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 flex items-center justify-between gap-2 border-t border-[#1f2536]">
                        <Badge variant={order.status === 'OUT_FOR_DELIVERY' ? 'warning' : 'success'} className="text-xs font-mono">
                          {order.status}
                        </Badge>

                        <div className="flex gap-2">
                          {order.status === 'READY' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAdvanceDelivery(order.id, 'OUT_FOR_DELIVERY')}
                              className="text-xs"
                            >
                              Claim Run
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="brand"
                            onClick={() => handleAdvanceDelivery(order.id, 'DELIVERED')}
                            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                          >
                            Delivered to Table ✓
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
              </div>

              {eventOrders.filter((o) => o.status === 'READY' || o.status === 'OUT_FOR_DELIVERY').length === 0 && (
                <div className="p-12 text-center bg-[#12151f] rounded-2xl border border-[#1f2536]">
                  <Truck className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-white">No orders currently awaiting runner delivery.</p>
                  <p className="text-xs text-slate-400 mt-1">Prepared tickets from Kitchen or Bar will appear here for dispatch.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 6B: EVENT TABLE ASSISTANCE TERMINAL */}
          {activeTab === 'assistance' && (
            <EventTableAssistanceTerminal
              restaurantId={restaurantId}
              eventId={selectedEventId}
              event={currentEvent}
              currentStaffName={currentUser?.name || currentUser?.email || 'Assistance Staff'}
              onToast={addToast}
            />
          )}

          {/* TAB 7: EVENT BAR TERMINAL */}
          {activeTab === 'bar' && (
            <EventBarTerminal
              restaurantId={restaurantId}
              eventId={selectedEventId}
              event={currentEvent}
              orders={eventOrders}
              menuItems={menuItems}
              currentStaffName={currentUser?.name || currentUser?.email || 'Bartender'}
              onUpdateStatus={handleAdvanceBarStatus}
              onRefresh={loadEventScopedData}
              onToast={addToast}
            />
          )}

          {/* TAB 8: EVENT HOOKAH TERMINAL */}
          {activeTab === 'hookah' && (
            <EventHookahTerminal
              restaurantId={restaurantId}
              eventId={selectedEventId}
              event={currentEvent}
              orders={eventOrders}
              menuItems={menuItems}
              currentStaffName={currentUser?.name || currentUser?.email || 'Hookah Staff'}
              onUpdateStatus={handleAdvanceHookahStatus}
              onRefresh={loadEventScopedData}
              onToast={addToast}
            />
          )}

          {/* TAB 9: EVENT STAFF & ROLES */}
          {activeTab === 'staff' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div>
                <h2 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-400" />
                  Event Staff & Roles
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Assign chefs, runners, and station leads to {currentEvent?.title || 'Current Event'}.
                </p>
              </div>

              <Card className="p-6 rounded-2xl bg-[#12151f] border border-[#1f2536] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-[#181c2b] border border-[#242b3d]">
                    <ChefHat className="w-5 h-5 text-emerald-400 mb-2" />
                    <p className="font-bold text-sm text-white">Banquet Chefs</p>
                    <p className="text-xs text-slate-400 mt-1">Kitchen station prep & bump controls</p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#181c2b] border border-[#242b3d]">
                    <Truck className="w-5 h-5 text-amber-400 mb-2" />
                    <p className="font-bold text-sm text-white">Table Runners</p>
                    <p className="text-xs text-slate-400 mt-1">Delivery claiming & table dispatch</p>
                  </div>
                  <div className="p-4 rounded-xl bg-[#181c2b] border border-[#242b3d]">
                    <Wine className="w-5 h-5 text-purple-400 mb-2" />
                    <p className="font-bold text-sm text-white">Bar & Lounge Leads</p>
                    <p className="text-xs text-slate-400 mt-1">Beverage & hookah service stations</p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 10: STATIONS & SETUP */}
          {activeTab === 'workspace_settings' && (
            <div className="space-y-6 max-w-5xl mx-auto">
              <div>
                <h2 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-rose-400" />
                  Event Stations & Workspace Configuration
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Enable or disable service stations for {currentEvent?.title || 'Current Event'}.
                </p>
              </div>

              <Card className="p-6 rounded-2xl bg-[#12151f] border border-[#1f2536] space-y-4">
                <div className="flex items-center justify-between p-4 rounded-xl bg-[#181c2b]">
                  <div>
                    <p className="font-bold text-sm text-white flex items-center gap-2">
                      <ChefHat className="w-4 h-4 text-emerald-400" />
                      Kitchen KDS Station
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Routes banquet food courses and appetizers to the chef preparation queue</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={togglingStation === 'hasFood'}
                    onClick={() => handleToggleStation('hasFood', currentEvent?.hasFood ?? true)}
                    className={`text-xs font-bold rounded-xl px-4 ${
                      currentEvent?.hasFood !== false
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {currentEvent?.hasFood !== false ? 'Enabled ✓' : 'Disabled'}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-[#181c2b]">
                  <div>
                    <p className="font-bold text-sm text-white flex items-center gap-2">
                      <Bell className="w-4 h-4 text-amber-400" />
                      Table Assistance Service
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Permits guests to request napkins, cutlery, extra plates, and water via QR</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={togglingStation === 'hasTableAssistance'}
                    onClick={() => handleToggleStation('hasTableAssistance', currentEvent?.hasTableAssistance ?? true)}
                    className={`text-xs font-bold rounded-xl px-4 ${
                      currentEvent?.hasTableAssistance !== false
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {currentEvent?.hasTableAssistance !== false ? 'Enabled ✓' : 'Disabled'}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-[#181c2b]">
                  <div>
                    <p className="font-bold text-sm text-white flex items-center gap-2">
                      <Wine className="w-4 h-4 text-purple-400" />
                      Bar & Mixology Station
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Enables celebration cocktail & beverage station. Requires venue licensing & 21+ verification.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={togglingStation === 'hasBar'}
                    onClick={() => handleToggleStation('hasBar', currentEvent?.hasBar ?? false)}
                    className={`text-xs font-bold rounded-xl px-4 ${
                      currentEvent?.hasBar
                        ? 'bg-purple-500 hover:bg-purple-400 text-white'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {currentEvent?.hasBar ? 'Enabled ✓' : 'Disabled'}
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-[#181c2b]">
                  <div>
                    <p className="font-bold text-sm text-white flex items-center gap-2">
                      <Flame className="w-4 h-4 text-amber-400" />
                      Hookah & Shisha Station
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">Enables dedicated event hookah lounge and flavor customization terminal</p>
                  </div>
                  <Button
                    size="sm"
                    disabled={togglingStation === 'hasHookah'}
                    onClick={() => handleToggleStation('hasHookah', currentEvent?.hasHookah ?? false)}
                    className={`text-xs font-bold rounded-xl px-4 ${
                      currentEvent?.hasHookah
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {currentEvent?.hasHookah ? 'Enabled ✓' : 'Disabled'}
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* STAFF ORDER ENTRY MODAL (ZERO PRICING / REAL EVENT ORDER) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isStaffOrderModalOpen}
        onClose={() => setIsStaffOrderModalOpen(false)}
        title="Enter Guest Order (Event Staff)"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Submit a dining order for an event table on behalf of a guest. This ticket routes directly to the event kitchen and stations without billing or payment.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Select Banquet Table *
            </label>
            <select
              value={staffOrderTable}
              onChange={(e) => setStaffOrderTable(e.target.value)}
              className="w-full bg-[#161a26] border border-[#262c3e] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="">-- Choose Assigned Table --</option>
              {eventTables.map((t) => (
                <option key={t.id} value={t.tableNumber}>
                  Table {t.tableNumber} {t.label ? `(${t.label})` : ''} — Capacity: {t.capacity || 8}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Guest Name (Optional)
              </label>
              <Input
                placeholder="e.g. Table Host"
                value={staffOrderGuestName}
                onChange={(e) => setStaffOrderGuestName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Dietary / Prep Notes
              </label>
              <Input
                placeholder="e.g. Extra spicy, allergy..."
                value={staffOrderNotes}
                onChange={(e) => setStaffOrderNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Select Courses from Catalog */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Select Courses & Quantities ({staffOrderCart.reduce((s, i) => s + i.quantity, 0)} Selected)
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-[#1f2536] rounded-xl p-2 bg-[#0e111a]">
              {menuItems.map((item) => {
                const inCart = staffOrderCart.find((c) => c.menuItemId === item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs transition-colors ${
                      inCart ? 'bg-amber-500/15 border border-amber-500/30' : 'bg-[#151924] border border-[#202738]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleStaffOrderItem(item)}
                        className={`w-4 h-4 rounded flex items-center justify-center border ${
                          inCart ? 'bg-amber-400 border-amber-400 text-slate-950' : 'border-slate-600'
                        }`}
                      >
                        {inCart && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                      <span className="text-white font-medium">{item.name}</span>
                    </div>

                    {inCart && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdateStaffOrderQty(item.id, -1)}
                          className="w-5 h-5 rounded bg-slate-800 text-white flex items-center justify-center text-xs"
                        >
                          -
                        </button>
                        <span className="font-mono font-bold text-amber-300 w-4 text-center">
                          {inCart.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateStaffOrderQty(item.id, 1)}
                          className="w-5 h-5 rounded bg-slate-800 text-white flex items-center justify-center text-xs"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[#1f2536] flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsStaffOrderModalOpen(false)}
              disabled={isSubmittingStaffOrder}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={handleSubmitStaffOrder}
              disabled={isSubmittingStaffOrder || !staffOrderTable || staffOrderCart.length === 0}
              className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
            >
              {isSubmittingStaffOrder ? 'Submitting...' : 'Submit Event Order ✓'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* ADD / EDIT FOOD ITEM MODAL (EVENT MENU - NO PRICE FIELDS) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        title={editingItem ? 'Edit Banquet Item' : 'Add Banquet Course Item'}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Course / Dish Name *
              </label>
              <Input
                placeholder="e.g. Royal Chicken Biryani"
                value={itemFormData.name}
                onChange={(e) => setItemFormData({ ...itemFormData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Unit Price (₹) *
              </label>
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 250"
                value={itemFormData.price}
                onChange={(e) => setItemFormData({ ...itemFormData, price: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Description / Dietary Notes
            </label>
            <textarea
              placeholder="e.g. Slow-cooked basmati rice with aromatic spices..."
              value={itemFormData.description}
              onChange={(e) => setItemFormData({ ...itemFormData, description: e.target.value })}
              className="w-full bg-[#161a26] border border-[#262c3e] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 h-20 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Category
              </label>
              <select
                value={itemFormData.categoryId}
                onChange={(e) => setItemFormData({ ...itemFormData, categoryId: e.target.value })}
                className="w-full bg-[#161a26] border border-[#262c3e] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {[
                  'Starters & Appetizers',
                  'Main Course',
                  'Biryani & Rice',
                  'Breads & Naans',
                  'Desserts & Sweets',
                  'Beverages & Drinks',
                  'Cocktails & Mocktails',
                  'Hookah & Shisha',
                ].map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Station Routing
              </label>
              <select
                value={itemFormData.targetDestination}
                onChange={(e) =>
                  setItemFormData({
                    ...itemFormData,
                    targetDestination: e.target.value as 'KITCHEN' | 'BAR' | 'HOOKAH',
                  })
                }
                className="w-full bg-[#161a26] border border-[#262c3e] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              >
                <option value="KITCHEN">Kitchen Station</option>
                <option value="BAR">Bar & Mixology</option>
                <option value="HOOKAH">Hookah Lounge</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Dietary Specification
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setItemFormData({ ...itemFormData, dietaryType: 'VEG' })}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 ${
                  itemFormData.dietaryType === 'VEG'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                    : 'bg-[#161a26] text-slate-400 border-[#262c3e]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Vegetarian (Veg)</span>
              </button>
              <button
                type="button"
                onClick={() => setItemFormData({ ...itemFormData, dietaryType: 'NON_VEG' })}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 ${
                  itemFormData.dietaryType === 'NON_VEG'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                    : 'bg-[#161a26] text-slate-400 border-[#262c3e]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>Non-Vegetarian</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Image URL (Optional)
            </label>
            <Input
              placeholder="https://images.unsplash.com/..."
              value={itemFormData.imageUrl}
              onChange={(e) => setItemFormData({ ...itemFormData, imageUrl: e.target.value })}
            />
          </div>

          <div className="pt-3 border-t border-[#1f2536] flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsItemModalOpen(false)}
              disabled={isSavingItem}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={handleSaveMenuItem}
              disabled={isSavingItem || !itemFormData.name.trim()}
              className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
            >
              {isSavingItem ? 'Saving...' : editingItem ? 'Save Changes' : 'Add Banquet Item'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default WeddingEventPortal;
