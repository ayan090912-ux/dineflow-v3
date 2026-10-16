import { BaseApiClient } from '../core/baseClient';
import { getApiBaseUrl, normalizeOrder } from '../core/helpers';
import { WeddingAccessRequest, WeddingWorkspace, WeddingWorkspaceDetail, EventTable, Order } from '../../types';

export class WeddingClient {
  constructor(private base: BaseApiClient) {}

  // =========================================================================
  // 1. PUBLIC WEDDING REQUESTS
  // =========================================================================

  async submitWeddingRequest(data: {
    applicantName: string;
    applicantEmail: string;
    applicantPhone: string;
    weddingName: string;
    eventType?: string;
    eventDate: string;
    startTime?: string;
    endTime?: string;
    venueName: string;
    venueCity: string;
    estimatedGuestCount?: number;
    cateringNotes?: string;
    cateringRestaurantId?: string;
    additionalRequirements?: string;
    notes?: string;
  }): Promise<{ status: string; message: string; requestId: string; lifecycleStatus: string; isDuplicate?: boolean }> {
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/weddings/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to submit wedding request' }));
      throw new Error(err.detail || `Error submitting application (${res.status})`);
    }

    return await res.json();
  }

  async getWeddingRequestStatus(requestId: string, email?: string): Promise<WeddingAccessRequest> {
    const apiBase = getApiBaseUrl();
    const query = email ? `?email=${encodeURIComponent(email)}` : '';
    const res = await fetch(`${apiBase}/weddings/requests/${encodeURIComponent(requestId)}${query}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to lookup application status' }));
      throw new Error(err.detail || `Error fetching application (${res.status})`);
    }

    return await res.json();
  }

  async getWeddingApplicantStatus(email?: string): Promise<{
    hasApplication: boolean;
    application: WeddingAccessRequest | null;
  }> {
    const apiBase = getApiBaseUrl();
    const effEmail = this.getEffectiveEmail(email);
    const query = effEmail ? `?email=${encodeURIComponent(effEmail)}` : '';
    const res = await fetch(`${apiBase}/weddings/applicant-status${query}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      return { hasApplication: false, application: null };
    }

    return await res.json();
  }

  // =========================================================================
  // 2. PLATFORM ADMIN WEDDING REQUESTS
  // =========================================================================

  async getAdminWeddingRequests(status?: string, search?: string): Promise<{
    requests: WeddingAccessRequest[];
    catererCandidates: Array<{ id: string; name: string; slug: string; city: string }>;
    counts: { all: number; submitted: number; under_review: number; approved: number; rejected: number };
  }> {
    const params = new URLSearchParams();
    if (status && status !== 'ALL') params.append('status', status);
    if (search) params.append('search', search);

    const qs = params.toString() ? `?${params.toString()}` : '';
    return await this.base.executeProtectedRequest<{
      requests: WeddingAccessRequest[];
      catererCandidates: Array<{ id: string; name: string; slug: string; city: string }>;
      counts: { all: number; submitted: number; under_review: number; approved: number; rejected: number };
    }>(`/admin/wedding-requests${qs}`, { method: 'GET' }, 'ADMIN');
  }

  async getAdminWeddingRequestDetail(requestId: string): Promise<{
    request: WeddingAccessRequest;
    caterers: Array<{ id: string; name: string; slug: string; city: string }>;
  }> {
    return await this.base.executeProtectedRequest<{
      request: WeddingAccessRequest;
      caterers: Array<{ id: string; name: string; slug: string; city: string }>;
    }>(`/admin/wedding-requests/${encodeURIComponent(requestId)}`, { method: 'GET' }, 'ADMIN');
  }

  async approveAdminWeddingRequest(
    requestId: string,
    cateringRestaurantId: string,
    reviewNotes?: string
  ): Promise<{ status: string; message: string; workspaceId: string; eventId: string; cateringRestaurant: any }> {
    return await this.base.executeProtectedRequest(
      `/admin/wedding-requests/${encodeURIComponent(requestId)}/approve`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cateringRestaurantId, reviewNotes }),
      },
      'ADMIN'
    );
  }

  async rejectAdminWeddingRequest(
    requestId: string,
    reason: string
  ): Promise<{ status: string; message: string; requestId: string; lifecycleStatus: string }> {
    return await this.base.executeProtectedRequest(
      `/admin/wedding-requests/${encodeURIComponent(requestId)}/reject`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      },
      'ADMIN'
    );
  }

  async updateAdminWeddingRequestNotes(
    requestId: string,
    notes: string
  ): Promise<{ status: string; reviewNotes: string }> {
    return await this.base.executeProtectedRequest(
      `/admin/wedding-requests/${encodeURIComponent(requestId)}/notes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      },
      'ADMIN'
    );
  }

  // =========================================================================
  // 3. WEDDING ORGANIZER WORKSPACES
  // =========================================================================

  private getEffectiveEmail(email?: string): string {
    if (email && email.trim()) return email.trim().toLowerCase();
    const cur = this.base.currentUser?.email;
    if (cur && cur.trim()) return cur.trim().toLowerCase();
    return '';
  }

  async getMyWeddingWorkspaces(email?: string): Promise<{ workspaces: WeddingWorkspace[] }> {
    const effEmail = this.getEffectiveEmail(email);
    if (!effEmail && !this.base.currentUser) {
      return { workspaces: [] };
    }
    const query = effEmail ? `?email=${encodeURIComponent(effEmail)}` : '';
    try {
      return await this.base.executeProtectedRequest<{ workspaces: WeddingWorkspace[] }>(
        `/weddings/workspaces/my${query}`,
        { method: 'GET' },
        'OWNER'
      );
    } catch {
      return { workspaces: [] };
    }
  }

  async getWeddingWorkspaceDetail(workspaceId: string, email?: string): Promise<WeddingWorkspaceDetail> {
    const effEmail = this.getEffectiveEmail(email);
    const query = effEmail ? `?email=${encodeURIComponent(effEmail)}` : '';
    return await this.base.executeProtectedRequest<WeddingWorkspaceDetail>(
      `/weddings/workspaces/${encodeURIComponent(workspaceId)}${query}`,
      { method: 'GET' },
      'OWNER'
    );
  }

  async updateWeddingWorkspaceEvent(workspaceId: string, updates: any, email?: string): Promise<any> {
    const effEmail = this.getEffectiveEmail(email);
    const query = effEmail ? `?email=${encodeURIComponent(effEmail)}` : '';
    return await this.base.executeProtectedRequest(
      `/weddings/workspaces/${encodeURIComponent(workspaceId)}/event${query}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
      'OWNER'
    );
  }

  async toggleWeddingOrdering(workspaceId: string, enabled?: boolean, email?: string): Promise<{ orderingEnabled: boolean; message: string }> {
    const effEmail = this.getEffectiveEmail(email);
    const query = effEmail ? `?email=${encodeURIComponent(effEmail)}` : '';
    return await this.base.executeProtectedRequest(
      `/weddings/workspaces/${encodeURIComponent(workspaceId)}/toggle-ordering${query}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      },
      'OWNER'
    );
  }

  async createWeddingWorkspaceTable(
    workspaceId: string,
    data: { tableNumber: string; label?: string; tableLabel?: string; capacity?: number },
    email?: string
  ): Promise<{ status: string; table: EventTable; qrUrl: string }> {
    const effEmail = this.getEffectiveEmail(email);
    const query = effEmail ? `?email=${encodeURIComponent(effEmail)}` : '';
    const payload = {
      tableNumber: data.tableNumber,
      tableLabel: data.tableLabel || data.label,
      label: data.label || data.tableLabel,
      capacity: data.capacity,
    };
    return await this.base.executeProtectedRequest(
      `/weddings/workspaces/${encodeURIComponent(workspaceId)}/tables${query}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'OWNER'
    );
  }

  async batchCreateWeddingWorkspaceTables(
    workspaceId: string,
    data: { count: number; capacity?: number; startNumber?: number; prefix?: string },
    email?: string
  ): Promise<{ status: string; createdCount: number; tables: EventTable[] }> {
    const effEmail = this.getEffectiveEmail(email);
    const query = effEmail ? `?email=${encodeURIComponent(effEmail)}` : '';
    return await this.base.executeProtectedRequest(
      `/weddings/workspaces/${encodeURIComponent(workspaceId)}/tables/batch${query}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      'OWNER'
    );
  }

  async deleteWeddingWorkspaceTable(workspaceId: string, tableId: string, email?: string): Promise<{ success: boolean; message: string }> {
    const effEmail = this.getEffectiveEmail(email);
    const query = effEmail ? `?email=${encodeURIComponent(effEmail)}` : '';
    return await this.base.executeProtectedRequest(
      `/weddings/workspaces/${encodeURIComponent(workspaceId)}/tables/${encodeURIComponent(tableId)}${query}`,
      { method: 'DELETE' },
      'OWNER'
    );
  }

  async getWeddingWorkspaceOrders(workspaceId: string, email?: string): Promise<{ orders: any[] }> {
    const effEmail = this.getEffectiveEmail(email);
    const query = effEmail ? `?email=${encodeURIComponent(effEmail)}` : '';
    try {
      const res = await this.base.executeProtectedRequest<{ orders: any[] }>(
        `/weddings/workspaces/${encodeURIComponent(workspaceId)}/orders${query}`,
        { method: 'GET' },
        'OWNER'
      );
      return {
        orders: Array.isArray(res.orders) ? res.orders.map(normalizeOrder) : [],
      };
    } catch {
      return { orders: [] };
    }
  }

  async getWeddingWorkspaceReports(workspaceId: string, email?: string): Promise<any> {
    const effEmail = this.getEffectiveEmail(email);
    const query = effEmail ? `?email=${encodeURIComponent(effEmail)}` : '';
    try {
      return await this.base.executeProtectedRequest(
        `/weddings/workspaces/${encodeURIComponent(workspaceId)}/reports${query}`,
        { method: 'GET' },
        'OWNER'
      );
    } catch {
      return {
        totalOrders: 0,
        totalAmount: 0,
        guestsEstimate: 0,
        ordersByStatus: {},
        popularDishes: [],
        tableActivity: {},
      };
    }
  }
}
