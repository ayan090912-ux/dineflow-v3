import {
  CustomerRequest,
  CustomerRequestType,
  CustomerRequestStatus,
  WaiterNotification,
} from '../../types';
import { BaseApiClient } from '../core/baseClient';
import {
  delay,
  getApiBaseUrl,
} from '../core/helpers';

export class CustomerClient {
  constructor(private base: BaseApiClient) {}

  async createCustomerRequest(data: {
    restaurantId?: string;
    tableId?: string;
    tableNumber: string;
    type?: 'CALL_WAITER' | 'REQUEST_BILL' | 'SERVICE' | string;
    requestType?: string;
    customTitle?: string;
    message?: string;
    customerNotes?: string;
    notes?: string;
    priority?: string;
    tableSessionId?: string;
    [key: string]: any;
  }): Promise<CustomerRequest> {
    const restId = this.base.resolveTenantRestaurantId(data.restaurantId) || data.restaurantId || this.base.getCurrentRestaurantId() || '';
    const apiBase = getApiBaseUrl();
    let createdReq: CustomerRequest | null = null;
    try {
      const res = await fetch(`${apiBase}/customer-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.base.getAuthHeader(),
        },
        body: JSON.stringify({
          restaurantId: restId,
          tableId: data.tableId,
          tableNumber: data.tableNumber,
          requestType: data.requestType || data.type || 'WATER',
          customTitle: data.customTitle,
          message: data.message || data.customerNotes || data.notes,
          customerNotes: data.customerNotes || data.notes,
          priority: data.priority || 'MEDIUM',
          tableSessionId: data.tableSessionId,
        }),
      });
      if (res.ok) {
        const raw = await res.json();
        createdReq = {
          id: raw.id,
          restaurantId: raw.restaurantId || raw.restaurant_id || restId,
          tableId: raw.tableId || raw.table_id,
          tableNumber: raw.tableNumber || raw.table_number || data.tableNumber,
          requestType: (raw.requestType || raw.request_type || data.requestType || 'WATER').toUpperCase() as CustomerRequestType,
          customTitle: raw.customTitle || raw.custom_title || raw.message,
          message: raw.message || raw.customerNotes || data.customerNotes,
          customerNotes: raw.customerNotes || raw.customer_notes || data.customerNotes,
          priority: (raw.priority || data.priority || 'MEDIUM') as any,
          status: (raw.status || 'PENDING').toUpperCase() as CustomerRequestStatus,
          requestedAt: raw.requestedAt || raw.requested_at || raw.created_at || raw.timestamp || new Date().toISOString(),
          acceptedAt: raw.acceptedAt || raw.accepted_at,
          completedAt: raw.completedAt || raw.completed_at,
          assignedWaiterName: raw.waiterName || raw.waiter_name || raw.assignedWaiterName,
          tableSessionId: raw.tableSessionId || raw.table_session_id || data.tableSessionId,
        };
      }
    } catch (err) {
      console.warn('Failed to submit remote customer request, falling back to local database:', err);
    }

    if (!createdReq) {
      createdReq = {
        id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        restaurantId: restId,
        tableId: data.tableId,
        tableNumber: data.tableNumber,
        requestType: (data.requestType || data.type || 'WATER').toUpperCase() as CustomerRequestType,
        customTitle: data.customTitle || (data.requestType || 'Service').replace(/_/g, ' '),
        message: data.message || data.customerNotes || data.notes || '',
        customerNotes: data.customerNotes || data.notes || '',
        priority: (data.priority || 'MEDIUM') as any,
        status: 'PENDING',
        requestedAt: new Date().toISOString(),
        tableSessionId: data.tableSessionId,
      };
    }

    // Persist in local client database
    const existingIdx = this.base.customerRequests.findIndex((r) => r.id === createdReq!.id);
    if (existingIdx >= 0) {
      this.base.customerRequests[existingIdx] = createdReq;
    } else {
      this.base.customerRequests.unshift(createdReq);
    }
    this.base.saveDatabase();
    return createdReq;
  }

  async getCustomerRequests(restaurantId?: string, statusFilter?: string): Promise<CustomerRequest[]> {
    const restId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId || this.base.getCurrentRestaurantId() || '';
    const apiBase = getApiBaseUrl();
    let url = `${apiBase}/customer-requests?restaurant_id=${encodeURIComponent(restId)}`;
    if (statusFilter) {
      url += `&status_filter=${encodeURIComponent(statusFilter)}`;
    }
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...this.base.getAuthHeader(),
        },
      });
      if (res.ok) {
        const items = await res.json();
        if (Array.isArray(items)) {
          const mapped: CustomerRequest[] = items.map((raw: any) => ({
            id: raw.id,
            restaurantId: raw.restaurantId || raw.restaurant_id || restId,
            tableId: raw.tableId || raw.table_id,
            tableNumber: raw.tableNumber || raw.table_number || 'Table 01',
            requestType: (raw.requestType || raw.request_type || 'WATER').toUpperCase() as CustomerRequestType,
            customTitle: raw.customTitle || raw.custom_title || raw.message,
            message: raw.message || raw.customerNotes || raw.customer_notes,
            customerNotes: raw.customerNotes || raw.customer_notes || raw.message,
            priority: (raw.priority || 'MEDIUM') as any,
            status: (raw.status || 'PENDING').toUpperCase() as CustomerRequestStatus,
            requestedAt: raw.requestedAt || raw.requested_at || raw.created_at || raw.timestamp || new Date().toISOString(),
            acceptedAt: raw.acceptedAt || raw.accepted_at,
            completedAt: raw.completedAt || raw.completed_at,
            assignedWaiterName: raw.waiterName || raw.waiter_name || raw.assignedWaiterName,
            tableSessionId: raw.tableSessionId || raw.table_session_id,
          }));
          // Sync with local memory
          this.base.customerRequests = this.base.customerRequests
            .filter((r) => r.restaurantId !== restId)
            .concat(mapped);
          this.base.saveDatabase();
          return mapped;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch customer requests from remote backend, using local store:', e);
    }
    this.base.loadDatabase();
    return this.base.customerRequests.filter((r) => r.restaurantId === restId);
  }

  async updateCustomerRequest(requestId: string, statusVal: string, waiterName?: string): Promise<CustomerRequest> {
    const raw = await this.base.executeProtectedRequest<any>(
      `/customer-requests/${encodeURIComponent(requestId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status: statusVal,
          waiterName: waiterName || 'Waiter',
        }),
      },
      'WAITER'
    );
    const updatedReq: CustomerRequest = {
      id: raw.id || requestId,
      restaurantId: raw.restaurantId || raw.restaurant_id || '',
      tableId: raw.tableId || raw.table_id,
      tableNumber: raw.tableNumber || raw.table_number || 'Table 01',
      requestType: (raw.requestType || raw.request_type || 'WATER').toUpperCase() as CustomerRequestType,
      customTitle: raw.customTitle || raw.custom_title || raw.message,
      message: raw.message || raw.customerNotes,
      customerNotes: raw.customerNotes || raw.customer_notes,
      priority: (raw.priority || 'MEDIUM') as any,
      status: (raw.status || statusVal).toUpperCase() as CustomerRequestStatus,
      requestedAt: raw.requestedAt || raw.requested_at || raw.created_at || raw.timestamp || new Date().toISOString(),
      acceptedAt: raw.acceptedAt || raw.accepted_at,
      completedAt: raw.completedAt || raw.completed_at,
      assignedWaiterName: raw.waiterName || raw.waiter_name || waiterName,
      tableSessionId: raw.tableSessionId || raw.table_session_id,
    };
    const reqIdx = this.base.customerRequests.findIndex((r) => r.id === requestId);
    if (reqIdx >= 0) {
      this.base.customerRequests[reqIdx] = updatedReq;
      this.base.saveDatabase();
    }
    return updatedReq;
  }

  async acceptCustomerRequest(reqId: string, waiterName?: string) {
    return this.updateCustomerRequest(reqId, 'IN_PROGRESS', waiterName);
  }

  async rejectCustomerRequest(reqId: string, waiterName?: string) {
    return this.updateCustomerRequest(reqId, 'REJECTED', waiterName);
  }

  async updateCustomerRequestStatus(reqId: string, status: any, waiterName?: string) {
    return this.updateCustomerRequest(reqId, status, waiterName);
  }

  async transferCustomerRequest(_reqId: string, _newWaiterId: string) {
    await delay(100);
    return true;
  }

  async sendWaiterBroadcast(_message: string, _senderId?: string) {
    await delay(100);
    return true;
  }

  async markAllNotificationsRead() {
    await delay(100);
    this.base.notifications.forEach((n) => (n.isRead = true));
    this.base.saveDatabase();
  }

  async callWaiter(tableNumber: string, reason: string, restaurantId?: string) {
    const targetRestId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetRestId) throw new Error("No active restaurant selected");
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
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/customer-requests`, {
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
    this.base.customerRequests.push(req as any);
    this.base.saveDatabase();
    return req;
  }

  async requestBill(tableNumber: string, restaurantId?: string, tableId?: string, tableSessionId?: string) {
    const targetRestId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetRestId) throw new Error("No active restaurant selected");
    const req = {
      id: `req-${Date.now()}`,
      restaurantId: targetRestId,
      tableNumber,
      tableId,
      tableSessionId,
      requestType: 'BILL',
      message: `Table ${tableNumber} requested the final bill.`,
      status: 'PENDING',
      timestamp: 'Just now',
    };
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/customer-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: targetRestId,
          tableNumber,
          tableId,
          tableSessionId,
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
    this.base.customerRequests.push(req as any);
    this.base.saveDatabase();
    return req;
  }

  async getWaiterNotifications(restaurantId?: string): Promise<WaiterNotification[]> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId);
    return (this.base.notifications || []).filter((n) => !targetId || !n.restaurantId || n.restaurantId === targetId) as any;
  }
}

