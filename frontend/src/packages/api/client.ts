import {
  Organization,
  Restaurant,
  MenuItem,
  Order,
  Table,
  Employee,
  InventoryItem,
  AuditLog,
  ThemeConfig,
  User,
  AuthTokens,
  CustomerRequest,
  WaiterNotification,
  PlatformNotification,
  MenuCategory,
} from '../types';
import { DEFAULT_THEME } from '../data/mockData';
import { realtimeBus } from './realtime';

// Simulated API delay helper
const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

const SESSION_STORAGE_KEY = 'dineflow_user_session';
const DATABASE_STORAGE_KEY = 'dineflow_production_db_v3';

export class DineFlowApiClient {
  private organizations: Organization[] = [];
  private restaurants: Restaurant[] = [];
  private menuItems: MenuItem[] = [];
  private categories: MenuCategory[] = [];
  private orders: Order[] = [];
  private tables: Table[] = [];
  private employees: Employee[] = [];
  private inventory: InventoryItem[] = [];
  private auditLogs: AuditLog[] = [];
  private customerRequests: CustomerRequest[] = [];
  private platformNotifications: PlatformNotification[] = [];
  private notifications: WaiterNotification[] = [];
  private users: User[] = [];

  private currentUser: User | null = null;
  private currentTokens: AuthTokens | null = null;
  private currentRestaurantId: string | null = null;

  constructor() {
    this.loadDatabase();
    this.restoreSession();
  }

  // --- Persistent Storage Engine ---
  private loadDatabase() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(DATABASE_STORAGE_KEY);
        if (raw) {
          const db = JSON.parse(raw);
          this.organizations = db.organizations || [];
          this.restaurants = db.restaurants || [];
          this.menuItems = db.menuItems || [];
          this.categories = db.categories || [];
          this.orders = db.orders || [];
          this.tables = db.tables || [];
          this.employees = db.employees || [];
          this.inventory = db.inventory || [];
          this.auditLogs = db.auditLogs || [];
          this.customerRequests = db.customerRequests || [];
          this.platformNotifications = db.platformNotifications || [];
          this.users = db.users || [];
        }
      }
    } catch (e) {
      console.error('Failed to load database from localStorage:', e);
    }

    // Ensure default System Super Admin exists if users list is empty
    const hasAdmin = this.users.some((u) => u.role === 'PLATFORM_ADMIN');
    if (!hasAdmin) {
      const defaultAdmin: User = {
        id: 'usr-sys-admin',
        firstName: 'Platform',
        lastName: 'Admin',
        name: 'Platform Administrator',
        email: 'admin@dineflow.com',
        phone: '+1 800-DINE-FLOW',
        role: 'PLATFORM_ADMIN',
        isEmailVerified: true,
        password: 'admin123',
      };
      this.users.unshift(defaultAdmin);
      this.saveDatabase();
    }
  }

  private saveDatabase() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const payload = {
          organizations: this.organizations,
          restaurants: this.restaurants,
          menuItems: this.menuItems,
          categories: this.categories,
          orders: this.orders,
          tables: this.tables,
          employees: this.employees,
          inventory: this.inventory,
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

  private restoreSession() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          if (parsed && parsed.user) {
            // Find fresh user object in memory
            const freshUser = this.users.find((u) => u.email.toLowerCase() === parsed.user.email?.toLowerCase()) || parsed.user;
            this.currentUser = freshUser;
            this.currentTokens = parsed.tokens || null;
            this.currentRestaurantId = parsed.restaurantId || freshUser.restaurantId || null;
            return;
          }
        }
      }
    } catch (e) {
      console.error('Failed to restore session from localStorage', e);
    }

    this.currentUser = null;
    this.currentRestaurantId = null;
  }

  private saveSession(user: User, tokens: AuthTokens, restaurantId?: string | null) {
    this.currentUser = user;
    this.currentTokens = tokens;
    this.currentRestaurantId = restaurantId || user.restaurantId || null;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({
            user,
            tokens,
            restaurantId: this.currentRestaurantId,
            orgId: user.orgId,
          })
        );
      }
    } catch (e) {
      console.error('Failed to save session to localStorage', e);
    }
  }

  // --- Auth & Account APIs ---

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
    if (!user && normalizedEmail === 'admin@dineflow.com') {
      return this.loginPlatformAdmin(email, password);
    }

    if (!user) {
      throw new Error('No owner account found with this email address. Please register your restaurant first.');
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

  async loginPlatformAdmin(email: string, password?: string) {
    await delay(300);
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail !== 'admin@dineflow.com' && !normalizedEmail.includes('admin')) {
      throw new Error('Access Denied: This portal is strictly reserved for Platform Administrators.');
    }

    if (password && password !== 'admin123') {
      throw new Error('Invalid Platform Admin password. Default demo password is admin123');
    }

    const adminUser: User = {
      id: 'usr-sys-admin',
      firstName: 'Platform',
      lastName: 'Admin',
      name: 'Platform Administrator',
      email: normalizedEmail || 'admin@dineflow.com',
      phone: '+1 800-DINE-FLOW',
      role: 'PLATFORM_ADMIN',
      isEmailVerified: true,
    };

    const tokens: AuthTokens = {
      accessToken: `df_admin_jwt_${Date.now()}`,
      refreshToken: `df_admin_ref_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    adminUser.tokens = tokens;
    this.saveSession(adminUser, tokens);

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: 'Platform Administrator',
      action: 'Authenticated Platform Admin Control Plane',
      target: 'DineFlow Cloud',
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    return { user: adminUser, tokens };
  }

  async loginKitchen(email: string, password?: string) {
    await delay(350);
    const normalizedEmail = email.trim().toLowerCase();
    const emp = this.employees.find((e) => e.email.toLowerCase() === normalizedEmail);

    if (!emp) {
      throw new Error('No kitchen staff account found with this email. Ask your Restaurant Owner to add you in Staff Management.');
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId && !r.isDeleted);
    if (!rest) {
      throw new Error('Associated restaurant is inactive or deleted.');
    }

    const kitchenUser: User = {
      id: `usr-${emp.id}`,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      role: 'CHEF',
      restaurantId: emp.restaurantId,
      orgId: rest.orgId,
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
    return { user: kitchenUser, tokens, employee: emp, restaurant: rest };
  }

  async loginWaiter(email: string, password?: string) {
    await delay(350);
    const normalizedEmail = email.trim().toLowerCase();
    const emp = this.employees.find((e) => e.email.toLowerCase() === normalizedEmail);

    if (!emp) {
      throw new Error('No waiter staff account found with this email. Ask your Restaurant Owner to add you in Staff Management.');
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId && !r.isDeleted);
    if (!rest) {
      throw new Error('Associated restaurant is inactive or deleted.');
    }

    const waiterUser: User = {
      id: `usr-${emp.id}`,
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      role: 'WAITER',
      restaurantId: emp.restaurantId,
      orgId: rest.orgId,
      isEmailVerified: true,
    };

    const tokens: AuthTokens = {
      accessToken: `df_waiter_jwt_${emp.id}_${Date.now()}`,
      refreshToken: `df_waiter_ref_${emp.id}_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    waiterUser.tokens = tokens;
    this.saveSession(waiterUser, tokens, emp.restaurantId);
    return { user: waiterUser, tokens, employee: emp, restaurant: rest };
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  getCurrentRestaurantId(): string | null {
    return this.currentRestaurantId;
  }

  async logout() {
    this.currentUser = null;
    this.currentTokens = null;
    this.currentRestaurantId = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  // --- Restaurant & Onboarding APIs ---

  async createRestaurantForOwner(restData: {
    name: string;
    cuisine?: string;
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

    const newRest: Restaurant = {
      id,
      orgId,
      name: restData.name,
      slug,
      cuisine: restData.cuisine || 'Multi-Cuisine',
      address: restData.address || 'Main Street Center',
      phone: restData.phone || '+1 555-0100',
      email: restData.email || 'contact@dineflow.com',
      ownerName: restData.ownerName || this.currentUser?.name || 'Restaurant Owner',
      ownerEmail: restData.ownerEmail || this.currentUser?.email || 'owner@restaurant.com',
      domain: `${slug}.dineflow.app`,
      isApproved: false,
      lifecycleStatus: 'DRAFT',
      status: 'CLOSED',
      rating: 5.0,
      activeOrdersCount: 0,
      tablesCount: 8,
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
        bar: false,
        bakery: false,
        desserts: true,
        takeaway: true,
        delivery: true,
        reservations: true,
        outdoor_seating: true,
        vip_rooms: false,
      },
    };

    this.restaurants.unshift(newRest);
    this.currentRestaurantId = id;
    if (this.currentUser) {
      this.currentUser.restaurantId = id;
    }

    this.saveDatabase();
    return newRest;
  }

  async submitRestaurantLaunch(setupData: any) {
    await delay(400);

    const activeRestId = setupData.id || this.currentRestaurantId || this.currentUser?.restaurantId;
    let existing = this.restaurants.find((r) => r.id === activeRestId);
    const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    if (existing) {
      existing.name = setupData.restaurantName || setupData.name || existing.name;
      existing.cuisine = setupData.cuisine || existing.cuisine;
      existing.restaurantType = setupData.restaurantType || existing.restaurantType;
      existing.address = setupData.address || existing.address;
      existing.city = setupData.city || existing.city;
      existing.state = setupData.state || existing.state;
      existing.country = setupData.country || existing.country;
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

  async getRestaurants() {
    await delay(100);
    return this.restaurants.filter((r) => !r.isDeleted);
  }

  async approveRestaurant(restaurantId: string) {
    await delay(200);
    const rest = this.restaurants.find((r) => r.id === restaurantId || (restaurantId && r.id.toLowerCase() === restaurantId.toLowerCase()));
    if (rest) {
      const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      rest.isApproved = true;
      rest.status = 'OPEN';
      rest.lifecycleStatus = 'LIVE';
      rest.approvedAt = now;

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
        title: 'Congratulations! Your Restaurant has been Approved 🎉',
        message: `Your restaurant "${rest.name}" has been approved by DineFlow Cloud Platform Admin. Your live Operating System and Customer Ordering Portal are now active!`,
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
        ipAddress: '10.0.0.1',
        status: 'SUCCESS',
      });

      this.saveDatabase();
      realtimeBus.emit('RESTAURANT_APPROVED' as any, { restaurantId: rest.id, restaurantName: rest.name } as any);
    }
    return rest;
  }

  async rejectRestaurant(restaurantId: string, reason = 'Application declined') {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.lifecycleStatus = 'CHANGES_REQUESTED';
      rest.isApproved = false;
      rest.rejectionReason = reason;

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: 'Application Update: Action Required',
        message: `Your setup submission requires changes before launch approval: "${reason}". Please edit your setup details and resubmit.`,
        type: 'CHANGES_REQUESTED',
        timestamp: 'Just now',
        isRead: false,
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
    if (providedId) return providedId;
    if (this.currentRestaurantId) return this.currentRestaurantId;
    if (this.currentUser?.restaurantId) return this.currentUser.restaurantId;
    return this.restaurants.find((r) => !r.isDeleted)?.id || null;
  }

  async getRestaurantDetails(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return null;
    return this.restaurants.find((r) => r.id === targetId && !r.isDeleted) || null;
  }

  async getOwnerRestaurants() {
    await delay(100);
    if (!this.currentUser) return [];
    return this.restaurants.filter(
      (r) => !r.isDeleted && (r.ownerEmail?.toLowerCase() === this.currentUser?.email?.toLowerCase() || r.id === this.currentUser?.restaurantId)
    );
  }

  async getOrders(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    return this.orders.filter((o) => o.restaurantId === targetId);
  }

  async getMenuItems(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    return this.menuItems.filter((m) => m.restaurantId === targetId);
  }

  async getTables(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    return this.tables.filter((t) => t.restaurantId === targetId);
  }

  async getEmployees(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    return this.employees.filter((e) => e.restaurantId === targetId);
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

  async switchActiveRestaurant(restId: string) {
    this.currentRestaurantId = restId;
    if (this.currentUser) {
      this.currentUser.restaurantId = restId;
      this.saveSession(this.currentUser, this.currentUser.tokens || ({} as any), restId);
    }
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
  async createTable(tableData: Partial<Table>) {
    await delay(150);
    const targetRestId = this.resolveTenantRestaurantId(tableData.restaurantId);
    const newTable: Table = {
      id: `tbl-${Date.now()}`,
      restaurantId: targetRestId || 'rest-1',
      tableNumber: tableData.tableNumber || `Table ${this.tables.length + 1}`,
      capacity: tableData.capacity || 4,
      section: tableData.section || 'Main Hall',
      shape: tableData.shape || 'RECTANGLE',
      status: 'AVAILABLE',
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://${targetRestId}.dineflow.app/order?table=${tableData.tableNumber}`,
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
        t.mergedLabel = label;
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
        t.mergedLabel = undefined;
      }
    });
    this.saveDatabase();
  }

  async reserveTable(tableId: string, reservationDetails: any) {
    await delay(150);
    const table = this.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'RESERVED';
      table.reservedForName = reservationDetails.reservedForName;
      table.reservedForPhone = reservationDetails.reservedForPhone;
      table.reservationTime = reservationDetails.reservationTime;
      table.partySize = reservationDetails.partySize;
      this.saveDatabase();
    }
    return table;
  }

  async cancelTableReservation(tableId: string) {
    await delay(150);
    const table = this.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'AVAILABLE';
      table.reservedForName = undefined;
      table.reservedForPhone = undefined;
      table.reservationTime = undefined;
      table.partySize = undefined;
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
    const table = this.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = status;
      this.saveDatabase();
    }
    return table;
  }

  // Menu APIs
  async toggleMenuItemAvailability(itemId: string) {
    await delay(100);
    const item = this.menuItems.find((m) => m.id === itemId);
    if (item) {
      item.isAvailable = !item.isAvailable;
      this.saveDatabase();
    }
    return item;
  }

  async addMenuItem(itemData: Partial<MenuItem>) {
    await delay(150);
    const restId = this.resolveTenantRestaurantId(itemData.restaurantId) || 'rest-1';
    const newItem: MenuItem = {
      id: `item-${Date.now()}`,
      restaurantId: restId,
      categoryId: itemData.categoryId || 'cat-1',
      name: itemData.name || 'New Item',
      description: itemData.description || '',
      price: itemData.price || 9.99,
      image: itemData.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
      isAvailable: itemData.isAvailable !== false,
      isVegetarian: itemData.isVegetarian || false,
      isSpicy: itemData.isSpicy || false,
      prepTimeMinutes: itemData.prepTimeMinutes || 15,
      targetDestination: itemData.targetDestination || 'KITCHEN',
    };
    this.menuItems.push(newItem);
    this.saveDatabase();
    return newItem;
  }

  async updateMenuItem(itemId: string, updates: Partial<MenuItem>) {
    await delay(150);
    const item = this.menuItems.find((m) => m.id === itemId);
    if (item) {
      Object.assign(item, updates);
      this.saveDatabase();
    }
    return item;
  }

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

  async deleteMenuItem(itemId: string) {
    await delay(150);
    this.menuItems = this.menuItems.filter((m) => m.id !== itemId);
    this.saveDatabase();
  }

  // Employee APIs
  async addEmployee(empData: Partial<Employee>) {
    await delay(150);
    const restId = this.resolveTenantRestaurantId(empData.restaurantId) || 'rest-1';
    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      restaurantId: restId,
      name: empData.name || 'Staff Member',
      email: empData.email || 'staff@restaurant.com',
      phone: empData.phone || '+1 555-0100',
      role: empData.role || 'WAITER',
      status: 'OFF_CLOCK',
      hourlyRate: empData.hourlyRate || 18,
      joinedDate: new Date().toISOString().split('T')[0],
      isAccountDisabled: false,
    };
    this.employees.push(newEmp);
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

  // Inventory APIs
  async addInventoryItem(invData: Partial<InventoryItem>) {
    await delay(150);
    const restId = this.resolveTenantRestaurantId(invData.restaurantId) || 'rest-1';
    const newItem: InventoryItem = {
      id: `inv-${Date.now()}`,
      restaurantId: restId,
      name: invData.name || 'Raw Material',
      category: invData.category || 'Pantry',
      quantity: invData.quantity || 10,
      unit: invData.unit || 'kg',
      minThreshold: invData.minThreshold || 2,
      costPerUnit: invData.costPerUnit || 5,
      supplierName: invData.supplierName || 'General Foods',
      storageLocation: invData.storageLocation || 'Main Storage',
      lastRestocked: new Date().toISOString().split('T')[0],
      status: 'IN_STOCK',
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
      order.status = 'PREPARING';
      order.estimatedPrepTimeMinutes = prepTime;
      this.saveDatabase();
    }
    return order;
  }

  async updateOrderETA(orderId: string, prepTimeMinutes: number, note?: string, updatedBy?: string) {
    await delay(100);
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.estimatedPrepTimeMinutes = prepTimeMinutes;
      this.saveDatabase();
    }
    return order;
  }

  async toggleOrderTimer(orderId: string) {
    await delay(100);
    const order = this.orders.find((o) => o.id === orderId);
    return order;
  }

  async markOrderReady(orderId: string) {
    await delay(150);
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = 'READY';
      this.saveDatabase();
    }
    return order;
  }

  async deliverOrder(orderId: string) {
    await delay(150);
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = 'DELIVERED';
      this.saveDatabase();
    }
    return order;
  }

  async updateOrderStatus(orderId: string, status: any) {
    await delay(150);
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = status;
      this.saveDatabase();
    }
    return order;
  }

  async getKitchenAnalytics(restaurantId?: string) {
    await delay(100);
    return {
      avgPrepTimeMinutes: 14,
      totalOrdersPrepared: 42,
      onTimeDeliveryRate: 98.5,
      activeKitchenStations: 3,
    };
  }

  async getSmartETARecommendation(itemNames?: any) {
    await delay(100);
    return { recommendedMinutes: 15, confidenceScore: 0.95 };
  }

  // Customer & Portal Helper APIs
  async requestBill(tableNumber: string, restaurantId?: string) {
    await delay(150);
    const req = {
      id: `req-${Date.now()}`,
      restaurantId: restaurantId || this.currentRestaurantId || 'rest-1',
      tableNumber,
      requestType: 'BILL',
      message: `Table ${tableNumber} requested the final bill.`,
      status: 'PENDING',
      timestamp: 'Just now',
    };
    this.customerRequests.push(req as any);
    this.saveDatabase();
    return req;
  }

  async callWaiter(tableNumber: string, reason: string, restaurantId?: string) {
    await delay(150);
    const req = {
      id: `req-${Date.now()}`,
      restaurantId: restaurantId || this.currentRestaurantId || 'rest-1',
      tableNumber,
      requestType: 'WATER',
      message: `Table ${tableNumber} called waiter: ${reason}`,
      status: 'PENDING',
      timestamp: 'Just now',
    };
    this.customerRequests.push(req as any);
    this.saveDatabase();
    return req;
  }

  async createCustomerOrder(orderData: any) {
    await delay(250);
    const newOrder = {
      id: `ord-${Date.now()}`,
      restaurantId: orderData.restaurantId || this.currentRestaurantId || 'rest-1',
      tableNumber: orderData.tableNumber || 'Table 01',
      items: orderData.items || [],
      subtotal: orderData.subtotal || 0,
      tax: orderData.tax || 0,
      total: orderData.total || 0,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.orders.unshift(newOrder as any);
    this.saveDatabase();
    return newOrder;
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
      country: orgData.country || 'United States',
      currency: orgData.currency || 'USD ($)',
      timezone: orgData.timezone || 'UTC',
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
    await delay(100);
    return [...this.customerRequests];
  }

  async getWaiterNotifications(restaurantId?: string) {
    await delay(100);
    return [...this.notifications];
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

  async acceptCustomerRequest(reqId: string, waiterId?: string) {
    await delay(100);
    const req = this.customerRequests.find((r) => r.id === reqId);
    if (req) {
      req.status = 'ACCEPTED';
      this.saveDatabase();
    }
    return req;
  }

  async rejectCustomerRequest(reqId: string, waiterId?: string) {
    await delay(100);
    const req = this.customerRequests.find((r) => r.id === reqId);
    if (req) {
      req.status = 'REJECTED';
      this.saveDatabase();
    }
    return req;
  }

  async updateCustomerRequestStatus(reqId: string, status: any) {
    await delay(100);
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
    await delay(100);
    this.customerRequests.push(req);
    this.saveDatabase();
    return req;
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
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }
}

export const api = new DineFlowApiClient();
