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

  // Request Bill Handler
  const handleRequestBill = async () => {
    setIsLoading(true);
    const b = await api.requestTableBill(restId, tableNumber, tableSession?.id);
    setBill(b);
    setIsLoading(false);
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

  // Instant Digital Receipt PNG Exporter Trigger
  const handleDownloadReceipt = () => {
    if (bill) {
      downloadDigitalReceiptPNG(bill, currentRestaurant?.name || 'Dinely Cloud POS');
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

            {/* ACTION BUTTONS */}
            <div className="space-y-2 pt-2 no-print print:hidden">
              {bill.paymentStatus !== 'PAID' && bill.status !== 'CLOSED' && (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={handleRequestBill}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-amber-950/40"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>{bill.status === 'BILL_REQUESTED' ? 'Re-notify Waiter 🔔' : 'Request Bill 🧾'}</span>
                  </Button>

                  <Button
                    onClick={() => setIsPayOnlineModalOpen(true)}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Pay Online 💳</span>
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDownloadReceipt}
                  variant="brand"
                  className="w-full text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/30 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-white" />
                  <span>Download Digital Receipt (.png)</span>
                </Button>

                {onCallWaiter && (
                  <Button
                    onClick={onCallWaiter}
                    variant="outline"
                    className="border-slate-800 bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-bold px-3 py-2.5 rounded-xl flex items-center gap-1 shrink-0"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Call Waiter</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ONLINE PAYMENT MODAL ABSTRACTION */}
      <Modal
        isOpen={isPayOnlineModalOpen}
        onClose={() => setIsPayOnlineModalOpen(false)}
        title="Instant Online Table Payment 💳"
      >
        <div className="space-y-4 text-xs">
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center space-y-1">
            <span className="text-[11px] text-slate-400 uppercase font-mono">Total Payable Amount</span>
            <p className="text-2xl font-black text-emerald-400 font-mono">
              {formatCurrency(bill?.grandTotal || 0)}
            </p>
            <p className="text-[10px] text-slate-500">
              {currentRestaurant?.name || 'Restaurant'} • Table {tableNumber} (Session #{tableSession?.id})
            </p>
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-2">Select Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(['UPI', 'CARD', 'QR_CODE'] as PaymentMethod[]).map((method) => (
                <button
                  key={method}
                  onClick={() => setSelectedPaymentMethod(method)}
                  className={`p-3 rounded-xl border text-center font-bold font-mono transition-all ${
                    selectedPaymentMethod === method
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  {method === 'UPI' ? 'BHIM / UPI 📲' : method === 'CARD' ? 'Debit/Credit Card 💳' : 'QR Scan ⚡'}
                </button>
              ))}
            </div>
          </div>

          {paymentState === 'PROCESSING' ? (
            <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-center space-y-2">
              <Clock className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
              <p className="font-bold text-emerald-300">Processing Online Payment...</p>
            </div>
          ) : paymentState === 'SUCCESS' ? (
            <div className="p-4 bg-emerald-950/60 border border-emerald-500/50 rounded-2xl text-center space-y-1 text-emerald-300">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
              <p className="font-bold">Payment Verified & Paid 🎉</p>
            </div>
          ) : (
            <Button
              onClick={handleProcessOnlinePayment}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs"
            >
              Pay {formatCurrency(bill?.grandTotal || 0)} Now
            </Button>
          )}
        </div>
      </Modal>
    </Modal>
  );
};
