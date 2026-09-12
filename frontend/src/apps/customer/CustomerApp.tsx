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
  AlertTriangle,
  Trash2,
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
  DinelyLogoMark,
} from '../../packages/ui';
import { useTheme } from '../../packages/theme/ThemeEngine';
import { CallWaiterModal } from './CallWaiterModal';
import { api } from '../../packages/api/client';
import { MenuItem, Order, OrderItem, OrderStatus, Table, Restaurant, TableSession, MenuCategory, getFulfillmentStation } from '../../packages/types';
import { CustomerLiveTracker } from './CustomerLiveTracker';
import { CustomerBillModal } from './CustomerBillModal';
import { realtimeBus } from '../../packages/api/realtime';
import { matchTableNumber, formatStandardTableNumber } from '../../packages/utils/tableUtils';
import { getTenantFromHostname } from '../../packages/utils/tenantResolver';

export const CustomerApp: React.FC<{ tableNumber?: string }> = ({
  tableNumber = 'Table 01',
}) => {
  const { theme, formatPrice, setTheme } = useTheme();
  const [currentMenuTab, setCurrentMenuTab] = useState<'FOOD' | 'BAR'>('FOOD');
  const [isAgeConfirmed, setIsAgeConfirmed] = useState<boolean>(false);
  const [isAgeModalOpen, setIsAgeModalOpen] = useState<boolean>(false);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dietaryFilter, setDietaryFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [foodCategories, setFoodCategories] = useState<MenuCategory[]>([]);
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
  const [currentTableSession, setCurrentTableSession] = useState<TableSession | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [highlightActiveOrders, setHighlightActiveOrders] = useState(false);
  const [isRecentStatusPulse, setIsRecentStatusPulse] = useState(false);
  const [isOrderStatusModalOpen, setIsOrderStatusModalOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);

  const handleScrollToActiveOrders = () => {
    const el = document.getElementById('active-orders-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setHighlightActiveOrders(true);
      setTimeout(() => setHighlightActiveOrders(false), 2000);
    }
  };

  const [isSessionEnded, setIsSessionEnded] = useState(false);
  const [restaurantError, setRestaurantError] = useState<'RESTAURANT_NOT_FOUND' | null>(null);
  const [tableError, setTableError] = useState<'TABLE_NOT_FOUND' | null>(null);

  useEffect(() => {
    async function initCustomerApp() {
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const urlRestParam = urlParams?.get('restaurant') || urlParams?.get('restaurantId') || urlParams?.get('restId') || undefined;
      const urlTableIdParam = urlParams?.get('tableId') || undefined;
      const urlTableNumParam = urlParams?.get('table') || urlParams?.get('tableNumber') || undefined;

      // 1. Purge stale customer state when opening an explicit QR code URL
      if (typeof window !== 'undefined' && (urlRestParam || urlTableIdParam || urlTableNumParam)) {
        setCustomerOrders([]);
        setCurrentTableSession(null);
        setCurrentTable(null);
      }

      // 2. Load restaurant details & menu items
      const r = await loadRestaurantAndMenu();
      if (!r) {
        // Strict isolation: if venue resolution failed (e.g. unknown tenant), stop immediately
        return;
      }
      const targetRestId = r.id;

      // 3. Load table & active session details
      await loadTableInfo(urlTableNumParam, targetRestId, urlTableIdParam);
    }

    initCustomerApp();
  }, [typeof window !== 'undefined' ? window.location.search : '']);

  // Reactive Realtime Event Listener & 3-Second Polling bound strictly to (restaurantId, tableId, tableSessionId)
  useEffect(() => {
    const restId = currentRestaurant?.id;
    const tId = currentTable?.id;
    const sId = currentTableSession?.id;

    if (!restId) return;

    realtimeBus.connect(restId, 'CUSTOMER', sId);

    const fetchLiveCustomerOrders = () => {
      api.getCustomerOrders(restId, tId || selectedTableNum, sId).then((orders) => {
        if (Array.isArray(orders)) {
          setCustomerOrders(orders);
        }
      });
    };

    fetchLiveCustomerOrders();
    const pollInterval = setInterval(fetchLiveCustomerOrders, 5000);

    const unsubscribe = realtimeBus.subscribe((event) => {
      const evtRestId = event.restaurantId || (event as any).restaurant_id;
      if (evtRestId && restId && String(evtRestId).toLowerCase() !== String(restId).toLowerCase()) {
        return;
      }

      fetchLiveCustomerOrders();

      if (event.type === 'TableSessionClosed' || event.type === 'TableCleared' || event.type === 'table_session_closed') {
        setIsSessionEnded(true);
        setCurrentTableSession(null);
        setCustomerOrders([]);
        addToast('info', 'Session Ended 🧹', 'Your table session has been closed by staff');
        return;
      }

      if (
        event.type === 'menu_item_created' ||
        event.type === 'menu_item_updated' ||
        event.type === 'menu_item_deleted' ||
        event.type === 'menu_item_availability_changed' ||
        event.type === 'MenuItemCreated' ||
        event.type === 'MenuItemUpdated' ||
        event.type === 'MenuItemDeleted'
      ) {
        api.getMenuItems(restId).then((items) => setMenuItems(items));
        api.getCategories(restId).then((cats) => setFoodCategories(cats));
      }

      setIsRecentStatusPulse(true);
      setTimeout(() => setIsRecentStatusPulse(false), 3500);


      if (event.type === 'ETAUpdated') {
        addToast('info', 'ETA Updated', event.reason || `Prep time adjusted to ${event.estimatedPrepTimeMinutes}m`);
      } else if (event.type === 'OrderAccepted') {
        addToast('success', 'Order Accepted', `Estimated time: ${event.estimatedPrepTimeMinutes} mins`);
      } else if (event.type === 'OrderReady' || event.type === 'order_ready') {
        addToast('success', 'Order Ready', 'Your food/drinks are prepared and ready.');
      } else if (event.type === 'OrderDelivered' || event.type === 'order_status_updated') {
        if (event.status === 'DELIVERED') {
          addToast('success', 'Order Served', 'Enjoy your order!');
        }
      }
    });

    return () => {
      clearInterval(pollInterval);
      unsubscribe();
    };
  }, [currentRestaurant?.id, currentTable?.id, currentTableSession?.id, selectedTableNum]);

  const loadTableInfo = async (explicitTableNum?: string, explicitRestId?: string, explicitTableId?: string) => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const pathParts = pathname.split('/').filter(Boolean);
    let pathTableIdParam: string | undefined = undefined;
    if (pathParts.length >= 2 && (pathParts[0] === 'qr' || pathParts[0] === 'customer' || pathParts[0] === 'order')) {
      pathTableIdParam = pathParts.length >= 3 ? pathParts[2] : pathParts[1];
    }

    const domainResolution = getTenantFromHostname();
    // Host Authority: Ignore injected restaurant query parameters when on a tenant subdomain
    const urlRestParam = domainResolution.isTenantSubdomain ? undefined : (urlParams?.get('restaurant') || urlParams?.get('restaurantId') || urlParams?.get('restId') || urlParams?.get('restaurant_id'));
    const restId = (domainResolution.isTenantSubdomain && currentRestaurant?.id)
      ? currentRestaurant.id
      : (explicitRestId || currentRestaurant?.id || urlRestParam || api.getCurrentRestaurantId() || undefined);
    const urlTableIdParam = explicitTableId || urlParams?.get('tableId') || pathTableIdParam || undefined;
    const urlTableParam = urlParams?.get('table') || urlParams?.get('tableNumber');
    const rawTableStr = explicitTableNum || urlTableParam || (urlTableIdParam ? undefined : selectedTableNum);

    if (!restId) return;

    let tbls: Table[] = [];
    try {
      tbls = await api.getTables(restId);
      setAllRestaurantTables(tbls);
    } catch (e) {
      console.error('Failed to load restaurant tables:', e);
    }

    let tbl: Table | undefined;
    if (urlTableIdParam) {
      tbl = tbls.find((t) => t.id === urlTableIdParam);
    }
    if (!tbl && rawTableStr) {
      tbl = tbls.find(
        (t) => t.id === rawTableStr || (t.tableNumber && matchTableNumber(t.tableNumber, rawTableStr)) || t.tableNumber === rawTableStr
      );
    }

    // QR Security Verification:
    // If a specific table was requested in the URL, it MUST exist in this restaurant.
    // Cross-tenant injection (table from another restaurant or invalid table) triggers 403/404 error screen.
    const isExplicitTableRequest = Boolean(urlTableParam || urlTableIdParam || explicitTableId || explicitTableNum);
    if (isExplicitTableRequest && !tbl) {
      setTableError('TABLE_NOT_FOUND');
      return;
    }

    // Default fallback when visiting the restaurant customer root without a table query param
    if (!tbl && tbls.length > 0) {
      tbl = tbls[0];
    }

    const displayTableNum = tbl ? tbl.tableNumber : (rawTableStr ? formatStandardTableNumber(rawTableStr) : 'Table 01');
    const resolvedTableId = tbl ? tbl.id : (urlTableIdParam || `tbl-${restId}-${displayTableNum.toLowerCase().replace(/\s+/g, '_')}`);

    if (selectedTableNum !== displayTableNum) {
      setSelectedTableNum(displayTableNum);
    }
    if (tbl) {
      setCurrentTable(tbl);
    }

    try {
      const session = await api.getOrCreateTableSession(restId, resolvedTableId, displayTableNum);
      if (session) {
        const lastSessionKey = `dinely_session_${restId}_${resolvedTableId}`;
        const prevSessionId = typeof window !== 'undefined' ? sessionStorage.getItem(lastSessionKey) : null;
        if (prevSessionId && prevSessionId !== session.id) {
          setCart([]);
          setCustomerOrders([]);
          setIsSessionEnded(false);
        }
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(lastSessionKey, session.id);
        }

        setCurrentTableSession(session);

        await loadInitialOrder(session.id, restId, displayTableNum);
      }
    } catch (err: any) {
      console.error('Table session creation rejected:', err);
      // Backend returned 403 Forbidden or 404 Not Found (Cross-tenant security block)
      setTableError('TABLE_NOT_FOUND');
      return;
    }
  };


  const loadRestaurantAndMenu = async (): Promise<Restaurant | null> => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const pathParts = pathname.split('/').filter(Boolean);

    let pathRestParam: string | undefined = undefined;
    let pathTableIdParam: string | undefined = undefined;

    if (pathParts.length >= 2 && (pathParts[0] === 'qr' || pathParts[0] === 'customer' || pathParts[0] === 'order')) {
      if (pathParts.length >= 3) {
        pathRestParam = pathParts[1];
        pathTableIdParam = pathParts[2];
      } else if (pathParts.length === 2) {
        pathTableIdParam = pathParts[1];
      }
    }

    const domainResolution = getTenantFromHostname();
    // Host Authority: query overrides are only allowed on platform domains or localhost
    const urlTenantParam = domainResolution.isTenantSubdomain ? null : (urlParams?.get('tenant') || urlParams?.get('slug'));
    const urlRestParam = domainResolution.isTenantSubdomain ? null : (urlParams?.get('restaurant') || urlParams?.get('restaurantId') || urlParams?.get('restId') || urlParams?.get('restaurant_id') || pathRestParam);
    const urlTableIdParam = urlParams?.get('tableId') || pathTableIdParam;

    let r: Restaurant | null = null;

    // 1. Resolve strictly from Tenant Subdomain (e.g. the-dunk.dinely.food -> the-dunk)
    if (domainResolution.isTenantSubdomain && domainResolution.slug) {
      r = await api.resolveRestaurantBySlug(domainResolution.slug);
      if (!r) {
        // Strict multi-tenant isolation: Never fallback on unknown tenant subdomains
        setRestaurantError('RESTAURANT_NOT_FOUND');
        return null;
      }
    } else {
      // 2. Resolve from explicit query parameter override (platform domain or dev only)
      if (!r && urlTenantParam) {
        r = await api.resolveRestaurantBySlug(urlTenantParam);
      }

      // 3. Resolve from explicit restaurant ID param
      if (!r && urlRestParam) {
        r = await api.getRestaurantDetails(urlRestParam);
      }

      // 4. Resolve from table ID if encoded with restaurant ID (tbl-{restaurantId}-table_XX)
      if (!r && urlTableIdParam) {
        const match = urlTableIdParam.match(/^tbl-(.+?)-(?:table_|tbl_)/);
        if (match && match[1]) {
          r = await api.getRestaurantDetails(match[1]);
        }
      }
    }

    if (r) {
      setRestaurantError(null);
      setCurrentRestaurant(r);
      api.currentRestaurantId = r.id;
      if (r.theme) {
        setTheme({
          ...r.theme,
          restaurantName: r.name,
          currency: r.theme.currency || r.currency || 'INR (₹)',
        });
      }
      const [items, cats] = await Promise.all([
        api.getMenuItems(r.id),
        api.getCategories(r.id),
      ]);
      setMenuItems(items);
      setFoodCategories(cats);
      await loadInitialOrder(undefined, r.id);
    } else {
      setRestaurantError('RESTAURANT_NOT_FOUND');
    }
    return r || null;
  };

  const handleCheckInAndUnlockTable = async () => {
    if (!currentTable) return;
    await api.checkInReservedTable(currentTable.id);
    addToast('success', 'Table Unlocked', `Welcome ${currentTable.reservationDetails?.reservedForName || 'Guest'}. You may now order.`);
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
      sessionStorage.setItem('dinely_bar_age_verified', 'true');
    }
    setIsAgeModalOpen(false);
    setCurrentMenuTab('BAR');
    setActiveCategory('all');
    addToast('success', 'Age Verified', 'Welcome to the Bar Lounge Menu.');
  };

  const getTableStorageKey = (restId?: string, tableNum?: string) => {
    const rId = restId || currentRestaurant?.id || api.getCurrentRestaurantId() || '';
    const tNum = (tableNum || selectedTableNum || tableNumber || 'Table 01').toLowerCase().replace(/\s+/g, '');
    return `dinely_customer_active_orders_${rId}_${tNum}`;
  };

  const saveCustomerOrderId = (orderId: string, restId?: string, tableNum?: string) => {
    try {
      const key = getTableStorageKey(restId, tableNum);
      const listA: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      if (!listA.includes(orderId)) {
        listA.unshift(orderId);
        localStorage.setItem(key, JSON.stringify(listA));
      }
    } catch (e) {
      console.error('Failed to save customer order ID', e);
    }
  };

  const getSavedCustomerOrderIds = (restId?: string, tableNum?: string): string[] => {
    try {
      const key = getTableStorageKey(restId, tableNum);
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  };

  const removeSavedCustomerOrderId = (orderId: string, restId?: string, tableNum?: string) => {
    try {
      const key = getTableStorageKey(restId, tableNum);
      const list: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      localStorage.setItem(key, JSON.stringify(list.filter((id) => id !== orderId)));
    } catch (e) {
      console.error('Failed to remove customer order ID', e);
    }
  };

  const loadInitialOrder = async (targetSessionId?: string, overrideRestId?: string, explicitTableNum?: string) => {
    const restId = overrideRestId || currentRestaurant?.id || api.getCurrentRestaurantId();
    if (!restId) return;

    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const urlTableParam = urlParams?.get('table') || urlParams?.get('tableNumber') || urlParams?.get('tableId');
    const activeTableStr = explicitTableNum || (urlTableParam ? formatStandardTableNumber(urlTableParam) : selectedTableNum || tableNumber || 'Table 01');
    const activeSessionId = targetSessionId || currentTableSession?.id;

    if (!activeSessionId) {
      setCustomerOrders([]);
      return;
    }

    const tableOrds = await api.getCustomerOrders(restId, currentTable?.id || activeTableStr, activeSessionId);
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
    const station = getFulfillmentStation(selectedItem);
    const itemToAdd = {
      ...selectedItem,
      targetDestination: station,
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
    const taxRatePercent = typeof currentRestaurant?.taxPercentage === 'number' ? currentRestaurant.taxPercentage : 5.0;
    const tax = Math.round(subtotal * (taxRatePercent / 100) * 100) / 100;
    const total = subtotal + tax;

    const orderItems: OrderItem[] = cart.map((c, idx) => {
      const station = getFulfillmentStation(c.item);
      return {
        id: `oi-${Date.now()}-${idx}`,
        menuItemId: c.item.id,
        name: c.item.name,
        quantity: c.quantity,
        price: c.item.price,
        notes: c.notes,
        targetDestination: station,
        isAlcoholic: c.item.isAlcoholic || station === 'BAR',
        alcoholPercentage: c.item.alcoholPercentage,
        glassSize: c.item.glassSize || c.item.bottleSize,
      };
    });

    const hasBarItems = orderItems.some((i) => i.targetDestination === 'BAR');
    const hasKitchenItems = orderItems.some((i) => i.targetDestination === 'KITCHEN');
    const targetDest = hasBarItems && hasKitchenItems ? 'MIXED' : hasBarItems ? 'BAR' : 'KITCHEN';

    const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
    const isNoTable = currentRestaurant?.hasTables === false;

    try {
      const newOrd = await api.createOrder({
        restaurantId: restId,
        tableId: currentTable?.id,
        tableNumber: isNoTable ? 'COUNTER' : selectedTableNum,
        tableSessionId: currentTableSession?.id,
        orderType: isNoTable ? 'PICKUP' : 'DINE_IN',
        customerName: 'Guest',
        items: orderItems,
        totalAmount: total,
        status: 'PENDING',
        targetDestination: targetDest,
        paymentStatus: 'UNPAID',
      });

      saveCustomerOrderId(newOrd.id, restId, selectedTableNum);

      setCustomerOrders((prev) => [newOrd, ...prev.filter((o) => o.id !== newOrd.id)]);
      setCart([]);
      setIsCartOpen(false);
      setIsOrderStatusModalOpen(true);
      addToast(
        'success',
        'Order Transmitted',
        `Order ${newOrd.displayOrderNumber || '#' + newOrd.id} routed to ${hasBarItems ? 'Bar Terminal' : ''} ${hasKitchenItems ? 'Kitchen KDS' : ''}`.trim()
      );
    } catch (err: any) {
      console.error('Order checkout failed:', err);
      addToast('error', 'Unable to Place Order', err?.message || 'Server network error. Please check connection and try again.');
    }
  };


  const handleCallWaiter = () => {
    setIsCallWaiterModalOpen(true);
  };

  const handleRequestBill = async () => {
    await api.requestBill(selectedTableNum);
    addToast('success', 'Bill Requested', `Your waiter is bringing the check for ${selectedTableNum}.`);
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

  if (restaurantError === 'RESTAURANT_NOT_FOUND') {
    return (
      <div className="min-h-screen bg-[#0b0d11] text-[#f0f2f5] flex flex-col justify-between p-6 max-w-md mx-auto border-x border-white/[0.08] relative font-sans">
        <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
        <div className="space-y-6 text-center my-auto">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase bg-white/[0.04] text-white/60 border border-white/[0.08]">
              404 Venue Not Found
            </span>
            <h2 className="text-xl font-semibold text-white">Venue Not Found</h2>
            <p className="text-xs text-white/50 max-w-xs mx-auto leading-relaxed">
              The venue or restaurant you are looking for does not exist or is no longer active on Dinely. Please check the URL or ask staff for assistance.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (tableError === 'TABLE_NOT_FOUND') {
    return (
      <div className="min-h-screen bg-[#0b0d11] text-[#f0f2f5] flex flex-col justify-between p-6 max-w-md mx-auto border-x border-white/[0.08] relative font-sans">
        <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
        <div className="space-y-6 text-center my-auto">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <QrCode className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase bg-white/[0.04] text-white/60 border border-white/[0.08]">
              Table Code Error
            </span>
            <h2 className="text-xl font-semibold text-white">Unrecognized Table Code</h2>
            <p className="text-xs text-white/50 max-w-xs mx-auto leading-relaxed">
              The table specified in this QR code could not be verified. Please request assistance from our floor staff.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // RESERVED TABLE BLOCK SCREEN
  const isTableReserved = currentTable && (currentTable.status === 'RESERVED' || !!currentTable.reservationDetails);

  if (isTableReserved) {
    return (
      <div className="min-h-screen bg-[#0b0d11] text-[#f0f2f5] flex flex-col justify-between p-6 max-w-md mx-auto border-x border-white/[0.08] relative font-sans">
        <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

        <div className="space-y-6 text-center my-auto">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase bg-white/[0.04] text-white/60 border border-white/[0.08]">
              Table Reserved
            </span>
            <h2 className="text-xl font-semibold text-white">{selectedTableNum} is Reserved</h2>
            <p className="text-xs text-white/50">
              {currentTable.section || 'Main Dining Room'} • Capacity: {currentTable.capacity} Guests
            </p>
          </div>

          <div className="bg-[#12151b] border border-white/[0.08] p-5 rounded-xl space-y-3 text-left">
            <div className="flex items-center gap-2 text-white/80 font-medium text-xs">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>Reservation Details</span>
            </div>

            <div className="space-y-1 text-xs text-white/60 font-mono">
              <p>Guest: <strong className="text-white font-sans">{currentTable.reservationDetails?.reservedForName || 'Private Guest'}</strong></p>
              <p>Time: <strong className="text-amber-300 font-sans">{currentTable.reservationDetails?.reservationTime || '7:30 PM'}</strong></p>
              <p>Party: <strong className="text-white font-sans">{currentTable.reservationDetails?.partySize || currentTable.capacity} Persons</strong></p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Button
              variant="brand"
              className="w-full py-3 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-black rounded-lg"
              onClick={handleCheckInAndUnlockTable}
              icon={<UserCheck className="w-4 h-4" />}
            >
              Check In as {currentTable.reservationDetails?.reservedForName || 'Reserved Guest'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (isSessionEnded) {
    return (
      <div className="min-h-screen bg-[#0b0d11] text-[#f0f2f5] flex flex-col justify-between p-6 max-w-md mx-auto border-x border-white/[0.08] relative font-sans">
        <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

        <div className="space-y-6 text-center my-auto">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase bg-white/[0.04] text-white/60 border border-white/[0.08]">
              Session Closed
            </span>
            <h2 className="text-xl font-semibold text-white">Thank You for Dining with Us</h2>
            <p className="text-xs text-white/50 leading-relaxed max-w-xs mx-auto">
              Your dining session for <strong className="text-white">{selectedTableNum}</strong> has concluded. We look forward to welcoming you again.
            </p>
          </div>

          <div className="bg-[#12151b] border border-white/[0.08] p-5 rounded-xl space-y-2 text-left">
            <p className="font-medium text-xs text-white">Starting a new visit?</p>
            <p className="text-xs text-white/50">
              To place a new order, tap below to refresh or re-scan your table QR code.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <Button
              variant="brand"
              className="w-full py-3 text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.12] text-white border border-white/[0.1] rounded-lg"
              onClick={async () => {
                setIsSessionEnded(false);
                await loadTableInfo();
              }}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Start New Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isBarTheme = currentMenuTab === 'BAR';

  return (
    <div className={`min-h-screen font-sans pb-44 sm:pb-48 max-w-md mx-auto relative border-x border-white/[0.08] bg-[#0b0d11] text-[#f0f2f5]`}>
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Hero Banner Header */}
      <div className="relative h-48 w-full bg-[#12151b] overflow-hidden">
        <img
          src={isBarTheme ? 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&auto=format&fit=crop&q=80' : theme.bannerUrl}
          alt={theme.restaurantName}
          className="w-full h-full object-cover brightness-[0.7] transition-all duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d11] via-[#0b0d11]/40 to-transparent" />

        {/* Floating Action Buttons Top Right */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          {customerOrders.filter((o) => o.status !== 'CANCELLED').length > 0 && (
            <button
              onClick={() => setIsOrderStatusModalOpen(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-black hover:bg-amber-400 flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Orders ({customerOrders.filter((o) => o.status !== 'CANCELLED').length})</span>
            </button>
          )}

          <div className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-black/60 backdrop-blur-md text-white border border-white/[0.1]">
            <span>{selectedTableNum}</span>
          </div>
        </div>

        {/* Restaurant Header Content */}
        <div className="absolute bottom-4 left-4 right-4 flex items-end gap-3 z-10">
          <img
            src={theme.logo}
            alt={theme.restaurantName}
            className="w-14 h-14 rounded-xl object-cover border border-white/20 shadow-lg bg-[#0b0d11]"
          />
          <div>
            <h1 className="text-lg font-semibold text-white tracking-tight">{theme.restaurantName}</h1>
            <p className="text-xs text-white/60 font-medium flex items-center gap-2 mt-0.5">
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                <span>4.9</span>
              </span>
              <span>•</span>
              <span className="text-white/40">{isBarTheme ? 'Craft Cocktails & Wine Lounge' : 'Dining Room Experience'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Quick Action Bar (Call Waiter, Live Order Tracker & My Bill) */}
      {currentRestaurant?.hasTables !== false ? (
        <div className="p-2.5 grid grid-cols-3 gap-2 bg-[#0b0d11]/90 border-b border-white/[0.08] sticky top-0 z-20 backdrop-blur-md">
          <button
            onClick={handleCallWaiter}
            className="py-2 px-2 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white/80 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <PhoneCall className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Call Staff</span>
          </button>

          <button
            onClick={() => setIsOrderStatusModalOpen(true)}
            className={`py-2 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              customerOrders.filter((o) => o.status !== 'CANCELLED').length > 0
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300 font-semibold'
                : 'bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white/80 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Orders</span>
            {customerOrders.filter((o) => o.status !== 'CANCELLED').length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-black text-[10px] font-bold font-mono">
                {customerOrders.filter((o) => o.status !== 'CANCELLED').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsBillModalOpen(true)}
            className="py-2 px-2 rounded-lg bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-white/80 hover:text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <Receipt className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">Bill</span>
          </button>
        </div>
      ) : (
        <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.08] text-white/70 flex items-center justify-between text-xs font-mono sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
            <span>Counter Pickup Ordering</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">PICKUP</span>
        </div>
      )}

      {/* Food Menu ⇄ Bar Menu Switcher (If Bar Feature is Enabled) */}
      {(currentRestaurant?.hasBar === true || currentRestaurant?.businessType === 'BAR') && (
        <div className="px-4 pt-3 pb-1">
          <div className="grid grid-cols-2 p-1 bg-[#12151b] rounded-xl border border-white/[0.08] text-xs font-medium">
            <button
              onClick={() => handleSwitchMenuTab('FOOD')}
              className={`py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                currentMenuTab === 'FOOD'
                  ? 'bg-white/[0.08] text-white font-semibold'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Food Menu</span>
            </button>

            <button
              onClick={() => handleSwitchMenuTab('BAR')}
              className={`py-2 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                currentMenuTab === 'BAR'
                  ? 'bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/20'
                  : 'text-white/40 hover:text-white'
              }`}
            >
              <Wine className="w-3.5 h-3.5 text-amber-400" />
              <span>Beverages & Bar</span>
              {isAgeConfirmed && (
                <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  21+
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
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-3 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isBarTheme ? "Search cocktails, wine, spirits, craft beers..." : "Search dishes, appetizers, desserts..."}
            className="w-full bg-[#12151b] text-white text-xs rounded-xl pl-9 pr-4 py-2.5 border border-white/[0.08] focus:border-amber-400/60 focus:outline-none placeholder:text-white/30"
          />
        </div>

        {/* Dietary Veg/Non-Veg Quick Filter */}
        {!isBarTheme && (
          <div className="flex items-center gap-1.5 p-1 bg-[#12151b] border border-white/[0.08] rounded-xl text-xs">
            <button
              onClick={() => setDietaryFilter('ALL')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-colors text-center ${
                dietaryFilter === 'ALL' ? 'bg-white/[0.06] text-white' : 'text-white/40 hover:text-white'
              }`}
            >
              All Dishes
            </button>

            <button
              onClick={() => setDietaryFilter('VEG')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                dietaryFilter === 'VEG'
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'text-white/40 hover:text-emerald-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Veg Only</span>
            </button>

            <button
              onClick={() => setDietaryFilter('NON_VEG')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                dietaryFilter === 'NON_VEG'
                  ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                  : 'text-white/40 hover:text-rose-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span>Non-Veg</span>
            </button>
          </div>
        )}

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              activeCategory === 'all'
                ? 'bg-amber-500 text-black font-semibold'
                : 'bg-[#12151b] text-white/60 hover:text-white border border-white/[0.08]'
            }`}
          >
            All {isBarTheme ? 'Beverages' : 'Categories'}
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
            : foodCategories.length > 0
            ? foodCategories.map((c) => ({ id: c.id, name: c.name }))
            : Array.from(new Set(menuItems.map((i) => i.categoryId).filter(Boolean))).map((catId) => ({
                id: String(catId),
                name: String(catId).replace(/^cat-/, '').replace(/[-_]/g, ' ').toUpperCase(),
              }))
          ).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? 'bg-amber-500 text-black font-semibold'
                  : 'bg-[#12151b] text-white/60 hover:text-white border border-white/[0.08]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu Items List */}
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const isVeg = item.isVegetarian !== false && item.dietaryType !== 'NON_VEG';
            return (
              <div
                key={item.id}
                className="p-3.5 flex gap-3.5 transition-colors cursor-pointer rounded-xl bg-[#12151b] border border-white/[0.08] hover:border-white/[0.16] shadow-sm group"
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
                    className="w-22 h-22 rounded-lg object-cover border border-white/[0.08] group-hover:opacity-90 transition-opacity"
                  />
                  {item.isAlcoholic && (
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/80 text-white/80 border border-white/[0.1]">
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
                            className={`inline-flex items-center justify-center border p-0.5 rounded-[3px] shrink-0 ${
                              isVeg ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-rose-500/60 bg-rose-500/10'
                            }`}
                            title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          </span>
                        )}
                        <h3 className="text-xs font-semibold text-white truncate">{item.name}</h3>
                      </div>

                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.2 rounded shrink-0 ${
                          isVeg
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {isVeg ? 'VEG' : 'NON-VEG'}
                      </span>
                    </div>
                    {item.brand && (
                      <p className="text-[10px] text-amber-400/90 font-mono mt-0.5">{item.brand}</p>
                    )}
                    <p className="text-xs text-white/50 line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                    {(item.glassSize || item.bottleSize) && (
                      <p className="text-[10px] text-white/40 font-mono mt-0.5">
                        Serving: {item.glassSize || item.bottleSize}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.06]">
                    <span className="text-xs font-mono font-semibold text-white">
                      {formatPrice(item.price)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const station = getFulfillmentStation(item);
                        const itemToAdd = {
                          ...item,
                          targetDestination: station,
                        };
                        setCart((prev) => {
                          const existing = prev.find((c) => c.item.id === item.id);
                          if (existing) {
                            return prev.map((c) => (c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
                          }
                          return [...prev, { item: itemToAdd, quantity: 1 }];
                        });
                        addToast('success', 'Added to order', `1x ${item.name}`);
                      }}
                      className="text-xs py-1 px-3 rounded-lg font-medium bg-amber-500 text-black hover:bg-amber-400 transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredItems.length === 0 && (
            <div className="p-8 text-center bg-[#12151b] border border-dashed border-white/[0.08] rounded-xl text-white/40 text-xs">
              No items found in this category.
            </div>
          )}
        </div>
      </div>



      {/* Subtle Customer Footer Attribution */}
      <footer className="py-8 px-4 text-center text-xs text-slate-500 border-t border-slate-900 mt-12 mb-24 space-y-1">
        <p className="font-semibold text-slate-400">{currentRestaurant?.name || 'Restaurant'}</p>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-mono pt-1">
          <span>Powered by</span>
          <DinelyLogoMark size={14} className="opacity-80 inline-block" />
          <span className="font-bold text-slate-300">Dinely</span>
        </div>
      </footer>

      {/* Floating Cart Sticky Footer */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold p-3.5 rounded-xl shadow-2xl border border-amber-400/30 flex items-center justify-between transition-all active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-black/20 flex items-center justify-center font-mono text-xs font-bold text-slate-950">
                {totalCartCount}
              </div>
              <span className="text-xs font-semibold">View Order Cart</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-xs font-bold">
              <span>{formatPrice(subtotal)}</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Item Selection & Customization Modal */}
      <Modal
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.name}
      >
        {selectedItem && (
          <div className="space-y-4 text-xs font-sans">
            <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#12151b]">
              <img src={selectedItem.image} alt={selectedItem.name} className="w-full h-44 object-cover" />
              <div className="absolute top-2.5 left-2.5">
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-medium ${
                    selectedItem.isVegetarian !== false && selectedItem.dietaryType !== 'NON_VEG'
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-950/80 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {selectedItem.isVegetarian !== false && selectedItem.dietaryType !== 'NON_VEG' ? 'VEG' : 'NON-VEG'}
                </span>
              </div>
            </div>
            
            {selectedItem.brand && (
              <p className="text-amber-400 font-mono text-xs font-medium">Brand: {selectedItem.brand}</p>
            )}
            
            <p className="text-white/60 leading-relaxed text-xs">{selectedItem.description}</p>

            {selectedItem.servingOptions && selectedItem.servingOptions.length > 0 && (
              <div className="space-y-2">
                <span className="font-medium text-white/80 block text-xs">Serving Option</span>
                <div className="flex flex-wrap gap-2">
                  {selectedItem.servingOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSelectedServingOption(opt)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                        selectedServingOption === opt
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-[#12151b] text-white/70 border-white/[0.08] hover:border-white/20'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between py-2.5 border-y border-white/[0.08]">
              <span className="font-medium text-white/80 text-xs">Quantity</span>
              <div className="flex items-center gap-3 bg-[#12151b] border border-white/[0.08] p-1 rounded-lg">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="h-7 w-7 p-0 text-white/60 hover:text-white"
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
                <span className="font-mono font-semibold text-xs text-white min-w-[20px] text-center">{quantity}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuantity(quantity + 1)}
                  className="h-7 w-7 p-0 text-white/60 hover:text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <Input
              label="Preparation Instructions / Notes"
              placeholder="e.g. Less spicy, dressing on the side, allergies..."
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
            />

            <Button
              variant="brand"
              onClick={handleAddToCart}
              className="w-full py-3 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md"
            >
              Add to Order · {formatPrice(selectedItem.price * quantity)}
            </Button>
          </div>
        )}
      </Modal>

      {/* Cart Summary Modal */}
      <Modal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title="Order Summary"
      >
        <div className="space-y-4 text-xs font-sans">
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {cart.map((c, idx) => (
              <div key={idx} className="p-3 bg-[#12151b] rounded-xl border border-white/[0.08] flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="font-medium text-white text-xs">
                    <span className="font-mono text-amber-400 font-bold mr-1.5">{c.quantity}×</span>
                    {c.item.name}
                  </p>
                  {c.servingOption && (
                    <p className="text-[11px] text-white/50 font-mono">Serving: {c.servingOption}</p>
                  )}
                  {c.notes && <p className="text-[11px] text-amber-400/80 italic">{c.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono font-semibold text-white">{formatPrice(c.item.price * c.quantity)}</span>
                  <button
                    onClick={() => {
                      setCart((prev) => prev.filter((_, i) => i !== idx));
                    }}
                    className="p-1 text-white/40 hover:text-rose-400 transition-colors"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-[#12151b] rounded-xl border border-white/[0.08] space-y-1.5 font-mono text-xs">
            <div className="flex justify-between text-white/60">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>GST ({currentRestaurant?.taxPercentage ?? 5}%)</span>
              <span>{formatPrice(Math.round(subtotal * ((currentRestaurant?.taxPercentage ?? 5) / 100) * 100) / 100)}</span>
            </div>
            <div className="flex justify-between text-white font-semibold text-sm pt-2 border-t border-white/[0.08]">
              <span>Total</span>
              <span className="text-amber-400">{formatPrice(Math.round((subtotal + subtotal * ((currentRestaurant?.taxPercentage ?? 5) / 100)) * 100) / 100)}</span>
            </div>
          </div>

          <Button
            variant="brand"
            onClick={handleCheckout}
            className="w-full py-3.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xl"
          >
            Confirm & Send to Kitchen
          </Button>
        </div>
      </Modal>

      {/* Table Switcher Modal */}
      <Modal
        isOpen={isTableSelectorModalOpen}
        onClose={() => setIsTableSelectorModalOpen(false)}
        title="Switch Dining Table"
      >
        <div className="space-y-4 text-xs font-sans">
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
            {allRestaurantTables.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTableNum(t.tableNumber);
                  setIsTableSelectorModalOpen(false);
                }}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  t.tableNumber === selectedTableNum
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-400 font-semibold'
                    : 'bg-[#12151b] border-white/[0.08] text-white/80 hover:border-white/20'
                }`}
              >
                <span className="font-mono text-xs font-semibold">{t.tableNumber}</span>
                <span className="text-[10px] text-white/40">{t.section || 'Main Area'}</span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      {/* Legal Age Confirmation Modal */}
      <Modal
        isOpen={isAgeModalOpen}
        onClose={() => setIsAgeModalOpen(false)}
        title="Age Verification (21+)"
      >
        <div className="space-y-4 text-xs font-sans">
          <div className="p-4 bg-[#12151b] border border-white/[0.08] rounded-xl space-y-2">
            <div className="flex items-center gap-2 font-semibold text-amber-400 text-xs">
              <Wine className="w-4 h-4 text-amber-400" />
              <span>Age Verification Required</span>
            </div>
            <p className="text-xs text-white/60 leading-relaxed">
              Before viewing or ordering from our craft beverage and cocktail menu, please confirm that you are of legal drinking age in your jurisdiction (21+).
            </p>
          </div>

          <div className="p-3 bg-[#12151b] rounded-xl border border-white/[0.08] flex items-center gap-3">
            <input
              type="checkbox"
              id="ageCheckbox"
              className="w-4 h-4 rounded border-white/20 bg-black/40 text-amber-500 focus:ring-amber-500"
              defaultChecked={true}
            />
            <label htmlFor="ageCheckbox" className="text-xs text-white/80 font-medium cursor-pointer">
              I confirm I am of legal drinking age (21+).
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAgeModalOpen(false)}
              className="border-white/[0.08] text-white/60 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={handleConfirmAge}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
              icon={<Wine className="w-4 h-4" />}
            >
              Confirm & Enter Bar Menu
            </Button>
          </div>
        </div>
      </Modal>

      {/* Call Waiter Modal */}
      <CallWaiterModal
        isOpen={isCallWaiterModalOpen}
        onClose={() => setIsCallWaiterModalOpen(false)}
        tableNumber={selectedTableNum}
        tableId={
          currentTable?.id ||
          (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tableId')) ||
          (currentRestaurant?.id ? `tbl-${currentRestaurant.id}-${selectedTableNum.toLowerCase().replace(/\s+/g, '_')}` : undefined)
        }
        tableSessionId={currentTableSession?.id}
        restaurantId={
          currentRestaurant?.id ||
          (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('restaurant') || undefined : undefined) ||
          ''
        }
        onRequestSuccess={(title, note) => {
          addToast(
            'success',
            `${title} Requested`,
            note
              ? `Note: "${note}" sent to floor waiter for ${selectedTableNum}.`
              : `Assistance requested for ${selectedTableNum}.`
          );
        }}
      />

      {/* LIVE ORDER STATUS TRACKER MODAL */}
      <Modal
        isOpen={isOrderStatusModalOpen}
        onClose={() => setIsOrderStatusModalOpen(false)}
        title="Live Order Status & Progress"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          {customerOrders.filter((o) => o.status !== 'CANCELLED').length === 0 ? (
            <div className="p-8 text-center bg-[#12151b] rounded-xl border border-white/[0.08] text-white/40 space-y-2">
              <Clock className="w-8 h-8 text-white/20 mx-auto" />
              <h4 className="font-semibold text-white text-xs">No Active Orders Yet</h4>
              <p className="text-[11px] text-white/40">Items you order will appear here with live kitchen status & prep countdowns.</p>
            </div>
          ) : (
            customerOrders
              .filter((o) => o.status !== 'CANCELLED')
              .map((order) => (
                <CustomerLiveTracker
                  key={order.id}
                  order={order}
                  onUpdateOrder={(updated) => {
                    setCustomerOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
                  }}
                />
              ))
          )}
        </div>
      </Modal>

      {/* STICKY FLOATING ACTIVE SESSION ORDER STATUS BAR */}
      {customerOrders.filter((o) => o.status !== 'CANCELLED').length > 0 && (
        <div
          className={`fixed left-4 right-4 max-w-md mx-auto z-40 transition-all duration-300 ${
            totalCartCount > 0 ? 'bottom-20' : 'bottom-4'
          }`}
        >
          <div
            onClick={() => setIsOrderStatusModalOpen(true)}
            className="bg-[#0e1117]/95 border border-white/[0.12] p-3 rounded-xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 cursor-pointer group hover:border-amber-400/40 transition-all"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-white truncate">Live Order In Progress</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0 animate-pulse" />
                </div>
                <p className="text-[11px] text-white/50 font-mono truncate">
                  {customerOrders.filter((o) => o.status !== 'CANCELLED').length} {customerOrders.filter((o) => o.status !== 'CANCELLED').length === 1 ? 'Order' : 'Orders'} · Total: ₹
                  {customerOrders.filter((o) => o.status !== 'CANCELLED').reduce((sum, o) => sum + o.totalAmount, 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-white transition-colors flex items-center gap-1 whitespace-nowrap">
                <span>Track Status</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-white/60" />
              </span>
            </div>
          </div>
        </div>
      )}

      {/* RUNNING TABLE BILL MODAL */}
      <CustomerBillModal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        tableNumber={selectedTableNum}
        currentRestaurant={currentRestaurant}
        tableSession={currentTableSession}
        onCallWaiter={handleCallWaiter}
      />
    </div>
  );
};
