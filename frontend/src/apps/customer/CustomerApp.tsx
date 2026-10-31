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
  Loader2,
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
import { MenuItem, Order, OrderItem, OrderStatus, Table, Restaurant, TableSession, MenuCategory, getFulfillmentStation, isModuleEnabled } from '../../packages/types';
import { CustomerLiveTracker } from './CustomerLiveTracker';
import { CustomerBillModal } from './CustomerBillModal';
import { realtimeBus } from '../../packages/api/realtime';
import { matchTableNumber, formatStandardTableNumber } from '../../packages/utils/tableUtils';
import { getTenantFromHostname } from '../../packages/utils/tenantResolver';

export const CustomerApp: React.FC<{ tableNumber?: string }> = ({
  tableNumber = 'Table 01',
}) => {
  const { theme, formatPrice, setTheme } = useTheme();
  const [currentMenuTab, setCurrentMenuTab] = useState<'FOOD' | 'BAR' | 'HOOKAH'>('FOOD');
  const [isAgeConfirmed, setIsAgeConfirmed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('dinely_age_verified') === 'true';
    }
    return false;
  });
  const [latestPlacedOrder, setLatestPlacedOrder] = useState<Order | null>(null);

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
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

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
      let urlTableNumParam = urlParams?.get('table') || urlParams?.get('tableNumber') || undefined;
      if (!urlTableNumParam && typeof window !== 'undefined') {
        const match = window.location.pathname.match(/\/(?:table|t)\/([^/?#]+)/i);
        if (match && match[1]) {
          urlTableNumParam = decodeURIComponent(match[1]);
        }
      }

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

    const isOrdersEqual = (a: any[], b: any[]): boolean => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        const o1 = a[i];
        const o2 = b[i];
        if (
          o1.id !== o2.id ||
          o1.status !== o2.status ||
          o1.kitchenStatus !== o2.kitchenStatus ||
          o1.barStatus !== o2.barStatus ||
          o1.hookahStatus !== o2.hookahStatus ||
          o1.deliveryStatus !== o2.deliveryStatus ||
          o1.paymentStatus !== o2.paymentStatus ||
          o1.totalAmount !== o2.totalAmount ||
          o1.etaTargetTimestamp !== o2.etaTargetTimestamp
        ) {
          return false;
        }
      }
      return true;
    };

    let isFetchingOrders = false;
    const fetchLiveCustomerOrders = () => {
      if (isFetchingOrders || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
        return;
      }
      isFetchingOrders = true;
      api.getCustomerOrders(restId, tId || selectedTableNum, sId)
        .then((orders) => {
          if (Array.isArray(orders)) {
            setCustomerOrders((prev) => (isOrdersEqual(prev, orders) ? prev : orders));
          }
        })
        .catch(() => {})
        .finally(() => {
          isFetchingOrders = false;
        });
    };

    fetchLiveCustomerOrders();

    // Adaptive polling: when WebSocket is actively connected, back off to 30s heartbeat.
    // If WebSocket is disconnected or reconnecting, poll every 8s.
    const pollInterval = setInterval(() => {
      if (realtimeBus.getStatus() === 'CONNECTED') {
        return;
      }
      fetchLiveCustomerOrders();
    }, 8000);

    const heartbeatInterval = setInterval(() => {
      fetchLiveCustomerOrders();
    }, 30000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLiveCustomerOrders();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

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
        (api as any).base?.invalidateQueryCache?.('menu:');
        (api as any).base?.invalidateQueryCache?.('categories:');
        api.getMenuItems(restId).then((items) => setMenuItems(items));
        api.getCategories(restId).then((cats) => setFoodCategories(cats));
      }

      setIsRecentStatusPulse(true);
      setTimeout(() => setIsRecentStatusPulse(false), 3500);

      // Silently update live state from events without disruptive popup spam
      if (event.type === 'BarStatusUpdated') {
        const oId = (event as any).orderId || (event as any).order_id || (event as any).id;
        const bStatus = (event as any).barStatus || (event as any).payload?.barStatus;
        if (oId) {
          setCustomerOrders((prev) =>
            prev.map((o) =>
              o.id === oId
                ? {
                    ...o,
                    barStatus: bStatus || o.barStatus,
                    status: (event as any).status || (event as any).payload?.status || o.status,
                  }
                : o
            )
          );
        }
      } else if (event.type === 'HookahStatusUpdated') {
        const oId = (event as any).orderId || (event as any).order_id || (event as any).id;
        const hStatus = (event as any).hookahStatus || (event as any).payload?.hookahStatus;
        if (oId) {
          setCustomerOrders((prev) =>
            prev.map((o) =>
              o.id === oId
                ? {
                    ...o,
                    hookahStatus: hStatus || o.hookahStatus,
                    status: (event as any).status || (event as any).payload?.status || o.status,
                  }
                : o
            )
          );
        }
      } else if (event.type === 'OrderReady' || event.type === 'order_ready') {
        const oId = (event as any).orderId || (event as any).order_id || (event as any).id;
        if (oId) {
          setCustomerOrders((prev) =>
            prev.map((o) => (o.id === oId ? { ...o, status: 'READY', kitchenStatus: 'READY' } : o))
          );
        }
      } else if (event.type === 'OrderDelivered' || event.type === 'order_delivered') {
        const oId = (event as any).orderId || (event as any).order_id || (event as any).id;
        if (oId) {
          setCustomerOrders((prev) =>
            prev.map((o) => (o.id === oId ? { ...o, status: 'DELIVERED', kitchenStatus: 'COMPLETED', barStatus: 'COMPLETED', hookahStatus: 'COMPLETED' } : o))
          );
        }
      } else if (event.type === 'OrderCompleted' || event.type === 'order_completed') {
        const oId = (event as any).orderId || (event as any).order_id || (event as any).id;
        if (oId) {
          setCustomerOrders((prev) =>
            prev.map((o) => (o.id === oId ? { ...o, status: 'COMPLETED', kitchenStatus: 'COMPLETED', barStatus: 'COMPLETED', hookahStatus: 'COMPLETED' } : o))
          );
        }
      } else if (event.type === 'order_status_updated' || event.type === 'OrderStatusUpdated') {
        const oId = (event as any).orderId || (event as any).order_id || (event as any).id;
        const newStatus = (event as any).status || (event as any).payload?.status;
        const newKitchenStatus = (event as any).kitchenStatus || (event as any).payload?.kitchenStatus;
        const newBarStatus = (event as any).barStatus || (event as any).payload?.barStatus || (event as any).payload?.bar_status;
        const newHookahStatus = (event as any).hookahStatus || (event as any).payload?.hookahStatus || (event as any).payload?.hookah_status;
        if (oId) {
          setCustomerOrders((prev) =>
            prev.map((o) =>
              o.id === oId
                ? {
                    ...o,
                    status: newStatus || o.status,
                    kitchenStatus: newKitchenStatus || o.kitchenStatus,
                    barStatus: newBarStatus || o.barStatus,
                    hookahStatus: newHookahStatus || o.hookahStatus,
                  }
                : o
            )
          );
        }
      }
    });

    return () => {
      clearInterval(pollInterval);
      clearInterval(heartbeatInterval);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      unsubscribe();
    };
  }, [currentRestaurant?.id, currentTable?.id, currentTableSession?.id, selectedTableNum]);

  const loadTableInfo = async (explicitTableNum?: string, explicitRestId?: string, explicitTableId?: string) => {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
    const pathParts = pathname.split('/').filter(Boolean);
    let pathTableIdParam: string | undefined = undefined;
    let pathTableNumParam: string | undefined = undefined;
    if (pathParts.length >= 2) {
      if (pathParts[0] === 'table' || pathParts[0] === 't') {
        pathTableNumParam = decodeURIComponent(pathParts[1]);
      } else if (pathParts[0] === 'qr' || pathParts[0] === 'customer' || pathParts[0] === 'order') {
        pathTableIdParam = pathParts.length >= 3 ? pathParts[2] : pathParts[1];
      }
    }

    const domainResolution = getTenantFromHostname();
    // Host Authority: Ignore injected restaurant query parameters when on a tenant subdomain
    const urlRestParam = domainResolution.isTenantSubdomain ? undefined : (urlParams?.get('restaurant') || urlParams?.get('restaurantId') || urlParams?.get('restId') || urlParams?.get('restaurant_id'));
    const restId = (domainResolution.isTenantSubdomain && currentRestaurant?.id)
      ? currentRestaurant.id
      : (explicitRestId || currentRestaurant?.id || urlRestParam || api.getCurrentRestaurantId() || undefined);
    const urlTableIdParam = explicitTableId || urlParams?.get('tableId') || pathTableIdParam || undefined;
    const urlTableParam = urlParams?.get('table') || urlParams?.get('tableNumber') || pathTableNumParam;
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

  const handleSwitchMenuTab = (tab: 'FOOD' | 'BAR' | 'HOOKAH') => {
    setCurrentMenuTab(tab);
    setActiveCategory('all');
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
    // Keep at most 1 active toast to strictly prevent notification stacking
    setToasts([{ id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const lastAddTapTimeRef = React.useRef<number>(0);

  const handleUpdateItemQuantity = (itemId: string, newQuantity: number) => {
    setCart((prev) => {
      if (newQuantity <= 0) {
        return prev.filter((c) => c.item.id !== itemId);
      }
      return prev.map((c) => (c.item.id === itemId ? { ...c, quantity: newQuantity } : c));
    });
  };

  const handleDirectAddItem = (item: MenuItem) => {
    if (item.isAvailable === false) return;
    const now = Date.now();
    if (now - lastAddTapTimeRef.current < 150) return; // Prevent duplicate rapid taps
    lastAddTapTimeRef.current = now;

    if (item.servingOptions && item.servingOptions.length > 0) {
      setSelectedItem(item);
      setQuantity(1);
      setSelectedServingOption(item.servingOptions[0]);
      setSpecialInstructions('');
      return;
    }
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

    // Provide subtle non-blocking micro-feedback directly on the card button
    setRecentlyAddedId(item.id);
    setTimeout(() => {
      setRecentlyAddedId((curr) => (curr === item.id ? null : curr));
    }, 1100);
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

    setRecentlyAddedId(selectedItem.id);
    setTimeout(() => {
      setRecentlyAddedId((curr) => (curr === selectedItem.id ? null : curr));
    }, 1100);

    setSelectedItem(null);
    setQuantity(1);
    setSpecialInstructions('');
    setSelectedServingOption('');
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || isSubmittingOrder) return;
    setIsSubmittingOrder(true);

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
    const hasHookahItems = orderItems.some((i) => i.targetDestination === 'HOOKAH');
    const activeStations = [
      hasKitchenItems && 'KITCHEN',
      hasBarItems && 'BAR',
      hasHookahItems && 'HOOKAH',
    ].filter(Boolean);
    const targetDest: 'KITCHEN' | 'BAR' | 'HOOKAH' | 'MIXED' =
      activeStations.length > 1 ? 'MIXED' : (activeStations[0] as 'KITCHEN' | 'BAR' | 'HOOKAH') || 'KITCHEN';

    const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
    const isNoTable = currentRestaurant?.hasTables === false;

    try {
      const clientOrderId = `ord-cli-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const newOrd = await api.createOrder({
        id: clientOrderId,
        idempotencyKey: clientOrderId,
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
      setLatestPlacedOrder(newOrd);

      const routedTo = [
        hasKitchenItems && 'Kitchen KDS',
        hasBarItems && 'Bar Terminal',
        hasHookahItems && 'Hookah Terminal',
      ].filter(Boolean).join(' & ');

      addToast(
        'success',
        newOrd.pickupCode ? `Pickup Code: ${newOrd.pickupCode}` : 'Order Transmitted',
        newOrd.pickupCode
          ? `Order confirmed! Show code ${newOrd.pickupCode} at counter.`
          : `Order ${newOrd.displayOrderNumber || '#' + newOrd.id} routed to ${routedTo || 'Kitchen'}`.trim()
      );
    } catch (err: any) {
      console.error('Order checkout failed:', err);
      addToast('error', 'Unable to Place Order', err?.message || 'Server network error. Please check connection and try again.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };


  const handleCallWaiter = () => {
    setIsCallWaiterModalOpen(true);
  };

  const handleRequestBill = async () => {
    await api.requestBill(
      selectedTableNum,
      currentRestaurant?.id,
      currentTable?.id,
      currentTableSession?.id
    );
    addToast('success', 'Bill Requested', `Your waiter is bringing the check for ${selectedTableNum}.`);
  };

  const subtotal = cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);
  const totalCartCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const hasBarDivision = Boolean(currentRestaurant?.hasBar === true || currentRestaurant?.businessType === 'BAR');
  const hasHookahDivision = Boolean(currentRestaurant?.hasHookah !== false && isModuleEnabled(currentRestaurant, 'hookah'));

  // Filter Items
  const filteredItems = menuItems.filter((item) => {
    const isHookahItem = item.targetDestination === 'HOOKAH' || getFulfillmentStation(item) === 'HOOKAH';
    const isBarItem = !isHookahItem && (item.targetDestination === 'BAR' || item.isAlcoholic || item.barCategory !== undefined);

    if (currentMenuTab === 'HOOKAH') {
      if (!isHookahItem) return false;
    } else if (currentMenuTab === 'BAR') {
      if (!isBarItem) return false;
    } else {
      if (isHookahItem || isBarItem) return false;
    }

    let matchesCat = activeCategory === 'all';
    if (!matchesCat) {
      const activeClean = activeCategory.toLowerCase().trim();
      const itemCatId = (item.categoryId || '').toLowerCase().trim();
      const itemBarCat = (item.barCategory || '').toLowerCase().trim();
      const matchingCategoryObj = foodCategories.find(
        (c) => c.id.toLowerCase() === activeClean || c.name.toLowerCase() === activeClean
      );
      const catName = matchingCategoryObj ? matchingCategoryObj.name.toLowerCase() : '';
      const catId = matchingCategoryObj ? matchingCategoryObj.id.toLowerCase() : '';

      matchesCat =
        itemCatId === activeClean ||
        itemBarCat === activeClean ||
        (catId !== '' && itemCatId === catId) ||
        (catName !== '' && (itemCatId === catName || itemBarCat === catName));
    }

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
  const isHookahTheme = currentMenuTab === 'HOOKAH';

  return (
    <div className="min-h-screen font-sans pb-52 max-w-md mx-auto relative border-x border-white/[0.08] bg-[#080A0D] text-[#F7F7F5] shadow-2xl selection:bg-amber-500/30 overflow-x-hidden">
      {/* Dynamic Ambient Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full blur-[130px] transition-all duration-700 pointer-events-none ${
            isHookahTheme
              ? 'bg-amber-500/12'
              : isBarTheme
              ? 'bg-purple-600/15'
              : 'bg-amber-400/10'
          }`}
        />
        <div className="absolute top-1/2 -right-32 w-80 h-80 rounded-full bg-blue-500/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-20 -left-20 w-80 h-80 rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />
      </div>

      <ToastContainer position="top" toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Atmospheric Luxury Venue Hero */}
      <div className="relative h-44 sm:h-48 w-full bg-[#11151B] overflow-hidden z-10">
        <img
          src={
            isHookahTheme
              ? 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=1200&auto=format&fit=crop&q=80'
              : isBarTheme
              ? 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&auto=format&fit=crop&q=80'
              : theme.bannerUrl
          }
          alt={theme.restaurantName}
          className="w-full h-full object-cover brightness-[0.65] transition-all duration-700 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080A0D] via-[#080A0D]/65 to-black/30" />

        {/* Top Header Floating Liquid-Glass Badges */}
        <div className="absolute top-3.5 left-3.5 right-3.5 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full liquid-glass-pill text-[11px] text-white font-mono font-medium shadow-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span>{currentRestaurant?.hasTables === false ? 'Counter Pickup' : selectedTableNum}</span>
          </div>

          <div className="flex items-center gap-2">
            {allRestaurantTables.length > 1 && currentRestaurant?.hasTables !== false && (
              <button
                onClick={() => setIsTableSelectorModalOpen(true)}
                className="px-3 py-1.5 rounded-full liquid-glass-pill hover:bg-white/[0.12] text-[11px] text-white/90 hover:text-white transition-all shadow-md active:scale-95"
              >
                Switch Table
              </button>
            )}
          </div>
        </div>

        {/* Restaurant Branding Header Row */}
        <div className="absolute bottom-3.5 left-3.5 right-3.5 flex items-end gap-3 z-10">
          <img
            src={theme.logo}
            alt={theme.restaurantName}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-white/20 shadow-2xl bg-[#080A0D] shrink-0"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold text-white tracking-tight truncate drop-shadow-md">
              {theme.restaurantName}
            </h1>
            <div className="text-[11px] text-white/70 font-medium flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full liquid-glass-pill text-amber-400 font-semibold text-[10px]">
                <Star className="w-3 h-3 fill-amber-400" />
                <span>4.9</span>
              </span>
              <span>•</span>
              <span className="text-white/60 truncate">
                {isHookahTheme ? 'Premium Shisha Lounge' : isBarTheme ? 'Craft Cocktails & Spirits' : (currentRestaurant?.cuisine || 'Gourmet Dining')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Sticky Liquid-Glass Dock */}
      {currentRestaurant?.hasTables !== false ? (
        <div className="sticky top-0 z-30 px-3.5 py-2.5 bg-[#080A0D]/85 backdrop-blur-2xl border-b border-white/[0.08] shadow-lg">
          <div className="grid grid-cols-3 gap-2 liquid-glass p-1.5 rounded-2xl">
            <button
              onClick={handleCallWaiter}
              className="h-10 px-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.08] text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-98"
            >
              <PhoneCall className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Call Staff</span>
            </button>

            <button
              onClick={() => setIsOrderStatusModalOpen(true)}
              className={`h-10 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-98 ${
                customerOrders.filter((o) => o.status !== 'CANCELLED').length > 0
                  ? 'bg-amber-500/15 border border-amber-500/35 text-amber-300 shadow-[0_0_12px_rgba(245,166,35,0.2)]'
                  : 'text-white/85 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Orders</span>
              {customerOrders.filter((o) => o.status !== 'CANCELLED').length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold font-mono">
                  {customerOrders.filter((o) => o.status !== 'CANCELLED').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsBillModalOpen(true)}
              className="h-10 px-2 rounded-xl text-white/85 hover:text-white hover:bg-white/[0.08] text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-98"
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Bill</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.08] text-white/70 flex items-center justify-between text-xs font-mono sticky top-0 z-30 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
            <span>Counter Pickup Ordering</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">PICKUP</span>
        </div>
      )}

      {/* Food ⇄ Bar ⇄ Hookah Segmented Switcher */}
      {(hasBarDivision || hasHookahDivision) && (
        <div className="px-4 pt-3.5 pb-1 relative z-10">
          <div className={`grid ${hasBarDivision && hasHookahDivision ? 'grid-cols-3' : 'grid-cols-2'} p-1.5 liquid-glass-strong rounded-2xl text-xs font-medium gap-1.5`}>
            <button
              onClick={() => handleSwitchMenuTab('FOOD')}
              className={`h-10 rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 font-bold ${
                currentMenuTab === 'FOOD'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-[0_4px_16px_rgba(245,166,35,0.35)]'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Utensils className="w-3.5 h-3.5" />
              <span>Food</span>
            </button>

            {hasBarDivision && (
              <button
                onClick={() => handleSwitchMenuTab('BAR')}
                className={`h-10 rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 font-bold ${
                  currentMenuTab === 'BAR'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_4px_16px_rgba(168,85,247,0.35)]'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Wine className="w-3.5 h-3.5 text-purple-200" />
                <span>Bar</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                  currentMenuTab === 'BAR' ? 'bg-black/30 text-white' : 'bg-purple-500/15 text-purple-300 border border-purple-500/25'
                }`}>
                  21+
                </span>
              </button>
            )}

            {hasHookahDivision && (
              <button
                onClick={() => handleSwitchMenuTab('HOOKAH')}
                className={`h-10 rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 font-bold ${
                  currentMenuTab === 'HOOKAH'
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-[0_4px_16px_rgba(217,119,6,0.35)]'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-200" />
                <span>Hookah</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                  currentMenuTab === 'HOOKAH' ? 'bg-black/30 text-white' : 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                }`}>
                  18+
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Non-blocking Single Confirmation Banner after order checkout */}
      {latestPlacedOrder && (
        <div className="mx-4 mt-3.5 p-3.5 rounded-2xl liquid-glass border border-emerald-500/35 flex items-start justify-between gap-3 shadow-lg relative z-10">
          <div className="flex items-start gap-2.5 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-emerald-300 truncate">
                Order #{latestPlacedOrder.displayOrderNumber || latestPlacedOrder.orderNumber || (latestPlacedOrder.id.length > 8 ? latestPlacedOrder.id.slice(-4) : latestPlacedOrder.id)} Transmitted!
              </p>
              <p className="text-[11px] text-white/70 mt-0.5">
                Sent directly to preparation pass. Table: <strong className="text-white">{selectedTableNum}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIsOrderStatusModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95"
            >
              Track
            </button>
            <button
              onClick={() => setLatestPlacedOrder(null)}
              className="text-white/40 hover:text-white p-1 rounded-lg"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Non-intrusive legal notice when viewing Bar / Hookah */}
      {currentMenuTab === 'BAR' && (
        <div className="mx-4 mt-2.5 p-2.5 rounded-xl liquid-glass border-purple-500/25 text-[11px] text-purple-200 flex items-center gap-2 relative z-10">
          <Wine className="w-4 h-4 text-purple-400 shrink-0" />
          <span>Craft Bar Catalog · 21+ Government ID required upon table service.</span>
        </div>
      )}
      {currentMenuTab === 'HOOKAH' && (
        <div className="mx-4 mt-2.5 p-2.5 rounded-xl liquid-glass border-amber-500/25 text-[11px] text-amber-200 flex items-center gap-2 relative z-10">
          <Flame className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Hookah & Shisha Lounge Catalog · Statutory adult age (18+) required upon table service.</span>
        </div>
      )}

      {/* Menu Filter Tabs & Search */}
      <div className="p-4 space-y-3.5 relative z-10">
        {/* Search Input with 16px font-size to prevent iOS auto-zoom */}
        <div className="relative liquid-glass rounded-2xl border border-white/[0.10] focus-within:border-amber-400/60 focus-within:shadow-[0_0_16px_rgba(245,166,35,0.15)] transition-all">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isBarTheme
                ? 'Search cocktails, wine, spirits, craft beers...'
                : isHookahTheme
                ? 'Search shisha flavours, blends...'
                : 'Search dishes, appetizers, desserts...'
            }
            className="w-full bg-transparent text-white text-[16px] sm:text-xs rounded-2xl pl-10 pr-9 py-2.5 focus:outline-none placeholder:text-white/30 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 text-white/40 hover:text-white p-0.5"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dietary Veg/Non-Veg Quick Filter */}
        {!isBarTheme && (
          <div className="flex items-center gap-1.5 p-1 liquid-glass rounded-xl text-xs">
            <button
              onClick={() => setDietaryFilter('ALL')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-colors text-center ${
                dietaryFilter === 'ALL' ? 'bg-white/[0.10] text-white font-semibold' : 'text-white/40 hover:text-white'
              }`}
            >
              All Dishes
            </button>

            <button
              onClick={() => setDietaryFilter('VEG')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                dietaryFilter === 'VEG'
                  ? 'bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30'
                  : 'text-white/40 hover:text-emerald-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span>Veg Only</span>
            </button>

            <button
              onClick={() => setDietaryFilter('NON_VEG')}
              className={`flex-1 py-1.5 px-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                dietaryFilter === 'NON_VEG'
                  ? 'bg-rose-500/15 text-rose-300 font-semibold border border-rose-500/30'
                  : 'text-white/40 hover:text-rose-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
              <span>Non-Veg</span>
            </button>
          </div>
        )}

        {/* Categories Horizontal Scroll with Liquid-Glass Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
              activeCategory === 'all'
                ? isHookahTheme
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-[0_2px_12px_rgba(217,119,6,0.35)]'
                  : isBarTheme
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_2px_12px_rgba(168,85,247,0.35)]'
                  : 'bg-amber-500 text-slate-950 shadow-[0_2px_12px_rgba(245,166,35,0.35)]'
                : 'liquid-glass-pill text-white/60 hover:text-white'
            }`}
          >
            All {isHookahTheme ? 'Flavours' : isBarTheme ? 'Beverages' : 'Categories'}
          </button>
          {(isHookahTheme
            ? [
                { id: 'Hookah & Shisha', name: 'All Shisha' },
                { id: 'Classic Flavors', name: 'Classic' },
                { id: 'Exotic Blends', name: 'Exotic Blends' },
                { id: 'Herbal & Tobacco-Free', name: 'Herbal' },
                { id: 'Ice Base & Addons', name: 'Ice Base' },
                { id: 'Accessories', name: 'Accessories' },
              ]
            : isBarTheme
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
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                activeCategory === cat.id
                  ? isHookahTheme
                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white font-semibold shadow-[0_2px_12px_rgba(217,119,6,0.35)]'
                    : isBarTheme
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold shadow-[0_2px_12px_rgba(168,85,247,0.35)]'
                    : 'bg-amber-500 text-slate-950 font-bold shadow-[0_2px_12px_rgba(245,166,35,0.35)]'
                  : 'liquid-glass-pill text-white/60 hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu Items List with Liquid Glass Cards */}
        <div className="space-y-3.5">
          {filteredItems.map((item) => {
            const isVeg = item.isVegetarian !== false && item.dietaryType !== 'NON_VEG';
            const isAvailable = item.isAvailable !== false;
            const inCart = cart.find((c) => c.item.id === item.id);
            const hasOptions = item.servingOptions && item.servingOptions.length > 0;
            const isJustAdded = recentlyAddedId === item.id;

            return (
              <div
                key={item.id}
                className={`p-3.5 sm:p-4 flex gap-3.5 transition-all duration-300 rounded-2xl liquid-glass-card shadow-sm ${
                  isAvailable
                    ? 'hover:border-white/[0.18] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]'
                    : 'opacity-50 border-white/[0.04]'
                }`}
              >
                <div className="relative shrink-0">
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    className="w-22 h-22 sm:w-24 sm:h-24 rounded-xl object-cover border border-white/[0.08] bg-[#11151B]"
                  />
                  {item.isAlcoholic && (
                    <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/80 text-white/90 border border-white/10 backdrop-blur-sm">
                      {item.alcoholPercentage || 40}% ABV
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {!isBarTheme && !item.isAlcoholic && (
                          <span
                            className={`inline-flex items-center justify-center border p-0.5 rounded-[3px] shrink-0 ${
                              isVeg ? 'border-emerald-500/70 bg-emerald-500/10' : 'border-rose-500/70 bg-rose-500/10'
                            }`}
                            title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isVeg ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          </span>
                        )}
                        <h3 className="text-xs sm:text-sm font-semibold text-white tracking-tight truncate">{item.name}</h3>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {!isAvailable && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                            SOLD OUT
                          </span>
                        )}
                      </div>
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

                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.06]">
                    <span className="text-xs sm:text-sm font-mono font-bold text-amber-400">
                      {formatPrice(item.price)}
                    </span>

                    {isAvailable ? (
                      inCart ? (
                        <div
                          className="flex items-center gap-1.5 liquid-glass-pill border-amber-500/40 rounded-xl p-0.5 shadow-inner"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleUpdateItemQuantity(item.id, inCart.quantity - 1)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-400 hover:bg-white/[0.08] active:scale-95 transition-all"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="font-mono text-xs font-bold text-white min-w-[20px] text-center">
                            {inCart.quantity}
                          </span>
                          <button
                            onClick={() => handleUpdateItemQuantity(item.id, inCart.quantity + 1)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-400 hover:bg-white/[0.08] active:scale-95 transition-all"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDirectAddItem(item);
                          }}
                          className={`h-8 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all duration-300 active:scale-95 shadow-sm ${
                            isJustAdded
                              ? 'bg-emerald-500 text-slate-950 font-bold scale-105 shadow-[0_0_14px_rgba(16,185,129,0.5)]'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold hover:shadow-[0_2px_12px_rgba(245,166,35,0.3)]'
                          }`}
                        >
                          {isJustAdded ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Added</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5" />
                              <span>{hasOptions ? 'Options' : 'Add'}</span>
                            </>
                          )}
                        </button>
                      )
                    ) : (
                      <span className="text-[10px] font-mono py-1 px-2.5 rounded-xl font-medium bg-white/[0.04] text-white/40 border border-white/[0.06] cursor-not-allowed">
                        Sold Out
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredItems.length === 0 && (
            <div className="p-8 text-center liquid-glass border border-dashed border-white/[0.08] rounded-2xl text-white/40 text-xs space-y-2">
              {isHookahTheme ? (
                <>
                  <Flame className="w-8 h-8 text-amber-400 mx-auto opacity-70" />
                  <p className="font-semibold text-white/80">No Hookah or Shisha products currently available.</p>
                  <p className="text-[11px] text-white/50 max-w-xs mx-auto leading-relaxed">
                    This venue has not activated any shisha blends yet. Restaurant owners can configure hookah flavors, coal options, and pricing under Owner OS &gt; Menu &amp; Pricing &gt; Hookah &amp; Shisha.
                  </p>
                </>
              ) : isBarTheme ? (
                <>
                  <Wine className="w-8 h-8 text-purple-400 mx-auto opacity-70" />
                  <p className="font-semibold text-white/80">No bar drinks currently available in this category.</p>
                </>
              ) : (
                <p>No items found in this category.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Subtle Customer Footer Attribution */}
      <footer className="py-8 px-4 text-center text-xs text-slate-500 border-t border-white/[0.06] mt-8 mb-16 space-y-1 relative z-10">
        <p className="font-semibold text-slate-400">{currentRestaurant?.name || 'Restaurant'}</p>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-mono pt-1">
          <span>Powered by</span>
          <DinelyLogoMark size={14} className="opacity-80 inline-block" />
          <span className="font-bold text-slate-300">Dinely</span>
        </div>
      </footer>

      {/* Floating Cart Liquid-Glass Sticky Dock */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40 max-w-md mx-auto safe-bottom">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-bold p-3.5 rounded-2xl shadow-[0_12px_36px_rgba(245,166,35,0.4)] border border-amber-300/40 flex items-center justify-between transition-all active:scale-[0.99] group"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-xl bg-slate-950/20 flex items-center justify-center font-mono text-xs font-black text-slate-950">
                {totalCartCount}
              </div>
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-950/70 block">Review Cart</span>
                <span className="text-xs font-black text-slate-950">{totalCartCount} {totalCartCount === 1 ? 'item' : 'items'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-sm font-black">
              <span>{formatPrice(subtotal)}</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>
      )}

      {/* Item Selection & Customization Bottom Sheet Drawer */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="w-full max-w-md liquid-glass-strong bg-[#0e1117]/95 border-t border-x border-white/[0.14] rounded-t-3xl p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto shadow-[0_-16px_48px_rgba(0,0,0,0.7)] safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`text-[9px] font-mono px-2 py-0.5 rounded font-medium shrink-0 ${
                    selectedItem.isVegetarian !== false && selectedItem.dietaryType !== 'NON_VEG'
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-950/80 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {selectedItem.isVegetarian !== false && selectedItem.dietaryType !== 'NON_VEG' ? 'VEG' : 'NON-VEG'}
                </span>
                <h3 className="font-bold text-white text-sm tracking-tight truncate">{selectedItem.name}</h3>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-[#11151B]">
              <img src={selectedItem.image} alt={selectedItem.name} className="w-full h-36 object-cover" />
            </div>

            {selectedItem.brand && (
              <p className="text-amber-400 font-mono text-xs font-medium">Brand: {selectedItem.brand}</p>
            )}

            <p className="text-white/60 leading-relaxed text-xs">{selectedItem.description}</p>

            {selectedItem.servingOptions && selectedItem.servingOptions.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-medium text-white/80 block text-xs">Serving Option</span>
                <div className="flex flex-wrap gap-2">
                  {selectedItem.servingOptions.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setSelectedServingOption(opt)}
                      className={`px-3.5 py-1.5 rounded-xl border text-xs font-mono transition-all ${
                        selectedServingOption === opt
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold shadow-sm'
                          : 'liquid-glass-pill text-white/70 hover:border-white/20'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between py-2.5 border-y border-white/[0.08]">
              <span className="font-semibold text-white/80 text-xs">Quantity</span>
              <div className="flex items-center gap-3 liquid-glass border border-white/[0.08] p-1 rounded-xl">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold text-xs text-white min-w-[20px] text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] active:scale-95 transition-all"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <input
              type="text"
              placeholder="Preparation notes (e.g. less spicy, extra ice)..."
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              className="w-full bg-[#080A0D] text-white text-[16px] sm:text-xs rounded-xl px-3.5 py-2.5 border border-white/[0.08] focus:border-amber-400/60 focus:outline-none placeholder:text-white/30"
            />

            <button
              onClick={handleAddToCart}
              className="w-full py-3.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-lg transition-all active:scale-[0.99]"
            >
              Add to Order · {formatPrice(selectedItem.price * quantity)}
            </button>
          </div>
        </div>
      )}

      {/* Cart Review & Checkout Bottom Sheet Drawer */}
      {isCartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md transition-opacity"
          onClick={() => setIsCartOpen(false)}
        >
          <div
            className="w-full max-w-md liquid-glass-strong bg-[#0e1117]/95 border-t border-x border-white/[0.14] rounded-t-3xl p-5 sm:p-6 space-y-4 max-h-[85vh] flex flex-col shadow-[0_-16px_48px_rgba(0,0,0,0.7)] safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">Your Order Cart ({totalCartCount})</h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-xl text-white/50 hover:text-white hover:bg-white/[0.08] transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {cart.map((c, idx) => (
                <div key={idx} className="p-3 liquid-glass rounded-xl border border-white/[0.08] flex items-center justify-between">
                  <div className="space-y-0.5 min-w-0 flex-1 pr-2">
                    <p className="font-medium text-white text-xs truncate">
                      <span className="font-mono text-amber-400 font-bold mr-1.5">{c.quantity}×</span>
                      {c.item.name}
                    </p>
                    {c.servingOption && (
                      <p className="text-[10px] text-white/50 font-mono">Serving: {c.servingOption}</p>
                    )}
                    {c.notes && <p className="text-[10px] text-amber-400/80 italic truncate">{c.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 bg-black/40 border border-white/[0.08] rounded-lg px-1 py-0.5">
                      <button
                        onClick={() => {
                          setCart((prev) =>
                            prev
                              .map((item, i) => (i === idx ? { ...item, quantity: item.quantity - 1 } : item))
                              .filter((item) => item.quantity > 0)
                          );
                        }}
                        className="p-1 text-white/60 hover:text-white transition-colors"
                        title="Decrease"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono text-xs font-semibold text-white px-1">{c.quantity}</span>
                      <button
                        onClick={() => {
                          setCart((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, quantity: item.quantity + 1 } : item))
                          );
                        }}
                        className="p-1 text-white/60 hover:text-white transition-colors"
                        title="Increase"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <span className="font-mono font-semibold text-xs text-white min-w-[50px] text-right">
                      {formatPrice(c.item.price * c.quantity)}
                    </span>
                    <button
                      onClick={() => {
                        setCart((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="p-1 text-white/40 hover:text-rose-400 transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3.5 liquid-glass rounded-2xl border border-white/[0.08] space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-white/60">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {(typeof currentRestaurant?.taxPercentage === 'number' ? currentRestaurant.taxPercentage : 5) > 0 && (
                <div className="flex justify-between text-white/60">
                  <span>GST / Taxes ({typeof currentRestaurant?.taxPercentage === 'number' ? currentRestaurant.taxPercentage : 5}%)</span>
                  <span>{formatPrice(Math.round(subtotal * (((typeof currentRestaurant?.taxPercentage === 'number' ? currentRestaurant.taxPercentage : 5)) / 100) * 100) / 100)}</span>
                </div>
              )}
              <div className="flex justify-between text-white font-semibold text-xs pt-2 border-t border-white/[0.08]">
                <span>Total Payable</span>
                <span className="text-amber-400 font-bold">{formatPrice(Math.round((subtotal + subtotal * ((typeof currentRestaurant?.taxPercentage === 'number' ? currentRestaurant.taxPercentage : 5) / 100)) * 100) / 100)}</span>
              </div>
            </div>

            {/* Inline Age Requirement Checkbox if Bar or Hookah items present */}
            {cart.some((c) => c.item.isAlcoholic || c.item.targetDestination === 'BAR' || c.item.targetDestination === 'HOOKAH') && (
              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAgeConfirmed}
                  onChange={(e) => {
                    setIsAgeConfirmed(e.target.checked);
                    if (typeof window !== 'undefined' && e.target.checked) {
                      sessionStorage.setItem('dinely_age_verified', 'true');
                    }
                  }}
                  className="mt-0.5 w-4 h-4 rounded text-amber-500 focus:ring-0 bg-black/40 border-amber-400/40"
                />
                <span className="leading-tight">
                  I confirm I meet statutory age requirements (21+ Bar / 18+ Hookah). Valid ID required upon delivery.
                </span>
              </label>
            )}

            {/* Single Clear Primary Action: Place Order */}
            <button
              disabled={isSubmittingOrder || cart.length === 0 || (cart.some((c) => c.item.isAlcoholic || c.item.targetDestination === 'BAR' || c.item.targetDestination === 'HOOKAH') && !isAgeConfirmed)}
              onClick={handleCheckout}
              className="w-full py-3.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmittingOrder ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transmitting Order to Pass...</span>
                </>
              ) : (
                <>
                  <span>Place Order · {formatPrice(Math.round((subtotal + subtotal * ((typeof currentRestaurant?.taxPercentage === 'number' ? currentRestaurant.taxPercentage : 5) / 100)) * 100) / 100)}</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

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
                    : 'liquid-glass border-white/[0.08] text-white/80 hover:border-white/20'
                }`}
              >
                <span className="font-mono text-xs font-semibold">{t.tableNumber}</span>
                <span className="text-[10px] text-white/40">{t.section || 'Main Area'}</span>
              </button>
            ))}
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
            <div className="p-8 text-center liquid-glass rounded-xl border border-white/[0.08] text-white/40 space-y-2">
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
          className={`fixed left-4 right-4 max-w-md mx-auto z-40 transition-all duration-300 safe-bottom ${
            totalCartCount > 0 ? 'bottom-20' : 'bottom-4'
          }`}
        >
          <div
            onClick={() => setIsOrderStatusModalOpen(true)}
            className="liquid-glass-strong border border-white/[0.14] p-3 rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.6)] backdrop-blur-2xl flex items-center justify-between gap-3 cursor-pointer group hover:border-amber-400/40 transition-all"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.3)]">
                <Clock className="w-4 h-4" />
              </div>
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white truncate">Live Order In Progress</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shrink-0 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                </div>
                <p className="text-[11px] text-white/60 font-mono truncate">
                  {customerOrders.filter((o) => o.status !== 'CANCELLED').length} {customerOrders.filter((o) => o.status !== 'CANCELLED').length === 1 ? 'Order' : 'Orders'} · Total: ₹
                  {customerOrders.filter((o) => o.status !== 'CANCELLED').reduce((sum, o) => sum + o.totalAmount, 0).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/[0.08] group-hover:bg-amber-500 group-hover:text-black text-white transition-all flex items-center gap-1 whitespace-nowrap shadow-sm">
                <span>Track</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
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
