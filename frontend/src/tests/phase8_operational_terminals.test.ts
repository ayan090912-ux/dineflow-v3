/**
 * DINELY PHASE 8 - OPERATIONAL TERMINALS VERIFICATION SUITE
 *
 * Verified tenant: THE DUNK (rest-1788829828520 / the-dunk-3) - LIVE, all modules
 * Cross-tenant adversary: Bistro Beta (rest-1789192594648-c159c9) - LIVE
 *
 * Tests:
 *  [1] Customer order  -> Kitchen   (realtime + restaurant_id)
 *  [2] Waiter request  -> Waiter    (realtime + restaurant_id)
 *  [3] Bar item order  -> Bar       (realtime + restaurant_id)
 *  [4] Inventory adjust -> Inventory (realtime + restaurant_id)
 *  [5] Bill/session    -> Billing   (realtime + restaurant_id)
 *  [6] A events NEVER reach B terminals
 *  [7] B events NEVER reach A terminals
 */

import assert from 'node:assert';
import { WebSocket } from 'ws';

const BASE_URL = 'https://dineflow-v3.onrender.com/api/v1';
const WS_URL   = 'wss://dineflow-v3.onrender.com/api/v1/ws';

const TENANT_A = {
  id:          'rest-1788829828520',
  name:        'THE DUNK',
  tableId:     'tbl-rest-1788829828520-table_02',
  tableNumber: 'Table 02',
};

const TENANT_B = {
  id:          'rest-1789192594648-c159c9',
  name:        'Bistro Beta',
  tableId:     'tbl-rest-1789192594648-c159c9-table_01',
  tableNumber: 'Table 01',
};

let sessionAId = '';
let sessionBId = '';
let inventoryItemId = '';

async function apiPost(path: string, body: object, token?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${path} => ${res.status}: ${txt}`);
  }
  return res.json();
}

async function getToken(restaurantId: string, role: string): Promise<string> {
  const d = await apiPost('/auth/terminal-login', { restaurant_id: restaurantId, role, passcode: '1234' });
  if (!d.access_token) throw new Error(`No token for ${role}@${restaurantId}`);
  return d.access_token;
}

interface Listener { ws: any; tenantId: string; role: string; events: any[]; }

function connectWS(tenantId: string, role: string, token: string): Promise<Listener> {
  return new Promise((resolve, reject) => {
    const url = `${WS_URL}?restaurant_id=${encodeURIComponent(tenantId)}&role=${encodeURIComponent(role)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    const listener: Listener = { ws, tenantId, role, events: [] };
    const t = setTimeout(() => { ws.terminate(); reject(new Error(`WS timeout: ${tenantId}(${role})`)); }, 8000);
    ws.on('open', () => { clearTimeout(t); resolve(listener); });
    ws.on('message', (raw: any) => { try { listener.events.push(JSON.parse(raw.toString())); } catch {} });
    ws.on('error', (e: Error) => { clearTimeout(t); reject(e); });
  });
}

function waitEvt(l: Listener, pred: (e: any) => boolean, ms = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const m = l.events.find(pred);
      if (m) return resolve(m);
      if (Date.now() - start > ms) return reject(new Error(`Timeout ${ms}ms on ${l.tenantId}(${l.role}). Got: ${JSON.stringify(l.events.slice(-3))}`));
      setTimeout(check, 50);
    };
    check();
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function restId(evt: any): string {
  return evt.restaurant_id || evt.restaurantId || evt.payload?.restaurant_id || evt.payload?.restaurantId || '';
}

async function bootstrapSession(tenantId: string, tableId: string, tableNumber: string): Promise<string> {
  const now = Date.now();
  const o = await apiPost('/orders', {
    restaurantId: tenantId, tableId, tableNumber,
    customerName: 'P8-Boot', notes: 'Phase8 bootstrap', orderType: 'DINE_IN',
    items: [{ id: `p8-boot-${now}`, menuItemId: `p8-mi-boot-${now}`, name: 'Boot Item', price: 1.0, quantity: 1, targetDestination: 'KITCHEN' }],
  });
  const sid = o?.table_session_id || o?.tableSessionId;
  if (!sid) throw new Error(`No session ID in: ${JSON.stringify(o)}`);
  return sid;
}

async function createInvItem(tenantId: string, token: string): Promise<string> {
  const item = await apiPost('/inventory', {
    restaurantId: tenantId, restaurant_id: tenantId,
    name: `P8-Stock-${Date.now()}`, category: 'Kitchen', station: 'KITCHEN',
    quantity: 20, unit: 'kg', minThreshold: 5, costPerUnit: 100,
  }, token);
  if (!item?.id) throw new Error(`No ID in inv response: ${JSON.stringify(item)}`);
  return item.id;
}

async function main() {
  console.log('\n' + '='.repeat(65));
  console.log('  DINELY PHASE 8 - OPERATIONAL TERMINALS VERIFICATION SUITE');
  console.log('='.repeat(65));

  console.log('\n[SETUP] Acquiring terminal tokens...');
  const roles = ['KITCHEN', 'WAITER', 'BAR', 'INVENTORY', 'BILLING'] as const;
  const tA: Record<string, string> = {};
  const tB: Record<string, string> = {};
  for (const r of roles) {
    tA[r] = await getToken(TENANT_A.id, r);
    tB[r] = await getToken(TENANT_B.id, r);
    console.log(`  OK A-${r}  OK B-${r}`);
  }

  console.log('\n[SETUP] Opening 10 WebSocket station listeners (paced to avoid rate limit)...');
  const lA: Record<string, Listener> = {};
  const lB: Record<string, Listener> = {};
  for (const r of roles) {
    lA[r] = await connectWS(TENANT_A.id, r, tA[r]);
    await sleep(1200); // Rate limit: max 5 WS connects per 5s from same IP
    lB[r] = await connectWS(TENANT_B.id, r, tB[r]);
    await sleep(1200);
    console.log(`  WS A-${r}  WS B-${r}`);
  }
  assert.strictEqual(Object.keys(lA).length, 5, '5 A stations');
  assert.strictEqual(Object.keys(lB).length, 5, '5 B stations');
  console.log('\n  PASS 10 WebSocket connections live.\n');

  console.log('[SETUP] Bootstrapping sessions...');
  sessionAId = await bootstrapSession(TENANT_A.id, TENANT_A.tableId, TENANT_A.tableNumber);
  sessionBId = await bootstrapSession(TENANT_B.id, TENANT_B.tableId, TENANT_B.tableNumber);
  console.log(`  Session A: ${sessionAId}`);
  console.log(`  Session B: ${sessionBId}`);

  console.log('\n[SETUP] Creating test inventory item (Tenant A)...');
  inventoryItemId = await createInvItem(TENANT_A.id, tA['INVENTORY']);
  console.log(`  Inventory item: ${inventoryItemId}`);

  await sleep(400);
  Object.values(lA).forEach(l => { l.events = []; });
  Object.values(lB).forEach(l => { l.events = []; });

  // ── TEST 1: Customer Order -> Kitchen ─────────────────────────────────────
  console.log('\n' + '-'.repeat(65));
  console.log('[TEST 1] Customer Order -> Kitchen (Tenant A)');

  const kOrder = await apiPost('/orders', {
    restaurantId: TENANT_A.id, tableId: TENANT_A.tableId,
    tableNumber: TENANT_A.tableNumber, tableSessionId: sessionAId,
    customerName: 'P8 Guest', notes: 'Well done', orderType: 'DINE_IN',
    items: [{ id: `p8-k1-${Date.now()}`, menuItemId: `p8-mik1-${Date.now()}`, name: 'Wagyu Burger', price: 550, quantity: 1, targetDestination: 'KITCHEN' }],
  });
  assert(kOrder?.id, 'Kitchen order has ID');
  assert.strictEqual(kOrder.restaurantId || kOrder.restaurant_id, TENANT_A.id, 'Order has restaurant_id=A');
  console.log(`  Created: ${kOrder.id}`);

  const kEvt = await waitEvt(lA['KITCHEN'], e =>
    (e.type === 'order_created' || e.type === 'OrderCreated') &&
    (e.payload?.id === kOrder.id || e.payload?.order_id === kOrder.id));
  assert.strictEqual(restId(kEvt), TENANT_A.id, 'Kitchen event has restaurant_id=A');
  console.log(`  A-Kitchen received event. restaurant_id=${restId(kEvt)}  PASS`);

  await sleep(350);
  assert.strictEqual(lB['KITCHEN'].events.filter(e => e.payload?.id === kOrder.id || e.payload?.order_id === kOrder.id).length, 0, 'B-Kitchen got A event!');
  console.log('  B-Kitchen: 0 spill events  [isolation PASS]');

  // ── TEST 2: Waiter Request -> Waiter ──────────────────────────────────────
  console.log('\n' + '-'.repeat(65));
  console.log('[TEST 2] Waiter Request -> Waiter (Tenant A)');

  const wReq = await apiPost('/customer-requests', {
    restaurantId: TENANT_A.id, tableId: TENANT_A.tableId,
    tableNumber: TENANT_A.tableNumber, tableSessionId: sessionAId,
    requestType: 'WATER', customTitle: 'Still Water Request', message: '2 glasses', priority: 'MEDIUM',
  });
  assert(wReq?.id, 'Waiter request has ID');
  assert.strictEqual(wReq.restaurantId || wReq.restaurant_id, TENANT_A.id, 'Request has restaurant_id=A');
  console.log(`  Created: ${wReq.id}`);

  const wEvt = await waitEvt(lA['WAITER'], e =>
    (e.type === 'service_request_created' || e.type === 'customer_request_created' || e.type === 'CustomerRequestCreated') &&
    (e.payload?.id === wReq.id || e.payload?.requestId === wReq.id));
  assert.strictEqual(restId(wEvt), TENANT_A.id, 'Waiter event has restaurant_id=A');
  console.log(`  A-Waiter received event. restaurant_id=${restId(wEvt)}  PASS`);

  await sleep(350);
  assert.strictEqual(lB['WAITER'].events.filter(e => e.payload?.id === wReq.id || e.payload?.requestId === wReq.id).length, 0, 'B-Waiter got A event!');
  console.log('  B-Waiter: 0 spill events  [isolation PASS]');

  // ── TEST 3: Bar Order -> Bar ───────────────────────────────────────────────
  console.log('\n' + '-'.repeat(65));
  console.log('[TEST 3] Bar Item Order -> Bar (Tenant A)');

  const bOrder = await apiPost('/orders', {
    restaurantId: TENANT_A.id, tableId: TENANT_A.tableId,
    tableNumber: TENANT_A.tableNumber, tableSessionId: sessionAId,
    customerName: 'P8 Guest', notes: 'Extra lime', orderType: 'DINE_IN',
    items: [{ id: `p8-bar-${Date.now()}`, menuItemId: `p8-mibar-${Date.now()}`, name: 'Citrus Cooler', price: 210, quantity: 2, targetDestination: 'BAR', isAlcoholic: false }],
  });
  assert(bOrder?.id, 'Bar order has ID');
  assert.strictEqual(bOrder.restaurantId || bOrder.restaurant_id, TENANT_A.id, 'Bar order has restaurant_id=A');
  console.log(`  Created: ${bOrder.id}`);

  const bEvt = await waitEvt(lA['BAR'], e =>
    (e.type === 'order_created' || e.type === 'OrderCreated') &&
    (e.payload?.id === bOrder.id || e.payload?.order_id === bOrder.id));
  assert.strictEqual(restId(bEvt), TENANT_A.id, 'Bar event has restaurant_id=A');
  console.log(`  A-Bar received event. restaurant_id=${restId(bEvt)}  PASS`);

  await sleep(350);
  assert.strictEqual(lB['BAR'].events.filter(e => e.payload?.id === bOrder.id || e.payload?.order_id === bOrder.id).length, 0, 'B-Bar got A event!');
  console.log('  B-Bar: 0 spill events  [isolation PASS]');

  // ── TEST 4: Inventory -> Inventory ────────────────────────────────────────
  console.log('\n' + '-'.repeat(65));
  console.log('[TEST 4] Inventory Adjust -> Inventory Terminal (Tenant A)');

  const iData = await apiPost(`/inventory/${inventoryItemId}/adjust`, { delta: 5.0, reason: 'P8 Restock' }, tA['INVENTORY']);
  assert(iData?.id, 'Inventory adjust has ID');
  assert.strictEqual(iData.restaurantId, TENANT_A.id, 'Inventory has restaurant_id=A');
  console.log(`  Adjusted: ${inventoryItemId} qty=${iData.currentStock ?? iData.quantity}`);

  const iEvt = await waitEvt(lA['INVENTORY'], e =>
    (e.type === 'inventory_updated' || e.type === 'InventoryUpdated') && e.payload?.id === inventoryItemId);
  assert.strictEqual(restId(iEvt), TENANT_A.id, 'Inventory event has restaurant_id=A');
  console.log(`  A-Inventory received event. restaurant_id=${restId(iEvt)}  PASS`);

  await sleep(350);
  assert.strictEqual(lB['INVENTORY'].events.filter(e => e.payload?.id === inventoryItemId).length, 0, 'B-Inventory got A event!');
  console.log('  B-Inventory: 0 spill events  [isolation PASS]');

  // ── TEST 5: Bill -> Billing ────────────────────────────────────────────────
  console.log('\n' + '-'.repeat(65));
  console.log('[TEST 5] Bill Generation -> Billing Terminal (Tenant A)');

  const bill = await apiPost(`/restaurants/${TENANT_A.id}/billing/generate-invoice`, {
    tableNumber: TENANT_A.tableNumber, tableSessionId: sessionAId,
    paymentMethod: 'CASH', discountPercentage: 0, orderType: 'DINE_IN',
  });
  assert(bill?.id || bill?.invoice_number, 'Bill has ID');
  const bRId = bill.restaurant_id || bill.restaurantId;
  assert.strictEqual(bRId, TENANT_A.id, 'Bill has restaurant_id=A');
  console.log(`  Invoice: ${bill.invoice_number || bill.invoiceNumber || bill.id}`);

  const bilEvt = await waitEvt(lA['BILLING'], e =>
    (e.type === 'BillRequested' || e.type === 'bill_requested' ||
     e.type === 'TableStatusUpdated' || e.type === 'table_status_updated') &&
    (e.payload?.tableSessionId === sessionAId || e.payload?.table_session_id === sessionAId ||
     e.payload?.tableNumber === TENANT_A.tableNumber));
  assert.strictEqual(restId(bilEvt), TENANT_A.id, 'Billing event has restaurant_id=A');
  console.log(`  A-Billing received (${bilEvt.type}). restaurant_id=${restId(bilEvt)}  PASS`);

  await sleep(350);
  assert.strictEqual(lB['BILLING'].events.filter(e => e.payload?.tableSessionId === sessionAId || e.payload?.table_session_id === sessionAId).length, 0, 'B-Billing got A event!');
  console.log('  B-Billing: 0 spill events  [isolation PASS]');

  // ── TEST 6: Reverse (B -> B only, never A) ────────────────────────────────
  console.log('\n' + '-'.repeat(65));
  console.log('[TEST 6] Reverse Cross-Tenant: B operations stay in B terminals');
  Object.values(lA).forEach(l => { l.events = []; });
  Object.values(lB).forEach(l => { l.events = []; });

  const oB = await apiPost('/orders', {
    restaurantId: TENANT_B.id, tableId: TENANT_B.tableId,
    tableNumber: TENANT_B.tableNumber, tableSessionId: sessionBId,
    customerName: 'B Guest', notes: 'No onions', orderType: 'DINE_IN',
    items: [{ id: `p8-bk1-${Date.now()}`, menuItemId: `p8-bmik1-${Date.now()}`, name: 'Croque Monsieur', price: 420, quantity: 1, targetDestination: 'KITCHEN' }],
  });
  assert(oB?.id, 'B order has ID');
  assert.strictEqual(oB.restaurantId || oB.restaurant_id, TENANT_B.id, 'B order has restaurant_id=B');
  console.log(`  B order: ${oB.id}`);

  const bKEvt = await waitEvt(lB['KITCHEN'], e =>
    (e.type === 'order_created' || e.type === 'OrderCreated') &&
    (e.payload?.id === oB.id || e.payload?.order_id === oB.id));
  assert(bKEvt, 'B-Kitchen got its own order');
  console.log('  B-Kitchen received B order  PASS');

  await sleep(350);
  assert.strictEqual(lA['KITCHEN'].events.filter(e => e.payload?.id === oB.id || e.payload?.order_id === oB.id).length, 0, 'A-Kitchen got B event!');
  console.log('  A-Kitchen: 0 B spill events  [isolation PASS]');

  const rB = await apiPost('/customer-requests', {
    restaurantId: TENANT_B.id, tableId: TENANT_B.tableId,
    tableNumber: TENANT_B.tableNumber, tableSessionId: sessionBId,
    requestType: 'CALL_WAITER', message: 'Need help',
  });
  assert(rB?.id, 'B request has ID');
  console.log(`  B request: ${rB.id}`);

  const bWEvt = await waitEvt(lB['WAITER'], e =>
    (e.type === 'service_request_created' || e.type === 'customer_request_created' || e.type === 'CustomerRequestCreated') &&
    (e.payload?.id === rB.id || e.payload?.requestId === rB.id));
  assert(bWEvt, 'B-Waiter got its own request');
  console.log('  B-Waiter received B request  PASS');

  await sleep(350);
  assert.strictEqual(lA['WAITER'].events.filter(e => e.payload?.id === rB.id || e.payload?.requestId === rB.id).length, 0, 'A-Waiter got B event!');
  console.log('  A-Waiter: 0 B spill events  [isolation PASS]');

  // ── TEST 7: Universal restaurant_id integrity ──────────────────────────────
  console.log('\n' + '-'.repeat(65));
  console.log('[TEST 7] Universal restaurant_id Integrity');
  const allEvts = [...Object.values(lA).flatMap(l => l.events), ...Object.values(lB).flatMap(l => l.events)];
  const valid = new Set([TENANT_A.id, TENANT_B.id]);
  let fails = 0;
  for (const e of allEvts) {
    const r = restId(e);
    if (!r) { console.warn(`  WARN missing restaurant_id: ${e.type}`); fails++; }
    else if (!valid.has(r)) { console.warn(`  WARN unknown restaurant_id: ${r}`); fails++; }
  }
  assert.strictEqual(fails, 0, `${fails} events with bad/missing restaurant_id`);
  console.log(`  All ${allEvts.length} events have valid restaurant_id  PASS`);

  // Cleanup
  console.log('\n[CLEANUP] Closing WebSocket connections...');
  Object.values(lA).forEach(l => l.ws.close());
  Object.values(lB).forEach(l => l.ws.close());
  await sleep(200);

  console.log('\n' + '='.repeat(65));
  console.log('  PHASE 8 — ALL TESTS PASSED');
  console.log('='.repeat(65));
  console.log('  [1] Customer Order  -> Kitchen         PASS');
  console.log('  [2] Waiter Request  -> Waiter          PASS');
  console.log('  [3] Bar Item Order  -> Bar             PASS');
  console.log('  [4] Inventory Adjust -> Inventory      PASS');
  console.log('  [5] Bill Generation -> Billing         PASS');
  console.log('  [6] Reverse Cross-Tenant Isolation     PASS');
  console.log('  [7] restaurant_id Integrity (all evts) PASS');
  console.log('');
  console.log(`  Tenant A: ${TENANT_A.name} (${TENANT_A.id})`);
  console.log(`    -> A terminals only: PASS | No B bleed: PASS`);
  console.log(`  Tenant B: ${TENANT_B.name} (${TENANT_B.id})`);
  console.log(`    -> B terminals only: PASS | No A bleed: PASS`);
  console.log('='.repeat(65) + '\n');
}

main().catch(err => {
  console.error('\n' + '!'.repeat(65));
  console.error('  PHASE 8 FAILED:', err.message || err);
  console.error('!'.repeat(65) + '\n');
  process.exit(1);
});




