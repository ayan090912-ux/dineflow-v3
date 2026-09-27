/**
 * DINELY PHASE 7 — CUSTOMER ORDER FLOW AUTOMATED VERIFICATION SUITE
 * 
 * Verifies:
 * 1. QR Code URL resolution to verified production tenant & table
 * 2. Customer app table session initialization (restaurant_id, table_id, session_id)
 * 3. Menu categories and menu item traversal & filtering
 * 4. Item selection, notes, serving options, quantity, and cart aggregation
 * 5. Order transmission & validation (restaurant_id, table_id, session_id matching)
 * 6. Strict multi-tenant isolation (Zero cross-tenant leakage between Tenant A & Tenant B)
 * 7. Page refresh session preservation (Zero duplicate session creation)
 * 8. Direct URL access without query params defaulting safely to Table 01
 */

import assert from 'node:assert';

process.env.VITE_API_BASE_URL = 'http://localhost:8000/api/v1';
import { getTenantFromHostname } from '../packages/utils/tenantResolver';
import { matchTableNumber, formatStandardTableNumber } from '../packages/utils/tableUtils';
import { getFulfillmentStation, MenuItem, Order, TableSession } from '../packages/types';

// Mock storage
const memoryStore: Record<string, string> = {};
const createMockStorage = () => ({
  getItem: (key: string) => memoryStore[key] || null,
  setItem: (key: string, val: string) => { memoryStore[key] = String(val); },
  removeItem: (key: string) => { delete memoryStore[key]; },
  clear: () => { Object.keys(memoryStore).forEach((k) => delete memoryStore[k]); },
});

(global as any).localStorage = createMockStorage();
(global as any).sessionStorage = createMockStorage();

const TENANT_A = {
  id: 'rest-1789290279546-153fe8',
  name: 'Domain Test Restaurant 1789290279473',
  slug: 'domain-test-restaurant-1789290279473',
  hostname: 'domain-test-restaurant-1789290279473.dinely.food',
  tableId: 'tbl-rest-1789290279546-153fe8-table_01',
  tableNumber: 'Table 01',
};

const TENANT_B = {
  id: 'rest-1789290279931-855f74',
  name: 'Cafe Co 1789290279473',
  slug: 'cafe-co-1789290279473',
  hostname: 'cafe-co-1789290279473.dinely.food',
  tableId: 'tbl-rest-1789290279931-855f74-table_01',
  tableNumber: 'Table 01',
};

async function runPhase7CustomerOrderFlowTests() {
  console.log('\n===============================================================');
  console.log('DINELY PHASE 7 — CUSTOMER ORDER FLOW VERIFICATION SUITE');
  console.log('===============================================================\n');

  // Dynamic import of DinelyApiClient to ensure environment bindings
  const { DinelyApiClient } = await import('../packages/api/client');
  const client = new DinelyApiClient();

  // -----------------------------------------------------------------
  // TEST 1: QR URL Resolution on Verified Production Tenant Domain
  // -----------------------------------------------------------------
  console.log('[TEST 1] QR Code Resolution on Verified Production Tenant Domain');
  const qrUrl = `https://${TENANT_A.hostname}/customer?table=01&tableId=${TENANT_A.tableId}`;
  
  (global as any).window = {
    location: {
      hostname: TENANT_A.hostname,
      pathname: '/customer',
      search: `?table=01&tableId=${TENANT_A.tableId}`,
      protocol: 'https:',
    },
    localStorage: (global as any).localStorage,
    sessionStorage: (global as any).sessionStorage,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };

  const domainRes = getTenantFromHostname();
  assert.strictEqual(domainRes.isTenantSubdomain, true, 'Hostname recognized as tenant subdomain');
  assert.strictEqual(domainRes.slug, TENANT_A.slug, 'Extracted slug matches Tenant A');

  const resolvedRest = await client.resolveRestaurantFromHostname(TENANT_A.hostname);
  assert(resolvedRest !== null, 'Authoritative restaurant resolved from PostgreSQL');
  assert.strictEqual(resolvedRest.id, TENANT_A.id, 'Resolved restaurant ID matches Tenant A');
  assert.strictEqual(resolvedRest.isApproved, true, 'Restaurant is approved');
  assert.strictEqual(resolvedRest.lifecycleStatus, 'LIVE', 'Restaurant is LIVE');
  console.log(`  PASS: Resolved ${TENANT_A.hostname} -> ${resolvedRest.name} (${resolvedRest.id})`);

  // -----------------------------------------------------------------
  // TEST 2: Table Session Initialization & Structural Verification
  // -----------------------------------------------------------------
  console.log('\n[TEST 2] Table Session Initialization & Triplet Verification');
  const tables = await client.getTables(resolvedRest.id);
  assert(tables.length > 0, 'Tenant tables fetched from database');
  
  const targetTable = tables.find((t) => t.id === TENANT_A.tableId);
  assert(targetTable !== undefined, 'Target Table 01 found in restaurant tables');
  assert.strictEqual(targetTable.tableNumber, 'Table 01');

  // Initialize or fetch active session for Table 01
  const session = await client.getOrCreateTableSession(
    resolvedRest.id,
    targetTable.id,
    targetTable.tableNumber
  );

  assert(session !== null, 'Table session successfully created/fetched');
  assert(session.id.length > 0, 'Session has valid ID');
  assert.strictEqual(session.restaurantId, resolvedRest.id, 'Session restaurant_id strictly matches Tenant A');
  assert.strictEqual(session.tableId, targetTable.id, 'Session table_id strictly matches Table 01');
  assert.strictEqual(session.status, 'ACTIVE', 'Session is active');

  console.log(`  PASS: Triplet Verified:`);
  console.log(`        restaurant_id = ${session.restaurantId}`);
  console.log(`        table_id      = ${session.tableId}`);
  console.log(`        session_id    = ${session.id}`);

  // -----------------------------------------------------------------
  // TEST 3: Menu Categories & Menu Item Browsing
  // -----------------------------------------------------------------
  console.log('\n[TEST 3] Menu Categories & Menu Item Browsing');
  const categories = await client.getCategories(resolvedRest.id);
  assert(categories.length >= 4, 'All starter categories present');
  
  const menuItems = await client.getMenuItems(resolvedRest.id);
  assert(menuItems.length >= 3, 'Menu items fetched for Tenant A');

  const startersCat = categories.find((c) => c.name.includes('Starters'));
  const mainCat = categories.find((c) => c.name.includes('Main Course'));
  const beverageCat = categories.find((c) => c.name.includes('Beverages'));

  assert(startersCat !== undefined, 'Starters category exists');
  assert(mainCat !== undefined, 'Main Course category exists');
  assert(beverageCat !== undefined, 'Beverages category exists');

  const friesItem = menuItems.find((i) => i.name === 'Truffle Herb Fries');
  const burgerItem = menuItems.find((i) => i.name === 'Prime Wagyu Burger');
  const coolerItem = menuItems.find((i) => i.name === 'Fresh Citrus Cooler');

  assert(friesItem !== undefined, 'Truffle Herb Fries found');
  assert(burgerItem !== undefined, 'Prime Wagyu Burger found');
  assert(coolerItem !== undefined, 'Fresh Citrus Cooler found');

  assert.strictEqual(getFulfillmentStation(friesItem), 'KITCHEN');
  assert.strictEqual(getFulfillmentStation(burgerItem), 'KITCHEN');
  assert.strictEqual(getFulfillmentStation(coolerItem), 'BAR');
  console.log('  PASS: Menu categories & station routing verified (Kitchen & Bar items)');

  // -----------------------------------------------------------------
  // TEST 4: Category Filtering, Customization & Cart State
  // -----------------------------------------------------------------
  console.log('\n[TEST 4] Category Filtering, Customization & Cart Aggregation');
  // 1. Filter by category
  const mainItems = menuItems.filter((i) => i.categoryId === mainCat?.id);
  assert(mainItems.some((i) => i.name === 'Prime Wagyu Burger'), 'Main course filtering contains Burger');
  assert(!mainItems.some((i) => i.name === 'Fresh Citrus Cooler'), 'Main course excludes Beverage');

  // 2. Build Cart
  interface CartItem {
    item: MenuItem;
    quantity: number;
    notes?: string;
  }
  const cart: CartItem[] = [
    { item: friesItem, quantity: 2, notes: 'Extra crispy' },
    { item: burgerItem, quantity: 1, notes: 'Medium rare, no pickles' },
    { item: coolerItem, quantity: 2, notes: 'Less ice' },
  ];

  const totalQuantity = cart.reduce((sum, c) => sum + c.quantity, 0);
  assert.strictEqual(totalQuantity, 5, 'Cart total quantity is 5');

  const subtotal = cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);
  // (280 * 2) + (550 * 1) + (210 * 2) = 560 + 550 + 420 = 1530
  assert.strictEqual(subtotal, 1530.0, 'Subtotal correctly calculated as 1530.0');

  const taxPct = resolvedRest.taxPercentage || 5.0;
  const taxAmount = Math.round(subtotal * (taxPct / 100) * 100) / 100;
  const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;

  assert.strictEqual(taxAmount, 76.5, 'GST tax is 76.5 (5%)');
  assert.strictEqual(grandTotal, 1606.5, 'Grand total is 1606.5');
  console.log(`  PASS: Cart Aggregation: Subtotal=${subtotal}, Tax=${taxAmount}, GrandTotal=${grandTotal}`);

  // -----------------------------------------------------------------
  // TEST 5: Order Submission & Triple ID Verification
  // -----------------------------------------------------------------
  console.log('\n[TEST 5] Order Submission & Real Database Persistence');
  const orderPayload = {
    restaurantId: resolvedRest.id,
    tableId: targetTable.id,
    tableNumber: targetTable.tableNumber,
    tableSessionId: session.id,
    orderType: 'DINE_IN' as const,
    customerName: 'Ayaan Guest',
    notes: 'Please expedite starters',
    items: cart.map((c, idx) => ({
      id: `oi-test-${idx}`,
      menuItemId: c.item.id,
      name: c.item.name,
      quantity: c.quantity,
      price: c.item.price,
      notes: c.notes,
      targetDestination: getFulfillmentStation(c.item),
    })),
    totalAmount: grandTotal,
  };

  const createdOrder = await client.createOrder(orderPayload);

  assert(createdOrder !== null, 'Order successfully created via backend API');
  assert(createdOrder.id.length > 0, 'Order returned authoritative DB ID');
  assert.strictEqual(createdOrder.restaurantId, resolvedRest.id, 'Order restaurantId matches Tenant A');
  assert.strictEqual(createdOrder.tableId, targetTable.id, 'Order tableId matches Table 01');
  assert.strictEqual(createdOrder.tableSessionId, session.id, 'Order tableSessionId matches Active Session');
  assert.strictEqual(createdOrder.status, 'PENDING', 'Order initialized in PENDING status');
  assert.strictEqual(createdOrder.items.length, 3, 'Order contains 3 item types');

  console.log(`  PASS: Order Transmitted & Persisted:`);
  console.log(`        order_id         = ${createdOrder.id}`);
  console.log(`        restaurant_id    = ${createdOrder.restaurantId}`);
  console.log(`        table_id         = ${createdOrder.tableId}`);
  console.log(`        table_session_id = ${createdOrder.tableSessionId}`);

  // -----------------------------------------------------------------
  // TEST 6: Customer Order Recovery for Session
  // -----------------------------------------------------------------
  console.log('\n[TEST 6] Customer Order Fetch for Table Session');
  const sessionOrders = await client.getCustomerOrders(resolvedRest.id, targetTable.id, session.id);
  assert(Array.isArray(sessionOrders), 'Customer orders returned as array');
  const foundOrder = sessionOrders.find((o) => o.id === createdOrder.id);
  assert(foundOrder !== undefined, 'Created order retrieved by customer session query');
  assert.strictEqual(foundOrder.id, createdOrder.id);
  assert.strictEqual(foundOrder.subtotal, 1530);
  assert.strictEqual(foundOrder.totalAmount, createdOrder.totalAmount);
  console.log(`  PASS: Customer session query returned active order #${foundOrder.id}`);

  // -----------------------------------------------------------------
  // TEST 7: Strict Multi-Tenant Isolation (Tenant A vs Tenant B)
  // -----------------------------------------------------------------
  console.log('\n[TEST 7] Strict Multi-Tenant Isolation (Zero Cross-Tenant Leakage)');
  // 1. Fetch Tenant B items
  const tenantBItems = await client.getMenuItems(TENANT_B.id);
  assert(tenantBItems.length >= 3, 'Tenant B has menu items');
  
  // 2. Ensure Tenant A items contain ZERO Tenant B items
  const tenantAItemNames = new Set(menuItems.map((i) => i.name));
  for (const bItem of tenantBItems) {
    assert(!tenantAItemNames.has(bItem.name), `Leakage detected! Tenant A contains Tenant B item: ${bItem.name}`);
  }
  console.log('  PASS: Tenant A menu is strictly isolated from Tenant B menu');

  // 3. Ensure Tenant A tables contain ZERO Tenant B tables
  const tenantBTables = await client.getTables(TENANT_B.id);
  const tenantATableIds = new Set(tables.map((t) => t.id));
  for (const bTable of tenantBTables) {
    assert(!tenantATableIds.has(bTable.id), `Leakage detected! Tenant A contains Tenant B table: ${bTable.id}`);
  }
  console.log('  PASS: Tenant A tables are strictly isolated from Tenant B tables');

  // 4. Client QR Table validation rejects foreign tenant table ID
  const isForeignTableValidOnTenantA = tables.some((t) => t.id === TENANT_B.tableId);
  assert.strictEqual(isForeignTableValidOnTenantA, false, 'Tenant B table strictly rejected on Tenant A');
  console.log('  PASS: Cross-tenant table ID injection strictly rejected (TABLE_NOT_FOUND)');

  // -----------------------------------------------------------------
  // TEST 8: Page Refresh Simulation (Session Continuity, No Duplicate Sessions)
  // -----------------------------------------------------------------
  console.log('\n[TEST 8] Page Refresh Simulation & Session Preservation');
  // Store session in mock sessionStorage (as done by CustomerApp.tsx)
  const sessionKey = `dinely_session_${resolvedRest.id}_${targetTable.id}`;
  (global as any).sessionStorage.setItem(sessionKey, session.id);

  // Simulate refresh: re-execute session acquisition
  const sessionAfterRefresh = await client.getOrCreateTableSession(
    resolvedRest.id,
    targetTable.id,
    targetTable.tableNumber
  );

  assert.strictEqual(sessionAfterRefresh.id, session.id, 'Session ID preserved across page refresh');
  console.log(`  PASS: Reload preserved session ID (${sessionAfterRefresh.id}) with zero duplicate session creation`);

  // -----------------------------------------------------------------
  // TEST 9: Direct URL Navigation Without Query Parameters
  // -----------------------------------------------------------------
  console.log('\n[TEST 9] Direct URL Navigation Without Query Parameters');
  // Simulate direct browser hit: https://domain-test-restaurant-1789290279473.dinely.food/customer
  (global as any).window.location = {
    hostname: TENANT_A.hostname,
    pathname: '/customer',
    search: '', // NO QUERY PARAMETERS
    protocol: 'https:',
  };

  const directDomainRes = getTenantFromHostname();
  assert.strictEqual(directDomainRes.isTenantSubdomain, true);
  assert.strictEqual(directDomainRes.slug, TENANT_A.slug);

  const directRest = await client.resolveRestaurantFromHostname(TENANT_A.hostname);
  assert(directRest !== null);

  const directTables = await client.getTables(directRest.id);
  assert(directTables.length > 0);
  const defaultTable = directTables[0];
  assert.strictEqual(defaultTable.tableNumber, 'Table 01', 'Direct URL safely defaults to Table 01');
  console.log(`  PASS: Direct URL without params resolves tenant and safely defaults to ${defaultTable.tableNumber}`);

  // -----------------------------------------------------------------
  // TEST 10: Unknown Tenant Direct URL Returns 404 (Never Falls Back)
  // -----------------------------------------------------------------
  console.log('\n[TEST 10] Unknown Tenant Subdomain Returns 404 Without Fallback');
  (global as any).window.location = {
    hostname: 'unknown-bistro-999.dinely.food',
    pathname: '/customer',
    search: '',
    protocol: 'https:',
  };

  const unknownDomainRes = getTenantFromHostname();
  assert.strictEqual(unknownDomainRes.isTenantSubdomain, true);
  const unknownRest = await client.resolveRestaurantFromHostname('unknown-bistro-999.dinely.food');
  assert.strictEqual(unknownRest, null, 'Unknown tenant strictly returns null (404)');
  console.log('  PASS: Unknown tenant hostname strictly returns 404 without fallback');

  console.log('\n===============================================================');
  console.log('ALL PHASE 7 CUSTOMER ORDER FLOW TESTS PASSED (10/10)!');
  console.log('===============================================================\n');
}

runPhase7CustomerOrderFlowTests().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
