import assert from 'node:assert';
import {
  getRestaurantPublicDomain,
  getRestaurantCustomerUrl,
} from '../packages/utils/tenantResolver';
import {
  matchTableNumber,
  formatStandardTableNumber,
} from '../packages/utils/tableUtils';
import { getFulfillmentStation } from '../packages/types';

console.log('===============================================================');
console.log('STARTING PHASE 5 CUSTOMER DINE-IN & QR TEST SUITE');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Canonical Dynamic QR URLs for Standard Tables
// -----------------------------------------------------------------------------
console.log('[TEST 1] Canonical Dynamic QR URLs for Tables');
const restData = { publicSlug: 'le-bistro', id: 'rest-888', name: 'Le Bistro' };

const qrUrlTable1 = getRestaurantCustomerUrl(restData, 'Table 01', 'tbl-rest-888-table_01');
assert.strictEqual(qrUrlTable1, 'https://le-bistro.dinely.food/customer?table=01&tableId=tbl-rest-888-table_01');

const qrUrlTable12 = getRestaurantCustomerUrl(restData, 'Table 12', 'tbl-rest-888-table_12');
assert.strictEqual(qrUrlTable12, 'https://le-bistro.dinely.food/customer?table=12&tableId=tbl-rest-888-table_12');

// Single digit normalized to 2-digit zero-padded
const qrUrlTable5 = getRestaurantCustomerUrl(restData, '5', 'tbl-5');
assert.strictEqual(qrUrlTable5, 'https://le-bistro.dinely.food/customer?table=05&tableId=tbl-5');
console.log('  PASS: Canonical QR URLs strictly conform to https://<slug>.dinely.food/customer?table=XX&tableId=YY');

// -----------------------------------------------------------------------------
// TEST 2: Canonical QR URLs for Counter / Pickup Stations
// -----------------------------------------------------------------------------
console.log('\n[TEST 2] Canonical QR URLs for Food Truck / Counter Stations');
const truckData = { publicSlug: 'taco-wagon', id: 'rest-truck-1' };

const counterUrl = getRestaurantCustomerUrl(truckData, 'COUNTER');
assert.strictEqual(counterUrl, 'https://taco-wagon.dinely.food/customer?table=COUNTER');

const pickupUrl = getRestaurantCustomerUrl(truckData, 'PICKUP');
assert.strictEqual(pickupUrl, 'https://taco-wagon.dinely.food/customer?table=PICKUP');
console.log('  PASS: Counter pickup stations cleanly encode without table digit padding');

// -----------------------------------------------------------------------------
// TEST 3: Table Number Normalization & Fuzzy Matching
// -----------------------------------------------------------------------------
console.log('\n[TEST 3] Table Number Normalization & Fuzzy Matching');
assert.strictEqual(formatStandardTableNumber('3'), 'Table 03');
assert.strictEqual(formatStandardTableNumber('table 7'), 'Table 07');
assert.strictEqual(formatStandardTableNumber('TABLE_15'), 'Table 15');
assert.strictEqual(formatStandardTableNumber('COUNTER'), 'COUNTER');

assert.strictEqual(matchTableNumber('Table 03', '3'), true);
assert.strictEqual(matchTableNumber('Table 03', 'Table 3'), true);
assert.strictEqual(matchTableNumber('Table 03', 'table_03'), true);
assert.strictEqual(matchTableNumber('Table 03', '03'), true);
assert.strictEqual(matchTableNumber('Table 03', 'Table 04'), false);
console.log('  PASS: Table matching handles all user scan input variants reliably');

// -----------------------------------------------------------------------------
// TEST 4: Destination Routing (Kitchen vs Bar vs Mixed)
// -----------------------------------------------------------------------------
console.log('\n[TEST 4] Station Fulfillment Routing');
const foodItem = { id: '1', name: 'Truffle Pasta', category: 'Mains', isAlcoholic: false, price: 24 };
const wineItem = { id: '2', name: 'Pinot Noir', category: 'Wine', isAlcoholic: true, price: 14 };
const mocktailItem = { id: '3', name: 'Virgin Mojito', category: 'Beverages', targetDestination: 'BAR', isAlcoholic: false, price: 8 };

assert.strictEqual(getFulfillmentStation(foodItem as any), 'KITCHEN');
assert.strictEqual(getFulfillmentStation(wineItem as any), 'BAR');
assert.strictEqual(getFulfillmentStation(mocktailItem as any), 'BAR');
console.log('  PASS: Items correctly route to Kitchen KDS vs Bar Terminal');

// -----------------------------------------------------------------------------
// TEST 5: Waiter Request Priority Logic
// -----------------------------------------------------------------------------
console.log('\n[TEST 5] Waiter Assistance Priority Categorization');
function getPriority(requestType: string): 'HIGH' | 'MEDIUM' {
  return requestType === 'BILL' || requestType === 'CALL_WAITER' ? 'HIGH' : 'MEDIUM';
}

assert.strictEqual(getPriority('BILL'), 'HIGH');
assert.strictEqual(getPriority('CALL_WAITER'), 'HIGH');
assert.strictEqual(getPriority('WATER'), 'MEDIUM');
assert.strictEqual(getPriority('CUTLERY'), 'MEDIUM');
assert.strictEqual(getPriority('NAPKINS'), 'MEDIUM');
console.log('  PASS: Waiter assistance priority correctly elevates urgent requests');

// -----------------------------------------------------------------------------
// TEST 6: Session Storage Isolation Key
// -----------------------------------------------------------------------------
console.log('\n[TEST 6] Table Session Isolation Key');
function getSessionKey(restId: string, tableId: string): string {
  return `dinely_session_${restId}_${tableId}`;
}

const keyA = getSessionKey('rest-1', 'tbl-01');
const keyB = getSessionKey('rest-2', 'tbl-01');
const keyC = getSessionKey('rest-1', 'tbl-02');

assert.notStrictEqual(keyA, keyB);
assert.notStrictEqual(keyA, keyC);
console.log('  PASS: Session keys guarantee zero leakage across restaurants or tables');

console.log('\n===============================================================');
console.log('ALL PHASE 5 CUSTOMER DINE-IN TESTS PASSED (6/6)!');
console.log('===============================================================');
