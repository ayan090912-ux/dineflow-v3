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
  BarCategory,
  BarMenuItem,
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
  private barCategories: BarCategory[] = [];
  private barMenuItems: BarMenuItem[] = [];
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
          this.barCategories = db.barCategories || [];
          this.barMenuItems = db.barMenuItems || [];
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

    // Ensure default demo restaurant rest-1 exists with initial data if database is empty
    if (this.restaurants.length === 0) {
      const demoRest: Restaurant = {
        id: 'rest-1',
        orgId: 'org-1',
        name: 'Lumière Bistro',
        slug: 'lumiere-bistro',
        cuisine: 'French Fine Dining',
        address: '742 Evergreen Terrace',
        city: 'New York',
        phone: '+1 555-0199',
        email: 'owner@lumiere.com',
        ownerName: 'Marcus Vance',
        ownerEmail: 'owner@lumiere.com',
        isApproved: true,
        status: 'OPEN',
        lifecycleStatus: 'LIVE',
        rating: 4.9,
        activeOrdersCount: 2,
        tablesCount: 8,
        theme: {
          restaurantId: 'rest-1',
          restaurantName: 'Lumière Bistro',
          logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
          bannerUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
          primaryColor: '#e11d48',
          secondaryColor: '#475569',
          accentColor: '#f59e0b',
          backgroundColor: '#f8fafc',
          textColor: '#0f172a',
          fontFamily: 'sans',
          borderRadius: 'lg',
          currency: 'INR (₹)',
        },
      };
      this.restaurants.push(demoRest);

      if (this.employees.length === 0) {
        this.employees.push(
          {
            id: 'emp-waiter-1',
            restaurantId: 'rest-1',
            name: 'Ayaan',
            email: 'waiter@lumiere.com',
            phone: '+1 555-0101',
            role: 'WAITER',
            status: 'OFF_CLOCK',
            hourlyRate: 20,
            password: 'waiter123',
            joinedDate: '2025-01-10',
          },
          {
            id: 'emp-chef-1',
            restaurantId: 'rest-1',
            name: 'Jean-Luc Picard',
            email: 'chef@lumiere.com',
            phone: '+1 555-0102',
            role: 'CHEF',
            status: 'ON_CLOCK',
            hourlyRate: 28,
            password: 'kitchen123',
            joinedDate: '2025-01-10',
          },
          {
            id: 'emp-bar-1',
            restaurantId: 'rest-1',
            name: 'Carlos Mendez',
            email: 'bartender@lumiere.com',
            phone: '+1 555-0103',
            role: 'BARTENDER',
            status: 'ON_CLOCK',
            hourlyRate: 24,
            password: 'bar123',
            joinedDate: '2025-01-10',
          },
          {
            id: 'emp-owner-1',
            restaurantId: 'rest-1',
            name: 'Marcus Vance',
            email: 'owner@lumiere.com',
            phone: '+1 555-0100',
            role: 'MANAGER',
            status: 'ON_CLOCK',
            hourlyRate: 50,
            password: 'owner123',
            joinedDate: '2025-01-01',
          }
        );
      }

      if (this.tables.length === 0) {
        this.tables.push(
          {
            id: 'tbl-1',
            restaurantId: 'rest-1',
            tableNumber: 'Table 01',
            capacity: 2,
            status: 'AVAILABLE',
            section: 'Main Dining',
            shape: 'SQUARE',
            qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://rest-1.dineflow.app/order?table=01',
          },
          {
            id: 'tbl-2',
            restaurantId: 'rest-1',
            tableNumber: 'Table 02',
            capacity: 4,
            status: 'OCCUPIED',
            assignedWaiterName: 'Ayaan',
            section: 'Main Dining',
            shape: 'RECTANGLE',
            sessionStartedAt: new Date(Date.now() - 18 * 60000).toISOString(),
            activeOrderId: 'ord-1043',
            qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://rest-1.dineflow.app/order?table=02',
          },
          {
            id: 'tbl-8',
            restaurantId: 'rest-1',
            tableNumber: 'Table 08',
            capacity: 4,
            status: 'OCCUPIED',
            assignedWaiterName: 'Ayaan',
            section: 'Patio',
            shape: 'ROUND',
            sessionStartedAt: new Date(Date.now() - 12 * 60000).toISOString(),
            activeOrderId: 'ord-1042',
            qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://rest-1.dineflow.app/order?table=08',
          }
        );
      }

      if (this.orders.length === 0) {
        this.orders.push(
          {
            id: 'ord-1042',
            restaurantId: 'rest-1',
            tableNumber: 'Table 08',
            customerName: 'Sarah Jenkins',
            status: 'READY',
            totalAmount: 32.50,
            taxAmount: 3.25,
            tipAmount: 5.00,
            paymentStatus: 'UNPAID',
            targetDestination: 'KITCHEN',
            createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
            updatedAt: new Date(Date.now() - 5 * 60000).toISOString(),
            readyAt: new Date(Date.now() - 3 * 60000).toISOString(),
            items: [
              { id: 'oi-1', menuItemId: 'item-1', name: 'Chicken Pasta', price: 22.50, quantity: 1, targetDestination: 'KITCHEN' },
              { id: 'oi-2', menuItemId: 'item-2', name: 'Garlic Bread', price: 10.00, quantity: 1, targetDestination: 'KITCHEN' },
            ],
          },
          {
            id: 'ord-1043',
            restaurantId: 'rest-1',
            tableNumber: 'Table 02',
            customerName: 'Robert Vance',
            status: 'PREPARING',
            totalAmount: 26.00,
            taxAmount: 2.60,
            tipAmount: 4.00,
            paymentStatus: 'UNPAID',
            targetDestination: 'KITCHEN',
            createdAt: new Date(Date.now() - 18 * 60000).toISOString(),
            updatedAt: new Date(Date.now() - 10 * 60000).toISOString(),
            items: [
              { id: 'oi-3', menuItemId: 'item-3', name: 'Truffle Risotto', price: 26.00, quantity: 1, targetDestination: 'KITCHEN' },
            ],
          }
        );
      }

      if (this.customerRequests.length === 0) {
        this.customerRequests.push(
          {
            id: 'req-101',
            restaurantId: 'rest-1',
            tableNumber: 'Table 08',
            requestType: 'WATER',
            customTitle: 'Extra Water Pitcher',
            priority: 'MEDIUM',
            status: 'PENDING',
            requestedAt: new Date(Date.now() - 4 * 60000).toISOString(),
            assignedWaiterName: 'Ayaan',
            customerNotes: 'Please bring extra ice',
          },
          {
            id: 'req-102',
            restaurantId: 'rest-1',
            tableNumber: 'Table 02',
            requestType: 'CALL_WAITER',
            customTitle: 'Table Call',
            priority: 'HIGH',
            status: 'PENDING',
            requestedAt: new Date(Date.now() - 2 * 60000).toISOString(),
            assignedWaiterName: 'Ayaan',
            customerNotes: 'Question about menu allergy options',
          }
        );
      }

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
          barCategories: this.barCategories,
          barMenuItems: this.barMenuItems,
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
            const freshUser = this.users.find((u) => u.email?.toLowerCase() === parsed.user.email?.toLowerCase());
            const mergedUser = freshUser
              ? { ...parsed.user, ...freshUser, restaurantId: parsed.restaurantId || freshUser.restaurantId || parsed.user.restaurantId }
              : parsed.user;
            this.currentUser = mergedUser;
            this.currentTokens = parsed.tokens || mergedUser.tokens || null;
            this.currentRestaurantId = parsed.restaurantId || mergedUser.restaurantId || null;
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

    const existingIdx = this.users.findIndex((u) => u.email?.toLowerCase() === user.email?.toLowerCase());
    if (existingIdx >= 0) {
      this.users[existingIdx] = {
        ...this.users[existingIdx],
        ...user,
        restaurantId: this.currentRestaurantId || this.users[existingIdx].restaurantId,
      };
    } else {
      this.users.unshift(user);
    }

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
    this.saveDatabase();
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
    let emp = this.employees.find((e) => e.email.toLowerCase() === normalizedEmail);

    if (!emp) {
      if (normalizedEmail.includes('chef') || normalizedEmail.includes('kitchen') || normalizedEmail === 'chef@lumiere.com') {
        emp = {
          id: 'emp-chef-1',
          restaurantId: 'rest-1',
          name: 'Jean-Luc Picard',
          email: normalizedEmail,
          phone: '+1 555-0102',
          role: 'CHEF',
          status: 'ON_CLOCK',
          hourlyRate: 28,
          password: password || 'kitchen123',
          joinedDate: '2025-01-10',
        };
        this.employees.push(emp);
        this.saveDatabase();
      } else {
        throw new Error('No kitchen staff account found with this email. Ask your Restaurant Owner to add you in Staff Management.');
      }
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId && !r.isDeleted) || this.restaurants[0];

    const kitchenUser: User = {
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
    return { user: kitchenUser, tokens, employee: emp, restaurant: rest };
  }

  async loginWaiter(email: string, password?: string) {
    await delay(350);
    const normalizedEmail = email.trim().toLowerCase();
    let emp = this.employees.find((e) => e.email.toLowerCase() === normalizedEmail);

    if (!emp) {
      if (normalizedEmail.includes('waiter') || normalizedEmail.includes('server') || normalizedEmail === 'waiter@lumiere.com') {
        emp = {
          id: 'emp-waiter-1',
          restaurantId: 'rest-1',
          name: 'Ayaan',
          email: normalizedEmail,
          phone: '+1 555-0101',
          role: 'WAITER',
          status: 'OFF_CLOCK',
          hourlyRate: 20,
          password: password || 'waiter123',
          joinedDate: '2025-01-10',
        };
        this.employees.push(emp);
        this.saveDatabase();
      } else {
        throw new Error('No waiter staff account found with this email. Ask your Restaurant Owner to add you in Staff Management.');
      }
    }

    if (password && emp.password && emp.password !== password) {
      throw new Error('Invalid password. Please check your credentials and try again.');
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId && !r.isDeleted) || this.restaurants[0];

    // Set employee status to ON_CLOCK when waiter logs in (backend presence truth)
    emp.status = 'ON_CLOCK';
    emp.lastLoginAt = new Date().toISOString();

    let waiterUser = this.users.find((u) => u.email.toLowerCase() === normalizedEmail);
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
    return { user: waiterUser, tokens, employee: emp, restaurant: rest };
  }

  async loginBar(email: string, password?: string) {
    await delay(350);
    const normalizedEmail = email.trim().toLowerCase();
    let emp = this.employees.find((e) => e.email.toLowerCase() === normalizedEmail);

    if (!emp) {
      if (normalizedEmail.includes('bar') || normalizedEmail.includes('bartender') || normalizedEmail === 'bartender@lumiere.com') {
        emp = {
          id: 'emp-bar-1',
          restaurantId: 'rest-1',
          name: 'Carlos Mendez',
          email: normalizedEmail,
          phone: '+1 555-0103',
          role: 'BARTENDER',
          status: 'ON_CLOCK',
          hourlyRate: 24,
          password: password || 'bar123',
          joinedDate: '2025-01-10',
        };
        this.employees.push(emp);
        this.saveDatabase();
      } else {
        throw new Error('No bar staff account found with this email. Ask your Restaurant Owner to add you in Staff Management.');
      }
    }

    if (password && emp.password && emp.password !== password) {
      throw new Error('Invalid password. Please check your credentials and try again.');
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId && !r.isDeleted) || this.restaurants[0];

    emp.status = 'ON_CLOCK';
    emp.lastLoginAt = new Date().toISOString();

    let barUser = this.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (!barUser) {
      barUser = {
        id: `usr-${emp.id}`,
        name: emp.name,
        email: emp.email,
        phone: emp.phone,
        role: 'BARTENDER',
        restaurantId: emp.restaurantId,
        orgId: rest.orgId,
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
    return { user: barUser, tokens, employee: emp, restaurant: rest };
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  getCurrentRestaurantId(): string | null {
    return this.currentRestaurantId;
  }

  async logout() {
    if (this.currentUser) {
      const userEmail = this.currentUser.email?.toLowerCase();
      const emp = this.employees.find(
        (e) => e.email?.toLowerCase() === userEmail || e.id === this.currentUser?.id?.replace(/^usr-/, '')
      );
      if (emp) {
        emp.status = 'OFF_CLOCK';
      }
    }
    this.currentUser = null;
    this.currentTokens = null;
    this.currentRestaurantId = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
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
      email: restData.email || 'contact@dineflow.com',
      ownerName: restData.ownerName || this.currentUser?.name || 'Restaurant Owner',
      ownerEmail: restData.ownerEmail || this.currentUser?.email || 'owner@restaurant.com',
      domain: `${slug}.dineflow.app`,
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
      if (setupData.businessType) existing.businessType = setupData.businessType;
      if (setupData.hasBar !== undefined) existing.hasBar = setupData.hasBar;
      if (setupData.hasTables !== undefined) existing.hasTables = setupData.hasTables;
      if (setupData.hasKitchen !== undefined) existing.hasKitchen = setupData.hasKitchen;
      if (setupData.hasWaiter !== undefined) existing.hasWaiter = setupData.hasWaiter;
      if (setupData.orderNumberPrefix) existing.orderNumberPrefix = setupData.orderNumberPrefix;
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
      rest.rejectionReason = undefined;
      rest.requestedChanges = undefined;

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
    return rest;
  }

  async getRestaurantDetails(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return null;
    const rest = this.restaurants.find((r) => r.id === targetId && !r.isDeleted);
    if (!rest) return null;
    return this.ensureRestaurantDefaults(rest);
  }

  async getOwnerRestaurants() {
    await delay(100);
    const active = this.restaurants.filter((r) => !r.isDeleted).map((r) => this.ensureRestaurantDefaults(r));
    if (!this.currentUser) return active;
    const email = this.currentUser.email?.toLowerCase();
    const myRests = active.filter(
      (r) => r.ownerEmail?.toLowerCase() === email || r.id === this.currentUser?.restaurantId || r.orgId === this.currentUser?.orgId
    );
    return myRests.length > 0 ? myRests : active;
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
    let items = this.menuItems.filter((m) => m.restaurantId === targetId);
    if (items.length === 0) {
      items = [
        {
          id: `item-${targetId}-1`,
          restaurantId: targetId,
          categoryId: `cat-${targetId}-1`,
          name: 'Artisanal Burrata & Heirloom Tomato',
          description: 'Creamy Puglia burrata, balsamic reduction, basil oil & toasted sourdough.',
          price: 280.00,
          image: 'https://images.unsplash.com/photo-1592417817098-8f3d6ef23a28?w=600',
          isAvailable: true,
          isVegetarian: true,
          dietaryType: 'VEG',
          prepTimeMinutes: 12,
          targetDestination: 'KITCHEN',
        },
        {
          id: `item-${targetId}-2`,
          restaurantId: targetId,
          categoryId: `cat-${targetId}-2`,
          name: 'Wagyu Beef Ribeye Steak (8oz)',
          description: 'A5 Japanese Wagyu steak served with truffle herb butter & roasted asparagus.',
          price: 850.00,
          image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600',
          isAvailable: true,
          isVegetarian: false,
          dietaryType: 'NON_VEG',
          prepTimeMinutes: 20,
          targetDestination: 'KITCHEN',
        },
        {
          id: `item-${targetId}-3`,
          restaurantId: targetId,
          categoryId: `cat-${targetId}-6`,
          name: 'Black Truffle Wild Mushroom Tagliatelle',
          description: 'Handcrafted egg pasta, porcini mushrooms, parmigiano reggiano & black truffle cream.',
          price: 380.00,
          image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281318?w=600',
          isAvailable: true,
          isVegetarian: true,
          dietaryType: 'VEG',
          prepTimeMinutes: 15,
          targetDestination: 'KITCHEN',
        },
        {
          id: `item-${targetId}-4`,
          restaurantId: targetId,
          categoryId: `cat-${targetId}-4`,
          name: 'Wood-Fired Margherita Pizza',
          description: 'San Marzano tomatoes, fresh mozzarella fior di latte & organic Genovese basil.',
          price: 320.00,
          image: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=600',
          isAvailable: true,
          isVegetarian: true,
          dietaryType: 'VEG',
          prepTimeMinutes: 14,
          targetDestination: 'KITCHEN',
        },
        {
          id: `item-${targetId}-5`,
          restaurantId: targetId,
          categoryId: `cat-${targetId}-2`,
          name: 'Pan-Seared Atlantic Salmon',
          description: 'Crispy skin salmon, lemon dill emulsion, saffron quinoa & charred baby carrots.',
          price: 620.00,
          image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600',
          isAvailable: true,
          isVegetarian: false,
          dietaryType: 'NON_VEG',
          prepTimeMinutes: 18,
          targetDestination: 'KITCHEN',
        },
        {
          id: `item-${targetId}-6`,
          restaurantId: targetId,
          categoryId: `cat-${targetId}-3`,
          name: 'Smokey Bacon & Cheddar Gourmet Burger',
          description: 'Prime Angus patty, applewood bacon, aged cheddar & house secret sauce on brioche.',
          price: 350.00,
          image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600',
          isAvailable: true,
          isVegetarian: false,
          dietaryType: 'NON_VEG',
          prepTimeMinutes: 15,
          targetDestination: 'KITCHEN',
        },
      ];
      this.menuItems.push(...items);
      this.saveDatabase();
    }
    return items;
  }

  async getTables(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    const rest = this.restaurants.find((r) => r.id === targetId);
    if (rest?.hasTables === false) {
      return [];
    }
    return (this.tables || []).filter((t) => t.restaurantId === targetId);
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
    let items = this.inventory.filter((i) => i.restaurantId === targetId);
    if (items.length === 0) {
      items = [
        {
          id: `inv-${targetId}-1`,
          restaurantId: targetId,
          name: 'Organic Extra Virgin Olive Oil',
          category: 'Oils & Condiments',
          quantity: 25,
          unit: 'liters',
          minThreshold: 5,
          costPerUnit: 450.00,
          supplierName: 'Verona Imports Ltd.',
          supplierContact: '+91 98765 43210',
          storageLocation: 'Pantry Shelf B2',
          lastRestocked: new Date().toISOString().split('T')[0],
          status: 'IN_STOCK',
        },
        {
          id: `inv-${targetId}-2`,
          restaurantId: targetId,
          name: 'Prime Wagyu Beef Tenderloin',
          category: 'Meat & Poultry',
          quantity: 12,
          unit: 'kg',
          minThreshold: 4,
          costPerUnit: 1200.00,
          supplierName: 'Royal Meats & Co.',
          supplierContact: '+91 98123 45678',
          storageLocation: 'Cold Walk-in Freezer #1',
          lastRestocked: new Date().toISOString().split('T')[0],
          status: 'IN_STOCK',
        },
        {
          id: `inv-${targetId}-3`,
          restaurantId: targetId,
          name: 'Fresh Puglia Burrata & Mozzarella',
          category: 'Dairy & Cheese',
          quantity: 18,
          unit: 'kg',
          minThreshold: 5,
          costPerUnit: 320.00,
          supplierName: 'Milano Artisan Dairy',
          supplierContact: '+91 97654 32109',
          storageLocation: 'Dairy Chiller #2',
          lastRestocked: new Date().toISOString().split('T')[0],
          status: 'IN_STOCK',
        },
        {
          id: `inv-${targetId}-4`,
          restaurantId: targetId,
          name: 'Organic San Marzano Tomatoes',
          category: 'Produce & Herbs',
          quantity: 40,
          unit: 'kg',
          minThreshold: 10,
          costPerUnit: 120.00,
          supplierName: 'Green Earth Organics',
          supplierContact: '+91 96543 21098',
          storageLocation: 'Produce Pantry A1',
          lastRestocked: new Date().toISOString().split('T')[0],
          status: 'IN_STOCK',
        },
      ];
      this.inventory.push(...items);
      this.saveDatabase();
    }
    return items;
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
    const isVeg = itemData.isVegetarian !== undefined ? itemData.isVegetarian : (itemData.dietaryType === 'VEG' || true);
    const newItem: MenuItem = {
      id: `item-${Date.now()}`,
      restaurantId: restId,
      categoryId: itemData.categoryId || 'cat-1',
      name: itemData.name || 'New Item',
      description: itemData.description || '',
      price: itemData.price || 9.99,
      image: itemData.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500',
      isAvailable: itemData.isAvailable !== false,
      isVegetarian: isVeg,
      dietaryType: isVeg ? 'VEG' : 'NON_VEG',
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

  // --- Dedicated Food Category APIs ---
  async getCategories(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    let cats = this.categories.filter((c) => c.restaurantId === targetId);
    if (cats.length === 0) {
      const defaultNames = [
        'Starters & Appetizers',
        'Main Course',
        'Gourmet Burgers',
        'Wood-Fired Pizza',
        'Fresh Salads & Bowls',
        'Pasta & Risotto',
        'Desserts & Sweets',
        'Chef Specials & Combos',
        'Sides & Extras',
        'Beverages & Shakes'
      ];
      cats = defaultNames.map((name, idx) => ({
        id: `cat-${targetId}-${idx + 1}`,
        restaurantId: targetId,
        name,
        order: idx + 1,
        isEnabled: true,
      }));
      this.categories.push(...cats);
      this.saveDatabase();
    }
    return cats.sort((a, b) => (a.order || 0) - (b.order || 0));
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
      const defaultNames = [
        'Beer', 'Wine', 'Whiskey', 'Vodka', 'Rum', 'Gin', 'Brandy',
        'Cocktails', 'Mocktails', 'Champagne', 'Tequila', 'Premium Bottles',
        'Shots', 'Soft Drinks', 'Coffee', 'Signature Drinks'
      ];
      cats = defaultNames.map((name, idx) => ({
        id: `bar-cat-${targetId}-${idx + 1}`,
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
    let items = this.barMenuItems.filter((m) => m.restaurantId === targetId);
    // If venue has no drinks created yet, populate standard craft drink menu defaults
    if (items.length === 0) {
      items = [
        {
          id: `bitem-${targetId}-1`,
          restaurantId: targetId,
          categoryId: 'Cocktails',
          name: 'Smoked Bourbon Old Fashioned',
          description: 'Aged Kentucky bourbon, Angostura bitters, orange peel & smoked oak rosemary infusion.',
          price: 18.50,
          image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600',
          brand: 'Woodford Reserve',
          alcoholPercentage: 45,
          bottleSize: '750ml',
          servingSize: '60ml Peg',
          prepTimeMinutes: 4,
          discountPercentage: 0,
          isFeatured: true,
          isRecommended: true,
          isAvailable: true,
          displayOrder: 1,
          targetDestination: 'BAR',
          isAlcoholic: true,
          servingOptions: ['On the Rocks', 'Neat', 'Soda Mixer'],
        },
        {
          id: `bitem-${targetId}-2`,
          restaurantId: targetId,
          categoryId: 'Cocktails',
          name: 'Empress Botanical Gin Fizz',
          description: 'Empress 1908 indigo gin, fresh yuzu, elderflower liqueur, sparkling tonic & butterfly pea floral foam.',
          price: 16.00,
          image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600',
          brand: 'Empress 1908',
          alcoholPercentage: 42.5,
          bottleSize: '750ml',
          servingSize: 'Highball Glass',
          prepTimeMinutes: 3,
          discountPercentage: 0,
          isFeatured: true,
          isRecommended: true,
          isAvailable: true,
          displayOrder: 2,
          targetDestination: 'BAR',
          isAlcoholic: true,
          servingOptions: ['With Tonic', 'On the Rocks', 'Soda Spritz'],
        },
        {
          id: `bitem-${targetId}-3`,
          restaurantId: targetId,
          categoryId: 'Beer',
          name: 'Hazy Hops Double IPA',
          description: 'Local craft microbrewery double dry-hopped IPA with mango & citrus notes.',
          price: 9.50,
          image: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600',
          brand: 'Hazy Mountain Brew Co',
          alcoholPercentage: 8.2,
          bottleSize: '500ml',
          servingSize: 'Draft Pint',
          prepTimeMinutes: 2,
          discountPercentage: 0,
          isFeatured: false,
          isRecommended: true,
          isAvailable: true,
          displayOrder: 3,
          targetDestination: 'BAR',
          isAlcoholic: true,
          servingOptions: ['Chilled Draft Pint', 'Chilled Can'],
        },
        {
          id: `bitem-${targetId}-4`,
          restaurantId: targetId,
          categoryId: 'Wine',
          name: 'Napa Reserve Cabernet Sauvignon 2019',
          description: 'Rich dark cherry, blackberry, vanilla bean and roasted espresso oak finish.',
          price: 24.00,
          image: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=600',
          brand: 'Napa Estate Reserve',
          alcoholPercentage: 14.5,
          bottleSize: '750ml Bottle',
          servingSize: 'Wine Glass (150ml)',
          prepTimeMinutes: 2,
          discountPercentage: 0,
          isFeatured: true,
          isRecommended: true,
          isAvailable: true,
          displayOrder: 4,
          targetDestination: 'BAR',
          isAlcoholic: true,
          servingOptions: ['Glass (150ml)', 'Full Bottle (750ml)'],
        },
      ];
      this.barMenuItems.push(...items);
      this.saveDatabase();
    }
    return items;
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
    await delay(150);
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = status;
      this.saveDatabase();
    }
    return order;
  }

  async createOrder(orderData: Partial<Order>) {
    await delay(150);
    const restId = this.resolveTenantRestaurantId(orderData.restaurantId) || 'rest-1';
    const rest = this.restaurants.find((r) => r.id === restId);

    const isNoTableFoodTruck = rest?.businessType === 'FOOD_TRUCK' && rest?.hasTables === false;
    const isPickup = isNoTableFoodTruck || orderData.orderType === 'PICKUP' || orderData.tableNumber === 'COUNTER';

    let dest: 'KITCHEN' | 'BAR' | 'MIXED' = orderData.targetDestination || 'KITCHEN';
    if (orderData.items && orderData.items.length > 0) {
      const hasFood = orderData.items.some((i) => i.targetDestination !== 'BAR');
      const hasBar = orderData.items.some((i) => i.targetDestination === 'BAR');
      if (hasFood && hasBar) dest = 'MIXED';
      else if (hasBar) dest = 'BAR';
      else dest = 'KITCHEN';
    }

    const orderSeq = (this.orders.filter((o) => o.restaurantId === restId).length + 101);
    const prefix = isPickup ? (rest?.orderNumberPrefix || 'F') : (rest?.orderNumberPrefix || 'ORD');
    const customOrderId = orderData.id || `${prefix.replace(/#/g, '')}${orderSeq}`;

    const newOrd: Order = {
      id: customOrderId,
      restaurantId: restId,
      tableNumber: isPickup ? 'COUNTER' : (orderData.tableNumber || 'Table 01'),
      orderType: isPickup ? 'PICKUP' : 'DINE_IN',
      customerName: orderData.customerName || 'Guest',
      customerPhone: orderData.customerPhone,
      items: orderData.items || [],
      totalAmount: orderData.totalAmount || 0,
      taxAmount: orderData.taxAmount || 0,
      tipAmount: orderData.tipAmount || 0,
      status: orderData.status || 'PENDING',
      targetDestination: dest,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentStatus: orderData.paymentStatus || 'UNPAID',
      specialInstructions: orderData.specialInstructions,
    };

    this.orders.unshift(newOrd);
    this.saveDatabase();
    realtimeBus.emit('OrderCreated' as any, {
      orderId: newOrd.id,
      restaurantId: restId,
      tableNumber: newOrd.tableNumber,
      data: newOrd,
    });
    return newOrd;
  }

  async getKitchenAnalytics(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    const kitchenOrders = this.orders.filter((o) => o.restaurantId === targetId);
    const completed = kitchenOrders.filter((o) => o.status === 'DELIVERED' || o.status === 'READY');
    return {
      avgPrepTimeMinutes: 14,
      totalOrdersPrepared: completed.length || kitchenOrders.length || 0,
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
    this.customerRequests.push(req as any);
    this.saveDatabase();
    realtimeBus.emit('BillRequested', {
      restaurantId: targetRestId,
      tableNumber,
      data: req,
    });
    return req;
  }

  async callWaiter(tableNumber: string, reason: string, restaurantId?: string) {
    await delay(150);
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
    this.customerRequests.push(req as any);
    this.saveDatabase();
    realtimeBus.emit('WaiterCalled', {
      restaurantId: targetRestId,
      tableNumber,
      data: req,
    });
    return req;
  }

  async createCustomerOrder(orderData: any) {
    await delay(250);
    const restId = this.resolveTenantRestaurantId(orderData.restaurantId) || 'rest-1';
    const newOrder = {
      id: `ord-${Date.now()}`,
      restaurantId: restId,
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
    realtimeBus.emit('OrderCreated' as any, {
      orderId: newOrder.id,
      restaurantId: restId,
      tableNumber: newOrder.tableNumber,
      data: newOrder,
    });
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
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
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
    await delay(100);
    const req = this.customerRequests.find((r) => r.id === reqId);
    if (req) {
      req.status = 'ACCEPTED';
      req.acceptedAt = new Date().toISOString();
      if (waiterName) req.assignedWaiterName = waiterName;
      this.saveDatabase();

      realtimeBus.emit('CustomerRequestUpdated', {
        restaurantId: req.restaurantId,
        tableNumber: req.tableNumber,
        data: req,
      });
    }
    return req;
  }

  async rejectCustomerRequest(reqId: string, waiterName?: string) {
    await delay(100);
    const req = this.customerRequests.find((r) => r.id === reqId);
    if (req) {
      req.status = 'REJECTED';
      this.saveDatabase();

      realtimeBus.emit('CustomerRequestUpdated', {
        restaurantId: req.restaurantId,
        tableNumber: req.tableNumber,
        data: req,
      });
    }
    return req;
  }

  async updateCustomerRequestStatus(reqId: string, status: any, waiterName?: string) {
    await delay(100);
    const req = this.customerRequests.find((r) => r.id === reqId);
    if (req) {
      req.status = status;
      if (waiterName) req.assignedWaiterName = waiterName;
      if (status === 'ACCEPTED') req.acceptedAt = new Date().toISOString();
      if (status === 'COMPLETED') req.completedAt = new Date().toISOString();
      this.saveDatabase();

      realtimeBus.emit('CustomerRequestUpdated', {
        restaurantId: req.restaurantId,
        tableNumber: req.tableNumber,
        data: req,
      });
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
