import React, { useState, useEffect, useRef } from 'react';
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
  Smartphone,
  Check,
} from 'lucide-react';
import { Button, Card, Badge, Input, QRCodeDisplay } from '../../packages/ui';
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
  // Initialize state directly from currentRestaurant to prevent initial spinner block
  const [legalName, setLegalName] = useState(
    currentRestaurant?.legalName || currentRestaurant?.name || 'CAFE.CO'
  );
  const [displayName, setDisplayName] = useState(currentRestaurant?.name || 'CAFE.CO');
  const [state, setState] = useState(currentRestaurant?.state || '');
  const [stateCode, setStateCode] = useState(currentRestaurant?.stateCode || '');
  const [gstin, setGstin] = useState(currentRestaurant?.gstin || currentRestaurant?.gstNumber || '');
  const [pan, setPan] = useState(currentRestaurant?.pan || '');
  const [address, setAddress] = useState(currentRestaurant?.address || '');
  const [phone, setPhone] = useState(currentRestaurant?.phone || '');
  const [email, setEmail] = useState(currentRestaurant?.email || '');
  const [invoicePrefix, setInvoicePrefix] = useState(currentRestaurant?.invoicePrefix || 'INV-');
  const [invoiceStartingNumber, setInvoiceStartingNumber] = useState(
    String(currentRestaurant?.invoiceStartingNumber || 1001)
  );
  const [serviceChargePercentage, setServiceChargePercentage] = useState(
    String(currentRestaurant?.serviceChargePercentage || 0)
  );
  const [serviceChargeEnabled, setServiceChargeEnabled] = useState(
    Boolean(currentRestaurant?.serviceChargeEnabled)
  );

  // UPI State
  const [upiId, setUpiId] = useState(currentRestaurant?.upiId || '');
  const [upiMerchantName, setUpiMerchantName] = useState(
    currentRestaurant?.upiMerchantName || currentRestaurant?.name || 'CAFE.CO'
  );
  const [upiQrUrl, setUpiQrUrl] = useState(currentRestaurant?.upiQrUrl || '');
  const [upiEnabled, setUpiEnabled] = useState(
    currentRestaurant?.upiEnabled !== undefined ? Boolean(currentRestaurant?.upiEnabled) : true
  );

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [qrFileError, setQrFileError] = useState<string | null>(null);

  const hasFetchedRef = useRef(false);

  // Load configuration from backend on mount once per restaurantId
  useEffect(() => {
    let isMounted = true;

    async function loadConfig() {
      if (hasFetchedRef.current) return;
      try {
        const data = await api.getBillingConfig(restaurantId);
        if (!isMounted) return;

        hasFetchedRef.current = true;
        if (data) {
          if (data.legalName) setLegalName(data.legalName);
          if (data.name) setDisplayName(data.name);
          if (data.state) setState(data.state);
          if (data.stateCode) setStateCode(data.stateCode);
          if (data.gstin) setGstin(data.gstin);
          if (data.pan) setPan(data.pan);
          if (data.address) setAddress(data.address);
          if (data.phone) setPhone(data.phone);
          if (data.email) setEmail(data.email);
          if (data.invoicePrefix) setInvoicePrefix(data.invoicePrefix);
          if (data.invoiceStartingNumber) setInvoiceStartingNumber(String(data.invoiceStartingNumber));
          if (data.serviceChargePercentage !== undefined)
            setServiceChargePercentage(String(data.serviceChargePercentage));
          if (data.serviceChargeEnabled !== undefined)
            setServiceChargeEnabled(Boolean(data.serviceChargeEnabled));
          if (data.upiId) setUpiId(data.upiId);
          if (data.upiMerchantName) setUpiMerchantName(data.upiMerchantName);
          if (data.upiQrUrl) setUpiQrUrl(data.upiQrUrl);
          if (data.upiEnabled !== undefined) setUpiEnabled(Boolean(data.upiEnabled));
        }
      } catch (err) {
        console.warn('Failed to load remote billing config, using local cache:', err);
      }
    }

    if (restaurantId) {
      loadConfig();
    }

    return () => {
      isMounted = false;
    };
  }, [restaurantId]);

  // Handle QR File Upload
  const handleQrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setIsUploadingQr(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setUpiQrUrl(dataUrl);
      setUpiEnabled(true);

      try {
        const uploadRes = await api.uploadUpiQrImage(restaurantId, dataUrl, upiMerchantName || displayName, upiId);
        if (uploadRes && uploadRes.upiQrUrl) {
          setUpiQrUrl(uploadRes.upiQrUrl);
        }
        addToast('success', 'UPI QR Image Uploaded & Verified ✅', 'Your custom standee QR code is now live and saved.');
      } catch (err: any) {
        console.warn('Remote QR upload failed, stored locally:', err);
        addToast('info', 'QR Image Stored Locally', 'Click Save Configuration to confirm.');
      } finally {
        setIsUploadingQr(false);
      }
    };
    reader.onerror = () => {
      setQrFileError('Failed to read image file.');
      setIsUploadingQr(false);
    };
    reader.readAsDataURL(file);
  };

  // Handle Remove Custom QR
  const handleRemoveCustomQr = async () => {
    setUpiQrUrl('');
    try {
      await api.updateBillingConfig(restaurantId, { upiQrUrl: '' });
      addToast('info', 'Custom QR Removed', 'Switched back to auto-generated vector QR.');
    } catch (e) {
      // Local state is already cleared
    }
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
        invoicePrefix: invoicePrefix.trim().toUpperCase() || 'INV-',
        invoiceStartingNumber: parseInt(invoiceStartingNumber, 10) || 1001,
        serviceChargePercentage: parseFloat(serviceChargePercentage) || 0.0,
        serviceChargeEnabled,
        upiId: upiId.trim(),
        upiMerchantName: upiMerchantName.trim() || displayName || legalName,
        upiQrUrl: upiQrUrl.trim(),
        upiEnabled,
      });

      addToast('success', 'Billing & UPI Settings Saved ✅', 'Invoicing rules, GST details, and UPI checkout updated.');
      if (onConfigSaved) onConfigSaved();
    } catch (err: any) {
      console.error('Failed to save billing config:', err);
      addToast('danger', 'Save Error', err.message || 'Failed to update billing configuration.');
    } finally {
      setIsSaving(false);
    }
  };

  // Generate dynamic standard UPI URL
  const dynamicUpiPayload = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiMerchantName || displayName || 'Merchant')}&cu=INR`
    : '';

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* HEADER BANNER */}
      <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 rounded-2xl border border-slate-800 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
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
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-950/40 text-xs shrink-0 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1: LEGAL BUSINESS & GST IDENTITY */}
        <Card className="bg-slate-900/90 border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                1. Legal Entity & GST Information
              </h4>
            </div>
            <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 font-mono">
              Server Authoritative
            </Badge>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Restaurant Legal Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. CAFE.CO Hospitality LLP / Fine Dining Pvt Ltd"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-semibold"
                required
              />
              <p className="text-[10px] text-slate-500 mt-1">Printed as the registered trade entity on invoices and receipts.</p>
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
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono uppercase"
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
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono uppercase"
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
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
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
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
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
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </Card>


        {/* SECTION 2: INVOICE SEQUENCE & SERVICE CHARGE */}
        <Card className="bg-slate-900/90 border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                2. Invoice Numbering & Surcharges
              </h4>
            </div>
            <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 font-mono">
              Deterministic Series
            </Badge>
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
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                />
                <p className="text-[10px] text-slate-500 mt-1">Prefix prepended to each bill #</p>
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
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">Next generated invoice will start here</p>
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
        <Card className="bg-slate-900/90 border-slate-800 p-6 rounded-2xl space-y-4 lg:col-span-2 shadow-xl">
          <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-400" />
              <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                3. Customer UPI QR & Digital Payment Setup
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300 font-medium">Enable UPI on Customer Bill:</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={upiEnabled}
                  onChange={(e) => setUpiEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Merchant UPI ID / VPA <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. cafe@okaxis, restaurant@icici, dineflow@upi"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-emerald-400 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono font-bold text-sm"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Customers scan this QR to pay directly via Google Pay, PhonePe, Paytm, or BHIM.
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
                  placeholder="e.g. CAFE.CO Fine Dining"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              {/* Upload Custom QR Image */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Upload Custom Standee QR Image (Optional)
                </label>
                <div className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 bg-slate-950 rounded-xl p-4 text-center cursor-pointer transition-all relative">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleQrFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    disabled={isUploadingQr}
                  />
                  <div className="space-y-1.5 pointer-events-none">
                    <Upload className={`w-5 h-5 ${isUploadingQr ? 'animate-bounce text-emerald-400' : 'text-slate-400'} mx-auto`} />
                    <p className="font-bold text-white text-xs">
                      {isUploadingQr ? 'Uploading & Processing QR Image...' : 'Click or drag & drop custom QR code standee image'}
                    </p>
                    <p className="text-[10px] text-slate-500">Supported: PNG, JPG, WEBP (Max 2MB) — or leave blank to use auto-generated QR</p>
                  </div>
                </div>
                {qrFileError && (
                  <p className="text-[11px] text-rose-400 font-medium mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{qrFileError}</span>
                  </p>
                )}
              </div>
            </div>

            {/* LIVE UPI QR PREVIEW */}
            <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 flex flex-col items-center justify-center text-center space-y-3 shadow-inner">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Live Customer Checkout Preview</span>
              </span>

              {upiQrUrl ? (
                <div className="relative group">
                  <div className="w-44 h-44 bg-white p-2.5 rounded-2xl shadow-2xl flex items-center justify-center overflow-hidden">
                    <img
                      src={upiQrUrl}
                      alt="Merchant UPI QR"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCustomQr}
                    className="absolute -top-2 -right-2 p-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow-lg transition-transform hover:scale-110 cursor-pointer"
                    title="Remove Custom Image"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : upiId ? (
                <div className="w-44 h-44 bg-white p-2.5 rounded-2xl shadow-2xl flex items-center justify-center">
                  <QRCodeDisplay
                    value={dynamicUpiPayload}
                    size={160}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              ) : (
                <div className="w-44 h-44 bg-slate-900 border-2 border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-600 p-4 space-y-1.5">
                  <QrCode className="w-8 h-8 text-slate-700" />
                  <span className="text-[10px] text-slate-500 font-semibold">Enter UPI ID to generate live QR</span>
                </div>
              )}

              <div className="space-y-1 font-mono text-[11px] w-full">
                <p className="font-bold text-white truncate">{upiMerchantName || displayName || legalName || 'Merchant'}</p>
                <p className="text-emerald-400 font-bold break-all">{upiId || 'No UPI ID Set'}</p>
                <Badge variant={upiEnabled ? 'success' : 'outline'} className="text-[10px] py-0.5 mt-1">
                  {upiEnabled ? '● UPI Checkout Active' : '○ UPI Checkout Disabled'}
                </Badge>
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
          className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 shadow-xl shadow-emerald-950/40 text-xs cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving Changes...' : 'Save All Billing & UPI Settings'}</span>
        </Button>
      </div>
    </form>
  );
};
