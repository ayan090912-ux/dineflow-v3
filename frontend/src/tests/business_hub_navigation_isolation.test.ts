import assert from 'assert';
import {
  getTenantFromHostname,
  getRestaurantPublicDomain,
  getTenantUrl,
  resolveTenantAppFromPath,
  setSharedTenantCookie,
  getSharedTenantCookie,
  clearSharedTenantCookie,
} from '../packages/utils/tenantResolver';

console.log('====================================================');
console.log('STARTING BUSINESS HUB MULTI-TENANT NAVIGATION SUITE');
console.log('====================================================');

// Mock browser global environment
const mockWindow = {
  location: {
    hostname: 'the-start.dinely.food',
    protocol: 'https:',
    port: '',
    host: 'the-start.dinely.food',
    search: '',
    pathname: '/hub',
    origin: 'https://the-start.dinely.food',
  },
};
(global as any).window = mockWindow;

let cookieStore: string[] = [];
(global as any).document = {
  get cookie() {
    return cookieStore.join('; ');
  },
  set cookie(val: string) {
    const parts = val.split(';');
    const [nameVal] = parts;
    const [k, v] = nameVal.split('=');
    const existingIdx = cookieStore.findIndex((c) => c.startsWith(`${k.trim()}=`));
    if (val.includes('Max-Age=0')) {
      if (existingIdx >= 0) cookieStore.splice(existingIdx, 1);
    } else {
      if (existingIdx >= 0) cookieStore[existingIdx] = `${k.trim()}=${v || ''}`;
      else cookieStore.push(`${k.trim()}=${v || ''}`);
    }
  },
};

const businesses = [
  {
    id: 'rest-1790594544526-396022',
    name: 'THE START',
    slug: 'the-start',
    businessType: 'BAR',
    launchRoute: '/restaurant/dashboard',
    osType: 'RESTAURANT_OS',
  },
  {
    id: 'rest-1792151659078-4f1d79',
    name: 'local vender',
    slug: 'local-vender',
    businessType: 'RESTAURANT',
    launchRoute: '/restaurant/dashboard',
    osType: 'RESTAURANT_OS',
  },
  {
    id: 'rest-1792792919776-6cb5d4',
    name: 'MAX KART',
    slug: 'max-kart',
    businessType: 'FOOD_CART',
    launchRoute: '/cart/dashboard',
    osType: 'CART_OS',
  },
  {
    id: 'rest-1790715516065-f135b5',
    name: 'the leo',
    slug: 'the-leo',
    businessType: 'RESTAURANT',
    launchRoute: '/restaurant/dashboard',
    osType: 'RESTAURANT_OS',
  },
  {
    id: 'rest-1792997110836-e6db46',
    name: 'ayaan',
    slug: 'ayaan',
    businessType: 'BAR',
    launchRoute: '/restaurant/dashboard',
    osType: 'RESTAURANT_OS',
  },
];

// TEST 1: Canonical Tenant URL Generation
console.log('\n[TEST 1] Canonical Tenant URL Generation for Each Business');
for (const biz of businesses) {
  const url = getTenantUrl(biz, biz.launchRoute);
  assert.strictEqual(
    url,
    `https://${biz.slug}.dinely.food${biz.launchRoute}`,
    `URL for ${biz.name} must point to its own canonical subdomain`
  );
  console.log(`  ✓ ${biz.name} -> ${url}`);
}

// TEST 2: Bug Reproduction Check - No Business Defaults to THE START
console.log('\n[TEST 2] Bug Reproduction: No Business Silently Maps to THE START');
for (const biz of businesses) {
  const url = getTenantUrl(biz, biz.launchRoute);
  if (biz.slug !== 'the-start') {
    assert(
      !url.includes('the-start.dinely.food'),
      `Business ${biz.name} (${biz.slug}) must never redirect to the-start.dinely.food!`
    );
  }
}
console.log('  ✓ Verified: Non-THE-START businesses never produce the-start URLs');

// TEST 3: Operating System Boundaries Separation
console.log('\n[TEST 3] Operating System Boundaries Separation');
const restaurantApp = resolveTenantAppFromPath('/restaurant/dashboard');
assert.strictEqual(restaurantApp, 'SETTINGS', 'Restaurant OS dashboard resolves to SETTINGS');

const cartApp = resolveTenantAppFromPath('/cart/dashboard');
assert.strictEqual(cartApp, 'CART_OS', 'Small Cart OS dashboard resolves to CART_OS');

const cartMenu = resolveTenantAppFromPath('/cart/menu');
assert.strictEqual(cartMenu, 'CUSTOMER', 'Small Cart customer menu resolves to CUSTOMER');

const barTerminal = resolveTenantAppFromPath('/bar');
assert.strictEqual(barTerminal, 'BAR', 'Bar station terminal resolves to BAR');

const weddingPortal = resolveTenantAppFromPath('/weddings/dashboard');
assert.strictEqual(weddingPortal, 'EVENT_PORTAL', 'Wedding & Events OS resolves to EVENT_PORTAL');

const hubRoute = resolveTenantAppFromPath('/hub');
assert.strictEqual(hubRoute, 'HUB', 'Business Hub resolves to HUB');
console.log('  ✓ Verified: All 4 operating systems route to strictly separate subsystems');

// TEST 4: Cross-Subdomain Shared Cookie Storage
console.log('\n[TEST 4] Cross-Subdomain Shared Cookie Storage (.dinely.food)');
setSharedTenantCookie('dinely_auth_token', 'test_jwt_token_12345');
setSharedTenantCookie('dinely_active_restaurant_id', 'rest-1792151659078-4f1d79');

const tokenVal = getSharedTenantCookie('dinely_auth_token');
assert.strictEqual(tokenVal, 'test_jwt_token_12345', 'dinely_auth_token must be read from shared cookie');

const activeRestId = getSharedTenantCookie('dinely_active_restaurant_id');
assert.strictEqual(activeRestId, 'rest-1792151659078-4f1d79', 'Active restaurant ID must match local vender');

clearSharedTenantCookie('dinely_active_restaurant_id');
assert.strictEqual(getSharedTenantCookie('dinely_active_restaurant_id'), null, 'Cookie cleared successfully');
console.log('  ✓ Verified: Cross-subdomain cookie helper properly manages shared credentials');

// TEST 5: Subdomain Resolution Isolates Tenant Identity
console.log('\n[TEST 5] Subdomain Hostname Isolation');
const hosts = [
  { host: 'local-vender.dinely.food', expectedSlug: 'local-vender' },
  { host: 'max-kart.dinely.food', expectedSlug: 'max-kart' },
  { host: 'the-leo.dinely.food', expectedSlug: 'the-leo' },
  { host: 'ayaan.dinely.food', expectedSlug: 'ayaan' },
  { host: 'the-start.dinely.food', expectedSlug: 'the-start' },
];

for (const { host, expectedSlug } of hosts) {
  const resolution = getTenantFromHostname(host);
  assert.strictEqual(resolution.isTenantSubdomain, true, `${host} must be a tenant subdomain`);
  assert.strictEqual(resolution.slug, expectedSlug, `${host} must resolve to slug "${expectedSlug}"`);
  console.log(`  ✓ ${host} cleanly resolves to slug: "${resolution.slug}"`);
}

// TEST 6: Reserved Subdomains and Platform Domains
console.log('\n[TEST 6] Reserved Subdomains & Unknown Tenants');
const platformHosts = ['dinely.food', 'www.dinely.food', 'app.dinely.food', 'admin.dinely.food'];
for (const host of platformHosts) {
  const resolution = getTenantFromHostname(host);
  assert.strictEqual(resolution.isTenantSubdomain, false, `${host} must not be treated as a tenant subdomain`);
}
console.log('  ✓ Verified: Reserved platform domains rejected as tenant subdomains');

console.log('\n====================================================');
console.log('ALL BUSINESS HUB NAVIGATION TESTS PASSED (6/6)');
console.log('====================================================\n');
