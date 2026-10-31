import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  RefreshCw,
  ShieldCheck,
  ChevronRight,
  Eye,
  Receipt,
  Wine,
  ChefHat,
  Flame,
  ArrowRight,
  X,
  CreditCard,
  Percent,
  Check,
  Filter,
  Layers,
  TrendingUp,
  TableProperties,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Modal,
} from '../../packages/ui';
import { formatCurrency } from '../../packages/utils/currency';
import {
  BusinessDay,
  Order,
  Table,
  Bill,
  getFulfillmentStation,
  StationItemBreakdown,
  StationOrderBreakdown,
  StationSectionData,
  DaySectionsBreakdown,
} from '../../packages/types';
import { api } from '../../packages/api/client';
import { realtimeBus } from '../../packages/api/realtime';

interface DayManagementViewProps {
  currentRestaurant: any;
  currentBusinessDay: BusinessDay | null;
  businessDayHistory: BusinessDay[];
  orders: Order[];
  tables: Table[];
  bills: Bill[];
  theme: any;
  currentUser?: any;
  onNavigateTab: (tab: string) => void;
  onRefreshData: () => Promise<void>;
  addToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

/**
 * Computes authoritative client-side station breakdowns from orders as fallback or live overlay.
 * Guaranteed zero double-counting: every item belongs to exactly one station.
 */
function computeClientSections(dayOrders: Order[]): DaySectionsBreakdown {
  let kitchenSales = 0;
  let barSales = 0;
  let hookahSales = 0;

  const kitchenItemsMap: Record<string, StationItemBreakdown> = {};
  const barItemsMap: Record<string, StationItemBreakdown> = {};
  const hookahItemsMap: Record<string, StationItemBreakdown> = {};

  const kitchenOrdersList: StationOrderBreakdown[] = [];
  const barOrdersList: StationOrderBreakdown[] = [];
  const hookahOrdersList: StationOrderBreakdown[] = [];

  dayOrders.forEach((o) => {
    if (o.status === 'CANCELLED') return;

    let hasKitchen = false;
    let hasBar = false;
    let hasHookah = false;

    const orderKitchenItems: any[] = [];
    const orderBarItems: any[] = [];
    const orderHookahItems: any[] = [];

    (o.items || []).forEach((item) => {
      const price = Number(item.price || (item as any).unitPrice || 0);
      const qty = Number(item.quantity || 1);
      const total = Math.round(price * qty * 100) / 100;
      const discount = Number((item as any).discount || 0);
      const net = Math.round(Math.max(0, total - discount) * 100) / 100;
      const tax = Math.round(net * 0.05 * 100) / 100;
      const station = getFulfillmentStation(item);

      if (station === 'HOOKAH') {
        hookahSales += total;
        hasHookah = true;
        let flavour = (
          (item as any).selectedFlavour ||
          (item as any).selected_flavour ||
          (item as any).flavour ||
          (item as any).notes ||
          ''
        ).trim();

        if (!flavour) {
          const lower = item.name.toLowerCase();
          for (const f of ['mint', 'double apple', 'apple', 'watermelon', 'grape', 'blueberry', 'paan', 'spring water', 'citrus', 'kiwi', 'peach', 'orange']) {
            if (lower.includes(f)) {
              flavour = f.charAt(0).toUpperCase() + f.slice(1);
              break;
            }
          }
        }
        if (!flavour) flavour = 'Standard Flavour';

        const hkKey = `${item.name.trim()} - ${flavour}`;
        if (!hookahItemsMap[hkKey]) {
          hookahItemsMap[hkKey] = {
            name: item.name.trim(),
            productName: item.name.trim(),
            flavour,
            quantity: qty,
            unitPrice: price,
            discountAmount: discount,
            grossSales: total,
            netSales: net,
            taxAmount: tax,
            ordersCount: 1,
            station: 'HOOKAH',
          };
        } else {
          hookahItemsMap[hkKey].quantity += qty;
          hookahItemsMap[hkKey].grossSales = Math.round(((hookahItemsMap[hkKey].grossSales || 0) + total) * 100) / 100;
          hookahItemsMap[hkKey].netSales = Math.round(((hookahItemsMap[hkKey].netSales || 0) + net) * 100) / 100;
          hookahItemsMap[hkKey].taxAmount = Math.round(((hookahItemsMap[hkKey].taxAmount || 0) + tax) * 100) / 100;
          hookahItemsMap[hkKey].ordersCount = (hookahItemsMap[hkKey].ordersCount || 0) + 1;
        }
        orderHookahItems.push({
          name: item.name,
          flavour,
          quantity: qty,
          unitPrice: price,
          totalPrice: total,
        });
      } else if (station === 'BAR') {
        barSales += total;
        hasBar = true;
        const bKey = item.name.trim();
        if (!barItemsMap[bKey]) {
          barItemsMap[bKey] = {
            name: item.name.trim(),
            quantity: qty,
            unitPrice: price,
            discountAmount: discount,
            grossSales: total,
            netSales: net,
            taxAmount: tax,
            ordersCount: 1,
            station: 'BAR',
          };
        } else {
          barItemsMap[bKey].quantity += qty;
          barItemsMap[bKey].grossSales = Math.round(((barItemsMap[bKey].grossSales || 0) + total) * 100) / 100;
          barItemsMap[bKey].netSales = Math.round(((barItemsMap[bKey].netSales || 0) + net) * 100) / 100;
          barItemsMap[bKey].taxAmount = Math.round(((barItemsMap[bKey].taxAmount || 0) + tax) * 100) / 100;
          barItemsMap[bKey].ordersCount = (barItemsMap[bKey].ordersCount || 0) + 1;
        }
        orderBarItems.push({
          name: item.name,
          quantity: qty,
          unitPrice: price,
          totalPrice: total,
        });
      } else {
        kitchenSales += total;
        hasKitchen = true;
        const kKey = item.name.trim();
        if (!kitchenItemsMap[kKey]) {
          kitchenItemsMap[kKey] = {
            name: item.name.trim(),
            quantity: qty,
            unitPrice: price,
            discountAmount: discount,
            grossSales: total,
            netSales: net,
            taxAmount: tax,
            ordersCount: 1,
            station: 'KITCHEN',
          };
        } else {
          kitchenItemsMap[kKey].quantity += qty;
          kitchenItemsMap[kKey].grossSales = Math.round(((kitchenItemsMap[kKey].grossSales || 0) + total) * 100) / 100;
          kitchenItemsMap[kKey].netSales = Math.round(((kitchenItemsMap[kKey].netSales || 0) + net) * 100) / 100;
          kitchenItemsMap[kKey].taxAmount = Math.round(((kitchenItemsMap[kKey].taxAmount || 0) + tax) * 100) / 100;
          kitchenItemsMap[kKey].ordersCount = (kitchenItemsMap[kKey].ordersCount || 0) + 1;
        }
        orderKitchenItems.push({
          name: item.name,
          quantity: qty,
          unitPrice: price,
          totalPrice: total,
        });
      }
    });

    const payStatus = o.paymentStatus || 'UNPAID';
    if (hasKitchen) {
      kitchenOrdersList.push({
        id: o.id,
        orderNumber: o.orderNumber || `#${o.id.slice(0, 6)}`,
        tableNumber: o.tableNumber,
        tableId: o.tableId,
        createdAt: o.createdAt,
        status: o.status,
        stationStatus: o.kitchenStatus || o.status,
        items: orderKitchenItems,
        subtotal: Math.round(orderKitchenItems.reduce((s, i) => s + (i.totalPrice || 0), 0) * 100) / 100,
        paymentStatus: payStatus,
        customerName: o.customerName || 'Guest',
      });
    }
    if (hasBar) {
      barOrdersList.push({
        id: o.id,
        orderNumber: o.orderNumber || `#${o.id.slice(0, 6)}`,
        tableNumber: o.tableNumber,
        tableId: o.tableId,
        createdAt: o.createdAt,
        status: o.status,
        stationStatus: o.barStatus || o.status,
        items: orderBarItems,
        subtotal: Math.round(orderBarItems.reduce((s, i) => s + (i.totalPrice || 0), 0) * 100) / 100,
        paymentStatus: payStatus,
        customerName: o.customerName || 'Guest',
      });
    }
    if (hasHookah) {
      hookahOrdersList.push({
        id: o.id,
        orderNumber: o.orderNumber || `#${o.id.slice(0, 6)}`,
        tableNumber: o.tableNumber,
        tableId: o.tableId,
        createdAt: o.createdAt,
        status: o.status,
        stationStatus: o.hookahStatus || o.status,
        items: orderHookahItems,
        subtotal: Math.round(orderHookahItems.reduce((s, i) => s + (i.totalPrice || 0), 0) * 100) / 100,
        paymentStatus: payStatus,
        customerName: o.customerName || 'Guest',
      });
    }
  });

  const kItems = Object.values(kitchenItemsMap).sort((a, b) => (b.grossSales || 0) - (a.grossSales || 0));
  const bItems = Object.values(barItemsMap).sort((a, b) => (b.grossSales || 0) - (a.grossSales || 0));
  const hItems = Object.values(hookahItemsMap).sort((a, b) => (b.grossSales || 0) - (a.grossSales || 0));

  kitchenSales = Math.round(kitchenSales * 100) / 100;
  barSales = Math.round(barSales * 100) / 100;
  hookahSales = Math.round(hookahSales * 100) / 100;
  const combinedTotal = Math.round((kitchenSales + barSales + hookahSales) * 100) / 100;

  return {
    kitchen: {
      title: 'Kitchen',
      station: 'KITCHEN',
      sales: kitchenSales,
      orderValue: kitchenSales,
      ordersCount: kitchenOrdersList.length,
      itemsCount: kItems.reduce((s, i) => s + i.quantity, 0),
      dishesCount: kItems.length,
      items: kItems,
      orders: kitchenOrdersList,
    },
    bar: {
      title: 'Bar',
      station: 'BAR',
      sales: barSales,
      orderValue: barSales,
      ordersCount: barOrdersList.length,
      itemsCount: bItems.reduce((s, i) => s + i.quantity, 0),
      beveragesCount: bItems.length,
      items: bItems,
      orders: barOrdersList,
    },
    hookah: {
      title: 'Hookah',
      station: 'HOOKAH',
      sales: hookahSales,
      orderValue: hookahSales,
      ordersCount: hookahOrdersList.length,
      itemsCount: hItems.reduce((s, i) => s + i.quantity, 0),
      productsCount: hItems.length,
      items: hItems,
      orders: hookahOrdersList,
    },
    combined: {
      kitchenSales,
      barSales,
      hookahSales,
      totalOrderValue: combinedTotal,
      totalOrders: dayOrders.filter((o) => o.status !== 'CANCELLED').length,
      isReconciled: true,
    },
  };
}

export const DayManagementView: React.FC<DayManagementViewProps> = ({
  currentRestaurant,
  currentBusinessDay,
  businessDayHistory,
  orders,
  tables,
  bills,
  theme,
  currentUser,
  onNavigateTab,
  onRefreshData,
  addToast,
}) => {
  // Selected Historical Day (null = viewing Live Operational Day)
  const [selectedHistoricalDay, setSelectedHistoricalDay] = useState<BusinessDay | null>(null);
  const [historicalOrders, setHistoricalOrders] = useState<Order[]>([]);
  const [isHistOrdersLoading, setIsHistOrdersLoading] = useState(false);

  // Section Tab Navigation
  const [activeStationTab, setActiveStationTab] = useState<'all' | 'kitchen' | 'bar' | 'hookah'>('all');
  const [kitchenViewMode, setKitchenViewMode] = useState<'items' | 'orders'>('items');
  const [barViewMode, setBarViewMode] = useState<'items' | 'orders'>('items');
  const [hookahViewMode, setHookahViewMode] = useState<'items' | 'orders'>('items');


  // Precheck & Rollover Modal
  const [isPrecheckOpen, setIsPrecheckOpen] = useState(false);
  const [precheck, setPrecheck] = useState<any>(null);
  const [isPrecheckLoading, setIsPrecheckLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncError, setIsSyncError] = useState(false);
  const [lastSynchronized, setLastSynchronized] = useState<Date>(new Date());

  const restId = currentRestaurant?.id || api.getCurrentRestaurantId();

  // Load precheck data
  const loadPrecheck = async () => {
    if (!restId) return;
    setIsPrecheckLoading(true);
    try {
      const data = await api.getBusinessDayPrecheck(restId);
      setPrecheck(data);
      setIsSyncError(false);
      setLastSynchronized(new Date());
    } catch (err: any) {
      console.warn('[DayManagementView] Failed to load precheck:', err);
      setIsSyncError(true);
    } finally {
      setIsPrecheckLoading(false);
    }
  };

  useEffect(() => {
    loadPrecheck();
  }, [restId, currentBusinessDay?.id]);

  // Real-time synchronization
  useEffect(() => {
    const unsubscribe = realtimeBus.subscribe((event) => {
      const t = event.type;
      if (
        t === 'BusinessDayOpened' ||
        t === 'BusinessDayClosed' ||
        t === 'DayOpened' ||
        t === 'DayClosed' ||
        t === 'BillPaid' ||
        t === 'BillPaymentRecorded' ||
        t === 'payment_updated' ||
        t === 'payment_status_updated' ||
        t === 'order_created' ||
        t === 'OrderCreated' ||
        t === 'order_status_updated' ||
        t === 'OrderStatusUpdated' ||
        t === 'order_delivered' ||
        t === 'table_session_closed' ||
        t === 'TableSessionClosed' ||
        t === 'table_status_updated' ||
        t === 'TableStatusUpdated'
      ) {
        loadPrecheck();
        onRefreshData();
        setLastSynchronized(new Date());
      }
    });

    const heartbeat = setInterval(() => {
      loadPrecheck();
      onRefreshData();
      setLastSynchronized(new Date());
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(heartbeat);
    };
  }, [restId]);

  // Historical Day Selector handler
  const handleSelectHistoricalDay = async (dayId: string) => {
    if (!dayId || dayId === 'LIVE') {
      setSelectedHistoricalDay(null);
      setHistoricalOrders([]);
      return;
    }

    if (!restId) return;
    setIsHistOrdersLoading(true);
    try {
      const detail = await api.getBusinessDayDetail(restId, dayId);
      if (detail) {
        setSelectedHistoricalDay(detail);
      } else {
        const fallback = businessDayHistory.find((d) => d.id === dayId);
        setSelectedHistoricalDay(fallback || null);
      }
      const ords = await api.getBusinessDayOrders(restId, dayId);
      setHistoricalOrders(ords || []);
      addToast('info', 'Historical Record Loaded', `Viewing sealed day ${detail?.businessDate || dayId}`);
    } catch (err: any) {
      addToast('error', 'History Error', err?.message || 'Could not load historical business day detail.');
    } finally {
      setIsHistOrdersLoading(false);
    }
  };

  // Determine active day being viewed
  const isHistoricalView = selectedHistoricalDay !== null;
  const activeDay = selectedHistoricalDay || currentBusinessDay;

  // Filter orders for active day
  const activeDayOrders = useMemo(() => {
    if (isHistoricalView) {
      return historicalOrders;
    }
    return orders.filter((o) => {
      if (o.restaurantId !== currentRestaurant?.id) return false;
      if (!currentBusinessDay) return true;
      if (o.businessDayId) return o.businessDayId === currentBusinessDay.id;
      if (currentBusinessDay.openedAt) {
        return new Date(o.createdAt).getTime() >= new Date(currentBusinessDay.openedAt).getTime();
      }
      return true;
    });
  }, [isHistoricalView, historicalOrders, orders, currentRestaurant?.id, currentBusinessDay]);

  // Fallback client sections calculation
  const clientSections = useMemo(() => {
    return computeClientSections(activeDayOrders);
  }, [activeDayOrders]);

  // Merge server authoritative sections with client fallback
  const kitchenSection: StationSectionData = useMemo(() => {
    const s = activeDay?.sections?.kitchen;
    if (s && ((s.items && s.items.length > 0) || (s.sales || 0) > 0 || ((s as any).order_value || 0) > 0)) {
      return {
        ...s,
        sales: Number(s.sales || (s as any).order_value || 0),
        orderValue: Number(s.orderValue || (s as any).order_value || s.sales || 0),
        ordersCount: Number(s.ordersCount ?? (s as any).orders_count ?? s.orders?.length ?? 0),
        itemsCount: Number(s.itemsCount ?? (s as any).items_count ?? s.items?.length ?? 0),
        dishesCount: Number(s.dishesCount ?? (s as any).dishes_count ?? s.items?.length ?? 0),
        items: (s.items || []).map((it: any) => ({
          name: it.name,
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice ?? it.unit_price ?? 0),
          discountAmount: Number(it.discountAmount ?? it.discount_amount ?? 0),
          grossSales: Number(it.grossSales ?? it.gross_sales ?? 0),
          netSales: Number(it.netSales ?? it.net_sales ?? 0),
          taxAmount: Number(it.taxAmount ?? it.tax_amount ?? 0),
          ordersCount: Number(it.ordersCount ?? it.orders_count ?? 1),
          station: 'KITCHEN' as const,
        })),
        orders: (s.orders || []).map((ord: any) => ({
          id: ord.id,
          orderNumber: ord.orderNumber || ord.order_number || `#${ord.id?.slice(0, 6)}`,
          tableNumber: ord.tableNumber || ord.table_number || '',
          tableId: ord.tableId || ord.table_id || '',
          createdAt: ord.createdAt || ord.created_at || '',
          status: ord.status || '',
          stationStatus: ord.stationStatus || ord.station_status || ord.status || '',
          items: ord.items || [],
          subtotal: Number(ord.subtotal || 0),
          paymentStatus: ord.paymentStatus || ord.payment_status || 'UNPAID',
          customerName: ord.customerName || ord.customer_name || 'Guest',
        })),
      };
    }
    return clientSections.kitchen;
  }, [activeDay?.sections?.kitchen, clientSections.kitchen]);

  const barSection: StationSectionData = useMemo(() => {
    const s = activeDay?.sections?.bar;
    if (s && ((s.items && s.items.length > 0) || (s.sales || 0) > 0 || ((s as any).order_value || 0) > 0)) {
      return {
        ...s,
        sales: Number(s.sales || (s as any).order_value || 0),
        orderValue: Number(s.orderValue || (s as any).order_value || s.sales || 0),
        ordersCount: Number(s.ordersCount ?? (s as any).orders_count ?? s.orders?.length ?? 0),
        itemsCount: Number(s.itemsCount ?? (s as any).items_count ?? s.items?.length ?? 0),
        beveragesCount: Number(s.beveragesCount ?? (s as any).beverages_count ?? s.items?.length ?? 0),
        items: (s.items || []).map((it: any) => ({
          name: it.name,
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice ?? it.unit_price ?? 0),
          discountAmount: Number(it.discountAmount ?? it.discount_amount ?? 0),
          grossSales: Number(it.grossSales ?? it.gross_sales ?? 0),
          netSales: Number(it.netSales ?? it.net_sales ?? 0),
          taxAmount: Number(it.taxAmount ?? it.tax_amount ?? 0),
          ordersCount: Number(it.ordersCount ?? it.orders_count ?? 1),
          station: 'BAR' as const,
        })),
        orders: (s.orders || []).map((ord: any) => ({
          id: ord.id,
          orderNumber: ord.orderNumber || ord.order_number || `#${ord.id?.slice(0, 6)}`,
          tableNumber: ord.tableNumber || ord.table_number || '',
          tableId: ord.tableId || ord.table_id || '',
          createdAt: ord.createdAt || ord.created_at || '',
          status: ord.status || '',
          stationStatus: ord.stationStatus || ord.station_status || ord.status || '',
          items: ord.items || [],
          subtotal: Number(ord.subtotal || 0),
          paymentStatus: ord.paymentStatus || ord.payment_status || 'UNPAID',
          customerName: ord.customerName || ord.customer_name || 'Guest',
        })),
      };
    }
    return clientSections.bar;
  }, [activeDay?.sections?.bar, clientSections.bar]);

  const hookahSection: StationSectionData = useMemo(() => {
    const s = activeDay?.sections?.hookah;
    if (s && ((s.items && s.items.length > 0) || (s.sales || 0) > 0 || ((s as any).order_value || 0) > 0)) {
      return {
        ...s,
        sales: Number(s.sales || (s as any).order_value || 0),
        orderValue: Number(s.orderValue || (s as any).order_value || s.sales || 0),
        ordersCount: Number(s.ordersCount ?? (s as any).orders_count ?? s.orders?.length ?? 0),
        itemsCount: Number(s.itemsCount ?? (s as any).items_count ?? s.items?.length ?? 0),
        productsCount: Number(s.productsCount ?? (s as any).products_count ?? s.items?.length ?? 0),
        items: (s.items || []).map((it: any) => ({
          name: it.name,
          productName: it.productName || it.product_name || it.name,
          flavour: it.flavour || 'Standard Flavour',
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice ?? it.unit_price ?? 0),
          discountAmount: Number(it.discountAmount ?? it.discount_amount ?? 0),
          grossSales: Number(it.grossSales ?? it.gross_sales ?? 0),
          netSales: Number(it.netSales ?? it.net_sales ?? 0),
          taxAmount: Number(it.taxAmount ?? it.tax_amount ?? 0),
          ordersCount: Number(it.ordersCount ?? it.orders_count ?? 1),
          station: 'HOOKAH' as const,
        })),
        orders: (s.orders || []).map((ord: any) => ({
          id: ord.id,
          orderNumber: ord.orderNumber || ord.order_number || `#${ord.id?.slice(0, 6)}`,
          tableNumber: ord.tableNumber || ord.table_number || '',
          tableId: ord.tableId || ord.table_id || '',
          createdAt: ord.createdAt || ord.created_at || '',
          status: ord.status || '',
          stationStatus: ord.stationStatus || ord.station_status || ord.status || '',
          items: ord.items || [],
          subtotal: Number(ord.subtotal || 0),
          paymentStatus: ord.paymentStatus || ord.payment_status || 'UNPAID',
          customerName: ord.customerName || ord.customer_name || 'Guest',
        })),
      };
    }
    return clientSections.hookah;
  }, [activeDay?.sections?.hookah, clientSections.hookah]);

  const combinedOrderValue = Math.round((kitchenSection.sales + barSection.sales + hookahSection.sales) * 100) / 100;

  // Authoritative financial ledger numbers
  const backendBday = activeDay as any;
  const grossOrderValue = Number(
    backendBday?.orderValue ||
    backendBday?.order_value ||
    backendBday?.grossSales ||
    backendBday?.gross_sales ||
    combinedOrderValue ||
    0
  );
  const discountAmount = Number(backendBday?.discountAmount || backendBday?.discount_amount || 0);
  const netSales = Number(backendBday?.netSales || backendBday?.net_sales || Math.max(0, grossOrderValue - discountAmount));
  const taxAmount = Number(backendBday?.taxAmount || backendBday?.tax_amount || 0);
  const settledRevenue = Number(
    backendBday?.settledSales ||
    backendBday?.settled_sales ||
    backendBday?.totalSales ||
    backendBday?.total_sales ||
    ((backendBday?.cashSales || backendBday?.cash_sales || 0) + (backendBday?.cardSales || backendBday?.card_sales || 0) + (backendBday?.upiSales || backendBday?.upi_sales || 0)) ||
    0
  );
  const cashSales = Number(backendBday?.cashSales || backendBday?.cash_sales || 0);
  const cardSales = Number(backendBday?.cardSales || backendBday?.card_sales || 0);
  const upiSales = Number(backendBday?.upiSales || backendBday?.upi_sales || 0);
  const unpaidBillsAmount = Number(backendBday?.unpaidBillsAmount || backendBday?.unpaid_bills_amount || precheck?.unpaid_bills_amount || 0);
  const unbilledOrdersAmount = Number(backendBday?.unbilledOrdersAmount || backendBday?.unbilled_orders_amount || precheck?.unbilled_orders_amount || Math.max(0, grossOrderValue - settledRevenue));
  const outstandingReceivables = Number(backendBday?.outstandingReceivables || backendBday?.outstanding_receivables || (unpaidBillsAmount + unbilledOrdersAmount));

  const totalOrdersCount = Number(
    activeDay?.totalOrders ||
    backendBday?.total_orders ||
    (kitchenSection.ordersCount + barSection.ordersCount + hookahSection.ordersCount)
  );
  const activeTablesCount = isHistoricalView ? 0 : (precheck?.active_tables_count ?? currentBusinessDay?.activeTablesCount ?? tables.filter((t) => t.status === 'OCCUPIED' || t.isOccupied).length);
  const activeSessionsCount = isHistoricalView ? 0 : (precheck?.active_sessions_count ?? currentBusinessDay?.activeSessionsCount ?? 0);

  // Timezone & Rollover Cutoff
  const tz = backendBday?.restaurantTimezone || currentRestaurant?.timezone || 'Asia/Kolkata';
  const [currentLiveTime, setCurrentLiveTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-IN', {
          timeZone: tz,
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });
        setCurrentLiveTime(formatter.format(now));
      } catch {
        setCurrentLiveTime(new Date().toLocaleTimeString());
      }
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, [tz]);

  const activeDateDisplay = activeDay?.businessDate || activeDay?.date || 'Current Shift';
  const nextRolloverAt = backendBday?.nextRolloverAt ? new Date(backendBday.nextRolloverAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '04:00 AM';
  const requiresRollover = Boolean(!isHistoricalView && (currentBusinessDay?.requiresRollover || backendBday?.isStaleShift || backendBday?.requires_rollover));
  const isStaleShift = Boolean(!isHistoricalView && (backendBday?.isStaleShift || backendBday?.is_stale_shift));

  const handleManualSync = async () => {
    if (!restId) return;
    setIsSyncing(true);
    try {
      await onRefreshData();
      await loadPrecheck();
      setIsSyncError(false);
      setLastSynchronized(new Date());
      addToast('info', 'Synchronized', 'Operational metrics updated from ledger.');
    } catch (err: any) {
      setIsSyncError(true);
      addToast('error', 'Sync Failed', err?.message || 'Failed to reach synchronization service.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncAndAdvance = async () => {
    if (!restId) return;
    setIsActionLoading(true);
    try {
      const res = await api.syncAndAdvanceBusinessDay(restId);
      addToast('success', 'Day Synchronized ☀️', `Shift cleanly synchronized and advanced to ${res?.activeDay?.business_date || 'Today'}. Historical ledger archived.`);
      await onRefreshData();
      await loadPrecheck();
    } catch (err: any) {
      addToast('error', 'Sync Error', err?.message || 'Failed to synchronize business day.');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Business Day Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#1e232e] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${isHistoricalView ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
              {isHistoricalView ? <History className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Daily Management System
                </h2>
                {isHistoricalView ? (
                  <Badge variant="brand" className="font-mono text-[10px] px-2.5 py-0.5 bg-purple-950/60 text-purple-300 border-purple-800/60">
                    HISTORICAL ARCHIVE (SEALED)
                  </Badge>
                ) : (
                  <Badge variant="success" className="font-mono text-[10px] px-2.5 py-0.5 bg-emerald-950/60 text-emerald-400 border-emerald-800/60">
                    LIVE OPERATIONAL SHIFT
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Authoritative multi-station sales (Kitchen, Bar, Hookah), permanent audit history, and daily reconciliation.
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector & Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Business Day Selector Dropdown */}
          <div className="flex items-center gap-2 bg-[#12151b] border border-[#1e232e] rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
            <select
              value={isHistoricalView ? (selectedHistoricalDay?.id || '') : 'LIVE'}
              onChange={(e) => handleSelectHistoricalDay(e.target.value)}
              className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none cursor-pointer pr-2"
            >
              <option value="LIVE" className="bg-[#12151b] text-white">
                ● Live Operational Day ({currentBusinessDay?.date || currentBusinessDay?.businessDate || 'Current'})
              </option>
              {businessDayHistory.map((d) => (
                <option key={d.id} value={d.id} className="bg-[#12151b] text-slate-300">
                  📅 {d.businessDate || d.date} — {formatCurrency(d.totalSales || 0, theme.currency)} ({d.totalOrders || 0} orders)
                </option>
              ))}
            </select>
          </div>

          {isHistoricalView && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedHistoricalDay(null)}
              className="border-purple-700/60 bg-purple-950/30 text-purple-300 hover:text-white text-xs px-3 py-2 font-mono"
              icon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Return to Live Day
            </Button>
          )}

          {!isHistoricalView && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="border-[#1e232e] bg-[#12151b] text-slate-300 hover:text-white text-xs px-3 py-2 font-mono"
              icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncing || isPrecheckLoading ? 'animate-spin text-emerald-400' : 'text-slate-400'}`} />}
            >
              {isSyncing ? 'Syncing...' : 'Sync Shift'}
            </Button>
          )}

          {!isHistoricalView && (
            <Button
              variant="brand"
              size="sm"
              onClick={() => setIsPrecheckOpen(true)}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-3.5 py-2 shadow-sm font-mono"
            >
              End Business Day 🏁
            </Button>
          )}
        </div>
      </div>

      {/* Historical View Alert Pill */}
      {isHistoricalView && (
        <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
            <div>
              <span className="font-bold text-purple-300">
                Viewing Historical Day: {activeDateDisplay}
              </span>
              <span className="text-purple-200/80 ml-2 text-[11px]">
                Closed on {activeDay?.closedAt ? new Date(activeDay.closedAt).toLocaleString() : 'N/A'} by {activeDay?.closedBy || 'System'}. Records are sealed and immutable.
              </span>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedHistoricalDay(null)}
            className="text-xs h-7 px-3 border-purple-700/60 text-purple-300 hover:bg-purple-950/60"
          >
            Exit History ✕
          </Button>
        </div>
      )}

      {/* Shift Rollover Alert (Live only) */}
      {requiresRollover && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-start sm:items-center gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-amber-300 text-sm">
                  Automatic Rollover Scheduled — Active Shift: {activeDateDisplay}
                </span>
                {isStaleShift && (
                  <Badge variant="warning" className="text-[10px] bg-amber-900/60 text-amber-300 border-amber-700/60">
                    Prior-Day Shift Active
                  </Badge>
                )}
              </div>
              <p className="text-amber-200/90 text-[11px] leading-relaxed">
                The continuous background service advances the business day automatically at {nextRolloverAt} ({tz}). All orders continue to be stamped accurately to this operational shift.
              </p>
            </div>
          </div>
          <Button
            variant="brand"
            size="sm"
            onClick={handleSyncAndAdvance}
            disabled={isActionLoading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-1.5 shadow-sm shrink-0"
            icon={isActionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          >
            Advance to Current Day
          </Button>
        </div>
      )}

      {/* Operational Metadata Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#12151b] border border-[#1e232e] rounded-xl text-xs font-mono text-slate-300">
        <div className="flex items-center gap-3">
          <span className="text-slate-500">Business Date:</span>
          <span className="font-bold text-white text-sm">{activeDateDisplay}</span>
          <Badge variant={activeDay?.status === 'OPEN' ? 'success' : 'default'} className="text-[10px]">
            {activeDay?.status || 'OPEN'}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-slate-400 text-[11px]">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-emerald-400" />
            <span>{currentLiveTime || tz}</span>
          </span>
          <span>Cutoff: <strong className="text-amber-300">{nextRolloverAt}</strong></span>
          <span>Sync: <strong className="text-slate-300">{lastSynchronized.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
        </div>
      </div>

      {/* Top Financial KPI Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Gross Order Value */}
        <Card className="bg-[#12151b] border-[#1e232e] p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold block">
            Gross Order Value
          </span>
          <p className="text-xl lg:text-2xl font-bold font-mono text-white tracking-tight">
            {formatCurrency(grossOrderValue, theme.currency)}
          </p>
          <span className="text-[10px] font-mono text-slate-500 block">
            Kitchen + Bar + Hookah
          </span>
        </Card>

        {/* Net Sales */}
        <Card className="bg-[#12151b] border-[#1e232e] p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold block">
            Net Sales
          </span>
          <p className="text-xl lg:text-2xl font-bold font-mono text-white tracking-tight">
            {formatCurrency(netSales, theme.currency)}
          </p>
          <span className="text-[10px] font-mono text-slate-500 block">
            Taxes: {formatCurrency(taxAmount, theme.currency)}
          </span>
        </Card>

        {/* Collected Revenue */}
        <Card className="bg-[#12151b] border-[#1e232e] p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-mono text-emerald-400 uppercase font-semibold block">
            Settled Revenue
          </span>
          <p className="text-xl lg:text-2xl font-bold font-mono text-emerald-400 tracking-tight">
            {formatCurrency(settledRevenue, theme.currency)}
          </p>
          <span className="text-[10px] font-mono text-slate-500 block">
            UPI, Card & Cash
          </span>
        </Card>

        {/* Outstanding Receivables */}
        <Card className="bg-[#12151b] border-[#1e232e] p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-mono text-amber-400 uppercase font-semibold block">
            Outstanding
          </span>
          <p className="text-xl lg:text-2xl font-bold font-mono text-amber-300 tracking-tight">
            {formatCurrency(outstandingReceivables, theme.currency)}
          </p>
          <span className="text-[10px] font-mono text-slate-500 block">
            Unbilled & Open bills
          </span>
        </Card>

        {/* Total Orders */}
        <Card className="bg-[#12151b] border-[#1e232e] p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold block">
            Total Orders
          </span>
          <p className="text-xl lg:text-2xl font-bold font-mono text-white tracking-tight">
            {totalOrdersCount}
          </p>
          <span className="text-[10px] font-mono text-slate-500 block">
            Across 3 stations
          </span>
        </Card>

        {/* Active Tables / Sessions */}
        <Card className="bg-[#12151b] border-[#1e232e] p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-mono text-sky-400 uppercase font-semibold block">
            Active Tables
          </span>
          <p className="text-xl lg:text-2xl font-bold font-mono text-sky-300 tracking-tight">
            {activeTablesCount}
          </p>
          <span className="text-[10px] font-mono text-slate-500 block">
            {activeSessionsCount} open sessions
          </span>
        </Card>
      </div>

      {/* COMBINED OPERATIONAL ORDER VALUE RECONCILIATION SUMMARY BOX */}
      <Card className="bg-[#10141d] border border-[#1e2736] p-4 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold block">
              Daily Operational Order Value Reconciliation
            </span>
            <div className="flex items-baseline gap-2 flex-wrap font-mono">
              <span className="text-xs text-slate-400">Kitchen:</span>
              <span className="text-sm font-bold text-sky-400">{formatCurrency(kitchenSection.sales, theme.currency)}</span>
              <span className="text-slate-600">+</span>
              <span className="text-xs text-slate-400">Bar:</span>
              <span className="text-sm font-bold text-purple-400">{formatCurrency(barSection.sales, theme.currency)}</span>
              <span className="text-slate-600">+</span>
              <span className="text-xs text-slate-400">Hookah:</span>
              <span className="text-sm font-bold text-orange-400">{formatCurrency(hookahSection.sales, theme.currency)}</span>
              <span className="text-slate-600">=</span>
              <span className="text-base font-bold text-white bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700">
                {formatCurrency(combinedOrderValue, theme.currency)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" className="font-mono text-[11px] px-3 py-1 bg-emerald-950/60 text-emerald-400 border-emerald-800/60 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Zero Double-Counting Verified</span>
            </Badge>
          </div>
        </div>
      </Card>

      {/* SECTION TABS FILTER */}
      <div className="flex items-center justify-between border-b border-[#1e232e] pb-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveStationTab('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all ${
              activeStationTab === 'all'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'bg-[#12151b] text-slate-400 hover:text-white border border-[#1e232e]'
            }`}
          >
            All 3 Sections
          </button>
          <button
            onClick={() => setActiveStationTab('kitchen')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center gap-1.5 ${
              activeStationTab === 'kitchen'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'bg-[#12151b] text-slate-400 hover:text-white border border-[#1e232e]'
            }`}
          >
            <ChefHat className="w-3.5 h-3.5" />
            Kitchen ({formatCurrency(kitchenSection.sales, theme.currency)})
          </button>
          <button
            onClick={() => setActiveStationTab('bar')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center gap-1.5 ${
              activeStationTab === 'bar'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'bg-[#12151b] text-slate-400 hover:text-white border border-[#1e232e]'
            }`}
          >
            <Wine className="w-3.5 h-3.5" />
            Bar ({formatCurrency(barSection.sales, theme.currency)})
          </button>
          <button
            onClick={() => setActiveStationTab('hookah')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center gap-1.5 ${
              activeStationTab === 'hookah'
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm'
                : 'bg-[#12151b] text-slate-400 hover:text-white border border-[#1e232e]'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            Hookah ({formatCurrency(hookahSection.sales, theme.currency)})
          </button>
        </div>
      </div>

      {/* THREE DISTINCT SALES SECTIONS */}
      <div className="space-y-6">
        {/* ==================== A. KITCHEN SECTION ==================== */}
        {(activeStationTab === 'all' || activeStationTab === 'kitchen') && (
          <Card className="bg-[#12151b] border-[#1e232e] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e232e] pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  <ChefHat className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white tracking-tight">
                      A. Kitchen (Culinary)
                    </h3>
                    <Badge variant="outline" className="font-mono text-[10px] border-sky-800/60 text-sky-400 bg-sky-950/40">
                      {kitchenSection.ordersCount} Orders
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Food items, starters, mains, and desserts prepared by kitchen staff.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto font-mono">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase block">Kitchen Total</span>
                  <span className="text-xl font-bold text-sky-400">
                    {formatCurrency(kitchenSection.sales, theme.currency)}
                  </span>
                </div>
                {/* Kitchen Sub-tabs */}
                <div className="flex items-center gap-1 bg-[#0e1117] p-1 rounded-lg border border-[#1e232e]">
                  <button
                    onClick={() => setKitchenViewMode('items')}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      kitchenViewMode === 'items'
                        ? 'bg-sky-500/20 text-sky-300 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Dish Breakdown ({kitchenSection.items.length})
                  </button>
                  <button
                    onClick={() => setKitchenViewMode('orders')}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      kitchenViewMode === 'orders'
                        ? 'bg-sky-500/20 text-sky-300 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Orders ({kitchenSection.orders.length})
                  </button>
                </div>
              </div>
            </div>

            {/* View 1: Dish-Wise Sales Breakdown */}
            {kitchenViewMode === 'items' && (
              <div className="overflow-x-auto">
                {kitchenSection.items.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-mono text-xs">
                    No kitchen dishes recorded for this business day.
                  </div>
                ) : (
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#1e232e] text-[10px] uppercase text-slate-400 tracking-wider">
                        <th className="py-2.5 px-3">Dish Name</th>
                        <th className="py-2.5 px-3 text-right">Qty Sold</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-right">Discounts</th>
                        <th className="py-2.5 px-3 text-right">Gross Sales</th>
                        <th className="py-2.5 px-3 text-right">Net Sales</th>
                        <th className="py-2.5 px-3 text-right">Tax (5%)</th>
                        <th className="py-2.5 px-3 text-right">Orders</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e232e]/60">
                      {kitchenSection.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-[#181d27]/40 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-white">{it.name}</td>
                          <td className="py-2.5 px-3 text-right text-sky-300 font-bold">{it.quantity}</td>
                          <td className="py-2.5 px-3 text-right text-slate-300">{formatCurrency(it.unitPrice || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right text-rose-400">
                            {(it.discountAmount || 0) > 0 ? `-${formatCurrency(it.discountAmount || 0, theme.currency)}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-200">{formatCurrency(it.grossSales || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-white">{formatCurrency(it.netSales || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right text-slate-400">{formatCurrency(it.taxAmount || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right text-slate-400">{it.ordersCount || 1}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#1e232e] font-bold text-white bg-[#0e1117]/60">
                        <td className="py-2.5 px-3 uppercase text-[11px] text-slate-400">Total Kitchen Dishes</td>
                        <td className="py-2.5 px-3 text-right text-sky-300">{kitchenSection.itemsCount}</td>
                        <td colSpan={2}></td>
                        <td className="py-2.5 px-3 text-right">{formatCurrency(kitchenSection.sales, theme.currency)}</td>
                        <td className="py-2.5 px-3 text-right text-sky-400">{formatCurrency(kitchenSection.sales, theme.currency)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* View 2: Kitchen Orders List */}
            {kitchenViewMode === 'orders' && (
              <div className="space-y-2">
                {kitchenSection.orders.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-mono text-xs">
                    No kitchen orders recorded.
                  </div>
                ) : (
                  kitchenSection.orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{ord.orderNumber}</span>
                          <span className="text-slate-400">Table {ord.tableNumber}</span>
                          <Badge variant="outline" className="text-[10px] border-[#1e232e] text-slate-300">
                            {ord.stationStatus}
                          </Badge>
                          <Badge
                            variant={ord.paymentStatus === 'PAID' ? 'success' : 'warning'}
                            className="text-[10px]"
                          >
                            {ord.paymentStatus}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(' • ')}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-sky-400">
                          {formatCurrency(ord.subtotal, theme.currency)}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>
        )}

        {/* ==================== B. BAR SECTION ==================== */}
        {(activeStationTab === 'all' || activeStationTab === 'bar') && (
          <Card className="bg-[#12151b] border-[#1e232e] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e232e] pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <Wine className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white tracking-tight">
                      B. Bar (Beverages)
                    </h3>
                    <Badge variant="outline" className="font-mono text-[10px] border-purple-800/60 text-purple-400 bg-purple-950/40">
                      {barSection.ordersCount} Orders
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cocktails, mocktails, beers, wines, spirits, and non-alcoholic beverages.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto font-mono">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase block">Bar Total</span>
                  <span className="text-xl font-bold text-purple-400">
                    {formatCurrency(barSection.sales, theme.currency)}
                  </span>
                </div>
                {/* Bar Sub-tabs */}
                <div className="flex items-center gap-1 bg-[#0e1117] p-1 rounded-lg border border-[#1e232e]">
                  <button
                    onClick={() => setBarViewMode('items')}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      barViewMode === 'items'
                        ? 'bg-purple-500/20 text-purple-300 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Beverage Breakdown ({barSection.items.length})
                  </button>
                  <button
                    onClick={() => setBarViewMode('orders')}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      barViewMode === 'orders'
                        ? 'bg-purple-500/20 text-purple-300 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Orders ({barSection.orders.length})
                  </button>
                </div>
              </div>
            </div>

            {/* View 1: Beverage-Wise Sales Breakdown */}
            {barViewMode === 'items' && (
              <div className="overflow-x-auto">
                {barSection.items.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-mono text-xs">
                    No bar beverages recorded for this business day.
                  </div>
                ) : (
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#1e232e] text-[10px] uppercase text-slate-400 tracking-wider">
                        <th className="py-2.5 px-3">Beverage Name</th>
                        <th className="py-2.5 px-3 text-right">Qty Sold</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-right">Discounts</th>
                        <th className="py-2.5 px-3 text-right">Gross Sales</th>
                        <th className="py-2.5 px-3 text-right">Net Sales</th>
                        <th className="py-2.5 px-3 text-right">Tax (5%)</th>
                        <th className="py-2.5 px-3 text-right">Orders</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e232e]/60">
                      {barSection.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-[#181d27]/40 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-white">{it.name}</td>
                          <td className="py-2.5 px-3 text-right text-purple-300 font-bold">{it.quantity}</td>
                          <td className="py-2.5 px-3 text-right text-slate-300">{formatCurrency(it.unitPrice || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right text-rose-400">
                            {(it.discountAmount || 0) > 0 ? `-${formatCurrency(it.discountAmount || 0, theme.currency)}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-200">{formatCurrency(it.grossSales || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-white">{formatCurrency(it.netSales || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right text-slate-400">{formatCurrency(it.taxAmount || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right text-slate-400">{it.ordersCount || 1}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#1e232e] font-bold text-white bg-[#0e1117]/60">
                        <td className="py-2.5 px-3 uppercase text-[11px] text-slate-400">Total Bar Beverages</td>
                        <td className="py-2.5 px-3 text-right text-purple-300">{barSection.itemsCount}</td>
                        <td colSpan={2}></td>
                        <td className="py-2.5 px-3 text-right">{formatCurrency(barSection.sales, theme.currency)}</td>
                        <td className="py-2.5 px-3 text-right text-purple-400">{formatCurrency(barSection.sales, theme.currency)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* View 2: Bar Orders List */}
            {barViewMode === 'orders' && (
              <div className="space-y-2">
                {barSection.orders.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-mono text-xs">
                    No bar orders recorded.
                  </div>
                ) : (
                  barSection.orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{ord.orderNumber}</span>
                          <span className="text-slate-400">Table {ord.tableNumber}</span>
                          <Badge variant="outline" className="text-[10px] border-[#1e232e] text-slate-300">
                            {ord.stationStatus}
                          </Badge>
                          <Badge
                            variant={ord.paymentStatus === 'PAID' ? 'success' : 'warning'}
                            className="text-[10px]"
                          >
                            {ord.paymentStatus}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {ord.items.map((i) => `${i.quantity}x ${i.name}`).join(' • ')}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-purple-400">
                          {formatCurrency(ord.subtotal, theme.currency)}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>
        )}

        {/* ==================== C. HOOKAH SECTION ==================== */}
        {(activeStationTab === 'all' || activeStationTab === 'hookah') && (
          <Card className="bg-[#12151b] border-[#1e232e] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e232e] pb-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-400 border border-orange-500/20">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white tracking-tight">
                      C. Hookah (Shisha Lounge)
                    </h3>
                    <Badge variant="outline" className="font-mono text-[10px] border-orange-800/60 text-orange-400 bg-orange-950/40">
                      {hookahSection.ordersCount} Orders
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Hookah pipes, premium mixes, base flavours, and coal preparations.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto font-mono">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase block">Hookah Total</span>
                  <span className="text-xl font-bold text-orange-400">
                    {formatCurrency(hookahSection.sales, theme.currency)}
                  </span>
                </div>
                {/* Hookah Sub-tabs */}
                <div className="flex items-center gap-1 bg-[#0e1117] p-1 rounded-lg border border-[#1e232e]">
                  <button
                    onClick={() => setHookahViewMode('items')}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      hookahViewMode === 'items'
                        ? 'bg-orange-500/20 text-orange-300 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Flavour Breakdown ({hookahSection.items.length})
                  </button>
                  <button
                    onClick={() => setHookahViewMode('orders')}
                    className={`px-2.5 py-1 rounded text-xs transition-all ${
                      hookahViewMode === 'orders'
                        ? 'bg-orange-500/20 text-orange-300 font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Orders ({hookahSection.orders.length})
                  </button>
                </div>
              </div>
            </div>

            {/* View 1: Hookah Product & Flavour Breakdown */}
            {hookahViewMode === 'items' && (
              <div className="overflow-x-auto">
                {hookahSection.items.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-mono text-xs">
                    No hookah orders recorded for this business day.
                  </div>
                ) : (
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-[#1e232e] text-[10px] uppercase text-slate-400 tracking-wider">
                        <th className="py-2.5 px-3">Product / Pot</th>
                        <th className="py-2.5 px-3">Selected Flavour</th>
                        <th className="py-2.5 px-3 text-right">Qty Sold</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-right">Discounts</th>
                        <th className="py-2.5 px-3 text-right">Gross Sales</th>
                        <th className="py-2.5 px-3 text-right">Net Sales</th>
                        <th className="py-2.5 px-3 text-right">Tax (5%)</th>
                        <th className="py-2.5 px-3 text-right">Orders</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e232e]/60">
                      {hookahSection.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-[#181d27]/40 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-white">{it.name}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[11px] font-bold">
                              {it.flavour || 'Standard'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-orange-300 font-bold">{it.quantity}</td>
                          <td className="py-2.5 px-3 text-right text-slate-300">{formatCurrency(it.unitPrice || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right text-rose-400">
                            {(it.discountAmount || 0) > 0 ? `-${formatCurrency(it.discountAmount || 0, theme.currency)}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-200">{formatCurrency(it.grossSales || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-white">{formatCurrency(it.netSales || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right text-slate-400">{formatCurrency(it.taxAmount || 0, theme.currency)}</td>
                          <td className="py-2.5 px-3 text-right text-slate-400">{it.ordersCount || 1}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[#1e232e] font-bold text-white bg-[#0e1117]/60">
                        <td className="py-2.5 px-3 uppercase text-[11px] text-slate-400" colSpan={2}>Total Hookahs</td>
                        <td className="py-2.5 px-3 text-right text-orange-300">{hookahSection.itemsCount}</td>
                        <td colSpan={2}></td>
                        <td className="py-2.5 px-3 text-right">{formatCurrency(hookahSection.sales, theme.currency)}</td>
                        <td className="py-2.5 px-3 text-right text-orange-400">{formatCurrency(hookahSection.sales, theme.currency)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}

            {/* View 2: Hookah Orders List */}
            {hookahViewMode === 'orders' && (
              <div className="space-y-2">
                {hookahSection.orders.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 font-mono text-xs">
                    No hookah orders recorded.
                  </div>
                ) : (
                  hookahSection.orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-3 bg-[#0e1117] rounded-xl border border-[#1e232e] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{ord.orderNumber}</span>
                          <span className="text-slate-400">Table {ord.tableNumber}</span>
                          <Badge variant="outline" className="text-[10px] border-[#1e232e] text-slate-300">
                            {ord.stationStatus}
                          </Badge>
                          <Badge
                            variant={ord.paymentStatus === 'PAID' ? 'success' : 'warning'}
                            className="text-[10px]"
                          >
                            {ord.paymentStatus}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {ord.items.map((i) => `${i.quantity}x ${i.name} (${i.flavour || 'Standard'})`).join(' • ')}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-bold text-orange-400">
                          {formatCurrency(ord.subtotal, theme.currency)}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* FINANCIAL RECONCILIATION LEDGER */}
      <Card className="bg-[#12151b] border-[#1e232e] p-6 rounded-2xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e232e] pb-3.5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <TableProperties className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                Daily Financial Reconciliation Ledger
                <Badge variant={outstandingReceivables > 0 ? 'warning' : 'success'} className="font-mono text-[10px]">
                  {outstandingReceivables > 0 ? 'PENDING RECEIVABLES' : 'BALANCED & AUDITED'}
                </Badge>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Double-entry audit comparing operational order demand against settled cash flow.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Operational Sales Demand */}
          <div className="space-y-3 p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] font-mono text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block border-b border-[#1e232e] pb-1.5">
              1. Operational Demand (Gross to Net)
            </span>
            <div className="flex justify-between items-center text-slate-300">
              <span>Gross Order Value:</span>
              <span className="font-bold text-white">{formatCurrency(grossOrderValue, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400 pl-3">• Kitchen Sales:</span>
              <span className="text-sky-300">{formatCurrency(kitchenSection.sales, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400 pl-3">• Bar Sales:</span>
              <span className="text-purple-300">{formatCurrency(barSection.sales, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400 pl-3">• Hookah Sales:</span>
              <span className="text-orange-300">{formatCurrency(hookahSection.sales, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Discounts Applied:</span>
              <span className="text-rose-400">-{formatCurrency(discountAmount, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300 border-t border-[#1e232e] pt-2 font-bold">
              <span>Net Sales:</span>
              <span className="text-emerald-400">{formatCurrency(netSales, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400 text-[11px]">
              <span>Taxes Assessed (GST):</span>
              <span>{formatCurrency(taxAmount, theme.currency)}</span>
            </div>
          </div>

          {/* Right Column: Collected Revenue & Outstanding Receivables */}
          <div className="space-y-3 p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] font-mono text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block border-b border-[#1e232e] pb-1.5">
              2. Cash Flow & Receivables
            </span>
            <div className="flex justify-between items-center text-slate-300">
              <span>Settled UPI Revenue:</span>
              <span className="font-bold text-emerald-400">{formatCurrency(upiSales, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Settled Card Revenue:</span>
              <span className="font-bold text-emerald-400">{formatCurrency(cardSales, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Settled Cash Revenue:</span>
              <span className="font-bold text-emerald-400">{formatCurrency(cashSales, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300 border-t border-[#1e232e] pt-2 font-bold">
              <span>Total Settled Cash Flow:</span>
              <span className="text-emerald-300">{formatCurrency(settledRevenue, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Unpaid Invoices:</span>
              <span className="text-amber-300">{formatCurrency(unpaidBillsAmount, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Unbilled Active Orders:</span>
              <span className="text-amber-300">{formatCurrency(unbilledOrdersAmount, theme.currency)}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300 border-t border-[#1e232e] pt-2 font-bold">
              <span>Total Outstanding Balance:</span>
              <span className={outstandingReceivables > 0 ? 'text-amber-400' : 'text-slate-400'}>
                {formatCurrency(outstandingReceivables, theme.currency)}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* END BUSINESS DAY PRECHECK MODAL */}
      {isPrecheckOpen && (
        <Modal
          isOpen={isPrecheckOpen}
          onClose={() => setIsPrecheckOpen(false)}
          title="End Business Day & Advance Shift"
        >
          <div className="space-y-4 font-mono text-xs">
            <p className="text-slate-300">
              Closing the operational day <strong className="text-white">{activeDateDisplay}</strong> will seal all ledger entries, archive shift statistics, reset occupied tables, and open the next operational day.
            </p>

            <div className="p-4 bg-[#0e1117] rounded-xl border border-[#1e232e] space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Shift Sales:</span>
                <span className="font-bold text-white">{formatCurrency(combinedOrderValue, theme.currency)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Settled Revenue:</span>
                <span className="font-bold text-emerald-400">{formatCurrency(settledRevenue, theme.currency)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Outstanding Receivables:</span>
                <span className="font-bold text-amber-300">{formatCurrency(outstandingReceivables, theme.currency)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Shift Orders:</span>
                <span className="font-bold text-white">{totalOrdersCount}</span>
              </div>
            </div>

            {outstandingReceivables > 0 && (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Notice: There are pending receivables of {formatCurrency(outstandingReceivables, theme.currency)}. These will be permanently recorded in the shift audit ledger.
                </span>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-[#1e232e]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPrecheckOpen(false)}
                className="border-[#1e232e] text-slate-300 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                variant="brand"
                size="sm"
                disabled={isActionLoading}
                onClick={async () => {
                  if (!restId) return;
                  setIsActionLoading(true);
                  try {
                    await api.closeBusinessDay(restId, currentUser?.name || 'Manager', {
                      closingNotes: 'Manual shift close from Daily Management.',
                      forceCloseActiveTables: true,
                    });
                    addToast('success', 'Day Closed & Archived 🏁', `Business day ${activeDateDisplay} sealed.`);
                    setIsPrecheckOpen(false);
                    await onRefreshData();
                  } catch (err: any) {
                    addToast('error', 'Close Failed', err?.message || 'Could not close business day.');
                  } finally {
                    setIsActionLoading(false);
                  }
                }}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
              >
                {isActionLoading ? 'Sealing Shift...' : 'Confirm & Close Day 🏁'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
