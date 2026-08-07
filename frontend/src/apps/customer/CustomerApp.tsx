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
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');

  const [selectedTableNum, setSelectedTableNum] = useState<string>(tableNumber);
  const [currentTable, setCurrentTable] = useState<Table | null>(null);
  const [allRestaurantTables, setAllRestaurantTables] = useState<Table[]>([]);
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);
  const [isTableSelectorModalOpen, setIsTableSelectorModalOpen] = useState(false);
  const [isCallWaiterModalOpen, setIsCallWaiterModalOpen] = useState(false);

  // Cart state
  const [cart, setCart] = useState<{ item: MenuItem; quantity: number; notes?: string }[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Active Live Order
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    loadRestaurantAndMenu();
    loadTableInfo();
    loadInitialOrder();

    const unsubscribe = realtimeBus.subscribe((event) => {
      if (event.tableNumber === selectedTableNum && event.data) {
        setActiveOrder(event.data);

        if (event.type === 'ETAUpdated') {
          addToast('info', 'Kitchen ETA Updated ⏱️', event.reason || `Prep time adjusted to ${event.estimatedPrepTimeMinutes}m`);
        } else if (event.type === 'OrderAccepted') {
          addToast('success', 'Order Accepted! 🔥', `Estimated cooking time: ${event.estimatedPrepTimeMinutes} mins`);
        } else if (event.type === 'OrderReady') {
          addToast('success', 'Order Ready! ✨', 'Your order is prepared and ready to serve.');
        } else if (event.type === 'OrderDelivered') {
          addToast('success', 'Food & Drinks Served 🍽️', 'Enjoy your meal!');
        }
      }
      loadTableInfo();
    });

    return () => unsubscribe();
  }, [selectedTableNum]);

  const loadTableInfo = async () => {
    const tbls = await api.getTables('rest-1');
    setAllRestaurantTables(tbls);
    const tbl = tbls.find(
      (t) => t.tableNumber.toLowerCase() === selectedTableNum.toLowerCase() || t.id === selectedTableNum
    );
    if (tbl) {
      setCurrentTable(tbl);
    }
  };

  const loadRestaurantAndMenu = async () => {
    const rests = await api.getRestaurants();
    const r = rests.find((x) => x.id === 'rest-1') || rests[0];
    if (r) setCurrentRestaurant(r);

    const items = await api.getMenuItems('rest-1');
    setMenuItems(items);
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
    setIsAgeModalOpen(false);
    setCurrentMenuTab('BAR');
    setActiveCategory('all');
    addToast('success', 'Age Verified 🍸', 'Welcome to the Bar Menu!');
  };

  const loadInitialOrder = async () => {
    const allOrders = await api.getOrders('rest-1');
    const tableOrd = allOrders.find((o) => o.tableNumber === tableNumber && o.status !== 'DELIVERED');
    if (tableOrd) {
      setActiveOrder(tableOrd);
    }
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
      targetDestination: currentMenuTab === 'BAR' ? ('BAR' as const) : ('KITCHEN' as const),
    };

    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === selectedItem.id);
      if (existing) {
        return prev.map((c) =>
          c.item.id === selectedItem.id ? { ...c, quantity: c.quantity + quantity, notes: specialInstructions } : c
        );
      }
      return [...prev, { item: itemToAdd, quantity, notes: specialInstructions }];
    });
    addToast('success', 'Added to Cart', `${quantity}x ${selectedItem.name}`);
    setSelectedItem(null);
    setQuantity(1);
    setSpecialInstructions('');
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
      price: c.item.price,
      quantity: c.quantity,
      notes: c.notes,
      targetDestination: c.item.targetDestination || (currentMenuTab === 'BAR' ? 'BAR' : 'KITCHEN'),
      isAlcoholic: c.item.isAlcoholic,
      alcoholPercentage: c.item.alcoholPercentage,
      glassSize: c.item.glassSize,
    }));

    const newOrd = await api.createCustomerOrder({
      restaurantId: 'rest-1',
      tableNumber: selectedTableNum,
      customerName: 'Guest Customer',
      items: orderItems,
      totalAmount: total,
      taxAmount: tax,
      tipAmount: 0,
      status: 'PENDING',
      targetDestination: targetDest,
      paymentStatus: 'UNPAID',
    });

    setActiveOrder(newOrd);
    setCart([]);
    setIsCartOpen(false);
    addToast('success', 'Order Transmitted! 🎉', `Sent to kitchen for ${selectedTableNum}.`);
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

  const filteredItems = menuItems.filter((item) => {
    const matchesCat = activeCategory === 'all' || item.categoryId === activeCategory;
    const matchesQuery =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
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

            {currentTable.reservationDetails?.notes && (
              <p className="text-[11px] text-slate-400 italic bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                "{currentTable.reservationDetails.notes}"
              </p>
            )}
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

            <Button
              variant="outline"
              className="w-full py-3 text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
              onClick={() => setIsTableSelectorModalOpen(true)}
              icon={<QrCode className="w-4 h-4 text-rose-400" />}
            >
              Scan / Select Different Unreserved Table
            </Button>
          </div>
        </div>

        {/* Table Selector Modal */}
        <Modal
          isOpen={isTableSelectorModalOpen}
          onClose={() => setIsTableSelectorModalOpen(false)}
          title="Switch Table Floor Plan"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">Select an available table to proceed directly to ordering menu:</p>
            <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto">
              {allRestaurantTables.map((t) => {
                const isRes = t.status === 'RESERVED' || !!t.reservationDetails;
                const isMer = t.isMerged || t.status === 'MERGED';
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTableNum(t.tableNumber);
                      setIsTableSelectorModalOpen(false);
                    }}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      isRes
                        ? 'bg-amber-950/20 border-amber-500/40 text-amber-300'
                        : isMer
                        ? 'bg-sky-950/20 border-sky-500/40 text-sky-300'
                        : t.tableNumber === selectedTableNum
                        ? 'bg-rose-600 border-rose-500 text-white font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-bold text-xs">{t.tableNumber}</span>
                    <span className="text-[10px] text-slate-400">{t.section || 'Main'} • {t.capacity} seats</span>
                    {isRes ? (
                      <span className="text-[9px] text-amber-400 font-bold mt-1">🔒 Reserved</span>
                    ) : isMer ? (
                      <span className="text-[9px] text-sky-400 font-bold mt-1">🔗 Merged Group</span>
                    ) : (
                      <span className="text-[9px] text-emerald-400 font-bold mt-1">✓ Available</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-28 max-w-md mx-auto relative border-x border-slate-800 shadow-2xl">
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Hero Banner Header */}
      <div className="relative h-52 w-full bg-slate-800 overflow-hidden">
        <img
          src={theme.bannerUrl}
          alt={theme.restaurantName}
          className="w-full h-full object-cover brightness-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

        {/* Floating Table Badge Top Right */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <button
            onClick={() => setIsTableSelectorModalOpen(true)}
            className="px-3 py-1 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg flex items-center gap-1.5 transition-all"
            title="Click to switch table"
          >
            <span>📍 {selectedTableNum}</span>
            <span className="text-[10px] bg-rose-800/80 px-1.5 py-0.5 rounded">Switch 🔀</span>
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
              <span>⭐ 4.9 (120+ reviews)</span> • <span>Modern Fine Dining</span>
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Bar (Call Waiter & Bill) */}
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

      {/* Food Menu ⇄ Bar Menu Switcher (If Bar Feature is Enabled) */}
      {currentRestaurant?.features?.bar !== false && (
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
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
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

      {/* Live Order Status & ETA Tracker (If active) */}
      {activeOrder && (
        <CustomerLiveTracker order={activeOrder} onUpdateOrder={setActiveOrder} />
      )}

      {/* Menu Filter Tabs */}
      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={currentMenuTab === 'BAR' ? "Search cocktails, wine, beer..." : "Search menu items or ingredients..."}
            className="w-full bg-slate-800 text-slate-100 text-xs rounded-xl pl-10 pr-4 py-2.5 border border-slate-700/80 focus:outline-none focus:border-rose-500"
          />
        </div>

        {/* Categories (Swaps between Food Categories & Bar Categories) */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              activeCategory === 'all'
                ? 'bg-[var(--brand-primary,#e11d48)] text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All {currentMenuTab === 'BAR' ? 'Drinks 🍸' : 'Dishes 🍽️'}
          </button>
          {(currentMenuTab === 'BAR'
            ? [
                { id: 'Cocktails', name: 'Cocktails' },
                { id: 'Signature Drinks', name: 'Signature Drinks' },
                { id: 'Beer', name: 'Beer' },
                { id: 'Wine', name: 'Wine' },
                { id: 'Whiskey', name: 'Whiskey' },
                { id: 'Gin', name: 'Gin' },
                { id: 'Mocktails', name: 'Mocktails' },
              ]
            : MOCK_CATEGORIES.filter((c) => c.restaurantId === 'rest-1')
          ).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? 'bg-[var(--brand-primary,#e11d48)] text-white shadow-md'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu Items List */}
        <div className="space-y-4">
          {menuItems
            .filter((item) => {
              if (currentMenuTab === 'BAR') {
                return item.targetDestination === 'BAR' || item.isAlcoholic || item.barCategory;
              } else {
                return item.targetDestination !== 'BAR' && !item.barCategory;
              }
            })
            .filter((item) => {
              if (activeCategory !== 'all') {
                return item.categoryId === activeCategory || item.barCategory === activeCategory;
              }
              return true;
            })
            .filter((item) =>
              searchQuery
                ? item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  item.description.toLowerCase().includes(searchQuery.toLowerCase())
                : true
            )
            .map((item) => (
              <Card
                key={item.id}
                className="bg-slate-800/80 border-slate-700/60 p-3.5 flex gap-3.5 hover:border-slate-600 transition-all cursor-pointer rounded-2xl group"
                onClick={() => {
                  setSelectedItem(item);
                  setQuantity(1);
                }}
              >
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-24 h-24 rounded-xl object-cover shrink-0 border border-slate-700/80 group-hover:scale-105 transition-transform"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="text-sm font-bold text-slate-100 truncate">{item.name}</h3>
                      {item.isVegetarian && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                          Veg
                        </span>
                      )}
                      {item.isAlcoholic && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0 font-bold">
                          {item.alcoholPercentage}% ABV
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1">{item.description}</p>
                    {(item.glassSize || item.bottleSize) && (
                      <p className="text-[10px] text-amber-400 font-mono mt-0.5">
                        {item.glassSize || item.bottleSize}
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
                      className="text-xs py-1 px-3 rounded-lg font-bold"
                    >
                      Add +
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      </div>

      {/* Floating Cart Sticky Footer */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-[var(--brand-primary,#e11d48)] text-white font-bold p-4 rounded-2xl shadow-2xl flex items-center justify-between hover:opacity-95 transition-opacity active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-mono text-xs font-black">
                {totalCartCount}
              </div>
              <span className="text-sm">View Cart Order</span>
            </div>
            <span className="font-mono text-base font-black">{formatPrice(subtotal)} →</span>
          </button>
        </div>
      )}

      {/* Food Details Modal */}
      <Modal
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.name}
      >
        {selectedItem && (
          <div className="space-y-4">
            <img src={selectedItem.image} alt={selectedItem.name} className="w-full h-48 object-cover rounded-2xl" />
            <p className="text-xs text-slate-300">{selectedItem.description}</p>

            <div className="flex items-center justify-between py-2 border-y border-slate-800">
              <span className="text-xs font-bold text-slate-300">Quantity</span>
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
              label="Special Kitchen Instructions"
              placeholder="e.g. Extra sauce on side, allergy note..."
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
            />

            <Button variant="brand" className="w-full py-3 text-sm font-bold mt-2" onClick={handleAddToCart}>
              Add {quantity} to Order • {formatPrice(selectedItem.price * quantity)}
            </Button>
          </div>
        )}
      </Modal>

      {/* Cart Drawer Modal */}
      <Modal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title="Your Table Order"
        description={`Delivering directly to ${tableNumber}`}
      >
        <div className="space-y-4">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {cart.map((c, idx) => (
              <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-800/80 rounded-xl">
                <div>
                  <p className="text-xs font-bold text-white">{c.quantity}x {c.item.name}</p>
                  {c.notes && <p className="text-[10px] text-amber-300">{c.notes}</p>}
                </div>
                <span className="font-mono font-bold text-xs text-rose-400">
                  {formatPrice(c.item.price * c.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-800 space-y-1 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Estimated Tax (9%)</span>
              <span>{formatPrice(subtotal * 0.09)}</span>
            </div>
            <div className="flex justify-between font-bold text-base text-white pt-2 border-t border-slate-800">
              <span>Total Due</span>
              <span className="font-mono text-emerald-400">
                {formatPrice(subtotal * 1.09)}
              </span>
            </div>
          </div>

          <Button variant="brand" className="w-full py-3.5 font-bold text-sm" onClick={handleCheckout}>
            Transmit Order to Kitchen 🔥
          </Button>
        </div>
      </Modal>

      {/* Table Switcher Modal */}
      <Modal
        isOpen={isTableSelectorModalOpen}
        onClose={() => setIsTableSelectorModalOpen(false)}
        title="Switch Dining Table Floor Plan"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300">Select an available table to switch your QR ordering session:</p>
          <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto">
            {allRestaurantTables.map((t) => {
              const isRes = t.status === 'RESERVED' || !!t.reservationDetails;
              const isMer = t.isMerged || t.status === 'MERGED';
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTableNum(t.tableNumber);
                    setIsTableSelectorModalOpen(false);
                  }}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    isRes
                      ? 'bg-amber-950/20 border-amber-500/40 text-amber-300'
                      : isMer
                      ? 'bg-sky-950/20 border-sky-500/40 text-sky-300'
                      : t.tableNumber === selectedTableNum
                      ? 'bg-rose-600 border-rose-500 text-white font-bold shadow-lg shadow-rose-950/40'
                      : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold text-xs">{t.tableNumber}</span>
                  <span className="text-[10px] text-slate-400">{t.section || 'Main'} • {t.capacity} seats</span>
                  {isRes ? (
                    <span className="text-[9px] text-amber-400 font-bold mt-1">🔒 Reserved</span>
                  ) : isMer ? (
                    <span className="text-[9px] text-sky-400 font-bold mt-1">🔗 Merged Group</span>
                  ) : (
                    <span className="text-[9px] text-emerald-400 font-bold mt-1">✓ Available</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      {/* Call Waiter Service Modal */}
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
