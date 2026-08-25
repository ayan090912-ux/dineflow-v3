import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Percent,
  DollarSign,
  Building2,
  ShieldCheck,
  Check,
  X,
  Search,
  Filter,
  HelpCircle,
  Receipt,
  Tag,
  ToggleLeft,
  ToggleRight,
  Calculator,
  Layers,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import { Button, Card, Badge, Input, Modal, Table as DataTable } from '../../packages/ui';

import { Tax, MenuCategory, MenuItem, TaxType, TaxAppliesTo, OrderType } from '../../packages/types';
import { api } from '../../packages/api/client';
import { formatCurrency } from '../../packages/utils/currency';

interface TaxManagementProps {
  restaurantId: string;
  currencySymbol?: string;
  categories: MenuCategory[];
  menuItems: MenuItem[];
  addToast: (type: 'success' | 'danger' | 'warning' | 'info', title: string, message?: string) => void;
}

export const TaxManagement: React.FC<TaxManagementProps> = ({
  restaurantId,
  currencySymbol = '₹',
  categories,
  menuItems,
  addToast,
}) => {
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTax, setEditingTax] = useState<Tax | null>(null);

  // Form Fields State
  const [taxName, setTaxName] = useState('');
  const [taxType, setTaxType] = useState<TaxType>('PERCENTAGE');
  const [rate, setRate] = useState<string>('5');
  const [fixedAmount, setFixedAmount] = useState<string>('0');
  const [isInclusive, setIsInclusive] = useState(false);
  const [appliesTo, setAppliesTo] = useState<TaxAppliesTo>('ORDER');
  const [applicableOrderTypes, setApplicableOrderTypes] = useState<OrderType[]>(['DINE_IN', 'TAKEAWAY', 'DELIVERY']);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedMenuItemIds, setSelectedMenuItemIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Taxes from DB
  const loadTaxes = async () => {
    setIsLoading(true);
    try {
      const data = await api.getTaxes(restaurantId);
      setTaxes(data);
    } catch (err) {
      console.error('Failed to load taxes:', err);
      addToast('danger', 'Error loading taxes', 'Failed to fetch tax list from database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (restaurantId) {
      loadTaxes();
    }
  }, [restaurantId]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingTax(null);
    setTaxName('');
    setTaxType('PERCENTAGE');
    setRate('5');
    setFixedAmount('0');
    setIsInclusive(false);
    setAppliesTo('ORDER');
    setApplicableOrderTypes(['DINE_IN', 'TAKEAWAY', 'DELIVERY']);
    setSelectedCategoryIds([]);
    setSelectedMenuItemIds([]);
    setStatus('ACTIVE');
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (tax: Tax) => {
    setEditingTax(tax);
    setTaxName(tax.name);
    setTaxType(tax.type);
    setRate(String(tax.rate || 0));
    setFixedAmount(String(tax.fixedAmount || 0));
    setIsInclusive(tax.isInclusive);
    setAppliesTo(tax.appliesTo);
    setApplicableOrderTypes(tax.applicableOrderTypes || ['DINE_IN', 'TAKEAWAY', 'DELIVERY']);
    setSelectedCategoryIds(tax.categoryIds || []);
    setSelectedMenuItemIds(tax.menuItemIds || []);
    setStatus(tax.status);
    setIsModalOpen(true);
  };

  // Toggle Order Type Checkbox
  const handleToggleOrderType = (type: OrderType) => {
    setApplicableOrderTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  // Toggle Category Checkbox
  const handleToggleCategory = (catId: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  // Toggle Menu Item Checkbox
  const handleToggleMenuItem = (itemId: string) => {
    setSelectedMenuItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  // Form Validation
  const validateForm = (): boolean => {
    if (!taxName.trim()) {
      addToast('warning', 'Validation Error', 'Tax Name is required.');
      return false;
    }
    const numRate = parseFloat(rate);
    const numFixed = parseFloat(fixedAmount);

    if (taxType === 'PERCENTAGE') {
      if (isNaN(numRate) || numRate < 0) {
        addToast('warning', 'Validation Error', 'Tax rate must be a valid non-negative percentage.');
        return false;
      }
      if (numRate > 100) {
        addToast('warning', 'Validation Error', 'Tax rate percentage cannot exceed 100%.');
        return false;
      }
    } else {
      if (isNaN(numFixed) || numFixed < 0) {
        addToast('warning', 'Validation Error', 'Fixed tax amount must be a non-negative number.');
        return false;
      }
    }

    if (appliesTo === 'CATEGORY' && selectedCategoryIds.length === 0) {
      addToast('warning', 'Validation Error', 'Please select at least one category.');
      return false;
    }

    if (appliesTo === 'ITEM' && selectedMenuItemIds.length === 0) {
      addToast('warning', 'Validation Error', 'Please select at least one menu item.');
      return false;
    }

    if (applicableOrderTypes.length === 0) {
      addToast('warning', 'Validation Error', 'Please select at least one applicable order type.');
      return false;
    }

    return true;
  };

  // Submit Handler
  const handleSaveTaxClick = () => {
    if (!validateForm()) return;
    setIsConfirmModalOpen(true);
  };

  const handleConfirmSave = async () => {
    setIsSubmitting(true);
    try {
      const payload: Partial<Tax> = {
        name: taxName.trim(),
        type: taxType,
        rate: parseFloat(rate) || 0,
        fixedAmount: parseFloat(fixedAmount) || 0,
        isInclusive,
        appliesTo,
        applicableOrderTypes,
        categoryIds: appliesTo === 'CATEGORY' ? selectedCategoryIds : [],
        menuItemIds: appliesTo === 'ITEM' ? selectedMenuItemIds : [],
        status,
      };

      if (editingTax) {
        await api.updateTax(restaurantId, editingTax.id, payload);
        addToast('success', 'Tax Updated ✨', `Tax '${taxName}' has been updated.`);
      } else {
        await api.createTax(restaurantId, payload);
        addToast('success', 'Tax Created 🎉', `Tax '${taxName}' has been added.`);
      }

      setIsConfirmModalOpen(false);
      setIsModalOpen(false);
      await loadTaxes();
    } catch (err: any) {
      console.error('Failed to save tax:', err);
      addToast('danger', 'Error Saving Tax', err.message || 'Failed to persist tax changes to database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Activate / Deactivate Toggle Handler
  const handleToggleTaxStatus = async (tax: Tax) => {
    try {
      if (tax.status === 'ACTIVE') {
        await api.deactivateTax(restaurantId, tax.id);
        addToast('info', 'Tax Deactivated', `Tax '${tax.name}' deactivated. Historical invoices preserved.`);
      } else {
        await api.activateTax(restaurantId, tax.id);
        addToast('success', 'Tax Activated', `Tax '${tax.name}' is now active for new orders.`);
      }
      await loadTaxes();
    } catch (err) {
      console.error('Failed to toggle tax status:', err);
      addToast('danger', 'Status Update Failed', 'Failed to update tax status in database.');
    }
  };

  // Calculation Live Preview Computation (Sample Subtotal: ₹1,000)
  const previewData = useMemo(() => {
    const sampleSubtotal = 1000;
    const numRate = parseFloat(rate) || 0;
    const numFixed = parseFloat(fixedAmount) || 0;

    let taxAmount = 0;
    if (taxType === 'PERCENTAGE') {
      if (isInclusive) {
        taxAmount = sampleSubtotal - sampleSubtotal / (1 + numRate / 100);
      } else {
        taxAmount = sampleSubtotal * (numRate / 100);
      }
    } else {
      taxAmount = numFixed;
    }

    taxAmount = Math.round(taxAmount * 100) / 100;
    const estimatedTotal = isInclusive ? sampleSubtotal : sampleSubtotal + taxAmount;

    return {
      sampleSubtotal,
      taxAmount,
      estimatedTotal,
    };
  }, [rate, fixedAmount, taxType, isInclusive]);

  // Filtered Taxes
  const filteredTaxes = taxes.filter((t) => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.type.toLowerCase().includes(q) || t.appliesTo.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-white flex items-center gap-2">
            <Tag className="w-6 h-6 text-rose-500" /> Taxes
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Manage taxes and charges applied to your restaurant orders and invoices.
          </p>
        </div>

        <Button
          onClick={handleOpenCreateModal}
          variant="brand"
          size="sm"
          className="shadow-lg shadow-rose-950/40"
          icon={<Plus className="w-4 h-4" />}
        >
          + Add Tax
        </Button>
      </div>

      {/* KPI STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
          <span className="text-[11px] text-slate-400 font-semibold uppercase">Configured Taxes</span>
          <p className="text-2xl font-black text-white">{taxes.length}</p>
          <span className="text-[10px] text-slate-500">Multi-tenant PostgreSQL store</span>
        </Card>

        <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
          <span className="text-[11px] text-emerald-400 font-semibold uppercase">Active Taxes</span>
          <p className="text-2xl font-black text-emerald-400">
            {taxes.filter((t) => t.status === 'ACTIVE').length}
          </p>
          <span className="text-[10px] text-slate-500">Currently calculated on new orders</span>
        </Card>

        <Card className="bg-slate-900 border-slate-800 p-4 space-y-1">
          <span className="text-[11px] text-amber-400 font-semibold uppercase">Inactive / Historical Taxes</span>
          <p className="text-2xl font-black text-amber-400">
            {taxes.filter((t) => t.status === 'INACTIVE').length}
          </p>
          <span className="text-[10px] text-slate-500">Preserved for billing audit history</span>
        </Card>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-slate-200 focus:outline-none focus:border-rose-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tax name, type, scope..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* TAXES TABLE / CARDS */}
      {isLoading ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <Sparkles className="w-8 h-8 text-rose-500 animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-medium">Loading restaurant taxes...</p>
        </div>
      ) : filteredTaxes.length === 0 ? (
        <div className="p-12 text-center bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
          <Receipt className="w-12 h-12 text-slate-600 mx-auto" />
          <h4 className="font-bold text-white text-sm">No taxes configured</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Create your first tax to start calculating taxes on restaurant orders.
          </p>
          <Button
            onClick={handleOpenCreateModal}
            variant="brand"
            size="sm"
            className="mt-2"
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            + Add Tax
          </Button>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <DataTable<Tax>
            data={filteredTaxes}
            keyExtractor={(t) => t.id}
            columns={[
              {
                key: 'name',
                header: 'Tax Name',
                render: (t) => (
                  <div>
                    <p className="font-bold text-white text-xs flex items-center gap-1.5">
                      <span>{t.name}</span>
                      {t.isInclusive && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-mono border border-indigo-500/30">
                          Included
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono">ID: {t.id}</p>
                  </div>
                ),
              },
              {
                key: 'type',
                header: 'Tax Type',
                render: (t) => (
                  <Badge variant={t.type === 'PERCENTAGE' ? 'brand' : 'info'} className="font-mono">
                    {t.type}
                  </Badge>
                ),
              },
              {
                key: 'rate',
                header: 'Rate / Amount',
                render: (t) => (
                  <span className="font-mono font-bold text-sm text-emerald-400">
                    {t.type === 'PERCENTAGE' ? `${t.rate}%` : `${currencySymbol}${t.fixedAmount}`}
                  </span>
                ),
              },
              {
                key: 'appliesTo',
                header: 'Application Scope',
                render: (t) => (
                  <div>
                    <Badge variant="outline" className="font-mono uppercase text-[10px]">
                      {t.appliesTo === 'ORDER' ? 'Entire Order' : t.appliesTo === 'CATEGORY' ? 'Selected Categories' : 'Selected Menu Items'}
                    </Badge>
                    {t.appliesTo === 'CATEGORY' && (t.categoryIds || []).length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {(t.categoryIds || []).length} Categories assigned
                      </p>
                    )}
                    {t.appliesTo === 'ITEM' && (t.menuItemIds || []).length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {(t.menuItemIds || []).length} Items assigned
                      </p>
                    )}
                  </div>
                ),
              },
              {
                key: 'isInclusive',
                header: 'Included / Excluded',
                render: (t) => (
                  <span className={`text-xs font-semibold ${t.isInclusive ? 'text-indigo-400' : 'text-slate-300'}`}>
                    {t.isInclusive ? 'Included in Menu Price' : 'Excluded (Added at Billing)'}
                  </span>
                ),
              },
              {
                key: 'applicableOrderTypes',
                header: 'Order Types',
                render: (t) => (
                  <div className="flex items-center gap-1 flex-wrap">
                    {(t.applicableOrderTypes || ['DINE_IN', 'TAKEAWAY', 'DELIVERY']).map((ot) => (
                      <span key={ot} className="px-1.5 py-0.5 rounded-md bg-slate-950 text-slate-300 text-[9px] font-mono border border-slate-800">
                        {ot === 'DINE_IN' ? 'Dine-in' : ot === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}
                      </span>
                    ))}
                  </div>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (t) => (
                  <Badge variant={t.status === 'ACTIVE' ? 'success' : 'outline'}>
                    {t.status}
                  </Badge>
                ),
              },
              {
                key: 'createdAt',
                header: 'Created Date',
                render: (t) => (
                  <span className="text-[10px] font-mono text-slate-400">
                    {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'N/A'}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: 'Actions',
                render: (t) => (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEditModal(t)}
                      className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="Edit Tax Configuration"
                    >
                      <Edit className="w-3.5 h-3.5 text-amber-400" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => handleToggleTaxStatus(t)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                        t.status === 'ACTIVE'
                          ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                      title={t.status === 'ACTIVE' ? 'Deactivate Tax' : 'Activate Tax'}
                    >
                      {t.status === 'ACTIVE' ? (
                        <>
                          <ToggleLeft className="w-3.5 h-3.5" />
                          <span>Deactivate</span>
                        </>
                      ) : (
                        <>
                          <ToggleRight className="w-3.5 h-3.5" />
                          <span>Activate</span>
                        </>
                      )}
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {/* ADD / EDIT TAX MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTax ? 'Edit Tax Configuration 🏷️' : '+ Add New Tax 🏷️'}
      >
        <div className="space-y-4 text-xs text-slate-200 max-h-[75vh] overflow-y-auto pr-1">
          {/* TAX NAME */}
          <div>
            <label className="block text-slate-400 font-bold mb-1.5">Tax Name *</label>
            <Input
              type="text"
              value={taxName}
              onChange={(e) => setTaxName(e.target.value)}
              placeholder="e.g. GST, Service Charge, VAT..."
              className="bg-slate-950 border-slate-800 text-white font-bold"
            />
          </div>

          {/* TAX TYPE & RATE */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1.5">Tax Type</label>
              <select
                value={taxType}
                onChange={(e: any) => setTaxType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl font-bold text-white focus:outline-none focus:border-rose-500"
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount ({currencySymbol})</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-bold mb-1.5">
                {taxType === 'PERCENTAGE' ? 'Rate (%) *' : `Amount (${currencySymbol}) *`}
              </label>
              {taxType === 'PERCENTAGE' ? (
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="5.0"
                    className="bg-slate-950 border-slate-800 text-white font-bold pr-8"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 font-bold">%</span>
                </div>
              ) : (
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-500 font-bold">{currencySymbol}</span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={fixedAmount}
                    onChange={(e) => setFixedAmount(e.target.value)}
                    placeholder="50"
                    className="bg-slate-950 border-slate-800 text-white font-bold pl-8"
                  />
                </div>
              )}
            </div>
          </div>

          {/* TAX APPLICATION SCOPE */}
          <div>
            <label className="block text-slate-400 font-bold mb-1.5">Apply Tax To:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAppliesTo('ORDER')}
                className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                  appliesTo === 'ORDER'
                    ? 'bg-rose-600 border-rose-500 text-white shadow-lg'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                Entire Order
              </button>

              <button
                type="button"
                onClick={() => setAppliesTo('CATEGORY')}
                className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                  appliesTo === 'CATEGORY'
                    ? 'bg-rose-600 border-rose-500 text-white shadow-lg'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                Selected Categories
              </button>

              <button
                type="button"
                onClick={() => setAppliesTo('ITEM')}
                className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                  appliesTo === 'ITEM'
                    ? 'bg-rose-600 border-rose-500 text-white shadow-lg'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                Selected Menu Items
              </button>
            </div>
          </div>

          {/* CATEGORIES PICKER IF SELECTED CATEGORIES */}
          {appliesTo === 'CATEGORY' && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <span className="text-[11px] font-bold text-slate-300 block">Select Restaurant Categories:</span>
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                {categories.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 cursor-pointer text-xs p-1.5 rounded bg-slate-900 border border-slate-800 hover:border-rose-500/50">
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(cat.id)}
                      onChange={() => handleToggleCategory(cat.id)}
                      className="rounded accent-rose-500 w-3.5 h-3.5"
                    />
                    <span className="font-semibold text-white">{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* MENU ITEMS PICKER IF SELECTED MENU ITEMS */}
          {appliesTo === 'ITEM' && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
              <span className="text-[11px] font-bold text-slate-300 block">Select Restaurant Menu Items:</span>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                {menuItems.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer text-xs p-1.5 rounded bg-slate-900 border border-slate-800 hover:border-rose-500/50">
                    <input
                      type="checkbox"
                      checked={selectedMenuItemIds.includes(item.id)}
                      onChange={() => handleToggleMenuItem(item.id)}
                      className="rounded accent-rose-500 w-3.5 h-3.5"
                    />
                    <div className="truncate">
                      <span className="font-semibold text-white block truncate">{item.name}</span>
                      <span className="text-[10px] font-mono text-emerald-400">{currencySymbol}{item.price}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* TAX INCLUDED / EXCLUDED */}
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
            <span className="text-slate-300 font-bold block">Tax Included in Menu Price?</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsInclusive(true)}
                className={`p-2.5 rounded-xl border text-left font-bold transition-all ${
                  isInclusive
                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-black text-xs">Yes (Included)</div>
                <div className="text-[10px] font-normal text-indigo-200 mt-0.5">
                  Displayed menu price already contains the tax.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setIsInclusive(false)}
                className={`p-2.5 rounded-xl border text-left font-bold transition-all ${
                  !isInclusive
                    ? 'bg-rose-600 border-rose-500 text-white shadow-lg'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                <div className="font-black text-xs">No (Excluded)</div>
                <div className="text-[10px] font-normal text-rose-200 mt-0.5">
                  Tax is calculated and added during billing.
                </div>
              </button>
            </div>
          </div>

          {/* APPLICABLE ORDER TYPES */}
          <div>
            <label className="block text-slate-400 font-bold mb-1.5">Applicable Order Types:</label>
            <div className="flex items-center gap-3">
              {(['DINE_IN', 'TAKEAWAY', 'DELIVERY'] as OrderType[]).map((ot) => (
                <label key={ot} className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    checked={applicableOrderTypes.includes(ot)}
                    onChange={() => handleToggleOrderType(ot)}
                    className="rounded accent-rose-500 w-4 h-4"
                  />
                  <span>{ot === 'DINE_IN' ? 'Dine-in 🍽️' : ot === 'TAKEAWAY' ? 'Takeaway 🛍️' : 'Delivery 🛵'}</span>
                </label>
              ))}
            </div>
          </div>

          {/* STATUS TOGGLE */}
          <div>
            <label className="block text-slate-400 font-bold mb-1.5">Status:</label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                <input
                  type="radio"
                  name="status"
                  value="ACTIVE"
                  checked={status === 'ACTIVE'}
                  onChange={() => setStatus('ACTIVE')}
                  className="accent-emerald-500 w-4 h-4"
                />
                <span className="text-emerald-400">Active</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-xs">
                <input
                  type="radio"
                  name="status"
                  value="INACTIVE"
                  checked={status === 'INACTIVE'}
                  onChange={() => setStatus('INACTIVE')}
                  className="accent-rose-500 w-4 h-4"
                />
                <span className="text-slate-400">Inactive</span>
              </label>
            </div>
          </div>

          {/* LIVE TAX CALCULATION PREVIEW CARD */}
          <div className="p-3.5 bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800 rounded-2xl space-y-2">
            <span className="text-[11px] text-slate-400 font-bold uppercase flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-rose-500" /> Live Tax Calculation Preview (Sample Order)
            </span>
            <div className="space-y-1 font-mono text-xs border-t border-slate-800 pt-2">
              <div className="flex justify-between text-slate-400">
                <span>Sample Subtotal:</span>
                <span>{currencySymbol}1,000.00</span>
              </div>
              <div className="flex justify-between text-rose-400 font-bold">
                <span>
                  {taxName || 'Tax'} ({taxType === 'PERCENTAGE' ? `${rate}%` : `${currencySymbol}${fixedAmount}`}
                  {isInclusive ? ' - Included' : ''}):
                </span>
                <span>{currencySymbol}{previewData.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-white font-black pt-1 border-t border-slate-800">
                <span>Estimated Total:</span>
                <span className="text-emerald-400">{currencySymbol}{previewData.estimatedTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveTaxClick}
              variant="brand"
              size="sm"
              icon={<Check className="w-4 h-4" />}
            >
              {editingTax ? 'Save Tax Changes' : 'Create Tax'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* CONFIRMATION MODAL BEFORE SAVING */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Save tax changes? ⚠️"
      >
        <div className="space-y-4 text-xs text-slate-200">
          <p className="text-slate-300">
            Are you sure you want to save changes to <strong className="text-white">{taxName}</strong>?
          </p>
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 space-y-1">
            <p className="font-bold flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-amber-400" /> Historical Billing Record Protection
            </p>
            <p className="text-[11px] text-amber-400/90">
              Existing bills and past invoices will preserve their original tax snapshot rate. Only new orders will use the updated rate.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSave}
              variant="brand"
              size="sm"
              disabled={isSubmitting}
              icon={isSubmitting ? <Sparkles className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            >
              {isSubmitting ? 'Saving...' : 'Confirm & Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
