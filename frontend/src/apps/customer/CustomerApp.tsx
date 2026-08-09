import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Utensils,
  Search,
  ShoppingBag,
  Clock,
  Sparkles,
  PhoneCall,
  Receipt,
  CheckCircle2,
  Plus,
  Minus,
  X,
  ChevronRight,
  Flame,
  Star,
  MapPin,
  Heart,
  ArrowLeft,
  Share2,
  Lock,
  UserCheck,
  Calendar,
  RefreshCw,
  QrCode,
  Users,
  Wine,
  ShieldCheck,
  BellRing,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Input,
  Modal,
  Tabs,
  Timeline,
  ToastContainer,
  ToastMessage,
} from '../../packages/ui';
import { useTheme } from '../../packages/theme/ThemeEngine';
import { CallWaiterModal } from './CallWaiterModal';
import { api } from '../../packages/api/client';
import { MenuItem, Order, OrderItem, OrderStatus, Table, Restaurant } from '../../packages/types';
import { MOCK_CATEGORIES } from '../../packages/data/mockData';
import { CustomerLiveTracker } from './CustomerLiveTracker';
import { realtimeBus } from '../../packages/api/realtime';

export const CustomerApp: React.FC<{ tableNumber?: string }> = ({
  tableNumber = 'Table 01',
}) => {
  const { theme, formatPrice } = useTheme();
  const [currentMenuTab, setCurrentMenuTab] = useState<'FOOD' | 'BAR'>('FOOD');
  const [isAgeConfirmed, setIsAgeConfirmed] = useState<boolean>(false);
  const [isAgeModalOpen, setIsAgeModalOpen] = useState<boolean>(false);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [selectedServingOption, setSelectedServingOption] = useState<string>('');

  const [selectedTableNum, setSelectedTableNum] = useState<string>(tableNumber);
  const [currentTable, setCurrentTable] = useState<Table | null>(null);
  const [allRestaurantTables, setAllRestaurantTables] = useState<Table[]>([]);
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);
  const [isTableSelectorModalOpen, setIsTableSelectorModalOpen] = useState(false);
  const [isCallWaiterModalOpen, setIsCallWaiterModalOpen] = useState(false);

  // Cart state
  const [cart, setCart] = useState<{ item: MenuItem; quantity: number; notes?: string; servingOption?: string }[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Active Live Orders
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [highlightActiveOrders, setHighlightActiveOrders] = useState(false);
  const [isRecentStatusPulse, setIsRecentStatusPulse] = useState(false);

  const handleScrollToActiveOrders = () => {
    const el = document.getElementById('active-orders-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightActiveOrders(true);
      setTimeout(() => setHighlightActiveOrders(false), 2000);
    }
  };

  useEffect(() => {
    const savedAge = typeof window !== 'undefined' && sessionStorage.getItem('dineflow_bar_age_verified');
    if (savedAge === 'true') {
      setIsAgeConfirmed(true);
    }
    loadRestaurantAndMenu();
    loadTableInfo();
    loadInitialOrder();

    const unsubscribe = realtimeBus.subscribe((event) => {
      const restId = api.getCurrentRestaurantId() || currentRestaurant?.id;
      if (event.restaurantId && restId && event.restaurantId !== restId) {
        return;
      }

      if (event.tableNumber?.toLowerCase() === selectedTableNum?.toLowerCase()) {
        setIsRecentStatusPulse(true);
        setTimeout(() => setIsRecentStatusPulse(false), 3500);
        if (event.type === 'OrderCreated' && event.data) {
          setCustomerOrders((prev) => {
            const exists = prev.some((o) => o.id === event.data.id);
            if (exists) return prev.map((o) => (o.id === event.data.id ? event.data : o));
            return [event.data, ...prev];
          });
        } else if (event.orderId && event.data) {
          setCustomerOrders((prev) =>
            prev.map((o) => (o.id === event.orderId ? { ...o, ...event.data } : o))
          );
        } else {
          loadInitialOrder();
        }

        if (event.type === 'ETAUpdated') {
          addToast('info', 'ETA Updated ⏱️', event.reason || `Prep time adjusted to ${event.estimatedPrepTimeMinutes}m`);
        } else if (event.type === 'OrderAccepted') {
          addToast('success', 'Order Accepted! 🔥', `Estimated time: ${event.estimatedPrepTimeMinutes} mins`);
        } else if (event.type === 'OrderReady') {
          addToast('success', 'Order Ready! ✨', 'Your food/drinks are prepared and ready.');
        } else if (event.type === 'OrderDelivered') {
          addToast('success', 'Served 🍽️', 'Enjoy your order!');
        }
      }
      loadTableInfo();
    });

    return () => unsubscribe();
  }, [selectedTableNum]);

  const loadTableInfo = async () => {
    const restId = api.getCurrentRestaurantId() || undefined;
    const tbls = await api.getTables(restId);
    setAllRestaurantTables(tbls);
    const targetTable = (selectedTableNum || 'Table 01').toLowerCase();
    const tbl = tbls.find(
      (t) => (t.tableNumber && t.tableNumber.toLowerCase() === targetTable) || t.id === selectedTableNum
    );
    if (tbl) {
      setCurrentTable(tbl);
    }
  };

  const loadRestaurantAndMenu = async () => {
    const restId = api.getCurrentRestaurantId() || undefined;
    const rests = await api.getRestaurants();
    const r = rests.find((x) => x.id === restId) || rests[0];
    if (r) {
      setCurrentRestaurant(r);
      const items = await api.getMenuItems(r.id);
      setMenuItems(items);
    } else {
      const items = await api.getMenuItems(restId);
      setMenuItems(items);
    }
  };

  const handleCheckInAndUnlockTable = async () => {
    if (!currentTable) return;
    await api.checkInReservedTable(currentTable.id);
    addToast('success', 'Table Unlocked! 🎉', `Welcome ${currentTable.reservationDetails?.reservedForName || 'Guest'}. You may now order.`);
    await loadTableInfo();
  };

  const handleSwitchMenuTab = (tab: 'FOOD' | 'BAR') => {
    if (tab === 'BAR' && !isAgeConfirmed) {
      setIsAgeModalOpen(true);
      return;
    }
    setCurrentMenuTab(tab);
    setActiveCategory('all');
  };

  const handleConfirmAge = () => {
    setIsAgeConfirmed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dineflow_bar_age_verified', 'true');
    }
    setIsAgeModalOpen(false);
    setCurrentMenuTab('BAR');
    setActiveCategory('all');
    addToast('success', 'Age Verified 🍸', 'Welcome to the Bar Lounge Menu!');
  };

  const loadInitialOrder = async () => {
    const restId = api.getCurrentRestaurantId() || undefined;
    const allOrders = await api.getOrders(restId);
    const targetTable = (selectedTableNum || tableNumber || 'Table 01').toLowerCase();
    const tableOrds = (allOrders || []).filter(
      (o) => o.tableNumber && o.tableNumber.toLowerCase() === targetTable
    );
    tableOrds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setCustomerOrders(tableOrds);
  };

  const addToast = (type: ToastMessage['type'], title: string, message?: string) => {
    const id = `toast-${Date.now()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleAddToCart = () => {
    if (!selectedItem) return;
    const itemToAdd = {
      ...selectedItem,
      targetDestination: currentMenuTab === 'BAR' || selectedItem.targetDestination === 'BAR' || selectedItem.isAlcoholic ? ('BAR' as const) : ('KITCHEN' as const),
    };

    const combinedNotes = [selectedServingOption ? `Serving: ${selectedServingOption}` : '', specialInstructions].filter(Boolean).join(' • ');

    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === selectedItem.id);
      if (existing) {
        return prev.map((c) =>
          c.item.id === selectedItem.id ? { ...c, quantity: c.quantity + quantity, notes: combinedNotes } : c
        );
      }
      return [...prev, { item: itemToAdd, quantity, notes: combinedNotes, servingOption: selectedServingOption }];
    });
    addToast('success', 'Added to Order Cart', `${quantity}x ${selectedItem.name}`);
    setSelectedItem(null);
    setQuantity(1);
    setSpecialInstructions('');
    setSelectedServingOption('');
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    const subtotal = cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);
    const tax = subtotal * 0.09;
    const total = subtotal + tax;

    const hasBarItems = cart.some((c) => c.item.targetDestination === 'BAR' || c.item.isAlcoholic);
    const hasKitchenItems = cart.some((c) => c.item.targetDestination !== 'BAR' && !c.item.isAlcoholic);

    const targetDest = hasBarItems && hasKitchenItems ? 'MIXED' : hasBarItems ? 'BAR' : 'KITCHEN';

    const orderItems: OrderItem[] = cart.map((c, idx) => ({
      id: `oi-${Date.now()}-${idx}`,
      menuItemId: c.item.id,
      name: c.item.name,
      quantity: c.quantity,
      price: c.item.price,
      notes: c.notes,
      targetDestination: c.item.targetDestination || (c.item.isAlcoholic ? 'BAR' : 'KITCHEN'),
      isAlcoholic: c.item.isAlcoholic,
      alcoholPercentage: c.item.alcoholPercentage,
      glassSize: c.item.glassSize || c.item.bottleSize,
    }));

    const restId = api.getCurrentRestaurantId() || 'rest-1';
    const isNoTable = currentRestaurant?.hasTables === false;

    const newOrd = await api.createOrder({
      restaurantId: restId,
      tableNumber: isNoTable ? 'COUNTER' : selectedTableNum,
      orderType: isNoTable ? 'PICKUP' : 'DINE_IN',
      customerName: 'Guest',
      items: orderItems,
      totalAmount: total,
      status: 'PENDING',
      targetDestination: targetDest,
      paymentStatus: 'UNPAID',
    });

    setCustomerOrders((prev) => [newOrd, ...prev.filter((o) => o.id !== newOrd.id)]);
    setCart([]);
    setIsCartOpen(false);
    addToast('success', 'Order Transmitted! 🎉', `Order #${newOrd.id} routed to ${hasBarItems ? 'Bar Terminal' : ''} ${hasKitchenItems ? 'Kitchen KDS' : ''}`);
  };

  const handleCallWaiter = () => {
    setIsCallWaiterModalOpen(true);
  };

  const handleRequestBill = async () => {
    await api.requestBill(selectedTableNum);
    addToast('success', 'Bill Requested 🧾', `Your waiter is bringing check for ${selectedTableNum}.`);
  };

  const subtotal = cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);
  const totalCartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // Filter Items
  const filteredItems = menuItems.filter((item) => {
    const isBarItem = item.targetDestination === 'BAR' || item.isAlcoholic || item.barCategory !== undefined;
    if (currentMenuTab === 'BAR' && !isBarItem) return false;
    if (currentMenuTab === 'FOOD' && isBarItem) return false;

    const matchesCat = activeCategory === 'all' || item.categoryId === activeCategory || item.barCategory === activeCategory;

    const isVegItem = item.isVegetarian !== false && item.dietaryType !== 'NON_VEG';
    const matchesDietary =
      dietaryFilter === 'ALL' ||
      (dietaryFilter === 'VEG' && isVegItem) ||
      (dietaryFilter === 'NON_VEG' && !isVegItem);

    const matchesQuery =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.brand && item.brand.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesDietary && matchesQuery;
  });

  // RESERVED TABLE BLOCK SCREEN
  const isTableReserved = currentTable && (currentTable.status === 'RESERVED' || !!currentTable.reservationDetails);

  if (isTableReserved) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-6 max-w-md mx-auto border-x border-slate-800 relative">
        <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

        <div className="space-y-6 text-center my-auto">
          <div className="w-20 h-20 mx-auto rounded-3xl bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center shadow-2xl shadow-amber-950/40">
            <Lock className="w-10 h-10 text-amber-400 animate-pulse" />
          </div>

          <div className="space-y-1">
            <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
              🔒 Table Reserved
            </span>
            <h2 className="text-2xl font-black text-white">{selectedTableNum} is Reserved</h2>
            <p className="text-xs text-slate-400">
              {currentTable.section || 'Main Dining Room'} • Capacity: {currentTable.capacity} Seats
            </p>
          </div>

          <Card className="bg-slate-900 border-amber-500/30 p-5 space-y-3 text-left">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
              <Calendar className="w-4 h-4" />
              Reservation Notice
            </div>

            <div className="space-y-1.5 text-xs text-slate-300 font-mono">
              <p>Guest Name: <strong className="text-white font-sans">{currentTable.reservationDetails?.reservedForName || 'Private Guest'}</strong></p>
              <p>Reserved Time: <strong className="text-amber-300">{currentTable.reservationDetails?.reservationTime || '7:30 PM'}</strong></p>
              <p>Party Size: <strong className="text-white">{currentTable.reservationDetails?.partySize || currentTable.capacity} Persons</strong></p>
            </div>
          </Card>

          <div className="space-y-3 pt-2">
            <Button
              variant="brand"
              className="w-full py-3.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/50"
              onClick={handleCheckInAndUnlockTable}
              icon={<UserCheck className="w-4 h-4" />}
            >
              I am {currentTable.reservationDetails?.reservedForName || 'the Reserved Guest'} (Check In)
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isBarTheme = currentMenuTab === 'BAR';

  return (
    <div className={`min-h-screen font-sans pb-28 max-w-md mx-auto relative border-x border-slate-800 shadow-2xl transition-colors duration-500 ${
      isBarTheme ? 'bg-gradient-to-b from-slate-950 via-slate-900 to-amber-950/40 text-slate-100' : 'bg-slate-900 text-slate-100'
    }`}>
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Hero Banner Header */}
      <div className="relative h-52 w-full bg-slate-800 overflow-hidden">
        <img
          src={isBarTheme ? 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&auto=format&fit=crop&q=80' : theme.bannerUrl}
          alt={theme.restaurantName}
          className="w-full h-full object-cover brightness-75 transition-all duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

        {/* Floating Table Badge Top Right */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <button
            onClick={() => setIsTableSelectorModalOpen(true)}
            className={`px-3 py-1 rounded-xl text-xs font-bold text-white shadow-lg flex items-center gap-1.5 transition-all ${
              isBarTheme ? 'bg-amber-600 hover:bg-amber-500' : 'bg-rose-600 hover:bg-rose-500'
            }`}
          >
            <span>📍 {selectedTableNum}</span>
            <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded">Switch 🔀</span>
          </button>
        </div>

        {/* Restaurant Header Content */}
        <div className="absolute bottom-4 left-4 right-4 flex items-end gap-3 z-10">
          <img
            src={theme.logo}
            alt={theme.restaurantName}
            className="w-16 h-16 rounded-2xl object-cover border-2 border-white/20 shadow-xl"
          />
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">{theme.restaurantName}</h1>
            <p className="text-xs text-slate-300 font-medium flex items-center gap-2 mt-0.5">
              <span>⭐ 4.9 (120+ reviews)</span> • <span>{isBarTheme ? 'VIP Cocktail & Wine Lounge 🍷' : 'Fine Dining Restaurant'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Bar (Call Waiter & Bill for Tables, or Counter Pickup Header for Food Truck) */}
      {currentRestaurant?.hasTables !== false ? (
        <div className="p-4 grid grid-cols-2 gap-3 bg-slate-950 border-b border-slate-800/80 sticky top-0 z-20 backdrop-blur-md bg-slate-950/90">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCallWaiter}
            className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10 py-2.5 rounded-xl font-bold"
            icon={<PhoneCall className="w-4 h-4 text-amber-400" />}
          >
            Call Waiter
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRequestBill}
            className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 py-2.5 rounded-xl font-bold"
            icon={<Receipt className="w-4 h-4 text-emerald-400" />}
          >
            Request Bill
          </Button>
        </div>
      ) : (
        <div className="px-4 py-2.5 bg-sky-500/10 border-b border-sky-500/30 text-sky-200 flex items-center justify-between text-xs font-bold sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-sky-400" />
            <span>Counter Pickup Ordering — Direct to Kitchen</span>
          </div>
          <Badge variant="warning" className="text-[10px]">PICKUP</Badge>
        </div>
      )}

      {/* Food Menu ⇄ Bar Menu Switcher (If Bar Feature is Enabled) */}
      {(currentRestaurant?.hasBar || (currentRestaurant?.hasBar === undefined && currentRestaurant?.features?.bar !== false)) && (
        <div className="px-4 pt-3 pb-1">
          <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-2xl border border-slate-800 text-xs font-bold shadow-inner">
            <button
              onClick={() => handleSwitchMenuTab('FOOD')}
              className={`py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                currentMenuTab === 'FOOD'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Utensils className="w-4 h-4" />
              <span>Food Menu</span>
            </button>

            <button
              onClick={() => handleSwitchMenuTab('BAR')}
              className={`py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                currentMenuTab === 'BAR'
                  ? 'bg-gradient-to-r from-amber-500 to-purple-600 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wine className="w-4 h-4 text-amber-300" />
              <span>Bar Menu</span>
              {isAgeConfirmed && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  21+ ✓
                </span>
              )}
            </button>
          </div>
        </div>
      )}



      {/* Menu Filter Tabs */}
      <div className="p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isBarTheme ? "Search whiskey, cocktails, wine, beer..." : "Search menu items..."}
            className={`w-full bg-slate-800 text-slate-100 text-xs rounded-xl pl-10 pr-4 py-2.5 border focus:outline-none ${
              isBarTheme ? 'border-amber-500/40 focus:border-amber-400' : 'border-slate-700/80 focus:border-rose-500'
            }`}
          />
        </div>

        {/* Dietary Veg/Non-Veg Quick Filter */}
        {!isBarTheme && (
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
            <button
              onClick={() => setDietaryFilter('ALL')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all text-center ${
                dietaryFilter === 'ALL' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Food 🍽️
            </button>

            <button
              onClick={() => setDietaryFilter('VEG')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                dietaryFilter === 'VEG'
                  ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 shadow'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>🟢 Veg</span>
            </button>

            <button
              onClick={() => setDietaryFilter('NON_VEG')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                dietaryFilter === 'NON_VEG'
                  ? 'bg-rose-950/90 text-rose-300 border border-rose-500/50 shadow'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>🔴 Non-Veg</span>
            </button>
          </div>
        )}

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeCategory === 'all'
                ? isBarTheme ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'bg-rose-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All {isBarTheme ? 'Drinks 🍸' : 'Categories'}
          </button>
          {(isBarTheme
            ? [
                { id: 'Cocktails', name: 'Cocktails' },
                { id: 'Signature Drinks', name: 'Signature' },
                { id: 'Beer', name: 'Beer' },
                { id: 'Wine', name: 'Wine' },
                { id: 'Whiskey', name: 'Whiskey' },
                { id: 'Vodka', name: 'Vodka' },
                { id: 'Rum', name: 'Rum' },
                { id: 'Gin', name: 'Gin' },
                { id: 'Champagne', name: 'Champagne' },
                { id: 'Tequila', name: 'Tequila' },
                { id: 'Mocktails', name: 'Mocktails' },
                { id: 'Shots', name: 'Shots' },
              ]
            : MOCK_CATEGORIES.filter((c) => c.restaurantId === 'rest-1')
          ).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? isBarTheme ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'bg-rose-600 text-white shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu Items List */}
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isVeg = item.isVegetarian !== false && item.dietaryType !== 'NON_VEG';
            return (
              <Card
                key={item.id}
                className={`p-3.5 flex gap-3.5 transition-all cursor-pointer rounded-2xl group ${
                  isBarTheme
                    ? 'bg-slate-900/90 border-amber-500/30 hover:border-amber-400 shadow-xl shadow-amber-950/20'
                    : 'bg-slate-800/80 border-slate-700/60 hover:border-slate-600'
                }`}
                onClick={() => {
                  setSelectedItem(item);
                  setQuantity(1);
                  setSelectedServingOption(item.servingOptions?.[0] || '');
                }}
              >
                <div className="relative shrink-0">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-24 h-24 rounded-xl object-cover border border-slate-700/80 group-hover:scale-105 transition-transform"
                  />
                  {item.isAlcoholic && (
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-950/90 text-purple-300 border border-purple-500/40">
                      {item.alcoholPercentage || 40}% ABV
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {!isBarTheme && !item.isAlcoholic && (
                          <span
                            className={`inline-flex items-center justify-center border p-0.5 rounded-[4px] shrink-0 ${
                              isVeg ? 'border-emerald-500 bg-emerald-950/80' : 'border-rose-500 bg-rose-950/80'
                            }`}
                            title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                          >
                            <span className={`w-2 h-2 rounded-full ${isVeg ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          </span>
                        )}
                        <h3 className="text-sm font-bold text-slate-100 truncate">{item.name}</h3>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          isVeg
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {isVeg ? 'Veg' : 'Non-Veg'}
                      </span>
                    </div>
                  {item.brand && (
                    <p className="text-[10px] text-amber-400 font-mono">{item.brand}</p>
                  )}
                  <p className="text-xs text-slate-400 line-clamp-2 mt-1">{item.description}</p>
                  {(item.glassSize || item.bottleSize) && (
                    <p className="text-[10px] text-purple-300 font-mono mt-0.5">
                      Serving: {item.glassSize || item.bottleSize}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
                  <span className="text-sm font-black text-emerald-400">
                    {formatPrice(item.price)}
                  </span>
                  <Button
                    size="sm"
                    variant="brand"
                    className={`text-xs py-1 px-3 rounded-lg font-bold ${
                      isBarTheme ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-rose-600 hover:bg-rose-500'
                    }`}
                  >
                    Add +
                  </Button>
                </div>
              </div>
            </Card>
          );
          })}
          {filteredItems.length === 0 && (
            <div className="p-8 text-center bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl text-slate-400 text-xs">
              No items available in this category.
            </div>
          )}
        </div>
      </div>

      {/* Dedicated Bottom Order Status Section */}
      {(() => {
        const activeOrders = customerOrders.filter(
          (o) => o.status !== 'PAID' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
        );
        const previousOrders = customerOrders.filter(
          (o) => o.status === 'PAID' || o.status === 'COMPLETED' || o.status === 'CANCELLED'
        );

        if (activeOrders.length === 0 && previousOrders.length === 0) return null;

        return (
          <div className="p-4 space-y-4 pt-6 border-t border-slate-800/80 mt-6">
            {activeOrders.length > 0 && (
              <div
                id="active-orders-section"
                className={`space-y-3 px-1 transition-all duration-500 rounded-3xl ${
                  highlightActiveOrders ? 'ring-2 ring-rose-500 bg-rose-500/10 p-2 shadow-2xl shadow-rose-950/50' : ''
                }`}
              >
                <div className="px-1 flex items-center justify-between">
                  <span className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-rose-500" />
                    Active Table Orders ({activeOrders.length})
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Live Sync</span>
                </div>
                {activeOrders.map((ord) => (
                  <CustomerLiveTracker
                    key={ord.id}
                    order={ord}
                    onUpdateOrder={(updated) =>
                      setCustomerOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
                    }
                  />
                ))}
              </div>
            )}

            {previousOrders.length > 0 && (
              <div className="my-2">
                <details className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 text-xs text-slate-300">
                  <summary className="font-bold cursor-pointer flex items-center justify-between text-slate-300 hover:text-white">
                    <span className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-emerald-400" />
                      Order History / Past Orders ({previousOrders.length})
                    </span>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                      Completed
                    </span>
                  </summary>
                  <div className="mt-3 space-y-2 pt-2 border-t border-slate-800">
                    {previousOrders.map((pOrd) => (
                      <div key={pOrd.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-white font-mono">Order #{pOrd.id}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {pOrd.items.length} items • ₹{pOrd.totalAmount.toFixed(2)}
                          </p>
                        </div>
                        <Badge variant="success" className="text-[10px] font-mono">
                          {pOrd.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        );
      })()}

      {/* Floating Cart Sticky Footer */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto">
          <button
            onClick={() => setIsCartOpen(true)}
            className={`w-full text-white font-bold p-4 rounded-2xl shadow-2xl flex items-center justify-between hover:opacity-95 transition-opacity active:scale-[0.98] ${
              isBarTheme ? 'bg-gradient-to-r from-amber-500 to-purple-600 text-slate-950' : 'bg-rose-600'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-black/20 flex items-center justify-center font-mono text-xs font-black">
                {totalCartCount}
              </div>
              <span className="text-sm font-black">View Order Cart</span>
            </div>
            <span className="font-mono text-base font-black">{formatPrice(subtotal)} →</span>
          </button>
        </div>
      )}

      {/* Sticky Order Access Bar */}
      {(() => {
        const activeOrders = customerOrders.filter(
          (o) => o.status !== 'PAID' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
        );
        if (activeOrders.length === 0) return null;

        const latestOrd = activeOrders[0];

        return (
          <div
            className={`fixed left-4 right-4 z-40 max-w-md mx-auto transition-all duration-300 ${
              totalCartCount > 0 ? 'bottom-20' : 'bottom-4'
            }`}
          >
            <div
              onClick={handleScrollToActiveOrders}
              className={`w-full p-3 rounded-2xl shadow-2xl border flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all backdrop-blur-md ${
                isRecentStatusPulse
                  ? 'bg-rose-950/95 border-rose-500 text-white ring-2 ring-rose-400 shadow-rose-950/80 animate-pulse'
                  : 'bg-slate-900/95 border-slate-700/80 text-white hover:border-slate-600 shadow-slate-950/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
                  <BellRing className="w-4 h-4 text-rose-400 animate-pulse" />
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white">
                    {activeOrders.length}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-black text-white flex items-center gap-1.5">
                    {activeOrders.length === 1 ? '1 Active Order' : `${activeOrders.length} Active Orders`}
                    {latestOrd && (
                      <span className="text-[10px] text-rose-400 font-normal font-mono">
                        (#{latestOrd.id} • {latestOrd.status})
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-slate-400">Tap to track live preparation</p>
                </div>
              </div>

              <button
                type="button"
                aria-label="Track active orders"
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1 shadow-md transition-colors shrink-0"
              >
                <span>{activeOrders.length === 1 ? 'Track Order' : `Track ${activeOrders.length} Orders`}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Item Selection & Customization Modal */}
      <Modal
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.name}
      >
        {selectedItem && (
          <div className="space-y-4 text-xs">
            <img src={selectedItem.image} alt={selectedItem.name} className="w-full h-48 object-cover rounded-2xl" />
            
            {selectedItem.brand && (
              <p className="text-amber-400 font-mono font-bold">Brand: {selectedItem.brand}</p>
            )}
            
            <p className="text-slate-300">{selectedItem.description}</p>

            {selectedItem.servingOptions && selectedItem.servingOptions.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-bold text-slate-200 block">Serving Option:</span>
                <div className="flex flex-wrap gap-2">
                  {selectedItem.servingOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSelectedServingOption(opt)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                        selectedServingOption === opt
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between py-2 border-y border-slate-800">
              <span className="font-bold text-slate-300">Quantity</span>
              <div className="flex items-center gap-3 bg-slate-800 p-1.5 rounded-xl">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="h-7 w-7 p-0"
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
                <span className="font-mono font-bold text-sm text-white">{quantity}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuantity(quantity + 1)}
                  className="h-7 w-7 p-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <Input
              label="Instructions / Notes"
              placeholder="e.g. Extra ice, lime slice, allergy..."
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
            />

            <Button
              variant="brand"
              onClick={handleAddToCart}
              className="w-full py-3 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Add to Cart ({formatPrice(selectedItem.price * quantity)})
            </Button>
          </div>
        )}
      </Modal>

      {/* Cart Summary Modal */}
      <Modal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title="Your Table Order Summary"
      >
        <div className="space-y-4 text-xs">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {cart.map((c, idx) => (
              <div key={idx} className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <p className="font-bold text-white text-sm">{c.quantity}x {c.item.name}</p>
                  {c.notes && <p className="text-[10px] text-amber-300 italic">{c.notes}</p>}
                </div>
                <span className="font-mono font-bold text-emerald-400">{formatPrice(c.item.price * c.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1 font-mono">
            <div className="flex justify-between text-slate-400"><span>Subtotal:</span><span>{formatPrice(subtotal)}</span></div>
            <div className="flex justify-between text-slate-400"><span>Tax (9%):</span><span>{formatPrice(subtotal * 0.09)}</span></div>
            <div className="flex justify-between text-white font-bold text-sm pt-1 border-t border-slate-800">
              <span>Total:</span><span>{formatPrice(subtotal * 1.09)}</span>
            </div>
          </div>

          <Button
            variant="brand"
            onClick={handleCheckout}
            className="w-full py-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl"
          >
            Transmit Order to Kitchen & Bar 🔥
          </Button>
        </div>
      </Modal>

      {/* Table Switcher Modal */}
      <Modal
        isOpen={isTableSelectorModalOpen}
        onClose={() => setIsTableSelectorModalOpen(false)}
        title="Switch Dining Table Floor Plan"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto">
            {allRestaurantTables.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTableNum(t.tableNumber);
                  setIsTableSelectorModalOpen(false);
                }}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  t.tableNumber === selectedTableNum
                    ? 'bg-rose-600 border-rose-500 text-white font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
                }`}
              >
                <span className="font-bold text-xs">{t.tableNumber}</span>
                <span className="text-[10px] text-slate-400">{t.section || 'Main'}</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Legal Age Confirmation Modal */}
      <Modal
        isOpen={isAgeModalOpen}
        onClose={() => setIsAgeModalOpen(false)}
        title="Legal Drinking Age Verification 🍷"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
              <Wine className="w-5 h-5 text-amber-400" />
              <span>Age Verification Required</span>
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              Before viewing or ordering from our craft beverage & cocktail menu, please confirm that you are of legal drinking age in your jurisdiction (21+).
            </p>
          </div>

          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
            <input
              type="checkbox"
              id="ageCheckbox"
              className="w-4 h-4 rounded border-slate-700 text-amber-500 focus:ring-amber-500"
              defaultChecked={true}
            />
            <label htmlFor="ageCheckbox" className="text-xs text-slate-300 font-semibold cursor-pointer">
              I confirm I am of legal drinking age (21+).
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAgeModalOpen(false)}
              className="border-slate-800 text-slate-400"
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={handleConfirmAge}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
              icon={<Sparkles className="w-4 h-4" />}
            >
              Enter Bar Lounge 🍸
            </Button>
          </div>
        </div>
      </Modal>

      {/* Call Waiter Modal */}
      <CallWaiterModal
        isOpen={isCallWaiterModalOpen}
        onClose={() => setIsCallWaiterModalOpen(false)}
        tableNumber={selectedTableNum}
        onRequestSuccess={(title, note) => {
          addToast(
            'success',
            `${title} Requested! 🛎️`,
            note
              ? `Note: "${note}" sent to floor waiter for ${selectedTableNum}.`
              : `Assistance requested for ${selectedTableNum}.`
          );
        }}
      />
    </div>
  );
};
