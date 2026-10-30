import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ThemeProvider } from './packages/theme/ThemeEngine';
import { ErrorBoundary, DinelyLogo, LoadingScreen, AccessDeniedScreen } from './packages/ui';
import { api, getPortalScopeFromPath } from './packages/api/client';
import { realtimeBus } from './packages/api/realtime';
import { canAccessWorkspace, isModuleEnabled, WorkspaceType, Restaurant, User } from './packages/types';
import { navigate, getCleanPath, NavigationProvider } from './packages/router';
import { firebaseAuth, signOutFirebase, authStateMachine, type AuthState, type AuthErrorDetails } from './packages/auth/firebase';
import { getTenantFromHostname, resolveTenantAppFromPath, getTenantUrl, getSharedTenantCookie, setSharedTenantCookie } from './packages/utils/tenantResolver';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

// Lazy-loaded route bundles for optimal bundle size and instantaneous initial load
const LandingWebsite = lazy(() => import('./apps/landing/LandingWebsite').then(m => ({ default: m.LandingWebsite })));
const PlatformApp = lazy(() => import('./apps/platform/PlatformApp').then(m => ({ default: m.PlatformApp })));
const RestaurantApp = lazy(() => import('./apps/restaurant/RestaurantApp').then(m => ({ default: m.RestaurantApp })));
const CustomerApp = lazy(() => import('./apps/customer/CustomerApp').then(m => ({ default: m.CustomerApp })));
const WaiterTerminalOS = lazy(() => import('./apps/waiter/WaiterTerminalOS').then(m => ({ default: m.WaiterTerminalOS })));
const KitchenETADashboard = lazy(() => import('./apps/restaurant/KitchenETADashboard').then(m => ({ default: m.KitchenETADashboard })));
const BarTerminal = lazy(() => import('./apps/bar/BarTerminal').then(m => ({ default: m.BarTerminal })));
const HookahTerminal = lazy(() => import('./apps/hookah/HookahTerminal').then(m => ({ default: m.HookahTerminal })));
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
const WeddingGuestApp = lazy(() => import('./apps/wedding/WeddingGuestApp').then(m => ({ default: m.WeddingGuestApp })));
const WeddingEventPortal = lazy(() => import('./apps/wedding/WeddingEventPortal').then(m => ({ default: m.WeddingEventPortal })));
const WeddingLandingPage = lazy(() => import('./apps/wedding/WeddingLandingPage').then(m => ({ default: m.WeddingLandingPage })));
const BusinessHub = lazy(() => import('./apps/hub/BusinessHub').then(m => ({ default: m.BusinessHub })));
const BarApp = lazy(() => import('./apps/bar/BarApp').then(m => ({ default: m.BarApp })));
const CartApp = lazy(() => import('./apps/cart/CartApp').then(m => ({ default: m.CartApp })));
const CartCustomerApp = lazy(() => import('./apps/cart/CartCustomerApp').then(m => ({ default: m.CartCustomerApp })));

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

        // Explicit Staff Guard: Staff accounts NEVER enter Owner Workspace selection
        const isStaffUser = (user as any)?.scope === 'STAFF' ||
          ['WAITER', 'KITCHEN', 'CHEF', 'COOK', 'BAR', 'BARTENDER', 'HOOKAH', 'SHISHA', 'INVENTORY', 'CASHIER'].includes(user?.role as string);

        if (isStaffUser) {
          const r = (user?.role || '').toUpperCase();
          const terminalRoute = (
            r === 'WAITER' ? '/waiter' :
            r === 'CHEF' || r === 'KITCHEN' || r === 'COOK' ? '/kitchen' :
            r === 'BAR' || r === 'BARTENDER' ? '/bar' :
            r === 'HOOKAH' || r === 'SHISHA' ? '/hookah' :
            r === 'INVENTORY' ? '/inventory' : '/waiter'
          );

          const matchingRest = api.restaurants.find((res) => res.id === user?.restaurantId);
          const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.endsWith('.localhost'));
          if (!isDev && matchingRest?.slug) {
            window.location.replace(`https://${matchingRest.slug}.dinely.food${terminalRoute}`);
            return;
          }
          onNavigate(terminalRoute);
          return;
        }

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
            await api.switchActiveRestaurant(onlyRest.id);
            api.setCurrentRestaurantId(onlyRest.id);
            onNavigate('/restaurant/pending-approval');
            return;
          }

          const isStaffRoute = ['/waiter', '/kitchen', '/bar', '/hookah', '/shisha', '/inventory', '/billing'].some((r) => targetPath.startsWith(r));
          const finalPath = targetPath.startsWith('/restaurant') || isStaffRoute ? targetPath : '/restaurant/dashboard';
          const targetUrl = getTenantUrl(onlyRest, finalPath);
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
  }, [user?.email, user?.id, (user as any)?.scope, user?.role, targetPath, onNavigate]);

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
          const isStaffRoute = ['/waiter', '/kitchen', '/bar', '/hookah', '/shisha', '/inventory', '/billing'].some((r) => targetPath.startsWith(r));
          const finalPath = targetPath.startsWith('/restaurant') || isStaffRoute ? targetPath : '/restaurant/dashboard';
          window.location.href = getTenantUrl(rest, finalPath);
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
    const existing = api.getCurrentUser(getPortalScopeFromPath(p));
    if (existing) return existing;
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const token = searchParams.get('auth_token') || getSharedTenantCookie('dinely_auth_token') || localStorage.getItem('dinely_auth_token');
      if (token) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const uid = payload.uid || payload.sub || payload.user_id;
            const email = payload.email || '';
            const role = (payload.role || 'RESTAURANT_OWNER').toUpperCase();
            const name = payload.name || (email ? email.split('@')[0] : 'Operator');
            const hydrated = { id: uid, email, name, role, scope: 'OWNER' } as any;
            api.setCurrentUser(hydrated, 'OWNER');
            return hydrated;
          }
        } catch (_) {}
      }
    }
    return null;
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

  // Synchronize cross-tenant handoff tokens, shared cookies, and active business identity
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const queryToken = searchParams.get('auth_token');
    const cookieToken = getSharedTenantCookie('dinely_auth_token');
    const effectiveToken = queryToken || cookieToken;

    if (effectiveToken) {
      if (!localStorage.getItem('dinely_auth_token')) {
        localStorage.setItem('dinely_auth_token', effectiveToken);
      }
      if (!sessionStorage.getItem('dinely_auth_token')) {
        sessionStorage.setItem('dinely_auth_token', effectiveToken);
      }
      api.setSessionTokens({
        accessToken: effectiveToken,
        refreshToken: effectiveToken,
        expiresIn: 86400,
        tokenType: 'Bearer',
      });
      setSharedTenantCookie('dinely_auth_token', effectiveToken);

      // Hydrate owner user from token claims immediately so protected workspace renders without flashing login
      try {
        const parts = effectiveToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          const uid = payload.uid || payload.sub || payload.user_id;
          const email = payload.email || '';
          const role = (payload.role || 'RESTAURANT_OWNER').toUpperCase();
          const name = payload.name || (email ? email.split('@')[0] : 'Operator');
          const ownerUser: User = {
            id: uid,
            email,
            name,
            role,
          };
          (ownerUser as any).scope = 'OWNER';
          (ownerUser as any).googleUid = uid;
          api.setCurrentUser(ownerUser, 'OWNER');
          setCurrentUser(ownerUser);
          authStateMachine.setAuthenticated(ownerUser, effectiveToken);
        }
      } catch (e) {
        console.warn('[App] Could not decode token claims:', e);
      }
    }

    const queryBizId = searchParams.get('bizId');
    const cookieBizId = getSharedTenantCookie('dinely_active_restaurant_id');
    const effectiveBizId = queryBizId || cookieBizId;
    if (effectiveBizId) {
      api.setCurrentRestaurantId(effectiveBizId);
      localStorage.setItem('dinely_active_restaurant_id', effectiveBizId);
      sessionStorage.setItem('dinely_active_restaurant_id', effectiveBizId);
    }

    // Clean up handoff tokens from browser address bar
    if (queryToken || queryBizId) {
      searchParams.delete('auth_token');
      searchParams.delete('bizId');
      const newQuery = searchParams.toString();
      const cleanUrl = window.location.pathname + (newQuery ? `?${newQuery}` : '') + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
    }
  }, []);

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

          // Clear any stale staff session tokens so they never conflict with authenticated owner/admin
          if (typeof window !== 'undefined') {
            localStorage.removeItem('dinely_staff_token');
            sessionStorage.removeItem('dinely_staff_token');
            localStorage.removeItem('dinely_user_staff');
            sessionStorage.removeItem('dinely_user_staff');
            localStorage.setItem('dinely_active_scope', isAdmin ? 'ADMIN' : 'OWNER');
          }

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

          const effectiveScope = isAdmin ? 'ADMIN' : (scope === 'STAFF' ? 'OWNER' : scope);
          let appUser = api.getCurrentUser(effectiveScope);
          if (!appUser) {
            appUser = {
              id: fbUser.uid,
              name: fbUser.displayName || fbUser.email.split('@')[0],
              email: lowerEmail,
              role: isAdmin ? 'PLATFORM_ADMIN' : 'RESTAURANT_OWNER',
            };
            (appUser as any).googleUid = fbUser.uid;
            (appUser as any).scope = effectiveScope;
            api.setCurrentUser(appUser, effectiveScope);
          } else {
            appUser.id = fbUser.uid;
            (appUser as any).googleUid = fbUser.uid;
            (appUser as any).scope = effectiveScope;
          }
          if (token) {
            api.setSessionTokens({ accessToken: token, refreshToken: token, expiresIn: 3600, tokenType: 'Bearer' }, effectiveScope);
            authStateMachine.setAuthenticated(appUser, token);
            // Authoritative server-side profile & tenant restoration from AWS RDS
            api.fetchAuthMe(token).then((authMe) => {
              if (authMe?.restaurant) {
                if (!appUser.restaurantId) {
                  appUser.restaurantId = (domainResolution.isTenantSubdomain && resolvedTenant?.id) ? resolvedTenant.id : authMe.restaurant.id;
                  api.setCurrentUser(appUser, effectiveScope);
                  setCurrentUser({ ...appUser });
                }
                // On tenant subdomains (e.g. the-start.dinely.food), the hostname is authoritative.
                // Only hydrate global restaurant state if on platform domain (dinely.food)
                if (!domainResolution.isTenantSubdomain) {
                  if (!api.getCurrentRestaurantId()) {
                    setCurrentRestaurant(authMe.restaurant);
                    api.setCurrentRestaurantId(authMe.restaurant.id);
                  }
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
      } else if (
        currentPath.startsWith('/event') ||
        currentPath.startsWith('/events') ||
        currentPath === '/wedding/guest' ||
        currentPath.startsWith('/wedding/guest/')
      ) {
        // Do not redirect event banquet guests to restaurant management login
        return;
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
    try {
      await signOutFirebase();
    } catch (_) {}
    api.clearAllAuthSessions();
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

      // Guard protected routes on tenant subdomain while Firebase Auth initializes session
      const isPublicTenantRoute =
        cleanPath === '/' ||
        cleanPath === '/customer' ||
        cleanPath.startsWith('/customer/') ||
        cleanPath === '/menu' ||
        cleanPath.startsWith('/menu/') ||
        cleanPath === '/cart/menu' ||
        cleanPath.startsWith('/cart/menu/') ||
        (cleanPath.startsWith('/cart/') && cleanPath.endsWith('/menu')) ||
        cleanPath === '/table' ||
        cleanPath.startsWith('/table/') ||
        cleanPath === '/order' ||
        cleanPath.startsWith('/order/') ||
        cleanPath.startsWith('/event') ||
        cleanPath.startsWith('/wedding') ||
        cleanPath === '/login' ||
        cleanPath.endsWith('/login');

      if (authState === 'INITIALIZING' && !isPublicTenantRoute) {
        return (
          <LoadingScreen
            restaurantName={resolvedTenant?.name}
            status="Opening your workspace"
            substatus="Validating credentials..."
          />
        );
      }

      // Inside Resolved Tenant: Route by Path to the corresponding Tenant Application
      const tenantApp = resolveTenantAppFromPath(cleanPath);

      // 0. Dedicated Wedding & Events Operations Login
      if (
        cleanPath === '/weddings/login' ||
        cleanPath === '/wedding/login' ||
        cleanPath === '/events/login' ||
        cleanPath === '/event/login'
      ) {
        return (
          <RoleLoginPage
            portal="event"
            onNavigate={navigateTo}
            onLoginSuccess={(_, user) => {
              setCurrentUser(user);
              const r = (user?.role || '').toUpperCase();
              const target = (
                r === 'CHEF' || r === 'KITCHEN' || r === 'COOK' ? '/weddings/dashboard?tab=kitchen' :
                r === 'BAR' || r === 'BARTENDER' ? '/weddings/dashboard?tab=bar' :
                r === 'HOOKAH' || r === 'SHISHA' ? '/weddings/dashboard?tab=hookah' :
                r === 'WAITER' || r === 'RUNNER' ? '/weddings/dashboard?tab=runner' :
                '/weddings/dashboard'
              );
              navigateTo(target);
            }}
          />
        );
      }

      // 0.05. Dedicated Wedding & Events Independent Operations Portal
      if (
        tenantApp === 'EVENT_PORTAL' ||
        (resolvedTenant.businessType === 'WEDDING_ORDERING' && (tenantApp === 'SETTINGS' || cleanPath.startsWith('/restaurant') || cleanPath === '/dashboard'))
      ) {
        if (!currentUser) {
          return (
            <RoleLoginPage
              portal="event"
              onNavigate={navigateTo}
              onLoginSuccess={(_, user) => {
                setCurrentUser(user);
                const r = (user?.role || '').toUpperCase();
                const target = (
                  r === 'CHEF' || r === 'KITCHEN' || r === 'COOK' ? '/weddings/dashboard?tab=kitchen' :
                  r === 'BAR' || r === 'BARTENDER' ? '/weddings/dashboard?tab=bar' :
                  r === 'HOOKAH' || r === 'SHISHA' ? '/weddings/dashboard?tab=hookah' :
                  r === 'WAITER' || r === 'RUNNER' ? '/weddings/dashboard?tab=runner' :
                  '/weddings/dashboard'
                );
                navigateTo(target);
              }}
            />
          );
        }

        return (
          <WeddingEventPortal
            activeRestaurant={resolvedTenant}
            currentUser={currentUser}
            onLogout={() => handleLogout('/weddings/login')}
            onNavigate={navigateTo}
          />
        );
      }


      // 0.07. Dedicated Small Cart Operating System
      if (
        tenantApp === 'CART_OS' ||
        ((resolvedTenant.businessType === 'SMALL_CART' || resolvedTenant.businessType === 'FOOD_CART' || resolvedTenant.businessType === 'FOOD_TRUCK' || (resolvedTenant as any).osType === 'CART_OS') && (tenantApp === 'SETTINGS' || cleanPath.startsWith('/restaurant') || cleanPath === '/dashboard'))
      ) {
        return (
          <CartApp
            business={resolvedTenant}
            onNavigate={navigateTo}
            onLogout={() => handleLogout('/cart/login')}
          />
        );
      }

      // 0.08. Central Business Hub
      if (tenantApp === 'HUB' || cleanPath === '/hub' || cleanPath.startsWith('/hub/')) {
        return (
          <BusinessHub
            user={currentUser}
            onNavigate={navigateTo}
            onLogout={() => handleLogout('/login')}
          />
        );
      }

      // 0.1 Weddings & Events Luxury Guest Application
      if (
        tenantApp === 'WEDDING' ||
        cleanPath.startsWith('/wedding/guest') ||
        (resolvedTenant.businessType === 'WEDDING_ORDERING' && tenantApp === 'CUSTOMER')
      ) {
        return <WeddingGuestApp />;
      }

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

        const isCart = (
          resolvedTenant.businessType === 'SMALL_CART' ||
          resolvedTenant.businessType === 'FOOD_CART' ||
          resolvedTenant.businessType === 'FOOD_TRUCK' ||
          resolvedTenant.businessType === 'FOOD_TRUCK_STREET_FOOD' ||
          (resolvedTenant as any).osType === 'CART_OS'
        );
        if (isCart) {
          return (
            <CartCustomerApp
              business={resolvedTenant}
              onNavigateStaff={() => navigateTo('/cart')}
            />
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
            restaurant={resolvedTenant}
            onLogout={() => handleLogout('/staff/login')}
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

        return <WaiterTerminalOS restaurant={resolvedTenant} onLogout={() => handleLogout('/staff/login')} />;
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

        return <BarTerminal restaurant={resolvedTenant} onLogout={() => handleLogout('/staff/login')} />;
      }

      // 4.5. Hookah & Shisha Terminal
      if (tenantApp === 'HOOKAH') {
        if (!isModuleEnabled(resolvedTenant, 'hookah')) {
          return (
            <ModuleNotEnabledPage
              moduleName="Hookah & Shisha Terminal"
              restaurant={resolvedTenant}
              onNavigate={navigateTo}
            />
          );
        }

        if (!currentUser) {
          return (
            <RoleLoginPage
              portal="hookah"
              onNavigate={navigateTo}
              onLoginSuccess={(_, user) => {
                setCurrentUser(user);
                navigateTo('/hookah');
              }}
            />
          );
        }

        const isAuthorizedStaff =
          currentUser.role === 'SUPER_ADMIN' ||
          (currentUser.restaurantId === resolvedTenant.id && ['HOOKAH', 'SHISHA', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'].includes(currentUser.role)) ||
          (currentUser.email && (resolvedTenant.email?.toLowerCase() === currentUser.email.toLowerCase() || (resolvedTenant as any).ownerEmail?.toLowerCase() === currentUser.email.toLowerCase()));

        if (!isAuthorizedStaff) {
          return (
            <AccessDeniedScreen
              tenantName={resolvedTenant.name}
              requiredRole="HOOKAH STAFF"
              onLogout={() => handleLogout('/login')}
            />
          );
        }

        return <HookahTerminal restaurant={resolvedTenant} onLogout={() => handleLogout('/staff/login')} />;
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

        return <InventoryTerminalOS restaurant={resolvedTenant} onLogout={() => handleLogout('/staff/login')} />;
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
          (resolvedTenant.ownerUid && (currentUser.id === resolvedTenant.ownerUid || (currentUser as any).googleUid === resolvedTenant.ownerUid)) ||
          ((resolvedTenant as any).owner_uid && (currentUser.id === (resolvedTenant as any).owner_uid || (currentUser as any).googleUid === (resolvedTenant as any).owner_uid)) ||
          (currentUser.email && (
            resolvedTenant.email?.toLowerCase().trim() === currentUser.email.toLowerCase().trim() ||
            resolvedTenant.ownerEmail?.toLowerCase().trim() === currentUser.email.toLowerCase().trim() ||
            (resolvedTenant as any).owner_email?.toLowerCase().trim() === currentUser.email.toLowerCase().trim()
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

      // 7. Settings / Tenant Management Dashboard (OWNER OS)
      if (tenantApp === 'SETTINGS') {
        // 1. If unauthenticated, render RoleLoginPage for restaurant owner
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

        // 2. Direct Staff Access Check: Authenticated operational staff accounts MUST NEVER access Owner OS
        const isStaffUser = Boolean(
          currentUser &&
          ((currentUser as any)?.scope === 'STAFF' ||
            ['WAITER', 'KITCHEN', 'CHEF', 'COOK', 'BAR', 'BARTENDER', 'INVENTORY', 'CASHIER'].includes(
              (currentUser?.role || '').toUpperCase()
            )) &&
          !['OWNER', 'RESTAURANT_OWNER', 'SUPER_ADMIN', 'PLATFORM_ADMIN'].includes((currentUser?.role || '').toUpperCase())
        );

        if (isStaffUser) {
          return (
            <AccessDeniedScreen
              tenantName={resolvedTenant.name}
              requiredRole="RESTAURANT OWNER (STAFF ACCESS PROHIBITED)"
              onLogout={() => handleLogout('/staff/login')}
            />
          );
        }

        // 3. Purge any stale staff remnants in storage since an owner/admin is active
        if (typeof window !== 'undefined') {
          if (localStorage.getItem('dinely_active_scope') === 'STAFF') {
            localStorage.setItem('dinely_active_scope', 'OWNER');
          }
          localStorage.removeItem('dinely_staff_token');
          sessionStorage.removeItem('dinely_staff_token');
          localStorage.removeItem('dinely_user_staff');
          sessionStorage.removeItem('dinely_user_staff');
          ['staff', 'waiter', 'kitchen', 'bar', 'inventory'].forEach((role) => {
            localStorage.removeItem(`dinely_staff_token_${role}`);
            sessionStorage.removeItem(`dinely_staff_token_${role}`);
            localStorage.removeItem(`dinely_session_${role}`);
            sessionStorage.removeItem(`dinely_session_${role}`);
            localStorage.removeItem(`dinely_user_${role}`);
            sessionStorage.removeItem(`dinely_user_${role}`);
          });
        }

        // 4. Verify Owner / Platform Admin Authorization for this specific restaurant tenant
        const isAuthorizedOwner =
          currentUser.role === 'SUPER_ADMIN' ||
          currentUser.role === 'PLATFORM_ADMIN' ||
          ((currentUser as any)?.scope !== 'STAFF' &&
            ['OWNER', 'RESTAURANT_OWNER', 'MANAGER'].includes((currentUser.role || '').toUpperCase()) &&
            (currentUser.restaurantId === resolvedTenant.id || currentUser.restaurantId === resolvedTenant.slug)) ||
          ((currentUser as any)?.scope !== 'STAFF' &&
            (
              (resolvedTenant.ownerUid && (currentUser.id === resolvedTenant.ownerUid || (currentUser as any).googleUid === resolvedTenant.ownerUid)) ||
              ((resolvedTenant as any).owner_uid && (currentUser.id === (resolvedTenant as any).owner_uid || (currentUser as any).googleUid === (resolvedTenant as any).owner_uid)) ||
              (currentUser.email && (
                resolvedTenant.email?.toLowerCase().trim() === currentUser.email.toLowerCase().trim() ||
                resolvedTenant.ownerEmail?.toLowerCase().trim() === currentUser.email.toLowerCase().trim() ||
                (resolvedTenant as any).owner_email?.toLowerCase().trim() === currentUser.email.toLowerCase().trim()
              ))
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

        // 5. Enforce approval status: Unapproved restaurants cannot access the live operational dashboard
        const isLive =
          resolvedTenant.lifecycleStatus === 'LIVE' ||
          resolvedTenant.lifecycleStatus === 'APPROVED' ||
          (resolvedTenant.isApproved === true &&
            resolvedTenant.lifecycleStatus !== 'PENDING_APPROVAL' &&
            resolvedTenant.lifecycleStatus !== 'REJECTED' &&
            resolvedTenant.lifecycleStatus !== 'ARCHIVED' &&
            resolvedTenant.lifecycleStatus !== 'SUSPENDED');

        if (!isLive) {
          return (
            <PendingApprovalPage
              restaurantId={resolvedTenant.id}
              onNavigate={navigateTo}
              onLogout={() => handleLogout('/login')}
            />
          );
        }

        return <RestaurantApp activeRestaurant={resolvedTenant} onLogout={() => handleLogout('/login')} onNavigate={navigateTo} />;
      }

      // 8. Staff Auth inside tenant
      if (
        cleanPath === '/staff/login' ||
        cleanPath === '/staff' ||
        cleanPath === '/staff/signin' ||
        cleanPath === '/staff-login'
      ) {
        return (
          <RoleLoginPage
            portal="staff"
            onNavigate={navigateTo}
            onLoginSuccess={(_, user) => {
              setCurrentUser(user);
              const r = (user?.role || '').toUpperCase();
              const target = (
                r === 'WAITER' ? '/waiter' :
                r === 'CHEF' || r === 'KITCHEN' ? '/kitchen' :
                r === 'BAR' || r === 'BARTENDER' ? '/bar' :
                r === 'HOOKAH' || r === 'SHISHA' ? '/hookah' :
                r === 'INVENTORY' ? '/inventory' : '/billing'
              );
              navigateTo(target);
            }}
          />
        );
      }

      // 8.1 Owner Auth inside tenant
      if (tenantApp === 'AUTH') {
        return (
          <AuthPage
            initialMode="login"
            onNavigate={navigateTo}
            onLoginSuccess={async (res) => {
              const user = res?.user || res;
              if (user) setCurrentUser(user);
              navigateTo('/restaurant/dashboard');
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

    // Exempt public marketing and authentication routes from blocking auth guards
    const isPublicOrAuthPath =
      cleanPath === '/' ||
      cleanPath === '/landing' ||
      cleanPath === '/home' ||
      cleanPath === '/about' ||
      cleanPath === '/contact' ||
      cleanPath === '/terms' ||
      cleanPath === '/privacy' ||
      cleanPath === '/features' ||
      cleanPath === '/customer' ||
      cleanPath.startsWith('/customer/') ||
      cleanPath.startsWith('/event') ||
      cleanPath.startsWith('/wedding') ||
      cleanPath === '/auth' ||
      cleanPath === '/login' ||
      cleanPath === '/signin' ||
      cleanPath === '/restaurant/login' ||
      cleanPath === '/owner/login' ||
      cleanPath === '/manager/login' ||
      cleanPath === '/signup' ||
      cleanPath === '/onboard' ||
      cleanPath === '/register' ||
      cleanPath === '/restaurant/register' ||
      cleanPath === '/restaurant/pending-approval' ||
      cleanPath === '/pending-approval' ||
      cleanPath === '/role-login' ||
      cleanPath === '/staff/login' ||
      cleanPath === '/staff' ||
      cleanPath === '/staff/signin' ||
      cleanPath === '/staff-login' ||
      cleanPath === '/admin/login' ||
      cleanPath.endsWith('/login');

    // 0.1. Guard protected routes while Firebase Auth initializes session
    if (authState === 'INITIALIZING' && !isPublicOrAuthPath) {
      return (
        <LoadingScreen
          restaurantName={resolvedTenant?.name}
          status="Opening your workspace"
          substatus="Validating credentials..."
        />
      );
    }

    // 0.2. Explicit non-blocking error boundary for auth failures on protected routes
    if (authState === 'ERROR' && !isPublicOrAuthPath) {
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
          onStaffLogin={() => navigateTo('/staff/login')}
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
            navigateTo('/bar');
          }}
        />
      );
    }

    if (cleanPath === '/hookah/login' || cleanPath === '/shisha/login') {
      return (
        <RoleLoginPage
          portal="hookah"
          onNavigate={navigateTo}
          onLoginSuccess={(_, user) => {
            setCurrentUser(user);
            navigateTo('/hookah');
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

    if (
      cleanPath === '/staff/login' ||
      cleanPath === '/staff' ||
      cleanPath === '/staff/signin' ||
      cleanPath === '/staff-login'
    ) {
      return (
        <RoleLoginPage
          portal="staff"
          onNavigate={navigateTo}
          onLoginSuccess={(_, user) => {
            setCurrentUser(user);
            const r = (user?.role || '').toUpperCase();
            const target = (
              r === 'WAITER' ? '/waiter' :
              r === 'CHEF' || r === 'KITCHEN' ? '/kitchen' :
              r === 'BAR' || r === 'BARTENDER' ? '/bar' :
              r === 'HOOKAH' || r === 'SHISHA' ? '/hookah' :
              r === 'INVENTORY' ? '/inventory' : '/billing'
            );
            navigateTo(target);
          }}
        />
      );
    }

    if (
      cleanPath === '/weddings/login' ||
      cleanPath === '/wedding/login' ||
      cleanPath === '/events/login' ||
      cleanPath === '/event/login'
    ) {
      return (
        <RoleLoginPage
          portal="event"
          onNavigate={navigateTo}
          onLoginSuccess={(_, user) => {
            setCurrentUser(user);
            const r = (user?.role || '').toUpperCase();
            const target = (
              r === 'CHEF' || r === 'KITCHEN' || r === 'COOK' ? '/weddings/dashboard?tab=kitchen' :
              r === 'BAR' || r === 'BARTENDER' ? '/weddings/dashboard?tab=bar' :
              r === 'HOOKAH' || r === 'SHISHA' ? '/weddings/dashboard?tab=hookah' :
              r === 'WAITER' || r === 'RUNNER' ? '/weddings/dashboard?tab=runner' :
              '/weddings/dashboard'
            );
            navigateTo(target);
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
            if (setupData?.id) {
              api.setCurrentRestaurantId(setupData.id);
              api.switchActiveRestaurant(setupData.id);
            }
            if (setupData) {
              setCurrentRestaurant(setupData);
            }
            const bType = String(setupData?.business_type || setupData?.businessType || '').toUpperCase();
            if (bType.includes('WEDDING') || bType.includes('EVENT')) {
              navigateTo('/weddings/dashboard');
            } else if (bType.includes('CART') || bType.includes('TRUCK')) {
              navigateTo('/cart/dashboard');
            } else {
              navigateTo('/restaurant/pending-approval');
            }
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
          restaurantId={currentRestaurant?.id || api.getCurrentRestaurantId() || undefined}
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

    // 7.5. Weddings & Events Platform Product & Guest Application
    if (
      cleanPath === '/events/portal' ||
      cleanPath.startsWith('/events/portal/') ||
      cleanPath === '/event/portal' ||
      cleanPath.startsWith('/event/portal/') ||
      cleanPath === '/weddings/portal' ||
      cleanPath.startsWith('/weddings/portal/') ||
      cleanPath === '/wedding/portal' ||
      cleanPath.startsWith('/wedding/portal/') ||
      cleanPath === '/events/dashboard' ||
      cleanPath.startsWith('/events/dashboard/') ||
      cleanPath === '/event/dashboard' ||
      cleanPath.startsWith('/event/dashboard/') ||
      cleanPath === '/weddings/dashboard' ||
      cleanPath.startsWith('/weddings/dashboard/') ||
      cleanPath === '/wedding/dashboard' ||
      cleanPath.startsWith('/wedding/dashboard/') ||
      cleanPath === '/weddings/events' ||
      cleanPath.startsWith('/weddings/events/') ||
      cleanPath === '/weddings/terminals' ||
      cleanPath.startsWith('/weddings/terminals/') ||
      cleanPath === '/weddings/food-menu' ||
      cleanPath.startsWith('/weddings/food-menu/') ||
      cleanPath === '/weddings/menu' ||
      cleanPath.startsWith('/weddings/menu/') ||
      cleanPath === '/weddings/orders' ||
      cleanPath.startsWith('/weddings/orders/') ||
      cleanPath === '/weddings/kitchen' ||
      cleanPath.startsWith('/weddings/kitchen/') ||
      cleanPath === '/weddings/bar' ||
      cleanPath.startsWith('/weddings/bar/') ||
      cleanPath === '/weddings/hookah' ||
      cleanPath.startsWith('/weddings/hookah/') ||
      cleanPath === '/weddings/assistance' ||
      cleanPath.startsWith('/weddings/assistance/') ||
      cleanPath === '/weddings/guests' ||
      cleanPath.startsWith('/weddings/guests/') ||
      cleanPath === '/weddings/tables' ||
      cleanPath.startsWith('/weddings/tables/') ||
      cleanPath === '/weddings/billing' ||
      cleanPath.startsWith('/weddings/billing/') ||
      cleanPath === '/weddings/settings' ||
      cleanPath.startsWith('/weddings/settings/') ||
      cleanPath === '/weddings/staff' ||
      cleanPath.startsWith('/weddings/staff/') ||
      cleanPath === '/weddings/day-management' ||
      cleanPath.startsWith('/weddings/day-management/') ||
      cleanPath === '/events/command-center' ||
      cleanPath.startsWith('/events/command-center/') ||
      cleanPath === '/events/day-management' ||
      cleanPath.startsWith('/events/day-management/') ||
      cleanPath === '/events/tables' ||
      cleanPath.startsWith('/events/tables/') ||
      cleanPath === '/events/menu' ||
      cleanPath.startsWith('/events/menu/') ||
      cleanPath === '/events/kitchen' ||
      cleanPath.startsWith('/events/kitchen/') ||
      cleanPath === '/events/runner' ||
      cleanPath.startsWith('/events/runner/') ||
      cleanPath === '/events/bar' ||
      cleanPath.startsWith('/events/bar/') ||
      cleanPath === '/events/hookah' ||
      cleanPath.startsWith('/events/hookah/') ||
      cleanPath === '/events/staff' ||
      cleanPath.startsWith('/events/staff/')
    ) {
      if (!currentUser) {
        return (
          <RoleLoginPage
            portal="event"
            onNavigate={navigateTo}
            onLoginSuccess={(_, user) => {
              setCurrentUser(user);
              navigateTo(cleanPath.includes('tab=') ? cleanPath : cleanPath === '/weddings/login' ? '/weddings/dashboard' : cleanPath);
            }}
          />
        );
      }
      return (
        <WeddingEventPortal
          activeRestaurant={currentRestaurant}
          currentUser={currentUser}
          onLogout={() => handleLogout('/weddings/login')}
          onNavigate={navigateTo}
        />
      );
    }

    if (
      cleanPath === '/weddings' ||
      cleanPath === '/weddings/' ||
      cleanPath === '/wedding-events' ||
      cleanPath === '/weddings/request' ||
      cleanPath === '/weddings/apply'
    ) {
      if (currentUser) {
        return (
          <WeddingEventPortal
            activeRestaurant={currentRestaurant}
            currentUser={currentUser}
            onLogout={() => handleLogout('/weddings/login')}
            onNavigate={navigateTo}
          />
        );
      }
      return (
        <WeddingLandingPage
          onNavigateHome={() => navigateTo('/')}
          onNavigateOrganizerLogin={() => navigateTo('/weddings/login')}
          onOpenDashboard={() => navigateTo('/weddings/dashboard')}
          onNavigateOrganizerDashboard={() => navigateTo('/weddings/dashboard')}
          onNavigate={navigateTo}
          currentUser={currentUser}
        />
      );
    }

    // Weddings & Luxury Events Guest Application (Platform or Root Domain Deep Link)
    if (
      cleanPath.startsWith('/event') ||
      cleanPath.startsWith('/events') ||
      cleanPath === '/wedding/guest' ||
      cleanPath.startsWith('/wedding/guest/')
    ) {
      return <WeddingGuestApp />;
    }

    // 7.6. Central Business Hub (Platform Domain)
    if (
      cleanPath === '/hub' ||
      cleanPath.startsWith('/hub/') ||
      cleanPath === '/hub/businesses/new'
    ) {
      return (
        <BusinessHub
          user={currentUser}
          onNavigate={navigateTo}
          onLogout={() => handleLogout('/login')}
        />
      );
    }

    // 7.7. Bar Management inside Restaurant & Bar OS (Platform Domain)
    if (
      cleanPath.startsWith('/bar/dashboard') ||
      cleanPath.startsWith('/bar/menu') ||
      cleanPath.startsWith('/bar/tabs') ||
      cleanPath.startsWith('/bar/inventory') ||
      cleanPath.startsWith('/bar/settings') ||
      cleanPath.startsWith('/bar/staff') ||
      cleanPath.startsWith('/bar/reports')
    ) {
      return (
        <RestaurantApp
          activeRestaurant={currentRestaurant}
          onLogout={() => handleLogout('/login')}
          onNavigate={navigateTo}
        />
      );
    }

    // 7.7. Dedicated Small Cart Customer Ordering Storefront (e.g. /cart/:id/menu, /cart/menu, /cart/storefront)
    if (
      cleanPath === '/cart/menu' ||
      cleanPath.startsWith('/cart/menu/') ||
      cleanPath === '/cart/storefront' ||
      cleanPath.startsWith('/cart/storefront/') ||
      (cleanPath.startsWith('/cart/') && (cleanPath.endsWith('/menu') || cleanPath.endsWith('/storefront')))
    ) {
      return (
        <CartCustomerApp
          business={currentRestaurant}
          onNavigateStaff={() => navigateTo('/cart')}
        />
      );
    }

    // 7.8. Dedicated Small Cart Operating System (Staff POS & Management)
    if (
      cleanPath.startsWith('/cart/dashboard') ||
      cleanPath.startsWith('/cart/pos') ||
      cleanPath.startsWith('/cart/settings') ||
      cleanPath.startsWith('/cart/orders') ||
      cleanPath === '/cart' ||
      cleanPath === '/cart/'
    ) {
      return (
        <CartApp
          business={currentRestaurant}
          onNavigate={navigateTo}
          onLogout={() => handleLogout('/cart/login')}
        />
      );
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
      cleanPath === '/hookah' ||
      cleanPath.startsWith('/hookah/') ||
      cleanPath === '/shisha' ||
      cleanPath.startsWith('/shisha/') ||
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
      const isStaffUser = (currentUser as any)?.scope === 'STAFF' ||
        ['WAITER', 'KITCHEN', 'CHEF', 'COOK', 'BAR', 'BARTENDER', 'HOOKAH', 'SHISHA', 'INVENTORY', 'CASHIER'].includes((currentUser?.role || '') as string);

      if (isStaffUser) {
        const r = (currentUser?.role || '').toUpperCase();
        const terminalRoute = (
          r === 'WAITER' ? '/waiter' :
          r === 'CHEF' || r === 'KITCHEN' || r === 'COOK' ? '/kitchen' :
          r === 'BAR' || r === 'BARTENDER' ? '/bar' :
          r === 'HOOKAH' || r === 'SHISHA' ? '/hookah' :
          r === 'INVENTORY' ? '/inventory' : '/waiter'
        );
        const matchingRest = api.restaurants.find((res) => res.id === currentUser?.restaurantId);
        const isDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.endsWith('.localhost'));
        if (!isDev && matchingRest?.slug) {
          window.location.replace(`https://${matchingRest.slug}.dinely.food${terminalRoute}`);
          return null;
        }
        navigateTo(terminalRoute);
        return null;
      }

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
                    const isStaffRoute = ['/waiter', '/kitchen', '/bar', '/hookah', '/shisha', '/inventory', '/billing'].some((r) => cleanPath.startsWith(r));
                    const finalTarget = cleanPath.startsWith('/restaurant') || isStaffRoute ? cleanPath : '/restaurant/dashboard';
                    window.location.href = getTenantUrl(onlyRest, finalTarget);
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

    // 15. Customer Mobile Ordering Web App (Deep Linking Support)
    if (
      cleanPath.startsWith('/customer') ||
      cleanPath.startsWith('/order') ||
      cleanPath.startsWith('/qr') ||
      cleanPath.startsWith('/menu')
    ) {
      return <CustomerApp />;
    }

    // 16. Exhaustive Fallback: Never render a blank screen!
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
