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
    currentRestaurant?.legalName || currentRestaurant?.name || ''
  );
  const [displayName, setDisplayName] = useState(currentRestaurant?.name || '');
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
    currentRestaurant?.upiMerchantName || currentRestaurant?.name || ''
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
      <div className="p-5 bg-[#12151b] rounded-xl border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-amber-400" />
            <span>Billing & Invoice Settings</span>
          </h3>
          <p className="text-xs text-white/50">
            Configure your registered business details, GST numbers, receipt numbering sequence, and UPI checkout.
          </p>
        </div>

        <Button
          type="submit"
          disabled={isSaving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 text-xs shrink-0"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SECTION 1: LEGAL BUSINESS & GST IDENTITY */}
        <div className="bg-[#12151b] border border-white/[0.08] p-6 rounded-xl space-y-4 shadow-sm">
          <div className="border-b border-white/[0.06] pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h4 className="font-medium text-white text-xs uppercase tracking-wider">
                1. Legal Entity & Tax Information
              </h4>
            </div>
            <span className="text-[10px] text-white/60 font-mono px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">
              Official Record
            </span>
          </div>

          <div className="space-y-3.5 text-xs">
            <div>
              <label className="block text-white/80 font-medium mb-1">
                Restaurant Legal Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="e.g. Spice Route Hospitality LLP"
                className="w-full px-3 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60 font-medium"
                required
              />
              <p className="text-[10px] text-white/40 mt-1">Printed as the registered trade name on invoices and guest receipts.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/80 font-medium mb-1">
                  GSTIN (15-Digit)
                </label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  placeholder="e.g. 27ABCDE1234F1Z5"
                  maxLength={15}
                  className="w-full px-3 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60 font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-white/80 font-medium mb-1">
                  PAN (10-Digit)
                </label>
                <input
                  type="text"
                  value={pan}
                  onChange={(e) => setPan(e.target.value)}
                  placeholder="e.g. ABCDE1234F"
                  maxLength={10}
                  className="w-full px-3 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60 font-mono uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/80 font-medium mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="e.g. Maharashtra"
                  className="w-full px-3 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60"
                />
              </div>

              <div>
                <label className="block text-white/80 font-medium mb-1">
                  State Code (GST Code)
                </label>
                <input
                  type="text"
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  placeholder="e.g. 27"
                  maxLength={5}
                  className="w-full px-3 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-white/80 font-medium mb-1">
                Official Registered Address
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Complete address printed on tax invoices..."
                rows={2}
                className="w-full px-3 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: INVOICE SEQUENCE & SERVICE CHARGE */}
        <div className="bg-[#12151b] border border-white/[0.08] p-6 rounded-xl space-y-4 shadow-sm">
          <div className="border-b border-white/[0.06] pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-400" />
              <h4 className="font-medium text-white text-xs uppercase tracking-wider">
                2. Invoice Sequence & Service Charge
              </h4>
            </div>
            <span className="text-[10px] text-amber-300 font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
              Active Series
            </span>
          </div>

          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-white/80 font-medium mb-1">
                  Invoice Prefix
                </label>
                <input
                  type="text"
                  value={invoicePrefix}
                  onChange={(e) => setInvoicePrefix(e.target.value)}
                  placeholder="e.g. INV- or DLY/"
                  className="w-full px-3 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-lg text-amber-400 placeholder:text-white/30 focus:outline-none focus:border-amber-400/60 font-mono font-semibold"
                />
                <p className="text-[10px] text-white/40 mt-1">Prepended to each bill number</p>
              </div>

              <div>
                <label className="block text-white/80 font-medium mb-1">
                  Starting Sequence Number
                </label>
                <input
                  type="number"
                  value={invoiceStartingNumber}
                  onChange={(e) => setInvoiceStartingNumber(e.target.value)}
                  placeholder="1001"
                  min={1}
                  className="w-full px-3 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60 font-mono"
                />
                <p className="text-[10px] text-white/40 mt-1">Next generated invoice begins here</p>
              </div>
            </div>

            {/* Service Charge Box */}
            <div className="p-4 bg-[#0b0d11] rounded-xl border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="font-medium text-white flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-amber-400" />
                    <span>Restaurant Service Charge</span>
                  </h5>
                  <p className="text-[11px] text-white/50">
                    Discretionary staff service charge (calculated separately from GST).
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={serviceChargeEnabled}
                    onChange={(e) => setServiceChargeEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {serviceChargeEnabled && (
                <div className="pt-2 border-t border-white/[0.06] flex items-center gap-3">
                  <div className="w-32">
                    <label className="block text-[11px] text-white/50 font-medium mb-1">Percentage (%)</label>
                    <input
                      type="number"
                      value={serviceChargePercentage}
                      onChange={(e) => setServiceChargePercentage(e.target.value)}
                      placeholder="e.g. 5"
                      min={0}
                      max={30}
                      step={0.5}
                      className="w-full px-3 py-1.5 bg-[#12151b] border border-white/[0.08] rounded-lg text-white font-mono font-medium text-xs"
                    />
                  </div>
                  <div className="text-[11px] text-amber-300/80 pt-4">
                    A {serviceChargePercentage || 0}% surcharge will be applied to table subtotals.
                  </div>
                </div>
              )}
            </div>

            {/* Live Invoice Preview Box */}
            <div className="p-3 bg-white/[0.02] rounded-xl border border-white/[0.06] text-[11px] font-mono text-white/60 flex items-center justify-between">
              <span>Next Generated Invoice:</span>
              <span className="font-semibold text-white text-xs">
                {invoicePrefix || 'INV-'}{invoiceStartingNumber || '1001'}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 3: UPI DIGITAL PAYMENTS & MERCHANT QR */}
        <div className="bg-[#12151b] border border-white/[0.08] p-6 rounded-xl space-y-4 lg:col-span-2 shadow-sm">
          <div className="border-b border-white/[0.06] pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-400" />
              <h4 className="font-medium text-white text-xs uppercase tracking-wider">
                3. Customer UPI QR & Digital Payment
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/60 font-medium">Enable UPI at Checkout:</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={upiEnabled}
                  onChange={(e) => setUpiEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="block text-white/80 font-medium mb-1">
                  Merchant UPI ID / VPA <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="e.g. restaurant@icici, cafe@upi"
                  className="w-full px-3 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-lg text-amber-400 placeholder:text-white/30 focus:outline-none focus:border-amber-400/60 font-mono font-semibold text-sm"
                />
                <p className="text-[10px] text-white/40 mt-1">
                  Guests scan this code on their bills to pay directly via Google Pay, PhonePe, Paytm, or BHIM.
                </p>
              </div>

              <div>
                <label className="block text-white/80 font-medium mb-1">
                  Merchant Display Name
                </label>
                <input
                  type="text"
                  value={upiMerchantName}
                  onChange={(e) => setUpiMerchantName(e.target.value)}
                  placeholder="e.g. Spice Route Fine Dining"
                  className="w-full px-3 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-amber-400/60 font-medium"
                />
              </div>

              {/* Upload Custom QR Image */}
              <div>
                <label className="block text-white/80 font-medium mb-1">
                  Upload Custom Standee QR Image (Optional)
                </label>
                <div className="border border-dashed border-white/[0.12] hover:border-amber-400/50 bg-[#0b0d11] rounded-xl p-4 text-center cursor-pointer transition-all relative">
                  <input
                    id="owner-qr-file-input"
                    data-testid="owner-qr-file-input"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleQrFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    disabled={isUploadingQr}
                  />
                  <div className="space-y-1.5 pointer-events-none">
                    <Upload className={`w-5 h-5 ${isUploadingQr ? 'animate-bounce text-amber-400' : 'text-white/40'} mx-auto`} />
                    <p className="font-medium text-white text-xs">
                      {isUploadingQr ? 'Uploading & Processing QR Image...' : 'Click or drag & drop custom QR standee image'}
                    </p>
                    <p className="text-[10px] text-white/40">PNG, JPG, WEBP (Max 2MB) — or leave blank to use dynamic vector QR</p>
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
            <div className="bg-[#0b0d11] rounded-xl border border-white/[0.08] p-5 flex flex-col items-center justify-center text-center space-y-3">
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/50 font-mono flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                <span>Live Checkout Preview</span>
              </span>

              {upiQrUrl ? (
                <div className="relative group">
                  <div className="w-40 h-40 bg-white p-2.5 rounded-xl shadow-lg flex items-center justify-center overflow-hidden">
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
                <div className="w-40 h-40 bg-white p-2.5 rounded-xl shadow-lg flex items-center justify-center">
                  <QRCodeDisplay
                    value={dynamicUpiPayload}
                    size={144}
                  />
                </div>
              ) : (
                <div className="w-40 h-40 bg-[#12151b] border border-dashed border-white/[0.08] rounded-xl flex flex-col items-center justify-center text-white/30 p-4 space-y-1.5">
                  <QrCode className="w-7 h-7 text-white/20" />
                  <span className="text-[10px] text-white/40">Enter UPI ID to generate live QR</span>
                </div>
              )}

              <div className="space-y-0.5 font-mono text-[11px] w-full">
                <p className="font-semibold text-white truncate">{upiMerchantName || displayName || legalName || 'Merchant'}</p>
                <p className="text-amber-400 font-medium break-all">{upiId || 'No UPI ID Set'}</p>
                <div className="pt-1">
                  <span className={`inline-block text-[10px] px-2 py-0.5 rounded font-mono ${upiEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/[0.04] text-white/40 border border-white/[0.08]'}`}>
                    {upiEnabled ? 'UPI Checkout Active' : 'UPI Checkout Disabled'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER ACTION */}
      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={isSaving}
          className="bg-amber-500 hover:bg-amber-400 text-black font-semibold px-6 py-2.5 rounded-lg flex items-center gap-2 text-xs"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving Changes...' : 'Save All Billing & UPI Settings'}</span>
        </Button>
      </div>
    </form>
  );
};

