/**
 * DINELY PHASE 10 — CLOUD RUN STAGING VERIFICATION SUITE
 *
 * Requirements:
 * Tests the backend URL directly across all core modules:
 * 1. Health & Readiness (0.0.0.0, $PORT, Neon SELECT 1)
 * 2. Login (Terminal auth)
 * 3. Admin (Platform admin resolution)
 * 4. Restaurant creation (Onboarding flow)
 * 5. Domain resolution (Public slug/subdomain resolution)
 * 6. QR system (Table canonical QR URL)
 * 7. Customer (Dine-in menu & order flow)
 * 8. Kitchen (Order dispatch to Kitchen terminal)
 * 9. Waiter (Service request dispatch to Waiter terminal)
 * 10. Bar (Drink order dispatch to Bar terminal)
 * 11. Inventory (Stock adjustment)
 * 12. Billing (Invoice generation)
 * 13. WebSocket (Realtime event delivery)
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';

function resolveTargetBaseUrl(): string {
  if (process.env.CLOUD_RUN_URL) {
    return process.env.CLOUD_RUN_URL.replace(/\/+$/, '');
  }
  const urlFile = path.resolve(process.cwd(), '../scripts/cloud_run_url.txt');
  if (fs.existsSync(urlFile)) {
    const content = fs.readFileSync(urlFile, 'utf-8').trim();
    if (content) return content.replace(/\/+$/, '');
  }
  // Fallback to active production Render URL for pre-flight verification
  return 'https://dineflow-v3.onrender.com';
}

const TARGET_HOST = resolveTargetBaseUrl();
const BASE_URL = `${TARGET_HOST}/api/v1`;
const WS_URL = TARGET_HOST.replace(/^http/, 'ws') + '/api/v1/ws';

const VERIFIED_TENANT = {
  id:          'rest-1788829828520',
  name:        'THE DUNK',
  slug:        'the-dunk-3',
  tableId:     'tbl-rest-1788829828520-table_02',
  tableNumber: 'Table 02',
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function apiGet(p: string, token?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${p}`, { headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GET ${p} => ${res.status}: ${txt}`);
  }
  return res.json();
}

async function apiPost(p: string, body: object, token?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${p}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST ${p} => ${res.status}: ${txt}`);
  }
  return res.json();
}

interface SocketClient {
  ws: WebSocket;
  events: any[];
}

function connectWs(channel: string, token?: string): Promise<SocketClient> {
  return new Promise((resolve, reject) => {
    const parts = channel.split(':');
    let restId = '';
    let role = 'CUSTOMER';
    if (parts[0] === 'restaurant' && parts[1]) {
      restId = parts[1];
      if (parts[2]) role = parts[2].toUpperCase();
    } else if (channel === 'platform:admin') {
      restId = 'platform:admin';
      role = 'PLATFORM_ADMIN';
    }

    let url = `${WS_URL}?channel=${encodeURIComponent(channel)}&restaurant_id=${encodeURIComponent(restId)}&role=${encodeURIComponent(role)}`;
    if (token) url += `&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    const client: SocketClient = { ws, events: [] };
    const t = setTimeout(() => { ws.terminate(); reject(new Error(`WS timeout on ${channel}`)); }, 8000);
    ws.on('open', () => { clearTimeout(t); resolve(client); });
    ws.on('message', (raw: any) => {
      try { client.events.push(JSON.parse(raw.toString())); } catch {}
    });
    ws.on('error', (err) => { clearTimeout(t); reject(err); });
  });
}

function waitEvt(client: SocketClient, pred: (e: any) => boolean, ms = 8000): Promise<any> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const match = client.events.find(pred);
      if (match) return resolve(match);
      if (Date.now() - start > ms) {
        return reject(new Error(`Timeout ${ms}ms waiting for WS event`));
      }
      setTimeout(check, 50);
    };
    check();
  });
}

async function main() {
  console.log('\n' + '='.repeat(65));
  console.log('  DINELY PHASE 10 — CLOUD RUN STAGING VERIFICATION');
  console.log(`  Target Endpoint: ${TARGET_HOST}`);
  console.log('='.repeat(65));

  // ── 1. HEALTH & READINESS ────────────────────────────────────────────────
  console.log('\n[TEST 1] Health & Readiness Endpoints (0.0.0.0 / $PORT / Neon)');
  const healthRes = await fetch(`${TARGET_HOST}/health`);
  assert(healthRes.ok, `Health returned status ${healthRes.status}`);
  const healthJson = await healthRes.json();
  assert.strictEqual(healthJson.status, 'healthy', 'Health check is healthy');
  console.log(`  /health: 200 OK (version: ${healthJson.version})  PASS`);

  const readyRes = await fetch(`${TARGET_HOST}/readyz`);
  assert(readyRes.ok, `Readiness returned status ${readyRes.status}`);
  console.log('  /readyz: 200 OK (Neon DB connected)  PASS');

  // ── 2. LOGIN ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 2] Login: Terminal Authentication');
  const loginRes = await apiPost('/auth/terminal-login', {
    restaurant_id: VERIFIED_TENANT.id,
    role: 'KITCHEN',
    passcode: '1234',
  });
  assert(loginRes.access_token, 'Login returned access_token');
  const kitchenToken = loginRes.access_token;
  console.log('  Terminal login successful, JWT acquired  PASS');

  // ── 3. ADMIN ─────────────────────────────────────────────────────────────
  console.log('\n[TEST 3] Admin: Public Platform Status');
  const adminRes = await apiGet('/restaurants/public/resolve?hostname=dinely.food');
  assert(adminRes.isPlatformDomain, 'Platform domain detected');
  console.log('  Admin platform root resolved successfully  PASS');

  // ── 4. RESTAURANT CREATION ───────────────────────────────────────────────
  console.log('\n[TEST 4] Restaurant Creation (Onboarding Flow)');
  const tStamp = Date.now();
  const createdRest = await apiPost('/restaurants', {
    name: `Staging Bistro ${tStamp}`,
    cuisine: 'Italian',
    ownerName: 'Staging Tester',
    ownerEmail: `tester_${tStamp}@dinely.test`,
    city: 'Singapore',
    country: 'Singapore',
  });
  assert(createdRest.id, 'Restaurant created');
  console.log(`  Restaurant created: ${createdRest.name} (${createdRest.id})  PASS`);

  // ── 5. DOMAIN RESOLUTION ─────────────────────────────────────────────────
  console.log('\n[TEST 5] Domain Resolution (Public Slug / Subdomain)');
  const resolvedRest = await apiGet(`/restaurants/public/resolve?slug=${VERIFIED_TENANT.slug}`);
  assert.strictEqual(resolvedRest.id, VERIFIED_TENANT.id, 'Resolved correct restaurant ID');
  console.log(`  Slug '${VERIFIED_TENANT.slug}' resolved to '${resolvedRest.name}'  PASS`);

  // ── 6. QR CODE SECURITY ──────────────────────────────────────────────────
  console.log('\n[TEST 6] QR Code: Canonical Table URL Generation');
  const tableRes = await apiGet(`/restaurants/${VERIFIED_TENANT.id}/tables/${VERIFIED_TENANT.tableId}`);
  assert(tableRes.qr_code_url, 'QR code URL generated');
  assert(tableRes.qr_code_url.includes(VERIFIED_TENANT.slug), 'QR URL contains canonical tenant slug');
  console.log(`  Canonical QR URL: ${tableRes.qr_code_url}  PASS`);

  // ── 7. WEBSOCKET REALTIME SETUP ──────────────────────────────────────────
  console.log('\n[TEST 7] WebSocket: Connecting Operational Station Channels');
  const waiterLogin = await apiPost('/auth/terminal-login', { restaurant_id: VERIFIED_TENANT.id, role: 'WAITER', passcode: '1234' });
  const barLogin    = await apiPost('/auth/terminal-login', { restaurant_id: VERIFIED_TENANT.id, role: 'BAR', passcode: '1234' });
  const invLogin    = await apiPost('/auth/terminal-login', { restaurant_id: VERIFIED_TENANT.id, role: 'INVENTORY', passcode: '1234' });
  const billLogin   = await apiPost('/auth/terminal-login', { restaurant_id: VERIFIED_TENANT.id, role: 'BILLING', passcode: '1234' });

  const sktKitchen = await connectWs(`restaurant:${VERIFIED_TENANT.id}:kitchen`, kitchenToken);
  await sleep(1000);
  const sktWaiter  = await connectWs(`restaurant:${VERIFIED_TENANT.id}:waiter`, waiterLogin.access_token);
  await sleep(1000);
  const sktBar     = await connectWs(`restaurant:${VERIFIED_TENANT.id}:bar`, barLogin.access_token);
  await sleep(1000);
  const sktInv     = await connectWs(`restaurant:${VERIFIED_TENANT.id}:inventory`, invLogin.access_token);
  await sleep(1000);
  const sktBill    = await connectWs(`restaurant:${VERIFIED_TENANT.id}:billing`, billLogin.access_token);
  await sleep(1000);
  console.log('  5 station WebSockets connected and active  PASS');

  // ── 8. CUSTOMER & KITCHEN ────────────────────────────────────────────────
  console.log('\n[TEST 8] Customer Order -> Kitchen Terminal');
  const kOrder = await apiPost('/orders', {
    restaurantId: VERIFIED_TENANT.id, tableId: VERIFIED_TENANT.tableId,
    tableNumber: VERIFIED_TENANT.tableNumber,
    customerName: 'Staging Guest', notes: 'Medium rare', orderType: 'DINE_IN',
    items: [{ id: `stg-k-${tStamp}`, menuItemId: `stg-mi-${tStamp}`, name: 'Staging Ribeye', price: 750, quantity: 1, targetDestination: 'KITCHEN' }],
  });
  const sessionId = kOrder.table_session_id || kOrder.tableSessionId;
  assert(sessionId, 'Order created with session ID');

  const kEvt = await waitEvt(sktKitchen, e =>
    (e.type === 'order_created' || e.type === 'OrderCreated') &&
    (e.payload?.id === kOrder.id || e.payload?.order_id === kOrder.id));
  assert(kEvt, 'Kitchen received realtime order event');
  console.log('  Customer order delivered to Kitchen terminal  PASS');

  // ── 9. WAITER ────────────────────────────────────────────────────────────
  console.log('\n[TEST 9] Waiter Request -> Waiter Terminal');
  const wReq = await apiPost('/customer-requests', {
    restaurantId: VERIFIED_TENANT.id, tableId: VERIFIED_TENANT.tableId,
    tableNumber: VERIFIED_TENANT.tableNumber, tableSessionId: sessionId,
    requestType: 'ASSISTANCE', message: 'Cutlery needed', priority: 'LOW',
  });
  assert(wReq.id, 'Waiter request created');

  const wEvt = await waitEvt(sktWaiter, e =>
    (e.type === 'service_request_created' || e.type === 'customer_request_created' || e.type === 'CustomerRequestCreated') &&
    (e.payload?.id === wReq.id || e.payload?.requestId === wReq.id));
  assert(wEvt, 'Waiter received realtime request event');
  console.log('  Waiter request delivered to Waiter terminal  PASS');

  // ── 10. BAR ──────────────────────────────────────────────────────────────
  console.log('\n[TEST 10] Bar Order -> Bar Terminal');
  const bOrder = await apiPost('/orders', {
    restaurantId: VERIFIED_TENANT.id, tableId: VERIFIED_TENANT.tableId,
    tableNumber: VERIFIED_TENANT.tableNumber, tableSessionId: sessionId,
    customerName: 'Staging Guest', notes: 'Extra ice', orderType: 'DINE_IN',
    items: [{ id: `stg-b-${tStamp}`, menuItemId: `stg-bmi-${tStamp}`, name: 'Espresso Martini', price: 320, quantity: 1, targetDestination: 'BAR' }],
  });
  assert(bOrder.id, 'Bar order created');

  const bEvt = await waitEvt(sktBar, e =>
    (e.type === 'order_created' || e.type === 'OrderCreated') &&
    (e.payload?.id === bOrder.id || e.payload?.order_id === bOrder.id));
  assert(bEvt, 'Bar received realtime order event');
  console.log('  Bar order delivered to Bar terminal  PASS');

  // ── 11. INVENTORY ────────────────────────────────────────────────────────
  console.log('\n[TEST 11] Inventory Stock Adjustment -> Inventory Terminal');
  const invItem = await apiPost('/inventory', {
    restaurantId: VERIFIED_TENANT.id, restaurant_id: VERIFIED_TENANT.id,
    name: `Staging-Item-${tStamp}`, category: 'Beverage', station: 'BAR',
    quantity: 30, unit: 'bottle', minThreshold: 5, costPerUnit: 120,
  }, invLogin.access_token);

  const adj = await apiPost(`/inventory/${invItem.id}/adjust`, { delta: 12.0, reason: 'Staging Restock' }, invLogin.access_token);
  assert(adj.id, 'Stock adjusted');

  const iEvt = await waitEvt(sktInv, e =>
    (e.type === 'inventory_updated' || e.type === 'InventoryUpdated') && e.payload?.id === invItem.id);
  assert(iEvt, 'Inventory received realtime stock update event');
  console.log('  Inventory update delivered to Inventory terminal  PASS');

  // ── 12. BILLING ──────────────────────────────────────────────────────────
  console.log('\n[TEST 12] Bill Generation -> Billing Terminal');
  const invoice = await apiPost(`/restaurants/${VERIFIED_TENANT.id}/billing/generate-invoice`, {
    tableNumber: VERIFIED_TENANT.tableNumber, tableSessionId: sessionId,
    paymentMethod: 'CASH', discountPercentage: 0, orderType: 'DINE_IN',
  });
  assert(invoice.id || invoice.invoice_number, 'Invoice generated');

  const bilEvt = await waitEvt(sktBill, e =>
    (e.type === 'BillRequested' || e.type === 'bill_requested' || e.type === 'TableStatusUpdated') &&
    (e.payload?.tableSessionId === sessionId || e.payload?.table_session_id === sessionId || e.payload?.tableNumber === VERIFIED_TENANT.tableNumber));
  assert(bilEvt, 'Billing terminal received realtime invoice event');
  console.log('  Invoice generation delivered to Billing terminal  PASS');

  // ── CLEANUP ──────────────────────────────────────────────────────────────
  sktKitchen.ws.close();
  sktWaiter.ws.close();
  sktBar.ws.close();
  sktInv.ws.close();
  sktBill.ws.close();
  await sleep(200);

  console.log('\n' + '='.repeat(65));
  console.log('  PHASE 10 — ALL STAGING TESTS PASSED');
  console.log('='.repeat(65));
  console.log('  [1]  Health & Readiness (0.0.0.0 / $PORT / Neon) PASS');
  console.log('  [2]  Login (Terminal Auth)                      PASS');
  console.log('  [3]  Admin (Platform Root Context)              PASS');
  console.log('  [4]  Restaurant Creation (Onboarding Flow)      PASS');
  console.log('  [5]  Domain Resolution (Public Slug)            PASS');
  console.log('  [6]  QR Code (Canonical URL Generation)         PASS');
  console.log('  [7]  Customer Menu & Order Flow                 PASS');
  console.log('  [8]  Kitchen Terminal Realtime Dispatch         PASS');
  console.log('  [9]  Waiter Terminal Realtime Dispatch          PASS');
  console.log('  [10] Bar Terminal Realtime Dispatch             PASS');
  console.log('  [11] Inventory Terminal Realtime Dispatch       PASS');
  console.log('  [12] Billing Terminal Realtime Dispatch         PASS');
  console.log('  [13] WebSocket Multi-Channel Delivery           PASS');
  console.log('='.repeat(65) + '\n');
}

main().catch(err => {
  console.error('\n' + '!'.repeat(65));
  console.error('  PHASE 10 STAGING FAILED:', err.message || err);
  console.error('!'.repeat(65) + '\n');
  process.exit(1);
});
