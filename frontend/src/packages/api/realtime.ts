// Production Real-Time Event Bus & WebSocket Synchronization for Dinely Cloud
// Connects to production FastAPI WebSocket server with event deduplication, scoped channels, and auto-reconnection

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
  | 'BillPaid'
  | 'BillClosed'
  | 'CustomerRequestCreated'
  | 'CustomerRequestAccepted'
  | 'CustomerRequestUpdated'
  | 'CustomerRequestCompleted'
  | 'service_request_created'
  | 'service_request_updated'
  | 'table_session_closed'
  | 'table_status_updated'
  | 'order_created'
  | 'order_ready'
  | 'order_status_updated'
  | 'BroadcastMessage'
  | 'TableStatusChanged'
  | 'TableStatusUpdated'
  | 'TableMerged'
  | 'TableUnmerged'
  | 'TableReserved'
  | 'TableSessionClosed'
  | 'TableCleared'
  | 'BusinessDayClosed'
  | 'BusinessDayOpened'
  | 'RESTAURANT_APPROVED'
  | 'StaffStatusUpdated'
  | 'menu_item_created'
  | 'menu_item_updated'
  | 'menu_item_deleted'
  | 'menu_item_availability_changed'
  | 'MenuItemCreated'
  | 'MenuItemUpdated'
  | 'MenuItemDeleted';


export interface RealTimeEventPayload {
  eventId?: string;
  type: RealTimeEventType | string;
  orderId?: string;
  billId?: string;
  tableSessionId?: string;
  grandTotal?: number;
  paymentMethod?: string;
  parentOrderId?: string;
  ticketId?: string;
  station?: 'KITCHEN' | 'BAR';
  restaurantId?: string;
  restaurantName?: string;
  tableNumber?: string;
  tableId?: string;
  tableIds?: string[];
  table?: any;
  summary?: any;
  groupLabel?: string;
  estimatedPrepTimeMinutes?: number;
  etaTargetTimestamp?: string;
  reason?: string;
  timestamp: string;
  actor?: string;
  barStatus?: string;
  kitchenStatus?: string;
  status?: string;
  sessionId?: string;
  businessDayId?: string;
  employeeId?: string;
  menuItemId?: string;
  name?: string;
  role?: string;
  lastLoginAt?: string;
  data?: any;
  payload?: any;
}

type EventListener = (event: RealTimeEventPayload) => void;

function getWebSocketUrl(restaurantId: string, role: string = 'CUSTOMER', tableSessionId?: string): string {
  let wsProto = 'wss:';
  let host = 'dineflow-v3.onrender.com';

  if (typeof window !== 'undefined') {
    const loc = window.location;
    wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const h = loc.hostname;
    const isDev =
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '0.0.0.0' ||
      /^192\.168\./.test(h) ||
      /^10\./.test(h);

    if (isDev) {
      return `${wsProto}//${h}:8000/api/v1/ws?restaurant_id=${encodeURIComponent(restaurantId)}&role=${encodeURIComponent(role)}${tableSessionId ? `&table_session_id=${encodeURIComponent(tableSessionId)}` : ''}`;
    }
  }

  return `wss://${host}/api/v1/ws?restaurant_id=${encodeURIComponent(restaurantId)}&role=${encodeURIComponent(role)}${tableSessionId ? `&table_session_id=${encodeURIComponent(tableSessionId)}` : ''}`;
}

class RealTimeEventBus {
  private listeners: Set<EventListener> = new Set();
  private channel: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;
  private processedEventIds: Set<string> = new Set();
  private isConnected: boolean = false;
  private currentRestaurantId: string | null = null;
  private currentRole: string = 'CUSTOMER';
  private currentTableSessionId: string | null = null;
  private reconnectTimer: any = null;
  private pingInterval: any = null;

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
        console.warn('BroadcastChannel fallback setup:', err);
      }
    }
  }

  public connect(restaurantId: string, role: string = 'CUSTOMER', tableSessionId?: string) {
    if (!restaurantId) return;

    if (
      this.ws &&
      this.currentRestaurantId === restaurantId &&
      this.currentRole === role &&
      this.currentTableSessionId === tableSessionId &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.disconnect();

    this.currentRestaurantId = restaurantId;
    this.currentRole = role;
    this.currentTableSessionId = tableSessionId || null;

    const wsUrl = getWebSocketUrl(restaurantId, role, tableSessionId);
    console.log('[WS_CONNECTING] URL:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WS_CONNECTED] Scoped to restaurant:', restaurantId, 'role:', role);
        this.isConnected = true;

        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send('ping');
          }
        }, 20000);
      };

      this.ws.onmessage = (msgEvent) => {
        if (msgEvent.data === 'pong') return;

        try {
          const raw = JSON.parse(msgEvent.data);
          const eventId = raw.event_id || raw.eventId;

          if (eventId) {
            if (this.processedEventIds.has(eventId)) {
              return; // Event deduplication
            }
            this.processedEventIds.add(eventId);
            if (this.processedEventIds.size > 500) {
              const first = Array.from(this.processedEventIds)[0];
              this.processedEventIds.delete(first);
            }
          }

          const mappedPayload: RealTimeEventPayload = {
            eventId,
            type: raw.type,
            restaurantId: raw.restaurant_id || raw.restaurantId,
            timestamp: raw.timestamp || new Date().toISOString(),
            ...(raw.payload || {}),
          };

          this.notifyListeners(mappedPayload, false);
        } catch (err) {
          console.error('[WS_MESSAGE_PARSE_ERROR]:', err);
        }
      };

      this.ws.onclose = () => {
        console.log('[WS_DISCONNECTED] Retrying in 4s...');
        this.isConnected = false;
        if (this.pingInterval) clearInterval(this.pingInterval);

        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
          if (this.currentRestaurantId) {
            this.connect(this.currentRestaurantId, this.currentRole, this.currentTableSessionId || undefined);
          }
        }, 4000);
      };

      this.ws.onerror = (err) => {
        console.warn('[WS_ERROR]:', err);
      };
    } catch (e) {
      console.error('[WS_INIT_FAILED]:', e);
    }
  }

  public disconnect() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
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
      actor: payload.actor || 'System',
      ...payload,
    };

    this.notifyListeners(fullPayload, true);

    if (this.channel) {
      try {
        this.channel.postMessage(fullPayload);
      } catch (err) {}
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
