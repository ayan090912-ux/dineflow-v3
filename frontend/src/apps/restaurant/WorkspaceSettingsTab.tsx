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

  useEffect(() => {
    if (restaurant) {
      const current = restaurant.enabledModules || [
        'kitchen',
        'inventory',
        'billing',
        ...(restaurant.hasWaiter ? ['waiter'] : []),
        ...(restaurant.hasBar ? ['bar'] : []),
      ];
      setEnabledModules(current);
      setHasSeating(restaurant.hasTables !== false);
    }
  }, [restaurant]);

  const toggleModule = (moduleKey: string) => {
    // Food Cart rule: Bar is not supported
    if (bType === 'FOOD_CART' && moduleKey === 'bar') {
      addToast('warning', 'Terminal Restricted', 'Bar Terminal KDS is not supported for Food Cart businesses.');
      return;
    }

    setEnabledModules((prev) => {
      if (prev.includes(moduleKey)) {
        // Prevent disabling all modules
        if (prev.length <= 1) {
          addToast('warning', 'Minimum Required', 'At least one terminal module must remain active.');
          return prev;
        }
        return prev.filter((m) => m !== moduleKey);
      } else {
        return [...prev, moduleKey];
      }
    });
  };

  const handleSave = async () => {
    if (!restaurant) return;
    setIsSaving(true);
    try {
      const hasKitchen = enabledModules.includes('kitchen');
      const hasWaiter = enabledModules.includes('waiter');
      const hasBar = enabledModules.includes('bar');
      const hasInventory = enabledModules.includes('inventory');
      const hasBilling = enabledModules.includes('billing');

      await api.updateWorkspaceModules(restaurant.id, enabledModules, {
        hasKitchen,
        hasWaiter,
        hasBar,
        hasInventory,
        hasBilling,
        hasTables: hasSeating,
      });

      await onRefreshRestaurant();
      addToast('success', 'Workspace Updated 🚀', 'Terminal permissions & navigation updated immediately.');
    } catch (err: any) {
      addToast('error', 'Update Failed', err?.message || 'Failed to save workspace configuration.');
    } finally {
      setIsSaving(false);
    }
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
      icon: Wine,
      badge: bType === 'BAR' ? 'Primary' : 'Beverage Ops',
      color: 'text-purple-400',
      badgeVariant: 'brand' as const,
      isOffered: bType !== 'FOOD_CART', // Bar not offered for Food Cart
    },
    {
      key: 'inventory',
      name: 'Inventory & Stock OS',
      desc: 'Raw ingredient tracking, low-stock alerts, supplier management, and consumption logging.',
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
      icon: Receipt,
      badge: 'Financial & POS',
      color: 'text-sky-400',
      badgeVariant: 'info' as const,
      isOffered: true,
    },
  ];

  return (
    <div className="space-y-8 max-w-4xl animate-in fade-in">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="brand" className="text-[10px] uppercase font-mono">Workspace Configuration</Badge>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400 font-bold">{restaurant?.name || 'My Business'}</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            Workspace & Terminal Management
          </h2>
          <p className="text-xs text-slate-400">
            Configure the operational tools enabled for this venue. Navigation will update instantly based on your choices.
          </p>
        </div>

        <Button
          variant="brand"
          onClick={handleSave}
          isLoading={isSaving}
          className="text-xs font-bold px-6 py-2.5 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-lg shadow-rose-950/40 shrink-0"
          icon={<Save className="w-4 h-4 mr-1" />}
        >
          Save Workspace Changes
        </Button>
      </div>

      {/* Tenant Public Subdomain & Customer Portal Card */}
      <Card className="bg-slate-900 border-indigo-500/30 p-6 rounded-2xl space-y-4 shadow-xl shadow-indigo-950/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shrink-0">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-indigo-300 font-semibold uppercase tracking-wider font-mono">Public Tenant Domain</span>
                <Badge variant="success" className="font-mono text-[10px]">LIVE SUBDOMAIN</Badge>
              </div>
              <h4 className="text-lg font-black text-white font-mono mt-0.5">
                {publicDomain}
              </h4>
              <p className="text-xs text-slate-400 mt-1">
                Your restaurant's dedicated customer ordering domain. Scanned QR codes and public diners access this exclusive subdomain.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyPublicUrl}
              className="text-xs border-slate-700 hover:bg-slate-800 text-slate-200"
              icon={<Copy className="w-3.5 h-3.5 mr-1" />}
            >
              {copiedUrl ? 'Copied! ✓' : 'Copy Link'}
            </Button>
            <a
              href={customerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-950/40"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Customer App
            </a>
          </div>
        </div>
      </Card>

      {/* Business Model Summary Box */}
      <Card className="bg-slate-900 border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 shrink-0">
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
          <span className="text-xl font-black text-emerald-400 font-mono">
            {enabledModules.length} Enabled
          </span>
        </div>
      </Card>

      {/* Terminal Modules Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-rose-400" /> Operational Terminals & Modules
          </h3>
          <span className="text-xs text-slate-400 font-mono">Toggle to enable or disable</span>
        </div>

        <div className="grid grid-cols-1 gap-3.5">
          {modulesConfig.map((mod) => {
            const IconComp = mod.icon;
            const isEnabled = enabledModules.includes(mod.key);

            if (!mod.isOffered) {
              return (
                <div
                  key={mod.key}
                  className="p-4 rounded-2xl border border-slate-800/40 bg-slate-950/40 text-slate-600 flex items-center justify-between gap-4 opacity-50"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-600">
                      <IconComp className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-500 text-sm line-through">{mod.name}</span>
                        <Badge variant="outline" className="text-[9px] border-slate-800 text-slate-600">Not Applicable for {bType}</Badge>
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
                className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-4 ${
                  isEnabled
                    ? 'bg-slate-900 border-slate-700/80 hover:border-rose-500/50 shadow-md'
                    : 'bg-slate-950 border-slate-800/80 text-slate-500 opacity-60 hover:opacity-80'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3.5">
                  <div
                    className={`p-3 rounded-2xl border shrink-0 transition-colors ${
                      isEnabled ? 'bg-slate-800 border-slate-700 ' + mod.color : 'bg-slate-950 border-slate-800 text-slate-600'
                    }`}
                  >
                    <IconComp className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-bold text-sm ${isEnabled ? 'text-white' : 'text-slate-400'}`}>
                        {mod.name}
                      </span>
                      <Badge variant={isEnabled ? mod.badgeVariant : 'outline'} className="text-[9px]">
                        {mod.badge}
                      </Badge>
                      {isEnabled ? (
                        <span className="text-[10px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          ACTIVE
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono font-bold bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
                          DISABLED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-xl">{mod.desc}</p>
                  </div>
                </div>

                <div className="shrink-0">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => {}}
                    className="w-5 h-5 rounded text-rose-500 accent-rose-500 cursor-pointer"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historical Data Safety Notice */}
      <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-2xl flex items-start gap-3 text-xs text-slate-300">
        <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
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
