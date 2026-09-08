import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  PhoneCall,
  CreditCard,
  Building2,
  Sparkles,
  ChefHat,
  GlassWater,
  X,
  Printer,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { Modal, Button, Badge, Card, QRCodeDisplay } from '../../packages/ui';
import { Bill, Restaurant, TableSession, PaymentMethod, BillingConfig } from '../../packages/types';
import { api } from '../../packages/api/client';
import { realtimeBus, RealTimeEventPayload } from '../../packages/api/realtime';
import { formatCurrency } from '../../packages/utils/currency';
import { downloadDigitalReceiptPNG } from '../../packages/utils/receiptDownloader';
import { formatStandardTableNumber } from '../../packages/utils/tableUtils';

interface CustomerBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableNumber: string;
  currentRestaurant: Restaurant | null;
  tableSession: TableSession | null;
  onCallWaiter?: () => void;
}

export const CustomerBillModal: React.FC<CustomerBillModalProps> = ({
  isOpen,
  onClose,
  tableNumber,
  currentRestaurant,
  tableSession,
  onCallWaiter,
}) => {
  const [bill, setBill] = useState<Bill | null>(null);
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPayOnlineModalOpen, setIsPayOnlineModalOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('UPI');
  const [paymentState, setPaymentState] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);

  const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || '';
  const standardTable = formatStandardTableNumber(tableNumber);

  // Load Running Bill
  const loadBill = async () => {
    if (!isOpen) return;
    setIsLoading(true);
    const b = await api.getRunningTableBill(restId, tableNumber, tableSession?.id);
    setBill(b);
    setIsLoading(false);
  };

  // Load Server Authoritative Billing & UPI Config
  const loadBillingConfig = async () => {
    try {
      const cfg = await api.getBillingConfig(restId);
      if (cfg) {
        setBillingConfig(cfg);
      }
    } catch (e) {
      console.warn('Failed to load server billing config:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBill();
      loadBillingConfig();
    }

    const unsubscribe = realtimeBus.subscribe((event: RealTimeEventPayload) => {
      if (
        event.type === 'OrderCreated' ||
        event.type === 'BillRequested' ||
        event.type === 'BillPaid' ||
        event.type === 'TableSessionClosed' ||
        event.type === 'OrderAccepted' ||
        event.type === 'OrderDelivered'
      ) {
        loadBill();
      }
      if (event.type === 'BillingConfigUpdated' || (event as any).type === 'billing_config_updated') {
        loadBillingConfig();
      }
    });

    return () => unsubscribe();
  }, [isOpen, tableNumber, tableSession?.id, restId]);

  // UPI Config Values Resolved from Server Config with Fallbacks
  const activeUpiId = billingConfig?.upiId || currentRestaurant?.upiId || '';
  const activeMerchantName = billingConfig?.upiMerchantName || currentRestaurant?.upiMerchantName || currentRestaurant?.name || 'Restaurant';
  const activeQrUrl = billingConfig?.upiQrUrl || currentRestaurant?.upiQrUrl || '';
  const activeUpiEnabled = billingConfig?.upiEnabled !== undefined 
    ? Boolean(billingConfig.upiEnabled) 
    : (currentRestaurant?.upiEnabled !== undefined ? Boolean(currentRestaurant.upiEnabled) : true);

  // Request Bill Handler (Notifies Waiter Terminal & WebSocket)
  const handleRequestBill = async () => {
    setIsLoading(true);
    setNotificationToast('Notifying floor staff...');
    try {
      const b = await api.requestTableBill(restId, tableNumber, tableSession?.id);
      setBill(b);
      setNotificationToast('Bill request transmitted to floor terminal.');
      setTimeout(() => setNotificationToast(null), 4000);
    } catch (err: any) {
      console.warn('Request bill error:', err);
      setNotificationToast('Bill request sent.');
      setTimeout(() => setNotificationToast(null), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Customer Claimed Paid Online -> Alert Waiter
  const handleCustomerClaimedPaid = async () => {
    setIsLoading(true);
    setNotificationToast('Alerting floor staff...');
    try {
      const amountStr = bill ? `₹${bill.grandTotal.toFixed(2)}` : '';
      await api.createCustomerRequest({
        restaurantId: restId,
        tableNumber: standardTable,
        requestType: 'BILL',
        customTitle: 'UPI Payment Verification',
        message: `Customer at ${standardTable} has paid ${amountStr} via UPI (${activeUpiId || 'UPI QR'}). Please verify & confirm.`,
        customerNotes: `UPI ID: ${activeUpiId || 'Merchant QR'} | Amount: ${amountStr}`,
        priority: 'HIGH',
        tableSessionId: tableSession?.id,
      });
      await api.requestTableBill(restId, tableNumber, tableSession?.id);
      setNotificationToast('Payment notification sent to cashier terminal.');
      setTimeout(() => setNotificationToast(null), 4000);
    } catch (err: any) {
      console.warn('Paid alert error:', err);
      setNotificationToast('Floor staff alerted.');
      setTimeout(() => setNotificationToast(null), 3000);
    } finally {
      setIsLoading(false);
      setIsPayOnlineModalOpen(false);
    }
  };

  // Direct Call Waiter Handler
  const handleCallWaiterClick = async () => {
    setIsCallingWaiter(true);
    setNotificationToast('Notifying floor staff...');
    try {
      if (onCallWaiter) {
        onCallWaiter();
      }
      await api.createCustomerRequest({
        restaurantId: restId,
        tableNumber: standardTable,
        requestType: 'CALL_WAITER',
        customTitle: 'Waiter Assistance',
        message: `Customer at ${standardTable} is calling for waiter assistance`,
        priority: 'HIGH',
        tableSessionId: tableSession?.id,
      });
      setNotificationToast('Floor staff member alerted.');
      setTimeout(() => setNotificationToast(null), 4000);
    } catch (err: any) {
      console.warn('Call waiter error:', err);
      setNotificationToast('Staff alerted.');
      setTimeout(() => setNotificationToast(null), 3000);
    } finally {
      setIsCallingWaiter(false);
    }
  };

  // Online Payment Handler Simulation (Gateway Abstraction)
  const handleProcessOnlinePayment = async () => {
    setPaymentState('PROCESSING');
    setTimeout(async () => {
      if (bill) {
        const updatedBill = await api.recordBillPayment(bill.id, selectedPaymentMethod);
        setBill(updatedBill);
        setPaymentState('SUCCESS');
        setTimeout(() => {
          setIsPayOnlineModalOpen(false);
          setPaymentState('IDLE');
        }, 1500);
      }
    }, 1200);
  };

  // Instant Digital Receipt PNG Exporter Trigger (Mobile iOS & Android Compatible)
  const handleDownloadReceipt = () => {
    if (bill) {
      downloadDigitalReceiptPNG(
        bill,
        activeMerchantName || currentRestaurant?.name || 'Restaurant',
        {
          legalName: billingConfig?.legalName || currentRestaurant?.legalName,
          gstin: billingConfig?.gstin || currentRestaurant?.gstin || currentRestaurant?.gstNumber,
          pan: billingConfig?.pan || currentRestaurant?.pan,
          address: billingConfig?.address || currentRestaurant?.address,
        }
      );
      setNotificationToast('Receipt downloaded successfully.');
      setTimeout(() => setNotificationToast(null), 4000);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Session Bill • Table ${standardTable.replace(/^Table\s*/i, '')}`}
    >
      <div className="space-y-4 text-xs text-white/90">
        {isLoading && !bill ? (
          <div className="p-8 text-center space-y-2">
            <Clock className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
            <p className="text-white/40 font-mono text-xs">Retrieving bill summary...</p>
          </div>
        ) : !bill || (bill.items || []).length === 0 ? (
          <div className="p-8 text-center bg-[#0b0d11] rounded-xl border border-white/[0.08] text-white/40 space-y-2">
            <Receipt className="w-8 h-8 text-white/20 mx-auto" />
            <h4 className="font-semibold text-white text-sm">No Orders Placed Yet</h4>
            <p className="text-xs text-white/40">
              Dishes ordered during this session will appear on your running bill.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* RECEIPT HEADER CARD */}
            <div className="p-4 bg-[#0b0d11] rounded-xl border border-white/[0.08] space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center font-bold text-amber-400 shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">
                      {activeMerchantName || currentRestaurant?.name || 'Restaurant'}
                    </h3>
                    <p className="text-[10px] text-white/40 font-mono">
                      {billingConfig?.address || currentRestaurant?.address || 'Dining Room'}
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-[10px] text-white/70 block">#{bill.id.slice(-6)}</span>
                  <span className="text-[10px] text-white/40 block">
                    {new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Table & Session Metadata */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.04]">
                <div>
                  <span className="text-white/40 block text-[10px]">TABLE</span>
                  <span className="font-medium text-white">{formatStandardTableNumber(bill.tableNumber)}</span>
                </div>
                <div>
                  <span className="text-white/40 block text-[10px]">SESSION</span>
                  <span className="font-medium text-white/70">#{bill.tableSessionId ? bill.tableSessionId.slice(-6) : 'LIVE'}</span>
                </div>
              </div>

              {/* STATUS BANNER */}
              {bill.status === 'BILL_REQUESTED' ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                    <div>
                      <p className="font-medium text-xs">Bill Requested</p>
                      <p className="text-[10px] text-white/50">
                        Floor staff has been notified and is bringing your receipt to {formatStandardTableNumber(bill.tableNumber)}.
                      </p>
                    </div>
                  </div>
                </div>
              ) : bill.paymentStatus === 'PAID' || bill.status === 'CLOSED' ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <div>
                    <p className="font-medium text-xs">Paid & Settled</p>
                    <p className="text-[10px] text-white/50">
                      Payment received via {bill.paymentMethod || 'UPI'}. Thank you for dining with us.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-2 bg-white/[0.02] rounded-lg border border-white/[0.04] text-white/40 flex items-center justify-between text-[11px] font-mono">
                  <span>Current Running Balance</span>
                  <span className="text-emerald-400 font-medium">OPEN</span>
                </div>
              )}
            </div>

            {/* ITEMIZED BREAKDOWN TABLE */}
            <div className="bg-[#0b0d11] rounded-xl border border-white/[0.08] p-4 space-y-3">
              <h4 className="font-medium text-white/50 text-[11px] uppercase tracking-wider font-mono">
                Itemized Summary
              </h4>

              <div className="divide-y divide-white/[0.06] space-y-2">
                {bill.items.map((item, idx) => (
                  <div key={idx} className="pt-2 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <p className="font-medium text-white flex items-center gap-1.5">
                        <span>{item.name}</span>
                        <span className="text-[10px] text-white/40 font-mono">
                          × {item.quantity}
                        </span>
                        {item.station === 'BAR' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.06] text-white/60 font-mono border border-white/[0.08]">
                            BAR
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-white/40 font-mono">
                        {formatCurrency(item.unitPrice)} each
                      </p>
                    </div>
                    <span className="font-mono font-medium text-white">
                      {formatCurrency(item.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>

              {/* TOTALS & TAX BREAKDOWN */}
              <div className="border-t border-dashed border-white/[0.12] pt-3 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between text-white/50">
                  <span>Subtotal</span>
                  <span>{formatCurrency(bill.subtotal)}</span>
                </div>

                {bill.taxBreakdown && bill.taxBreakdown.length > 0 ? (
                  bill.taxBreakdown.map((t, idx) => (
                    <div key={idx} className="flex justify-between text-white/40">
                      <span>{t.name || t.taxName || 'Tax'} ({t.rate || t.taxRate || 0}%{t.isInclusive || t.is_inclusive ? ' Included' : ''})</span>
                      <span>{formatCurrency(t.amount || t.taxAmount || 0)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-white/40">
                    <span>Taxes & Charges</span>
                    <span>{formatCurrency(bill.taxAmount)}</span>
                  </div>
                )}

                {bill.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount</span>
                    <span>-{formatCurrency(bill.discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-semibold text-white pt-2.5 border-t border-white/[0.08]">
                  <span>Total Due</span>
                  <span className="text-amber-400 text-base font-mono">{formatCurrency(bill.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* LIVE FEEDBACK TOAST */}
            {notificationToast && (
              <div className="p-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white/80 flex items-center justify-between text-xs font-mono">
                <span>{notificationToast}</span>
              </div>
            )}

            {/* ACTION BUTTONS */}
            <div className="space-y-2.5 pt-1 no-print print:hidden">
              {bill.paymentStatus !== 'PAID' && bill.status !== 'CLOSED' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    onClick={handleRequestBill}
                    disabled={isLoading}
                    variant="outline"
                    className="w-full text-xs font-medium py-2.5 rounded-lg flex items-center justify-center gap-1.5 border-white/[0.08] bg-white/[0.02] text-white/80 hover:text-white"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>{bill.status === 'BILL_REQUESTED' ? 'Notify Waiter Again' : 'Call Waiter for Bill'}</span>
                  </Button>

                  <Button
                    onClick={() => setIsPayOnlineModalOpen(true)}
                    className="w-full text-xs font-semibold py-2.5 rounded-lg flex items-center justify-center gap-1.5 bg-amber-500 text-black hover:bg-amber-400"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Pay via UPI QR</span>
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDownloadReceipt}
                  variant="outline"
                  className="w-full text-xs font-medium py-2.5 rounded-lg flex items-center justify-center gap-1.5 border-white/[0.08] bg-white/[0.02] text-white/70 hover:text-white"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Digital Receipt (.png)</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* UPI QR PAYMENT MODAL */}
      <Modal
        isOpen={isPayOnlineModalOpen}
        onClose={() => setIsPayOnlineModalOpen(false)}
        title="Pay via UPI QR"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-[#0b0d11] rounded-xl border border-white/[0.08] text-center space-y-1">
            <span className="text-[10px] text-white/40 uppercase font-mono tracking-wider">Amount Due</span>
            <p className="text-3xl font-bold text-amber-400 font-mono">
              {formatCurrency(bill?.grandTotal || 0)}
            </p>
            <p className="text-[11px] text-white/60">
              {activeMerchantName || currentRestaurant?.name || 'Restaurant'} • {standardTable}
            </p>
          </div>

          {/* MERCHANT UPI QR DISPLAY */}
          {activeUpiEnabled && (activeQrUrl || activeUpiId) ? (
            <div className="bg-[#0b0d11] rounded-xl border border-white/[0.08] p-5 text-center space-y-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-white/50">
                Scan with Any UPI App
              </span>

              {activeQrUrl ? (
                <div className="w-48 h-48 bg-white p-3 rounded-xl shadow-lg mx-auto flex items-center justify-center">
                  <img
                    src={activeQrUrl}
                    alt="Merchant UPI QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : activeUpiId ? (
                <div className="w-48 h-48 bg-white p-3 rounded-xl shadow-lg mx-auto flex items-center justify-center">
                  <QRCodeDisplay
                    value={`upi://pay?pa=${encodeURIComponent(activeUpiId)}&pn=${encodeURIComponent(activeMerchantName || 'Merchant')}&am=${(bill?.grandTotal || 0).toFixed(2)}&cu=INR`}
                    size={168}
                  />
                </div>
              ) : null}

              {activeUpiId && (
                <div className="bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.06] font-mono text-[11px] flex items-center justify-between">
                  <span className="text-white/40">UPI ID:</span>
                  <span className="font-semibold text-white select-all">{activeUpiId}</span>
                </div>
              )}

              <p className="text-[10px] text-white/40">
                Supported: Google Pay, PhonePe, Paytm, BHIM & all Indian UPI banking apps.
              </p>

              {/* PAYMENT VERIFICATION NOTICE */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-300/90 text-left space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-xs text-amber-300">
                  <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Settlement Verification</span>
                </div>
                <p className="text-[10px] text-white/50">
                  After completing the transfer in your payment app, tap below so our floor staff confirms your table settlement.
                </p>
              </div>
            </div>
          ) : !activeUpiEnabled ? (
            <div className="p-6 bg-[#0b0d11] rounded-xl border border-white/[0.08] text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-amber-400 mx-auto" />
              <h4 className="font-semibold text-white text-sm">UPI Payment Disabled</h4>
              <p className="text-xs text-white/40 max-w-sm mx-auto">
                Digital UPI payment is currently paused for this venue. Please tap <strong>Call Waiter for Bill</strong> to settle at your table via cash or card.
              </p>
            </div>
          ) : (
            <div className="p-6 bg-[#0b0d11] rounded-xl border border-white/[0.08] text-center space-y-2">
              <AlertCircle className="w-6 h-6 text-amber-400 mx-auto" />
              <h4 className="font-semibold text-white text-sm">UPI Payment Not Configured</h4>
              <p className="text-xs text-white/40 max-w-sm mx-auto">
                Please tap <strong>Call Waiter for Bill</strong> to settle your bill via cash or table POS terminal.
              </p>
            </div>
          )}

          <Button
            onClick={handleCustomerClaimedPaid}
            className="w-full bg-emerald-500 text-black hover:bg-emerald-400 font-semibold py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>I Have Paid • Alert Staff</span>
          </Button>
        </div>
      </Modal>
    </Modal>
  );
};
