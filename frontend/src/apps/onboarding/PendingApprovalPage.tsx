import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  Edit,
  LogOut,
  Building,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  XCircle,
  MapPin,
  Mail,
  Phone,
  Grid,
} from 'lucide-react';
import { Button, Card, Badge, Modal, Input } from '../../packages/ui';
import { api, realtimeBus } from '../../packages/api/client';
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
  const [isResubmitModalOpen, setIsResubmitModalOpen] = useState(false);

  // Resubmit Form State
  const [resubmitName, setResubmitName] = useState('');
  const [resubmitAddress, setResubmitAddress] = useState('');
  const [resubmitCity, setResubmitCity] = useState('');
  const [resubmitPhone, setResubmitPhone] = useState('');
  const [resubmitTables, setResubmitTables] = useState<number>(10);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState('');

  useEffect(() => {
    loadRestaurantData();
    const interval = setInterval(() => {
      loadRestaurantDataSilent();
    }, 3000);

    const unsub = realtimeBus.subscribe((event: any) => {
      if (event.type === 'RESTAURANT_APPROVED' || event.type === 'RestaurantStatusUpdated') {
        const evtRestId = event.restaurantId || event.restaurant_id;
        if (!restaurantId || !evtRestId || evtRestId === restaurantId || (restaurant && evtRestId === restaurant.id)) {
          loadRestaurantData();
        }
      } else if (event.type === 'RESTAURANT_REJECTED') {
        const evtRestId = event.restaurantId || event.restaurant_id;
        if (!restaurantId || !evtRestId || evtRestId === restaurantId || (restaurant && evtRestId === restaurant.id)) {
          loadRestaurantData();
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [restaurantId]);

  useEffect(() => {
    if (restaurant && (restaurant.isApproved || restaurant.lifecycleStatus === 'APPROVED' || restaurant.lifecycleStatus === 'LIVE' || restaurant.lifecycleStatus === 'ACTIVE')) {
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
      if (rest) {
        setResubmitName(rest.name || '');
        setResubmitAddress(rest.address || '');
        setResubmitCity(rest.city || 'Mumbai');
        setResubmitPhone(rest.phone || '');
        setResubmitTables(rest.tablesCount || rest.indoorTablesCount || 10);
      }
    } catch (err) {
      console.error('Failed to load restaurant details:', err);
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
    if (rest && (rest.isApproved || rest.lifecycleStatus === 'APPROVED' || rest.lifecycleStatus === 'LIVE' || rest.lifecycleStatus === 'ACTIVE')) {
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

  const handleResubmitApplication = async () => {
    if (!restaurant) return;
    setResubmitError('');
    setIsResubmitting(true);

    try {
      const updated = await api.submitRestaurantLaunch({
        id: restaurant.id,
        restaurantName: resubmitName,
        address: resubmitAddress,
        city: resubmitCity,
        phone: resubmitPhone,
        totalTablesCount: resubmitTables,
      });

      setRestaurant(updated);
      setIsResubmitting(false);
      setIsResubmitModalOpen(false);
    } catch (err: any) {
      setIsResubmitting(false);
      setResubmitError(err.message || 'Failed to resubmit application.');
    }
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

  const isApproved = restaurant?.isApproved || restaurant?.lifecycleStatus === 'APPROVED' || restaurant?.lifecycleStatus === 'LIVE' || restaurant?.lifecycleStatus === 'ACTIVE';
  const isRejected = restaurant?.lifecycleStatus === 'REJECTED' || restaurant?.lifecycleStatus === 'CHANGES_REQUESTED';
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
            Application #{restaurant?.id ? restaurant.id.replace(/^rest-/, 'APP-').slice(0, 8).toUpperCase() : 'APP-8492'}
          </p>
        </div>

        {/* TIMELINE PROGRESSION LIST */}
        <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3 text-left">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Application Timeline</p>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-2.5 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Account created</span>
            </div>
            <div className="flex items-center gap-2.5 text-emerald-400 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Restaurant submitted</span>
            </div>
            <div className={`flex items-center gap-2.5 ${isApproved ? 'text-emerald-400 font-bold' : isRejected ? 'text-rose-400 font-bold' : 'text-amber-400 font-extrabold animate-pulse'}`}>
              {isApproved ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : isRejected ? (
                <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping ml-0.5 mr-1 shrink-0" />
              )}
              <span>Dinely review</span>
            </div>
            <div className={`flex items-center gap-2.5 ${isApproved ? 'text-emerald-400 font-bold' : 'text-slate-600 font-medium'}`}>
              {isApproved ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full border border-slate-600 ml-0.5 mr-1 shrink-0" />
              )}
              <span>Restaurant activated</span>
            </div>
          </div>
        </div>

        {/* DYNAMIC STATUS HERO BADGE */}
        {isApproved ? (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto shadow-2xl shadow-emerald-950/40">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 animate-bounce" />
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Status: Approved & Restaurant Activated 🎉</span>
            </div>
          </div>
        ) : isRejected ? (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-rose-500/10 border-2 border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto shadow-2xl shadow-rose-950/40">
              <XCircle className="w-8 h-8 text-rose-400" />
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
              <span>Status: Application Rejected ❌</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto shadow-2xl shadow-amber-950/40">
              <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Status: Pending approval ⏳</span>
            </div>
          </div>
        )}

        {/* Informational Box */}
        {isApproved ? (
          <div className="bg-emerald-950/60 p-6 rounded-2xl border border-emerald-800 space-y-2 text-emerald-200 text-sm leading-relaxed max-w-lg mx-auto shadow-lg">
            <p className="font-bold text-white text-base">Your restaurant has been approved!</p>
            <p className="text-xs text-emerald-300/90">
              Your live Operating System, POS Terminal, Kitchen KDS, Bar Terminal, and Table Floorplan are now active.
            </p>
          </div>
        ) : isRejected ? (
          <div className="bg-rose-950/60 p-6 rounded-2xl border border-rose-800/80 space-y-3 text-rose-200 text-sm leading-relaxed max-w-lg mx-auto text-left">
            <div className="font-bold text-white text-base flex items-center gap-2 text-rose-300">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              Rejection Reason from Platform Admin:
            </div>
            <div className="p-3 bg-slate-950/80 border border-rose-900/60 rounded-xl text-xs text-rose-200 font-mono">
              "{restaurant?.rejectionReason || 'Please verify business details, address, and table configuration.'}"
            </div>
            <p className="text-xs text-slate-300">
              Please click <span className="font-bold text-white">Resubmit Application</span> below to update your details and resubmit for admin approval.
            </p>
          </div>
        ) : (
          <div className="bg-slate-950/80 p-6 rounded-2xl border border-slate-800 space-y-3 text-slate-300 text-sm leading-relaxed max-w-lg mx-auto">
            <p className="font-semibold text-white text-base">Your restaurant is under review</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Our team is reviewing your restaurant. You'll get access once your application is approved.
            </p>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-center gap-1.5 text-emerald-400 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Real-time status updates active</span>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => onNavigate('/workspace')}
            className="w-full sm:w-auto text-xs font-bold border-slate-700 text-slate-200 hover:bg-slate-800 px-5 py-3"
          >
            ← Back to restaurants
          </Button>

          {isApproved ? (
            <Button
              variant="brand"
              onClick={() => onNavigate('/restaurant/dashboard')}
              className="w-full sm:w-auto text-xs font-bold px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-950/60"
              icon={<ArrowRight className="w-4 h-4 ml-1" />}
            >
              Open Restaurant →
            </Button>
          ) : isRejected ? (
            <>
              <Button
                variant="brand"
                onClick={() => setIsResubmitModalOpen(true)}
                className="w-full sm:w-auto text-xs font-bold px-8 py-3 bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-xl"
                icon={<Sparkles className="w-4 h-4 mr-1" />}
              >
                Resubmit Application
              </Button>
            </>
          ) : (
            <Button
              variant="brand"
              onClick={() => setIsDetailsModalOpen(true)}
              className="w-full sm:w-auto text-xs font-bold px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
              icon={<Building className="w-4 h-4 mr-1" />}
            >
              View Submitted Info
            </Button>
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
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Restaurant Type</span>
              <p className="font-bold text-white text-sm mt-0.5">{restaurant?.businessType || restaurant?.cuisine}</p>
            </div>
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Tables</span>
              <p className="font-bold text-rose-400 text-sm mt-0.5">{restaurant?.tablesCount || restaurant?.indoorTablesCount || 10} Tables</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase font-semibold block">Location & Contact</span>
            <p className="font-bold text-white">{restaurant?.address}</p>
            <p className="text-[11px] text-slate-400">{restaurant?.ownerName} • {restaurant?.ownerEmail} • {restaurant?.phone}</p>
          </div>
        </div>
      </Modal>

      {/* Resubmit Application Modal */}
      <Modal
        isOpen={isResubmitModalOpen}
        onClose={() => setIsResubmitModalOpen(false)}
        title="Resubmit Restaurant Application"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          {resubmitError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold">
              {resubmitError}
            </div>
          )}

          <Input
            label="Restaurant Name *"
            value={resubmitName}
            onChange={(e) => setResubmitName(e.target.value)}
          />
          <Input
            label="Street Address *"
            value={resubmitAddress}
            onChange={(e) => setResubmitAddress(e.target.value)}
          />
          <Input
            label="City *"
            value={resubmitCity}
            onChange={(e) => setResubmitCity(e.target.value)}
          />
          <Input
            label="Contact Phone Number *"
            value={resubmitPhone}
            onChange={(e) => setResubmitPhone(e.target.value)}
          />
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">Total Tables Count *</label>
            <input
              type="number"
              min={1}
              max={100}
              value={resubmitTables}
              onChange={(e) => setResubmitTables(parseInt(e.target.value) || 10)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-white text-sm font-bold focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <Button
              variant="outline"
              onClick={() => setIsResubmitModalOpen(false)}
              disabled={isResubmitting}
              className="text-xs border-slate-800 text-slate-400"
            >
              Cancel
            </Button>
            <Button
              variant="brand"
              onClick={handleResubmitApplication}
              isLoading={isResubmitting}
              className="text-xs font-bold px-6 py-2 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
            >
              Confirm Resubmission →
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
