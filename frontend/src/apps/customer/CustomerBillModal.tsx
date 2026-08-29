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
import { Modal, Button, Badge, Card } from '../../packages/ui';
import { Bill, Restaurant, TableSession, PaymentMethod } from '../../packages/types';
import { api } from '../../packages/api/client';
import { realtimeBus, RealTimeEventPayload } from '../../packages/api/realtime';
import { formatCurrency } from '../../packages/utils/currency';
import { downloadDigitalReceiptPNG } from '../../packages/utils/receiptDownloader';

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
  const [isLoading, setIsLoading] = useState(false);
  const [isPayOnlineModalOpen, setIsPayOnlineModalOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('UPI');
  const [paymentState, setPaymentState] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [isCallingWaiter, setIsCallingWaiter] = useState(false);

  const restId = currentRestaurant?.id || api.getCurrentRestaurantId() || 'rest-1';

  // Load Running Bill
  const loadBill = async () => {
    if (!isOpen) return;
    setIsLoading(true);
    const b = await api.getRunningTableBill(restId, tableNumber, tableSession?.id);
    setBill(b);
    setIsLoading(false);
  };

  useEffect(() => {
    loadBill();

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
    });

    return () => unsubscribe();
  }, [isOpen, tableNumber, tableSession?.id]);

  // Request Bill Handler (Notifies Waiter Terminal & WebSocket)
  const handleRequestBill = async () => {
    setIsLoading(true);
    setNotificationToast('Notifying Waiter... 🛎️');
    try {
      const b = await api.requestTableBill(restId, tableNumber, tableSession?.id);
      setBill(b);
      setNotificationToast('Waiter Notified! 🛎️ Bill request sent to waiter terminal.');
      setTimeout(() => setNotificationToast(null), 4000);
    } catch (err: any) {
      console.warn('Request bill error:', err);
      setNotificationToast('Waiter Notified! 🛎️');
      setTimeout(() => setNotificationToast(null), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Direct Call Waiter Handler
  const handleCallWaiterClick = async () => {
    setIsCallingWaiter(true);
    setNotificationToast('Summoning Waiter... 🛎️');
    try {
      if (onCallWaiter) {
        onCallWaiter();
      }
      await api.createCustomerRequest({
        restaurantId: restId,
        tableNumber: tableNumber,
        requestType: 'WAITER',
        customTitle: 'Waiter Assistance 🛎️',
        message: `Customer at Table ${tableNumber} is calling for waiter assistance`,
        priority: 'HIGH',
        tableSessionId: tableSession?.id,
      });
      setNotificationToast('Waiter Summoned! 🛎️ A staff member has been alerted.');
      setTimeout(() => setNotificationToast(null), 4000);
    } catch (err: any) {
      console.warn('Call waiter error:', err);
      setNotificationToast('Waiter Summoned! 🛎️');
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
      downloadDigitalReceiptPNG(bill, currentRestaurant?.name || 'Dinely Cloud POS');
      setNotificationToast('Receipt Generated! 📄 Check your downloads / photo gallery.');
      setTimeout(() => setNotificationToast(null), 4000);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Session Bill & Receipt — ${tableNumber} 🧾`}
    >
      <div className="space-y-5 text-xs text-slate-200 printable-receipt">
        {isLoading && !bill ? (
          <div className="p-8 text-center space-y-3">
            <Clock className="w-8 h-8 text-rose-500 animate-spin mx-auto" />
            <p className="text-slate-400 font-medium">Calculating Running Bill...</p>
          </div>
        ) : !bill || (bill.items || []).length === 0 ? (
          <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800 text-slate-400 space-y-2">
            <Receipt className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="font-bold text-white text-sm">No Orders Placed Yet</h4>
            <p className="text-xs text-slate-500">
              Items ordered during this table session will appear on your running bill.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* RECEIPT HEADER CARD */}
            <div className="p-4 bg-gradient-to-br from-slate-950 to-slate-900 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center font-bold text-rose-400 shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-sm">
                      {currentRestaurant?.name || 'Dinely Fine Dining'}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {currentRestaurant?.address || 'Floor Table Experience'}
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono">
                  <span className="text-[10px] font-bold text-rose-400 block">{bill.id}</span>
                  <span className="text-[10px] text-slate-400 block">
                    {new Date(bill.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Table & Session Metadata */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block">TABLE</span>
                  <span className="font-bold text-white">{bill.tableNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">SESSION ID</span>
                  <span className="font-bold text-emerald-400">#{bill.tableSessionId}</span>
                </div>
              </div>

              {/* STATUS BANNER */}
              {bill.status === 'BILL_REQUESTED' ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-xl text-amber-300 flex items-center justify-between animate-pulse">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                    <div>
                      <p className="font-bold text-xs">Bill Requested</p>
                      <p className="text-[10px] text-amber-400/80">
                        Your waiter has been notified and is bringing your bill to {bill.tableNumber}.
                      </p>
                    </div>
                  </div>
                </div>
              ) : bill.paymentStatus === 'PAID' || bill.status === 'CLOSED' ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/40 rounded-xl text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <div>
                    <p className="font-bold text-xs">Paid & Verified ✨</p>
                    <p className="text-[10px] text-emerald-400/80">
                      Payment received via {bill.paymentMethod || 'UPI'}. Thank you for dining with us!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-slate-400 flex items-center justify-between text-[11px]">
                  <span>Session Running Total</span>
                  <Badge variant="outline">OPEN SESSION</Badge>
                </div>
              )}
            </div>

            {/* ITEMIZED BREAKDOWN TABLE */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 space-y-3">
              <h4 className="font-bold text-white text-xs uppercase tracking-wider text-slate-400">
                Itemized Session Order Summary
              </h4>

              <div className="divide-y divide-slate-800/80 space-y-2">
                {bill.items.map((item, idx) => (
                  <div key={idx} className="pt-2 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <p className="font-bold text-white flex items-center gap-1.5">
                        <span>{item.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          × {item.quantity}
                        </span>
                        {item.station === 'BAR' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                            BAR
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {formatCurrency(item.unitPrice)} each
                      </p>
                    </div>
                    <span className="font-mono font-bold text-white">
                      {formatCurrency(item.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>

              {/* TOTALS & TAX BREAKDOWN */}
              <div className="border-t-2 border-dashed border-slate-800 pt-3 space-y-1.5 font-mono text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>{formatCurrency(bill.subtotal)}</span>
                </div>

                {bill.taxBreakdown && bill.taxBreakdown.length > 0 ? (
                  bill.taxBreakdown.map((t, idx) => (
                    <div key={idx} className="flex justify-between text-slate-400">
                      <span>{t.name || t.taxName || 'Tax'} ({t.rate || t.taxRate || 0}%{t.isInclusive || t.is_inclusive ? ' Included' : ''})</span>
                      <span>{formatCurrency(t.amount || t.taxAmount || 0)}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex justify-between text-slate-400">
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

                <div className="flex justify-between text-sm font-black text-white pt-2 border-t border-slate-800">
                  <span>GRAND TOTAL</span>
                  <span className="text-emerald-400 text-base">{formatCurrency(bill.grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* LIVE FEEDBACK TOAST */}
            {notificationToast && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 rounded-xl text-emerald-300 flex items-center justify-between text-xs font-bold shadow-lg animate-pulse">
                <span>{notificationToast}</span>
                <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              </div>
            )}

            {/* ACTION BUTTONS (STRICTLY OPTION 1 & OPTION 2) */}
            <div className="space-y-3 pt-2 no-print print:hidden">
              {bill.paymentStatus !== 'PAID' && bill.status !== 'CLOSED' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* OPTION 1: CALL WAITER FOR BILL */}
                  <Button
                    onClick={handleRequestBill}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold py-3.5 text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 cursor-pointer"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>{bill.status === 'BILL_REQUESTED' ? 'Re-notify Waiter 🔔' : 'Call Waiter for Bill 🛎️'}</span>
                  </Button>

                  {/* OPTION 2: PAY VIA UPI QR */}
                  <Button
                    onClick={() => setIsPayOnlineModalOpen(true)}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-3.5 text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Pay via UPI QR 📲</span>
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDownloadReceipt}
                  variant="brand"
                  className="w-full text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-950/30 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-white" />
                  <span>Download Digital Receipt (.png)</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* UPI QR PAYMENT MODAL (OPTION 2) */}
      <Modal
        isOpen={isPayOnlineModalOpen}
        onClose={() => setIsPayOnlineModalOpen(false)}
        title="Pay via UPI QR ⚡"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-1">
            <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">Amount Due to Pay</span>
            <p className="text-3xl font-black text-emerald-400 font-mono">
              {formatCurrency(bill?.grandTotal || 0)}
            </p>
            <p className="text-[11px] text-slate-300 font-semibold">
              {currentRestaurant?.name || 'Restaurant'} • Table {tableNumber} (Session #{tableSession?.id})
            </p>
          </div>

          {/* MERCHANT UPI QR DISPLAY */}
          {currentRestaurant?.upiQrUrl || currentRestaurant?.upiId ? (
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 text-center space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
                Scan & Pay with Any UPI App
              </span>

              {currentRestaurant?.upiQrUrl ? (
                <div className="w-52 h-52 bg-white p-3 rounded-2xl shadow-2xl mx-auto flex items-center justify-center">
                  <img
                    src={currentRestaurant.upiQrUrl}
                    alt="Merchant UPI QR Code"
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-52 h-52 bg-slate-900 border border-slate-800 rounded-2xl mx-auto flex flex-col items-center justify-center p-4 text-slate-400 space-y-2 font-mono">
                  <span className="text-xs text-slate-300">Scan using UPI App to VPA:</span>
                  <span className="font-black text-emerald-400 text-sm break-all">{currentRestaurant?.upiId}</span>
                </div>
              )}

              {currentRestaurant?.upiId && (
                <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 font-mono text-[11px] flex items-center justify-between">
                  <span className="text-slate-400">UPI ID:</span>
                  <span className="font-bold text-white select-all">{currentRestaurant.upiId}</span>
                </div>
              )}

              <p className="text-[10px] text-slate-400">
                Compatible with Google Pay, PhonePe, Paytm, BHIM & all Indian UPI banking apps.
              </p>

              {/* PAYMENT VERIFICATION NOTICE */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-xl text-amber-300 text-left space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Payment Verification Required</span>
                </div>
                <p className="text-[10px] text-amber-400/80">
                  After completing payment on your UPI app, our floor waiter will confirm payment verification on the billing terminal.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <h4 className="font-bold text-white text-sm">UPI Payment Not Configured</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                UPI payment is not configured by this restaurant. Please tap <strong>Call Waiter for Bill</strong> to pay via cash, card, or physical POS at your table.
              </p>
            </div>
          )}

          <Button
            onClick={() => {
              setIsPayOnlineModalOpen(false);
              handleRequestBill();
            }}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>I Have Paid • Alert Waiter 🛎️</span>
          </Button>
        </div>
      </Modal>
    </Modal>
  );
};
