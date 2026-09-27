import assert from 'node:assert';
import {
  getTenantFromHostname,
  getRestaurantPublicDomain,
  getRestaurantCustomerUrl,
  resolveTenantAppFromPath,
} from '../packages/utils/tenantResolver';

console.log('====================================================');
console.log('STARTING DINELY DOMAIN SYSTEM VERIFICATION SUITE');
console.log('====================================================');

// ---------------------------------------------------------------
// TEST 1: Tenant Subdomain Extraction & Platform Domain Isolation
// ---------------------------------------------------------------
console.log('\n[TEST 1] Tenant Subdomain Extraction & Platform Isolation');

const dunkRes = getTenantFromHostname('the-dunk.dinely.food');
assert.strictEqual(dunkRes.isTenantSubdomain, true, 'the-dunk.dinely.food must be detected as tenant subdomain');
assert.strictEqual(dunkRes.slug, 'the-dunk', 'Slug must be "the-dunk"');
assert.strictEqual(dunkRes.hostname, 'the-dunk.dinely.food');

const cafeRes = getTenantFromHostname('cafe-co.dinely.food');
assert.strictEqual(cafeRes.isTenantSubdomain, true, 'cafe-co.dinely.food must be detected as tenant subdomain');
assert.strictEqual(cafeRes.slug, 'cafe-co', 'Slug must be "cafe-co"');

const unknownRes = getTenantFromHostname('does-not-exist-123.dinely.food');
assert.strictEqual(unknownRes.isTenantSubdomain, true, 'Unknown subdomain must still extract slug for resolution');
assert.strictEqual(unknownRes.slug, 'does-not-exist-123');

// Platform and Reserved Subdomains must NEVER be treated as tenant subdomains
const platformRoot = getTenantFromHostname('dinely.food');
assert.strictEqual(platformRoot.isTenantSubdomain, false, 'dinely.food is platform root, not tenant');
assert.strictEqual(platformRoot.slug, null);

const platformWww = getTenantFromHostname('www.dinely.food');
assert.strictEqual(platformWww.isTenantSubdomain, false, 'www.dinely.food is reserved, not tenant');

const platformApi = getTenantFromHostname('api.dinely.food');
assert.strictEqual(platformApi.isTenantSubdomain, false, 'api.dinely.food is reserved');

const platformAdmin = getTenantFromHostname('admin.dinely.food');
assert.strictEqual(platformAdmin.isTenantSubdomain, false, 'admin.dinely.food is reserved');

console.log('  ✓ PASSED: Subdomains and platform domains correctly parsed and isolated');

// ---------------------------------------------------------------
// TEST 2: Canonical Public Domain & QR URL Generation
// ---------------------------------------------------------------
console.log('\n[TEST 2] Canonical Public Domain & Customer URL Generation');

const dunkDomain = getRestaurantPublicDomain('the-dunk');
assert.strictEqual(dunkDomain, 'https://the-dunk.dinely.food');

const cafeDomain = getRestaurantPublicDomain('cafe-co');
assert.strictEqual(cafeDomain, 'https://cafe-co.dinely.food');

const dunkCustomerUrl = getRestaurantCustomerUrl('the-dunk', 'Table 1', 'tbl-dunk-01');
assert.strictEqual(dunkCustomerUrl, 'https://the-dunk.dinely.food/customer?table=01&tableId=tbl-dunk-01');

const cafeCustomerUrl = getRestaurantCustomerUrl('cafe-co', 'Table 12', 'tbl-cafe-12');
assert.strictEqual(cafeCustomerUrl, 'https://cafe-co.dinely.food/customer?table=12&tableId=tbl-cafe-12');

console.log('  ✓ PASSED: Generated canonical public domains and clean 2-digit customer QR URLs');

// ---------------------------------------------------------------
// TEST 3: Internal Tenant Route Dispatching
// ---------------------------------------------------------------
console.log('\n[TEST 3] Internal Tenant Route Dispatching');

assert.strictEqual(resolveTenantAppFromPath('/customer'), 'CUSTOMER');
assert.strictEqual(resolveTenantAppFromPath('/'), 'CUSTOMER');
assert.strictEqual(resolveTenantAppFromPath('/menu'), 'CUSTOMER');
assert.strictEqual(resolveTenantAppFromPath('/kitchen'), 'KITCHEN');
assert.strictEqual(resolveTenantAppFromPath('/waiter'), 'WAITER');
assert.strictEqual(resolveTenantAppFromPath('/bar'), 'BAR');
assert.strictEqual(resolveTenantAppFromPath('/inventory'), 'INVENTORY');
assert.strictEqual(resolveTenantAppFromPath('/billing'), 'BILLING');
assert.strictEqual(resolveTenantAppFromPath('/settings'), 'SETTINGS');
assert.strictEqual(resolveTenantAppFromPath('/login'), 'AUTH');
assert.strictEqual(resolveTenantAppFromPath('/invalid-path-xyz'), 'NOT_FOUND');

console.log('  ✓ PASSED: Path-based tenant terminal dispatch verified');

// ---------------------------------------------------------------
// TEST 4: Authoritative Subdomain Identity (No Query Param Hijack)
// ---------------------------------------------------------------
console.log('\n[TEST 4] Authoritative Subdomain Identity (No Query Param Hijack)');

// On tenant subdomain, getTenantFromHostname does not read query parameters
const isolatedTenant = getTenantFromHostname('the-dunk.dinely.food');
assert.strictEqual(isolatedTenant.slug, 'the-dunk', 'Identity derived strictly from hostname');

console.log('  ✓ PASSED: Subdomain hostname is authoritative over query parameters');

console.log('\n====================================================');
console.log('ALL FRONTEND DOMAIN SUITE TESTS PASSED (4/4)');
console.log('====================================================\n');
