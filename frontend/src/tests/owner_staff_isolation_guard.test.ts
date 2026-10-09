import assert from 'node:assert';

console.log('====================================================');
console.log('STARTING OWNER VS STAFF ISOLATION GUARD TEST SUITE');
console.log('====================================================');

// Mock resolved tenant: THE START
const theStartTenant = {
  id: 'rest-1790594544526-396022',
  name: 'THE START',
  slug: 'the-start',
  ownerUid: 'W45wtagVNccn438qLzKFpr047t63',
  ownerEmail: 'ayanamity77@gmail.com',
  email: 'thestart@dinely.food',
};

// Simulation helper of App.tsx SETTINGS guard logic
function evaluateOwnerOsAccess(currentUser: any, storage: Record<string, string>) {
  // 1. Owner authenticated check
  const isOwnerAuthenticated = Boolean(
    currentUser &&
    currentUser.scope !== 'STAFF' &&
    ['OWNER', 'RESTAURANT_OWNER', 'SUPER_ADMIN', 'PLATFORM_ADMIN'].includes((currentUser.role || '').toUpperCase())
  );

  // If owner is authenticated, purge stale staff storage
  if (isOwnerAuthenticated) {
    if (storage['dinely_active_scope'] === 'STAFF') {
      storage['dinely_active_scope'] = 'OWNER';
    }
    delete storage['dinely_staff_token'];
    delete storage['dinely_user_staff'];
  }

  const activeScope = storage['dinely_active_scope'] || null;
  const staffToken = storage['dinely_staff_token'] || null;
  const staffUser = storage['dinely_user_staff'] ? JSON.parse(storage['dinely_user_staff']) : null;

  const isStaffUser = !isOwnerAuthenticated && (
    currentUser?.scope === 'STAFF' ||
    ['WAITER', 'KITCHEN', 'CHEF', 'COOK', 'BAR', 'BARTENDER', 'INVENTORY', 'CASHIER'].includes(
      (currentUser?.role || '').toUpperCase()
    ) ||
    (
      activeScope === 'STAFF' &&
      Boolean(staffToken) &&
      Boolean(
        staffUser?.scope === 'STAFF' ||
        ['WAITER', 'KITCHEN', 'CHEF', 'COOK', 'BAR', 'BARTENDER', 'INVENTORY', 'CASHIER'].includes((staffUser?.role || '').toUpperCase())
      )
    )
  );

  if (isStaffUser) {
    return { status: 'DENIED_STAFF_PROHIBITED', code: 403, requiredRole: 'RESTAURANT OWNER (STAFF ACCESS PROHIBITED)' };
  }

  if (!currentUser) {
    return { status: 'REQUIRE_LOGIN', code: 401 };
  }

  const isAuthorizedOwner =
    currentUser.role === 'SUPER_ADMIN' ||
    currentUser.role === 'PLATFORM_ADMIN' ||
    (currentUser.scope !== 'STAFF' &&
      ['OWNER', 'RESTAURANT_OWNER'].includes(currentUser.role) &&
      (currentUser.restaurantId === theStartTenant.id || currentUser.restaurantId === theStartTenant.slug)) ||
    (currentUser.scope !== 'STAFF' &&
      (
        (theStartTenant.ownerUid && (currentUser.id === theStartTenant.ownerUid || currentUser.googleUid === theStartTenant.ownerUid)) ||
        (currentUser.email && (
          theStartTenant.ownerEmail?.toLowerCase().trim() === currentUser.email.toLowerCase().trim()
        ))
      ));

  if (!isAuthorizedOwner) {
    return { status: 'DENIED_CROSS_TENANT', code: 403, requiredRole: 'RESTAURANT OWNER' };
  }

  return { status: 'GRANTED', code: 200 };
}

// -----------------------------------------------------------------------------
// TEST 1: Legitimate Owner with UID match
// -----------------------------------------------------------------------------
console.log('\n[TEST 1] Legitimate Owner with UID match');
const ownerUser = {
  id: 'W45wtagVNccn438qLzKFpr047t63',
  email: 'ayanamity77@gmail.com',
  role: 'RESTAURANT_OWNER',
  name: 'Ayan',
};
const res1 = evaluateOwnerOsAccess(ownerUser, {});
assert.strictEqual(res1.status, 'GRANTED');
console.log('  ✓ PASSED: Legitimate owner granted access to Owner OS');

// -----------------------------------------------------------------------------
// TEST 2: Legitimate Owner with stale staff token in localStorage
// -----------------------------------------------------------------------------
console.log('\n[TEST 2] Legitimate Owner with stale staff token in storage');
const staleStorage = {
  dinely_active_scope: 'STAFF',
  dinely_staff_token: 'df_waiter_jwt_test',
  dinely_user_staff: JSON.stringify({ role: 'WAITER', scope: 'STAFF' }),
};
const res2 = evaluateOwnerOsAccess(ownerUser, staleStorage);
assert.strictEqual(res2.status, 'GRANTED', 'Owner must NOT be blocked by stale staff storage');
assert.strictEqual(staleStorage['dinely_active_scope'], 'OWNER', 'Active scope must be reset to OWNER');
assert.strictEqual(staleStorage['dinely_staff_token'], undefined, 'Staff token must be purged');
console.log('  ✓ PASSED: Stale staff token purged and legitimate owner granted access');

// -----------------------------------------------------------------------------
// TEST 3: Staff Account (Waiter) attempting to access Owner OS
// -----------------------------------------------------------------------------
console.log('\n[TEST 3] Staff Account (Waiter) accessing Owner OS');
const waiterUser = {
  id: 'usr-waiter-01',
  name: 'Rahul',
  email: 'rahul@staff.dinely.internal',
  role: 'WAITER',
  scope: 'STAFF',
  restaurantId: theStartTenant.id,
};
const res3 = evaluateOwnerOsAccess(waiterUser, { dinely_active_scope: 'STAFF' });
assert.strictEqual(res3.status, 'DENIED_STAFF_PROHIBITED');
assert.strictEqual(res3.requiredRole, 'RESTAURANT OWNER (STAFF ACCESS PROHIBITED)');
console.log('  ✓ PASSED: Staff account strictly denied with STAFF ACCESS PROHIBITED');

// -----------------------------------------------------------------------------
// TEST 4: Cross-Tenant Owner (Owner of Restaurant B attempting Restaurant A)
// -----------------------------------------------------------------------------
console.log('\n[TEST 4] Cross-Tenant Owner attempting to access another restaurant');
const otherOwner = {
  id: 'other-owner-uid',
  email: 'other_owner@example.com',
  role: 'RESTAURANT_OWNER',
  restaurantId: 'rest-other-999',
};
const res4 = evaluateOwnerOsAccess(otherOwner, {});
assert.strictEqual(res4.status, 'DENIED_CROSS_TENANT');
assert.strictEqual(res4.requiredRole, 'RESTAURANT OWNER');
console.log('  ✓ PASSED: Cross-tenant owner denied access to unowned restaurant');

// -----------------------------------------------------------------------------
// TEST 5: Platform Admin accessing Owner OS
// -----------------------------------------------------------------------------
console.log('\n[TEST 5] Platform Admin accessing Owner OS');
const adminUser = {
  id: 'admin-uid',
  email: 'admin@dinely.food',
  role: 'PLATFORM_ADMIN',
};
const res5 = evaluateOwnerOsAccess(adminUser, {});
assert.strictEqual(res5.status, 'GRANTED');
console.log('  ✓ PASSED: Platform Admin granted access across all restaurants');

// -----------------------------------------------------------------------------
// TEST 6: Unauthenticated visitor accessing Owner OS
// -----------------------------------------------------------------------------
console.log('\n[TEST 6] Unauthenticated visitor accessing Owner OS');
const res6 = evaluateOwnerOsAccess(null, {});
assert.strictEqual(res6.status, 'REQUIRE_LOGIN');
console.log('  ✓ PASSED: Unauthenticated visitor directed to login');

// -----------------------------------------------------------------------------
// TEST 7: General restaurant contact email MUST NOT grant ownership
// -----------------------------------------------------------------------------
console.log('\n[TEST 7] General restaurant contact email attempt');
const contactUser = {
  id: 'stranger-uid',
  email: 'thestart@dinely.food', // matches generic restaurant.email, NOT ownerEmail
  role: 'RESTAURANT_OWNER',
};
const res7 = evaluateOwnerOsAccess(contactUser, {});
assert.strictEqual(res7.status, 'DENIED_CROSS_TENANT', 'General contact email must NOT grant ownership!');
console.log('  ✓ PASSED: General restaurant contact email strictly rejected as owner identity');

console.log('\n====================================================');
console.log('ALL 7 OWNER VS STAFF ISOLATION TESTS PASSED (7/7)!');
console.log('====================================================\n');
