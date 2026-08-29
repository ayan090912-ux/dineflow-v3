import React, { useState, useEffect } from 'react';
import {
  Building2,
  Receipt,
  QrCode,
  Percent,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  Upload,
  Trash2,
  Eye,
  CreditCard,
  Hash,
  MapPin,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { Button, Card, Badge, Input } from '../../packages/ui';
import { BillingConfig, Restaurant } from '../../packages/types';
import { api } from '../../packages/api/client';

interface OwnerBillingSettingsProps {
  restaurantId: string;
  currentRestaurant: Restaurant | null;
  addToast: (type: 'success' | 'danger' | 'warning' | 'info', title: string, message?: string) => void;
  onConfigSaved?: () => void;
}

export const OwnerBillingSettings: React.FC<OwnerBillingSettingsProps> = ({
  restaurantId,
  currentRestaurant,
  addToast,
  onConfigSaved,
}) => {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [legalName, setLegalName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [state, setState] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('INV-');
  const [invoiceStartingNumber, setInvoiceStartingNumber] = useState('1001');
  const [serviceChargePercentage, setServiceChargePercentage] = useState('0');
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(false);

  // UPI State
  const [upiId, setUpiId] = useState('');
  const [upiMerchantName, setUpiMerchantName] = useState('');
  const [upiQrUrl, setUpiQrUrl] = useState('');
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [qrFileError, setQrFileError] = useState<string | null>(null);

  // Load configuration
  useEffect(() => {
    async function loadConfig() {
      setIsLoading(true);
      try {
        const data = await api.getBillingConfig(restaurantId);
        setConfig(data);
        setLegalName(data.legalName || currentRestaurant?.legalName || currentRestaurant?.name || '');
        setDisplayName(data.name || currentRestaurant?.name || '');
        setState(data.state || currentRestaurant?.state || '');
        setStateCode(data.stateCode || currentRestaurant?.stateCode || '');
        setGstin(data.gstin || currentRestaurant?.gstin || currentRestaurant?.gstNumber || '');
        setPan(data.pan || currentRestaurant?.pan || '');
        setAddress(data.address || currentRestaurant?.address || '');
        setPhone(data.phone || currentRestaurant?.phone || '');
        setEmail(data.email || currentRestaurant?.email || '');
        setInvoicePrefix(data.invoicePrefix || currentRestaurant?.invoicePrefix || 'INV-');
        setInvoiceStartingNumber(String(data.invoiceStartingNumber || currentRestaurant?.invoiceStartingNumber || 1001));
        setServiceChargePercentage(String(data.serviceChargePercentage || currentRestaurant?.serviceChargePercentage || 0));
        setServiceChargeEnabled(Boolean(data.serviceChargeEnabled || currentRestaurant?.serviceChargeEnabled));
        setUpiId(data.upiId || currentRestaurant?.upiId || '');
        setUpiMerchantName(data.upiMerchantName || currentRestaurant?.upiMerchantName || currentRestaurant?.name || '');
        setUpiQrUrl(data.upiQrUrl || currentRestaurant?.upiQrUrl || '');
        setUpiEnabled(data.upiEnabled !== false && currentRestaurant?.upiEnabled !== false);
      } catch (err) {
        console.error('Failed to load billing config:', err);
        addToast('danger', 'Error', 'Failed to load restaurant billing configuration');
      } finally {
        setIsLoading(false);
      }
    }

    if (restaurantId) {
      loadConfig();
    }
  }, [restaurantId, currentRestaurant]);

  // Handle QR File Upload
  const handleQrFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQrFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setQrFileError('Please upload a valid PNG, JPG, or WEBP image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setQrFileError('Image file must be under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setUpiQrUrl(dataUrl);
      setUpiEnabled(true);
      addToast('info', 'QR Image Uploaded', 'Remember to click Save Changes to persist.');
    };
    reader.readAsDataURL(file);
  };

  // Handle Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const updated = await api.updateBillingConfig(restaurantId, {
        legalName: legalName.trim(),
        state: state.trim(),
        stateCode: stateCode.trim(),
        gstin: gstin.trim().toUpperCase(),
        pan: pan.trim().toUpperCase(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        invoicePrefix: invoicePrefix.trim().toUpperCase(),
        invoiceStartingNumber: parseInt(invoiceStartingNumber, 10) || 1001,
        serviceChargePercentage: parseFloat(serviceChargePercentage) || 0.0,
        serviceChargeEnabled,
        upiId: upiId.trim(),
        upiMerchantName: upiMerchantName.trim() || displayName,
        upiQrUrl: upiQrUrl.trim(),
        upiEnabled,
      });

      setConfig(updated);
      addToast('success', 'Billing Settings Saved ✅', 'Restaurant invoicing and UPI configuration updated.');
      if (onConfigSaved) onConfigSaved();
    } catch (err: any) {
      console.error('Failed to save billing config:', err);
      addToast('danger', 'Save Error', err.message || 'Failed to update billing configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <Receipt className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
        <p className="font-semibold text-sm">Loading Restaurant Billing & Tax Settings...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* HEADER BANNER */}
      <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-400" />
            <span>Owner Billing & Invoicing Configuration</span>
          </h3>
          <p className="text-xs text-slate-400">
            Configure official business identity, GST details, invoice numbering sequence, and UPI merchant QR for customer checkout.
          </p>
        </div>

        <Button
          type="submit"
          disabled={isSaving}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-950/40 text-xs shrink-0 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1: LEGAL BUSINESS & GST IDENTITY */}
        <Card className="bg-slate-900 border-slate-800 p-5 rounded-2xl space-y-4">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                1. Legal Entity & GST Information
              </h4>
            </div>
            <Badge variant="outline">Server Authoritative</Badge>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Restaurant Legal Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. Dinely Hospitality LLP / Fine Dining Pvt Ltd"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                required
              />
              <p className="text-[10px] text-slate-500 mt-0.5">Printed as the registered trade entity on invoices and receipts.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  GSTIN (15-Digit)
                </label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="e.g. 27ABCDE1234F1Z5"
                  maxLength={15}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  PAN (10-Digit)
                </label>
                <input
                  type="text"
                  value={pan}
                  onChange={(e) => setPan(e.target.value)}
                  placeholder="e.g. ABCDE1234F"
                  maxLength={10}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-mono uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Maharashtra"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  State Code (GST Code)
                </label>
                <input
                  type="text"
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  placeholder="e.g. 27"
                  maxLength={5}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Official Registered Address
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Complete address printed on tax invoices..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </Card>


        {/* SECTION 2: INVOICE SEQUENCE & SERVICE CHARGE */}
        <Card className="bg-slate-900 border-slate-800 p-5 rounded-2xl space-y-4">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                2. Invoice Numbering & Surcharges
              </h4>
            </div>
            <Badge variant="outline">Deterministic Series</Badge>
          </div>

          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Invoice Prefix
                </label>
                <input
                  type="text"
                  value={invoicePrefix}
                  onChange={(e) => setInvoicePrefix(e.target.value)}
                  placeholder="e.g. INV- or DLY/"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">Prefix prepended to each bill #</p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Starting Sequence Number
                </label>
                <input
                  type="number"
                  value={invoiceStartingNumber}
                  onChange={(e) => setInvoiceStartingNumber(e.target.value)}
                  placeholder="1001"
                  min={1}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">Next generated invoice will start here</p>
              </div>
            </div>

            {/* Service Charge Box (Explicitly Separated from GST) */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-bold text-white flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-amber-400" />
                    <span>Restaurant Service Charge</span>
                  </h5>
                  <p className="text-[11px] text-slate-400">
                    Discretionary staff service surcharge (stored & taxed independently from GST).
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serviceChargeEnabled}
                    onChange={(e) => setServiceChargeEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {serviceChargeEnabled && (
                <div className="pt-2 border-t border-slate-800/80 flex items-center gap-3">
                  <div className="w-32">
                    <label className="block text-[11px] text-slate-400 font-semibold mb-1">Percentage (%)</label>
                    <input
                      type="number"
                      value={serviceChargePercentage}
                      onChange={(e) => setServiceChargePercentage(e.target.value)}
                      placeholder="e.g. 5"
                      min={0}
                      max={30}
                      step={0.5}
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono font-bold text-xs"
                    />
                  </div>
                  <div className="text-[11px] text-amber-300/80 pt-4">
                    A {serviceChargePercentage || 0}% surcharge will be applied to table subtotals.
                  </div>
                </div>
              )}
            </div>

            {/* Live Invoice Preview Box */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>Next Generated Invoice #:</span>
              <span className="font-bold text-emerald-400 text-xs">
                {invoicePrefix || 'INV-'}{invoiceStartingNumber || '1001'}
              </span>
            </div>
          </div>
        </Card>


        {/* SECTION 3: UPI DIGITAL PAYMENTS & MERCHANT QR */}
        <Card className="bg-slate-900 border-slate-800 p-5 rounded-2xl space-y-4 lg:col-span-2">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-400" />
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                3. Customer UPI QR & Digital Payment Setup
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Enable UPI Option on Customer Bill:</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={upiEnabled}
                  onChange={(e) => setUpiEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="md:col-span-2 space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Merchant UPI ID / VPA <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. restaurant@okaxis, merchant@icici, dineflow@upi"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Customers can scan your QR or copy this VPA directly to pay via GPay, PhonePe, Paytm, or BHIM.
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Merchant Display Name
                </label>
                <input
                  type="text"
                  value={upiMerchantName}
                  onChange={(e) => setUpiMerchantName(e.target.value)}
                  placeholder="e.g. Dinely Fine Dining Cafe"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {/* Upload QR File Box */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Upload Merchant UPI QR Code Image
                </label>
                <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 bg-slate-950 rounded-xl p-4 text-center cursor-pointer transition-all relative">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleQrFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="space-y-1.5 pointer-events-none">
                    <Upload className="w-5 h-5 text-slate-400 mx-auto" />
                    <p className="font-bold text-white text-xs">Click or drag & drop to upload UPI QR image</p>
                    <p className="text-[10px] text-slate-500">Supported formats: PNG, JPG, WEBP (Max 2MB)</p>
                  </div>
                </div>
                {qrFileError && (
                  <p className="text-[11px] text-rose-400 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{qrFileError}</span>
                  </p>
                )}
              </div>
            </div>

            {/* LIVE UPI QR PREVIEW */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-4 flex flex-col items-center justify-center text-center space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                Customer QR Preview
              </span>

              {upiQrUrl ? (
                <div className="relative group">
                  <div className="w-40 h-40 bg-white p-2.5 rounded-2xl shadow-xl flex items-center justify-center overflow-hidden">
                    <img
                      src={upiQrUrl}
                      alt="Merchant UPI QR"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setUpiQrUrl('')}
                    className="absolute top-1 right-1 p-1 bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove QR Image"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-40 h-40 bg-slate-900 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-600 p-4 space-y-1">
                  <QrCode className="w-8 h-8 text-slate-700" />
                  <span className="text-[10px] text-slate-500">No QR uploaded</span>
                </div>
              )}

              <div className="space-y-0.5 font-mono text-[10px]">
                <p className="font-bold text-white">{upiMerchantName || displayName || 'Merchant'}</p>
                <p className="text-emerald-400 font-semibold">{upiId || 'No UPI ID Set'}</p>
                <p className="text-slate-500">{upiEnabled ? '● UPI Enabled' : '○ UPI Disabled'}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* FOOTER ACTION */}
      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={isSaving}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-950/40 text-xs cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving Changes...' : 'Save All Billing Settings'}</span>
        </Button>
      </div>
    </form>
  );
};
