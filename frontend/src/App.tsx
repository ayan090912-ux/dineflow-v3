import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
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
import { RoleLoginPage } from './apps/auth/RoleLoginPage';
import { NotFoundPage } from './apps/auth/NotFoundPage';
import { ModuleNotEnabledPage } from './apps/auth/ModuleNotEnabledPage';
import { SetupWizard } from './apps/onboarding/SetupWizard';
import { PendingApprovalPage } from './apps/onboarding/PendingApprovalPage';
import { WorkspaceSelector } from './apps/onboarding/WorkspaceSelector';
import { ThemeProvider } from './packages/theme/ThemeEngine';
import { ErrorBoundary, DinelyLogo } from './packages/ui';
import { api, getPortalScopeFromPath } from './packages/api/client';
import { realtimeBus } from './packages/api/realtime';
import { canAccessWorkspace, isModuleEnabled, WorkspaceType, Restaurant, User } from './packages/types';
import { navigate, getCleanPath, NavigationProvider } from './packages/router';
import { firebaseAuth } from './packages/auth/firebase';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '/';
  });
  const [cleanPath, setCleanPath] = useState<string>(() => {
    return typeof window !== 'undefined' ? getCleanPath(window.location.pathname) : '/';
  });

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const p = typeof window !== 'undefined' ? window.location.pathname : '/';
    return api.getCurrentUser(getPortalScopeFromPath(p));
  });

  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);
  const [activeOwnerData, setActiveOwnerData] = useState<any>(null);
  const [kitchenOrders, setKitchenOrders] = useState<any[]>([]);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Sync route and user on navigation events
  const syncLocation = useCallback(() => {
    if (typeof window === 'undefined') return;
    const full = (window.location.pathname || '/') + (window.location.search || '');
    const clean = getCleanPath(window.location.pathname);
    setCurrentPath(full);
    setCleanPath(clean);
    const scope = getPortalScopeFromPath(window.location.pathname);
    const user = api.getCurrentUser(scope);
    setCurrentUser(user);
  }, []);

  useEffect(() => {
    window.addEventListener('popstate', syncLocation);
    window.addEventListener('dinely_navigate', syncLocation);
    window.addEventListener('hashchange', syncLocation);

    return () => {
      window.removeEventListener('popstate', syncLocation);
      window.removeEventListener('dinely_navigate', syncLocation);
      window.removeEventListener('hashchange', syncLocation);
    };
  }, [syncLocation]);

  // Firebase Auth Observer: synchronizes Firebase state with application session
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (fbUser && fbUser.email) {
        const scope = getPortalScopeFromPath(window.location.pathname);
        let appUser = api.getCurrentUser(scope);
        if (!appUser) {
          appUser = {
            id: fbUser.uid,
            name: fbUser.displayName || fbUser.email.split('@')[0],
            email: fbUser.email.toLowerCase(),
            role: (scope === 'ADMIN' && fbUser.email.toLowerCase() === 'ayan090912@gmail.com') ? 'PLATFORM_ADMIN' : 'RESTAURANT_OWNER',
          };
          api.setCurrentUser(appUser, scope);
        }
        setCurrentUser(appUser);
      }
      setIsInitializing(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // Fetch active restaurant details when route, user, or scope changes
  useEffect(() => {
    let isMounted = true;
    const loadRestaurant = async () => {
      try {
        const rest = await api.getRestaurantDetails();
        if (isMounted && rest) {
          setCurrentRestaurant(rest);
        }
      } catch (err) {
        console.warn('[App] Could not load active restaurant details:', err);
      }
    };
    loadRestaurant();

    const unsubRealtime = realtimeBus.subscribe((event: any) => {
      if (
        event.type === 'RestaurantSwitched' ||
        event.type === 'RESTAURANT_APPROVED' ||
        event.type === 'WorkspaceConfigUpdated' ||
        event.type === 'RestaurantStatusUpdated'
      ) {
        const restId = event.restaurantId || event.restaurant_id || api.getCurrentRestaurantId();
        if (restId) {
          api.getRestaurantDetails(restId).then((r) => {
            if (isMounted && r) setCurrentRestaurant(r);
          });
        }
      }
    });

    return () => {
      isMounted = false;
      unsubRealtime();
    };
  }, [cleanPath, currentUser]);

  // Load orders for kitchen view when kitchen path is active
  useEffect(() => {
    let isMounted = true;
    if (cleanPath.startsWith('/kitchen')) {
      const restId = api.getCurrentRestaurantId() || currentUser?.restaurantId || undefined;
      api.getOrders(restId).then((o) => {
        if (isMounted) setKitchenOrders(o || []);
      }).catch(() => {
        if (isMounted) setKitchenOrders([]);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [cleanPath, currentUser]);

  const navigateTo = useCallback((path: string, options?: { replace?: boolean }) => {
    navigate(path, options);
    const clean = getCleanPath(path);
    setCurrentPath(path);
    setCleanPath(clean);
    const scope = getPortalScopeFromPath(path);
    const user = api.getCurrentUser(scope);
    setCurrentUser(user);
  }, []);

  const handleLogout = useCallback(async (redirectLoginPath: string = '/restaurant/login') => {
    const activeScope = getPortalScopeFromPath(cleanPath);
    await api.logout(activeScope);
    setCurrentUser(null);
    navigateTo(redirectLoginPath);
  }, [cleanPath, navigateTo]);

  // Canonical workspace authorization decision engine
  const checkWorkspaceAccess = useCallback((workspace: WorkspaceType | string) => {
    return canAccessWorkspace(currentUser, workspace);
  }, [currentUser]);

  // Main Route Dispatcher with Comprehensive State Handling
  const renderRoute = useMemo(() => {
    // 1. Landing Website & Public Marketing Pages
    if (
      cleanPath === '/' ||
      cleanPath === '/landing' ||
      cleanPath === '/home' ||
      cleanPath === '/about' ||
      cleanPath === '/pricing' ||
      cleanPath === '/contact' ||
      cleanPath === '/terms' ||
      cleanPath === '/privacy' ||
      cleanPath === '/features'
    ) {
      return (
        <LandingWebsite
          currentUser={currentUser}
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
          onLogout={() => handleLogout('/')}
        />
      );
    }

    // 2. Generic Auth / Login Redirects
    if (cleanPath === '/auth' || cleanPath === '/login' || cleanPath === '/signin') {
      return <AuthPage onNavigate={navigateTo} />;
    }

    // 3. Dedicated Terminal Login Portals
    if (cleanPath === '/restaurant/login' || cleanPath === '/owner/login' || cleanPath === '/manager/login') {
      return (
        <RoleLoginPage
          portal="restaurant"
          onNavigate={navigateTo}
          onLoginSuccess={async (_, user) => {
            setCurrentUser(user);
            try {
              const myRests = await api.getOwnerRestaurants(user?.email, user?.id);
              if (myRests.length === 0) {
                navigateTo('/wizard?mode=create');
              } else if (myRests.length === 1) {
                const onlyRest = myRests[0];
                await api.switchActiveRestaurant(onlyRest.id);
                setCurrentRestaurant(onlyRest);
                if (
                  onlyRest.isApproved !== false &&
                  onlyRest.lifecycleStatus !== 'PENDING_APPROVAL' &&
                  onlyRest.lifecycleStatus !== 'REJECTED'
                ) {
                  navigateTo('/restaurant/dashboard');
                } else {
                  navigateTo('/restaurant/pending-approval');
                }
              } else {
                navigateTo('/workspace');
              }
            } catch {
              navigateTo('/workspace');
            }
          }}
        />
      );
    }

    if (cleanPath === '/kitchen/login' || cleanPath === '/chef/login' || cleanPath === '/kds/login') {
      return (
        <RoleLoginPage
          portal="kitchen"
          onNavigate={navigateTo}
          onLoginSuccess={(_, user) => {
            setCurrentUser(user);
            navigateTo('/kitchen/dashboard');
          }}
        />
      );
    }

    if (cleanPath === '/bar/login' || cleanPath === '/bartender/login') {
      return (
        <RoleLoginPage
          portal="bar"
          onNavigate={navigateTo}
          onLoginSuccess={(_, user) => {
            setCurrentUser(user);
            navigateTo('/bar/dashboard');
          }}
        />
      );
    }

    if (cleanPath === '/waiter/login' || cleanPath === '/servo/login') {
      return (
        <RoleLoginPage
          portal="waiter"
          onNavigate={navigateTo}
          onLoginSuccess={(_, user) => {
            setCurrentUser(user);
            navigateTo('/waiter');
          }}
        />
      );
    }

    if (cleanPath === '/inventory/login') {
      return (
        <RoleLoginPage
          portal="inventory"
          onNavigate={navigateTo}
          onLoginSuccess={(_, user) => {
            setCurrentUser(user);
            navigateTo('/inventory/terminal');
          }}
        />
      );
    }

    // 4. Onboarding Setup Wizard
    if (
      cleanPath === '/wizard' ||
      cleanPath === '/create-restaurant' ||
      cleanPath === '/restaurant-setup' ||
      cleanPath === '/onboarding'
    ) {
      return (
        <SetupWizard
          initialOwnerData={activeOwnerData}
          onNavigate={navigateTo}
          onFinishSetup={(setupData) => {
            setActiveOwnerData((prev: any) => ({ ...prev, ...setupData }));
            navigateTo('/restaurant/pending-approval');
          }}
        />
      );
    }

    // 5. Workspace / Multi-Tenant Outlet Selector
    if (
      cleanPath === '/workspace' ||
      cleanPath === '/restaurant/select' ||
      cleanPath === '/select-workspace'
    ) {
      return (
        <WorkspaceSelector
          user={currentUser}
          onSelectRestaurant={async (rest) => {
            await api.switchActiveRestaurant(rest.id);
            const updated = (await api.getRestaurantDetails(rest.id)) || rest;
            setCurrentRestaurant(updated);
            const isAppr =
              rest.isApproved !== false ||
              updated?.isApproved !== false ||
              updated?.lifecycleStatus === 'APPROVED' ||
              updated?.lifecycleStatus === 'LIVE' ||
              updated?.lifecycleStatus === 'ACTIVE';
            if (isAppr) {
              navigateTo('/restaurant/dashboard');
            } else {
              navigateTo('/restaurant/pending-approval');
            }
          }}
          onCreateNewRestaurant={() => navigateTo('/wizard?mode=create')}
          onLogout={() => handleLogout('/restaurant/login')}
        />
      );
    }

    // 6. Pending Approval Page
    if (cleanPath === '/restaurant/pending-approval' || cleanPath === '/pending-approval') {
      return (
        <PendingApprovalPage
          restaurantId={currentRestaurant?.id}
          onNavigate={navigateTo}
          onLogout={() => handleLogout('/restaurant/login')}
        />
      );
    }

    // 7. Platform Admin Control Plane (Isolated internal control plane)
    if (cleanPath === '/admin/login') {
      return (
        <RoleLoginPage
          portal="admin"
          onNavigate={navigateTo}
          onLoginSuccess={(_, user) => {
            setCurrentUser(user);
            navigateTo('/admin/dashboard');
          }}
        />
      );
    }

    if (cleanPath.startsWith('/admin')) {
      if (checkWorkspaceAccess('admin')) {
        return <PlatformApp onLogout={() => handleLogout('/')} />;
      }
      return <NotFoundPage onNavigate={navigateTo} />;
    }

    // 8. Operations Center Screen
    if (
      cleanPath === '/operations' ||
      cleanPath.startsWith('/operations/')
    ) {
      if (!checkWorkspaceAccess('operations')) {
        return currentUser ? (
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
        );
      }

      if (
        currentRestaurant &&
        !currentRestaurant.isApproved &&
        currentRestaurant.lifecycleStatus !== 'APPROVED' &&
        currentRestaurant.lifecycleStatus !== 'LIVE' &&
        currentRestaurant.lifecycleStatus !== 'ACTIVE' &&
        currentUser?.role !== 'SUPER_ADMIN'
      ) {
        return (
          <PendingApprovalPage
            restaurantId={currentRestaurant.id}
            onNavigate={navigateTo}
            onLogout={() => handleLogout('/restaurant/login')}
          />
        );
      }

      return (
        <RestaurantOperationsCenter
          onLogout={() => handleLogout('/restaurant/login')}
          onNavigate={navigateTo}
        />
      );
    }

    // 9. Restaurant OS / Owner Dashboard & Settings
    if (
      cleanPath === '/restaurant' ||
      cleanPath.startsWith('/restaurant/') ||
      cleanPath === '/owner' ||
      cleanPath.startsWith('/owner/') ||
      cleanPath === '/dashboard'
    ) {
      if (!checkWorkspaceAccess('restaurant')) {
        return currentUser ? (
          <NotFoundPage onNavigate={navigateTo} />
        ) : (
          <RoleLoginPage
            portal="restaurant"
            onNavigate={navigateTo}
            onLoginSuccess={async (_, user) => {
              setCurrentUser(user);
              try {
                const myRests = await api.getOwnerRestaurants(user?.email, user?.id);
                if (myRests.length === 0) {
                  navigateTo('/wizard?mode=create');
                } else if (myRests.length === 1) {
                  const onlyRest = myRests[0];
                  await api.switchActiveRestaurant(onlyRest.id);
                  setCurrentRestaurant(onlyRest);
                  if (
                    onlyRest.isApproved !== false &&
                    onlyRest.lifecycleStatus !== 'PENDING_APPROVAL' &&
                    onlyRest.lifecycleStatus !== 'REJECTED'
                  ) {
                    navigateTo('/restaurant/dashboard');
                  } else {
                    navigateTo('/restaurant/pending-approval');
                  }
                } else {
                  navigateTo('/workspace');
                }
              } catch {
                navigateTo('/workspace');
              }
            }}
          />
        );
      }

      if (!currentRestaurant) {
        return (
          <WorkspaceSelector
            user={currentUser}
            onSelectRestaurant={async (rest) => {
              await api.switchActiveRestaurant(rest.id);
              const updated = (await api.getRestaurantDetails(rest.id)) || rest;
              setCurrentRestaurant(updated);
              if (
                rest.isApproved !== false &&
                updated?.lifecycleStatus !== 'PENDING_APPROVAL' &&
                updated?.lifecycleStatus !== 'REJECTED'
              ) {
                navigateTo('/restaurant/dashboard');
              } else {
                navigateTo('/restaurant/pending-approval');
              }
            }}
            onCreateNewRestaurant={() => navigateTo('/wizard?mode=create')}
            onLogout={() => handleLogout('/restaurant/login')}
          />
        );
      }

      if (
        currentRestaurant &&
        !currentRestaurant.isApproved &&
        currentRestaurant.lifecycleStatus !== 'APPROVED' &&
        currentRestaurant.lifecycleStatus !== 'LIVE' &&
        currentRestaurant.lifecycleStatus !== 'ACTIVE' &&
        currentUser?.role !== 'SUPER_ADMIN'
      ) {
        return (
          <PendingApprovalPage
            restaurantId={currentRestaurant.id}
            onNavigate={navigateTo}
            onLogout={() => handleLogout('/restaurant/login')}
          />
        );
      }

      return (
        <RestaurantApp
          onEditSetup={() => navigateTo('/wizard')}
          onLogout={() => handleLogout('/restaurant/login')}
          onNavigate={navigateTo}
        />
      );
    }

    // 10. Kitchen Display System (KDS)
    if (cleanPath === '/kitchen' || cleanPath.startsWith('/kitchen/')) {
      if (!isModuleEnabled(currentRestaurant, 'kitchen')) {
        return (
          <ModuleNotEnabledPage
            moduleName="Kitchen Display System (KDS)"
            restaurant={currentRestaurant}
            onNavigate={navigateTo}
          />
        );
      }

      if (!checkWorkspaceAccess('kitchen')) {
        return currentUser ? (
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
        );
      }

      if (
        currentRestaurant &&
        !currentRestaurant.isApproved &&
        currentRestaurant.lifecycleStatus !== 'APPROVED' &&
        currentRestaurant.lifecycleStatus !== 'LIVE' &&
        currentRestaurant.lifecycleStatus !== 'ACTIVE' &&
        currentUser?.role !== 'SUPER_ADMIN'
      ) {
        return (
          <PendingApprovalPage
            restaurantId={currentRestaurant.id}
            onNavigate={navigateTo}
            onLogout={() => handleLogout('/kitchen/login')}
          />
        );
      }

      return (
        <KitchenETADashboard
          orders={kitchenOrders}
          onRefreshOrders={() => {
            const restId = api.getCurrentRestaurantId() || currentUser?.restaurantId || undefined;
            api.getOrders(restId).then(setKitchenOrders);
          }}
          onLogout={() => handleLogout('/kitchen/login')}
        />
      );
    }

    // 11. Bar Terminal KDS
    if (cleanPath === '/bar' || cleanPath.startsWith('/bar/')) {
      if (!isModuleEnabled(currentRestaurant, 'bar')) {
        return (
          <ModuleNotEnabledPage
            moduleName="Bar Terminal KDS"
            restaurant={currentRestaurant}
            onNavigate={navigateTo}
          />
        );
      }

      if (!checkWorkspaceAccess('bar')) {
        return currentUser ? (
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
        );
      }

      if (
        currentRestaurant &&
        !currentRestaurant.isApproved &&
        currentRestaurant.lifecycleStatus !== 'APPROVED' &&
        currentRestaurant.lifecycleStatus !== 'LIVE' &&
        currentRestaurant.lifecycleStatus !== 'ACTIVE' &&
        currentUser?.role !== 'SUPER_ADMIN'
      ) {
        return (
          <PendingApprovalPage
            restaurantId={currentRestaurant.id}
            onNavigate={navigateTo}
            onLogout={() => handleLogout('/bar/login')}
          />
        );
      }

      return <BarTerminal onLogout={() => handleLogout('/bar/login')} />;
    }

    // 12. Waiter Terminal OS
    if (cleanPath === '/waiter' || cleanPath.startsWith('/waiter/')) {
      if (!isModuleEnabled(currentRestaurant, 'waiter')) {
        return (
          <ModuleNotEnabledPage
            moduleName="Waiter Terminal OS"
            restaurant={currentRestaurant}
            onNavigate={navigateTo}
          />
        );
      }

      if (!checkWorkspaceAccess('waiter')) {
        return currentUser ? (
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
        );
      }

      if (
        currentRestaurant &&
        !currentRestaurant.isApproved &&
        currentRestaurant.lifecycleStatus !== 'APPROVED' &&
        currentRestaurant.lifecycleStatus !== 'LIVE' &&
        currentRestaurant.lifecycleStatus !== 'ACTIVE' &&
        currentUser?.role !== 'SUPER_ADMIN'
      ) {
        return (
          <PendingApprovalPage
            restaurantId={currentRestaurant.id}
            onNavigate={navigateTo}
            onLogout={() => handleLogout('/waiter/login')}
          />
        );
      }

      return <WaiterTerminalOS onLogout={() => handleLogout('/waiter/login')} />;
    }

    // 13. Inventory Terminal OS
    if (cleanPath === '/inventory' || cleanPath.startsWith('/inventory/')) {
      if (!isModuleEnabled(currentRestaurant, 'inventory')) {
        return (
          <ModuleNotEnabledPage
            moduleName="Inventory OS"
            restaurant={currentRestaurant}
            onNavigate={navigateTo}
          />
        );
      }

      if (!checkWorkspaceAccess('inventory')) {
        return currentUser ? (
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
        );
      }

      return (
        <InventoryTerminalOS
          onLogout={() => handleLogout('/inventory/login')}
          activeRestaurantId={currentRestaurant?.id}
        />
      );
    }

    // 14. Customer Mobile Ordering Web App (Deep Linking Support)
    if (
      cleanPath.startsWith('/customer') ||
      cleanPath.startsWith('/order') ||
      cleanPath.startsWith('/qr') ||
      cleanPath.startsWith('/menu')
    ) {
      return <CustomerApp />;
    }

    // 15. Exhaustive Fallback: Never render a blank screen!
    return <NotFoundPage onNavigate={navigateTo} />;
  }, [cleanPath, currentUser, currentRestaurant, kitchenOrders, activeOwnerData, checkWorkspaceAccess, navigateTo, handleLogout]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <div className="flex-1 flex flex-col">
        {renderRoute}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NavigationProvider>
          <AppContent />
        </NavigationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
