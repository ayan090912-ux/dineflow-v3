import React, { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
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
  Copy,
  Star,
  Search,
  PhoneCall,
  Clock,
  EyeOff,
} from 'lucide-react';
import { Button, Card, Badge, Input } from '../../packages/ui';
import { useTheme } from '../../packages/theme/ThemeEngine';
import { api } from '../../packages/api/client';
import { Restaurant, MenuItem } from '../../packages/types';
import { getRestaurantCustomerUrl } from '../../packages/utils/tenantResolver';

interface BrandThemeTerminalOSProps {
  restaurant?: Restaurant | any;
  menuItems?: MenuItem[];
  onRefreshData?: () => Promise<void>;
  addToast?: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

export const BrandThemeTerminalOS: React.FC<BrandThemeTerminalOSProps> = ({
  restaurant,
  menuItems = [],
  onRefreshData,
  addToast,
}) => {
  const { theme, updateThemeColor, setTheme } = useTheme();

  // View state: 'editor' (full-width) or 'preview' (side-by-side)
  const [showLivePreview, setShowLivePreview] = useState(true);
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'standee'>('mobile');
  const [previewTab, setPreviewTab] = useState<'FOOD' | 'BAR' | 'HOOKAH'>('FOOD');

  // Input states & local buffers
  const [isSaving, setIsSaving] = useState(false);
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(false);
  const [showBannerUrlInput, setShowBannerUrlInput] = useState(false);
  const [logoUrlText, setLogoUrlText] = useState('');
  const [bannerUrlText, setBannerUrlText] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

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
      setCurrentTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
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
          'Theme, assets, and operational controls are live across all customer QR menus.'
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
    setAllowTableOrdering(true);
    setEnableCallStaff(true);
    setEnableBillRequest(true);
    setShowAgeGateBadges(true);
    if (addToast) {
      addToast('info', 'Reset to Defaults', 'Brand settings restored to standard template.');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(customerQrUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    if (addToast) {
      addToast('success', 'URL Copied', 'Customer QR link copied to clipboard.');
    }
  };

  // Sample dishes to show in preview if real menu is empty
  const previewDishes = menuItems.length > 0 ? menuItems.slice(0, 3) : [
    {
      id: 'demo-1',
      name: 'Chicken Dum Biryani',
      price: 380,
      description: 'Slow-cooked aromatic basmati rice layered with spiced marinated chicken and saffron.',
      image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=200&auto=format&fit=crop&q=80',
      isVegetarian: false,
    },
    {
      id: 'demo-2',
      name: 'Paneer Butter Masala',
      price: 320,
      description: 'Cottage cheese cubes simmered in a velvety tomato, butter, and cashew cream gravy.',
      image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=200&auto=format&fit=crop&q=80',
      isVegetarian: true,
    },
    {
      id: 'demo-3',
      name: 'Signature Mocktail / Cold Brew',
      price: 180,
      description: 'Refreshing citrus infusion with fresh mint, crushed ice, and sparkling botanical soda.',
      image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=200&auto=format&fit=crop&q=80',
      isVegetarian: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. TERMINAL OS MASTER TOP BAR */}
      <div className="bg-[#12151b] border border-white/[0.08] p-4 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-lg">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className=" absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-xs font-mono font-bold text-white tracking-wider uppercase">
                BRANDING & STOREFRONT OS
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                LIVE ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Brand identity, logo emblem, atmospheric venue banner & authentic customer preview.
            </p>
          </div>
        </div>

        {/* View Controls & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Toggle Live Preview */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLivePreview(!showLivePreview)}
            className="text-xs h-9 px-3 border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 flex items-center gap-1.5"
            title={showLivePreview ? 'Hide Customer Preview' : 'Show Customer Preview'}
          >
            {showLivePreview ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">Hide Preview</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Show Preview</span>
              </>
            )}
          </Button>

          {/* Open Live Storefront */}
          <a
            href={customerQrUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs h-9 px-3 border border-white/10 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 flex items-center gap-1.5 transition-all"
            title="Open customer app in new browser tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Open Live Storefront</span>
          </a>

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
            className="text-xs h-9 px-4 font-bold flex items-center gap-1.5 shadow-lg active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white"
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

        <div className="p-3 bg-[#12151b] border border-white/[0.06] rounded-xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Customer QR Standee</span>
            <span className="text-xs font-mono font-medium text-emerald-400 block mt-0.5">
              Ready to Scan
            </span>
          </div>
          <QrCode className="w-4 h-4 text-emerald-400 shrink-0" />
        </div>
      </div>

      {/* 3. MAIN WORKSPACE GRID */}
      <div className={`grid grid-cols-1 ${showLivePreview ? 'lg:grid-cols-12' : ''} gap-6 items-start`}>
        {/* Left Column: Essential Branding & Storefront Controls */}
        <div className={`${showLivePreview ? 'lg:col-span-7' : 'max-w-4xl mx-auto w-full'} space-y-6`}>
          {/* SECTION 1: Core Brand Identity */}
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
              <span className="text-[10px] font-mono text-slate-400">Public Restaurant Info</span>
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
                  Cuisine / Tagline (Appears next to ★ 4.9 rating in customer header)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Gourmet Dining & Shisha Lounge, Wood-Fired Pizza & Craft Drinks"
                  value={theme.tagline || ''}
                  onChange={(e) => updateThemeColor('tagline', e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0b0d11] border border-white/[0.08] rounded-xl text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Operating Base Currency
                </label>
                <div className="px-3.5 py-2.5 bg-[#0b0d11] border border-white/[0.08] rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                    <span className="text-base">🇮🇳</span>
                    <span>INR (₹) — Indian Rupee</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    Standard Currency
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Official Media & Digital Assets */}
          <div className="bg-[#12151b] border border-white/[0.08] rounded-2xl p-5 space-y-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-mono font-bold flex items-center justify-center">
                  2
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
                <div className="w-16 h-16 rounded-2xl bg-[#12151b] border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
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
                    Recommended: Square format (PNG or JPEG, 200×200px+). Displays on header, standee, and receipts.
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
                Customer Storefront Venue Hero Banner
              </label>
              <div className="space-y-2.5">
                <div className="w-full h-32 rounded-2xl bg-[#12151b] border border-white/10 overflow-hidden relative shadow-md">
                  {theme.bannerUrl ? (
                    <>
                      <img src={theme.bannerUrl} alt="Cover Banner" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-3 left-4 text-xs font-medium text-white/80">
                        Atmospheric Venue Banner Active
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white/30 space-y-1">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-xs text-white/40">Default Luxury Venue Atmosphere Active</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400">
                    High-res wide banner displayed behind the logo at the top of customer QR menu.
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

          {/* SECTION 3: Storefront Operational Controls */}
          <div className="bg-[#12151b] border border-white/[0.08] rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-mono font-bold flex items-center justify-center">
                  3
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
                    Allow seated guests to add items to cart and dispatch orders directly to the Kitchen/Bar pass.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={allowTableOrdering}
                    onChange={(e) => setAllowTableOrdering(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                </label>
              </div>

              {/* 2. Call Staff Button */}
              <div className="p-3.5 bg-[#0b0d11] rounded-xl border border-white/[0.06] flex items-center justify-between gap-4">
                <div>
                  <h5 className="text-xs font-bold text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-amber-400" /> Customer "Call Staff" Dock Button
                  </h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Displays a one-tap call staff button in the sticky customer dock to ring the Waiter Terminal.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={enableCallStaff}
                    onChange={(e) => setEnableCallStaff(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                </label>
              </div>

              {/* 3. Digital Bill Request */}
              <div className="p-3.5 bg-[#0b0d11] rounded-xl border border-white/[0.06] flex items-center justify-between gap-4">
                <div>
                  <h5 className="text-xs font-bold text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-cyan-400" /> Digital Bill & UPI QR Payment
                  </h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Allow customers to view itemized running totals and scan the dynamic UPI QR to pay directly.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={enableBillRequest}
                    onChange={(e) => setEnableBillRequest(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                </label>
              </div>

              {/* 4. Age Gate Statutory Badges */}
              <div className="p-3.5 bg-[#0b0d11] rounded-xl border border-white/[0.06] flex items-center justify-between gap-4">
                <div>
                  <h5 className="text-xs font-bold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-purple-400" /> Hookah (18+) & Bar (21+) Compliance Badges
                  </h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Show statutory age verification badges on liquor and shisha category tabs.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={showAgeGateBadges}
                    onChange={(e) => setShowAgeGateBadges(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/[0.08] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500" />
                </label>
              </div>
            </div>
          </div>

          {/* Bottom Save Action Bar */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] font-mono text-slate-400">
              {currentTime} · Realtime sync active
            </span>

            <Button
              variant="brand"
              disabled={isSaving}
              onClick={handleSaveBrandSettings}
              className="px-6 py-2.5 font-bold text-xs flex items-center gap-2 shadow-lg active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white"
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

        {/* Right Column: Authentic Dinely Liquid-Glass Customer Storefront Simulator */}
        {showLivePreview && (
          <div className="lg:col-span-5 sticky top-6 space-y-3">
            {/* Simulator Mode Switcher Bar */}
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
                  <Smartphone className="w-3.5 h-3.5" /> Mobile Storefront
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
                  <QrCode className="w-3.5 h-3.5" /> Table Standee
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopyLink}
                  className="px-2 py-1 rounded-lg text-[10px] font-mono text-slate-400 hover:text-white flex items-center gap-1 bg-white/[0.04]"
                  title="Copy Customer Ordering Link"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
                </button>

                <a
                  href={customerQrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded-lg text-[10px] font-mono text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20"
                  title="Open in new window"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Live</span>
                </a>
              </div>
            </div>

            {/* SIMULATOR 1: AUTHENTIC DINELY LIQUID-GLASS MOBILE CUSTOMER APP */}
            {previewDevice === 'mobile' && (
              <div className="w-full max-w-[370px] mx-auto rounded-[40px] bg-[#07090D] border-[3px] border-white/20 shadow-2xl p-3 relative overflow-hidden text-[#F7F7F5] liquid-glass-viewport">
                {/* Dynamic Ambient Radiant Amber Halo (Exact mirror of CustomerApp.tsx) */}
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full blur-[80px] bg-gradient-to-b from-amber-500/35 via-amber-400/20 to-transparent pointer-events-none opacity-80" />

                {/* iPhone Dynamic Island Notch */}
                <div className="w-24 h-4 bg-black rounded-full mx-auto relative z-20 mb-1" />

                {/* Status Bar */}
                <div className="flex items-center justify-between text-[10px] text-white/60 font-mono px-3 mb-2 relative z-20">
                  <span>12:07</span>
                  <span className="text-[9px]">5G · 100%</span>
                </div>

                {/* Atmospheric Luxury Venue Hero (Exact mirror of CustomerApp.tsx) */}
                <div className="relative h-40 w-full rounded-3xl overflow-hidden z-10 border border-white/10 bg-[#11151B]">
                  <img
                    src={
                      previewTab === 'HOOKAH'
                        ? 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=800&auto=format&fit=crop&q=80'
                        : previewTab === 'BAR'
                        ? 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&auto=format&fit=crop&q=80'
                        : theme.bannerUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&auto=format&fit=crop&q=80'
                    }
                    alt={theme.restaurantName || 'Restaurant'}
                    className="w-full h-full object-cover brightness-[0.70] transition-all duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07090D] via-[#07090D]/50 to-black/30" />

                  {/* Top Floating Table Pill Badge */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full liquid-glass-pill text-[10px] text-white font-mono font-medium shadow-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Table 01</span>
                    </div>

                    <div className="px-2 py-0.5 rounded-full liquid-glass-pill text-[9px] text-white/80 font-mono">
                      Switch Table
                    </div>
                  </div>

                  {/* Restaurant Branding Header Row */}
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end gap-2.5 z-10">
                    <img
                      src={theme.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=120&auto=format&fit=crop&q=80'}
                      alt={theme.restaurantName || 'Logo'}
                      className="w-12 h-12 rounded-xl object-cover border border-white/20 shadow-xl bg-[#080A0D] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h1 className="text-sm font-bold text-white tracking-tight truncate drop-shadow-md">
                        {theme.restaurantName || restaurant?.name || 'THE START'}
                      </h1>
                      <div className="text-[10px] text-white/70 font-medium flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full liquid-glass-pill text-amber-400 font-semibold text-[9px]">
                          <Star className="w-2.5 h-2.5 fill-amber-400" />
                          <span>4.9</span>
                        </span>
                        <span>•</span>
                        <span className="text-white/60 truncate">
                          {theme.tagline || restaurant?.cuisine || 'Gourmet Dining & Shisha Lounge'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Action Sticky Liquid-Glass Dock */}
                <div className="mt-2 liquid-glass-strong p-1 rounded-2xl border border-white/15 grid grid-cols-3 gap-1 relative z-10 shadow-lg text-center">
                  <div
                    className={`h-8 rounded-xl text-[10px] font-semibold flex items-center justify-center gap-1 transition-all ${
                      enableCallStaff
                        ? 'text-white/85 bg-white/[0.04]'
                        : 'text-white/25 line-through'
                    }`}
                  >
                    <PhoneCall className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>Call Staff</span>
                  </div>

                  <div className="h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-semibold flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>Orders</span>
                    <span className="px-1 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[8px] font-bold font-mono">
                      1
                    </span>
                  </div>

                  <div
                    className={`h-8 rounded-xl text-[10px] font-semibold flex items-center justify-center gap-1 transition-all ${
                      enableBillRequest
                        ? 'text-white/85 bg-white/[0.04]'
                        : 'text-white/25 line-through'
                    }`}
                  >
                    <Receipt className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>Bill</span>
                  </div>
                </div>

                {/* Food ⇄ Bar ⇄ Hookah Segmented Switcher */}
                <div className="mt-2.5 p-1 liquid-glass-strong rounded-2xl grid grid-cols-3 gap-1 border border-white/18 text-xs font-medium relative z-10 shadow-md">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('FOOD')}
                    className={`h-8 rounded-xl transition-all flex items-center justify-center gap-1 font-bold text-[11px] ${
                      previewTab === 'FOOD'
                        ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 shadow-md'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    <Utensils className="w-3 h-3 shrink-0" />
                    <span>Food</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewTab('BAR')}
                    className={`h-8 rounded-xl transition-all flex items-center justify-center gap-1 font-bold text-[11px] ${
                      previewTab === 'BAR'
                        ? 'bg-gradient-to-r from-purple-500 via-purple-600 to-indigo-600 text-white shadow-md'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    <Wine className="w-3 h-3 text-purple-200 shrink-0" />
                    <span>Bar</span>
                    {showAgeGateBadges && (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-200 font-mono">
                        21+
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewTab('HOOKAH')}
                    className={`h-8 rounded-xl transition-all flex items-center justify-center gap-1 font-bold text-[11px] ${
                      previewTab === 'HOOKAH'
                        ? 'bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 text-white shadow-md'
                        : 'text-white/70 hover:text-white'
                    }`}
                  >
                    <Flame className="w-3 h-3 text-amber-200 shrink-0" />
                    <span>Hookah</span>
                    {showAgeGateBadges && (
                      <span className="text-[8px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-200 font-mono">
                        18+
                      </span>
                    )}
                  </button>
                </div>

                {/* Search Bar & Dietary Filter */}
                <div className="mt-2.5 space-y-2 relative z-10">
                  <div className="relative liquid-glass rounded-xl border border-white/20 p-2 flex items-center gap-2">
                    <Search className="w-3.5 h-3.5 text-white/50" />
                    <span className="text-[11px] text-white/40">
                      {previewTab === 'BAR'
                        ? 'Search cocktails, whiskey, spirits...'
                        : previewTab === 'HOOKAH'
                        ? 'Search shisha flavours, blends...'
                        : 'Search dishes, appetizers, desserts...'}
                    </span>
                  </div>

                  {previewTab === 'FOOD' && (
                    <div className="flex items-center gap-1 p-0.5 liquid-glass-strong rounded-xl text-[10px]">
                      <span className="flex-1 py-1 px-1.5 rounded-lg bg-white/15 text-white font-bold text-center border border-white/20">
                        All Dishes
                      </span>
                      <span className="flex-1 py-1 px-1.5 rounded-lg text-white/50 text-center">
                        Pure Veg
                      </span>
                      <span className="flex-1 py-1 px-1.5 rounded-lg text-white/50 text-center">
                        Non-Veg
                      </span>
                    </div>
                  )}
                </div>

                {/* Real Menu Items List (Authentic Liquid-Glass Card) */}
                <div className="mt-2.5 space-y-2 max-h-56 overflow-y-auto pr-0.5 relative z-10">
                  {previewDishes.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-2xl liquid-glass-card border border-white/20 shadow-md flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <img
                          src={item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=120&auto=format&fit=crop&q=80'}
                          alt={item.name}
                          className="w-12 h-12 rounded-xl object-cover border border-white/20 shrink-0 bg-[#12151b]"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                item.isVegetarian !== false ? 'bg-emerald-400' : 'bg-rose-400'
                              }`}
                            />
                            <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                          </div>
                          <p className="text-[10px] text-white/50 line-clamp-1 mt-0.5">{item.description}</p>
                          <span className="text-xs font-mono font-bold text-amber-300 block mt-0.5">
                            ₹{item.price}.00
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {allowTableOrdering ? (
                          <button
                            type="button"
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 shadow-sm active:scale-95"
                          >
                            + Add
                          </button>
                        ) : (
                          <span className="text-[8px] font-mono text-white/40 bg-white/[0.05] px-1.5 py-0.5 rounded">
                            View Only
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Floating Bottom Cart Dock (Exact mirror of CustomerApp.tsx) */}
                <div className="mt-2.5 p-2 rounded-xl liquid-glass-strong border border-white/20 text-white flex items-center justify-between text-xs font-bold shadow-lg relative z-10">
                  <span className="text-[11px] text-white/90">1 Item Selected</span>
                  <span className="text-[11px] font-bold text-amber-300">View Order → ₹380</span>
                </div>

                <p className="text-[8px] text-center text-slate-500 pt-1.5 relative z-10 font-mono">
                  Dinely Touchless Mobile Engine · Realtime Storefront
                </p>
              </div>
            )}

            {/* SIMULATOR 2: TABLE STANDEE ACRYLIC CARD */}
            {previewDevice === 'standee' && (
              <div className="w-full max-w-[340px] mx-auto rounded-3xl bg-[#0e1118] border-2 border-white/20 shadow-2xl p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-white p-1 mx-auto shadow-md overflow-hidden">
                  {theme.logo ? (
                    <img src={theme.logo} alt="Logo" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full bg-[#12151b] rounded-xl flex items-center justify-center text-white/50">
                      <Store className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                    {theme.restaurantName || restaurant?.name || 'DINELY RESTAURANT'}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {theme.tagline || 'Touchless Dining & Table Ordering'}
                  </p>
                </div>

                {/* QR Code Container */}
                <div className="w-44 h-44 bg-white p-3 rounded-2xl mx-auto shadow-xl flex items-center justify-center">
                  <QRCodeSVG value={customerQrUrl} size={150} level="M" />
                </div>

                <div className="py-1.5 px-4 rounded-xl text-xs font-bold text-slate-950 mx-auto inline-block shadow-md uppercase tracking-wider font-mono bg-amber-400">
                  SCAN TO ORDER FROM TABLE
                </div>

                <div className="pt-1 text-[10px] font-mono text-slate-400">
                  Table 01 · Scan with Camera or any UPI App
                </div>

                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                    className="text-xs h-8 px-3 border-white/15 bg-white/[0.04] text-slate-300"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Standee Card
                  </Button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-400 text-center px-4">
              Guests scan the table QR code to view this exact customized menu.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
