import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { api } from '../../packages/api/client';
import { PublicWeddingEventResponse, Order } from '../../packages/types';
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
  Info
} from 'lucide-react';

interface WeddingGuestAppProps {
  eventId?: string;
  initialTable?: string;
}

interface CartItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  imageUrl?: string;
}

export const WeddingGuestApp: React.FC<WeddingGuestAppProps> = ({ eventId: propEventId, initialTable: propInitialTable }) => {
  // Extract eventId and table from URL params if not passed as props
  const [eventId, setEventId] = useState<string>(() => {
    if (propEventId) return propEventId;
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      // Match /event/:eventId or /events/:eventId
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

      // Also check path format /event/:id/table/:tableNum
      const path = window.location.pathname;
      const match = path.match(/\/table\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) return match[1];
    }
    return '01';
  });

  const [data, setData] = useState<PublicWeddingEventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dietary filter state
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'NON_VEG' | 'DRINKS'>('ALL');
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestNotes, setGuestNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Placed Order Confirmation & Live Tracking
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null);
  const [orderStatusPoll, setOrderStatusPoll] = useState<string>('PENDING');

  // Item customization modal
  const [customizingItem, setCustomizingItem] = useState<any | null>(null);
  const [itemNote, setItemNote] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);

  // Fetch event and menu data
  useEffect(() => {
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

  // Total cart calculation
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Open item customization dialog
  const handleOpenCustomize = (item: any) => {
    setCustomizingItem(item);
    setItemQuantity(1);
    setItemNote('');
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
          price: customizingItem.price,
          quantity: itemQuantity,
          notes: itemNote.trim() || undefined,
          imageUrl: customizingItem.imageUrl,
        },
      ];
    });

    setCustomizingItem(null);
  };

  // Quick increment/decrement in cart
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

  // Place wedding guest order
  const handlePlaceOrder = async () => {
    if (!data || cart.length === 0) return;
    setIsSubmitting(true);
    try {
      const orderPayload = {
        restaurantId: data.restaurant.id,
        tableNumber: tableNumber || '01',
        customerName: guestName.trim() || `Guest at Table ${tableNumber}`,
        orderType: 'WEDDING_EVENT',
        eventId: data.event.id,
        eventName: data.event.title,
        items: cart.map((ci) => ({
          menuItemId: ci.itemId,
          name: ci.name,
          price: ci.price,
          quantity: ci.quantity,
          notes: ci.notes || '',
        })),
        notes: guestNotes.trim() ? `[Wedding Banquet] ${guestNotes.trim()}` : `[Wedding Banquet Order for Table ${tableNumber}]`,
      };

      const res = await api.createOrder(orderPayload);
      setPlacedOrder(res);
      setOrderStatusPoll(res.status || 'PENDING');
      setCart([]);
      setIsCartOpen(false);

      // Trigger Celebration Confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#d4af37', '#e07a86', '#10b981', '#ffffff'],
        });
      } catch (e) {}
    } catch (err: any) {
      console.error('Failed to place wedding order:', err);
      alert(err.message || 'Failed to place order. Please check with your banquet waiter.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter items based on dietary and category selection
  const filteredCategories = useMemo(() => {
    if (!data?.menu) return [];

    return data.menu
      .map((cat) => {
        const matchingItems = cat.items.filter((item) => {
          if (dietaryFilter === 'VEG' && !item.isVegetarian) return false;
          if (dietaryFilter === 'NON_VEG' && item.isVegetarian) return false;
          if (dietaryFilter === 'DRINKS' && !item.isAlcoholic) return false;
          return true;
        });
        return {
          ...cat,
          items: matchingItems,
        };
      })
      .filter((cat) => cat.items.length > 0 && (activeCategory === 'ALL' || cat.id === activeCategory));
  }, [data?.menu, dietaryFilter, activeCategory]);

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
  const isOrderingOpen = event.isOrderingOpen;

  return (
    <div className="min-h-screen bg-[#faf8f5] text-[#292218] font-sans pb-32 selection:bg-[#d4af37]/30">
      {/* Top Luxury Banner / Hero */}
      <header className="relative bg-gradient-to-b from-[#f3ede2] via-[#faf8f5] to-[#faf8f5] border-b border-[#e8dfcf] px-6 pt-10 pb-8 text-center overflow-hidden">
        {/* Subtle Decorative Elements */}
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-80 h-80 bg-[#d4af37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-[#d4af37]/40 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
            <span className="text-[11px] font-serif font-bold tracking-widest uppercase text-[#8f7528]">
              {event.eventType || 'Wedding Celebration'}
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
          <div className="pt-2">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#1e1912] text-[#f7eed9] text-xs font-mono font-bold tracking-wider shadow-md border border-[#d4af37]">
              <span>💍 TABLE {tableNumber}</span>
              <span className="w-1 h-1 rounded-full bg-[#d4af37]" />
              <span className="font-serif font-normal text-[11px] text-[#e0d6c2]">Seated Guest</span>
            </div>
          </div>

          {/* Welcome Message */}
          {event.welcomeMessage && (
            <p className="text-xs text-[#6e6353] font-serif italic max-w-md mx-auto pt-2 leading-relaxed">
              "{event.welcomeMessage}"
            </p>
          )}

          {/* Venue and Date Details */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-3 text-[11px] text-[#857764] font-medium border-t border-[#ede4d5] mt-4">
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

      {/* Live Ordering Status Banner if Paused */}
      {!isOrderingOpen && (
        <div className="bg-amber-100/80 border-y border-amber-300 text-amber-900 px-4 py-3 text-center text-xs font-serif">
          <strong>Banquet Dining Update:</strong> Online ordering is temporarily paused by the hosts or dining staff. Please consult your banquet attendant.
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Dietary Filters */}
        <div className="flex items-center justify-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'ALL', label: 'All Delicacies', icon: null },
            { id: 'VEG', label: 'Vegetarian', icon: '🟢' },
            { id: 'NON_VEG', label: 'Non-Veg', icon: '🔴' },
            { id: 'DRINKS', label: 'Cocktails & Wine', icon: '🍷' },
          ].map((flt) => (
            <button
              key={flt.id}
              onClick={() => setDietaryFilter(flt.id as any)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-serif font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                dietaryFilter === flt.id
                  ? 'bg-[#1e1912] text-[#f7eed9] shadow-md border border-[#d4af37]'
                  : 'bg-white/80 text-[#786b59] border border-[#e5dcce] hover:border-[#d4af37]/60'
              }`}
            >
              {flt.icon && <span>{flt.icon}</span>}
              <span>{flt.label}</span>
            </button>
          ))}
        </div>

        {/* Menu Categories Stream */}
        {filteredCategories.length === 0 ? (
          <div className="py-16 text-center text-slate-500 font-serif text-sm">
            No dishes found matching this dietary selection.
          </div>
        ) : (
          <div className="space-y-8">
            {filteredCategories.map((cat) => (
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
                  {cat.items.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white/95 rounded-2xl border border-[#ebe2d5] hover:border-[#d4af37]/60 p-4 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-4"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full border ${
                              item.isVegetarian
                                ? 'bg-emerald-500 border-emerald-600'
                                : 'bg-rose-500 border-rose-600'
                            }`}
                            title={item.isVegetarian ? 'Vegetarian' : 'Non-Vegetarian'}
                          />
                          <h3 className="text-sm font-serif font-bold text-[#1e1912]">{item.name}</h3>
                          {item.isAlcoholic && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-serif">
                              Alcoholic
                            </span>
                          )}
                        </div>

                        {item.description && (
                          <p className="text-xs text-[#706453] leading-relaxed line-clamp-2">
                            {item.description}
                          </p>
                        )}

                        <div className="pt-1 flex items-center gap-3">
                          <span className="font-serif font-bold text-[#91752b] text-sm">
                            ₹{item.price.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Right Add Action / Thumbnail */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-16 h-16 rounded-xl object-cover border border-[#ebe2d5] shadow-inner"
                          />
                        )}

                        <button
                          onClick={() => handleOpenCustomize(item)}
                          disabled={!isOrderingOpen}
                          className={`px-3 py-1.5 rounded-full text-xs font-serif font-bold flex items-center gap-1 transition-all ${
                            isOrderingOpen
                              ? 'bg-[#faf5eb] hover:bg-[#1e1912] text-[#856b27] hover:text-[#f7eed9] border border-[#d4af37]/60 shadow-sm active:scale-95'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Select</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* ITEM CUSTOMIZATION MODAL (NOTES & QUANTITY) */}
      {/* ========================================================================= */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-[#faf8f5] w-full max-w-md rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl border border-[#d4af37]/40 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-serif font-bold text-[#1e1912]">{customizingItem.name}</h3>
                <p className="text-xs font-serif font-bold text-[#91752b] mt-0.5">
                  ₹{customizingItem.price.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setCustomizingItem(null)}
                className="p-1 rounded-full text-[#786b59] hover:bg-black/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {customizingItem.description && (
              <p className="text-xs text-[#706453] leading-relaxed italic font-serif">
                {customizingItem.description}
              </p>
            )}

            <div>
              <label className="block text-xs font-serif font-bold text-[#42392c] mb-1">
                Special Dietary or Preparation Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Extra sauce, no onions, gluten allergy..."
                value={itemNote}
                onChange={(e) => setItemNote(e.target.value)}
                className="w-full bg-white border border-[#dbcfbe] rounded-xl px-3 py-2 text-xs text-[#1e1912] placeholder-slate-400 focus:outline-none focus:border-[#d4af37]"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-serif font-bold text-[#42392c]">Serving Quantity</span>
              <div className="flex items-center gap-3 bg-white border border-[#dbcfbe] rounded-full px-3 py-1">
                <button
                  onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                  className="p-1 text-[#786b59] hover:text-[#1e1912]"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold text-sm w-5 text-center">{itemQuantity}</span>
                <button
                  onClick={() => setItemQuantity((q) => q + 1)}
                  className="p-1 text-[#786b59] hover:text-[#1e1912]"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <button
              onClick={handleConfirmAddToCart}
              className="w-full mt-3 py-3 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#c79f29] to-[#b38b19] text-white font-serif font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#d4af37]/30 hover:brightness-105 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              <span>Add to Dining Order</span>
              <span>•</span>
              <span>₹{(customizingItem.price * itemQuantity).toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FLOATING CART BAR (WHEN CART HAS ITEMS) */}
      {/* ========================================================================= */}
      {totalCartCount > 0 && !isCartOpen && !placedOrder && (
        <div className="fixed bottom-6 inset-x-4 max-w-lg mx-auto z-40 animate-in slide-in-from-bottom duration-300">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-[#1e1912] text-[#f7eed9] border border-[#d4af37] rounded-2xl p-3.5 shadow-2xl flex items-center justify-between hover:scale-[1.01] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#d4af37] text-slate-950 flex items-center justify-center font-bold text-xs shadow-md">
                {totalCartCount}
              </div>
              <div className="text-left">
                <p className="text-xs font-serif font-bold text-[#f7eed9]">Review Banquet Order</p>
                <p className="text-[10px] text-[#c2b297] font-mono">Table {tableNumber}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-serif font-bold text-sm text-[#e6c86a]">
              <span>₹{cartSubtotal.toFixed(2)}</span>
              <ChevronRight className="w-4 h-4 text-[#d4af37]" />
            </div>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CART DRAWER / CHECKOUT MODAL */}
      {/* ========================================================================= */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-[#faf8f5] w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl border border-[#d4af37]/40 space-y-4 max-h-[90vh] flex flex-col justify-between">
            <div className="space-y-4 overflow-y-auto pr-1">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#e5dcce] pb-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#d4af37]" />
                  <h2 className="text-base font-serif font-bold text-[#1e1912]">Your Dining Selection</h2>
                </div>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="p-1 rounded-full text-[#786b59] hover:bg-black/5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Table assignment callout */}
              <div className="bg-[#1e1912] text-[#f7eed9] p-3 rounded-xl flex items-center justify-between border border-[#d4af37]/60">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-4 h-4 text-[#d4af37]" />
                  <span className="text-xs font-serif font-bold">Table Assignment:</span>
                </div>
                <span className="text-xs font-mono font-bold text-[#e6c86a]">
                  TABLE {tableNumber}
                </span>
              </div>

              {/* Items List */}
              <div className="space-y-2.5">
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
                      <p className="text-xs font-serif font-bold text-[#91752b] mt-0.5">
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </p>
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

              {/* Guest Details */}
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-serif font-bold text-[#42392c] mb-1">
                    Your Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sarah Jenkins"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="w-full bg-white border border-[#dbcfbe] rounded-xl px-3 py-2 text-xs text-[#1e1912] placeholder-slate-400 focus:outline-none focus:border-[#d4af37]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-serif font-bold text-[#42392c] mb-1">
                    Banquet Chef Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Serve dessert after speeches..."
                    value={guestNotes}
                    onChange={(e) => setGuestNotes(e.target.value)}
                    className="w-full bg-white border border-[#dbcfbe] rounded-xl px-3 py-2 text-xs text-[#1e1912] placeholder-slate-400 focus:outline-none focus:border-[#d4af37]"
                  />
                </div>
              </div>

              {/* Total Calculation */}
              <div className="border-t border-[#e5dcce] pt-3 flex items-center justify-between">
                <span className="text-xs font-serif font-bold text-[#5e5140]">Total Course Price</span>
                <span className="text-base font-serif font-bold text-[#91752b]">₹{cartSubtotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Place Order Button */}
            <button
              onClick={handlePlaceOrder}
              disabled={isSubmitting || cart.length === 0}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#c79f29] to-[#b38b19] text-white font-serif font-bold text-xs uppercase tracking-widest shadow-xl shadow-[#d4af37]/30 hover:brightness-105 active:scale-98 transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Place Dining Order for Table {tableNumber}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PLACED ORDER CONFIRMATION & LIVE BANQUET TRACKER */}
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

            {/* Order Ticket Details */}
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
                  TABLE {placedOrder.tableNumber}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#f0e8dc] pb-2.5">
                <span className="text-xs font-serif text-[#786956]">Guest</span>
                <span className="text-xs font-serif font-medium text-[#1e1912]">{placedOrder.customerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-serif text-[#786956]">Kitchen Status</span>
                <span className="text-xs font-mono font-bold text-emerald-600 uppercase flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  PREPARING
                </span>
              </div>
            </div>

            {/* Action to Order More */}
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
