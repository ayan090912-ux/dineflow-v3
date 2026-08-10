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
import { ThemeProvider } from './packages/theme/ThemeEngine';
import { ErrorBoundary } from './packages/ui';
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
            <header className="bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-2 sticky top-0 z-50 flex items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-rose-600 to-amber-500 flex items-center justify-center font-black text-white text-[10px] shadow-sm">
                  DF
                </div>
                <span className="text-xs font-bold text-slate-300 hidden sm:inline-flex items-center gap-1.5">
                  DineFlow Cloud OS
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </span>
              </div>

              {/* Core Domain Switcher Pills */}
              <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 overflow-x-auto scrollbar-none no-scrollbar">
                <button
                  onClick={() => navigateTo('/')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    currentPath === '/' || currentPath === '/landing'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Main Website</span>
                </button>

                <div className="h-4 w-[1px] bg-slate-800 mx-1 hidden md:block" />
                <span className="text-[10px] font-mono text-amber-400 font-bold px-1.5 hidden md:block uppercase">Staff:</span>

                <button
                  onClick={() => navigateTo(currentUser ? '/kitchen/dashboard' : '/kitchen/login')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    currentPath.startsWith('/kitchen')
                      ? 'bg-amber-600 text-white shadow-sm'
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
                        ? 'bg-emerald-600 text-white shadow-sm'
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
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Wine className="w-3.5 h-3.5 text-purple-400" />
                    <span>Bar Terminal</span>
                  </button>
                )}

                <div className="h-4 w-[1px] bg-slate-800 mx-1 hidden md:block" />
                <span className="text-[10px] font-mono text-rose-400 font-bold px-1.5 hidden md:block uppercase">Management:</span>

                <button
                  onClick={() => navigateTo(currentUser ? '/restaurant/dashboard' : '/restaurant/login')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    currentPath.startsWith('/restaurant')
                      ? 'bg-rose-600 text-white shadow-sm'
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
                      ? 'bg-indigo-600 text-white shadow-sm'
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
                  <span>Customer Ordering</span>
                </button>
              </div>

              {/* Active User Badge & Explicit Logout / Login Control */}
              <div className="flex items-center gap-2">
                {currentUser ? (
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <div className="hidden sm:block text-[11px] leading-tight">
                      <p className="font-bold text-white max-w-[120px] truncate">{currentUser.name || currentUser.email}</p>
                      <p className="text-[9px] text-slate-400 font-mono uppercase">{currentUser.role || 'LOGGED IN'}</p>
                    </div>
                    <button
                      onClick={() => handleLogout('/restaurant/login')}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 transition-all cursor-pointer"
                      title="Explicitly sign out of active session"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Log Out</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => navigateTo('/restaurant/login')}
                    className="flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition-all cursor-pointer"
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
                  navigateTo('/wizard');
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

            {currentPath === '/restaurant/dashboard' && (
              checkRoleAccess(['RESTAURANT_OWNER', 'MANAGER', 'SUPER_ADMIN']) ? (
                currentRestaurant && !currentRestaurant.isApproved && currentUser?.role !== 'SUPER_ADMIN' ? (
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
                    navigateTo('/restaurant/dashboard');
                  }}
                />
              )
            )}

            {currentPath === '/restaurant/pending-approval' && (
              <PendingApprovalPage
                onNavigate={navigateTo}
                onLogout={() => handleLogout('/restaurant/login')}
              />
            )}

            {currentPath === '/kitchen/dashboard' && (
              checkRoleAccess(['CHEF', 'MANAGER', 'RESTAURANT_OWNER', 'SUPER_ADMIN']) ? (
                <KitchenETADashboard
                  orders={kitchenOrders}
                  onRefreshOrders={() => {
                    const restId = api.getCurrentRestaurantId() || currentUser?.restaurantId || undefined;
                    api.getOrders(restId).then(setKitchenOrders);
                  }}
                  onLogout={() => handleLogout('/kitchen/login')}
                />
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
                <BarTerminal onLogout={() => handleLogout('/bar/login')} />
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
                  <WaiterTerminalOS onLogout={() => handleLogout('/waiter/login')} />
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
            {currentPath === '/wizard' && (
              <SetupWizard
                initialOwnerData={activeOwnerData}
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
