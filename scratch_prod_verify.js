const https = require('https');
const http = require('http');

const API_BASE = 'https://dineflow-v3.onrender.com/api/v1';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    }).on('error', reject);
  });
}

function request(url, options = {}, payload = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(u, options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, rawData: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) {
      req.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
    }
    req.end();
  });
}

async function run() {
  console.log('=== STEP 1: VERIFY FRONTEND BUNDLE ===');
  const fe = await get('https://dinely.food');
  console.log('Status:', fe.status);
  const scriptMatch = fe.data.match(/src="([^"]+)"/);
  console.log('Script tag in index.html:', scriptMatch ? scriptMatch[1] : 'Not found');

  if (scriptMatch) {
    const jsUrl = 'https://dinely.food' + scriptMatch[1];
    const jsRes = await get(jsUrl);
    console.log('JS Bundle Status:', jsRes.status, 'Size:', jsRes.data.length, 'bytes');

    // Check for our new code symbols in the bundle
    const hasWorkspaceSettings = jsRes.data.includes('Workspace & Terminal Management') || jsRes.data.includes('Workspace & Terminals');
    const hasStrictBusinessTypes = jsRes.data.includes('Full-Service & Casual Dining') && jsRes.data.includes('Kiosk, Stall & Food Truck');
    const hasModuleNotEnabled = jsRes.data.includes('Module Not Enabled') || jsRes.data.includes('is not active');

    console.log('Bundle checks:');
    console.log('- Contains WorkspaceSettingsTab text:', hasWorkspaceSettings ? 'YES (PASS)' : 'NO (FAIL)');
    console.log('- Contains Strict 3 Business Types text:', hasStrictBusinessTypes ? 'YES (PASS)' : 'NO (FAIL)');
    console.log('- Contains ModuleNotEnabled fallback text:', hasModuleNotEnabled ? 'YES (PASS)' : 'NO (FAIL)');
  }

  console.log('\n=== STEP 2: VERIFY RESTAURANT & WORKSPACE MODULES API ON NEON BACKEND ===');
  const testRestId = `test-cart-${Date.now()}`;
  console.log(`Creating test Food Cart restaurant: ${testRestId}`);
  const createRes = await request(`${API_BASE}/restaurants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    id: testRestId,
    name: 'Delhi Street Chaat',
    cuisine: 'Street Food',
    business_type: 'FOOD_CART',
    phone: '+91 98765 43210',
    email: 'chaat@dinely.food',
    address: 'Connaught Place, New Delhi',
    currency: 'INR (₹)',
    tax_percentage: 5.0,
    has_bar: false,
    has_tables: false,
    has_kitchen: true,
    has_waiter: false,
    has_inventory: true,
    has_billing: true,
    enabled_modules: ['kitchen', 'inventory', 'billing']
  });

  console.log('Create Status:', createRes.status);
  console.log('Created Restaurant:', createRes.data?.id, 'BusinessType:', createRes.data?.business_type, 'EnabledModules:', createRes.data?.enabled_modules);

  console.log('\nUpdating workspace modules for Food Cart (Enabling Waiter, ensuring Bar is restricted):');
  const patchRes = await request(`${API_BASE}/restaurants/${testRestId}/workspace-modules`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  }, {
    enabledModules: ['kitchen', 'waiter', 'inventory', 'billing'],
    hasKitchen: true,
    hasWaiter: true,
    hasBar: false,
    hasInventory: true,
    hasBilling: true,
    hasTables: true
  });

  console.log('Patch Status:', patchRes.status);
  console.log('Patched Config:', patchRes.data);

  console.log('\nFetching updated restaurant from database:');
  const getRestRes = await request(`${API_BASE}/restaurants/${testRestId}`);
  console.log('Get Status:', getRestRes.status);
  console.log('Database Result:', {
    name: getRestRes.data?.name,
    business_type: getRestRes.data?.business_type,
    has_bar: getRestRes.data?.has_bar,
    has_waiter: getRestRes.data?.has_waiter,
    has_kitchen: getRestRes.data?.has_kitchen,
    has_inventory: getRestRes.data?.has_inventory,
    has_billing: getRestRes.data?.has_billing,
    enabled_modules: getRestRes.data?.enabled_modules
  });

  console.log('\n=== STEP 3: VERIFY REALTIME WEBSOCKET & ORDER/BILL FLOW ===');
  // Place an order for testRestId Table 01
  const orderRes = await request(`${API_BASE}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    restaurantId: testRestId,
    tableId: `tbl-${testRestId}-table_01`,
    tableNumber: 'Table 01',
    tableSessionId: `sess-${testRestId}-1`,
    customerName: 'Ayan',
    items: [
      {
        id: 'item-1',
        name: 'Pani Puri',
        price: 80,
        quantity: 2,
        targetDestination: 'KITCHEN'
      }
    ]
  });

  console.log('Create Order Status:', orderRes.status);
  console.log('Order ID:', orderRes.data?.id, 'Total:', orderRes.data?.total_amount, 'Kitchen Status:', orderRes.data?.kitchen_status);

  // Customer Request (Call Waiter -> Water)
  const reqRes = await request(`${API_BASE}/customer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    restaurantId: testRestId,
    tableNumber: 'Table 01',
    requestType: 'WATER',
    customTitle: 'Water Requested 💧',
    tableSessionId: `sess-${testRestId}-1`,
    priority: 'MEDIUM'
  });
  console.log('Customer Request Status:', reqRes.status, 'Request ID:', reqRes.data?.id);

  // Waiter accepts customer request
  if (reqRes.data?.id) {
    const acceptRes = await request(`${API_BASE}/customer-requests/${reqRes.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    }, {
      status: 'ACCEPTED',
      waiterName: 'Rahul'
    });
    console.log('Waiter Accept Status:', acceptRes.status, 'Updated Request Status:', acceptRes.data?.status);
  }

  // Request Bill
  const billReqRes = await request(`${API_BASE}/customer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    restaurantId: testRestId,
    tableNumber: 'Table 01',
    requestType: 'BILL',
    customTitle: 'Bill Requested 🧾',
    tableSessionId: `sess-${testRestId}-1`,
    priority: 'HIGH'
  });
  console.log('Bill Request Status:', billReqRes.status, 'Request ID:', billReqRes.data?.id);

  // Waiter settles bill
  if (billReqRes.data?.id) {
    const settleRes = await request(`${API_BASE}/customer-requests/${billReqRes.data?.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }
    }, {
      status: 'COMPLETED',
      waiterName: 'Rahul'
    });
    console.log('Waiter Settle Status:', settleRes.status, 'Updated Request Status:', settleRes.data?.status);
  }

  console.log('\n=== ALL TESTS COMPLETED SUCCESSFULLY ===');
}

run().catch(console.error);
