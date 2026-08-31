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
import { NotFoundPage } from './apps/auth/NotFoundPage';
import { ModuleNotEnabledPage } from './apps/auth/ModuleNotEnabledPage';
import { SetupWizard } from './apps/onboarding/SetupWizard';
import { PendingApprovalPage } from './apps/onboarding/PendingApprovalPage';
import { WorkspaceSelector } from './apps/onboarding/WorkspaceSelector';
import { ThemeProvider } from './packages/theme/ThemeEngine';
import { ErrorBoundary } from './packages/ui';
import { api, getPortalScopeFromPath } from './packages/api/client';
import { realtimeBus } from './packages/api/realtime';
import { canAccessWorkspace, isModuleEnabled, WorkspaceType, Restaurant } from './packages/types';
import { navigate } from './packages/router';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname || '/');
  const [currentUser, setCurrentUser] = useState<any>(() => api.getCurrentUser(getPortalScopeFromPath(window.location.pathname)));
  const [activeOwnerData, setActiveOwnerData] = useState<any>(null);
  const [kitchenOrders, setKitchenOrders] = useState<any[]>([]);
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    api.getRestaurantDetails().then((r) => {
      if (r) setCurrentRestaurant(r);
    });

    const unsubscribe = realtimeBus.subscribe((event) => {
      if (event.type === 'RestaurantSwitched' || event.type === 'RESTAURANT_APPROVED' || event.type === 'WorkspaceConfigUpdated') {
        const restId = (event as any).restaurantId || api.getCurrentRestaurantId();
        api.getRestaurantDetails(restId).then((r) => {
          if (r) setCurrentRestaurant(r);
        });
      }
    });

    return () => unsubscribe();
  }, [currentPath, currentUser]);

  // Sync state with browser location, popstate, pushState, and custom SPA navigation events
  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname || '/';
      setCurrentPath(path);
      setCurrentUser(api.getCurrentUser(getPortalScopeFromPath(path)));
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('dinely_navigate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('dinely_navigate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigateTo = (path: string) => {
    navigate(path);
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
    if (currentPath === '/kitchen/dashboard' || currentPath.startsWith('/kitchen')) {
      const restId = api.getCurrentRestaurantId() || currentUser?.restaurantId || undefined;
      api.getOrders(restId).then((o) => setKitchenOrders(o));
    }
  }, [currentPath, currentUser]);

  // Canonical workspace authorization decision engine
  const checkWorkspaceAccess = (workspace: WorkspaceType | string) => {
    return canAccessWorkspace(currentUser, workspace);
  };

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
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
                  if (app === 'restaurant') navigateTo('/restaurant/login');
                  else if (app === 'waiter') navigateTo('/waiter/login');
                  else if (app === 'customer') navigateTo('/customer');
                }}
                onNavigate={navigateTo}
              />
            )}

            {/* Dedicated Login Portals */}
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

            {/* Inventory Terminal OS Route */}
            {(currentPath === '/inventory/terminal' || currentPath === '/inventory/dashboard' || currentPath === '/inventory') && (
              !isModuleEnabled(currentRestaurant, 'inventory') ? (
                <ModuleNotEnabledPage
                  moduleName="Inventory OS"
                  restaurant={currentRestaurant}
                  onNavigate={navigateTo}
                />
              ) : checkWorkspaceAccess('inventory') ? (
                <InventoryTerminalOS
                  onLogout={() => handleLogout('/inventory/login')}
                  activeRestaurantId={currentRestaurant?.id}
                />
              ) : currentUser ? (
                <NotFoundPage onNavigate={navigateTo} />
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

            {/* Platform Admin Control Plane (Strictly isolated private internal system) */}
            {currentPath.startsWith('/admin') && (
              checkWorkspaceAccess('admin') ? (
                <PlatformApp onLogout={() => handleLogout('/')} />
              ) : (
                <NotFoundPage onNavigate={navigateTo} />
              )
            )}

            {/* Operations Center Screen */}
            {(currentPath === '/operations' || currentPath === '/operations/dashboard' || currentPath === '/operations/center') && (
              checkWorkspaceAccess('operations') ? (
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
                <NotFoundPage onNavigate={navigateTo} />
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

            {/* Owner OS / Restaurant Dashboard */}
            {(currentPath === '/restaurant/dashboard' || currentPath === '/owner' || currentPath === '/restaurant') && (
              checkWorkspaceAccess('restaurant') ? (
                (currentRestaurant && !currentRestaurant.isApproved && currentRestaurant.lifecycleStatus !== 'APPROVED' && currentRestaurant.lifecycleStatus !== 'LIVE' && currentRestaurant.lifecycleStatus !== 'ACTIVE' && currentUser?.role !== 'SUPER_ADMIN') ? (
                  <PendingApprovalPage
                    onNavigate={navigateTo}
                    onLogout={() => handleLogout('/restaurant/login')}
                  />
                ) : (
                  <RestaurantApp
                    onEditSetup={() => navigateTo('/wizard')}
                    onLogout={() => handleLogout('/restaurant/login')}
                    onNavigate={navigateTo}
                  />
                )
              ) : currentUser ? (
                <NotFoundPage onNavigate={navigateTo} />
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

            {/* Workspace / Multi-Outlet Selector */}
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

            {/* Kitchen KDS Terminal Route */}
            {(currentPath === '/kitchen/dashboard' || currentPath === '/kitchen') && (
              !isModuleEnabled(currentRestaurant, 'kitchen') ? (
                <ModuleNotEnabledPage
                  moduleName="Kitchen Display System (KDS)"
                  restaurant={currentRestaurant}
                  onNavigate={navigateTo}
                />
              ) : checkWorkspaceAccess('kitchen') ? (
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
                <NotFoundPage onNavigate={navigateTo} />
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

            {/* Bar Terminal KDS Route */}
            {(currentPath === '/bar/dashboard' || currentPath === '/bar') && (
              !isModuleEnabled(currentRestaurant, 'bar') ? (
                <ModuleNotEnabledPage
                  moduleName="Bar Terminal KDS"
                  restaurant={currentRestaurant}
                  onNavigate={navigateTo}
                />
              ) : checkWorkspaceAccess('bar') ? (
                (currentRestaurant && !currentRestaurant.isApproved && currentRestaurant.lifecycleStatus !== 'APPROVED' && currentRestaurant.lifecycleStatus !== 'LIVE' && currentRestaurant.lifecycleStatus !== 'ACTIVE' && currentUser?.role !== 'SUPER_ADMIN') ? (
                  <PendingApprovalPage
                    onNavigate={navigateTo}
                    onLogout={() => handleLogout('/bar/login')}
                  />
                ) : (
                  <BarTerminal onLogout={() => handleLogout('/bar/login')} />
                )
              ) : currentUser ? (
                <NotFoundPage onNavigate={navigateTo} />
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

            {/* Waiter Terminal OS Route */}
            {(currentPath === '/waiter' || currentPath === '/waiter/dashboard') && (
              !isModuleEnabled(currentRestaurant, 'waiter') ? (
                <ModuleNotEnabledPage
                  moduleName="Waiter Terminal OS"
                  restaurant={currentRestaurant}
                  onNavigate={navigateTo}
                />
              ) : checkWorkspaceAccess('waiter') ? (
                (currentRestaurant && !currentRestaurant.isApproved && currentRestaurant.lifecycleStatus !== 'APPROVED' && currentRestaurant.lifecycleStatus !== 'LIVE' && currentRestaurant.lifecycleStatus !== 'ACTIVE' && currentUser?.role !== 'SUPER_ADMIN') ? (
                  <PendingApprovalPage
                    onNavigate={navigateTo}
                    onLogout={() => handleLogout('/waiter/login')}
                  />
                ) : (
                  <WaiterTerminalOS onLogout={() => handleLogout('/waiter/login')} />
                )
              ) : currentUser ? (
                <NotFoundPage onNavigate={navigateTo} />
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
