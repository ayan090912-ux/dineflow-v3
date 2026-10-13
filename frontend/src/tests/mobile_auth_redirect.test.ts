import assert from 'node:assert';
import {
  resolveAuthDomain,
  isMobileOrTabletBrowser,
  handleGoogleRedirectResult,
  signInWithGoogle,
} from '../packages/auth/firebase';

console.log('============================================================');
console.log('DINELY — MOBILE GOOGLE AUTH & REDIRECT FLOW VERIFICATION');
console.log('============================================================\n');

async function runMobileAuthTests() {
  // Test 1: resolveAuthDomain on custom domain vs localhost
  console.log('[TEST 1] Verifying resolveAuthDomain resolution...');
  
  // Backup window
  const originalLocation = global.window?.location;

  try {
    // 1a: Custom domain dinely.food
    (global as any).window = {
      location: { hostname: 'dinely.food' },
      sessionStorage: {},
    };
    assert.strictEqual(
      resolveAuthDomain(),
      'dinely.food',
      'Should resolve to dinely.food on primary domain'
    );
    console.log('  ✓ PASSED: dinely.food resolves to same-domain helper dinely.food');

    // 1b: Tenant subdomain the-start.dinely.food
    (global as any).window.location.hostname = 'the-start.dinely.food';
    assert.strictEqual(
      resolveAuthDomain(),
      'dinely.food',
      'Should resolve to dinely.food on tenant subdomain'
    );
    console.log('  ✓ PASSED: the-start.dinely.food resolves to same-domain helper dinely.food');

    // 1c: Localhost development
    (global as any).window.location.hostname = 'localhost';
    assert.strictEqual(
      resolveAuthDomain(),
      'dinely-cd6cd.firebaseapp.com',
      'Should resolve to firebaseapp.com on localhost'
    );
    console.log('  ✓ PASSED: localhost resolves to dinely-cd6cd.firebaseapp.com');

    // 1d: Local IP 127.0.0.1
    (global as any).window.location.hostname = '127.0.0.1';
    assert.strictEqual(
      resolveAuthDomain(),
      'dinely-cd6cd.firebaseapp.com',
      'Should resolve to firebaseapp.com on local IP'
    );
    console.log('  ✓ PASSED: 127.0.0.1 resolves to dinely-cd6cd.firebaseapp.com');

  } finally {
    if (originalLocation) {
      (global as any).window.location = originalLocation;
    }
  }

  // Test 2: Mobile device detection (iOS Safari, Android, iPad, Desktop)
  console.log('\n[TEST 2] Verifying mobile browser detection (ITP & storage-partitioned environments)...');
  const originalNavDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  try {
    // 2a: iPhone Safari User Agent
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        maxTouchPoints: 5,
        platform: 'iPhone',
      },
      configurable: true,
      writable: true,
    });
    (global as any).window.innerWidth = 390;
    assert.strictEqual(isMobileOrTabletBrowser(), true, 'iPhone Safari should be detected as mobile');
    console.log('  ✓ PASSED: iPhone Safari correctly identified as mobile/storage-partitioned');

    // 2b: iPad Safari User Agent (desktop-class Safari on iPadOS)
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5,
      },
      configurable: true,
      writable: true,
    });
    (global as any).window.innerWidth = 820;
    assert.strictEqual(isMobileOrTabletBrowser(), true, 'iPad Safari should be detected as mobile');
    console.log('  ✓ PASSED: iPad Safari (iPadOS touch) correctly identified as mobile/tablet');

    // 2c: Android Chrome
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
        maxTouchPoints: 5,
        platform: 'Linux armv8l',
      },
      configurable: true,
      writable: true,
    });
    (global as any).window.innerWidth = 412;
    assert.strictEqual(isMobileOrTabletBrowser(), true, 'Android Chrome should be detected as mobile');
    console.log('  ✓ PASSED: Android Chrome correctly identified as mobile');

    // 2d: Desktop Mac Safari / Chrome
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        platform: 'MacIntel',
        maxTouchPoints: 0,
      },
      configurable: true,
      writable: true,
    });
    (global as any).window.innerWidth = 1440;
    assert.strictEqual(isMobileOrTabletBrowser(), false, 'Desktop Mac Chrome should NOT be detected as mobile');
    console.log('  ✓ PASSED: Desktop browser correctly identified as non-mobile');

  } finally {
    if (originalNavDesc) {
      Object.defineProperty(globalThis, 'navigator', originalNavDesc);
    }
  }

  // Test 3: Redirect result handling when no redirect occurred
  console.log('\n[TEST 3] Verifying handleGoogleRedirectResult with no active redirect...');
  const noRedirect = await handleGoogleRedirectResult();
  assert.strictEqual(noRedirect, null, 'handleGoogleRedirectResult should return null when no redirect was pending');
  console.log('  ✓ PASSED: No redirect state returns null without errors or redirect loops');

  console.log('\n============================================================');
  console.log('ALL MOBILE AUTH & REDIRECT TESTS PASSED (3/3)');
  console.log('============================================================\n');
}

runMobileAuthTests().catch((err) => {
  console.error('Mobile Auth Test Failure:', err);
  process.exit(1);
});
