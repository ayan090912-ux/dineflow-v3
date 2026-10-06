import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ThemeProvider } from './packages/theme/ThemeEngine';
import { ErrorBoundary, DinelyLogo, LoadingScreen, AccessDeniedScreen } from './packages/ui';
import { api, getPortalScopeFromPath } from './packages/api/client';
import { realtimeBus } from './packages/api/realtime';
import { canAccessWorkspace, isModuleEnabled, WorkspaceType, Restaurant, User } from './packages/types';
import { navigate, getCleanPath, NavigationProvider } from './packages/router';
import { firebaseAuth, signOutFirebase, authStateMachine, type AuthState, type AuthErrorDetails } from './packages/auth/firebase';
import { getTenantFromHostname, resolveTenantAppFromPath, getTenantUrl } from './packages/utils/tenantResolver';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

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
const RestaurantSignupPage = lazy(() => import('./apps/onboarding/RestaurantSignupPage').then(m => ({ default: m.RestaurantSignupPage })));
const PendingApprovalPage = lazy(() => import('./apps/onboarding/PendingApprovalPage').then(m => ({ default: m.PendingApprovalPage })));
const WorkspaceSelector = lazy(() => import('./apps/onboarding/WorkspaceSelector').then(m => ({ default: m.WorkspaceSelector })));

function RouteLoadingFallback() {
  return (
    <LoadingScreen
      status="Opening your workspace"
      substatus="Preparing workspace resources..."
    />
  );
}

/**
 * Root Domain Redirector for Dinely Platform (https://dinely.food).
 * Follows Architecture Section 5:
 * A. If exactly 1 accessible restaurant exists: redirect to that restaurant's tenant domain.
 * B. If multiple restaurants exist: show WorkspaceSelector (selection redirects to tenant domain).
 * C. If no restaurant exists: show onboarding / create-restaurant.
 * D. If unauthorized: show error.
 */
function PlatformTenantRedirector({
  user,
  targetPath,
  onNavigate,
  onLogout,
}: {
  user: User | null;
  targetPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const list = await api.getOwnerRestaurants(user?.email, user?.id);
        if (!isMounted) return;

        if (!list || list.length === 0) {
          onNavigate('/wizard?mode=create');
          return;
        }

        if (list.length === 1) {
          const onlyRest = list[0];
          const isLive =
            onlyRest.lifecycleStatus === 'LIVE' ||
            onlyRest.lifecycleStatus === 'APPROVED' ||
            (onlyRest.isApproved === true &&
              onlyRest.lifecycleStatus !== 'PENDING_APPROVAL' &&
              onlyRest.lifecycleStatus !== 'REJECTED' &&
              onlyRest.lifecycleStatus !== 'ARCHIVED' &&
              onlyRest.lifecycleStatus !== 'SUSPENDED');

          if (!isLive) {
            onNavigate('/restaurant/pending-approval');
            return;
          }

          const targetUrl = getTenantUrl(onlyRest, targetPath.startsWith('/restaurant') ? targetPath : '/restaurant/dashboard');
          window.location.replace(targetUrl);
          return;
        }

        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('[PlatformTenantRedirector] Error resolving restaurants:', err);
        setError(err?.message || 'Failed to resolve accessible restaurants.');
        setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [user?.email, user?.id, targetPath, onNavigate]);

  if (loading) {
    return (
      <LoadingScreen
        status="Resolving Tenant Workspace..."
        substatus="Connecting your account to your canonical restaurant domain"
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-400">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Workspace Resolution Error</h2>
        <p className="text-slate-400 max-w-md mb-6">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <WorkspaceSelector
      user={user}
      onSelectRestaurant={async (rest) => {
        await api.switchActiveRestaurant(rest.id);
        const isLive =
          rest.lifecycleStatus === 'LIVE' ||
          rest.lifecycleStatus === 'APPROVED' ||
          (rest.isApproved === true &&
            rest.lifecycleStatus !== 'PENDING_APPROVAL' &&
            rest.lifecycleStatus !== 'REJECTED' &&
            rest.lifecycleStatus !== 'ARCHIVED' &&
            rest.lifecycleStatus !== 'SUSPENDED');

        if (isLive) {
          window.location.href = getTenantUrl(rest, targetPath.startsWith('/restaurant') ? targetPath : '/restaurant/dashboard');
        } else {
          onNavigate('/restaurant/pending-approval');
        }
      }}
      onCreateNewRestaurant={() => onNavigate('/wizard?mode=create')}
      onLogout={onLogout}
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
  const [authState, setAuthState] = useState<AuthState>(() => authStateMachine.getState());
  const [authError, setAuthError] = useState<AuthErrorDetails | null>(() => authStateMachine.getError());

  // Subscribe to authoritative Auth State Machine
  useEffect(() => {
    const unsub = authStateMachine.subscribe((data) => {
      setAuthState(data.state);
      setAuthError(data.error);
      if (data.user) {
        setCurrentUser(data.user);
      }
    });
    return () => unsub();
  }, []);

  // Tenant Domain Resolution for Multi-Tenant Operating System
  const domainResolution = useMemo(() => getTenantFromHostname(), []);
  const [resolvedTenant, setResolvedTenant] = useState<Restaurant | null>(null);
  const [tenantResolutionState, setTenantResolutionState] = useState<'IDLE' | 'RESOLVING' | 'RESOLVED' | 'NOT_FOUND' | 'SUSPENDED' | 'NETWORK_ERROR'>('IDLE');

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
      } catch (err: any) {
        console.error('[TenantResolution] Failed to resolve tenant:', err);
        if (isMounted) {
          if (err?.isNetworkError || err?.name === 'AbortError' || (err?.message && err.message.toLowerCase().includes('network')) || (err?.message && err.message.toLowerCase().includes('timed out'))) {
            setTenantResolutionState('NETWORK_ERROR');
          } else {
            setTenantResolutionState('NOT_FOUND');
          }
        }
      }
    };

    resolveTenant();

    return () => {
      isMounted = false;
    };
  }, [domainResolution]);

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

  const navigateTo = useCallback((path: string, options?: { replace?: boolean }) => {
    navigate(path, options);
    const clean = getCleanPath(path);
    setCurrentPath(path);
    setCleanPath(clean);
    const scope = getPortalScopeFromPath(path);
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

  // Firebase Auth Observer: synchronizes Firebase state with application session & state machine
  useEffect(() => {
    // Watchdog safety guard: 4000ms maximum to guarantee NEVER infinite loading
    const watchdog = setTimeout(() => {
      if (authStateMachine.getState() === 'INITIALIZING') {
        console.warn('[App] Watchdog: Firebase auth initialization timed out. Transitioning to UNAUTHENTICATED/ERROR.');
        const existingToken = typeof window !== 'undefined' ? localStorage.getItem('dinely_auth_token') : null;
        if (!existingToken) {
          authStateMachine.setUnauthenticated();
        } else {
          authStateMachine.setError({
            message: 'Authentication session timed out. Please check your network connection.',
            code: 'auth/timeout',
            isNetworkError: true,
          });
        }
      }
    }, 4000);

    const unsubscribeAuth = onAuthStateChanged(
      firebaseAuth,
      async (fbUser) => {
        clearTimeout(watchdog);
        if (fbUser && fbUser.email) {
          const scope = getPortalScopeFromPath(window.location.pathname);
          let token = '';
          const lowerEmail = fbUser.email.toLowerCase();
          let isAdmin = scope === 'ADMIN' || lowerEmail === 'ayan090912@gmail.com' || lowerEmail === 'admin@dinely.food';
          try {
            const tokenResult = await fbUser.getIdTokenResult();
            token = tokenResult.token;
            if (tokenResult.claims.admin || tokenResult.claims.role === 'admin' || tokenResult.claims.platform_admin) {
              isAdmin = true;
            }
            if (token) {
              localStorage.setItem('dinely_auth_token', token);
              if (isAdmin) {
                localStorage.setItem('dinely_platform_admin_id_token', token);
                sessionStorage.setItem('dinely_admin_token', token);
                localStorage.setItem('dinely_admin_token', token);
              }
            }
          } catch (e: any) {
            console.warn('[App] Could not retrieve Firebase ID token:', e);
            if (e?.code === 'auth/network-request-failed' || e?.message?.toLowerCase().includes('network')) {
              authStateMachine.handleNetworkFailure();
              return;
            }
          }

          const effectiveScope = isAdmin ? 'ADMIN' : scope;
          let appUser = api.getCurrentUser(effectiveScope);
          if (!appUser) {
            appUser = {
              id: fbUser.uid,
              name: fbUser.displayName || fbUser.email.split('@')[0],
              email: lowerEmail,
              role: isAdmin ? 'PLATFORM_ADMIN' : 'RESTAURANT_OWNER',
            };
            api.setCurrentUser(appUser, effectiveScope);
          }
          if (token) {
            api.setSessionTokens({ accessToken: token, refreshToken: token, expiresIn: 3600, tokenType: 'Bearer' }, effectiveScope);
            authStateMachine.setAuthenticated(appUser, token);
            // Authoritative server-side profile & tenant restoration from AWS RDS
            api.fetchAuthMe(token).then((authMe) => {
              if (authMe?.restaurant) {
                // On tenant subdomains (e.g. the-start.dinely.food), the hostname is authoritative.
                // Only hydrate global restaurant state if on platform domain (dinely.food)
                if (!domainResolution.isTenantSubdomain) {
                  setCurrentRestaurant(authMe.restaurant);
                  api.setCurrentRestaurantId(authMe.restaurant.id);
                }
              }
            }).catch((err) => {
              console.warn('[App] /auth/me bootstrap notice:', err);
            });
          } else {
            authStateMachine.setUnauthenticated();
          }
          setCurrentUser(appUser);
        } else {
          authStateMachine.setUnauthenticated();
        }
      },
      (error) => {
        clearTimeout(watchdog);
        console.error('[App] Firebase auth observer error:', error);
        authStateMachine.setError({
          message: error.message || 'Authentication error occurred.',
          code: (error as any).code || 'auth/unknown',
          isNetworkError: (error as any).code === 'auth/network-request-failed' || error.message?.toLowerCase().includes('network'),
        });
      }
    );

    const handleAuthRequired = (e: any) => {
      console.warn('[App] dinely_auth_required event received:', e?.detail?.reason);
      setCurrentUser(null);
      setCurrentRestaurant(null);
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      if (currentPath.startsWith('/admin')) {
        navigateTo('/admin/login');
      } else {
        navigateTo('/restaurant/login');
      }
    };
    window.addEventListener('dinely_auth_required', handleAuthRequired);

    return () => {
      clearTimeout(watchdog);
      unsubscribeAuth();
      window.removeEventListener('dinely_auth_required', handleAuthRequired);
    };
  }, [navigateTo]);

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
            if (isMounted && r) {
              setCurrentRestaurant(r);
              setResolvedTenant((prev) => (prev && (prev.id === r.id || prev.slug === r.slug) ? r : prev));
            }
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
      const restId = api.getCurrentRestaurantId() || currentUser?.restaurantId || resolvedTenant?.id || undefined;
      api.getOrders(restId).then((o) => {
        if (isMounted) setKitchenOrders(o || []);
      }).catch(() => {
        if (isMounted) setKitchenOrders([]);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [cleanPath, currentUser, resolvedTenant?.id]);

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
      // Platform Admin is NOT a tenant route: redirect to dinely.food
      if (cleanPath.startsWith('/admin')) {
        window.location.href = `https://dinely.food${cleanPath}`;
        return (
          <LoadingScreen
            status="Redirecting to Platform Admin..."
            substatus="Platform Admin operates on dinely.food"
          />
        );
      }
      if (tenantResolutionState === 'RESOLVING') {
        const tenantDisplayName = (domainResolution as any)?.restaurantName || (domainResolution.slug ? domainResolution.slug.toUpperCase().replace(/-/g, ' ') : undefined);
        return (
          <LoadingScreen
            restaurantName={tenantDisplayName}
            status="Opening your workspace"
            substatus={tenantDisplayName ? `Connecting to ${tenantDisplayName}...` : 'Connecting to your restaurant...'}
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

      if (tenantResolutionState === 'NETWORK_ERROR') {
        return (
          <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6">
              <RefreshCw size={32} className="animate-spin" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Connecting to Restaurant Server...</h1>
            <p className="text-white/60 text-sm max-w-md mb-6">
              Unable to reach restaurant servers. Please check your connection or retry in a few seconds.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.location.reload()}
                className="py-2.5 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-semibold transition-all"
              >
                Retry Connection
              </button>
              <button
                onClick={() => { window.location.href = 'https://dinely.food'; }}
                className="py-2.5 px-5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-all"
              >
                Dinely Platform
              </button>
            </div>
          </div>
        );
      }

      if (tenantResolutionState === 'SUSPENDED') {
        return (
          <div className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-6">
              <AlertCircle size={32} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">{resolvedTenant?.name || 'Restaurant'} is Suspended</h1>
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
        // Authoritative Server State: If isApproved or lifecycleStatus is LIVE/APPROVED, grant access
        const isLive =
          resolvedTenant.lifecycleStatus === 'LIVE' ||
          resolvedTenant.lifecycleStatus === 'APPROVED' ||
          resolvedTenant.isApproved === true;

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
        if (!isModuleEnabled(resolvedTenant, 'kitchen')) {
          return (
            <ModuleNotEnabledPage
              moduleName="Kitchen Display System"
              restaurant={resolvedTenant}
              onNavigate={navigateTo}
            />
          );
        }

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

        return (
          <KitchenETADashboard
            orders={kitchenOrders.length > 0 ? kitchenOrders : undefined}
            onRefreshOrders={() => {
              const restId = api.getCurrentRestaurantId() || currentUser?.restaurantId || resolvedTenant?.id || undefined;
              if (restId) api.getOrders(restId).then(setKitchenOrders).catch(() => {});
            }}
            onLogout={() => handleLogout('/login')}
          />
        );
      }

      // 3. Waiter Terminal
      if (tenantApp === 'WAITER') {
        if (!isModuleEnabled(resolvedTenant, 'waiter')) {
          return (
            <ModuleNotEnabledPage
              moduleName="Waiter Terminal"
              restaurant={resolvedTenant}
              onNavigate={navigateTo}
            />
          );
        }

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
        if (!isModuleEnabled(resolvedTenant, 'bar')) {
          return (
            <ModuleNotEnabledPage
              moduleName="Bar Terminal"
              restaurant={resolvedTenant}
              onNavigate={navigateTo}
            />
          );
        }

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
        if (!isModuleEnabled(resolvedTenant, 'inventory')) {
          return (
            <ModuleNotEnabledPage
              moduleName="Inventory & Stock"
              restaurant={resolvedTenant}
              onNavigate={navigateTo}
            />
          );
        }

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
        if (!isModuleEnabled(resolvedTenant, 'billing')) {
          return (
            <ModuleNotEnabledPage
              moduleName="Billing & POS"
              restaurant={resolvedTenant}
              onNavigate={navigateTo}
            />
          );
        }

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
          (currentUser.email && (
            resolvedTenant.email?.toLowerCase() === currentUser.email.toLowerCase() ||
            (resolvedTenant as any).ownerEmail?.toLowerCase() === currentUser.email.toLowerCase() ||
            (resolvedTenant as any).owner_email?.toLowerCase() === currentUser.email.toLowerCase()
          ));

        if (!isAuthorizedStaff) {
          return (
            <AccessDeniedScreen
              tenantName={resolvedTenant.name}
              requiredRole="BILLING / CASHIER"
              onLogout={() => handleLogout('/login')}
            />
          );
        }

        return <RestaurantApp activeRestaurant={resolvedTenant} onLogout={() => handleLogout('/login')} onNavigate={navigateTo} />;
      }

      // 7. Settings / Tenant Management Dashboard
      if (tenantApp === 'SETTINGS') {
        if (!currentUser) {
          return (
            <RoleLoginPage
              portal="restaurant"
              onNavigate={navigateTo}
              onLoginSuccess={async (_role, user) => {
                if (user) setCurrentUser(user);
                navigateTo(cleanPath || '/restaurant/dashboard');
              }}
            />
          );
        }

        const isAuthorizedOwner =
          currentUser.role === 'SUPER_ADMIN' ||
          (currentUser.restaurantId === resolvedTenant.id && ['OWNER', 'RESTAURANT_OWNER', 'MANAGER'].includes(currentUser.role)) ||
          (currentUser.email && (
            resolvedTenant.email?.toLowerCase() === currentUser.email.toLowerCase() ||
            (resolvedTenant as any).ownerEmail?.toLowerCase() === currentUser.email.toLowerCase() ||
            (resolvedTenant as any).owner_email?.toLowerCase() === currentUser.email.toLowerCase()
          ));

        if (!isAuthorizedOwner) {
          return (
            <AccessDeniedScreen
              tenantName={resolvedTenant.name}
              requiredRole="RESTAURANT OWNER"
              onLogout={() => handleLogout('/login')}
            />
          );
        }

        return <RestaurantApp activeRestaurant={resolvedTenant} onLogout={() => handleLogout('/login')} onNavigate={navigateTo} />;
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
    if (authState === 'INITIALIZING' && !['/', '/landing', '/home', '/about', '/contact', '/terms', '/privacy', '/features', '/customer'].includes(cleanPath)) {
      return (
        <LoadingScreen
          restaurantName={resolvedTenant?.name}
          status="Opening your workspace"
          substatus="Validating credentials..."
        />
      );
    }

    // 0.2. Explicit non-blocking error boundary for auth failures
    if (authState === 'ERROR' && !['/', '/landing', '/home', '/about', '/contact', '/terms', '/privacy', '/features', '/customer'].includes(cleanPath)) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-center">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Authentication Error</h2>
          <p className="text-slate-400 max-w-md mb-6">
            {authError?.message || 'Unable to communicate with the authentication service. Please verify your connection.'}
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => authStateMachine.setInitializing(4000)}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-medium transition-colors shadow-lg flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Connection
            </button>
            <button
              onClick={() => {
                authStateMachine.setUnauthenticated();
                navigateTo('/restaurant/login');
              }}
              className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-colors"
            >
              Proceed to Sign In
            </button>
          </div>
        </div>
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

    if (cleanPath === '/signup' || cleanPath === '/onboard') {
      return (
        <RestaurantSignupPage onNavigate={navigateTo} />
      );
    }

    if (cleanPath === '/register') {
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
              window.location.href = getTenantUrl(updated, '/restaurant/dashboard');
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
      return <PlatformApp onLogout={() => handleLogout('/admin/login')} />;
    }

    // 8. Restaurant OS & Operational Terminals on PLATFORM DOMAIN (Root Domain Redirect)
    // Section 1, 5, 8, 9: Restaurant management & operational terminal routes belong exclusively on tenant domains (https://<slug>.dinely.food).
    // When visited on the platform domain (dinely.food), redirect to canonical tenant domain or workspace selector.
    if (
      cleanPath === '/restaurant' ||
      cleanPath.startsWith('/restaurant/') ||
      cleanPath === '/owner' ||
      cleanPath.startsWith('/owner/') ||
      cleanPath === '/dashboard' ||
      cleanPath === '/operations' ||
      cleanPath.startsWith('/operations/') ||
      cleanPath === '/kitchen' ||
      cleanPath.startsWith('/kitchen/') ||
      cleanPath === '/waiter' ||
      cleanPath.startsWith('/waiter/') ||
      cleanPath === '/bar' ||
      cleanPath.startsWith('/bar/') ||
      cleanPath === '/inventory' ||
      cleanPath.startsWith('/inventory/') ||
      cleanPath === '/billing' ||
      cleanPath.startsWith('/billing/') ||
      cleanPath === '/menu' ||
      cleanPath.startsWith('/menu/') ||
      cleanPath === '/floorplan' ||
      cleanPath.startsWith('/floorplan/') ||
      cleanPath === '/tables' ||
      cleanPath.startsWith('/tables/') ||
      cleanPath === '/staff' ||
      cleanPath.startsWith('/staff/') ||
      cleanPath === '/reports' ||
      cleanPath.startsWith('/reports/') ||
      cleanPath === '/settings' ||
      cleanPath.startsWith('/settings/')
    ) {
      if (!currentUser) {
        return (
          <RoleLoginPage
            portal="restaurant"
            onNavigate={navigateTo}
            onLoginSuccess={async (_, user) => {
              setCurrentUser(user);
              try {
                const myRests = await api.getOwnerRestaurants(user?.email, user?.id);
                if (!myRests || myRests.length === 0) {
                  navigateTo('/wizard?mode=create');
                } else if (myRests.length === 1) {
                  const onlyRest = myRests[0];
                  await api.switchActiveRestaurant(onlyRest.id);
                  const isLive =
                    onlyRest.isApproved !== false &&
                    onlyRest.lifecycleStatus !== 'PENDING_APPROVAL' &&
                    onlyRest.lifecycleStatus !== 'REJECTED';
                  if (isLive) {
                    window.location.href = getTenantUrl(onlyRest, cleanPath.startsWith('/restaurant') ? cleanPath : '/restaurant/dashboard');
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

      return (
        <PlatformTenantRedirector
          user={currentUser}
          targetPath={cleanPath}
          onNavigate={navigateTo}
          onLogout={() => handleLogout('/restaurant/login')}
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
  }, [cleanPath, currentUser, currentRestaurant, kitchenOrders, activeOwnerData, checkWorkspaceAccess, navigateTo, handleLogout, domainResolution, resolvedTenant, tenantResolutionState, authState, authError]);

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
