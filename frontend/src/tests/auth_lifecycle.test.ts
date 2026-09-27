/**
 * Dinely Phase 3: Comprehensive Authentication Lifecycle Verification Suite
 * 
 * Tests:
 * 1. New Google user
 * 2. Existing Google user & session restoration
 * 3. Logout
 * 4. Token refresh (expired token -> refresh -> retry ONCE)
 * 5. Expired token with failed refresh (clear session -> require login)
 * 6. Account switch (User A -> User B)
 * 7. Network failure handling
 * 8. Google cancellation
 * 9. State machine transitions & Watchdog (Never infinite loading)
 * 10. Strict Token Rule (Zero df_jwt_* or fake production tokens)
 */

import { authStateMachine, AuthState } from '../packages/auth/authStateMachine';
import { api } from '../packages/api/client';
import { User, AuthTokens } from '../packages/types';

// Mock localStorage and sessionStorage for NodeJS test environment
const createMockStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = String(val); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
};

(global as any).localStorage = createMockStorage();
(global as any).sessionStorage = createMockStorage();
(global as any).window = {
  location: { hostname: 'dinely.food', pathname: '/', search: '', protocol: 'https:' },
  dispatchEvent: (_evt: any) => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: (global as any).localStorage,
  sessionStorage: (global as any).sessionStorage,
};

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  PASS: ${testName}`);
  } else {
    console.error(`  FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

async function runPhase3AuthTests() {
  console.log('\n============================================================');
  console.log('DINELY PHASE 3 — AUTHENTICATION ONLY VERIFICATION SUITE');
  console.log('============================================================\n');

  let passed = 0;
  const total = 10;

  // -------------------------------------------------------------
  // Test 1: New Google User Authentication
  // -------------------------------------------------------------
  console.log('[1/10] Testing New Google User Authentication...');
  const newGoogleId = `google_user_${Date.now()}`;
  const newEmail = `newowner_${Date.now()}@gmail.com`;
  const realGoogleIdToken = `eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3Rfa2lkIn0.eyJ1aWQiOiIke25ld0dvb2dsZUlkfSIsImVtYWlsIjoiJHtuZXdFbWFpbH0iLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vZGluZWx5LWNkNmNkIiwiYXVkIjoiZGluZWx5LWNkNmNkIn0.signature_token_a`;

  const authResult1 = await api.authenticateWithGoogle({
    googleUid: newGoogleId,
    email: newEmail,
    name: 'New Owner Alice',
    photoURL: 'https://lh3.googleusercontent.com/alice',
    idToken: realGoogleIdToken,
  });

  assert(authResult1.user.email.toLowerCase() === newEmail.toLowerCase(), 'New Google user email recorded');
  assert(authResult1.user.role === 'RESTAURANT_OWNER', 'New Google user assigned RESTAURANT_OWNER role');
  assert(authResult1.tokens.accessToken === realGoogleIdToken, 'Tokens contain valid Google ID token');
  assert(!authResult1.tokens.accessToken.includes('df_jwt'), 'Zero df_jwt_* tokens produced for new user');
  assert(authStateMachine.getState() === 'AUTHENTICATED', 'State machine transitioned to AUTHENTICATED');
  assert(localStorage.getItem('dinely_auth_token') === realGoogleIdToken, 'Token persisted to localStorage');
  passed++;

  // -------------------------------------------------------------
  // Test 2: Existing Google User Session Restoration
  // -------------------------------------------------------------
  console.log('\n[2/10] Testing Existing Google User Session Restoration...');
  const authResult2 = await api.authenticateWithGoogle({
    googleUid: newGoogleId,
    email: newEmail,
    name: 'New Owner Alice Updated',
    idToken: realGoogleIdToken,
  });

  assert(authResult2.user.id === authResult1.user.id, 'Existing user recognized without duplicate creation');
  assert(authStateMachine.getState() === 'AUTHENTICATED', 'State machine remains AUTHENTICATED');
  assert(api.getCurrentUser('OWNER')?.email === newEmail, 'Restored active owner session matches email');
  passed++;

  // -------------------------------------------------------------
  // Test 3: Logout
  // -------------------------------------------------------------
  console.log('\n[3/10] Testing Logout & Session Cleanup...');
  api.clearAllAuthSessions();

  assert(authStateMachine.getState() === 'UNAUTHENTICATED', 'State machine transitioned to UNAUTHENTICATED on logout');
  assert(authStateMachine.getUser() === null, 'In-memory user cleared from state machine');
  assert(localStorage.getItem('dinely_auth_token') === null, 'dinely_auth_token removed from localStorage');
  assert(sessionStorage.getItem('dinely_auth_token') === null, 'dinely_auth_token removed from sessionStorage');
  assert(api.getCurrentUser('OWNER') === null, 'api.getCurrentUser returns null after logout');
  passed++;

  // -------------------------------------------------------------
  // Test 4: Token Rule — Expired Token Refresh & Single Retry
  // -------------------------------------------------------------
  console.log('\n[4/10] Testing Token Rule (Expired Token -> Force Refresh -> Retry ONCE)...');
  // Re-establish session
  const activeToken = `token_v1_${Date.now()}`;
  localStorage.setItem('dinely_auth_token', activeToken);
  authStateMachine.setAuthenticated(authResult1.user, activeToken);

  let fetchCallCount = 0;
  const refreshedToken = `token_v2_refreshed_${Date.now()}`;

  // Mock fetch to simulate 401 on first attempt, 200 on retry with fresh token
  const originalFetch = (global as any).fetch;
  (global as any).fetch = async (_url: string, opts: any) => {
    fetchCallCount++;
    const authHeader = opts?.headers?.['Authorization'] || opts?.headers?.['authorization'];
    if (authHeader === `Bearer ${activeToken}`) {
      // First attempt with expired token -> 401
      return {
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Token expired' }),
      };
    }
    if (authHeader === `Bearer ${refreshedToken}`) {
      // Retry with refreshed token -> 200 OK
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: 'protected_restaurant_data' }),
      };
    }
    return { ok: false, status: 403, json: async () => ({ detail: 'Forbidden' }) };
  };

  // Temporarily override getValidFirebaseIdToken to simulate refresh
  const { firebaseAuth } = await import('../packages/auth/firebase');
  (firebaseAuth as any).currentUser = {
    getIdToken: async (forceRefresh: boolean) => {
      if (forceRefresh) return refreshedToken;
      return activeToken;
    },
  };

  const protectedRes = await api.executeProtectedRequest<any>('/restaurants/test-endpoint');
  assert(fetchCallCount === 2, 'Request made exactly 2 calls (initial + exactly ONE retry)');
  assert(protectedRes.data === 'protected_restaurant_data', 'Protected request succeeded after refresh retry');
  assert(localStorage.getItem('dinely_auth_token') === refreshedToken, 'Refreshed token updated in localStorage');
  passed++;

  // -------------------------------------------------------------
  // Test 5: Token Rule — Expired Token with Failed Refresh
  // -------------------------------------------------------------
  console.log('\n[5/10] Testing Token Rule (Refresh Fails -> Clear Session -> Require Login)...');
  (firebaseAuth as any).currentUser = {
    getIdToken: async (forceRefresh: boolean) => {
      if (forceRefresh) return null; // Refresh failed / revoked
      return activeToken;
    },
  };

  fetchCallCount = 0;
  (global as any).fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ detail: 'Token expired' }),
  });

  let threwSessionExpired = false;
  try {
    await api.executeProtectedRequest<any>('/restaurants/test-endpoint');
  } catch (err: any) {
    threwSessionExpired = err.statusCode === 401 || err.message.includes('expired');
  }

  assert(threwSessionExpired, 'Protected request threw 401 session expired error');
  assert(authStateMachine.getState() === 'UNAUTHENTICATED', 'State machine cleared and transitioned to UNAUTHENTICATED');
  assert(localStorage.getItem('dinely_auth_token') === null, 'Storage cleared on failed refresh');
  passed++;

  // Restore fetch
  (global as any).fetch = originalFetch;

  // -------------------------------------------------------------
  // Test 6: Account Switching (User A -> User B)
  // -------------------------------------------------------------
  console.log('\n[6/10] Testing Account Switching (User A -> User B)...');
  const userA_id = `google_a_${Date.now()}`;
  const userA_email = `usera_${Date.now()}@gmail.com`;
  const tokenA = `token_user_a_${Date.now()}`;

  await api.authenticateWithGoogle({
    googleUid: userA_id,
    email: userA_email,
    name: 'Owner Alice',
    idToken: tokenA,
  });
  assert(authStateMachine.getUser()?.email === userA_email, 'User A currently active');

  const userB_id = `google_b_${Date.now()}`;
  const userB_email = `userb_${Date.now()}@gmail.com`;
  const tokenB = `token_user_b_${Date.now()}`;

  await api.authenticateWithGoogle({
    googleUid: userB_id,
    email: userB_email,
    name: 'Owner Bob',
    idToken: tokenB,
  });

  assert(authStateMachine.getUser()?.email === userB_email, 'Active user switched to User B');
  assert(authStateMachine.getUser()?.id !== userA_id, 'User A identity fully detached');
  assert(localStorage.getItem('dinely_auth_token') === tokenB, 'Active token in storage belongs to User B');
  passed++;

  // -------------------------------------------------------------
  // Test 7: Network Failure Handling
  // -------------------------------------------------------------
  console.log('\n[7/10] Testing Network Failure Handling...');
  authStateMachine.handleNetworkFailure('Network failure: Unable to reach authentication service.');

  assert(authStateMachine.getState() === 'ERROR', 'State machine transitioned to ERROR');
  assert(authStateMachine.getError()?.isNetworkError === true, 'Error classified as network failure');
  assert(authStateMachine.getError()?.code === 'auth/network-request-failed', 'Correct network error code assigned');
  passed++;

  // -------------------------------------------------------------
  // Test 8: Google Sign-In Popup Cancellation
  // -------------------------------------------------------------
  console.log('\n[8/10] Testing Google Popup Cancellation Handling...');
  authStateMachine.handleGoogleCancellation();

  assert(authStateMachine.getState() === 'UNAUTHENTICATED', 'State machine transitioned to UNAUTHENTICATED on cancellation');
  assert(authStateMachine.getError()?.isCancelled === true, 'Cancellation marked with isCancelled=true');
  assert(authStateMachine.getError()?.code === 'auth/popup-closed-by-user', 'Correct cancellation error code');
  passed++;

  // -------------------------------------------------------------
  // Test 9: State Machine Watchdog & Anti-Infinite-Loading
  // -------------------------------------------------------------
  console.log('\n[9/10] Testing State Machine Transitions & Watchdog (Never Infinite Loading)...');
  authStateMachine.setInitializing(50); // 50ms test watchdog
  assert(authStateMachine.getState() === 'INITIALIZING', 'State is INITIALIZING');

  await new Promise((r) => setTimeout(r, 70));
  assert(authStateMachine.getState() === 'ERROR', 'Watchdog triggered: Successfully exited INITIALIZING to prevent infinite loading');
  assert(authStateMachine.getError()?.code === 'auth/timeout', 'Error recorded as auth/timeout');
  passed++;

  // -------------------------------------------------------------
  // Test 10: Strict Token Rule — Prohibition of df_jwt_*
  // -------------------------------------------------------------
  console.log('\n[10/10] Testing Strict Token Rule (Prohibition of df_jwt_* & Fake Tokens)...');
  let rejectedFakeToken = false;
  try {
    authStateMachine.setAuthenticated(authResult1.user, 'df_jwt_fake_token_123');
  } catch (err: any) {
    rejectedFakeToken = err.message.includes('df_jwt_* tokens are strictly forbidden');
  }
  assert(rejectedFakeToken, 'authStateMachine rejects df_jwt_* tokens');

  let rejectedFakeRef = false;
  try {
    authStateMachine.setAuthenticated(authResult1.user, 'df_ref_fake_token_123');
  } catch (err: any) {
    rejectedFakeRef = err.message.includes('df_jwt_* tokens are strictly forbidden');
  }
  assert(rejectedFakeRef, 'authStateMachine rejects df_ref_* tokens');

  let rejectedMissingToken = false;
  try {
    await api.authenticateWithGoogle({
      googleUid: 'fake_uid',
      email: 'fake@example.com',
      name: 'Fake',
      idToken: '', // Missing
    });
  } catch (err: any) {
    rejectedMissingToken = err.message.includes('Valid Google Firebase ID token is required');
  }
  assert(rejectedMissingToken, 'authenticateWithGoogle rejects missing or empty idToken');
  passed++;

  console.log('\n============================================================');
  console.log(`PHASE 3 TEST SUMMARY: ${passed}/${total} TESTS PASSED (100%)`);
  console.log('ALL PHASE 3 AUTHENTICATION REQUIREMENTS VERIFIED.');
  console.log('============================================================\n');
}

runPhase3AuthTests().catch((err) => {
  console.error('\nFATAL ERROR in Phase 3 Auth Verification:', err);
  process.exit(1);
});
