import {
  Organization,
  Restaurant,
  MenuItem,
  OrderItem,
  Order,
  Table,
  Employee,
  InventoryItem,
  Supplier,
  AuditLog,
  ThemeConfig,
  User,
  AuthTokens,
  CustomerRequest,
  WaiterNotification,
  PlatformNotification,
  MenuCategory,
  BarCategory,
  BarMenuItem,
  TableSession,
  BusinessDay,
  DailySummaryData,
  getFulfillmentStation,
  FulfillmentTicket,
  Bill,
  BillItem,
  BillStatus,
  PaymentMethod,
  BusinessType,
} from '../types';
import { DEFAULT_THEME } from '../data/mockData';
import { realtimeBus } from './realtime';
import { matchTableNumber, formatStandardTableNumber } from '../utils/tableUtils';

// Simulated API delay helper
const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

export function getProductionOrigin(): string {
  if (typeof window === 'undefined') return 'https://dinely.food';
  const host = window.location.hostname;
  const isDevHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);

  if (isDevHost) {
    const envDomain = (import.meta.env.VITE_PUBLIC_DOMAIN || import.meta.env.VITE_PRODUCTION_DOMAIN || '').trim();
    return envDomain ? `https://${envDomain.replace(/^https?:\/\//, '')}` : 'https://dinely.food';
  }
  return window.location.origin.replace(/^http:\/\//, 'https://');
}

export type PortalScope = 'ADMIN' | 'OWNER' | 'STAFF' | 'CUSTOMER';

const SESSION_KEYS: Record<PortalScope, string> = {
  ADMIN: 'dinely_session_admin',
  OWNER: 'dinely_session_owner',
  STAFF: 'dinely_session_staff',
  CUSTOMER: 'dinely_session_customer',
};

const TOKEN_KEYS: Record<PortalScope, string> = {
  ADMIN: 'dinely_tokens_admin',
  OWNER: 'dinely_tokens_owner',
  STAFF: 'dinely_tokens_staff',
  CUSTOMER: 'dinely_tokens_customer',
};

export function getPortalScopeFromPath(pathname?: string): PortalScope {
  const p = pathname || (typeof window !== 'undefined' ? window.location.pathname : '/');
  if (p.startsWith('/admin')) {
    return 'ADMIN';
  }
  if (p.startsWith('/kitchen') || p.startsWith('/waiter') || p.startsWith('/bar') || p.startsWith('/inventory')) {
    return 'STAFF';
  }
  if (p.startsWith('/customer') || p.startsWith('/order') || p.startsWith('/qr')) {
    return 'CUSTOMER';
  }
  return 'OWNER';
}

export function getApiBaseUrl(): string {
  if (typeof import.meta !== 'undefined') {
    const envUrl = (import.meta.env?.VITE_API_BASE_URL || import.meta.env?.VITE_API_URL || '').trim();
    if (envUrl) return envUrl;
  }
  if (typeof window !== 'undefined') {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return `https://dineflow-v3.onrender.com/api/v1`;
    }
  }
  return 'http://localhost:8000/api/v1';
}

// Global Multi-Tenant SaaS Central Store (Multi-tenant persistent registry across all browser contexts & devices)
export const GLOBAL_MULTI_TENANT_RESTAURANTS: Restaurant[] = [
  {
    id: 'rest-1787446097984',
    orgId: 'org-cafe-co',
    name: 'CAFE.CO',
    slug: 'cafe-co',
    cuisine: 'Fine Dining & Cafe',
    businessType: 'RESTAURANT',
    hasBar: true,
    hasTables: true,
    hasKitchen: true,
    hasWaiter: true,
    orderNumberPrefix: '#ORD',
    address: '108 Culinary Boulevard, Fine Dining Strip',
    phone: '+1 (555) 987-6543',
    email: 'contact@cafeco.food',
    ownerName: 'Cafe Owner',
    ownerEmail: 'owner@cafeco.food',
    domain: 'cafeco.dinely.app',
    isApproved: true,
    isAutoApproved: true,
    lifecycleStatus: 'APPROVED',
    status: 'OPEN',
    rating: 4.9,
    activeOrdersCount: 0,
    currency: 'INR (₹)',
    taxPercentage: 5.0,
    createdAt: new Date().toISOString(),
    theme: {
      restaurantId: 'rest-1787446097984',
      restaurantName: 'CAFE.CO',
      logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&auto=format&fit=crop&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
      primaryColor: '#f43f5e',
      secondaryColor: '#475569',
      accentColor: '#fbbf24',
      backgroundColor: '#0f172a',
      textColor: '#ffffff',
      fontFamily: 'Inter',
      borderRadius: 'xl',
      currency: 'INR (₹)',
    },
  },
  {
    id: 'rest-1',
    orgId: 'org-lumiere',
    name: 'Lumière Bistro',
    slug: 'lumiere-bistro',
    cuisine: 'French Fine Dining',
    businessType: 'RESTAURANT',
    hasBar: true,
    hasTables: true,
    hasKitchen: true,
    hasWaiter: true,
    orderNumberPrefix: '#ORD',
    address: '42 Avenue des Champs, Gourmet Quarter',
    phone: '+1 (555) 345-6789',
    email: 'contact@lumierebistro.food',
    ownerName: 'Chef Lumiere',
    ownerEmail: 'owner@lumiere.food',
    domain: 'lumiere.dinely.app',
    isApproved: true,
    isAutoApproved: true,
    lifecycleStatus: 'APPROVED',
    status: 'OPEN',
    rating: 4.8,
    activeOrdersCount: 0,
    currency: 'INR (₹)',
    taxPercentage: 5.0,
    createdAt: new Date().toISOString(),
    theme: {
      restaurantId: 'rest-1',
      restaurantName: 'Lumière Bistro',
      logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&auto=format&fit=crop&q=80',
      bannerUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
      primaryColor: '#e11d48',
      secondaryColor: '#475569',
      accentColor: '#f59e0b',
      backgroundColor: '#0f172a',
      textColor: '#ffffff',
      fontFamily: 'sans',
      borderRadius: 'lg',
      currency: 'INR (₹)',
    },
  },
];

export const GLOBAL_MULTI_TENANT_CATEGORIES: MenuCategory[] = [
  { id: 'cat-cafe-1', restaurantId: 'rest-1787446097984', name: 'Starters & Appetizers', sortOrder: 1 },
  { id: 'cat-cafe-2', restaurantId: 'rest-1787446097984', name: 'Main Course', sortOrder: 2 },
  { id: 'cat-cafe-3', restaurantId: 'rest-1787446097984', name: 'Gourmet Desserts', sortOrder: 3 },
  { id: 'cat-cafe-4', restaurantId: 'rest-1787446097984', name: 'Beverages & Drinks', sortOrder: 4 },
  { id: 'cat-1-1', restaurantId: 'rest-1', name: 'Starters & Appetizers', sortOrder: 1 },
  { id: 'cat-1-2', restaurantId: 'rest-1', name: 'Main Course', sortOrder: 2 },
  { id: 'cat-1-3', restaurantId: 'rest-1', name: 'Gourmet Desserts', sortOrder: 3 },
  { id: 'cat-1-4', restaurantId: 'rest-1', name: 'Beverages & Drinks', sortOrder: 4 },
];

export const GLOBAL_MULTI_TENANT_MENU_ITEMS: MenuItem[] = [
  {
    id: 'item-cafe-1',
    restaurantId: 'rest-1787446097984',
    categoryId: 'cat-cafe-1',
    name: 'Crispy Risotto Balls',
    description: 'Stuffed with wild forest mushrooms and aged mozzarella, served with truffle aioli.',
    price: 14.50,
    imageUrl: 'https://images.unsplash.com/photo-1541529086526-db283c563270?w=600&auto=format&fit=crop&q=80',
    isAvailable: true,
    isVeg: true,
    isVegetarian: true,
    dietaryType: 'VEG',
    targetDestination: 'KITCHEN',
    preparationTimeMinutes: 12,
  },
  {
    id: 'item-cafe-2',
    restaurantId: 'rest-1787446097984',
    categoryId: 'cat-cafe-2',
    name: 'Pan-Seared Salmon Fillet',
    description: 'Atlantic salmon served over saffron risotto with lemon herb reduction.',
    price: 28.90,
    imageUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&auto=format&fit=crop&q=80',
    isAvailable: true,
    isVeg: false,
    isVegetarian: false,
    dietaryType: 'NON_VEG',
    targetDestination: 'KITCHEN',
    preparationTimeMinutes: 20,
  },
  {
    id: 'item-cafe-3',
    restaurantId: 'rest-1787446097984',
    categoryId: 'cat-cafe-3',
    name: 'Classic Tiramisu',
    description: 'Layers of espresso-soaked ladyfingers and whipped mascarpone cream.',
    price: 9.50,
    imageUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&auto=format&fit=crop&q=80',
    isAvailable: true,
    isVeg: true,
    isVegetarian: true,
    dietaryType: 'VEG',
    targetDestination: 'KITCHEN',
    preparationTimeMinutes: 8,
  },
  {
    id: 'item-cafe-4',
    restaurantId: 'rest-1787446097984',
    categoryId: 'cat-cafe-4',
    name: 'Artisanal Smoked Old Fashioned',
    description: 'Bourbon whiskey infused with aromatic bitters and oak wood smoke.',
    price: 16.00,
    imageUrl: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&auto=format&fit=crop&q=80',
    isAvailable: true,
    isVeg: true,
    isVegetarian: true,
    dietaryType: 'VEG',
    targetDestination: 'BAR',
    isAlcoholic: true,
    preparationTimeMinutes: 5,
  },
  {
    id: 'item-1-1',
    restaurantId: 'rest-1',
    categoryId: 'cat-1-1',
    name: 'Truffle Mushroom Crostini',
    description: 'Sourdough crostini with sauteed wild mushrooms and truffle glaze.',
    price: 12.00,
    imageUrl: 'https://images.unsplash.com/photo-1541529086526-db283c563270?w=600&auto=format&fit=crop&q=80',
    isAvailable: true,
    isVeg: true,
    isVegetarian: true,
    dietaryType: 'VEG',
    targetDestination: 'KITCHEN',
    preparationTimeMinutes: 10,
  },
];

export const GLOBAL_MULTI_TENANT_TABLES: Table[] = [
  ...Array.from({ length: 12 }, (_, i) => {
    const restId = 'rest-1787446097984';
    const tNum = `Table ${String(i + 1).padStart(2, '0')}`;
    const tId = `tbl-${restId}-${tNum.toLowerCase().replace(/\s+/g, '_')}`;
    return {
      id: tId,
      restaurantId: restId,
      tableNumber: tNum,
      section: i < 6 ? 'MAIN_HALL' : 'TERRACE',
      capacity: 4,
      status: 'AVAILABLE' as const,
      isOccupied: false,
      qrCodeUrl: `https://dinely.food/customer?restaurant=${restId}&tableId=${tId}&table=${encodeURIComponent(tNum)}`,
    };
  }),
  ...Array.from({ length: 12 }, (_, i) => {
    const restId = 'rest-1';
    const tNum = `Table ${String(i + 1).padStart(2, '0')}`;
    const tId = `tbl-${restId}-${tNum.toLowerCase().replace(/\s+/g, '_')}`;
    return {
      id: tId,
      restaurantId: restId,
      tableNumber: tNum,
      section: i < 6 ? 'MAIN_HALL' : 'TERRACE',
      capacity: 4,
      status: 'AVAILABLE' as const,
      isOccupied: false,
      qrCodeUrl: `https://dinely.food/customer?restaurant=${restId}&tableId=${tId}&table=${encodeURIComponent(tNum)}`,
    };
  }),
];

const DATABASE_STORAGE_KEY = 'dinely_production_db_v3';

export class DinelyApiClient {
  private organizations: Organization[] = [];
  private restaurants: Restaurant[] = [];
  private menuItems: MenuItem[] = [];
  private categories: MenuCategory[] = [];
  private barCategories: BarCategory[] = [];
  private barMenuItems: BarMenuItem[] = [];
  private orders: Order[] = [];
  private fulfillmentTickets: FulfillmentTicket[] = [];
  private tables: Table[] = [];
  private tableSessions: TableSession[] = [];
  private bills: Bill[] = [];
  private businessDays: BusinessDay[] = [];
  private employees: Employee[] = [];
  private inventory: InventoryItem[] = [];
  private suppliers: Supplier[] = [];
  private auditLogs: AuditLog[] = [];
  private customerRequests: CustomerRequest[] = [];
  private platformNotifications: PlatformNotification[] = [];
  private notifications: WaiterNotification[] = [];
  private users: User[] = [];

  private currentUsersByScope: Record<PortalScope, User | null> = {
    ADMIN: null,
    OWNER: null,
    STAFF: null,
    CUSTOMER: null,
  };
  private currentTokensByScope: Record<PortalScope, AuthTokens | null> = {
    ADMIN: null,
    OWNER: null,
    STAFF: null,
    CUSTOMER: null,
  };
  private _currentRestaurantId: string | null = null;
  private currentRestaurantIdsByScope: Record<PortalScope, string | null> = {
    ADMIN: null,
    OWNER: null,
    STAFF: null,
    CUSTOMER: null,
  };

  public get currentRestaurantId(): string | null {
    const scope = getPortalScopeFromPath();
    return this._currentRestaurantId || this.currentRestaurantIdsByScope[scope] || (typeof window !== 'undefined' && window.localStorage ? (localStorage.getItem('dinely_active_restaurant_id') || localStorage.getItem('dinely_restaurant_id')) : null);
  }

  public set currentRestaurantId(val: string | null) {
    this._currentRestaurantId = val;
    if (val && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('dinely_active_restaurant_id', val);
      window.localStorage.setItem('dinely_restaurant_id', val);
    }
  }

  public get currentUser(): User | null {
    return this.getCurrentUser();
  }

  public set currentUser(user: User | null) {
    const scope = getPortalScopeFromPath();
    this.currentUsersByScope[scope] = user;
  }

  public get currentTokens(): AuthTokens | null {
    const scope = getPortalScopeFromPath();
    return this.currentTokensByScope[scope];
  }

  public set currentTokens(tokens: AuthTokens | null) {
    const scope = getPortalScopeFromPath();
    this.currentTokensByScope[scope] = tokens;
  }

  constructor() {
    this.loadDatabase();
    this.restoreSession();

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('storage', (e) => {
        if (e.key === DATABASE_STORAGE_KEY) {
          this.loadDatabase();
          realtimeBus.emit('OrderCreated' as any, {
            type: 'OrderCreated',
            timestamp: new Date().toISOString(),
          });
        }
      });
    }
  }

  // --- Persistent Storage Engine ---
  public loadDatabase() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(DATABASE_STORAGE_KEY);
        if (raw) {
          const db = JSON.parse(raw);
          this.organizations = db.organizations || [];
          this.restaurants = db.restaurants || [];
          this.menuItems = db.menuItems || [];
          this.categories = db.categories || [];
          this.barCategories = db.barCategories || [];
          this.barMenuItems = db.barMenuItems || [];
          this.orders = db.orders || [];
          this.fulfillmentTickets = db.fulfillmentTickets || [];
          this.tables = db.tables || [];
          this.tableSessions = db.tableSessions || [];
          this.bills = db.bills || [];
          this.businessDays = db.businessDays || [];
          this.employees = db.employees || [];
          this.inventory = db.inventory || [];
          this.suppliers = db.suppliers || [];
          this.auditLogs = db.auditLogs || [];
          this.customerRequests = db.customerRequests || [];
          this.platformNotifications = db.platformNotifications || [];
          this.users = db.users || [];
        }
      }
    } catch (e) {
      console.error('Failed to load database from localStorage:', e);
    }

    this.sanitizeTableSessions();
  }

  private sanitizeTableSessions() {
    const activeSessionsByTable = new Map<string, TableSession[]>();
    for (const session of this.tableSessions) {
      if (session.status === 'ACTIVE') {
        const list = activeSessionsByTable.get(session.tableId) || [];
        list.push(session);
        activeSessionsByTable.set(session.tableId, list);
      }
    }

    activeSessionsByTable.forEach((sessions) => {
      if (sessions.length > 1) {
        sessions.sort((a, b) => new Date(b.sessionStartedAt).getTime() - new Date(a.sessionStartedAt).getTime());
        for (let i = 1; i < sessions.length; i++) {
          sessions[i].status = 'CLOSED';
          sessions[i].sessionClosedAt = new Date().toISOString();
        }
      }
    });

    const origin = getProductionOrigin();
    this.tables.forEach((tbl) => {
      if (!tbl.qrCodeUrl || tbl.qrCodeUrl.includes('qrserver.com') || tbl.qrCodeUrl.includes('.dinely.app') || tbl.qrCodeUrl.includes('localhost') || tbl.qrCodeUrl.includes('127.0.0.1') || !tbl.qrCodeUrl.includes('tableId=')) {
        tbl.qrCodeUrl = `${origin}/customer?restaurant=${tbl.restaurantId || ''}&tableId=${tbl.id}&table=${encodeURIComponent(tbl.tableNumber)}`;
      }
      const activeSession = this.tableSessions.find(
        (s) => s.status === 'ACTIVE' && (s.restaurantId === tbl.restaurantId || !s.restaurantId) && (s.tableId === tbl.id || matchTableNumber(s.tableNumber, tbl.tableNumber))
      );
      if (activeSession) {
        tbl.status = 'OCCUPIED';
        tbl.isOccupied = true;
        tbl.activeSessionId = activeSession.id;
        tbl.sessionStartedAt = activeSession.sessionStartedAt;
      } else if (tbl.status !== 'RESERVED' && tbl.status !== 'MERGED') {
        tbl.status = 'AVAILABLE';
        tbl.isOccupied = false;
        tbl.activeSessionId = undefined;
        tbl.sessionStartedAt = undefined;
      }
    });
  }

  private saveDatabase() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const payload = {
          organizations: this.organizations,
          restaurants: this.restaurants,
          menuItems: this.menuItems,
          categories: this.categories,
          barCategories: this.barCategories,
          barMenuItems: this.barMenuItems,
          orders: this.orders,
          fulfillmentTickets: this.fulfillmentTickets,
          tables: this.tables,
          tableSessions: this.tableSessions,
          bills: this.bills,
          businessDays: this.businessDays,
          employees: this.employees,
          inventory: this.inventory,
          suppliers: this.suppliers,
          auditLogs: this.auditLogs,
          customerRequests: this.customerRequests,
          platformNotifications: this.platformNotifications,
          users: this.users,
        };
        localStorage.setItem(DATABASE_STORAGE_KEY, JSON.stringify(payload));
      }
    } catch (e) {
      console.error('Failed to persist database to localStorage:', e);
    }
  }

  public restoreSession(targetScope?: PortalScope) {
    try {
      if (typeof window !== 'undefined') {
        const scope = targetScope || getPortalScopeFromPath(window.location.pathname);
        const storageKey = SESSION_KEYS[scope];

        // 1. Check tab-isolated sessionStorage for this portal scope
        const tabSession = sessionStorage.getItem(storageKey);
        if (tabSession) {
          const parsed = JSON.parse(tabSession);
          if (parsed && parsed.user) {
            const freshUser = this.users.find((u) => u.email?.toLowerCase() === parsed.user.email?.toLowerCase());
            const activeRestFromStorage = typeof window !== 'undefined' && window.localStorage
              ? (localStorage.getItem('dinely_active_restaurant_id') || localStorage.getItem('dinely_restaurant_id'))
              : null;
            const effectiveRestId = activeRestFromStorage || parsed.restaurantId || freshUser?.restaurantId || parsed.user?.restaurantId || null;

            const mergedUser = freshUser
              ? { ...parsed.user, ...freshUser, restaurantId: effectiveRestId || freshUser.restaurantId || parsed.user.restaurantId }
              : { ...parsed.user, restaurantId: effectiveRestId || parsed.user.restaurantId };

            this.currentUsersByScope[scope] = mergedUser;
            this.currentTokensByScope[scope] = parsed.tokens || mergedUser.tokens || null;
            this.currentRestaurantIdsByScope[scope] = effectiveRestId;
            if (effectiveRestId) {
              this._currentRestaurantId = effectiveRestId;
            }
            return mergedUser;
          }
        }

        // 2. Check scope-isolated localStorage for this portal scope
        if (window.localStorage) {
          const localSession = localStorage.getItem(storageKey);
          if (localSession) {
            const parsed = JSON.parse(localSession);
            if (parsed && parsed.user) {
              const freshUser = this.users.find((u) => u.email?.toLowerCase() === parsed.user.email?.toLowerCase());
              const activeRestFromStorage = localStorage.getItem('dinely_active_restaurant_id') || localStorage.getItem('dinely_restaurant_id');
              const effectiveRestId = activeRestFromStorage || parsed.restaurantId || freshUser?.restaurantId || parsed.user?.restaurantId || null;

              const mergedUser = freshUser
                ? { ...parsed.user, ...freshUser, restaurantId: effectiveRestId || freshUser.restaurantId || parsed.user.restaurantId }
                : { ...parsed.user, restaurantId: effectiveRestId || parsed.user.restaurantId };

              this.currentUsersByScope[scope] = mergedUser;
              this.currentTokensByScope[scope] = parsed.tokens || mergedUser.tokens || null;
              this.currentRestaurantIdsByScope[scope] = effectiveRestId;
              if (effectiveRestId) {
                this._currentRestaurantId = effectiveRestId;
              }
              sessionStorage.setItem(storageKey, JSON.stringify({ ...parsed, user: mergedUser, restaurantId: effectiveRestId }));
              return mergedUser;
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to restore session', e);
    }

    const scope = targetScope || getPortalScopeFromPath(typeof window !== 'undefined' ? window.location.pathname : '');
    this.currentUsersByScope[scope] = null;
    this.currentRestaurantIdsByScope[scope] = null;
    return null;
  }

  public saveSession(user: User, tokens: AuthTokens, restaurantId?: string | null, scopeOverride?: PortalScope) {
    let scope: PortalScope = scopeOverride || 'OWNER';
    if (!scopeOverride) {
      if (user.role === 'PLATFORM_ADMIN' || user.role === 'SUPER_ADMIN') {
        scope = 'ADMIN';
      } else if (user.role === 'RESTAURANT_OWNER') {
        scope = 'OWNER';
      } else if (user.role === 'CHEF' || user.role === 'WAITER' || user.role === 'BARTENDER' || user.role === 'BAR_STAFF' || user.role === 'INVENTORY_MANAGER' || user.role === 'MANAGER') {
        scope = 'STAFF';
      } else if (user.role === 'CUSTOMER') {
        scope = 'CUSTOMER';
      }
    }

    const targetRestId = restaurantId || user.restaurantId || null;
    this.currentUsersByScope[scope] = user;
    this.currentTokensByScope[scope] = tokens;
    this.currentRestaurantIdsByScope[scope] = targetRestId;

    const existingIdx = this.users.findIndex((u) => u.email?.toLowerCase() === user.email?.toLowerCase());
    if (existingIdx >= 0) {
      this.users[existingIdx] = {
        ...this.users[existingIdx],
        ...user,
        restaurantId: targetRestId || this.users[existingIdx].restaurantId,
      };
    } else {
      this.users.unshift(user);
    }

    try {
      if (typeof window !== 'undefined') {
        const payload = JSON.stringify({
          user,
          tokens,
          restaurantId: targetRestId,
          orgId: user.orgId,
          scope,
        });
        const storageKey = SESSION_KEYS[scope];
        sessionStorage.setItem(storageKey, payload);
        if (window.localStorage) {
          localStorage.setItem(storageKey, payload);
        }
      }
    } catch (e) {
      console.error('Failed to save session', e);
    }
    this.saveDatabase();
  }

  // --- Auth & Account APIs ---

  async checkUserExists(email: string): Promise<boolean> {
    await delay(100);
    const normalized = email.trim().toLowerCase();
    return this.users.some((u) => u.email.toLowerCase() === normalized);
  }

  async registerOwner(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) {
    await delay(300);
    const normalizedEmail = data.email.trim().toLowerCase();

    // Verify email uniqueness
    const existing = this.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      throw new Error('An account with this email address already exists. Please sign in instead.');
    }

    const userId = `usr-owner-${Date.now()}`;
    const newUser: User = {
      id: userId,
      firstName: data.name.split(' ')[0] || 'Owner',
      lastName: data.name.split(' ')[1] || '',
      name: data.name,
      email: normalizedEmail,
      phone: data.phone,
      role: 'RESTAURANT_OWNER',
      isEmailVerified: true,
      password: data.password,
    };

    const tokens: AuthTokens = {
      accessToken: `df_jwt_${userId}_${Date.now()}`,
      refreshToken: `df_ref_${userId}_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    newUser.tokens = tokens;
    this.users.unshift(newUser);
    this.saveSession(newUser, tokens);

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: data.name,
      action: 'Registered New Restaurant Owner Account',
      target: normalizedEmail,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    this.saveDatabase();
    return { user: newUser, tokens };
  }

  async loginOwner(email: string, password?: string) {
    await delay(350);
    const normalizedEmail = email.trim().toLowerCase();

    let user = this.users.find((u) => u.email.toLowerCase() === normalizedEmail);

    // If user does not exist, check if this is the default admin
    if (!user && normalizedEmail === 'admin@dinely.com') {
      return this.loginPlatformAdmin(email, password);
    }

    if (!user) {
      throw new Error('No registered account found for this email address. Please sign up or sign in using Google.');
    }

    if (password && user.password && user.password !== password) {
      throw new Error('Invalid password. Please check your credentials and try again.');
    }

    let restaurant = this.restaurants.find(
      (r) => !r.isDeleted && (r.id === user?.restaurantId || r.ownerEmail?.toLowerCase() === normalizedEmail)
    );

    if (restaurant && restaurant.lifecycleStatus === 'SUSPENDED') {
      throw new Error('Your restaurant account has been suspended by Platform Admin. Access is temporarily disabled.');
    }

    if (restaurant && restaurant.isDeleted) {
      throw new Error('This restaurant account has been permanently removed by Platform Admin.');
    }

    const tokens: AuthTokens = {
      accessToken: `df_jwt_${user.id}_${Date.now()}`,
      refreshToken: `df_ref_${user.id}_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    user.tokens = tokens;
    if (restaurant) {
      user.restaurantId = restaurant.id;
    }

    this.saveSession(user, tokens, restaurant?.id || null);

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: user.name,
      action: 'Authenticated Restaurant Owner Session',
      target: restaurant?.name || 'Owner Portal',
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    return { user, tokens, restaurant };
  }

  async authenticateWithGoogle(googleData: {
    googleUid: string;
    email: string;
    name: string;
    photoURL?: string;
  }) {
    await delay(300);
    const normalizedEmail = googleData.email.trim().toLowerCase();

    // 1. Search existing user by googleUid or email
    let user = this.users.find(
      (u) => (u.googleUid && u.googleUid === googleData.googleUid) || u.email.toLowerCase() === normalizedEmail
    );

    let isNewUser = false;

    if (user) {
      // Security enforcement: Never grant Platform Admin role via Google Auth
      if (user.role === 'PLATFORM_ADMIN') {
        throw new Error('Platform Administrator accounts must use the dedicated Admin Portal credentials.');
      }

      user.googleUid = googleData.googleUid;
      user.authProvider = 'google';
      if (googleData.photoURL && !user.avatar) {
        user.avatar = googleData.photoURL;
      }
    } else {
      isNewUser = true;
      const userId = `usr-google-${Date.now()}`;
      user = {
        id: userId,
        firstName: googleData.name.split(' ')[0] || 'Owner',
        lastName: googleData.name.split(' ').slice(1).join(' ') || '',
        name: googleData.name,
        email: normalizedEmail,
        role: 'RESTAURANT_OWNER',
        isEmailVerified: true,
        googleUid: googleData.googleUid,
        authProvider: 'google',
        avatar: googleData.photoURL,
      };
      this.users.unshift(user);
    }

    // 2. Find restaurant associated with this owner
    const restaurant = this.restaurants.find(
      (r) => !r.isDeleted && (r.id === user?.restaurantId || r.ownerEmail?.toLowerCase() === normalizedEmail)
    );

    if (restaurant && restaurant.lifecycleStatus === 'SUSPENDED') {
      throw new Error('Your restaurant account has been suspended by Platform Admin. Access is temporarily disabled.');
    }

    if (restaurant && restaurant.isDeleted) {
      throw new Error('This restaurant account has been permanently removed by Platform Admin.');
    }

    const tokens: AuthTokens = {
      accessToken: `df_jwt_google_${user.id}_${Date.now()}`,
      refreshToken: `df_ref_google_${user.id}_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    user.tokens = tokens;
    if (restaurant) {
      user.restaurantId = restaurant.id;
    }

    this.saveSession(user, tokens, restaurant?.id || null);

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: user.name,
      action: isNewUser ? 'Registered Owner Account via Google' : 'Logged in via Google Auth',
      target: normalizedEmail,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    this.saveDatabase();

    return {
      user,
      tokens,
      isNewUser,
      hasRestaurant: !!restaurant,
      restaurant,
    };
  }

  async loginPlatformAdmin(idTokenOrEmail: string, userEmailOrPassword?: string) {
    await delay(300);
    let firebaseIdToken = idTokenOrEmail;

    const emailCandidate = (
      userEmailOrPassword && userEmailOrPassword.includes('@')
        ? userEmailOrPassword
        : (idTokenOrEmail.includes('@') ? idTokenOrEmail : '')
    ).trim().toLowerCase();

    // STRICT IDENTITY SECURITY BOUNDARY:
    if (emailCandidate && emailCandidate !== 'ayan090912@gmail.com') {
      throw new Error(`Access denied. This Google account (${emailCandidate}) is not authorized to access Dinely Platform Administration. Only ayan090912@gmail.com is permitted.`);
    }

    if (!firebaseIdToken.startsWith('eyJ') && !firebaseIdToken.startsWith('firebase_token_')) {
      firebaseIdToken = `firebase_token_admin_${encodeURIComponent((emailCandidate || 'ayan090912@gmail.com').toLowerCase())}`;
    }

    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/admin/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firebaseIdToken}`,
        },
        body: JSON.stringify({ id_token: firebaseIdToken }),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. This Google account is not authorized to access Dinely Platform Administration.');
        } else if (response.status === 401) {
          throw new Error('Authentication token invalid or expired. Please sign in again.');
        }
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Platform Admin authorization failed.');
      }

      const verified = await response.json();
      const adminEmail = (verified.email || emailCandidate || 'ayan090912@gmail.com').toLowerCase();
      if (adminEmail !== 'ayan090912@gmail.com') {
        throw new Error('Access denied. Only ayan090912@gmail.com is authorized as Platform Administrator.');
      }
      const adminUid = verified.uid || 'admin_uid';

      let adminUser = this.users.find((u) => u.role === 'PLATFORM_ADMIN' && u.email.toLowerCase() === adminEmail);
      if (!adminUser) {
        adminUser = {
          id: `usr-admin-${adminUid}`,
          firstName: 'Platform',
          lastName: 'Admin',
          name: 'Platform Administrator',
          email: adminEmail,
          phone: '+1 800-DINELY',
          role: 'PLATFORM_ADMIN',
          isEmailVerified: true,
          googleUid: adminUid,
        };
        this.users.unshift(adminUser);
      }

      const tokens: AuthTokens = {
        accessToken: firebaseIdToken,
        refreshToken: `df_admin_ref_${Date.now()}`,
        expiresIn: 86400,
        tokenType: 'Bearer',
      };

      adminUser.tokens = tokens;
      this.saveSession(adminUser, tokens, null, 'ADMIN');

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: adminUser.name || adminEmail,
        action: 'Authenticated Platform Admin Control Plane',
        target: 'Dinely Cloud',
        timestamp: new Date().toISOString(),
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });

      this.saveDatabase();
      return { user: adminUser, tokens };
    } catch (err: any) {
      if (err.message?.includes('Access denied') || err.message?.includes('not authorized') || err.message?.includes('Forbidden')) {
        throw err;
      }
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        const targetEmail = (emailCandidate || 'ayan090912@gmail.com').toLowerCase();
        if (targetEmail !== 'ayan090912@gmail.com') {
          throw new Error('Access denied. Only ayan090912@gmail.com is authorized as Platform Administrator.');
        }
        let adminUser = this.users.find((u) => u.role === 'PLATFORM_ADMIN' && u.email.toLowerCase() === targetEmail);
        if (!adminUser) {
          adminUser = {
            id: `usr-admin-dev`,
            firstName: 'Platform',
            lastName: 'Admin',
            name: 'Platform Administrator',
            email: targetEmail,
            role: 'PLATFORM_ADMIN',
            isEmailVerified: true,
          };
          this.users.unshift(adminUser);
        }
        const tokens: AuthTokens = {
          accessToken: firebaseIdToken,
          refreshToken: `df_admin_ref_${Date.now()}`,
          expiresIn: 86400,
          tokenType: 'Bearer',
        };
        adminUser.tokens = tokens;
        this.saveSession(adminUser, tokens, null, 'ADMIN');
        return { user: adminUser, tokens };
      }
      throw err;
    }
  }

  async loginKitchen(identifier: string, password?: string) {
    await delay(350);
    const input = identifier.trim().toLowerCase();
    let emp = this.employees.find((e) => {
      if (e.isAccountDisabled) return false;
      const eEmail = (e.email || '').toLowerCase();
      const eId = (e.id || '').toLowerCase();
      const eName = (e.name || '').toLowerCase();
      const eFirstName = eName.split(' ')[0];
      return eEmail === input || eId === input || eName === input || eFirstName === input || eName.includes(input);
    });

    if (!emp) {
      throw new Error(`No active kitchen staff account found for '${identifier}'. Ask your Restaurant Owner to add you in Staff Management.`);
    }

    if (password && emp.password && emp.password !== password) {
      throw new Error('Invalid password. Please check your credentials and try again.');
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId && !r.isDeleted) || this.restaurants[0];

    emp.status = 'ON_CLOCK';
    emp.lastLoginAt = new Date().toISOString();

    let kitchenUser: User = {
      id: `usr-${emp.id}`,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      role: 'CHEF',
      restaurantId: emp.restaurantId,
      orgId: rest ? rest.orgId : 'org-1',
      isEmailVerified: true,
    };

    const tokens: AuthTokens = {
      accessToken: `df_kitchen_jwt_${emp.id}_${Date.now()}`,
      refreshToken: `df_kitchen_ref_${emp.id}_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    kitchenUser.tokens = tokens;
    this.saveSession(kitchenUser, tokens, emp.restaurantId);
    this.saveDatabase();

    realtimeBus.emit('StaffStatusUpdated' as any, {
      employeeId: emp.id,
      restaurantId: emp.restaurantId,
      name: emp.name,
      role: emp.role,
      status: 'ON_CLOCK',
      lastLoginAt: emp.lastLoginAt,
      data: emp,
    });

    return { user: kitchenUser, tokens, employee: emp, restaurant: rest };
  }

  async loginWaiter(identifier: string, password?: string) {
    await delay(350);
    const input = identifier.trim().toLowerCase();
    let emp = this.employees.find((e) => {
      if (e.isAccountDisabled) return false;
      const eEmail = (e.email || '').toLowerCase();
      const eId = (e.id || '').toLowerCase();
      const eName = (e.name || '').toLowerCase();
      const eFirstName = eName.split(' ')[0];
      return eEmail === input || eId === input || eName === input || eFirstName === input || eName.includes(input);
    });

    if (!emp) {
      throw new Error(`No active waiter staff account found for '${identifier}'. Ask your Restaurant Owner to add you in Staff Management.`);
    }

    if (password && emp.password && emp.password !== password) {
      throw new Error('Invalid password. Please check your credentials and try again.');
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId && !r.isDeleted) || this.restaurants[0];

    emp.status = 'ON_CLOCK';
    emp.lastLoginAt = new Date().toISOString();

    let waiterUser = this.users.find((u) => u.email.toLowerCase() === emp.email.toLowerCase());
    if (!waiterUser) {
      waiterUser = {
        id: `usr-${emp.id}`,
        name: emp.name,
        email: emp.email,
        phone: emp.phone,
        role: 'WAITER',
        restaurantId: emp.restaurantId,
        orgId: rest ? rest.orgId : 'org-1',
        isEmailVerified: true,
      };
      this.users.push(waiterUser);
    } else {
      waiterUser.role = 'WAITER';
      waiterUser.restaurantId = emp.restaurantId;
    }

    const tokens: AuthTokens = {
      accessToken: `df_waiter_jwt_${emp.id}_${Date.now()}`,
      refreshToken: `df_waiter_ref_${emp.id}_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    waiterUser.tokens = tokens;
    this.saveSession(waiterUser, tokens, emp.restaurantId);
    this.saveDatabase();

    realtimeBus.emit('StaffStatusUpdated' as any, {
      employeeId: emp.id,
      restaurantId: emp.restaurantId,
      name: emp.name,
      role: emp.role,
      status: 'ON_CLOCK',
      lastLoginAt: emp.lastLoginAt,
      data: emp,
    });

    return { user: waiterUser, tokens, employee: emp, restaurant: rest };
  }

  async loginBar(identifier: string, password?: string) {
    await delay(350);
    const input = identifier.trim().toLowerCase();
    let emp = this.employees.find((e) => {
      if (e.isAccountDisabled) return false;
      const eEmail = (e.email || '').toLowerCase();
      const eId = (e.id || '').toLowerCase();
      const eName = (e.name || '').toLowerCase();
      const eFirstName = eName.split(' ')[0];
      return eEmail === input || eId === input || eName === input || eFirstName === input || eName.includes(input);
    });

    if (!emp) {
      throw new Error(`No active bar staff account found for '${identifier}'. Ask your Restaurant Owner to add you in Staff Management.`);
    }

    if (password && emp.password && emp.password !== password) {
      throw new Error('Invalid password. Please check your credentials and try again.');
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId && !r.isDeleted) || this.restaurants[0];

    if (rest && rest.hasBar === false) {
      throw new Error(`Bar module is disabled for ${rest.name}.`);
    }

    emp.status = 'ON_CLOCK';
    emp.lastLoginAt = new Date().toISOString();

    let barUser = this.users.find((u) => u.email.toLowerCase() === emp.email.toLowerCase());
    if (!barUser) {
      barUser = {
        id: `usr-${emp.id}`,
        name: emp.name,
        email: emp.email,
        phone: emp.phone,
        role: 'BARTENDER',
        restaurantId: emp.restaurantId,
        orgId: rest ? rest.orgId : 'org-1',
        isEmailVerified: true,
      };
      this.users.push(barUser);
    } else {
      barUser.role = 'BARTENDER';
      barUser.restaurantId = emp.restaurantId;
    }

    const tokens: AuthTokens = {
      accessToken: `df_bar_jwt_${emp.id}_${Date.now()}`,
      refreshToken: `df_bar_ref_${emp.id}_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    barUser.tokens = tokens;
    this.saveSession(barUser, tokens, emp.restaurantId);
    this.saveDatabase();

    realtimeBus.emit('StaffStatusUpdated' as any, {
      employeeId: emp.id,
      restaurantId: emp.restaurantId,
      name: emp.name,
      role: emp.role,
      status: 'ON_CLOCK',
      lastLoginAt: emp.lastLoginAt,
      data: emp,
    });

    return { user: barUser, tokens, employee: emp, restaurant: rest };
  }

  async loginInventory(identifier: string, password?: string) {
    await delay(350);
    const input = identifier.trim().toLowerCase();
    let emp = this.employees.find((e) => {
      if (e.isAccountDisabled) return false;
      const eEmail = (e.email || '').toLowerCase();
      const eId = (e.id || '').toLowerCase();
      const eName = (e.name || '').toLowerCase();
      const eFirstName = eName.split(' ')[0];
      return eEmail === input || eId === input || eName === input || eFirstName === input || eName.includes(input);
    });

    if (!emp) {
      throw new Error(`No active inventory staff account found for '${identifier}'. Ask your Restaurant Owner to add you in Staff Management.`);
    }

    if (password && emp.password && emp.password !== password) {
      throw new Error('Invalid password. Please check your credentials and try again.');
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId && !r.isDeleted) || this.restaurants[0];

    emp.status = 'ON_CLOCK';
    emp.lastLoginAt = new Date().toISOString();

    let invUser = this.users.find((u) => u.email.toLowerCase() === emp.email.toLowerCase());
    if (!invUser) {
      invUser = {
        id: `usr-${emp.id}`,
        name: emp.name,
        email: emp.email,
        phone: emp.phone,
        role: 'INVENTORY_MANAGER',
        restaurantId: emp.restaurantId,
        orgId: rest ? rest.orgId : 'org-1',
        isEmailVerified: true,
      };
      this.users.push(invUser);
    } else {
      invUser.role = 'INVENTORY_MANAGER';
      invUser.restaurantId = emp.restaurantId;
    }

    const tokens: AuthTokens = {
      accessToken: `df_inventory_jwt_${emp.id}_${Date.now()}`,
      refreshToken: `df_inventory_ref_${emp.id}_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    invUser.tokens = tokens;
    this.saveSession(invUser, tokens, emp.restaurantId);
    this.saveDatabase();

    realtimeBus.emit('StaffStatusUpdated' as any, {
      employeeId: emp.id,
      restaurantId: emp.restaurantId,
      name: emp.name,
      role: emp.role,
      status: 'ON_CLOCK',
      lastLoginAt: emp.lastLoginAt,
      data: emp,
    });

    return { user: invUser, tokens, employee: emp, restaurant: rest };
  }

  getCurrentUser(scope?: PortalScope): User | null {
    const targetScope = scope || getPortalScopeFromPath();
    if (!this.currentUsersByScope[targetScope]) {
      this.restoreSession(targetScope);
    }
    return this.currentUsersByScope[targetScope];
  }

  getCurrentRestaurantId(scope?: PortalScope): string | null {
    const targetScope = scope || getPortalScopeFromPath();
    const user = this.getCurrentUser(targetScope);
    return this.currentRestaurantIdsByScope[targetScope] || user?.restaurantId || null;
  }

  async logout(scope?: PortalScope) {
    const targetScope = scope || getPortalScopeFromPath();
    const user = this.currentUsersByScope[targetScope];

    if (user) {
      const userEmail = user.email?.toLowerCase();
      const emp = this.employees.find(
        (e) => e.email?.toLowerCase() === userEmail || e.id === user.id?.replace(/^usr-/, '')
      );
      if (emp) {
        emp.status = 'OFF_CLOCK';
        realtimeBus.emit('StaffStatusUpdated' as any, {
          employeeId: emp.id,
          restaurantId: emp.restaurantId,
          name: emp.name,
          role: emp.role,
          status: 'OFF_CLOCK',
          data: emp,
        });
      }
    }

    this.currentUsersByScope[targetScope] = null;
    this.currentTokensByScope[targetScope] = null;
    this.currentRestaurantIdsByScope[targetScope] = null;

    if (typeof window !== 'undefined') {
      const storageKey = SESSION_KEYS[targetScope];
      sessionStorage.removeItem(storageKey);
      if (window.localStorage) {
        localStorage.removeItem(storageKey);
      }
    }

    this.saveDatabase();
  }

  // --- Restaurant & Onboarding APIs ---

  async createRestaurantForOwner(restData: {
    name: string;
    cuisine?: string;
    businessType?: BusinessType;
    hasBar?: boolean;
    hasTables?: boolean;
    hasKitchen?: boolean;
    hasWaiter?: boolean;
    orderNumberPrefix?: string;
    address?: string;
    phone?: string;
    email?: string;
    ownerName?: string;
    ownerEmail?: string;
    features?: any;
    theme?: any;
  }) {
    await delay(250);
    const id = `rest-${Date.now()}`;
    const slug = restData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const orgId = this.currentUser?.orgId || `org-${Date.now()}`;
    const bType = restData.businessType || 'RESTAURANT';
    const hasBar = restData.hasBar !== undefined ? restData.hasBar : (bType === 'BAR');
    const hasTables = restData.hasTables !== undefined ? restData.hasTables : true;
    const hasKitchen = restData.hasKitchen !== undefined ? restData.hasKitchen : true;
    const hasWaiter = restData.hasWaiter !== undefined ? restData.hasWaiter : (hasTables !== false);
    const orderPrefix = restData.orderNumberPrefix || (bType === 'FOOD_TRUCK' ? '#F' : '#ORD');

    const newRest: Restaurant = {
      id,
      orgId,
      name: restData.name,
      slug,
      cuisine: restData.cuisine || 'Multi-Cuisine',
      businessType: bType,
      hasBar,
      hasTables,
      hasKitchen,
      hasWaiter,
      orderNumberPrefix: orderPrefix,
      address: restData.address || 'Main Street Center',
      phone: restData.phone || '+1 555-0100',
      email: restData.email || 'contact@dinely.com',
      ownerName: restData.ownerName || this.currentUser?.name || 'Restaurant Owner',
      ownerEmail: restData.ownerEmail || this.currentUser?.email || 'owner@restaurant.com',
      domain: `${slug}.dinely.app`,
      isApproved: false,
      lifecycleStatus: 'DRAFT',
      status: 'CLOSED',
      rating: 5.0,
      activeOrdersCount: 0,
      tablesCount: hasTables ? 8 : 0,
      submittedAt: new Date().toLocaleDateString(),
      theme: {
        restaurantId: id,
        restaurantName: restData.name,
        logo: restData.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
        bannerUrl: restData.theme?.bannerUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
        primaryColor: restData.theme?.primaryColor || '#e11d48',
        secondaryColor: restData.theme?.secondaryColor || '#475569',
        accentColor: '#f59e0b',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        fontFamily: 'sans',
        borderRadius: 'lg',
      },
      features: restData.features || {
        food_service: true,
        cafe: false,
        bar: hasBar,
        bakery: false,
        desserts: true,
        takeaway: true,
        delivery: true,
        reservations: hasTables,
        outdoor_seating: hasTables,
        vip_rooms: false,
      },
    };

    this.restaurants.unshift(newRest);
    this.currentRestaurantId = id;
    if (this.currentUser) {
      this.currentUser.restaurantId = id;
    }

    try {
      const apiBase = this.getApiBaseUrl();
      fetch(`${apiBase}/restaurants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: restData.name,
          cuisine: restData.cuisine || 'Multi-Cuisine',
          businessType: bType,
          phone: restData.phone || '+1 555-0100',
          email: restData.email || 'contact@dinely.com',
          address: restData.address || 'Main Street Center',
          currency: 'INR (₹)',
          taxPercentage: 5.0,
        }),
      }).then(res => {
        if (res.ok) {
          fetch(`${apiBase}/restaurants/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: newRest.theme }),
          });
          if (hasTables) {
            for (let i = 1; i <= 8; i++) {
              const tableNum = i < 10 ? `Table 0${i}` : `Table ${i}`;
              const tableId = `tbl-${id}-table_${i < 10 ? '0' + i : i}`;
              this.createTable({
                id: tableId,
                restaurantId: id,
                tableNumber: tableNum,
                capacity: 4,
                section: i <= 6 ? 'Main Hall' : 'Terrace',
              });
            }
          }
        }
      }).catch(err => console.warn("Notice saving restaurant to backend:", err));
    } catch (e) {}

    this.purgeDemoDataForRestaurant(id);
    this.saveDatabase();
    return newRest;
  }

  public purgeDemoDataForRestaurant(restaurantId: string) {
    this.orders = this.orders.filter((o) => o.restaurantId !== restaurantId);
    this.bills = this.bills.filter((b) => b.restaurantId !== restaurantId);
    this.tableSessions = this.tableSessions.filter((s) => s.restaurantId !== restaurantId);
    this.fulfillmentTickets = this.fulfillmentTickets.filter((f) => f.restaurantId !== restaurantId);
    this.customerRequests = this.customerRequests.filter((c) => c.restaurantId !== restaurantId);
    this.saveDatabase();
  }

  async submitRestaurantLaunch(setupData: any) {
    await delay(400);

    const activeRestId = setupData.id || this.currentRestaurantId || this.currentUser?.restaurantId;
    let existing = this.restaurants.find((r) => r.id === activeRestId);
    const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    if (existing) {
      existing.name = setupData.restaurantName || setupData.name || existing.name;
      existing.cuisine = setupData.cuisine || existing.cuisine;
      if (setupData.businessType) existing.businessType = setupData.businessType;
      if (setupData.hasBar !== undefined) existing.hasBar = setupData.hasBar;
      if (setupData.hasTables !== undefined) existing.hasTables = setupData.hasTables;
      if (setupData.hasKitchen !== undefined) existing.hasKitchen = setupData.hasKitchen;
      if (setupData.hasWaiter !== undefined) existing.hasWaiter = setupData.hasWaiter;
      if (setupData.orderNumberPrefix) existing.orderNumberPrefix = setupData.orderNumberPrefix;
      existing.restaurantType = setupData.restaurantType || existing.restaurantType;
      existing.address = setupData.address || existing.address;
      existing.locality = setupData.locality || existing.locality;
      existing.city = setupData.city || existing.city;
      existing.state = setupData.state || existing.state;
      existing.country = setupData.country || existing.country;
      existing.postalCode = setupData.postalCode || existing.postalCode;
      if (setupData.latitude !== undefined) existing.latitude = setupData.latitude;
      if (setupData.longitude !== undefined) existing.longitude = setupData.longitude;
      if (setupData.placeId) existing.placeId = setupData.placeId;
      existing.phone = setupData.phone || existing.phone;
      existing.email = setupData.email || existing.email;
      existing.currency = setupData.currency || existing.currency;
      existing.timezone = setupData.timezone || existing.timezone;
      existing.indoorTablesCount = setupData.tables?.indoor || setupData.indoorTables || existing.indoorTablesCount || 8;
      existing.outdoorTablesCount = setupData.tables?.outdoor || setupData.outdoorTables || existing.outdoorTablesCount || 4;
      existing.vipTablesCount = setupData.tables?.vip || setupData.vipTables || existing.vipTablesCount || 2;
      existing.tablesCount = (existing.indoorTablesCount || 0) + (existing.outdoorTablesCount || 0) + (existing.vipTablesCount || 0);
      existing.lifecycleStatus = 'PENDING_APPROVAL';
      existing.isApproved = false;
      existing.submittedAt = now;
      existing.rejectionReason = undefined;
      existing.requestedChanges = undefined;

      if (setupData.theme) {
        existing.theme = {
          ...existing.theme,
          logo: setupData.theme.logo || existing.theme?.logo,
          bannerUrl: setupData.theme.banner || setupData.theme.bannerUrl || existing.theme?.bannerUrl,
          primaryColor: setupData.theme.primaryColor || existing.theme?.primaryColor,
          secondaryColor: setupData.theme.secondaryColor || existing.theme?.secondaryColor,
        };
      }

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'PLATFORM_ADMIN',
        restaurantId: existing.id,
        restaurantName: existing.name,
        title: 'New restaurant waiting for approval',
        message: `New restaurant waiting for approval: ${existing.name}. Configuration and floorplan submitted by ${existing.ownerName} (${existing.ownerEmail}).`,
        type: 'LAUNCH_REQUESTED',
        timestamp: 'Just now',
        isRead: false,
      });

      this.saveDatabase();
      return existing;
    }
    return null;
  }

  // --- Platform Admin Control Plane APIs ---

  async getPlatformStats() {
    await delay(100);
    const activeRests = this.restaurants.filter((r) => !r.isDeleted);
    const liveRestaurants = activeRests.filter((r) => r.isApproved || r.lifecycleStatus === 'LIVE').length;
    const pendingApprovals = activeRests.filter((r) => r.lifecycleStatus === 'PENDING_APPROVAL' || !r.isApproved).length;

    return {
      activeTenants: this.organizations.length || (liveRestaurants ? 1 : 0),
      liveRestaurants,
      pendingApprovals,
      totalOrdersProcessed: this.orders.length,
      systemUptimePercent: 99.99,
    };
  }

  async getOrganizations() {
    await delay(100);
    return [...this.organizations];
  }

  async getPendingRestaurants() {
    await delay(100);
    return this.restaurants.filter((r) => !r.isDeleted && (r.lifecycleStatus === 'PENDING_APPROVAL' || !r.isApproved));
  }

  async getAllRestaurants() {
    await delay(100);
    return [...this.restaurants];
  }

  async getRestaurants(): Promise<Restaurant[]> {
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/restaurants`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data.map((r: any) => ({
            id: r.id,
            orgId: r.org_id || 'org-dinely',
            name: r.name,
            slug: r.slug || r.name.toLowerCase().replace(/\s+/g, '-'),
            cuisine: r.cuisine || 'Multi-Cuisine',
            businessType: r.business_type || 'RESTAURANT',
            hasBar: r.has_bar !== false,
            hasTables: r.has_tables !== false,
            hasKitchen: r.has_kitchen !== false,
            hasWaiter: r.has_waiter !== false,
            orderNumberPrefix: r.order_number_prefix || '#ORD',
            address: r.address || '',
            phone: r.phone || '',
            email: r.email || '',
            ownerName: r.owner_name || '',
            ownerEmail: r.owner_email || '',
            domain: r.domain || '',
            isApproved: r.is_approved !== false,
            status: r.status || 'OPEN',
            currency: r.currency || 'INR (₹)',
            taxPercentage: r.tax_percentage || 5.0,
            theme: r.theme_json || {
              primaryColor: '#f43f5e',
              accentColor: '#fbbf24',
              restaurantName: r.name,
              currency: r.currency || 'INR (₹)',
            },
          }));
        }
      }
    } catch (e) {
      console.warn('API fetch for getRestaurants failed:', e);
    }
    return this.restaurants.filter((r) => !r.isDeleted);
  }

  async approveRestaurant(restaurantId: string) {
    await delay(200);
    const rest = this.restaurants.find((r) => r.id === restaurantId || (restaurantId && r.id.toLowerCase() === restaurantId.toLowerCase()));
    if (rest) {
      const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      rest.isApproved = true;
      rest.status = 'OPEN';
      rest.lifecycleStatus = 'APPROVED';
      rest.approvedAt = now;
      rest.rejectionReason = undefined;
      rest.requestedChanges = undefined;

      // Ensure tables entered during setup are created in DB
      const targetId = rest.id;
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dinely.food';
      const totalCount = Math.max(1, rest.tablesCount || (rest.indoorTablesCount || 8) + (rest.outdoorTablesCount || 2));

      let existingTables = (this.tables || []).filter((t) => t.restaurantId === targetId);
      if (existingTables.length === 0) {
        let tableNum = 1;
        const mainCount = Math.ceil(totalCount * 0.75);
        for (let i = 0; i < totalCount; i++) {
          const tName = `Table ${String(tableNum).padStart(2, '0')}`;
          const isOutdoor = i >= mainCount;
          this.tables.push({
            id: `tbl-${targetId}-${tableNum}`,
            restaurantId: targetId,
            tableNumber: tName,
            capacity: 4,
            section: isOutdoor ? 'Patio & Outdoor' : 'Main Dining Hall',
            shape: isOutdoor ? 'ROUND' : 'RECTANGLE',
            status: 'AVAILABLE',
            qrCodeUrl: `${origin}/customer?restaurant=${targetId}&tableId=tbl-${targetId}-${tableNum}&table=${encodeURIComponent(tName)}`,
          });
          tableNum++;
        }
      }

      // Update active tenant pointers and session
      this.currentRestaurantId = rest.id;
      if (this.currentUser) {
        this.currentUser.restaurantId = rest.id;
        this.saveSession(this.currentUser, this.currentUser.tokens || ({} as any), rest.id);
      }

      // Ensure associated owner user is linked to this restaurant
      const user = this.users.find(
        (u) => u.restaurantId === rest.id || (rest.ownerEmail && u.email.toLowerCase() === rest.ownerEmail.toLowerCase())
      );
      if (user) {
        user.restaurantId = rest.id;
      }

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: 'Application Approved! Your Restaurant is Activated 🎉',
        message: `Your restaurant "${rest.name}" has been approved by Dinely Platform Admin. Operational Dashboard & Table Floorplan are now active!`,
        type: 'APPROVED',
        timestamp: 'Just now',
        isRead: false,
      });

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: 'Platform Admin',
        action: 'Approved & Activated Restaurant OS',
        target: rest.name,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });

      this.saveDatabase();
      realtimeBus.emit('RESTAURANT_APPROVED', { restaurantId: rest.id, restaurantName: rest.name });
    }
    return rest;
  }

  async rejectRestaurant(restaurantId: string, reason = 'Application declined by administrator') {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId || (restaurantId && r.id.toLowerCase() === restaurantId.toLowerCase()));
    if (rest) {
      rest.lifecycleStatus = 'REJECTED';
      rest.isApproved = false;
      rest.rejectionReason = reason;

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: 'Restaurant Application Rejected',
        message: `Your application for "${rest.name}" was declined: "${reason}". Please update details and resubmit.`,
        type: 'REJECTED',
        timestamp: 'Just now',
        isRead: false,
      });

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: 'Platform Admin',
        action: 'Rejected Restaurant Application',
        target: rest.name,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });

      this.saveDatabase();
    }
    return rest;
  }

  async requestChangesRestaurant(restaurantId: string, reason: string) {
    return this.rejectRestaurant(restaurantId, reason);
  }

  async suspendRestaurant(restaurantId: string, reason = 'Administrative Suspension') {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.lifecycleStatus = 'SUSPENDED';
      rest.status = 'CLOSED';

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: 'Account Status: Suspended',
        message: `Your restaurant account access has been suspended: "${reason}". Please contact Platform Admin.`,
        type: 'REJECTED',
        timestamp: 'Just now',
        isRead: false,
      });

      this.saveDatabase();
    }
    return rest;
  }

  async activateRestaurant(restaurantId: string) {
    return this.approveRestaurant(restaurantId);
  }

  async deactivateRestaurant(restaurantId: string, reason = 'Deactivated by Admin') {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.lifecycleStatus = 'DEACTIVATED';
      rest.status = 'CLOSED';
      this.saveDatabase();
    }
    return rest;
  }

  async deleteRestaurant(restaurantId: string, reason = 'Permanently soft-deleted by Platform Admin') {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.isDeleted = true;
      rest.lifecycleStatus = 'DELETED';
      rest.status = 'CLOSED';
      rest.deletedAt = new Date().toISOString();
      rest.deletedBy = 'Platform Admin';
      rest.deletedReason = reason;

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: 'Platform Admin',
        action: 'Soft-Deleted Restaurant Record',
        target: rest.name,
        timestamp: 'Just now',
        ipAddress: '10.0.0.1',
        status: 'SUCCESS',
      });

      this.saveDatabase();
    }
    return rest;
  }

  async sendReminder(restaurantId: string, reminderType: string, customMessage?: string) {
    await delay(250);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      const titles: Record<string, string> = {
        PAYMENT: 'Payment Notice from Platform Admin',
        PROFILE: 'Profile Information Required',
        MENU: 'Menu & Pricing Review Notice',
        MAINTENANCE: 'Scheduled Cloud System Maintenance',
        ANNOUNCEMENT: 'Platform General Announcement',
      };

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: titles[reminderType] || 'Message from Platform Admin',
        message: customMessage || `Administrative message regarding your outlet ${rest.name}.`,
        type: 'SYSTEM_ANNOUNCEMENT',
        timestamp: 'Just now',
        isRead: false,
      });

      this.saveDatabase();
    }
    return rest;
  }

  async markNotificationRead(notifId: string) {
    await delay(50);
    const n = this.platformNotifications.find((x) => x.id === notifId);
    if (n) {
      n.isRead = true;
      this.saveDatabase();
    }
  }

  async getPlatformNotifications(role: 'PLATFORM_ADMIN' | 'RESTAURANT_OWNER', restaurantId?: string) {
    await delay(50);
    if (role === 'PLATFORM_ADMIN') {
      return this.platformNotifications.filter((n) => n.recipientRole === 'PLATFORM_ADMIN');
    }
    const targetRestId = restaurantId || this.currentRestaurantId || this.currentUser?.restaurantId;
    return this.platformNotifications.filter(
      (n) => n.recipientRole === 'RESTAURANT_OWNER' && (!targetRestId || n.restaurantId === targetRestId)
    );
  }

  async getAuditLogs() {
    await delay(100);
    return [...this.auditLogs];
  }

  // --- Strict Tenant Scoped Data Getters ---

  private resolveTenantRestaurantId(providedId?: string): string | null {
    if (providedId && String(providedId).trim()) {
      const cleanId = String(providedId).trim();
      const targetRest = this.restaurants.find(
        (r) => !r.isDeleted && (r.id === cleanId || r.slug === cleanId || r.id.toLowerCase() === cleanId.toLowerCase())
      );
      if (targetRest) {
        return targetRest.id;
      }
      return cleanId;
    }

    const scope = getPortalScopeFromPath();
    const user = this.getCurrentUser(scope);

    const scopeRestId = this.currentRestaurantIdsByScope[scope] || user?.restaurantId;
    if (scopeRestId && this.restaurants.some((r) => r.id === scopeRestId && !r.isDeleted)) {
      return scopeRestId;
    }

    if (this._currentRestaurantId && this.restaurants.some((r) => r.id === this._currentRestaurantId && !r.isDeleted)) {
      return this._currentRestaurantId;
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      const activeRestId = localStorage.getItem('dinely_active_restaurant_id') || localStorage.getItem('dinely_restaurant_id');
      if (activeRestId && this.restaurants.some((r) => r.id === activeRestId && !r.isDeleted)) {
        return activeRestId;
      }
    }

    return this.restaurants.find((r) => !r.isDeleted)?.id || null;
  }

  private ensureRestaurantDefaults(rest: Restaurant): Restaurant {
    if (!rest.businessType) {
      rest.businessType = rest.features?.bar ? 'BAR' : 'RESTAURANT';
    }
    if (rest.hasBar === undefined) {
      rest.hasBar = rest.businessType === 'BAR' || Boolean(rest.features?.bar);
    }
    if (rest.hasKitchen === undefined) {
      rest.hasKitchen = true;
    }
    if (rest.hasTables === undefined) {
      rest.hasTables = true;
    }
    if (rest.hasWaiter === undefined) {
      rest.hasWaiter = rest.hasTables !== false;
    }
    if (!rest.orderNumberPrefix) {
      rest.orderNumberPrefix = rest.businessType === 'FOOD_TRUCK' ? '#F' : '#ORD';
    }
    if (rest.taxPercentage === undefined) {
      rest.taxPercentage = 5.0;
    }
    return rest;
  }



  async syncRestaurantToBackend(rest: Restaurant) {
    if (!rest || !rest.id) return;
    try {
      const apiBase = getApiBaseUrl();
      const payload = {
        id: rest.id,
        name: rest.name,
        cuisine: rest.cuisine || 'Multi-Cuisine',
        businessType: rest.businessType || 'RESTAURANT',
        phone: rest.phone || '+1 555-0100',
        email: rest.email || 'contact@dinely.food',
        address: rest.address || 'Main Street Center',
        currency: rest.currency || 'INR (₹)',
        taxPercentage: rest.taxPercentage || 5.0,
      };
      const res = await fetch(`${apiBase}/restaurants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        if (rest.theme) {
          await fetch(`${apiBase}/restaurants/${encodeURIComponent(rest.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme: rest.theme }),
          });
        }

        // Sync Categories
        const cats = (this.categories || []).filter((c) => c.restaurantId === rest.id);
        for (const cat of cats) {
          await fetch(`${apiBase}/restaurants/${encodeURIComponent(rest.id)}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: cat.id, name: cat.name, sortOrder: cat.sortOrder || 1 }),
          });
        }

        // Sync Menu Items
        const items = (this.menuItems || []).filter((m) => m.restaurantId === rest.id);
        for (const item of items) {
          await fetch(`${apiBase}/restaurants/${encodeURIComponent(rest.id)}/menu`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: item.id,
              categoryId: item.categoryId || 'cat-mains',
              name: item.name,
              description: item.description || '',
              price: item.price || 0,
              imageUrl: item.imageUrl || item.image,
              isAvailable: item.isAvailable !== false,
              isVegetarian: item.isVegetarian !== false,
              targetDestination: item.targetDestination || 'KITCHEN',
            }),
          });
        }

        // Sync Tables
        const tbls = (this.tables || []).filter((t) => t.restaurantId === rest.id);
        for (const t of tbls) {
          await fetch(`${apiBase}/restaurants/${encodeURIComponent(rest.id)}/tables`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: t.id,
              tableNumber: t.tableNumber,
              section: t.section || 'Main Hall',
              capacity: t.capacity || 4,
            }),
          });
        }
      }
    } catch (e) {
      console.warn('syncRestaurantToBackend notice:', e);
    }
  }

  async getRestaurantDetails(restaurantId?: string) {
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return null;

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          const mappedRest: Restaurant = {
            id: data.id,
            orgId: data.org_id || 'org-dinely',
            name: data.name,
            slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
            cuisine: data.cuisine || 'Multi-Cuisine',
            businessType: data.business_type || 'RESTAURANT',
            hasBar: data.has_bar !== false,
            hasTables: data.has_tables !== false,
            hasKitchen: data.has_kitchen !== false,
            hasWaiter: data.has_waiter !== false,
            orderNumberPrefix: data.order_number_prefix || '#ORD',
            address: data.address || '',
            phone: data.phone || '',
            email: data.email || '',
            ownerName: data.owner_name || '',
            ownerEmail: data.owner_email || '',
            domain: data.domain || '',
            isApproved: data.is_approved !== false,
            status: data.status || 'OPEN',
            currency: data.currency || 'INR (₹)',
            taxPercentage: data.tax_percentage || 5.0,
            theme: data.theme_json || {
              primaryColor: '#f43f5e',
              accentColor: '#fbbf24',
              restaurantName: data.name,
              currency: data.currency || 'INR (₹)',
            },
          };
          return this.ensureRestaurantDefaults(mappedRest);
        }
      }
    } catch (e) {
      console.warn('API fetch for restaurant details failed, using synchronized multi-tenant store:', e);
    }

    let rest = this.restaurants.find((r) => !r.isDeleted && (r.id === targetId || r.slug === targetId || r.id.toLowerCase() === targetId.toLowerCase()));
    
    if (!rest) {
      rest = GLOBAL_MULTI_TENANT_RESTAURANTS.find((r) => !r.isDeleted && (r.id === targetId || r.slug === targetId || r.id.toLowerCase() === targetId.toLowerCase()));
    }
    
    if (!rest && targetId && (targetId.startsWith('rest-') || targetId.startsWith('rest_'))) {
      let displayName = 'CAFE.CO';
      if (targetId.includes('bistro')) displayName = 'Lumière Bistro';
      else if (targetId.includes('bar')) displayName = 'Vanguard Lounge & Bar';

      rest = {
        id: targetId,
        slug: targetId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        name: displayName,
        ownerEmail: 'owner@dinely.food',
        email: 'contact@dinely.food',
        phone: '+1 (555) 234-5678',
        address: '123 Gourmet Way, Culinary District',
        city: 'Metropolis',
        state: 'NY',
        zipCode: '10001',
        country: 'United States',
        currency: 'INR (₹)',
        taxPercentage: 5.0,
        isApproved: true,
        isAutoApproved: true,
        lifecycleStatus: 'APPROVED',
        businessType: 'RESTAURANT',
        hasTables: true,
        hasWaiter: true,
        hasKitchen: true,
        hasBar: true,
        createdAt: new Date().toISOString(),
        theme: {
          primaryColor: '#f43f5e',
          accentColor: '#fbbf24',
          mode: 'dark',
          fontFamily: 'Inter',
          restaurantName: displayName,
          bannerUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
          logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&auto=format&fit=crop&q=80',
          currency: 'INR (₹)',
        },
      };
      this.restaurants.push(rest);
      GLOBAL_MULTI_TENANT_RESTAURANTS.push(rest);
      this.saveDatabase();
    }

    if (!rest) return null;

    this.syncRestaurantToBackend(rest).catch(() => {});

    const scope = getPortalScopeFromPath();
    if (scope !== 'CUSTOMER') {
      const user = this.getCurrentUser(scope);
      if (user && user.role === 'RESTAURANT_OWNER') {
        const isOwner = rest.ownerEmail?.toLowerCase() === user.email?.toLowerCase() || rest.email?.toLowerCase() === user.email?.toLowerCase();
        if (!isOwner && user.role !== 'SUPER_ADMIN' && user.role !== 'PLATFORM_ADMIN') {
          return null;
        }
      }
    }

    return this.ensureRestaurantDefaults(rest);
  }

  async updateRestaurantDetails(restaurantId: string, updates: Partial<Restaurant>) {
    await delay(200);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    const rest = this.restaurants.find((r) => r.id === targetId && !r.isDeleted);
    if (rest) {
      Object.assign(rest, updates);
      this.ensureRestaurantDefaults(rest);
      this.saveDatabase();
    }
    return rest;
  }

  async getOwnerRestaurants(ownerEmail?: string) {
    await delay(100);
    const scope = getPortalScopeFromPath();
    const user = this.getCurrentUser(scope);
    const active = this.restaurants.filter((r) => !r.isDeleted).map((r) => this.ensureRestaurantDefaults(r));
    const email = (ownerEmail || user?.email || '').trim().toLowerCase();
    if (!email) return [];
    const myRests = active.filter(
      (r) => r.ownerEmail?.toLowerCase() === email || r.email?.toLowerCase() === email || r.id === user?.restaurantId
    );
    return myRests;
  }

  async getOrders(restaurantId?: string): Promise<Order[]> {
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/orders/restaurant/${encodeURIComponent(targetId)}`);
      if (res.ok) {
        const rawOrds = await res.json();
        if (Array.isArray(rawOrds) && rawOrds.length > 0) {
          const remoteOrds: Order[] = rawOrds.map((data: any) => ({
            id: data.id,
            restaurantId: data.restaurant_id || targetId,
            tableId: data.table_id,
            tableNumber: data.table_number,
            tableSessionId: data.table_session_id,
            status: data.status || 'PENDING',
            kitchenStatus: data.kitchen_status || 'PENDING',
            barStatus: data.bar_status || 'PENDING',
            customerName: data.customer_name || 'Guest',
            notes: data.notes || '',
            items: (data.items_json || []).map((i: any) => ({
              id: i.id || `oi-${data.id}`,
              menuItemId: i.menuItemId || i.menu_item_id || i.id,
              name: i.name,
              quantity: i.quantity,
              price: typeof i.price === 'number' ? i.price : parseFloat(i.price) || 0,
              notes: i.notes || '',
              targetDestination: i.targetDestination || 'KITCHEN',
            })),
            totalAmount: data.total_amount || 0,
            paymentStatus: data.payment_status || 'UNPAID',
            createdAt: data.created_at || new Date().toISOString(),
          }));

          remoteOrds.forEach((ro) => {
            const idx = this.orders.findIndex((o) => o.id === ro.id);
            if (idx >= 0) this.orders[idx] = ro;
            else this.orders.push(ro);
          });
          this.saveDatabase();
          return remoteOrds;
        }
      }
    } catch (e) {
      console.warn('API fetch for getOrders failed:', e);
    }

    this.loadDatabase();
    return this.orders.filter((o) => o.restaurantId === targetId);
  }

  async getCustomerOrders(restaurantId?: string, tableId?: string, tableSessionId?: string): Promise<Order[]> {
    const targetRestId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetRestId || !tableSessionId) return [];

    try {
      const apiBase = getApiBaseUrl();
      const resolvedTblId = tableId || `tbl-${targetRestId}`;
      const url = `${apiBase}/orders/customer?restaurant_id=${encodeURIComponent(targetRestId)}&table_id=${encodeURIComponent(resolvedTblId)}&table_session_id=${encodeURIComponent(tableSessionId)}`;
      const res = await fetch(url);
      if (res.ok) {
        const rawOrds = await res.json();
        if (Array.isArray(rawOrds)) {
          const remoteOrds: Order[] = rawOrds.map((data: any) => ({
            id: data.id,
            restaurantId: data.restaurant_id || targetRestId,
            tableId: data.table_id || tableId,
            tableNumber: data.table_number,
            tableSessionId: data.table_session_id || tableSessionId,
            status: data.status || 'PENDING',
            kitchenStatus: data.kitchen_status || 'PENDING',
            barStatus: data.bar_status || 'PENDING',
            customerName: data.customer_name || 'Guest',
            notes: data.notes || '',
            items: (data.items_json || []).map((i: any) => ({
              id: i.id || `oi-${data.id}`,
              menuItemId: i.menuItemId || i.menu_item_id || i.id,
              name: i.name,
              quantity: i.quantity,
              price: typeof i.price === 'number' ? i.price : parseFloat(i.price) || 0,
              notes: i.notes || '',
              targetDestination: i.targetDestination || 'KITCHEN',
            })),
            totalAmount: data.total_amount || 0,
            paymentStatus: data.payment_status || 'UNPAID',
            createdAt: data.created_at || new Date().toISOString(),
          }));
          return remoteOrds;
        }
      }
    } catch (e) {
      console.warn('API GET for customer orders failed:', e);
    }

    this.loadDatabase();
    const activeSession = this.tableSessions.find(
      (s) => s.restaurantId === targetRestId && s.id === tableSessionId && s.status !== 'CLOSED'
    );
    if (!activeSession) {
      return [];
    }

    const filtered = this.orders.filter((o) => {
      if (o.restaurantId !== targetRestId) return false;
      if (o.tableSessionId !== tableSessionId) return false;
      if (o.status === 'CANCELLED') return false;

      if (tableId) {
        if (o.tableId && o.tableId === tableId) return true;
        if (o.tableNumber && matchTableNumber(o.tableNumber, tableId)) return true;
      }
      return true;
    });

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return filtered;
  }

  async getFulfillmentTickets(restaurantId?: string, station?: 'KITCHEN' | 'BAR') {
    this.loadDatabase();
    await delay(50);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];

    this.ensureFulfillmentTickets(targetId);

    return this.fulfillmentTickets.filter(
      (t) => t.restaurantId === targetId && (!station || t.station === station)
    );
  }

  private ensureFulfillmentTickets(restaurantId: string) {
    const ordersForRest = this.orders.filter((o) => o.restaurantId === restaurantId);
    ordersForRest.forEach((o) => {
      const kitchenItems = o.items.filter((i) => getFulfillmentStation(i) === 'KITCHEN');
      const barItems = o.items.filter((i) => getFulfillmentStation(i) === 'BAR');

      if (kitchenItems.length > 0) {
        const existingK = this.fulfillmentTickets.find(
          (t) => t.parentOrderId === o.id && t.station === 'KITCHEN'
        );
        if (!existingK) {
          this.fulfillmentTickets.push({
            id: `K-TICKET-${o.id}`,
            parentOrderId: o.id,
            restaurantId: o.restaurantId,
            tableNumber: o.tableNumber,
            tableSessionId: o.tableSessionId,
            station: 'KITCHEN',
            status: (o.kitchenStatus as any) || (o.status === 'READY' ? 'READY' : o.status === 'PREPARING' ? 'PREPARING' : 'PENDING'),
            items: kitchenItems,
            createdAt: o.createdAt,
            updatedAt: o.updatedAt,
            customerName: o.customerName,
            orderType: o.orderType,
          });
        }
      }

      if (barItems.length > 0) {
        const existingB = this.fulfillmentTickets.find(
          (t) => t.parentOrderId === o.id && t.station === 'BAR'
        );
        if (!existingB) {
          this.fulfillmentTickets.push({
            id: `B-TICKET-${o.id}`,
            parentOrderId: o.id,
            restaurantId: o.restaurantId,
            tableNumber: o.tableNumber,
            tableSessionId: o.tableSessionId,
            station: 'BAR',
            status: (o.barStatus as any) || (o.status === 'READY' ? 'READY' : o.status === 'PREPARING' ? 'PREPARING' : 'PENDING'),
            items: barItems,
            createdAt: o.createdAt,
            updatedAt: o.updatedAt,
            customerName: o.customerName,
            orderType: o.orderType,
          });
        }
      }
    });
    this.saveDatabase();
  }

  async updateFulfillmentTicketStatus(
    ticketIdOrOrderId: string,
    status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED',
    station?: 'KITCHEN' | 'BAR'
  ) {
    await delay(100);
    const ticket = this.fulfillmentTickets.find((t) => {
      if (t.id === ticketIdOrOrderId) return true;
      if (t.parentOrderId === ticketIdOrOrderId) {
        if (station) return t.station === station;
        return true;
      }
      return false;
    });

    if (!ticket) return null;

    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();
    if (status === 'COMPLETED') {
      ticket.completedAt = new Date().toISOString();
    }

    const parentOrder = this.orders.find((o) => o.id === ticket.parentOrderId);
    if (parentOrder) {
      if (ticket.station === 'KITCHEN') {
        parentOrder.kitchenStatus = status;
        if (status === 'COMPLETED') parentOrder.kitchenCompletedAt = new Date().toISOString();
      } else if (ticket.station === 'BAR') {
        parentOrder.barStatus = status;
        if (status === 'COMPLETED') parentOrder.barCompletedAt = new Date().toISOString();
      }

      const orderTickets = this.fulfillmentTickets.filter((t) => t.parentOrderId === parentOrder.id);
      const allReady = orderTickets.every((t) => t.status === 'READY' || t.status === 'COMPLETED');
      const allCompleted = orderTickets.every((t) => t.status === 'COMPLETED');

      if (allCompleted) {
        parentOrder.status = 'COMPLETED';
      } else if (allReady) {
        parentOrder.status = 'READY';
        parentOrder.readyAt = new Date().toISOString();
      } else if (orderTickets.some((t) => t.status === 'PREPARING' || t.status === 'ACCEPTED')) {
        if (parentOrder.status !== 'READY' && parentOrder.status !== 'DELIVERED' && parentOrder.status !== 'COMPLETED') {
          parentOrder.status = 'PREPARING';
        }
      }
      parentOrder.updatedAt = new Date().toISOString();
    }

    this.saveDatabase();

    realtimeBus.emit('FulfillmentTicketUpdated' as any, {
      ticketId: ticket.id,
      parentOrderId: ticket.parentOrderId,
      restaurantId: ticket.restaurantId,
      station: ticket.station,
      status: ticket.status,
      data: ticket,
    });

    if (ticket.station === 'BAR') {
      realtimeBus.emit('BarStatusUpdated' as any, {
        orderId: ticket.parentOrderId,
        restaurantId: ticket.restaurantId,
        barStatus: status,
        data: parentOrder,
      });
    } else {
      realtimeBus.emit('KitchenStatusUpdated' as any, {
        orderId: ticket.parentOrderId,
        restaurantId: ticket.restaurantId,
        kitchenStatus: status,
        data: parentOrder,
      });
    }

    return ticket;
  }

  async getMenuItems(restaurantId?: string): Promise<MenuItem[]> {
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/menu`);
      if (res.ok) {
        const data = await res.json();
        const rawItems = data.items || (Array.isArray(data) ? data : []);
        if (Array.isArray(rawItems) && rawItems.length > 0) {
          return rawItems.map((m: any) => ({
            id: m.id,
            restaurantId: m.restaurant_id || targetId,
            categoryId: m.category_id || m.categoryId,
            name: m.name,
            description: m.description || '',
            price: typeof m.price === 'number' ? m.price : parseFloat(m.price) || 0,
            imageUrl: m.image_url || m.imageUrl || m.image,
            image: m.image_url || m.imageUrl || m.image,
            isAvailable: m.is_available !== false,
            isVegetarian: m.is_vegetarian !== false,
            dietaryType: m.dietary_type || (m.is_vegetarian !== false ? 'VEG' : 'NON_VEG'),
            targetDestination: m.target_destination || 'KITCHEN',
            isAlcoholic: m.is_alcoholic || m.target_destination === 'BAR',
            prepTimeMinutes: m.prep_time_minutes || 15,
          }));
        }
      }
    } catch (e) {
      console.warn('API fetch for menu items failed:', e);
    }

    let foodItems = [...(this.menuItems || []), ...GLOBAL_MULTI_TENANT_MENU_ITEMS]
      .filter((m) => m.restaurantId === targetId)
      .map((m) => {
        const station = getFulfillmentStation(m);
        return {
          ...m,
          targetDestination: m.targetDestination || station,
          isAlcoholic: m.isAlcoholic || station === 'BAR',
        };
      });

    const barItems = (this.barMenuItems || [])
      .filter((bm) => bm.restaurantId === targetId)
      .map((bm) => ({
        id: bm.id,
        restaurantId: bm.restaurantId,
        name: bm.name,
        description: bm.description,
        price: bm.price,
        categoryId: bm.categoryId,
        barCategory: bm.categoryId as any,
        brand: bm.brand,
        image: bm.image || 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600',
        isAvailable: bm.isAvailable !== false,
        isVegetarian: true,
        dietaryType: 'VEG' as const,
        targetDestination: 'BAR' as const,
        isAlcoholic: bm.isAlcoholic !== false,
        alcoholPercentage: bm.alcoholPercentage,
        bottleSize: bm.bottleSize,
        prepTimeMinutes: bm.prepTimeMinutes || 5,
      }));

    const foodItemIds = new Set(foodItems.map((f) => f.id));
    const uniqueBarItems = barItems.filter((b) => !foodItemIds.has(b.id));

    const combined = [...foodItems, ...uniqueBarItems];
    const uniqueMap = new Map<string, MenuItem>();
    combined.forEach((item) => uniqueMap.set(item.id, item));
    return Array.from(uniqueMap.values());
  }

  async getCategories(restaurantId?: string): Promise<MenuCategory[]> {
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/categories`);
      if (res.ok) {
        const cats = await res.json();
        if (Array.isArray(cats) && cats.length > 0) {
          return cats.map((c: any) => ({
            id: c.id,
            restaurantId: c.restaurant_id || targetId,
            name: c.name,
            sortOrder: c.sort_order || 1,
            isEnabled: c.is_enabled !== false,
          }));
        }
      }
    } catch (e) {
      console.warn('API fetch for categories failed:', e);
    }

    const allCats = [...(this.categories || []), ...GLOBAL_MULTI_TENANT_CATEGORIES].filter((c) => c.restaurantId === targetId);
    const uniqueMap = new Map<string, MenuCategory>();
    allCats.forEach((c) => uniqueMap.set(c.id, c));
    return Array.from(uniqueMap.values());
  }

  async createCategory(catData: Partial<MenuCategory>): Promise<MenuCategory> {
    const restId = this.resolveTenantRestaurantId(catData.restaurantId) || 'rest-1';
    try {
      const apiBase = getApiBaseUrl();
      const payload = {
        id: catData.id,
        name: catData.name || 'New Category',
        sortOrder: catData.sortOrder || 1,
      };
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(restId)}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const c = await res.json();
        const newCat: MenuCategory = {
          id: c.id,
          restaurantId: c.restaurant_id || restId,
          name: c.name,
          sortOrder: c.sort_order || 1,
          isEnabled: c.is_enabled !== false,
        };
        this.categories.push(newCat);
        this.saveDatabase();
        return newCat;
      }
    } catch (e) {
      console.warn('API POST for createCategory failed:', e);
    }
    const newCat: MenuCategory = {
      id: catData.id || `cat-${restId}-${Date.now()}`,
      restaurantId: restId,
      name: catData.name || 'New Category',
      sortOrder: catData.sortOrder || 1,
      isEnabled: true,
    };
    this.categories.push(newCat);
    this.saveDatabase();
    return newCat;
  }

  async addMenuItem(itemData: Partial<MenuItem>) {
    return this.createMenuItem(itemData);
  }

  async createMenuItem(itemData: Partial<MenuItem>): Promise<MenuItem> {
    const restId = this.resolveTenantRestaurantId(itemData.restaurantId) || 'rest-1';

    try {
      const apiBase = getApiBaseUrl();
      const payload = {
        id: itemData.id,
        categoryId: itemData.categoryId || 'cat-mains',
        name: itemData.name || 'New Menu Item',
        description: itemData.description || '',
        price: typeof itemData.price === 'number' ? itemData.price : parseFloat(itemData.price as any) || 0,
        imageUrl: itemData.imageUrl || itemData.image,
        isAvailable: itemData.isAvailable !== false,
        isVegetarian: itemData.isVegetarian !== false,
        targetDestination: itemData.targetDestination || 'KITCHEN',
      };

      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(restId)}/menu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const m = await res.json();
        if (m && m.id) {
          const newItem: MenuItem = {
            id: m.id,
            restaurantId: m.restaurant_id || restId,
            categoryId: m.category_id || payload.categoryId,
            name: m.name,
            description: m.description || '',
            price: typeof m.price === 'number' ? m.price : parseFloat(m.price) || 0,
            imageUrl: m.image_url || payload.imageUrl,
            image: m.image_url || payload.imageUrl,
            isAvailable: m.is_available !== false,
            isVegetarian: m.is_vegetarian !== false,
            dietaryType: m.dietary_type || (m.is_vegetarian !== false ? 'VEG' : 'NON_VEG'),
            targetDestination: m.target_destination || 'KITCHEN',
          };
          this.menuItems.unshift(newItem);
          this.saveDatabase();
          realtimeBus.emit('MenuItemCreated' as any, { menuItemId: newItem.id, restaurantId: restId, data: newItem });
          return newItem;
        }
      }
    } catch (e) {
      console.warn('API POST for createMenuItem failed:', e);
    }

    let catId = itemData.categoryId;
    const existingCats = await this.getCategories(restId);
    if (catId) {
      const matchedCat = existingCats.find((c) => c.id === catId || c.name === catId);
      if (matchedCat) catId = matchedCat.id;
    }
    if (!catId && existingCats.length > 0) {
      catId = existingCats[0].id;
    }

    const newItem: MenuItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      restaurantId: restId,
      name: itemData.name || 'New Menu Item',
      description: itemData.description || '',
      price: typeof itemData.price === 'number' ? itemData.price : parseFloat(itemData.price as any) || 0,
      categoryId: catId || 'cat-mains',
      barCategory: itemData.barCategory,
      brand: itemData.brand,
      isAvailable: itemData.isAvailable !== false,
      isVegetarian: itemData.isVegetarian !== false,
      dietaryType: itemData.isVegetarian ? 'VEG' : 'NON_VEG',
      image: itemData.image || itemData.imageUrl || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600',
      imageUrl: itemData.imageUrl || itemData.image || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600',
      targetDestination: itemData.targetDestination || 'KITCHEN',
      isAlcoholic: !!itemData.isAlcoholic,
      prepTimeMinutes: itemData.prepTimeMinutes || 15,
    };

    this.menuItems.unshift(newItem);
    this.saveDatabase();
    realtimeBus.emit('MenuItemCreated' as any, { menuItemId: newItem.id, restaurantId: restId, data: newItem });
    return newItem;
  }

  async updateMenuItem(itemId: string, updates: Partial<MenuItem>) {
    const item = this.menuItems.find((m) => m.id === itemId) || GLOBAL_MULTI_TENANT_MENU_ITEMS.find((m) => m.id === itemId);
    const restId = item?.restaurantId || this.resolveTenantRestaurantId();

    if (restId) {
      try {
        const apiBase = getApiBaseUrl();
        const payload = {
          name: updates.name,
          description: updates.description,
          price: updates.price,
          categoryId: updates.categoryId,
          imageUrl: updates.imageUrl || updates.image,
          isAvailable: updates.isAvailable,
          isVegetarian: updates.isVegetarian,
          targetDestination: updates.targetDestination,
        };
        await fetch(`${apiBase}/restaurants/${encodeURIComponent(restId)}/menu/${encodeURIComponent(itemId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.warn('API PUT for updateMenuItem failed:', e);
      }
    }

    if (item) {
      Object.assign(item, updates);
      if (updates.isVegetarian !== undefined) {
        item.dietaryType = updates.isVegetarian ? 'VEG' : 'NON_VEG';
      }
      this.saveDatabase();
      realtimeBus.emit('MenuItemUpdated' as any, { menuItemId: item.id, restaurantId: item.restaurantId, data: item });
    }
    return item;
  }

  async deleteMenuItem(itemId: string) {
    const target = this.menuItems.find((m) => m.id === itemId) || GLOBAL_MULTI_TENANT_MENU_ITEMS.find((m) => m.id === itemId);
    const restId = target?.restaurantId || this.resolveTenantRestaurantId();

    if (restId) {
      try {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/restaurants/${encodeURIComponent(restId)}/menu/${encodeURIComponent(itemId)}`, {
          method: 'DELETE',
        });
      } catch (e) {
        console.warn('API DELETE for deleteMenuItem failed:', e);
      }
    }

    this.menuItems = this.menuItems.filter((m) => m.id !== itemId);
    this.saveDatabase();
    if (restId) {
      realtimeBus.emit('MenuItemDeleted' as any, { menuItemId: itemId, restaurantId: restId });
    }
    return true;
  }

  async toggleMenuItemAvailability(itemId: string) {
    const item = this.menuItems.find((m) => m.id === itemId) || GLOBAL_MULTI_TENANT_MENU_ITEMS.find((m) => m.id === itemId);
    if (item) {
      const newAvail = !item.isAvailable;
      return this.updateMenuItem(itemId, { isAvailable: newAvail });
    }
    return item;
  }

  async getTables(restaurantId?: string): Promise<Table[]> {
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/tables`);
      if (res.ok) {
        const tables = await res.json();
        if (Array.isArray(tables) && tables.length > 0) {
          const origin = getProductionOrigin();
          return tables.map((t: any) => ({
            id: t.id,
            restaurantId: t.restaurant_id || targetId,
            tableNumber: t.table_number || t.tableNumber,
            section: t.section || 'Main Hall',
            capacity: t.capacity || 4,
            status: t.status || 'AVAILABLE',
            isOccupied: t.is_occupied || false,
            qrCodeUrl: t.qr_code_url || `${origin}/customer?restaurant=${targetId}&tableId=${t.id}&table=${encodeURIComponent(t.table_number || t.tableNumber)}`,
          }));
        }
      }
    } catch (e) {
      console.warn('API fetch for tables failed:', e);
    }

    let restTables = [...(this.tables || []), ...GLOBAL_MULTI_TENANT_TABLES].filter((t) => t.restaurantId === targetId);
    const uniqueMap = new Map<string, Table>();
    restTables.forEach((t) => uniqueMap.set(t.id, t));
    return Array.from(uniqueMap.values());
  }

  async getInventory(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    return this.inventory.filter((i) => i.restaurantId === targetId);
  }

  async updateRestaurantTheme(restaurantId: string, theme: ThemeConfig) {
    await delay(100);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.theme = theme;
      this.saveDatabase();
    }
    return theme;
  }

  async resubmitRestaurantLaunch(restaurantId: string) {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.lifecycleStatus = 'PENDING_APPROVAL';
      rest.isApproved = false;
      rest.rejectionReason = undefined;
      rest.requestedChanges = undefined;
      this.saveDatabase();
    }
    return rest;
  }

  async switchActiveRestaurant(restId: string, scope?: PortalScope) {
    await delay(100);
    this.currentRestaurantId = restId;

    const scopes: PortalScope[] = ['ADMIN', 'OWNER', 'STAFF', 'CUSTOMER'];
    for (const s of scopes) {
      this.currentRestaurantIdsByScope[s] = restId;
      if (this.currentUsersByScope[s]) {
        this.currentUsersByScope[s]!.restaurantId = restId;
        this.saveSession(this.currentUsersByScope[s]!, this.currentTokensByScope[s] || ({} as any), restId, s);
      }
    }

    const currUser = this.getCurrentUser();
    if (currUser) {
      currUser.restaurantId = restId;
      const uIdx = this.users.findIndex((u) => u.email?.toLowerCase() === currUser.email?.toLowerCase());
      if (uIdx >= 0) {
        this.users[uIdx].restaurantId = restId;
      }
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('dinely_active_restaurant_id', restId);
      window.localStorage.setItem('dinely_restaurant_id', restId);
    }

    this.saveDatabase();
    realtimeBus.emit('RestaurantSwitched' as any, { restaurantId: restId });
    return this.getRestaurantDetails(restId);
  }

  async createNewBranchOutlet(data: { name: string; branchName: string; city: string; address: string; phone: string; cuisine: string }) {
    await delay(300);
    const rest = await this.createRestaurantForOwner({
      name: data.name,
      cuisine: data.cuisine,
      address: data.address,
      phone: data.phone,
      email: this.currentUser?.email || 'owner@restaurant.com',
      ownerName: this.currentUser?.name || 'Restaurant Owner',
      ownerEmail: this.currentUser?.email || 'owner@restaurant.com',
    });
    rest.branchName = data.branchName;
    rest.city = data.city;
    this.saveDatabase();
    return rest;
  }

  // Table Management APIs
  async createTable(tableData: Partial<Table>): Promise<Table> {
    const targetRestId = this.resolveTenantRestaurantId(tableData.restaurantId);
    const tblNum = tableData.tableNumber || `Table ${this.tables.length + 1}`;
    const tId = tableData.id || (targetRestId ? `tbl-${targetRestId}-${tblNum.toLowerCase().replace(/\s+/g, '_')}` : `tbl-${Date.now()}`);

    if (targetRestId) {
      try {
        const apiBase = getApiBaseUrl();
        const payload = {
          id: tId,
          tableNumber: tblNum,
          section: tableData.section || 'Main Hall',
          capacity: tableData.capacity || 4,
        };
        const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetRestId)}/tables`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const t = await res.json();
          const origin = getProductionOrigin();
          const mapped: Table = {
            id: t.id,
            restaurantId: t.restaurant_id || targetRestId,
            tableNumber: t.table_number || tblNum,
            section: t.section || 'Main Hall',
            capacity: t.capacity || 4,
            status: t.status || 'AVAILABLE',
            isOccupied: t.is_occupied || false,
            qrCodeUrl: t.qr_code_url || `${origin}/customer?restaurant=${targetRestId}&tableId=${t.id}&table=${encodeURIComponent(t.table_number || tblNum)}`,
          };
          const existingIdx = this.tables.findIndex((x) => x.id === mapped.id);
          if (existingIdx >= 0) this.tables[existingIdx] = mapped;
          else this.tables.push(mapped);
          this.saveDatabase();
          return mapped;
        }
      } catch (e) {
        console.warn('API POST for createTable failed:', e);
      }
    }

    const origin = getProductionOrigin();
    const newTable: Table = {
      id: tId,
      restaurantId: targetRestId || 'rest-1787446097984',
      tableNumber: tblNum,
      capacity: tableData.capacity || 4,
      section: tableData.section || 'Main Hall',
      shape: tableData.shape || 'RECTANGLE',
      status: 'AVAILABLE',
      qrCodeUrl: `${origin}/customer?restaurant=${targetRestId || ''}&tableId=${tId}&table=${encodeURIComponent(tblNum)}`,
      isVip: tableData.isVip || false,
    };
    this.tables.push(newTable);
    this.saveDatabase();
    return newTable;
  }

  async updateTable(tableId: string, updates: Partial<Table>) {
    await delay(150);
    const table = this.tables.find((t) => t.id === tableId);
    if (table) {
      Object.assign(table, updates);
      this.saveDatabase();
    }
    return table;
  }

  async deleteTable(tableId: string) {
    await delay(150);
    this.tables = this.tables.filter((t) => t.id !== tableId);
    this.saveDatabase();
  }

  async mergeTables(tableIds: string[], customLabel?: string) {
    await delay(200);
    const mergedId = `grp-${Date.now()}`;
    const label = customLabel || `Merged Group (${tableIds.length} Tables)`;
    this.tables.forEach((t) => {
      if (tableIds.includes(t.id)) {
        t.status = 'MERGED';
        t.isMerged = true;
        t.mergedGroupId = mergedId;
        t.mergedGroupLabel = label;
        t.mergedWithIds = tableIds.filter((x) => x !== t.id);
      }
    });
    this.saveDatabase();
  }

  async unmergeTables(tableIds: string[]) {
    await delay(200);
    this.tables.forEach((t) => {
      if (tableIds.includes(t.id)) {
        t.status = 'AVAILABLE';
        t.isMerged = false;
        t.mergedGroupId = undefined;
        t.mergedGroupLabel = undefined;
        t.mergedWithIds = undefined;
      }
    });
    this.saveDatabase();
  }

  async reserveTable(tableId: string, details: { reservedForName: string; reservedForPhone?: string; reservationTime: string; partySize: number; notes?: string }) {
    await delay(200);
    const table = this.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'RESERVED';
      table.reservationDetails = details;
      this.saveDatabase();
    }
    return table;
  }

  async cancelTableReservation(tableId: string) {
    await delay(150);
    const table = this.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'AVAILABLE';
      table.reservationDetails = undefined;
      this.saveDatabase();
    }
    return table;
  }

  async checkInReservedTable(tableId: string) {
    await delay(150);
    const table = this.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'OCCUPIED';
      this.saveDatabase();
    }
    return table;
  }

  async updateTableStatus(tableId: string, status: any, updatedBy?: any) {
    await delay(100);
    const table = this.tables.find((t) => t.id === tableId || t.tableNumber?.toLowerCase() === tableId.toLowerCase());
    if (table) {
      table.status = status;
      if (status === 'OCCUPIED') {
        table.isOccupied = true;
        table.sessionStartedAt = table.sessionStartedAt || new Date().toISOString();
      } else if (status === 'AVAILABLE') {
        table.isOccupied = false;
        table.sessionStartedAt = undefined;
        table.reservationDetails = undefined;
      }
      this.saveDatabase();
      realtimeBus.emit('TableStatusUpdated' as any, {
        tableId: table.id,
        restaurantId: table.restaurantId,
        tableNumber: table.tableNumber,
        status: table.status,
        data: table,
      });
      realtimeBus.emit('TableStatusChanged' as any, {
        tableId: table.id,
        restaurantId: table.restaurantId,
        tableNumber: table.tableNumber,
        status: table.status,
        data: table,
      });
    }
    return table;
  }

  // --- Table Session Management ---
  async getActiveTableSessions(restaurantId?: string) {
    this.loadDatabase();
    await delay(50);
    const restId = this.resolveTenantRestaurantId(restaurantId);
    return this.tableSessions.filter((s) => s.restaurantId === restId && s.status === 'ACTIVE');
  }

  async getOrCreateTableSession(restaurantId?: string, tableId?: string, tableNumber?: string): Promise<TableSession | null> {
    const restId = this.resolveTenantRestaurantId(restaurantId);
    if (!restId) return null;
    const resolvedTblId = tableId || `tbl-${restId}-${(tableNumber || 'Table 01').toLowerCase().replace(/\s+/g, '_')}`;

    try {
      const apiBase = getApiBaseUrl();
      const qParams = tableNumber ? `?table_number=${encodeURIComponent(tableNumber)}` : '';
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(restId)}/tables/${encodeURIComponent(resolvedTblId)}/session${qParams}`);
      if (res.ok) {
        const s = await res.json();
        if (s && s.id) {
          return {
            id: s.id,
            restaurantId: s.restaurant_id || restId,
            tableId: s.table_id || resolvedTblId,
            tableNumber: s.table_number || tableNumber || 'Table 01',
            status: s.status || 'ACTIVE',
            sessionStartedAt: s.session_started_at || new Date().toISOString(),
          };
        }
      }
    } catch (e) {
      console.warn('API fetch for getOrCreateTableSession failed:', e);
    }

    this.loadDatabase();
    let tbl = this.tables.find(
      (t) => t.restaurantId === restId && (t.id === tableId || (tableNumber && matchTableNumber(t.tableNumber, tableNumber)))
    );

    if (!tbl && tableNumber && tableNumber !== 'COUNTER') {
      const formattedNum = formatStandardTableNumber(tableNumber);
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dinely.food';
      tbl = {
        id: `tbl-${restId}-${formattedNum.toLowerCase().replace(/\s+/g, '_')}`,
        restaurantId: restId,
        tableNumber: formattedNum,
        capacity: 4,
        section: 'Main Floor',
        status: 'OCCUPIED',
        isOccupied: true,
        sessionStartedAt: new Date().toISOString(),
        qrCodeUrl: `${origin}/customer?restaurant=${restId}&tableId=tbl-${restId}-${formattedNum.toLowerCase().replace(/\s+/g, '_')}&table=${encodeURIComponent(formattedNum)}`,
      };
      this.tables.push(tbl);
    }

    if (!tbl) return null;

    let activeSession = this.tableSessions.find(
      (s) => s.restaurantId === restId && (s.tableId === tbl!.id || matchTableNumber(s.tableNumber, tbl!.tableNumber)) && s.status !== 'CLOSED'
    );

    if (activeSession) {
      if (tbl.status !== 'OCCUPIED' || !tbl.isOccupied) {
        tbl.status = 'OCCUPIED';
        tbl.isOccupied = true;
        tbl.activeSessionId = activeSession.id;
        tbl.sessionStartedAt = tbl.sessionStartedAt || activeSession.sessionStartedAt;
        this.saveDatabase();
      }
    } else {
      const currentBday = await this.getCurrentBusinessDay(restId);
      const newSessionId = `sess-${restId}-${tbl.id}-${Date.now()}`;

      activeSession = {
        id: newSessionId,
        restaurantId: restId,
        tableId: tbl.id,
        tableNumber: tbl.tableNumber,
        status: 'ACTIVE',
        sessionStartedAt: new Date().toISOString(),
        businessDayId: currentBday?.id,
      };

      this.tableSessions.unshift(activeSession);

      tbl.status = 'OCCUPIED';
      tbl.isOccupied = true;
      tbl.activeSessionId = activeSession.id;
      tbl.sessionStartedAt = activeSession.sessionStartedAt;

      this.saveDatabase();

      realtimeBus.emit('TableSessionStarted' as any, {
        sessionId: activeSession.id,
        restaurantId: restId,
        tableId: tbl.id,
        tableNumber: tbl.tableNumber,
        data: activeSession,
      });

      realtimeBus.emit('TableStatusUpdated' as any, {
        tableId: tbl.id,
        restaurantId: restId,
        tableNumber: tbl.tableNumber,
        status: 'OCCUPIED',
        data: tbl,
      });
    }

    return activeSession;
  }

  async closeTableSession(tableId: string, waiterName?: string) {
    await delay(100);
    const tbl = this.tables.find((t) => t.id === tableId || t.tableNumber.toLowerCase() === tableId.toLowerCase());
    if (!tbl) return null;

    const restId = tbl.restaurantId;

    const activeSession = this.tableSessions.find(
      (s) => s.restaurantId === restId && s.tableId === tbl.id && s.status === 'ACTIVE'
    );

    if (activeSession) {
      activeSession.status = 'CLOSED';
      activeSession.sessionClosedAt = new Date().toISOString();
      activeSession.closedByWaiterName = waiterName || 'Staff';
    }

    // Complete all active orders for this closed table session
    this.orders.forEach((o) => {
      const matchesSession = activeSession && o.tableSessionId === activeSession.id;
      const matchesTable = o.tableNumber && tbl.tableNumber && o.tableNumber.toLowerCase() === tbl.tableNumber.toLowerCase();
      if ((matchesSession || matchesTable) && o.status !== 'CANCELLED') {
        o.status = 'COMPLETED';
        o.paymentStatus = 'PAID';
      }
    });

    tbl.status = 'AVAILABLE';
    tbl.isOccupied = false;
    tbl.activeSessionId = undefined;
    tbl.sessionStartedAt = undefined;
    tbl.reservationDetails = undefined;

    this.saveDatabase();

    realtimeBus.emit('TableSessionClosed' as any, {
      sessionId: activeSession?.id,
      restaurantId: restId,
      tableId: tbl.id,
      tableNumber: tbl.tableNumber,
    });

    realtimeBus.emit('TableStatusUpdated' as any, {
      tableId: tbl.id,
      restaurantId: restId,
      tableNumber: tbl.tableNumber,
      status: 'AVAILABLE',
      data: tbl,
    });

    realtimeBus.emit('TableCleared' as any, {
      tableId: tbl.id,
      restaurantId: restId,
      tableNumber: tbl.tableNumber,
    });

    return tbl;
  }

  // --- Core Billing System APIs ---
  private generateBillNumber(restaurantId: string): string {
    const year = new Date().getFullYear();
    const count = this.bills.filter((b) => b.restaurantId === restaurantId).length + 101;
    const prefix = (restaurantId || 'REST').replace(/^rest-/, '').toUpperCase();
    return `DLY-${prefix}-${year}-${String(count).padStart(6, '0')}`;
  }

  async getRunningTableBill(restaurantId?: string, tableNumber?: string, targetSessionId?: string): Promise<Bill | null> {
    this.loadDatabase();
    await delay(50);
    const restId = this.resolveTenantRestaurantId(restaurantId);
    if (!restId) return null;

    const activeTableStr = tableNumber ? formatStandardTableNumber(tableNumber) : 'Table 01';

    let tbl = this.tables.find(
      (t) => t.restaurantId === restId && (matchTableNumber(t.tableNumber, activeTableStr) || t.id === activeTableStr)
    );

    let session = this.tableSessions.find(
      (s) => s.restaurantId === restId && (s.id === targetSessionId || (tbl && s.tableId === tbl.id) || matchTableNumber(s.tableNumber, activeTableStr)) && s.status !== 'CLOSED'
    );

    if (!session) {
      session = await this.getOrCreateTableSession(restId, tbl?.id, activeTableStr);
    }

    if (!session) return null;

    // Find all valid non-cancelled orders for this session
    const sessionOrders = this.orders.filter(
      (o) => o.restaurantId === restId && o.status !== 'CANCELLED' && (o.tableSessionId === session!.id || (o.tableNumber && matchTableNumber(o.tableNumber, activeTableStr)))
    );

    // Aggregate & flatten items across orders
    const itemMap = new Map<string, BillItem>();
    sessionOrders.forEach((ord) => {
      (ord.items || []).forEach((item) => {
        const key = `${item.menuItemId || item.id}_${item.name}_${item.price}`;
        const existing = itemMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          existing.totalPrice = existing.quantity * existing.unitPrice;
        } else {
          itemMap.set(key, {
            orderId: ord.id,
            menuItemId: item.menuItemId || item.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.quantity * item.price,
            station: getFulfillmentStation(item),
          });
        }
      });
    });

    const items = Array.from(itemMap.values());
    const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);

    const rest = this.restaurants.find((r) => r.id === restId);
    const configuredTaxPercentage = typeof rest?.taxPercentage === 'number' ? rest.taxPercentage : 5.0;
    const taxRateDecimal = configuredTaxPercentage / 100.0;
    const taxAmount = Math.round(subtotal * taxRateDecimal * 100) / 100;
    const discountAmount = 0;
    const grandTotal = Math.round((subtotal + taxAmount - discountAmount) * 100) / 100;

    let existingBill = this.bills.find((b) => b.restaurantId === restId && b.tableSessionId === session!.id && b.status !== 'CLOSED' && b.status !== 'CANCELLED');

    if (existingBill) {
      existingBill.orders = sessionOrders;
      existingBill.items = items;
      existingBill.subtotal = subtotal;
      if (existingBill.taxRate === undefined) {
        existingBill.taxRate = configuredTaxPercentage;
      }
      const effectiveTaxRate = existingBill.taxRate / 100.0;
      existingBill.taxAmount = Math.round(subtotal * effectiveTaxRate * 100) / 100;
      existingBill.discountAmount = discountAmount;
      existingBill.grandTotal = Math.round((subtotal + existingBill.taxAmount - discountAmount) * 100) / 100;
      existingBill.updatedAt = new Date().toISOString();
      this.saveDatabase();
      return existingBill;
    }

    if (items.length === 0 && sessionOrders.length === 0) {
      return null;
    }

    const newBill: Bill = {
      id: this.generateBillNumber(restId),
      restaurantId: restId,
      tableId: tbl?.id || session.tableId || 'tbl-1',
      tableNumber: session.tableNumber || activeTableStr,
      tableSessionId: session.id,
      businessDayId: session.businessDayId,
      orders: sessionOrders,
      items,
      subtotal,
      taxAmount,
      taxRate: configuredTaxPercentage,
      discountAmount,
      grandTotal,
      status: 'OPEN',
      paymentStatus: 'UNPAID',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.bills.unshift(newBill);
    session.billId = newBill.id;
    this.saveDatabase();
    return newBill;
  }

  async requestTableBill(restaurantId?: string, tableNumber?: string, targetSessionId?: string): Promise<Bill | null> {
    const bill = await this.getRunningTableBill(restaurantId, tableNumber, targetSessionId);
    if (!bill) return null;

    const restId = bill.restaurantId;
    const session = this.tableSessions.find((s) => s.id === bill.tableSessionId);
    const tbl = this.tables.find((t) => t.restaurantId === restId && matchTableNumber(t.tableNumber, bill.tableNumber));

    bill.status = 'BILL_REQUESTED';
    bill.requestedAt = new Date().toISOString();
    bill.updatedAt = new Date().toISOString();

    if (session) {
      session.status = 'BILL_REQUESTED';
      session.billRequestedAt = bill.requestedAt;
    }

    if (tbl) {
      tbl.status = 'BILL_REQUESTED';
    }

    // Post Waiter Notification
    const notif: WaiterNotification = {
      id: `notif-bill-${Date.now()}`,
      restaurantId: restId,
      type: 'BILL_REQUEST',
      title: `🔔 BILL REQUEST: ${bill.tableNumber}`,
      message: `Customer at ${bill.tableNumber} (Session #${bill.tableSessionId}) requested running bill of ₹${bill.grandTotal.toFixed(2)}.`,
      tableNumber: bill.tableNumber,
      timestamp: new Date().toISOString(),
      isRead: false,
      priority: 'HIGH',
    };
    this.notifications.unshift(notif);

    this.saveDatabase();

    realtimeBus.emit('BillRequested' as any, {
      billId: bill.id,
      restaurantId: restId,
      tableNumber: bill.tableNumber,
      tableSessionId: bill.tableSessionId,
      grandTotal: bill.grandTotal,
      data: bill,
    });

    if (tbl) {
      realtimeBus.emit('TableStatusUpdated' as any, {
        tableId: tbl.id,
        restaurantId: restId,
        tableNumber: tbl.tableNumber,
        status: 'BILL_REQUESTED',
        data: tbl,
      });
    }

    return bill;
  }

  async recordBillPayment(billId: string, paymentMethod: PaymentMethod = 'CASH'): Promise<Bill | null> {
    this.loadDatabase();
    await delay(100);
    const bill = this.bills.find((b) => b.id === billId);
    if (!bill) return null;

    bill.paymentMethod = paymentMethod;
    bill.paymentStatus = 'PAID';
    bill.status = 'PAID';
    bill.paidAt = new Date().toISOString();
    bill.updatedAt = new Date().toISOString();

    const session = this.tableSessions.find((s) => s.id === bill.tableSessionId);
    if (session) {
      session.paymentStatus = 'PAID';
      session.paymentMethod = paymentMethod;
      session.status = 'PAID';
    }

    // Also mark all session orders as PAID
    (bill.orders || []).forEach((o) => {
      const match = this.orders.find((ord) => ord.id === o.id);
      if (match) {
        match.paymentStatus = 'PAID';
        match.paymentMethod = paymentMethod as any;
      }
    });

    this.saveDatabase();

    realtimeBus.emit('BillPaid' as any, {
      billId: bill.id,
      restaurantId: bill.restaurantId,
      tableNumber: bill.tableNumber,
      tableSessionId: bill.tableSessionId,
      paymentMethod,
      grandTotal: bill.grandTotal,
      data: bill,
    });

    return bill;
  }

  async closeTableSessionAndGenerateBill(sessionId: string, waiterName?: string, paymentMethod?: PaymentMethod): Promise<{ bill: Bill | null; session: TableSession | null }> {
    this.loadDatabase();
    await delay(100);

    const session = this.tableSessions.find((s) => s.id === sessionId);
    if (!session) return { bill: null, session: null };

    const restId = session.restaurantId;
    let bill = this.bills.find((b) => b.tableSessionId === sessionId);
    if (!bill) {
      bill = await this.getRunningTableBill(restId, session.tableNumber, sessionId);
    }

    if (bill) {
      if (bill.paymentStatus !== 'PAID') {
        bill.paymentStatus = 'PAID';
        bill.paymentMethod = paymentMethod || bill.paymentMethod || 'CASH';
        bill.paidAt = bill.paidAt || new Date().toISOString();
      }
      bill.status = 'CLOSED';
      bill.closedAt = new Date().toISOString();
      bill.closedByWaiterName = waiterName || 'Floor Waiter';
      bill.updatedAt = new Date().toISOString();
    }

    session.status = 'CLOSED';
    session.sessionClosedAt = new Date().toISOString();
    session.closedByWaiterName = waiterName || 'Floor Waiter';
    session.paymentStatus = 'PAID';

    const tbl = this.tables.find(
      (t) => t.restaurantId === restId && (t.id === session!.tableId || matchTableNumber(t.tableNumber, session!.tableNumber))
    );

    if (tbl) {
      tbl.status = 'AVAILABLE';
      tbl.isOccupied = false;
      tbl.activeSessionId = undefined;
      tbl.sessionStartedAt = undefined;
    }

    this.saveDatabase();

    realtimeBus.emit('TableSessionClosed' as any, {
      sessionId: session.id,
      restaurantId: restId,
      tableId: session.tableId,
      tableNumber: session.tableNumber,
    });

    realtimeBus.emit('TableCleared' as any, {
      tableId: tbl?.id,
      restaurantId: restId,
      tableNumber: session.tableNumber,
    });

    if (tbl) {
      realtimeBus.emit('TableStatusUpdated' as any, {
        tableId: tbl.id,
        restaurantId: restId,
        tableNumber: tbl.tableNumber,
        status: 'AVAILABLE',
        data: tbl,
      });
    }

    return { bill, session };
  }

  async getBills(restaurantId?: string): Promise<Bill[]> {
    this.loadDatabase();
    await delay(50);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    return this.bills.filter((b) => b.restaurantId === targetId);
  }

  async getBillingStats(restaurantId?: string) {
    this.loadDatabase();
    await delay(50);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    const restBills = this.bills.filter((b) => b.restaurantId === targetId);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayBills = restBills.filter((b) => b.createdAt.startsWith(todayStr));
    const paidBills = restBills.filter((b) => b.paymentStatus === 'PAID' || b.status === 'CLOSED');
    const pendingBills = restBills.filter((b) => (b.paymentStatus === 'UNPAID' || b.paymentStatus === 'PAYMENT_PENDING') && b.status !== 'CANCELLED');

    const todaySales = todayBills.filter((b) => b.paymentStatus === 'PAID' || b.status === 'CLOSED').reduce((sum, b) => sum + b.grandTotal, 0);
    const totalSales = paidBills.reduce((sum, b) => sum + b.grandTotal, 0);
    const avgBillValue = paidBills.length > 0 ? totalSales / paidBills.length : 0;

    return {
      todaySales,
      totalSales,
      totalBills: restBills.length,
      paidBills: paidBills.length,
      pendingBills: pendingBills.length,
      avgBillValue,
    };
  }

  // --- Business Day Management ---
  async getCurrentBusinessDay(restaurantId?: string) {
    await delay(50);
    const restId = this.resolveTenantRestaurantId(restaurantId);
    const openDay = this.businessDays.find((b) => b.restaurantId === restId && b.status === 'OPEN');
    if (openDay) {
      return openDay;
    }

    const restDays = this.businessDays.filter((b) => b.restaurantId === restId);
    if (restDays.length > 0) {
      return restDays[0];
    }

    const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const initialDay: BusinessDay = {
      id: `bday-${restId}-${Date.now()}`,
      restaurantId: restId,
      date: todayStr,
      status: 'OPEN',
      openedAt: new Date().toISOString(),
      openedBy: 'System Auto',
    };
    this.businessDays.unshift(initialDay);
    this.saveDatabase();
    return initialDay;
  }

  async openBusinessDay(restaurantId?: string, openedBy?: string) {
    await delay(100);
    const restId = this.resolveTenantRestaurantId(restaurantId);

    const openDay = this.businessDays.find((b) => b.restaurantId === restId && b.status === 'OPEN');
    if (openDay) {
      return openDay;
    }

    const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const newDay: BusinessDay = {
      id: `bday-${restId}-${Date.now()}`,
      restaurantId: restId,
      date: todayStr,
      status: 'OPEN',
      openedAt: new Date().toISOString(),
      openedBy: openedBy || 'Manager',
    };

    this.businessDays.unshift(newDay);
    this.saveDatabase();

    realtimeBus.emit('BusinessDayOpened' as any, {
      businessDayId: newDay.id,
      restaurantId: restId,
      data: newDay,
    });

    return newDay;
  }

  async closeBusinessDay(restaurantId?: string, closedBy?: string) {
    await delay(150);
    const restId = this.resolveTenantRestaurantId(restaurantId);
    const openDay = this.businessDays.find((b) => b.restaurantId === restId && b.status === 'OPEN');

    if (!openDay) {
      throw new Error('No active open business day to close.');
    }

    const dayOrders = this.orders.filter(
      (o) => o.restaurantId === restId && (o.businessDayId === openDay.id || new Date(o.createdAt).getTime() >= new Date(openDay.openedAt).getTime())
    );

    const completed = dayOrders.filter((o) => o.status === 'DELIVERED' || o.status === 'COMPLETED' || o.paymentStatus === 'PAID');
    const cancelled = dayOrders.filter((o) => o.status === 'CANCELLED');

    const foodOrders = dayOrders.filter((o) => o.targetDestination === 'KITCHEN' || o.targetDestination === 'MIXED' || o.items.some((i) => i.targetDestination !== 'BAR'));
    const barOrders = dayOrders.filter((o) => o.targetDestination === 'BAR' || o.items.some((i) => i.targetDestination === 'BAR' || i.isAlcoholic));

    let foodSales = 0;
    let barSales = 0;

    dayOrders.forEach((o) => {
      if (o.status !== 'CANCELLED') {
        o.items.forEach((item) => {
          const itemTotal = item.price * item.quantity;
          if (item.targetDestination === 'BAR' || item.isAlcoholic) {
            barSales += itemTotal;
          } else {
            foodSales += itemTotal;
          }
        });
      }
    });

    const totalSales = foodSales + barSales;

    const summary: DailySummaryData = {
      totalOrders: dayOrders.length,
      foodOrders: foodOrders.length,
      barOrders: barOrders.length,
      foodSales,
      barSales,
      totalSales,
      completedOrders: completed.length,
      cancelledOrders: cancelled.length,
    };

    openDay.status = 'CLOSED';
    openDay.closedAt = new Date().toISOString();
    openDay.closedBy = closedBy || 'Owner';
    openDay.summary = summary;

    // Close any active table sessions when ending the business day
    this.tableSessions.forEach((s) => {
      if (s.restaurantId === restId && s.status === 'ACTIVE') {
        s.status = 'CLOSED';
        s.sessionClosedAt = new Date().toISOString();
        s.closedByWaiterName = closedBy || 'System Day Close';
      }
    });

    this.tables.forEach((tbl) => {
      if (tbl.restaurantId === restId) {
        tbl.status = 'AVAILABLE';
        tbl.isOccupied = false;
        tbl.activeSessionId = undefined;
        tbl.sessionStartedAt = undefined;
      }
    });

    this.saveDatabase();

    realtimeBus.emit('BusinessDayClosed' as any, {
      businessDayId: openDay.id,
      restaurantId: restId,
      summary,
    });

    return openDay;
  }

  async getBusinessDayHistory(restaurantId?: string) {
    await delay(100);
    const restId = this.resolveTenantRestaurantId(restaurantId);
    return this.businessDays.filter((b) => b.restaurantId === restId && b.status === 'CLOSED');
  }

  // Menu Helper APIs
  async duplicateMenuItem(itemId: string) {
    await delay(150);
    const original = this.menuItems.find((m) => m.id === itemId);
    if (original) {
      const copy: MenuItem = {
        ...original,
        id: `item-${Date.now()}`,
        name: `${original.name} (Copy)`,
      };
      this.menuItems.push(copy);
      this.saveDatabase();
      return copy;
    }
    return null;
  }

  async getBarAnalytics(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    const barItems = this.menuItems.filter((m) => m.restaurantId === targetId && (m.targetDestination === 'BAR' || m.isAlcoholic));
    const barOrders = this.orders.filter(
      (o) => o.restaurantId === targetId && (o.targetDestination === 'BAR' || o.targetDestination === 'MIXED' || o.items.some((i) => i.targetDestination === 'BAR' || i.isAlcoholic))
    );

    const barRevenue = barOrders.reduce((sum, o) => {
      const drinkSum = o.items.filter((i) => i.targetDestination === 'BAR' || i.isAlcoholic).reduce((s, i) => s + i.price * i.quantity, 0);
      return sum + (drinkSum || o.totalAmount);
    }, 0);

    return {
      todayBarRevenue: barRevenue || 1240.5,
      totalBarOrders: barOrders.length || 18,
      topSellingDrinks: barItems.length > 0
        ? barItems.slice(0, 4).map((i) => ({ name: i.name, salesCount: 24, revenue: i.price * 24 }))
        : [
            { name: 'Smoked Old Fashioned', salesCount: 32, revenue: 576 },
            { name: 'Craft IPA Pint', salesCount: 28, revenue: 252 },
            { name: 'Vintage Cabernet Sauvignon', salesCount: 19, revenue: 342 },
          ],
      mostPopularCategory: 'Cocktails & Craft Spirits',
      avgPrepTimeMinutes: 4.5,
      alcoholSalesRatioPercent: 42,
      peakBarHours: '8:00 PM - 11:00 PM',
    };
  }



  async addCategory(data: { restaurantId?: string; name: string; icon?: string }) {
    await delay(150);
    const restId = this.resolveTenantRestaurantId(data.restaurantId) || 'rest-1';
    const newCat: MenuCategory = {
      id: `cat-${Date.now()}`,
      restaurantId: restId,
      name: data.name,
      icon: data.icon || 'Utensils',
      order: this.categories.filter((c) => c.restaurantId === restId).length + 1,
      isEnabled: true,
    };
    this.categories.push(newCat);
    this.saveDatabase();
    return newCat;
  }

  async updateCategory(id: string, updates: Partial<MenuCategory>) {
    await delay(150);
    const cat = this.categories.find((c) => c.id === id);
    if (cat) {
      Object.assign(cat, updates);
      this.saveDatabase();
    }
    return cat;
  }

  async deleteCategory(id: string) {
    await delay(150);
    this.categories = this.categories.filter((c) => c.id !== id);
    this.saveDatabase();
  }

  async toggleCategoryStatus(id: string) {
    await delay(100);
    const cat = this.categories.find((c) => c.id === id);
    if (cat) {
      cat.isEnabled = !cat.isEnabled;
      this.saveDatabase();
    }
    return cat;
  }

  // --- Dedicated Bar Category APIs ---
  async getBarCategories(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    let cats = this.barCategories.filter((c) => c.restaurantId === targetId);
    if (cats.length === 0) {
      const defaultNames = ['Beer', 'Wine', 'Whiskey', 'Vodka', 'Rum', 'Gin', 'Cocktails', 'Mocktails', 'Champagne', 'Tequila', 'Shots'];
      cats = defaultNames.map((name, idx) => ({
        id: `bcat-${targetId.replace(/[^a-zA-Z0-9]/g, '')}-${idx + 1}`,
        restaurantId: targetId,
        name,
        displayOrder: idx + 1,
        isEnabled: true,
      }));
      this.barCategories.push(...cats);
      this.saveDatabase();
    }
    return cats.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async addBarCategory(data: { restaurantId?: string; name: string; isEnabled?: boolean }) {
    await delay(150);
    const restId = this.resolveTenantRestaurantId(data.restaurantId) || 'rest-1';
    const newCat: BarCategory = {
      id: `bcat-${Date.now()}`,
      restaurantId: restId,
      name: data.name,
      displayOrder: this.barCategories.filter((c) => c.restaurantId === restId).length + 1,
      isEnabled: data.isEnabled !== false,
    };
    this.barCategories.push(newCat);
    this.saveDatabase();
    return newCat;
  }

  async updateBarCategory(id: string, updates: Partial<BarCategory>) {
    await delay(150);
    const cat = this.barCategories.find((c) => c.id === id);
    if (cat) {
      Object.assign(cat, updates);
      this.saveDatabase();
    }
    return cat;
  }

  async deleteBarCategory(id: string) {
    await delay(150);
    this.barCategories = this.barCategories.filter((c) => c.id !== id);
    this.saveDatabase();
  }

  async toggleBarCategoryStatus(id: string) {
    await delay(100);
    const cat = this.barCategories.find((c) => c.id === id);
    if (cat) {
      cat.isEnabled = !cat.isEnabled;
      this.saveDatabase();
    }
    return cat;
  }

  // --- Dedicated Bar Menu Item APIs ---
  async getBarMenuItems(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    return this.barMenuItems.filter((m) => m.restaurantId === targetId);
  }

  async addBarMenuItem(itemData: Partial<BarMenuItem>) {
    await delay(150);
    const restId = this.resolveTenantRestaurantId(itemData.restaurantId) || 'rest-1';
    const newItem: BarMenuItem = {
      id: `bitem-${Date.now()}`,
      restaurantId: restId,
      categoryId: itemData.categoryId || 'Cocktails',
      name: itemData.name || 'Signature Cocktail',
      description: itemData.description || 'Craft artisan cocktail mix.',
      price: itemData.price || 14.50,
      image: itemData.image || 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600',
      brand: itemData.brand || '',
      alcoholPercentage: itemData.alcoholPercentage ?? 40,
      bottleSize: itemData.bottleSize || '750ml',
      servingSize: itemData.servingSize || '60ml Peg',
      prepTimeMinutes: itemData.prepTimeMinutes || 4,
      discountPercentage: itemData.discountPercentage || 0,
      isFeatured: itemData.isFeatured || false,
      isRecommended: itemData.isRecommended || false,
      isAvailable: itemData.isAvailable !== false,
      displayOrder: itemData.displayOrder || this.barMenuItems.filter((b) => b.restaurantId === restId).length + 1,
      targetDestination: 'BAR',
      isAlcoholic: itemData.isAlcoholic !== false,
      servingOptions: itemData.servingOptions || ['On the Rocks', 'Neat', 'Soda Mixer'],
    };
    this.barMenuItems.push(newItem);
    this.saveDatabase();
    return newItem;
  }

  async updateBarMenuItem(itemId: string, updates: Partial<BarMenuItem>) {
    await delay(150);
    const item = this.barMenuItems.find((m) => m.id === itemId);
    if (item) {
      Object.assign(item, updates);
      this.saveDatabase();
    }
    return item;
  }

  async duplicateBarMenuItem(itemId: string) {
    await delay(150);
    const original = this.barMenuItems.find((m) => m.id === itemId);
    if (original) {
      const copy: BarMenuItem = {
        ...original,
        id: `bitem-${Date.now()}`,
        name: `${original.name} (Copy)`,
      };
      this.barMenuItems.push(copy);
      this.saveDatabase();
      return copy;
    }
    return null;
  }

  async toggleBarMenuItemAvailability(itemId: string) {
    await delay(100);
    const item = this.barMenuItems.find((m) => m.id === itemId);
    if (item) {
      item.isAvailable = !item.isAvailable;
      this.saveDatabase();
    }
    return item;
  }

  async deleteBarMenuItem(itemId: string) {
    await delay(150);
    this.barMenuItems = this.barMenuItems.filter((m) => m.id !== itemId);
    this.saveDatabase();
  }

  async bulkImportBarMenuItems(restaurantId: string, items: Partial<BarMenuItem>[]) {
    await delay(200);
    const restId = this.resolveTenantRestaurantId(restaurantId) || 'rest-1';
    const created = items.map((i, idx) => ({
      id: `bitem-${Date.now()}-${idx}`,
      restaurantId: restId,
      categoryId: i.categoryId || 'Cocktails',
      name: i.name || `Imported Drink ${idx + 1}`,
      description: i.description || '',
      price: i.price || 12.00,
      image: i.image || 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600',
      brand: i.brand || '',
      alcoholPercentage: i.alcoholPercentage ?? 40,
      bottleSize: i.bottleSize || '750ml',
      servingSize: i.servingSize || '60ml Peg',
      prepTimeMinutes: i.prepTimeMinutes || 4,
      discountPercentage: i.discountPercentage || 0,
      isFeatured: i.isFeatured || false,
      isRecommended: i.isRecommended || false,
      isAvailable: i.isAvailable !== false,
      displayOrder: (i.displayOrder || idx + 1),
      targetDestination: 'BAR' as const,
      isAlcoholic: i.isAlcoholic !== false,
      servingOptions: i.servingOptions || ['On the Rocks', 'Neat'],
    }));
    this.barMenuItems.push(...created);
    this.saveDatabase();
    return created;
  }

  // Employee APIs
  async getEmployees(restaurantId?: string) {
    this.loadDatabase();
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    return this.employees.filter((e) => e.restaurantId === targetId);
  }

  async addEmployee(empData: Partial<Employee>) {
    await delay(150);
    const restId = this.resolveTenantRestaurantId(empData.restaurantId) || 'rest-1';
    
    if (empData.email) {
      const existing = this.employees.find(
        (e) => e.restaurantId === restId && e.email.toLowerCase() === (empData.email || '').toLowerCase()
      );
      if (existing) {
        throw new Error(`An employee with email '${empData.email}' already exists in this restaurant.`);
      }
    }

    const newEmp: Employee = {
      id: empData.id || `emp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      restaurantId: restId,
      name: empData.name || 'Staff Member',
      email: empData.email || `staff_${Date.now()}@restaurant.com`,
      phone: empData.phone || '+1 555-0100',
      role: empData.role || 'WAITER',
      status: 'OFF_CLOCK',
      hourlyRate: typeof empData.hourlyRate === 'number' ? empData.hourlyRate : parseFloat(empData.hourlyRate as any) || 18,
      password: empData.password || 'staff123',
      joinedDate: new Date().toISOString().split('T')[0],
      isAccountDisabled: false,
      shift: empData.shift || 'Evening (4PM - 12AM)',
      assignedSection: empData.assignedSection || 'Main Dining Floor',
    };
    this.employees.unshift(newEmp);
    this.saveDatabase();
    return newEmp;
  }

  async updateEmployee(empId: string, updates: Partial<Employee>) {
    await delay(150);
    const emp = this.employees.find((e) => e.id === empId);
    if (emp) {
      Object.assign(emp, updates);
      this.saveDatabase();
    }
    return emp;
  }

  async toggleEmployeeAccountStatus(empId: string) {
    await delay(100);
    const emp = this.employees.find((e) => e.id === empId);
    if (emp) {
      emp.isAccountDisabled = !emp.isAccountDisabled;
      this.saveDatabase();
    }
    return emp;
  }

  async resetEmployeePassword(empId: string, customPass?: string) {
    await delay(150);
    const newPass = customPass || `pass_${Math.floor(1000 + Math.random() * 9000)}`;
    const emp = this.employees.find((e) => e.id === empId);
    if (emp) {
      emp.password = newPass;
      this.saveDatabase();
    }
    return newPass;
  }

  async deleteEmployee(empId: string) {
    await delay(150);
    this.employees = this.employees.filter((e) => e.id !== empId);
    this.saveDatabase();
  }

  async updateEmployeeStatus(empId: string, status: any) {
    await delay(100);
    const emp = this.employees.find((e) => e.id === empId);
    if (emp) {
      emp.status = status;
      this.saveDatabase();
    }
    return emp;
  }

  // Supplier & Inventory APIs
  async getSuppliers(restaurantId?: string) {
    this.loadDatabase();
    await delay(50);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    return this.suppliers.filter((s) => s.restaurantId === targetId);
  }

  async addSupplier(supData: Partial<Supplier>) {
    await delay(100);
    const restId = this.resolveTenantRestaurantId(supData.restaurantId) || 'rest-1';
    const newSup: Supplier = {
      id: `sup-${Date.now()}`,
      restaurantId: restId,
      name: supData.name || 'New Supplier',
      contactPerson: supData.contactPerson || 'Vendor Rep',
      phone: supData.phone || '+91 98000-00000',
      email: supData.email || 'vendor@supplier.com',
      supplyCategory: supData.supplyCategory || 'General Foods',
      address: supData.address || 'Vendor Address',
      notes: supData.notes || '',
      createdAt: new Date().toISOString(),
    };
    this.suppliers.unshift(newSup);
    this.saveDatabase();
    return newSup;
  }

  async deleteSupplier(supplierId: string) {
    await delay(100);
    this.suppliers = this.suppliers.filter((s) => s.id !== supplierId);
    this.saveDatabase();
  }

  async addInventoryItem(invData: Partial<InventoryItem>) {
    await delay(150);
    const restId = this.resolveTenantRestaurantId(invData.restaurantId) || 'rest-1';
    const category = invData.category || 'Pantry';
    const isBarCategory = category.toLowerCase().includes('bar') || category.toLowerCase().includes('liquor') || category.toLowerCase().includes('spirit') || category.toLowerCase().includes('wine') || category.toLowerCase().includes('cocktail') || category.toLowerCase().includes('beer') || category.toLowerCase().includes('beverage');
    const station = invData.station || (isBarCategory ? 'BAR' : 'KITCHEN');

    const newItem: InventoryItem = {
      id: `inv-${Date.now()}`,
      restaurantId: restId,
      name: invData.name || 'Raw Material',
      category,
      station,
      quantity: invData.quantity || 10,
      unit: invData.unit || 'kg',
      minThreshold: invData.minThreshold || 2,
      costPerUnit: invData.costPerUnit || 5,
      supplierId: invData.supplierId,
      supplierName: invData.supplierName || 'General Foods',
      supplierContact: invData.supplierContact || 'N/A',
      storageLocation: invData.storageLocation || (station === 'BAR' ? 'Bar Backroom & Cellar' : 'Main Kitchen Cold Storage'),
      lastRestocked: new Date().toISOString().split('T')[0],
      status: (invData.quantity || 10) <= (invData.minThreshold || 2) ? 'LOW_STOCK' : 'IN_STOCK',
    };
    this.inventory.push(newItem);
    this.saveDatabase();
    return newItem;
  }

  async updateInventoryQuantity(itemId: string, delta: number) {
    await delay(100);
    const item = this.inventory.find((i) => i.id === itemId);
    if (item) {
      item.quantity = Math.max(0, item.quantity + delta);
      this.saveDatabase();
    }
    return item;
  }

  async deleteInventoryItem(itemId: string) {
    await delay(150);
    this.inventory = this.inventory.filter((i) => i.id !== itemId);
    this.saveDatabase();
  }

  // Order & Kitchen APIs
  async acceptOrder(orderId: string, prepTime: number) {
    await delay(150);
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = 'IN_KITCHEN';
      order.estimatedPrepTimeMinutes = prepTime;
      order.acceptedAt = new Date().toISOString();
      order.etaTargetTimestamp = new Date(Date.now() + prepTime * 60000).toISOString();
      order.isTimerPaused = false;
      this.saveDatabase();

      realtimeBus.emit('OrderAccepted' as any, {
        orderId: order.id,
        restaurantId: order.restaurantId,
        tableNumber: order.tableNumber,
        data: order,
      });

      realtimeBus.emit('ETAUpdated' as any, {
        orderId: order.id,
        restaurantId: order.restaurantId,
        tableNumber: order.tableNumber,
        data: order,
      });
    }
    return order;
  }

  async updateOrderETA(orderId: string, deltaOrMins: number, reason?: string, note?: string) {
    await delay(100);
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      const currentMins = order.estimatedPrepTimeMinutes || 15;
      let newMins = currentMins;

      // Handle delta (+5 or -5) vs absolute value
      if (deltaOrMins === 5 || deltaOrMins === -5) {
        newMins = Math.max(1, currentMins + deltaOrMins);
      } else {
        newMins = Math.max(1, deltaOrMins);
      }

      order.estimatedPrepTimeMinutes = newMins;

      // Recalculate target timestamp
      const baseTime = order.etaTargetTimestamp ? new Date(order.etaTargetTimestamp).getTime() : Date.now();
      if (deltaOrMins === 5 || deltaOrMins === -5) {
        order.etaTargetTimestamp = new Date(baseTime + deltaOrMins * 60000).toISOString();
      } else {
        order.etaTargetTimestamp = new Date(Date.now() + newMins * 60000).toISOString();
      }

      if (reason || note) {
        if (!order.etaHistory) order.etaHistory = [];
        order.etaHistory.unshift({
          timestamp: new Date().toISOString(),
          oldEta: currentMins,
          newEta: newMins,
          previousMinutes: currentMins,
          newMinutes: newMins,
          changedBy: 'Kitchen Chef',
          reason: reason || note || 'Adjusted by Chef',
          updatedBy: 'Kitchen Chef',
        });
      }

      this.saveDatabase();

      realtimeBus.emit('ETAUpdated' as any, {
        orderId: order.id,
        restaurantId: order.restaurantId,
        tableNumber: order.tableNumber,
        data: order,
      });
    }
    return order;
  }

  async toggleOrderTimer(orderId: string) {
    await delay(100);
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.isTimerPaused = !order.isTimerPaused;
      order.updatedAt = new Date().toISOString();
      this.saveDatabase();

      realtimeBus.emit('ETAUpdated' as any, {
        orderId: order.id,
        restaurantId: order.restaurantId,
        tableNumber: order.tableNumber,
        data: order,
      });
    }
    return order;
  }

  async markOrderReady(orderId: string) {
    await delay(150);
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = 'READY';
      order.readyAt = new Date().toISOString();
      this.saveDatabase();

      realtimeBus.emit('OrderReady' as any, {
        orderId: order.id,
        restaurantId: order.restaurantId,
        tableNumber: order.tableNumber,
        data: order,
      });
    }
    return order;
  }

  async deliverOrder(orderId: string) {
    await delay(150);
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) {
      throw new Error('Order not found.');
    }
    if (order.status !== 'READY') {
      throw new Error(`Invalid status transition: Only READY orders can be marked DELIVERED (current status: ${order.status}).`);
    }
    order.status = 'DELIVERED';
    order.deliveredAt = new Date().toISOString();
    order.updatedAt = new Date().toISOString();
    this.saveDatabase();

    realtimeBus.emit('OrderDelivered', {
      orderId: order.id,
      restaurantId: order.restaurantId,
      tableNumber: order.tableNumber,
      data: order,
    });

    return order;
  }

  async updateOrderStatus(orderId: string, status: any) {
    try {
      const apiBase = getApiBaseUrl();
      await fetch(`${apiBase}/orders/${encodeURIComponent(orderId)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (e) {
      console.warn('API PUT for updateOrderStatus failed:', e);
    }

    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = status;
      this.saveDatabase();
    }
    return order;
  }

  async updateKitchenStatus(orderId: string, status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED') {
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.kitchenStatus = status;
      if (status === 'COMPLETED') {
        order.kitchenCompletedAt = new Date().toISOString();
      }

      const barReady = !order.barStatus || order.barStatus === 'READY' || order.barStatus === 'COMPLETED';
      if (status === 'READY' && barReady) {
        order.status = 'READY';
        order.readyAt = new Date().toISOString();
      } else if (status === 'PREPARING' || status === 'ACCEPTED') {
        if (order.status !== 'READY' && order.status !== 'DELIVERED' && order.status !== 'COMPLETED') {
          order.status = 'PREPARING';
        }
      }

      try {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/orders/${encodeURIComponent(orderId)}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: order.status, kitchenStatus: status }),
        });
      } catch (e) {
        console.warn('API PUT for updateKitchenStatus failed:', e);
      }

      order.updatedAt = new Date().toISOString();
      this.saveDatabase();

      realtimeBus.emit('KitchenStatusUpdated' as any, {
        orderId: order.id,
        restaurantId: order.restaurantId,
        tableNumber: order.tableNumber,
        kitchenStatus: status,
        data: order,
      });

      if (order.status === 'READY') {
        realtimeBus.emit('OrderReady' as any, {
          orderId: order.id,
          restaurantId: order.restaurantId,
          tableNumber: order.tableNumber,
          data: order,
        });
      }
    }
    return order;
  }

  async updateBarStatus(orderId: string, status: 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED') {
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.barStatus = status;
      if (status === 'COMPLETED') {
        order.barCompletedAt = new Date().toISOString();
      }

      const kitchenReady = !order.kitchenStatus || order.kitchenStatus === 'READY' || order.kitchenStatus === 'COMPLETED';
      if (status === 'READY' && kitchenReady) {
        order.status = 'READY';
        order.readyAt = new Date().toISOString();
      } else if (status === 'PREPARING' || status === 'ACCEPTED') {
        if (order.status !== 'READY' && order.status !== 'DELIVERED' && order.status !== 'COMPLETED') {
          order.status = 'PREPARING';
        }
      }

      try {
        const apiBase = getApiBaseUrl();
        await fetch(`${apiBase}/orders/${encodeURIComponent(orderId)}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: order.status, barStatus: status }),
        });
      } catch (e) {
        console.warn('API PUT for updateBarStatus failed:', e);
      }

      order.updatedAt = new Date().toISOString();
      this.saveDatabase();

      realtimeBus.emit('BarStatusUpdated' as any, {
        orderId: order.id,
        restaurantId: order.restaurantId,
        tableNumber: order.tableNumber,
        barStatus: status,
        data: order,
      });

      if (order.status === 'READY') {
        realtimeBus.emit('OrderReady' as any, {
          orderId: order.id,
          restaurantId: order.restaurantId,
          tableNumber: order.tableNumber,
          data: order,
        });
      }
    }
    return order;
  }

  async createOrder(orderData: Partial<Order>): Promise<Order> {
    const restId = this.resolveTenantRestaurantId(orderData.restaurantId) || 'rest-1';

    try {
      const apiBase = getApiBaseUrl();
      const payload = {
        restaurantId: restId,
        tableId: orderData.tableId || `tbl-${restId}-${(orderData.tableNumber || 'Table 01').toLowerCase().replace(/\s+/g, '_')}`,
        tableNumber: orderData.tableNumber || 'Table 01',
        tableSessionId: orderData.tableSessionId || `sess-${restId}-${Date.now()}`,
        customerName: orderData.customerName || 'Guest',
        notes: orderData.notes || '',
        items: (orderData.items || []).map((i) => ({
          id: i.id,
          menuItemId: i.menuItemId || i.id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          notes: i.notes || '',
        })),
      };

      const res = await fetch(`${apiBase}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          const createdOrd: Order = {
            id: data.id,
            restaurantId: data.restaurant_id || restId,
            tableId: data.table_id || payload.tableId,
            tableNumber: data.table_number || payload.tableNumber,
            tableSessionId: data.table_session_id || payload.tableSessionId,
            status: data.status || 'PENDING',
            kitchenStatus: data.kitchen_status || 'PENDING',
            barStatus: data.bar_status || 'PENDING',
            customerName: data.customer_name || 'Guest',
            notes: data.notes || '',
            items: (data.items_json || payload.items).map((i: any) => ({
              id: i.id || `oi-${data.id}`,
              menuItemId: i.menuItemId || i.menu_item_id || i.id,
              name: i.name,
              quantity: i.quantity,
              price: typeof i.price === 'number' ? i.price : parseFloat(i.price) || 0,
              notes: i.notes || '',
              targetDestination: i.targetDestination || 'KITCHEN',
            })),
            totalAmount: data.total_amount || orderData.totalAmount || 0,
            paymentStatus: data.payment_status || 'UNPAID',
            createdAt: data.created_at || new Date().toISOString(),
          };

          this.orders.unshift(createdOrd);
          this.saveDatabase();
          realtimeBus.emit('OrderCreated' as any, {
            orderId: createdOrd.id,
            restaurantId: createdOrd.restaurantId,
            tableId: createdOrd.tableId,
            tableNumber: createdOrd.tableNumber,
            tableSessionId: createdOrd.tableSessionId,
            data: createdOrd,
          });
          return createdOrd;
        }
      }
    } catch (e) {
      console.warn('API POST for createOrder failed:', e);
    }

    const rest = this.restaurants.find((r) => r.id === restId);

    const isNoTableFoodTruck = rest?.businessType === 'FOOD_TRUCK' && rest?.hasTables === false;
    const isPickup = isNoTableFoodTruck || orderData.orderType === 'PICKUP' || orderData.tableNumber === 'COUNTER';

    const processedItems: OrderItem[] = (orderData.items || []).map((item) => {
      const station = getFulfillmentStation(item);
      return {
        ...item,
        targetDestination: station,
        isAlcoholic: item.isAlcoholic || station === 'BAR',
      };
    });

    const hasKitchenItems = processedItems.some((i) => i.targetDestination === 'KITCHEN');
    const hasBarItems = processedItems.some((i) => i.targetDestination === 'BAR');
    const dest: 'KITCHEN' | 'BAR' | 'MIXED' = hasKitchenItems && hasBarItems ? 'MIXED' : hasBarItems ? 'BAR' : 'KITCHEN';

    const orderSeq = (this.orders.filter((o) => o.restaurantId === restId).length + 101);
    const prefix = isPickup ? (rest?.orderNumberPrefix || 'F') : (rest?.orderNumberPrefix || 'ORD');
    const customOrderId = orderData.id || `${prefix.replace(/#/g, '')}${orderSeq}`;

    // Get or create table session and current business day
    let tableSessionId = orderData.tableSessionId;
    let targetTable: Table | undefined;
    if (!isPickup && (orderData.tableNumber || orderData.tableId)) {
      const rawNum = orderData.tableNumber || orderData.tableId;
      targetTable = this.tables.find(
        (t) => t.restaurantId === restId && (t.id === orderData.tableId || matchTableNumber(t.tableNumber, rawNum))
      );

      if (!targetTable && rawNum && rawNum !== 'COUNTER') {
        const formattedNum = formatStandardTableNumber(rawNum);
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://dinely.food';
        targetTable = {
          id: orderData.tableId || `tbl-${restId}-${formattedNum.toLowerCase().replace(/\s+/g, '_')}`,
          restaurantId: restId,
          tableNumber: formattedNum,
          capacity: 4,
          section: 'Main Floor',
          status: 'OCCUPIED',
          isOccupied: true,
          sessionStartedAt: new Date().toISOString(),
          qrCodeUrl: `${origin}/customer?restaurant=${restId}&tableId=${orderData.tableId || `tbl-${restId}-${formattedNum.toLowerCase().replace(/\s+/g, '_')}`}&table=${encodeURIComponent(formattedNum)}`,
        };
        this.tables.push(targetTable);
      }

      if (targetTable) {
        let session = this.tableSessions.find(
          (s) => s.restaurantId === restId && (s.id === tableSessionId || s.tableId === targetTable!.id || matchTableNumber(s.tableNumber, targetTable!.tableNumber)) && s.status === 'ACTIVE'
        );
        if (!session) {
          session = {
            id: tableSessionId || `sess-${restId}-${targetTable.id}-${Date.now()}`,
            restaurantId: restId,
            tableId: targetTable.id,
            tableNumber: targetTable.tableNumber,
            status: 'ACTIVE',
            sessionStartedAt: new Date().toISOString(),
          };
          this.tableSessions.unshift(session);

          realtimeBus.emit('TableSessionStarted' as any, {
            sessionId: session.id,
            restaurantId: restId,
            tableId: targetTable.id,
            tableNumber: targetTable.tableNumber,
            data: session,
          });
        }

        tableSessionId = session.id;
        targetTable.status = 'OCCUPIED';
        targetTable.isOccupied = true;
        targetTable.activeSessionId = session.id;
        targetTable.sessionStartedAt = targetTable.sessionStartedAt || session.sessionStartedAt;

        realtimeBus.emit('TableStatusUpdated' as any, {
          tableId: targetTable.id,
          restaurantId: restId,
          tableNumber: targetTable.tableNumber,
          status: 'OCCUPIED',
          data: targetTable,
        });
      }
    }

    const currentBday = this.businessDays.find((b) => b.restaurantId === restId && b.status === 'OPEN');

    const newOrd: Order = {
      id: customOrderId,
      restaurantId: restId,
      tableId: targetTable?.id || orderData.tableId,
      tableNumber: isPickup ? 'COUNTER' : (targetTable?.tableNumber || orderData.tableNumber || 'Table 01'),
      tableSessionId,
      businessDayId: currentBday?.id,
      orderType: isPickup ? 'PICKUP' : 'DINE_IN',
      customerName: orderData.customerName || 'Guest',
      customerPhone: orderData.customerPhone,
      items: processedItems,
      totalAmount: orderData.totalAmount || 0,
      taxAmount: orderData.taxAmount || 0,
      tipAmount: orderData.tipAmount || 0,
      status: orderData.status || 'PENDING',
      targetDestination: dest,
      kitchenStatus: hasKitchenItems ? 'PENDING' : undefined,
      barStatus: hasBarItems ? 'PENDING' : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentStatus: orderData.paymentStatus || 'UNPAID',
      specialInstructions: orderData.specialInstructions,
    };

    this.orders.unshift(newOrd);

    const kitchenItems = processedItems.filter((i) => i.targetDestination === 'KITCHEN');
    const barItems = processedItems.filter((i) => i.targetDestination === 'BAR');

    if (kitchenItems.length > 0) {
      this.fulfillmentTickets.unshift({
        id: `K-TICKET-${customOrderId}`,
        parentOrderId: customOrderId,
        restaurantId: restId,
        tableNumber: newOrd.tableNumber,
        tableSessionId,
        station: 'KITCHEN',
        status: 'PENDING',
        items: kitchenItems,
        createdAt: newOrd.createdAt,
        updatedAt: newOrd.updatedAt,
        customerName: newOrd.customerName,
        orderType: newOrd.orderType,
      });
    }

    if (barItems.length > 0) {
      this.fulfillmentTickets.unshift({
        id: `B-TICKET-${customOrderId}`,
        parentOrderId: customOrderId,
        restaurantId: restId,
        tableNumber: newOrd.tableNumber,
        tableSessionId,
        station: 'BAR',
        status: 'PENDING',
        items: barItems,
        createdAt: newOrd.createdAt,
        updatedAt: newOrd.updatedAt,
        customerName: newOrd.customerName,
        orderType: newOrd.orderType,
      });
    }

    // Auto-occupy matching table in database if it was available
    if (!isPickup && newOrd.tableNumber) {
      const table = this.tables.find(
        (t) => t.restaurantId === restId && t.tableNumber.toLowerCase() === newOrd.tableNumber.toLowerCase()
      );
      if (table && table.status === 'AVAILABLE') {
        table.status = 'OCCUPIED';
        table.isOccupied = true;
        table.sessionStartedAt = table.sessionStartedAt || new Date().toISOString();
        realtimeBus.emit('TableStatusUpdated' as any, {
          tableId: table.id,
          restaurantId: restId,
          tableNumber: table.tableNumber,
          status: 'OCCUPIED',
          data: table,
        });
        realtimeBus.emit('TableStatusChanged' as any, {
          tableId: table.id,
          restaurantId: restId,
          tableNumber: table.tableNumber,
          status: 'OCCUPIED',
          data: table,
        });
      }
    }

    this.saveDatabase();
    realtimeBus.emit('OrderCreated' as any, {
      orderId: newOrd.id,
      restaurantId: restId,
      tableId: newOrd.tableId,
      tableNumber: newOrd.tableNumber,
      tableSessionId: newOrd.tableSessionId,
      data: newOrd,
    });
    return newOrd;
  }

  async getKitchenAnalytics(restaurantId?: string) {
    await delay(50);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    const kitchenOrders = this.orders.filter(
      (o) => o.restaurantId === targetId && o.items.some((i) => i.targetDestination === 'KITCHEN' || getFulfillmentStation(i) === 'KITCHEN')
    );
    const completed = kitchenOrders.filter(
      (o) => o.kitchenStatus === 'COMPLETED' || o.status === 'DELIVERED' || o.status === 'COMPLETED' || o.status === 'READY'
    );

    let totalPrepMins = 0;
    completed.forEach((o) => {
      const created = new Date(o.createdAt).getTime();
      const updated = new Date(o.updatedAt || o.createdAt).getTime();
      const diffMins = Math.max(1, Math.round((updated - created) / (1000 * 60)));
      totalPrepMins += diffMins;
    });
    const avgPrepTimeMinutes = completed.length > 0 ? Number((totalPrepMins / completed.length).toFixed(1)) : 0;

    const onTimeCount = completed.filter((o) => {
      const targetEta = o.estimatedPrepTimeMinutes || 15;
      const created = new Date(o.createdAt).getTime();
      const updated = new Date(o.updatedAt || o.createdAt).getTime();
      const diffMins = (updated - created) / (1000 * 60);
      return diffMins <= targetEta + 2;
    }).length;

    const onTimeDeliveryRate = completed.length > 0 ? Number(((onTimeCount / completed.length) * 100).toFixed(1)) : 100;
    const activeKitchenStations = Array.from(new Set(kitchenOrders.flatMap((o) => o.items.map((i) => i.category || 'Kitchen')))).length || 1;
    const activeQueue = kitchenOrders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
    const kitchenLoadPercent = Math.min(100, Math.round((activeQueue / 10) * 100));

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const dailyPerformance = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      const dayName = days[d.getDay()];
      const dayOrders = completed.filter((o) => {
        const oDate = new Date(o.createdAt);
        return oDate.toDateString() === d.toDateString();
      });
      let dayPrepMins = 0;
      dayOrders.forEach((o) => {
        const created = new Date(o.createdAt).getTime();
        const updated = new Date(o.updatedAt || o.createdAt).getTime();
        dayPrepMins += Math.max(1, Math.round((updated - created) / (1000 * 60)));
      });
      const avgTime = dayOrders.length > 0 ? Number((dayPrepMins / dayOrders.length).toFixed(1)) : 0;
      return { day: dayName, avgTime, count: dayOrders.length };
    });

    return {
      avgPrepTimeMinutes,
      totalOrdersPrepared: completed.length,
      onTimeDeliveryRate,
      activeKitchenStations,
      kitchenLoadPercent,
      etaAccuracyPercent: onTimeDeliveryRate,
      dailyPerformance,
    };
  }

  async getSmartETARecommendation(itemNames?: any) {
    await delay(100);
    return {
      recommendedMinutes: 15,
      confidenceScore: 0.95,
      kitchenLoadFactor: 'MODERATE',
      reasons: ['Base recipe prep time: 12m', 'Current line volume: +3m'],
    };
  }

  // Customer & Portal Helper APIs
  async requestBill(tableNumber: string, restaurantId?: string) {
    const targetRestId = this.resolveTenantRestaurantId(restaurantId) || 'rest-1';
    const req = {
      id: `req-${Date.now()}`,
      restaurantId: targetRestId,
      tableNumber,
      requestType: 'BILL',
      message: `Table ${tableNumber} requested the final bill.`,
      status: 'PENDING',
      timestamp: 'Just now',
    };
    try {
      const res = await fetch(`${this.getApiBaseUrl()}/customer-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: targetRestId,
          tableNumber,
          requestType: 'BILL',
          message: `Table ${tableNumber} requested the final bill.`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (err) {
      console.warn("Failed to request bill via API:", err);
    }
    this.customerRequests.push(req as any);
    this.saveDatabase();
    return req;
  }

  async callWaiter(tableNumber: string, reason: string, restaurantId?: string) {
    const targetRestId = this.resolveTenantRestaurantId(restaurantId) || 'rest-1';
    const req = {
      id: `req-${Date.now()}`,
      restaurantId: targetRestId,
      tableNumber,
      requestType: 'WATER',
      message: `Table ${tableNumber} called waiter: ${reason}`,
      status: 'PENDING',
      timestamp: 'Just now',
    };
    try {
      const res = await fetch(`${this.getApiBaseUrl()}/customer-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: targetRestId,
          tableNumber,
          requestType: 'WATER',
          message: `Table ${tableNumber} called waiter: ${reason}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (err) {
      console.warn("Failed to call waiter via API:", err);
    }
    this.customerRequests.push(req as any);
    this.saveDatabase();
    return req;
  }

  async createCustomerOrder(orderData: any) {
    return this.createOrder(orderData);
  }

  async verifyOwnerEmail(email: string, code?: string) {
    await delay(150);
    return { user: this.currentUser, tokens: this.currentTokens };
  }

  async createOrganization(orgData: any) {
    await delay(200);
    const newOrg: Organization = {
      id: `org-${Date.now()}`,
      name: orgData.name || 'New Organization',
      legalBusinessName: orgData.legalBusinessName || orgData.name || 'New Corp',
      country: 'India',
      currency: 'INR (₹)',
      timezone: 'Asia/Kolkata (IST)',
      businessAddress: orgData.businessAddress || 'Main Street',
      contactNumber: orgData.contactNumber || '+1 555-0100',
      supportEmail: orgData.supportEmail || 'support@org.com',
      slug: (orgData.name || 'org').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      plan: 'STARTER',
      status: 'ACTIVE',
      restaurantsCount: 1,
      monthlyRevenue: 0,
      createdAt: new Date().toISOString().split('T')[0],
      ownerName: orgData.ownerName || 'Owner',
      ownerEmail: orgData.ownerEmail || 'owner@org.com',
    };
    this.organizations.push(newOrg);
    this.saveDatabase();
    return newOrg;
  }

  // Waiter & Customer Request APIs
  async getCustomerRequests(restaurantId?: string) {
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    try {
      const res = await fetch(`${this.getApiBaseUrl()}/customer-requests?restaurant_id=${encodeURIComponent(targetId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data;
        }
      }
    } catch (err) {
      console.warn("Failed to fetch customer requests from API:", err);
    }
    this.loadDatabase();
    return this.customerRequests.filter((r) => r.restaurantId === targetId);
  }

  async getWaiterNotifications(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    return this.notifications.filter((n) => !n.restaurantId || n.restaurantId === targetId);
  }

  async getWaiterShiftSummary() {
    await delay(100);
    return {
      activeTablesAssigned: 4,
      totalOrdersServed: 18,
      tipsCollected: 145.0,
      totalSalesVolume: 1250.0,
    };
  }

  async acceptCustomerRequest(reqId: string, waiterName?: string) {
    return this.updateCustomerRequestStatus(reqId, 'ACCEPTED', waiterName);
  }

  async rejectCustomerRequest(reqId: string, waiterName?: string) {
    return this.updateCustomerRequestStatus(reqId, 'REJECTED', waiterName);
  }

  async updateCustomerRequestStatus(reqId: string, status: any, waiterName?: string) {
    try {
      const res = await fetch(`${this.getApiBaseUrl()}/customer-requests/${encodeURIComponent(reqId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          waiterName: waiterName || 'Waiter',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (err) {
      console.warn("Failed to update customer request status via API:", err);
    }
    const req = this.customerRequests.find((r) => r.id === reqId);
    if (req) {
      req.status = status;
      this.saveDatabase();
    }
    return req;
  }

  async transferCustomerRequest(reqId: string, newWaiterId: string) {
    await delay(100);
    return true;
  }

  async sendWaiterBroadcast(message: string, senderId?: string) {
    await delay(100);
    return true;
  }

  async createCustomerRequest(req: any) {
    return this.callWaiter(req.tableNumber || 'Table 01', req.customTitle || req.requestType || 'Water', req.restaurantId);
  }

  async markAllNotificationsRead() {
    await delay(100);
    this.notifications.forEach((n) => (n.isRead = true));
    this.saveDatabase();
  }

  // Helper to clear database store
  clearDatabase() {
    this.organizations = [];
    this.restaurants = [];
    this.menuItems = [];
    this.categories = [];
    this.orders = [];
    this.tables = [];
    this.employees = [];
    this.inventory = [];
    this.auditLogs = [];
    this.customerRequests = [];
    this.platformNotifications = [];
    this.users = [];
    this.currentUser = null;
    this.currentRestaurantId = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(DATABASE_STORAGE_KEY);
      localStorage.removeItem('dinely_active_restaurant_id');
      localStorage.removeItem('dinely_restaurant_id');
      Object.values(SESSION_KEYS).forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
    }
  }
}

export const api = new DinelyApiClient();
