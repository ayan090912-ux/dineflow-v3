import {
  Organization,
  Restaurant,
  MenuItem,
  Order,
  Table,
  Employee,
  InventoryItem,
  Supplier,
  AuditLog,
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
  FulfillmentTicket,
  Bill,
  BusinessType,
  RestaurantLifecycleStatus,
} from '../../types';
import { realtimeBus } from '../realtime';
import {
  signOutFirebase,
  ensureFirebaseAuthReady,
  getValidFirebaseIdToken,
  authStateMachine,
} from '../../auth/firebase';
import { matchTableNumber } from '../../utils/tableUtils';
import {
  getTenantFromHostname,
  getRestaurantPublicDomain,
  getRestaurantCustomerUrl,
} from '../../utils/tenantResolver';
import {
  PortalScope,
  SESSION_KEYS,
  TOKEN_KEYS,
  getPortalScopeFromPath,
  getApiBaseUrl,
  DATABASE_STORAGE_KEY,
} from './helpers';

export class BaseApiClient {
  public organizations: Organization[] = [];
  public restaurants: Restaurant[] = [];
  public menuItems: MenuItem[] = [];
  public categories: MenuCategory[] = [];
  public barCategories: BarCategory[] = [];
  public barMenuItems: BarMenuItem[] = [];
  public orders: Order[] = [];
  public fulfillmentTickets: FulfillmentTicket[] = [];
  public tables: Table[] = [];
  public tableSessions: TableSession[] = [];
  public bills: Bill[] = [];
  public businessDays: BusinessDay[] = [];
  public employees: Employee[] = [];
  public inventory: InventoryItem[] = [];
  public suppliers: Supplier[] = [];
  public auditLogs: AuditLog[] = [];
  public customerRequests: CustomerRequest[] = [];
  public platformNotifications: PlatformNotification[] = [];
  public notifications: WaiterNotification[] = [];
  public users: User[] = [];

  public currentUsersByScope: Record<PortalScope, User | null> = {
    ADMIN: null,
    OWNER: null,
    KITCHEN: null,
    WAITER: null,
    BAR: null,
    INVENTORY: null,
    STAFF: null,
    CUSTOMER: null,
  };
  public currentTokensByScope: Record<PortalScope, AuthTokens | null> = {
    ADMIN: null,
    OWNER: null,
    KITCHEN: null,
    WAITER: null,
    BAR: null,
    INVENTORY: null,
    STAFF: null,
    CUSTOMER: null,
  };
  public _currentRestaurantId: string | null = null;
  public currentRestaurantIdsByScope: Record<PortalScope, string | null> = {
    ADMIN: null,
    OWNER: null,
    KITCHEN: null,
    WAITER: null,
    BAR: null,
    INVENTORY: null,
    STAFF: null,
    CUSTOMER: null,
  };

  public inFlightRequests: Map<string, Promise<any>> = new Map();
  public queryCache: Map<string, { data: any; expiry: number }> = new Map();

  public get currentRestaurantId(): string | null {
    return this.getCurrentRestaurantId();
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

  public setSessionTokens(tokens: AuthTokens | null, scope?: PortalScope) {
    const targetScope = scope || getPortalScopeFromPath();
    this.currentTokensByScope[targetScope] = tokens;
  }

  public getCachedOrFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.queryCache.get(key);
    if (cached && Date.now() < cached.expiry) {
      return Promise.resolve(cached.data);
    }
    const inFlight = this.inFlightRequests.get(key);
    if (inFlight) {
      return inFlight;
    }
    const p = fetcher()
      .then((data) => {
        this.queryCache.set(key, { data, expiry: Date.now() + ttlMs });
        this.inFlightRequests.delete(key);
        return data;
      })
      .catch((err) => {
        this.inFlightRequests.delete(key);
        throw err;
      });
    this.inFlightRequests.set(key, p);
    return p;
  }

  public invalidateQueryCache(keyPrefix?: string) {
    if (!keyPrefix) {
      this.queryCache.clear();
      return;
    }
    for (const key of Array.from(this.queryCache.keys())) {
      if (key.startsWith(keyPrefix)) {
        this.queryCache.delete(key);
      }
    }
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

    this.purgeLegacyDemoData();
    this.sanitizeTableSessions();
  }

  public purgeLegacyDemoData() {
    const fakeEmails = ['owner@cafeco.food', 'chaat@dinely.food', 'contact@cafeco.food', 'owner@lumiere.food', 'contact@lumierebistro.food'];
    const fakeNames = ['mumbai chaat cart', 'trik', 'delhi street chaat', 'cafe.co', 'lumière bistro', 'lumiere bistro'];
    const fakeIds = ['rest-1', 'rest-1787446097984', 'rest-1787655544312'];

    this.restaurants = this.restaurants.filter((r) => {
      const isFakeEmail = fakeEmails.includes((r.ownerEmail || '').toLowerCase()) || fakeEmails.includes((r.email || '').toLowerCase());
      const isFakeName = fakeNames.some((fn) => (r.name || '').toLowerCase().trim() === fn);
      const isFakeId = fakeIds.includes(r.id);
      return !isFakeEmail && !isFakeName && !isFakeId;
    });
  }

  public sanitizeTableSessions() {
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

    this.tables.forEach((tbl) => {
      if (!tbl.qrCodeUrl || tbl.qrCodeUrl.includes('qrserver.com') || tbl.qrCodeUrl.includes('.dinely.app') || tbl.qrCodeUrl.includes('tenant=') || tbl.qrCodeUrl.includes('restaurant=')) {
        const rest = this.restaurants.find((r) => r.id === tbl.restaurantId);
        const slug = rest?.publicSlug || rest?.slug || tbl.restaurantId;
        tbl.qrCodeUrl = getRestaurantCustomerUrl(slug, tbl.tableNumber, tbl.id);
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

  public saveDatabase() {
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
      } else if (user.role === 'CHEF') {
        scope = 'KITCHEN';
      } else if (user.role === 'WAITER') {
        scope = 'WAITER';
      } else if (user.role === 'BARTENDER' || user.role === 'BAR_STAFF') {
        scope = 'BAR';
      } else if (user.role === 'INVENTORY_MANAGER') {
        scope = 'INVENTORY';
      } else if (user.role === 'CUSTOMER') {
        scope = 'CUSTOMER';
      } else {
        scope = 'STAFF';
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
        if (scope === 'ADMIN' && tokens?.accessToken) {
          localStorage.setItem('dinely_platform_admin_id_token', tokens.accessToken);
          sessionStorage.setItem('dinely_admin_token', tokens.accessToken);
          localStorage.setItem('dinely_admin_token', tokens.accessToken);
        }
      }
    } catch (e) {
      console.error('Failed to save session', e);
    }
    this.saveDatabase();
  }

  public async executeProtectedRequest<T = any>(
    endpoint: string,
    options: RequestInit = {},
    scope?: PortalScope
  ): Promise<T> {
    await ensureFirebaseAuthReady();
    const targetScope = scope || getPortalScopeFromPath();
    const apiBase = getApiBaseUrl();
    const url = endpoint.startsWith('http') ? endpoint : `${apiBase}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    let token: string | null = null;
    if (targetScope === 'ADMIN') {
      token = await getValidFirebaseIdToken(false);
      if (!token) {
        token = await getValidFirebaseIdToken(true);
      }
      if (!token && typeof window !== 'undefined') {
        token = localStorage.getItem('dinely_platform_admin_id_token') ||
                sessionStorage.getItem('dinely_admin_token') ||
                localStorage.getItem('dinely_admin_token') || null;
      }
      if (!token) {
        const unauthErr = new Error('Administrator authentication required: No active Firebase session. Please sign in with administrator credentials.');
        (unauthErr as any).statusCode = 401;
        throw unauthErr;
      }
    } else {
      token = await getValidFirebaseIdToken(false);
      if (!token && typeof window !== 'undefined') {
        token = localStorage.getItem('dinely_auth_token') ||
                localStorage.getItem(`dinely_staff_token_${targetScope.toLowerCase()}`) ||
                this.currentTokensByScope[targetScope]?.accessToken ||
                this.currentTokensByScope['OWNER']?.accessToken || null;
      }

      const isStaffScope = ['KITCHEN', 'WAITER', 'BAR', 'INVENTORY', 'STAFF'].includes(targetScope);
      if (!isStaffScope && token && (token.startsWith('df_jwt_') || token.startsWith('df_ref_'))) {
        token = null;
      }

      if (!token && !isStaffScope) {
        this.clearAllAuthSessions();
        authStateMachine.handleSessionExpired();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dinely_auth_required', { detail: { reason: 'UNAUTHENTICATED' } }));
        }
        const unauthErr = new Error('Authentication required: No valid Firebase ID token found. Please log in.');
        (unauthErr as any).statusCode = 401;
        throw unauthErr;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (typeof window !== 'undefined') {
      const resolution = getTenantFromHostname();
      if (resolution.isTenantSubdomain && resolution.slug) {
        headers['X-Tenant-Domain'] = resolution.hostname;
        headers['X-Tenant-Slug'] = resolution.slug;
        headers['X-Forwarded-Host'] = resolution.hostname;
      }
    }

    const staffRestId = this.currentRestaurantIdsByScope[targetScope] || this.resolveTenantRestaurantId() || this.getCurrentRestaurantId();
    if (staffRestId) {
      headers['X-Staff-Restaurant-Id'] = staffRestId;
      headers['X-Restaurant-Id'] = staffRestId;
      headers['X-Staff-Role'] = this.currentUser?.role || targetScope;
      if (this.currentUser?.id || this.currentUser?.name) {
        headers['X-Staff-Id'] = this.currentUser?.id || this.currentUser?.name || 'staff';
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (networkErr: any) {
      clearTimeout(timeoutId);
      const isTimeout = networkErr.name === 'AbortError';
      const err = new Error(
        isTimeout
          ? 'API request timed out. Backend may be waking up (cold start).'
          : (networkErr.message || 'Network error connecting to backend.')
      );
      (err as any).statusCode = 0;
      (err as any).isNetworkError = true;
      throw err;
    }

    if (res.status === 401) {
      if (token && token.startsWith('df_')) {
        const err = new Error(`Staff terminal session unauthorized (${targetScope}). Please log in again.`);
        (err as any).statusCode = 401;
        throw err;
      }
      let freshToken: string | null = null;
      try {
        freshToken = await getValidFirebaseIdToken(true);
      } catch (refreshErr) {
        console.warn('[executeProtectedRequest] Token refresh attempt failed:', refreshErr);
      }

      if (freshToken) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('dinely_auth_token', freshToken);
          sessionStorage.setItem('dinely_auth_token', freshToken);
          if (targetScope === 'ADMIN') {
            localStorage.setItem('dinely_platform_admin_id_token', freshToken);
            sessionStorage.setItem('dinely_admin_token', freshToken);
            localStorage.setItem('dinely_admin_token', freshToken);
          }
        }
        if (this.currentTokensByScope[targetScope]) {
          this.currentTokensByScope[targetScope].accessToken = freshToken;
        }
        headers['Authorization'] = `Bearer ${freshToken}`;

        let retryRes: Response;
        try {
          retryRes = await fetch(url, { ...options, headers });
        } catch (retryNetErr: any) {
          const err = new Error(retryNetErr.message || 'Network error on retry request.');
          (err as any).statusCode = 0;
          (err as any).isNetworkError = true;
          throw err;
        }

        if (retryRes.ok) {
          return await retryRes.json();
        }

        if (retryRes.status === 401) {
          this.clearAllAuthSessions();
          authStateMachine.handleSessionExpired();
          if (typeof window !== 'undefined' && targetScope !== 'ADMIN') {
            window.dispatchEvent(new CustomEvent('dinely_auth_required', { detail: { reason: 'REFRESH_FAILED' } }));
          }
          const expiredErr = new Error('Session expired and token refresh was rejected. Please log in again.');
          (expiredErr as any).statusCode = 401;
          throw expiredErr;
        }
        res = retryRes;
      } else {
        this.clearAllAuthSessions();
        authStateMachine.handleSessionExpired();
        if (typeof window !== 'undefined' && targetScope !== 'ADMIN') {
          window.dispatchEvent(new CustomEvent('dinely_auth_required', { detail: { reason: 'REFRESH_FAILED' } }));
        }
        const expiredErr = new Error('Session expired and could not be refreshed. Please log in again.');
        (expiredErr as any).statusCode = 401;
        throw expiredErr;
      }
    }

    if (!res.ok) {
      let errMsg = `Request failed (HTTP ${res.status})`;
      try {
        const errJson = await res.json();
        errMsg = errJson.detail || errJson.message || errMsg;
      } catch {
        const text = await res.text().catch(() => '');
        if (text) errMsg = `${errMsg}: ${text.slice(0, 120)}`;
      }
      const err = new Error(errMsg);
      (err as any).statusCode = res.status;
      throw err;
    }

    return await res.json();
  }

  public async fetchAuthMe(providedToken?: string): Promise<any> {
    const token = providedToken || await getValidFirebaseIdToken(false) || (typeof window !== 'undefined' ? localStorage.getItem('dinely_auth_token') : null);
    if (!token) return null;

    const apiBase = getApiBaseUrl();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    if (typeof window !== 'undefined') {
      const resolution = getTenantFromHostname();
      if (resolution.isTenantSubdomain && resolution.slug) {
        headers['X-Tenant-Domain'] = resolution.hostname;
        headers['X-Tenant-Slug'] = resolution.slug;
      }
    }

    try {
      const res = await fetch(`${apiBase}/auth/me`, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && data.restaurants && Array.isArray(data.restaurants)) {
          const mappedList = data.restaurants.map((r: any) => this.mapBackendRestaurant(r));
          this.restaurants = [
            ...this.restaurants.filter((ex) => !mappedList.some((m) => m.id === ex.id)),
            ...mappedList,
          ];
          this.saveDatabase();
        }
        if (data && data.restaurant) {
          const mappedRest = this.mapBackendRestaurant(data.restaurant);
          this.setCurrentRestaurantId(mappedRest.id);
          const exIdx = this.restaurants.findIndex((r) => r.id === mappedRest.id);
          if (exIdx >= 0) this.restaurants[exIdx] = mappedRest;
          else this.restaurants.unshift(mappedRest);
          this.saveDatabase();
          data.restaurant = mappedRest;
        }
        return data;
      }
    } catch (e) {
      console.warn('API /auth/me call warning:', e);
    }
    return null;
  }

  public clearAllAuthSessions() {
    this.currentUser = null;
    (['ADMIN', 'OWNER', 'KITCHEN', 'WAITER', 'BAR', 'INVENTORY', 'STAFF', 'CUSTOMER'] as PortalScope[]).forEach((s) => {
      delete this.currentUsersByScope[s];
      delete this.currentTokensByScope[s];
      if (typeof window !== 'undefined') {
        const sessionKey = SESSION_KEYS[s];
        const tokenKey = TOKEN_KEYS[s];
        if (sessionKey) {
          localStorage.removeItem(sessionKey);
          sessionStorage.removeItem(sessionKey);
        }
        if (tokenKey) {
          localStorage.removeItem(tokenKey);
          sessionStorage.removeItem(tokenKey);
        }
        const userKey = `dinely_user_${s.toLowerCase()}`;
        localStorage.removeItem(userKey);
        sessionStorage.removeItem(userKey);
      }
    });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('dinely_auth_token');
      sessionStorage.removeItem('dinely_auth_token');
      localStorage.removeItem('dinely_platform_admin_id_token');
      sessionStorage.removeItem('dinely_admin_token');
      localStorage.removeItem('dinely_active_restaurant_id');
      localStorage.removeItem('dinely_restaurant_id');
      sessionStorage.removeItem('dinely_active_restaurant_id');
      sessionStorage.removeItem('dinely_restaurant_id');
    }
    try {
      signOutFirebase();
    } catch (_) {}
    authStateMachine.logout();
  }

  public async executeAdminRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return this.executeProtectedRequest<T>(endpoint, options, 'ADMIN');
  }

  public getAuthHeader(scope?: PortalScope): Record<string, string> {
    const targetScope = scope || getPortalScopeFromPath();
    let token: string | null = null;

    if (targetScope === 'ADMIN') {
      if (!this.currentTokensByScope['ADMIN']) {
        this.restoreSession('ADMIN');
      }
      token = this.currentTokensByScope['ADMIN']?.accessToken ||
              (typeof window !== 'undefined' ? (
                localStorage.getItem('dinely_platform_admin_id_token') ||
                sessionStorage.getItem('dinely_admin_token') ||
                localStorage.getItem('dinely_admin_token') ||
                localStorage.getItem('dinely_auth_token')
              ) : null);
    } else if (['KITCHEN', 'WAITER', 'BAR', 'INVENTORY', 'STAFF'].includes(targetScope)) {
      token = this.currentTokensByScope[targetScope]?.accessToken ||
              this.currentTokensByScope['STAFF']?.accessToken ||
              (typeof window !== 'undefined' ? (
                sessionStorage.getItem('dinely_staff_token') ||
                localStorage.getItem('dinely_staff_token')
              ) : null);
    } else {
      // OWNER and default
      token = this.currentTokensByScope[targetScope]?.accessToken ||
              this.currentTokensByScope['OWNER']?.accessToken ||
              (typeof window !== 'undefined' ? (
                sessionStorage.getItem('dinely_owner_token') ||
                localStorage.getItem('dinely_owner_token') ||
                localStorage.getItem('dinely_auth_token')
              ) : null);
    }

    if (token && (token.startsWith('df_jwt_') || token.startsWith('df_ref_'))) {
      token = null;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof window !== 'undefined') {
      const resolution = getTenantFromHostname();
      if (resolution.isTenantSubdomain && resolution.slug) {
        headers['X-Tenant-Domain'] = resolution.hostname;
        headers['X-Tenant-Slug'] = resolution.slug;
        headers['X-Forwarded-Host'] = resolution.hostname;
      }
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  public getCurrentUser(scope?: PortalScope): User | null {
    const targetScope = scope || getPortalScopeFromPath();

    if (targetScope === 'ADMIN') {
      const adminUser = this.currentUsersByScope['ADMIN'] || this.restoreSession('ADMIN');
      if (adminUser && (adminUser.role === 'PLATFORM_ADMIN' || adminUser.role === 'SUPER_ADMIN')) {
        return adminUser;
      }
      return null;
    }

    if (targetScope === 'OWNER') {
      const ownerUser = this.currentUsersByScope['OWNER'] || this.restoreSession('OWNER');
      if (
        ownerUser &&
        (ownerUser as any).scope !== 'STAFF' &&
        (ownerUser.role === 'RESTAURANT_OWNER' || ownerUser.role === 'OWNER' || ownerUser.role === 'MANAGER' || ownerUser.role === 'ADMIN')
      ) {
        return ownerUser;
      }
      return null;
    }

    if (!this.currentUsersByScope[targetScope]) {
      this.restoreSession(targetScope);
    }
    const directUser = this.currentUsersByScope[targetScope];
    if (directUser) {
      return directUser;
    }

    if (['KITCHEN', 'WAITER', 'BAR', 'INVENTORY', 'STAFF'].includes(targetScope)) {
      const staffUser = this.currentUsersByScope['STAFF'] || this.restoreSession('STAFF');
      if (staffUser) return staffUser;

      for (const s of ['KITCHEN', 'WAITER', 'BAR', 'INVENTORY'] as PortalScope[]) {
        if (s !== targetScope) {
          const u = this.currentUsersByScope[s] || this.restoreSession(s);
          if (u) return u;
        }
      }
      return null;
    }

    return null;
  }

  public setCurrentUser(user: User | null, scope?: PortalScope) {
    const targetScope = scope || (user?.role === 'PLATFORM_ADMIN' || user?.role === 'SUPER_ADMIN' ? 'ADMIN' : getPortalScopeFromPath());

    if (user) {
      this.currentUsersByScope[targetScope] = user;
      const existingUserIdx = this.users.findIndex((u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase());
      if (existingUserIdx >= 0) {
        this.users[existingUserIdx] = { ...this.users[existingUserIdx], ...user };
      } else {
        this.users.push(user);
      }

      if (user.restaurantId) {
        this.currentRestaurantIdsByScope[targetScope] = user.restaurantId;
        this._currentRestaurantId = user.restaurantId;
      }

      if (typeof window !== 'undefined') {
        const storageKey = `dinely_user_${targetScope.toLowerCase()}`;
        localStorage.setItem(storageKey, JSON.stringify(user));
        sessionStorage.setItem(storageKey, JSON.stringify(user));
      }
    } else {
      delete this.currentUsersByScope[targetScope];
      if (typeof window !== 'undefined') {
        const storageKey = `dinely_user_${targetScope.toLowerCase()}`;
        localStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageKey);
      }
    }
    this.saveDatabase();
  }

  public clearSession(scope: PortalScope) {
    delete this.currentUsersByScope[scope];
    delete this.currentTokensByScope[scope];
    delete this.currentRestaurantIdsByScope[scope];
    if (typeof window !== 'undefined') {
      const userKey = `dinely_user_${scope.toLowerCase()}`;
      localStorage.removeItem(userKey);
      sessionStorage.removeItem(userKey);
      const sessionKey = SESSION_KEYS[scope];
      if (sessionKey) {
        localStorage.removeItem(sessionKey);
        sessionStorage.removeItem(sessionKey);
      }
      const tokenKey = TOKEN_KEYS[scope];
      if (tokenKey) {
        localStorage.removeItem(tokenKey);
        sessionStorage.removeItem(tokenKey);
      }
    }
  }

  public getCurrentRestaurantId(): string {
    const scope = getPortalScopeFromPath();
    if (typeof window !== 'undefined') {
      const tenantRes = getTenantFromHostname();
      if (tenantRes.isTenantSubdomain && tenantRes.slug) {
        const found = this.restaurants.find(
          (r) => !r.isDeleted && (r.slug === tenantRes.slug || r.publicSlug === tenantRes.slug)
        );
        if (found) {
          return found.id;
        }
        if (this._currentRestaurantId) {
          return this._currentRestaurantId;
        }
        return tenantRes.slug;
      }
    }

    let candidateId = this.currentRestaurantIdsByScope[scope] || this.getCurrentUser(scope)?.restaurantId || this._currentRestaurantId || '';
    if (!candidateId && typeof window !== 'undefined') {
      candidateId = localStorage.getItem('dinely_active_restaurant_id') || localStorage.getItem('dinely_restaurant_id') || sessionStorage.getItem('dinely_active_restaurant_id') || '';
    }
    return this.resolveTenantRestaurantId(candidateId) || candidateId || '';
  }

  public setCurrentRestaurantId(id: string) {
    const cleanId = String(id || '').trim();
    const scope = getPortalScopeFromPath();
    this.currentRestaurantIdsByScope[scope] = cleanId;
    this._currentRestaurantId = cleanId;

    const user = this.getCurrentUser(scope);
    if (user) {
      user.restaurantId = cleanId;
      this.setCurrentUser(user, scope);
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dinely_active_restaurant_id', cleanId);
      sessionStorage.setItem('dinely_restaurant_id', cleanId);
      localStorage.setItem('dinely_active_restaurant_id', cleanId);
      localStorage.setItem('dinely_restaurant_id', cleanId);
    }
  }

  public resolveTenantRestaurantId(providedId?: string): string | null {
    if (typeof window !== 'undefined') {
      const tenantRes = getTenantFromHostname();
      if (tenantRes.isTenantSubdomain && tenantRes.slug) {
        const found = this.restaurants.find(
          (r) => !r.isDeleted && (r.slug === tenantRes.slug || r.publicSlug === tenantRes.slug)
        );
        const hostnameId = found ? found.id : tenantRes.slug;

        if (providedId && String(providedId).trim()) {
          const cleanId = String(providedId).trim();
          if (found && (cleanId === found.id || cleanId === found.slug || cleanId.toLowerCase() === found.id.toLowerCase())) {
            return found.id;
          }
          if (cleanId === tenantRes.slug) {
            return hostnameId;
          }
          return hostnameId;
        }
        return hostnameId;
      }
    }

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

    if (this._currentRestaurantId) {
      return this._currentRestaurantId;
    }

    const scope = getPortalScopeFromPath();
    const user = this.getCurrentUser(scope);
    const scopeRestId = this.currentRestaurantIdsByScope[scope] || user?.restaurantId;
    if (scopeRestId) {
      return scopeRestId;
    }

    return null;
  }

  public mapBackendRestaurant(r: any): Restaurant {
    const bType = (r.businessType || r.business_type || 'RESTAURANT').toUpperCase();
    const cleanSlug = (r.slug || r.name || 'restaurant').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restaurant';
    const pubSlug = (r.publicSlug || r.public_slug || cleanSlug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restaurant';
    const canonicalDomain = (r.domain && !r.domain.includes('.dinely.app') && !r.domain.includes('dinely.food/customer?tenant='))
      ? r.domain
      : getRestaurantPublicDomain(pubSlug);
    return {
      id: r.id,
      orgId: r.org_id || r.orgId || 'org-dinely',
      name: r.name,
      slug: cleanSlug,
      publicSlug: pubSlug,
      cuisine: r.cuisine || 'Multi-Cuisine',
      businessType: bType as BusinessType,
      hasBar: r.hasBar !== undefined ? Boolean(r.hasBar) : (r.has_bar !== undefined ? Boolean(r.has_bar) : (bType === 'BAR')),
      hasTables: r.hasTables !== undefined ? Boolean(r.hasTables) : (r.has_tables !== undefined ? Boolean(r.has_tables) : true),
      hasKitchen: r.hasKitchen !== undefined ? Boolean(r.hasKitchen) : (r.has_kitchen !== undefined ? Boolean(r.has_kitchen) : true),
      hasWaiter: r.hasWaiter !== undefined ? Boolean(r.hasWaiter) : (r.has_waiter !== undefined ? Boolean(r.has_waiter) : true),
      hasInventory: r.hasInventory !== undefined ? Boolean(r.hasInventory) : (r.has_inventory !== undefined ? Boolean(r.has_inventory) : true),
      hasBilling: r.hasBilling !== undefined ? Boolean(r.hasBilling) : (r.has_billing !== undefined ? Boolean(r.has_billing) : true),
      enabledModules: r.enabledModules !== undefined ? r.enabledModules : (r.enabled_modules !== undefined ? r.enabled_modules : undefined),
      orderNumberPrefix: r.orderNumberPrefix || r.order_number_prefix || '#ORD',
      address: r.address || '',
      phone: r.phone || '',
      email: r.email || '',
      ownerName: r.ownerName || r.owner_name || '',
      ownerEmail: r.ownerEmail || r.owner_email || '',
      ownerUid: r.ownerUid || r.owner_uid || '',
      domain: canonicalDomain,
      isApproved: Boolean(r.isApproved || r.is_approved),
      status: r.status || 'OPEN',
      lifecycleStatus: (r.lifecycleStatus || r.lifecycle_status || (r.isApproved || r.is_approved ? 'LIVE' : 'PENDING_APPROVAL')) as RestaurantLifecycleStatus,
      rejectionReason: r.rejectionReason || r.rejection_reason,
      requestedChanges: r.requestedChanges || r.requested_changes,
      approvedAt: r.approvedAt || r.approved_at,
      approvedBy: r.approvedBy || r.approved_by,
      submittedAt: r.submittedAt || r.submitted_at || r.createdAt || r.created_at,
      rating: r.rating || 5.0,
      activeOrdersCount: 0,
      tablesCount: r.tablesCount || r.tables_count || 8,
      currency: r.currency || 'INR (₹)',
      taxPercentage: r.taxPercentage || r.tax_percentage || 5.0,
      theme: r.theme || r.theme_json || {
        restaurantId: r.id,
        restaurantName: r.name,
        logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&auto=format&fit=crop&q=80',
        bannerUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
        primaryColor: '#f43f5e',
        secondaryColor: '#475569',
        accentColor: '#fbbf24',
        backgroundColor: '#0f172a',
        textColor: '#ffffff',
        fontFamily: 'sans',
        borderRadius: 'lg',
        currency: r.currency || 'INR (₹)',
      },
    };
  }

  public ensureRestaurantDefaults(rest: Restaurant): Restaurant {
    if (!rest.businessType) {
      rest.businessType = rest.features?.bar ? 'BAR' : 'RESTAURANT';
    }
    const bType = (rest.businessType || 'RESTAURANT').toUpperCase();
    if (rest.hasBar === undefined) {
      rest.hasBar = bType === 'BAR' || Boolean(rest.features?.bar);
    }
    if (rest.hasKitchen === undefined) {
      rest.hasKitchen = true;
    }
    if (rest.hasTables === undefined) {
      rest.hasTables = bType !== 'FOOD_CART';
    }
    if (rest.hasWaiter === undefined) {
      rest.hasWaiter = bType !== 'FOOD_CART' || rest.hasTables !== false;
    }
    if (rest.hasInventory === undefined) {
      rest.hasInventory = true;
    }
    if (rest.hasBilling === undefined) {
      rest.hasBilling = true;
    }
    if (rest.enabledModules === undefined || rest.enabledModules === null) {
      if (bType === 'FOOD_CART') {
        rest.enabledModules = ['kitchen', 'inventory', 'billing'];
        if (rest.hasWaiter) rest.enabledModules.push('waiter');
      } else if (bType === 'BAR') {
        rest.enabledModules = ['bar', 'kitchen', 'waiter', 'inventory', 'billing'];
      } else {
        rest.enabledModules = ['kitchen', 'waiter', 'inventory', 'billing'];
        if (rest.hasBar) rest.enabledModules.push('bar');
      }
    }
    if (!rest.orderNumberPrefix) {
      rest.orderNumberPrefix = bType === 'FOOD_TRUCK' || bType === 'FOOD_CART' ? '#F' : '#ORD';
    }
    if (rest.taxPercentage === undefined) {
      rest.taxPercentage = 5.0;
    }
    return rest;
  }
}
