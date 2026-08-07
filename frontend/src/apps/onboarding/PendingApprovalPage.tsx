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
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    loadRestaurantData();
  }, [restaurantId]);

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
            {restaurant?.domain || `${restName.toLowerCase().replace(/[^a-z0-9]/g, '')}.dineflow.app`} • ID: {restaurant?.id || 'rest-new'}
          </p>
        </div>

        {/* Animated Success Icon & Status Badge */}
        <div className="space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto shadow-2xl shadow-amber-950/40">
            <CheckCircle2 className="w-8 h-8 text-amber-400 animate-pulse" />
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>Status: Pending Approval</span>
          </div>
        </div>

        {/* Informational Message */}
        <div className="bg-slate-950/80 p-6 rounded-2xl border border-slate-800 space-y-2 text-slate-300 text-sm leading-relaxed max-w-lg mx-auto">
          <p className="font-semibold text-white text-base">Your restaurant has been successfully submitted.</p>
          <p className="text-xs text-slate-400">Our team is reviewing your restaurant configuration, menu items, and dining floorplan.</p>
          <p className="text-emerald-400 font-semibold text-xs pt-1 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            You will receive a notification after approval.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="brand"
            onClick={() => setIsDetailsModalOpen(true)}
            className="w-full sm:w-auto text-xs font-bold px-6 py-3 bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white shadow-xl shadow-rose-950/50"
            icon={<Sparkles className="w-4 h-4 mr-1" />}
          >
            View Submitted Information
          </Button>

          <Button
            variant="outline"
            onClick={handleEditRestaurant}
            className="w-full sm:w-auto text-xs font-bold border-slate-700 text-slate-200 hover:bg-slate-800 px-5 py-3"
            icon={<Edit className="w-4 h-4 mr-1" />}
          >
            Edit Restaurant
          </Button>

          <Button
            variant="outline"
            onClick={handleLogout}
            className="w-full sm:w-auto text-xs font-bold border-slate-800 text-rose-400 hover:bg-rose-500/10 px-5 py-3"
            icon={<LogOut className="w-4 h-4 mr-1" />}
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
              <p className="text-[11px] text-amber-200/80">Submitted on {restaurant?.submittedAt || 'Today'}. You can verify your submitted details below.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="bg-slate-950 border-slate-800 p-4 space-y-2">
              <h4 className="font-bold text-rose-400 flex items-center gap-1.5">
                <Building className="w-4 h-4" /> Location & Business
              </h4>
              <p className="text-slate-200 font-bold">{restaurant?.name || restName}</p>
              <p className="text-slate-400">{restaurant?.address || 'Main Street'}, {restaurant?.city || 'San Francisco'}</p>
              <p className="text-slate-400">Currency: {restaurant?.currency || 'USD ($)'} • Timezone: {restaurant?.timezone || 'PST'}</p>
            </Card>

            <Card className="bg-slate-950 border-slate-800 p-4 space-y-2">
              <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                <QrCode className="w-4 h-4" /> Dining Floorplan
              </h4>
              <p className="text-slate-200 font-bold">{restaurant?.tablesCount || 12} Tables Configured</p>
              <p className="text-slate-400">Indoor: {restaurant?.indoorTablesCount || 8} | Outdoor: {restaurant?.outdoorTablesCount || 4} | VIP: {restaurant?.vipTablesCount || 2}</p>
              <p className="text-emerald-400 font-mono">QR Codes generated</p>
            </Card>

            <Card className="bg-slate-950 border-slate-800 p-4 space-y-2">
              <h4 className="font-bold text-purple-400 flex items-center gap-1.5">
                <Wine className="w-4 h-4" /> Enabled Modular Services
              </h4>
              <div className="flex flex-wrap gap-1 pt-1">
                {restaurant?.features ? (
                  Object.entries(restaurant.features)
                    .filter(([_, enabled]) => enabled)
                    .map(([key]) => (
                      <Badge key={key} variant="brand" className="text-[9px] uppercase">
                        {key.replace('_', ' ')}
                      </Badge>
                    ))
                ) : (
                  <Badge variant="brand" className="text-[9px]">FOOD SERVICE</Badge>
                )}
              </div>
            </Card>

            <Card className="bg-slate-950 border-slate-800 p-4 space-y-2">
              <h4 className="font-bold text-emerald-400 flex items-center gap-1.5">
                <UtensilsCrossed className="w-4 h-4" /> Application Status
              </h4>
              <p className="text-slate-200 font-bold">Pending Review Queue</p>
              <p className="text-slate-400">Owner Email: {restaurant?.ownerEmail || 'owner@restaurant.com'}</p>
            </Card>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => setIsDetailsModalOpen(false)}
              className="text-xs font-bold border-slate-800 text-slate-300"
            >
              Close Details
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
