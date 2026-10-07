import {
  AdminStats,
  AdminOrder,
  Organization,
  AdminApplication,
  AdminRestaurant,
} from '../../types';
import { BaseApiClient } from '../core/baseClient';
import {
  delay,
  getApiBaseUrl,
} from '../core/helpers';
import { realtimeBus } from '../realtime';

export class AdminClient {
  constructor(private base: BaseApiClient) {}

  async purgePlatformDemoData(): Promise<any> {
    const apiBase = getApiBaseUrl();
    const token = this.base.getAuthHeader('ADMIN');
    const res = await fetch(`${apiBase}/admin/restaurants/purge-demo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...token,
      },
    });
    this.base.purgeLegacyDemoData();
    this.base.saveDatabase();
    if (!res.ok) {
      throw new Error(`Failed to purge demo records (HTTP ${res.status})`);
    }
    return res.json();
  }

  async getPlatformStats(): Promise<AdminStats> {
    const raw = await this.base.executeAdminRequest<any>('/admin/stats');
    const s = (raw && typeof raw === 'object') ? raw : {};
    return {
      totalRestaurants: typeof s.totalRestaurants === 'number' ? s.totalRestaurants : (typeof s.total_restaurants === 'number' ? s.total_restaurants : 0),
      activeTenants: typeof s.activeTenants === 'number' ? s.activeTenants : (typeof s.active_tenants === 'number' ? s.active_tenants : 0),
      liveRestaurants: typeof s.liveRestaurants === 'number' ? s.liveRestaurants : (typeof s.live_restaurants === 'number' ? s.live_restaurants : 0),
      pendingApprovals: typeof s.pendingApprovals === 'number' ? s.pendingApprovals : (typeof s.pending_approvals === 'number' ? s.pending_approvals : 0),
      rejectedRestaurants: typeof s.rejectedRestaurants === 'number' ? s.rejectedRestaurants : (typeof s.rejected_restaurants === 'number' ? s.rejected_restaurants : 0),
      suspendedRestaurants: typeof s.suspendedRestaurants === 'number' ? s.suspendedRestaurants : (typeof s.suspended_restaurants === 'number' ? s.suspended_restaurants : 0),
      totalOrdersProcessed: typeof s.totalOrdersProcessed === 'number' ? s.totalOrdersProcessed : (typeof s.total_orders_processed === 'number' ? s.total_orders_processed : (typeof s.total_orders === 'number' ? s.total_orders : 0)),
      systemUptimePercent: typeof s.systemUptimePercent === 'number' ? s.systemUptimePercent : (typeof s.system_uptime_percent === 'number' ? s.system_uptime_percent : 99.99),
    };
  }

  async getPlatformOrders(): Promise<AdminOrder[]> {
    const raw = await this.base.executeAdminRequest<any>('/admin/orders');
    const data = Array.isArray(raw)
      ? raw
      : (raw && Array.isArray(raw.orders))
      ? raw.orders
      : (raw && Array.isArray(raw.data))
      ? raw.data
      : [];

    return data.map((o: any) => ({
      id: o.id || `ord-${Math.random().toString(36).slice(2, 8)}`,
      restaurantId: o.restaurantId || o.restaurant_id || '',
      tableNumber: o.tableNumber || o.table_number || '',
      status: o.status || 'COMPLETED',
      totalAmount: typeof o.totalAmount === 'number' ? o.totalAmount : (typeof o.total_amount === 'number' ? o.total_amount : 0),
      createdAt: o.createdAt || o.created_at || new Date().toISOString(),
    }));
  }

  async getOrganizations(): Promise<Organization[]> {
    const raw = await this.base.executeAdminRequest<any>('/admin/organizations');
    const data = Array.isArray(raw)
      ? raw
      : (raw && Array.isArray(raw.organizations))
      ? raw.organizations
      : (raw && Array.isArray(raw.data))
      ? raw.data
      : [];
    return data;
  }

  async getPlatformApplications(statusFilter?: string): Promise<AdminApplication[]> {
    const query = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : '';
    const raw = await this.base.executeAdminRequest<any>(`/admin/applications${query}`);
    const data = Array.isArray(raw)
      ? raw
      : (raw && Array.isArray(raw.applications))
      ? raw.applications
      : (raw && Array.isArray(raw.data))
      ? raw.data
      : [];
    return data.map((r: any) => this.base.mapBackendRestaurant(r));
  }

  async getPendingRestaurants(): Promise<AdminRestaurant[]> {
    const all = await this.getPlatformRestaurants();
    return all.filter((r) => !r.isDeleted && (r.lifecycleStatus === 'PENDING_APPROVAL' || !r.isApproved));
  }

  async getAllRestaurants(): Promise<AdminRestaurant[]> {
    return this.getPlatformRestaurants();
  }

  async getPlatformRestaurants(): Promise<AdminRestaurant[]> {
    const raw = await this.base.executeAdminRequest<any>('/admin/restaurants');
    const data = Array.isArray(raw)
      ? raw
      : (raw && Array.isArray(raw.restaurants))
      ? raw.restaurants
      : (raw && Array.isArray(raw.data))
      ? raw.data
      : null;

    if (!Array.isArray(data)) {
      throw new Error('Platform Admin API returned invalid restaurant collection format.');
    }
    const backendRestaurants = data.map((r: any) => this.base.mapBackendRestaurant(r));

    backendRestaurants.forEach((fresh) => {
      const idx = this.base.restaurants.findIndex((r) => r.id === fresh.id);
      if (idx >= 0) {
        this.base.restaurants[idx] = { ...this.base.restaurants[idx], ...fresh };
      } else {
        this.base.restaurants.push(fresh);
      }
    });
    this.base.saveDatabase();

    return backendRestaurants;
  }

  async approveRestaurant(restaurantId: string) {
    const resJson = await this.base.executeAdminRequest('/admin/restaurants/approve', {
      method: 'POST',
      body: JSON.stringify({ restaurant_id: restaurantId }),
    });

    const now = new Date().toISOString();
    this.base.restaurants = this.base.restaurants.map((r) => {
      if (r.id === restaurantId || (restaurantId && r.id.toLowerCase() === restaurantId.toLowerCase())) {
        return {
          ...r,
          isApproved: true,
          status: 'OPEN',
          lifecycleStatus: 'LIVE',
          approvedAt: now,
          rejectionReason: undefined,
          requestedChanges: undefined,
        };
      }
      return r;
    });
    this.base.saveDatabase();
    const rest = this.base.restaurants.find((r) => r.id === restaurantId || (restaurantId && r.id.toLowerCase() === restaurantId.toLowerCase()));
    if (rest) {
      const user = this.base.users.find(
        (u) => u.restaurantId === rest.id || (rest.ownerEmail && u.email.toLowerCase() === rest.ownerEmail.toLowerCase())
      );
      if (user) {
        user.restaurantId = rest.id;
      }

      this.base.platformNotifications.unshift({
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

      this.base.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: 'Platform Admin',
        action: 'Approved & Activated Restaurant OS',
        target: rest.name,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });

      this.base.saveDatabase();
      realtimeBus.emit('RESTAURANT_APPROVED', {
        restaurantId: rest.id,
        restaurant_id: rest.id,
        restaurantName: rest.name,
        lifecycleStatus: 'LIVE',
        isApproved: true,
      } as any);
    }
    return resJson;
  }

  async rejectRestaurant(restaurantId: string, reason = 'Application declined by administrator') {
    const resJson = await this.base.executeAdminRequest('/admin/restaurants/reject', {
      method: 'POST',
      body: JSON.stringify({ restaurant_id: restaurantId, reason }),
    });

    const rest = this.base.restaurants.find((r) => r.id === restaurantId || (restaurantId && r.id.toLowerCase() === restaurantId.toLowerCase()));
    if (rest) {
      rest.lifecycleStatus = 'REJECTED';
      rest.isApproved = false;
      rest.status = 'CLOSED';
      rest.rejectionReason = reason;

      this.base.platformNotifications.unshift({
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

      this.base.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: 'Platform Admin',
        action: 'Rejected Restaurant Application',
        target: rest.name,
        timestamp: 'Just now',
        ipAddress: '127.0.0.1',
        status: 'SUCCESS',
      });

      this.base.saveDatabase();
      realtimeBus.emit('RESTAURANT_REJECTED' as any, {
        restaurantId: rest.id,
        restaurant_id: rest.id,
        restaurantName: rest.name,
        lifecycleStatus: 'REJECTED',
        rejectionReason: reason,
        isApproved: false,
      } as any);
    }
    return resJson;
  }

  async requestChangesRestaurant(restaurantId: string, reason: string) {
    return this.rejectRestaurant(restaurantId, reason);
  }

  async dismissRestaurant(restaurantId: string, reason = 'Archived from pending approval queue by administrator') {
    const resJson = await this.base.executeAdminRequest('/admin/restaurants/dismiss', {
      method: 'POST',
      body: JSON.stringify({ restaurant_id: restaurantId, reason }),
    });
    const rest = this.base.restaurants.find((r) => r.id === restaurantId || (restaurantId && r.id.toLowerCase() === restaurantId.toLowerCase()));
    if (rest) {
      rest.lifecycleStatus = 'ARCHIVED';
      rest.isApproved = false;
      rest.status = 'CLOSED';
      (rest as any).dismissReason = reason;

      this.base.saveDatabase();
      realtimeBus.emit('RESTAURANT_DISMISSED' as any, {
        restaurantId: rest.id,
        restaurant_id: rest.id,
        restaurantName: rest.name,
        lifecycleStatus: 'ARCHIVED',
        dismissReason: reason,
        isApproved: false,
      } as any);
    }
    return resJson;
  }

  async suspendRestaurant(restaurantId: string, reason = 'Administrative Suspension') {
    await delay(300);
    const rest = this.base.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.lifecycleStatus = 'SUSPENDED';
      rest.status = 'CLOSED';

      this.base.platformNotifications.unshift({
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

      this.base.saveDatabase();
    }
    return rest;
  }

  async activateRestaurant(restaurantId: string) {
    return this.approveRestaurant(restaurantId);
  }

  async reactivateRestaurant(restaurantId: string) {
    return this.approveRestaurant(restaurantId);
  }

  async deactivateRestaurant(restaurantId: string, reason = 'Deactivated by Admin') {
    await delay(300);
    const rest = this.base.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.lifecycleStatus = 'DEACTIVATED';
      rest.status = 'CLOSED';
      this.base.saveDatabase();
    }
    return rest;
  }

  async deleteRestaurant(restaurantId: string, reason = 'Permanently soft-deleted by Platform Admin') {
    await delay(300);
    const rest = this.base.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      rest.isDeleted = true;
      rest.lifecycleStatus = 'DELETED';
      rest.status = 'CLOSED';
      rest.deletedAt = new Date().toISOString();
      rest.deletedBy = 'Platform Admin';
      rest.deletedReason = reason;

      this.base.auditLogs.unshift({
        id: `log-${Date.now()}`,
        actor: 'Platform Admin',
        action: 'Soft-Deleted Restaurant Record',
        target: rest.name,
        timestamp: 'Just now',
        ipAddress: '10.0.0.1',
        status: 'SUCCESS',
      });

      this.base.saveDatabase();
    }
    return rest;
  }

  async sendReminder(restaurantId: string, reminderType: string, customMessage?: string) {
    await delay(250);
    const rest = this.base.restaurants.find((r) => r.id === restaurantId);
    if (rest) {
      const titles: Record<string, string> = {
        PAYMENT: 'Payment Notice from Platform Admin',
        PROFILE: 'Profile Information Required',
        MENU: 'Menu & Pricing Review Notice',
        MAINTENANCE: 'Scheduled Cloud System Maintenance',
        ANNOUNCEMENT: 'Platform General Announcement',
      };

      this.base.platformNotifications.unshift({
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

      this.base.saveDatabase();
    }
    return rest;
  }

  async markNotificationRead(notifId: string) {
    await delay(50);
    const n = this.base.platformNotifications.find((x) => x.id === notifId);
    if (n) {
      n.isRead = true;
      this.base.saveDatabase();
    }
  }

  async getPlatformNotifications(role: 'PLATFORM_ADMIN' | 'RESTAURANT_OWNER', restaurantId?: string) {
    await delay(50);
    if (role === 'PLATFORM_ADMIN') {
      return this.base.platformNotifications.filter((n) => n.recipientRole === 'PLATFORM_ADMIN');
    }
    const targetRestId = restaurantId || this.base.currentRestaurantId || this.base.currentUser?.restaurantId;
    return this.base.platformNotifications.filter(
      (n) => n.recipientRole === 'RESTAURANT_OWNER' && (!targetRestId || n.restaurantId === targetRestId)
    );
  }

  async getAuditLogs() {
    await delay(100);
    return [...this.base.auditLogs];
  }
}
