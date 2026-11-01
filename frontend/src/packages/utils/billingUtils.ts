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
  if (cleanOrders.length === 0) {
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
    (ord.items || []).forEach((item) => {
      const price = typeof item.price === 'number' ? item.price : parseFloat(item.price as any) || 0;
      const qty = item.quantity || 1;
      const key = `${item.menuItemId || item.id}_${item.name}_${price}`;
      const existing = itemMap.get(key);
      if (existing) {
        existing.quantity += qty;
        existing.totalPrice = Math.round(existing.quantity * existing.unitPrice * 100) / 100;
      } else {
        itemMap.set(key, {
          orderId: ord.id,
          menuItemId: item.menuItemId || item.id,
          name: item.name,
          quantity: qty,
          unitPrice: price,
          totalPrice: Math.round(qty * price * 100) / 100,
          station: item.targetDestination || getFulfillmentStation(item),
        });
      }
    });
  });

  const items = Array.from(itemMap.values());
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = Math.round(items.reduce((sum, i) => sum + i.totalPrice, 0) * 100) / 100;

  const taxRateDecimal = configuredTaxPct / 100.0;
  const taxableSubtotal = subtotal;

  const serviceChargeAmount = scPct > 0 ? Math.round(taxableSubtotal * (scPct / 100.0) * 100) / 100 : 0.0;
  const taxAmount = Math.round(taxableSubtotal * taxRateDecimal * 100) / 100;

  const rawTotal = Math.round((taxableSubtotal + serviceChargeAmount + taxAmount) * 100) / 100;
  const roundOffAmount = Math.round((Math.round(rawTotal) - rawTotal) * 100) / 100;
  const grandTotal = Math.round((rawTotal + roundOffAmount) * 100) / 100;

  const taxBreakdown = [
    {
      name: `GST (${configuredTaxPct}%)`,
      rate: configuredTaxPct,
      amount: taxAmount,
      isInclusive: false,
    },
  ];

  // Determine amount paid from any verified payments
  let amountPaid = 0.0;
  if (existingBill) {
    if (existingBill.paymentStatus === 'PAID') {
      amountPaid = existingBill.amountPaid || existingBill.grandTotal || grandTotal || 0.0;
    } else if (existingBill.amountPaid) {
      amountPaid = existingBill.amountPaid;
    }
  }

  const isBillFullyPaid = existingBill?.paymentStatus === 'PAID';
  const hasUnpaidOrders = isBillFullyPaid
    ? false
    : cleanOrders.some(
        (o) => (o.paymentStatus as string) !== 'PAID' && (o.paymentStatus as string) !== 'SETTLED'
      );

  let paymentStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PAYMENT_PENDING' | 'PAYMENT_VERIFICATION_REQUIRED' = 'UNPAID';
  const balanceDue = isBillFullyPaid ? 0 : Math.max(0, Math.round((grandTotal - amountPaid) * 100) / 100);

  if (isBillFullyPaid) {
    paymentStatus = 'PAID';
  } else if (grandTotal === 0 && cleanOrders.length === 0) {
    paymentStatus = 'UNPAID';
  } else if (!hasUnpaidOrders && (balanceDue === 0 || amountPaid >= grandTotal)) {
    paymentStatus = 'PAID';
  } else if (existingBill?.paymentStatus === 'PAYMENT_VERIFICATION_REQUIRED' || existingBill?.paymentStatus === 'PAYMENT_PENDING') {
    paymentStatus = existingBill.paymentStatus;
  } else if (amountPaid > 0 && balanceDue > 0) {
    paymentStatus = 'PARTIALLY_PAID';
  } else {
    paymentStatus = 'UNPAID';
  }

  return {
    subtotal,
    taxRate: configuredTaxPct,
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
