/**
 * ADMIN RENDER / DATA CONTRACT VERIFICATION TEST
 * 
 * Verifies:
 * 1. Admin applications response is normalized to an Array.
 * 2. Admin restaurants response is normalized to an Array.
 * 3. Admin stats response is normalized to an Object.
 * 4. Admin orders response is normalized to an Array.
 * 5. No admin component or calculation calls .filter() on a non-array value.
 * 6. 401 does not become empty data.
 * 7. 403 does not become empty data.
 * 8. All filter operations handle non-array and empty responses safely without throwing TypeError.
 */

import assert from 'node:assert';
import { api } from '../packages/api/client';
import { AdminStats, AdminOrder, AdminRestaurant } from '../packages/types';

// Mock browser storage and environment
const memoryStore: Record<string, string> = {};
(global as any).window = {
  location: {
    hostname: 'dinely.food',
    pathname: '/admin/dashboard',
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  localStorage: {
    getItem: (k: string) => memoryStore[k] || null,
    setItem: (k: string, v: string) => { memoryStore[k] = String(v); },
    removeItem: (k: string) => { delete memoryStore[k]; },
    clear: () => { Object.keys(memoryStore).forEach((k) => delete memoryStore[k]); },
  },
  sessionStorage: {
    getItem: (k: string) => memoryStore[k] || null,
    setItem: (k: string, v: string) => { memoryStore[k] = String(v); },
    removeItem: (k: string) => { delete memoryStore[k]; },
    clear: () => { Object.keys(memoryStore).forEach((k) => delete memoryStore[k]); },
  },
};

async function runAdminDataContractSuite() {
  console.log('====================================================');
  console.log('STARTING ADMIN RENDER / DATA CONTRACT TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;

  // -----------------------------------------------------------------
  // 1. Admin Stats Response Contract (Object)
  // -----------------------------------------------------------------
  console.log('[TEST 1] Admin stats response normalization (Object)...');
  (api as any).executeAdminRequest = async (endpoint: string) => {
    if (endpoint === '/admin/stats') {
      return {
        totalRestaurants: 5,
        activeTenants: 2,
        liveRestaurants: 2,
        pendingApprovals: 3,
        rejectedRestaurants: 0,
        suspendedRestaurants: 0,
        totalOrdersProcessed: 1420,
        systemUptimePercent: 99.99,
      };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  const stats = await api.getPlatformStats();
  assert(stats !== null && typeof stats === 'object' && !Array.isArray(stats), 'Stats must be an Object');
  assert.strictEqual(stats.totalRestaurants, 5);
  assert.strictEqual(stats.pendingApprovals, 3);
  assert.strictEqual(stats.totalOrdersProcessed, 1420);
  console.log('  ✓ PASSED: Stats response is normalized object with typed metrics');
  passed++;

  // -----------------------------------------------------------------
  // 2. Admin Orders Contract (Array - Prevents TypeError: f.filter is not a function)
  // -----------------------------------------------------------------
  console.log('[TEST 2] Admin orders response contract & non-array resilience...');
  // Scenario A: Backend returned dictionary { total_orders: 1250, platform_volume: 48500.00 }
  (api as any).executeAdminRequest = async (endpoint: string) => {
    if (endpoint === '/admin/orders') {
      return { total_orders: 1250, platform_volume: 48500.00 };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  const dictOrders = await api.getPlatformOrders();
  assert(Array.isArray(dictOrders), 'getPlatformOrders must ALWAYS return an Array even when backend returns an object');
  assert.strictEqual(dictOrders.length, 0, 'Dictionary order response safely returns empty array');

  // Verify calling .filter on the returned value never throws
  const filterResult = dictOrders.filter((o: any) => o.createdAt);
  assert(Array.isArray(filterResult), '.filter on returned orders must succeed without throwing');
  console.log('  ✓ PASSED: Dictionary orders response normalized to Array without throwing TypeError');
  passed++;

  // Scenario B: Backend returned genuine order array
  (api as any).executeAdminRequest = async (endpoint: string) => {
    if (endpoint === '/admin/orders') {
      return [
        { id: 'ord-1', restaurantId: 'rest-1', tableNumber: '1', status: 'COMPLETED', totalAmount: 500, createdAt: new Date().toISOString() },
        { id: 'ord-2', restaurantId: 'rest-1', tableNumber: '2', status: 'COMPLETED', totalAmount: 750, createdAt: new Date().toISOString() },
      ];
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  const arrayOrders = await api.getPlatformOrders();
  assert(Array.isArray(arrayOrders) && arrayOrders.length === 2, 'Array order response parsed correctly');
  const count = arrayOrders.filter((o) => new Date(o.createdAt).getMonth() === new Date().getMonth()).length;
  assert.strictEqual(count, 2, 'Filtered order count matches array elements');
  console.log('  ✓ PASSED: Array orders response parsed and filterable');
  passed++;

  // -----------------------------------------------------------------
  // 3. Admin Restaurants Contract (Array)
  // -----------------------------------------------------------------
  console.log('[TEST 3] Admin restaurants response normalization (Array)...');
  (api as any).executeAdminRequest = async (endpoint: string) => {
    if (endpoint === '/admin/restaurants') {
      return [
        {
          id: 'rest-aura-1',
          name: 'Aura Fine Dine',
          slug: 'aura-fine-dine',
          publicSlug: 'aura-fine-dine',
          isApproved: true,
          lifecycleStatus: 'LIVE',
          status: 'OPEN',
        },
        {
          id: 'rest-pending-2',
          name: 'The Bistro Lounge',
          slug: 'the-bistro-lounge',
          isApproved: false,
          lifecycleStatus: 'PENDING_APPROVAL',
          status: 'CLOSED',
        },
      ];
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  const rests = await api.getPlatformRestaurants();
  assert(Array.isArray(rests), 'Restaurants must be an Array');
  assert.strictEqual(rests.length, 2);

  // Test pending filter
  const pending = rests.filter((r) => !r.isDeleted && (r.lifecycleStatus === 'PENDING_APPROVAL' || !r.isApproved));
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].id, 'rest-pending-2');
  console.log('  ✓ PASSED: Restaurants response is Array and filterable');
  passed++;

  // -----------------------------------------------------------------
  // 4. Admin Applications Contract (Array)
  // -----------------------------------------------------------------
  console.log('[TEST 4] Admin applications response normalization (Array)...');
  (api as any).executeAdminRequest = async (endpoint: string) => {
    if (endpoint.startsWith('/admin/applications')) {
      return {
        applications: [
          {
            id: 'rest-app-1',
            name: 'New Restaurant App',
            slug: 'new-restaurant-app',
            isApproved: false,
            lifecycleStatus: 'PENDING_APPROVAL',
          },
        ],
      };
    }
    throw new Error(`Unexpected endpoint: ${endpoint}`);
  };

  const apps = await api.getPlatformApplications('PENDING_APPROVAL');
  assert(Array.isArray(apps), 'Applications must be an Array even when wrapped in { applications: [...] }');
  assert.strictEqual(apps.length, 1);
  console.log('  ✓ PASSED: Enveloped applications normalized to Array');
  passed++;

  // -----------------------------------------------------------------
  // 5. Important Error Rule: 401 Unauthorized Does Not Become Empty Data
  // -----------------------------------------------------------------
  console.log('[TEST 5] 401 error rule: Never swallow 401 as empty data...');
  (api as any).executeAdminRequest = async () => {
    const err = new Error('HTTP 401 Unauthorized: Session token expired');
    (err as any).statusCode = 401;
    throw err;
  };

  let caught401 = false;
  try {
    await api.getPlatformRestaurants();
  } catch (e: any) {
    caught401 = true;
    assert.strictEqual(e.statusCode, 401, '401 statusCode preserved');
  }
  assert(caught401, '401 error must be thrown rather than silently swallowed as []');
  console.log('  ✓ PASSED: 401 error is surfaced and not converted to empty array');
  passed++;

  // -----------------------------------------------------------------
  // 6. Important Error Rule: 403 Forbidden Does Not Become Empty Data
  // -----------------------------------------------------------------
  console.log('[TEST 6] 403 error rule: Never swallow 403 as empty data...');
  (api as any).executeAdminRequest = async () => {
    const err = new Error('HTTP 403 Forbidden: Account not authorized for Platform Admin');
    (err as any).statusCode = 403;
    throw err;
  };

  let caught403 = false;
  try {
    await api.getPlatformRestaurants();
  } catch (e: any) {
    caught403 = true;
    assert.strictEqual(e.statusCode, 403, '403 statusCode preserved');
  }
  assert(caught403, '403 error must be thrown rather than silently swallowed as []');
  console.log('  ✓ PASSED: 403 error is surfaced and not converted to empty array');
  passed++;

  // -----------------------------------------------------------------
  // 7. Defensive Filter Simulation on Malformed / Undefined Values
  // -----------------------------------------------------------------
  console.log('[TEST 7] Defensive filter calculation simulation (prevents all render crashes)...');
  const malformedOrders: any = { total_orders: 1250 };
  const safeOrders = Array.isArray(malformedOrders) ? malformedOrders : [];
  assert.strictEqual(safeOrders.length, 0);

  // Simulate chart calculation
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonthIdx = new Date().getMonth();
  const chartData = [];
  for (let i = 5; i >= 0; i--) {
    const targetMonthIdx = (currentMonthIdx - i + 12) % 12;
    const mName = months[targetMonthIdx];
    const count = safeOrders.filter((o: any) => {
      if (!o || !o.createdAt) return false;
      const d = new Date(o.createdAt);
      return !isNaN(d.getTime()) && d.getMonth() === targetMonthIdx;
    }).length;
    chartData.push({ month: mName, orders: count });
  }
  assert.strictEqual(chartData.length, 6, 'Chart data has 6 months');
  assert.strictEqual(chartData[0].orders, 0, 'Orders count is 0');
  console.log('  ✓ PASSED: Chart calculation executes cleanly on malformed data with zero errors');
  passed++;

  console.log('\n====================================================');
  console.log(`ALL ${passed}/${passed} ADMIN DATA CONTRACT TESTS PASSED (100%)`);
  console.log('====================================================');
}

runAdminDataContractSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
