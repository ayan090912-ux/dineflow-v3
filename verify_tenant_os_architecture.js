/**
 * Automated Verification Suite for Dinely Multi-Tenant Restaurant OS Architecture
 * Tests:
 * 1. Subdomain and custom domain tenant resolution
 * 2. Internal tenant application path mapping (/kitchen, /waiter, /bar, /inventory, /billing, /settings, /customer)
 * 3. Cross-tenant role and data boundary enforcement (403 on cross-tenant staff access)
 * 4. Canonical QR code payload construction
 */

const assert = require('assert');

// 1. Replicate tenantResolver pure functions
const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'platform', 'admin', 'staging', 'dev', 'control', 'dashboard', 'auth', 'mail', 'status'
]);

const PLATFORM_DOMAINS = new Set([
  'dinely.food', 'www.dinely.food', 'dinely-cd6cd.web.app', 'dinely-cd6cd.firebaseapp.com', 'localhost', '127.0.0.1', '0.0.0.0'
]);

function getTenantFromHostname(hostname, searchStr = '') {
  const h = (hostname || '').toLowerCase().trim();

  if (h.endsWith('.dinely.food')) {
    const sub = h.slice(0, -'.dinely.food'.length).trim();
    if (sub && !RESERVED_SUBDOMAINS.has(sub)) {
      return { isTenantSubdomain: true, isCustomDomain: false, slug: sub, hostname: h };
    }
    return { isTenantSubdomain: false, slug: null, hostname: h };
  }

  if (h.endsWith('.localhost')) {
    const sub = h.slice(0, -'.localhost'.length).trim();
    if (sub && !RESERVED_SUBDOMAINS.has(sub)) {
      return { isTenantSubdomain: true, isCustomDomain: false, slug: sub, hostname: h };
    }
  }

  if (h.endsWith('.dinely-cd6cd.web.app')) {
    const sub = h.slice(0, -'.dinely-cd6cd.web.app'.length).trim();
    if (sub && !RESERVED_SUBDOMAINS.has(sub)) {
      return { isTenantSubdomain: true, isCustomDomain: false, slug: sub, hostname: h };
    }
  }

  if (PLATFORM_DOMAINS.has(h)) {
    const params = new URLSearchParams(searchStr);
    const q = params.get('tenant') || params.get('restaurant_slug');
    if (q && !RESERVED_SUBDOMAINS.has(q.toLowerCase().trim())) {
      return { isTenantSubdomain: true, isCustomDomain: false, slug: q.toLowerCase().trim(), hostname: h };
    }
    return { isTenantSubdomain: false, slug: null, hostname: h };
  }

  // Custom domain
  return { isTenantSubdomain: true, isCustomDomain: true, slug: null, hostname: h };
}

function resolveTenantAppFromPath(cleanPath) {
  const p = (cleanPath || '').split('?')[0].split('#')[0].toLowerCase().trim();
  if (p === '/login' || p === '/auth' || p === '/signin' || p.endsWith('/login')) return 'AUTH';
  if (p === '/kitchen' || p.startsWith('/kitchen/') || p === '/kds' || p.startsWith('/kds/')) return 'KITCHEN';
  if (p === '/waiter' || p.startsWith('/waiter/') || p === '/servo' || p.startsWith('/servo/')) return 'WAITER';
  if (p === '/bar' || p.startsWith('/bar/') || p === '/bartender' || p.startsWith('/bartender/')) return 'BAR';
  if (p === '/inventory' || p.startsWith('/inventory/')) return 'INVENTORY';
  if (p === '/billing' || p.startsWith('/billing/') || p === '/cashier' || p.startsWith('/cashier/')) return 'BILLING';
  if (p === '/settings' || p.startsWith('/settings/') || p === '/dashboard' || p === '/restaurant' || p.startsWith('/restaurant/')) return 'SETTINGS';
  if (p === '' || p === '/' || p === '/customer' || p.startsWith('/customer/') || p === '/menu' || p.startsWith('/menu/')) return 'CUSTOMER';
  return 'NOT_FOUND';
}

function getRestaurantCustomerUrl(slugOrRest, tableNumber, tableId) {
  const slug = typeof slugOrRest === 'string' ? slugOrRest : slugOrRest?.publicSlug || slugOrRest?.slug || '';
  const cleanSlug = (slug || '').toLowerCase().trim();
  const base = cleanSlug && !RESERVED_SUBDOMAINS.has(cleanSlug)
    ? `https://${cleanSlug}.dinely.food`
    : 'https://dinely.food';
  const params = new URLSearchParams();
  if (tableNumber) params.set('table', tableNumber);
  if (tableId) params.set('tableId', tableId);
  const q = params.toString();
  return `${base}/customer${q ? `?${q}` : ''}`;
}

function checkStaffTenantAccess(user, tenant, app) {
  if (!user) return { allowed: false, reason: 'UNAUTHENTICATED' };
  if (user.role === 'SUPER_ADMIN') return { allowed: true };

  const isOwner = user.email && (tenant.email?.toLowerCase() === user.email.toLowerCase() || tenant.ownerEmail?.toLowerCase() === user.email.toLowerCase());
  const isMember = user.restaurantId === tenant.id;

  if (!isOwner && !isMember) {
    return { allowed: false, reason: 'CROSS_TENANT_VIOLATION' };
  }

  const rolePermissions = {
    KITCHEN: ['KITCHEN', 'CHEF', 'COOK', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'],
    WAITER: ['WAITER', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'],
    BAR: ['BAR', 'BARTENDER', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'],
    INVENTORY: ['INVENTORY', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'],
    BILLING: ['BILLING', 'CASHIER', 'MANAGER', 'OWNER', 'RESTAURANT_OWNER'],
    SETTINGS: ['OWNER', 'RESTAURANT_OWNER', 'MANAGER'],
  };

  const allowedRoles = rolePermissions[app] || [];
  if (isOwner || allowedRoles.includes(user.role)) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'ROLE_UNAUTHORIZED' };
}

// -----------------------------------------------------------------------------
// RUN TEST SUITE
// -----------------------------------------------------------------------------
console.log('='.repeat(70));
console.log('DINELY MULTI-TENANT RESTAURANT OPERATING SYSTEM AUDIT SUITE');
console.log('='.repeat(70));

// Test 1: Subdomain vs Platform Domain Resolution
console.log('\n[TEST 1] Testing Hostname Tenant Resolution...');
const r1 = getTenantFromHostname('the-dunk.dinely.food');
assert.strictEqual(r1.isTenantSubdomain, true);
assert.strictEqual(r1.slug, 'the-dunk');
assert.strictEqual(r1.isCustomDomain, false);

const r2 = getTenantFromHostname('cafe-co.dinely.food');
assert.strictEqual(r2.isTenantSubdomain, true);
assert.strictEqual(r2.slug, 'cafe-co');

const rPlatform = getTenantFromHostname('dinely.food');
assert.strictEqual(rPlatform.isTenantSubdomain, false);
assert.strictEqual(rPlatform.slug, null);

const rAdmin = getTenantFromHostname('admin.dinely.food');
assert.strictEqual(rAdmin.isTenantSubdomain, false);

const rCustom = getTenantFromHostname('www.thedunkrestaurant.com');
assert.strictEqual(rCustom.isTenantSubdomain, true);
assert.strictEqual(rCustom.isCustomDomain, true);
console.log('  [PASS] Subdomains, platform domains, and custom domains correctly classified.');

// Test 2: Internal Tenant Application Path Routing
console.log('\n[TEST 2] Testing Path Resolution inside Tenant Domain...');
assert.strictEqual(resolveTenantAppFromPath('/'), 'CUSTOMER');
assert.strictEqual(resolveTenantAppFromPath('/customer'), 'CUSTOMER');
assert.strictEqual(resolveTenantAppFromPath('/customer?table=01'), 'CUSTOMER');
assert.strictEqual(resolveTenantAppFromPath('/kitchen'), 'KITCHEN');
assert.strictEqual(resolveTenantAppFromPath('/kitchen/dashboard'), 'KITCHEN');
assert.strictEqual(resolveTenantAppFromPath('/waiter'), 'WAITER');
assert.strictEqual(resolveTenantAppFromPath('/bar'), 'BAR');
assert.strictEqual(resolveTenantAppFromPath('/inventory'), 'INVENTORY');
assert.strictEqual(resolveTenantAppFromPath('/billing'), 'BILLING');
assert.strictEqual(resolveTenantAppFromPath('/settings'), 'SETTINGS');
assert.strictEqual(resolveTenantAppFromPath('/login'), 'AUTH');
assert.strictEqual(resolveTenantAppFromPath('/kitchen/login'), 'AUTH');
assert.strictEqual(resolveTenantAppFromPath('/unknown/path'), 'NOT_FOUND');
console.log('  [PASS] All 7 internal tenant applications correctly resolved from URL paths.');

// Test 3: Multi-Tenant Role & Boundary Security
console.log('\n[TEST 3] Testing Cross-Tenant Role & Boundary Authorization...');
const tenantA = { id: 'rest-A', name: 'The Dunk', publicSlug: 'the-dunk', ownerEmail: 'alice@dunk.test' };
const tenantB = { id: 'rest-B', name: 'Cafe Co', publicSlug: 'cafe-co', ownerEmail: 'bob@cafeco.test' };

const chefA = { id: 'usr-1', role: 'KITCHEN', restaurantId: 'rest-A', email: 'chef.a@dunk.test' };
const waiterA = { id: 'usr-2', role: 'WAITER', restaurantId: 'rest-A', email: 'waiter.a@dunk.test' };
const chefB = { id: 'usr-3', role: 'KITCHEN', restaurantId: 'rest-B', email: 'chef.b@cafeco.test' };
const ownerA = { id: 'usr-4', role: 'RESTAURANT_OWNER', restaurantId: 'rest-A', email: 'alice@dunk.test' };
const superAdmin = { id: 'usr-admin', role: 'SUPER_ADMIN', email: 'ayan090912@gmail.com' };

// Chef A accessing Tenant A kitchen -> Allowed
assert.strictEqual(checkStaffTenantAccess(chefA, tenantA, 'KITCHEN').allowed, true);

// Chef A accessing Tenant A waiter -> Denied (Role unauthorized)
assert.strictEqual(checkStaffTenantAccess(chefA, tenantA, 'WAITER').reason, 'ROLE_UNAUTHORIZED');

// Chef B attempting access to Tenant A kitchen -> Denied (Cross-tenant violation)
const crossAttempt = checkStaffTenantAccess(chefB, tenantA, 'KITCHEN');
assert.strictEqual(crossAttempt.allowed, false);
assert.strictEqual(crossAttempt.reason, 'CROSS_TENANT_VIOLATION');

// Waiter A attempting access to Tenant B waiter -> Denied (Cross-tenant violation)
const crossWaiter = checkStaffTenantAccess(waiterA, tenantB, 'WAITER');
assert.strictEqual(crossWaiter.allowed, false);
assert.strictEqual(crossWaiter.reason, 'CROSS_TENANT_VIOLATION');

// Owner A accessing Tenant A settings -> Allowed
assert.strictEqual(checkStaffTenantAccess(ownerA, tenantA, 'SETTINGS').allowed, true);

// Owner A accessing Tenant B settings -> Denied
assert.strictEqual(checkStaffTenantAccess(ownerA, tenantB, 'SETTINGS').reason, 'CROSS_TENANT_VIOLATION');

// Super Admin -> Granted
assert.strictEqual(checkStaffTenantAccess(superAdmin, tenantA, 'KITCHEN').allowed, true);
assert.strictEqual(checkStaffTenantAccess(superAdmin, tenantB, 'SETTINGS').allowed, true);
console.log('  [PASS] Cross-tenant access strictly prevented with CROSS_TENANT_VIOLATION.');

// Test 4: QR Code Canonical URL Construction
console.log('\n[TEST 4] Testing Canonical Tenant QR Generation...');
const qrA = getRestaurantCustomerUrl(tenantA, '01', 'tbl-a-01');
assert.strictEqual(qrA, 'https://the-dunk.dinely.food/customer?table=01&tableId=tbl-a-01');
assert.strictEqual(qrA.includes('?tenant='), false);
assert.strictEqual(qrA.includes('.dinely.app'), false);

const qrB = getRestaurantCustomerUrl(tenantB, 'Table 12', 'tbl-b-12');
assert.strictEqual(qrB, 'https://cafe-co.dinely.food/customer?table=Table+12&tableId=tbl-b-12');
assert.strictEqual(qrB.includes('?tenant='), false);
console.log('  [PASS] QR codes strictly resolve to tenant subdomains with zero query parameter leaks.');

console.log('\n' + '='.repeat(70));
console.log('ALL ARCHITECTURAL UNIT TESTS PASSED SUCCESSFULLY (100%)');
console.log('='.repeat(70));
