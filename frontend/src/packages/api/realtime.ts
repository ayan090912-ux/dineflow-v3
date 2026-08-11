// Real-Time Event Bus & WebSocket Synchronization for Dinely Cloud
// Supports cross-tab BroadcastChannel and internal listener subscriptions

export type RealTimeEventType =
  | 'OrderCreated'
  | 'OrderAccepted'
  | 'OrderStarted'
  | 'ETAUpdated'
  | 'TimerPaused'
  | 'TimerResumed'
  | 'OrderReady'
  | 'OrderDelivered'
  | 'OrderCompleted'
  | 'WaiterCalled'
  | 'BillRequested'
  | 'CustomerRequestCreated'
  | 'CustomerRequestAccepted'
  | 'CustomerRequestUpdated'
  | 'CustomerRequestCompleted'
  | 'BroadcastMessage'
  | 'TableStatusChanged'
  | 'TableMerged'
  | 'TableUnmerged'
  | 'TableReserved';

export interface RealTimeEventPayload {
  type: RealTimeEventType;
  orderId?: string;
  restaurantId?: string;
  tableNumber?: string;
  tableId?: string;
  tableIds?: string[];
  table?: any;
  groupLabel?: string;
  estimatedPrepTimeMinutes?: number;
  etaTargetTimestamp?: string;
  reason?: string;
  timestamp: string;
  actor?: string;
  data?: any;
}

type EventListener = (event: RealTimeEventPayload) => void;

class RealTimeEventBus {
  private listeners: Set<EventListener> = new Set();
  private channel: BroadcastChannel | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('dinely_realtime_eta_channel');
        this.channel.onmessage = (e) => {
          if (e.data && e.data.type) {
            this.notifyListeners(e.data, false);
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel initialization failed, falling back to local bus:', err);
      }
    }
  }

  public subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public emit(type: RealTimeEventType, payload: Partial<RealTimeEventPayload>): RealTimeEventPayload {
    const fullPayload: RealTimeEventPayload = {
      type,
      timestamp: new Date().toISOString(),
      actor: payload.actor || 'Kitchen Staff',
      ...payload,
    };

    // Notify local subscribers
    this.notifyListeners(fullPayload, true);

    // Broadcast across browser tabs via BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(fullPayload);
      } catch (err) {
        console.warn('Failed to broadcast event via BroadcastChannel:', err);
      }
    }

    return fullPayload;
  }

  public publish(type: RealTimeEventType, payload: Partial<RealTimeEventPayload>): RealTimeEventPayload {
    return this.emit(type, payload);
  }

  private notifyListeners(event: RealTimeEventPayload, isLocal: boolean) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in realtime listener:', err);
      }
    });
  }
}

export const realtimeBus = new RealTimeEventBus();
