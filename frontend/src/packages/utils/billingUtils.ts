import { Order, Bill, BillItem, Restaurant, getFulfillmentStation } from '../types';

export interface AuthoritativeSessionCalculation {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  taxBreakdown: Array<{ name: string; rate: number; amount: number; isInclusive?: boolean }>;
  serviceChargePercentage: number;
  serviceChargeAmount: number;
  roundOffAmount: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PAYMENT_PENDING' | 'PAYMENT_VERIFICATION_REQUIRED';
  orderCount: number;
  totalItems: number;
  items: BillItem[];
  invoiceNumber?: string;
  hasUnpaidOrders: boolean;
}

/**
 * Single Authoritative Source of Truth for Table Session Financial Calculation.
 * Ensures Customer App, Waiter Terminal, Floor Plan, and Owner Billing agree down to the exact rupee.
 */
export function calculateAuthoritativeSessionBill(
  tableOrders: Order[],
  restaurant?: Partial<Restaurant> | null,
  existingBill?: Bill | null
): AuthoritativeSessionCalculation {
  const configuredTaxPct = typeof restaurant?.taxPercentage === 'number' ? restaurant.taxPercentage : 5.0;
  const scPct = (restaurant?.serviceChargeEnabled && typeof restaurant?.serviceChargePercentage === 'number')
    ? restaurant.serviceChargePercentage
    : 0.0;

  const cleanOrders = (tableOrders || []).filter((o) => o.status !== 'CANCELLED');
  if (cleanOrders.length === 0 && (!existingBill || !existingBill.grandTotal)) {
    return {
      subtotal: 0,
      taxRate: configuredTaxPct,
      taxAmount: 0,
      taxBreakdown: [],
      serviceChargePercentage: scPct,
      serviceChargeAmount: 0,
      roundOffAmount: 0,
      grandTotal: 0,
      amountPaid: 0,
      balanceDue: 0,
      paymentStatus: 'UNPAID',
      orderCount: 0,
      totalItems: 0,
      items: [],
      invoiceNumber: undefined,
      hasUnpaidOrders: false,
    };
  }

  const itemMap = new Map<string, BillItem>();

  cleanOrders.forEach((ord) => {
    const rawItems = ord.items || (ord as any).items_json || [];
    rawItems.forEach((item: any) => {
      const price = typeof item.price === 'number'
        ? item.price
        : typeof item.unitPrice === 'number'
        ? item.unitPrice
        : typeof item.unit_price === 'number'
        ? item.unit_price
        : parseFloat(item.price || item.unitPrice || item.unit_price || 0) || 0;
      const qty = item.quantity || 1;
      const rawTot = typeof item.totalPrice === 'number'
        ? item.totalPrice
        : typeof item.total_price === 'number'
        ? item.total_price
        : (price * qty);
      const effectiveUnitPrice = (price === 0 && rawTot > 0) ? Math.round((rawTot / qty) * 100) / 100 : price;
      const effectiveTotalPrice = Math.round((rawTot || (qty * effectiveUnitPrice)) * 100) / 100;

      const key = `${item.menuItemId || item.id || item.name}_${effectiveUnitPrice}`;
      const existing = itemMap.get(key);
      if (existing) {
        existing.quantity += qty;
        existing.totalPrice = Math.round((existing.totalPrice + effectiveTotalPrice) * 100) / 100;
      } else {
        itemMap.set(key, {
          orderId: ord.id,
          menuItemId: item.menuItemId || item.id,
          name: item.name || 'Item',
          quantity: qty,
          unitPrice: effectiveUnitPrice,
          totalPrice: effectiveTotalPrice,
          station: item.targetDestination || getFulfillmentStation(item),
        });
      }
    });
  });

  let items = Array.from(itemMap.values());
  let totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  // Authoritative Financial Figures Resolution:
  // 1. If backend existingBill exists with grandTotal > 0, use authoritative backend figures
  // 2. Otherwise, if clean orders have backend totalAmount, sum them directly to preserve exact tax rules
  // 3. Fallback to calculating from item prices

  let grandTotal = 0;
  let subtotal = 0;
  let taxAmount = 0;
  let serviceChargeAmount = 0;
  let roundOffAmount = 0;
  let taxRate = configuredTaxPct;
  let taxBreakdown: Array<{ name: string; rate: number; amount: number; isInclusive?: boolean }> = [];

  if (existingBill && typeof existingBill.grandTotal === 'number' && existingBill.grandTotal > 0) {
    grandTotal = existingBill.grandTotal;
    subtotal = typeof existingBill.subtotal === 'number' ? existingBill.subtotal : Math.round(items.reduce((s, i) => s + i.totalPrice, 0) * 100) / 100;
    taxAmount = typeof existingBill.taxAmount === 'number' ? existingBill.taxAmount : 0;
    serviceChargeAmount = typeof existingBill.serviceChargeAmount === 'number' ? existingBill.serviceChargeAmount : 0;
    roundOffAmount = typeof existingBill.roundOffAmount === 'number' ? existingBill.roundOffAmount : 0;
    taxRate = typeof (existingBill as any).taxPercentage === 'number'
      ? (existingBill as any).taxPercentage
      : (typeof existingBill.taxRate === 'number' ? existingBill.taxRate : configuredTaxPct);
    if (Array.isArray(existingBill.taxBreakdown) && existingBill.taxBreakdown.length > 0) {
      taxBreakdown = existingBill.taxBreakdown as any;
    }
    if (Array.isArray(existingBill.items) && existingBill.items.length > 0 && items.length === 0) {
      items = existingBill.items as any;
      totalItems = items.reduce((s, i) => s + (i.quantity || 1), 0);
    }
  } else {
    const sumOrderTotals = cleanOrders.reduce((sum, o) => {
      const tot = typeof o.totalAmount === 'number'
        ? o.totalAmount
        : typeof (o as any).total_amount === 'number'
        ? (o as any).total_amount
        : 0;
      return sum + tot;
    }, 0);

    const sumOrderSubtotals = cleanOrders.reduce((sum, o) => {
      const sub = typeof o.subtotal === 'number'
        ? o.subtotal
        : typeof (o as any).subtotal === 'number'
        ? (o as any).subtotal
        : 0;
      return sum + sub;
    }, 0);

    const sumOrderTaxes = cleanOrders.reduce((sum, o) => {
      const tax = typeof o.taxAmount === 'number'
        ? o.taxAmount
        : typeof (o as any).tax_amount === 'number'
        ? (o as any).tax_amount
        : 0;
      return sum + tax;
    }, 0);

    if (sumOrderTotals > 0) {
      grandTotal = Math.round(sumOrderTotals * 100) / 100;
      taxAmount = Math.round(sumOrderTaxes * 100) / 100;
      subtotal = sumOrderSubtotals > 0
        ? Math.round(sumOrderSubtotals * 100) / 100
        : Math.round(items.reduce((s, i) => s + i.totalPrice, 0) * 100) / 100;
    } else {
      subtotal = Math.round(items.reduce((sum, i) => sum + i.totalPrice, 0) * 100) / 100;
      const taxableSubtotal = subtotal;
      serviceChargeAmount = scPct > 0 ? Math.round(taxableSubtotal * (scPct / 100.0) * 100) / 100 : 0.0;
      taxAmount = Math.round(taxableSubtotal * (configuredTaxPct / 100.0) * 100) / 100;
      const rawTotal = Math.round((taxableSubtotal + serviceChargeAmount + taxAmount) * 100) / 100;
      roundOffAmount = Math.round((Math.round(rawTotal) - rawTotal) * 100) / 100;
      grandTotal = Math.round((rawTotal + roundOffAmount) * 100) / 100;
    }
  }

  if (taxBreakdown.length === 0 && taxAmount > 0) {
    taxBreakdown = [
      {
        name: `GST (${taxRate}%)`,
        rate: taxRate,
        amount: taxAmount,
        isInclusive: false,
      },
    ];
  }

  const isBillFullyPaid = existingBill?.paymentStatus === 'PAID';
  const hasUnpaidOrders = isBillFullyPaid
    ? false
    : cleanOrders.some(
        (o) => (o.paymentStatus as string) !== 'PAID' && (o.paymentStatus as string) !== 'SETTLED'
      );

  let amountPaid = 0.0;
  if (existingBill) {
    if (existingBill.paymentStatus === 'PAID') {
      amountPaid = existingBill.amountPaid || existingBill.grandTotal || grandTotal || 0.0;
    } else if (typeof existingBill.amountPaid === 'number') {
      amountPaid = existingBill.amountPaid;
    }
  } else {
    amountPaid = cleanOrders
      .filter((o) => (o.paymentStatus as string) === 'PAID' || (o.paymentStatus as string) === 'SETTLED')
      .reduce((sum, o) => {
        const tot = typeof o.totalAmount === 'number'
          ? o.totalAmount
          : typeof (o as any).total_amount === 'number'
          ? (o as any).total_amount
          : 0;
        return sum + tot;
      }, 0);
  }

  const balanceDue = isBillFullyPaid
    ? 0
    : Math.max(0, Math.round((grandTotal - amountPaid) * 100) / 100);

  let paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PAYMENT_PENDING' | 'PAYMENT_VERIFICATION_REQUIRED' = 'UNPAID';
  if (isBillFullyPaid || (!hasUnpaidOrders && cleanOrders.length > 0 && balanceDue === 0)) {
    paymentStatus = 'PAID';
  } else if (grandTotal === 0 && cleanOrders.length === 0) {
    paymentStatus = 'UNPAID';
  } else if (existingBill?.paymentStatus === 'PAYMENT_VERIFICATION_REQUIRED' || existingBill?.paymentStatus === 'PAYMENT_PENDING') {
    paymentStatus = existingBill.paymentStatus;
  } else if (amountPaid > 0 && balanceDue > 0) {
    paymentStatus = 'PARTIALLY_PAID';
  } else {
    paymentStatus = 'UNPAID';
  }

  return {
    subtotal,
    taxRate,
    taxAmount,
    taxBreakdown,
    serviceChargePercentage: scPct,
    serviceChargeAmount,
    roundOffAmount,
    grandTotal,
    amountPaid,
    balanceDue,
    paymentStatus,
    orderCount: cleanOrders.length,
    totalItems,
    items,
    invoiceNumber: existingBill?.invoiceNumber,
    hasUnpaidOrders,
  };
}
