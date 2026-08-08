import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  Edit,
  LogOut,
  Building,
  QrCode,
  Users,
  UtensilsCrossed,
  Wine,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  MapPin,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { Button, Card, Badge, Modal } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { Restaurant } from '../../packages/types';

interface PendingApprovalPageProps {
  restaurantId?: string;
  onNavigate: (path: string) => void;
  onLogout?: () => void;
}

export const PendingApprovalPage: React.FC<PendingApprovalPageProps> = ({
  restaurantId,
  onNavigate,
  onLogout,
}) => {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    loadRestaurantData();
    const interval = setInterval(() => {
      loadRestaurantDataSilent();
    }, 3000);
    return () => clearInterval(interval);
  }, [restaurantId]);

  useEffect(() => {
    if (restaurant && (restaurant.isApproved || restaurant.lifecycleStatus === 'LIVE')) {
      const timer = setTimeout(() => {
        onNavigate('/restaurant/dashboard');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [restaurant, onNavigate]);

  const loadRestaurantData = async () => {
    setIsLoading(true);
    try {
      const rest = await api.getRestaurantDetails(restaurantId);
      setRestaurant(rest);
    } catch (err) {
      console.error('Failed to load pending restaurant details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRestaurantDataSilent = async () => {
    try {
      const rest = await api.getRestaurantDetails(restaurantId);
      if (rest) {
        setRestaurant(rest);
      }
    } catch (e) {}
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    const rest = await api.getRestaurantDetails(restaurantId);
    setRestaurant(rest);
    if (rest && (rest.isApproved || rest.lifecycleStatus === 'LIVE')) {
      onNavigate('/restaurant/dashboard');
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleLogout = async () => {
    await api.logout();
    if (onLogout) {
      onLogout();
    } else {
      onNavigate('/restaurant/login');
    }
  };

  const handleEditRestaurant = () => {
    onNavigate('/wizard');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-mono">Loading application status...</p>
        </div>
      </div>
    );
  }

  const isApproved = restaurant?.isApproved || restaurant?.lifecycleStatus === 'LIVE';
  const isChangesRequested = restaurant?.lifecycleStatus === 'CHANGES_REQUESTED';
  const logo = restaurant?.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80';
  const banner = restaurant?.theme?.bannerUrl || 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80';
  const restName = restaurant?.name || 'Your Restaurant';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 sm:p-6 font-sans relative overflow-hidden">
      {/* Background Ambient Lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-tr from-amber-500/10 via-rose-600/10 to-indigo-600/10 blur-[140px] rounded-full pointer-events-none" />

      {/* Main Glass Card */}
      <Card className="max-w-2xl w-full bg-slate-900/90 border-slate-800 p-8 sm:p-10 shadow-2xl relative z-10 backdrop-blur-xl rounded-3xl text-center space-y-8">
        
        {/* Banner & Logo Display */}
        <div className="relative mb-6">
          <div className="h-32 w-full rounded-2xl overflow-hidden bg-slate-800 border border-slate-700/60 shadow-inner">
            <img
              src={banner}
              alt={restName}
              className="w-full h-full object-cover opacity-50 brightness-75"
            />
          </div>
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2">
            <img
              src={logo}
              alt={restName}
              className="w-20 h-20 rounded-3xl object-cover border-4 border-slate-900 shadow-2xl bg-slate-900"
            />
          </div>
        </div>

        {/* Restaurant Header */}
        <div className="pt-2 space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight">{restName}</h1>
          <p className="text-xs text-slate-400 font-mono">
            {restaurant?.domain || `${(restName || 'restaurant').toLowerCase().replace(/[^a-z0-9]/g, '')}.dineflow.app`} • ID: {restaurant?.id || 'rest-new'}
          </p>
        </div>

        {/* DYNAMIC STATUS BADGE & HERO */}
        {isApproved ? (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto shadow-2xl shadow-emerald-950/40">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-bounce" />
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Status: Approved & Live 🎉</span>
            </div>
          </div>
        ) : isChangesRequested ? (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto shadow-2xl shadow-amber-950/40">
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <span>Status: Modifications Requested ⚠️</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto shadow-2xl shadow-amber-950/40">
              <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Status: Pending Approval ⏳</span>
            </div>
          </div>
        )}

        {/* Informational Message */}
        {isApproved ? (
          <div className="bg-emerald-950/60 p-6 rounded-2xl border border-emerald-800 space-y-2 text-emerald-200 text-sm leading-relaxed max-w-lg mx-auto shadow-lg">
            <p className="font-bold text-white text-base">Your restaurant has been approved by Platform Admin!</p>
            <p className="text-xs text-emerald-300/90">
              Your live Operating System, POS Terminal, Kitchen KDS, and QR Table Ordering are now fully operational.
            </p>
          </div>
        ) : isChangesRequested ? (
          <div className="bg-amber-950/60 p-6 rounded-2xl border border-amber-800 space-y-2 text-amber-200 text-sm leading-relaxed max-w-lg mx-auto">
            <p className="font-bold text-white text-base">Action Required from Platform Admin</p>
            <p className="text-xs text-amber-300">
              "{restaurant?.requestedChanges || restaurant?.rejectionReason || 'Please verify business GST and update menu offerings.'}"
            </p>
          </div>
        ) : (
          <div className="bg-slate-950/80 p-6 rounded-2xl border border-slate-800 space-y-2 text-slate-300 text-sm leading-relaxed max-w-lg mx-auto">
            <p className="font-semibold text-white text-base">Your restaurant setup has been submitted.</p>
            <p className="text-xs text-slate-400">Our platform team is reviewing your venue identity, menu items, and dining floorplan.</p>
            <p className="text-emerald-400 font-semibold text-xs pt-1 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Live status updates automatically as soon as Platform Admin approves.
            </p>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {isApproved ? (
            <Button
              variant="brand"
              onClick={() => onNavigate('/restaurant/dashboard')}
              className="w-full sm:w-auto text-xs font-bold px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-950/60"
              icon={<ArrowRight className="w-4 h-4 ml-1" />}
            >
              Launch Restaurant Dashboard →
            </Button>
          ) : (
            <>
              <Button
                variant="brand"
                onClick={() => setIsDetailsModalOpen(true)}
                className="w-full sm:w-auto text-xs font-bold px-5 py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-xl shadow-rose-950/50"
                icon={<Sparkles className="w-4 h-4 mr-1" />}
              >
                View Submitted Info
              </Button>

              <Button
                variant="outline"
                onClick={handleEditRestaurant}
                className="w-full sm:w-auto text-xs font-bold border-slate-700 text-slate-200 hover:bg-slate-800 px-5 py-3"
                icon={<Edit className="w-4 h-4 mr-1" />}
              >
                Edit Setup
              </Button>

              <Button
                variant="outline"
                onClick={handleManualRefresh}
                className="w-full sm:w-auto text-xs font-bold border-slate-800 text-slate-300 hover:bg-slate-800 px-4 py-3"
                icon={<RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
              >
                Check Status
              </Button>
            </>
          )}

          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full sm:w-auto text-xs font-bold border-slate-800 text-rose-400 hover:bg-rose-500/10 px-4 py-3"
            icon={<LogOut className="w-4 h-4" />}
          >
            Logout
          </Button>
        </div>
      </Card>

      {/* Submitted Information Modal */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={`Submitted Setup Details for ${restName}`}
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-2.5 text-amber-200">
            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="font-bold text-amber-300">Under Review by Platform Administrator</p>
              <p className="text-[11px] text-amber-200/80">Submitted on {restaurant?.submittedAt || 'Today'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Cuisine & Type</span>
              <p className="font-bold text-white text-sm mt-0.5">{restaurant?.cuisine}</p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Owner Contact</span>
              <p className="font-bold text-white text-sm mt-0.5">{restaurant?.ownerName}</p>
              <p className="text-[11px] text-slate-400">{restaurant?.ownerEmail}</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Features Enabled</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(restaurant?.features || {}).map(([feat, enabled]) => (
                <div key={feat} className={`p-2 rounded-lg border text-[11px] font-bold flex items-center justify-between ${enabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-600 opacity-60'}`}>
                  <span className="capitalize">{feat.replace('_', ' ')}</span>
                  <span>{enabled ? '✓' : '✗'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
