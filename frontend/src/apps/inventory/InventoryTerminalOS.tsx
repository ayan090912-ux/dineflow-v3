import React, { useState, useEffect } from 'react';
import {
  Package,
  AlertTriangle,
  DollarSign,
  Users,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  RefreshCw,
  Clock,
  Volume2,
  VolumeX,
  Building2,
  Phone,
  Mail,
  MapPin,
  ChefHat,
  GlassWater,
  Sparkles,
  ArrowUpRight,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import { Badge, Button, Card, Modal } from '../../packages/ui';
import { InventoryItem, Supplier } from '../../packages/types';
import { api } from '../../packages/api/client';
import { realtimeBus, RealTimeEventPayload } from '../../packages/api/realtime';
import { formatCurrency } from '../../packages/utils/currency';

interface InventoryTerminalOSProps {
  onLogout?: () => void;
  activeRestaurantId?: string;
}

export const InventoryTerminalOS: React.FC<InventoryTerminalOSProps> = ({
  onLogout,
  activeRestaurantId,
}) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeTab, setActiveTab] = useState<'KITCHEN' | 'BAR' | 'SUPPLIERS' | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');

  // Modals State
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
  const [isSupplierViewModalOpen, setIsSupplierViewModalOpen] = useState(false);

  // Form States
  const [newStock, setNewStock] = useState({
    name: '',
    category: 'Dairy & Cheese',
    station: 'KITCHEN' as 'KITCHEN' | 'BAR',
    quantity: '10',
    unit: 'kg',
    minThreshold: '5',
    costPerUnit: '50',
    supplierId: '',
    supplierName: '',
    supplierContact: '',
    storageLocation: 'Cold Storage #1',
  });

  const [newSupplier, setNewSupplier] = useState({
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    supplyCategory: 'Dairy & Cheese',
    address: '',
    notes: '',
  });

  // Feedback Toast
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' | 'warning' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Clock tick
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Load Inventory & Suppliers Data
  const loadData = async () => {
    const restId = activeRestaurantId || api.getCurrentRestaurantId() || undefined;
    const [invList, supList] = await Promise.all([
      api.getInventory(restId),
      api.getSuppliers(restId),
    ]);
    setItems(invList);
    setSuppliers(supList);
  };

  useEffect(() => {
    loadData();

    const unsubscribe = realtimeBus.subscribe((event: RealTimeEventPayload) => {
      const restId = activeRestaurantId || api.getCurrentRestaurantId();
      if (event.restaurantId && restId && event.restaurantId !== restId) {
        return;
      }
      loadData();
    });

    return () => unsubscribe();
  }, [activeRestaurantId]);

  // Inventory Handlers
  const handleAddStock = async () => {
    if (!newStock.name) {
      showToast('Please enter an item name', 'warning');
      return;
    }

    const restId = activeRestaurantId || api.getCurrentRestaurantId() || undefined;
    const selectedSup = suppliers.find((s) => s.id === newStock.supplierId);

    await api.addInventoryItem({
      restaurantId: restId,
      name: newStock.name,
      category: newStock.category,
      station: newStock.station,
      quantity: parseFloat(newStock.quantity) || 10,
      unit: newStock.unit || 'kg',
      minThreshold: parseFloat(newStock.minThreshold) || 5,
      costPerUnit: parseFloat(newStock.costPerUnit) || 10,
      supplierId: selectedSup?.id || undefined,
      supplierName: selectedSup?.name || newStock.supplierName || 'General Supplier',
      supplierContact: selectedSup?.phone || newStock.supplierContact || 'N/A',
      storageLocation: newStock.storageLocation,
    });

    showToast(`Stock "${newStock.name}" added to ${newStock.station === 'BAR' ? 'Bar' : 'Kitchen'} Inventory!`, 'success');
    setIsAddStockModalOpen(false);
    setNewStock({
      name: '',
      category: 'Dairy & Cheese',
      station: 'KITCHEN',
      quantity: '10',
      unit: 'kg',
      minThreshold: '5',
      costPerUnit: '50',
      supplierId: '',
      supplierName: '',
      supplierContact: '',
      storageLocation: 'Cold Storage #1',
    });
    await loadData();
  };

  const handleAdjustQuantity = async (itemId: string, delta: number) => {
    await api.updateInventoryQuantity(itemId, delta);
    showToast(`Stock quantity updated by ${delta > 0 ? '+' : ''}${delta}`, 'info');
    await loadData();
  };

  const handleDeleteItem = async (itemId: string, name: string) => {
    if (window.confirm(`Are you sure you want to remove "${name}" from inventory?`)) {
      await api.deleteInventoryItem(itemId);
      showToast(`Removed "${name}" from inventory`, 'warning');
      await loadData();
    }
  };

  // Supplier Handlers
  const handleAddSupplier = async () => {
    if (!newSupplier.name) {
      showToast('Please enter supplier company name', 'warning');
      return;
    }

    const restId = activeRestaurantId || api.getCurrentRestaurantId() || undefined;
    await api.addSupplier({
      restaurantId: restId,
      name: newSupplier.name,
      contactPerson: newSupplier.contactPerson,
      phone: newSupplier.phone,
      email: newSupplier.email,
      supplyCategory: newSupplier.supplyCategory,
      address: newSupplier.address,
      notes: newSupplier.notes,
    });

    showToast(`Supplier "${newSupplier.name}" registered successfully!`, 'success');
    setIsAddSupplierModalOpen(false);
    setNewSupplier({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      supplyCategory: 'Dairy & Cheese',
      address: '',
      notes: '',
    });
    await loadData();
  };

  const handleDeleteSupplier = async (supplierId: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete supplier "${name}"?`)) {
      await api.deleteSupplier(supplierId);
      showToast(`Supplier "${name}" deleted`, 'warning');
      await loadData();
    }
  };

  // Calculated Metrics
  const kitchenItems = items.filter((i) => i.station !== 'BAR');
  const barItems = items.filter((i) => i.station === 'BAR');
  const lowStockItems = items.filter((i) => i.quantity <= i.minThreshold);
  const totalValue = items.reduce((sum, i) => sum + i.quantity * i.costPerUnit, 0);

  // Filtered List
  const displayedItems = items.filter((i) => {
    if (activeTab === 'KITCHEN' && i.station === 'BAR') return false;
    if (activeTab === 'BAR' && i.station !== 'BAR') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.supplierName && i.supplierName.toLowerCase().includes(q)) ||
        (i.storageLocation && i.storageLocation.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white pb-12">
      {/* Toast Feedback */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-950 border-emerald-500/50 text-emerald-300'
              : toast.type === 'warning'
              ? 'bg-amber-950 border-amber-500/50 text-amber-300'
              : 'bg-blue-950 border-blue-500/50 text-blue-300'
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header OS Control Bar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 px-6 py-3.5 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-500 to-amber-600 flex items-center justify-center shadow-lg shadow-rose-950/50 border border-rose-400/30">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-black tracking-wide text-white uppercase font-mono">
                Inventory & Raw Materials OS
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 font-mono">
                LIVE TERMINAL
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Kitchen & Bar Stock Division • Real-Time Supplier Control
            </p>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-3">
          {/* Live Clock */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-rose-400" />
            <span>{currentTime || '12:00 PM'}</span>
          </div>

          <button
            onClick={() => setIsAudioMuted(!isAudioMuted)}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title={isAudioMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          <Button
            onClick={() => setIsAddSupplierModalOpen(true)}
            variant="outline"
            className="border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 rounded-xl"
          >
            <Building2 className="w-4 h-4 text-amber-400" />
            <span>+ Add Supplier</span>
          </Button>

          <Button
            onClick={() => setIsAddStockModalOpen(true)}
            className="bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-black shadow-lg shadow-rose-950/50 flex items-center gap-1.5 rounded-xl"
          >
            <Plus className="w-4 h-4" />
            <span>Add Raw Material</span>
          </Button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 transition-colors"
            >
              Exit Terminal
            </button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full px-6 pt-6 space-y-6 flex-1">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 bg-slate-900/80 border-slate-800 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                Total Stock Items
              </span>
              <Package className="w-4 h-4 text-slate-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white font-mono">{items.length}</span>
              <span className="text-[11px] text-slate-400">
                ({kitchenItems.length} Kitchen • {barItems.length} Bar)
              </span>
            </div>
          </Card>

          <Card className="p-4 bg-slate-900/80 border-amber-500/30 rounded-2xl relative overflow-hidden group hover:border-amber-500/50 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-400 tracking-wider uppercase">
                Low Stock Alerts
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-300 font-mono">
                {lowStockItems.length}
              </span>
              <span className="text-[11px] text-slate-400">At or below reorder limit</span>
            </div>
          </Card>

          <Card className="p-4 bg-slate-900/80 border-emerald-500/30 rounded-2xl relative overflow-hidden group hover:border-emerald-500/50 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 tracking-wider uppercase">
                Total Inventory Value
              </span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-black text-emerald-300 font-mono">
                {formatCurrency(totalValue)}
              </span>
            </div>
          </Card>

          <Card
            onClick={() => setActiveTab('SUPPLIERS')}
            className="p-4 bg-slate-900/80 border-blue-500/30 rounded-2xl relative overflow-hidden group hover:border-blue-500/60 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-400 tracking-wider uppercase flex items-center gap-1">
                <span>Active Suppliers</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity" />
              </span>
              <Users className="w-4 h-4 text-blue-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-blue-300 font-mono">{suppliers.length}</span>
              <span className="text-[11px] text-blue-400 font-bold group-hover:underline">
                Manage Vendors & Contacts →
              </span>
            </div>
          </Card>
        </div>

        {/* Tab & Search Filter Navigation */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 p-2 rounded-2xl border border-slate-800">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto p-1">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'ALL'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/50'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>All Raw Stock ({items.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('KITCHEN')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'KITCHEN'
                  ? 'bg-amber-600 text-white shadow-lg shadow-amber-950/50'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <ChefHat className="w-3.5 h-3.5 text-amber-300" />
              <span>Kitchen Inventory ({kitchenItems.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('BAR')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'BAR'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/50'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <GlassWater className="w-3.5 h-3.5 text-indigo-300" />
              <span>Bar Inventory ({barItems.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('SUPPLIERS')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'SUPPLIERS'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/50'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-blue-300" />
              <span>Suppliers Directory ({suppliers.length})</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search stock, category, supplier..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>
        </div>

        {/* CONTENT VIEW: SUPPLIERS DIRECTORY */}
        {activeTab === 'SUPPLIERS' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-400" />
                  <span>Verified Suppliers & Vendor Directory</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Manage vendor contact details, supply types, and supply contracts.
                </p>
              </div>
              <Button
                onClick={() => setIsAddSupplierModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Supplier</span>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map((sup) => (
                <Card
                  key={sup.id}
                  className="p-5 bg-slate-900/90 border-slate-800 rounded-2xl space-y-4 relative overflow-hidden group hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase">
                        {sup.supplyCategory || 'General'}
                      </span>
                      <h4 className="font-black text-white text-base mt-2">{sup.name}</h4>
                      {sup.contactPerson && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Users className="w-3 h-3 text-slate-500" />
                          <span>Rep: {sup.contactPerson}</span>
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteSupplier(sup.id, sup.name)}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white transition-colors"
                      title="Delete Supplier"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2 text-xs text-slate-300 border-t border-slate-800/80 pt-3">
                    {sup.phone && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="font-mono">{sup.phone}</span>
                      </div>
                    )}
                    {sup.email && (
                      <div className="flex items-center gap-2 text-slate-300">
                        <Mail className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">{sup.email}</span>
                      </div>
                    )}
                    {sup.address && (
                      <div className="flex items-start gap-2 text-slate-400 text-[11px]">
                        <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{sup.address}</span>
                      </div>
                    )}
                  </div>

                  {sup.notes && (
                    <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 italic">
                      "{sup.notes}"
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        ) : (
          /* CONTENT VIEW: INVENTORY RAW MATERIALS TABLE */
          <Card className="bg-slate-900/90 border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4">Raw Material / Item</th>
                    <th className="py-3.5 px-3">Division</th>
                    <th className="py-3.5 px-3">Category</th>
                    <th className="py-3.5 px-3 text-center">Stock Quantity</th>
                    <th className="py-3.5 px-3 text-center">Min Alert</th>
                    <th className="py-3.5 px-3">Unit Cost & Value</th>
                    <th className="py-3.5 px-3">Supplier Contact</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {displayedItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        <Package className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="font-bold text-slate-400">No raw stock items found</p>
                        <p className="text-[11px]">
                          Click "+ Add Raw Material" to register inventory stock.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    displayedItems.map((item) => {
                      const isLow = item.quantity <= item.minThreshold;
                      const isBar = item.station === 'BAR';
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white text-sm">{item.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              📍 {item.storageLocation || 'Main Storage'}
                            </div>
                          </td>

                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isBar
                                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              }`}
                            >
                              {isBar ? <GlassWater className="w-3 h-3" /> : <ChefHat className="w-3 h-3" />}
                              <span>{isBar ? 'BAR INVENTORY' : 'KITCHEN INVENTORY'}</span>
                            </span>
                          </td>

                          <td className="py-3.5 px-3 text-slate-300">
                            <span className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                              {item.category}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleAdjustQuantity(item.id, -1)}
                                className="w-6 h-6 rounded-lg bg-slate-950 hover:bg-rose-600 text-slate-300 hover:text-white font-bold border border-slate-800 transition-colors flex items-center justify-center"
                              >
                                -
                              </button>
                              <span
                                className={`font-mono font-bold text-sm min-w-[3rem] ${
                                  isLow ? 'text-rose-400 font-black' : 'text-emerald-400'
                                }`}
                              >
                                {item.quantity} <span className="text-[10px] text-slate-400">{item.unit}</span>
                              </span>
                              <button
                                onClick={() => handleAdjustQuantity(item.id, 1)}
                                className="w-6 h-6 rounded-lg bg-slate-950 hover:bg-emerald-600 text-slate-300 hover:text-white font-bold border border-slate-800 transition-colors flex items-center justify-center"
                              >
                                +
                              </button>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 text-center text-slate-400 font-mono text-xs">
                            {item.minThreshold} {item.unit}
                          </td>

                          <td className="py-3.5 px-3">
                            <div className="font-mono text-slate-200">
                              {formatCurrency(item.costPerUnit)} / {item.unit}
                            </div>
                            <div className="text-[10px] font-mono text-emerald-400">
                              Total: {formatCurrency(item.quantity * item.costPerUnit)}
                            </div>
                          </td>

                          <td className="py-3.5 px-3 text-slate-300">
                            <div className="font-bold text-slate-200">{item.supplierName || 'General Supplier'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{item.supplierContact || 'N/A'}</div>
                          </td>

                          <td className="py-3.5 px-3">
                            {isLow ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 animate-pulse">
                                <AlertTriangle className="w-3 h-3" />
                                <span>LOW STOCK</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>IN STOCK</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleDeleteItem(item.id, item.name)}
                              className="p-2 rounded-xl bg-slate-950 hover:bg-rose-600 text-slate-400 hover:text-white border border-slate-800 transition-colors"
                              title="Delete Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </main>

      {/* MODAL: ADD RAW MATERIAL / STOCK */}
      <Modal
        isOpen={isAddStockModalOpen}
        onClose={() => setIsAddStockModalOpen(false)}
        title="Add Raw Material / Stock Item 📦"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 font-bold mb-1">Item / Raw Material Name</label>
            <input
              type="text"
              value={newStock.name}
              onChange={(e) => setNewStock({ ...newStock, name: e.target.value })}
              placeholder="e.g. Milk, Wagyu Beef, Gin, Tonic Water"
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Inventory Division</label>
              <select
                value={newStock.station}
                onChange={(e) => setNewStock({ ...newStock, station: e.target.value as 'KITCHEN' | 'BAR' })}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500 font-bold"
              >
                <option value="KITCHEN">👨‍🍳 Kitchen Inventory</option>
                <option value="BAR">🍸 Bar Inventory</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Category</label>
              <input
                type="text"
                value={newStock.category}
                onChange={(e) => setNewStock({ ...newStock, category: e.target.value })}
                placeholder="e.g. Dairy, Spirits, Meat, Produce"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Quantity</label>
              <input
                type="number"
                value={newStock.quantity}
                onChange={(e) => setNewStock({ ...newStock, quantity: e.target.value })}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Unit</label>
              <select
                value={newStock.unit}
                onChange={(e) => setNewStock({ ...newStock, unit: e.target.value })}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500"
              >
                <option value="kg">kg</option>
                <option value="liters">liters</option>
                <option value="bottles">bottles</option>
                <option value="packs">packs</option>
                <option value="grams">grams</option>
                <option value="units">units</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Min Reorder Alert</label>
              <input
                type="number"
                value={newStock.minThreshold}
                onChange={(e) => setNewStock({ ...newStock, minThreshold: e.target.value })}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Unit Cost (₹)</label>
              <input
                type="number"
                value={newStock.costPerUnit}
                onChange={(e) => setNewStock({ ...newStock, costPerUnit: e.target.value })}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Supplier / Vendor</label>
              <select
                value={newStock.supplierId}
                onChange={(e) => {
                  const sId = e.target.value;
                  const s = suppliers.find((x) => x.id === sId);
                  setNewStock({
                    ...newStock,
                    supplierId: sId,
                    supplierName: s?.name || '',
                    supplierContact: s?.phone || '',
                  });
                }}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500"
              >
                <option value="">-- Select Active Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.supplyCategory || 'Vendor'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Storage Location</label>
            <input
              type="text"
              value={newStock.storageLocation}
              onChange={(e) => setNewStock({ ...newStock, storageLocation: e.target.value })}
              placeholder="e.g. Cold Storage #1, Bar Cellar Rack 3, Pantry B"
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button
              onClick={() => setIsAddStockModalOpen(false)}
              variant="outline"
              className="border-slate-800 text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddStock}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold"
            >
              Add Stock Material
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: ADD SUPPLIER */}
      <Modal
        isOpen={isAddSupplierModalOpen}
        onClose={() => setIsAddSupplierModalOpen(false)}
        title="Register New Vendor & Supplier 🏢"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 font-bold mb-1">Supplier Company Name</label>
            <input
              type="text"
              value={newSupplier.name}
              onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
              placeholder="e.g. Ayaan Food Industry, Apex Beverages Co."
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Contact Person / Rep</label>
              <input
                type="text"
                value={newSupplier.contactPerson}
                onChange={(e) => setNewSupplier({ ...newSupplier, contactPerson: e.target.value })}
                placeholder="e.g. Ayaan Ahmad"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Supply Category</label>
              <select
                value={newSupplier.supplyCategory}
                onChange={(e) => setNewSupplier({ ...newSupplier, supplyCategory: e.target.value })}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500"
              >
                <option value="Dairy & Cheese">Dairy & Cheese</option>
                <option value="Produce & Veggies">Produce & Veggies</option>
                <option value="Spirits & Wines">Spirits & Wines</option>
                <option value="Meat & Poultry">Meat & Poultry</option>
                <option value="Bakery & Flour">Bakery & Flour</option>
                <option value="General Pantry">General Pantry</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Phone Number</label>
              <input
                type="text"
                value={newSupplier.phone}
                onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                placeholder="+91 98765-43210"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1">Email Address</label>
              <input
                type="email"
                value={newSupplier.email}
                onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                placeholder="supply@vendor.com"
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Warehouse Address</label>
            <input
              type="text"
              value={newSupplier.address}
              onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
              placeholder="e.g. Warehouse #4, Industrial Zone"
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1">Notes / Terms</label>
            <textarea
              value={newSupplier.notes}
              onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
              placeholder="Payment terms, delivery schedules..."
              rows={2}
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button
              onClick={() => setIsAddSupplierModalOpen(false)}
              variant="outline"
              className="border-slate-800 text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSupplier}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
            >
              Save Supplier
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
