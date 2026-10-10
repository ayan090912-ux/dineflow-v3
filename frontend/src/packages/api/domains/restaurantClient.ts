import {
  Restaurant,
  BusinessType,
  RestaurantLifecycleStatus,
  Table,
  TableSession,
  MenuItem,
  MenuCategory,
  BarCategory,
  BarMenuItem,
  Employee,
  Supplier,
  InventoryItem,
  BusinessDay,
  ThemeConfig,
  Organization,
} from '../../types';
import { firebaseAuth } from '../../auth/firebase';
import { BaseApiClient } from '../core/baseClient';
import {
  delay,
  getApiBaseUrl,
  getPortalScopeFromPath,
} from '../core/helpers';
import {
  getRestaurantCustomerUrl,
  getRestaurantPublicDomain,
  getTenantFromHostname,
} from '../../utils/tenantResolver';
import { matchTableNumber, formatStandardTableNumber } from '../../utils/tableUtils';
import { realtimeBus } from '../realtime';

export class RestaurantClient {
  constructor(private base: BaseApiClient) {}

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
            lifecycleStatus: (r.lifecycle_status || 'APPROVED') as RestaurantLifecycleStatus,
            rating: r.rating || 4.8,
            activeOrdersCount: 0,
            tablesCount: r.tables_count || 12,
            currency: r.currency || 'INR (₹)',
            taxPercentage: r.tax_percentage || 5.0,
            theme: r.theme_json || {
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
          }));
        }
      }
    } catch (e) {
      console.warn('API fetch for getRestaurants failed:', e);
    }
    return this.base.restaurants.filter((r) => !r.isDeleted);
  }

  async createRestaurantForOwner(restData: {
    name: string;
    cuisine?: string;
    businessType?: BusinessType;
    hasBar?: boolean;
    hasTables?: boolean;
    hasKitchen?: boolean;
    hasWaiter?: boolean;
    hasInventory?: boolean;
    hasBilling?: boolean;
    enabledModules?: string[];
    orderNumberPrefix?: string;
    address?: string;
    phone?: string;
    email?: string;
    ownerName?: string;
    ownerEmail?: string;
    ownerUid?: string;
    tableCount?: number;
    features?: any;
    theme?: any;
  }) {
    const id = `rest-${Date.now()}`;
    const slug = restData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const orgId = this.base.currentUser?.orgId || `org-${Date.now()}`;
    const bType = restData.businessType || 'RESTAURANT';
    const hasBar = restData.hasBar !== undefined ? restData.hasBar : (bType === 'BAR');
    const hasTables = restData.hasTables !== undefined ? restData.hasTables : true;
    const hasKitchen = restData.hasKitchen !== undefined ? restData.hasKitchen : true;
    const hasWaiter = restData.hasWaiter !== undefined ? restData.hasWaiter : (hasTables !== false);
    const orderPrefix = restData.orderNumberPrefix || (bType === 'FOOD_TRUCK' ? '#F' : '#ORD');
    const ownerEmail = (restData.ownerEmail || this.base.currentUser?.email || '').trim().toLowerCase();
    const ownerName = restData.ownerName || this.base.currentUser?.name || 'Restaurant Owner';
    const ownerUid = restData.ownerUid || this.base.currentUser?.id;
    const finalTableCount = restData.tableCount !== undefined ? restData.tableCount : (hasTables ? 8 : 0);

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
      hasInventory: restData.hasInventory !== false,
      hasBilling: restData.hasBilling !== false,
      enabledModules: restData.enabledModules,
      orderNumberPrefix: orderPrefix,
      address: restData.address || 'Main Street Center',
      phone: restData.phone || '+1 555-0100',
      email: restData.email || 'contact@dinely.com',
      ownerName,
      ownerEmail,
      ownerUid,
      domain: getRestaurantCustomerUrl(slug),
      isApproved: false,
      lifecycleStatus: 'DRAFT',
      status: 'CLOSED',
      rating: 5.0,
      activeOrdersCount: 0,
      tablesCount: finalTableCount,
      submittedAt: undefined,
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

    try {
      const createPayload = {
        name: restData.name,
        cuisine: restData.cuisine || 'Multi-Cuisine',
        businessType: bType,
        hasKitchen,
        hasWaiter,
        hasBar,
        hasInventory: restData.hasInventory !== false,
        hasBilling: restData.hasBilling !== false,
        hasTables,
        tableCount: finalTableCount,
        enabledModules: restData.enabledModules,
        phone: restData.phone || '+1 555-0100',
        email: restData.email || 'contact@dinely.com',
        address: restData.address || 'Main Street Center',
        ownerName,
        ownerEmail,
        ownerUid,
        currency: 'INR (₹)',
        taxPercentage: 5.0,
        theme: newRest.theme,
        initialStatus: 'DRAFT',
        lifecycleStatus: 'DRAFT',
      };

      const backendRest = await this.base.executeProtectedRequest<any>('/restaurants', {
        method: 'POST',
        body: JSON.stringify(createPayload),
      }, 'OWNER');

      if (backendRest && backendRest.id) {
        newRest.id = backendRest.id;
        newRest.slug = backendRest.slug || newRest.slug;
        newRest.publicSlug = backendRest.public_slug || backendRest.slug || newRest.slug;
        newRest.domain = (backendRest.domain && !backendRest.domain.includes('.dinely.app') && !backendRest.domain.includes('dinely.food/customer?tenant='))
          ? backendRest.domain
          : getRestaurantPublicDomain(newRest.publicSlug);
        newRest.lifecycleStatus = (backendRest.lifecycle_status || 'DRAFT') as RestaurantLifecycleStatus;
        newRest.isApproved = Boolean(backendRest.is_approved);
        if (newRest.theme) {
          newRest.theme.restaurantId = backendRest.id;
        }
      }
    } catch (e: any) {
      console.error('Backend createRestaurant error:', e);
      throw e;
    }

    this.base.restaurants = [newRest, ...this.base.restaurants.filter((r) => r.id !== newRest.id)];
    this.base.currentRestaurantId = newRest.id;
    this.base.currentRestaurantIdsByScope['OWNER'] = newRest.id;
    if (this.base.currentUser) {
      this.base.currentUser.restaurantId = newRest.id;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('dinely_active_restaurant_id', newRest.id);
      sessionStorage.setItem('dinely_active_restaurant_id', newRest.id);
      localStorage.setItem('dinely_restaurant_id', newRest.id);
      sessionStorage.setItem('dinely_restaurant_id', newRest.id);
    }

    this.purgeDemoDataForRestaurant(newRest.id);
    this.base.saveDatabase();
    return newRest;
  }

  purgeDemoDataForRestaurant(restaurantId: string) {
    this.base.orders = this.base.orders.filter((o) => o.restaurantId !== restaurantId);
    this.base.bills = this.base.bills.filter((b) => b.restaurantId !== restaurantId);
    this.base.tableSessions = this.base.tableSessions.filter((s) => s.restaurantId !== restaurantId);
    this.base.fulfillmentTickets = this.base.fulfillmentTickets.filter((f) => f.restaurantId !== restaurantId);
    this.base.customerRequests = this.base.customerRequests.filter((c) => c.restaurantId !== restaurantId);
    this.base.saveDatabase();
  }

  async submitRestaurantLaunch(setupData: any) {
    const activeRestId = setupData.id || this.base.currentRestaurantId || this.base.currentUser?.restaurantId;
    let existing = this.base.restaurants.find((r) => r.id === activeRestId);

    if (!existing && activeRestId) {
      try {
        const apiBase = getApiBaseUrl();
        const fetchRes = await fetch(`${apiBase}/restaurants/${encodeURIComponent(activeRestId)}`, {
          headers: this.base.getAuthHeader('OWNER'),
        });
        if (fetchRes.ok) {
          const rawData = await fetchRes.json();
          if (rawData && rawData.id) {
            existing = this.base.mapBackendRestaurant(rawData);
            this.base.restaurants.push(existing);
          }
        }
      } catch (e) {
        console.warn('submitRestaurantLaunch prefetch notice:', e);
      }
    }

    const now = new Date().toISOString();

    if (existing) {
      existing.name = setupData.restaurantName || setupData.name || existing.name;
      existing.cuisine = setupData.cuisine || existing.cuisine;
      if (setupData.businessType) existing.businessType = setupData.businessType;
      if (setupData.hasBar !== undefined) existing.hasBar = setupData.hasBar;
      if (setupData.hasTables !== undefined) existing.hasTables = setupData.hasTables;
      if (setupData.hasKitchen !== undefined) existing.hasKitchen = setupData.hasKitchen;
      if (setupData.hasWaiter !== undefined) existing.hasWaiter = setupData.hasWaiter;
      if (setupData.orderNumberPrefix) existing.orderNumberPrefix = setupData.orderNumberPrefix;
      existing.address = setupData.address || existing.address;
      existing.phone = setupData.phone || existing.phone;
      existing.email = setupData.email || existing.email;
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

      try {
        const submitPayload = {
          name: existing.name,
          restaurantName: existing.name,
          cuisine: existing.cuisine,
          businessType: existing.businessType,
          address: existing.address,
          phone: existing.phone,
          email: existing.email,
          enabledModules: existing.enabledModules || setupData.enabledModules,
          totalTablesCount: setupData.totalTablesCount || existing.tablesCount,
        };

        const updated = await this.base.executeProtectedRequest<any>(
          `/restaurants/${encodeURIComponent(existing.id)}/submit`,
          {
            method: 'POST',
            body: JSON.stringify(submitPayload),
          },
          'OWNER'
        );
        if (updated) {
          existing.lifecycleStatus = (updated.lifecycle_status || 'PENDING_APPROVAL') as RestaurantLifecycleStatus;
          existing.isApproved = Boolean(updated.is_approved);
          existing.submittedAt = updated.submitted_at || now;
          existing.rejectionReason = undefined;
          existing.requestedChanges = undefined;
        }
      } catch (e: any) {
        console.warn('submitRestaurantLaunch backend sync notice:', e);
        throw e;
      }

      realtimeBus.emit('RestaurantRegistrationSubmitted' as any, {
        restaurantId: existing.id,
        restaurantName: existing.name,
        lifecycleStatus: 'PENDING_APPROVAL',
        isApproved: false,
      } as any);

      realtimeBus.emit('RestaurantStatusUpdated' as any, {
        restaurantId: existing.id,
        lifecycleStatus: 'PENDING_APPROVAL',
        isApproved: false,
        rejectionReason: undefined,
        requestedChanges: undefined,
      } as any);

      this.base.saveDatabase();
      return existing;
    }
    return null;
  }

  async resubmitRestaurantLaunch(restaurantId: string) {
    return await this.submitRestaurantLaunch({ id: restaurantId, lifecycleStatus: 'PENDING_APPROVAL' });
  }

  async createNewBranchOutlet(data: { name: string; branchName: string; city: string; address: string; phone: string; cuisine: string }) {
    await delay(300);
    const rest = await this.createRestaurantForOwner({
      name: data.name,
      cuisine: data.cuisine,
      address: data.address,
      phone: data.phone,
      email: this.base.currentUser?.email || 'owner@restaurant.com',
      ownerName: this.base.currentUser?.name || 'Restaurant Owner',
      ownerEmail: this.base.currentUser?.email || 'owner@restaurant.com',
    });
    rest.branchName = data.branchName;
    rest.city = data.city;
    this.base.saveDatabase();
    return rest;
  }

  async switchActiveRestaurant(restaurantId: string): Promise<Restaurant | null> {
    const cleanId = String(restaurantId || '').trim();
    if (!cleanId) return null;

    this.base._currentRestaurantId = cleanId;
    const scope = getPortalScopeFromPath();
    this.base.currentRestaurantIdsByScope[scope] = cleanId;
    this.base.currentRestaurantIdsByScope['OWNER'] = cleanId;

    const user = this.base.getCurrentUser(scope);
    if (user) {
      user.restaurantId = cleanId;
      this.base.setCurrentUser(user, scope);
    }
    const ownerUser = this.base.getCurrentUser('OWNER');
    if (ownerUser && ownerUser !== user) {
      ownerUser.restaurantId = cleanId;
      this.base.setCurrentUser(ownerUser, 'OWNER');
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dinely_active_restaurant_id', cleanId);
      sessionStorage.setItem('dinely_restaurant_id', cleanId);
      localStorage.setItem('dinely_active_restaurant_id', cleanId);
      localStorage.setItem('dinely_restaurant_id', cleanId);
    }

    const rest = (await this.getRestaurantDetails(cleanId)) || this.base.restaurants.find((r) => r.id === cleanId) || null;
    if (rest) {
      this.base._currentRestaurantId = rest.id;
      this.base.currentRestaurantIdsByScope[scope] = rest.id;
      this.base.currentRestaurantIdsByScope['OWNER'] = rest.id;
      realtimeBus.emit('RestaurantSwitched' as any, {
        restaurantId: rest.id,
        data: rest,
      });
    }
    return rest;
  }

  async getWorkspaceModules(restaurantId?: string) {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    if (!targetId) return null;
    return await this.base.executeProtectedRequest<any>(
      `/restaurants/${encodeURIComponent(targetId)}/workspace-modules`,
      { method: 'GET' },
      'OWNER'
    ).catch(async () => {
      const apiBase = getApiBaseUrl();
      const headers = this.base.getAuthHeader();
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/workspace-modules`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    });
  }

  async updateWorkspaceModules(
    restaurantId: string,
    enabledModules: string[],
    moduleFlags?: {
      hasKitchen?: boolean;
      hasWaiter?: boolean;
      hasBar?: boolean;
      hasInventory?: boolean;
      hasBilling?: boolean;
      hasTables?: boolean;
    }
  ) {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    if (!targetId) {
      throw new Error('Unable to resolve restaurant ID for workspace configuration.');
    }

    const payload = {
      enabledModules,
      hasKitchen: moduleFlags?.hasKitchen !== undefined ? moduleFlags.hasKitchen : enabledModules.includes('kitchen'),
      hasWaiter: moduleFlags?.hasWaiter !== undefined ? moduleFlags.hasWaiter : enabledModules.includes('waiter'),
      hasBar: moduleFlags?.hasBar !== undefined ? moduleFlags.hasBar : enabledModules.includes('bar'),
      hasInventory: moduleFlags?.hasInventory !== undefined ? moduleFlags.hasInventory : enabledModules.includes('inventory'),
      hasBilling: moduleFlags?.hasBilling !== undefined ? moduleFlags.hasBilling : enabledModules.includes('billing'),
      hasTables: moduleFlags?.hasTables,
    };

    const res = await this.base.executeProtectedRequest<any>(
      `/restaurants/${encodeURIComponent(targetId)}/workspace-modules`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      'OWNER'
    );

    if (!res || res.status !== 'success') {
      throw new Error('Server rejected workspace configuration change.');
    }

    const rest = this.base.restaurants.find(
      (r) => r.id === targetId || (r.slug && r.slug.toLowerCase() === targetId.toLowerCase()) || (r.publicSlug && r.publicSlug.toLowerCase() === targetId.toLowerCase())
    );
    if (rest) {
      rest.enabledModules = res.enabledModules || enabledModules;
      rest.hasKitchen = res.hasKitchen !== undefined ? res.hasKitchen : payload.hasKitchen;
      rest.hasWaiter = res.hasWaiter !== undefined ? res.hasWaiter : payload.hasWaiter;
      rest.hasBar = res.hasBar !== undefined ? res.hasBar : payload.hasBar;
      rest.hasInventory = res.hasInventory !== undefined ? res.hasInventory : payload.hasInventory;
      rest.hasBilling = res.hasBilling !== undefined ? res.hasBilling : payload.hasBilling;
      if (payload.hasTables !== undefined) rest.hasTables = payload.hasTables;
      this.base.saveDatabase();
    }

    realtimeBus.emit('WorkspaceConfigUpdated' as any, {
      restaurantId: targetId,
      ...res,
    });

    return res;
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
      }
    } catch (e) {
      console.warn('syncRestaurantToBackend notice:', e);
    }
  }

  async getRestaurantDetails(restaurantId?: string) {
    let targetId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return null;

    return this.base.getCachedOrFetch(`rest:${targetId}`, 15000, async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      try {
        const apiBase = getApiBaseUrl();
        const headers = this.base.getAuthHeader();
        const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}`, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          if (data && data.id) {
            const mappedRest = this.base.mapBackendRestaurant(data);
            const existingIdx = this.base.restaurants.findIndex((r) => r.id === mappedRest.id);
            if (existingIdx >= 0) {
              this.base.restaurants[existingIdx] = { ...this.base.restaurants[existingIdx], ...mappedRest };
            } else {
              this.base.restaurants.push(mappedRest);
            }
            return this.base.ensureRestaurantDefaults(mappedRest);
          }
        } else if (res.status === 404) {
          return null;
        }
      } catch (e) {
        clearTimeout(timeoutId);
        console.warn('API fetch for getRestaurantDetails failed:', e);
      }

      const local = this.base.restaurants.find((r) => r.id === targetId || (targetId && r.id.toLowerCase() === targetId.toLowerCase()));
      return local ? this.base.ensureRestaurantDefaults(local) : null;
    });
  }

  async resolveRestaurantBySlug(slug: string): Promise<Restaurant | null> {
    if (!slug || !slug.trim()) return null;
    const cleanSlug = slug.trim().toLowerCase();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    let fetchError: any = null;
    let explicitNotFound = false;

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/restaurants/public/resolve?slug=${encodeURIComponent(cleanSlug)}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          const mapped = this.base.mapBackendRestaurant(data);
          const existingIdx = this.base.restaurants.findIndex((r) => r.id === mapped.id);
          if (existingIdx >= 0) {
            this.base.restaurants[existingIdx] = { ...this.base.restaurants[existingIdx], ...mapped };
          } else {
            this.base.restaurants.push(mapped);
          }
          this.base.saveDatabase();
          return this.base.ensureRestaurantDefaults(mapped);
        }
      } else if (res.status === 404) {
        explicitNotFound = true;
      } else {
        fetchError = new Error(`Server returned HTTP ${res.status} resolving restaurant slug "${cleanSlug}".`);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      fetchError = e;
      console.warn('API resolveRestaurantBySlug failed:', e);
    }

    if (explicitNotFound) {
      return null;
    }

    const local = this.base.restaurants.find(
      (r) =>
        !r.isDeleted &&
        ((r.publicSlug && r.publicSlug.toLowerCase() === cleanSlug) ||
          (r.slug && r.slug.toLowerCase() === cleanSlug) ||
          r.id === cleanSlug)
    );

    if (local && (local.isApproved || local.lifecycleStatus === 'LIVE' || local.lifecycleStatus === 'APPROVED')) {
      return this.base.ensureRestaurantDefaults(local);
    }

    if (fetchError) {
      const isTimeout = fetchError.name === 'AbortError';
      const err = new Error(
        isTimeout
          ? `Restaurant resolution timed out for "${cleanSlug}". Backend cold start may be in progress.`
          : `Network failure connecting to restaurant "${cleanSlug}".`
      );
      (err as any).isNetworkError = true;
      throw err;
    }

    return null;
  }

  async resolveRestaurantFromHostname(hostname?: string): Promise<Restaurant | null> {
    const cleanHost = (hostname || (typeof window !== 'undefined' ? window.location.hostname : '')).trim().toLowerCase();
    if (!cleanHost) return null;

    const resolution = getTenantFromHostname(cleanHost);
    const apiBase = getApiBaseUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);
    let fetchError: any = null;
    let explicitNotFound = false;

    try {
      let queryUrl = '';
      if (resolution.slug) {
        queryUrl = `${apiBase}/restaurants/public/resolve?slug=${encodeURIComponent(resolution.slug)}&hostname=${encodeURIComponent(cleanHost)}`;
      } else {
        queryUrl = `${apiBase}/restaurants/public/resolve?hostname=${encodeURIComponent(cleanHost)}`;
      }

      const res = await fetch(queryUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data && data.id && !data.isPlatformDomain) {
          const mapped = this.base.mapBackendRestaurant(data);
          const existingIdx = this.base.restaurants.findIndex((r) => r.id === mapped.id);
          if (existingIdx >= 0) {
            this.base.restaurants[existingIdx] = { ...this.base.restaurants[existingIdx], ...mapped };
          } else {
            this.base.restaurants.push(mapped);
          }
          this.base.saveDatabase();
          return this.base.ensureRestaurantDefaults(mapped);
        }
      } else if (res.status === 404) {
        explicitNotFound = true;
      } else {
        fetchError = new Error(`Server returned HTTP ${res.status} resolving hostname "${cleanHost}".`);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      fetchError = e;
      console.warn('API resolveRestaurantFromHostname failed:', e);
    }

    if (explicitNotFound) {
      return null;
    }

    if (resolution.slug) {
      return this.resolveRestaurantBySlug(resolution.slug);
    }

    if (fetchError) {
      (fetchError as any).isNetworkError = true;
      throw fetchError;
    }

    return null;
  }

  async updateRestaurantDetails(restaurantId: string, updates: Partial<Restaurant>) {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return null;

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.base.getAuthHeader('OWNER'),
        },
        body: JSON.stringify({
          name: updates.name,
          cuisine: updates.cuisine,
          businessType: updates.businessType,
          hasKitchen: updates.hasKitchen,
          hasWaiter: updates.hasWaiter,
          hasBar: updates.hasBar,
          hasTables: updates.hasTables,
          enabledModules: updates.enabledModules,
          address: updates.address,
          phone: updates.phone,
          email: updates.email,
          taxPercentage: updates.taxPercentage,
          theme: updates.theme,
          currency: updates.currency,
          lifecycleStatus: updates.lifecycleStatus,
        }),
      });

      if (res.ok) {
        const raw = await res.json();
        const updated = this.base.mapBackendRestaurant(raw);
        this.base.restaurants = this.base.restaurants.filter((r) => r.id !== targetId).concat(updated);
        this.base.saveDatabase();
        return updated;
      }
    } catch (e) {
      console.warn('Backend updateRestaurantDetails failed:', e);
    }

    const rest = this.base.restaurants.find((r) => r.id === targetId && !r.isDeleted);
    if (rest) {
      Object.assign(rest, updates);
      this.base.ensureRestaurantDefaults(rest);
      this.base.saveDatabase();
    }
    return rest;
  }

  async updateRestaurantTheme(restaurantId: string, theme: ThemeConfig) {
    await delay(100);
    const rest = this.base.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.theme = theme;
      this.base.saveDatabase();
    }
    return theme;
  }

  // --- Tables Management ---
  async getTables(restaurantId?: string): Promise<Table[]> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];

    return this.base.getCachedOrFetch(`tables:${targetId}`, 10000, async () => {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/tables`);
        if (res.ok) {
          const tables = await res.json();
          const rawTables = Array.isArray(tables) ? tables : (Array.isArray(tables?.tables) ? tables.tables : []);
          const mappedTables: Table[] = rawTables.map((t: any) => {
            const rawQr = t.qr_code_url || '';
            const rest = this.base.restaurants.find((r) => r.id === targetId);
            const slug = rest?.publicSlug || rest?.slug || targetId;
            const cleanQr = (rawQr && !rawQr.includes('.dinely.app') && !rawQr.includes('dinely.food/customer?tenant=') && !rawQr.includes('/customer?restaurant='))
              ? rawQr
              : getRestaurantCustomerUrl(slug, t.table_number || t.tableNumber, t.id);
            return {
              id: t.id,
              restaurantId: t.restaurant_id || t.restaurantId || targetId,
              tableNumber: t.table_number || t.tableNumber,
              section: t.section || 'Main Hall',
              capacity: t.capacity || 4,
              status: t.status || 'AVAILABLE',
              isOccupied: t.is_occupied || false,
              qrCodeUrl: cleanQr,
            };
          });
          return mappedTables;
        } else {
          const errText = await res.text();
          console.error(`[getTables] HTTP ${res.status}: ${errText}`);
        }
      } catch (e) {
        console.warn('API fetch for tables failed:', e);
        throw e;
      }
      return [];
    });
  }

  async createTable(tableData: Partial<Table>): Promise<Table> {
    const tblNum = (tableData.tableNumber || '').trim();
    if (!tblNum) throw new Error("Table number is required");

    const targetRestId = this.base.resolveTenantRestaurantId(tableData.restaurantId) || tableData.restaurantId || this.base.getCurrentRestaurantId();
    if (!targetRestId) throw new Error("No active restaurant selected");

    const tId = tableData.id || `tbl-${targetRestId}-${tblNum.toLowerCase().replace(/\s+/g, '_')}`;
    const payload = {
      id: tId,
      tableNumber: tblNum,
      section: tableData.section || 'Main Hall',
      capacity: tableData.capacity || 4,
    };

    const t = await this.base.executeProtectedRequest<any>(
      `/restaurants/${encodeURIComponent(targetRestId)}/tables`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'OWNER'
    );

    const rawQr = t.qr_code_url || '';
    const rest = this.base.restaurants.find((r) => r.id === targetRestId);
    const slug = rest?.publicSlug || rest?.slug || targetRestId;
    const cleanQr = (rawQr && !rawQr.includes('.dinely.app') && !rawQr.includes('dinely.food/customer?tenant=') && !rawQr.includes('/customer?restaurant='))
      ? rawQr
      : getRestaurantCustomerUrl(slug, t.table_number || tblNum, t.id);

    const mapped: Table = {
      id: t.id,
      restaurantId: t.restaurant_id || targetRestId,
      tableNumber: t.table_number || tblNum,
      section: t.section || 'Main Hall',
      capacity: t.capacity || 4,
      status: t.status || 'AVAILABLE',
      isOccupied: t.is_occupied || false,
      qrCodeUrl: cleanQr,
    };
    const existingIdx = this.base.tables.findIndex((x) => x.id === mapped.id);
    if (existingIdx >= 0) this.base.tables[existingIdx] = mapped;
    else this.base.tables.push(mapped);
    this.base.saveDatabase();
    return mapped;
  }

  async updateTable(tableId: string, updates: Partial<Table>): Promise<Table | null> {
    const table = this.base.tables.find((t) => t.id === tableId);
    const targetRestId = this.base.resolveTenantRestaurantId(updates.restaurantId) || table?.restaurantId || this.base.getCurrentRestaurantId();
    if (!targetRestId) throw new Error("No active restaurant selected");

    const payload: Record<string, any> = {};
    if (updates.tableNumber !== undefined) payload.tableNumber = updates.tableNumber;
    if (updates.section !== undefined) payload.section = updates.section;
    if (updates.capacity !== undefined) payload.capacity = updates.capacity;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.isOccupied !== undefined) payload.isOccupied = updates.isOccupied;

    const t = await this.base.executeProtectedRequest<any>(
      `/restaurants/${encodeURIComponent(targetRestId)}/tables/${encodeURIComponent(tableId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      'OWNER'
    );

    const updatedTable: Table = {
      id: t.id || tableId,
      restaurantId: t.restaurant_id || targetRestId,
      tableNumber: t.table_number || updates.tableNumber || table?.tableNumber || '',
      section: t.section || updates.section || table?.section || 'Main Hall',
      capacity: t.capacity || updates.capacity || table?.capacity || 4,
      status: t.status || updates.status || table?.status || 'AVAILABLE',
      isOccupied: t.is_occupied !== undefined ? t.is_occupied : (updates.isOccupied || false),
      qrCodeUrl: t.qr_code_url || table?.qrCodeUrl || '',
    };

    const idx = this.base.tables.findIndex((x) => x.id === tableId);
    if (idx >= 0) this.base.tables[idx] = updatedTable;
    else this.base.tables.push(updatedTable);
    this.base.saveDatabase();
    return updatedTable;
  }

  async deleteTable(tableId: string, restaurantId?: string): Promise<boolean> {
    const targetRestId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (targetRestId) {
      await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(targetRestId)}/tables/${encodeURIComponent(tableId)}`,
        { method: 'DELETE' },
        'OWNER'
      );
    }
    this.base.tables = this.base.tables.filter((t) => t.id !== tableId && t.tableNumber !== tableId);
    this.base.saveDatabase();
    return true;
  }

  async mergeTables(tableIds: string[], customLabel?: string) {
    await delay(200);
    const mergedId = `grp-${Date.now()}`;
    const label = customLabel || `Merged Group (${tableIds.length} Tables)`;
    this.base.tables.forEach((t) => {
      if (tableIds.includes(t.id)) {
        t.status = 'MERGED';
        t.isMerged = true;
        t.mergedGroupId = mergedId;
        t.mergedGroupLabel = label;
        t.mergedWithIds = tableIds.filter((x) => x !== t.id);
      }
    });
    this.base.saveDatabase();
  }

  async unmergeTables(tableIds: string[]) {
    await delay(200);
    this.base.tables.forEach((t) => {
      if (tableIds.includes(t.id)) {
        t.status = 'AVAILABLE';
        t.isMerged = false;
        t.mergedGroupId = undefined;
        t.mergedGroupLabel = undefined;
        t.mergedWithIds = undefined;
      }
    });
    this.base.saveDatabase();
  }

  async reserveTable(tableId: string, details: { reservedForName: string; reservedForPhone?: string; reservationTime: string; partySize: number; notes?: string }) {
    await delay(200);
    const table = this.base.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'RESERVED';
      table.reservationDetails = details;
      this.base.saveDatabase();
    }
    return table;
  }

  async cancelTableReservation(tableId: string) {
    await delay(150);
    const table = this.base.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'AVAILABLE';
      table.reservationDetails = undefined;
      this.base.saveDatabase();
    }
    return table;
  }

  async checkInReservedTable(tableId: string) {
    await delay(150);
    const table = this.base.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'OCCUPIED';
      this.base.saveDatabase();
    }
    return table;
  }

  async updateTableStatus(tableId: string, status: any, updatedBy?: any) {
    await delay(100);
    const table = this.base.tables.find((t) => t.id === tableId || t.tableNumber?.toLowerCase() === tableId.toLowerCase());
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
      this.base.saveDatabase();
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

  // --- Table Sessions ---
  async getActiveTableSessions(restaurantId?: string): Promise<TableSession[]> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/active-sessions`);
      if (res.ok) {
        const sessions = await res.json();
        if (Array.isArray(sessions)) {
          return sessions.map((s: any) => ({
            id: s.id,
            restaurantId: s.restaurant_id || targetId,
            tableId: s.table_id,
            tableNumber: s.table_number,
            status: s.status || 'ACTIVE',
            sessionStartedAt: s.session_started_at || new Date().toISOString(),
          }));
        }
      }
    } catch (e) {
      console.warn('API fetch for active table sessions failed:', e);
    }

    this.base.loadDatabase();
    return this.base.tableSessions.filter((s) => s.restaurantId === targetId && s.status === 'ACTIVE');
  }

  async getOrCreateTableSession(restaurantId?: string, tableId?: string, tableNumber?: string): Promise<TableSession | null> {
    const restId = this.base.resolveTenantRestaurantId(restaurantId);
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
      } else if (res.status === 404) {
        const postRes = await fetch(`${apiBase}/restaurants/${encodeURIComponent(restId)}/tables/${encodeURIComponent(resolvedTblId)}/session${qParams}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (postRes.ok) {
          const s = await postRes.json();
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
        } else if (postRes.status === 403 || postRes.status === 404) {
          const errData = await postRes.json().catch(() => ({}));
          throw new Error(errData.detail || 'Table does not exist or is not accessible');
        }
      } else if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Table does not belong to this restaurant');
      }
    } catch (e: any) {
      if (e?.message && (e.message.includes('belong') || e.message.includes('accessible') || e.message.includes('not exist'))) {
        throw e;
      }
      console.warn('API fetch for getOrCreateTableSession failed:', e);
    }

    this.base.loadDatabase();
    let tbl = this.base.tables.find(
      (t) => t.restaurantId === restId && (t.id === tableId || (tableNumber && matchTableNumber(t.tableNumber, tableNumber)))
    );

    if (!tbl && tableNumber && tableNumber !== 'COUNTER') {
      const formattedNum = formatStandardTableNumber(tableNumber);
      const rest = this.base.restaurants.find((r) => r.id === restId);
      const slug = rest?.publicSlug || rest?.slug || restId || 'restaurant';
      const tblId = `tbl-${restId}-${formattedNum.toLowerCase().replace(/\s+/g, '_')}`;
      tbl = {
        id: tblId,
        restaurantId: restId,
        tableNumber: formattedNum,
        capacity: 4,
        section: 'Main Floor',
        status: 'OCCUPIED',
        isOccupied: true,
        sessionStartedAt: new Date().toISOString(),
        qrCodeUrl: getRestaurantCustomerUrl(slug, formattedNum, tblId),
      };
      this.base.tables.push(tbl);
    }

    if (!tbl) return null;

    let activeSession = this.base.tableSessions.find(
      (s) => s.restaurantId === restId && (s.tableId === tbl!.id || matchTableNumber(s.tableNumber, tbl!.tableNumber)) && s.status !== 'CLOSED'
    );

    if (activeSession) {
      if (tbl.status !== 'OCCUPIED' || !tbl.isOccupied) {
        tbl.status = 'OCCUPIED';
        tbl.isOccupied = true;
        tbl.activeSessionId = activeSession.id;
        tbl.sessionStartedAt = tbl.sessionStartedAt || activeSession.sessionStartedAt;
        this.base.saveDatabase();
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

      this.base.tableSessions.unshift(activeSession);
      tbl.status = 'OCCUPIED';
      tbl.isOccupied = true;
      tbl.activeSessionId = activeSession.id;
      tbl.sessionStartedAt = activeSession.sessionStartedAt;
      this.base.saveDatabase();

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

  async closeTableSession(
    arg1: string | { restaurantId?: string; tableId?: string; waiterName?: string; tableSessionId?: string },
    arg2?: string,
    arg3?: string,
    arg4?: string
  ) {
    let restId: string | undefined;
    let tableId: string | undefined;
    let waiterName: string | undefined;
    let tableSessionId: string | undefined;

    if (typeof arg1 === 'object' && arg1 !== null) {
      restId = arg1.restaurantId;
      tableId = arg1.tableId;
      waiterName = arg1.waiterName;
      tableSessionId = arg1.tableSessionId;
    } else if (typeof arg1 === 'string') {
      const str1 = arg1;
      if (arg4 !== undefined) {
        restId = str1;
        tableId = arg2;
        waiterName = arg3;
        tableSessionId = arg4;
      } else if (arg3 !== undefined) {
        const resolvedRest = this.base.resolveTenantRestaurantId(str1);
        const isArg1Rest = Boolean(
          resolvedRest ||
          str1 === this.base.currentRestaurantId ||
          str1 === this.base._currentRestaurantId ||
          str1.startsWith('rest-') ||
          this.base.restaurants.some((r) => r.id === str1 || r.slug === str1 || r.id.toLowerCase() === str1.toLowerCase() || r.slug?.toLowerCase() === str1.toLowerCase())
        );

        if (isArg1Rest) {
          restId = str1;
          tableId = arg2;
          waiterName = arg3;
        } else {
          tableId = str1;
          waiterName = arg2;
          tableSessionId = arg3;
        }
      } else if (arg2 !== undefined) {
        const isArg1Rest = Boolean(
          (str1.startsWith('rest-') || str1 === this.base.currentRestaurantId || str1 === this.base._currentRestaurantId) &&
          !str1.startsWith('tbl-')
        );
        if (isArg1Rest) {
          restId = str1;
          tableId = arg2;
        } else {
          tableId = str1;
          waiterName = arg2;
        }
      } else {
        tableId = str1;
      }
    }

    restId = this.base.resolveTenantRestaurantId(restId) || restId || this.base.getCurrentRestaurantId() || '';
    if (!tableId) {
      throw new Error('table_id is required to close table session.');
    }

    const targetScope = getPortalScopeFromPath();
    const endpoint = `/restaurants/${encodeURIComponent(restId)}/tables/${encodeURIComponent(tableId)}/close-session${tableSessionId ? `?table_session_id=${encodeURIComponent(tableSessionId)}` : ''}`;

    await this.base.executeProtectedRequest<any>(
      endpoint,
      {
        method: 'POST',
        body: JSON.stringify({
          table_session_id: tableSessionId,
          waiter_name: waiterName || this.base.currentUser?.name || 'Staff',
        }),
      },
      targetScope
    );

    this.base.loadDatabase();
    const targetTbls = this.base.tables.filter((t) => t.id === tableId || (t.tableNumber && matchTableNumber(t.tableNumber, tableId!)));
    targetTbls.forEach((tbl) => {
      tbl.status = 'AVAILABLE';
      tbl.isOccupied = false;
      tbl.activeSessionId = undefined;
      tbl.sessionStartedAt = undefined;
    });

    this.base.tableSessions.forEach((s) => {
      const isRestMatch = !s.restaurantId || s.restaurantId === restId || s.restaurantId === (typeof arg1 === 'string' ? arg1 : undefined);
      const isTableMatch = s.tableId === tableId || (tableSessionId && s.id === tableSessionId) || targetTbls.some((t) => matchTableNumber(s.tableNumber, t.tableNumber));
      if (isRestMatch && isTableMatch && s.status === 'ACTIVE') {
        s.status = 'CLOSED';
        s.sessionClosedAt = new Date().toISOString();
        s.closedByWaiterName = waiterName || 'Staff';
      }
    });

    this.base.orders.forEach((o) => {
      const isRestMatch = !o.restaurantId || o.restaurantId === restId;
      const isTableMatch = o.tableId === tableId || (tableSessionId && o.tableSessionId === tableSessionId) || targetTbls.some((t) => matchTableNumber(o.tableNumber, t.tableNumber));
      if (isRestMatch && isTableMatch && o.status !== 'CANCELLED') {
        o.status = 'COMPLETED';
        o.kitchenStatus = 'COMPLETED';
        o.barStatus = 'COMPLETED';
      }
    });

    this.base.saveDatabase();
    return targetTbls[0] || true;
  }

  // --- Menu & Category Management ---
  async getCategories(restaurantId?: string): Promise<MenuCategory[]> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];

    return this.base.getCachedOrFetch(`categories:${targetId}`, 15000, async () => {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/categories`);
        if (res.ok) {
          const cats = await res.json();
          const rawCats = Array.isArray(cats) ? cats : (Array.isArray(cats?.categories) ? cats.categories : []);
          return rawCats.map((c: any) => ({
            id: c.id,
            restaurantId: c.restaurant_id || c.restaurantId || targetId,
            name: c.name,
            order: c.sort_order || c.order || 1,
            sortOrder: c.sort_order || c.order || 1,
            isEnabled: c.is_enabled !== false,
          }));
        }
      } catch (e) {
        console.warn('API fetch for categories failed:', e);
        throw e;
      }
      return [];
    });
  }

  async createCategory(catData: Partial<MenuCategory>): Promise<MenuCategory> {
    const restId = this.base.resolveTenantRestaurantId(catData.restaurantId) || catData.restaurantId || this.base.getCurrentRestaurantId() || '';
    if (!restId) throw new Error("No active restaurant selected");

    const payload = {
      id: catData.id,
      name: catData.name || 'New Category',
      sortOrder: catData.sortOrder || 1,
    };

    const c = await this.base.executeProtectedRequest<any>(
      `/restaurants/${encodeURIComponent(restId)}/categories`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'OWNER'
    );

    return {
      id: c.id,
      restaurantId: c.restaurant_id || c.restaurantId || restId,
      name: c.name,
      order: c.sort_order || c.order || 1,
      sortOrder: c.sort_order || c.order || 1,
      isEnabled: c.is_enabled !== false,
    };
  }

  async addCategory(data: { restaurantId?: string; name: string; icon?: string }) {
    await delay(150);
    const restId = this.base.resolveTenantRestaurantId(data.restaurantId) || this.base.getCurrentRestaurantId();
    if (!restId) throw new Error("No active restaurant selected");
    const newCat: MenuCategory = {
      id: `cat-${Date.now()}`,
      restaurantId: restId,
      name: data.name,
      icon: data.icon || 'Utensils',
      order: this.base.categories.filter((c) => c.restaurantId === restId).length + 1,
      isEnabled: true,
    };
    this.base.categories.push(newCat);
    this.base.saveDatabase();
    return newCat;
  }

  async updateCategory(id: string, updates: Partial<MenuCategory>) {
    await delay(150);
    const cat = this.base.categories.find((c) => c.id === id);
    if (cat) {
      Object.assign(cat, updates);
      this.base.saveDatabase();
    }
    return cat;
  }

  async deleteCategory(id: string) {
    await delay(150);
    this.base.categories = this.base.categories.filter((c) => c.id !== id);
    this.base.saveDatabase();
  }

  async toggleCategoryStatus(id: string) {
    await delay(100);
    const cat = this.base.categories.find((c) => c.id === id);
    if (cat) {
      cat.isEnabled = !cat.isEnabled;
      this.base.saveDatabase();
    }
    return cat;
  }

  async getMenuItems(restaurantId?: string): Promise<MenuItem[]> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];

    return this.base.getCachedOrFetch(`menu:${targetId}`, 15000, async () => {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/menu`);
        if (res.ok) {
          const data = await res.json();
          const rawItems = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
          return rawItems.map((m: any) => ({
            id: m.id,
            restaurantId: m.restaurant_id || m.restaurantId || targetId,
            categoryId: m.category_id || m.categoryId,
            name: m.name,
            description: m.description || '',
            price: typeof m.price === 'number' ? m.price : parseFloat(m.price) || 0,
            imageUrl: m.image_url || m.imageUrl || m.image,
            image: m.image_url || m.imageUrl || m.image,
            isAvailable: m.is_available !== false && m.isAvailable !== false,
            isVegetarian: m.is_vegetarian !== false && m.isVegetarian !== false,
            dietaryType: m.dietary_type || m.dietaryType || (m.is_vegetarian !== false ? 'VEG' : 'NON_VEG'),
            targetDestination: m.target_destination || m.targetDestination || 'KITCHEN',
            isAlcoholic: m.is_alcoholic || m.isAlcoholic || (m.target_destination === 'BAR'),
            prepTimeMinutes: m.prep_time_minutes || m.prepTimeMinutes || 15,
          }));
        }
      } catch (e) {
        console.warn('API fetch for menu items failed:', e);
        throw e;
      }
      return [];
    });
  }

  async addMenuItem(itemData: Partial<MenuItem>) {
    return this.createMenuItem(itemData);
  }

  async createMenuItem(itemData: Partial<MenuItem>): Promise<MenuItem> {
    const restId = this.base.resolveTenantRestaurantId(itemData.restaurantId) || itemData.restaurantId || this.base.getCurrentRestaurantId() || '';
    if (!restId) throw new Error("No active restaurant selected");

    const dest = itemData.targetDestination || (itemData.isAlcoholic ? 'BAR' : 'KITCHEN');
    const isVeg = itemData.isVegetarian !== false && itemData.dietaryType !== 'NON_VEG';
    const payload = {
      id: itemData.id,
      categoryId: itemData.categoryId,
      name: itemData.name || 'New Menu Item',
      description: itemData.description || '',
      price: typeof itemData.price === 'number' ? itemData.price : parseFloat(itemData.price as any) || 0,
      imageUrl: itemData.imageUrl || itemData.image,
      image: itemData.imageUrl || itemData.image,
      isAvailable: itemData.isAvailable !== false,
      isVegetarian: isVeg,
      dietaryType: itemData.dietaryType || (isVeg ? 'VEG' : 'NON_VEG'),
      targetDestination: dest,
      isAlcoholic: itemData.isAlcoholic || dest === 'BAR',
      prepTimeMinutes: itemData.prepTimeMinutes || 15,
    };

    const m = await this.base.executeProtectedRequest<any>(
      `/restaurants/${encodeURIComponent(restId)}/menu`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'OWNER'
    );

    const newItem: MenuItem = {
      id: m.id,
      restaurantId: m.restaurant_id || m.restaurantId || restId,
      categoryId: m.category_id || m.categoryId || payload.categoryId,
      name: m.name,
      description: m.description || '',
      price: typeof m.price === 'number' ? m.price : parseFloat(m.price) || 0,
      imageUrl: m.image_url || m.imageUrl || payload.imageUrl,
      image: m.image_url || m.imageUrl || payload.imageUrl,
      isAvailable: m.is_available !== false && m.isAvailable !== false,
      isVegetarian: m.is_vegetarian !== false && m.isVegetarian !== false,
      dietaryType: m.dietary_type || m.dietaryType || payload.dietaryType,
      targetDestination: m.target_destination || m.targetDestination || payload.targetDestination,
      isAlcoholic: m.is_alcoholic !== undefined ? m.is_alcoholic : payload.isAlcoholic,
      prepTimeMinutes: m.preparation_time_minutes || m.prepTimeMinutes || payload.prepTimeMinutes,
    };
    realtimeBus.emit('MenuItemCreated' as any, { menuItemId: newItem.id, restaurantId: restId, data: newItem });
    return newItem;
  }

  async updateMenuItem(itemId: string, updates: Partial<MenuItem>) {
    const restId = this.base.resolveTenantRestaurantId(updates.restaurantId) || updates.restaurantId || this.base.getCurrentRestaurantId() || '';
    if (!restId) throw new Error("No active restaurant selected");

    const payload: Record<string, any> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.price !== undefined) payload.price = typeof updates.price === 'number' ? updates.price : parseFloat(updates.price as any) || 0;
    if (updates.categoryId !== undefined) payload.categoryId = updates.categoryId;
    if (updates.imageUrl !== undefined || updates.image !== undefined) payload.imageUrl = updates.imageUrl || updates.image;
    if (updates.isAvailable !== undefined) payload.isAvailable = updates.isAvailable;
    if (updates.isVegetarian !== undefined) payload.isVegetarian = updates.isVegetarian;
    if (updates.dietaryType !== undefined) payload.dietaryType = updates.dietaryType;
    if (updates.targetDestination !== undefined) payload.targetDestination = updates.targetDestination;
    if (updates.isAlcoholic !== undefined) payload.isAlcoholic = updates.isAlcoholic;
    if (updates.prepTimeMinutes !== undefined) payload.prepTimeMinutes = updates.prepTimeMinutes;

    const m = await this.base.executeProtectedRequest<any>(
      `/restaurants/${encodeURIComponent(restId)}/menu/${encodeURIComponent(itemId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
      'OWNER'
    );

    const updatedItem: MenuItem = {
      id: m.id || itemId,
      restaurantId: m.restaurant_id || m.restaurantId || restId,
      categoryId: m.category_id || m.categoryId || updates.categoryId,
      name: m.name || updates.name,
      description: m.description !== undefined ? m.description : (updates.description || ''),
      price: typeof m.price === 'number' ? m.price : (updates.price !== undefined ? parseFloat(updates.price as any) : 0),
      imageUrl: m.image_url || m.imageUrl || updates.imageUrl || updates.image,
      image: m.image_url || m.imageUrl || updates.imageUrl || updates.image,
      isAvailable: m.is_available !== undefined ? m.is_available : (updates.isAvailable !== false),
      isVegetarian: m.is_vegetarian !== undefined ? m.is_vegetarian : (updates.isVegetarian !== false),
      dietaryType: m.dietary_type || m.dietaryType || updates.dietaryType || 'VEG',
      targetDestination: m.target_destination || m.targetDestination || updates.targetDestination || 'KITCHEN',
      isAlcoholic: m.is_alcoholic !== undefined ? m.is_alcoholic : updates.isAlcoholic,
      prepTimeMinutes: m.preparation_time_minutes || m.prepTimeMinutes || updates.prepTimeMinutes,
    };
    realtimeBus.emit('MenuItemUpdated' as any, { menuItemId: itemId, restaurantId: restId, data: updatedItem });
    return updatedItem;
  }

  async deleteMenuItem(itemId: string, restaurantId?: string) {
    const restId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId || this.base.getCurrentRestaurantId() || '';
    if (!restId) throw new Error("No active restaurant selected");

    await this.base.executeProtectedRequest<any>(
      `/restaurants/${encodeURIComponent(restId)}/menu/${encodeURIComponent(itemId)}`,
      { method: 'DELETE' },
      'OWNER'
    );

    realtimeBus.emit('MenuItemDeleted' as any, { menuItemId: itemId, restaurantId: restId });
    return true;
  }

  async duplicateMenuItem(itemId: string) {
    await delay(150);
    const original = this.base.menuItems.find((m) => m.id === itemId);
    if (original) {
      const copy: MenuItem = {
        ...original,
        id: `item-${Date.now()}`,
        name: `${original.name} (Copy)`,
      };
      this.base.menuItems.push(copy);
      this.base.saveDatabase();
      return copy;
    }
    return null;
  }

  async toggleMenuItemAvailability(itemId: string, restaurantId?: string, currentStatus?: boolean) {
    return this.updateMenuItem(itemId, { restaurantId, isAvailable: !currentStatus });
  }

  // --- Dedicated Bar Categories & Items ---
  async getBarCategories(restaurantId?: string) {
    await delay(100);
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) return [];
    let cats = this.base.barCategories.filter((c) => c.restaurantId === targetId);
    if (cats.length === 0) {
      const defaultNames = ['Beer', 'Wine', 'Whiskey', 'Vodka', 'Rum', 'Gin', 'Cocktails', 'Mocktails', 'Champagne', 'Tequila', 'Shots'];
      cats = defaultNames.map((name, idx) => ({
        id: `bcat-${targetId.replace(/[^a-zA-Z0-9]/g, '')}-${idx + 1}`,
        restaurantId: targetId,
        name,
        displayOrder: idx + 1,
        isEnabled: true,
      }));
      this.base.barCategories.push(...cats);
      this.base.saveDatabase();
    }
    return cats.sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async addBarCategory(data: { restaurantId?: string; name: string; isEnabled?: boolean }) {
    await delay(150);
    const restId = this.base.resolveTenantRestaurantId(data.restaurantId) || this.base.getCurrentRestaurantId();
    if (!restId) throw new Error("No active restaurant selected");
    const newCat: BarCategory = {
      id: `bcat-${Date.now()}`,
      restaurantId: restId,
      name: data.name,
      displayOrder: this.base.barCategories.filter((c) => c.restaurantId === restId).length + 1,
      isEnabled: data.isEnabled !== false,
    };
    this.base.barCategories.push(newCat);
    this.base.saveDatabase();
    return newCat;
  }

  async updateBarCategory(id: string, updates: Partial<BarCategory>) {
    await delay(150);
    const cat = this.base.barCategories.find((c) => c.id === id);
    if (cat) {
      Object.assign(cat, updates);
      this.base.saveDatabase();
    }
    return cat;
  }

  async deleteBarCategory(id: string) {
    await delay(150);
    this.base.barCategories = this.base.barCategories.filter((c) => c.id !== id);
    this.base.saveDatabase();
  }

  async toggleBarCategoryStatus(id: string) {
    await delay(100);
    const cat = this.base.barCategories.find((c) => c.id === id);
    if (cat) {
      cat.isEnabled = !cat.isEnabled;
      this.base.saveDatabase();
    }
    return cat;
  }

  async getBarMenuItems(restaurantId?: string) {
    await delay(100);
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) return [];
    return this.base.barMenuItems.filter((m) => m.restaurantId === targetId);
  }

  async addBarMenuItem(itemData: Partial<BarMenuItem>) {
    await delay(150);
    const restId = this.base.resolveTenantRestaurantId(itemData.restaurantId) || this.base.getCurrentRestaurantId();
    if (!restId) throw new Error("No active restaurant selected");
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
      displayOrder: itemData.displayOrder || this.base.barMenuItems.filter((b) => b.restaurantId === restId).length + 1,
      targetDestination: 'BAR',
      isAlcoholic: itemData.isAlcoholic !== false,
      servingOptions: itemData.servingOptions || ['On the Rocks', 'Neat', 'Soda Mixer'],
    };
    this.base.barMenuItems.push(newItem);
    this.base.saveDatabase();
    return newItem;
  }

  async updateBarMenuItem(itemId: string, updates: Partial<BarMenuItem>) {
    await delay(150);
    const item = this.base.barMenuItems.find((m) => m.id === itemId);
    if (item) {
      Object.assign(item, updates);
      this.base.saveDatabase();
    }
    return item;
  }

  async duplicateBarMenuItem(itemId: string) {
    await delay(150);
    const original = this.base.barMenuItems.find((m) => m.id === itemId);
    if (original) {
      const copy: BarMenuItem = {
        ...original,
        id: `bitem-${Date.now()}`,
        name: `${original.name} (Copy)`,
      };
      this.base.barMenuItems.push(copy);
      this.base.saveDatabase();
      return copy;
    }
    return null;
  }

  async toggleBarMenuItemAvailability(itemId: string) {
    await delay(100);
    const item = this.base.barMenuItems.find((m) => m.id === itemId);
    if (item) {
      item.isAvailable = !item.isAvailable;
      this.base.saveDatabase();
    }
    return item;
  }

  async deleteBarMenuItem(itemId: string) {
    await delay(150);
    this.base.barMenuItems = this.base.barMenuItems.filter((m) => m.id !== itemId);
    this.base.saveDatabase();
  }

  async bulkImportBarMenuItems(restaurantId: string, items: Partial<BarMenuItem>[]) {
    await delay(200);
    const restId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!restId) throw new Error("No active restaurant selected");
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
    this.base.barMenuItems.push(...created);
    this.base.saveDatabase();
    return created;
  }

  async getBarAnalytics(restaurantId?: string) {
    await delay(100);
    const targetId = this.base.resolveTenantRestaurantId(restaurantId);
    const barItems = this.base.menuItems.filter((m) => m.restaurantId === targetId && (m.targetDestination === 'BAR' || m.isAlcoholic));
    const barOrders = this.base.orders.filter(
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

  // --- Staff & Employees ---
  async getEmployees(restaurantId?: string): Promise<Employee[]> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) return [];

    try {
      const staffList = await this.base.executeProtectedRequest<any[]>(
        `/restaurants/${encodeURIComponent(targetId)}/staff`,
        { method: 'GET' },
        'OWNER'
      );
      if (Array.isArray(staffList)) {
        const mapped: Employee[] = staffList.map((s: any) => ({
          id: s.id,
          restaurantId: s.restaurantId || targetId,
          name: s.name,
          username: s.username || (s.email ? s.email.split('@')[0] : ''),
          email: s.email,
          phone: s.phone || '',
          role: s.role,
          terminal: s.terminal || s.terminalId || `${s.role}-01`,
          terminalId: s.terminalId || s.terminal || `${s.role}-01`,
          staffUserId: s.staffUserId || s.id,
          status: s.status || 'OFF_CLOCK',
          hourlyRate: s.hourlyRate || 18,
          joinedDate: s.joinedDate || (s.createdAt ? s.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]),
          isActive: s.isActive !== undefined ? s.isActive : true,
          isAccountDisabled: s.isActive !== undefined ? !s.isActive : false,
          shift: s.shift || 'General Shift',
          assignedSection: s.assignedSection || 'Main Dining Floor',
        }));
        this.base.employees = this.base.employees.filter((e) => e.restaurantId !== targetId).concat(mapped);
        this.base.saveDatabase();
        return mapped;
      }
    } catch (e) {
      console.warn('Backend staff fetch failed, falling back to local store:', e);
    }
    return this.base.employees.filter((e) => e.restaurantId === targetId);
  }

  async addEmployee(empData: Partial<Employee>): Promise<Employee> {
    const restId = this.base.resolveTenantRestaurantId(empData.restaurantId) || this.base.getCurrentRestaurantId();
    if (!restId) throw new Error("No active restaurant selected");

    const cleanUsername = (empData.username || empData.name?.toLowerCase().replace(/\s+/g, '') || `staff_${Date.now()}`).trim().toLowerCase();
    const cleanRole = (empData.role || 'WAITER').toUpperCase();
    const cleanTerminal = (empData.terminal || empData.terminalId || `${cleanRole}-01`).trim().toUpperCase();

    const payload = {
      name: empData.name || 'Staff Member',
      username: cleanUsername,
      password: empData.password || 'staff123',
      role: cleanRole,
      terminal: cleanTerminal,
      email: empData.email || `${cleanUsername}@staff.dinely.internal`,
      phone: empData.phone || '',
      isActive: empData.isActive !== undefined ? empData.isActive : (!empData.isAccountDisabled),
    };

    const s = await this.base.executeProtectedRequest<any>(
      `/restaurants/${encodeURIComponent(restId)}/staff`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      'OWNER'
    );

    const newEmp: Employee = {
      id: s.id,
      restaurantId: s.restaurantId || restId,
      name: s.name,
      username: s.username || cleanUsername,
      email: s.email,
      phone: s.phone || payload.phone,
      role: s.role,
      terminal: s.terminal || cleanTerminal,
      terminalId: s.terminalId || cleanTerminal,
      staffUserId: s.staffUserId || s.id,
      status: s.status || 'OFF_CLOCK',
      hourlyRate: s.hourlyRate || 18,
      joinedDate: s.joinedDate || new Date().toISOString().split('T')[0],
      isActive: s.isActive !== undefined ? s.isActive : true,
      isAccountDisabled: s.isActive !== undefined ? !s.isActive : false,
      shift: s.shift || 'Evening (4PM - 12AM)',
      assignedSection: s.assignedSection || 'Main Dining Floor',
      password: payload.password,
    };
    this.base.employees.unshift(newEmp);
    this.base.saveDatabase();
    return newEmp;
  }

  async updateEmployee(empId: string, updates: Partial<Employee>) {
    await delay(100);
    const emp = this.base.employees.find((e) => e.id === empId || (e as any).staffUserId === empId);
    const restId = emp?.restaurantId || this.base.resolveTenantRestaurantId() || this.base.getCurrentRestaurantId();

    if (restId) {
      const body: any = {};
      if (updates.name !== undefined) body.name = updates.name;
      if (updates.role !== undefined) body.role = updates.role;
      if (updates.terminal !== undefined || updates.terminalId !== undefined) {
        body.terminal = updates.terminal || updates.terminalId;
      }
      if (updates.isActive !== undefined) body.isActive = updates.isActive;
      if (updates.isAccountDisabled !== undefined) body.isActive = !updates.isAccountDisabled;
      if (updates.password !== undefined) body.password = updates.password;
      if (updates.email !== undefined) body.email = updates.email;
      if (updates.phone !== undefined) body.phone = updates.phone;

      const targetEmpId = emp?.id || empId;
      await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(restId)}/staff/${encodeURIComponent(targetEmpId)}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
        'OWNER'
      );
    }

    if (emp) {
      Object.assign(emp, updates);
      if (updates.isActive !== undefined) emp.isAccountDisabled = !updates.isActive;
      if (updates.isAccountDisabled !== undefined) emp.isActive = !updates.isAccountDisabled;
      this.base.saveDatabase();
    }
    return emp;
  }

  async toggleEmployeeAccountStatus(empId: string) {
    const emp = this.base.employees.find((e) => e.id === empId || (e as any).staffUserId === empId);
    if (!emp) return null;
    const newActive = emp.isActive !== undefined ? !emp.isActive : !!emp.isAccountDisabled;
    return this.updateEmployee(empId, { isActive: newActive, isAccountDisabled: !newActive });
  }

  async resetEmployeePassword(empId: string, customPass?: string) {
    const newPass = customPass || `pass_${Math.floor(1000 + Math.random() * 9000)}`;
    await this.updateEmployee(empId, { password: newPass });
    return newPass;
  }

  async deleteEmployee(empId: string) {
    const emp = this.base.employees.find((e) => e.id === empId || (e as any).staffUserId === empId);
    const restId = emp?.restaurantId || this.base.resolveTenantRestaurantId() || this.base.getCurrentRestaurantId();
    if (restId) {
      const targetEmpId = emp?.id || empId;
      await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(restId)}/staff/${encodeURIComponent(targetEmpId)}`,
        { method: 'DELETE' },
        'OWNER'
      );
    }
    this.base.employees = this.base.employees.filter((e) => e.id !== empId && (e as any).staffUserId !== empId);
    this.base.saveDatabase();
  }

  async updateEmployeeStatus(empId: string, status: any) {
    await delay(100);
    const emp = this.base.employees.find((e) => e.id === empId);
    if (emp) {
      emp.status = status;
      this.base.saveDatabase();
    }
    return emp;
  }

  // --- Suppliers & Inventory ---
  async getSuppliers(restaurantId?: string): Promise<Supplier[]> {
    this.base.loadDatabase();
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) return [];

    try {
      const backendSuppliers = await this.base.executeProtectedRequest<any[]>(
        `/restaurants/${encodeURIComponent(targetId)}/suppliers`,
        { method: 'GET' },
        'OWNER'
      );
      if (Array.isArray(backendSuppliers)) {
        const mapped: Supplier[] = backendSuppliers.map((s: any) => ({
          id: s.id,
          restaurantId: s.restaurantId || targetId,
          name: s.name,
          contactPerson: s.contactPerson,
          phone: s.phone,
          email: s.email,
          supplyCategory: s.supplyCategory,
          address: s.address,
          notes: s.notes,
          createdAt: s.createdAt || new Date().toISOString(),
        }));
        this.base.suppliers = this.base.suppliers.filter((s) => s.restaurantId !== targetId).concat(mapped);
        this.base.saveDatabase();
        return mapped;
      }
    } catch (e) {
      console.warn('Backend suppliers fetch failed, falling back to local store:', e);
    }

    return this.base.suppliers.filter((s) => s.restaurantId === targetId);
  }

  async addSupplier(supData: Partial<Supplier>): Promise<Supplier> {
    const restId = this.base.resolveTenantRestaurantId(supData.restaurantId) || this.base.getCurrentRestaurantId();
    if (!restId) throw new Error("No active restaurant selected");

    const payload = {
      restaurantId: restId,
      name: supData.name || 'New Supplier',
      contactPerson: supData.contactPerson || 'Vendor Rep',
      phone: supData.phone || '+91 98000-00000',
      email: supData.email || 'vendor@supplier.com',
      supplyCategory: supData.supplyCategory || 'General Foods',
      address: supData.address || 'Vendor Address',
      notes: supData.notes || '',
    };

    let newSup: Supplier = {
      id: `sup-${Date.now()}`,
      restaurantId: restId,
      ...payload,
      createdAt: new Date().toISOString(),
    };

    try {
      const saved = await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(restId)}/suppliers`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        'OWNER'
      );
      if (saved && saved.id) {
        newSup.id = saved.id;
      }
    } catch (e) {
      console.warn('Backend add supplier failed, saving to local store:', e);
    }

    this.base.suppliers.unshift(newSup);
    this.base.saveDatabase();
    return newSup;
  }

  async deleteSupplier(supplierId: string): Promise<void> {
    const sup = this.base.suppliers.find((s) => s.id === supplierId);
    const restId = sup?.restaurantId || this.base.getCurrentRestaurantId();

    if (restId) {
      try {
        await this.base.executeProtectedRequest<any>(
          `/restaurants/${encodeURIComponent(restId)}/suppliers/${encodeURIComponent(supplierId)}`,
          { method: 'DELETE' },
          'OWNER'
        );
      } catch (e) {
        console.warn('Backend delete supplier failed, removing locally:', e);
      }
    }

    this.base.suppliers = this.base.suppliers.filter((s) => s.id !== supplierId);
    this.base.saveDatabase();
  }

  async getInventory(restaurantId?: string): Promise<InventoryItem[]> {
    this.base.loadDatabase();
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) return [];

    try {
      const apiBase = getApiBaseUrl();
      const headers = this.base.getAuthHeader('INVENTORY');
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/inventory`, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const backendItems = await res.json();
        if (Array.isArray(backendItems)) {
          const mapped: InventoryItem[] = backendItems.map((i: any) => ({
            id: i.id,
            restaurantId: i.restaurantId || targetId,
            name: i.name,
            category: i.category || 'Pantry',
            station: i.station || 'KITCHEN',
            quantity: typeof i.quantity === 'number' ? i.quantity : parseFloat(i.quantity) || 0,
            currentStock: typeof i.currentStock === 'number' ? i.currentStock : parseFloat(i.quantity) || 0,
            unit: i.unit || 'kg',
            minThreshold: typeof i.minThreshold === 'number' ? i.minThreshold : parseFloat(i.minThreshold) || 2,
            costPerUnit: typeof i.costPerUnit === 'number' ? i.costPerUnit : parseFloat(i.costPerUnit) || 0,
            lastRestocked: i.lastRestocked || new Date().toISOString().split('T')[0],
            status: i.status || 'IN_STOCK',
            supplierId: i.supplierId,
            supplierName: i.supplierName,
            supplierContact: i.supplierContact,
            storageLocation: i.storageLocation,
          }));
          this.base.inventory = this.base.inventory.filter((i) => i.restaurantId !== targetId).concat(mapped);
          this.base.saveDatabase();
          return mapped;
        }
      }
    } catch (e) {
      console.warn('Backend inventory fetch failed, falling back to local store:', e);
    }

    return this.base.inventory.filter((i) => i.restaurantId === targetId);
  }

  async addInventoryItem(invData: Partial<InventoryItem>): Promise<InventoryItem> {
    const restId = this.base.resolveTenantRestaurantId(invData.restaurantId) || this.base.getCurrentRestaurantId();
    if (!restId) throw new Error("No active restaurant selected");
    const category = invData.category || 'Pantry';
    const isBarCategory = category.toLowerCase().includes('bar') || category.toLowerCase().includes('liquor') || category.toLowerCase().includes('spirit') || category.toLowerCase().includes('wine') || category.toLowerCase().includes('cocktail') || category.toLowerCase().includes('beer') || category.toLowerCase().includes('beverage');
    const station = invData.station || (isBarCategory ? 'BAR' : 'KITCHEN');

    const payload = {
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
    };

    let newItem: InventoryItem = {
      id: `inv-${Date.now()}`,
      restaurantId: restId,
      name: payload.name,
      category: payload.category,
      station: payload.station,
      quantity: payload.quantity,
      unit: payload.unit,
      minThreshold: payload.minThreshold,
      costPerUnit: payload.costPerUnit,
      supplierId: payload.supplierId,
      supplierName: payload.supplierName,
      supplierContact: payload.supplierContact,
      storageLocation: payload.storageLocation,
      lastRestocked: new Date().toISOString().split('T')[0],
      status: (payload.quantity || 10) <= (payload.minThreshold || 2) ? 'LOW_STOCK' : 'IN_STOCK',
    };

    try {
      const saved = await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(restId)}/inventory`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        'OWNER'
      );
      if (saved && saved.id) {
        newItem = { ...newItem, id: saved.id };
      }
    } catch (e) {
      console.warn('Backend add inventory item failed, saving to local store:', e);
    }

    this.base.inventory.push(newItem);
    this.base.saveDatabase();
    return newItem;
  }

  async updateInventoryQuantity(itemId: string, delta: number) {
    const item = this.base.inventory.find((i) => i.id === itemId);
    const restId = item?.restaurantId || this.base.getCurrentRestaurantId();

    if (restId) {
      try {
        await this.base.executeProtectedRequest<any>(
          `/restaurants/${encodeURIComponent(restId)}/inventory/${encodeURIComponent(itemId)}/adjust`,
          {
            method: 'POST',
            body: JSON.stringify({ delta }),
          },
          'OWNER'
        );
      } catch (e) {
        console.warn('Backend adjust inventory quantity failed, updating locally:', e);
      }
    }

    if (item) {
      item.quantity = Math.max(0, item.quantity + delta);
      item.status = item.quantity <= 0 ? 'OUT_OF_STOCK' : (item.quantity <= item.minThreshold ? 'LOW_STOCK' : 'IN_STOCK');
      this.base.saveDatabase();
    }
    return item;
  }

  async deleteInventoryItem(itemId: string) {
    const item = this.base.inventory.find((i) => i.id === itemId);
    const restId = item?.restaurantId || this.base.getCurrentRestaurantId();

    if (restId) {
      try {
        await this.base.executeProtectedRequest<any>(
          `/restaurants/${encodeURIComponent(restId)}/inventory/${encodeURIComponent(itemId)}`,
          { method: 'DELETE' },
          'OWNER'
        );
      } catch (e) {
        console.warn('Backend delete inventory item failed, removing locally:', e);
      }
    }

    this.base.inventory = this.base.inventory.filter((i) => i.id !== itemId);
    this.base.saveDatabase();
  }

  // --- Business Day Lifecycle ---
  async getCurrentBusinessDay(restaurantId?: string): Promise<BusinessDay | null> {
    const restId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!restId) return null;

    try {
      const data = await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(restId)}/business-day/current`,
        { method: 'GET' },
        'OWNER'
      );
      if (data && data.id) {
        const bday: BusinessDay = {
          id: data.id,
          restaurantId: data.restaurant_id || data.restaurantId || restId,
          date: data.business_date || data.date,
          status: data.status || 'OPEN',
          openedAt: data.opened_at || data.openedAt,
          openedBy: data.opened_by || data.openedBy,
          closedAt: data.closed_at || data.closedAt,
          closedBy: data.closed_by || data.closedBy,
          summary: data.summary,
        };
        const idx = this.base.businessDays.findIndex((b) => b.id === bday.id);
        if (idx !== -1) {
          this.base.businessDays[idx] = bday;
        } else {
          this.base.businessDays.unshift(bday);
        }
        this.base.saveDatabase();
        return bday;
      }
    } catch (err) {
      console.warn('[getCurrentBusinessDay] Backend API fallback:', err);
    }

    const openDay = this.base.businessDays.find((b) => b.restaurantId === restId && b.status === 'OPEN');
    if (openDay) return openDay;
    const restDays = this.base.businessDays.filter((b) => b.restaurantId === restId);
    if (restDays.length > 0) return restDays[0];

    const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const initialDay: BusinessDay = {
      id: `bday-${restId}-${Date.now()}`,
      restaurantId: restId,
      date: todayStr,
      status: 'OPEN',
      openedAt: new Date().toISOString(),
      openedBy: 'System Auto',
    };
    this.base.businessDays.unshift(initialDay);
    this.base.saveDatabase();
    return initialDay;
  }

  async getBusinessDayPrecheck(restaurantId?: string) {
    const restId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!restId) throw new Error('No active restaurant selected');

    try {
      return await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(restId)}/business-day/precheck`,
        { method: 'GET' },
        'OWNER'
      );
    } catch (err) {
      console.warn('[getBusinessDayPrecheck] Backend API fallback:', err);
      const openTables = this.base.tables.filter((t) => t.restaurantId === restId && (t.status === 'OCCUPIED' || t.isOccupied)).length;
      const activeSessions = this.base.tableSessions.filter((s) => s.restaurantId === restId && s.status === 'ACTIVE').length;
      const openOrders = this.base.orders.filter((o) => o.restaurantId === restId && ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)).length;
      const openKitchen = this.base.orders.filter((o) => o.restaurantId === restId && ['PENDING', 'ACCEPTED', 'PREPARING'].includes(o.kitchenStatus || o.status)).length;
      const openBar = this.base.orders.filter((o) => o.restaurantId === restId && ['PENDING', 'ACCEPTED', 'PREPARING'].includes(o.barStatus || '')).length;
      const unpaidBills = this.base.bills.filter((b) => b.restaurantId === restId && b.status !== 'PAID' && b.status !== 'CANCELLED').length;
      const openRequests = this.base.customerRequests.filter((r) => r.restaurantId === restId && r.status === 'PENDING').length;
      const warnings: string[] = [];
      if (openTables > 0) warnings.push(`${openTables} active dining table(s) currently occupied.`);
      if (openKitchen > 0) warnings.push(`${openKitchen} kitchen ticket(s) still in preparation.`);
      if (openBar > 0) warnings.push(`${openBar} bar drink(s) pending.`);
      if (unpaidBills > 0) warnings.push(`${unpaidBills} unpaid bill(s) pending settlement.`);
      if (openRequests > 0) warnings.push(`${openRequests} waiter assistance request(s) open.`);
      return {
        canClose: warnings.length === 0,
        can_close_safely: warnings.length === 0,
        openTablesCount: openTables,
        active_tables_count: openTables,
        activeSessionsCount: activeSessions,
        uncompletedKitchenOrdersCount: openKitchen,
        uncompletedBarOrdersCount: openBar,
        openOrdersCount: openOrders,
        open_orders_count: openOrders,
        openWaiterRequestsCount: openRequests,
        unpaidBillsCount: unpaidBills,
        totalOrdersToday: this.base.orders.filter((o) => o.restaurantId === restId).length,
        totalSalesToday: this.base.orders.filter((o) => o.restaurantId === restId && o.status !== 'CANCELLED').reduce((s, o) => s + o.totalAmount, 0),
        warnings,
      };
    }
  }

  async openBusinessDay(restaurantId?: string, openedBy?: string) {
    const restId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!restId) throw new Error('No active restaurant selected');

    try {
      const data = await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(restId)}/business-day/open`,
        {
          method: 'POST',
          body: JSON.stringify({ openedBy: openedBy || 'Manager' }),
        },
        'OWNER'
      );
      if (data && data.id) {
        const bday: BusinessDay = {
          id: data.id,
          restaurantId: data.restaurant_id || data.restaurantId || restId,
          date: data.business_date || data.date,
          status: 'OPEN',
          openedAt: data.opened_at || data.openedAt || new Date().toISOString(),
          openedBy: data.opened_by || data.openedBy || openedBy || 'Manager',
        };
        const idx = this.base.businessDays.findIndex((b) => b.id === bday.id);
        if (idx !== -1) {
          this.base.businessDays[idx] = bday;
        } else {
          this.base.businessDays.unshift(bday);
        }
        this.base.saveDatabase();
        return bday;
      }
    } catch (err) {
      console.warn('[openBusinessDay] Backend API fallback:', err);
    }

    const openDay = this.base.businessDays.find((b) => b.restaurantId === restId && b.status === 'OPEN');
    if (openDay) return openDay;

    const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const newDay: BusinessDay = {
      id: `bday-${restId}-${Date.now()}`,
      restaurantId: restId,
      date: todayStr,
      status: 'OPEN',
      openedAt: new Date().toISOString(),
      openedBy: openedBy || 'Manager',
    };

    this.base.businessDays.unshift(newDay);
    this.base.saveDatabase();

    realtimeBus.emit('BusinessDayOpened' as any, {
      businessDayId: newDay.id,
      restaurantId: restId,
      data: newDay,
    });

    return newDay;
  }

  async closeBusinessDay(
    restaurantId?: string,
    closedBy?: string,
    options?: {
      closingNotes?: string;
      forceCloseActiveTables?: boolean;
      forceFinalizeOrders?: boolean;
      openingFloat?: number;
      cashSalesRecorded?: number;
      cashDropped?: number;
      closingDrawerCount?: number;
      discrepancy?: number;
      discrepancyReason?: string;
      [key: string]: any;
    }
  ) {
    const restId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!restId) throw new Error('No active restaurant selected');

    let backendResult: any = null;
    try {
      backendResult = await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(restId)}/business-day/close`,
        {
          method: 'POST',
          body: JSON.stringify({
            closingNotes: options?.closingNotes || `Closed by ${closedBy || 'Owner'}`,
            forceCloseActiveTables: options?.forceCloseActiveTables ?? true,
            forceFinalizeOrders: options?.forceFinalizeOrders ?? true,
          }),
        },
        'OWNER'
      );
    } catch (err) {
      console.warn('[closeBusinessDay] Backend API fallback:', err);
    }

    this.base.tableSessions.forEach((s) => {
      if (s.restaurantId === restId && s.status === 'ACTIVE') {
        s.status = 'CLOSED';
        s.sessionClosedAt = new Date().toISOString();
        s.closedByWaiterName = closedBy || 'Day Close';
      }
    });

    this.base.tables.forEach((tbl) => {
      if (tbl.restaurantId === restId) {
        tbl.status = 'AVAILABLE';
        tbl.isOccupied = false;
        tbl.activeSessionId = undefined;
        tbl.sessionStartedAt = undefined;
      }
    });

    this.base.orders.forEach((o) => {
      if (o.restaurantId === restId && ['PENDING', 'ACCEPTED', 'PREPARING'].includes(o.status)) {
        o.status = 'COMPLETED';
        o.kitchenStatus = 'COMPLETED';
        o.barStatus = 'COMPLETED';
      }
    });

    this.base.customerRequests.forEach((r) => {
      if (r.restaurantId === restId && r.status === 'PENDING') {
        r.status = 'COMPLETED';
      }
    });

    const openDay = this.base.businessDays.find((b) => b.restaurantId === restId && b.status === 'OPEN');
    if (openDay) {
      openDay.status = 'CLOSED';
      openDay.closedAt = new Date().toISOString();
      openDay.closedBy = closedBy || 'Owner';
      if (backendResult?.summary) openDay.summary = backendResult.summary;
    }

    if (backendResult?.nextDay) {
      const nextDayData = backendResult.nextDay;
      const nextDay: BusinessDay = {
        id: nextDayData.id,
        restaurantId: restId,
        date: nextDayData.business_date || nextDayData.date,
        status: 'OPEN',
        openedAt: nextDayData.opened_at || nextDayData.openedAt || new Date().toISOString(),
        openedBy: nextDayData.opened_by || nextDayData.openedBy || 'System Next Day',
      };
      this.base.businessDays.unshift(nextDay);
    }

    this.base.invalidateQueryCache();
    this.base.saveDatabase();

    const closedEventPayload = {
      businessDayId: openDay?.id || backendResult?.id,
      restaurantId: restId,
      summary: backendResult?.summary || openDay?.summary,
      closedDay: backendResult?.closedDay || openDay,
      nextDay: backendResult?.nextDay,
      timestamp: new Date().toISOString(),
    };

    realtimeBus.emit('DayClosed' as any, closedEventPayload);
    realtimeBus.emit('BusinessDayClosed' as any, closedEventPayload);

    return backendResult || openDay;
  }

  async getBusinessDayHistory(restaurantId?: string): Promise<BusinessDay[]> {
    const restId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!restId) return [];

    try {
      const data = await this.base.executeProtectedRequest<any[]>(
        `/restaurants/${encodeURIComponent(restId)}/business-day/history`,
        { method: 'GET' },
        'OWNER'
      );
      if (Array.isArray(data)) {
        return data.map((d) => ({
          id: d.id,
          restaurantId: d.restaurant_id || d.restaurantId || restId,
          date: d.business_date || d.date,
          status: d.status,
          openedAt: d.opened_at || d.openedAt,
          openedBy: d.opened_by || d.openedBy,
          closedAt: d.closed_at || d.closedAt,
          closedBy: d.closed_by || d.closedBy,
          summary: d.summary,
        }));
      }
    } catch (err) {
      console.warn('[getBusinessDayHistory] Backend API fallback:', err);
    }
    return this.base.businessDays.filter((b) => b.restaurantId === restId && b.status === 'CLOSED');
  }

  async getOwnerRestaurants(ownerEmail?: string, ownerUid?: string): Promise<Restaurant[]> {
    const scope = getPortalScopeFromPath();
    const user = this.base.getCurrentUser(scope);
    let email = (ownerEmail || user?.email || (typeof window !== 'undefined' && firebaseAuth?.currentUser?.email) || '').trim().toLowerCase();
    let uid = (ownerUid || user?.id || (typeof window !== 'undefined' && firebaseAuth?.currentUser?.uid) || '').trim();

    if (typeof window !== 'undefined' && firebaseAuth?.currentUser) {
      try {
        const token = await firebaseAuth.currentUser.getIdToken();
        if (token) {
          localStorage.setItem('dinely_auth_token', token);
        }
        if (!email && firebaseAuth.currentUser.email) {
          email = firebaseAuth.currentUser.email.trim().toLowerCase();
        }
        if (!uid && firebaseAuth.currentUser.uid) {
          uid = firebaseAuth.currentUser.uid;
        }
      } catch (e) {
        console.warn('Firebase token refresh error:', e);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const params = new URLSearchParams();
      if (email) params.append('owner_email', email);
      if (uid) params.append('owner_uid', uid);

      const data = await this.base.executeProtectedRequest<any[]>(
        `/restaurants/owner/my?${params.toString()}`,
        { signal: controller.signal },
        scope
      );
      clearTimeout(timeoutId);

      if (Array.isArray(data)) {
        const mappedList = data.map((r: any) => this.base.mapBackendRestaurant(r));
        this.base.restaurants = [
          ...this.base.restaurants.filter((ex) => !mappedList.some((m) => m.id === ex.id)),
          ...mappedList,
        ];
        this.base.saveDatabase();
        return mappedList;
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn('[API] getOwnerRestaurants fetch warning:', e);
    }

    if (!email && !uid) return [];
    return this.base.restaurants.filter(
      (r) =>
        !r.isDeleted &&
        ((email && r.ownerEmail && r.ownerEmail.toLowerCase() === email) ||
          (uid && (r as any).ownerUid === uid) ||
          (user && r.id === user.restaurantId))
    );
  }

  async getOwnedRestaurants(ownerEmail?: string, ownerUid?: string): Promise<Restaurant[]> {
    return this.getOwnerRestaurants(ownerEmail, ownerUid);
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
    this.base.organizations.push(newOrg);
    this.base.saveDatabase();
    return newOrg;
  }
}

