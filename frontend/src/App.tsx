import React, { useState, useEffect } from 'react';
import { LandingWebsite } from './apps/landing/LandingWebsite';
import { PlatformApp } from './apps/platform/PlatformApp';
import { RestaurantApp } from './apps/restaurant/RestaurantApp';
import { CustomerApp } from './apps/customer/CustomerApp';
import { WaiterTerminalOS } from './apps/waiter/WaiterTerminalOS';
import { KitchenETADashboard } from './apps/restaurant/KitchenETADashboard';
import { BarTerminal } from './apps/bar/BarTerminal';
import { AuthPage } from './apps/auth/AuthPage';
import { RoleLoginPage, PortalType } from './apps/auth/RoleLoginPage';
import { UnauthorizedPage } from './apps/auth/UnauthorizedPage';
import { SetupWizard } from './apps/onboarding/SetupWizard';
import { PendingApprovalPage } from './apps/onboarding/PendingApprovalPage';
import { WorkspaceSelector } from './apps/onboarding/WorkspaceSelector';
import { ThemeProvider } from './packages/theme/ThemeEngine';
import { ErrorBoundary, DinelyLogo } from './packages/ui';
import { api } from './packages/api/client';
import {
  Building2,
  Utensils,
  Smartphone,
  ChefHat,
  PhoneCall,
  Wine,
  Globe,
  LogOut,
  ShieldAlert,
} from 'lucide-react';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname || '/');
  const [currentUser, setCurrentUser] = useState<any>(() => api.getCurrentUser());
  const [activeOwnerData, setActiveOwnerData] = useState<any>(null);
  const [showDomainBar, setShowDomainBar] = useState(true);
  const [kitchenOrders, setKitchenOrders] = useState<any[]>([]);

  const [currentRestaurant, setCurrentRestaurant] = useState<any>(null);

  useEffect(() => {
    api.getRestaurantDetails().then((r) => setCurrentRestaurant(r));
  }, [currentPath, currentUser]);

  // Sync state with browser location & popstate
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname || '/';
      setCurrentPath(path);
      setCurrentUser(api.getCurrentUser());
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    setCurrentUser(api.getCurrentUser());
  };

  const handleLogout = async (redirectLoginPath: string = '/restaurant/login') => {
    await api.logout();
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
    return allowedRoles.includes(currentUser.role);
  };

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
          {/* Sleek Subdomain & Environment Switcher Bar */}
          {showDomainBar ? (
            <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-2 sticky top-0 z-50 flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigateTo('/')}>
                <DinelyLogo size="sm" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse hidden sm:inline-block" />
              </div>

              {/* Core Domain Switcher Pills */}
              <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80 overflow-x-auto scrollbar-none no-scrollbar">
                <button
                  onClick={() => navigateTo('/')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    currentPath === '/' || currentPath === '/landing'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Main Website</span>
                </button>

                <div className="h-4 w-[1px] bg-slate-800 mx-1 hidden md:block" />

                <button
                  onClick={() => navigateTo(currentUser ? '/kitchen/dashboard' : '/kitchen/login')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    currentPath.startsWith('/kitchen')
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                  <span>Kitchen KDS</span>
                </button>

                {(currentRestaurant?.hasTables !== false && currentRestaurant?.hasWaiter !== false) && (
                  <button
                    onClick={() => navigateTo(currentUser ? '/waiter' : '/waiter/login')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      currentPath.startsWith('/waiter')
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Waiter Terminal</span>
                  </button>
                )}

                {(currentRestaurant?.hasBar !== false && (currentRestaurant?.hasBar === true || currentRestaurant?.businessType === 'BAR')) && (
                  <button
                    onClick={() => navigateTo(currentUser ? '/bar/dashboard' : '/bar/login')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                      currentPath.startsWith('/bar')
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Wine className="w-3.5 h-3.5 text-sky-400" />
                    <span>Bar Terminal</span>
                  </button>
                )}

                <div className="h-4 w-[1px] bg-slate-800 mx-1 hidden md:block" />

                <button
                  onClick={() => navigateTo(currentUser ? '/workspace' : '/restaurant/login')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    currentPath.startsWith('/restaurant') || currentPath === '/workspace'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5 text-rose-400" />
                  <span>Owner OS</span>
                </button>

                <button
                  onClick={() => navigateTo(currentUser ? '/admin/dashboard' : '/admin/login')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    currentPath.startsWith('/admin')
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Platform Admin</span>
                </button>

                <div className="h-4 w-[1px] bg-slate-800 mx-1 hidden md:block" />

                <button
                  onClick={() => navigateTo('/customer')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    currentPath === '/customer' || currentPath === '/order'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Customer App</span>
                </button>
              </div>

              {/* Active User Badge & Explicit Logout / Login Control */}
              <div className="flex items-center gap-2">
                {currentUser ? (
                  <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <div className="hidden sm:block text-[11px] leading-tight">
                      <p className="font-bold text-white max-w-[120px] truncate">{currentUser.name || currentUser.email}</p>
                      <p className="text-[9px] text-slate-400 font-mono uppercase">{currentUser.role || 'LOGGED IN'}</p>
                    </div>
                    <button
                      onClick={() => handleLogout('/restaurant/login')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                      title="Explicitly sign out of active session"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Log Out</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => navigateTo('/restaurant/login')}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-all cursor-pointer"
                  >
                    <span>Log In</span>
                  </button>
                )}

                <button
                  onClick={() => setShowDomainBar(false)}
                  className="text-[11px] text-slate-500 hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-900 transition-colors hidden md:block"
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
                onLoginSuccess={(_, user) => setCurrentUser(user)}
              />
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
                  const updated = await api.getRestaurantDetails(rest.id);
                  setCurrentRestaurant(updated);
                  const isApproved = updated?.isApproved || updated?.lifecycleStatus === 'APPROVED' || updated?.lifecycleStatus === 'LIVE' || updated?.lifecycleStatus === 'ACTIVE';
                  if (isApproved) {
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

            {/* Customer Ordering Mobile Web App */}
            {(currentPath === '/customer' || currentPath === '/order') && <CustomerApp />}
          </div>
        </div>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
