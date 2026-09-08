import React, { useState, useEffect } from 'react';
import {
  Building2,
  Utensils,
  CreditCard,
  ShieldAlert,
  BarChart3,
  Sliders,
  CheckCircle,
  XCircle,
  Search,
  Plus,
  RefreshCw,
  ExternalLink,
  Bell,
  Sparkles,
  Command as CommandIcon,
  Zap,
  Eye,
  Check,
  X,
  AlertTriangle,
  RotateCcw,
  Ban,
  Trash2,
  Send,
  LifeBuoy,
  Phone,
  Mail,
  Calendar,
  Layers,
  QrCode,
  Users,
  Menu as MenuIcon,
  Globe,
  Lock,
  LogOut,
  Archive,
} from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Input,
  Table,
  Modal,
  Tabs,
  StatsCard,
  Avatar,
  SearchInput,
  CommandPalette,
  EmptyState,
  DinelyLogo,
} from '../../packages/ui';
import { api, realtimeBus } from '../../packages/api/client';
import { Organization, Restaurant, AuditLog } from '../../packages/types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';


interface PlatformAppProps {
  onLogout?: () => void;
}

export const PlatformApp: React.FC<PlatformAppProps> = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pending' | 'restaurants' | 'orgs' | 'tickets' | 'audit'>('dashboard');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'PENDING' | 'INACTIVE' | 'SUSPENDED' | 'DELETED'>('ALL');
  
  const [stats, setStats] = useState<any>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [allRestaurants, setAllRestaurants] = useState<Restaurant[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [viewDetailModal, setViewDetailModal] = useState(false);
  const [actionModal, setActionModal] = useState<'APPROVE' | 'REJECT' | 'REQUEST_CHANGES' | 'DISMISS' | 'ACTIVATE' | 'DEACTIVATE' | 'SUSPEND' | 'DELETE' | 'REMINDER' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [reminderType, setReminderType] = useState('PAYMENT');
  const [reminderMessage, setReminderMessage] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isActionInProgress, setIsActionInProgress] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [incomingAlert, setIncomingAlert] = useState<{ id: string; name: string; ownerEmail?: string } | null>(null);

  const playNotificationChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const audioCtx = new AudioContextClass();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      }
    } catch {}
  };

  useEffect(() => {
    // Connect Platform Admin to Global WebSocket events
    realtimeBus.connect('global', 'ADMIN');
    loadData();

    const unsub = realtimeBus.subscribe((event: any) => {
      if (event.type === 'RESTAURANT_APPROVED') {
        const approvedId = event.restaurantId || event.restaurant_id;
        if (approvedId) {
          setAllRestaurants((prev) =>
            prev.map((r) =>
              r.id === approvedId ? { ...r, isApproved: true, lifecycleStatus: 'LIVE', status: 'OPEN' } : r
            )
          );
        }
      } else if (
        event.type === 'RestaurantRegistrationSubmitted' ||
        event.type === 'RestaurantSubmitted' ||
        event.type === 'APPLICATION_CREATED'
      ) {
        playNotificationChime();
        setIncomingAlert({
          id: event.restaurantId || event.restaurant_id,
          name: event.restaurantName || 'New Restaurant',
          ownerEmail: event.ownerEmail,
        });
        loadData();
      } else if (event.type === 'RestaurantStatusUpdated' || event.type === 'RESTAURANT_REJECTED' || event.type === 'RESTAURANT_DISMISSED') {
        loadData();
      }
    });

    // High-reliability live sync polling
    const pollInterval = setInterval(() => {
      loadData();
    }, 8000);

    return () => {
      unsub();
      clearInterval(pollInterval);
    };
  }, []);

  const loadData = async () => {
    try {
      const [s, orgs, allRests, logs, orders] = await Promise.all([
        api.getPlatformStats().catch(() => null),
        api.getOrganizations().catch(() => []),
        api.getPlatformRestaurants().catch(() => []),
        api.getAuditLogs().catch(() => []),
        api.getOrders().catch(() => []),
      ]);
      if (s) setStats(s);
      if (orgs) setOrganizations(orgs);
      if (allRests) setAllRestaurants(allRests);
      if (logs) setAuditLogs(logs);
      if (orders) setAllOrders(orders);
    } catch (e) {
      console.warn('PlatformApp loadData warning:', e);
    }
  };

  const platformChartData = React.useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthIdx = new Date().getMonth();
    const result = [];
    for (let i = 5; i >= 0; i--) {
      const targetMonthIdx = (currentMonthIdx - i + 12) % 12;
      const mName = months[targetMonthIdx];
      const count = allOrders.filter((o) => {
        const d = new Date(o.createdAt);
        return d.getMonth() === targetMonthIdx;
      }).length;
      result.push({ month: mName, orders: count });
    }
    return result;
  }, [allOrders]);

  const handleApprove = async (id: string) => {
    if (isApproving) return;
    setIsApproving(true);
    setApprovalError(null);
    try {
      await api.approveRestaurant(id);
      // Instant update: set approved & LIVE in state
      setAllRestaurants((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, isApproved: true, lifecycleStatus: 'LIVE', status: 'OPEN' } : r
        )
      );
      showSuccess('Restaurant Approved & Activated Live.');
      closeModals();
    } catch (err: any) {
      setApprovalError(err.message || 'Failed to approve restaurant. Please retry.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async (id: string) => {
    if (isActionInProgress) return;
    if (!actionReason || !actionReason.trim()) {
      alert('A rejection reason is required before declining a restaurant application.');
      return;
    }
    const reason = actionReason.trim();
    setIsActionInProgress(id);
    const prevRestaurants = [...allRestaurants];
    setAllRestaurants((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, isApproved: false, lifecycleStatus: 'REJECTED', rejectionReason: reason, status: 'CLOSED' } : r
      )
    );
    try {
      await api.rejectRestaurant(id, reason);
      showSuccess('Application Declined. Owner notified.');
      closeModals();
    } catch (err: any) {
      setAllRestaurants(prevRestaurants);
      alert(`Rejection error: ${err.message || 'Failed to reject'}`);
    } finally {
      setIsActionInProgress(null);
    }
  };

  const handleRequestChanges = async (id: string) => {
    const reason = actionReason || 'Please verify GST number and add menu items.';
    setAllRestaurants((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, requestedChanges: reason } : r
      )
    );
    try {
      await api.requestChangesRestaurant(id, reason);
      showSuccess('Changes Requested. Owner notified.');
      closeModals();
    } catch (err: any) {
      alert(`Request error: ${err.message || 'Failed to request changes'}`);
    }
  };

  const handleDismiss = async (id: string) => {
    if (isActionInProgress) return;
    setIsActionInProgress(id);
    const reason = actionReason.trim() || 'Archived test or duplicate application from approval queue';
    const prevRestaurants = [...allRestaurants];
    setAllRestaurants((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, isApproved: false, lifecycleStatus: 'ARCHIVED', status: 'CLOSED' } : r
      )
    );
    try {
      await api.dismissRestaurant(id, reason);
      showSuccess('Application archived and safely removed from queue.');
      closeModals();
    } catch (err: any) {
      setAllRestaurants(prevRestaurants);
      alert(`Dismiss error: ${err.message || 'Failed to dismiss application'}`);
    } finally {
      setIsActionInProgress(null);
    }
  };

  const handleActivate = async (id: string) => {
    setAllRestaurants((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: 'OPEN', lifecycleStatus: 'LIVE', isApproved: true } : r
      )
    );
    try {
      await api.activateRestaurant(id);
      showSuccess('Restaurant Activated successfully.');
      closeModals();
    } catch (err: any) {
      alert(`Activation error: ${err.message}`);
    }
  };

  const handleDeactivate = async (id: string) => {
    setAllRestaurants((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: 'CLOSED' } : r
      )
    );
    try {
      await api.deactivateRestaurant(id, actionReason || 'Deactivated by Platform Admin.');
      showSuccess('Restaurant set to Inactive/Deactivated.');
      closeModals();
    } catch (err: any) {
      alert(`Deactivation error: ${err.message}`);
    }
  };

  const handleSuspend = async (id: string) => {
    setAllRestaurants((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, lifecycleStatus: 'SUSPENDED' } : r
      )
    );
    try {
      await api.suspendRestaurant(id, actionReason || 'Administrative Suspension');
      showSuccess('Account Suspended. Owner login disabled.');
      closeModals();
    } catch (err: any) {
      alert(`Suspension error: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    setAllRestaurants((prev) => prev.filter((r) => r.id !== id));
    try {
      await api.deleteRestaurant(id);
      showSuccess('Restaurant soft-deleted. Record retained in DB.');
      closeModals();
    } catch (err: any) {
      alert(`Delete error: ${err.message}`);
    }
  };

  const handleSendReminder = async (id: string) => {
    try {
      await api.sendReminder(id, reminderType, reminderMessage);
      showSuccess('Reminder Notification dispatched to Owner!');
      closeModals();
    } catch (err: any) {
      alert(`Reminder error: ${err.message}`);
    }
  };

  const handlePurgeDemoData = async () => {
    if (!window.confirm('Are you sure you want to clean all synthetic demo records? This will ensure only authentic registered restaurants are displayed.')) {
      return;
    }
    setIsPurging(true);
    try {
      const res = await api.purgePlatformDemoData();
      showSuccess(`Fresh Reset Complete: Cleaned ${res.purged_count || 0} synthetic demo records! 🧹`);
      await loadData();
    } catch (e: any) {
      alert(`Purge error: ${e.message || 'Failed to purge demo records'}`);
    } finally {
      setIsPurging(false);
    }
  };

  const showSuccess = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(''), 4000);
  };

  const closeModals = () => {
    setSelectedRestaurant(null);
    setViewDetailModal(false);
    setActionModal(null);
    setActionReason('');
    setReminderMessage('');
    setApprovalError(null);
    setIsApproving(false);
    setIsActionInProgress(null);
  };

  const pendingRestaurants = allRestaurants.filter(
    (r) => !r.isDeleted && (r.lifecycleStatus === 'PENDING_APPROVAL' || (!r.isApproved && r.lifecycleStatus !== 'REJECTED' && r.lifecycleStatus !== 'ARCHIVED' && r.lifecycleStatus !== 'SUSPENDED'))
  );

  const filteredRestaurants = allRestaurants.filter((r) => {
    if (r.isDeleted) return false;
    if (statusFilter === 'LIVE' && !r.isApproved) return false;
    if (statusFilter === 'PENDING' && (r.isApproved || r.lifecycleStatus !== 'PENDING_APPROVAL')) return false;
    if (statusFilter === 'INACTIVE' && (r.status !== 'CLOSED' || r.lifecycleStatus === 'LIVE')) return false;
    if (statusFilter === 'SUSPENDED' && r.lifecycleStatus !== 'SUSPENDED') return false;
    if (statusFilter === 'DELETED' && !r.isDeleted) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.ownerEmail && r.ownerEmail.toLowerCase().includes(q)) ||
      (r.ownerName && r.ownerName.toLowerCase().includes(q)) ||
      (r.cuisine && r.cuisine.toLowerCase().includes(q))
    );
  });
  return (
    <div className="min-h-screen bg-[#0b0d11] text-[#f0f2f5] flex flex-col sm:flex-row font-sans">
      {/* Platform Admin Sidebar */}
      <aside className="w-full sm:w-64 bg-[#0e1117] border-r border-white/[0.08] p-5 flex flex-col justify-between shrink-0">
        <div>
          {/* Admin Branding */}
          <div className="mb-8 px-2 space-y-1">
            <DinelyLogo size="md" />
            <p className="text-[11px] text-white/40 font-mono">admin.dinely.com</p>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {[
              { id: 'dashboard', label: 'Platform Metrics', icon: <BarChart3 className="w-4 h-4" /> },
              {
                id: 'pending',
                label: 'Pending Approvals',
                icon: <ClockIcon className="w-4 h-4 text-amber-400" />,
                badge: pendingRestaurants.length > 0 ? pendingRestaurants.length : undefined,
              },
              { id: 'restaurants', label: 'All Restaurants', icon: <Utensils className="w-4 h-4" /> },
              { id: 'orgs', label: 'Tenant Organizations', icon: <Building2 className="w-4 h-4" /> },
              { id: 'tickets', label: 'Support Tickets', icon: <LifeBuoy className="w-4 h-4" /> },
              { id: 'audit', label: 'Security Audit Logs', icon: <ShieldAlert className="w-4 h-4" /> },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                  activeTab === item.id
                    ? 'bg-white/[0.08] text-white border border-white/[0.12] shadow-xs'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {item.icon}
                  {item.label}
                </div>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* User Profile & Logout */}
        <div className="pt-4 border-t border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Avatar name="Platform Admin" size="sm" status="online" />
              <div>
                <p className="text-xs font-semibold text-white">Chief Admin</p>
                <p className="text-[10px] text-white/40 font-mono">admin@dinely.com</p>
              </div>
            </div>
          </div>
          {onLogout && (
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              className="w-full text-xs border-white/[0.08] text-white/60 hover:text-rose-400 hover:bg-rose-500/10"
              icon={<LogOut className="w-3.5 h-3.5" />}
            >
              Sign Out
            </Button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 sm:p-8 overflow-y-auto max-w-7xl mx-auto w-full bg-[#0b0d11]">
        {/* Realtime Incoming Application Alert */}
        {incomingAlert && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/20 text-amber-400">
                <Bell className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-white flex items-center gap-2">
                  Realtime Application Received: <span className="text-amber-400 font-mono">{incomingAlert.name}</span>
                </h4>
                <p className="text-xs text-white/60">
                  {incomingAlert.ownerEmail ? `Owner: ${incomingAlert.ownerEmail}` : 'A new restaurant owner'} submitted an application for launch approval.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <Button
                variant="brand"
                size="sm"
                onClick={() => {
                  setActiveTab('pending');
                  setIncomingAlert(null);
                }}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs shadow-md"
              >
                Review Application
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIncomingAlert(null)}
                className="text-xs border-white/[0.08] text-white/60 hover:text-white"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Notification Alert Banner */}
        {actionSuccessMsg && (
          <div className="mb-6 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2 shadow-lg">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
        )}

        {pendingRestaurants.length > 0 && !incomingAlert && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-between shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-semibold text-xs text-white flex items-center gap-2">
                  New Application Pending Review ({pendingRestaurants.length})
                </h4>
                <p className="text-xs text-amber-300/80">
                  {pendingRestaurants[0].name} ({pendingRestaurants[0].ownerName}) requested launch verification.
                </p>
              </div>
            </div>
            <Button
              variant="brand"
              size="sm"
              onClick={() => setActiveTab('pending')}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs shrink-0"
            >
              Review Queue ({pendingRestaurants.length})
            </Button>
          </div>
        )}

        {/* Top Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <p className="text-[10px] font-mono text-white/50 uppercase tracking-wider">Platform Control Plane</p>
            </div>
            <h2 className="text-xl font-semibold text-white tracking-tight mt-1">
              {activeTab === 'dashboard' && 'Platform Metrics & Overview'}
              {activeTab === 'pending' && 'Pending Approvals Queue'}
              {activeTab === 'restaurants' && 'Restaurant Outlet Directory'}
              {activeTab === 'orgs' && 'Tenant Organizations'}
              {activeTab === 'tickets' && 'Support Tickets & Inquiries'}
              {activeTab === 'audit' && 'Security Audit Logs'}
            </h2>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurgeDemoData}
              disabled={isPurging}
              isLoading={isPurging}
              className="border-white/[0.08] text-white/60 hover:text-amber-400 hover:bg-white/[0.04] text-xs"
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Purge Demo Records
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04] text-xs"
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh Data
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await api.logout();
                if (onLogout) onLogout();
                else window.location.href = '/admin/login';
              }}
              className="border-white/[0.08] text-white/60 hover:text-rose-400 hover:bg-rose-500/10 text-xs"
              icon={<LogOut className="w-3.5 h-3.5" />}
            >
              Sign Out
            </Button>
          </div>
        </header>

        {/* TAB 1: METRICS DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Live Restaurants"
                value={allRestaurants.filter((r) => !r.isDeleted && (r.lifecycleStatus === 'LIVE' || r.isApproved)).length}
                change={{ value: 'Online', isPositive: true }}
                subtitle="operating cloud POS"
                icon={<BarChart3 className="w-5 h-5 text-amber-400" />}
              />
              <StatsCard
                title="Pending Approvals"
                value={pendingRestaurants.length}
                change={{ value: 'Action Needed', isPositive: false }}
                subtitle="awaiting verification"
                icon={<ClockIcon className="w-5 h-5 text-amber-500" />}
              />
              <StatsCard
                title="Tenant Organizations"
                value={organizations.length}
                change={{ value: 'Verified', isPositive: true }}
                subtitle="enterprise groups"
                icon={<Building2 className="w-5 h-5 text-emerald-400" />}
              />
              <StatsCard
                title="Global Orders Processed"
                value={(stats?.totalOrdersProcessed ?? 0).toLocaleString()}
                change={{ value: 'Live System', isPositive: true }}
                subtitle="Database Total"
                icon={<Zap className="w-5 h-5 text-sky-400" />}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 bg-[#0e1117] border-white/[0.08] p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base font-semibold text-white">Platform Order Volume Growth</h3>
                    <p className="text-xs text-white/50 mt-0.5">Aggregated monthly orders processed across all live outlets</p>
                  </div>
                  <Badge variant="brand">Real-time Activity</Badge>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={platformChartData}>
                      <defs>
                        <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={12} tickLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0e1117', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                      <Area type="monotone" dataKey="orders" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorOrders)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Pending Approvals Widget */}
              <Card className="bg-[#0e1117] border-white/[0.08] p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-white">Approval Queue</h3>
                    <Badge variant="warning">{pendingRestaurants.length} Pending</Badge>
                  </div>
                  <div className="space-y-2.5">
                    {pendingRestaurants.map((rest) => (
                      <div
                        key={rest.id}
                        className="p-3 rounded-xl bg-[#12151b] border border-white/[0.08] flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={rest.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80'}
                            alt={rest.name}
                            className="w-9 h-9 rounded-lg object-cover border border-white/[0.08]"
                          />
                          <div>
                            <p className="text-xs font-semibold text-white">{rest.name}</p>
                            <p className="text-[10px] text-white/40">{rest.ownerName || 'Owner'} • {rest.cuisine}</p>
                          </div>
                        </div>
                        <Button
                          variant="brand"
                          size="sm"
                          onClick={() => {
                            setSelectedRestaurant(rest);
                            setViewDetailModal(true);
                          }}
                          className="text-[11px] px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold"
                        >
                          Review
                        </Button>
                      </div>
                    ))}
                    {pendingRestaurants.length === 0 && (
                      <div className="text-center py-12 text-white/40 text-xs">
                        <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-60" />
                        <p>All restaurant applications reviewed.</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 2: PENDING RESTAURANTS */}
        {activeTab === 'pending' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Pending Approval Queue</h3>
                <p className="text-xs text-white/50">Review business licenses, menu configurations, and launch applications</p>
              </div>
              <Badge variant="warning">{pendingRestaurants.length} Awaiting Verification</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingRestaurants.map((rest) => (
                <Card key={rest.id} className="bg-[#0e1117] border-white/[0.08] p-5 space-y-4 shadow-lg rounded-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={rest.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80'}
                        alt={rest.name}
                        className="w-12 h-12 rounded-xl object-cover border border-white/[0.08] shadow-xs"
                      />
                      <div>
                        <h4 className="font-semibold text-white text-sm">{rest.name}</h4>
                        <p className="text-xs text-amber-400 font-mono">{rest.cuisine} · {rest.restaurantType || 'Casual Dining'}</p>
                      </div>
                    </div>
                    <Badge variant="warning">Pending Approval</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-[#12151b] p-3 rounded-xl border border-white/[0.08] text-white/70 font-sans">
                    <div>
                      <p className="text-[10px] text-white/40 font-mono uppercase font-semibold">OWNER NAME</p>
                      <p className="font-medium text-white">{rest.ownerName || 'Restaurant Owner'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40 font-mono uppercase font-semibold">OWNER EMAIL</p>
                      <p className="text-white/80 truncate font-mono text-[11px]">{rest.ownerEmail || rest.email}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40 font-mono uppercase font-semibold">PHONE</p>
                      <p className="text-white/80 font-mono text-[11px]">{rest.phone}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/40 font-mono uppercase font-semibold">SUBMITTED DATE</p>
                      <p className="text-white/80 font-mono text-[11px]">{rest.submittedAt || 'Today'}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/[0.08]">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs border-white/[0.08] text-white/70 hover:bg-white/[0.04]"
                      icon={<Eye className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setSelectedRestaurant(rest);
                        setViewDetailModal(true);
                      }}
                    >
                      View
                    </Button>
                    <Button
                      variant="brand"
                      size="sm"
                      className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-500 font-semibold text-white"
                      icon={<Check className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setSelectedRestaurant(rest);
                        setActionModal('APPROVE');
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                      onClick={() => {
                        setSelectedRestaurant(rest);
                        setActionModal('REQUEST_CHANGES');
                      }}
                    >
                      Changes
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setSelectedRestaurant(rest);
                        setActionModal('REJECT');
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-white/[0.08] text-white/40 hover:bg-white/[0.04] hover:text-white"
                      title="Archive/Dismiss test or duplicate record"
                      icon={<Archive className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setSelectedRestaurant(rest);
                        setActionModal('DISMISS');
                      }}
                    >
                      Dismiss
                    </Button>
                  </div>
                </Card>
              ))}

              {pendingRestaurants.length === 0 && (
                <div className="col-span-2 text-center py-16 bg-[#0e1117] rounded-xl border border-white/[0.08] text-white/40">
                  <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-60" />
                  <p className="text-sm font-semibold text-white">No Pending Applications</p>
                  <p className="text-xs text-white/40 mt-1">All onboarding launch applications have been processed.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ALL RESTAURANTS DIRECTORY */}
        {activeTab === 'restaurants' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white">Restaurant Directory</h3>
                <p className="text-xs text-white/50">Manage status, activate, deactivate, suspend or soft-delete merchant accounts</p>
              </div>
              <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search by name, owner, or cuisine..." className="w-full sm:w-72" />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-white/[0.08]">
              {[
                { id: 'ALL', label: 'All Outlets' },
                { id: 'LIVE', label: 'Live' },
                { id: 'PENDING', label: 'Pending Approval' },
                { id: 'INACTIVE', label: 'Inactive / Deactivated' },
                { id: 'SUSPENDED', label: 'Suspended' },
                { id: 'DELETED', label: 'Deleted' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-amber-500 text-slate-950 font-semibold shadow-xs'
                      : 'bg-[#0e1117] text-white/60 hover:text-white border border-white/[0.08]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Restaurant Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRestaurants.map((rest) => (
                <Card key={rest.id} className="bg-[#0e1117] border-white/[0.08] hover:border-white/20 p-5 space-y-4 relative flex flex-col justify-between rounded-xl transition-all">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={rest.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80'}
                          alt={rest.name}
                          className="w-10 h-10 rounded-lg object-cover border border-white/[0.08]"
                        />
                        <div>
                          <h4 className="font-semibold text-white text-sm truncate max-w-[160px]">{rest.name}</h4>
                          <p className="text-[11px] text-white/50">{rest.cuisine}</p>
                        </div>
                      </div>

                      <Badge variant={
                        rest.isDeleted || rest.lifecycleStatus === 'DELETED' ? 'danger' :
                        rest.lifecycleStatus === 'LIVE' || rest.isApproved ? 'success' :
                        rest.lifecycleStatus === 'PENDING_APPROVAL' ? 'warning' :
                        rest.lifecycleStatus === 'SUSPENDED' ? 'danger' :
                        rest.lifecycleStatus === 'DEACTIVATED' ? 'neutral' : 'neutral'
                      }>
                        {rest.isDeleted || rest.lifecycleStatus === 'DELETED' ? 'DELETED' :
                          rest.lifecycleStatus || (rest.isApproved ? 'LIVE' : 'PENDING')}
                      </Badge>
                    </div>

                    <div className="text-xs space-y-1.5 text-white/70 bg-[#12151b] p-3 rounded-xl border border-white/[0.08]">
                      <p className="truncate"><span className="text-white/40">Owner:</span> {rest.ownerName || 'Owner'} ({rest.ownerEmail || rest.email})</p>
                      <p className="font-mono text-[11px]"><span className="text-white/40">Type:</span> <span className="text-amber-400 font-semibold">{rest.businessType || (rest.features?.bar ? 'BAR' : 'RESTAURANT')}</span> · Bar: <span className={rest.hasBar ? "text-purple-400" : "text-white/40"}>{rest.hasBar ? 'YES' : 'NO'}</span> · Tables: <span className={rest.hasTables !== false ? "text-emerald-400" : "text-white/40"}>{rest.hasTables !== false ? 'YES' : 'NO'}</span></p>
                      <p className="font-mono text-[11px]"><span className="text-white/40">Phone:</span> {rest.phone}</p>
                      <p className="truncate font-mono text-[11px]"><span className="text-white/40">Domain:</span> {rest.domain || `${rest.slug}.dinely.app`}</p>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-white/[0.08] space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs border-white/[0.08] text-white/70 hover:text-white hover:bg-white/[0.04]"
                        icon={<Eye className="w-3.5 h-3.5" />}
                        onClick={() => {
                          setSelectedRestaurant(rest);
                          setViewDetailModal(true);
                        }}
                      >
                        View Restaurant
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs border-white/[0.08] text-white/60 hover:text-amber-400 hover:bg-white/[0.04]"
                        icon={<Send className="w-3 h-3" />}
                        onClick={() => {
                          setSelectedRestaurant(rest);
                          setActionModal('REMINDER');
                        }}
                        title="Send Reminder Notification"
                      >
                        Reminder
                      </Button>
                    </div>

                    {/* State toggles */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(rest.lifecycleStatus === 'PENDING_APPROVAL' || !rest.isApproved) && (
                        <Button
                          variant="brand"
                          size="sm"
                          className="text-[11px] px-2 py-1 bg-emerald-600 hover:bg-emerald-500 font-semibold text-white"
                          onClick={() => {
                            setSelectedRestaurant(rest);
                            setActionModal('APPROVE');
                          }}
                        >
                          Approve
                        </Button>
                      )}

                      {(rest.lifecycleStatus === 'DEACTIVATED' || rest.lifecycleStatus === 'DRAFT') && (
                        <Button
                          variant="brand"
                          size="sm"
                          className="text-[11px] px-2 py-1 bg-emerald-600 hover:bg-emerald-500 font-semibold text-white"
                          onClick={() => handleActivate(rest.id)}
                        >
                          Activate
                        </Button>
                      )}

                      {(rest.lifecycleStatus === 'LIVE' || rest.isApproved) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[11px] px-2 py-1 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                          onClick={() => {
                            setSelectedRestaurant(rest);
                            setActionModal('DEACTIVATE');
                          }}
                        >
                          Deactivate
                        </Button>
                      )}

                      {rest.lifecycleStatus !== 'SUSPENDED' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-[11px] px-2 py-1 border-rose-500/40 text-rose-400 hover:bg-rose-500/10"
                          onClick={() => {
                            setSelectedRestaurant(rest);
                            setActionModal('SUSPEND');
                          }}
                        >
                          Suspend
                        </Button>
                      )}

                      {rest.lifecycleStatus === 'SUSPENDED' && (
                        <Button
                          variant="brand"
                          size="sm"
                          className="text-[11px] px-2 py-1 bg-emerald-600 font-semibold text-white"
                          onClick={() => handleActivate(rest.id)}
                        >
                          Unsuspend
                        </Button>
                      )}

                      {!rest.isDeleted && (
                        <Button
                          variant="danger"
                          size="sm"
                          className="text-[11px] px-2 py-1 ml-auto"
                          onClick={() => {
                            setSelectedRestaurant(rest);
                            setActionModal('DELETE');
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}

              {filteredRestaurants.length === 0 && (
                <div className="col-span-3 text-center py-12 text-white/40 text-xs">
                  No restaurant records match current filter.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: ORGANIZATIONS */}
        {activeTab === 'orgs' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Tenant Organizations</h3>
                <p className="text-xs text-white/50">Multi-restaurant enterprise groups and franchise operators</p>
              </div>
            </div>

            <Table<Organization>
              data={organizations}
              keyExtractor={(o) => o.id}
              columns={[
                {
                  key: 'name',
                  header: 'Organization',
                  render: (o) => (
                    <div>
                      <p className="font-semibold text-white text-xs">{o.name}</p>
                      <p className="text-[11px] text-white/40 font-mono">{o.slug}.dinely.app</p>
                    </div>
                  ),
                },
                {
                  key: 'ownerName',
                  header: 'Primary Owner',
                  render: (o) => (
                    <div>
                      <p className="text-xs text-white/80">{o.ownerName}</p>
                      <p className="text-[10px] text-white/40 font-mono">{o.ownerEmail}</p>
                    </div>
                  ),
                },
                {
                  key: 'restaurantsCount',
                  header: 'Locations',
                  render: (o) => <span className="font-mono text-xs text-white/70">{o.restaurantsCount} Venues</span>,
                },
                {
                  key: 'status',
                  header: 'Verification Status',
                  render: (o) => <Badge variant={o.status === 'ACTIVE' ? 'success' : 'warning'}>{o.status === 'ACTIVE' ? 'APPROVED' : 'PENDING'}</Badge>,
                },
              ]}
            />
          </div>
        )}

        {/* TAB 5: SUPPORT TICKETS */}
        {activeTab === 'tickets' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-white">Support Tickets & Inquiries</h3>
              <p className="text-xs text-white/50">Assistance requests from restaurant owners and staff</p>
            </div>

            <div className="space-y-3">
              <EmptyState
                icon={<LifeBuoy className="w-6 h-6 text-white/30" />}
                title="No Open Support Tickets"
                description="All merchant inquiry tickets and platform support channels are resolved with zero pending issues."
              />
            </div>
          </div>
        )}

        {/* TAB 6: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold text-white">System Security Audit Logs</h3>
              <p className="text-xs text-white/50">Immutable event log of administrative actions and tenant lifecycle changes</p>
            </div>
            <div className="bg-[#0e1117] border border-white/[0.08] rounded-xl p-6">
              <div className="space-y-4">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-[#12151b] border border-white/[0.08] text-white/70 font-mono text-xs">
                        {log.ipAddress}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-white">{log.actor} — {log.action}</p>
                        <p className="text-[10px] text-white/40 font-mono">Target: {log.target}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant={log.status === 'SUCCESS' ? 'success' : 'warning'}>{log.status}</Badge>
                      <p className="text-[10px] text-white/40 font-mono mt-1">{log.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* VIEW RESTAURANT MODAL */}
      <Modal
        isOpen={viewDetailModal && !!selectedRestaurant}
        onClose={closeModals}
        title="Comprehensive Restaurant Audit"
        description="Review complete business, branding, menu, and operational configuration."
      >
        {selectedRestaurant && (
          <div className="space-y-4 text-xs font-sans">
            {/* Header branding */}
            <div className="p-4 rounded-xl bg-[#12151b] border border-white/[0.08] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={selectedRestaurant.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80'}
                  alt={selectedRestaurant.name}
                  className="w-12 h-12 rounded-xl object-cover border border-white/[0.08]"
                />
                <div>
                  <h3 className="text-base font-semibold text-white">{selectedRestaurant.name}</h3>
                  <p className="text-white/60 text-xs">{selectedRestaurant.cuisine} ({selectedRestaurant.restaurantType || 'Casual Dining'})</p>
                  <p className="text-white/40 font-mono text-[11px]">{selectedRestaurant.domain || `${selectedRestaurant.slug}.dinely.app`}</p>
                </div>
              </div>
              <Badge variant={selectedRestaurant.lifecycleStatus === 'LIVE' || selectedRestaurant.isApproved ? 'success' : 'warning'}>
                {selectedRestaurant.lifecycleStatus || (selectedRestaurant.isApproved ? 'LIVE' : 'PENDING')}
              </Badge>
            </div>

            {/* Sections */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card className="bg-[#12151b] border-white/[0.08] p-3.5 space-y-1.5 rounded-xl">
                <h5 className="font-semibold text-amber-400 font-mono text-xs flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> Business & Location
                </h5>
                <p><span className="text-white/40">Address:</span> {selectedRestaurant.address}</p>
                <p><span className="text-white/40">Phone:</span> {selectedRestaurant.phone}</p>
                <p><span className="text-white/40">GST/Tax:</span> {selectedRestaurant.gstNumber || 'GST-1029384'} ({selectedRestaurant.taxPercentage || 8.5}%)</p>
                <p><span className="text-white/40">Hours:</span> {selectedRestaurant.openingHours || '09:00 AM'} - {selectedRestaurant.closingHours || '10:00 PM'}</p>
              </Card>

              <Card className="bg-[#12151b] border-white/[0.08] p-3.5 space-y-1.5 rounded-xl">
                <h5 className="font-semibold text-amber-400 font-mono text-xs flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Owner Account
                </h5>
                <p><span className="text-white/40">Owner Name:</span> {selectedRestaurant.ownerName || 'Restaurant Owner'}</p>
                <p><span className="text-white/40">Owner Email:</span> {selectedRestaurant.ownerEmail || selectedRestaurant.email}</p>
                <p><span className="text-white/40">Submitted Date:</span> {selectedRestaurant.submittedAt || 'Today'}</p>
              </Card>

              <Card className="bg-[#12151b] border-white/[0.08] p-3.5 space-y-1.5 rounded-xl">
                <h5 className="font-semibold text-amber-400 font-mono text-xs flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5" /> Floorplan & Tables
                </h5>
                <p><span className="text-white/40">Total Tables:</span> {selectedRestaurant.tablesCount || 16}</p>
                <p><span className="text-white/40">Indoor:</span> {selectedRestaurant.indoorTablesCount || 10} | <span className="text-white/40">Outdoor:</span> {selectedRestaurant.outdoorTablesCount || 4} | <span className="text-white/40">VIP:</span> {selectedRestaurant.vipTablesCount || 2}</p>
                <p className="text-emerald-400 font-mono text-[11px]">Dynamic QR Codes Active</p>
              </Card>

              <Card className="bg-[#12151b] border-white/[0.08] p-3.5 space-y-1.5 rounded-xl">
                <h5 className="font-semibold text-amber-400 font-mono text-xs flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Branding & Theme
                </h5>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ backgroundColor: selectedRestaurant.theme?.primaryColor || '#f59e0b' }} />
                  <span className="text-[11px] text-white/60 font-mono">Accent: {selectedRestaurant.theme?.primaryColor || '#f59e0b'}</span>
                </div>
                <p className="text-[10px] text-white/40 truncate font-mono">Banner URL: {selectedRestaurant.theme?.bannerUrl}</p>
              </Card>
            </div>

            {/* Quick decision footer */}
            <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <Button variant="outline" size="sm" onClick={closeModals} className="border-white/[0.08] text-white/60 hover:text-white">
                Close Audit
              </Button>
              {(!selectedRestaurant.isApproved || selectedRestaurant.lifecycleStatus === 'PENDING_APPROVAL') && (
                <Button
                  variant="brand"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-500 font-semibold text-white text-xs"
                  onClick={() => {
                    setActionModal('APPROVE');
                  }}
                >
                  Approve Application
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ADMIN ACTION DECISION MODAL */}
      <Modal
        isOpen={!!actionModal && !!selectedRestaurant}
        onClose={closeModals}
        title={
          actionModal === 'APPROVE' ? 'Confirm Restaurant Approval' :
          actionModal === 'REJECT' ? 'Decline Restaurant Application' :
          actionModal === 'REQUEST_CHANGES' ? 'Request Modifications from Owner' :
          actionModal === 'DEACTIVATE' ? 'Deactivate Restaurant Outlet' :
          actionModal === 'SUSPEND' ? 'Suspend Owner Account' :
          actionModal === 'DELETE' ? 'Soft-Delete Restaurant Record' :
          actionModal === 'REMINDER' ? 'Send Reminder Notification' : 'Platform Action'
        }
        description={`Target Restaurant: ${selectedRestaurant?.name}`}
      >
        {selectedRestaurant && (
          <div className="space-y-4 text-xs font-sans">
            {actionModal === 'APPROVE' && (
              <p className="text-white/70 leading-relaxed">
                Approving <strong className="text-white">{selectedRestaurant.name}</strong> will activate its live status, enable the Restaurant Dashboard, Kitchen KDS, Waiter Terminal OS, and Customer QR Ordering.
              </p>
            )}

            {actionModal === 'DISMISS' && (
              <div className="space-y-3">
                <p className="text-white/70 leading-relaxed">
                  Archiving <strong className="text-white">{selectedRestaurant.name}</strong> removes it from the operational pending approval queue without pretending it was approved or rejected.
                </p>
                <div>
                  <label className="text-white/70 font-semibold mb-1 block">Archive Note / Reason:</label>
                  <input
                    type="text"
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="e.g. Test fixture, duplicate application, or demo record"
                    className="w-full bg-[#12151b] border border-white/[0.08] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-400/50"
                  />
                </div>
              </div>
            )}

            {(actionModal === 'REJECT' || actionModal === 'REQUEST_CHANGES' || actionModal === 'DEACTIVATE' || actionModal === 'SUSPEND') && (
              <div className="space-y-2">
                <label className="text-white/70 font-semibold">
                  {actionModal === 'REJECT' ? 'Reason for Rejection:' :
                   actionModal === 'REQUEST_CHANGES' ? 'Required Modifications Comments:' :
                   actionModal === 'DEACTIVATE' ? 'Deactivation Reason:' : 'Suspension Reason:'}
                </label>
                <textarea
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Enter detailed message for the restaurant owner..."
                  className="w-full bg-[#12151b] border border-white/[0.08] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-400/50"
                />
              </div>
            )}

            {actionModal === 'DELETE' && (
              <p className="text-rose-400 bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 leading-relaxed">
                Soft-deleting <strong className="text-white">{selectedRestaurant.name}</strong> will set its status to DELETED and hide it from customer access. The data remains securely stored in the database.
              </p>
            )}

            {actionModal === 'REMINDER' && (
              <div className="space-y-3">
                <div>
                  <label className="text-white/70 font-semibold mb-1 block">Select Reminder Category:</label>
                  <select
                    value={reminderType}
                    onChange={(e) => setReminderType(e.target.value)}
                    className="w-full bg-[#12151b] border border-white/[0.08] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-400/50"
                  >
                    <option value="PAYMENT">Payment Reminder</option>
                    <option value="PROFILE">Restaurant Profile Incomplete</option>
                    <option value="MENU">Update Menu & Pricing</option>
                    <option value="LOGO">Upload High-Res Logo</option>
                    <option value="SUBSCRIPTION">Subscription Reminder</option>
                    <option value="ANNOUNCEMENT">General Announcement</option>
                  </select>
                </div>
                <div>
                  <label className="text-white/70 font-semibold mb-1 block">Custom Message (Optional):</label>
                  <textarea
                    rows={2}
                    value={reminderMessage}
                    onChange={(e) => setReminderMessage(e.target.value)}
                    placeholder="e.g. Please update your weekend menu offerings and tax configuration."
                    className="w-full bg-[#12151b] border border-white/[0.08] rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-400/50"
                  />
                </div>
              </div>
            )}

            {actionModal === 'APPROVE' && approvalError && (
              <div className="mb-3 p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-mono text-[11px]">
                  {approvalError}
                </span>
                <button
                  type="button"
                  onClick={() => handleApprove(selectedRestaurant.id)}
                  disabled={isApproving}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow transition"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <Button variant="outline" size="sm" onClick={closeModals} className="border-white/[0.08] text-white/60 hover:text-white">
                Cancel
              </Button>

              {actionModal === 'APPROVE' && (
                <Button
                  variant="brand"
                  size="sm"
                  onClick={() => handleApprove(selectedRestaurant.id)}
                  disabled={isApproving}
                  isLoading={isApproving}
                  className="bg-emerald-600 hover:bg-emerald-500 font-semibold text-white min-w-[200px]"
                >
                  {isApproving ? 'Approving & Launching...' : (approvalError ? 'Retry Approval & Launch' : 'Confirm Approval & Launch')}
                </Button>
              )}

              {actionModal === 'REJECT' && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={Boolean(isActionInProgress)}
                  isLoading={isActionInProgress === selectedRestaurant.id}
                  onClick={() => handleReject(selectedRestaurant.id)}
                >
                  {isActionInProgress === selectedRestaurant.id ? 'Rejecting...' : 'Confirm Rejection'}
                </Button>
              )}

              {actionModal === 'DISMISS' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={Boolean(isActionInProgress)}
                  isLoading={isActionInProgress === selectedRestaurant.id}
                  onClick={() => handleDismiss(selectedRestaurant.id)}
                  className="border-white/[0.08] text-white/70 hover:bg-white/[0.04] hover:text-white"
                >
                  {isActionInProgress === selectedRestaurant.id ? 'Archiving...' : 'Confirm Archive'}
                </Button>
              )}

              {actionModal === 'REQUEST_CHANGES' && (
                <Button variant="outline" size="sm" onClick={() => handleRequestChanges(selectedRestaurant.id)} className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                  Send Change Request
                </Button>
              )}

              {actionModal === 'DEACTIVATE' && (
                <Button variant="outline" size="sm" onClick={() => handleDeactivate(selectedRestaurant.id)} className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                  Confirm Deactivation
                </Button>
              )}

              {actionModal === 'SUSPEND' && (
                <Button variant="danger" size="sm" onClick={() => handleSuspend(selectedRestaurant.id)}>
                  Suspend Account
                </Button>
              )}

              {actionModal === 'DELETE' && (
                <Button variant="danger" size="sm" onClick={() => handleDelete(selectedRestaurant.id)}>
                  Soft-Delete Record
                </Button>
              )}

              {actionModal === 'REMINDER' && (
                <Button variant="brand" size="sm" onClick={() => handleSendReminder(selectedRestaurant.id)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold">
                  Dispatch Reminder
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        options={[
          { id: '1', label: 'View Platform Metrics', category: 'Analytics', icon: <BarChart3 className="w-4 h-4" />, action: () => setActiveTab('dashboard') },
          { id: '2', label: 'Review Pending Applications', category: 'Approval', icon: <ClockIcon className="w-4 h-4" />, action: () => setActiveTab('pending') },
          { id: '3', label: 'Manage All Outlets', category: 'Directory', icon: <Utensils className="w-4 h-4" />, action: () => setActiveTab('restaurants') },
          { id: '4', label: 'Inspect Security Audit Logs', category: 'Security', icon: <ShieldAlert className="w-4 h-4" />, action: () => setActiveTab('audit') },
        ]}
      />
    </div>
  );
};

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
