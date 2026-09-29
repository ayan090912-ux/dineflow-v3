import React, { useState, useEffect } from 'react';
import {
  ChefHat,
  PhoneCall,
  Wine,
  Package,
  Receipt,
  LayoutDashboard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Save,
  Sparkles,
  Info,
  Building2,
  Layers,
  Globe,
  ExternalLink,
  QrCode,
  Copy,
  Users,
  Loader2,
  RefreshCw,
  Grid,
} from 'lucide-react';
import { Button, Card, Badge } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { Restaurant, BusinessType } from '../../packages/types';
import { getRestaurantPublicDomain, getRestaurantCustomerUrl } from '../../packages/utils/tenantResolver';

interface WorkspaceSettingsTabProps {
  restaurant: Restaurant | null;
  onRefreshRestaurant: () => Promise<void>;
  addToast: (type: 'success' | 'error' | 'info' | 'warning', title: string, message?: string) => void;
}

export const WorkspaceSettingsTab: React.FC<WorkspaceSettingsTabProps> = ({
  restaurant,
  onRefreshRestaurant,
  addToast,
}) => {
  const bType: BusinessType = (restaurant?.businessType || 'RESTAURANT') as BusinessType;

  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  const [hasSeating, setHasSeating] = useState<boolean>(restaurant?.hasTables !== false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [rowStatus, setRowStatus] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'failed'>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (restaurant) {
      const current = restaurant.enabledModules ? [...restaurant.enabledModules] : [
        'kitchen',
        'inventory',
        'billing',
        ...(restaurant.hasWaiter ? ['waiter'] : []),
        ...(restaurant.hasBar ? ['bar'] : []),
      ];
      if (restaurant.hasTables !== false && !current.includes('tables')) {
        current.push('tables');
      }
      setEnabledModules(current);
      setHasSeating(restaurant.hasTables !== false);
    }
  }, [restaurant]);

  const saveConfiguration = async (newModules: string[], activeKey?: string) => {
    if (!restaurant) return;
    setIsSaving(true);
    setErrorMessage(null);
    if (activeKey) {
      setRowStatus((prev) => ({ ...prev, [activeKey]: 'saving' }));
    }

    try {
      const hasKitchen = newModules.includes('kitchen');
      const hasWaiter = newModules.includes('waiter');
      const hasBar = newModules.includes('bar');
      const hasInventory = newModules.includes('inventory');
      const hasBilling = newModules.includes('billing');
      const hasTables = newModules.includes('tables');

      const serverRes = await api.updateWorkspaceModules(restaurant.id, newModules, {
        hasKitchen,
        hasWaiter,
        hasBar,
        hasInventory,
        hasBilling,
        hasTables,
      });

      setHasSeating(hasTables);

      // Update state authoritatively from server response
      if (serverRes?.enabledModules) {
        setEnabledModules(serverRes.enabledModules);
      } else {
        setEnabledModules(newModules);
      }

      await onRefreshRestaurant();

      if (activeKey) {
        setRowStatus((prev) => ({ ...prev, [activeKey]: 'saved' }));
        setTimeout(() => {
          setRowStatus((prev) => ({ ...prev, [activeKey]: 'idle' }));
        }, 3000);
      }
      addToast('success', 'Workspace Updated 🚀', 'Terminal permissions & navigation updated immediately.');
    } catch (err: any) {
      const msg = err?.message || 'Unable to update workspace settings.';
      setErrorMessage(msg);
      if (activeKey) {
        setRowStatus((prev) => ({ ...prev, [activeKey]: 'failed' }));
      }
      addToast('error', 'Update Failed', 'Unable to update workspace settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleModule = async (moduleKey: string) => {
    if (isSaving) return;

    // Food Cart rule: Bar is not supported
    if (bType === 'FOOD_CART' && moduleKey === 'bar') {
      addToast('warning', 'Terminal Restricted', 'Bar Terminal KDS is not supported for Food Cart businesses.');
      return;
    }

    let nextModules: string[];
    if (enabledModules.includes(moduleKey)) {
      if (enabledModules.length <= 1) {
        addToast('warning', 'Minimum Required', 'At least one terminal module must remain active.');
        return;
      }
      nextModules = enabledModules.filter((m) => m !== moduleKey);
    } else {
      nextModules = [...enabledModules, moduleKey];
    }

    // Persist immediately on toggle with feedback
    await saveConfiguration(nextModules, moduleKey);
  };

  const handleManualSave = async () => {
    await saveConfiguration(enabledModules);
  };

  const publicDomain = getRestaurantPublicDomain(restaurant);
  const customerUrl = getRestaurantCustomerUrl(restaurant);

  const handleCopyPublicUrl = () => {
    navigator.clipboard.writeText(customerUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
    addToast('success', 'Link Copied', 'Tenant public menu link copied to clipboard.');
  };

  const modulesConfig = [
    {
      key: 'kitchen',
      name: 'Kitchen Display System (KDS)',
      desc: 'Live chef queue, station timing, food preparation management, and order completion.',
      roles: 'Chefs, Cooks, Kitchen Staff, Managers, Owner',
      icon: ChefHat,
      badge: 'Core Food Ops',
      color: 'text-amber-400',
      badgeVariant: 'warning' as const,
      isOffered: true,
    },
    {
      key: 'waiter',
      name: 'Waiter Terminal OS',
      desc: 'Table floorplan, real-time customer water/service calls, bill requests, and order delivery.',
      roles: 'Waiters, Servers, Floor Staff, Managers, Owner',
      icon: PhoneCall,
      badge: bType === 'FOOD_CART' ? 'Optional' : 'Floor Ops',
      color: 'text-emerald-400',
      badgeVariant: 'success' as const,
      isOffered: true,
    },
    {
      key: 'bar',
      name: 'Bar Terminal KDS',
      desc: 'Dedicated mixology workstation for alcoholic drink orders, cocktails, and beverage prep.',
      roles: 'Bartenders, Mixologists, Bar Staff, Managers, Owner',
      icon: Wine,
      badge: bType === 'BAR' ? 'Primary' : 'Beverage Ops',
      color: 'text-purple-400',
      badgeVariant: 'brand' as const,
      isOffered: bType !== 'FOOD_CART',
    },
    {
      key: 'inventory',
      name: 'Inventory & Stock OS',
      desc: 'Raw ingredient tracking, low-stock alerts, supplier management, and consumption logging.',
      roles: 'Inventory Managers, Storekeepers, Managers, Owner',
      icon: Package,
      badge: 'Supply Chain',
      color: 'text-rose-400',
      badgeVariant: 'brand' as const,
      isOffered: true,
    },
    {
      key: 'billing',
      name: 'Billing & POS Terminal',
      desc: 'Digital receipts, custom UPI QR payments, GST invoices, cashier settlement, and tax reports.',
      roles: 'Cashiers, POS Operators, Managers, Owner',
      icon: Receipt,
      badge: 'Financial & POS',
      color: 'text-sky-400',
      badgeVariant: 'info' as const,
      isOffered: true,
    },
    {
      key: 'tables',
      name: 'Dining Room Tables & Floorplan',
      desc: 'Interactive table floorplan, QR code standees, guest seat count, merge tables, and live table status.',
      roles: 'Floor Staff, Waiters, Hosts, Managers, Owner',
      icon: Grid,
      badge: 'Floor Seating',
      color: 'text-amber-400',
      badgeVariant: 'warning' as const,
      isOffered: true,
    },
  ];

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#1e232e]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="brand" className="text-[10px] uppercase font-mono">Workspace Configuration</Badge>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400 font-bold">{restaurant?.name || 'My Business'}</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Workspace & Terminal Management
          </h2>
          <p className="text-xs text-slate-400">
            Configure the operational tools enabled for this venue. Navigation will update instantly based on your choices.
          </p>
        </div>

        <Button
          variant="brand"
          onClick={handleManualSave}
          isLoading={isSaving}
          className="text-xs font-semibold px-6 py-2.5 shrink-0"
          icon={<Save className="w-4 h-4 mr-1" />}
        >
          Save Workspace Changes
        </Button>
      </div>

      {/* Error / Retry Banner */}
      {errorMessage && (
        <Card className="bg-rose-500/10 border-rose-500/30 p-4 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-rose-300 text-xs">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <span className="font-bold block text-rose-200">Unable to update workspace settings.</span>
              <span>{errorMessage}</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSave}
            disabled={isSaving}
            className="text-xs border-rose-500/30 hover:bg-rose-500/20 text-rose-200 shrink-0"
            icon={<RefreshCw className={`w-3.5 h-3.5 mr-1 ${isSaving ? 'animate-spin' : ''}`} />}
          >
            Retry
          </Button>
        </Card>
      )}

      {/* Tenant Public Subdomain & Customer Portal Card */}
      <Card className="bg-[#12151b] border-[#1e232e] p-6 rounded-xl space-y-4 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider font-mono">Customer Ordering Portal</span>
                <Badge variant="brand" className="font-mono text-[10px]">ACTIVE</Badge>
              </div>
              <h4 className="text-sm sm:text-base font-bold text-white font-mono mt-0.5 break-all">
                {customerUrl}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Your venue's dedicated digital menu & table ordering URL. Scanned QR codes and public diners access this link.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyPublicUrl}
              className="text-xs border-[#1e232e] bg-[#12151b] hover:bg-[#181d27] text-slate-200"
              icon={<Copy className="w-3.5 h-3.5 mr-1" />}
            >
              {copiedUrl ? 'Copied! ✓' : 'Copy Link'}
            </Button>
            <a
              href={customerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Customer App
            </a>
          </div>
        </div>
      </Card>

      {/* Business Model Summary Box */}
      <Card className="bg-[#12151b] border-[#1e232e] p-5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Active Business Model:</span>
              <Badge variant="brand" className="font-bold">{bType}</Badge>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {bType === 'FOOD_CART'
                ? 'Food Cart / Counter Kiosk configuration (Streamlined for fast service & counter collection).'
                : bType === 'BAR'
                ? 'Bar & Lounge configuration (Tailored for beverage-heavy mixology & floor service).'
                : 'Restaurant configuration (Full-service dining with flexible operational terminals).'}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[10px] text-slate-500 uppercase font-mono block">Active Terminals</span>
          <span className="text-xl font-bold text-emerald-400 font-mono">
            {enabledModules.length} Enabled
          </span>
        </div>
      </Card>

      {/* Terminal Modules Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" /> Operational Terminals & Modules
          </h3>
          <span className="text-xs text-slate-400 font-mono">Toggle to enable or disable</span>
        </div>

        <div className="grid grid-cols-1 gap-3.5">
          {modulesConfig.map((mod) => {
            const IconComp = mod.icon;
            const isEnabled = enabledModules.includes(mod.key);
            const status = rowStatus[mod.key] || 'idle';

            if (!mod.isOffered) {
              return (
                <div
                  key={mod.key}
                  className="p-4 rounded-xl border border-[#1e232e] bg-[#0e1117]/60 text-slate-600 flex items-center justify-between gap-4 opacity-50"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="p-2.5 rounded-lg border border-[#1e232e] bg-[#12151b] text-slate-600">
                      <IconComp className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-500 text-sm line-through">{mod.name}</span>
                        <Badge variant="outline" className="text-[9px] border-[#1e232e] text-slate-600">Not Applicable for {bType}</Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">This module is not offered under your current business model.</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-600 font-mono font-bold">UNAVAILABLE</span>
                </div>
              );
            }

            return (
              <div
                key={mod.key}
                onClick={() => toggleModule(mod.key)}
                className={`p-4 sm:p-5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-4 ${
                  isEnabled
                    ? 'bg-[#12151b] border-[#1e232e] hover:border-emerald-500/50 shadow-xs'
                    : 'bg-[#0e1117] border-[#1e232e] text-slate-500 opacity-60 hover:opacity-80'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3.5">
                  <div
                    className={`p-3 rounded-xl border shrink-0 transition-colors ${
                      isEnabled ? 'bg-[#181d27] border-[#2d3545] text-emerald-400' : 'bg-[#0e1117] border-[#1e232e] text-slate-600'
                    }`}
                  >
                    <IconComp className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-bold text-sm ${isEnabled ? 'text-white' : 'text-slate-400'}`}>
                        {mod.name}
                      </span>
                      <Badge variant={isEnabled ? 'brand' : 'outline'} className="text-[9px]">
                        {mod.badge}
                      </Badge>
                      {isEnabled ? (
                        <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono font-bold bg-[#181d27] px-2 py-0.5 rounded-full border border-[#2d3545]">
                          DISABLED
                        </span>
                      )}

                      {/* Realtime Save State Indicators */}
                      {status === 'saving' && (
                        <span className="text-[10px] text-amber-400 font-mono font-bold flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                        </span>
                      )}
                      {status === 'saved' && (
                        <span className="text-[10px] text-emerald-400 font-mono font-bold flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Saved ✓
                        </span>
                      )}
                      {status === 'failed' && (
                        <span className="text-[10px] text-rose-400 font-mono font-bold flex items-center gap-1 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                          <AlertCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xl">{mod.desc}</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono pt-0.5">
                      <Users className="w-3 h-3 text-slate-400" />
                      <span>Authorized Roles:</span>
                      <span className="text-slate-300">{mod.roles}</span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    disabled={isSaving}
                    onChange={() => {}}
                    className="w-5 h-5 rounded text-emerald-500 accent-emerald-500 cursor-pointer disabled:opacity-50"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historical Data Safety Notice */}
      <div className="p-4 bg-[#12151b] border border-[#1e232e] rounded-xl flex items-start gap-3 text-xs text-slate-300">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-bold text-white block">Safe Data Preservation Policy</span>
          <p className="text-slate-400 text-xs leading-relaxed">
            Disabling a terminal only removes its navigation access and operational interface. Historical orders, receipts, inventory records, and audit logs are safely preserved and never deleted.
          </p>
        </div>
      </div>
    </div>
  );
};
