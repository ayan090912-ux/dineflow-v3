/**
 * Centralized Tenant & Domain Resolver for Dinely Multi-Tenant SaaS Architecture.
 *
 * Distinguishes between:
 * 1. Primary Platform Domain: https://dinely.food (Landing, Login, Owner Dashboard, Wizard, Admin)
 * 2. Tenant Public Domains: https://<public_slug>.dinely.app (Customer Web App, Digital Menu, QR scan, Table ordering)
 */

export interface TenantDomainResolution {
  isTenantSubdomain: boolean;
  slug: string | null;
  hostname: string;
}

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
  'dinely.app',
  'www.dinely.app',
  'dinely-cd6cd.web.app',
  'dinely-cd6cd.firebaseapp.com',
]);

export function getTenantFromHostname(customHostname?: string): TenantDomainResolution {
  if (typeof window === 'undefined') {
    return { isTenantSubdomain: false, slug: null, hostname: '' };
  }

  const hostname = (customHostname || window.location.hostname || '').toLowerCase().trim();
  const searchParams = new URLSearchParams(window.location.search);

  // 1. Explicit query parameter override (supports local testing, dev tools, and deep links)
  const queryTenant = searchParams.get('tenant') || searchParams.get('restaurant_slug');
  if (queryTenant && queryTenant.trim()) {
    const slug = queryTenant.trim().toLowerCase();
    if (!RESERVED_SUBDOMAINS.has(slug)) {
      return { isTenantSubdomain: true, slug, hostname };
    }
  }

  // 2. Primary platform domains without subdomains
  if (PLATFORM_DOMAINS.has(hostname)) {
    return { isTenantSubdomain: false, slug: null, hostname };
  }

  // 3. Production Tenant Subdomain: <slug>.dinely.app
  if (hostname.endsWith('.dinely.app')) {
    const subdomain = hostname.slice(0, -'.dinely.app'.length).trim();
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return { isTenantSubdomain: true, slug: subdomain, hostname };
    }
    return { isTenantSubdomain: false, slug: null, hostname };
  }

  // 4. Local Development Tenant Subdomain: <slug>.localhost or <slug>.127.0.0.1
  if (hostname.endsWith('.localhost')) {
    const subdomain = hostname.slice(0, -'.localhost'.length).trim();
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return { isTenantSubdomain: true, slug: subdomain, hostname };
    }
  }

  // 5. Firebase Hosting Subdomains: <slug>.dinely-cd6cd.web.app
  if (hostname.endsWith('.dinely-cd6cd.web.app')) {
    const subdomain = hostname.slice(0, -'.dinely-cd6cd.web.app'.length).trim();
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return { isTenantSubdomain: true, slug: subdomain, hostname };
    }
  }

  return { isTenantSubdomain: false, slug: null, hostname };
}

/**
 * Returns canonical public domain for a restaurant tenant: https://<slug>.dinely.app
 */
export function getRestaurantPublicDomain(
  slugOrRest?: string | { publicSlug?: string; slug?: string } | null
): string {
  if (!slugOrRest) return 'https://dinely.app';
  const slug =
    typeof slugOrRest === 'string'
      ? slugOrRest
      : slugOrRest.publicSlug || slugOrRest.slug || '';
  if (!slug) return 'https://dinely.app';

  // In local dev development on localhost
  if (typeof window !== 'undefined' && window.location.hostname.includes('localhost')) {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${window.location.protocol}//${slug}.localhost${port}`;
  }

  return `https://${slug.toLowerCase()}.dinely.app`;
}

/**
 * Generates customer QR code or direct menu URL pointing to tenant public domain.
 */
export function getRestaurantCustomerUrl(
  slugOrRest?: string | { publicSlug?: string; slug?: string } | null,
  tableNumber?: string,
  tableId?: string
): string {
  const base = getRestaurantPublicDomain(slugOrRest);
  const params = new URLSearchParams();
  if (tableNumber) params.set('table', tableNumber);
  if (tableId) params.set('tableId', tableId);
  const query = params.toString();
  return `${base}/customer${query ? `?${query}` : ''}`;
}
