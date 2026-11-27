import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Truck,
  MapPin,
  Phone,
  Navigation,
  Send,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Bot,
  RefreshCw,
  History,
  LogOut,
  Radio,
  ChefHat,
  Wine,
  Sparkles,
} from 'lucide-react';
import { Order, Restaurant } from '../../packages/types';
import { api } from '../../packages/api/client';
import { realtimeBus, ConnectionStatusType } from '../../packages/api/realtime';
import { Badge, Button, DinelyLogo, SearchInput, ToastContainer, ToastMessage } from '../../packages/ui';
import { formatCurrency } from '../../packages/utils/currency';

interface DeliveryTerminalProps {
  restaurant?: Restaurant | null;
  orders?: Order[];
  isEmbedded?: boolean;
  onRefreshOrders?: () => void;
  onLogout?: () => void;
}

const formatRelativeTime = (iso?: string) => {
  if (!iso) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
};

const getGoogleMapsUrl = (lat?: number | null, lng?: number | null, address?: string) => {
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  return null;
};

export const DeliveryTerminal: React.FC<DeliveryTerminalProps> = ({
  restaurant: propRestaurant,
  orders: propOrders,
  isEmbedded = false,
  onRefreshOrders,
  onLogout,
}) => {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(propRestaurant || null);
  const [orders, setOrders] = useState<Order[]>(propOrders || []);
  const [wsStatus, setWsStatus] = useState<ConnectionStatusType>('DISCONNECTED');
  const [viewMode, setViewMode] = useState<'LIVE' | 'HISTORY'>('LIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  const restId = restaurant?.id || propRestaurant?.id || api.getCurrentRestaurantId() || '';
  const botStorageKey = restId ? `dinely_delivery_auto_bot_${restId}` : 'dinely_delivery_auto_bot';
  const [autoBotEnabled, setAutoBotEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && restId) {
      return localStorage.getItem(`dinely_delivery_auto_bot_${restId}`) === 'true';
    }
    return false;
  });

  const autoBotRef = useRef(autoBotEnabled);
  useEffect(() => {
    autoBotRef.current = autoBotEnabled;
    if (typeof window !== 'undefined' && restId) {
      localStorage.setItem(botStorageKey, String(autoBotEnabled));
    }
  }, [autoBotEnabled, botStorageKey, restId]);

  useEffect(() => {
    if (propRestaurant) setRestaurant(propRestaurant);
  }, [propRestaurant]);

  useEffect(() => {
    if (Array.isArray(propOrders)) setOrders(propOrders);
  }, [propOrders]);

  const showToast = (type: ToastMessage['type'], title: string, message?: string) => {
    const id = `deliv-toast-${Date.now()}`;
    setToasts((prev) => [{ id, type, title, message }, ...prev.slice(0, 2)]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  const fetchOrders = async (silent = true) => {
    if (!restId) return;
    try {
      const list = await api.getOrders(restId, { activeOnly: viewMode === 'LIVE' });
      if (Array.isArray(list)) {
        setOrders(list);
      }
      onRefreshOrders?.();
    } catch (err) {
      if (!silent) showToast('error', 'Sync Failed', 'Could not load delivery orders.');
    }
  };

  useEffect(() => {
    if (!restId) return;
    if (!restaurant) {
      api.getRestaurants().then((list) => {
        const match = Array.isArray(list) ? list.find((r) => r.id === restId) : undefined;
        if (match) setRestaurant(match);
      }).catch(() => {});
    }
    fetchOrders(true);
    realtimeBus.connect(restId, isEmbedded ? 'OWNER' : 'DELIVERY');
    const unsubStatus = realtimeBus.subscribeStatus(setWsStatus);

    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchOrders(true);
      }
    }, wsStatus === 'CONNECTED' ? 4000 : 2000);

    const unsub = realtimeBus.subscribe((event) => {
      const evtRestId = event.restaurantId || (event as any).restaurant_id;
      if (evtRestId && restId && String(evtRestId).toLowerCase() !== String(restId).toLowerCase()) return;

      const p = (event as any).payload || (event as any).data || event;
      const ordId = p.orderId || p.order_id || p.id || (event as any).orderId || (event as any).order_id;

      if (event.type === 'delivery_location_updated' && ordId) {
        const meta = p.deliveryMeta || p.delivery_meta;
        if (meta) {
          setOrders((prev) =>
            prev.map((o) => (o.id === ordId ? { ...o, deliveryMeta: meta } : o))
          );
        }
        return;
      }

      if (
        event.type === 'order_created' ||
        event.type === 'OrderCreated' ||
        event.type === 'order_status_updated' ||
        event.type === 'OrderStatusUpdated' ||
        event.type === 'order_ready' ||
        event.type === 'OrderReady' ||
        event.type === 'order_delivered' ||
        event.type === 'OrderDelivered'
      ) {
        fetchOrders(true);
      }
    });

    return () => {
      clearInterval(pollInterval);
      unsub();
      unsubStatus();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restId, viewMode]);

  const deliveryShareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/delivery';
    const loc = window.location;
    if (restaurant?.slug && (loc.hostname === 'dinely.food' || loc.hostname === 'www.dinely.food')) {
      return `https://${restaurant.slug}.dinely.food/delivery`;
    }
    return `${loc.origin}/delivery`;
  }, [restaurant?.slug]);

  const handleDispatchToKitchen = async (order: Order, viaBot = false) => {
    if (processingIds.has(order.id)) return;
    setProcessingIds((prev) => new Set(prev).add(order.id));
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? {
              ...o,
              status: 'PENDING',
              deliveryStatus: 'DISPATCHED_TO_KITCHEN',
              deliveryMeta: { ...(o.deliveryMeta || {}), dispatchedToKitchen: true },
            }
          : o
      )
    );
    try {
      await api.dispatchDeliveryOrderToKitchen(order.id);
      showToast(
        'success',
        viaBot ? 'Bot Auto-Dispatched' : 'Sent to Kitchen',
        `Delivery #${order.id.slice(-4)} sent to kitchen & prep terminals.`
      );
    } catch (err: any) {
      showToast('error', 'Dispatch Failed', err.message || 'Could not dispatch order to kitchen.');
      fetchOrders(true);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  // Delivery Terminal Auto-Dispatch Bot: automatically sends incoming delivery orders to Kitchen when enabled
  const autoDispatchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!autoBotEnabled) return;
    const incoming = orders.filter(
      (o) =>
        (o.orderType === 'DELIVERY' || o.tableNumber === 'DELIVERY') &&
        o.status === 'PENDING_DELIVERY' &&
        !autoDispatchedRef.current.has(o.id)
    );
    incoming.forEach((o) => {
      autoDispatchedRef.current.add(o.id);
      handleDispatchToKitchen(o, true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, autoBotEnabled]);

  const handleOutForDelivery = async (order: Order) => {
    if (processingIds.has(order.id)) return;
    setProcessingIds((prev) => new Set(prev).add(order.id));
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id ? { ...o, status: 'OUT_FOR_DELIVERY', deliveryStatus: 'OUT_FOR_DELIVERY' } : o
      )
    );
    try {
      await api.updateOrderStatus(order.id, { status: 'OUT_FOR_DELIVERY', deliveryStatus: 'OUT_FOR_DELIVERY' });
      showToast('info', 'Out for Delivery', `Order #${order.id.slice(-4)} is on the way.`);
    } catch (err: any) {
      showToast('error', 'Update Failed', err.message || 'Could not mark out for delivery.');
      fetchOrders(true);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const handleMarkDelivered = async (order: Order) => {
    if (processingIds.has(order.id)) return;
    setProcessingIds((prev) => new Set(prev).add(order.id));
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? {
              ...o,
              status: 'DELIVERED',
              deliveryStatus: 'DELIVERED',
              kitchenStatus: o.kitchenStatus ? 'COMPLETED' : o.kitchenStatus,
              barStatus: o.barStatus ? 'COMPLETED' : o.barStatus,
              hookahStatus: o.hookahStatus ? 'COMPLETED' : o.hookahStatus,
            }
          : o
      )
    );
    try {
      await api.updateOrderStatus(order.id, { status: 'DELIVERED', deliveryStatus: 'DELIVERED' });
      showToast('success', 'Delivered', `Order #${order.id.slice(-4)} marked delivered.`);
    } catch (err: any) {
      showToast('error', 'Delivery Update Failed', err.message || 'Could not mark delivered.');
      fetchOrders(true);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(order.id);
        return next;
      });
    }
  };

  const deliveryOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (o.orderType !== 'DELIVERY' && o.tableNumber !== 'DELIVERY') return false;
      if (!q) return true;
      const addr = (o.deliveryMeta?.deliveryAddress || '').toLowerCase();
      const phone = (o.deliveryMeta?.customerPhone || o.customerPhone || '').toLowerCase();
      const name = (o.customerName || '').toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        name.includes(q) ||
        phone.includes(q) ||
        addr.includes(q)
      );
    });
  }, [orders, searchQuery]);

  const incomingOrders = deliveryOrders.filter((o) => o.status === 'PENDING_DELIVERY');
  const prepOrders = deliveryOrders.filter((o) =>
    ['PENDING', 'CONFIRMED', 'IN_KITCHEN', 'PREPARING', 'IN_PREPARATION', 'READY'].includes(o.status)
  );
  const outForDeliveryOrders = deliveryOrders.filter((o) => o.status === 'OUT_FOR_DELIVERY');
  const completedOrders = deliveryOrders.filter((o) => o.status === 'DELIVERED' || o.status === 'COMPLETED');

  const renderCustomerLocationBlock = (order: Order) => {
    const meta = order.deliveryMeta || {};
    const phone = meta.customerPhone || order.customerPhone;
    const mapsUrl = getGoogleMapsUrl(meta.latitude, meta.longitude, meta.deliveryAddress);
    const hasCoords = typeof meta.latitude === 'number' && typeof meta.longitude === 'number';

    return (
      <div className="p-3 rounded-xl bg-[#0b0d11] border border-white/[0.08] space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-white truncate">{order.customerName || 'Customer'}</span>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono text-[11px] hover:bg-emerald-500/25 transition-colors shrink-0"
            >
              <Phone className="w-3 h-3" />
              <span>{phone}</span>
            </a>
          )}
        </div>

        <div className="flex items-start gap-2 text-slate-300">
          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="leading-snug break-words">{meta.deliveryAddress || 'GPS Pin Shared'}</p>
            {meta.landmark && (
              <p className="text-[11px] text-slate-400 mt-0.5">Landmark: {meta.landmark}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
          <div className="flex items-center gap-1.5 text-[11px]">
            {meta.liveLocationEnabled && hasCoords ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 font-mono font-semibold">
                <Radio className="w-3 h-3 animate-pulse" />
                <span>Live GPS · {formatRelativeTime(meta.locationUpdatedAt)}</span>
              </span>
            ) : hasCoords ? (
              <span className="text-sky-300 font-mono">
                GPS: {meta.latitude?.toFixed(4)}, {meta.longitude?.toFixed(4)}
              </span>
            ) : (
              <span className="text-slate-500 font-mono">Manual address</span>
            )}
          </div>

          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[11px] font-semibold hover:bg-sky-500/25 transition-colors shrink-0"
            >
              <Navigation className="w-3 h-3" />
              <span>Open Map</span>
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={isEmbedded ? 'space-y-4 font-sans' : 'min-h-screen bg-[#0a0c10] text-slate-100 font-sans flex flex-col'}>
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />

      {!isEmbedded && (
        <header className="sticky top-0 z-30 bg-[#0b0d11]/90 backdrop-blur-xl border-b border-[#1e232e] px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <DinelyLogo size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-white uppercase truncate">
                  {restaurant?.name || 'Dinely'} · Delivery Terminal
                </h1>
                <Badge variant="brand" className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  DELIVERY
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Online delivery intake, auto-dispatch bot to kitchen, and live customer GPS tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchOrders(false)}
              className="h-8 px-2.5 text-xs bg-white/[0.04] border-white/15"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
            {onLogout && (
              <Button
                variant="outline"
                size="sm"
                onClick={onLogout}
                className="h-8 px-2.5 text-xs bg-rose-500/10 border-rose-500/30 text-rose-300"
                icon={<LogOut className="w-3.5 h-3.5" />}
              >
                Sign Out
              </Button>
            )}
          </div>
        </header>
      )}

      <div className={isEmbedded ? 'space-y-4' : 'max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5 flex-1'}>
        {/* Shareable Delivery Link + Auto-Dispatch Bot Control Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-[#12151b] border border-[#1e232e] p-3.5 rounded-xl items-center">
          <div className="lg:col-span-6 flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-slate-300">Customer Delivery Order Link</p>
              <p className="text-xs font-mono text-emerald-300 truncate">{deliveryShareUrl}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard?.writeText(deliveryShareUrl);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2000);
                showToast('success', 'Link Copied', 'Share this link on your website or social bio.');
              }}
              className="h-8 px-2.5 text-xs bg-white/[0.04] border-white/15 shrink-0"
              icon={<Copy className="w-3.5 h-3.5" />}
            >
              {copiedLink ? 'Copied' : 'Copy'}
            </Button>
            <a
              href={deliveryShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/15 text-xs text-slate-200 inline-flex items-center gap-1 shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open</span>
            </a>
          </div>

          <div className="lg:col-span-6 flex flex-wrap items-center justify-between lg:justify-end gap-2">
            <button
              type="button"
              onClick={() => setAutoBotEnabled((v) => !v)}
              className={`h-8 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                autoBotEnabled
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : 'bg-white/[0.04] border-white/15 text-slate-300 hover:text-white'
              }`}
              title="When enabled, Delivery Terminal Bot automatically forwards new delivery orders to Kitchen"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Auto-Send to Kitchen Bot: {autoBotEnabled ? 'ON' : 'OFF'}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewMode('LIVE')}
                className={`h-8 px-3 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  viewMode === 'LIVE'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-white/[0.03] text-slate-400 border border-white/[0.08]'
                }`}
              >
                Live ({incomingOrders.length + prepOrders.length + outForDeliveryOrders.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('HISTORY')}
                className={`h-8 px-3 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                  viewMode === 'HISTORY'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-white/[0.03] text-slate-400 border border-white/[0.08]'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Delivered ({completedOrders.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center justify-between gap-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search customer name, phone, address, or order #..."
            className="max-w-md w-full text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchOrders(false)}
            className="h-9 px-3 text-xs bg-white/[0.04] border-white/15 shrink-0"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Sync
          </Button>
        </div>

        {viewMode === 'LIVE' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            {/* COLUMN 1: INCOMING (AWAITING DISPATCH TO KITCHEN) */}
            <div className="bg-[#12151b] border border-[#1e232e] p-4 rounded-xl space-y-3.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#1e232e]">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-white">1. Incoming Orders</span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {incomingOrders.length}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">Send to Kitchen</span>
              </div>

              {incomingOrders.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                  <Truck className="w-7 h-7 text-amber-400/60 mx-auto" />
                  <p className="text-xs font-semibold text-slate-300">No New Delivery Orders</p>
                  <p className="text-[11px] text-slate-500">Orders placed via the delivery link arrive here first.</p>
                </div>
              ) : (
                incomingOrders.map((order) => (
                  <div key={order.id} className="p-4 rounded-xl bg-white/[0.03] border border-amber-500/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-amber-400 text-base">#{order.id.slice(-4)}</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">{formatCurrency(order.totalAmount)}</span>
                    </div>

                    {renderCustomerLocationBlock(order)}

                    <div className="space-y-1 text-xs border-t border-white/[0.06] pt-2">
                      {(order.items || []).map((it) => (
                        <div key={it.id} className="flex justify-between text-slate-200">
                          <span><strong className="text-amber-400 font-mono">{it.quantity}x</strong> {it.name}</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      variant="brand"
                      size="sm"
                      disabled={processingIds.has(order.id)}
                      onClick={() => handleDispatchToKitchen(order)}
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                      icon={<Send className="w-3.5 h-3.5" />}
                    >
                      {processingIds.has(order.id) ? 'Sending...' : 'Send to Kitchen'}
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* COLUMN 2: IN KITCHEN / READY FOR RIDER */}
            <div className="bg-[#12151b] border border-[#1e232e] p-4 rounded-xl space-y-3.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#1e232e]">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-semibold text-white">2. Kitchen & Ready</span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                    {prepOrders.length}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">Prep Status</span>
              </div>

              {prepOrders.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                  <ChefHat className="w-7 h-7 text-sky-400/60 mx-auto" />
                  <p className="text-xs font-semibold text-slate-300">No Orders in Prep</p>
                  <p className="text-[11px] text-slate-500">Dispatched orders appear here with live kitchen status.</p>
                </div>
              ) : (
                prepOrders.map((order) => {
                  const isReady = order.status === 'READY';
                  return (
                    <div
                      key={order.id}
                      className={`p-4 rounded-xl bg-white/[0.03] border space-y-3 ${
                        isReady ? 'border-emerald-500/40' : 'border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-base">#{order.id.slice(-4)}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                            isReady
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-emerald-400 text-sm">{formatCurrency(order.totalAmount)}</span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                        {order.kitchenStatus && (
                          <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-slate-300 inline-flex items-center gap-1">
                            <ChefHat className="w-3 h-3 text-amber-400" /> Kitchen: {order.kitchenStatus}
                          </span>
                        )}
                        {order.barStatus && (
                          <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-slate-300 inline-flex items-center gap-1">
                            <Wine className="w-3 h-3 text-sky-400" /> Bar: {order.barStatus}
                          </span>
                        )}
                        {order.hookahStatus && (
                          <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-slate-300 inline-flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-400" /> Hookah: {order.hookahStatus}
                          </span>
                        )}
                      </div>

                      {renderCustomerLocationBlock(order)}

                      <Button
                        variant="brand"
                        size="sm"
                        disabled={processingIds.has(order.id)}
                        onClick={() => handleOutForDelivery(order)}
                        className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold"
                        icon={<Truck className="w-3.5 h-3.5" />}
                      >
                        {processingIds.has(order.id) ? 'Updating...' : 'Out for Delivery'}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>

            {/* COLUMN 3: OUT FOR DELIVERY (LIVE GPS TRACKING) */}
            <div className="bg-[#12151b] border border-[#1e232e] p-4 rounded-xl space-y-3.5">
              <div className="flex items-center justify-between pb-2.5 border-b border-[#1e232e]">
                <div className="flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-white">3. Out for Delivery</span>
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {outForDeliveryOrders.length}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">Live GPS</span>
              </div>

              {outForDeliveryOrders.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
                  <Navigation className="w-7 h-7 text-emerald-400/60 mx-auto" />
                  <p className="text-xs font-semibold text-slate-300">No Active Riders Out</p>
                  <p className="text-[11px] text-slate-500">Orders out for delivery show customer live GPS pins here.</p>
                </div>
              ) : (
                outForDeliveryOrders.map((order) => (
                  <div key={order.id} className="p-4 rounded-xl bg-white/[0.03] border border-emerald-500/35 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-emerald-400 text-base">#{order.id.slice(-4)}</span>
                      <span className="font-mono font-bold text-white text-sm">{formatCurrency(order.totalAmount)}</span>
                    </div>

                    {renderCustomerLocationBlock(order)}

                    <Button
                      variant="brand"
                      size="sm"
                      disabled={processingIds.has(order.id)}
                      onClick={() => handleMarkDelivered(order)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                      icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                    >
                      {processingIds.has(order.id) ? 'Completing...' : 'Mark Delivered'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#12151b] border border-[#1e232e] p-5 rounded-xl space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Completed Deliveries ({completedOrders.length})
            </h3>
            {completedOrders.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No completed delivery orders yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {completedOrders.map((order) => (
                  <div key={order.id} className="p-3.5 rounded-xl bg-[#0b0d11] border border-white/[0.08] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-emerald-400">#{order.id.slice(-4)}</span>
                      <span className="font-mono text-white font-semibold">{formatCurrency(order.totalAmount)}</span>
                    </div>
                    <p className="font-semibold text-white">{order.customerName}</p>
                    <p className="text-slate-400 truncate">{order.deliveryMeta?.deliveryAddress || 'Delivered'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
