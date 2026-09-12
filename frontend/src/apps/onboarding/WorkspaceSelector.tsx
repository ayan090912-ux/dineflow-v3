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
  LogIn,
  Building2,
  MapPin,
  Grid,
} from 'lucide-react';
import { Button, Card, Badge, DinelyLogo } from '../../packages/ui';
import { api, realtimeBus } from '../../packages/api/client';
import { Restaurant, User } from '../../packages/types';

interface WorkspaceSelectorProps {
  user?: User | null;
  onSelectRestaurant: (restaurant: Restaurant) => void | Promise<void>;
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
  const [viewState, setViewState] = useState<'INITIALIZING' | 'LOADING' | 'READY' | 'EMPTY' | 'ERROR' | 'UNAUTHENTICATED'>('INITIALIZING');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [openingRestId, setOpeningRestId] = useState<string | null>(null);

  const currentUser = user || api.getCurrentUser();
  const userName = currentUser?.name || currentUser?.firstName || currentUser?.email?.split('@')[0] || 'Owner';

  const loadOwnerRestaurants = async (targetEmail?: string, targetUid?: string) => {
    const email = targetEmail || currentUser?.email;
    const uid = targetUid || currentUser?.id;
    if (!email && !uid) {
      setViewState('UNAUTHENTICATED');
      return;
    }
    setViewState('LOADING');
    setErrorMessage('');
    try {
      const list = await api.getOwnerRestaurants(email, uid);
      setRestaurants(list);
      if (list.length === 0) {
        setViewState('EMPTY');
      } else {
        setViewState('READY');
      }
    } catch (e: any) {
      console.error('Failed to load owner restaurants:', e);
      setErrorMessage(e?.message || 'Unable to connect to Dinely Cloud. Please check your internet or retry.');
      setViewState('ERROR');
    }
  };

  const userEmail = currentUser?.email;
  const userId = currentUser?.id;

  useEffect(() => {
    let timer: any;
    if (userEmail || userId) {
      loadOwnerRestaurants(userEmail, userId);
    } else {
      setViewState('INITIALIZING');
      timer = setTimeout(() => {
        const u = user || api.getCurrentUser();
        if (u?.email || u?.id) {
          loadOwnerRestaurants(u.email, u.id);
        } else {
          setViewState('UNAUTHENTICATED');
        }
      }, 1200);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [userEmail, userId]);

  useEffect(() => {
    const unsub = realtimeBus.subscribe((event: any) => {
      const evtRestId = event.restaurantId || event.restaurant_id;
      if (!evtRestId) return;

      if (event.type === 'RESTAURANT_APPROVED') {
        setRestaurants((prev) =>
          prev.map((r) =>
            r.id === evtRestId
              ? { ...r, isApproved: true, lifecycleStatus: 'LIVE', status: 'OPEN' }
              : r
          )
        );
      } else if (event.type === 'RESTAURANT_REJECTED') {
        setRestaurants((prev) =>
          prev.map((r) =>
            r.id === evtRestId
              ? {
                  ...r,
                  isApproved: false,
                  lifecycleStatus: 'REJECTED',
                  status: 'CLOSED',
                  rejectionReason: event.rejectionReason,
                }
              : r
          )
        );
      } else if (event.type === 'RESTAURANT_DISMISSED') {
        setRestaurants((prev) =>
          prev.map((r) =>
            r.id === evtRestId
              ? { ...r, isApproved: false, lifecycleStatus: 'ARCHIVED', status: 'CLOSED' }
              : r
          )
        );
      } else if (event.type === 'RestaurantStatusUpdated') {
        const newStatus = event.lifecycleStatus || (event.isApproved ? 'LIVE' : 'PENDING_APPROVAL');
        setRestaurants((prev) =>
          prev.map((r) =>
            r.id === evtRestId
              ? {
                  ...r,
                  isApproved: Boolean(event.isApproved),
                  lifecycleStatus: newStatus,
                  rejectionReason: event.rejectionReason ?? r.rejectionReason,
                }
              : r
          )
        );
      }
    });

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && (userEmail || userId)) {
        api.getOwnerRestaurants(userEmail, userId)
          .then((freshList) => {
            if (Array.isArray(freshList)) {
              setRestaurants(freshList);
              if (freshList.length === 0) setViewState('EMPTY');
              else setViewState('READY');
            }
          })
          .catch(() => {});
      }
    }, 6000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [userEmail, userId]);

  const handleSelectRestaurant = async (rest: Restaurant) => {
    if (openingRestId) return;
    setOpeningRestId(rest.id);
    try {
      await onSelectRestaurant(rest);
    } finally {
      setOpeningRestId(null);
    }
  };

  const handleLogout = async () => {
    await api.logout();
    if (onLogout) onLogout();
    else window.location.href = '/restaurant/login';
  };

  return (
    <div className="min-h-screen bg-[#0b0d11] text-[#f3f4f6] flex flex-col justify-between font-sans selection:bg-[#f97316] selection:text-[#0b0d11]">
      {/* Editorial Header Bar */}
      <header className="border-b border-[#1e232e] bg-[#0b0d11]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-white">
            <DinelyLogo size="sm" />
            <span className="text-slate-600 text-sm hidden sm:inline">•</span>
            <span className="text-xs font-mono text-slate-400 hidden sm:inline">Workspace Hub</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right text-xs">
              <p className="font-semibold text-white">{userName}</p>
              <p className="text-[11px] text-slate-500 font-mono">{currentUser?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg border border-[#2d3545] hover:border-slate-500 bg-[#1a1e27] hover:bg-[#222734] text-xs font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto my-10 px-4 sm:px-6 flex-1 space-y-8">
        {/* Clean Welcome Headline */}
        <div className="space-y-1.5 text-left border-b border-[#1e232e] pb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-display">
            Welcome back, {userName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Select an active restaurant outlet to launch the operations workspace, or onboard a new venue.
          </p>
        </div>

        {/* Loading / Zero State / Error / Grid */}
        {viewState === 'UNAUTHENTICATED' ? (
          <div className="py-16 px-6 text-center space-y-4 border border-[#1e232e] rounded-2xl bg-[#12151b] max-w-md mx-auto shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-[#f97316]/10 border border-[#f97316]/20 flex items-center justify-center text-[#f97316] mx-auto">
              <LogIn className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-white font-display">Authentication Required</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Please sign in with your Google account to access and manage your Dinely restaurant workspaces.
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => {
                  if (onLogout) onLogout();
                  else window.location.href = '/restaurant/login';
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In to Continue</span>
              </button>
            </div>
          </div>
        ) : viewState === 'INITIALIZING' || viewState === 'LOADING' ? (
          <div className="py-24 text-center space-y-3 border border-[#1e232e] rounded-2xl bg-[#12151b]">
            <div className="w-8 h-8 border-2 border-[#f97316]/20 border-t-[#f97316] rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-mono">Loading restaurant workspaces...</p>
          </div>
        ) : viewState === 'ERROR' ? (
          <div className="p-8 text-center space-y-4 border border-red-500/20 rounded-2xl bg-[#12151b] max-w-lg mx-auto shadow-lg">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">Connection Issue</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {errorMessage || 'Failed to retrieve your restaurant list from the server.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => loadOwnerRestaurants()}
                className="px-4 py-2 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-xs transition-colors cursor-pointer"
              >
                Retry
              </button>
              <button
                onClick={onCreateNewRestaurant}
                className="px-4 py-2 rounded-lg border border-[#2d3545] bg-[#1a1e27] hover:bg-[#222734] text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Create Restaurant
              </button>
            </div>
          </div>
        ) : viewState === 'EMPTY' || restaurants.length === 0 ? (
          <div className="p-12 text-center space-y-5 border border-[#1e232e] rounded-2xl bg-[#12151b] max-w-lg mx-auto shadow-lg">
            <div className="w-14 h-14 rounded-xl bg-[#1a1e27] border border-[#2d3545] flex items-center justify-center text-[#f97316] mx-auto">
              <Store className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-white font-display">Create your first restaurant</h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
                You don't have any restaurant outlets configured yet. Complete our quick setup wizard to configure your venue.
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={onCreateNewRestaurant}
                className="px-6 py-2.5 rounded-lg bg-[#f97316] hover:bg-[#ea580c] text-[#0b0d11] font-bold text-xs transition-colors cursor-pointer shadow-sm inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Onboard Restaurant</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-left">
            {/* Owner's Existing Restaurants */}
            {restaurants.map((rest) => {
              const isApproved =
                rest.lifecycleStatus === 'LIVE' ||
                rest.lifecycleStatus === 'APPROVED' ||
                (rest.isApproved === true &&
                  rest.lifecycleStatus !== 'PENDING_APPROVAL' &&
                  rest.lifecycleStatus !== 'REJECTED' &&
                  rest.lifecycleStatus !== 'ARCHIVED' &&
                  rest.lifecycleStatus !== 'SUSPENDED');
              const isPending =
                rest.lifecycleStatus === 'PENDING_APPROVAL' ||
                (!rest.isApproved &&
                  rest.lifecycleStatus !== 'LIVE' &&
                  rest.lifecycleStatus !== 'APPROVED' &&
                  rest.lifecycleStatus !== 'REJECTED' &&
                  rest.lifecycleStatus !== 'ARCHIVED' &&
                  rest.lifecycleStatus !== 'SUSPENDED');
              const isRejected = rest.lifecycleStatus === 'REJECTED';
              const isArchived = rest.lifecycleStatus === 'ARCHIVED';

              const logo = rest.theme?.logo || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=150&auto=format&fit=crop&q=80';

              return (
                <div
                  key={rest.id}
                  className="border border-[#1e232e] hover:border-[#2d3545] bg-[#12151b] p-5 rounded-xl flex flex-col justify-between space-y-5 transition-all shadow-sm group"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={logo}
                          alt={rest.name}
                          className="w-12 h-12 rounded-lg object-cover border border-[#2d3545] shrink-0"
                        />
                        <div className="space-y-0.5">
                          <h3 className="font-bold text-white text-base tracking-tight group-hover:text-[#f97316] transition-colors font-display">
                            {rest.name}
                          </h3>
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-500" />
                            <span>{rest.businessType || rest.cuisine || 'Casual Dining'}</span>
                          </p>
                        </div>
                      </div>

                      {/* Status Tag */}
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0 ${
                          isApproved
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : isPending
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : isRejected
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {isApproved ? 'Live' : isPending ? 'Under Review' : isRejected ? 'Action Required' : 'Archived'}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#0b0d11] border border-[#1e232e] text-xs space-y-1.5 text-slate-300">
                      <div className="flex items-center gap-1.5 text-slate-400 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{rest.address || 'Address N/A'}{rest.city ? `, ${rest.city}` : ''}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#1e232e]">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Grid className="w-3 h-3 text-slate-400" /> Dining Tables
                        </span>
                        <span className="font-semibold text-slate-300 font-mono">
                          {rest.tablesCount || rest.indoorTablesCount || 10} Tables
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Primary Action Button */}
                  <div>
                    {isApproved ? (
                      <button
                        disabled={openingRestId === rest.id}
                        onClick={() => handleSelectRestaurant(rest)}
                        className="w-full text-xs font-bold py-2.5 rounded-lg bg-[#1a1e27] hover:bg-[#222734] border border-[#2d3545] hover:border-[#f97316] text-white transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        {openingRestId === rest.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <span>Open Workspace</span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#f97316]" />
                          </>
                        )}
                      </button>
                    ) : isPending ? (
                      <button
                        disabled={openingRestId === rest.id}
                        onClick={() => handleSelectRestaurant(rest)}
                        className="w-full text-xs font-semibold py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Review Status</span>
                      </button>
                    ) : isRejected ? (
                      <button
                        disabled={openingRestId === rest.id}
                        onClick={() => handleSelectRestaurant(rest)}
                        className="w-full text-xs font-semibold py-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                        <span>View Reason & Resubmit</span>
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full text-xs py-2.5 rounded-lg border border-[#1e232e] text-slate-600 cursor-not-allowed"
                      >
                        {isArchived ? 'Archived Outlet' : 'Access Suspended'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Create New Restaurant Card */}
            <div
              onClick={onCreateNewRestaurant}
              className="border border-dashed border-[#2d3545] hover:border-[#f97316] p-6 rounded-xl flex flex-col items-center justify-center text-center space-y-3 cursor-pointer transition-all bg-[#0b0d11]/40 hover:bg-[#12151b] group min-h-[220px]"
            >
              <div className="w-11 h-11 rounded-lg bg-[#1a1e27] border border-[#2d3545] flex items-center justify-center text-slate-400 group-hover:text-[#f97316] group-hover:border-[#f97316] transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-white text-sm group-hover:text-[#f97316] transition-colors font-display">
                  Onboard another restaurant
                </h3>
                <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                  Add another bistro, bar, cloud kitchen, or cafe outlet to your portfolio.
                </p>
              </div>
              <span className="text-xs font-semibold text-[#f97316] inline-flex items-center gap-1 pt-1 group-hover:translate-x-0.5 transition-transform">
                Start setup wizard →
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-[#1e232e] py-6 px-4 text-center text-xs text-slate-600">
        Dinely Restaurant Operating System • Enterprise Multi-Tenant Architecture
      </footer>
    </div>
  );
};
