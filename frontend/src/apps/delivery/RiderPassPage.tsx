import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Truck, MapPin, Phone, Navigation, CheckCircle2, QrCode, Loader2, Receipt } from 'lucide-react';
import { Order, Restaurant } from '../../packages/types';
import { api } from '../../packages/api/client';
import { formatCurrency } from '../../packages/utils/currency';
import { getTenantFromHostname } from '../../packages/utils/tenantResolver';
import { DinelyLogo } from '../../packages/ui';

export const RiderPassPage: React.FC<{ restaurant?: Restaurant | null }> = ({ restaurant: propRest }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(propRest || null);
  const [billingConfig, setBillingConfig] = useState<{ upiId?: string; upiMerchantName?: string; upiQrUrl?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  const handleMarkPaymentReceived = async (method: 'CASH' | 'UPI') => {
    if (!order || isMarkingPaid) return;
    setIsMarkingPaid(true);
    try {
      const updated = await api.markRiderPaymentReceived(order.id, method);
      if (updated) {
        setOrder(updated);
      } else {
        setOrder({
          ...order,
          paymentStatus: 'PAID',
          status: 'DELIVERED',
          deliveryMeta: { ...(order.deliveryMeta || {}), paymentMethod: method, collectedByRider: true },
        });
      }
    } finally {
      setIsMarkingPaid(false);
    }
  };

  useEffect(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const orderId = params?.get('orderId') || params?.get('id') || '';
    if (!orderId) {
      setError('Missing order ID in rider pass link.');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const ord = await api.getOrderById(orderId);
        if (!ord) {
          setError('Order not found.');
          setLoading(false);
          return;
        }
        setOrder(ord);
        if (ord.restaurantId) {
          const [list, bCfg] = await Promise.all([
            !restaurant ? api.getRestaurants().catch(() => []) : Promise.resolve([]),
            api.getBillingConfig(ord.restaurantId).catch(() => null),
          ]);
          if (bCfg) setBillingConfig(bCfg);
          if (!restaurant && Array.isArray(list)) {
            const domainInfo = getTenantFromHostname();
            const match = list.find((r) => r.id === ord.restaurantId || (domainInfo.slug && r.slug === domainInfo.slug));
            if (match) setRestaurant(match);
          }
        }
      } catch (err: any) {
        setError(err?.message || 'Unable to load delivery pass.');
      } finally {
        setLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0c10] text-white flex flex-col items-center justify-center p-6 gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
        <p className="text-xs text-slate-400 font-mono">Loading Rider Delivery Pass...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#0a0c10] text-white flex flex-col items-center justify-center p-6 text-center gap-3">
        <DinelyLogo size="md" />
        <h1 className="text-base font-bold text-white">Delivery Pass Unavailable</h1>
        <p className="text-xs text-slate-400 max-w-xs">{error || 'Order could not be loaded.'}</p>
      </div>
    );
  }

  const meta = order.deliveryMeta || {};
  const phone = meta.customerPhone || order.customerPhone;
  const hasCoords = typeof meta.latitude === 'number' && typeof meta.longitude === 'number';
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${meta.latitude},${meta.longitude}`
    : meta.deliveryAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(meta.deliveryAddress)}`
    : null;

  const upiId = (billingConfig?.upiId || restaurant?.upiId || '').trim();
  const activeQrUrl = billingConfig?.upiQrUrl || restaurant?.upiQrUrl || '';
  const merchantName = billingConfig?.upiMerchantName || restaurant?.upiMerchantName || restaurant?.name || 'Dinely Merchant';
  const upiUri = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${order.totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Order #${order.id.slice(-4)}`)}`
    : null;

  return (
    <div className="min-h-screen bg-[#0a0c10] text-slate-100 p-4 sm:p-6 flex items-start justify-center">
      <div className="w-full max-w-md bg-[#12151b] border border-white/10 rounded-2xl p-5 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">{restaurant?.name || 'Delivery Pass'}</h1>
              <p className="text-[11px] font-mono text-emerald-400">Order #{order.id.slice(-4)} · {order.status.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold">
            {formatCurrency(order.totalAmount)}
          </span>
        </div>

        {/* Customer & GPS */}
        <div className="p-3.5 rounded-xl bg-[#0b0d11] border border-white/[0.08] space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-white text-sm">{order.customerName || 'Customer'}</span>
            {phone && (
              <a
                href={`tel:${phone}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-semibold"
              >
                <Phone className="w-3 h-3" />
                <span>Call {phone}</span>
              </a>
            )}
          </div>

          <div className="flex items-start gap-2 text-slate-300">
            <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="leading-snug">{meta.deliveryAddress || 'GPS Pin Shared'}</p>
              {meta.landmark && <p className="text-[11px] text-slate-400 mt-0.5">Landmark: {meta.landmark}</p>}
              {typeof meta.distanceKm === 'number' && (
                <p className="text-[11px] text-amber-300 font-mono mt-0.5">Distance: {meta.distanceKm.toFixed(1)} km</p>
              )}
            </div>
          </div>

          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Navigate in Google Maps</span>
            </a>
          )}
        </div>

        {/* Order Items & Amount */}
        <div className="p-3.5 rounded-xl bg-[#0b0d11] border border-white/[0.08] space-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold border-b border-white/[0.06] pb-2">
            <Receipt className="w-3.5 h-3.5 text-amber-400" />
            <span>Order Items ({order.items?.length || 0})</span>
          </div>
          <div className="space-y-1.5">
            {(order.items || []).map((it) => (
              <div key={it.id} className="flex justify-between text-slate-200">
                <span><strong className="text-amber-400 font-mono">{it.quantity}x</strong> {it.name}</span>
                <span className="font-mono text-slate-300">{formatCurrency((it.price || 0) * (it.quantity || 1))}</span>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-white/[0.08] space-y-1 font-mono">
            {typeof meta.deliveryFee === 'number' && (
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Delivery Fee</span>
                <span>{meta.deliveryFee === 0 ? 'FREE' : formatCurrency(meta.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-white font-bold text-sm">
              <span>Amount to Collect</span>
              <span className="text-emerald-400">{formatCurrency(order.totalAmount)}</span>
            </div>
          </div>
        </div>

        {/* Payment QR Code */}
        <div className="p-4 rounded-xl bg-white text-slate-900 flex flex-col items-center text-center space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <QrCode className="w-4 h-4 text-emerald-600" />
            <span>Scan to Pay {formatCurrency(order.totalAmount)}</span>
          </div>

          {activeQrUrl ? (
            <img
              src={activeQrUrl}
              alt="Restaurant Payment QR"
              className="w-48 h-48 object-contain rounded-lg border border-slate-200"
            />
          ) : upiUri ? (
            <QRCodeSVG value={upiUri} size={184} level="M" includeMargin={true} />
          ) : (
            <div className="py-6 px-4 rounded-lg bg-slate-100 text-slate-600 text-xs">
              Collect {formatCurrency(order.totalAmount)} via Cash / Restaurant UPI
            </div>
          )}

          {upiId && (
            <p className="text-[11px] font-mono text-slate-600">UPI ID: {upiId}</p>
          )}
          {order.paymentStatus === 'PAID' ? (
            <div className="w-full py-2.5 px-3 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>
                Payment Received{order.deliveryMeta?.paymentMethod ? ` (${order.deliveryMeta.paymentMethod})` : ''} · Delivered
              </span>
            </div>
          ) : (
            <div className="w-full pt-2 space-y-2">
              <p className="text-[11px] font-semibold text-slate-600">
                Tap after collecting {formatCurrency(order.totalAmount)} from customer:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isMarkingPaid}
                  onClick={() => handleMarkPaymentReceived('CASH')}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isMarkingPaid ? 'Saving...' : 'Cash Received'}</span>
                </button>
                <button
                  type="button"
                  disabled={isMarkingPaid}
                  onClick={() => handleMarkPaymentReceived('UPI')}
                  className="py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isMarkingPaid ? 'Saving...' : 'UPI Received'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
