import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Wine,
  GlassWater,
  Beer,
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Check,
  ChevronRight,
  Flame,
  User,
  LogOut,
  RefreshCw,
  Search,
  Filter,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Activity,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';
import { Button, Card, Badge, Input, Modal, DinelyLogo } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { Order, OrderItem, OrderStatus, getFulfillmentStation } from '../../packages/types';
import { realtimeBus } from '../../packages/api/realtime';

interface BarTerminalProps {
  onLogout?: () => void;
}

export const BarTerminal: React.FC<BarTerminalProps> = ({ onLogout }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastNotification, setLastNotification] = useState<string>('');
  const [selectedOrderForEta, setSelectedOrderForEta] = useState<Order | null>(null);
  const [customEtaInput, setCustomEtaInput] = useState('10');

  useEffect(() => {
    const currentRestId = api.getCurrentRestaurantId() || '';
    if (currentRestId) {
      realtimeBus.connect(currentRestId, 'BAR');
    }

    loadBarOrders(true);
    const pollInterval = setInterval(() => loadBarOrders(false), 30000);

    const handledEventIds = new Set<string>();

    const unsubscribe = realtimeBus.subscribe((event: any) => {
      const evtRestId = event.restaurantId || event.restaurant_id;
      if (evtRestId && currentRestId && String(evtRestId).toLowerCase() !== String(currentRestId).toLowerCase()) {
        return;
      }

      // Ignore updates for other stations if specifically targeted for kitchen only
      if (event.type === 'FulfillmentTicketUpdated' && event.station && event.station !== 'BAR') {
        return;
      }

      if (
        event.type === 'order_created' ||
        event.type === 'OrderCreated' ||
        event.type === 'order_status_updated' ||
        event.type === 'OrderStatusUpdated' ||
        event.type === 'OrderAccepted' ||
        event.type === 'order_ready' ||
        event.type === 'OrderReady' ||
        event.type === 'BarStatusUpdated' ||
        event.type === 'table_session_closed' ||
        event.type === 'TableSessionClosed' ||
        (event.type === 'FulfillmentTicketUpdated' && event.station === 'BAR')
      ) {
        loadBarOrders(false);

        const evtId = event.eventId || event.event_id;
        if (evtId && handledEventIds.has(evtId)) {
          return;
        }
        if (evtId) {
          handledEventIds.add(evtId);
        }

        // Only alert on newly created drink orders
        if (
          event.type === 'order_created' ||
          event.type === 'OrderCreated' ||
          (event.type === 'FulfillmentTicketUpdated' && event.status === 'PENDING' && event.station === 'BAR')
        ) {
          setLastNotification(
            `New Beverage Ticket #${(event.orderId || event.parentOrderId || event.id || '').slice(-4)} for Table ${event.tableNumber || 'Bar'}`
          );
          if (soundEnabled) {
            playNotificationSound();
          }
        }
      } else if (event.type === 'RECONNECTED') {
        loadBarOrders(false);
      }
    });

    const unsubStatus = realtimeBus.subscribeStatus((status) => {
      if (status === 'CONNECTED') {
        loadBarOrders(false);
      }
    });

    return () => {
      clearInterval(pollInterval);
      unsubscribe();
      unsubStatus();
    };
  }, [soundEnabled]);

  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {}
  };

  const loadBarOrders = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const restId = api.getCurrentRestaurantId() || undefined;
      const barTickets = await api.getFulfillmentTickets(restId, 'BAR');
      const allOrders = await api.getOrders(restId);

      const barOrders = allOrders
        .filter((o) => {
          const hasBarTicket = barTickets.some((t) => t.parentOrderId === o.id);
          const hasBarItems = o.items && o.items.some((i) => getFulfillmentStation(i) === 'BAR');
          return hasBarTicket || hasBarItems;
        })
        .map((o) => {
          const ticket = barTickets.find((t) => t.parentOrderId === o.id);
          return {
            ...o,
            barStatus: ticket ? ticket.status : o.barStatus || 'PENDING',
          };
        });

      setOrders(barOrders as any);
    } catch (err) {
      console.error('Failed to load bar orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const stationStatus =
        newStatus === 'READY'
          ? 'READY'
          : newStatus === 'PREPARING' || newStatus === 'PREPARING_DRINKS'
          ? 'PREPARING'
          : 'COMPLETED';
      await api.updateFulfillmentTicketStatus(orderId, stationStatus, 'BAR');
      await api.updateBarStatus(orderId, stationStatus);
      await loadBarOrders(false);
    } catch (err) {
      console.error('Failed to update drink order status:', err);
    }
  };

  const handleAdjustEta = async (orderId: string, deltaMinutes: number) => {
    try {
      const order = orders.find((o) => o.id === orderId);
      const currentEta = order?.estimatedPrepTimeMinutes || 10;
      const newEta = Math.max(1, currentEta + deltaMinutes);
      await api.updateOrderETA(orderId, newEta, `Adjusted by ${deltaMinutes > 0 ? '+' : ''}${deltaMinutes}m`);
      await loadBarOrders();
    } catch (err) {
      console.error('Failed to adjust ETA:', err);
    }
  };

  const handleSaveCustomEta = async () => {
    if (!selectedOrderForEta) return;
    const mins = parseInt(customEtaInput, 10);
    if (isNaN(mins) || mins <= 0) return;
    await api.updateOrderETA(selectedOrderForEta.id, mins, 'Custom Bartender ETA');
    setSelectedOrderForEta(null);
    await loadBarOrders();
  };

  // Divide orders into Bar Pipeline stages based strictly on barStatus
  const pendingOrders = orders.filter(
    (o) =>
      (o.barStatus === 'PENDING' || !o.barStatus) &&
      o.barStatus !== 'PREPARING' &&
      o.barStatus !== 'ACCEPTED' &&
      o.barStatus !== 'READY' &&
      o.barStatus !== 'COMPLETED' &&
      o.status !== 'CANCELLED'
  );
  const preparingOrders = orders.filter(
    (o) => o.barStatus === 'PREPARING' || o.barStatus === 'ACCEPTED'
  );
  const readyOrders = orders.filter((o) => o.barStatus === 'READY');
  const completedOrders = orders.filter((o) => o.barStatus === 'COMPLETED');

  return (
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Banner Notification */}
      {lastNotification && (
        <div className="bg-emerald-950/60 border-b border-emerald-800/40 text-emerald-200 px-6 py-2.5 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{lastNotification}</span>
          </div>
          <button
            onClick={() => setLastNotification('')}
            className="text-emerald-400/60 hover:text-emerald-200 text-xs px-2 py-0.5 rounded transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Bar Terminal Top Navigation Header */}
      <header className="bg-[#0e1117] border-b border-[#1e232e] px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-center text-slate-200">
            <Wine className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <DinelyLogo size="sm" />
              <h1 className="text-base font-semibold text-white tracking-tight">Bar Station</h1>
              <Badge variant="brand">BAR TERMINAL</Badge>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Beverage queue & mixology fulfillment
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Metrics */}
          <div className="hidden md:flex items-center gap-4 px-4 py-2 rounded-xl bg-[#12151b] border border-[#1e232e] text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-slate-400">Queue:</span>
              <strong className="text-white font-semibold">{pendingOrders.length + preparingOrders.length}</strong>
            </div>
            <span className="text-slate-600">/</span>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-400">Ready:</span>
              <strong className="text-emerald-400 font-semibold">{readyOrders.length}</strong>
            </div>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-xl border text-xs transition-colors ${
              soundEnabled
                ? 'border-[#1e232e] bg-[#12151b] text-slate-200 hover:text-white'
                : 'border-[#1e232e] bg-[#12151b] text-slate-500 hover:text-slate-300'
            }`}
            title={soundEnabled ? 'Mute alert chime' : 'Enable alert chime'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={() => loadBarOrders()}
            className="p-2.5 rounded-xl border border-[#1e232e] bg-[#12151b] text-slate-300 hover:text-white transition-colors"
            title="Refresh order queue"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={async () => {
              await api.logout();
              if (onLogout) onLogout();
              else window.location.href = '/bar/login';
            }}
            className="px-3 py-2 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/10 text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Operational Summary Bar */}
      {(() => {
        const received = pendingOrders.length;
        const preparing = preparingOrders.length;
        const ready = readyOrders.length;
        const completed = completedOrders.length;

        return (
          <div className="bg-[#0e1117] border-b border-[#1e232e] px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <span className="text-slate-400 uppercase text-[11px] tracking-wider flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Shift Metrics</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-[#12151b] border border-[#1e232e] text-slate-300">
                Incoming: <strong className="text-amber-400 font-semibold">{received}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#12151b] border border-[#1e232e] text-slate-300">
                Mixology: <strong className="text-sky-400 font-semibold">{preparing}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#12151b] border border-[#1e232e] text-slate-300">
                At Pass: <strong className="text-emerald-400 font-semibold">{ready}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#12151b] border border-[#1e232e] text-slate-400">
                Dispatched: <strong className="text-slate-200 font-semibold">{completed}</strong>
              </span>
            </div>
          </div>
        );
      })()}

      {/* Main Bar Preparation KanBan Pipeline */}
      <main className="flex-1 p-6 overflow-x-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 min-w-[1100px]">
          {/* COLUMN 1: INCOMING DRINK ORDERS */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-medium text-xs">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>1. Incoming Queue</span>
              </div>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/25">
                {pendingOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {pendingOrders.map((ord) => (
                <BarOrderCard
                  key={ord.id}
                  order={ord}
                  actionLabel="Start Prep"
                  actionVariant="primary"
                  onAction={() => handleUpdateStatus(ord.id, 'PREPARING')}
                  onAdjustEta={(delta) => handleAdjustEta(ord.id, delta)}
                  onCustomEta={() => setSelectedOrderForEta(ord)}
                />
              ))}
              {pendingOrders.length === 0 && (
                <div className="p-8 text-center bg-[#12151b]/40 border border-dashed border-[#1e232e] rounded-xl text-slate-500 text-xs">
                  No pending beverage tickets
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 2: PREPARING DRINKS */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-medium text-xs">
                <Wine className="w-3.5 h-3.5 text-sky-400" />
                <span>2. Mixology & Pouring</span>
              </div>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/25">
                {preparingOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {preparingOrders.map((ord) => (
                <BarOrderCard
                  key={ord.id}
                  order={ord}
                  actionLabel="Mark as Ready"
                  actionVariant="success"
                  onAction={() => handleUpdateStatus(ord.id, 'READY')}
                  onAdjustEta={(delta) => handleAdjustEta(ord.id, delta)}
                  onCustomEta={() => setSelectedOrderForEta(ord)}
                />
              ))}
              {preparingOrders.length === 0 && (
                <div className="p-8 text-center bg-[#12151b]/40 border border-dashed border-[#1e232e] rounded-xl text-slate-500 text-xs">
                  No drinks currently in preparation
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 3: READY FOR PICKUP */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-medium text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>3. Ready at Bar Pass</span>
              </div>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                {readyOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {readyOrders.map((ord) => (
                <BarOrderCard
                  key={ord.id}
                  order={ord}
                  actionLabel="Hand Over to Floor"
                  actionVariant="neutral"
                  onAction={() => handleUpdateStatus(ord.id, 'DELIVERED')}
                />
              ))}
              {readyOrders.length === 0 && (
                <div className="p-8 text-center bg-[#12151b]/40 border border-dashed border-[#1e232e] rounded-xl text-slate-500 text-xs">
                  Pass is clear
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 4: COMPLETED ORDERS */}
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#12151b] border border-[#1e232e] flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300 font-medium text-xs">
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>4. Recent Dispatches</span>
              </div>
              <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-[#181d27] text-slate-300 border border-[#2d3545]">
                {completedOrders.length}
              </span>
            </div>

            <div className="space-y-3">
              {completedOrders.slice(0, 5).map((ord) => (
                <BarOrderCard key={ord.id} order={ord} isCompleted />
              ))}
              {completedOrders.length === 0 && (
                <div className="p-8 text-center bg-[#12151b]/40 border border-dashed border-[#1e232e] rounded-xl text-slate-500 text-xs">
                  No completed orders yet
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* CUSTOM ETA MODAL */}
      <Modal
        isOpen={!!selectedOrderForEta}
        onClose={() => setSelectedOrderForEta(null)}
        title={`Set Beverage Prep Time • Table ${selectedOrderForEta?.tableNumber}`}
      >
        <div className="space-y-4 text-xs">
          <Input
            label="Estimated Prep Duration (Minutes)"
            type="number"
            value={customEtaInput}
            onChange={(e) => setCustomEtaInput(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedOrderForEta(null)}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" onClick={handleSaveCustomEta} className="font-medium">
              Save Duration
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Bar Order Card Component
const BarOrderCard: React.FC<{
  order: Order;
  actionLabel?: string;
  actionVariant?: 'primary' | 'success' | 'neutral';
  onAction?: () => void;
  onAdjustEta?: (deltaMinutes: number) => void;
  onCustomEta?: () => void;
  isCompleted?: boolean;
}> = ({ order, actionLabel, actionVariant = 'primary', onAction, onAdjustEta, onCustomEta, isCompleted }) => {
  const drinkItems = order.items.filter((i) => getFulfillmentStation(i) === 'BAR');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <div className={`p-4 rounded-xl bg-[#12151b] border ${isCompleted ? 'border-[#1e232e]/60 opacity-60' : 'border-[#1e232e] hover:border-[#2d3545]'} transition-colors space-y-3 shadow-xs`}>
        {/* Header Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#181d27] text-slate-200 border border-[#2d3545] text-xs font-mono font-medium">
              Table {order.tableNumber}
            </span>
            <span className="text-[11px] font-mono text-slate-400">#{order.id.slice(-4)}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
            <Clock className="w-3 h-3 text-emerald-400" />
            <span>{order.estimatedPrepTimeMinutes || 10}m ETA</span>
          </div>
        </div>

        {order.customerName && (
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <User className="w-3 h-3 text-slate-500" />
            <span>{order.customerName}</span>
          </div>
        )}

        {/* Drink Items List */}
        <div className="space-y-2 py-2 border-y border-[#1e232e]">
          {drinkItems.map((item, idx) => (
            <div key={idx} className="flex items-start justify-between gap-2 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono font-bold text-white text-xs">{item.quantity}x</span>
                  <span className="font-medium text-slate-200">{item.name}</span>
                </div>
                {item.glassSize && (
                  <span className="text-[10px] font-mono text-slate-400 block">
                    Serving: {item.glassSize} {item.alcoholPercentage ? `• ${item.alcoholPercentage}% ABV` : ''}
                  </span>
                )}
                {item.notes && (
                  <span className="text-[10px] text-amber-300 italic block">
                    Note: "{item.notes}"
                  </span>
                )}
              </div>
              <span className="font-mono text-slate-400 text-[11px] shrink-0">
                ₹{(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* ETA Adjustment Buttons */}
        {!isCompleted && onAdjustEta && (
          <div className="flex items-center justify-between gap-2 text-[10px] font-mono bg-[#0e1117] px-2 py-1 rounded-lg border border-[#1e232e]">
            <span className="text-slate-400">Adjust prep:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onAdjustEta(-5)}
                className="px-1.5 py-0.5 rounded bg-[#181d27] text-slate-300 hover:text-white hover:bg-[#222838] border border-[#2d3545] transition-colors"
                title="Minus 5 minutes"
              >
                -5m
              </button>
              <button
                onClick={() => onAdjustEta(5)}
                className="px-1.5 py-0.5 rounded bg-[#181d27] text-slate-300 hover:text-white hover:bg-[#222838] border border-[#2d3545] transition-colors"
                title="Plus 5 minutes"
              >
                +5m
              </button>
              {onCustomEta && (
                <button
                  onClick={onCustomEta}
                  className="px-1.5 py-0.5 rounded bg-[#181d27] text-emerald-400 border border-[#2d3545] hover:bg-[#222838] transition-colors"
                >
                  Custom
                </button>
              )}
            </div>
          </div>
        )}

        {/* Special Instructions */}
        {order.specialInstructions && (
          <div className="text-xs bg-rose-500/10 text-rose-300 p-2 rounded-lg border border-rose-500/20 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400 mt-0.5" />
            <span>Note: {order.specialInstructions}</span>
          </div>
        )}

        {/* Primary Action Button */}
        {!isCompleted && onAction && actionLabel && (
          <button
            onClick={onAction}
            className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
              actionVariant === 'primary' || actionVariant === 'success'
                ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-xs'
                : 'bg-[#181d27] text-white hover:bg-[#222838] border border-[#2d3545]'
            }`}
          >
            <span>{actionLabel}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </motion.div>
  );
};

