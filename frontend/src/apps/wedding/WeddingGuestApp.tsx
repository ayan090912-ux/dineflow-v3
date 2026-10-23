import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { api } from '../../packages/api/client';
import {
  PublicWeddingEventResponse,
  Order,
  EventAssistanceRequest,
  EventAssistanceRequestItem,
  getFulfillmentStation,
} from '../../packages/types';
import {
  Heart,
  Sparkles,
  ShoppingBag,
  Utensils,
  Wine,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Minus,
  Trash2,
  X,
  MapPin,
  Calendar,
  ChefHat,
  ChevronRight,
  ArrowRight,
  Info,
  Bell,
  Flame,
  ShieldAlert,
  Check,
  RotateCcw,
} from 'lucide-react';

interface WeddingGuestAppProps {
  eventId?: string;
  initialTable?: string;
}

interface CartItem {
  itemId: string;
  name: string;
  price?: number;
  quantity: number;
  notes?: string;
  imageUrl?: string;
  targetDestination?: string;
  isAlcoholic?: boolean;
}

type ServiceSection = 'FOOD' | 'DRINKS' | 'HOOKAH';
type DietaryFilter = 'ALL' | 'VEG' | 'NON_VEG';

const GUEST_EVENT_BRANDING: Record<string, { label: string; icon: string; tableIcon: string }> = {
  WEDDING: { label: 'Wedding Banquet', icon: '💍', tableIcon: '💍' },
  RECEPTION: { label: 'Evening Reception', icon: '🥂', tableIcon: '🥂' },
  BIRTHDAY: { label: 'Birthday Celebration', icon: '🎂', tableIcon: '🎂' },
  CORPORATE: { label: 'Corporate Banquet', icon: '🏢', tableIcon: '🏢' },
  PARTY: { label: 'Private Party & Cocktail', icon: '🎉', tableIcon: '🎉' },
  ANNIVERSARY: { label: 'Anniversary Celebration', icon: '✨', tableIcon: '✨' },
  GALA: { label: 'Gala Dinner', icon: '🌟', tableIcon: '🌟' },
  CATERING: { label: 'Banquet Dining', icon: '🍽️', tableIcon: '🍽️' },
  ENGAGEMENT: { label: 'Engagement Celebration', icon: '💎', tableIcon: '💎' },
  SANGEET: { label: 'Sangeet & Cocktail Night', icon: '🎶', tableIcon: '🎶' },
};

const DEFAULT_ASSISTANCE_OPTIONS = [
  { code: 'NAPKINS', label: 'Tissues & Napkins', icon: '🧻', defaultQty: 4 },
  { code: 'PLATES', label: 'Extra Plates', icon: '🍽️', defaultQty: 2 },
  { code: 'SPOONS_FORKS', label: 'Spoons & Forks', icon: '🍴', defaultQty: 2 },
  { code: 'CUTLERY', label: 'Cutlery & Knives', icon: '🔪', defaultQty: 2 },
  { code: 'WATER', label: 'Drinking Water', icon: '💧', defaultQty: 1 },
  { code: 'GLASSES', label: 'Extra Glasses / Cups', icon: '🍷', defaultQty: 2 },
  { code: 'UTENSILS', label: 'Serving Utensils', icon: '🥣', defaultQty: 1 },
  { code: 'CLEANING', label: 'Table Cleaning', icon: '🧹', defaultQty: 1 },
  { code: 'WAITER', label: 'Request Waiter', icon: '🛎️', defaultQty: 1 },
  { code: 'OTHER', label: 'Other Assistance', icon: '✨', defaultQty: 1 },
];

const cleanTableBadge = (tbl?: string): string => {
  if (!tbl) return '';
  return tbl.replace(/^table\s*/i, '').trim();
};

export const WeddingGuestApp: React.FC<WeddingGuestAppProps> = ({
  eventId: propEventId,
  initialTable: propInitialTable,
}) => {
  // Extract eventId and table from URL params if not passed as props
  const [eventId, setEventId] = useState<string>(() => {
    if (propEventId) return propEventId;
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const match = path.match(/\/(?:event|events|wedding)\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) return match[1];
    }
    return '';
  });

  const [tableNumber, setTableNumber] = useState<string>(() => {
    if (propInitialTable) return propInitialTable;
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const queryTable = urlParams.get('table') || urlParams.get('tbl') || urlParams.get('tableNumber');
      if (queryTable) return queryTable;

      const path = window.location.pathname;
      const match = path.match(/\/table\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) return match[1];
    }
    return '01';
  });

  const [data, setData] = useState<PublicWeddingEventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Service Section: Food | Alcohol & Drinks | Hookah & Shisha
  const [activeSection, setActiveSection] = useState<ServiceSection>('FOOD');

  // Food Subcategory Filter & Dietary Filter
  const [activeFoodCategory, setActiveFoodCategory] = useState<string>('ALL');
  const [dietaryFilter, setDietaryFilter] = useState<DietaryFilter>('ALL');

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestNotes, setGuestNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Age Verification Modal (Required for Alcohol orders)
  const [isAgeModalOpen, setIsAgeModalOpen] = useState(false);
  const [pendingAgeItem, setPendingAgeItem] = useState<any | null>(null);
  const [isLegalDrinkingAgeAffirmed, setIsLegalDrinkingAgeAffirmed] = useState(false);

  // Table Assistance Modal & Active Requests Tracking
  const [isAssistanceModalOpen, setIsAssistanceModalOpen] = useState(false);
  const [assistanceSelections, setAssistanceSelections] = useState<Record<string, number>>({});
  const [assistanceNote, setAssistanceNote] = useState('');
  const [isSubmittingAssistance, setIsSubmittingAssistance] = useState(false);
  const [activeRequests, setActiveRequests] = useState<EventAssistanceRequest[]>([]);
  const [activeAssistancePoll, setActiveAssistancePoll] = useState<EventAssistanceRequest | null>(null);

  // Placed Order Confirmation
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [lastPersistedOrder, setLastPersistedOrder] = useState<Order | null>(null);

  // Item customization modal
  const [customizingItem, setCustomizingItem] = useState<any | null>(null);
  const [itemNote, setItemNote] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);

  // Fetch event and menu data
  const loadEventData = useCallback(() => {
    if (!eventId) {
      setError('No wedding event ID found in link. Please re-scan your table QR code.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    api.getPublicEvent(eventId, tableNumber)
      .then((res) => {
        setData(res);
        if (res.table?.tableNumber) {
          setTableNumber(res.table.tableNumber);
        }
      })
      .catch((err: any) => {
        console.error('Failed to load wedding event:', err);
        setError(err.message || 'Unable to load banquet details. Please scan your table QR standee again.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [eventId, tableNumber]);

  useEffect(() => {
    loadEventData();
  }, [loadEventData]);

  // Poll active table assistance requests for this table
  const fetchTableAssistance = useCallback(async () => {
    if (!eventId || !tableNumber) return;
    try {
      const requests = await api.getTableAssistanceRequests(eventId, tableNumber);
      setActiveRequests(requests);
      // Track latest non-completed request
      const activeOne = requests.find((r) => r.status !== 'COMPLETED' && r.status !== 'CANCELLED');
      setActiveAssistancePoll(activeOne || null);
    } catch {
      // Non-blocking
    }
  }, [eventId, tableNumber]);

  useEffect(() => {
    fetchTableAssistance();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      fetchTableAssistance();
    }, 10000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchTableAssistance();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [fetchTableAssistance]);

  // Load last persisted order for this event & table upon reload / mount
  useEffect(() => {
    if (eventId && tableNumber) {
      try {
        const key = `dinely_last_wedding_order_${eventId}_tbl_${tableNumber}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.id) {
            setLastPersistedOrder(parsed);
          }
        }
      } catch (e) {}
    }
  }, [eventId, tableNumber]);

  // Enabled Sections Configuration
  const isFoodEnabled = data?.event.hasFood !== false;
  const isBarEnabled = Boolean(data?.event.hasBar);
  const isHookahEnabled = Boolean(data?.event.hasHookah);
  const isTableAssistanceEnabled = data?.event.hasTableAssistance !== false;

  // Ensure default activeSection is valid
  useEffect(() => {
    if (!isFoodEnabled && isBarEnabled && activeSection === 'FOOD') {
      setActiveSection('DRINKS');
    } else if (!isFoodEnabled && !isBarEnabled && isHookahEnabled && activeSection === 'FOOD') {
      setActiveSection('HOOKAH');
    }
  }, [isFoodEnabled, isBarEnabled, isHookahEnabled, activeSection]);

  // Item Station Categorization
  const getItemStation = (item: any): ServiceSection => {
    const dest = (item.targetDestination || '').toUpperCase();
    if (dest === 'HOOKAH') return 'HOOKAH';
    if (dest === 'BAR' || item.isAlcoholic) return 'DRINKS';
    const catName = (item.categoryName || '').toLowerCase();
    if (catName.includes('shisha') || catName.includes('hookah')) return 'HOOKAH';
    if (catName.includes('bar') || catName.includes('cocktail') || catName.includes('wine') || catName.includes('drink') || catName.includes('beverage')) {
      return 'DRINKS';
    }
    return 'FOOD';
  };

  // Extract menu items for active service section
  const sectionCategories = useMemo(() => {
    if (!data?.menu) return [];

    return data.menu
      .map((cat) => {
        const matchingItems = cat.items.filter((item) => {
          const itemSec = getItemStation(item);
          if (itemSec !== activeSection) return false;

          // In Food section, apply dietary filter
          if (activeSection === 'FOOD') {
            const isVeg = item.isVegetarian || item.dietaryType === 'VEG';
            if (dietaryFilter === 'VEG' && !isVeg) return false;
            if (dietaryFilter === 'NON_VEG' && isVeg) return false;
          }

          return true;
        });

        return {
          ...cat,
          items: matchingItems,
        };
      })
      .filter((cat) => cat.items.length > 0);
  }, [data?.menu, activeSection, dietaryFilter]);

  // All distinct category names for the current section (for top pill filtering)
  const currentSectionCategoryList = useMemo(() => {
    if (!data?.menu) return [];
    const list: Array<{ id: string; name: string }> = [];
    data.menu.forEach((cat) => {
      const hasItemInSection = cat.items.some((i) => getItemStation(i) === activeSection);
      if (hasItemInSection) {
        list.push({ id: cat.id, name: cat.name });
      }
    });
    return list;
  }, [data?.menu, activeSection]);

  // Filtered categories by activeFoodCategory
  const displayedCategories = useMemo(() => {
    if (activeFoodCategory === 'ALL') return sectionCategories;
    return sectionCategories.filter((cat) => cat.id === activeFoodCategory);
  }, [sectionCategories, activeFoodCategory]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Open item customization dialog
  const handleOpenCustomize = (item: any) => {
    if (!item.isAvailable) return;

    // Check alcohol restriction
    if (item.isAlcoholic && !isLegalDrinkingAgeAffirmed) {
      setPendingAgeItem(item);
      setIsAgeModalOpen(true);
      return;
    }

    setCustomizingItem(item);
    setItemQuantity(1);
    setItemNote('');
  };

  const handleConfirmAgeAffirmation = () => {
    setIsLegalDrinkingAgeAffirmed(true);
    setIsAgeModalOpen(false);
    if (pendingAgeItem) {
      setCustomizingItem(pendingAgeItem);
      setItemQuantity(1);
      setItemNote('');
      setPendingAgeItem(null);
    }
  };

  // Add customized item to cart
  const handleConfirmAddToCart = () => {
    if (!customizingItem) return;

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (ci) => ci.itemId === customizingItem.id && (ci.notes || '') === (itemNote.trim() || '')
      );
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex].quantity += itemQuantity;
        return updated;
      }
      return [
        ...prev,
        {
          itemId: customizingItem.id,
          name: customizingItem.name,
          quantity: itemQuantity,
          notes: itemNote.trim() || undefined,
          imageUrl: customizingItem.imageUrl,
          targetDestination: customizingItem.targetDestination || getFulfillmentStation(customizingItem),
          isAlcoholic: Boolean(customizingItem.isAlcoholic),
        },
      ];
    });

    setCustomizingItem(null);
  };

  const handleUpdateCartQty = (index: number, delta: number) => {
    setCart((prev) => {
      const copy = [...prev];
      const newQty = copy[index].quantity + delta;
      if (newQty <= 0) {
        return copy.filter((_, i) => i !== index);
      }
      copy[index].quantity = newQty;
      return copy;
    });
  };

  // Place event guest order
  const handlePlaceOrder = async () => {
    if (!data || cart.length === 0 || isSubmitting) return;

    if (data.event.status === 'SCHEDULED') {
      alert('Event ordering has not opened yet. Please check back when service starts.');
      return;
    }
    if (data.event.status === 'CLOSED' || !data.event.isOrderingOpen) {
      alert('Ordering for this event is currently closed.');
      return;
    }

    const hasAlcoholInCart = cart.some((c) => c.isAlcoholic);
    if (hasAlcoholInCart && !isLegalDrinkingAgeAffirmed) {
      setIsAgeModalOpen(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const idempotencyKey = `evt-${data.event.id}-tbl${tableNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const orderPayload = {
        restaurantId: data.restaurant.id,
        tableNumber: tableNumber || '01',
        customerName: guestName.trim() || `Guest at Table ${cleanTableBadge(tableNumber) || '01'}`,
        orderType: 'WEDDING_EVENT',
        eventId: data.event.id,
        eventName: data.event.title,
        idempotencyKey,
        legalDrinkingAgeAffirmed: hasAlcoholInCart ? true : undefined,
        items: cart.map((ci) => ({
          menuItemId: ci.itemId,
          name: ci.name,
          quantity: ci.quantity,
          notes: ci.notes || '',
          targetDestination: ci.targetDestination || getFulfillmentStation(ci),
          isAlcoholic: Boolean(ci.isAlcoholic),
        })),
        notes: guestNotes.trim()
          ? `[${data.event.eventType || 'Event'} Banquet] ${guestNotes.trim()}`
          : `[${data.event.eventType || 'Event'} Banquet Order for Table ${cleanTableBadge(tableNumber) || '01'}]`,
      };

      const res = await api.createOrder(orderPayload);
      setPlacedOrder(res);
      setLastPersistedOrder(res);
      try {
        const key = `dinely_last_wedding_order_${data.event.id}_tbl_${tableNumber}`;
        localStorage.setItem(key, JSON.stringify(res));
      } catch (e) {}
      setCart([]);
      setIsCartOpen(false);

      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#d4af37', '#e07a86', '#10b981', '#ffffff'],
        });
      } catch (e) {}
    } catch (err: any) {
      console.error('Failed to place event order:', err);
      alert(err.message || 'Failed to place order. Please check with your banquet waiter.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Table Assistance Request
  const handleSubmitAssistance = async () => {
    if (!data || isSubmittingAssistance) return;

    const requestedItems: EventAssistanceRequestItem[] = [];
    Object.entries(assistanceSelections).forEach(([code, rawQty]) => {
      const qty = Number(rawQty) || 0;
      if (qty > 0) {
        const opt = DEFAULT_ASSISTANCE_OPTIONS.find((o) => o.code === code);
        requestedItems.push({
          code,
          label: opt?.label || code,
          quantity: qty,
        });
      }
    });

    if (requestedItems.length === 0 && !assistanceNote.trim()) {
      alert('Please select at least one item or enter a request note.');
      return;
    }

    if (requestedItems.length === 0 && assistanceNote.trim()) {
      requestedItems.push({
        code: 'OTHER',
        label: 'Other Assistance',
        quantity: 1,
        note: assistanceNote.trim(),
      });
    }

    setIsSubmittingAssistance(true);
    try {
      const idempotencyKey = `ast-${data.event.id}-${tableNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const res = await api.requestTableAssistance(data.event.id, {
        tableNumber: tableNumber || '01',
        items: requestedItems,
        guestName: guestName.trim() || undefined,
        guestNote: assistanceNote.trim() || undefined,
        idempotencyKey,
      });

      setActiveAssistancePoll(res);
      setAssistanceSelections({});
      setAssistanceNote('');
      setIsAssistanceModalOpen(false);
      await fetchTableAssistance();

      try {
        confetti({
          particleCount: 40,
          spread: 50,
          origin: { y: 0.7 },
          colors: ['#d4af37', '#ffffff'],
        });
      } catch (e) {}
    } catch (err: any) {
      console.error('Assistance request failed:', err);
      alert(err.message || 'Unable to submit assistance request. Please speak with banquet staff.');
    } finally {
      setIsSubmittingAssistance(false);
    }
  };

  const handleUpdateAssistanceQty = (code: string, delta: number, defaultQty = 1) => {
    setAssistanceSelections((prev) => {
      const current = prev[code] || 0;
      const next = Math.max(0, current + delta);
      if (current === 0 && delta > 0 && defaultQty > 1) {
        return { ...prev, [code]: defaultQty };
      }
      return { ...prev, [code]: next };
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full border-2 border-[#d4af37] border-t-transparent animate-spin mb-4" />
        <h2 className="text-lg font-serif font-bold text-[#2a241b] tracking-wide">Preparing Your Banquet Menu</h2>
        <p className="text-xs text-[#8c8273] font-serif italic mt-1">Connecting to live wedding dining service...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#faf8f5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 text-rose-500 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-serif font-bold text-[#2a241b]">Banquet Notice</h2>
        <p className="text-sm text-[#73695c] max-w-md mt-2 leading-relaxed">
          {error || 'Unable to locate this event dining session.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-5 py-2.5 rounded-full bg-[#d4af37] text-white font-serif font-bold text-xs shadow-md tracking-wider uppercase hover:bg-[#c19c2a] transition-all"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { event, restaurant } = data;
  const branding = GUEST_EVENT_BRANDING[event.eventType] || { label: 'Banquet Dining', icon: '🍽️', tableIcon: '🍽️' };
  const isScheduled = event.status === 'SCHEDULED';
  const isClosed = event.status === 'CLOSED';
  const isOrderingOpen = event.isOrderingOpen && !isScheduled && !isClosed;

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#292218] font-sans pb-36 selection:bg-[#d4af37]/30">
      {/* Top Luxury Banner / Hero */}
      <header className="relative bg-gradient-to-b from-[#f3ede2] via-[#faf8f5] to-[#faf8f5] border-b border-[#e8dfcf] px-5 pt-8 pb-6 text-center overflow-hidden">
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#d4af37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-xl mx-auto space-y-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-[#d4af37]/40 shadow-sm">
            <span className="text-sm">{branding.icon}</span>
            <span className="text-[11px] font-serif font-bold tracking-widest uppercase text-[#8f7528]">
              {branding.label}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#1e1912] tracking-tight">
            {event.coupleNames || event.title}
          </h1>

          {event.coupleNames && (
            <p className="text-xs font-serif italic text-[#8c7640] tracking-wide">
              {event.title}
            </p>
          )}

          {/* Table Badge */}
          <div className="pt-1">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#1e1912] text-[#f7eed9] text-xs font-mono font-bold tracking-wider shadow-md border border-[#d4af37]">
              <span>{branding.tableIcon} TABLE {cleanTableBadge(tableNumber)}</span>
              <span className="w-1 h-1 rounded-full bg-[#d4af37]" />
              <span className="font-serif font-normal text-[11px] text-[#e0d6c2]">Seated Guest</span>
            </div>
          </div>

          {/* Welcome Message */}
          {event.welcomeMessage && (
            <p className="text-xs text-[#6e6353] font-serif italic max-w-md mx-auto pt-1 leading-relaxed">
              "{event.welcomeMessage}"
            </p>
          )}

          {/* Venue & Date Details */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-3 text-[11px] text-[#857764] font-medium border-t border-[#ede4d5] mt-3">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#d4af37]" />
              {event.eventDate}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#d4af37]" />
              {event.startTime} - {event.endTime}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#d4af37]" />
              {event.venueName || restaurant.name}
            </span>
          </div>
        </div>
      </header>

      {/* Live Ordering Status Banners */}
      {isScheduled ? (
        <div className="bg-sky-50 border-y border-sky-300 text-sky-950 px-4 py-2.5 text-center text-xs font-serif">
          <strong>Service Scheduled:</strong> Banquet dining opens at <strong>{event.startTime} ({event.timezone || 'UTC'})</strong>. Please browse the dishes below.
        </div>
      ) : isClosed ? (
        <div className="bg-slate-100 border-y border-slate-300 text-slate-800 px-4 py-2.5 text-center text-xs font-serif">
          <strong>Service Concluded:</strong> Event dining for this session has officially ended. We thank you for celebrating with us!
        </div>
      ) : !event.isOrderingOpen ? (
        <div className="bg-amber-100/80 border-y border-amber-300 text-amber-900 px-4 py-2.5 text-center text-xs font-serif">
          <strong>Banquet Dining Update:</strong> Online ordering is temporarily paused by dining staff. Please speak with your banquet attendant.
        </div>
      ) : null}

      {/* Persisted Order Banner on Reload */}
      {lastPersistedOrder && !placedOrder && (
        <div className="bg-[#1e1912] text-[#f7eed9] px-4 py-3 border-b border-[#d4af37]/60 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs font-serif font-bold text-white">
                Active Order #{lastPersistedOrder.id.length > 10 ? lastPersistedOrder.id.slice(-6) : lastPersistedOrder.id}
              </p>
              <p className="text-[10px] text-amber-300 font-mono">
                Table {cleanTableBadge(lastPersistedOrder.tableNumber)} • Status: {lastPersistedOrder.kitchenStatus || lastPersistedOrder.status || 'PREPARING'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setPlacedOrder(lastPersistedOrder)}
            className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/40 hover:bg-amber-500/30 whitespace-nowrap"
          >
            View Ticket
          </button>
        </div>
      )}

      {/* Active Table Assistance Status Tracker Banner (if guest has submitted request) */}
      {activeAssistancePoll && (
        <div className="bg-[#1f1a14] border-b border-[#d4af37] text-white px-4 py-3 shadow-md">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center animate-pulse">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-serif font-bold text-amber-300">
                  Table Assistance #{activeAssistancePoll.id.slice(-5)}: {activeAssistancePoll.status}
                </p>
                <p className="text-[10px] text-slate-300">
                  {activeAssistancePoll.status === 'NEW'
                    ? 'Staff notified. Attendant will arrive shortly.'
                    : activeAssistancePoll.status === 'ACKNOWLEDGED'
                    ? `Claimed by ${activeAssistancePoll.assignedStaffName || 'attendant'}. Gathering supplies...`
                    : activeAssistancePoll.status === 'IN_PROGRESS'
                    ? `Staff ${activeAssistancePoll.assignedStaffName || ''} is on the way to your table.`
                    : 'Assistance completed.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsAssistanceModalOpen(true)}
              className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/40 hover:bg-amber-500/30 whitespace-nowrap"
            >
              View Needs
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {/* ========================================================================= */}
        {/* 1. PRIMARY SERVICE SECTIONS NAVIGATION (FOOD | ALCOHOL & DRINKS | HOOKAH) */}
        {/* ========================================================================= */}
        <div className="bg-white/90 p-1.5 rounded-2xl border border-[#e3d7c5] shadow-sm flex items-center justify-center gap-1.5">
          {isFoodEnabled && (
            <button
              onClick={() => {
                setActiveSection('FOOD');
                setActiveFoodCategory('ALL');
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-serif font-bold transition-all flex items-center justify-center gap-2 ${
                activeSection === 'FOOD'
                  ? 'bg-gradient-to-r from-[#2a2216] to-[#1c160e] text-[#fbf6ec] shadow-md border border-[#d4af37]/60'
                  : 'text-[#706351] hover:text-[#2a2216] hover:bg-[#faf6ee]'
              }`}
            >
              <Utensils className={`w-4 h-4 ${activeSection === 'FOOD' ? 'text-amber-400' : 'text-[#8c7a65]'}`} />
              <span>Food Menu</span>
            </button>
          )}

          {isBarEnabled && (
            <button
              onClick={() => {
                setActiveSection('DRINKS');
                setActiveFoodCategory('ALL');
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-serif font-bold transition-all flex items-center justify-center gap-2 ${
                activeSection === 'DRINKS'
                  ? 'bg-gradient-to-r from-[#2a1728] to-[#1a0f19] text-[#fdf4fc] shadow-md border border-purple-400/60'
                  : 'text-[#706351] hover:text-[#2a2216] hover:bg-[#faf6ee]'
              }`}
            >
              <Wine className={`w-4 h-4 ${activeSection === 'DRINKS' ? 'text-purple-300' : 'text-[#8c7a65]'}`} />
              <span>Alcohol & Drinks</span>
            </button>
          )}

          {isHookahEnabled && (
            <button
              onClick={() => {
                setActiveSection('HOOKAH');
                setActiveFoodCategory('ALL');
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-serif font-bold transition-all flex items-center justify-center gap-2 ${
                activeSection === 'HOOKAH'
                  ? 'bg-gradient-to-r from-[#2b1f13] to-[#1c130b] text-[#fef9f2] shadow-md border border-amber-500/60'
                  : 'text-[#706351] hover:text-[#2a2216] hover:bg-[#faf6ee]'
              }`}
            >
              <Flame className={`w-4 h-4 ${activeSection === 'HOOKAH' ? 'text-amber-400' : 'text-[#8c7a65]'}`} />
              <span>Hookah & Shisha</span>
            </button>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 2. SECTION SUB-FILTERS & DIETARY NAVIGATION */}
        {/* ========================================================================= */}
        {activeSection === 'FOOD' && (
          <div className="space-y-3">
            {/* Category Pills (No horizontal overflow bug) */}
            {currentSectionCategoryList.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setActiveFoodCategory('ALL')}
                  className={`px-3 py-1.5 rounded-full text-xs font-serif font-bold whitespace-nowrap transition-all ${
                    activeFoodCategory === 'ALL'
                      ? 'bg-[#d4af37] text-slate-950 shadow-sm'
                      : 'bg-white border border-[#e3d7c5] text-[#706351] hover:border-[#d4af37]'
                  }`}
                >
                  All Courses
                </button>
                {currentSectionCategoryList.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveFoodCategory(c.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-serif font-medium whitespace-nowrap transition-all ${
                      activeFoodCategory === c.id
                        ? 'bg-[#d4af37] text-slate-950 font-bold shadow-sm'
                        : 'bg-white border border-[#e3d7c5] text-[#706351] hover:border-[#d4af37]'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}

            {/* Dietary Filter (All, Vegetarian, Non-Veg) */}
            <div className="flex items-center justify-center gap-2">
              {[
                { id: 'ALL', label: 'All Dishes', icon: null },
                { id: 'VEG', label: 'Vegetarian', icon: '🟢' },
                { id: 'NON_VEG', label: 'Non-Vegetarian', icon: '🔴' },
              ].map((flt) => (
                <button
                  key={flt.id}
                  onClick={() => setDietaryFilter(flt.id as DietaryFilter)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-serif font-medium transition-all flex items-center gap-1.5 ${
                    dietaryFilter === flt.id
                      ? 'bg-[#1e1912] text-[#f7eed9] font-bold shadow-sm border border-[#d4af37]'
                      : 'bg-white text-[#786b59] border border-[#e5dcce] hover:border-[#d4af37]/60'
                  }`}
                >
                  {flt.icon && <span className="text-[10px]">{flt.icon}</span>}
                  <span>{flt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'DRINKS' && (
          <div className="bg-purple-950/10 border border-purple-300/40 rounded-2xl p-3 flex items-center justify-between text-xs text-purple-900 font-serif">
            <div className="flex items-center gap-2">
              <Wine className="w-4 h-4 text-purple-600" />
              <span>Authorized Bar Station: Mixed Cocktails, Wine, & Refreshments.</span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider bg-purple-200 text-purple-900 px-2 py-0.5 rounded-md font-bold">
              21+ Verified
            </span>
          </div>
        )}

        {activeSection === 'HOOKAH' && (
          <div className="bg-amber-950/10 border border-amber-400/40 rounded-2xl p-3 flex items-center justify-between text-xs text-amber-950 font-serif">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-amber-600" />
              <span>Royal Shisha Lounge: Handcrafted tobacco flavors & ice bases.</span>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider bg-amber-200 text-amber-900 px-2 py-0.5 rounded-md font-bold">
              Lounge Service
            </span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. MENU DISHES & ITEMS STREAM */}
        {/* ========================================================================= */}
        {displayedCategories.length === 0 ? (
          <div className="py-14 text-center bg-white/70 rounded-2xl border border-[#ebe0cf] p-6 space-y-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto ${
              activeSection === 'DRINKS'
                ? 'bg-purple-100 text-purple-700'
                : activeSection === 'HOOKAH'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-amber-100/60 text-amber-700'
            }`}>
              {activeSection === 'DRINKS' ? (
                <Wine className="w-5 h-5" />
              ) : activeSection === 'HOOKAH' ? (
                <Flame className="w-5 h-5" />
              ) : (
                <Utensils className="w-5 h-5" />
              )}
            </div>
            <p className="text-sm font-serif font-bold text-[#2a2216]">
              {activeSection === 'DRINKS'
                ? 'Bar & Beverage Station Live'
                : activeSection === 'HOOKAH'
                ? 'Shisha & Hookah Lounge Live'
                : 'No dishes found matching this selection.'}
            </p>
            <p className="text-xs text-[#7d705e] font-serif max-w-sm mx-auto">
              {activeSection === 'DRINKS'
                ? 'Beverages and refreshments for this banquet are curated by banquet staff. Selections will appear here as they are added by the event host.'
                : activeSection === 'HOOKAH'
                ? 'Hookah flavors and lounge service are enabled for this banquet. Selections will appear here as they are added by the event host.'
                : dietaryFilter !== 'ALL'
                ? `There are no ${dietaryFilter === 'VEG' ? 'vegetarian' : 'non-vegetarian'} dishes in this category.`
                : 'No items configured for this service section yet.'}
            </p>
            {activeSection === 'FOOD' && dietaryFilter !== 'ALL' && (
              <button
                onClick={() => setDietaryFilter('ALL')}
                className="px-4 py-1.5 rounded-full bg-[#1e1912] text-[#f7eed9] text-xs font-serif font-bold shadow hover:bg-black transition-colors"
              >
                Reset Dietary Filter
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {displayedCategories.map((cat) => (
              <section key={cat.id} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-serif font-bold text-[#1f1912] tracking-wide">
                    {cat.name}
                  </h2>
                  <div className="flex-1 h-px bg-[#e6dcce]" />
                </div>
                {cat.description && (
                  <p className="text-[11px] text-[#8a7c6a] font-serif italic">{cat.description}</p>
                )}

                {/* Dish Cards Grid */}
                <div className="grid grid-cols-1 gap-3">
                  {cat.items.map((item) => {
                    const isVeg = item.isVegetarian || item.dietaryType === 'VEG';
                    const isUnavailable = item.isAvailable === false;

                    return (
                      <div
                        key={item.id}
                        className={`bg-white rounded-2xl border p-4 shadow-sm transition-all flex items-center justify-between gap-4 ${
                          isUnavailable
                            ? 'opacity-60 border-slate-200'
                            : 'border-[#ebe2d5] hover:border-[#d4af37]/60 hover:shadow-md'
                        }`}
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full border ${
                                isVeg ? 'bg-emerald-500 border-emerald-600' : 'bg-rose-500 border-rose-600'
                              }`}
                              title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                            />
                            <h3 className="text-sm font-serif font-bold text-[#1e1912]">{item.name}</h3>

                            {item.isAlcoholic && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-serif font-semibold">
                                21+
                              </span>
                            )}

                            {isUnavailable && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                                Unavailable
                              </span>
                            )}
                          </div>

                          {item.description && (
                            <p className="text-xs text-[#736653] font-serif line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}

                        </div>

                        {/* Order / Add Action */}
                        <div>
                          {isUnavailable ? (
                            <button
                              disabled
                              className="px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-400 font-serif text-xs cursor-not-allowed"
                            >
                              Sold Out
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenCustomize(item)}
                              className="px-4 py-1.5 rounded-full bg-[#faf5eb] border border-[#d4af37] text-[#8c7432] hover:bg-[#d4af37] hover:text-white font-serif font-bold text-xs tracking-wider uppercase transition-all shadow-sm active:scale-95 flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 4. DUAL DOCKED ACTIONS: REQUEST TABLE ASSISTANCE + VIEW BANQUET CART */}
      {/* ========================================================================= */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#e2d6c4] px-4 py-3 shadow-2xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          {/* Table Assistance Action */}
          {isTableAssistanceEnabled && (
            <button
              onClick={() => setIsAssistanceModalOpen(true)}
              className="flex-1 py-3 px-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-900 font-serif font-bold text-xs hover:bg-amber-500/25 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-98"
            >
              <Bell className="w-4 h-4 text-amber-700 animate-bounce" />
              <span>Request Table Assistance</span>
            </button>
          )}

          {/* View Cart Action */}
          <button
            onClick={() => setIsCartOpen(true)}
            className={`py-3 px-5 rounded-2xl font-serif font-bold text-xs uppercase tracking-wider text-white shadow-xl flex items-center justify-center gap-2.5 transition-all active:scale-98 ${
              totalCartCount > 0
                ? 'bg-gradient-to-r from-[#d4af37] via-[#c49a26] to-[#b38b19] shadow-[#d4af37]/30 flex-1'
                : 'bg-[#292217] flex-initial'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-amber-300" />
            <span>Cart</span>
            {totalCartCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-white text-[#1e1912] font-mono font-bold text-[10px] flex items-center justify-center">
                {totalCartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. REQUEST TABLE ASSISTANCE MODAL (NO PRICES, OPERATIONAL SERVICE ONLY) */}
      {/* ========================================================================= */}
      {isAssistanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#faf8f5] w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-[#d4af37]/40 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#e5dcce] bg-[#f5efe4] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-700 flex items-center justify-center">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-sm text-[#1e1912]">
                    Request Table Assistance
                  </h3>
                  <p className="text-[11px] text-[#786b59] font-mono">
                    Table {cleanTableBadge(tableNumber)} • Operational Banquet Service
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsAssistanceModalOpen(false)}
                className="p-1.5 rounded-full text-[#786b59] hover:bg-black/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4">
              <p className="text-xs text-[#695d4d] font-serif leading-relaxed">
                Need extra table supplies or a waiter? Select the items below and our banquet staff will deliver them directly to Table {cleanTableBadge(tableNumber)}.
              </p>

              {/* Assistance Options Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DEFAULT_ASSISTANCE_OPTIONS.map((opt) => {
                  const qty = assistanceSelections[opt.code] || 0;
                  const isSelected = qty > 0;

                  return (
                    <div
                      key={opt.code}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-amber-500/10 border-[#d4af37] shadow-sm'
                          : 'bg-white border-[#e3d7c5] hover:border-[#d4af37]/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 flex-1">
                        <span className="text-lg">{opt.icon}</span>
                        <span className="text-xs font-serif font-bold text-[#1e1912]">{opt.label}</span>
                      </div>

                      <div className="flex items-center gap-2 bg-[#f4ede1] rounded-full px-2 py-1">
                        <button
                          onClick={() => handleUpdateAssistanceQty(opt.code, -1, opt.defaultQty)}
                          disabled={qty === 0}
                          className="p-0.5 text-[#73634e] hover:text-[#1e1912] disabled:opacity-30"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-mono font-bold text-xs w-4 text-center">{qty}</span>
                        <button
                          onClick={() => handleUpdateAssistanceQty(opt.code, 1, opt.defaultQty)}
                          className="p-0.5 text-[#73634e] hover:text-[#1e1912]"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Guest Note */}
              <div className="space-y-1">
                <label className="block text-xs font-serif font-bold text-[#42392c]">
                  Special Instruction / Note (Optional)
                </label>
                <textarea
                  rows={2}
                  value={assistanceNote}
                  onChange={(e) => setAssistanceNote(e.target.value)}
                  placeholder="e.g. Please bring chilled drinking water and 2 extra forks..."
                  className="w-full bg-white border border-[#dbcfbe] rounded-xl p-2.5 text-xs text-[#1e1912] placeholder-slate-400 focus:outline-none focus:border-[#d4af37]"
                />
              </div>

              {/* Active Table Requests History */}
              {activeRequests.length > 0 && (
                <div className="border-t border-[#e2d6c4] pt-3 space-y-2">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold">
                    Submitted Requests for Table {cleanTableBadge(tableNumber)}:
                  </p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {activeRequests.map((r) => (
                      <div
                        key={r.id}
                        className="p-2.5 rounded-xl bg-white border border-[#e3d7c5] flex items-center justify-between text-xs"
                      >
                        <div>
                          <span className="font-serif font-bold text-[#1e1912]">
                            {(r.items || []).map((i) => `${i.label}${i.quantity ? ` (×${i.quantity})` : ''}`).join(', ')}
                          </span>
                          {r.assignedStaffName && (
                            <p className="text-[10px] text-amber-700 font-medium">Assigned to: {r.assignedStaffName}</p>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${
                            r.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'IN_PROGRESS'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#e5dcce] bg-[#f5efe4]">
              <button
                onClick={handleSubmitAssistance}
                disabled={isSubmittingAssistance}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#d4af37] via-[#c49a26] to-[#b38b19] text-white font-serif font-bold text-xs uppercase tracking-widest shadow-xl hover:brightness-105 active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                {isSubmittingAssistance ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Submit Request for Table {cleanTableBadge(tableNumber)}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. LEGAL DRINKING AGE AFFIRMATION MODAL (21+) */}
      {/* ========================================================================= */}
      {isAgeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#faf8f5] w-full max-w-md rounded-3xl border-2 border-purple-400/50 p-6 text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-full bg-purple-100 border border-purple-300 text-purple-700 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-lg font-serif font-bold text-[#1e1912]">Legal Drinking Age Verification</h3>
              <p className="text-xs text-[#73634e] font-serif mt-1">
                Banquet Bar Service requires guests to be of legal drinking age (21+).
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200 text-left text-xs text-purple-900 font-serif leading-relaxed">
              By confirming, you solemnly affirm that you are 21 years of age or older and legally permitted to consume alcoholic beverages in this jurisdiction. Service staff may request physical photo identification at your banquet table.
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  setIsAgeModalOpen(false);
                  setPendingAgeItem(null);
                }}
                className="flex-1 py-2.5 rounded-full border border-slate-300 text-slate-700 font-serif font-bold text-xs hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAgeAffirmation}
                className="flex-1 py-2.5 rounded-full bg-purple-700 text-white font-serif font-bold text-xs shadow-md hover:bg-purple-800 uppercase tracking-wider"
              >
                I Affirm (21+)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. ITEM CUSTOMIZATION MODAL */}
      {/* ========================================================================= */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#faf8f5] w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-[#d4af37]/40 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[#e5dcce] bg-[#f5efe4] flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-sm text-[#1e1912]">{customizingItem.name}</h3>
                <div className="mt-0.5">
                  <p className="text-[11px] text-[#786b59] font-serif italic">
                    {customizingItem.categoryName || 'Banquet Course'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCustomizingItem(null)}
                className="p-1 rounded-full text-[#786b59] hover:bg-black/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {customizingItem.description && (
                <p className="text-xs text-[#6e6150] font-serif leading-relaxed">
                  {customizingItem.description}
                </p>
              )}

              {/* Quantity Stepper */}
              <div className="flex items-center justify-between border-t border-b border-[#ece2d3] py-3">
                <span className="text-xs font-serif font-bold text-[#3d3427]">Portions for Table</span>
                <div className="flex items-center gap-3 bg-[#f5ede0] rounded-full px-3 py-1 border border-[#e2d5c2]">
                  <button
                    onClick={() => setItemQuantity((prev) => Math.max(1, prev - 1))}
                    className="p-1 text-[#6e5f4c] hover:text-[#1e1912]"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono font-bold text-sm w-6 text-center">{itemQuantity}</span>
                  <button
                    onClick={() => setItemQuantity((prev) => prev + 1)}
                    className="p-1 text-[#6e5f4c] hover:text-[#1e1912]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Note input */}
              <div>
                <label className="block text-xs font-serif font-bold text-[#3d3427] mb-1">
                  Preparation Instructions (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Extra sauce, mild spice, no onions..."
                  value={itemNote}
                  onChange={(e) => setItemNote(e.target.value)}
                  className="w-full bg-white border border-[#dbcfbe] rounded-xl px-3 py-2 text-xs text-[#1e1912] placeholder-slate-400 focus:outline-none focus:border-[#d4af37]"
                />
              </div>
            </div>

            <div className="p-4 border-t border-[#e5dcce] bg-[#f5efe4]">
              <button
                onClick={handleConfirmAddToCart}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#d4af37] via-[#c49a26] to-[#b38b19] text-white font-serif font-bold text-xs uppercase tracking-widest shadow-lg hover:brightness-105 active:scale-98 transition-all"
              >
                Add to Banquet Order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. BANQUET CART SLIDE-OVER / MODAL (ZERO PRICING / ZERO POS TRANSACTIONS) */}
      {/* ========================================================================= */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#faf8f5] w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-[#d4af37]/40 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#e5dcce] bg-[#f5efe4] flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-sm text-[#1e1912]">Review Banquet Order</h3>
                <p className="text-[11px] text-[#786b59] font-mono">
                  Table {cleanTableBadge(tableNumber)} • Host-Sponsored Feast
                </p>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1 rounded-full text-[#786b59] hover:bg-black/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              {cart.length === 0 ? (
                <div className="py-12 text-center text-slate-500 font-serif text-sm">
                  Your cart is currently empty. Please select courses from the banquet menu.
                </div>
              ) : (
                <>
                  <div className="bg-[#1e1912] text-[#f7eed9] p-3 rounded-xl flex items-center justify-between border border-[#d4af37]/60">
                    <div className="flex items-center gap-2">
                      <ChefHat className="w-4 h-4 text-[#d4af37]" />
                      <span className="text-xs font-serif font-bold">Table Destination:</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#e6c86a]">
                      TABLE {cleanTableBadge(tableNumber)}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {cart.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-3 rounded-xl border border-[#ebe2d5] flex items-center justify-between gap-3 shadow-sm"
                      >
                        <div className="flex-1">
                          <h4 className="text-xs font-serif font-bold text-[#1e1912]">{item.name}</h4>
                          {item.notes && (
                            <p className="text-[10px] text-[#877864] italic">Note: {item.notes}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 bg-[#f5ede0] rounded-full px-2 py-0.5">
                          <button
                            onClick={() => handleUpdateCartQty(idx, -1)}
                            className="p-1 text-[#70614e] hover:text-[#1e1912]"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold text-xs w-4 text-center">{item.quantity}</span>
                          <button
                            onClick={() => handleUpdateCartQty(idx, 1)}
                            className="p-1 text-[#70614e] hover:text-[#1e1912]"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Guest Name & Notes */}
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-serif font-bold text-[#42392c] mb-1">
                        Your Name (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Wedding Guest / Table Host"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className="w-full bg-white border border-[#dbcfbe] rounded-xl px-3 py-2 text-xs text-[#1e1912] placeholder-slate-400 focus:outline-none focus:border-[#d4af37]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-serif font-bold text-[#42392c] mb-1">
                        Kitchen Instructions (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Serve with main dinner..."
                        value={guestNotes}
                        onChange={(e) => setGuestNotes(e.target.value)}
                        className="w-full bg-white border border-[#dbcfbe] rounded-xl px-3 py-2 text-xs text-[#1e1912] placeholder-slate-400 focus:outline-none focus:border-[#d4af37]"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 border-t border-[#e5dcce] bg-[#f5efe4]">
                <button
                  onClick={handlePlaceOrder}
                  disabled={isSubmitting || !isOrderingOpen}
                  className={`w-full py-3.5 rounded-2xl text-white font-serif font-bold text-xs uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2 ${
                    !isOrderingOpen
                      ? 'bg-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-gradient-to-r from-[#d4af37] via-[#c79f29] to-[#b38b19] shadow-[#d4af37]/30 hover:brightness-105 active:scale-98'
                  }`}
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Submit Dining Order for Table {cleanTableBadge(tableNumber)}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. PLACED ORDER CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {placedOrder && (
        <div className="fixed inset-0 z-50 bg-[#faf8f5] overflow-y-auto p-6 flex flex-col items-center justify-center animate-in zoom-in-95 duration-300">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-emerald-100 border-2 border-emerald-400 text-emerald-600 flex items-center justify-center mx-auto shadow-xl">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-mono font-bold tracking-widest uppercase text-[#91752b]">
                {event.title}
              </span>
              <h2 className="text-2xl font-serif font-bold text-[#1e1912]">Order Received!</h2>
              <p className="text-xs font-serif italic text-[#706453]">
                Your dining request has been routed directly to the banquet kitchen.
              </p>
            </div>

            <div className="bg-white border-2 border-[#d4af37]/40 rounded-2xl p-5 text-left space-y-3 shadow-lg">
              <div className="flex items-center justify-between border-b border-[#f0e8dc] pb-2.5">
                <span className="text-xs font-serif text-[#786956]">Ticket Ref</span>
                <span className="font-mono font-bold text-[#1e1912]">
                  {placedOrder.id.length > 10 ? `#${placedOrder.id.slice(-6)}` : `#${placedOrder.id}`}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#f0e8dc] pb-2.5">
                <span className="text-xs font-serif text-[#786956]">Assigned Table</span>
                <span className="font-mono font-bold text-amber-800 bg-amber-100/60 px-2.5 py-0.5 rounded-full text-xs">
                  TABLE {cleanTableBadge(placedOrder.tableNumber)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-xs font-serif text-[#786956]">Preparation Status</span>
                <span className="text-xs font-mono font-bold text-emerald-600 uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  {placedOrder.kitchenStatus || placedOrder.status || 'PREPARING'}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setPlacedOrder(null)}
                className="w-full py-3 rounded-full bg-[#1e1912] text-[#f7eed9] border border-[#d4af37] font-serif font-bold text-xs uppercase tracking-wider shadow-md hover:bg-black transition-colors"
              >
                Return to Banquet Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeddingGuestApp;
