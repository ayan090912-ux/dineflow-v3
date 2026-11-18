import React, { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Palette,
  Store,
  Upload,
  Image as ImageIcon,
  Check,
  Save,
  RefreshCw,
  Smartphone,
  Sparkles,
  Trash2,
  Eye,
  Sliders,
  CheckCircle2,
  Printer,
  QrCode,
  ShieldAlert,
  Flame,
  Wine,
  Utensils,
  Bell,
  Receipt,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { Button, Card, Badge, Input } from '../../packages/ui';
import { useTheme } from '../../packages/theme/ThemeEngine';
import { api } from '../../packages/api/client';
import { Restaurant } from '../../packages/types';
import { getRestaurantCustomerUrl } from '../../packages/utils/tenantResolver';

interface BrandThemeTerminalOSProps {
  restaurant?: Restaurant | any;
  onRefreshData?: () => Promise<void>;
  addToast?: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

const CURATED_PALETTES = [
  { name: 'Crimson Rose', hex: '#e11d48', label: 'Lounge & Bistro' },
  { name: 'Warm Amber', hex: '#f59e0b', label: 'Cafe & Bakery' },
  { name: 'Emerald Fresh', hex: '#10b981', label: 'Healthy & Vegan' },
  { name: 'Cyber Cyan', hex: '#06b6d4', label: 'Nightclub & Bar' },
  { name: 'Sunset Flame', hex: '#f97316', label: 'Grill & BBQ' },
  { name: 'Royal Violet', hex: '#8b5cf6', label: 'Cocktails & Hookah' },
  { name: 'Midnight Gold', hex: '#eab308', label: 'Fine Dining' },
  { name: 'Obsidian Noir', hex: '#334155', label: 'Minimalist Dark' },
];

export const BrandThemeTerminalOS: React.FC<BrandThemeTerminalOSProps> = ({
  restaurant,
  onRefreshData,
  addToast,
}) => {
  const { theme, updateThemeColor, setTheme } = useTheme();

  // Terminal navigation views: 'identity' (Core & Palette), 'controls' (Storefront Options), 'simulator' (Live QR & Phone)
  const [terminalSection, setTerminalSection] = useState<'identity' | 'controls' | 'simulator'>('identity');
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'standee'>('mobile');

  // Input states & local buffers
  const [isSaving, setIsSaving] = useState(false);
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(false);
  const [showBannerUrlInput, setShowBannerUrlInput] = useState(false);
  const [logoUrlText, setLogoUrlText] = useState('');
  const [bannerUrlText, setBannerUrlText] = useState('');

  // Storefront operational features
  const [allowTableOrdering, setAllowTableOrdering] = useState<boolean>(
    theme.allowTableOrdering ?? true
  );
  const [enableCallStaff, setEnableCallStaff] = useState<boolean>(
    theme.enableCallStaff ?? true
  );
  const [enableBillRequest, setEnableBillRequest] = useState<boolean>(
    theme.enableBillRequest ?? true
  );
  const [showAgeGateBadges, setShowAgeGateBadges] = useState<boolean>(
    theme.showAgeGateBadges ?? true
  );

  // Hidden file inputs
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);

  // Clock for OS header
  const [currentTime, setCurrentTime] = useState('');
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Effective destination URL for customer QR standee
  const currentRestId = restaurant?.id || theme.restaurantId || api.getCurrentRestaurantId();
  const customerQrUrl = getRestaurantCustomerUrl(restaurant || currentRestId, 'Table 01');

  // Handle local file uploads
  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) updateThemeColor('logo', ev.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleBannerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) updateThemeColor('bannerUrl', ev.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Publish & Save Brand Settings
  const handleSaveBrandSettings = async () => {
    setIsSaving(true);
    try {
      const restId = restaurant?.id || api.getCurrentRestaurantId();
      const updatedTheme = {
        ...theme,
        restaurantName: theme.restaurantName || restaurant?.name || 'Restaurant',
        allowTableOrdering,
        enableCallStaff,
        enableBillRequest,
        showAgeGateBadges,
      };

      if (restId) {
        await api.updateRestaurantTheme(restId, updatedTheme);
        await api.updateRestaurantDetails(restId, {
          name: updatedTheme.restaurantName,
          currency: updatedTheme.currency || 'INR (₹)',
        });
      }

      setTheme(updatedTheme);

      if (addToast) {
        addToast(
          'success',
          'Storefront Branding Published 🎨',
          'Theme, accent colors, logo, and operational controls are now live across all customer QR menus.'
        );
      }
      if (onRefreshData) await onRefreshData();
    } catch (err: any) {
      if (addToast) {
        addToast('error', 'Save Failed', err.message || 'Unable to save brand settings.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default brand values
  const handleResetDefaults = () => {
    updateThemeColor('primaryColor', '#e11d48');
    setAllowTableOrdering(true);
    setEnableCallStaff(true);
    setEnableBillRequest(true);
    setShowAgeGateBadges(true);
    if (addToast) {
      addToast('info', 'Reset to Defaults', 'Brand settings restored to standard template.');
    }
  };

  const primaryAccent = theme.primaryColor || '#e11d48';

  return (
    <div className="space-y-6">
      {/* 1. TERMINAL OS MASTER TOP BAR (Identical to Waiter / Bar / Hookah Terminal) */}
      <div className="bg-[#12151b] border border-white/[0.08] p-4 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg transition-transform"
            style={{ backgroundColor: primaryAccent }}
          >
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ backgroundColor: primaryAccent }}
                />
                <span
                  className="relative inline-flex rounded-full h-2.5 w-2.5"
                  style={{ backgroundColor: primaryAccent }}
                />
              </span>
              <span className="text-xs font-mono font-bold text-white tracking-wider uppercase">
                BRANDING & STOREFRONT OS
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                LIVE ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Digital storefront styling, palette, media assets & interactive QR standee simulator.
            </p>
          </div>
        </div>

        {/* View Segment Tabs & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 bg-black/40 rounded-xl border border-white/[0.06]">
            <button
              onClick={() => setTerminalSection('identity')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-all ${
                terminalSection === 'identity'
                  ? 'bg-white/[0.1] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🎨 Brand & Media
            </button>
            <button
              onClick={() => setTerminalSection('controls')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-all ${
                terminalSection === 'controls'
                  ? 'bg-white/[0.1] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚙️ Controls
            </button>
            <button
              onClick={() => setTerminalSection('simulator')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-all ${
                terminalSection === 'simulator'
                  ? 'bg-white/[0.1] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📱 Live Simulator
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleResetDefaults}
            className="text-xs h-9 px-3 border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300"
            title="Reset to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>

          <Button
            variant="brand"
            size="sm"
            disabled={isSaving}
            onClick={handleSaveBrandSettings}
            className="text-xs h-9 px-4 font-bold flex items-center gap-1.5 shadow-lg active:scale-95"
            style={{ backgroundColor: primaryAccent }}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Publishing...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" /> Publish Live
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 2. OPERATIONAL METRIC HUD BAR */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 bg-[#12151b] border border-white/[0.06] rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Storefront Name</span>
            <span className="text-xs font-bold text-white truncate max-w-[140px] block mt-0.5">
              {theme.restaurantName || restaurant?.name || 'THE START'}
            </span>
          </div>
          <Store className="w-4 h-4 text-emerald-400 shrink-0" />
        </div>

        <div className="p-3 bg-[#12151b] border border-white/[0.06] rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Accent Palette</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: primaryAccent }} />
              <span className="text-xs font-mono font-bold text-white uppercase">{primaryAccent}</span>
            </div>
          </div>
          <Palette className="w-4 h-4 text-rose-400 shrink-0" />
        </div>

        <div className="p-3 bg-[#12151b] border border-white/[0.06] rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Logo Emblem</span>
            <span className="text-xs font-mono font-medium text-slate-200 block mt-0.5">
              {theme.logo ? 'Active Custom Logo' : 'Default Emblem'}
            </span>
          </div>
          <CheckCircle2 className={`w-4 h-4 shrink-0 ${theme.logo ? 'text-emerald-400' : 'text-slate-500'}`} />
        </div>

        <div className="p-3 bg-[#12151b] border border-white/[0.06] rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Cover Banner</span>
            <span className="text-xs font-mono font-medium text-slate-200 block mt-0.5">
              {theme.bannerUrl ? 'High-Res Hero Set' : 'Default Atmosphere'}
            </span>
          </div>
          <ImageIcon className={`w-4 h-4 shrink-0 ${theme.bannerUrl ? 'text-emerald-400' : 'text-slate-500'}`} />
        </div>
      </div>

      {/* 3. MAIN TERMINAL WORKSPACE (2-COLUMN GRID) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Settings Panels */}
        <div className="xl:col-span-7 space-y-6">
          {/* VIEW TAB 1: BRAND IDENTITY & MEDIA ASSETS */}
          {(terminalSection === 'identity' || terminalSection === 'simulator') && (
            <>
              {/* SECTION A: Core Brand Identity */}
              <div className="bg-[#12151b] border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold flex items-center justify-center">
                      1
                    </span>
                    <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      STOREFRONT IDENTITY & BRAND CORE
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Public Customer Branding</span>
                </div>

                <div className="space-y-4">
                  <Input
                    label="Restaurant Display Name *"
                    placeholder="e.g. THE START, Bistro Lumière"
                    value={theme.restaurantName || ''}
                    onChange={(e) => updateThemeColor('restaurantName', e.target.value)}
                  />

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Storefront Tagline / Hero Caption (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Touchless Dining & Shisha Lounge, Wood-Fired Pizza & Craft Drinks"
                      value={theme.tagline || ''}
                      onChange={(e) => updateThemeColor('tagline', e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#0b0d11] border border-white/[0.08] rounded-xl text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Regional Currency Symbol
                    </label>
                    <div className="px-3.5 py-2.5 bg-[#0b0d11] border border-white/[0.08] rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                        <span className="text-base">🇮🇳</span>
                        <span>INR (₹) — Indian Rupee</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        Standard Merchant Currency
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION B: Primary Color Palette */}
              <div className="bg-[#12151b] border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono font-bold flex items-center justify-center">
                      2
                    </span>
                    <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      PRIMARY BRAND ACCENT & PALETTE
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Applied to Buttons & Badges</span>
                </div>

                {/* 1-Click Curated Presets */}
                <div>
                  <label className="block text-[11px] font-mono uppercase text-slate-400 mb-2">
                    Curated Restaurant Presets
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {CURATED_PALETTES.map((preset) => {
                      const isSelected = primaryAccent.toLowerCase() === preset.hex.toLowerCase();
                      return (
                        <button
                          key={preset.hex}
                          type="button"
                          onClick={() => updateThemeColor('primaryColor', preset.hex)}
                          className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-left transition-all active:scale-95 ${
                            isSelected
                              ? 'bg-white/[0.08] border-white/40 ring-2 ring-white/20'
                              : 'bg-[#0b0d11] border-white/[0.06] hover:bg-white/[0.04]'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full shrink-0 shadow-sm flex items-center justify-center"
                            style={{ backgroundColor: preset.hex }}
                          >
                            {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                          </span>
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-slate-200 truncate block">
                              {preset.name}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Hex Code Picker */}
                <div className="pt-2 border-t border-white/[0.06]">
                  <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1.5">
                    Custom Hex Code & Swatch
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <input
                        type="color"
                        value={primaryAccent}
                        onChange={(e) => updateThemeColor('primaryColor', e.target.value)}
                        className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border border-white/20 p-0.5"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={primaryAccent}
                        onChange={(e) => updateThemeColor('primaryColor', e.target.value)}
                        placeholder="#e11d48"
                        className="w-full px-3.5 py-2 bg-[#0b0d11] border border-white/[0.08] rounded-xl text-xs font-mono text-white uppercase focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION C: Official Logo & Cover Banner Assets */}
              <div className="bg-[#12151b] border border-white/[0.08] rounded-2xl p-5 space-y-5 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-bold flex items-center justify-center">
                      3
                    </span>
                    <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                      OFFICIAL MEDIA & DIGITAL ASSETS
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Logo Emblem & Cover Banner</span>
                </div>

                {/* Hidden Inputs */}
                <input
                  type="file"
                  ref={logoFileInputRef}
                  accept="image/*"
                  onChange={handleLogoFile}
                  className="hidden"
                />
                <input
                  type="file"
                  ref={bannerFileInputRef}
                  accept="image/*"
                  onChange={handleBannerFile}
                  className="hidden"
                />

                {/* 1. Official Logo Emblem */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Official Restaurant Logo Emblem
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3.5 rounded-xl bg-[#0b0d11] border border-white/[0.06]">
                    <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                      {theme.logo ? (
                        <img src={theme.logo} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <Store className="w-7 h-7 text-white/30" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <p className="text-xs font-medium text-white truncate">
                        {theme.logo ? 'Active Restaurant Logo' : 'No Logo Uploaded (Default Emblem Used)'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Recommended: Square format (PNG with transparency or JPEG, 200×200px+).
                      </p>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => logoFileInputRef.current?.click()}
                          className="text-xs h-8 px-3 border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"
                        >
                          <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload File
                        </Button>

                        <button
                          type="button"
                          onClick={() => setShowLogoUrlInput(!showLogoUrlInput)}
                          className="text-[11px] font-mono text-slate-400 hover:text-white px-2 py-1"
                        >
                          {showLogoUrlInput ? 'Hide URL' : 'Paste Image URL'}
                        </button>

                        {theme.logo && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => updateThemeColor('logo', '')}
                            className="text-xs h-8 px-2.5 text-rose-400 hover:text-rose-300 bg-rose-500/10 border-rose-500/20"
                            title="Remove Logo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>

                      {showLogoUrlInput && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="url"
                            placeholder="https://..."
                            value={logoUrlText}
                            onChange={(e) => setLogoUrlText(e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-black/40 border border-white/[0.08] rounded-lg text-xs text-white"
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              if (logoUrlText.trim()) {
                                updateThemeColor('logo', logoUrlText.trim());
                                setShowLogoUrlInput(false);
                                setLogoUrlText('');
                              }
                            }}
                            className="text-xs h-7 px-2.5"
                          >
                            Apply
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Storefront Cover Banner */}
                <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                  <label className="block text-xs font-semibold text-slate-300">
                    Customer Storefront Cover Banner
                  </label>
                  <div className="space-y-2.5">
                    <div className="w-full h-32 rounded-2xl bg-slate-900 border border-white/10 overflow-hidden relative shadow-md">
                      {theme.bannerUrl ? (
                        <>
                          <img src={theme.bannerUrl} alt="Cover Banner" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                          <div className="absolute bottom-3 left-4 text-xs font-medium text-white/80">
                            Cover Banner Active
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-white/30 space-y-1">
                          <ImageIcon className="w-8 h-8" />
                          <span className="text-xs text-white/40">Default Restaurant Atmospheric Banner Active</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">
                        Wide banner displayed behind restaurant logo at top of customer QR menu.
                      </span>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => bannerFileInputRef.current?.click()}
                          className="text-xs h-8 px-3 border-white/15 bg-white/[0.04] hover:bg-white/[0.08]"
                        >
                          <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload Banner
                        </Button>

                        <button
                          type="button"
                          onClick={() => setShowBannerUrlInput(!showBannerUrlInput)}
                          className="text-[11px] font-mono text-slate-400 hover:text-white px-2 py-1"
                        >
                          {showBannerUrlInput ? 'Hide URL' : 'Paste Image URL'}
                        </button>

                        {theme.bannerUrl && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => updateThemeColor('bannerUrl', '')}
                            className="text-xs h-8 px-2.5 text-rose-400 hover:text-rose-300 bg-rose-500/10 border-rose-500/20"
                            title="Remove Banner"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {showBannerUrlInput && (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="url"
                          placeholder="https://..."
                          value={bannerUrlText}
                          onChange={(e) => setBannerUrlText(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-black/40 border border-white/[0.08] rounded-lg text-xs text-white"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            if (bannerUrlText.trim()) {
                              updateThemeColor('bannerUrl', bannerUrlText.trim());
                              setShowBannerUrlInput(false);
                              setBannerUrlText('');
                            }
                          }}
                          className="text-xs h-7 px-2.5"
                        >
                          Apply
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* VIEW TAB 2: STOREFRONT OPERATIONAL CONTROLS */}
          {(terminalSection === 'controls' || terminalSection === 'simulator') && (
            <div className="bg-[#12151b] border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono font-bold flex items-center justify-center">
                    4
                  </span>
                  <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                    STOREFRONT OPERATIONAL CONTROLS
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-slate-400">Customer Menu Behavior</span>
              </div>

              <div className="space-y-3">
                {/* 1. Direct Table Ordering */}
                <div className="p-3.5 bg-[#0b0d11] rounded-xl border border-white/[0.06] flex items-center justify-between gap-4">
                  <div>
                    <h5 className="text-xs font-bold text-white flex items-center gap-2">
                      <Utensils className="w-4 h-4 text-emerald-400" /> Direct QR Table Ordering
                    </h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Allow seated guests to add items to their cart and send orders directly to the Kitchen/Bar pass.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={allowTableOrdering}
                      onChange={(e) => setAllowTableOrdering(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"
                      style={{ backgroundColor: allowTableOrdering ? primaryAccent : undefined }}
                    />
                  </label>
                </div>

                {/* 2. Call Staff Button */}
                <div className="p-3.5 bg-[#0b0d11] rounded-xl border border-white/[0.06] flex items-center justify-between gap-4">
                  <div>
                    <h5 className="text-xs font-bold text-white flex items-center gap-2">
                      <Bell className="w-4 h-4 text-amber-400" /> Customer "Call Staff" Button
                    </h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Displays a one-tap call staff dock in the customer header to ring the Waiter Terminal.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={enableCallStaff}
                      onChange={(e) => setEnableCallStaff(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"
                      style={{ backgroundColor: enableCallStaff ? primaryAccent : undefined }}
                    />
                  </label>
                </div>

                {/* 3. Digital Bill Request */}
                <div className="p-3.5 bg-[#0b0d11] rounded-xl border border-white/[0.06] flex items-center justify-between gap-4">
                  <div>
                    <h5 className="text-xs font-bold text-white flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-cyan-400" /> Digital Bill & UPI QR Payment
                    </h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Allow customers to view their itemized running total and scan the dynamic UPI QR to pay.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={enableBillRequest}
                      onChange={(e) => setEnableBillRequest(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"
                      style={{ backgroundColor: enableBillRequest ? primaryAccent : undefined }}
                    />
                  </label>
                </div>

                {/* 4. Age Gate Statutory Badges */}
                <div className="p-3.5 bg-[#0b0d11] rounded-xl border border-white/[0.06] flex items-center justify-between gap-4">
                  <div>
                    <h5 className="text-xs font-bold text-white flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-purple-400" /> Hookah (18+) & Bar (21+) Compliance Badges
                    </h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Show statutory adult age verification badges on liquor and shisha product categories.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={showAgeGateBadges}
                      onChange={(e) => setShowAgeGateBadges(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"
                      style={{ backgroundColor: showAgeGateBadges ? primaryAccent : undefined }}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Save Action Row */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] font-mono text-slate-400">
              {currentTime} · Realtime sync active
            </span>

            <Button
              variant="brand"
              disabled={isSaving}
              onClick={handleSaveBrandSettings}
              className="px-6 py-2.5 font-bold text-xs flex items-center gap-2 shadow-lg active:scale-95"
              style={{ backgroundColor: primaryAccent }}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Publishing...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> Publish Live to Storefront
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right Column: Sticky Realistic Dual Simulator */}
        <div className="xl:col-span-5 sticky top-6 space-y-3">
          {/* Simulator Mode Switcher */}
          <div className="flex items-center justify-between p-1 bg-[#12151b] border border-white/[0.08] rounded-xl">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPreviewDevice('mobile')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
                  previewDevice === 'mobile'
                    ? 'bg-white/[0.1] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" /> Mobile Menu
              </button>

              <button
                type="button"
                onClick={() => setPreviewDevice('standee')}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${
                  previewDevice === 'standee'
                    ? 'bg-white/[0.1] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" /> QR Standee
              </button>
            </div>

            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              Realtime Sync
            </span>
          </div>

          {/* SIMULATOR 1: MOBILE SMARTPHONE FRAME */}
          {previewDevice === 'mobile' && (
            <div className="w-full max-w-[340px] mx-auto rounded-[36px] bg-[#0c0e14] border-[3px] border-white/15 shadow-2xl p-3 space-y-3 relative overflow-hidden">
              {/* Dynamic Island Notch */}
              <div className="w-24 h-4 bg-black rounded-full mx-auto" />

              {/* Status Bar */}
              <div className="flex items-center justify-between text-[10px] text-white/60 font-mono px-3">
                <span>12:07</span>
                <span className="text-[9px]">5G · 100%</span>
              </div>

              {/* Storefront Header Card */}
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#141721] relative shadow-md">
                {/* Cover Banner */}
                <div className="h-28 w-full bg-slate-800 relative overflow-hidden">
                  {theme.bannerUrl ? (
                    <img src={theme.bannerUrl} alt="Storefront Banner" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-white/20 text-xs">
                      Atmospheric Cover
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#141721] via-transparent to-black/30" />
                </div>

                {/* Logo & Storefront Info */}
                <div className="px-3.5 pb-3 -mt-6 relative flex items-end justify-between">
                  <div className="flex items-end gap-2.5">
                    <div className="w-12 h-12 rounded-xl bg-slate-900 border-2 border-[#141721] overflow-hidden shrink-0 shadow-lg">
                      {theme.logo ? (
                        <img src={theme.logo} alt="Logo" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40">
                          <Store className="w-5 h-5" />
                        </div>
                      )}
                    </div>
                    <div className="pb-0.5">
                      <p className="text-xs font-bold text-white truncate max-w-[150px]">
                        {theme.restaurantName || restaurant?.name || 'THE START'}
                      </p>
                      <p className="text-[9px] text-slate-400">
                        {theme.tagline || 'Touchless Menu & Ordering'}
                      </p>
                    </div>
                  </div>

                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    Open
                  </span>
                </div>
              </div>

              {/* Customer Quick Action Buttons (Reactivity synced to toggles!) */}
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div
                  className={`p-1.5 rounded-xl border text-[10px] font-medium transition-all ${
                    enableCallStaff
                      ? 'bg-white/[0.04] border-white/[0.08] text-slate-200'
                      : 'bg-white/[0.01] border-white/[0.03] text-white/20 line-through'
                  }`}
                >
                  📞 Call Staff
                </div>
                <div className="p-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-[10px] text-slate-200 font-medium">
                  🕒 Orders
                </div>
                <div
                  className={`p-1.5 rounded-xl border text-[10px] font-medium transition-all ${
                    enableBillRequest
                      ? 'bg-white/[0.04] border-white/[0.08] text-slate-200'
                      : 'bg-white/[0.01] border-white/[0.03] text-white/20 line-through'
                  }`}
                >
                  💳 Bill
                </div>
              </div>

              {/* Category Pill Tabs */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  className="px-3 py-1 rounded-xl text-[11px] font-bold text-white shadow-sm flex items-center gap-1"
                  style={{ backgroundColor: primaryAccent }}
                >
                  <span>🍽️</span> Food
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded-xl text-[11px] font-medium text-slate-400 bg-white/[0.04] border border-white/[0.06] flex items-center gap-1"
                >
                  <span>🍸</span> Bar {showAgeGateBadges && <span className="text-[8px] text-amber-400 font-mono">21+</span>}
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded-xl text-[11px] font-medium text-slate-400 bg-white/[0.04] border border-white/[0.06] flex items-center gap-1"
                >
                  <span>💨</span> Hookah {showAgeGateBadges && <span className="text-[8px] text-rose-400 font-mono">18+</span>}
                </button>
              </div>

              {/* Sample Menu Item Card */}
              <div className="p-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-11 h-11 rounded-xl bg-slate-800 overflow-hidden shrink-0">
                    <img
                      src="https://images.unsplash.com/photo-1544025162-d76694265947?w=120&auto=format&fit=crop&q=80"
                      alt="Dish"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white leading-tight">Artisanal Truffle Pizza</p>
                    <p className="text-[10px] font-mono text-emerald-400 font-bold mt-0.5">₹799.00</p>
                  </div>
                </div>

                {allowTableOrdering ? (
                  <button
                    type="button"
                    className="px-3 py-1 rounded-lg text-[11px] font-bold text-white shadow-sm active:scale-95 transition-transform"
                    style={{ backgroundColor: primaryAccent }}
                  >
                    + Add
                  </button>
                ) : (
                  <span className="text-[9px] font-mono text-slate-400 bg-white/[0.05] px-2 py-1 rounded">
                    View Only
                  </span>
                )}
              </div>

              {/* Sample Floating Bottom Cart */}
              <div
                className="p-2.5 rounded-xl text-white flex items-center justify-between text-xs font-bold shadow-lg"
                style={{ backgroundColor: primaryAccent }}
              >
                <span>1 Item Selected</span>
                <span>View Order → ₹799</span>
              </div>

              <p className="text-[9px] text-center text-slate-500 pt-0.5">Powered by Dinely Touchless</p>
            </div>
          )}

          {/* SIMULATOR 2: TABLE STANDEE ACRYLIC CARD */}
          {previewDevice === 'standee' && (
            <div className="w-full max-w-[340px] mx-auto rounded-3xl bg-[#0e1118] border-2 border-white/20 shadow-2xl p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-white p-1 mx-auto shadow-md overflow-hidden">
                {theme.logo ? (
                  <img src={theme.logo} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full bg-slate-900 rounded-xl flex items-center justify-center text-white/50">
                    <Store className="w-6 h-6" />
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  {theme.restaurantName || restaurant?.name || 'DINELY RESTAURANT'}
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">Touchless Dining & Table Ordering</p>
              </div>

              {/* QR Code Container */}
              <div className="w-44 h-44 bg-white p-3 rounded-2xl mx-auto shadow-xl flex items-center justify-center">
                <QRCodeSVG value={customerQrUrl} size={150} level="M" />
              </div>

              <div
                className="py-1.5 px-4 rounded-xl text-xs font-bold text-white mx-auto inline-block shadow-md uppercase tracking-wider font-mono"
                style={{ backgroundColor: primaryAccent }}
              >
                SCAN TO ORDER FROM TABLE
              </div>

              <div className="pt-1 text-[10px] font-mono text-slate-400">
                Table 01 · Scan with Camera or any UPI App
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400 text-center px-4">
            Guests scan the table QR code to view this exact customized menu.
          </p>
        </div>
      </div>
    </div>
  );
};
