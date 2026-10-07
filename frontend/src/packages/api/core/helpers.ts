import {
  Order,
  OrderItem,
  OrderStatus,
  Restaurant,
  MenuCategory,
  MenuItem,
  Table,
} from '../../types';

export const delay = (_ms = 0) => Promise.resolve();

export function getProductionOrigin(): string {
  if (typeof window === 'undefined') return 'https://dinely.food';
  const host = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : '';
  const protocol = window.location.protocol;

  const isDevHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);

  if (isDevHost) {
    const envDomain = (import.meta.env.VITE_PUBLIC_DOMAIN || import.meta.env.VITE_PRODUCTION_DOMAIN || '').trim();
    if (envDomain) {
      return `https://${envDomain.replace(/^https?:\/\//, '')}`;
    }
    return `${protocol}//${host}${port}`;
  }
  return window.location.origin.replace(/^http:\/\//, 'https://');
}

export type PortalScope = 'ADMIN' | 'OWNER' | 'KITCHEN' | 'WAITER' | 'BAR' | 'INVENTORY' | 'STAFF' | 'CUSTOMER';

export const SESSION_KEYS: Record<PortalScope, string> = {
  ADMIN: 'dinely_session_admin',
  OWNER: 'dinely_session_owner',
  KITCHEN: 'dinely_session_kitchen',
  WAITER: 'dinely_session_waiter',
  BAR: 'dinely_session_bar',
  INVENTORY: 'dinely_session_inventory',
  STAFF: 'dinely_session_staff',
  CUSTOMER: 'dinely_session_customer',
};

export const TOKEN_KEYS: Record<PortalScope, string> = {
  ADMIN: 'dinely_tokens_admin',
  OWNER: 'dinely_tokens_owner',
  KITCHEN: 'dinely_tokens_kitchen',
  WAITER: 'dinely_tokens_waiter',
  BAR: 'dinely_tokens_bar',
  INVENTORY: 'dinely_tokens_inventory',
  STAFF: 'dinely_tokens_staff',
  CUSTOMER: 'dinely_tokens_customer',
};

export function getPortalScopeFromPath(pathname?: string): PortalScope {
  const p = pathname || (typeof window !== 'undefined' ? window.location.pathname : '/');
  if (p.startsWith('/admin')) {
    return 'ADMIN';
  }
  if (p.startsWith('/kitchen')) {
    return 'KITCHEN';
  }
  if (p.startsWith('/waiter')) {
    return 'WAITER';
  }
  if (p.startsWith('/bar')) {
    return 'BAR';
  }
  if (p.startsWith('/inventory')) {
    return 'INVENTORY';
  }
  if (p.startsWith('/customer') || p.startsWith('/order') || p.startsWith('/qr')) {
    return 'CUSTOMER';
  }
  return 'OWNER';
}

export function getApiBaseUrl(): string {
  if (typeof process !== 'undefined' && process.env?.VITE_API_BASE_URL) {
    const envVal = process.env.VITE_API_BASE_URL.trim();
    if (envVal && !envVal.includes('onrender.com')) return envVal;
  }
  if (typeof import.meta !== 'undefined') {
    const envUrl = (import.meta.env?.VITE_API_BASE_URL || import.meta.env?.VITE_API_URL || '').trim();
    if (envUrl && !envUrl.includes('onrender.com')) return envUrl;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const isDevHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.localhost') ||
      host.includes('localhost') ||
      /^192\.168\./.test(host) ||
      /^10\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);

    if (isDevHost) {
      const protocol = window.location.protocol;
      const apiHost = (host.endsWith('.localhost') || host.includes('localhost')) ? 'localhost' : host;
      return `${protocol}//${apiHost}:8000/api/v1`;
    }

    // In AWS production, all requests to dinely.food and *.dinely.food are proxied via Nginx on /api/v1
    return '/api/v1';
  }
  return 'http://localhost:8000/api/v1';
}

export function normalizeOrder(raw: any): Order {
  if (!raw) {
    return {
      id: '',
      restaurantId: '',
      tableId: '',
      tableNumber: 'Table 01',
      tableSessionId: '',
      status: 'PENDING',
      kitchenStatus: 'PENDING',
      barStatus: 'PENDING',
      customerName: 'Guest',
      notes: '',
      items: [],
      totalAmount: 0,
      subtotal: 0,
      taxAmount: 0,
      tipAmount: 0,
      paymentStatus: 'UNPAID',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const rawItems = raw.items || raw.items_json || raw.order_items || raw.orderItems || [];
  const normalizedItems: OrderItem[] = Array.isArray(rawItems)
    ? rawItems.map((i: any, idx: number) => {
        const dest = (i.targetDestination || i.target_destination || i.station || '').toUpperCase();
        const targetDestination: 'KITCHEN' | 'BAR' = dest === 'BAR' ? 'BAR' : 'KITCHEN';

        return {
          id: i.id || `oi-${raw.id || 'ord'}-${idx}`,
          menuItemId: i.menuItemId || i.menu_item_id || i.id || `item-${idx}`,
          name: i.name || 'Unnamed Item',
          price: typeof i.price === 'number' ? i.price : parseFloat(i.price || i.unit_price || i.unitPrice) || 0,
          quantity: typeof i.quantity === 'number' ? i.quantity : parseInt(i.quantity) || 1,
          notes: i.notes || '',
          targetDestination: targetDestination,
          isAlcoholic: Boolean(i.isAlcoholic || i.is_alcoholic || targetDestination === 'BAR'),
        };
      })
    : [];

  return {
    id: raw.id || raw.order_id || raw.orderId || '',
    displayOrderNumber: raw.order_number || raw.orderNumber || (raw.id ? `#ORD-${String(raw.id).slice(-4)}` : '#ORD-1'),
    restaurantId: raw.restaurant_id || raw.restaurantId || '',
    tableId: raw.table_id || raw.tableId || '',
    tableNumber: raw.table_number || raw.tableNumber || 'Table 01',
    tableSessionId: raw.table_session_id || raw.tableSessionId || '',
    status: (raw.status || 'PENDING').toUpperCase() as OrderStatus,
    kitchenStatus: (raw.kitchen_status || raw.kitchenStatus || raw.status || 'PENDING').toUpperCase(),
    barStatus: (raw.bar_status || raw.barStatus || raw.status || 'PENDING').toUpperCase(),
    customerName: raw.customer_name || raw.customerName || 'Guest',
    notes: raw.notes || '',
    items: normalizedItems,
    subtotal: typeof raw.subtotal === 'number' ? raw.subtotal : parseFloat(raw.subtotal) || 0,
    taxAmount: typeof raw.tax_amount === 'number' ? raw.tax_amount : parseFloat(raw.tax_amount || raw.taxAmount) || 0,
    totalAmount: typeof raw.total_amount === 'number' ? raw.total_amount : parseFloat(raw.total_amount || raw.totalAmount) || 0,
    tipAmount: typeof raw.tip_amount === 'number' ? raw.tip_amount : parseFloat(raw.tip_amount || raw.tipAmount) || 0,
    taxBreakdown: raw.tax_breakdown || raw.tax_breakdown_json || raw.taxBreakdown || [],
    estimatedPrepTimeMinutes: raw.estimated_prep_time_minutes || raw.estimatedPrepTimeMinutes || undefined,
    etaTargetTimestamp: raw.eta_target_timestamp || raw.etaTargetTimestamp || undefined,
    isTimerPaused: Boolean(raw.is_timer_paused || raw.isTimerPaused),
    paymentStatus: raw.payment_status || raw.paymentStatus || 'UNPAID',
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updated_at || raw.updatedAt || new Date().toISOString(),
  };
}

export const GLOBAL_MULTI_TENANT_RESTAURANTS: Restaurant[] = [];
export const GLOBAL_MULTI_TENANT_CATEGORIES: MenuCategory[] = [];
export const GLOBAL_MULTI_TENANT_MENU_ITEMS: MenuItem[] = [];
export const GLOBAL_MULTI_TENANT_TABLES: Table[] = [];

export const DATABASE_STORAGE_KEY = 'dinely_production_db_v3';
