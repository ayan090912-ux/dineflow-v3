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
} from 'lucide-react';
import { Button, Card, Badge, Input } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { Order, OrderItem, OrderStatus } from '../../packages/types';
import { realtimeBus } from '../../packages/api/realtime';

interface BarTerminalProps {
  onLogout?: () => void;
}

export const BarTerminal: React.FC<BarTerminalProps> = ({ onLogout }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastNotification, setLastNotification] = useState<string>('');

  useEffect(() => {
    loadBarOrders();

    const unsubscribe = realtimeBus.subscribe((event) => {
      if (event.type === 'OrderCreated' || event.type === 'OrderAccepted' || event.type === 'OrderReady') {
        loadBarOrders();
        setLastNotification(`New Drink Activity on ${event.tableNumber || 'Bar'}`);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadBarOrders = async () => {
    setIsLoading(true);
    try {
      const allOrders = await api.getOrders('rest-1');
      // Filter orders destined for BAR or containing alcoholic / drink items
      const barOrders = allOrders.filter(
        (o) =>
          o.targetDestination === 'BAR' ||
          o.items.some((i) => i.targetDestination === 'BAR' || i.isAlcoholic)
      );
      setOrders(barOrders);
    } catch (err) {
      console.error('Failed to load bar orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await api.updateOrderStatus(orderId, newStatus);
      await loadBarOrders();
    } catch (err) {
      console.error('Failed to update drink order status:', err);
    }
  };

  // Divide orders into Bar Pipeline stages
  const pendingOrders = orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED');
  const preparingOrders = orders.filter((o) => o.status === 'PREPARING_DRINKS' || o.status === 'IN_KITCHEN');
  const readyOrders = orders.filter((o) => o.status === 'READY');
  const completedOrders = orders.filter((o) => o.status === 'DELIVERED' || o.status === 'COMPLETED');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white">
      {/* Bar Terminal Top Navigation Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-2xl sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-xl shadow-purple-950/40">
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
              Lumière Bistro & Bar • Cocktail Lounge & Station
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

          {onLogout && (
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="border-rose-900/50 text-rose-300 hover:bg-rose-950/40"
              icon={<LogOut className="w-4 h-4" />}
            >
              Sign Out
            </Button>
          )}
        </div>
      </header>

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
                  onAction={() => handleUpdateStatus(ord.id, 'PREPARING_DRINKS')}
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
    </div>
  );
};

// Bar Order Card Component
const BarOrderCard: React.FC<{
  order: Order;
  actionLabel?: string;
  actionVariant?: 'warning' | 'brand' | 'success';
  onAction?: () => void;
  isCompleted?: boolean;
}> = ({ order, actionLabel, actionVariant = 'brand', onAction, isCompleted }) => {
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
        <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Drink Items List */}
      <div className="space-y-2 py-1 border-y border-slate-800/80">
        {order.items.map((item, idx) => (
          <div key={idx} className="flex items-start justify-between gap-2 text-xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-sm">{item.quantity}x</span>
                <span className="font-bold text-slate-200">{item.name}</span>
              </div>
              {item.glassSize && (
                <span className="text-[10px] font-mono text-purple-400 block">
                  Glass: {item.glassSize} {item.alcoholPercentage ? `• ${item.alcoholPercentage}% ABV` : ''}
                </span>
              )}
              {item.notes && (
                <span className="text-[10px] text-amber-300 italic block">
                  Note: "{item.notes}"
                </span>
              )}
            </div>
            <span className="font-mono font-bold text-emerald-400 text-xs shrink-0">
              ${(item.price * item.quantity).toFixed(2)}
            </span>
          </div>
        ))}
      </div>

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
