import { Organization, Restaurant, MenuItem, Order, Table, Employee, InventoryItem, AuditLog, ThemeConfig, User, AuthTokens, CustomerRequest, CustomerRequestStatus, WaiterNotification, ShiftSummaryData, PlatformNotification } from '../types';
import { MOCK_ORGANIZATIONS, MOCK_RESTAURANTS, MOCK_MENU_ITEMS, MOCK_ORDERS, MOCK_TABLES, MOCK_EMPLOYEES, MOCK_INVENTORY, MOCK_AUDIT_LOGS, MOCK_CUSTOMER_REQUESTS, MOCK_CATEGORIES } from '../data/mockData';
import { realtimeBus } from './realtime';

// Simulated API delay helper
const delay = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

const SESSION_STORAGE_KEY = 'dineflow_user_session';

class DineFlowApiClient {
  private organizations: Organization[] = [...MOCK_ORGANIZATIONS];
  private restaurants: Restaurant[] = [...MOCK_RESTAURANTS];
  private menuItems: MenuItem[] = [...MOCK_MENU_ITEMS];
  private orders: Order[] = [...MOCK_ORDERS];
  private tables: Table[] = [...MOCK_TABLES];
  private employees: Employee[] = [...MOCK_EMPLOYEES];
  private inventory: InventoryItem[] = [...MOCK_INVENTORY];
  private auditLogs: AuditLog[] = [...MOCK_AUDIT_LOGS];
  private customerRequests: CustomerRequest[] = [...MOCK_CUSTOMER_REQUESTS];
  
  private platformNotifications: PlatformNotification[] = [
    {
      id: 'pnotif-1',
      recipientRole: 'PLATFORM_ADMIN',
      restaurantId: 'rest-3',
      restaurantName: 'Sakura Omakase Lab',
      title: 'New Restaurant Submitted for Launch',
      message: 'Sakura Omakase Lab completed onboarding setup and is awaiting platform approval.',
      type: 'LAUNCH_REQUESTED',
      timestamp: '10 mins ago',
      isRead: false,
    },
  ];

  private notifications: WaiterNotification[] = [
    {
      id: 'notif-1',
      type: 'KITCHEN_ORDER_READY',
      title: 'Food Plated & Ready',
      message: 'Order #ord-103 for Table 03 is ready at the pass.',
      tableNumber: 'Table 03',
      orderId: 'ord-103',
      timestamp: '2 mins ago',
      isRead: false,
      priority: 'HIGH',
    },
    {
      id: 'notif-2',
      type: 'CUSTOMER_CALL',
      title: 'Waiter Assistance Called',
      message: 'Table 03 requested sparkling water & extra lemon.',
      tableNumber: 'Table 03',
      timestamp: '3 mins ago',
      isRead: false,
      priority: 'URGENT',
    },
  ];

  private users: User[] = [
    {
      id: 'usr-1',
      firstName: 'Elena',
      lastName: 'Rostova',
      name: 'Elena Rostova',
      email: 'elena@gourmethg.com',
      phone: '+1 (415) 892-3011',
      role: 'RESTAURANT_OWNER',
      isEmailVerified: true,
      orgId: 'org-1',
      restaurantId: 'rest-1',
    },
    {
      id: 'usr-2',
      firstName: 'Alex',
      lastName: 'Mercer',
      name: 'Alex Mercer',
      email: 'owner@lumiere.com',
      phone: '+1 (555) 019-2834',
      role: 'RESTAURANT_OWNER',
      isEmailVerified: true,
      orgId: 'org-1',
      restaurantId: 'rest-1',
    },
    {
      id: 'usr-3',
      firstName: 'Marcus',
      lastName: 'Vance',
      name: 'Marcus Vance',
      email: 'marcus@urbaneats.co',
      phone: '+1 (212) 555-0199',
      role: 'RESTAURANT_OWNER',
      isEmailVerified: true,
      orgId: 'org-2',
      restaurantId: 'rest-2',
    },
    {
      id: 'usr-4',
      firstName: 'Kenji',
      lastName: 'Takahashi',
      name: 'Kenji Takahashi',
      email: 'kenji@sakuradining.jp',
      phone: '+81 3-5555-0142',
      role: 'RESTAURANT_OWNER',
      isEmailVerified: true,
      orgId: 'org-3',
      restaurantId: 'rest-3',
    }
  ];

  private currentUser: User | null = null;
  private currentTokens: AuthTokens | null = null;
  private currentRestaurantId: string | null = null;

  constructor() {
    this.restoreSession();
  }

  private restoreSession() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
        if (savedSession) {
          const parsed = JSON.parse(savedSession);
          if (parsed && parsed.user) {
            this.currentUser = parsed.user;
            this.currentTokens = parsed.tokens || null;
            this.currentRestaurantId = parsed.restaurantId || parsed.user.restaurantId || 'rest-1';
            return;
          }
        }
      }
    } catch (e) {
      console.error('Failed to restore session from localStorage', e);
    }

    // Default to Alex Mercer (Lumière Bistro & Bar) if no active session
    this.currentUser = this.users[1];
    this.currentRestaurantId = 'rest-1';
  }

  private saveSession(user: User, tokens: AuthTokens, restaurantId: string) {
    this.currentUser = user;
    this.currentTokens = tokens;
    this.currentRestaurantId = restaurantId;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({
            user,
            tokens,
            restaurantId,
            orgId: user.orgId,
          })
        );
      }
    } catch (e) {
      console.error('Failed to save session to localStorage', e);
    }
  }

  // --- Auth & Session APIs ---

  async loginPlatformAdmin(email: string, password?: string) {
    await delay(300);
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail !== 'admin@dineflow.com' && !normalizedEmail.includes('admin')) {
      throw new Error('Access Denied: This portal is strictly reserved for Platform Administrators. Please use your assigned portal.');
    }

    if (password && password !== 'admin123') {
      throw new Error('Invalid Platform Admin password. Demo password is admin123');
    }

    const adminUser: User = {
      id: 'usr-admin-1',
      firstName: 'Platform',
      lastName: 'Admin',
      name: 'Platform Administrator',
      email: normalizedEmail || 'admin@dineflow.com',
      phone: '+1 800-DINE-FLOW',
      role: 'PLATFORM_ADMIN',
      isEmailVerified: true,
    };

    const tokens: AuthTokens = {
      accessToken: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.df_admin_jwt_${Date.now()}`,
      refreshToken: `df_admin_ref_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    adminUser.tokens = tokens;
    this.saveSession(adminUser, tokens, 'rest-1');

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: 'Platform Administrator',
      action: 'Authenticated Platform Admin Session',
      target: 'DineFlow Control Plane',
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    return { user: adminUser, tokens };
  }

  async loginKitchen(email: string, password?: string) {
    await delay(350);
    const normalizedEmail = email.trim().toLowerCase();

    // Look for employee matching email
    const emp = this.employees.find((e) => e.email.toLowerCase() === normalizedEmail);
    if (!emp) {
      throw new Error('No kitchen staff account found with this email. Please ask your Restaurant Owner to generate your credentials via Staff Management.');
    }

    if (emp.role !== 'CHEF' && emp.role !== 'MANAGER') {
      throw new Error(`Access Denied: Account role is ${emp.role}. Kitchen portal requires CHEF or MANAGER access.`);
    }

    if (emp.isAccountDisabled) {
      throw new Error('Account Disabled: Your staff login has been disabled by the Restaurant Owner. Please contact your manager.');
    }

    // Check password if set
    if (emp.password && password && emp.password !== password && password !== 'kitchen123' && password !== 'chef123') {
      throw new Error('Invalid password. Please check your credentials or request a password reset from your Restaurant Owner.');
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId) || this.restaurants[0];

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
      accessToken: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.df_kitchen_jwt_${emp.id}_${Date.now()}`,
      refreshToken: `df_kitchen_ref_${emp.id}_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    kitchenUser.tokens = tokens;
    emp.lastLoginAt = new Date().toISOString();
    this.saveSession(kitchenUser, tokens, emp.restaurantId);

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: emp.name,
      action: 'Authenticated Kitchen Staff Session',
      target: rest.name,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    return { user: kitchenUser, tokens, employee: emp, restaurant: rest };
  }

  async loginWaiter(email: string, password?: string) {
    await delay(350);
    const normalizedEmail = email.trim().toLowerCase();

    // Look for employee matching email
    const emp = this.employees.find((e) => e.email.toLowerCase() === normalizedEmail);
    if (!emp) {
      throw new Error('No waiter staff account found with this email. Please ask your Restaurant Owner to generate your credentials via Staff Management.');
    }

    if (emp.role !== 'WAITER' && emp.role !== 'HOST' && emp.role !== 'CASHIER' && emp.role !== 'BARTENDER' && emp.role !== 'MANAGER') {
      throw new Error(`Access Denied: Account role is ${emp.role}. Waiter portal requires WAITER, HOST, CASHIER, or BARTENDER access.`);
    }

    if (emp.isAccountDisabled) {
      throw new Error('Account Disabled: Your staff login has been disabled by the Restaurant Owner. Please contact your manager.');
    }

    // Check password if set
    if (emp.password && password && emp.password !== password && password !== 'waiter123') {
      throw new Error('Invalid password. Please check your credentials or request a password reset from your Restaurant Owner.');
    }

    const rest = this.restaurants.find((r) => r.id === emp.restaurantId) || this.restaurants[0];

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
      accessToken: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.df_waiter_jwt_${emp.id}_${Date.now()}`,
      refreshToken: `df_waiter_ref_${emp.id}_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    waiterUser.tokens = tokens;
    emp.lastLoginAt = new Date().toISOString();
    this.saveSession(waiterUser, tokens, emp.restaurantId);

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: emp.name,
      action: 'Authenticated Waiter Terminal Session',
      target: rest.name,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    return { user: waiterUser, tokens, employee: emp, restaurant: rest };
  }

  async loginOwner(email: string, password?: string) {
    await delay(350);
    const normalizedEmail = email.trim().toLowerCase();

    // Find existing user or restaurant matching email
    let user = this.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    let restaurant = this.restaurants.find(
      (r) => r.ownerEmail?.toLowerCase() === normalizedEmail || r.email?.toLowerCase() === normalizedEmail
    );

    if (restaurant && (restaurant.lifecycleStatus === 'SUSPENDED' || restaurant.isDeleted)) {
      throw new Error('This restaurant account is currently suspended by Platform Admin. Access is disabled.');
    }

    // If user doesn't exist but restaurant exists, create user profile
    if (!user && restaurant) {
      user = {
        id: `usr-${Date.now()}`,
        firstName: restaurant.ownerName?.split(' ')[0] || 'Restaurant',
        lastName: restaurant.ownerName?.split(' ')[1] || 'Owner',
        name: restaurant.ownerName || 'Restaurant Owner',
        email: normalizedEmail,
        phone: restaurant.ownerPhone || restaurant.phone,
        role: 'RESTAURANT_OWNER',
        isEmailVerified: true,
        orgId: restaurant.orgId,
        restaurantId: restaurant.id,
      };
      this.users.push(user);
    }

    // If user still doesn't exist, dynamically create a new tenant account & restaurant for this email
    if (!user) {
      const orgId = `org-${Date.now()}`;
      const restId = `rest-${Date.now()}`;
      const nameFromEmail = normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ');
      const cleanName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);

      const newOrg: Organization = {
        id: orgId,
        name: `${cleanName} Dining Group`,
        legalBusinessName: `${cleanName} LLC`,
        gstVatNumber: `TAX-${Math.floor(100000 + Math.random() * 900000)}`,
        country: 'United States',
        currency: 'USD ($)',
        timezone: 'America/Los_Angeles (PST)',
        businessAddress: '100 Main St, San Francisco, CA',
        contactNumber: '+1 555-0100',
        supportEmail: normalizedEmail,
        slug: cleanName.toLowerCase().replace(/\s+/g, '-'),
        plan: 'STARTER',
        status: 'ACTIVE',
        restaurantsCount: 1,
        monthlyRevenue: 0,
        createdAt: new Date().toISOString().split('T')[0],
        ownerName: cleanName,
        ownerEmail: normalizedEmail,
      };
      this.organizations.unshift(newOrg);

      user = {
        id: `usr-${Date.now()}`,
        firstName: cleanName,
        lastName: 'Owner',
        name: cleanName,
        email: normalizedEmail,
        phone: '+1 555-0100',
        role: 'RESTAURANT_OWNER',
        isEmailVerified: true,
        orgId,
        restaurantId: restId,
      };
      this.users.push(user);

      // Create new restaurant record for this user
      restaurant = {
        id: restId,
        orgId,
        name: `${cleanName} Restaurant`,
        slug: cleanName.toLowerCase().replace(/\s+/g, '-'),
        cuisine: 'Modern Fusion',
        restaurantType: 'Casual Dining',
        description: `Signature dining by ${cleanName}.`,
        address: '100 Main St, San Francisco, CA 94105',
        city: 'San Francisco',
        state: 'CA',
        country: 'United States',
        phone: '+1 555-0100',
        email: normalizedEmail,
        website: `https://${cleanName.toLowerCase().replace(/\s+/g, '-')}.dineflow.app`,
        gstNumber: 'GST-1029384',
        taxPercentage: 8.5,
        openingHours: '10:00 AM',
        closingHours: '10:00 PM',
        currency: 'USD ($)',
        timezone: 'America/Los_Angeles (PST)',
        indoorTablesCount: 10,
        outdoorTablesCount: 4,
        vipTablesCount: 2,
        tablesCount: 16,
        isApproved: false,
        status: 'CLOSED',
        lifecycleStatus: 'DRAFT',
        rating: 5.0,
        activeOrdersCount: 0,
        domain: `${cleanName.toLowerCase().replace(/\s+/g, '-')}.dineflow.app`,
        ownerName: cleanName,
        ownerEmail: normalizedEmail,
        ownerPhone: '+1 555-0100',
        theme: {
          restaurantId: restId,
          restaurantName: `${cleanName} Restaurant`,
          logo: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
          bannerUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
          primaryColor: '#e11d48',
          secondaryColor: '#475569',
          accentColor: '#f59e0b',
          backgroundColor: '#f8fafc',
          textColor: '#0f172a',
          fontFamily: 'sans',
          borderRadius: 'lg',
        },
      };
      this.restaurants.unshift(restaurant);

      // Seed isolated data for this new restaurant
      this.seedIsolatedTenantData(restId, `${cleanName} Restaurant`);
    } else if (!restaurant) {
      restaurant = this.restaurants.find((r) => r.id === user?.restaurantId) || this.restaurants[0];
    }

    const restaurantId = restaurant.id;
    const orgId = user.orgId || restaurant.orgId;

    // Generate JWT Access Token with user, org, restaurant, branch, and role payload
    const tokens: AuthTokens = {
      accessToken: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.df_jwt_${user.id}_${orgId}_${restaurantId}_main_branch_${user.role}_${Date.now()}`,
      refreshToken: `df_ref_${user.id}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    user.tokens = tokens;
    user.restaurantId = restaurantId;
    user.orgId = orgId;

    this.saveSession(user, tokens, restaurantId);

    // Record audit log
    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: user.name,
      action: `Authenticated Owner Session & Issued JWT (${user.role})`,
      target: restaurant.name,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    const organization = this.organizations.find((o) => o.id === orgId) || this.organizations[0];

    return {
      user,
      tokens,
      restaurant,
      organization,
    };
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  getCurrentRestaurant(): Restaurant {
    const targetId = this.currentRestaurantId || this.currentUser?.restaurantId;
    return this.restaurants.find((r) => r.id === targetId) || this.restaurants[0];
  }

  async logout() {
    await delay(100);
    this.currentUser = null;
    this.currentTokens = null;
    this.currentRestaurantId = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to clear session', e);
    }
  }

  switchActiveRestaurant(restaurantId: string) {
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      this.currentRestaurantId = rest.id;
      if (this.currentUser) {
        this.currentUser.restaurantId = rest.id;
        if (this.currentTokens) {
          this.saveSession(this.currentUser, this.currentTokens, rest.id);
        }
      }
    }
    return rest;
  }

  async getOwnerRestaurants(): Promise<Restaurant[]> {
    await delay(100);
    if (!this.currentUser) return [...this.restaurants];
    if (this.currentUser.role === 'PLATFORM_ADMIN' || this.currentUser.role === 'SUPER_ADMIN') {
      return [...this.restaurants];
    }
    const orgId = this.currentUser.orgId;
    const userEmail = this.currentUser.email?.toLowerCase();
    
    // Return restaurants matching user's orgId OR ownerEmail, or all if none matched
    const matched = this.restaurants.filter(
      (r) => (orgId && r.orgId === orgId) || (userEmail && r.ownerEmail?.toLowerCase() === userEmail)
    );

    return matched.length > 0 ? matched : [...this.restaurants];
  }

  async createNewBranchOutlet(branchData: {
    name: string;
    cuisine?: string;
    address?: string;
    phone?: string;
    city?: string;
    branchName?: string;
  }): Promise<Restaurant> {
    await delay(300);
    const id = `rest-${Date.now()}`;
    const slug = branchData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const currentRest = this.getCurrentRestaurant();

    const newBranch: Restaurant = {
      id,
      orgId: this.currentUser?.orgId || currentRest?.orgId || 'org-1',
      name: branchData.name,
      slug,
      cuisine: branchData.cuisine || currentRest?.cuisine || 'Modern Dining',
      restaurantType: currentRest?.restaurantType || 'Casual Dining',
      description: `New outlet branch location for ${branchData.name}.`,
      address: branchData.address || '200 Main Marketplace, San Francisco, CA',
      city: branchData.city || 'San Francisco',
      state: currentRest?.state || 'California',
      country: currentRest?.country || 'United States',
      phone: branchData.phone || '+1 555-0188',
      email: this.currentUser?.email || 'branch@lumiere.com',
      website: `https://${slug}.dineflow.app`,
      gstNumber: currentRest?.gstNumber || 'US-GST-881204',
      taxPercentage: currentRest?.taxPercentage || 8.5,
      openingHours: '10:00 AM',
      closingHours: '11:00 PM',
      currency: currentRest?.currency || 'USD ($)',
      timezone: currentRest?.timezone || 'America/Los_Angeles (PST)',
      branchName: branchData.branchName || `${branchData.city || 'Branch'} Outlet`,
      indoorTablesCount: 10,
      outdoorTablesCount: 4,
      vipTablesCount: 2,
      tablesCount: 16,
      isApproved: true,
      status: 'OPEN',
      lifecycleStatus: 'LIVE',
      rating: 5.0,
      activeOrdersCount: 2,
      domain: `${slug}.dineflow.app`,
      ownerName: this.currentUser?.name || currentRest?.ownerName || 'Restaurant Owner',
      ownerEmail: this.currentUser?.email || currentRest?.ownerEmail || 'owner@lumiere.com',
      theme: {
        restaurantId: id,
        restaurantName: branchData.name,
        logo: currentRest?.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
        bannerUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
        primaryColor: '#0284c7', // Sky Blue for branch distinction
        secondaryColor: '#475569',
        accentColor: '#f59e0b',
        backgroundColor: '#f8fafc',
        textColor: '#0f172a',
        fontFamily: 'sans',
        borderRadius: 'lg',
      },
    };

    this.restaurants.unshift(newBranch);
    this.seedIsolatedTenantData(id, branchData.name);
    this.switchActiveRestaurant(id);

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: this.currentUser?.name || 'Restaurant Owner',
      action: 'Created New Restaurant Branch Outlet',
      target: branchData.name,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    return newBranch;
  }

  // Helper to seed clean isolated dataset for a new tenant restaurant
  private seedIsolatedTenantData(restaurantId: string, restaurantName: string) {
    // Categories
    const cat1 = `cat-${restaurantId}-1`;
    const cat2 = `cat-${restaurantId}-2`;
    const cat3 = `cat-${restaurantId}-3`;

    // Add categories
    MOCK_CATEGORIES.push(
      { id: cat1, restaurantId, name: 'Chef Specialties', order: 1, icon: 'Sparkles' },
      { id: cat2, restaurantId, name: 'Main Dishes', order: 2, icon: 'UtensilsCrossed' },
      { id: cat3, restaurantId, name: 'Beverages', order: 3, icon: 'Wine' }
    );

    // Add menu items for this restaurant only
    this.menuItems.push(
      {
        id: `item-${restaurantId}-1`,
        restaurantId,
        categoryId: cat1,
        name: `${restaurantName} House Special`,
        description: 'Pan-seared signature fillet with seasonal herb butter & rustic mashed potatoes.',
        price: 34.00,
        image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
        calories: 620,
        prepTimeMinutes: 18,
      },
      {
        id: `item-${restaurantId}-2`,
        restaurantId,
        categoryId: cat2,
        name: 'Artisanal Pasta Delight',
        description: 'Fresh hand-made egg pasta tossed in truffle cream sauce & shaved parmesan.',
        price: 26.50,
        image: 'https://images.unsplash.com/photo-1621996346565-e3def6164286?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
        isVegetarian: true,
        calories: 540,
        prepTimeMinutes: 14,
      },
      {
        id: `item-${restaurantId}-3`,
        restaurantId,
        categoryId: cat3,
        name: 'Craft Botanical Refresher',
        description: 'House-infused berry elixir with fresh mint, lime, and sparkling soda.',
        price: 12.00,
        image: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80',
        isAvailable: true,
        calories: 140,
        prepTimeMinutes: 4,
      }
    );

    // Add tables for this restaurant only
    this.tables.push(
      { id: `tbl-${restaurantId}-1`, restaurantId, tableNumber: 'Table 01', capacity: 2, status: 'AVAILABLE', qrCodeUrl: `https://dineflow.com/qr/${restaurantId}/tbl-1` },
      { id: `tbl-${restaurantId}-2`, restaurantId, tableNumber: 'Table 02', capacity: 4, status: 'AVAILABLE', qrCodeUrl: `https://dineflow.com/qr/${restaurantId}/tbl-2` },
      { id: `tbl-${restaurantId}-3`, restaurantId, tableNumber: 'Table 03', capacity: 6, status: 'AVAILABLE', qrCodeUrl: `https://dineflow.com/qr/${restaurantId}/tbl-3` },
      { id: `tbl-${restaurantId}-4`, restaurantId, tableNumber: 'VIP Booth 01', capacity: 8, status: 'AVAILABLE', qrCodeUrl: `https://dineflow.com/qr/${restaurantId}/tbl-4`, isVip: true }
    );

    // Add employees for this restaurant only
    this.employees.push(
      { id: `emp-${restaurantId}-1`, restaurantId, name: `${restaurantName} Head Chef`, role: 'CHEF', email: `chef@${restaurantId}.com`, phone: '+1 555-0199', status: 'ON_CLOCK', hourlyRate: 32.00, shift: 'Full Day', assignedSection: 'Kitchen Pass' },
      { id: `emp-${restaurantId}-2`, restaurantId, name: `${restaurantName} Floor Manager`, role: 'MANAGER', email: `manager@${restaurantId}.com`, phone: '+1 555-0198', status: 'ON_CLOCK', hourlyRate: 28.00, shift: 'Full Day', assignedSection: 'Front Floor' }
    );

    // Add inventory for this restaurant only
    this.inventory.push(
      { id: `inv-${restaurantId}-1`, restaurantId, name: 'Prime Choice Cuts', category: 'Raw Meat', quantity: 20, unit: 'kg', minThreshold: 5, costPerUnit: 24.00, lastRestocked: new Date().toISOString().split('T')[0], status: 'IN_STOCK', supplierName: 'Local Farm Fresh', storageLocation: 'Chilled Storage' },
      { id: `inv-${restaurantId}-2`, restaurantId, name: 'Organic Fresh Produce', category: 'Vegetables', quantity: 35, unit: 'kg', minThreshold: 10, costPerUnit: 6.50, lastRestocked: new Date().toISOString().split('T')[0], status: 'IN_STOCK', supplierName: 'Green Valley Produce', storageLocation: 'Produce Pantry' }
    );
  }

  // --- Auth & Organization Setup APIs ---

  async registerOwner(data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
  }) {
    await delay(350);
    const normalizedEmail = data.email.toLowerCase();
    const existing = this.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      throw new Error('An account with this email address already exists.');
    }

    const newUser: User = {
      id: `usr-${Date.now()}`,
      firstName: data.firstName,
      lastName: data.lastName,
      name: `${data.firstName} ${data.lastName}`,
      email: data.email,
      phone: data.phone,
      role: 'RESTAURANT_OWNER',
      isEmailVerified: false,
    };
    this.users.push(newUser);

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: newUser.name,
      action: 'Registered Owner Account',
      target: 'Auth System',
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    return {
      user: newUser,
      verificationCodeSent: true,
      message: 'Account created. Verification code dispatched to email.',
    };
  }

  async verifyOwnerEmail(email: string, code: string) {
    await delay(350);
    const user = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      throw new Error('User record not found.');
    }

    user.isEmailVerified = true;

    // Login user automatically after verification
    return this.loginOwner(email);
  }

  async createOrganization(orgData: {
    name: string;
    legalBusinessName: string;
    gstVatNumber?: string;
    country: string;
    currency: string;
    timezone: string;
    businessAddress: string;
    contactNumber: string;
    supportEmail: string;
    ownerEmail: string;
    ownerName: string;
  }) {
    await delay(350);
    const slug = orgData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const newOrg: Organization = {
      id: `org-${Date.now()}`,
      name: orgData.name,
      legalBusinessName: orgData.legalBusinessName || orgData.name,
      gstVatNumber: orgData.gstVatNumber || 'PENDING-TAX-ID',
      country: orgData.country,
      currency: orgData.currency,
      timezone: orgData.timezone,
      businessAddress: orgData.businessAddress,
      contactNumber: orgData.contactNumber,
      supportEmail: orgData.supportEmail,
      slug,
      plan: 'FREE_TRIAL',
      status: 'ACTIVE',
      restaurantsCount: 1,
      monthlyRevenue: 0,
      createdAt: new Date().toISOString().split('T')[0],
      ownerName: orgData.ownerName,
      ownerEmail: orgData.ownerEmail,
    };

    this.organizations.unshift(newOrg);

    const owner = this.users.find((u) => u.email.toLowerCase() === orgData.ownerEmail.toLowerCase());
    if (owner) {
      owner.orgId = newOrg.id;
    }

    return newOrg;
  }

  // --- Platform Admin & Verification APIs ---

  async getPlatformStats() {
    await delay(100);
    const activeTenants = this.organizations.filter((o) => o.status === 'ACTIVE').length;
    const liveRestaurants = this.restaurants.filter((r) => r.isApproved || r.lifecycleStatus === 'LIVE').length;
    const pendingApprovals = this.restaurants.filter((r) => r.lifecycleStatus === 'PENDING_APPROVAL' || !r.isApproved).length;

    return {
      activeTenants,
      liveRestaurants,
      pendingApprovals,
      totalOrdersProcessed: 142850,
      systemUptimePercent: 99.99,
    };
  }

  async getOrganizations() {
    await delay(100);
    return [...this.organizations];
  }

  async getPendingRestaurants() {
    await delay(100);
    return this.restaurants.filter((r) => r.lifecycleStatus === 'PENDING_APPROVAL' || !r.isApproved);
  }

  async getAllRestaurants() {
    await delay(100);
    return [...this.restaurants];
  }

  async createRestaurantForOwner(restData: {
    name: string;
    cuisine?: string;
    address?: string;
    phone?: string;
    email?: string;
    ownerName?: string;
    ownerEmail?: string;
    theme?: any;
  }) {
    await delay(250);
    const id = `rest-${Date.now()}`;
    const slug = restData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const newRest: Restaurant = {
      id,
      orgId: this.currentUser?.orgId || `org-${Date.now()}`,
      name: restData.name,
      slug,
      cuisine: restData.cuisine || 'Multi-Cuisine',
      address: restData.address || 'Main Street Center',
      phone: restData.phone || '+1 555-0100',
      email: restData.email || 'contact@dineflow.com',
      ownerName: restData.ownerName || this.currentUser?.name || 'Restaurant Owner',
      ownerEmail: restData.ownerEmail || this.currentUser?.email || 'owner@dineflow.com',
      domain: `${slug}.dineflow.app`,
      isApproved: false,
      lifecycleStatus: 'DRAFT',
      status: 'OPEN',
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
    };

    this.restaurants.unshift(newRest);
    this.currentRestaurantId = id;
    this.seedIsolatedTenantData(id, restData.name);
    if (this.currentUser && this.currentTokens) {
      this.saveSession(this.currentUser, this.currentTokens, id);
    }
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
      existing.description = setupData.description || existing.description;
      existing.address = setupData.address || existing.address;
      existing.city = setupData.city || existing.city;
      existing.state = setupData.state || existing.state;
      existing.country = setupData.country || existing.country;
      existing.phone = setupData.phone || existing.phone;
      existing.email = setupData.email || existing.email;
      existing.website = setupData.website || existing.website;
      existing.gstNumber = setupData.gstNumber || existing.gstNumber;
      existing.taxPercentage = setupData.taxPercentage ? parseFloat(setupData.taxPercentage) : existing.taxPercentage;
      existing.openingHours = setupData.openingHours || existing.openingHours;
      existing.closingHours = setupData.closingHours || existing.closingHours;
      existing.currency = setupData.currency || existing.currency;
      existing.timezone = setupData.timezone || existing.timezone;
      existing.indoorTablesCount = setupData.tables?.indoor || setupData.indoorTables || existing.indoorTablesCount;
      existing.outdoorTablesCount = setupData.tables?.outdoor || setupData.outdoorTables || existing.outdoorTablesCount;
      existing.vipTablesCount = setupData.tables?.vip || setupData.vipTables || existing.vipTablesCount;
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
        title: 'Launch Request Submitted',
        message: `${existing.name} completed restaurant configuration and requested platform launch approval.`,
        type: 'LAUNCH_REQUESTED',
        timestamp: 'Just now',
        isRead: false,
      });

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: existing.ownerName || this.currentUser?.name || 'Restaurant Owner',
        action: 'Submitted Restaurant for Launch Approval',
        target: existing.name,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });

      return existing;
    } else {
      const slug = (setupData.restaurantName || 'new-restaurant').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const newRestId = `rest-${Date.now()}`;
      const newRest: Restaurant = {
        id: newRestId,
        orgId: this.currentUser?.orgId || 'org-1',
        name: setupData.restaurantName || 'New Restaurant',
        slug,
        cuisine: setupData.cuisine || 'Multi-Cuisine',
        restaurantType: setupData.restaurantType || 'Casual Dining',
        description: setupData.description || 'Modern restaurant powered by DineFlow Cloud.',
        address: setupData.address || '100 Main St, San Francisco, CA',
        city: setupData.city || 'San Francisco',
        state: setupData.state || 'CA',
        country: setupData.country || 'United States',
        phone: setupData.phone || '+1 555-0100',
        email: setupData.email || this.currentUser?.email || 'owner@restaurant.com',
        website: setupData.website || `https://${slug}.dineflow.app`,
        gstNumber: setupData.gstNumber || 'GST-1029384',
        taxPercentage: setupData.taxPercentage ? parseFloat(setupData.taxPercentage) : 8.5,
        openingHours: setupData.openingHours || '09:00 AM',
        closingHours: setupData.closingHours || '10:00 PM',
        currency: setupData.currency || 'USD ($)',
        timezone: setupData.timezone || 'America/Los_Angeles (PST)',
        indoorTablesCount: setupData.tables?.indoor || 10,
        outdoorTablesCount: setupData.tables?.outdoor || 4,
        vipTablesCount: setupData.tables?.vip || 2,
        tablesCount: (setupData.tables?.indoor || 10) + (setupData.tables?.outdoor || 4) + (setupData.tables?.vip || 2),
        isApproved: false,
        status: 'CLOSED',
        lifecycleStatus: 'PENDING_APPROVAL',
        rating: 5.0,
        activeOrdersCount: 0,
        domain: `${slug}.dineflow.app`,
        ownerName: this.currentUser?.name || setupData.ownerName || 'Restaurant Owner',
        ownerEmail: this.currentUser?.email || setupData.ownerEmail || 'owner@restaurant.com',
        submittedAt: now,
        theme: {
          restaurantId: newRestId,
          restaurantName: setupData.restaurantName || 'New Restaurant',
          logo: setupData.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80',
          bannerUrl: setupData.theme?.banner || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
          primaryColor: setupData.theme?.primaryColor || '#e11d48',
          secondaryColor: setupData.theme?.secondaryColor || '#475569',
          accentColor: '#f59e0b',
          backgroundColor: '#f8fafc',
          textColor: '#0f172a',
          fontFamily: 'sans',
          borderRadius: 'lg',
        },
      };

      this.restaurants.unshift(newRest);
      this.currentRestaurantId = newRest.id;
      if (this.currentUser) {
        this.currentUser.restaurantId = newRest.id;
      }

      this.seedIsolatedTenantData(newRest.id, newRest.name);

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'PLATFORM_ADMIN',
        restaurantId: newRest.id,
        restaurantName: newRest.name,
        title: 'New Restaurant Submitted for Launch',
        message: `${newRest.name} completed setup wizard and is awaiting platform approval.`,
        type: 'LAUNCH_REQUESTED',
        timestamp: 'Just now',
        isRead: false,
      });

      return newRest;
    }
  }

  async resubmitRestaurantLaunch(restaurantId: string) {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      rest.lifecycleStatus = 'PENDING_APPROVAL';
      rest.isApproved = false;
      rest.rejectionReason = undefined;
      rest.requestedChanges = undefined;
      rest.submittedAt = now;

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'PLATFORM_ADMIN',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: 'Launch Request Resubmitted',
        message: `${rest.name} has updated configuration and resubmitted launch application.`,
        type: 'RESUBMITTED',
        timestamp: 'Just now',
        isRead: false,
      });
    }
    return rest;
  }

  async approveRestaurant(restaurantId: string) {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      const now = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      rest.isApproved = true;
      rest.status = 'OPEN';
      rest.lifecycleStatus = 'LIVE';
      rest.approvedAt = now;

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: 'Congratulations! Your Restaurant is Live',
        message: 'Your restaurant setup has been verified and approved by DineFlow Cloud. Your live Restaurant Operating System and Customer QR Ordering are now active!',
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
    }
    return rest;
  }

  async rejectRestaurant(restaurantId: string, reason: string) {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.isApproved = false;
      rest.lifecycleStatus = 'REJECTED';
      rest.rejectionReason = reason;

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: 'Launch Application Not Approved',
        message: `Your launch application was declined with the following reason: "${reason}". Please update details and click Resubmit.`,
        type: 'REJECTED',
        timestamp: 'Just now',
        isRead: false,
      });
    }
    return rest;
  }

  async requestChangesRestaurant(restaurantId: string, requestedChanges: string) {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.isApproved = false;
      rest.lifecycleStatus = 'CHANGES_REQUESTED';
      rest.requestedChanges = requestedChanges;

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: 'Action Required: Modification Requested',
        message: `Our review team requires the following modifications before activating your restaurant: "${requestedChanges}".`,
        type: 'CHANGES_REQUESTED',
        timestamp: 'Just now',
        isRead: false,
      });
    }
    return rest;
  }

  async activateRestaurant(restaurantId: string) {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.isApproved = true;
      rest.lifecycleStatus = 'LIVE';
      rest.status = 'OPEN';
      rest.isDeleted = false;

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: 'Restaurant Status: Activated',
        message: 'Your restaurant has been activated by Platform Admin. Customer ordering and OS dashboards are now operational.',
        type: 'APPROVED',
        timestamp: 'Just now',
        isRead: false,
      });

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: 'Platform Admin',
        action: 'Activated Restaurant Account',
        target: rest.name,
        timestamp: 'Just now',
        ipAddress: '10.0.0.1',
        status: 'SUCCESS',
      });
    }
    return rest;
  }

  async deactivateRestaurant(restaurantId: string, reason = 'Deactivated by Platform Administrator') {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.lifecycleStatus = 'DEACTIVATED';
      rest.status = 'CLOSED';

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title: 'Restaurant Status: Deactivated',
        message: `Your restaurant has been set to inactive: "${reason}". Customer ordering website is temporarily disabled.`,
        type: 'CHANGES_REQUESTED',
        timestamp: 'Just now',
        isRead: false,
      });

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: 'Platform Admin',
        action: 'Deactivated Restaurant Outlet',
        target: rest.name,
        timestamp: 'Just now',
        ipAddress: '10.0.0.1',
        status: 'SUCCESS',
      });
    }
    return rest;
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

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: 'Platform Admin',
        action: 'Suspended Restaurant Account',
        target: rest.name,
        timestamp: 'Just now',
        ipAddress: '10.0.0.1',
        status: 'SUCCESS',
      });
    }
    return rest;
  }

  async archiveRestaurant(restaurantId: string) {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.lifecycleStatus = 'ARCHIVED';
      rest.status = 'CLOSED';
    }
    return rest;
  }

  async deleteRestaurant(restaurantId: string) {
    await delay(300);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.lifecycleStatus = 'DELETED';
      rest.isDeleted = true;
      rest.status = 'CLOSED';

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: 'Platform Admin',
        action: 'Soft-Deleted Restaurant Record',
        target: rest.name,
        timestamp: 'Just now',
        ipAddress: '10.0.0.1',
        status: 'SUCCESS',
      });
    }
    return rest;
  }

  async sendReminder(restaurantId: string, reminderType: string, customMessage?: string) {
    await delay(250);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      const titles: Record<string, string> = {
        'PAYMENT': 'Payment Reminder',
        'PROFILE': 'Restaurant Profile Incomplete',
        'MENU': 'Update Menu & Pricing',
        'LOGO': 'Upload High-Res Logo',
        'SUBSCRIPTION': 'Subscription Plan Renewal Reminder',
        'ANNOUNCEMENT': 'Platform Announcement',
      };

      const title = titles[reminderType] || reminderType || 'Platform Reminder';
      const msg = customMessage || `Action requested from Platform Administrator for ${rest.name}. Please review your restaurant configuration.`;

      this.platformNotifications.unshift({
        id: `pnotif-${Date.now()}`,
        recipientRole: 'RESTAURANT_OWNER',
        restaurantId: rest.id,
        restaurantName: rest.name,
        title,
        message: msg,
        type: 'CHANGES_REQUESTED',
        timestamp: 'Just now',
        isRead: false,
      });
    }
    return { success: true, restaurantId, reminderType };
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

  private resolveTenantRestaurantId(providedId?: string): string {
    if (providedId) return providedId;
    if (this.currentRestaurantId) return this.currentRestaurantId;
    if (this.currentUser?.restaurantId) return this.currentUser.restaurantId;
    return 'rest-1';
  }

  async getRestaurantDetails(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    return this.restaurants.find((r) => r.id === targetId) || this.restaurants[0];
  }

  async updateRestaurantTheme(restaurantId: string, theme: ThemeConfig) {
    await delay(150);
    const rest = this.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.theme = theme;
      if (theme.currency) {
        rest.currency = theme.currency;
      }
    }
    return theme;
  }

  async getOrders(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    return this.orders.filter((o) => o.restaurantId === targetId);
  }

  async updateOrderStatus(orderId: string, status: Order['status']) {
    await delay(150);
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = status;
      order.updatedAt = new Date().toISOString();
    }
    return order;
  }

  async getMenuItems(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    return this.menuItems.filter((m) => m.restaurantId === targetId);
  }

  async addMenuItem(item: Omit<MenuItem, 'id'>) {
    await delay(150);
    const targetId = item.restaurantId || this.resolveTenantRestaurantId();
    const newItem: MenuItem = {
      ...item,
      restaurantId: targetId,
      id: `item-${Date.now()}`,
    };
    this.menuItems.push(newItem);
    return newItem;
  }

  async toggleMenuItemAvailability(itemId: string) {
    await delay(100);
    const item = this.menuItems.find((m) => m.id === itemId);
    if (item) {
      item.isAvailable = !item.isAvailable;
    }
    return item;
  }

  async updateMenuItem(itemId: string, updates: Partial<MenuItem>) {
    await delay(150);
    const index = this.menuItems.findIndex((m) => m.id === itemId);
    if (index !== -1) {
      this.menuItems[index] = { ...this.menuItems[index], ...updates };
      return this.menuItems[index];
    }
    return null;
  }

  async deleteMenuItem(itemId: string) {
    await delay(100);
    this.menuItems = this.menuItems.filter((m) => m.id !== itemId);
    return { success: true };
  }

  async getTables(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    return this.tables.filter((t) => t.restaurantId === targetId);
  }

  async createTable(tableData: {
    tableNumber: string;
    capacity: number;
    section?: string;
    shape?: 'SQUARE' | 'ROUND' | 'RECTANGLE';
    isVip?: boolean;
    restaurantId?: string;
  }): Promise<Table> {
    await delay(150);
    const targetRestId = tableData.restaurantId || this.resolveTenantRestaurantId();
    const id = `tbl-${Date.now()}`;
    const newTable: Table = {
      id,
      restaurantId: targetRestId,
      tableNumber: tableData.tableNumber,
      capacity: tableData.capacity || 4,
      section: tableData.section || 'Main Hall',
      shape: tableData.shape || 'RECTANGLE',
      status: 'AVAILABLE',
      isVip: tableData.isVip || false,
      qrCodeUrl: `https://dineflow.com/qr/${targetRestId}/${id}`,
    };

    this.tables.push(newTable);
    
    // Audit log
    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: this.currentUser?.name || 'Restaurant Owner',
      action: 'Created Floor Plan Table',
      target: newTable.tableNumber,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    realtimeBus.publish('table:created' as any, { table: newTable, restaurantId: targetRestId });
    return newTable;
  }

  async updateTable(tableId: string, updates: Partial<Table>): Promise<Table | null> {
    await delay(150);
    const tableIndex = this.tables.findIndex((t) => t.id === tableId);
    if (tableIndex !== -1) {
      this.tables[tableIndex] = { ...this.tables[tableIndex], ...updates };
      const updated = this.tables[tableIndex];

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: this.currentUser?.name || 'Restaurant Owner',
        action: 'Updated Table Configuration',
        target: updated.tableNumber,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });

      realtimeBus.publish('table:updated' as any, { table: updated, restaurantId: updated.restaurantId });
      return updated;
    }
    return null;
  }

  async deleteTable(tableId: string): Promise<{ success: boolean }> {
    await delay(150);
    const targetTable = this.tables.find((t) => t.id === tableId);
    if (targetTable) {
      this.tables = this.tables.filter((t) => t.id !== tableId);
      realtimeBus.publish('table:deleted' as any, { tableId, restaurantId: targetTable.restaurantId });
      return { success: true };
    }
    return { success: false };
  }

  async mergeTables(tableIds: string[], customLabel?: string): Promise<{ success: boolean; mergedTables: Table[] }> {
    await delay(200);
    if (tableIds.length < 2) return { success: false, mergedTables: [] };

    const selectedTables = this.tables.filter((t) => tableIds.includes(t.id));
    if (selectedTables.length < 2) return { success: false, mergedTables: [] };

    const tableNumbers = selectedTables.map((t) => t.tableNumber);
    const totalCapacity = selectedTables.reduce((sum, t) => sum + t.capacity, 0);
    const groupLabel = customLabel || `Merged Group (${tableNumbers.join(' + ')}) [Cap: ${totalCapacity}]`;
    const primaryId = selectedTables[0].id;
    const targetRestId = selectedTables[0].restaurantId;

    selectedTables.forEach((t) => {
      t.status = 'MERGED';
      t.isMerged = true;
      t.mergedWithIds = tableIds.filter((id) => id !== t.id);
      t.mergedTableNumbers = tableNumbers;
      t.mergedGroupLabel = groupLabel;
      if (t.id !== primaryId) {
        t.parentMergedTableId = primaryId;
      }
    });

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: this.currentUser?.name || 'Restaurant Owner',
      action: 'Merged Tables for Large Gathering',
      target: groupLabel,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    // Notify Waiters & Kitchen via Notification
    this.notifications.unshift({
      id: `notif-${Date.now()}`,
      type: 'CUSTOMER_CALL',
      title: '🔗 Tables Merged for Gathering',
      message: `${groupLabel} has been merged and is ready for seating/service.`,
      tableNumber: tableNumbers.join(' + '),
      timestamp: 'Just now',
      isRead: false,
      priority: 'HIGH',
    });

    realtimeBus.publish('table:merged' as any, { tableIds, groupLabel, restaurantId: targetRestId });
    return { success: true, mergedTables: selectedTables };
  }

  async unmergeTables(tableIds: string[]): Promise<{ success: boolean }> {
    await delay(200);
    const selectedTables = this.tables.filter((t) => tableIds.includes(t.id) || (t.mergedWithIds && t.mergedWithIds.some(id => tableIds.includes(id))));
    if (selectedTables.length === 0) return { success: false };

    const targetRestId = selectedTables[0].restaurantId;

    selectedTables.forEach((t) => {
      t.status = 'AVAILABLE';
      t.isMerged = false;
      delete t.mergedWithIds;
      delete t.mergedTableNumbers;
      delete t.parentMergedTableId;
      delete t.mergedGroupLabel;
    });

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: this.currentUser?.name || 'Restaurant Owner',
      action: 'Unmerged Tables',
      target: selectedTables.map(t => t.tableNumber).join(', '),
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    realtimeBus.publish('table:unmerged' as any, { tableIds, restaurantId: targetRestId });
    return { success: true };
  }

  async reserveTable(tableId: string, reservation: {
    reservedForName: string;
    reservedForPhone?: string;
    reservationTime: string;
    partySize: number;
    notes?: string;
  }): Promise<Table | null> {
    await delay(150);
    const table = this.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'RESERVED';
      table.reservationDetails = {
        ...reservation,
        reservedAt: 'Just now',
        reservedBy: this.currentUser?.name || 'Restaurant Owner',
      };

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: this.currentUser?.name || 'Restaurant Owner',
        action: 'Reserved Table',
        target: `${table.tableNumber} for ${reservation.reservedForName}`,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });

      realtimeBus.publish('table:reserved' as any, { table, restaurantId: table.restaurantId });
      return table;
    }
    return null;
  }

  async cancelTableReservation(tableId: string): Promise<Table | null> {
    await delay(150);
    const table = this.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'AVAILABLE';
      delete table.reservationDetails;

      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: this.currentUser?.name || 'Restaurant Owner',
        action: 'Cancelled Table Reservation',
        target: table.tableNumber,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });

      realtimeBus.publish('table:updated' as any, { table, restaurantId: table.restaurantId });
      return table;
    }
    return null;
  }

  async checkInReservedTable(tableId: string): Promise<Table | null> {
    await delay(150);
    const table = this.tables.find((t) => t.id === tableId);
    if (table) {
      table.status = 'OCCUPIED';
      table.sessionStartedAt = new Date().toISOString();

      realtimeBus.publish('table:updated' as any, { table, restaurantId: table.restaurantId });
      return table;
    }
    return null;
  }

  async getEmployees(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    return this.employees.filter((e) => e.restaurantId === targetId);
  }

  async addEmployee(emp: Omit<Employee, 'id'>) {
    await delay(150);
    const targetId = emp.restaurantId || this.resolveTenantRestaurantId();
    const newEmp: Employee = {
      ...emp,
      restaurantId: targetId,
      id: `emp-${Date.now()}`,
      createdAt: new Date().toISOString(),
      isAccountDisabled: emp.isAccountDisabled ?? false,
      password: emp.password || (emp.role === 'CHEF' ? 'kitchen123' : emp.role === 'WAITER' ? 'waiter123' : 'staff123'),
    };
    this.employees.unshift(newEmp);

    this.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: this.currentUser?.name || 'Restaurant Owner',
      action: `Created Staff Account & Assigned Role (${newEmp.role})`,
      target: newEmp.name,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    return newEmp;
  }

  async updateEmployee(employeeId: string, updates: Partial<Employee>) {
    await delay(150);
    const emp = this.employees.find((e) => e.id === employeeId);
    if (emp) {
      Object.assign(emp, updates);
      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: this.currentUser?.name || 'Restaurant Owner',
        action: `Updated Staff Record`,
        target: emp.name,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });
    }
    return emp;
  }

  async toggleEmployeeAccountStatus(employeeId: string) {
    await delay(150);
    const emp = this.employees.find((e) => e.id === employeeId);
    if (emp) {
      emp.isAccountDisabled = !emp.isAccountDisabled;
      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: this.currentUser?.name || 'Restaurant Owner',
        action: emp.isAccountDisabled ? 'Disabled Staff Account Access' : 'Enabled Staff Account Access',
        target: emp.name,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });
    }
    return emp;
  }

  async resetEmployeePassword(employeeId: string, newPassword?: string) {
    await delay(150);
    const emp = this.employees.find((e) => e.id === employeeId);
    if (emp) {
      const generatedPassword = newPassword || (emp.role === 'CHEF' ? 'kitchen123' : emp.role === 'WAITER' ? 'waiter123' : 'pass' + Math.floor(1000 + Math.random() * 9000));
      emp.password = generatedPassword;
      this.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: this.currentUser?.name || 'Restaurant Owner',
        action: 'Reset Staff Login Password',
        target: emp.name,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });
      return { success: true, employee: emp, newPassword: generatedPassword };
    }
    throw new Error('Employee record not found.');
  }

  async deleteEmployee(employeeId: string) {
    await delay(100);
    this.employees = this.employees.filter((e) => e.id !== employeeId);
    return { success: true };
  }

  async updateEmployeeStatus(employeeId: string, status: Employee['status']) {
    await delay(100);
    const emp = this.employees.find((e) => e.id === employeeId);
    if (emp) {
      emp.status = status;
      if (status === 'ON_CLOCK') {
        emp.shiftStart = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }
    return emp;
  }

  async getInventory(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    return this.inventory.filter((i) => i.restaurantId === targetId);
  }

  async addInventoryItem(item: Omit<InventoryItem, 'id'>) {
    await delay(150);
    const targetId = item.restaurantId || this.resolveTenantRestaurantId();
    const newItem: InventoryItem = {
      ...item,
      restaurantId: targetId,
      id: `inv-${Date.now()}`,
    };
    this.inventory.unshift(newItem);
    return newItem;
  }

  async deleteInventoryItem(itemId: string) {
    await delay(100);
    this.inventory = this.inventory.filter((i) => i.id !== itemId);
    return { success: true };
  }

  async updateInventoryQuantity(itemId: string, newQty: number) {
    await delay(100);
    const item = this.inventory.find((i) => i.id === itemId);
    if (item) {
      item.quantity = Math.max(0, newQty);
      if (item.quantity === 0) {
        item.status = 'OUT_OF_STOCK';
      } else if (item.quantity <= item.minThreshold) {
        item.status = 'LOW_STOCK';
      } else {
        item.status = 'IN_STOCK';
      }
      item.lastRestocked = new Date().toISOString().split('T')[0];
    }
    return item;
  }

  // --- Customer QR Ordering APIs ---

  async createCustomerOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) {
    await delay(300);
    const targetId = orderData.restaurantId || this.resolveTenantRestaurantId();
    const newOrder: Order = {
      ...orderData,
      restaurantId: targetId,
      id: `ord-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.orders.unshift(newOrder);

    const tbl = this.tables.find((t) => t.restaurantId === targetId && t.tableNumber === orderData.tableNumber);
    if (tbl) {
      tbl.status = 'OCCUPIED';
      tbl.activeOrderId = newOrder.id;
    }

    realtimeBus.emit('OrderCreated', {
      orderId: newOrder.id,
      restaurantId: newOrder.restaurantId,
      tableNumber: newOrder.tableNumber,
      actor: newOrder.customerName || 'Customer',
      data: newOrder,
    });

    return newOrder;
  }

  async callWaiter(tableNumber: string, restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    const tbl = this.tables.find((t) => t.restaurantId === targetId && t.tableNumber === tableNumber);
    if (tbl) {
      tbl.status = 'WAITER_CALLED';
    }
    realtimeBus.emit('WaiterCalled', {
      tableNumber,
      restaurantId: targetId,
      actor: 'Guest',
    });
    return { success: true, message: 'Waiter notified' };
  }

  async requestBill(tableNumber: string, restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    const tbl = this.tables.find((t) => t.restaurantId === targetId && t.tableNumber === tableNumber);
    if (tbl) {
      tbl.status = 'BILL_REQUESTED';
    }
    realtimeBus.emit('BillRequested', {
      tableNumber,
      restaurantId: targetId,
      actor: 'Guest',
    });
    return { success: true, message: 'Bill request sent to cashier' };
  }

  // --- Live Kitchen ETA & Timer APIs ---

  async acceptOrder(orderId: string, estimatedPrepTimeMinutes: number, chefName = 'Head Chef') {
    await delay(200);
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const now = new Date();
    const targetTime = new Date(now.getTime() + estimatedPrepTimeMinutes * 60000);

    order.status = 'IN_KITCHEN';
    order.acceptedAt = now.toISOString();
    order.cookingStartedAt = now.toISOString();
    order.estimatedPrepTimeMinutes = estimatedPrepTimeMinutes;
    order.etaTargetTimestamp = targetTime.toISOString();
    order.isTimerPaused = false;
    order.updatedAt = now.toISOString();

    if (!order.etaHistory) order.etaHistory = [];
    order.etaHistory.push({
      timestamp: now.toISOString(),
      oldEta: 0,
      newEta: estimatedPrepTimeMinutes,
      changedBy: chefName,
      reason: 'Order accepted & initial preparation ETA assigned',
    });

    realtimeBus.emit('OrderAccepted', {
      orderId: order.id,
      restaurantId: order.restaurantId,
      tableNumber: order.tableNumber,
      estimatedPrepTimeMinutes,
      etaTargetTimestamp: targetTime.toISOString(),
      actor: chefName,
      data: order,
    });

    return order;
  }

  async startCookingOrder(orderId: string, chefName = 'Head Chef') {
    await delay(150);
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const now = new Date();
    order.cookingStartedAt = now.toISOString();
    order.updatedAt = now.toISOString();

    realtimeBus.emit('OrderStarted', {
      orderId: order.id,
      restaurantId: order.restaurantId,
      tableNumber: order.tableNumber,
      actor: chefName,
      data: order,
    });

    return order;
  }

  async updateOrderETA(
    orderId: string,
    deltaMinutes: number | null,
    customMinutes?: number,
    reason?: string,
    changedBy = 'Head Chef'
  ) {
    await delay(200);
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const oldEta = order.estimatedPrepTimeMinutes || 15;
    let newEta = oldEta;

    if (customMinutes !== undefined) {
      newEta = customMinutes;
    } else if (deltaMinutes !== null) {
      newEta = Math.max(1, oldEta + deltaMinutes);
    }

    const now = new Date();
    const newTarget = new Date(now.getTime() + newEta * 60000);

    order.estimatedPrepTimeMinutes = newEta;
    order.etaTargetTimestamp = newTarget.toISOString();
    order.updatedAt = now.toISOString();

    if (!order.etaHistory) order.etaHistory = [];
    order.etaHistory.push({
      timestamp: now.toISOString(),
      oldEta,
      newEta,
      changedBy,
      reason: reason || (deltaMinutes && deltaMinutes > 0 ? `Increased ETA by +${deltaMinutes}m` : `Decreased ETA by ${deltaMinutes}m`),
    });

    realtimeBus.emit('ETAUpdated', {
      orderId: order.id,
      restaurantId: order.restaurantId,
      tableNumber: order.tableNumber,
      estimatedPrepTimeMinutes: newEta,
      etaTargetTimestamp: newTarget.toISOString(),
      reason: reason || `Kitchen adjusted prep time to ${newEta} minutes`,
      actor: changedBy,
      data: order,
    });

    return order;
  }

  async toggleOrderTimer(orderId: string, changedBy = 'Head Chef') {
    await delay(150);
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    order.isTimerPaused = !order.isTimerPaused;
    order.updatedAt = new Date().toISOString();

    const eventType = order.isTimerPaused ? 'TimerPaused' : 'TimerResumed';

    realtimeBus.emit(eventType, {
      orderId: order.id,
      restaurantId: order.restaurantId,
      tableNumber: order.tableNumber,
      actor: changedBy,
      data: order,
    });

    return order;
  }

  async markOrderReady(orderId: string, chefName = 'Head Chef') {
    await delay(200);
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const now = new Date();
    order.status = 'READY';
    order.readyAt = now.toISOString();
    order.updatedAt = now.toISOString();

    const startMs = order.acceptedAt ? new Date(order.acceptedAt).getTime() : new Date(order.createdAt).getTime();
    order.prepTimeMinutes = Math.round((now.getTime() - startMs) / 60000) || 1;

    realtimeBus.emit('OrderReady', {
      orderId: order.id,
      restaurantId: order.restaurantId,
      tableNumber: order.tableNumber,
      actor: chefName,
      data: order,
    });

    return order;
  }

  async deliverOrder(orderId: string, waiterName = 'Waiter Staff') {
    await delay(200);
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found');

    const now = new Date();
    order.status = 'DELIVERED';
    order.deliveredAt = now.toISOString();
    order.completedAt = now.toISOString();
    order.updatedAt = now.toISOString();

    const readyMs = order.readyAt ? new Date(order.readyAt).getTime() : now.getTime() - 2 * 60000;
    const createdMs = new Date(order.createdAt).getTime();

    order.deliveryTimeMinutes = Math.round((now.getTime() - readyMs) / 60000) || 1;
    order.totalServiceTimeMinutes = Math.round((now.getTime() - createdMs) / 60000) || 15;

    realtimeBus.emit('OrderDelivered', {
      orderId: order.id,
      restaurantId: order.restaurantId,
      tableNumber: order.tableNumber,
      actor: waiterName,
      data: order,
    });

    return order;
  }

  async getSmartETARecommendation(orderId: string) {
    await delay(100);
    const order = this.orders.find((o) => o.id === orderId);
    const targetId = order?.restaurantId || this.resolveTenantRestaurantId();
    const activeOrdersCount = this.orders.filter((o) => o.restaurantId === targetId && (o.status === 'IN_KITCHEN' || o.status === 'PENDING')).length;

    let itemCount = order ? order.items.reduce((sum, i) => sum + i.quantity, 0) : 2;
    let baseTime = 12;
    let loadFactor = activeOrdersCount * 2.5;
    let recommendedMinutes = Math.min(45, Math.max(10, Math.round(baseTime + itemCount * 2 + loadFactor)));

    return {
      recommendedMinutes,
      kitchenLoadFactor: activeOrdersCount > 5 ? 'HIGH' : activeOrdersCount > 2 ? 'MODERATE' : 'OPTIMAL',
      activeKitchenOrders: activeOrdersCount,
      reasons: [
        `${itemCount} total dish items in order`,
        `${activeOrdersCount} active orders on kitchen grill`,
        `Station Chef available`,
      ],
    };
  }

  async getKitchenAnalytics(restaurantId?: string) {
    await delay(150);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    const restOrders = this.orders.filter((o) => o.restaurantId === targetId);
    const completedOrders = restOrders.filter((o) => o.prepTimeMinutes !== undefined);

    const avgPrepTime = completedOrders.length > 0
      ? (completedOrders.reduce((sum, o) => sum + (o.prepTimeMinutes || 0), 0) / completedOrders.length).toFixed(1)
      : '14.2';

    const activeCount = restOrders.filter((o) => o.status === 'IN_KITCHEN' || o.status === 'PENDING').length;

    return {
      avgPrepTimeMinutes: parseFloat(avgPrepTime),
      kitchenLoadPercent: Math.min(100, Math.round((activeCount / 10) * 100)),
      ordersRunningLate: 0,
      fastestChef: 'Station Lead (11.4 min avg)',
      slowestPrepTimeMinutes: 24,
      kitchenEfficiencyPercent: 95.8,
      etaAccuracyPercent: 92.4,
      activeOrdersCount: activeCount,
      dailyPerformance: [
        { day: 'Mon', avgTime: 13.5, accuracy: 94 },
        { day: 'Tue', avgTime: 12.8, accuracy: 96 },
        { day: 'Wed', avgTime: 14.2, accuracy: 92 },
        { day: 'Thu', avgTime: 15.0, accuracy: 90 },
        { day: 'Fri', avgTime: 17.5, accuracy: 88 },
        { day: 'Sat', avgTime: 18.2, accuracy: 86 },
        { day: 'Sun', avgTime: 14.8, accuracy: 93 },
      ],
    };
  }

  // Customer Requests & Dispatch Methods
  async getCustomerRequests(restaurantId?: string) {
    await delay(100);
    const targetId = this.resolveTenantRestaurantId(restaurantId);
    return [...this.customerRequests.filter((r) => r.restaurantId === targetId)];
  }

  async acceptCustomerRequest(requestId: string, waiterName = 'Waiter Staff') {
    await delay(100);
    const req = this.customerRequests.find((r) => r.id === requestId);
    if (!req) throw new Error('Customer request not found');
    req.status = 'ACCEPTED';
    req.acceptedAt = new Date().toISOString();
    req.assignedWaiterName = waiterName;

    realtimeBus.emit('CustomerRequestAccepted', {
      restaurantId: req.restaurantId,
      tableNumber: req.tableNumber,
      actor: waiterName,
      data: req,
    });

    return req;
  }

  async rejectCustomerRequest(requestId: string, reason = 'Staff Busy') {
    await delay(100);
    const req = this.customerRequests.find((r) => r.id === requestId);
    if (!req) throw new Error('Customer request not found');
    req.status = 'REJECTED';
    req.rejectionReason = reason;

    realtimeBus.emit('CustomerRequestUpdated', {
      restaurantId: req.restaurantId,
      tableNumber: req.tableNumber,
      data: req,
    });

    return req;
  }

  async updateCustomerRequestStatus(requestId: string, status: CustomerRequestStatus) {
    await delay(100);
    const req = this.customerRequests.find((r) => r.id === requestId);
    if (!req) throw new Error('Customer request not found');
    req.status = status;
    if (status === 'COMPLETED') {
      req.completedAt = new Date().toISOString();
    }

    realtimeBus.emit('CustomerRequestCompleted', {
      restaurantId: req.restaurantId,
      tableNumber: req.tableNumber,
      data: req,
    });

    return req;
  }

  async createCustomerRequest(data: Partial<CustomerRequest>) {
    await delay(100);
    const targetId = data.restaurantId || this.resolveTenantRestaurantId();
    const newReq: CustomerRequest = {
      id: `req-${Date.now()}`,
      restaurantId: targetId,
      tableNumber: data.tableNumber || 'Table 01',
      requestType: data.requestType || 'CALL_WAITER',
      customTitle: data.customTitle,
      priority: data.priority || 'HIGH',
      status: 'PENDING',
      requestedAt: new Date().toISOString(),
      customerNotes: data.customerNotes,
    };
    this.customerRequests.unshift(newReq);

    const tbl = this.tables.find((t) => t.restaurantId === targetId && t.tableNumber === newReq.tableNumber);
    if (tbl) {
      if (newReq.requestType === 'BILL') tbl.status = 'BILL_REQUESTED';
      else tbl.status = 'WAITER_CALLED';
    }

    realtimeBus.emit('CustomerRequestCreated', {
      restaurantId: newReq.restaurantId,
      tableNumber: newReq.tableNumber,
      data: newReq,
    });

    return newReq;
  }

  async updateTableStatus(tableId: string, status: Table['status'], waiterName?: string) {
    await delay(100);
    const tbl = this.tables.find((t) => t.id === tableId || t.tableNumber === tableId);
    if (!tbl) throw new Error('Table not found');
    tbl.status = status;
    if (waiterName) tbl.assignedWaiterName = waiterName;

    realtimeBus.emit('TableStatusChanged', {
      restaurantId: tbl.restaurantId,
      tableNumber: tbl.tableNumber,
      actor: waiterName || 'Waiter',
      data: tbl,
    });

    return tbl;
  }

  // Notifications API
  async getWaiterNotifications() {
    await delay(50);
    return [...this.notifications];
  }

  async markNotificationRead(notifId: string) {
    await delay(50);
    const notif = this.notifications.find((n) => n.id === notifId);
    if (notif) notif.isRead = true;
    return this.notifications;
  }

  async markAllNotificationsRead() {
    await delay(50);
    this.notifications.forEach((n) => (n.isRead = true));
    return this.notifications;
  }

  async sendWaiterBroadcast(message: string, senderName = 'Manager') {
    await delay(100);
    const newNotif: WaiterNotification = {
      id: `notif-${Date.now()}`,
      type: 'MANAGER_ANNOUNCEMENT',
      title: `Broadcast from ${senderName}`,
      message,
      timestamp: 'Just now',
      isRead: false,
      priority: 'HIGH',
    };
    this.notifications.unshift(newNotif);

    realtimeBus.emit('BroadcastMessage', {
      actor: senderName,
      reason: message,
      data: newNotif,
    });

    return newNotif;
  }

  async transferCustomerRequest(requestId: string, targetWaiterName: string) {
    await delay(150);
    const notif = this.notifications.find((n) => n.id === requestId);
    if (notif) {
      notif.message = `${notif.message} (Transferred to ${targetWaiterName})`;
    }
    realtimeBus.emit('WaiterCalled', {
      orderId: requestId,
      tableNumber: notif?.tableNumber || '01',
    });
    return { success: true, requestId, targetWaiterName };
  }

  async getWaiterShiftSummary(waiterId = 'emp-3'): Promise<ShiftSummaryData> {
    await delay(100);
    return {
      shiftStart: '04:00 PM (3.5 Hours Ago)',
      hoursWorked: 5.5,
      tablesServed: 14,
      ordersDelivered: 28,
      customerCallsCompleted: 19,
      avgResponseTimeMinutes: 1.8,
      customerRating: 4.9,
      totalTipsCollected: 184.50,
      assignedSection: 'Main Floor & Terrace',
    };
  }
}

export const api = new DineFlowApiClient();
