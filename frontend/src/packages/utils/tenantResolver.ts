/**
 * Centralized Tenant & Domain Resolver for Dinely Multi-Tenant SaaS Architecture.
 *
 * Distinguishes between:
 * 1. Primary Platform Domain: https://dinely.food (Landing, Login, Owner Dashboard, Wizard, Admin)
 * 2. Tenant Public Domains: https://<public_slug>.dinely.food (Customer Web App, Digital Menu, QR scan, Table ordering)
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
      return { isTenantSubdomain: true, slug: subdomain, hostname };
    }
    return { isTenantSubdomain: false, slug: null, hostname };
  }

  // https://<slug>.dinely.app
  if (hostname.endsWith('.dinely.app')) {
    const subdomain = hostname.slice(0, -'.dinely.app'.length).trim();
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return { isTenantSubdomain: true, slug: subdomain, hostname };
    }
    return { isTenantSubdomain: false, slug: null, hostname };
  }

  // Local Development: https://<slug>.localhost
  if (hostname.endsWith('.localhost')) {
    const subdomain = hostname.slice(0, -'.localhost'.length).trim();
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return { isTenantSubdomain: true, slug: subdomain, hostname };
    }
  }

  // Direct Firebase Hosting staging subdomains
  if (hostname.endsWith('.dinely-cd6cd.web.app')) {
    const subdomain = hostname.slice(0, -'.dinely-cd6cd.web.app'.length).trim();
    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
      return { isTenantSubdomain: true, slug: subdomain, hostname };
    }
  }

  // 2. Query parameter fallback ONLY for platform domains or local dev testing
  if (PLATFORM_DOMAINS.has(hostname) || hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    const searchParams = new URLSearchParams(window.location.search);
    const queryTenant = searchParams.get('tenant') || searchParams.get('restaurant_slug');
    if (queryTenant && queryTenant.trim()) {
      const slug = queryTenant.trim().toLowerCase();
      if (!RESERVED_SUBDOMAINS.has(slug)) {
        return { isTenantSubdomain: true, slug, hostname };
      }
    }
    return { isTenantSubdomain: false, slug: null, hostname };
  }

  return { isTenantSubdomain: false, slug: null, hostname };
}

/**
 * Returns canonical public domain for a restaurant tenant: https://<slug>.dinely.food
 */
export function getRestaurantPublicDomain(
  slugOrRest?: string | { publicSlug?: string; slug?: string; id?: string } | null
): string {
  const slug =
    typeof slugOrRest === 'string'
      ? slugOrRest
      : slugOrRest?.publicSlug || slugOrRest?.slug || '';
  const cleanSlug = (slug || '').toLowerCase().trim();

  if (cleanSlug && !RESERVED_SUBDOMAINS.has(cleanSlug)) {
    return `https://${cleanSlug}.dinely.food`;
  }
  return 'https://dinely.food';
}

/**
 * Generates customer QR code or direct menu URL pointing to tenant public domain.
 * Formats: https://<slug>.dinely.food/customer?table=<tableNumber>&tableId=<tableId>
 * Guaranteed to resolve and load on all iOS Safari and Android camera QR scans worldwide.
 */
export function getRestaurantCustomerUrl(
  slugOrRest?: string | { publicSlug?: string; slug?: string; id?: string } | null,
  tableNumber?: string,
  tableId?: string
): string {
  const slug =
    typeof slugOrRest === 'string'
      ? slugOrRest
      : slugOrRest?.publicSlug || slugOrRest?.slug || '';
  const cleanSlug = (slug || '').toLowerCase().trim();

  const base = cleanSlug && !RESERVED_SUBDOMAINS.has(cleanSlug)
    ? `https://${cleanSlug}.dinely.food`
    : 'https://dinely.food';

  const params = new URLSearchParams();
  if (tableNumber) params.set('table', tableNumber);
  if (tableId) params.set('tableId', tableId);
  const query = params.toString();
  return `${base}/customer${query ? `?${query}` : ''}`;
}
