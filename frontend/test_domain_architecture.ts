import { getTenantFromHostname, getTenantUrl, resolveTenantAppFromPath, getRestaurantPublicDomain } from './src/packages/utils/tenantResolver';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${message}`);
}

console.log('=== RUNNING TENANT DOMAIN ARCHITECTURE REGRESSION TESTS ===\n');

// 1. Platform Domain Resolution
console.log('--- 1. PLATFORM DOMAIN RESOLUTION ---');
const platformDomain = getTenantFromHostname('dinely.food');
assert(platformDomain.isTenantSubdomain === false, 'dinely.food is NOT a tenant subdomain');
assert(platformDomain.slug === null, 'dinely.food has null tenant slug');

const wwwPlatformDomain = getTenantFromHostname('www.dinely.food');
assert(wwwPlatformDomain.isTenantSubdomain === false, 'www.dinely.food is NOT a tenant subdomain');

const localPlatformDomain = getTenantFromHostname('localhost');
assert(localPlatformDomain.isTenantSubdomain === false, 'localhost is NOT a tenant subdomain');

// 2. Tenant Subdomain Resolution
console.log('\n--- 2. TENANT SUBDOMAIN RESOLUTION ---');
const theDunkDomain = getTenantFromHostname('the-dunk-3.dinely.food');
assert(theDunkDomain.isTenantSubdomain === true, 'the-dunk-3.dinely.food IS tenant subdomain');
assert(theDunkDomain.slug === 'the-dunk-3', 'the-dunk-3 slug parsed correctly');

const theLeoDomain = getTenantFromHostname('the-leo.dinely.food');
assert(theLeoDomain.isTenantSubdomain === true, 'the-leo.dinely.food IS tenant subdomain');
assert(theLeoDomain.slug === 'the-leo', 'the-leo slug parsed correctly');

const pizzaHouseDomain = getTenantFromHostname('pizza-house.dinely.food');
assert(pizzaHouseDomain.isTenantSubdomain === true, 'pizza-house.dinely.food IS tenant subdomain');
assert(pizzaHouseDomain.slug === 'pizza-house', 'pizza-house slug parsed correctly');

const localTenantDomain = getTenantFromHostname('the-dunk-3.localhost');
assert(localTenantDomain.isTenantSubdomain === true, 'the-dunk-3.localhost IS tenant subdomain in dev');
assert(localTenantDomain.slug === 'the-dunk-3', 'the-dunk-3 slug parsed in dev');

// 3. Canonical Tenant URL Generation (Section 16: getTenantUrl helper)
console.log('\n--- 3. CANONICAL TENANT URL GENERATION ---');
assert(
  getTenantUrl('the-dunk-3', '/restaurant/dashboard') === 'https://the-dunk-3.dinely.food/restaurant/dashboard',
  'getTenantUrl generates https://the-dunk-3.dinely.food/restaurant/dashboard'
);

assert(
  getTenantUrl({ publicSlug: 'pizza-house' }, '/restaurant/dashboard') === 'https://pizza-house.dinely.food/restaurant/dashboard',
  'getTenantUrl with restaurant object produces https://pizza-house.dinely.food/restaurant/dashboard'
);

assert(
  getTenantUrl({ slug: 'the-leo' }, '/kitchen') === 'https://the-leo.dinely.food/kitchen',
  'getTenantUrl for operational terminal /kitchen'
);

assert(
  getTenantUrl('the-dunk-3', '/customer?table=03&tableId=t-123') === 'https://the-dunk-3.dinely.food/customer?table=03&tableId=t-123',
  'Customer QR URL generated with correct tenant hostname'
);

// 4. Path Routing on Tenant Domain
console.log('\n--- 4. TENANT DOMAIN PATH ROUTING ---');
assert(resolveTenantAppFromPath('/restaurant/dashboard') === 'SETTINGS', '/restaurant/dashboard maps to SETTINGS (restaurant app)');
assert(resolveTenantAppFromPath('/menu') === 'SETTINGS', '/menu maps to SETTINGS');
assert(resolveTenantAppFromPath('/floorplan') === 'SETTINGS', '/floorplan maps to SETTINGS');
assert(resolveTenantAppFromPath('/tables') === 'SETTINGS', '/tables maps to SETTINGS');
assert(resolveTenantAppFromPath('/staff') === 'SETTINGS', '/staff maps to SETTINGS');
assert(resolveTenantAppFromPath('/reports') === 'SETTINGS', '/reports maps to SETTINGS');
assert(resolveTenantAppFromPath('/settings') === 'SETTINGS', '/settings maps to SETTINGS');
assert(resolveTenantAppFromPath('/kitchen') === 'KITCHEN', '/kitchen maps to KITCHEN');
assert(resolveTenantAppFromPath('/waiter') === 'WAITER', '/waiter maps to WAITER');
assert(resolveTenantAppFromPath('/bar') === 'BAR', '/bar maps to BAR');
assert(resolveTenantAppFromPath('/inventory') === 'INVENTORY', '/inventory maps to INVENTORY');
assert(resolveTenantAppFromPath('/billing') === 'BILLING', '/billing maps to BILLING');
assert(resolveTenantAppFromPath('/customer') === 'CUSTOMER', '/customer maps to CUSTOMER');

// 5. Restaurant Switch Simulation (Section 3)
console.log('\n--- 5. RESTAURANT SWITCH NAVIGATION ---');
const ownerCurrentTenant = 'the-dunk-3';
const ownerSelectedTarget = { id: 'rest_pizza_1', publicSlug: 'pizza-house', name: 'Pizza House' };
const targetSwitchUrl = getTenantUrl(ownerSelectedTarget, '/restaurant/dashboard');
assert(
  targetSwitchUrl === 'https://pizza-house.dinely.food/restaurant/dashboard',
  'Switching restaurant moves browser hostname to https://pizza-house.dinely.food/restaurant/dashboard'
);
assert(
  new URL(targetSwitchUrl).hostname !== `${ownerCurrentTenant}.dinely.food`,
  'Hostname changes upon restaurant switch (NOT just React state)'
);

// 6. Cross-Tenant Isolation Verification
console.log('\n--- 6. CROSS-TENANT HOSTNAME VERIFICATION ---');
const dunkHostname = 'the-dunk-3.dinely.food';
const pizzaHostname = 'pizza-house.dinely.food';
const leoHostname = 'the-leo.dinely.food';

assert(getTenantFromHostname(dunkHostname).slug !== getTenantFromHostname(pizzaHostname).slug, 'THE DUNK slug != Pizza House slug');
assert(getTenantFromHostname(pizzaHostname).slug !== getTenantFromHostname(leoHostname).slug, 'Pizza House slug != THE LEO slug');
assert(getTenantFromHostname(leoHostname).slug !== getTenantFromHostname(dunkHostname).slug, 'THE LEO slug != THE DUNK slug');

console.log('\n🎉 ALL DOMAIN ARCHITECTURE REGRESSION TESTS PASSED SUCCESSFULLY!\n');
