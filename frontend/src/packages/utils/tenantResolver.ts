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
  | 'INVENTORY'
  | 'BILLING'
  | 'SETTINGS'
  | 'AUTH'
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
  if (typeof window === 'undefined') {
    return { isTenantSubdomain: false, slug: null, hostname: '' };
  }

  const hostname = (customHostname || window.location.hostname || '').toLowerCase().trim();

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
    const searchParams = new URLSearchParams(window.location.search);
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

  // 4. Bar Terminal
  if (p === '/bar' || p.startsWith('/bar/') || p === '/bartender' || p.startsWith('/bartender/')) {
    return 'BAR';
  }

  // 5. Inventory Terminal
  if (p === '/inventory' || p.startsWith('/inventory/')) {
    return 'INVENTORY';
  }

  // 6. Billing / Cashier
  if (p === '/billing' || p.startsWith('/billing/') || p === '/cashier' || p.startsWith('/cashier/')) {
    return 'BILLING';
  }

  // 7. Restaurant Settings / Tenant Dashboard
  if (
    p === '/settings' ||
    p.startsWith('/settings/') ||
    p === '/dashboard' ||
    p === '/restaurant' ||
    p.startsWith('/restaurant/') ||
    p === '/owner' ||
    p.startsWith('/owner/')
  ) {
    return 'SETTINGS';
  }

  // 8. Customer Digital Menu / Table Ordering
  if (
    p === '' ||
    p === '/' ||
    p === '/customer' ||
    p.startsWith('/customer/') ||
    p === '/menu' ||
    p.startsWith('/menu/')
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
 * Generates customer QR code or direct menu URL pointing to tenant public domain.
 * Formats: https://<slug>.dinely.food/customer?table=01
 * Strict canonical Dinely QR architecture:
 * restaurant_id + table_id -> clean 2-digit table URL: https://<slug>.dinely.food/customer?table=01
 */
export function getRestaurantCustomerUrl(
  slugOrRest?: string | { publicSlug?: string; slug?: string; id?: string; domain?: string } | null,
  tableNumber?: string,
  tableId?: string
): string {
  let base = getRestaurantPublicDomain(slugOrRest);
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }

  // Extract clean 2-digit table number if tableNumber or tableId is provided
  let cleanTable: string | undefined = undefined;
  if (tableNumber) {
    const digits = tableNumber.match(/\d+/);
    if (digits) {
      cleanTable = digits[0].padStart(2, '0');
    } else {
      cleanTable = tableNumber.trim();
    }
  } else if (tableId) {
    const digits = tableId.match(/\d+/g);
    if (digits && digits.length > 0) {
      cleanTable = digits[digits.length - 1].padStart(2, '0');
    }
  }

  if (cleanTable) {
    return `${base}/customer?table=${encodeURIComponent(cleanTable)}`;
  }
  return `${base}/customer`;
}
