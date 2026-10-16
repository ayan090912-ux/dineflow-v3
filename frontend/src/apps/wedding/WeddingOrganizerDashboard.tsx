import React, { useState, useEffect, useRef } from 'react';
import {
  Crown,
  Heart,
  Sparkles,
  Calendar,
  Clock,
  MapPin,
  Users,
  Utensils,
  QrCode,
  ShoppingBag,
  BarChart3,
  Settings,
  Plus,
  Trash2,
  ExternalLink,
  Download,
  Printer,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight,
  Eye,
  LogOut,
  Sliders,
  Check,
  X,
  Share2,
  Copy,
  ChevronDown,
  Info,
  Flame,
  ChefHat,
  Layers,
  ArrowRight
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { api } from '../../packages/api/client';
import { firebaseAuth, ensureFirebaseAuthReady, signOutFirebase } from '../../packages/auth/firebase';
import { WeddingWorkspace, WeddingWorkspaceDetail, EventTable } from '../../packages/types';
import { DinelyLogo, ProductSwitcher, Button, Badge, Modal, Card, StatsCard } from '../../packages/ui';

interface WeddingOrganizerDashboardProps {
  onNavigate?: (path: string) => void;
  onNavigateRestaurants?: () => void;
  onNavigateHome?: () => void;
  onLogout?: () => void;
  currentUser?: any;
}

type DashboardTab =
  | 'overview'
  | 'event'
  | 'menu'
  | 'tables'
  | 'qr_studio'
  | 'orders'
  | 'reports'
  | 'settings';

export const parseTabFromUrl = (): DashboardTab => {
  if (typeof window === 'undefined') return 'overview';
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 3 && (parts[1] === 'dashboard' || parts[1] === 'manage')) {
    const sub = parts[2].toLowerCase();
    if (['overview', 'event', 'menu', 'tables', 'qr_studio', 'orders', 'reports', 'settings'].includes(sub)) {
      return sub as DashboardTab;
    }
    if (sub === 'qr' || sub === 'qr-studio' || sub === 'qrstudio') return 'qr_studio';
  }
  const params = new URLSearchParams(window.location.search);
  const tabParam = (params.get('tab') || params.get('section') || '').toLowerCase();
  if (['overview', 'event', 'menu', 'tables', 'qr_studio', 'orders', 'reports', 'settings'].includes(tabParam)) {
    return tabParam as DashboardTab;
  }
  if (tabParam === 'qr' || tabParam === 'qr-studio') return 'qr_studio';
  return 'overview';
};

export const WeddingOrganizerDashboard: React.FC<WeddingOrganizerDashboardProps> = ({
  onNavigate,
  onNavigateRestaurants,
  onNavigateHome,
  onLogout,
  currentUser,
}) => {
  const [workspaces, setWorkspaces] = useState<WeddingWorkspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [detail, setDetail] = useState<WeddingWorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>(() => parseTabFromUrl());
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('');

  // Tab navigation sync with history pushState
  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const targetPath = `/weddings/dashboard/${tab}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState({ tab }, '', targetPath);
      }
    }
    if (onNavigate) {
      onNavigate(`/weddings/dashboard/${tab}`);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const tabFromUrl = parseTabFromUrl();
      setActiveTab(tabFromUrl);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Empty state status tracking
  const [lookupId, setLookupId] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<any | null>(null);

  const handleLookupApplicantStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupId.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const effEmail = (lookupEmail.trim() || currentUserEmail).trim();
      const res = await api.getWeddingRequestStatus(lookupId.trim(), effEmail || undefined);
      setLookupResult(res);
    } catch (err: any) {
      setLookupError(err.message || 'Application not found with that reference ID.');
    } finally {
      setLookupLoading(false);
    }
  };

  // Event form state
  const [eventForm, setEventForm] = useState({
    title: '',
    coupleNames: '',
    eventDate: '',
    startTime: '',
    endTime: '',
    venueName: '',
    welcomeMessage: '',
    themeColor: '#d4af37',
    estimatedGuests: 150,
    status: 'PUBLISHED',
    menuSelectionType: 'FULL',
    allowedCategoryIds: [] as string[],
    allowedItemIds: [] as string[],
  });
  const [savingEvent, setSavingEvent] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Table creation state
  const [addTableModal, setAddTableModal] = useState(false);
  const [newTableNum, setNewTableNum] = useState('');
  const [newTableLabel, setNewTableLabel] = useState('');
  const [newTableCapacity, setNewTableCapacity] = useState(8);
  const [creatingTable, setCreatingTable] = useState(false);

  // Batch table creation state
  const [batchTableModal, setBatchTableModal] = useState(false);
  const [batchCount, setBatchCount] = useState(10);
  const [batchStartNumber, setBatchStartNumber] = useState(1);
  const [batchCapacity, setBatchCapacity] = useState(8);
  const [batchPrefix, setBatchPrefix] = useState('Table');
  const [batchCreating, setBatchCreating] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Live orders state
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');

  // Reports state
  const [reports, setReports] = useState<any | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);

  // QR Studio state
  const [selectedTableForQr, setSelectedTableForQr] = useState<EventTable | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [batchPrintMode, setBatchPrintMode] = useState(false);

  const qrCanvasRef = useRef<HTMLDivElement>(null);

  const init = async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureFirebaseAuthReady();
      const user = firebaseAuth.currentUser;
      const email = user?.email || api.getCurrentUser()?.email || '';
      setCurrentUserEmail(email);

      if (!email && !user) {
        setLoading(false);
        return;
      }

      const res = await api.getMyWeddingWorkspaces(email || undefined);
      const list = res?.workspaces || [];
      setWorkspaces(list);

      if (list.length > 0) {
        const firstId = list[0].id;
        setSelectedWorkspaceId(firstId);
        await loadWorkspaceDetail(firstId);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize wedding organizer session.');
      setLoading(false);
    }
  };

  // Load current user and workspaces
  useEffect(() => {
    init();
  }, []);

  const loadWorkspaceDetail = async (workspaceId: string) => {
    setDetailLoading(true);
    try {
      const data = await api.getWeddingWorkspaceDetail(workspaceId);
      setDetail(data);

      if (data.event) {
        setEventForm({
          title: data.event.title || '',
          coupleNames: data.event.coupleNames || '',
          eventDate: data.event.eventDate || '',
          startTime: data.event.startTime || '18:00',
          endTime: data.event.endTime || '23:30',
          venueName: data.event.venueName || '',
          welcomeMessage: data.event.welcomeMessage || '',
          themeColor: data.event.themeColor || '#d4af37',
          estimatedGuests: (data.event as any).estimatedGuests || (data.event as any).estimatedGuestCount || 150,
          status: data.event.status || 'PUBLISHED',
          menuSelectionType: data.event.menuSelectionType || 'FULL',
          allowedCategoryIds: data.event.allowedCategoryIds || [],
          allowedItemIds: data.event.allowedItemIds || [],
        });
      }

      if (data.tables && data.tables.length > 0) {
        setSelectedTableForQr(data.tables[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load workspace details.');
    } finally {
      setDetailLoading(false);
      setLoading(false);
    }
  };

  const handleSwitchWorkspace = (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    loadWorkspaceDetail(workspaceId);
  };

  const handleSaveEvent = async () => {
    if (!selectedWorkspaceId) return;
    setSavingEvent(true);
    setSaveSuccess(false);
    try {
      const updated = await api.updateWeddingWorkspaceEvent(selectedWorkspaceId, eventForm);
      const evObj = (updated as any)?.event || updated;
      setDetail((prev) => (prev ? { ...prev, event: { ...prev.event, ...evObj } } : prev));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      alert(err.message || 'Failed to update event configuration.');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleToggleOrdering = async (currentStatus: boolean) => {
    if (!selectedWorkspaceId) return;
    try {
      const res = await api.toggleWeddingOrdering(selectedWorkspaceId, !currentStatus);
      const isOpen = (res as any).orderingEnabled ?? (res as any).isOrderingOpen ?? !currentStatus;
      setDetail((prev) => {
        if (!prev || !prev.event) return prev;
        return {
          ...prev,
          event: {
            ...prev.event,
            orderingEnabled: isOpen,
            isOrderingOpen: isOpen,
          },
        };
      });
    } catch (err: any) {
      alert(err.message || 'Could not toggle guest ordering status.');
    }
  };

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspaceId || !newTableNum.trim()) return;
    setCreatingTable(true);
    try {
      const res = await api.createWeddingWorkspaceTable(selectedWorkspaceId, {
        tableNumber: newTableNum.trim(),
        label: newTableLabel.trim() || undefined,
        capacity: newTableCapacity,
      });

      setDetail((prev) => {
        if (!prev) return prev;
        const updated = [...(prev.tables || []), res.table];
        return { ...prev, tables: updated };
      });

      setSelectedTableForQr(res.table);
      setAddTableModal(false);
      setNewTableNum('');
      setNewTableLabel('');
      setNewTableCapacity(8);
    } catch (err: any) {
      alert(err.message || 'Failed to add event table.');
    } finally {
      setCreatingTable(false);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!selectedWorkspaceId) return;
    if (!confirm('Are you sure you want to remove this banquet table and its QR code?')) return;
    try {
      await api.deleteWeddingWorkspaceTable(selectedWorkspaceId, tableId);
      setDetail((prev) => {
        if (!prev) return prev;
        const filtered = (prev.tables || []).filter((t) => t.id !== tableId);
        return { ...prev, tables: filtered };
      });
      if (selectedTableForQr?.id === tableId) {
        setSelectedTableForQr(detail?.tables?.[0] || null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete table.');
    }
  };

  const handleBatchCreateTables = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspaceId) return;
    setBatchCreating(true);
    setBatchError(null);
    try {
      const res = await api.batchCreateWeddingWorkspaceTables(selectedWorkspaceId, {
        count: Number(batchCount),
        startNumber: Number(batchStartNumber),
        capacity: Number(batchCapacity),
        prefix: batchPrefix.trim() || 'Table',
      });
      if (res && res.tables) {
        setDetail((prev) => {
          if (!prev) return prev;
          const existingIds = new Set((prev.tables || []).map((t) => t.id));
          const newTables = res.tables.filter((t: any) => !existingIds.has(t.id));
          return {
            ...prev,
            tables: [...(prev.tables || []), ...newTables],
          };
        });
      }
      setBatchTableModal(false);
    } catch (err: any) {
      setBatchError(err.message || 'Failed to batch generate tables.');
    } finally {
      setBatchCreating(false);
    }
  };

  const getGuestOrderingUrl = (tableNum?: string) => {
    if (!detail?.event?.id) return '/weddings';
    const base = window.location.origin;
    const tableParam = tableNum ? `?table=${encodeURIComponent(tableNum)}` : '';
    return `${base}/event/${detail.event.id}${tableParam}`;
  };

  const loadLiveOrders = async () => {
    if (!selectedWorkspaceId) return;
    setOrdersLoading(true);
    try {
      const res = await api.getWeddingWorkspaceOrders(selectedWorkspaceId);
      setOrders(res.orders || []);
    } catch (err: any) {
      console.error('Failed to load live orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadReports = async () => {
    if (!selectedWorkspaceId) return;
    setReportsLoading(true);
    try {
      const res = await api.getWeddingWorkspaceReports(selectedWorkspaceId);
      setReports(res);
    } catch (err: any) {
      console.error('Failed to load reports:', err);
    } finally {
      setReportsLoading(false);
    }
  };

  // Poll orders when on live orders tab
  useEffect(() => {
    if (activeTab === 'orders') {
      loadLiveOrders();
      const interval = setInterval(loadLiveOrders, 8000);
      return () => clearInterval(interval);
    } else if (activeTab === 'reports') {
      loadReports();
    }
  }, [activeTab, selectedWorkspaceId]);

  const copyGuestLink = (tableNum?: string) => {
    if (!detail?.event?.id) return;
    const link = getGuestOrderingUrl(tableNum);
    navigator.clipboard.writeText(link);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  const downloadQrPng = (tableNumber: string) => {
    const canvas = document.getElementById(`qr-canvas-${tableNumber}`) as HTMLCanvasElement;
    if (!canvas) return;
    const pngUrl = canvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    downloadLink.href = pngUrl;
    downloadLink.download = `Wedding-QR-Table-${tableNumber}.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const triggerPrintStandee = () => {
    window.print();
  };

  // If loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0e12] flex flex-col items-center justify-center text-amber-100 p-6">
        <div className="w-12 h-12 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin mb-4" />
        <h2 className="text-xl font-serif text-amber-200">Opening Wedding Workspace</h2>
        <p className="text-xs text-white/50 mt-1">Authenticating wedding organizer credentials...</p>
      </div>
    );
  }

  // If no approved workspaces found
  if (!detail && workspaces.length === 0) {
    return (
      <div className="min-h-screen bg-[#0d0e12] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-[#14161f] border border-amber-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-left">
          <div className="w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center mx-auto mb-4 text-amber-300">
            <Crown className="w-7 h-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-amber-100 mb-2 text-center">
            Wedding Organizer Studio
          </h1>
          <p className="text-xs text-white/60 mb-5 leading-relaxed text-center">
            {error ||
              'This studio is for approved celebration organizers. If you recently applied, check your review status or refresh below.'}
          </p>

          {/* User Identity Info */}
          <div className="mb-5 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-xs">
            <div className="truncate">
              <span className="text-white/40 block text-[10px] uppercase font-mono">Current Session</span>
              <span className="text-white/80 font-medium truncate">{currentUserEmail || 'Unauthenticated'}</span>
            </div>
            {currentUserEmail ? (
              <button
                type="button"
                onClick={() => {
                  signOutFirebase().then(() => {
                    if (onNavigate) onNavigate('/weddings/login');
                    else window.location.href = '/weddings/login';
                  });
                }}
                className="text-[11px] text-amber-300 hover:text-amber-200 underline shrink-0 ml-2 cursor-pointer"
              >
                Switch Account
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (onNavigate) onNavigate('/weddings/login');
                  else window.location.href = '/weddings/login';
                }}
                className="text-[11px] text-amber-300 hover:text-amber-200 underline shrink-0 ml-2 font-medium cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>

          {/* Inline Application Status Tracker */}
          <div className="mb-6 p-4 rounded-2xl bg-[#0e1017] border border-amber-500/20 space-y-3">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
              <Sparkles className="w-4 h-4" />
              <span>Track Application Approval</span>
            </div>
            <form onSubmit={handleLookupApplicantStatus} className="space-y-2.5">
              <div>
                <label className="block text-[11px] text-white/70 mb-1">
                  Application Reference ID *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. wreq-b4228c74ec"
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#141722] border border-white/[0.1] focus:border-amber-400 text-xs text-white outline-none font-mono"
                />
              </div>

              {!currentUserEmail && (
                <div>
                  <label className="block text-[11px] text-white/70 mb-1">
                    Applicant Email
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. host@example.com"
                    value={lookupEmail}
                    onChange={(e) => setLookupEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#141722] border border-white/[0.1] focus:border-amber-400 text-xs text-white outline-none"
                  />
                </div>
              )}

              {lookupError && (
                <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px]">
                  {lookupError}
                </div>
              )}

              <Button
                type="submit"
                variant="brand"
                size="sm"
                disabled={lookupLoading}
                className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs"
              >
                {lookupLoading ? 'Locating Application...' : 'Check Approval Status'}
              </Button>
            </form>

            {lookupResult && (
              <div className="mt-3 pt-3 border-t border-white/[0.08] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white truncate max-w-[200px]">
                    {lookupResult.weddingName}
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      lookupResult.lifecycleStatus === 'APPROVED'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : lookupResult.lifecycleStatus === 'REJECTED'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {lookupResult.lifecycleStatus}
                  </span>
                </div>

                {lookupResult.cateringRestaurantName && (
                  <p className="text-[11px] text-white/60">
                    <strong className="text-white/80">Assigned Kitchen:</strong> {lookupResult.cateringRestaurantName}
                  </p>
                )}

                {lookupResult.reviewNotes && (
                  <p className="text-[11px] text-white/60">
                    <strong className="text-white/80">Review Notes:</strong> {lookupResult.reviewNotes}
                  </p>
                )}

                {lookupResult.lifecycleStatus === 'APPROVED' && (
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => init()}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs mt-2"
                  >
                    Open Approved Workspace
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <button
              onClick={() => (onNavigate ? onNavigate('/weddings/login') : (window.location.href = '/weddings/login'))}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <Crown className="w-3.5 h-3.5" />
              Sign in with Organizer Account
            </button>
            <button
              onClick={() => init()}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload Workspaces
            </button>
            <button
              onClick={() => (onNavigate ? onNavigate('/weddings') : (window.location.href = '/weddings'))}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] text-white/80 font-medium text-xs transition-all text-center cursor-pointer border border-white/[0.1]"
            >
              Request Wedding Ordering Access
            </button>
            <button
              onClick={() => (onNavigateHome ? onNavigateHome() : onNavigate ? onNavigate('/') : (window.location.href = '/'))}
              className="w-full py-2.5 px-4 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] text-white/70 text-xs font-medium transition-all text-center cursor-pointer"
            >
              Return to Dinely Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentEvent = detail?.event;
  const currentRestaurant = detail?.cateringRestaurant || (detail as any)?.restaurant;
  const tables = detail?.tables || [];
  const menuCategories = detail?.menuCategories || (detail as any)?.availableMenu || [];
  const menuItems = detail?.menuItems || (detail as any)?.rawItems || [];

  // Automated Setup Checklist items calculation (8-Step Real-Time Readiness)
  const checklistItems = [
    {
      id: 'event_details',
      title: 'Event Details & Timing',
      desc: Boolean(currentEvent?.coupleNames && currentEvent?.eventDate && currentEvent?.venueName)
        ? `${currentEvent?.coupleNames} · ${currentEvent?.venueName}`
        : 'Set couple names, celebration date, banquet venue, and welcome note.',
      isComplete: Boolean(currentEvent?.coupleNames && currentEvent?.eventDate && currentEvent?.venueName),
      actionLabel: 'Configure Event',
      onAction: () => handleTabChange('event'),
    },
    {
      id: 'caterer_partner',
      title: 'Catering Kitchen Partner',
      desc: currentRestaurant?.name ? `Connected to ${currentRestaurant.name}.` : 'Assigned catering partner and active kitchen.',
      isComplete: Boolean(currentRestaurant?.id),
      actionLabel: 'View Partner',
      onAction: () => handleTabChange('menu'),
    },
    {
      id: 'menu_curation',
      title: 'Banquet Menu Selection',
      desc: menuItems.length > 0 ? `${menuItems.length} courses across ${menuCategories.length} categories active.` : 'Activate appetizers, mains, and celebration drinks.',
      isComplete: menuItems.length > 0,
      actionLabel: 'Curate Menu',
      onAction: () => handleTabChange('menu'),
    },
    {
      id: 'tables_setup',
      title: 'Banqueting Tables & Seating',
      desc: tables.length > 0 ? `${tables.length} tables provisioned (${tables.reduce((s, t) => s + (t.capacity || 0), 0)} total seats).` : 'Add individual tables or batch provision seating.',
      isComplete: tables.length > 0,
      actionLabel: tables.length > 0 ? 'Manage Tables' : 'Batch Add Tables',
      onAction: () => {
        if (tables.length === 0) {
          setBatchStartNumber(1);
          setBatchTableModal(true);
        } else {
          handleTabChange('tables');
        }
      },
    },
    {
      id: 'qr_standees',
      title: 'Table QR Code Generation',
      desc: tables.length > 0 ? 'Unique high-res QR codes ready for printing & guest scanning.' : 'Provision tables to generate individual table QR codes.',
      isComplete: tables.length > 0,
      actionLabel: 'QR Studio',
      onAction: () => handleTabChange('qr_studio'),
    },
    {
      id: 'kitchen_terminal',
      title: 'Connected Kitchen Terminal',
      desc: 'Live kitchen display system ready to receive instant banquet tickets.',
      isComplete: Boolean(currentRestaurant?.id),
      actionLabel: 'Verify Kitchen',
      onAction: () => handleTabChange('overview'),
    },
    {
      id: 'guest_preview',
      title: 'Guest Mobile Experience',
      desc: 'Preview the mobile dining web application from a guest viewpoint.',
      isComplete: Boolean(currentEvent?.id),
      actionLabel: 'Preview Dining',
      onAction: () => {
        const url = getGuestOrderingUrl();
        window.open(url, '_blank');
      },
    },
    {
      id: 'live_ordering',
      title: 'Live Banquet Ordering Activation',
      desc: (currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen)
        ? 'Ordering is ACTIVE. Guests can scan and place requests.'
        : 'Ordering is currently paused until reception begins.',
      isComplete: Boolean(currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen),
      actionLabel: (currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen) ? 'Pause Ordering' : 'Enable Live Ordering',
      onAction: () => handleToggleOrdering((currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen) ?? true),
    },
  ];

  const completedStepsCount = checklistItems.filter((i) => i.isComplete).length;
  const checklistProgressPercent = Math.round((completedStepsCount / checklistItems.length) * 100);

  return (
    <div className="min-h-screen bg-[#0b0d11] text-slate-100 flex flex-col font-sans">
      {/* Top Banner / Organizer Header */}
      <header className="sticky top-0 z-30 bg-[#0e1117]/95 backdrop-blur-md border-b border-[#1e232e] px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (onNavigateHome) onNavigateHome();
              else if (onNavigate) onNavigate('/');
              else window.location.href = '/';
            }}
            className="flex items-center gap-2 cursor-pointer bg-transparent border-none p-0 text-left"
            title="Dinely Home"
          >
            <DinelyLogo size="sm" />
          </button>

          <div className="hidden lg:block h-5 w-[1px] bg-white/[0.12]" />

          <div className="hidden sm:flex items-center">
            <ProductSwitcher
              activeProduct="weddings"
              theme="dark"
              onSwitch={(prod) => {
                if (prod === 'restaurants') {
                  if (onNavigateRestaurants) onNavigateRestaurants();
                  else if (onNavigate) onNavigate('/restaurant/dashboard');
                  else window.location.href = '/restaurant/dashboard';
                }
              }}
            />
          </div>

          <div className="h-5 w-[1px] bg-white/[0.12] hidden sm:block" />

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-sm shrink-0">
              <Crown className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-wider uppercase text-amber-400/80 font-medium">
                  Weddings OS
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
              <h1 className="text-sm sm:text-base font-serif font-bold text-white tracking-tight truncate max-w-[180px] sm:max-w-xs">
                {currentEvent?.coupleNames || currentEvent?.title || 'Banquet Celebration'}
              </h1>
            </div>
          </div>
        </div>

        {/* Workspace Switcher & Status Controls */}
        <div className="flex items-center gap-2.5">
          {/* Mobile Product Switcher */}
          <div className="sm:hidden">
            <ProductSwitcher
              activeProduct="weddings"
              theme="dark"
              compact
              onSwitch={(prod) => {
                if (prod === 'restaurants') {
                  if (onNavigateRestaurants) onNavigateRestaurants();
                  else if (onNavigate) onNavigate('/restaurant/dashboard');
                  else window.location.href = '/restaurant/dashboard';
                }
              }}
            />
          </div>

          {workspaces.length > 1 && (
            <select
              value={selectedWorkspaceId}
              onChange={(e) => handleSwitchWorkspace(e.target.value)}
              className="bg-[#151822] border border-white/[0.12] text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-amber-400"
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          )}

          {/* Quick Ordering Toggle */}
          <div className="hidden sm:flex items-center gap-2 bg-[#141620] border border-white/[0.08] rounded-xl px-3 py-1.5">
            <span className="text-xs text-white/60">Ordering:</span>
            <button
              onClick={() => handleToggleOrdering((currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen) ?? true)}
              className={`text-xs font-medium px-2 py-0.5 rounded-md transition-colors ${
                (currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen)
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              {(currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen) ? 'ACTIVE (Live)' : 'PAUSED'}
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => copyGuestLink()}
            className="border-amber-500/30 text-amber-300 hover:bg-amber-400/10 text-xs hidden md:flex items-center gap-1.5"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {isCopied ? 'Link Copied' : 'Share Guest URL'}
          </Button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Layout Container */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-60 bg-[#0e1117] border-r border-[#1e232e] p-4 flex md:flex-col justify-between shrink-0">
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible w-full pb-2 md:pb-0">
            {[
              { id: 'overview', label: 'Overview', icon: <Heart className="w-4 h-4" /> },
              { id: 'event', label: 'Event Details', icon: <Calendar className="w-4 h-4" /> },
              { id: 'menu', label: 'Menu & Kitchen', icon: <ChefHat className="w-4 h-4" /> },
              { id: 'tables', label: 'Tables & Seating', icon: <Users className="w-4 h-4" />, badge: tables.length },
              { id: 'qr_studio', label: 'QR Code Studio', icon: <QrCode className="w-4 h-4" /> },
              { id: 'orders', label: 'Live Orders', icon: <ShoppingBag className="w-4 h-4" />, badge: orders.length > 0 ? orders.length : undefined },
              { id: 'reports', label: 'Event Reports', icon: <BarChart3 className="w-4 h-4" /> },
              { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id as DashboardTab)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-gradient-to-r from-amber-500/15 to-transparent text-amber-200 border-l-2 border-amber-400 font-semibold'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={isActive ? 'text-amber-400' : 'text-white/40'}>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </div>
                  {tab.badge !== undefined && (
                    <span className="ml-2 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-white/80">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Kitchen Partner Badge in Sidebar */}
          <div className="hidden md:block p-3 rounded-2xl bg-[#13151f] border border-white/[0.06] mt-6">
            <div className="flex items-center gap-2 text-[11px] text-white/50 mb-1">
              <ChefHat className="w-3.5 h-3.5 text-amber-400" />
              <span>Fulfillment Kitchen</span>
            </div>
            <p className="text-xs font-semibold text-white truncate">
              {currentRestaurant?.name || 'Assigned Caterer'}
            </p>
            <p className="text-[10px] text-white/40 truncate">
              {currentRestaurant?.address || 'Kitchen Terminal Online'}
            </p>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full">
          {/* ============================================================== */}
          {/* TAB 1: OVERVIEW */}
          {/* ============================================================== */}
          {activeTab === 'overview' && (
            <div className="space-y-8 animate-fadeIn">
              {/* Hero Banner */}
              <div className="relative rounded-3xl overflow-hidden p-6 sm:p-8 bg-gradient-to-r from-amber-950/40 via-[#181a24] to-[#12141c] border border-amber-500/30 shadow-2xl">
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-300 text-xs font-medium mb-3">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Approved Wedding Workspace</span>
                    </div>
                    <h2 className="text-2xl sm:text-4xl font-serif font-bold text-white tracking-tight">
                      {currentEvent?.coupleNames || currentEvent?.title}
                    </h2>
                    <p className="text-white/60 text-xs sm:text-sm mt-2 max-w-2xl leading-relaxed">
                      {currentEvent?.welcomeMessage ||
                        'Welcome guests to a seamless digital table dining experience catered exclusively for your special day.'}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-white/50">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-400" />
                        {currentEvent?.eventDate || 'Date pending'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        {currentEvent?.startTime || '18:00'} - {currentEvent?.endTime || '23:30'}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-amber-400" />
                        {currentEvent?.venueName || 'Venue pending'}
                      </span>
                    </div>
                  </div>

                  {/* Ordering Status Card */}
                  <div className="bg-[#0e1017]/80 backdrop-blur-md border border-white/[0.12] rounded-2xl p-4 sm:p-5 flex flex-col justify-between shrink-0 min-w-[240px]">
                    <div>
                      <p className="text-[11px] font-mono text-white/50 uppercase">Banquet Guest Ordering</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            (currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen) ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                          }`}
                        />
                        <span className="text-sm font-semibold text-white">
                          {(currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen) ? 'Open for Guest Orders' : 'Paused / Closed'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggleOrdering((currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen) ?? true)}
                      className={`mt-4 w-full py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                        (currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen)
                          ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30'
                      }`}
                    >
                      {(currentEvent?.orderingEnabled ?? currentEvent?.isOrderingOpen) ? 'Temporarily Pause Ordering' : 'Enable Live Guest Ordering'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-5">
                  <div className="flex items-center justify-between text-white/40 mb-2">
                    <span className="text-xs font-medium">Banqueting Tables</span>
                    <Users className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-2xl font-serif font-bold text-white">{tables.length}</p>
                  <p className="text-[11px] text-white/40 mt-1">With unique table QR codes</p>
                </div>

                <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-5">
                  <div className="flex items-center justify-between text-white/40 mb-2">
                    <span className="text-xs font-medium">Guest Capacity</span>
                    <Heart className="w-4 h-4 text-rose-400" />
                  </div>
                  <p className="text-2xl font-serif font-bold text-white">
                    {tables.reduce((sum, t) => sum + (t.capacity || 0), 0) || currentEvent?.estimatedGuests || 150}
                  </p>
                  <p className="text-[11px] text-white/40 mt-1">
                    Estimated: {currentEvent?.estimatedGuests || 150} guests
                  </p>
                </div>

                <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-5">
                  <div className="flex items-center justify-between text-white/40 mb-2">
                    <span className="text-xs font-medium">Banquet Courses</span>
                    <Utensils className="w-4 h-4 text-emerald-400" />
                  </div>
                  <p className="text-2xl font-serif font-bold text-white">{menuItems.length}</p>
                  <p className="text-[11px] text-white/40 mt-1">
                    Across {menuCategories.length} menu categories
                  </p>
                </div>

                <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-5">
                  <div className="flex items-center justify-between text-white/40 mb-2">
                    <span className="text-xs font-medium">Kitchen Partner</span>
                    <ChefHat className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-sm font-semibold text-white truncate mt-1">
                    {currentRestaurant?.name || 'Verified Kitchen'}
                  </p>
                  <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Live Terminal Connected
                  </p>
                </div>
              </div>

              {/* ========================================================= */}
              {/* AUTOMATED SETUP CHECKLIST (8-STEP REAL-TIME LAUNCH READINESS) */}
              {/* ========================================================= */}
              <div className="bg-[#12141d] border border-amber-500/20 rounded-3xl p-6 sm:p-7 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                      <h3 className="text-base sm:text-lg font-serif font-bold text-white">
                        Automated Celebration Launch Checklist
                      </h3>
                    </div>
                    <p className="text-xs text-white/50 mt-1">
                      Real-time verification of your wedding banquet workflow, menu readiness, table seating, and kitchen links.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-amber-300">
                        {completedStepsCount} of {checklistItems.length} Ready
                      </span>
                      <span className="block text-[10px] text-white/40">
                        {checklistProgressPercent}% Complete
                      </span>
                    </div>
                    <div className="w-16 h-2 rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-500"
                        style={{ width: `${checklistProgressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 8-Step Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-5">
                  {checklistItems.map((step, idx) => (
                    <div
                      key={step.id}
                      className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                        step.isComplete
                          ? 'bg-[#151822]/80 border-emerald-500/20 hover:border-emerald-500/40'
                          : 'bg-[#141620] border-amber-500/20 hover:border-amber-500/40'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            step.isComplete
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono text-xs font-bold'
                          }`}
                        >
                          {step.isComplete ? <Check className="w-4 h-4" /> : idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs sm:text-sm font-semibold text-white">
                              {step.title}
                            </h4>
                            <span
                              className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                step.isComplete
                                  ? 'bg-emerald-500/15 text-emerald-400'
                                  : 'bg-amber-500/15 text-amber-300'
                              }`}
                            >
                              {step.isComplete ? 'Ready' : 'Pending'}
                            </span>
                          </div>
                          <p className="text-[11px] text-white/50 mt-1 leading-snug">
                            {step.desc}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={step.onAction}
                        className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer border ${
                          step.isComplete
                            ? 'bg-white/[0.04] hover:bg-white/[0.08] text-white/70 border-white/[0.08]'
                            : 'bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 border-amber-400/30 font-semibold'
                        }`}
                      >
                        {step.actionLabel}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => handleTabChange('qr_studio')}
                  className="p-5 rounded-2xl bg-[#141620] border border-white/[0.08] hover:border-amber-400/40 text-left transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-400/10 text-amber-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-white group-hover:text-amber-200">
                    Table QR Code Studio
                  </h3>
                  <p className="text-xs text-white/50 mt-1">
                    Preview, customize and print table standees or download individual PNG codes.
                  </p>
                </button>

                <button
                  onClick={() => handleTabChange('orders')}
                  className="p-5 rounded-2xl bg-[#141620] border border-white/[0.08] hover:border-amber-400/40 text-left transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-rose-400/10 text-rose-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-white group-hover:text-amber-200">
                    Live Banquet Orders
                  </h3>
                  <p className="text-xs text-white/50 mt-1">
                    Monitor orders placed by guests at tables in real-time as the kitchen prepares them.
                  </p>
                </button>

                <button
                  onClick={() => handleTabChange('menu')}
                  className="p-5 rounded-2xl bg-[#141620] border border-white/[0.08] hover:border-amber-400/40 text-left transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-400/10 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Utensils className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-white group-hover:text-amber-200">
                    Curate Food & Drink Menu
                  </h3>
                  <p className="text-xs text-white/50 mt-1">
                    Select approved items from the catering restaurant to make available for guest ordering.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: EVENT DETAILS */}
          {/* ============================================================== */}
          {activeTab === 'event' && (
            <div className="max-w-3xl space-y-6 animate-fadeIn">
              <div>
                <h2 className="text-xl font-serif font-bold text-white">Event Configuration</h2>
                <p className="text-xs text-white/50">
                  Update event details, timing, hosts' names and welcome notes visible to your guests.
                </p>
              </div>

              {saveSuccess && (
                <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Event details successfully updated and persisted!</span>
                </div>
              )}

              <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      Celebration Title
                    </label>
                    <input
                      type="text"
                      value={eventForm.title}
                      onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                      className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      placeholder="e.g. Wedding of Sarah & James"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      Couples / Hosts' Names
                    </label>
                    <input
                      type="text"
                      value={eventForm.coupleNames}
                      onChange={(e) => setEventForm({ ...eventForm, coupleNames: e.target.value })}
                      className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      placeholder="e.g. Sarah Jenkins & James Sterling"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">Event Date</label>
                    <input
                      type="date"
                      value={eventForm.eventDate}
                      onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })}
                      className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">Start Time</label>
                    <input
                      type="time"
                      value={eventForm.startTime}
                      onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                      className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">End Time</label>
                    <input
                      type="time"
                      value={eventForm.endTime}
                      onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                      className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      Venue & Location
                    </label>
                    <input
                      type="text"
                      value={eventForm.venueName}
                      onChange={(e) => setEventForm({ ...eventForm, venueName: e.target.value })}
                      className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                      placeholder="e.g. The Rosewood Grand Ballroom"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/70 mb-1.5">
                      Estimated Guest Count
                    </label>
                    <input
                      type="number"
                      value={eventForm.estimatedGuests}
                      onChange={(e) =>
                        setEventForm({ ...eventForm, estimatedGuests: parseInt(e.target.value) || 0 })
                      }
                      className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">
                    Welcome Message to Guests
                  </label>
                  <textarea
                    rows={3}
                    value={eventForm.welcomeMessage}
                    onChange={(e) => setEventForm({ ...eventForm, welcomeMessage: e.target.value })}
                    className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-400"
                    placeholder="A heartfelt message displayed on guests' phones when scanning their table QR code..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/70 mb-2">
                    Event Theme Palette
                  </label>
                  <div className="flex items-center gap-3">
                    {[
                      { name: 'Champagne Gold', hex: '#d4af37' },
                      { name: 'Rose Blush', hex: '#e8a598' },
                      { name: 'Ivory Cream', hex: '#f4ebd0' },
                      { name: 'Royal Navy', hex: '#1e3a8a' },
                      { name: 'Emerald Garden', hex: '#065f46' },
                    ].map((theme) => (
                      <button
                        key={theme.hex}
                        type="button"
                        onClick={() => setEventForm({ ...eventForm, themeColor: theme.hex })}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-all border ${
                          eventForm.themeColor === theme.hex
                            ? 'border-amber-400 bg-white/[0.08] text-white'
                            : 'border-white/[0.08] text-white/60 hover:text-white'
                        }`}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/20"
                          style={{ backgroundColor: theme.hex }}
                        />
                        <span>{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/[0.08] flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveEvent}
                    isLoading={savingEvent}
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: MENU & FOOD PROVIDER */}
          {/* ============================================================== */}
          {activeTab === 'menu' && (
            <div className="space-y-6 animate-fadeIn">
              {/* Partner Restaurant Info Card */}
              <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-300">
                      <ChefHat className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase text-amber-400">
                          Assigned Kitchen Partner
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      </div>
                      <h3 className="text-lg font-serif font-bold text-white">
                        {currentRestaurant?.name || 'Assigned Catering Partner'}
                      </h3>
                      <p className="text-xs text-white/50">{currentRestaurant?.address}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Orders Route Directly to Kitchen
                    </span>
                  </div>
                </div>
              </div>

              {/* Menu Categories and Dishes */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-serif font-bold text-white">Banquet Food & Drinks</h3>
                    <p className="text-xs text-white/50">
                      Dishes fulfilled by {currentRestaurant?.name || 'the kitchen'} for this event.
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  {menuCategories.map((category) => {
                    const catItems = menuItems.filter((i) => i.categoryId === category.id);
                    if (catItems.length === 0) return null;

                    return (
                      <div
                        key={category.id}
                        className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-5"
                      >
                        <h4 className="text-sm font-semibold text-amber-300 mb-3 flex items-center gap-2">
                          <span>{category.name}</span>
                          <span className="text-[11px] text-white/40 font-mono">
                            ({catItems.length} items)
                          </span>
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {catItems.map((item) => (
                            <div
                              key={item.id}
                              className="p-3.5 rounded-xl bg-[#161824] border border-white/[0.06] flex items-center justify-between gap-3"
                            >
                              <div className="truncate">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      item.isVegetarian ? 'bg-emerald-400' : 'bg-rose-400'
                                    }`}
                                  />
                                  <p className="text-xs font-medium text-white truncate">{item.name}</p>
                                </div>
                                <p className="text-[10px] text-white/40 truncate mt-0.5">
                                  {item.description || 'Banquet selection'}
                                </p>
                              </div>
                              <span className="text-xs font-mono text-amber-300 font-semibold shrink-0">
                                ${Number(item.price || 0).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: TABLES & SEATING */}
          {/* ============================================================== */}
          {activeTab === 'tables' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">Event Tables & Seating</h2>
                  <p className="text-xs text-white/50">
                    Each table has a dedicated QR code that routes guest orders directly to that exact table.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setBatchStartNumber(tables.length + 1);
                      setBatchTableModal(true);
                    }}
                    className="border-amber-400/30 text-amber-300 hover:bg-amber-400/10 font-medium"
                    icon={<Layers className="w-4 h-4" />}
                  >
                    Batch Provision
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setAddTableModal(true)}
                    className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold"
                    icon={<Plus className="w-4 h-4" />}
                  >
                    Add Event Table
                  </Button>
                </div>
              </div>

              {/* Table List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tables.map((tbl) => (
                  <div
                    key={tbl.id}
                    className="bg-[#12141d] border border-white/[0.08] hover:border-amber-400/30 rounded-2xl p-5 flex flex-col justify-between transition-all"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-400/10 text-amber-300 border border-amber-400/20">
                          Table {tbl.tableNumber}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-white/50">
                          <Users className="w-3.5 h-3.5" />
                          <span>{tbl.capacity || 8} seats</span>
                        </div>
                      </div>

                      <h4 className="text-sm font-semibold text-white mt-1">
                        {tbl.label || `Table ${tbl.tableNumber}`}
                      </h4>
                      <p className="text-[10px] text-white/40 font-mono mt-1 truncate">
                        ID: {tbl.id}
                      </p>
                    </div>

                    <div className="pt-4 mt-4 border-t border-white/[0.06] flex items-center justify-between">
                      <button
                        onClick={() => {
                          setSelectedTableForQr(tbl);
                          handleTabChange('qr_studio');
                        }}
                        className="text-xs text-amber-300 hover:text-amber-200 font-medium flex items-center gap-1.5"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>View QR Code</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => copyGuestLink(tbl.tableNumber)}
                          className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05]"
                          title="Copy Link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTable(tbl.id)}
                          className="p-1.5 rounded-lg text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10"
                          title="Delete Table"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: QR CODE STUDIO */}
          {/* ============================================================== */}
          {activeTab === 'qr_studio' && (
            <div className="space-y-8 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">Table QR Code Studio</h2>
                  <p className="text-xs text-white/50">
                    Generate, preview, download and print luxury standees for acrylic table displays.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={triggerPrintStandee}
                    className="border-white/[0.12] text-white hover:bg-white/[0.05] text-xs"
                    icon={<Printer className="w-3.5 h-3.5" />}
                  >
                    Print Standee
                  </Button>
                </div>
              </div>

              {/* Table Selector Dropdown */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/60">Select Table:</span>
                <select
                  value={selectedTableForQr?.id || ''}
                  onChange={(e) => {
                    const match = tables.find((t) => t.id === e.target.value);
                    if (match) setSelectedTableForQr(match);
                  }}
                  className="bg-[#151822] border border-white/[0.12] text-xs text-white rounded-xl px-3 py-1.5 focus:outline-none focus:border-amber-400"
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      Table {t.tableNumber} {t.label ? `— ${t.label}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Standee Preview & Actions */}
              {selectedTableForQr && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                  {/* Standee Card Preview */}
                  <div className="flex justify-center">
                    <div
                      id="printable-standee"
                      className="w-full max-w-sm rounded-3xl p-8 bg-gradient-to-b from-[#faf6ef] to-[#f4ede2] text-[#1c1917] border-2 border-[#d4af37]/40 shadow-2xl text-center relative overflow-hidden"
                    >
                      {/* Decorative Gold Header Motif */}
                      <div className="flex items-center justify-center gap-2 text-[#d4af37] mb-4">
                        <Sparkles className="w-4 h-4" />
                        <span className="text-[11px] font-mono tracking-widest uppercase font-semibold">
                          Banquet Guest Dining
                        </span>
                        <Sparkles className="w-4 h-4" />
                      </div>

                      <h3 className="text-2xl font-serif font-bold text-[#1a1815] tracking-tight">
                        {currentEvent?.coupleNames || currentEvent?.title || 'Wedding Banquet'}
                      </h3>
                      <p className="text-xs text-[#57534e] mt-1 font-serif italic">
                        {currentEvent?.venueName || 'Celebration Feast'}
                      </p>

                      {/* Prominent Table Badge */}
                      <div className="my-5 inline-block px-4 py-1.5 rounded-full bg-[#1c1917] text-[#d4af37] text-xs font-mono font-bold tracking-wider shadow-sm">
                        TABLE {selectedTableForQr.tableNumber}
                      </div>

                      {/* QR Code Canvas */}
                      <div className="bg-white p-4 rounded-2xl shadow-inner inline-block border border-black/5 mx-auto my-2">
                        <QRCodeCanvas
                          id={`qr-canvas-${selectedTableForQr.tableNumber}`}
                          value={`${window.location.origin}/event/${currentEvent?.id}?table=${encodeURIComponent(
                            selectedTableForQr.tableNumber
                          )}`}
                          size={180}
                          level="H"
                          marginSize={2}
                          fgColor="#1c1917"
                          bgColor="#ffffff"
                        />
                      </div>

                      <p className="text-[11px] text-[#44403c] mt-4 font-medium">
                        Scan to view the menu & order courses directly to your table
                      </p>

                      <div className="mt-6 pt-4 border-t border-[#d4af37]/20 flex items-center justify-between text-[10px] text-[#78716c] font-mono">
                        <span>Powered by Dinely</span>
                        <span>{currentRestaurant?.name}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Integration Notes */}
                  <div className="space-y-6">
                    <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                      <h4 className="text-base font-serif font-bold text-white">QR Standee Controls</h4>
                      <p className="text-xs text-white/50 leading-relaxed">
                        Each table standee links guests directly to your banquet dining page with this table
                        automatically locked. No login or app download required.
                      </p>

                      <div className="p-3.5 rounded-xl bg-[#181a24] border border-white/[0.08] space-y-2">
                        <p className="text-[11px] font-mono text-white/40 uppercase">Direct Guest URL</p>
                        <p className="text-xs text-amber-300 font-mono break-all">
                          {`${window.location.origin}/event/${currentEvent?.id}?table=${encodeURIComponent(
                            selectedTableForQr.tableNumber
                          )}`}
                        </p>
                      </div>

                      <div className="space-y-2.5 pt-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => downloadQrPng(selectedTableForQr.tableNumber)}
                          className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold"
                          icon={<Download className="w-4 h-4" />}
                        >
                          Download High-Res PNG (Table {selectedTableForQr.tableNumber})
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyGuestLink(selectedTableForQr.tableNumber)}
                          className="w-full border-white/[0.1] text-white hover:bg-white/[0.05]"
                          icon={<Copy className="w-4 h-4" />}
                        >
                          Copy Table URL
                        </Button>
                      </div>
                    </div>

                    <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-6">
                      <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                        <Printer className="w-4 h-4 text-amber-400" />
                        Standee Printing Recommendations
                      </h4>
                      <ul className="text-xs text-white/60 space-y-1.5 list-disc list-inside leading-relaxed">
                        <li>Print on heavy warm-white or ivory cardstock (250gsm+).</li>
                        <li>Recommended format: 4×6 inch or 5×7 inch vertical acrylic table holders.</li>
                        <li>Ensure lighting over banquet tables provides enough contrast for camera scans.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 6: LIVE ORDERS */}
          {/* ============================================================== */}
          {activeTab === 'orders' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-serif font-bold text-white">Live Banquet Orders</h2>
                  <p className="text-xs text-white/50">
                    Real-time guest orders flowing directly into {currentRestaurant?.name || 'the kitchen'}.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadLiveOrders}
                    isLoading={ordersLoading}
                    className="border-white/[0.1] text-white hover:bg-white/[0.05] text-xs"
                    icon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Refresh Orders
                  </Button>
                </div>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex items-center gap-2 border-b border-white/[0.08] pb-3 overflow-x-auto">
                {['ALL', 'PENDING', 'PREPARING', 'READY', 'COMPLETED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setOrderStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      orderStatusFilter === st
                        ? 'bg-amber-400 text-slate-950 font-semibold'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Orders Feed */}
              {orders.length === 0 ? (
                <div className="p-12 text-center bg-[#12141d] border border-white/[0.08] rounded-2xl">
                  <ShoppingBag className="w-10 h-10 text-white/20 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-white">No Banquet Orders Yet</p>
                  <p className="text-xs text-white/40 mt-1">
                    When guests scan their table QR codes and place orders, tickets will appear here in real-time.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders
                    .filter((o) => orderStatusFilter === 'ALL' || o.status === orderStatusFilter)
                    .map((order) => (
                      <div
                        key={order.id}
                        className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-4">
                          <div className="px-3 py-2 rounded-xl bg-amber-400/10 border border-amber-400/20 text-center shrink-0">
                            <span className="block text-[10px] font-mono text-white/50 uppercase">TABLE</span>
                            <span className="text-base font-bold text-amber-300 font-mono">
                              {order.tableNumber || '01'}
                            </span>
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-white">
                                {order.customerName || 'Banquet Guest'}
                              </h4>
                              <span className="text-xs text-white/40 font-mono">
                                • Order #{order.orderNumber || order.id.slice(-6)}
                              </span>
                            </div>

                            <p className="text-xs text-white/70 mt-1">
                              {Array.isArray(order.itemsJson)
                                ? order.itemsJson.map((i: any) => `${i.quantity}x ${i.name}`).join(', ')
                                : 'Banquet course selection'}
                            </p>

                            {order.notes && (
                              <p className="text-[11px] text-amber-200/80 italic mt-1 font-serif">
                                Note: {order.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 sm:self-center">
                          <div className="text-right">
                            <p className="text-sm font-mono font-bold text-white">
                              ${Number(order.totalAmount || 0).toFixed(2)}
                            </p>
                            <p className="text-[10px] text-white/40 font-mono">
                              {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>

                          <Badge
                            variant={
                              order.status === 'COMPLETED'
                                ? 'success'
                                : order.status === 'READY'
                                ? 'info'
                                : order.status === 'PREPARING'
                                ? 'warning'
                                : 'default'
                            }
                          >
                            {order.kitchenStatus || order.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 7: REPORTS */}
          {/* ============================================================== */}
          {activeTab === 'reports' && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h2 className="text-xl font-serif font-bold text-white">Banquet Reports & Analytics</h2>
                <p className="text-xs text-white/50">
                  Real aggregate statistics on courses served, guest demand, and table fulfillment.
                </p>
              </div>

              {reportsLoading ? (
                <div className="p-12 text-center text-white/40">Loading reports...</div>
              ) : reports ? (
                <div className="space-y-6">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-5">
                      <p className="text-xs text-white/50">Total Orders Placed</p>
                      <p className="text-2xl font-serif font-bold text-white mt-1">
                        {reports.totalOrders || 0}
                      </p>
                    </div>
                    <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-5">
                      <p className="text-xs text-white/50">Total Bill Value</p>
                      <p className="text-2xl font-serif font-bold text-amber-300 mt-1 font-mono">
                        ${Number(reports.totalAmount || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-5">
                      <p className="text-xs text-white/50">Active Tables</p>
                      <p className="text-2xl font-serif font-bold text-white mt-1">
                        {Object.keys(reports.tableActivity || {}).length}
                      </p>
                    </div>
                    <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-5">
                      <p className="text-xs text-white/50">Expected Guests</p>
                      <p className="text-2xl font-serif font-bold text-white mt-1">
                        {reports.guestsEstimate || currentEvent?.estimatedGuests || 150}
                      </p>
                    </div>
                  </div>

                  {/* Popular Dishes */}
                  <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-6">
                    <h3 className="text-base font-serif font-bold text-white mb-4">
                      Most Popular Dishes & Drinks
                    </h3>
                    {Array.isArray(reports.popularDishes) && reports.popularDishes.length > 0 ? (
                      <div className="space-y-3">
                        {reports.popularDishes.map((dish: any, idx: number) => (
                          <div
                            key={dish.name || idx}
                            className="flex items-center justify-between p-3 rounded-xl bg-[#161824] border border-white/[0.04]"
                          >
                            <span className="text-xs font-medium text-white flex items-center gap-2">
                              <span className="text-amber-400 font-mono">#{idx + 1}</span>
                              {dish.name}
                            </span>
                            <span className="text-xs font-mono text-amber-300 font-semibold">
                              {dish.count} ordered
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-white/40">No dish order data yet.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 8: SETTINGS & ACCESS */}
          {/* ============================================================== */}
          {activeTab === 'settings' && (
            <div className="max-w-3xl space-y-6 animate-fadeIn">
              <div>
                <h2 className="text-xl font-serif font-bold text-white">Workspace Settings</h2>
                <p className="text-xs text-white/50">
                  Review organizer ownership, linked request credentials and fulfillment partner configuration.
                </p>
              </div>

              <div className="bg-[#12141d] border border-white/[0.08] rounded-2xl p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-mono uppercase text-white/40">Workspace ID</p>
                    <p className="text-xs font-mono text-white font-semibold mt-1">
                      {detail?.workspace?.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase text-white/40">Organizer Account</p>
                    <p className="text-xs font-mono text-white font-semibold mt-1">
                      {detail?.workspace?.ownerEmail || currentUserEmail}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-mono uppercase text-white/40">
                      Approved Catering Partner
                    </p>
                    <p className="text-xs text-white font-semibold mt-1">
                      {currentRestaurant?.name} ({currentRestaurant?.id})
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase text-white/40">Workspace Status</p>
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      ACTIVE & PROVISIONED
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Table Modal */}
      <Modal
        isOpen={addTableModal}
        onClose={() => setAddTableModal(false)}
        title="Add Banquet Table"
      >
        <form onSubmit={handleCreateTable} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">
              Table Number <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={newTableNum}
              onChange={(e) => setNewTableNum(e.target.value)}
              placeholder="e.g. 05 or VIP-1"
              className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">
              Table Label / Section
            </label>
            <input
              type="text"
              value={newTableLabel}
              onChange={(e) => setNewTableLabel(e.target.value)}
              placeholder="e.g. Groom's Family, Friends of Bride"
              className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/70 mb-1">
              Guest Capacity (Seats)
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={newTableCapacity}
              onChange={(e) => setNewTableCapacity(parseInt(e.target.value) || 8)}
              className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="pt-4 flex justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddTableModal(false)}
              className="border-white/[0.1] text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={creatingTable}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold"
            >
              Create Table & QR
            </Button>
          </div>
        </form>
      </Modal>

      {/* Batch Table Provisioning Modal */}
      <Modal
        isOpen={batchTableModal}
        onClose={() => setBatchTableModal(false)}
        title="Batch Provision Event Tables"
      >
        <form onSubmit={handleBatchCreateTables} className="space-y-4">
          <p className="text-xs text-white/60">
            Rapidly provision multiple banquet tables and automatically generate unique QR codes for every seat grouping.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Number of Tables <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                max={100}
                value={batchCount}
                onChange={(e) => setBatchCount(parseInt(e.target.value) || 1)}
                className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Starting Number <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                value={batchStartNumber}
                onChange={(e) => setBatchStartNumber(parseInt(e.target.value) || 1)}
                className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Seats per Table
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={batchCapacity}
                onChange={(e) => setBatchCapacity(parseInt(e.target.value) || 8)}
                className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1">
                Table Prefix / Label
              </label>
              <input
                type="text"
                value={batchPrefix}
                onChange={(e) => setBatchPrefix(e.target.value)}
                placeholder="e.g. Table, VIP, Banquet"
                className="w-full bg-[#181a24] border border-white/[0.1] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-400/[0.06] border border-amber-400/20 text-xs text-amber-200/90 flex items-center justify-between">
            <span>
              Preview: <strong>{batchPrefix} {batchStartNumber}</strong> through <strong>{batchPrefix} {Number(batchStartNumber) + Number(batchCount) - 1}</strong>
            </span>
            <span className="font-mono text-[11px] text-amber-300">
              {Number(batchCount) * Number(batchCapacity)} seats
            </span>
          </div>

          {batchError && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {batchError}
            </div>
          )}

          <div className="pt-4 flex justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBatchTableModal(false)}
              className="border-white/[0.1] text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={batchCreating}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold"
            >
              Generate {batchCount} Tables & QRs
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
