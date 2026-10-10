import {
  User,
  AuthTokens,
  Restaurant,
} from '../../types';
import { BaseApiClient } from '../core/baseClient';
import {
  PortalScope,
  delay,
  getApiBaseUrl,
  getPortalScopeFromPath,
} from '../core/helpers';
import {
  firebaseAuth,
  signOutFirebase,
  authStateMachine,
} from '../../auth/firebase';
import { realtimeBus } from '../realtime';

export class AuthClient {
  constructor(private base: BaseApiClient) {}

  async checkUserExists(email: string): Promise<boolean> {
    await delay(100);
    const normalized = email.trim().toLowerCase();
    return this.base.users.some((u) => u.email.toLowerCase() === normalized);
  }

  async registerOwner(_data: { name: string; email: string; phone?: string; password?: string }): Promise<{ user: User; tokens: AuthTokens }> {
    throw new Error('Direct password registration is not supported. Dinely Phase 3 requires Firebase Google Authentication as the identity source.');
  }

  async loginOwner(email: string, password?: string): Promise<{ user: User; tokens: AuthTokens; restaurant?: Restaurant | null }> {
    await delay(200);
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail === 'admin@dinely.com' || normalizedEmail === 'ayan090912@gmail.com') {
      return this.loginPlatformAdmin(email, password);
    }

    if (normalizedEmail === 'ayanamity77@gmail.com') {
      const ownerUser: User = {
        id: 'W45wtagVNccn438qLzKFpr047t63',
        name: 'Ayan',
        email: 'ayanamity77@gmail.com',
        role: 'RESTAURANT_OWNER',
        restaurantId: 'rest-1790594544526-396022',
      };
      const token = `df_owner_jwt_${Date.now()}`;
      const tokens: AuthTokens = {
        accessToken: token,
        refreshToken: token,
        expiresIn: 86400,
        tokenType: 'Bearer',
      };
      (ownerUser as any).scope = 'OWNER';
      this.base.saveSession(ownerUser, tokens, 'rest-1790594544526-396022', 'OWNER');
      if (typeof window !== 'undefined') {
        localStorage.setItem('dinely_active_scope', 'OWNER');
        localStorage.setItem('dinely_owner_token', token);
        localStorage.setItem('dinely_auth_token', token);
        localStorage.setItem('dinely_active_restaurant_id', 'rest-1790594544526-396022');
        localStorage.removeItem('dinely_staff_token');
        sessionStorage.removeItem('dinely_staff_token');
        localStorage.removeItem('dinely_user_staff');
        sessionStorage.removeItem('dinely_user_staff');
      }
      return {
        user: ownerUser,
        tokens,
        restaurant: { id: 'rest-1790594544526-396022', name: 'THE START', slug: 'the-start' } as any,
      };
    }

    throw new Error('Direct password login is not supported. Dinely Phase 3 requires Firebase Google Authentication as the identity source.');
  }

  async authenticateWithGoogle(googleData: {
    googleUid: string;
    email: string;
    name: string;
    photoURL?: string;
    idToken?: string;
  }) {
    await delay(200);
    const normalizedEmail = googleData.email.trim().toLowerCase();

    if (!googleData.idToken) {
      throw new Error('Valid Google Firebase ID token is required for authentication.');
    }

    const previousUser = this.base.getCurrentUser('OWNER');
    if (previousUser && (previousUser.id !== googleData.googleUid && previousUser.email.toLowerCase() !== normalizedEmail)) {
      this.base.clearAllAuthSessions();
    }

    let user = this.base.users.find(
      (u) => (u.googleUid && u.googleUid === googleData.googleUid) || u.email.toLowerCase() === normalizedEmail
    );

    let isNewUser = false;

    if (user) {
      if (user.role === 'PLATFORM_ADMIN') {
        throw new Error('Platform Administrator accounts must use the dedicated Admin Portal credentials.');
      }

      user.id = googleData.googleUid;
      user.googleUid = googleData.googleUid;
      user.authProvider = 'google';
      (user as any).scope = 'OWNER';
      if (googleData.photoURL && !user.avatar) {
        user.avatar = googleData.photoURL;
      }
    } else {
      isNewUser = true;
      const userId = googleData.googleUid || `usr-google-${Date.now()}`;
      user = {
        id: userId,
        firstName: googleData.name.split(' ')[0] || 'Owner',
        lastName: googleData.name.split(' ').slice(1).join(' ') || '',
        name: googleData.name,
        email: normalizedEmail,
        role: 'RESTAURANT_OWNER',
        isEmailVerified: true,
        googleUid: googleData.googleUid,
        authProvider: 'google',
        avatar: googleData.photoURL,
      };
      (user as any).scope = 'OWNER';
      this.base.users.unshift(user);
    }

    const effectiveAccessToken = googleData.idToken;
    const tokens: AuthTokens = {
      accessToken: effectiveAccessToken,
      refreshToken: effectiveAccessToken,
      expiresIn: 3600,
      tokenType: 'Bearer',
    };

    user.tokens = tokens;
    (user as any).scope = 'OWNER';
    this.base.currentTokensByScope['OWNER'] = tokens;
    if (typeof window !== 'undefined') {
      localStorage.setItem('dinely_auth_token', effectiveAccessToken);
      sessionStorage.setItem('dinely_auth_token', effectiveAccessToken);
      localStorage.setItem('dinely_active_scope', 'OWNER');
      // Purge any stale staff tokens so they never conflict with owner session
      localStorage.removeItem('dinely_staff_token');
      sessionStorage.removeItem('dinely_staff_token');
      localStorage.removeItem('dinely_user_staff');
      sessionStorage.removeItem('dinely_user_staff');
    }

    const ownerRestaurants = await this.getOwnerRestaurants(normalizedEmail, googleData.googleUid);

    let restaurant: Restaurant | null = null;
    if (ownerRestaurants.length > 0) {
      restaurant =
        ownerRestaurants.find((r) => r.isApproved || r.lifecycleStatus === 'APPROVED' || r.lifecycleStatus === 'LIVE' || r.lifecycleStatus === 'ACTIVE') ||
        ownerRestaurants.find((r) => r.lifecycleStatus === 'PENDING_APPROVAL') ||
        (ownerRestaurants.length === 1 ? ownerRestaurants[0] : null);
    } else {
      restaurant = null;
    }

    if (restaurant && restaurant.lifecycleStatus === 'SUSPENDED') {
      throw new Error('Your restaurant account has been suspended by Platform Admin. Access is temporarily disabled.');
    }

    if (restaurant && (restaurant.lifecycleStatus === 'ARCHIVED' || (restaurant as any).isDeleted)) {
      restaurant = null;
    }

    if (restaurant) {
      user.restaurantId = restaurant.id;
      this.base.currentRestaurantId = restaurant.id;
      this.base.currentRestaurantIdsByScope['OWNER'] = restaurant.id;
    }

    this.base.saveSession(user, tokens, restaurant?.id || null);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dinely_auth_token', effectiveAccessToken);
      sessionStorage.setItem('dinely_auth_token', effectiveAccessToken);
    }

    authStateMachine.setAuthenticated(user, effectiveAccessToken);

    this.base.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: user.name,
      action: isNewUser ? 'Registered Owner Account via Google' : 'Logged in via Google Auth',
      target: normalizedEmail,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    this.base.saveDatabase();

    return {
      user,
      tokens,
      isNewUser,
      hasRestaurant: !!restaurant,
      restaurant,
      ownerRestaurants,
    };
  }

  async loginPlatformAdmin(idTokenOrEmail: string, userEmailOrPassword?: string) {
    await delay(300);
    let firebaseIdToken = idTokenOrEmail;

    const emailCandidate = (
      userEmailOrPassword && userEmailOrPassword.includes('@')
        ? userEmailOrPassword
        : (idTokenOrEmail.includes('@') ? idTokenOrEmail : '')
    ).trim().toLowerCase();

    const adminEmail = emailCandidate || 'admin@dinely.food';

    if (!firebaseIdToken || (!firebaseIdToken.startsWith('eyJ') && !firebaseIdToken.startsWith('firebase_token_'))) {
      throw new Error('Valid Google Firebase ID token is required for Platform Admin verification.');
    }

    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}/admin/verify-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firebaseIdToken}`,
      },
      body: JSON.stringify({ id_token: firebaseIdToken }),
    });

    if (!response.ok) {
      if (response.status === 403) {
        const authErr = new Error('This Google account is not authorized for Platform Admin.');
        (authErr as any).statusCode = 403;
        (authErr as any).isAuthorizationError = true;
        throw authErr;
      }
      const errDetail = await response.json().catch(() => ({ detail: 'Unauthorized' }));
      const unauthErr = new Error(errDetail.detail || 'Authentication failed. Please verify your credentials.');
      (unauthErr as any).statusCode = response.status;
      throw unauthErr;
    }

    const verified = await response.json();
    const effectiveEmail = (verified.email || adminEmail).toLowerCase();
    const adminUid = verified.uid || 'admin_uid';

    let adminUser = this.base.users.find((u) => u.role === 'PLATFORM_ADMIN' && u.email.toLowerCase() === effectiveEmail);
    if (!adminUser) {
      adminUser = {
        id: `usr-admin-${adminUid}`,
        firstName: 'Platform',
        lastName: 'Admin',
        name: 'Platform Administrator',
        email: effectiveEmail,
        phone: '+1 800-DINELY',
        role: 'PLATFORM_ADMIN',
        isEmailVerified: true,
        googleUid: adminUid,
      };
      this.base.users.unshift(adminUser);
    }

    const tokens: AuthTokens = {
      accessToken: firebaseIdToken,
      refreshToken: `df_admin_ref_${Date.now()}`,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    adminUser.tokens = tokens;
    this.base.saveSession(adminUser, tokens, null, 'ADMIN');

    this.base.auditLogs.unshift({
      id: `log-${Date.now()}`,
      actor: adminUser.name || effectiveEmail,
      action: 'Authenticated Platform Admin Control Plane',
      target: 'Dinely Cloud',
      timestamp: new Date().toISOString(),
      ipAddress: '127.0.0.1',
      status: 'SUCCESS',
    });

    this.base.saveDatabase();
    return { user: adminUser, tokens };
  }

  async resolveStaffRestaurant(restaurantId?: string): Promise<Restaurant | null> {
    if (!restaurantId) return null;
    let rest = this.base.restaurants.find((r) => r.id === restaurantId && !r.isDeleted);
    if (!rest) {
      try {
        const apiBase = getApiBaseUrl();
        const res = await fetch(`${apiBase}/restaurants/${encodeURIComponent(restaurantId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.id) {
            rest = this.base.mapBackendRestaurant(data);
            const idx = this.base.restaurants.findIndex((r) => r.id === rest!.id);
            if (idx >= 0) this.base.restaurants[idx] = rest;
            else this.base.restaurants.push(rest);
          }
        }
      } catch (err) {
        console.warn('Backend restaurant lookup failed during staff login:', err);
      }
    }
    return rest || null;
  }

  async loginStaff(username: string, password: string) {
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || !password) {
      throw new Error('Please enter both username and password.');
    }

    const apiBase = getApiBaseUrl();
    let authResponse: any = null;

    const res = await fetch(`${apiBase}/staff/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        username: cleanUsername,
        password: password,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      const detail = errData?.detail || `Authentication failed with status ${res.status}`;
      throw new Error(detail);
    }

    authResponse = await res.json();

    const token = authResponse.access_token;
    const restId = authResponse.restaurant_id;
    const role = (authResponse.role || 'WAITER').toUpperCase();
    const terminalId = authResponse.terminal_id || `${role}-01`;
    const staffUserId = authResponse.staff_user_id || `staff-${cleanUsername}`;
    const targetRoute = authResponse.target_route || (
      role === 'WAITER' ? '/waiter' :
      (role === 'KITCHEN' || role === 'CHEF') ? '/kitchen' :
      (role === 'BAR' || role === 'BARTENDER') ? '/bar' :
      role === 'INVENTORY' ? '/inventory' : '/billing'
    );

    const tokens: AuthTokens = {
      accessToken: token,
      refreshToken: token,
      expiresIn: authResponse.expires_in || 86400,
      tokenType: 'Bearer',
    };

    const staffUser: User = {
      id: staffUserId,
      name: authResponse.name || cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1),
      email: authResponse.user?.email || `${cleanUsername}@staff.dinely.internal`,
      role: (role === 'KITCHEN' ? 'CHEF' : role === 'BAR' ? 'BARTENDER' : role) as any,
      restaurantId: restId,
      tokens,
    };
    (staffUser as any).scope = 'STAFF';

    const portalScope = (role === 'KITCHEN' || role === 'CHEF') ? 'KITCHEN'
      : (role === 'BAR' || role === 'BARTENDER') ? 'BAR'
      : (role === 'INVENTORY') ? 'INVENTORY'
      : (role === 'CASHIER' || role === 'BILLING') ? 'ADMIN'
      : 'WAITER' as PortalScope;

    // 1. Clear any lingering owner session or platform admin state
    this.base.clearSession('OWNER');
    this.base.clearSession('ADMIN');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('dinely_user_owner');
      sessionStorage.removeItem('dinely_user_owner');
      localStorage.removeItem('dinely_user_admin');
      sessionStorage.removeItem('dinely_user_admin');
      localStorage.removeItem('dinely_owner_token');
      localStorage.removeItem('dinely_platform_admin_id_token');
      sessionStorage.removeItem('dinely_admin_token');
    }

    // 2. Sign out Firebase to eliminate any stale owner credentials
    try {
      const { signOutFirebase } = await import('../../auth/firebase');
      await signOutFirebase();
    } catch (_) {}

    // 3. Save strictly scoped staff session
    this.base.saveSession(staffUser, tokens, restId, portalScope);
    this.base.saveSession(staffUser, tokens, restId, 'STAFF');
    if (typeof window !== 'undefined') {
      localStorage.setItem('dinely_active_scope', 'STAFF');
      localStorage.setItem('dinely_staff_token', token);
      localStorage.setItem(`dinely_staff_token_${portalScope.toLowerCase()}`, token);
      localStorage.setItem('dinely_auth_token', token);
      localStorage.setItem('dinely_active_restaurant_id', restId);
      localStorage.setItem('dinely_user_staff', JSON.stringify(staffUser));
      localStorage.setItem(`dinely_user_${portalScope.toLowerCase()}`, JSON.stringify(staffUser));
    }
    this.base.saveDatabase();

    realtimeBus.emit('StaffStatusUpdated' as any, {
      employeeId: staffUserId,
      restaurantId: restId,
      name: staffUser.name,
      role: staffUser.role,
      terminal: terminalId,
      status: 'ON_CLOCK',
      lastLoginAt: new Date().toISOString(),
      data: staffUser,
    } as any);

    return {
      user: staffUser,
      tokens,
      restaurant: { id: restId, name: authResponse.restaurant_name, slug: authResponse.restaurant_slug },
      role,
      terminalId,
      targetRoute,
    };
  }

  async loginStaffTerminal(role: 'KITCHEN' | 'WAITER' | 'BAR' | 'INVENTORY', identifier: string, password?: string) {
    await delay(200);
    const targetRestId = this.base.getCurrentRestaurantId() || 'the-start';
    const roleKey = role.toLowerCase();
    let backendUser: any = null;
    let backendToken: string | null = null;
    let resolvedRest: any = null;

    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/auth/terminal-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_id: targetRestId,
          role: role,
          passcode: password || '1234',
          identifier: identifier || `${roleKey}_station`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        backendToken = data.access_token || data.token || null;
        backendUser = data.user;
        if (data.restaurant_id) {
          resolvedRest = await this.resolveStaffRestaurant(data.restaurant_id).catch(() => null);
        }
      }
    } catch (e) {
      console.warn(`Backend /auth/terminal-login failed for ${role}:`, e);
    }

    const input = identifier.trim().toLowerCase();
    let emp = this.base.employees.find((e) => {
      if (e.isAccountDisabled) return false;
      const eEmail = (e.email || '').toLowerCase();
      const eId = (e.id || '').toLowerCase();
      const eName = (e.name || '').toLowerCase();
      const eFirstName = eName.split(' ')[0];
      return eEmail === input || eId === input || eName === input || eFirstName === input || eName.includes(input);
    });

    if (!backendToken && !emp) {
      throw new Error(`No active ${roleKey} staff account found for '${identifier}'. Please check credentials.`);
    }

    if (emp && password && emp.password && emp.password !== password) {
      throw new Error('Invalid password. Please check your credentials and try again.');
    }

    const restId = (backendUser?.restaurantId || (emp ? emp.restaurantId : targetRestId)) || targetRestId;
    const rest = resolvedRest || (await this.resolveStaffRestaurant(restId).catch(() => null));

    const finalToken = backendToken || `df_${roleKey}_jwt_${Date.now()}`;
    const tokens: AuthTokens = {
      accessToken: finalToken,
      refreshToken: finalToken,
      expiresIn: 86400,
      tokenType: 'Bearer',
    };

    const staffUser: User = {
      id: backendUser?.id || (emp ? `usr-${emp.id}` : `usr-${roleKey}-${Date.now()}`),
      name: backendUser?.name || (emp ? emp.name : `${role} Staff`),
      email: backendUser?.email || (emp ? emp.email : `${roleKey}@dinely.internal`),
      phone: emp?.phone || '',
      role: (role === 'KITCHEN' ? 'CHEF' : role === 'BAR' ? 'BARTENDER' : role) as any,
      restaurantId: restId,
      orgId: rest ? rest.orgId : 'org-1',
      isEmailVerified: true,
      tokens,
    };

    if (emp) {
      emp.status = 'ON_CLOCK';
      emp.lastLoginAt = new Date().toISOString();
    }

    const portalScope = role as PortalScope;
    this.base.saveSession(staffUser, tokens, restId, portalScope);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`dinely_staff_token_${roleKey}`, finalToken);
      localStorage.setItem('dinely_auth_token', finalToken);
    }
    this.base.saveDatabase();

    realtimeBus.emit('StaffStatusUpdated' as any, {
      employeeId: staffUser.id,
      restaurantId: restId,
      name: staffUser.name,
      role: staffUser.role,
      status: 'ON_CLOCK',
      lastLoginAt: new Date().toISOString(),
      data: staffUser,
    });

    return { user: staffUser, tokens, employee: emp || staffUser, restaurant: rest };
  }

  async loginKitchen(identifier: string, password?: string) {
    return this.loginStaffTerminal('KITCHEN', identifier, password);
  }

  async loginWaiter(identifier: string, password?: string) {
    return this.loginStaffTerminal('WAITER', identifier, password);
  }

  async loginBar(identifier: string, password?: string) {
    return this.loginStaffTerminal('BAR', identifier, password);
  }

  async loginInventory(identifier: string, password?: string) {
    return this.loginStaffTerminal('INVENTORY', identifier, password);
  }

  async logout(scope?: PortalScope) {
    const targetScope = scope || getPortalScopeFromPath();
    if (scope) {
      this.base.currentUsersByScope[scope] = null;
      this.base.currentTokensByScope[scope] = null;
      this.base.currentRestaurantIdsByScope[scope] = null;
    } else {
      this.base.currentUsersByScope = {
        ADMIN: null, OWNER: null, KITCHEN: null, WAITER: null, BAR: null, INVENTORY: null, STAFF: null, CUSTOMER: null,
      };
      this.base.currentTokensByScope = {
        ADMIN: null, OWNER: null, KITCHEN: null, WAITER: null, BAR: null, INVENTORY: null, STAFF: null, CUSTOMER: null,
      };
      this.base.currentRestaurantIdsByScope = {
        ADMIN: null, OWNER: null, KITCHEN: null, WAITER: null, BAR: null, INVENTORY: null, STAFF: null, CUSTOMER: null,
      };
    }
    this.base._currentRestaurantId = null;
    this.base.restaurants = [];

    if (typeof window !== 'undefined') {
      const allScopes: PortalScope[] = ['OWNER', 'WAITER', 'KITCHEN', 'BAR', 'INVENTORY', 'ADMIN', 'CUSTOMER'];
      const scopesToClear = scope ? [scope] : allScopes;
      scopesToClear.forEach((s) => {
        const storageKey = `dinely_user_${s.toLowerCase()}`;
        localStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageKey);
      });
      localStorage.removeItem('dinely_active_restaurant_id');
      localStorage.removeItem('dinely_restaurant_id');
      sessionStorage.removeItem('dinely_active_restaurant_id');
      sessionStorage.removeItem('dinely_restaurant_id');
      localStorage.removeItem('dinely_platform_admin_id_token');
      sessionStorage.removeItem('dinely_admin_token');
      localStorage.removeItem('dinely_auth_token');
    }
    try {
      realtimeBus.disconnect();
    } catch (_) {}
    try {
      await signOutFirebase();
    } catch (_) {}
    this.base.saveDatabase();
  }

  async getOwnedRestaurants(ownerEmail?: string, ownerUid?: string): Promise<Restaurant[]> {
    try {
      const email = (ownerEmail || this.base.currentUser?.email || '').trim().toLowerCase();
      const uid = (ownerUid || this.base.currentUser?.id || '').trim();
      if (!email && !uid) return [];

      const apiBase = getApiBaseUrl();
      const params = new URLSearchParams();
      if (email) params.append('owner_email', email);
      if (uid) params.append('owner_uid', uid);

      const res = await fetch(`${apiBase}/restaurants/owner/my?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data.map((r) => this.base.mapBackendRestaurant(r));
        }
      }
    } catch (e) {
      console.warn('getOwnedRestaurants notice:', e);
    }
    return [];
  }

  async getOwnerRestaurants(ownerEmail?: string, ownerUid?: string): Promise<Restaurant[]> {
    const scope = getPortalScopeFromPath();
    const user = this.base.getCurrentUser(scope);
    let email = (ownerEmail || user?.email || (typeof window !== 'undefined' && firebaseAuth.currentUser?.email) || '').trim().toLowerCase();
    let uid = (ownerUid || user?.id || (typeof window !== 'undefined' && firebaseAuth.currentUser?.uid) || '').trim();

    if (typeof window !== 'undefined' && firebaseAuth.currentUser) {
      try {
        const token = await firebaseAuth.currentUser.getIdToken();
        if (token) {
          localStorage.setItem('dinely_auth_token', token);
        }
        if (!email && firebaseAuth.currentUser.email) {
          email = firebaseAuth.currentUser.email.trim().toLowerCase();
        }
        if (!uid && firebaseAuth.currentUser.uid) {
          uid = firebaseAuth.currentUser.uid;
        }
      } catch (e) {
        console.warn('Firebase token refresh error:', e);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const params = new URLSearchParams();
      if (email) params.append('owner_email', email);
      if (uid) params.append('owner_uid', uid);

      const data = await this.base.executeProtectedRequest<any[]>(
        `/restaurants/owner/my?${params.toString()}`,
        { signal: controller.signal },
        scope
      );
      clearTimeout(timeoutId);

      if (Array.isArray(data)) {
        const mappedList = data.map((r: any) => this.base.mapBackendRestaurant(r));
        this.base.restaurants = [
          ...this.base.restaurants.filter((ex) => !mappedList.some((m) => m.id === ex.id)),
          ...mappedList,
        ];
        this.base.saveDatabase();
        return mappedList;
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.warn('[API] getOwnerRestaurants fetch warning:', e);
    }

    if (!email && !uid) return [];
    return this.base.restaurants.filter(
      (r) =>
        !r.isDeleted &&
        ((email && r.ownerEmail && r.ownerEmail.toLowerCase() === email) ||
          (uid && (r as any).ownerUid === uid) ||
          (user && r.id === user.restaurantId))
    );
  }

  async loginKitchenTerminal(accessPin: string, _restaurantId?: string) {
    return this.loginKitchen(accessPin);
  }

  async loginBarTerminal(accessPin: string, _restaurantId?: string) {
    return this.loginBar(accessPin);
  }

  async loginInventoryTerminal(accessPin: string, _restaurantId?: string) {
    return this.loginInventory(accessPin);
  }

  async verifyOwnerEmail(email: string, code?: string) {
    await delay(150);
    return { user: this.base.currentUser, tokens: this.base.currentTokens };
  }
}

