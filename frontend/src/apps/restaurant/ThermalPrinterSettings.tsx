import React, { useState, useEffect } from 'react';
import {
  Printer,
  Wifi,
  Usb,
  Bluetooth,
  Globe,
  Plus,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Edit2,
  Play,
  FileText,
  Copy,
  Sparkles,
  ShieldAlert,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { Card, Button, Input, Modal, Badge } from '../../packages/ui';
import { RestaurantPrinter, PrinterConnectionType, PrinterPaperWidth, PrintJobResponse } from '../../packages/types';
import { api } from '../../packages/api/client';

interface ThermalPrinterSettingsProps {
  restaurantId: string;
  addToast: (type: 'success' | 'danger' | 'warning' | 'info', title: string, message?: string) => void;
}

export const ThermalPrinterSettings: React.FC<ThermalPrinterSettingsProps> = ({
  restaurantId,
  addToast,
}) => {
  const [printers, setPrinters] = useState<RestaurantPrinter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<RestaurantPrinter | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [connectionType, setConnectionType] = useState<PrinterConnectionType>('BROWSER');
  const [paperWidth, setPaperWidth] = useState<PrinterPaperWidth>('80mm');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('9100');
  const [bridgeUrl, setBridgeUrl] = useState('http://localhost:9191');
  const [isDefault, setIsDefault] = useState(false);
  const [autoPrintOnBill, setAutoPrintOnBill] = useState(false);
  const [copies, setCopies] = useState('1');
  const [isSaving, setIsSaving] = useState(false);

  // Testing & Preview State
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewPaperWidth, setPreviewPaperWidth] = useState<PrinterPaperWidth>('80mm');

  const loadPrinters = async () => {
    if (!restaurantId) return;
    setIsLoading(true);
    try {
      const data = await api.getPrinters(restaurantId);
      setPrinters(data);
    } catch (e: any) {
      console.warn('Failed to load printers:', e);
      addToast('warning', 'Printers Offline', 'Unable to fetch hardware printers.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPrinters();
  }, [restaurantId]);

  const handleOpenAdd = () => {
    setEditingPrinter(null);
    setName('Front Desk Thermal POS');
    setConnectionType('BROWSER');
    setPaperWidth('80mm');
    setIpAddress('');
    setPort('9100');
    setBridgeUrl('http://localhost:9191');
    setIsDefault(printers.length === 0);
    setAutoPrintOnBill(false);
    setCopies('1');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: RestaurantPrinter) => {
    setEditingPrinter(p);
    setName(p.name);
    setConnectionType(p.connectionType);
    setPaperWidth(p.paperWidth);
    setIpAddress(p.ipAddress || '');
    setPort(String(p.port || 9100));
    setBridgeUrl(p.bridgeUrl || 'http://localhost:9191');
    setIsDefault(p.isDefault);
    setAutoPrintOnBill(p.autoPrintOnBill);
    setCopies(String(p.copies || 1));
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      addToast('danger', 'Validation Error', 'Printer name is required.');
      return;
    }

    if (connectionType === 'NETWORK_LAN' && !ipAddress.trim()) {
      addToast('danger', 'Validation Error', 'IP address is required for LAN thermal printer.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<RestaurantPrinter> = {
        name: name.trim(),
        connectionType,
        paperWidth,
        ipAddress: ipAddress.trim() || undefined,
        port: parseInt(port) || 9100,
        bridgeUrl: bridgeUrl.trim() || undefined,
        isDefault,
        autoPrintOnBill,
        copies: parseInt(copies) || 1,
      };

      if (editingPrinter) {
        await api.updatePrinter(restaurantId, editingPrinter.id, payload);
        addToast('success', 'Printer Updated', `Configuration for "${name}" saved.`);
      } else {
        await api.createPrinter(restaurantId, payload);
        addToast('success', 'Printer Added', `Thermal printer "${name}" profile created.`);
      }

      setIsModalOpen(false);
      await loadPrinters();
    } catch (err: any) {
      addToast('danger', 'Save Failed', err.message || 'Could not save printer profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (printerId: string, printerName: string) => {
    if (!confirm(`Are you sure you want to remove printer "${printerName}"?`)) return;
    try {
      await api.deletePrinter(restaurantId, printerId);
      addToast('info', 'Printer Removed', `"${printerName}" has been deactivated.`);
      await loadPrinters();
    } catch (err: any) {
      addToast('danger', 'Delete Failed', err.message || 'Could not remove printer.');
    }
  };

  const handleTestPrint = async (printer: RestaurantPrinter) => {
    setTestingPrinterId(printer.id);
    try {
      const res: PrintJobResponse = await api.testPrint(restaurantId, printer.id);
      if (res.success) {
        addToast('success', 'Test Print Dispatched', res.message || 'Test ticket printed.');
        // If browser printer, invoke browser print dialog
        if (printer.connectionType === 'BROWSER') {
          window.print();
        }
      } else {
        addToast('danger', 'Print Failed', res.message || 'Thermal printer unreachable.');
      }
      await loadPrinters();
    } catch (err: any) {
      addToast('danger', 'Print Error', err.message || 'Could not dispatch test print.');
    } finally {
      setTestingPrinterId(null);
    }
  };

  const getConnectionIcon = (type: PrinterConnectionType) => {
    switch (type) {
      case 'NETWORK_LAN':
        return <Wifi className="w-4 h-4 text-cyan-400" />;
      case 'USB_BRIDGE':
        return <Usb className="w-4 h-4 text-amber-400" />;
      case 'BLUETOOTH':
        return <Bluetooth className="w-4 h-4 text-blue-400" />;
      default:
        return <Globe className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#12151b] p-5 rounded-2xl border border-[#1e232e]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Thermal Receipt Printers & ESC/POS
                <Badge variant="success" className="text-[10px]">Production Hardware</Badge>
              </h2>
              <p className="text-xs text-slate-400">
                Configure Network LAN (port 9100), USB Bridge Agent, Bluetooth, or Universal Browser thermal printing (58mm / 80mm).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setPreviewModalOpen(true)}
            variant="outline"
            className="border-slate-800 text-slate-300 text-xs flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sample Receipt Preview</span>
          </Button>

          <Button
            onClick={handleOpenAdd}
            variant="brand"
            className="text-xs font-bold flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Thermal Printer</span>
          </Button>
        </div>
      </div>

      {/* PRINTERS LIST */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-400 text-sm">
          <div className="inline-block animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full mb-2"></div>
          <p>Scanning configured thermal printer hardware profiles...</p>
        </div>
      ) : printers.length === 0 ? (
        <Card className="bg-[#12151b] border-[#1e232e] p-8 text-center space-y-3">
          <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center mx-auto text-slate-500">
            <Printer className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-white">No Thermal Printers Configured</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Add a thermal printer to enable one-click ESC/POS receipt generation, dynamic UPI payment QR printouts, and automated KOT/Bill dispatch.
          </p>
          <Button onClick={handleOpenAdd} variant="brand" className="text-xs font-bold mt-2">
            Add Default Thermal Printer (80mm)
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {printers.map((p) => (
            <Card
              key={p.id}
              className={`p-4 bg-[#12151b] border transition-all ${
                p.isDefault ? 'border-emerald-500/40 shadow-sm' : 'border-[#1e232e]'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                    {getConnectionIcon(p.connectionType)}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm flex items-center gap-1.5">
                      {p.name}
                      {p.isDefault && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono font-normal">
                          DEFAULT
                        </span>
                      )}
                    </h4>
                    <span className="text-[11px] font-mono text-slate-400 uppercase">
                      {p.connectionType.replace('_', ' ')} • {p.paperWidth}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                    p.status === 'ONLINE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {p.status}
                </span>
              </div>

              {/* Details & Specs */}
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1.5 font-mono text-[11px] mb-3">
                {p.connectionType === 'NETWORK_LAN' && (
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Socket IP:</span>
                    <span className="font-semibold text-cyan-300">{p.ipAddress}:{p.port || 9100}</span>
                  </div>
                )}
                {p.connectionType === 'USB_BRIDGE' && (
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Bridge URL:</span>
                    <span className="font-semibold text-amber-300 truncate max-w-[140px]">{p.bridgeUrl}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Paper Roll:</span>
                  <span>{p.paperWidth === '58mm' ? '58 mm (32 col)' : '80 mm (48 col)'}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Copies:</span>
                  <span>{p.copies} {p.copies === 1 ? 'copy' : 'copies'}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Auto-Print on Bill:</span>
                  <span className={p.autoPrintOnBill ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {p.autoPrintOnBill ? 'ENABLED' : 'MANUAL ONLY'}
                  </span>
                </div>
                {p.lastTestPrintedAt && (
                  <div className="flex justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
                    <span>Last Test:</span>
                    <span>{new Date(p.lastTestPrintedAt).toLocaleTimeString()}</span>
                  </div>
                )}
                {p.lastErrorMessage && (
                  <div className="text-[10px] text-rose-400 pt-1 border-t border-slate-900 truncate">
                    Err: {p.lastErrorMessage}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-1 gap-2">
                <Button
                  onClick={() => handleTestPrint(p)}
                  disabled={testingPrinterId === p.id}
                  variant="outline"
                  className="text-xs flex-1 py-1.5 border-slate-800 text-emerald-400 hover:bg-emerald-500/10"
                >
                  {testingPrinterId === p.id ? (
                    <span className="animate-pulse">Testing...</span>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5">
                      <Play className="w-3 h-3" /> Test Print
                    </span>
                  )}
                </Button>

                <Button
                  onClick={() => handleOpenEdit(p)}
                  variant="outline"
                  className="px-2.5 py-1.5 border-slate-800 text-slate-300 hover:text-white"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>

                <Button
                  onClick={() => handleDelete(p.id, p.name)}
                  variant="outline"
                  className="px-2.5 py-1.5 border-slate-800 text-rose-400 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* HARDWARE CONNECTION GUIDE */}
      <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800/80 space-y-2">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-cyan-400" />
          Supported Connection Methods & Hardware Realities
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px] text-slate-400 font-mono">
          <div className="p-3 bg-[#12151b] rounded-xl border border-slate-800 space-y-1">
            <strong className="text-cyan-400 block font-sans">Network / LAN</strong>
            Direct raw TCP socket to Port 9100. Best for reliable multi-terminal printing from cloud servers.
          </div>
          <div className="p-3 bg-[#12151b] rounded-xl border border-slate-800 space-y-1">
            <strong className="text-amber-400 block font-sans">USB Local Bridge</strong>
            Local lightweight agent running on POS PC (<code className="text-slate-300">http://localhost:9191</code>) for direct USB ESC/POS forwarding.
          </div>
          <div className="p-3 bg-[#12151b] rounded-xl border border-slate-800 space-y-1">
            <strong className="text-blue-400 block font-sans">Bluetooth ESC/POS</strong>
            Wireless battery-powered thermal printers paired via Web Bluetooth on supported Chrome/Android devices.
          </div>
          <div className="p-3 bg-[#12151b] rounded-xl border border-slate-800 space-y-1">
            <strong className="text-emerald-400 block font-sans">Browser Fallback</strong>
            Universal, zero-driver CSS thermal print formatted for 58mm/80mm rolls. Works on all devices.
          </div>
        </div>
      </div>

      {/* ADD / EDIT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingPrinter ? 'Edit Thermal Printer Profile' : 'Configure New Thermal Printer'}
      >
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="block text-[11px] text-slate-400 font-medium mb-1">Printer Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cashier Counter Thermal 80mm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 font-medium mb-1">Connection Type</label>
              <select
                value={connectionType}
                onChange={(e) => setConnectionType(e.target.value as PrinterConnectionType)}
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 text-xs"
              >
                <option value="BROWSER">Browser Print (Universal)</option>
                <option value="NETWORK_LAN">Network / LAN (Raw TCP Port 9100)</option>
                <option value="USB_BRIDGE">USB Local Print Bridge</option>
                <option value="BLUETOOTH">Bluetooth Thermal</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 font-medium mb-1">Paper Roll Width</label>
              <select
                value={paperWidth}
                onChange={(e) => setPaperWidth(e.target.value as PrinterPaperWidth)}
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg p-2 text-xs"
              >
                <option value="80mm">80 mm (Standard POS - 48 cols)</option>
                <option value="58mm">58 mm (Compact Roll - 32 cols)</option>
              </select>
            </div>
          </div>

          {connectionType === 'NETWORK_LAN' && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
              <div className="col-span-2">
                <label className="block text-[10px] text-slate-400 font-mono mb-1">Printer IP Address *</label>
                <Input
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="192.168.1.150"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-mono mb-1">Port</label>
                <Input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="9100"
                />
              </div>
            </div>
          )}

          {connectionType === 'USB_BRIDGE' && (
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <label className="block text-[10px] text-slate-400 font-mono mb-1">Local Bridge Agent Endpoint</label>
              <Input
                value={bridgeUrl}
                onChange={(e) => setBridgeUrl(e.target.value)}
                placeholder="http://localhost:9191"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] text-slate-400 font-medium mb-1">Copies per Bill</label>
              <Input
                type="number"
                min="1"
                max="5"
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
              />
            </div>

            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-800 text-emerald-500"
                />
                <span>Set as Default Printer</span>
              </label>

              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPrintOnBill}
                  onChange={(e) => setAutoPrintOnBill(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-800 text-emerald-500"
                />
                <span>Auto-print when Bill is requested</span>
              </label>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <Button
              type="button"
              onClick={() => setIsModalOpen(false)}
              variant="outline"
              className="border-slate-800 text-slate-300 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              variant="brand"
              className="text-xs font-bold"
            >
              {isSaving ? 'Saving...' : editingPrinter ? 'Update Printer' : 'Save Printer'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* SAMPLE RECEIPT PREVIEW MODAL */}
      <Modal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title="Thermal ESC/POS Receipt Preview"
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400 font-medium">Select Paper Width:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreviewPaperWidth('80mm')}
                className={`px-3 py-1 rounded-lg font-mono text-xs ${
                  previewPaperWidth === '80mm'
                    ? 'bg-emerald-500 text-black font-bold'
                    : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                80 mm (48 cols)
              </button>
              <button
                type="button"
                onClick={() => setPreviewPaperWidth('58mm')}
                className={`px-3 py-1 rounded-lg font-mono text-xs ${
                  previewPaperWidth === '58mm'
                    ? 'bg-emerald-500 text-black font-bold'
                    : 'bg-slate-900 text-slate-400 border border-slate-800'
                }`}
              >
                58 mm (32 cols)
              </button>
            </div>
          </div>

          {/* SIMULATED THERMAL TICKET */}
          <div
            className={`mx-auto bg-white text-black p-4 font-mono shadow-2xl rounded-sm text-[11px] leading-tight space-y-2 border-t-8 border-slate-300 ${
              previewPaperWidth === '58mm' ? 'max-w-[260px]' : 'max-w-[340px]'
            }`}
          >
            <div className="text-center space-y-0.5">
              <p className="font-bold text-sm tracking-wide">DINEFLOW BISTRO</p>
              <p className="text-[10px]">12/A PARK STREET, KOLKATA</p>
              <p className="text-[10px]">GSTIN: 19AAACD1234F1Z5</p>
              <p className="text-[10px] text-gray-600">TEL: +91 98765 43210</p>
            </div>

            <div className="border-b border-black border-dashed pb-1 text-[10px]">
              <div className="flex justify-between">
                <span>INV: INV-2026-1042</span>
                <span>TABLE: T-04</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>{new Date().toLocaleDateString('en-IN')}</span>
                <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {/* LINE ITEMS */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold border-b border-black pb-0.5 text-[10px]">
                <span>ITEM</span>
                <span>QTY</span>
                <span>AMT</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="truncate max-w-[120px]">Paneer Tikka</span>
                <span>1</span>
                <span>Rs. 280.00</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="truncate max-w-[120px]">Butter Chicken</span>
                <span>1</span>
                <span>Rs. 420.00</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="truncate max-w-[120px]">Garlic Naan</span>
                <span>3</span>
                <span>Rs. 180.00</span>
              </div>
            </div>

            {/* TOTALS */}
            <div className="border-t border-black border-dashed pt-1 space-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>Rs. 880.00</span>
              </div>
              <div className="flex justify-between">
                <span>CGST (2.5%):</span>
                <span>Rs. 22.00</span>
              </div>
              <div className="flex justify-between">
                <span>SGST (2.5%):</span>
                <span>Rs. 22.00</span>
              </div>
              <div className="flex justify-between">
                <span>Round Off:</span>
                <span>Rs. 0.00</span>
              </div>
              <div className="flex justify-between font-black text-xs border-t border-black pt-1">
                <span>GRAND TOTAL:</span>
                <span>Rs. 924.00</span>
              </div>
            </div>

            {/* DYNAMIC UPI QR SIMULATION */}
            <div className="text-center pt-2 space-y-1 border-t border-black border-dashed">
              <span className="font-bold text-[10px] block">SCAN TO PAY VIA UPI</span>
              <div className="w-28 h-28 bg-gray-100 border border-gray-400 mx-auto flex items-center justify-center p-1">
                <div className="w-full h-full bg-black/80 flex items-center justify-center text-white text-[9px] text-center p-1 font-sans">
                  DYNAMIC UPI QR<br/>Rs. 924.00
                </div>
              </div>
              <p className="text-[9px] text-gray-700">GPay • PhonePe • Paytm • BHIM</p>
              <p className="text-[8px] text-gray-500 pt-1">*** THANK YOU • VISIT AGAIN ***</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => window.print()}
              variant="brand"
              className="text-xs font-bold flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Test Print via Browser</span>
            </Button>
            <Button
              onClick={() => setPreviewModalOpen(false)}
              variant="outline"
              className="border-slate-800 text-slate-300 text-xs"
            >
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
