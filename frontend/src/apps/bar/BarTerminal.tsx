import React, { useState, useEffect } from 'react';
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
  Sparkles,
  Search,
  Filter,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Activity,
} from 'lucide-react';
import { Button, Card, Badge, Input, Modal } from '../../packages/ui';
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
    loadBarOrders(true);

    const unsubscribe = realtimeBus.subscribe((event: any) => {
      const currentRestId = api.getCurrentRestaurantId();
      if (event.restaurantId && currentRestId && event.restaurantId !== currentRestId) {
        return;
      }

      // Ignore updates for other stations to prevent unnecessary re-fetches
      if (event.type === 'FulfillmentTicketUpdated' && event.station && event.station !== 'BAR') {
        return;
      }

      if (
        event.type === 'OrderCreated' ||
        event.type === 'OrderAccepted' ||
        event.type === 'OrderReady' ||
        event.type === 'BarStatusUpdated' ||
        (event.type === 'FulfillmentTicketUpdated' && event.station === 'BAR')
      ) {
        loadBarOrders(false);

        // Only alert on newly created drink orders
        if (event.type === 'OrderCreated' || (event.type === 'FulfillmentTicketUpdated' && event.status === 'PENDING' && event.station === 'BAR')) {
          setLastNotification(`New Drink Order #${event.orderId || event.parentOrderId || ''} for Table ${event.tableNumber || 'Bar'} 🍸`);
          if (soundEnabled) {
            playNotificationSound();
          }
        }
      }
    });

    return () => unsubscribe();
  }, [soundEnabled]);

  const playNotificationSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3); // A5
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

      setOrders(barOrders);
    } catch (err) {
      console.error('Failed to load bar orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const stationStatus = newStatus === 'READY' ? 'READY' : newStatus === 'PREPARING' || newStatus === 'PREPARING_DRINKS' ? 'PREPARING' : 'COMPLETED';
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
    (o) => (o.barStatus === 'PENDING' || !o.barStatus) && o.barStatus !== 'PREPARING' && o.barStatus !== 'ACCEPTED' && o.barStatus !== 'READY' && o.barStatus !== 'COMPLETED' && o.status !== 'CANCELLED'
  );
  const preparingOrders = orders.filter(
    (o) => o.barStatus === 'PREPARING' || o.barStatus === 'ACCEPTED'
  );
  const readyOrders = orders.filter((o) => o.barStatus === 'READY');
  const completedOrders = orders.filter((o) => o.barStatus === 'COMPLETED');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* Top Banner Notification */}
      {lastNotification && (
        <div className="bg-gradient-to-r from-amber-500 to-purple-600 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between shadow-lg">
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-slate-950 animate-bounce" />
            {lastNotification}
          </span>
          <button onClick={() => setLastNotification('')} className="hover:opacity-80">
            ✕
          </button>
        </div>
      )}

      {/* Bar Terminal Top Navigation Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-2xl sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-600 to-amber-500 text-white shadow-xl shadow-purple-950/40">
            <Wine className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">DineFlow Bar Terminal</h1>
              <Badge variant="brand" className="bg-purple-600/30 text-purple-300 border-purple-500/40 text-[10px]">
                BARTENDER KDS
              </Badge>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Live Mixology Station & Drink Fulfillment Queue
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Metrics Badge */}
          <div className="hidden md:flex items-center gap-4 px-4 py-2 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="text-slate-400">Queue:</span>
              <strong className="text-amber-300">{pendingOrders.length + preparingOrders.length} Drinks</strong>
            </div>
            <span className="text-slate-700">|</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Ready:</span>
              <strong className="text-emerald-400">{readyOrders.length} Orders</strong>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="border-slate-800 text-slate-300"
            title={soundEnabled ? 'Mute Order Audio Alerts' : 'Enable Order Audio Alerts'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadBarOrders}
            className="border-slate-800 text-slate-300 hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await api.logout();
              if (onLogout) onLogout();
              else window.location.href = '/bar/login';
            }}
            className="border-rose-900/50 text-rose-300 hover:bg-rose-950/40"
            icon={<LogOut className="w-4 h-4" />}
          >
            Sign Out
          </Button>
        </div>
      </header>

      {/* BAR TODAY Operational Statistics Bar */}
      {(() => {
        const received = pendingOrders.length;
        const preparing = preparingOrders.length;
        const ready = readyOrders.length;
        const completed = completedOrders.length;

        return (
          <div className="bg-slate-900/90 border-b border-slate-800/80 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <span className="font-bold text-slate-300 font-sans flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
              <Activity className="w-3.5 h-3.5 text-purple-400" /> BAR TODAY STATS:
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-amber-300 bg-amber-950/40 border border-amber-800/50 px-2.5 py-1 rounded-lg">
                <span>Bar Received:</span> <span className="font-black text-amber-400">{received}</span>
              </span>
              <span className="flex items-center gap-1.5 text-purple-300 bg-purple-950/40 border border-purple-800/50 px-2.5 py-1 rounded-lg">
                <span>Preparing:</span> <span className="font-black text-purple-400">{preparing}</span>
              </span>
              <span className="flex items-center gap-1.5 text-emerald-300 bg-emerald-950/40 border border-emerald-800/50 px-2.5 py-1 rounded-lg">
                <span>Ready:</span> <span className="font-black text-emerald-400">{ready}</span>
              </span>
              <span className="flex items-center gap-1.5 text-sky-300 bg-sky-950/40 border border-sky-800/50 px-2.5 py-1 rounded-lg">
                <span>Completed Today:</span> <span className="font-black text-sky-400">{completed}</span>
              </span>
            </div>
          </div>
        );
      })()}

      {/* Main Bar Preparation KanBan Pipeline */}
      <main className="flex-1 p-6 overflow-x-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 min-w-[1100px]">
          {/* COLUMN 1: INCOMING DRINK ORDERS */}
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                <Clock className="w-4 h-4" />
                <span>1. Incoming Drinks</span>
              </div>
              <Badge variant="warning" className="font-mono font-bold text-xs">
                {pendingOrders.length}
              </Badge>
            </div>

            <div className="space-y-3">
              {pendingOrders.map((ord) => (
                <BarOrderCard
                  key={ord.id}
                  order={ord}
                  actionLabel="Start Mixology 🍸"
                  actionVariant="warning"
                  onAction={() => handleUpdateStatus(ord.id, 'PREPARING')}
                  onAdjustEta={(delta) => handleAdjustEta(ord.id, delta)}
                  onCustomEta={() => setSelectedOrderForEta(ord)}
                />
              ))}
              {pendingOrders.length === 0 && (
                <div className="p-8 text-center bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl text-slate-500 text-xs">
                  No incoming drink orders
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 2: PREPARING DRINKS */}
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-indigo-950/40 border border-indigo-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-300 font-bold text-xs uppercase tracking-wider">
                <Wine className="w-4 h-4 animate-spin" />
                <span>2. Mixology & Pouring</span>
              </div>
              <Badge variant="brand" className="font-mono font-bold text-xs">
                {preparingOrders.length}
              </Badge>
            </div>

            <div className="space-y-3">
              {preparingOrders.map((ord) => (
                <BarOrderCard
                  key={ord.id}
                  order={ord}
                  actionLabel="Mark Ready ✨"
                  actionVariant="brand"
                  onAction={() => handleUpdateStatus(ord.id, 'READY')}
                  onAdjustEta={(delta) => handleAdjustEta(ord.id, delta)}
                  onCustomEta={() => setSelectedOrderForEta(ord)}
                />
              ))}
              {preparingOrders.length === 0 && (
                <div className="p-8 text-center bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl text-slate-500 text-xs">
                  No drinks currently being prepared
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 3: READY FOR PICKUP */}
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>3. Ready at Bar Pass</span>
              </div>
              <Badge variant="success" className="font-mono font-bold text-xs">
                {readyOrders.length}
              </Badge>
            </div>

            <div className="space-y-3">
              {readyOrders.map((ord) => (
                <BarOrderCard
                  key={ord.id}
                  order={ord}
                  actionLabel="Delivered to Guest 🍽️"
                  actionVariant="success"
                  onAction={() => handleUpdateStatus(ord.id, 'DELIVERED')}
                />
              ))}
              {readyOrders.length === 0 && (
                <div className="p-8 text-center bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl text-slate-500 text-xs">
                  No drinks waiting at the pass
                </div>
              )}
            </div>
          </div>

          {/* COLUMN 4: COMPLETED ORDERS */}
          <div className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-400 font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>4. Completed Shift Orders</span>
              </div>
              <Badge variant="outline" className="font-mono font-bold text-xs">
                {completedOrders.length}
              </Badge>
            </div>

            <div className="space-y-3">
              {completedOrders.slice(0, 5).map((ord) => (
                <BarOrderCard key={ord.id} order={ord} isCompleted />
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* CUSTOM ETA MODAL */}
      <Modal
        isOpen={!!selectedOrderForEta}
        onClose={() => setSelectedOrderForEta(null)}
        title={`Set Custom Drink Prep ETA for Table ${selectedOrderForEta?.tableNumber}`}
      >
        <div className="space-y-4 text-xs">
          <Input
            label="Estimated Drink Prep Time (Minutes)"
            type="number"
            value={customEtaInput}
            onChange={(e) => setCustomEtaInput(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedOrderForEta(null)}>
              Cancel
            </Button>
            <Button variant="brand" size="sm" onClick={handleSaveCustomEta} className="bg-purple-600 font-bold">
              Update ETA
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
  actionVariant?: 'warning' | 'brand' | 'success';
  onAction?: () => void;
  onAdjustEta?: (deltaMinutes: number) => void;
  onCustomEta?: () => void;
  isCompleted?: boolean;
}> = ({ order, actionLabel, actionVariant = 'brand', onAction, onAdjustEta, onCustomEta, isCompleted }) => {
  const drinkItems = order.items.filter((i) => getFulfillmentStation(i) === 'BAR');

  return (
    <Card className="bg-slate-900 border-slate-800/90 p-4 space-y-3 shadow-xl rounded-2xl relative overflow-hidden group hover:border-slate-700 transition-all">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/40 text-xs font-black">
            📍 {order.tableNumber}
          </span>
          <span className="text-[11px] font-mono text-slate-400">#{order.id.slice(-4)}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
          <Clock className="w-3 h-3" />
          <span>{order.estimatedPrepTimeMinutes || 10}m ETA</span>
        </div>
      </div>

      {order.customerName && (
        <p className="text-[11px] text-slate-300 font-bold flex items-center gap-1">
          <User className="w-3 h-3 text-purple-400" />
          <span>Guest: {order.customerName}</span>
        </p>
      )}

      {/* Drink Items List */}
      <div className="space-y-2 py-1 border-y border-slate-800/80">
        {drinkItems.map((item, idx) => (
          <div key={idx} className="flex items-start justify-between gap-2 text-xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-sm">{item.quantity}x</span>
                <span className="font-bold text-slate-200">{item.name}</span>
              </div>
              {item.glassSize && (
                <span className="text-[10px] font-mono text-purple-300 block">
                  Serving: {item.glassSize} {item.alcoholPercentage ? `• ${item.alcoholPercentage}% ABV` : ''}
                </span>
              )}
              {item.notes && (
                <span className="text-[10px] text-amber-300 italic block">
                  Option/Note: "{item.notes}"
                </span>
              )}
            </div>
            <span className="font-mono font-bold text-emerald-400 text-xs shrink-0">
              ${(item.price * item.quantity).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {/* ETA Adjustment Buttons */}
      {!isCompleted && onAdjustEta && (
        <div className="flex items-center justify-between gap-2 text-[10px] font-mono bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <span className="text-slate-400">Adjust ETA:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onAdjustEta(-5)}
              className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 hover:bg-slate-700 font-bold"
              title="Decrease prep time by 5 minutes"
            >
              -5m
            </button>
            <button
              onClick={() => onAdjustEta(5)}
              className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 hover:bg-slate-700 font-bold"
              title="Increase prep time by 5 minutes"
            >
              +5m
            </button>
            {onCustomEta && (
              <button
                onClick={onCustomEta}
                className="px-2 py-0.5 rounded bg-purple-600/30 text-purple-300 border border-purple-500/40 hover:bg-purple-600/50 font-bold"
              >
                Set
              </button>
            )}
          </div>
        </div>
      )}

      {/* Special Instructions */}
      {order.specialInstructions && (
        <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-amber-300 italic">
          "{order.specialInstructions}"
        </div>
      )}

      {/* Action Button */}
      {!isCompleted && actionLabel && onAction && (
        <Button
          variant={actionVariant}
          size="sm"
          className="w-full py-2.5 text-xs font-bold shadow-md mt-1"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      )}
    </Card>
  );
};
