import React, { useState, useEffect } from 'react';
import { Clock, CheckCircle2, ChefHat, BellRing, Utensils, Wine } from 'lucide-react';
import { Badge } from '../../packages/ui';
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
  const [etaMessage, setEtaMessage] = useState<string>('Preparing your order with care.');

  // Sync prop changes
  useEffect(() => {
    setCurrentOrder(order);
  }, [order]);

  // Listen to Real-Time Bus events for instant updates
  useEffect(() => {
    const unsubscribe = realtimeBus.subscribe((event: RealTimeEventPayload) => {
      const p = (event as any).payload || (event as any).data || event;
      const evtOrdId = (event as any).orderId || (event as any).order_id || (event as any).id || p?.id || p?.orderId || p?.order_id || p?.order?.id;
      if (evtOrdId && String(evtOrdId) === String(currentOrder.id)) {
        let newStatus = p.status;
        let newKitchenStatus = p.kitchenStatus || p.kitchen_status;
        let newBarStatus = p.barStatus || p.bar_status;

        if (event.type === 'order_ready' || event.type === 'OrderReady') {
          newStatus = 'READY';
          newKitchenStatus = 'READY';
        } else if (event.type === 'order_delivered' || event.type === 'OrderDelivered') {
          newStatus = 'DELIVERED';
        } else if (event.type === 'order_completed' || event.type === 'OrderCompleted') {
          newStatus = 'COMPLETED';
        }

        setCurrentOrder((prev) => {
          const updated = {
            ...prev,
            ...p,
            status: newStatus || p.status || prev.status,
            kitchenStatus: newKitchenStatus || prev.kitchenStatus,
            barStatus: newBarStatus || prev.barStatus,
            etaTargetTimestamp: p.etaTargetTimestamp || p.eta_target_timestamp || prev.etaTargetTimestamp,
          };
          if (onUpdateOrder) {
            onUpdateOrder(updated);
          }
          return updated;
        });
      }
    });
    return () => unsubscribe();
  }, [currentOrder.id, onUpdateOrder]);

  // Canonical lifecycle flags derived strictly from authoritative backend state
  const isOrderDelivered = currentOrder.status === 'DELIVERED' || currentOrder.status === 'COMPLETED';
  const isOrderReady = isOrderDelivered || currentOrder.status === 'READY' || currentOrder.kitchenStatus === 'READY' || currentOrder.barStatus === 'READY';
  const isOrderPreparing = isOrderReady || currentOrder.status === 'PREPARING' || currentOrder.status === 'IN_KITCHEN' || currentOrder.kitchenStatus === 'PREPARING' || currentOrder.barStatus === 'PREPARING';
  const isOrderReceived = true;

  // Live countdown timer derived strictly from server state
  useEffect(() => {
    const calculateSecondsLeft = () => {
      if (currentOrder.status === 'PENDING' && !currentOrder.etaTargetTimestamp) {
        setRemainingSeconds(0);
        setEtaMessage('Order received • Queued for kitchen preparation');
        return;
      }

      let target: number;
      if (currentOrder.etaTargetTimestamp) {
        target = new Date(currentOrder.etaTargetTimestamp).getTime();
      } else {
        const created = new Date(currentOrder.createdAt || Date.now()).getTime();
        const prepMins = currentOrder.estimatedPrepTimeMinutes || 15;
        target = created + prepMins * 60000;
      }
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((target - now) / 1000));
      setRemainingSeconds(diffSec);

      if (isOrderDelivered) {
        setEtaMessage('Served at your table • Enjoy your meal!');
      } else if (isOrderReady) {
        setEtaMessage('Plated & ready • Floor staff is bringing your order.');
      } else if (isOrderPreparing) {
        if (diffSec <= 180 && diffSec > 0) {
          setEtaMessage('Final plating & garnishes in progress.');
        } else if (diffSec === 0) {
          setEtaMessage('Chef is adding final touches...');
        } else {
          setEtaMessage('Active preparation in progress by kitchen & bar staff.');
        }
      } else {
        setEtaMessage('Order transmitted • Preparing to cook.');
      }
    };

    calculateSecondsLeft();
    const interval = setInterval(calculateSecondsLeft, 1000);
    return () => clearInterval(interval);
  }, [currentOrder.etaTargetTimestamp, currentOrder.isTimerPaused, currentOrder.status, currentOrder.kitchenStatus, isOrderDelivered, isOrderReady, isOrderPreparing]);

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const minutesRemaining = Math.ceil(remainingSeconds / 60);
  const isPendingServerAcceptance = currentOrder.status === 'PENDING' && !currentOrder.etaTargetTimestamp;

  return (
    <div className="p-5 m-4 bg-[#12151b] border border-white/[0.08] rounded-2xl space-y-4 shadow-sm">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <div>
            <h3 className="text-xs font-semibold text-white font-mono flex items-center gap-1.5">
              <span>Order #{currentOrder.id.slice(-4)}</span>
              <span className="text-white/40 font-normal">
                ({currentOrder.tableNumber?.startsWith('Table') ? currentOrder.tableNumber : `Table ${currentOrder.tableNumber}`})
              </span>
            </h3>
            <p className="text-[10px] text-white/40 font-mono">Live kitchen synchronization</p>
          </div>
        </div>

        <span className="text-[10px] uppercase font-mono font-medium px-2 py-0.5 rounded bg-white/[0.04] text-white/70 border border-white/[0.08]">
          {currentOrder.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Main Countdown Timer Display */}
      {currentOrder.status !== 'DELIVERED' && (
        <div className="p-4 bg-[#0b0d11] rounded-xl border border-white/[0.06] flex flex-col items-center justify-center text-center space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-white/40 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>{isPendingServerAcceptance ? 'Status' : 'Estimated Time'}</span>
          </span>

          {isPendingServerAcceptance ? (
            <div className="py-2 text-center space-y-1">
              <span className="text-sm font-medium text-amber-300 block">
                Order Received • Awaiting Kitchen Acceptance
              </span>
              <span className="text-[11px] text-white/40 font-mono block">
                Countdown timer begins upon ticket confirmation
              </span>
            </div>
          ) : (
            <div className="font-mono text-3xl font-semibold text-white tracking-widest my-1 flex items-baseline justify-center gap-2">
              <span className="text-amber-400">
                {formatCountdown(remainingSeconds)}
              </span>
              <span className="text-xs text-white/40 font-sans font-normal">
                (~{minutesRemaining} {minutesRemaining === 1 ? 'min' : 'mins'})
              </span>
            </div>
          )}

          <p className="text-xs text-white/60 font-medium">
            {etaMessage}
          </p>

          {currentOrder.isTimerPaused && (
            <span className="mt-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
              Timer Paused by Station
            </span>
          )}
        </div>
      )}

      {/* Dual Station Badges */}
      {(currentOrder.kitchenStatus || currentOrder.barStatus) && (
        <div className="flex flex-wrap items-center gap-2">
          {currentOrder.kitchenStatus && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/[0.03] text-white/70 border border-white/[0.06] flex items-center gap-1.5">
              <ChefHat className="w-3.5 h-3.5 text-amber-400" />
              <span>Kitchen: <strong className="text-white uppercase font-normal">{currentOrder.kitchenStatus.replace(/_/g, ' ')}</strong></span>
            </span>
          )}
          {currentOrder.barStatus && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white/[0.03] text-white/70 border border-white/[0.06] flex items-center gap-1.5">
              <Wine className="w-3.5 h-3.5 text-sky-400" />
              <span>Bar: <strong className="text-white uppercase font-normal">{currentOrder.barStatus.replace(/_/g, ' ')}</strong></span>
            </span>
          )}
        </div>
      )}

      {/* Progress Stepper Bar */}
      <div className="space-y-2 pt-1">
        <div className="grid grid-cols-4 gap-2 text-center">
          {/* Step 1: Order Received */}
          <div className="space-y-1">
            <div className={`h-1.5 rounded-full transition-all ${isOrderPreparing ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className={`text-[10px] font-mono block ${isOrderPreparing ? 'text-emerald-400 font-medium' : 'text-white'}`}>
              ✓ Received
            </span>
          </div>

          {/* Step 2: Preparing */}
          <div className="space-y-1">
            <div className={`h-1.5 rounded-full transition-all ${isOrderReady ? 'bg-emerald-400' : isOrderPreparing ? 'bg-amber-400 animate-pulse' : 'bg-white/[0.06]'}`} />
            <span className={`text-[10px] font-mono block ${isOrderReady ? 'text-emerald-400 font-medium' : isOrderPreparing ? 'text-amber-300 font-semibold' : 'text-white/30'}`}>
              {isOrderReady ? '✓ Preparing' : isOrderPreparing ? '● Preparing' : '○ Preparing'}
            </span>
          </div>

          {/* Step 3: Plated & Ready */}
          <div className="space-y-1">
            <div className={`h-1.5 rounded-full transition-all ${isOrderDelivered ? 'bg-emerald-400' : isOrderReady ? 'bg-emerald-400 animate-pulse' : 'bg-white/[0.06]'}`} />
            <span className={`text-[10px] font-mono block ${isOrderDelivered ? 'text-emerald-400 font-medium' : isOrderReady ? 'text-emerald-300 font-bold' : 'text-white/30'}`}>
              {isOrderDelivered ? '✓ Ready' : isOrderReady ? '● Ready' : '○ Ready'}
            </span>
          </div>

          {/* Step 4: Delivered */}
          <div className="space-y-1">
            <div className={`h-1.5 rounded-full transition-all ${isOrderDelivered ? 'bg-emerald-400' : 'bg-white/[0.06]'}`} />
            <span className={`text-[10px] font-mono block ${isOrderDelivered ? 'text-emerald-400 font-bold' : 'text-white/30'}`}>
              {isOrderDelivered ? '✓ Delivered' : '○ Delivered'}
            </span>
          </div>
        </div>
      </div>

      {/* Items Summary in Tracker */}
      <div className="border-t border-white/[0.06] pt-3 space-y-1.5">
        <div className="flex justify-between items-center text-xs text-white/50">
          <span>Items ({currentOrder.items.length})</span>
          <span className="font-mono text-white/80">{formatCurrency(currentOrder.totalAmount)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {currentOrder.items.map((i) => (
            <span key={i.id} className="text-[11px] py-0.5 px-2 rounded bg-white/[0.03] border border-white/[0.06] text-white/70 font-mono">
              {i.quantity}× {i.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
