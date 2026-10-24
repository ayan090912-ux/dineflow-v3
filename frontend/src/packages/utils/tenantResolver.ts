/**
 * Centralized Tenant & Domain Resolver for Dinely Multi-Tenant SaaS Architecture.
 *
 * Distinguishes between:
 * 1. Primary Platform Domain: https://dinely.food (Landing, Login, Owner Dashboard, Wizard, Admin)
 * 2. Tenant Public Domains: https://<public_slug>.dinely.food (Customer Web App, Digital Menu, QR scan, Table ordering)
 */

export interface TenantDomainResolution {
  isTenantSubdomain: boolean;
  isCustomDomain?: boolean;
  slug: string | null;
  hostname: string;
}

export type TenantAppType =
  | 'CUSTOMER'
  | 'KITCHEN'
  | 'WAITER'
  | 'BAR'
  | 'BAR_OS'
  | 'CART_OS'
  | 'HUB'
  | 'HOOKAH'
  | 'INVENTORY'
  | 'BILLING'
  | 'SETTINGS'
  | 'AUTH'
  | 'WEDDING'
  | 'EVENT_PORTAL'
  | 'NOT_FOUND';

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'platform',
  'admin',
  'staging',
  'dev',
  'control',
  'dashboard',
  'auth',
  'mail',
  'status',
]);

const PLATFORM_DOMAINS = new Set([
  'dinely.food',
  'www.dinely.food',
  'dinely-cd6cd.web.app',
  'dinely-cd6cd.firebaseapp.com',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
]);

export function getTenantFromHostname(customHostname?: string): TenantDomainResolution {
  const hostname = (
    customHostname ||
    (typeof window !== 'undefined' ? window.location.hostname : '') ||
    ''
  ).toLowerCase().trim();

  if (!hostname) {
    return { isTenantSubdomain: false, slug: null, hostname: '' };
  }

  // 1. Hostname is the public tenant identity - check subdomain FIRST
  // https://<slug>.dinely.food
  if (hostname.endsWith('.dinely.food')) {
    const subdomain = hostname.slice(0, -'.dinely.food'.length).trim();
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return { isTenantSubdomain: true, isCustomDomain: false, slug: subdomain, hostname };
    }
    return { isTenantSubdomain: false, slug: null, hostname };
  }

  // Local Development: https://<slug>.localhost
  if (hostname.endsWith('.localhost')) {
    const subdomain = hostname.slice(0, -'.localhost'.length).trim();
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return { isTenantSubdomain: true, isCustomDomain: false, slug: subdomain, hostname };
    }
  }

  // Direct Firebase Hosting staging subdomains
  if (hostname.endsWith('.dinely-cd6cd.web.app')) {
    const subdomain = hostname.slice(0, -'.dinely-cd6cd.web.app'.length).trim();
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return { isTenantSubdomain: true, isCustomDomain: false, slug: subdomain, hostname };
    }
  }

  // 2. Query parameter fallback ONLY for platform domains or local dev testing
  if (PLATFORM_DOMAINS.has(hostname) || hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const queryTenant = searchParams.get('tenant') || searchParams.get('restaurant_slug');
    if (queryTenant && queryTenant.trim()) {
      const slug = queryTenant.trim().toLowerCase();
      if (!RESERVED_SUBDOMAINS.has(slug)) {
        return { isTenantSubdomain: true, isCustomDomain: false, slug, hostname };
      }
    }
    return { isTenantSubdomain: false, slug: null, hostname };
  }

  // 3. Custom Domain Resolution (e.g. www.thedunkrestaurant.com or thedunk.com)
  // Any domain not in PLATFORM_DOMAINS that reaches this frontend router is a verified custom domain
  return {
    isTenantSubdomain: true,
    isCustomDomain: true,
    slug: null,
    hostname,
  };
}

/**
 * Resolves which internal tenant application is requested from pathname when inside a tenant.
 */
export function resolveTenantAppFromPath(cleanPath: string): TenantAppType {
  const p = (cleanPath || '').split('?')[0].split('#')[0].toLowerCase().trim();

  // 1. Auth inside tenant
  if (
    p === '/login' ||
    p === '/auth' ||
    p === '/signin' ||
    p.endsWith('/login')
  ) {
    return 'AUTH';
  }

  // 2. Kitchen KDS
  if (p === '/kitchen' || p.startsWith('/kitchen/') || p === '/kds' || p.startsWith('/kds/')) {
    return 'KITCHEN';
  }

  // 3. Waiter Terminal
  if (p === '/waiter' || p.startsWith('/waiter/') || p === '/servo' || p.startsWith('/servo/')) {
    return 'WAITER';
  }

  // 3.1. Business Hub
  if (p === '/hub' || p.startsWith('/hub/')) {
    return 'HUB';
  }

  // 3.2. Small Cart Customer Menu route (e.g. /cart/:cartId/menu or /cart/menu)
  if (p === '/cart/menu' || p.startsWith('/cart/menu/') || (p.startsWith('/cart/') && p.endsWith('/menu'))) {
    return 'CUSTOMER';
  }

  // 3.2. Small Cart OS Staff Terminal / POS
  if (p === '/cart' || p.startsWith('/cart/')) {
    return 'CART_OS';
  }

  // 3.3. Dedicated Bar OS Dashboard & Management
  if (
    p === '/bar/dashboard' ||
    p.startsWith('/bar/dashboard/') ||
    p === '/bar/menu' ||
    p.startsWith('/bar/menu/') ||
    p === '/bar/tabs' ||
    p.startsWith('/bar/tabs/') ||
    p === '/bar/inventory' ||
    p.startsWith('/bar/inventory/') ||
    p === '/bar/staff' ||
    p.startsWith('/bar/staff/') ||
    p === '/bar/settings' ||
    p.startsWith('/bar/settings/') ||
    p === '/bar/reports' ||
    p.startsWith('/bar/reports/')
  ) {
    return 'BAR_OS';
  }

  // 4. Bar Station Terminal (Inside Restaurant)
  if (p === '/bar' || p.startsWith('/bar/') || p === '/bartender' || p.startsWith('/bartender/')) {
    return 'BAR';
  }

  // 4.5. Hookah & Shisha Terminal
  if (p === '/hookah' || p.startsWith('/hookah/') || p === '/shisha' || p.startsWith('/shisha/')) {
    return 'HOOKAH';
  }

  // 5. Inventory Terminal
  if (p === '/inventory' || p.startsWith('/inventory/')) {
    return 'INVENTORY';
  }

  // 6. Billing / Cashier
  if (p === '/billing' || p.startsWith('/billing/') || p === '/cashier' || p.startsWith('/cashier/')) {
    return 'BILLING';
  }

  // 7. Restaurant Settings / Tenant Dashboard & Operational Management
  if (
    p === '/workspace' ||
    p.startsWith('/workspace/') ||
    p === '/select-workspace' ||
    p === '/settings' ||
    p.startsWith('/settings/') ||
    p === '/pos' ||
    p.startsWith('/pos/') ||
    p === '/dashboard' ||
    p === '/restaurant' ||
    p.startsWith('/restaurant/') ||
    p === '/owner' ||
    p.startsWith('/owner/') ||
    p === '/floorplan' ||
    p.startsWith('/floorplan/') ||
    p === '/tables' ||
    p.startsWith('/tables/') ||
    p === '/staff' ||
    p.startsWith('/staff/') ||
    p === '/reports' ||
    p.startsWith('/reports/')
  ) {
    return 'SETTINGS';
  }

  // 7.4. Wedding & Events Independent Operations Portal
  if (
    p === '/events/portal' ||
    p.startsWith('/events/portal/') ||
    p === '/event/portal' ||
    p.startsWith('/event/portal/') ||
    p === '/weddings/portal' ||
    p.startsWith('/weddings/portal/') ||
    p === '/wedding/portal' ||
    p.startsWith('/wedding/portal/') ||
    p === '/events/dashboard' ||
    p.startsWith('/events/dashboard/') ||
    p === '/event/dashboard' ||
    p.startsWith('/event/dashboard/') ||
    p === '/weddings/dashboard' ||
    p.startsWith('/weddings/dashboard/') ||
    p === '/wedding/dashboard' ||
    p.startsWith('/wedding/dashboard/') ||
    p === '/events/command-center' ||
    p.startsWith('/events/command-center/') ||
    p === '/events/day-management' ||
    p.startsWith('/events/day-management/') ||
    p === '/events/tables' ||
    p.startsWith('/events/tables/') ||
    p === '/events/menu' ||
    p.startsWith('/events/menu/') ||
    p === '/events/kitchen' ||
    p.startsWith('/events/kitchen/') ||
    p === '/events/runner' ||
    p.startsWith('/events/runner/') ||
    p === '/events/bar' ||
    p.startsWith('/events/bar/') ||
    p === '/events/hookah' ||
    p.startsWith('/events/hookah/') ||
    p === '/events/staff' ||
    p.startsWith('/events/staff/') ||
    p === '/events/settings' ||
    p.startsWith('/events/settings/') ||
    p === '/weddings' ||
    p.startsWith('/weddings/') ||
    p === '/wedding' ||
    p.startsWith('/wedding/')
  ) {
    return 'EVENT_PORTAL';
  }

  // 7.5. Wedding & Events Guest App
  if (
    p === '/event' ||
    p.startsWith('/event/') ||
    p === '/events' ||
    p.startsWith('/events/') ||
    p === '/wedding' ||
    p.startsWith('/wedding/')
  ) {
    return 'WEDDING';
  }

  // 8. Customer Digital Menu / Table Ordering
  if (
    p === '' ||
    p === '/' ||
    p === '/customer' ||
    p.startsWith('/customer/') ||
    p === '/menu' ||
    p.startsWith('/menu/') ||
    p === '/table' ||
    p.startsWith('/table/') ||
    p === '/t' ||
    p.startsWith('/t/') ||
    p === '/qr' ||
    p.startsWith('/qr/') ||
    p === '/order' ||
    p.startsWith('/order/')
  ) {
    return 'CUSTOMER';
  }

  return 'NOT_FOUND';
}

/**
 * Returns canonical public domain for a restaurant tenant: https://<slug>.dinely.food
 */
export function getRestaurantPublicDomain(
  slugOrRest?: string | { publicSlug?: string; slug?: string; id?: string; domain?: string } | null
): string {
  if (typeof slugOrRest === 'object' && slugOrRest !== null) {
    if (slugOrRest.domain && !slugOrRest.domain.includes('.dinely.app') && !slugOrRest.domain.includes('?tenant=')) {
      return slugOrRest.domain;
    }
    const slug = slugOrRest.publicSlug || slugOrRest.slug || slugOrRest.id || '';
    const cleanSlug = (slug || '').toLowerCase().trim();
    if (cleanSlug && !RESERVED_SUBDOMAINS.has(cleanSlug)) {
      return `https://${cleanSlug}.dinely.food`;
    }
  }

  const cleanSlug = (typeof slugOrRest === 'string' ? slugOrRest : '').toLowerCase().trim();
  if (cleanSlug && !RESERVED_SUBDOMAINS.has(cleanSlug)) {
    return `https://${cleanSlug}.dinely.food`;
  }
  return 'https://dinely.food';
}

/**
 * ONE Canonical Tenant URL Generator for Dinely Multi-Tenant OS.
 * Produces: https://<slug>.dinely.food/<path>
 * Automatically handles object or string slug, ensures leading slash on path.
 */
export function getTenantUrl(
  slugOrRest?: string | { publicSlug?: string; slug?: string; id?: string; domain?: string } | null,
  path: string = ''
): string {
  const base = getRestaurantPublicDomain(slugOrRest);
  if (!path || path === '/') {
    return base;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * ONE Canonical Dinely Customer QR Code & Direct Menu URL Generator.
 * Preferred machine-safe format:
 * https://<slug>.dinely.food/customer?table=01&tableId=<id>
 * Strictly zero spaces, machine-safe 2-digit zero-padded table number, URL-encoded.
 */
export function getRestaurantCustomerUrl(
  slugOrRest?: string | { publicSlug?: string; slug?: string; id?: string; domain?: string } | null,
  tableNumber?: string,
  tableId?: string
): string {
  let slug = '';
  if (typeof slugOrRest === 'object' && slugOrRest !== null) {
    slug = slugOrRest.publicSlug || slugOrRest.slug || slugOrRest.id || '';
  } else if (typeof slugOrRest === 'string') {
    slug = slugOrRest;
  }
  const cleanSlug = (slug || 'venue').toLowerCase().trim();
  const base = (!cleanSlug || RESERVED_SUBDOMAINS.has(cleanSlug))
    ? 'https://dinely.food'
    : `https://${cleanSlug}.dinely.food`;

  // Extract clean 2-digit table number if tableNumber or tableId is provided
  let cleanTable: string | undefined = undefined;
  if (tableNumber) {
    const tTrim = tableNumber.trim();
    if (tTrim.toUpperCase() === 'COUNTER' || tTrim.toUpperCase() === 'PICKUP' || tTrim.toUpperCase() === 'BAR') {
      cleanTable = tTrim.toUpperCase();
    } else {
      const digits = tTrim.match(/\d+/g);
      if (digits && digits.length > 0) {
        cleanTable = digits[digits.length - 1].padStart(2, '0');
      } else {
        cleanTable = tTrim.replace(/\s+/g, '_');
      }
    }
  } else if (tableId) {
    const digits = tableId.match(/\d+/g);
    if (digits && digits.length > 0) {
      cleanTable = digits[digits.length - 1].padStart(2, '0');
    }
  }

  if (cleanTable) {
    const cleanId = (tableId || '').trim();
    if (cleanId) {
      return `${base}/customer?table=${encodeURIComponent(cleanTable)}&tableId=${encodeURIComponent(cleanId)}`;
    }
    return `${base}/customer?table=${encodeURIComponent(cleanTable)}`;
  }
  return `${base}/customer`;
}
