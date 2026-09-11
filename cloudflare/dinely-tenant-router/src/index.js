/**
 * Dinely Multi-Tenant Cloudflare Worker: dinely-tenant-router
 *
 * Architecture:
 * - https://dinely.food/*            -> Primary Dinely Platform (Owner dashboard, Admin, Landing)
 * - https://<slug>.dinely.food/*     -> Tenant Customer Experience (Digital Menu, QR scan, Table ordering)
 *
 * Origin:
 * - Firebase Hosting: https://dinely-cd6cd.web.app
 */

const ORIGIN_HOST = 'dinely-cd6cd.web.app';
const ORIGIN_BASE = `https://${ORIGIN_HOST}`;

// Reserved subdomains that belong to platform infrastructure
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.hostname;
    const originalHostname = hostHeader.split(':')[0].toLowerCase().trim();

    // 1. Root Platform Domain Handling (dinely.food or www.dinely.food)
    if (
      originalHostname === 'dinely.food' ||
      originalHostname === 'www.dinely.food'
    ) {
      return proxyToOrigin(request, url, originalHostname, null);
    }

    // 2. Tenant Subdomain & Custom Domain Extraction
    let tenantSlug = null;
    let isCustomDomain = false;
    if (originalHostname.endsWith('.dinely.food')) {
      tenantSlug = originalHostname.slice(0, -'.dinely.food'.length).trim();
    } else if (originalHostname.endsWith('.localhost')) {
      tenantSlug = originalHostname.slice(0, -'.localhost'.length).trim();
    } else if (originalHostname.endsWith('.dinely-cd6cd.web.app')) {
      tenantSlug = originalHostname.slice(0, -'.dinely-cd6cd.web.app'.length).trim();
    } else {
      // Verified custom domain routed to Dinely (e.g. www.thedunkrestaurant.com)
      isCustomDomain = true;
    }

    // If it's a reserved platform subdomain
    if (tenantSlug && RESERVED_SUBDOMAINS.has(tenantSlug)) {
      return proxyToOrigin(request, url, originalHostname, null);
    }

    // 3. Valid Tenant Subdomain or Custom Domain: Proxy to frontend SPA with tenant headers preserved
    return proxyToOrigin(request, url, originalHostname, tenantSlug, isCustomDomain);
  },
};

/**
 * Proxies request to Firebase Hosting origin while preserving the original tenant hostname in browser
 */
async function proxyToOrigin(request, url, originalHostname, tenantSlug, isCustomDomain = false) {
  // Target URL points to Firebase Hosting origin while keeping exact pathname and search query
  const targetUrl = new URL(url.pathname + url.search, ORIGIN_BASE);

  // Prepare safe proxy headers
  const reqHeaders = new Headers(request.headers);

  // CRITICAL: Set Host header to Firebase project domain so Firebase Hosting
  // resolves the single-page application without 404 Host header rejection
  reqHeaders.set('Host', ORIGIN_HOST);
  reqHeaders.set('X-Forwarded-Host', originalHostname);
  reqHeaders.set('X-Forwarded-Proto', 'https');
  reqHeaders.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '');

  if (tenantSlug) {
    reqHeaders.set('X-Tenant-Slug', tenantSlug);
  }
  if (isCustomDomain) {
    reqHeaders.set('X-Dinely-Custom-Domain', 'true');
  }

  // Handle request init (support GET, HEAD, POST, etc.)
  const requestInit = {
    method: request.method,
    headers: reqHeaders,
    redirect: 'follow',
  };

  // Only attach body for non-GET/HEAD methods
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    requestInit.body = request.body;
  }

  try {
    const originResponse = await fetch(targetUrl.toString(), requestInit);

    // Build response headers preserving origin cache and type headers
    const resHeaders = new Headers(originResponse.headers);

    // If origin issues a redirect, rewrite Location to preserve original tenant hostname
    if (resHeaders.has('Location')) {
      const loc = resHeaders.get('Location');
      resHeaders.set('Location', loc.replace(ORIGIN_HOST, originalHostname));
    }

    // Add telemetry headers
    resHeaders.set('X-Dinely-Routed-By', 'dinely-tenant-router');
    resHeaders.set('X-Dinely-Original-Host', originalHostname);
    if (tenantSlug) {
      resHeaders.set('X-Dinely-Tenant-Slug', tenantSlug);
    }
    if (isCustomDomain) {
      resHeaders.set('X-Dinely-Custom-Domain', 'true');
    }

    // Security: Do not allow origin to frame outside of proper security context
    resHeaders.set('X-Content-Type-Options', 'nosniff');

    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Origin Gateway Error',
        message: 'Could not connect to Dinely frontend origin.',
        target: ORIGIN_HOST,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
