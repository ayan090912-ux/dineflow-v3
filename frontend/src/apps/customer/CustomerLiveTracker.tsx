import React, { useState, useEffect } from 'react';
import { Clock, Flame, CheckCircle2, Sparkles, ChefHat, BellRing } from 'lucide-react';
import { Badge, Card } from '../../packages/ui';
import { Order } from '../../packages/types';
import { realtimeBus, RealTimeEventPayload } from '../../packages/api/realtime';
import { formatCurrency } from '../../packages/utils/currency';

interface CustomerLiveTrackerProps {
  order: Order;
  onUpdateOrder?: (updated: Order) => void;
}

export const CustomerLiveTracker: React.FC<CustomerLiveTrackerProps> = ({ order, onUpdateOrder }) => {
  const [currentOrder, setCurrentOrder] = useState<Order>(order);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [etaMessage, setEtaMessage] = useState<string>('We are preparing your food.');

  // Sync prop changes
  useEffect(() => {
    setCurrentOrder(order);
  }, [order]);

  // Listen to Real-Time Bus events for instant updates
  useEffect(() => {
    const unsubscribe = realtimeBus.subscribe((event: RealTimeEventPayload) => {
      if (event.orderId === currentOrder.id && event.data) {
        setCurrentOrder(event.data);
        if (onUpdateOrder) {
          onUpdateOrder(event.data);
        }
      }
    });
    return () => unsubscribe();
  }, [currentOrder.id, onUpdateOrder]);

  // Live Second-by-Second Countdown Timer
  useEffect(() => {
    const calculateSecondsLeft = () => {
      if (!currentOrder.etaTargetTimestamp || currentOrder.isTimerPaused) {
        return;
      }
      const target = new Date(currentOrder.etaTargetTimestamp).getTime();
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((target - now) / 1000));
      setRemainingSeconds(diffSec);

      // Dynamic Status Message based on ETA remaining and status
      if (currentOrder.status === 'READY') {
        setEtaMessage('Your order is ready! Your waiter is bringing your food.');
      } else if (currentOrder.status === 'DELIVERED') {
        setEtaMessage('Order served. Bon appétit!');
      } else if (diffSec <= 180 && diffSec > 0) {
        setEtaMessage('Almost ready! Plating final garnishes.');
      } else if (diffSec === 0 && currentOrder.status === 'IN_KITCHEN') {
        setEtaMessage('Chef is adding final finishing touches...');
      } else {
        setEtaMessage("We're preparing your food with care.");
      }
    };

    calculateSecondsLeft();
    const interval = setInterval(calculateSecondsLeft, 1000);
    return () => clearInterval(interval);
  }, [currentOrder.etaTargetTimestamp, currentOrder.isTimerPaused, currentOrder.status]);

  // Format seconds to mm:ss
  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const minutesRemaining = Math.ceil(remainingSeconds / 60);

  // Stepper state determination
  const isReceived = true; // Always true if order exists
  const isCooking = currentOrder.status === 'IN_KITCHEN' || currentOrder.status === 'READY' || currentOrder.status === 'DELIVERED';
  const isPreparing = currentOrder.status === 'IN_KITCHEN' && remainingSeconds <= 300;
  const isReady = currentOrder.status === 'READY' || currentOrder.status === 'DELIVERED';
  const isDelivered = currentOrder.status === 'DELIVERED';

  return (
    <Card className="p-5 m-4 bg-gradient-to-br from-slate-950 via-slate-900 to-rose-950/60 border border-rose-500/40 shadow-2xl rounded-3xl space-y-5 relative overflow-hidden">
      {/* Background Decorative Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-3xl rounded-full pointer-events-none" />

      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
          </span>
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-1.5">
              Order #{currentOrder.id} <span className="text-xs text-rose-400 font-normal">({currentOrder.tableNumber})</span>
            </h3>
            <p className="text-[11px] text-slate-400">Live Kitchen Synchronization</p>
          </div>
        </div>

        <Badge
          variant={
            currentOrder.status === 'DELIVERED'
              ? 'success'
              : currentOrder.status === 'READY'
              ? 'brand'
              : currentOrder.status === 'IN_KITCHEN'
              ? 'warning'
              : 'info'
          }
          className="px-3 py-1 text-xs font-bold uppercase tracking-wider"
        >
          {currentOrder.status.replace('_', ' ')}
        </Badge>
      </div>

      {/* Main Countdown Timer Display */}
      {currentOrder.status !== 'DELIVERED' && (
        <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center space-y-1 relative">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-rose-400" /> Estimated Time Remaining
          </span>

          <div className="font-mono text-4xl font-black text-white tracking-widest my-1 flex items-baseline justify-center gap-2">
            <span className="text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.3)]">
              {formatCountdown(remainingSeconds)}
            </span>
            <span className="text-xs text-slate-400 font-sans font-normal">
              (~{minutesRemaining} {minutesRemaining === 1 ? 'min' : 'mins'})
            </span>
          </div>

          <p className="text-xs text-slate-300 font-medium italic animate-pulse">
            "{etaMessage}"
          </p>

          {currentOrder.isTimerPaused && (
            <Badge variant="warning" className="mt-2 text-[10px]">
              ⏸️ Timer Paused by Kitchen
            </Badge>
          )}
        </div>
      )}

      {/* Dual Station Badges */}
      {(currentOrder.kitchenStatus || currentOrder.barStatus) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {currentOrder.kitchenStatus && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 shadow-sm">
              <span>🍳 Kitchen:</span>
              <strong className="text-white font-mono uppercase">{currentOrder.kitchenStatus.replace('_', ' ')}</strong>
            </span>
          )}
          {currentOrder.barStatus && (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 shadow-sm">
              <span>🍸 Bar:</span>
              <strong className="text-white font-mono uppercase">{currentOrder.barStatus.replace('_', ' ')}</strong>
            </span>
          )}
        </div>
      )}

      {/* Progress Stepper Bar */}
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Order Progress</p>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {/* Step 1: Order Received */}
          <div className="space-y-1">
            <div className={`h-2 rounded-full transition-all ${isReceived ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-slate-800'}`} />
            <span className={`text-[10px] font-bold block ${isReceived ? 'text-emerald-400' : 'text-slate-500'}`}>
              Received {isReceived && '✓'}
            </span>
          </div>

          {/* Step 2: Cooking */}
          <div className="space-y-1">
            <div className={`h-2 rounded-full transition-all ${isCooking ? 'bg-amber-500 shadow-md shadow-amber-500/30' : 'bg-slate-800'}`} />
            <span className={`text-[10px] font-bold block ${isCooking ? 'text-amber-400' : 'text-slate-500'}`}>
              Cooking {isCooking && '✓'}
            </span>
          </div>

          {/* Step 3: Preparing / Plating */}
          <div className="space-y-1">
            <div className={`h-2 rounded-full transition-all ${isReady ? 'bg-rose-500 shadow-md shadow-rose-500/30' : isPreparing ? 'bg-rose-500/60 animate-pulse' : 'bg-slate-800'}`} />
            <span className={`text-[10px] font-bold block ${isReady ? 'text-rose-400' : isPreparing ? 'text-rose-300' : 'text-slate-500'}`}>
              Ready {isReady && '✓'}
            </span>
          </div>

          {/* Step 4: Delivered */}
          <div className="space-y-1">
            <div className={`h-2 rounded-full transition-all ${isDelivered ? 'bg-emerald-400 shadow-md shadow-emerald-400/30' : 'bg-slate-800'}`} />
            <span className={`text-[10px] font-bold block ${isDelivered ? 'text-emerald-400' : 'text-slate-500'}`}>
              Delivered {isDelivered && '✓'}
            </span>
          </div>
        </div>
      </div>

      {/* Items Summary in Tracker */}
      <div className="border-t border-slate-800/80 pt-3 space-y-1.5">
        <div className="flex justify-between items-center text-xs text-slate-400">
          <span>Items Ordered ({currentOrder.items.length})</span>
          <span className="font-mono font-bold text-slate-200">{formatCurrency(currentOrder.totalAmount)}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {currentOrder.items.map((i) => (
            <Badge key={i.id} variant="outline" className="text-[10px] py-0.5 px-2 bg-slate-900 border-slate-800 text-slate-300">
              {i.quantity}x {i.name}
            </Badge>
          ))}
        </div>
      </div>
    </Card>
  );
};
