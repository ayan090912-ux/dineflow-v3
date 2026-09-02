import React, { useState, useEffect } from 'react';
import {
  Store,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  LogOut,
  Building2,
  MapPin,
  Grid,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { Button, Card, Badge, DinelyLogo } from '../../packages/ui';
import { api } from '../../packages/api/client';
import { Restaurant, User } from '../../packages/types';

interface WorkspaceSelectorProps {
  user?: User | null;
  onSelectRestaurant: (restaurant: Restaurant) => void;
  onCreateNewRestaurant: () => void;
  onLogout?: () => void;
}

export const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  user,
  onSelectRestaurant,
  onCreateNewRestaurant,
  onLogout,
}) => {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const currentUser = user || api.getCurrentUser();
  const userName = currentUser?.name || currentUser?.firstName || currentUser?.email?.split('@')[0] || 'Owner';

  const loadOwnerRestaurants = async (targetEmail?: string, targetUid?: string) => {
    setIsLoading(true);
    try {
      const email = targetEmail || currentUser?.email;
      const uid = targetUid || currentUser?.id;
      const list = await api.getOwnerRestaurants(email, uid);
      setRestaurants(list);
    } catch (e) {
      console.error('Failed to load owner restaurants:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOwnerRestaurants();
    const safetyTimer = setTimeout(() => {
      setIsLoading(false);
    }, 4000);

    return () => {
      clearTimeout(safetyTimer);
    };
  }, [currentUser?.email, currentUser?.id]);

  const handleLogout = async () => {
    await api.logout();
    if (onLogout) onLogout();
    else window.location.href = '/restaurant/login';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8 font-sans relative overflow-x-hidden">
      {/* Background Lighting Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-gradient-to-tr from-rose-600/10 via-amber-500/10 to-indigo-600/10 blur-[150px] rounded-full pointer-events-none" />

      {/* Header Bar */}
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between py-4 px-6 bg-slate-900/80 border border-slate-800 rounded-2xl backdrop-blur-xl z-10 shadow-xl">
        <div className="flex items-center gap-3">
          <DinelyLogo size="sm" />
          <Badge variant="brand" className="text-[10px]">Workspace Selector</Badge>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right text-xs">
            <p className="font-bold text-white">{userName}</p>
            <p className="text-[10px] text-slate-400 font-mono">{currentUser?.email}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="text-xs border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
            icon={<LogOut className="w-3.5 h-3.5" />}
          >
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl w-full mx-auto my-8 space-y-8 relative z-10">
        {/* Welcome Banner */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-rose-400">
            <Sparkles className="w-3.5 h-3.5 text-rose-400" />
            <span>Dinely Multi-Tenant OS</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Welcome back, <span className="text-rose-400">{userName}</span>
          </h1>
          <p className="text-sm text-slate-400">
            Choose a restaurant workspace to manage or onboard a new venue outlet.
          </p>
        </div>

        {/* Loading / Zero State / Grid */}
        {isLoading ? (
          <div className="py-20 text-center space-y-3 bg-slate-900/60 border border-slate-800/80 rounded-3xl backdrop-blur-xl">
            <div className="w-10 h-10 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-mono">Loading restaurant workspaces...</p>
          </div>
        ) : restaurants.length === 0 ? (
          <div className="p-12 text-center space-y-6 bg-slate-900/60 border border-slate-800/80 rounded-3xl backdrop-blur-xl max-w-xl mx-auto shadow-2xl">
            <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mx-auto">
              <Store className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-white">Create your restaurant</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                You do not have any restaurant workspaces yet. Complete our quick setup wizard to configure your QR menu, Kitchen KDS, tables, and billing.
              </p>
            </div>
            <Button
              variant="brand"
              size="lg"
              onClick={onCreateNewRestaurant}
              className="px-8 py-3.5 text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-xl shadow-rose-950/40"
              icon={<Plus className="w-4 h-4 mr-1" />}
            >
              Create Restaurant
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Owner's Existing Restaurants */}
            {restaurants.map((rest) => {
              const isApproved = rest.isApproved || rest.lifecycleStatus === 'APPROVED' || rest.lifecycleStatus === 'LIVE' || rest.lifecycleStatus === 'ACTIVE';
              const isPending = rest.lifecycleStatus === 'PENDING_APPROVAL' || (!rest.isApproved && rest.lifecycleStatus !== 'REJECTED' && rest.lifecycleStatus !== 'SUSPENDED');
              const isRejected = rest.lifecycleStatus === 'REJECTED';
              const isSuspended = rest.lifecycleStatus === 'SUSPENDED';

              const logo = rest.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80';

              return (
                <Card
                  key={rest.id}
                  className="bg-slate-900/90 border-slate-800/90 hover:border-slate-700 p-6 flex flex-col justify-between space-y-5 rounded-3xl transition-all duration-300 hover:shadow-2xl hover:shadow-rose-950/20 backdrop-blur-xl group"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={logo}
                          alt={rest.name}
                          className="w-14 h-14 rounded-2xl object-cover border border-slate-800 shadow-md group-hover:scale-105 transition-transform"
                        />
                        <div className="space-y-0.5">
                          <h3 className="font-bold text-white text-lg tracking-tight group-hover:text-rose-400 transition-colors">
                            {rest.name}
                          </h3>
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            {rest.businessType || rest.cuisine || 'Casual Dining'}
                          </p>
                        </div>
                      </div>

                      <Badge
                        variant={
                          isApproved ? 'success' :
                          isPending ? 'warning' :
                          isRejected ? 'danger' : 'danger'
                        }
                        className="text-[10px] uppercase font-bold shrink-0"
                      >
                        {isApproved ? 'Active' : isPending ? 'Pending Approval' : isRejected ? 'Rejected' : 'Suspended'}
                      </Badge>
                    </div>

                    <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800/80 text-xs space-y-1.5 text-slate-300">
                      <div className="flex items-center gap-1.5 text-slate-400 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{rest.address || 'Address N/A'}{rest.city ? `, ${rest.city}` : ''}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800/60">
                        <span className="text-slate-500 font-semibold flex items-center gap-1">
                          <Grid className="w-3 h-3 text-rose-400" /> Dining Tables
                        </span>
                        <span className="font-bold text-rose-400">
                          {rest.tablesCount || rest.indoorTablesCount || 10} Tables
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Primary Action Button based on Status */}
                  <div>
                    {isApproved ? (
                      <Button
                        variant="brand"
                        onClick={() => onSelectRestaurant(rest)}
                        className="w-full text-xs font-bold py-3 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40"
                        icon={<ArrowRight className="w-4 h-4 ml-1" />}
                      >
                        Open Restaurant →
                      </Button>
                    ) : isPending ? (
                      <Button
                        variant="outline"
                        onClick={() => onSelectRestaurant(rest)}
                        className="w-full text-xs font-bold py-3 border-amber-500/50 text-amber-300 hover:bg-amber-500/10"
                        icon={<Clock className="w-4 h-4 mr-1 text-amber-400 animate-pulse" />}
                      >
                        View Status ⏳
                      </Button>
                    ) : isRejected ? (
                      <Button
                        variant="outline"
                        onClick={() => onSelectRestaurant(rest)}
                        className="w-full text-xs font-bold py-3 border-rose-500/50 text-rose-300 hover:bg-rose-500/10"
                        icon={<XCircle className="w-4 h-4 mr-1 text-rose-400" />}
                      >
                        View Reason & Resubmit ❌
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        disabled
                        className="w-full text-xs py-3 border-slate-800 text-slate-500"
                      >
                        Access Suspended
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}

            {/* Create New Restaurant Card */}
            <Card
              onClick={onCreateNewRestaurant}
              className="bg-slate-900/60 border-2 border-dashed border-slate-800 hover:border-rose-500/60 p-8 flex flex-col items-center justify-center text-center space-y-4 rounded-3xl cursor-pointer transition-all duration-300 hover:bg-slate-900/90 group"
            >
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:scale-110 group-hover:bg-rose-500 group-hover:text-white transition-all shadow-xl">
                <Plus className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-white text-lg group-hover:text-rose-400 transition-colors">
                  Create a new restaurant
                </h3>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                  Onboard another restaurant, bistro, bar, cloud kitchen, or cafe outlet.
                </p>
              </div>
              <div className="pt-2">
                <span className="text-xs font-bold text-rose-400 inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                  Start setup wizard →
                </span>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-4 max-w-5xl w-full mx-auto border-t border-slate-900 flex items-center justify-between">
        <span>© Dinely Cloud Platform • Enterprise Multi-Outlet OS</span>
        <span className="flex items-center gap-1 text-emerald-400 font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Tenant Data Isolated
        </span>
      </footer>
    </div>
  );
};
