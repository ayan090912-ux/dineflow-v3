import {
  Bill,
  BillItem,
  BillingConfig,
  PaymentMethod,
  TableSession,
  Tax,
  WaiterNotification,
  getFulfillmentStation,
  RestaurantPrinter,
  PrintJobResponse,
} from '../../types';
import { BaseApiClient } from '../core/baseClient';
import {
  delay,
  getApiBaseUrl,
} from '../core/helpers';
import { matchTableNumber, formatStandardTableNumber } from '../../utils/tableUtils';
import { realtimeBus } from '../realtime';

export class BillingClient {
  constructor(private base: BaseApiClient) {}

  public generateBillNumber(restaurantId: string): string {
    const year = new Date().getFullYear();
    const count = this.base.bills.filter((b) => b.restaurantId === restaurantId).length + 101;
    const prefix = (restaurantId || 'REST').replace(/^rest-/, '').toUpperCase();
    return `DLY-${prefix}-${year}-${String(count).padStart(6, '0')}`;
  }

  async getBills(restaurantId?: string, statusFilter?: string, paymentStatus?: string, tableNumber?: string): Promise<Bill[]> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    if (!targetId) return [];

    let endpoint = `/restaurants/${encodeURIComponent(targetId)}/billing/bills`;
    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== 'ALL') params.append('status_filter', statusFilter);
    if (paymentStatus && paymentStatus !== 'ALL') params.append('payment_status', paymentStatus);
    if (tableNumber) params.append('table_number', tableNumber);
    if (params.toString()) endpoint += `?${params.toString()}`;

    try {
      const items = await this.base.executeProtectedRequest<any[]>(endpoint, { method: 'GET' });
      if (Array.isArray(items)) {
        this.base.bills = this.base.bills.filter((b) => b.restaurantId !== targetId).concat(items);
        this.base.saveDatabase();
        return items;
      }
    } catch (e) {
      console.warn('Failed to fetch remote bills:', e);
    }

    this.base.loadDatabase();
    return this.base.bills.filter((b) => b.restaurantId === targetId);
  }

  async getBillingStats(restaurantId?: string) {
    this.base.loadDatabase();
    await delay(50);
    const targetId = this.base.resolveTenantRestaurantId(restaurantId);
    const restBills = this.base.bills.filter((b) => b.restaurantId === targetId);

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

  async getRunningTableBill(restaurantId?: string, tableNumber?: string, targetSessionId?: string): Promise<Bill | null> {
    const restId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    if (!restId) return null;

    const activeTableStr = tableNumber ? formatStandardTableNumber(tableNumber) : 'Table 01';

    // 1. Authoritative Backend Remote Query
    try {
      const apiBase = getApiBaseUrl();
      const params = new URLSearchParams();
      if (targetSessionId) params.append('sessionId', targetSessionId);
      const queryStr = params.toString() ? `?${params.toString()}` : '';
      const url = `${apiBase}/restaurants/${encodeURIComponent(restId)}/billing/table/${encodeURIComponent(activeTableStr)}/bill${queryStr}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...this.base.getAuthHeader(),
        },
      });

      if (res.ok) {
        const remoteBill: Bill = await res.json();
        if (remoteBill && remoteBill.id) {
          // Normalize and cache in local database
          const existingIdx = this.base.bills.findIndex((b) => b.id === remoteBill.id || b.tableSessionId === remoteBill.tableSessionId);
          if (existingIdx >= 0) {
            this.base.bills[existingIdx] = { ...this.base.bills[existingIdx], ...remoteBill };
          } else {
            this.base.bills.unshift(remoteBill);
          }
          this.base.saveDatabase();
          return remoteBill;
        }
      }
    } catch (err) {
      console.warn('[BillingClient] Remote running bill fetch notice:', err);
    }

    // 2. Deterministic Local Database Fallback (preserving authoritative pricing formula)
    this.base.loadDatabase();
    await delay(50);

    let tbl = this.base.tables.find(
      (t) => t.restaurantId === restId && (matchTableNumber(t.tableNumber, activeTableStr) || t.id === activeTableStr)
    );

    let session = this.base.tableSessions.find(
      (s) => s.restaurantId === restId && (s.id === targetSessionId || (tbl && s.tableId === tbl.id) || matchTableNumber(s.tableNumber, activeTableStr)) && s.status !== 'CLOSED'
    );

    if (!session) {
      const now = new Date().toISOString();
      const newSess: TableSession = {
        id: `sess-${restId}-${Date.now()}`,
        restaurantId: restId,
        tableId: tbl?.id || `tbl-${restId}-${activeTableStr.toLowerCase().replace(/\s+/g, '_')}`,
        tableNumber: activeTableStr,
        status: 'ACTIVE',
        sessionStartedAt: now,
        paymentStatus: 'UNPAID',
      };
      this.base.tableSessions.unshift(newSess);
      if (tbl) {
        tbl.status = 'OCCUPIED';
        tbl.isOccupied = true;
        tbl.activeSessionId = newSess.id;
        tbl.sessionStartedAt = now;
      }
      this.base.saveDatabase();
      session = newSess;
    }

    if (!session) return null;

    const sessionOrders = this.base.orders.filter(
      (o) => o.restaurantId === restId && o.status !== 'CANCELLED' && (o.tableSessionId === session!.id || (o.tableNumber && matchTableNumber(o.tableNumber, activeTableStr)))
    );

    const itemMap = new Map<string, BillItem>();
    sessionOrders.forEach((ord) => {
      (ord.items || []).forEach((item) => {
        const key = `${item.menuItemId || item.id}_${item.name}_${item.price}`;
        const existing = itemMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          existing.totalPrice = Math.round(existing.quantity * existing.unitPrice * 100) / 100;
        } else {
          itemMap.set(key, {
            orderId: ord.id,
            menuItemId: item.menuItemId || item.id,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: Math.round(item.quantity * item.price * 100) / 100,
            station: getFulfillmentStation(item),
          });
        }
      });
    });

    const items = Array.from(itemMap.values());
    const subtotal = Math.round(items.reduce((sum, i) => sum + i.totalPrice, 0) * 100) / 100;

    const rest = this.base.restaurants.find((r) => r.id === restId);
    const configuredTaxPercentage = typeof rest?.taxPercentage === 'number' ? rest.taxPercentage : 5.0;
    const taxRateDecimal = configuredTaxPercentage / 100.0;
    const discountAmount = 0.0;
    const taxableSubtotal = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);

    const scPct = (rest?.serviceChargeEnabled && typeof rest?.serviceChargePercentage === 'number') ? rest.serviceChargePercentage : 0.0;
    const serviceChargeAmount = scPct > 0 ? Math.round(taxableSubtotal * (scPct / 100.0) * 100) / 100 : 0.0;

    const taxAmount = Math.round(taxableSubtotal * taxRateDecimal * 100) / 100;
    const rawTotal = Math.round((taxableSubtotal + serviceChargeAmount + taxAmount) * 100) / 100;
    const roundOffAmount = Math.round((Math.round(rawTotal) - rawTotal) * 100) / 100;
    const grandTotal = Math.round((rawTotal + roundOffAmount) * 100) / 100;

    const taxBreakdown = [
      {
        name: `GST (${configuredTaxPercentage}%)`,
        taxName: `GST (${configuredTaxPercentage}%)`,
        rate: configuredTaxPercentage,
        amount: taxAmount,
        isInclusive: false,
      }
    ];

    let existingBill = this.base.bills.find((b) => b.restaurantId === restId && b.tableSessionId === session!.id && b.status !== 'CLOSED' && b.status !== 'CANCELLED');

    if (existingBill) {
      const alreadyPaid = existingBill.paymentStatus === 'PAID' ? (existingBill.amountPaid || existingBill.grandTotal || 0) : (existingBill.amountPaid || 0);
      const balanceDue = Math.max(0, Math.round((grandTotal - alreadyPaid) * 100) / 100);
      const hasUnpaidOrders = sessionOrders.some((o) => (o.paymentStatus as string) !== 'PAID' && (o.paymentStatus as string) !== 'SETTLED');

      existingBill.orders = sessionOrders;
      existingBill.items = items;
      existingBill.subtotal = subtotal;
      existingBill.taxRate = configuredTaxPercentage;
      existingBill.taxAmount = taxAmount;
      existingBill.discountAmount = discountAmount;
      existingBill.taxableSubtotal = taxableSubtotal;
      existingBill.serviceChargePercentage = scPct;
      existingBill.serviceChargeAmount = serviceChargeAmount;
      existingBill.roundOffAmount = roundOffAmount;
      existingBill.grandTotal = grandTotal;
      existingBill.amountPaid = alreadyPaid;
      existingBill.balanceDue = balanceDue;
      existingBill.paymentStatus = (balanceDue === 0 && !hasUnpaidOrders && alreadyPaid > 0)
        ? 'PAID'
        : (alreadyPaid > 0 && balanceDue > 0)
        ? 'PARTIALLY_PAID'
        : 'UNPAID';
      existingBill.taxBreakdown = taxBreakdown as any;
      existingBill.updatedAt = new Date().toISOString();
      this.base.saveDatabase();
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
      discountAmount,
      taxableSubtotal,
      serviceChargePercentage: scPct,
      serviceChargeAmount,
      taxAmount,
      taxRate: configuredTaxPercentage,
      taxBreakdown: taxBreakdown as any,
      roundOffAmount,
      grandTotal,
      amountPaid: 0.0,
      balanceDue: grandTotal,
      status: 'OPEN',
      paymentStatus: 'UNPAID',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.base.bills.unshift(newBill);
    session.billId = newBill.id;
    this.base.saveDatabase();
    return newBill;
  }

  async requestTableBill(restaurantId?: string, tableNumber?: string, targetSessionId?: string): Promise<Bill | null> {
    const bill = await this.getRunningTableBill(restaurantId, tableNumber, targetSessionId);
    if (!bill) return null;

    const restId = bill.restaurantId;
    const session = this.base.tableSessions.find((s) => s.id === bill.tableSessionId);
    const tbl = this.base.tables.find((t) => t.restaurantId === restId && matchTableNumber(t.tableNumber, bill.tableNumber));

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
    this.base.notifications.unshift(notif);

    try {
      const apiBase = getApiBaseUrl();
      await fetch(`${apiBase}/customer-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restId,
          tableNumber: bill.tableNumber,
          requestType: 'BILL',
          customTitle: 'Bill Requested 🧾',
          message: `Customer at ${bill.tableNumber} requested final bill (₹${bill.grandTotal.toFixed(2)})`,
          customerNotes: `Total Amount: ₹${bill.grandTotal.toFixed(2)}`,
          priority: 'HIGH',
          tableSessionId: bill.tableSessionId,
        }),
      });
    } catch (err) {
      console.warn('Failed to post customer request for bill:', err);
    }

    this.base.saveDatabase();

    realtimeBus.emit('BillRequested' as any, {
      billId: bill.id,
      restaurantId: restId,
      tableNumber: bill.tableNumber,
      tableSessionId: bill.tableSessionId,
      grandTotal: bill.grandTotal,
      data: bill,
    });

    realtimeBus.emit('service_request_created' as any, {
      restaurantId: restId,
      tableNumber: bill.tableNumber,
      requestType: 'BILL',
      customTitle: 'Bill Requested 🧾',
      tableSessionId: bill.tableSessionId,
    });

    realtimeBus.emit('CustomerRequestCreated' as any, {
      restaurantId: restId,
      tableNumber: bill.tableNumber,
      requestType: 'BILL',
      customTitle: 'Bill Requested 🧾',
      tableSessionId: bill.tableSessionId,
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
    this.base.loadDatabase();
    await delay(100);
    const bill = this.base.bills.find((b) => b.id === billId);
    if (!bill) return null;

    bill.paymentMethod = paymentMethod;
    bill.paymentStatus = 'PAID';
    bill.status = 'PAID';
    bill.paidAt = new Date().toISOString();
    bill.updatedAt = new Date().toISOString();

    const session = this.base.tableSessions.find((s) => s.id === bill.tableSessionId);
    if (session) {
      session.paymentStatus = 'PAID';
      session.paymentMethod = paymentMethod;
      session.status = 'PAID';
    }

    (bill.orders || []).forEach((o) => {
      const match = this.base.orders.find((ord) => ord.id === o.id);
      if (match) {
        match.paymentStatus = 'PAID';
        match.paymentMethod = paymentMethod as any;
      }
    });

    this.base.saveDatabase();

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
    this.base.loadDatabase();
    await delay(100);

    const session = this.base.tableSessions.find((s) => s.id === sessionId);
    if (!session) return { bill: null, session: null };

    const restId = session.restaurantId;
    let bill = this.base.bills.find((b) => b.tableSessionId === sessionId);
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

    const tbl = this.base.tables.find(
      (t) => t.restaurantId === restId && (t.id === session!.tableId || matchTableNumber(t.tableNumber, session!.tableNumber))
    );

    if (tbl) {
      tbl.status = 'AVAILABLE';
      tbl.isOccupied = false;
      tbl.activeSessionId = undefined;
      tbl.sessionStartedAt = undefined;
    }

    this.base.saveDatabase();

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

  async getBillingConfig(restaurantId?: string): Promise<BillingConfig> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    const apiBase = getApiBaseUrl();
    let remoteConfig: any = null;
    try {
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/billing/config`);
      if (res.ok) {
        remoteConfig = await res.json();
      }
    } catch (e) {
      console.warn('Failed to fetch remote billing config:', e);
    }

    const rest = this.base.restaurants.find((r) => r.id === targetId || r.slug === targetId);
    if (remoteConfig) {
      if (rest) {
        if (remoteConfig.upiId !== undefined) rest.upiId = remoteConfig.upiId;
        if (remoteConfig.upiMerchantName !== undefined) rest.upiMerchantName = remoteConfig.upiMerchantName;
        if (remoteConfig.upiQrUrl !== undefined) rest.upiQrUrl = remoteConfig.upiQrUrl;
        if (remoteConfig.upiEnabled !== undefined) rest.upiEnabled = Boolean(remoteConfig.upiEnabled);
        if (remoteConfig.legalName !== undefined) rest.legalName = remoteConfig.legalName;
        if (remoteConfig.gstin !== undefined) {
          rest.gstin = remoteConfig.gstin;
          rest.gstNumber = remoteConfig.gstin;
        }
        this.base.saveDatabase();
      }
      return {
        restaurantId: remoteConfig.restaurantId || targetId,
        name: remoteConfig.name || rest?.name || 'Restaurant',
        legalName: remoteConfig.legalName || rest?.legalName || rest?.name || '',
        state: remoteConfig.state || rest?.state || '',
        stateCode: remoteConfig.stateCode || rest?.stateCode || '',
        gstin: remoteConfig.gstin || rest?.gstin || '',
        pan: remoteConfig.pan || rest?.pan || '',
        address: remoteConfig.address || rest?.address || '',
        phone: remoteConfig.phone || rest?.phone || '',
        email: remoteConfig.email || rest?.email || '',
        currency: remoteConfig.currency || rest?.currency || 'INR (₹)',
        invoicePrefix: remoteConfig.invoicePrefix || rest?.invoicePrefix || 'INV-',
        invoiceStartingNumber: remoteConfig.invoiceStartingNumber !== undefined ? Number(remoteConfig.invoiceStartingNumber) : (rest?.invoiceStartingNumber || 1001),
        serviceChargePercentage: remoteConfig.serviceChargePercentage !== undefined ? Number(remoteConfig.serviceChargePercentage) : (rest?.serviceChargePercentage || 0.0),
        serviceChargeEnabled: remoteConfig.serviceChargeEnabled !== undefined ? Boolean(remoteConfig.serviceChargeEnabled) : (rest?.serviceChargeEnabled || false),
        upiId: remoteConfig.upiId !== undefined ? remoteConfig.upiId : (rest?.upiId || ''),
        upiMerchantName: remoteConfig.upiMerchantName || rest?.upiMerchantName || rest?.name || '',
        upiQrUrl: remoteConfig.upiQrUrl !== undefined ? remoteConfig.upiQrUrl : (rest?.upiQrUrl || ''),
        upiEnabled: remoteConfig.upiEnabled !== undefined ? Boolean(remoteConfig.upiEnabled) : (rest?.upiEnabled !== false),
      };
    }

    return {
      restaurantId: targetId,
      name: rest?.name || 'Restaurant',
      legalName: rest?.legalName || rest?.name || '',
      state: rest?.state || '',
      stateCode: rest?.stateCode || '',
      gstin: rest?.gstin || rest?.gstNumber || '',
      pan: rest?.pan || '',
      address: rest?.address || '',
      phone: rest?.phone || '',
      email: rest?.email || '',
      currency: rest?.currency || 'INR (₹)',
      invoicePrefix: rest?.invoicePrefix || 'INV-',
      invoiceStartingNumber: rest?.invoiceStartingNumber || 1001,
      serviceChargePercentage: rest?.serviceChargePercentage || 0.0,
      serviceChargeEnabled: rest?.serviceChargeEnabled || false,
      upiId: rest?.upiId || '',
      upiMerchantName: rest?.upiMerchantName || rest?.name || '',
      upiQrUrl: rest?.upiQrUrl || '',
      upiEnabled: rest?.upiEnabled !== false,
    };
  }

  async updateBillingConfig(restaurantId: string, config: Partial<BillingConfig>): Promise<BillingConfig> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    
    const rest = this.base.restaurants.find((r) => r.id === targetId);
    if (rest) {
      if (config.legalName !== undefined) rest.legalName = config.legalName;
      if (config.state !== undefined) rest.state = config.state;
      if (config.stateCode !== undefined) rest.stateCode = config.stateCode;
      if (config.gstin !== undefined) {
        rest.gstin = config.gstin;
        rest.gstNumber = config.gstin;
      }
      if (config.pan !== undefined) rest.pan = config.pan;
      if (config.invoicePrefix !== undefined) rest.invoicePrefix = config.invoicePrefix;
      if (config.invoiceStartingNumber !== undefined) rest.invoiceStartingNumber = config.invoiceStartingNumber;
      if (config.serviceChargePercentage !== undefined) rest.serviceChargePercentage = config.serviceChargePercentage;
      if (config.serviceChargeEnabled !== undefined) rest.serviceChargeEnabled = config.serviceChargeEnabled;
      if (config.upiId !== undefined) rest.upiId = config.upiId;
      if (config.upiMerchantName !== undefined) rest.upiMerchantName = config.upiMerchantName;
      if (config.upiQrUrl !== undefined) rest.upiQrUrl = config.upiQrUrl;
      if (config.upiEnabled !== undefined) rest.upiEnabled = config.upiEnabled;
      this.base.saveDatabase();
    }

    try {
      const data = await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(targetId)}/billing/config`,
        {
          method: 'PUT',
          body: JSON.stringify({
            legal_name: config.legalName,
            state: config.state,
            state_code: config.stateCode,
            gstin: config.gstin,
            pan: config.pan,
            invoice_prefix: config.invoicePrefix,
            invoice_starting_number: config.invoiceStartingNumber,
            service_charge_percentage: config.serviceChargePercentage,
            service_charge_enabled: config.serviceChargeEnabled,
            upi_id: config.upiId,
            upi_merchant_name: config.upiMerchantName,
            upi_qr_url: config.upiQrUrl,
            upi_enabled: config.upiEnabled,
          }),
        },
        'OWNER'
      );
      if (data && data.config) return data.config;
    } catch (e) {
      console.warn('Failed to update remote billing config:', e);
    }

    return this.getBillingConfig(targetId);
  }

  async uploadUpiQrImage(restaurantId: string, qrDataUrl: string, merchantName?: string, upiId?: string) {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    try {
      const data = await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(targetId)}/billing/qr-upload`,
        {
          method: 'POST',
          body: JSON.stringify({
            qrDataUrl,
            merchantName,
            upiId,
          }),
        },
        'OWNER'
      );
      if (data) {
        return data;
      }
    } catch (e) {
      console.warn('Failed to upload remote UPI QR:', e);
    }
    const rest = this.base.restaurants.find((r) => r.id === targetId);
    if (rest) {
      rest.upiQrUrl = qrDataUrl;
      if (merchantName) rest.upiMerchantName = merchantName;
      if (upiId) rest.upiId = upiId;
      rest.upiEnabled = true;
      this.base.saveDatabase();
    }
    return { status: 'success', upiQrUrl: qrDataUrl };
  }

  async calculateTableBill(restaurantId: string, payload: {
    tableNumber: string;
    tableId?: string;
    tableSessionId?: string;
    discountPercentage?: number;
    discountAmount?: number;
    serviceChargePercentage?: number;
    orderType?: string;
  }) {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/billing/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to calculate bill via backend:', e);
    }
    return await this.getRunningTableBill(targetId, payload.tableNumber, payload.tableSessionId);
  }

  async generateTableInvoice(restaurantId: string, payload: {
    tableNumber: string;
    tableId?: string;
    tableSessionId?: string;
    sessionId?: string;
    discountPercentage?: number;
    discountAmount?: number;
    serviceChargePercentage?: number;
    tipAmount?: number;
    taxRate?: number;
    paymentMethod?: string;
    waiterName?: string;
    customerName?: string;
    customerPhone?: string;
    orderType?: string;
    [key: string]: any;
  }): Promise<Bill> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/billing/generate-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const bill = await res.json();
        const existingIdx = this.base.bills.findIndex((b) => b.id === bill.id);
        if (existingIdx >= 0) {
          this.base.bills[existingIdx] = bill;
        } else {
          this.base.bills.unshift(bill);
        }
        this.base.saveDatabase();
        return bill;
      }
    } catch (e) {
      console.warn('Failed to generate invoice via backend:', e);
    }
    const b = await this.requestTableBill(targetId, payload.tableNumber, payload.tableSessionId);
    return b!;
  }

  async markBillPayment(restaurantId: string, billId: string, paymentMethod: PaymentMethod = 'CASH', verifiedBy: string = 'Staff', paymentReference?: string): Promise<Bill> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    try {
      const res = await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(targetId)}/billing/${encodeURIComponent(billId)}/mark-payment`,
        {
          method: 'POST',
          body: JSON.stringify({
            paymentMethod,
            verifiedBy,
            paymentReference,
          }),
        }
      );
      if (res && res.bill) {
        const idx = this.base.bills.findIndex((b) => b.id === billId);
        if (idx >= 0) this.base.bills[idx] = res.bill;
        this.base.saveDatabase();
        return res.bill;
      }
    } catch (e) {
      console.warn('Failed to record payment via backend:', e);
    }
    const b = await this.recordBillPayment(billId, paymentMethod);
    return b!;
  }

  async reportCustomerPayment(restaurantId: string, billId: string, details?: any): Promise<any> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    const apiBase = getApiBaseUrl();
    try {
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/billing/${encodeURIComponent(billId)}/report-customer-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details || {}),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Failed to report customer payment:', e);
    }
    return { status: 'success', paymentStatus: 'PAYMENT_AWAITING_CONFIRMATION' };
  }

  async closeTableSettlement(restaurantId: string, billId: string, closedBy: string = 'Staff') {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || restaurantId;
    try {
      const res = await this.base.executeProtectedRequest<any>(
        `/restaurants/${encodeURIComponent(targetId)}/billing/${encodeURIComponent(billId)}/close-table?closed_by=${encodeURIComponent(closedBy)}`,
        {
          method: 'POST',
        }
      );
      if (res) {
        return res;
      }
    } catch (e) {
      console.warn('Failed to close table via backend:', e);
    }
    const b = this.base.bills.find((bill) => bill.id === billId);
    if (b && b.tableSessionId) {
      return await this.closeTableSessionAndGenerateBill(b.tableSessionId, closedBy, b.paymentMethod);
    }
    return { status: 'success' };
  }

  // --- Taxes Management ---
  async getTaxes(restaurantId?: string): Promise<Tax[]> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId);
    if (!targetId) return [];
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/taxes`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data.map((t: any) => ({
            id: t.id,
            restaurantId: t.restaurant_id || targetId,
            name: t.name,
            type: t.type || 'PERCENTAGE',
            rate: typeof t.rate === 'number' ? t.rate : parseFloat(t.rate) || 0,
            fixedAmount: typeof t.fixed_amount === 'number' ? t.fixed_amount : parseFloat(t.fixed_amount) || 0,
            isInclusive: t.is_inclusive !== false,
            appliesTo: t.applies_to || 'ORDER',
            applicableOrderTypes: t.applicable_order_types || ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
            categoryIds: t.category_ids || [],
            menuItemIds: t.menu_item_ids || [],
            status: t.status || 'ACTIVE',
            createdAt: t.created_at,
            updatedAt: t.updated_at,
          }));
        }
      }
    } catch (e) {
      console.warn('API fetch for getTaxes failed:', e);
    }
    return [];
  }

  async createTax(restaurantId: string, taxData: Partial<Tax>): Promise<Tax> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error("No active restaurant selected");
    const apiBase = getApiBaseUrl();
    const payload = {
      name: taxData.name,
      type: taxData.type || 'PERCENTAGE',
      rate: taxData.rate || 0,
      fixedAmount: taxData.fixedAmount || 0,
      isInclusive: !!taxData.isInclusive,
      appliesTo: taxData.appliesTo || 'ORDER',
      applicableOrderTypes: taxData.applicableOrderTypes || ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
      categoryIds: taxData.categoryIds || [],
      menuItemIds: taxData.menuItemIds || [],
      status: taxData.status || 'ACTIVE',
    };
    const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/taxes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create tax' }));
      throw new Error(err.detail || 'Failed to create tax');
    }
    const t = await res.json();
    return {
      id: t.id,
      restaurantId: t.restaurant_id || targetId,
      name: t.name,
      type: t.type,
      rate: t.rate,
      fixedAmount: t.fixed_amount,
      isInclusive: t.is_inclusive,
      appliesTo: t.applies_to,
      applicableOrderTypes: t.applicable_order_types,
      categoryIds: t.category_ids,
      menuItemIds: t.menu_item_ids,
      status: t.status,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }

  async updateTax(restaurantId: string, taxId: string, updates: Partial<Tax>): Promise<Tax> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error("No active restaurant selected");
    const apiBase = getApiBaseUrl();
    const payload = {
      name: updates.name,
      type: updates.type,
      rate: updates.rate,
      fixedAmount: updates.fixedAmount,
      isInclusive: updates.isInclusive,
      appliesTo: updates.appliesTo,
      applicableOrderTypes: updates.applicableOrderTypes,
      categoryIds: updates.categoryIds,
      menuItemIds: updates.menuItemIds,
      status: updates.status,
    };
    const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/taxes/${encodeURIComponent(taxId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update tax' }));
      throw new Error(err.detail || 'Failed to update tax');
    }
    const t = await res.json();
    return {
      id: t.id,
      restaurantId: t.restaurant_id || targetId,
      name: t.name,
      type: t.type,
      rate: t.rate,
      fixedAmount: t.fixed_amount,
      isInclusive: t.is_inclusive,
      appliesTo: t.applies_to,
      applicableOrderTypes: t.applicable_order_types,
      categoryIds: t.category_ids,
      menuItemIds: t.menu_item_ids,
      status: t.status,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }

  async activateTax(restaurantId: string, taxId: string): Promise<Tax> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error("No active restaurant selected");
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/taxes/${encodeURIComponent(taxId)}/activate`, {
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error('Failed to activate tax');
    }
    return await res.json();
  }

  async deactivateTax(restaurantId: string, taxId: string): Promise<Tax> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error("No active restaurant selected");
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/taxes/${encodeURIComponent(taxId)}/deactivate`, {
      method: 'POST',
    });
    if (!res.ok) {
      throw new Error('Failed to deactivate tax');
    }
    return await res.json();
  }

  async calculateTaxes(restaurantId: string, items: any[], orderType: string = 'DINE_IN') {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) return null;
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/taxes/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, orderType }),
    });
    if (res.ok) {
      return await res.json();
    }
    return null;
  }

  // ==========================================
  // THERMAL PRINTER MANAGEMENT
  // ==========================================

  async getPrinters(restaurantId?: string): Promise<RestaurantPrinter[]> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) return [];
    try {
      const printers = await this.base.executeProtectedRequest<RestaurantPrinter[]>(
        `/restaurants/${encodeURIComponent(targetId)}/printers`,
        { method: 'GET' }
      );
      return Array.isArray(printers) ? printers : [];
    } catch (e) {
      console.warn('Failed to fetch printers:', e);
      return [];
    }
  }

  async createPrinter(restaurantId: string, printerData: Partial<RestaurantPrinter>): Promise<RestaurantPrinter> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error('No active restaurant selected');
    return await this.base.executeProtectedRequest<RestaurantPrinter>(
      `/restaurants/${encodeURIComponent(targetId)}/printers`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(printerData),
      }
    );
  }

  async updatePrinter(restaurantId: string, printerId: string, updates: Partial<RestaurantPrinter>): Promise<RestaurantPrinter> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error('No active restaurant selected');
    return await this.base.executeProtectedRequest<RestaurantPrinter>(
      `/restaurants/${encodeURIComponent(targetId)}/printers/${encodeURIComponent(printerId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }
    );
  }

  async deletePrinter(restaurantId: string, printerId: string): Promise<boolean> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error('No active restaurant selected');
    await this.base.executeProtectedRequest(
      `/restaurants/${encodeURIComponent(targetId)}/printers/${encodeURIComponent(printerId)}`,
      { method: 'DELETE' }
    );
    return true;
  }

  async testPrint(restaurantId: string, printerId: string): Promise<PrintJobResponse> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error('No active restaurant selected');
    return await this.base.executeProtectedRequest<PrintJobResponse>(
      `/restaurants/${encodeURIComponent(targetId)}/printers/${encodeURIComponent(printerId)}/test-print`,
      { method: 'POST' }
    );
  }

  async printBillInvoice(restaurantId: string, billId: string, printerId?: string, copies: number = 1): Promise<PrintJobResponse> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error('No active restaurant selected');
    return await this.base.executeProtectedRequest<PrintJobResponse>(
      `/restaurants/${encodeURIComponent(targetId)}/printers/print-bill/${encodeURIComponent(billId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId, copies }),
      }
    );
  }

  // ==========================================
  // DYNAMIC PAYMENT QR & RECONCILIATION
  // ==========================================

  async generateBillPaymentQr(restaurantId: string, billId: string, gateway?: string): Promise<{ status: string; qr: any; bill: Bill }> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error('No active restaurant selected');
    const endpoint = gateway
      ? `/restaurants/${encodeURIComponent(targetId)}/billing/${encodeURIComponent(billId)}/generate-qr?gateway=${encodeURIComponent(gateway)}`
      : `/restaurants/${encodeURIComponent(targetId)}/billing/${encodeURIComponent(billId)}/generate-qr`;
    return await this.base.executeProtectedRequest<{ status: string; qr: any; bill: Bill }>(
      endpoint,
      { method: 'POST' }
    );
  }

  async getBillPaymentStatus(restaurantId: string, billId: string): Promise<any> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error('No active restaurant selected');
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(targetId)}/billing/${encodeURIComponent(billId)}/payment-status`);
    if (!res.ok) throw new Error('Failed to retrieve payment status');
    return await res.json();
  }

  async reconcileBillPayment(restaurantId: string, billId: string): Promise<any> {
    const targetId = this.base.resolveTenantRestaurantId(restaurantId) || this.base.getCurrentRestaurantId();
    if (!targetId) throw new Error('No active restaurant selected');
    return await this.base.executeProtectedRequest(
      `/payments/${encodeURIComponent(targetId)}/bills/${encodeURIComponent(billId)}/reconcile`,
      { method: 'GET' }
    );
  }
}
