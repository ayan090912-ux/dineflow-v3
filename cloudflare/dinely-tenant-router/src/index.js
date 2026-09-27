/**
 * Dinely Multi-Tenant Cloudflare Worker: dinely-tenant-router
 *
 * Architecture:
 * - https://dinely.food/*            -> Primary Dinely Platform (Owner dashboard, Admin, Landing)
 * - https://<slug>.dinely.food/*     -> Tenant Customer Experience (Digital Menu, QR scan, Table ordering)
 *
 * Origin:
 * - Dinely Hardened EC2 Elastic IP Origin: ec2-3-7-195-143.ap-south-1.compute.amazonaws.com (3.7.195.143)
 */

const DEFAULT_ORIGIN_HOST = 'ec2-3-7-195-143.ap-south-1.compute.amazonaws.com';

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
    const originHost = env?.ORIGIN_HOST || DEFAULT_ORIGIN_HOST;
    const originBase = `http://${originHost}`;

    const url = new URL(request.url);
    const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.hostname;
    const originalHostname = hostHeader.split(':')[0].toLowerCase().trim();

    // 1. Root Platform Domain Handling (dinely.food or www.dinely.food)
    if (
      originalHostname === 'dinely.food' ||
      originalHostname === 'www.dinely.food'
    ) {
      return proxyToOrigin(request, url, originalHostname, null, false, originBase, originHost);
    }

    // 2. Tenant Subdomain & Custom Domain Extraction
    let tenantSlug = null;
    let isCustomDomain = false;
    if (originalHostname.endsWith('.dinely.food')) {
      tenantSlug = originalHostname.slice(0, -'.dinely.food'.length).trim();
    } else if (originalHostname.endsWith('.localhost')) {
      tenantSlug = originalHostname.slice(0, -'.localhost'.length).trim();
    } else {
      isCustomDomain = true;
    }

    // If it's a reserved platform subdomain
    if (tenantSlug && RESERVED_SUBDOMAINS.has(tenantSlug)) {
      return proxyToOrigin(request, url, originalHostname, null, false, originBase, originHost);
    }

    // 3. Valid Tenant Subdomain or Custom Domain: Proxy to origin with tenant headers preserved
    return proxyToOrigin(request, url, originalHostname, tenantSlug, isCustomDomain, originBase, originHost);
  },
};

/**
 * Proxies request to Dinely EC2 Nginx origin while preserving the original tenant hostname
 */
async function proxyToOrigin(request, url, originalHostname, tenantSlug, isCustomDomain = false, originBase, originHost) {
  // Target URL points to Dinely EC2 origin while keeping exact pathname and search query
  const targetUrl = new URL(url.pathname + url.search, originBase);

  // Prepare safe proxy headers
  const reqHeaders = new Headers(request.headers);

  // CRITICAL: Preserve original tenant hostname in Host header so Nginx / FastAPI resolves tenant accurately
  reqHeaders.set('Host', originalHostname);
  reqHeaders.set('X-Forwarded-Host', originalHostname);
  reqHeaders.set('X-Forwarded-Proto', 'https');
  reqHeaders.set('X-Real-IP', request.headers.get('CF-Connecting-IP') || '');

  if (tenantSlug) {
    reqHeaders.set('X-Tenant-Slug', tenantSlug);
  }
  if (isCustomDomain) {
    reqHeaders.set('X-Dinely-Custom-Domain', 'true');
  }

  // Handle request init (support GET, HEAD, POST, PUT, DELETE, WebSocket upgrade, etc.)
  const requestInit = {
    method: request.method,
    headers: reqHeaders,
    redirect: 'follow',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    requestInit.body = request.body;
  }

  try {
    const originResponse = await fetch(targetUrl.toString(), requestInit);

    // Build response headers preserving origin cache and type headers
    const resHeaders = new Headers(originResponse.headers);

    // If origin issues a redirect, rewrite Location to preserve HTTPS and tenant hostname
    if (resHeaders.has('Location')) {
      let loc = resHeaders.get('Location');
      loc = loc
        .replace(originHost, originalHostname)
        .replace('http://', 'https://');
      resHeaders.set('Location', loc);
    }

    // Telemetry headers
    resHeaders.set('X-Dinely-Routed-By', 'dinely-tenant-router');
    resHeaders.set('X-Dinely-Original-Host', originalHostname);
    if (tenantSlug) {
      resHeaders.set('X-Dinely-Tenant-Slug', tenantSlug);
    }
    if (isCustomDomain) {
      resHeaders.set('X-Dinely-Custom-Domain', 'true');
    }

    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers: resHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Origin Gateway Error',
        message: 'Could not connect to Dinely production origin.',
        details: err.message,
        target: originalHostname,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
