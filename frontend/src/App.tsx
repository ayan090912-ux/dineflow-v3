import React, { useState, useEffect } from 'react';
import { LandingWebsite } from './apps/landing/LandingWebsite';
import { PlatformApp } from './apps/platform/PlatformApp';
import { RestaurantApp } from './apps/restaurant/RestaurantApp';
import { CustomerApp } from './apps/customer/CustomerApp';
import { WaiterTerminalOS } from './apps/waiter/WaiterTerminalOS';
import { KitchenETADashboard } from './apps/restaurant/KitchenETADashboard';
import { BarTerminal } from './apps/bar/BarTerminal';
import { InventoryTerminalOS } from './apps/inventory/InventoryTerminalOS';
import { RestaurantOperationsCenter } from './apps/operations/RestaurantOperationsCenter';
import { AuthPage } from './apps/auth/AuthPage';
import { RoleLoginPage, PortalType } from './apps/auth/RoleLoginPage';
import { UnauthorizedPage } from './apps/auth/UnauthorizedPage';
import { SetupWizard } from './apps/onboarding/SetupWizard';
import { PendingApprovalPage } from './apps/onboarding/PendingApprovalPage';
import { WorkspaceSelector } from './apps/onboarding/WorkspaceSelector';
import { ThemeProvider } from './packages/theme/ThemeEngine';
import { ErrorBoundary, DinelyLogo } from './packages/ui';
import { api, getPortalScopeFromPath } from './packages/api/client';
import { realtimeBus } from './packages/api/realtime';
import {
  Activity,
  Building2,
  Utensils,
  Smartphone,
  ChefHat,
  PhoneCall,
  Wine,
  Package,
  Globe,
  LogOut,
  ShieldAlert,
} from 'lucide-react';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname || '/');
  const [currentUser, setCurrentUser] = useState<any>(() => api.getCurrentUser(getPortalScopeFromPath(window.location.pathname)));
  const [activeOwnerData, setActiveOwnerData] = useState<any>(null);
  const [showDomainBar, setShowDomainBar] = useState(true);
  const [kitchenOrders, setKitchenOrders] = useState<any[]>([]);

  const [currentRestaurant, setCurrentRestaurant] = useState<any>(null);

  const cleanPath = (currentPath || '/').split('?')[0];

  useEffect(() => {
    api.getRestaurantDetails().then((r) => setCurrentRestaurant(r));

    const unsubscribe = realtimeBus.subscribe((event) => {
      if (event.type === 'RestaurantSwitched' || event.type === 'RESTAURANT_APPROVED') {
        const restId = (event as any).restaurantId || api.getCurrentRestaurantId();
        api.getRestaurantDetails(restId).then((r) => {
          if (r) setCurrentRestaurant(r);
        });
      }
    });

    return () => unsubscribe();
  }, [currentPath, currentUser]);

  // Sync state with browser location & popstate
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname || '/';
      setCurrentPath(path);
      setCurrentUser(api.getCurrentUser(getPortalScopeFromPath(path)));
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    setCurrentUser(api.getCurrentUser(getPortalScopeFromPath(path)));
  };

  const handleLogout = async (redirectLoginPath: string = '/restaurant/login') => {
    const activeScope = getPortalScopeFromPath(currentPath);
    await api.logout(activeScope);
    setCurrentUser(null);
    navigateTo(redirectLoginPath);
  };

  // Load orders for kitchen view
  useEffect(() => {
    if (currentPath === '/kitchen/dashboard') {
      const restId = api.getCurrentRestaurantId() || currentUser?.restaurantId || undefined;
      api.getOrders(restId).then((o) => setKitchenOrders(o));
    }
  }, [currentPath, currentUser]);

  // Helper to check role authorization
  const checkRoleAccess = (allowedRoles: string[]) => {
    if (!currentUser) return false;
    if (allowedRoles.includes('PLATFORM_ADMIN')) {
      return (
        (currentUser.role === 'PLATFORM_ADMIN' || currentUser.role === 'SUPER_ADMIN') &&
        currentUser.email?.toLowerCase() === 'ayan090912@gmail.com'
      );
    }
    // Super admin & Restaurant owner & Manager have full operational access to all restaurant terminals
    if (
      currentUser.role === 'SUPER_ADMIN' ||
      currentUser.role === 'RESTAURANT_OWNER' ||
      (currentUser.role as string) === 'MANAGER'
    ) {
      return true;
    }
    return allowedRoles.includes(currentUser.role);
  };

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
          {/* Enterprise Role & Environment Navigation Header */}
          {showDomainBar && !currentPath.startsWith('/customer') && !currentPath.startsWith('/order') ? (
            <header className="bg-slate-900 border-b border-slate-800/80 px-4 py-2 sticky top-0 z-50 flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigateTo('/')}>
                <DinelyLogo size="sm" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 hidden sm:inline-block" />
              </div>

              {/* Core Navigation Switcher Controls */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/90 overflow-x-auto scrollbar-none no-scrollbar">
                <button
                  onClick={() => navigateTo('/')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    currentPath === '/' || currentPath === '/landing'
                      ? 'bg-slate-800 text-slate-100 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Main Website</span>
                </button>

                <button
                  onClick={() => navigateTo(currentUser ? '/operations' : '/restaurant/login')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    currentPath.startsWith('/operations')
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 text-rose-400" />
                  <span>Operations Center</span>
                </button>

                <div className="h-3.5 w-[1px] bg-slate-800/80 mx-1 hidden md:block" />

                <button
                  onClick={() => navigateTo(currentUser ? '/kitchen/dashboard' : '/kitchen/login')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    currentPath.startsWith('/kitchen')
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                  <span>Kitchen KDS</span>
                </button>

                {(currentRestaurant?.hasTables !== false && currentRestaurant?.hasWaiter !== false) && (
                  <button
                    onClick={() => navigateTo(currentUser ? '/waiter' : '/waiter/login')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      currentPath.startsWith('/waiter')
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Waiter Terminal</span>
                  </button>
                )}

                {(currentRestaurant?.hasBar !== false && (currentRestaurant?.hasBar === true || currentRestaurant?.businessType === 'BAR')) && (
                  <button
                    onClick={() => navigateTo(currentUser ? '/bar/dashboard' : '/bar/login')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      currentPath.startsWith('/bar')
                        ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    <Wine className="w-3.5 h-3.5 text-sky-400" />
                    <span>Bar Terminal</span>
                  </button>
                )}

                <button
                  onClick={() => navigateTo(currentUser ? '/inventory/terminal' : '/inventory/login')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    currentPath.startsWith('/inventory')
                      ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 text-rose-400" />
                  <span>Inventory OS</span>
                </button>

                <div className="h-3.5 w-[1px] bg-slate-800/80 mx-1 hidden md:block" />

                <button
                  onClick={() => navigateTo(currentUser ? '/workspace' : '/restaurant/login')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    currentPath.startsWith('/restaurant') || currentPath === '/workspace'
                      ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Owner OS</span>
                </button>

                <button
                  onClick={() => navigateTo(currentUser ? '/admin/dashboard' : '/admin/login')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    currentPath.startsWith('/admin')
                      ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>Platform Admin</span>
                </button>

                <div className="h-3.5 w-[1px] bg-slate-800/80 mx-1 hidden md:block" />

                <button
                  onClick={() => navigateTo('/customer')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    currentPath === '/customer' || currentPath === '/order'
                      ? 'bg-slate-800 text-slate-100 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5 text-slate-300" />
                  <span>Customer App</span>
                </button>
              </div>

              {/* Active User Badge & Session Control */}
              <div className="flex items-center gap-2 shrink-0">
                {currentUser ? (
                  <div className="flex items-center gap-2.5 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <div className="hidden sm:block text-[11px] leading-tight">
                      <p className="font-semibold text-slate-100 max-w-[120px] truncate">{currentUser.name || currentUser.email}</p>
                      <p className="text-[9px] text-slate-400 font-mono uppercase tracking-wide">{currentUser.role || 'ACTIVE SESSION'}</p>
                    </div>
                    <button
                      onClick={() => handleLogout('/restaurant/login')}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                      title="Explicitly sign out of active session"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Log Out</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => navigateTo('/restaurant/login')}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors cursor-pointer"
                  >
                    <span>Log In</span>
                  </button>
                )}

                <button
                  onClick={() => setShowDomainBar(false)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800 transition-colors hidden md:block"
                  title="Hide domain switcher bar"
                >
                  Hide Bar ✕
                </button>
              </div>
            </header>
          ) : (
            <button
              onClick={() => setShowDomainBar(true)}
              className="fixed top-2 right-2 z-50 bg-slate-900/90 text-slate-400 hover:text-white text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-800 shadow-xl"
            >
              Switch Domain 🌐
            </button>
          )}

          {/* Dynamic App & Router Render */}
          <div className="flex-1">
            {/* Landing Web Page */}
            {(currentPath === '/' || currentPath === '/landing') && (
              <LandingWebsite
                onStartTrial={(ownerData) => {
                  if (ownerData) setActiveOwnerData(ownerData);
                  navigateTo('/wizard?mode=create');
                }}
                onLogin={() => navigateTo('/restaurant/login')}
                onOpenApp={(app) => {
                  if (app === 'platform') navigateTo('/admin/login');
                  else if (app === 'waiter') navigateTo('/waiter/login');
                  else if (app === 'customer') navigateTo('/customer');
                  else navigateTo('/restaurant/login');
                }}
              />
            )}

            {/* Dedicated Login Portals */}
            {currentPath === '/admin/login' && (
              <RoleLoginPage
                portal="admin"
                onNavigate={navigateTo}
                onLoginSuccess={(_, user) => setCurrentUser(user)}
              />
            )}

            {currentPath === '/restaurant/login' && (
              <RoleLoginPage
                portal="restaurant"
                onNavigate={navigateTo}
                onLoginSuccess={(_, user) => setCurrentUser(user)}
              />
            )}

            {currentPath === '/kitchen/login' && (
              <RoleLoginPage
                portal="kitchen"
                onNavigate={navigateTo}
                onLoginSuccess={(_, user) => setCurrentUser(user)}
              />
            )}

            {currentPath === '/bar/login' && (
              <RoleLoginPage
                portal="bar"
                onNavigate={navigateTo}
                onLoginSuccess={(_, user) => setCurrentUser(user)}
              />
            )}

            {currentPath === '/waiter/login' && (
              <RoleLoginPage
                portal="waiter"
                onNavigate={navigateTo}
                onLoginSuccess={(_, user) => {
                  setCurrentUser(user);
                  navigateTo('/waiter');
                }}
              />
            )}

            {currentPath === '/inventory/login' && (
              <RoleLoginPage
                portal="inventory"
                onNavigate={navigateTo}
                onLoginSuccess={(_, user) => {
                  setCurrentUser(user);
                  navigateTo('/inventory/terminal');
                }}
              />
            )}

            {(currentPath === '/inventory/terminal' || currentPath === '/inventory/dashboard' || currentPath === '/inventory') && (
              checkRoleAccess(['INVENTORY_MANAGER', 'MANAGER', 'RESTAURANT_OWNER', 'SUPER_ADMIN']) ? (
                <InventoryTerminalOS
                  onLogout={() => handleLogout('/inventory/login')}
                  activeRestaurantId={currentRestaurant?.id}
                />
              ) : currentUser ? (
                <UnauthorizedPage
                  requiredRole="INVENTORY MANAGER / OWNER"
                  userRole={currentUser?.role}
                  userEmail={currentUser?.email}
                  targetPath="/inventory/terminal"
                  onNavigate={navigateTo}
                />
              ) : (
                <RoleLoginPage
                  portal="inventory"
                  onNavigate={navigateTo}
                  onLoginSuccess={(_, user) => {
                    setCurrentUser(user);
                    navigateTo('/inventory/terminal');
                  }}
                />
              )
            )}

            {/* Dashboards with Role-Based Access Control (RBAC) */}
            {currentPath === '/admin/dashboard' && (
              checkRoleAccess(['PLATFORM_ADMIN', 'SUPER_ADMIN']) ? (
                <PlatformApp onLogout={() => handleLogout('/admin/login')} />
              ) : currentUser ? (
                <UnauthorizedPage
                  requiredRole="PLATFORM_ADMIN"
                  userRole={currentUser?.role}
                  userEmail={currentUser?.email}
                  targetPath="/admin/dashboard"
                  onNavigate={navigateTo}
                />
              ) : (
                <RoleLoginPage
                  portal="admin"
                  onNavigate={navigateTo}
                  onLoginSuccess={(_, user) => {
                    setCurrentUser(user);
                    navigateTo('/admin/dashboard');
                  }}
                />
              )
            )}

            {/* Unified Restaurant Operations Center (Primary Commercial Operations Screen) */}
            {(currentPath === '/operations' || currentPath === '/operations/dashboard' || currentPath === '/operations/center') && (
              checkRoleAccess(['RESTAURANT_OWNER', 'MANAGER', 'CHEF', 'WAITER', 'BARTENDER', 'BAR_STAFF', 'INVENTORY_MANAGER', 'SUPER_ADMIN']) ? (
                (currentRestaurant && !currentRestaurant.isApproved && currentRestaurant.lifecycleStatus !== 'APPROVED' && currentRestaurant.lifecycleStatus !== 'LIVE' && currentRestaurant.lifecycleStatus !== 'ACTIVE' && currentUser?.role !== 'SUPER_ADMIN') ? (
                  <PendingApprovalPage
                    onNavigate={navigateTo}
                    onLogout={() => handleLogout('/restaurant/login')}
                  />
                ) : (
                  <RestaurantOperationsCenter
                    onLogout={() => handleLogout('/restaurant/login')}
                    onNavigate={navigateTo}
                  />
                )
              ) : currentUser ? (
                <UnauthorizedPage
                  requiredRole="RESTAURANT STAFF / OWNER"
                  userRole={currentUser?.role}
                  userEmail={currentUser?.email}
                  targetPath="/operations"
                  onNavigate={navigateTo}
                />
              ) : (
                <RoleLoginPage
                  portal="restaurant"
                  onNavigate={navigateTo}
                  onLoginSuccess={(_, user) => {
                    setCurrentUser(user);
                    navigateTo('/operations');
                  }}
                />
              )
            )}

            {/* Operational Dashboards with Strict Approval Guard */}
            {(currentPath === '/restaurant/dashboard' || currentPath === '/owner') && (
              checkRoleAccess(['RESTAURANT_OWNER', 'MANAGER', 'SUPER_ADMIN']) ? (
                (currentRestaurant && !currentRestaurant.isApproved && currentRestaurant.lifecycleStatus !== 'APPROVED' && currentRestaurant.lifecycleStatus !== 'LIVE' && currentRestaurant.lifecycleStatus !== 'ACTIVE' && currentUser?.role !== 'SUPER_ADMIN') ? (
                  <PendingApprovalPage
                    onNavigate={navigateTo}
                    onLogout={() => handleLogout('/restaurant/login')}
                  />
                ) : (
                  <RestaurantApp
                    onEditSetup={() => navigateTo('/wizard')}
                    onLogout={() => handleLogout('/restaurant/login')}
                  />
                )
              ) : currentUser ? (
                <UnauthorizedPage
                  requiredRole="RESTAURANT_OWNER"
                  userRole={currentUser?.role}
                  userEmail={currentUser?.email}
                  targetPath="/restaurant/dashboard"
                  onNavigate={navigateTo}
                />
              ) : (
                <RoleLoginPage
                  portal="restaurant"
                  onNavigate={navigateTo}
                  onLoginSuccess={(_, user) => {
                    setCurrentUser(user);
                    navigateTo('/workspace');
                  }}
                />
              )
            )}

            {(currentPath === '/workspace' || currentPath === '/restaurant/select') && (
              <WorkspaceSelector
                user={currentUser}
                onSelectRestaurant={async (rest) => {
                  await api.switchActiveRestaurant(rest.id);
                  const updated = (await api.getRestaurantDetails(rest.id)) || rest;
                  setCurrentRestaurant(updated);
                  const isAppr = rest.isApproved !== false || updated?.isApproved !== false || updated?.lifecycleStatus === 'APPROVED' || updated?.lifecycleStatus === 'LIVE' || updated?.lifecycleStatus === 'ACTIVE';
                  if (isAppr) {
                    navigateTo('/restaurant/dashboard');
                  } else {
                    navigateTo('/restaurant/pending-approval');
                  }
                }}
                onCreateNewRestaurant={() => navigateTo('/wizard?mode=create')}
                onLogout={() => handleLogout('/restaurant/login')}
              />
            )}

            {currentPath === '/restaurant/pending-approval' && (
              <PendingApprovalPage
                onNavigate={navigateTo}
                onLogout={() => handleLogout('/restaurant/login')}
              />
            )}

            {currentPath === '/kitchen/dashboard' && (
              checkRoleAccess(['CHEF', 'MANAGER', 'RESTAURANT_OWNER', 'SUPER_ADMIN']) ? (
                (currentRestaurant && !currentRestaurant.isApproved && currentRestaurant.lifecycleStatus !== 'APPROVED' && currentRestaurant.lifecycleStatus !== 'LIVE' && currentRestaurant.lifecycleStatus !== 'ACTIVE' && currentUser?.role !== 'SUPER_ADMIN') ? (
                  <PendingApprovalPage
                    onNavigate={navigateTo}
                    onLogout={() => handleLogout('/kitchen/login')}
                  />
                ) : (
                  <KitchenETADashboard
                    orders={kitchenOrders}
                    onRefreshOrders={() => {
                      const restId = api.getCurrentRestaurantId() || currentUser?.restaurantId || undefined;
                      api.getOrders(restId).then(setKitchenOrders);
                    }}
                    onLogout={() => handleLogout('/kitchen/login')}
                  />
                )
              ) : currentUser ? (
                <UnauthorizedPage
                  requiredRole="CHEF / KITCHEN STAFF"
                  userRole={currentUser?.role}
                  userEmail={currentUser?.email}
                  targetPath="/kitchen/dashboard"
                  onNavigate={navigateTo}
                />
              ) : (
                <RoleLoginPage
                  portal="kitchen"
                  onNavigate={navigateTo}
                  onLoginSuccess={(_, user) => {
                    setCurrentUser(user);
                    navigateTo('/kitchen/dashboard');
                  }}
                />
              )
            )}

            {currentPath === '/bar/dashboard' && (
              checkRoleAccess(['BARTENDER', 'BAR_STAFF', 'CHEF', 'MANAGER', 'RESTAURANT_OWNER', 'SUPER_ADMIN']) ? (
                (currentRestaurant && !currentRestaurant.isApproved && currentRestaurant.lifecycleStatus !== 'APPROVED' && currentRestaurant.lifecycleStatus !== 'LIVE' && currentRestaurant.lifecycleStatus !== 'ACTIVE' && currentUser?.role !== 'SUPER_ADMIN') ? (
                  <PendingApprovalPage
                    onNavigate={navigateTo}
                    onLogout={() => handleLogout('/bar/login')}
                  />
                ) : (
                  <BarTerminal onLogout={() => handleLogout('/bar/login')} />
                )
              ) : currentUser ? (
                <UnauthorizedPage
                  requiredRole="BARTENDER / BAR STAFF"
                  userRole={currentUser?.role}
                  userEmail={currentUser?.email}
                  targetPath="/bar/dashboard"
                  onNavigate={navigateTo}
                />
              ) : (
                <RoleLoginPage
                  portal="bar"
                  onNavigate={navigateTo}
                  onLoginSuccess={(_, user) => {
                    setCurrentUser(user);
                    navigateTo('/bar/dashboard');
                  }}
                />
              )
            )}


            {(currentPath === '/waiter' || currentPath === '/waiter/dashboard') && (
              (currentRestaurant?.hasTables !== false && currentRestaurant?.hasWaiter !== false) ? (
                checkRoleAccess(['WAITER', 'HOST', 'CASHIER', 'BARTENDER', 'MANAGER', 'RESTAURANT_OWNER', 'SUPER_ADMIN']) ? (
                  (currentRestaurant && !currentRestaurant.isApproved && currentRestaurant.lifecycleStatus !== 'APPROVED' && currentRestaurant.lifecycleStatus !== 'LIVE' && currentRestaurant.lifecycleStatus !== 'ACTIVE' && currentUser?.role !== 'SUPER_ADMIN') ? (
                    <PendingApprovalPage
                      onNavigate={navigateTo}
                      onLogout={() => handleLogout('/waiter/login')}
                    />
                  ) : (
                    <WaiterTerminalOS onLogout={() => handleLogout('/waiter/login')} />
                  )
                ) : currentUser ? (
                  <UnauthorizedPage
                    requiredRole="WAITER / FLOOR STAFF"
                    userRole={currentUser?.role}
                    userEmail={currentUser?.email}
                    targetPath="/waiter"
                    onNavigate={navigateTo}
                  />
                ) : (
                  <RoleLoginPage
                    portal="waiter"
                    onNavigate={navigateTo}
                    onLoginSuccess={(_, user) => {
                      setCurrentUser(user);
                      navigateTo('/waiter');
                    }}
                  />
                )
              ) : (
                <UnauthorizedPage
                  requiredRole="WAITER & TABLE MODULE (Disabled for Tableless Venues)"
                  userRole={currentUser?.role}
                  userEmail={currentUser?.email}
                  targetPath="/waiter"
                  onNavigate={navigateTo}
                />
              )
            )}

            {/* Setup Wizard */}
            {(currentPath === '/wizard' || currentPath === '/create-restaurant' || currentPath === '/restaurant-setup') && (
              <SetupWizard
                initialOwnerData={activeOwnerData}
                onNavigate={navigateTo}
                onFinishSetup={(setupData) => {
                  setActiveOwnerData((prev: any) => ({ ...prev, ...setupData }));
                  navigateTo('/restaurant/pending-approval');
                }}
              />
            )}

            {/* Customer Ordering Mobile Web App - Deep Linking Support */}
            {(currentPath.startsWith('/customer') || currentPath.startsWith('/order') || currentPath.startsWith('/qr')) && <CustomerApp />}
          </div>
        </div>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
