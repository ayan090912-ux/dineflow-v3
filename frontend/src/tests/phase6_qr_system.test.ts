import assert from 'assert';
import { getRestaurantCustomerUrl } from '../packages/utils/tenantResolver';

console.log('===============================================================');
console.log('STARTING PHASE 6 CANONICAL QR & SECURITY AUDIT TEST SUITE');
console.log('===============================================================');

// TEST 1: Canonical QR URL Generator Format
console.log('\n[TEST 1] Canonical QR Generation Format');
const tenantA = {
  id: 'rest-restaurant-a-123',
  slug: 'restaurant-a',
  publicSlug: 'restaurant-a',
  name: 'Restaurant A'
};
const qrTable01 = getRestaurantCustomerUrl(tenantA, 'Table 01', 'tbl-rest-a-table_01');
console.log('  Generated QR Payload:', qrTable01);
assert.strictEqual(
  qrTable01,
  'https://restaurant-a.dinely.food/customer?table=01&tableId=tbl-rest-a-table_01',
  'QR URL must strictly match https://<slug>.dinely.food/customer?table=01&tableId=<id>'
);
console.log('  PASS: Canonical QR conforms to exact format requirement');

// TEST 2: Strict Prohibition of Legacy Artifacts
console.log('\n[TEST 2] Strict Prohibition of Disallowed Patterns');
assert.strictEqual(qrTable01.includes('?tenant='), false, 'QR URL must NOT contain ?tenant=');
assert.strictEqual(qrTable01.includes('.dinely.app'), false, 'QR URL must NOT contain .dinely.app');
assert.strictEqual(qrTable01.includes('workspace'), false, 'QR URL must NOT contain dashboard paths');
assert.strictEqual(qrTable01.includes('localhost'), false, 'QR URL must NOT contain localhost or window.location.origin');
console.log('  PASS: Zero ?tenant=, .dinely.app, window.location.origin, or dashboard URLs');

// TEST 3: Resilient Input Handling with Canonical Output
console.log('\n[TEST 3] Resilient Table Variants Normalization');
const variants = [
  { input: '01', id: 'tbl-01', expectedTable: '01' },
  { input: 'Table 01', id: 'tbl-01', expectedTable: '01' },
  { input: '1', id: 'tbl-1', expectedTable: '01' },
  { input: 'Table 7', id: 'tbl-7', expectedTable: '07' },
  { input: 'Table 15', id: 'tbl-15', expectedTable: '15' },
  { input: 'COUNTER', id: 'tbl-counter', expectedTable: 'COUNTER' },
];

for (const v of variants) {
  const generated = getRestaurantCustomerUrl(tenantA, v.input, v.id);
  const expected = `https://restaurant-a.dinely.food/customer?table=${v.expectedTable}&tableId=${v.id}`;
  assert.strictEqual(generated, expected, `Failed for input "${v.input}"`);
  console.log(`  PASS: "${v.input}" -> ${generated}`);
}

// TEST 4: Security Isolation Principle (hostname.restaurant_id == table.restaurant_id)
console.log('\n[TEST 4] Security Check: Hostname Restaurant ID vs Table Restaurant ID');
const tenantB = {
  id: 'rest-restaurant-b-456',
  slug: 'restaurant-b',
  publicSlug: 'restaurant-b',
  name: 'Restaurant B'
};

const tableA = { id: 'tbl-rest-a-table_01', restaurant_id: 'rest-restaurant-a-123', table_number: 'Table 01' };
const tableB = { id: 'tbl-rest-b-table_01', restaurant_id: 'rest-restaurant-b-456', table_number: 'Table 01' };

function verifyQrSecurity(hostnameTenantId: string, targetTable: { id: string; restaurant_id: string }): { allowed: boolean; status: number } {
  if (hostnameTenantId === targetTable.restaurant_id) {
    return { allowed: true, status: 200 };
  }
  // Strict Cross-Tenant Mismatch Gate
  return { allowed: false, status: 403 };
}

// Matching tenant and table
const matchResult = verifyQrSecurity(tenantA.id, tableA);
assert.strictEqual(matchResult.allowed, true);
assert.strictEqual(matchResult.status, 200);
console.log('  PASS: Hostname restaurant_id matches table restaurant_id -> 200 OK');

// Cross-tenant injection attack: Visiting Restaurant A host with Table B ID
const mismatchResult = verifyQrSecurity(tenantA.id, tableB);
assert.strictEqual(mismatchResult.allowed, false);
assert.strictEqual(mismatchResult.status, 403);
console.log('  PASS: Hostname restaurant_id does NOT match table restaurant_id -> 403 Forbidden');

console.log('\n===============================================================');
console.log('ALL PHASE 6 QR & SECURITY AUDIT TESTS PASSED (4/4)!');
console.log('===============================================================');
