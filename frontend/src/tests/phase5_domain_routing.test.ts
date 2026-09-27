import assert from 'node:assert';
import {
  getTenantFromHostname,
  resolveTenantAppFromPath,
  getRestaurantPublicDomain,
  getRestaurantCustomerUrl
} from '../packages/utils/tenantResolver';

console.log('===============================================================');
console.log('STARTING PHASE 5 FRONTEND TENANT DOMAIN ROUTING TEST SUITE');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Tenant Subdomain Extraction (Production *.dinely.food)
// -----------------------------------------------------------------------------
console.log('[TEST 1] Tenant Subdomain Extraction: the-dunk.dinely.food');
const tenantDunk = getTenantFromHostname('the-dunk.dinely.food');
assert.strictEqual(tenantDunk.isTenantSubdomain, true);
assert.strictEqual(tenantDunk.isCustomDomain, false);
assert.strictEqual(tenantDunk.slug, 'the-dunk');
assert.strictEqual(tenantDunk.hostname, 'the-dunk.dinely.food');
console.log('  PASS: Canonical tenant subdomain correctly resolved to slug="the-dunk"');

// -----------------------------------------------------------------------------
// TEST 2: Two Tenants Isolation (Tenant A vs Tenant B)
// -----------------------------------------------------------------------------
console.log('\n[TEST 2] Two Tenants Isolation: Tenant A vs Tenant B');
const tenantA = getTenantFromHostname('the-rustic-table.dinely.food');
const tenantB = getTenantFromHostname('bistro-indigo.dinely.food');

assert.strictEqual(tenantA.isTenantSubdomain, true);
assert.strictEqual(tenantA.slug, 'the-rustic-table');

assert.strictEqual(tenantB.isTenantSubdomain, true);
assert.strictEqual(tenantB.slug, 'bistro-indigo');

assert.notStrictEqual(tenantA.slug, tenantB.slug);
console.log('  PASS: Tenant A and Tenant B maintain distinct tenant identities');

// -----------------------------------------------------------------------------
// TEST 3: Primary Platform Domain Resolution (dinely.food & www.dinely.food)
// -----------------------------------------------------------------------------
console.log('\n[TEST 3] Platform Domain Isolation: dinely.food & www.dinely.food');
const rootPlatform = getTenantFromHostname('dinely.food');
assert.strictEqual(rootPlatform.isTenantSubdomain, false);
assert.strictEqual(rootPlatform.slug, null);

const wwwPlatform = getTenantFromHostname('www.dinely.food');
assert.strictEqual(wwwPlatform.isTenantSubdomain, false);
assert.strictEqual(wwwPlatform.slug, null);
console.log('  PASS: Platform apex and www subdomains correctly bypass tenant mode');

// -----------------------------------------------------------------------------
// TEST 4: Reserved Subdomain Protection
// -----------------------------------------------------------------------------
console.log('\n[TEST 4] Reserved Platform Subdomains (admin, api, app, platform)');
for (const reserved of ['admin', 'api', 'app', 'platform', 'staging', 'dev']) {
  const res = getTenantFromHostname(`${reserved}.dinely.food`);
  assert.strictEqual(res.isTenantSubdomain, false);
  assert.strictEqual(res.slug, null);
}
console.log('  PASS: Reserved infrastructure subdomains cannot be claimed as tenant slugs');

// -----------------------------------------------------------------------------
// TEST 5: Unknown Tenant Subdomain (random-abc.dinely.food)
// -----------------------------------------------------------------------------
console.log('\n[TEST 5] Unknown Tenant Subdomain Extraction (random-abc.dinely.food)');
const unknownTenant = getTenantFromHostname('random-abc.dinely.food');
assert.strictEqual(unknownTenant.isTenantSubdomain, true);
assert.strictEqual(unknownTenant.slug, 'random-abc');
console.log('  PASS: Unknown tenant hostname properly extracted for backend 404 resolution');

// -----------------------------------------------------------------------------
// TEST 6: Tenant Application Path Routing Inside Subdomain
// -----------------------------------------------------------------------------
console.log('\n[TEST 6] In-Tenant App Dispatcher');
assert.strictEqual(resolveTenantAppFromPath('/'), 'CUSTOMER');
assert.strictEqual(resolveTenantAppFromPath('/customer'), 'CUSTOMER');
assert.strictEqual(resolveTenantAppFromPath('/menu'), 'CUSTOMER');
assert.strictEqual(resolveTenantAppFromPath('/kitchen'), 'KITCHEN');
assert.strictEqual(resolveTenantAppFromPath('/waiter'), 'WAITER');
assert.strictEqual(resolveTenantAppFromPath('/bar'), 'BAR');
assert.strictEqual(resolveTenantAppFromPath('/inventory'), 'INVENTORY');
assert.strictEqual(resolveTenantAppFromPath('/billing'), 'BILLING');
assert.strictEqual(resolveTenantAppFromPath('/settings'), 'SETTINGS');
assert.strictEqual(resolveTenantAppFromPath('/login'), 'AUTH');
assert.strictEqual(resolveTenantAppFromPath('/invalid-path-404'), 'NOT_FOUND');
console.log('  PASS: All in-tenant paths resolve to exact internal workspace components');

// -----------------------------------------------------------------------------
// TEST 7: Canonical Public Domain & QR URL Generation
// -----------------------------------------------------------------------------
console.log('\n[TEST 7] Public Domain & Machine-Safe Customer URL Generation');
const pubDomain = getRestaurantPublicDomain({ publicSlug: 'the-dunk', id: 'rest-123' });
assert.strictEqual(pubDomain, 'https://the-dunk.dinely.food');

const customerQrUrl = getRestaurantCustomerUrl({ publicSlug: 'the-dunk', id: 'rest-123' }, 'Table 04', 'tbl-04');
assert.strictEqual(customerQrUrl, 'https://the-dunk.dinely.food/customer?table=04&tableId=tbl-04');
console.log('  PASS: Canonical tenant URL is strictly https://<slug>.dinely.food with zero redirect');

console.log('\n===============================================================');
console.log('ALL PHASE 5 FRONTEND TENANT ROUTING TESTS PASSED (7/7)!');
console.log('===============================================================');
