import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ThemeProvider } from './packages/theme/ThemeEngine';
import { ErrorBoundary, DinelyLogo, LoadingScreen, AccessDeniedScreen } from './packages/ui';
import { api, getPortalScopeFromPath } from './packages/api/client';
import { realtimeBus } from './packages/api/realtime';
import { canAccessWorkspace, isModuleEnabled, WorkspaceType, Restaurant, User } from './packages/types';
import { navigate, getCleanPath, NavigationProvider } from './packages/router';
import { firebaseAuth, signOutFirebase } from './packages/auth/firebase';
import { getTenantFromHostname, resolveTenantAppFromPath } from './packages/utils/tenantResolver';
import { Loader2, AlertCircle } from 'lucide-react';

// Lazy-loaded route bundles for optimal bundle size and instantaneous initial load
const LandingWebsite = lazy(() => import('./apps/landing/LandingWebsite').then(m => ({ default: m.LandingWebsite })));
const PlatformApp = lazy(() => import('./apps/platform/PlatformApp').then(m => ({ default: m.PlatformApp })));
const RestaurantApp = lazy(() => import('./apps/restaurant/RestaurantApp').then(m => ({ default: m.RestaurantApp })));
const CustomerApp = lazy(() => import('./apps/customer/CustomerApp').then(m => ({ default: m.CustomerApp })));
const WaiterTerminalOS = lazy(() => import('./apps/waiter/WaiterTerminalOS').then(m => ({ default: m.WaiterTerminalOS })));
const KitchenETADashboard = lazy(() => import('./apps/restaurant/KitchenETADashboard').then(m => ({ default: m.KitchenETADashboard })));
const BarTerminal = lazy(() => import('./apps/bar/BarTerminal').then(m => ({ default: m.BarTerminal })));
const InventoryTerminalOS = lazy(() => import('./apps/inventory/InventoryTerminalOS').then(m => ({ default: m.InventoryTerminalOS })));
const RestaurantOperationsCenter = lazy(() => import('./apps/operations/RestaurantOperationsCenter').then(m => ({ default: m.RestaurantOperationsCenter })));
const AuthPage = lazy(() => import('./apps/auth/AuthPage').then(m => ({ default: m.AuthPage })));
const RoleLoginPage = lazy(() => import('./apps/auth/RoleLoginPage').then(m => ({ default: m.RoleLoginPage })));
const NotFoundPage = lazy(() => import('./apps/auth/NotFoundPage').then(m => ({ default: m.NotFoundPage })));
const ModuleNotEnabledPage = lazy(() => import('./apps/auth/ModuleNotEnabledPage').then(m => ({ default: m.ModuleNotEnabledPage })));
const SetupWizard = lazy(() => import('./apps/onboarding/SetupWizard').then(m => ({ default: m.SetupWizard })));
const PendingApprovalPage = lazy(() => import('./apps/onboarding/PendingApprovalPage').then(m => ({ default: m.PendingApprovalPage })));
const WorkspaceSelector = lazy(() => import('./apps/onboarding/WorkspaceSelector').then(m => ({ default: m.WorkspaceSelector })));

function RouteLoadingFallback() {
  return (
    <LoadingScreen
      status="Loading workspace..."
      substatus="Optimizing and preparing interface resources"
    />
  );
}

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

  // Tenant Domain Resolution for Multi-Tenant Operating System
  const domainResolution = useMemo(() => getTenantFromHostname(), []);
  const [resolvedTenant, setResolvedTenant] = useState<Restaurant | null>(null);
  const [tenantResolutionState, setTenantResolutionState] = useState<'IDLE' | 'RESOLVING' | 'RESOLVED' | 'NOT_FOUND' | 'SUSPENDED'>('IDLE');

  // Asynchronously resolve tenant on subdomains or custom domains
  useEffect(() => {
    let isMounted = true;
    if (!domainResolution.isTenantSubdomain) {
      setTenantResolutionState('IDLE');
      return;
    }

    setTenantResolutionState('RESOLVING');
    const resolveTenant = async () => {
      try {
        let rest: Restaurant | null = null;
        if (domainResolution.slug) {
          rest = await api.resolveRestaurantBySlug(domainResolution.slug);
        }
        if (!rest && domainResolution.hostname) {
          rest = await api.resolveRestaurantFromHostname(domainResolution.hostname);
        }

        if (!isMounted) return;

        if (!rest) {
          setTenantResolutionState('NOT_FOUND');
          return;
        }

        const isArchived =
          rest.lifecycleStatus === 'ARCHIVED' ||
          (rest.status as string) === 'ARCHIVED' ||
          rest.lifecycleStatus === 'DEACTIVATED';
        if (isArchived) {
          setTenantResolutionState('NOT_FOUND');
          return;
        }

        const isSuspended =
          rest.lifecycleStatus === 'SUSPENDED' || (rest.status as string) === 'SUSPENDED';
        if (isSuspended) {
          setResolvedTenant(rest);
          setTenantResolutionState('SUSPENDED');
          return;
        }

        setResolvedTenant(rest);
        setCurrentRestaurant(rest);
        api.setCurrentRestaurantId(rest.id);
        setTenantResolutionState('RESOLVED');

        // Connect realtime bus to resolved tenant ID
        const scope = getPortalScopeFromPath(cleanPath);
        realtimeBus.connect(rest.id, scope);
      } catch (err) {
        console.error('[TenantResolution] Failed to resolve tenant:', err);
        if (isMounted) setTenantResolutionState('NOT_FOUND');
      }
    };

    resolveTenant();

    return () => {
      isMounted = false;
    };
  }, [domainResolution, cleanPath]);

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
        let token = '';
        let isAdmin = scope === 'ADMIN';
        try {
          const tokenResult = await fbUser.getIdTokenResult();
          token = tokenResult.token;
          isAdmin = Boolean(tokenResult.claims.admin || tokenResult.claims.role === 'admin' || tokenResult.claims.platform_admin || scope === 'ADMIN');
          if (token) {
            localStorage.setItem('dinely_auth_token', token);
            if (isAdmin) {
              localStorage.setItem('dinely_platform_admin_id_token', token);
              sessionStorage.setItem('dinely_admin_token', token);
            }
          }
        } catch (e) {
          console.warn('[App] Could not retrieve Firebase ID token:', e);
        }

        let appUser = api.getCurrentUser(scope);
        if (!appUser) {
          appUser = {
            id: fbUser.uid,
            name: fbUser.displayName || fbUser.email.split('@')[0],
            email: fbUser.email.toLowerCase(),
            role: isAdmin ? 'PLATFORM_ADMIN' : 'RESTAURANT_OWNER',
          };
          api.setCurrentUser(appUser, scope);
        }
        if (token) {
          api.setSessionTokens({ accessToken: token, refreshToken: token, expiresIn: 3600, tokenType: 'Bearer' }, scope);
        }
        setCurrentUser(appUser);
      }
      setIsInitializing(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // Fetch active restaurant details on mount or when restaurant ID changes (not on every sub-route)
  useEffect(() => {
    let isMounted = true;
    const activeRestId = api.getCurrentRestaurantId();
    if (currentRestaurant && currentRestaurant.id === activeRestId) {
      return;
    }

    const loadRestaurant = async () => {
      try {
        const rest = await api.getRestaurantDetails(activeRestId || undefined);
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
  }, [currentUser]);

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
    await signOutFirebase();
    setCurrentUser(null);
    setCurrentRestaurant(null);
    navigateTo(redirectLoginPath);
  }, [cleanPath, navigateTo]);

  // Canonical workspace authorization decision engine
  const checkWorkspaceAccess = useCallback((workspace: WorkspaceType | string) => {
    return canAccessWorkspace(currentUser, workspace);
  }, [currentUser]);

  // Main Route Dispatcher with Comprehensive State Handling
  const renderRoute = useMemo(() => {
    // 0. Multi-Tenant Restaurant Operating System Routing (*.dinely.food or custom domains)
    if (domainResolution.isTenantSubdomain) {
      if (tenantResolutionState === 'RESOLVING') {
        return (
          <LoadingScreen
            status="Connecting to Restaurant..."
            substatus={`Resolving tenant ${domainResolution.slug || domainResolution.hostname}`}
          />
        );
      }

      if (tenantResolutionState === 'NOT_FOUND' || !resolvedTenant) {
        return (
          <NotFoundPage
            title="Venue Not Found"
            message={`We couldn't find an active restaurant matching "${domainResolution.hostname}". Please verify the domain or contact the venue.`}
            onNavigate={navigateTo}
            onBackToHome={() => { window.location.href = 'https://dinely.food'; }}
          />
        );
      }

      if (tenantResolutionState === 'SUSPENDED') {
        return (
          <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">{resolvedTenant.name} is Suspended</h1>
            <p className="text-white/60 text-sm max-w-md mb-6">This venue is temporarily inactive on the Dinely platform. Please check back later or contact restaurant management.</p>
            <button
              onClick={() => { window.location.href = 'https://dinely.food'; }}
              className="py-2.5 px-5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-all"
            >
              Back to Dinely Platform
            </button>
          </div>
        );
      }

      // Inside Resolved Tenant: Route by Path to the corresponding Tenant Application
      const tenantApp = resolveTenantAppFromPath(cleanPath);

      // 1. Customer Digital Menu & Ordering
      if (tenantApp === 'CUSTOMER') {
        const isLive =
          resolvedTenant.lifecycleStatus === 'LIVE' ||
          resolvedTenant.lifecycleStatus === 'APPROVED' ||
          (resolvedTenant.isApproved === true &&
            resolvedTenant.lifecycleStatus !== 'PENDING_APPROVAL' &&
            resolvedTenant.lifecycleStatus !== 'REJECTED' &&
            resolvedTenant.lifecycleStatus !== 'ARCHIVED');

        if (!isLive) {
          return (
            <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-6 text-center">
              <DinelyLogo size={48} className="mb-4" />
              <h1 className="text-2xl font-bold tracking-tight text-white mb-2">{resolvedTenant.name} — Opening Soon!</h1>
              <p className="text-white/60 text-sm max-w-md mb-6">
                This restaurant is currently completing setup and verification. Public online ordering and table service will be enabled once approved.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigateTo('/login')}
                  className="py-2.5 px-5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-all"
                >
                  Staff / Owner Sign In
                </button>
                <button
                  onClick={() => { window.location.href = 'https://dinely.food'; }}
                  className="py-2.5 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-sm font-medium transition-all"
                >
                  Dinely Home
                </button>
              </div>
            </div>
          );
        }

        return <CustomerApp />;
      }

      // 2. Kitchen Terminal (KDS)
      if (tenantApp === 'KITCHEN') {
        if (!currentUser) {
          return (
            <RoleLoginPage
              portal="kitchen"
              onNavigate={navigateTo}
              onLoginSuccess={(_, user) => {
                setCurrentUser(user);
                navigateTo('/kitchen');
              }}
            />
          );
        }

        const isAuthorizedStaff =
          currentUser.role === 'SUPER_ADMIN' ||
          (currentUser.restaurantId === resolvedTenant.id && ['KITCHEN', 'CHEF', 'COOK', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'].includes(currentUser.role)) ||
          (currentUser.email && (resolvedTenant.email?.toLowerCase() === currentUser.email.toLowerCase() || (resolvedTenant as any).ownerEmail?.toLowerCase() === currentUser.email.toLowerCase()));

        if (!isAuthorizedStaff) {
          return (
            <AccessDeniedScreen
              tenantName={resolvedTenant.name}
              requiredRole="KITCHEN STAFF"
              onLogout={() => handleLogout('/login')}
            />
          );
        }

        return <KitchenETADashboard onLogout={() => handleLogout('/login')} />;
      }

      // 3. Waiter Terminal
      if (tenantApp === 'WAITER') {
        if (!currentUser) {
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

        const isAuthorizedStaff =
          currentUser.role === 'SUPER_ADMIN' ||
          (currentUser.restaurantId === resolvedTenant.id && ['WAITER', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'].includes(currentUser.role)) ||
          (currentUser.email && (resolvedTenant.email?.toLowerCase() === currentUser.email.toLowerCase() || (resolvedTenant as any).ownerEmail?.toLowerCase() === currentUser.email.toLowerCase()));

        if (!isAuthorizedStaff) {
          return (
            <AccessDeniedScreen
              tenantName={resolvedTenant.name}
              requiredRole="WAITER STAFF"
              onLogout={() => handleLogout('/login')}
            />
          );
        }

        return <WaiterTerminalOS onLogout={() => handleLogout('/login')} />;
      }

      // 4. Bar Terminal
      if (tenantApp === 'BAR') {
        if (!currentUser) {
          return (
            <RoleLoginPage
              portal="bar"
              onNavigate={navigateTo}
              onLoginSuccess={(_, user) => {
                setCurrentUser(user);
                navigateTo('/bar');
              }}
            />
          );
        }

        const isAuthorizedStaff =
          currentUser.role === 'SUPER_ADMIN' ||
          (currentUser.restaurantId === resolvedTenant.id && ['BAR', 'BARTENDER', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'].includes(currentUser.role)) ||
          (currentUser.email && (resolvedTenant.email?.toLowerCase() === currentUser.email.toLowerCase() || (resolvedTenant as any).ownerEmail?.toLowerCase() === currentUser.email.toLowerCase()));

        if (!isAuthorizedStaff) {
          return (
            <AccessDeniedScreen
              tenantName={resolvedTenant.name}
              requiredRole="BARTENDER"
              onLogout={() => handleLogout('/login')}
            />
          );
        }

        return <BarTerminal onLogout={() => handleLogout('/login')} />;
      }

      // 5. Inventory Terminal
      if (tenantApp === 'INVENTORY') {
        if (!currentUser) {
          return (
            <RoleLoginPage
              portal="inventory"
              onNavigate={navigateTo}
              onLoginSuccess={(_, user) => {
                setCurrentUser(user);
                navigateTo('/inventory');
              }}
            />
          );
        }

        const isAuthorizedStaff =
          currentUser.role === 'SUPER_ADMIN' ||
          (currentUser.restaurantId === resolvedTenant.id && ['INVENTORY', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'].includes(currentUser.role)) ||
          (currentUser.email && (resolvedTenant.email?.toLowerCase() === currentUser.email.toLowerCase() || (resolvedTenant as any).ownerEmail?.toLowerCase() === currentUser.email.toLowerCase()));

        if (!isAuthorizedStaff) {
          return (
            <AccessDeniedScreen
              tenantName={resolvedTenant.name}
              requiredRole="INVENTORY MANAGER"
              onLogout={() => handleLogout('/login')}
            />
          );
        }

        return <InventoryTerminalOS onLogout={() => handleLogout('/login')} />;
      }

      // 6. Billing / Operations Center
      if (tenantApp === 'BILLING') {
        if (!currentUser) {
          return (
            <RoleLoginPage
              portal="restaurant"
              onNavigate={navigateTo}
              onLoginSuccess={(_, user) => {
                setCurrentUser(user);
                navigateTo('/billing');
              }}
            />
          );
        }

        const isAuthorizedStaff =
          currentUser.role === 'SUPER_ADMIN' ||
          (currentUser.restaurantId === resolvedTenant.id && ['BILLING', 'CASHIER', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'].includes(currentUser.role)) ||
          (currentUser.email && (resolvedTenant.email?.toLowerCase() === currentUser.email.toLowerCase() || (resolvedTenant as any).ownerEmail?.toLowerCase() === currentUser.email.toLowerCase()));

        if (!isAuthorizedStaff) {
          return (
            <AccessDeniedScreen
              tenantName={resolvedTenant.name}
              requiredRole="BILLING / CASHIER"
              onLogout={() => handleLogout('/login')}
            />
          );
        }

        return <RestaurantApp onLogout={() => handleLogout('/login')} onNavigate={navigateTo} />;
      }

      // 7. Settings / Tenant Management Dashboard
      if (tenantApp === 'SETTINGS') {
        if (!currentUser) {
          return (
            <AuthPage
              initialMode="login"
              onNavigate={navigateTo}
              onLoginSuccess={async (res) => {
                const user = res?.user || res;
                if (user) setCurrentUser(user);
                navigateTo('/settings');
              }}
            />
          );
        }

        const isAuthorizedOwner =
          currentUser.role === 'SUPER_ADMIN' ||
          (currentUser.restaurantId === resolvedTenant.id && ['OWNER', 'RESTAURANT_OWNER', 'MANAGER'].includes(currentUser.role)) ||
          (currentUser.email && (resolvedTenant.email?.toLowerCase() === currentUser.email.toLowerCase() || (resolvedTenant as any).ownerEmail?.toLowerCase() === currentUser.email.toLowerCase()));

        if (!isAuthorizedOwner) {
          return (
            <AccessDeniedScreen
              tenantName={resolvedTenant.name}
              requiredRole="RESTAURANT OWNER"
              onLogout={() => handleLogout('/login')}
            />
          );
        }

        return <RestaurantApp onLogout={() => handleLogout('/login')} onNavigate={navigateTo} />;
      }

      // 8. Auth inside tenant
      if (tenantApp === 'AUTH') {
        return (
          <AuthPage
            initialMode="login"
            onNavigate={navigateTo}
            onLoginSuccess={async (res) => {
              const user = res?.user || res;
              if (user) setCurrentUser(user);
              navigateTo('/');
            }}
          />
        );
      }

      // 9. Unknown route inside tenant
      return (
        <NotFoundPage
          title="Page Not Found"
          message={`The requested path does not exist on ${resolvedTenant.name}.`}
          onNavigate={navigateTo}
        />
      );
    }

    // 0.1. Guard protected routes while Firebase Auth initializes session
    if (isInitializing && !['/', '/landing', '/home', '/about', '/contact', '/terms', '/privacy', '/features', '/customer'].includes(cleanPath)) {
      return (
        <LoadingScreen
          status="Initializing secure session..."
          substatus="Validating multi-tenant authorization credentials"
        />
      );
    }

    // 1. Landing Website & Public Marketing Pages
    if (
      cleanPath === '/' ||
      cleanPath === '/landing' ||
      cleanPath === '/home' ||
      cleanPath === '/about' ||
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

    // 2. Unified Owner Authentication Flows (Glassmorphism Redesign)
    if (
      cleanPath === '/auth' ||
      cleanPath === '/login' ||
      cleanPath === '/signin' ||
      cleanPath === '/restaurant/login' ||
      cleanPath === '/owner/login' ||
      cleanPath === '/manager/login'
    ) {
      return (
        <AuthPage
          initialMode="login"
          onNavigate={navigateTo}
          onLoginSuccess={async (res) => {
            const user = res?.user || res;
            if (user) setCurrentUser(user);
            if (res?.restaurant) setCurrentRestaurant(res.restaurant);
          }}
        />
      );
    }

    if (cleanPath === '/signup' || cleanPath === '/register') {
      return (
        <AuthPage
          initialMode="register"
          onNavigate={navigateTo}
          onRegisterSuccess={async (res) => {
            const user = res?.user || res;
            if (user) setCurrentUser(user);
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
            const isLive =
              updated?.lifecycleStatus === 'LIVE' ||
              updated?.lifecycleStatus === 'APPROVED' ||
              (updated?.isApproved === true &&
                updated?.lifecycleStatus !== 'PENDING_APPROVAL' &&
                updated?.lifecycleStatus !== 'REJECTED' &&
                updated?.lifecycleStatus !== 'ARCHIVED' &&
                updated?.lifecycleStatus !== 'SUSPENDED');
            if (isLive) {
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
      const adminUser = api.getCurrentUser('ADMIN');
      const effectiveUser = adminUser || (currentUser?.role === 'PLATFORM_ADMIN' ? currentUser : null);
      const effectiveEmail = (effectiveUser?.email || '').trim().toLowerCase();
      const isAuthorizedAdmin = effectiveUser && effectiveUser.role === 'PLATFORM_ADMIN' && effectiveEmail === 'ayan090912@gmail.com';

      // If completely unauthenticated, direct to dedicated Platform Admin login
      if (!effectiveUser && !currentUser) {
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

      // If authenticated and authorized, render Platform Control Plane
      if (isAuthorizedAdmin) {
        return <PlatformApp onLogout={() => handleLogout('/admin/login')} />;
      }

      // Authenticated with non-admin Google account or restaurant owner identity -> 403 Forbidden
      return (
        <AccessDeniedScreen
          resourceName="Dinely Platform Administration"
          requiredRole="PLATFORM_ADMIN (Primary Authorized Account)"
          onBack={() => handleLogout('/admin/login')}
        />
      );
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
        const storedRestId = api.getCurrentRestaurantId();
        if (storedRestId) {
          return (
            <LoadingScreen
              status="Loading restaurant workspace..."
              substatus="Retrieving active venue configuration & operational data"
              onRetry={() => {
                const id = api.getCurrentRestaurantId();
                if (id) {
                  api.getRestaurantDetails(id).then((r) => {
                    if (r) setCurrentRestaurant(r);
                  }).catch(() => {});
                }
              }}
              onChooseRestaurant={() => {
                localStorage.removeItem('dinely_active_restaurant_id');
                navigateTo('/workspace');
              }}
            />
          );
        }

        return (
          <WorkspaceSelector
            user={currentUser}
            onSelectRestaurant={async (rest) => {
              await api.switchActiveRestaurant(rest.id);
              const updated = (await api.getRestaurantDetails(rest.id)) || rest;
              setCurrentRestaurant(updated);
              const isLive =
                updated?.lifecycleStatus === 'LIVE' ||
                updated?.lifecycleStatus === 'APPROVED' ||
                (updated?.isApproved === true &&
                  updated?.lifecycleStatus !== 'PENDING_APPROVAL' &&
                  updated?.lifecycleStatus !== 'REJECTED' &&
                  updated?.lifecycleStatus !== 'ARCHIVED' &&
                  updated?.lifecycleStatus !== 'SUSPENDED');
              if (isLive) {
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

      const isLiveRestaurant =
        currentRestaurant.lifecycleStatus === 'LIVE' ||
        currentRestaurant.lifecycleStatus === 'APPROVED' ||
        (currentRestaurant.isApproved === true &&
          currentRestaurant.lifecycleStatus !== 'PENDING_APPROVAL' &&
          currentRestaurant.lifecycleStatus !== 'REJECTED' &&
          currentRestaurant.lifecycleStatus !== 'ARCHIVED' &&
          currentRestaurant.lifecycleStatus !== 'SUSPENDED');

      if (!isLiveRestaurant && currentUser?.role !== 'SUPER_ADMIN') {
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
          activeRestaurant={currentRestaurant}
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
            if (restId) {
              api.getOrders(restId).then(setKitchenOrders).catch(() => {});
            }
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
  }, [cleanPath, currentUser, currentRestaurant, kitchenOrders, activeOwnerData, checkWorkspaceAccess, navigateTo, handleLogout, domainResolution, resolvedTenant, tenantResolutionState, isInitializing]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <div className="flex-1 flex flex-col">
        <Suspense fallback={<RouteLoadingFallback />}>
          {renderRoute}
        </Suspense>
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
