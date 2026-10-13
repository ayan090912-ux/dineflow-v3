import assert from 'node:assert';
import worker from './src/index.js';

console.log('====================================================');
console.log('STARTING CLOUDFLARE TENANT ROUTER WORKER UNIT TESTS');
console.log('====================================================');

// Mock global fetch
const originalFetch = global.fetch;
let lastOriginRequest = null;
let mockOriginResponse = {
  status: 200,
  statusText: 'OK',
  headers: new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  }),
  body: '<html><body>Dinely SPA Origin</body></html>',
};

global.fetch = async (url, options) => {
  lastOriginRequest = { url, options };
  return {
    status: mockOriginResponse.status,
    statusText: mockOriginResponse.statusText,
    headers: new Headers(mockOriginResponse.headers),
    body: mockOriginResponse.body,
  };
};

async function runWorkerTests() {
  try {
    // -------------------------------------------------------------
    // TEST 1: Tenant Subdomain Request (the-dunk.dinely.food)
    // -------------------------------------------------------------
    console.log('\n[TEST 1] Tenant Subdomain Routing: the-dunk.dinely.food/customer');
    const req1 = new Request('https://the-dunk.dinely.food/customer', {
      headers: {
        'Host': 'the-dunk.dinely.food',
        'User-Agent': 'Mozilla/5.0 TestBrowser',
      },
    });

    const res1 = await worker.fetch(req1, {}, {});
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(lastOriginRequest.url, 'http://ec2-3-7-195-143.ap-south-1.compute.amazonaws.com/customer');
    assert.strictEqual(lastOriginRequest.options.headers.get('Host'), 'the-dunk.dinely.food');
    assert.strictEqual(lastOriginRequest.options.headers.get('X-Forwarded-Host'), 'the-dunk.dinely.food');
    assert.strictEqual(lastOriginRequest.options.headers.get('X-Tenant-Slug'), 'the-dunk');
    assert.strictEqual(res1.headers.get('X-Dinely-Routed-By'), 'dinely-tenant-router');
    assert.strictEqual(res1.headers.get('X-Dinely-Tenant-Slug'), 'the-dunk');
    assert.strictEqual(res1.headers.get('X-Dinely-Original-Host'), 'the-dunk.dinely.food');
    console.log('  ✓ PASSED: Origin proxied to EC2 with tenant headers and telemetry attached');

    // -------------------------------------------------------------
    // TEST 2: Platform Root Request (dinely.food)
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Platform Root Routing: dinely.food/admin');
    const req2 = new Request('https://dinely.food/admin', {
      headers: { 'Host': 'dinely.food' },
    });

    const res2 = await worker.fetch(req2, {}, {});
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(lastOriginRequest.url, 'http://ec2-3-7-195-143.ap-south-1.compute.amazonaws.com/admin');
    assert.strictEqual(lastOriginRequest.options.headers.get('Host'), 'dinely.food');
    assert.strictEqual(lastOriginRequest.options.headers.get('X-Tenant-Slug'), null);
    assert.strictEqual(res2.headers.get('X-Dinely-Tenant-Slug'), null);
    console.log('  ✓ PASSED: Platform root correctly passed without tenant context');

    // -------------------------------------------------------------
    // TEST 3: Reserved Subdomain Request (api.dinely.food, www.dinely.food)
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Reserved Subdomains: api.dinely.food, www.dinely.food');
    const req3 = new Request('https://api.dinely.food/docs', {
      headers: { 'Host': 'api.dinely.food' },
    });
    const res3 = await worker.fetch(req3, {}, {});
    assert.strictEqual(lastOriginRequest.options.headers.get('X-Tenant-Slug'), null);
    console.log('  ✓ PASSED: Reserved subdomains prevented from tenant hijacking');

    // -------------------------------------------------------------
    // TEST 4: Redirect Location Rewriting
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Origin Redirect Location Rewriting');
    mockOriginResponse = {
      status: 302,
      statusText: 'Found',
      headers: new Headers({
        'Location': 'http://ec2-3-7-195-143.ap-south-1.compute.amazonaws.com/customer',
      }),
      body: '',
    };

    const req4 = new Request('https://cafe-co.dinely.food/', {
      headers: { 'Host': 'cafe-co.dinely.food' },
    });

    const res4 = await worker.fetch(req4, {}, {});
    assert.strictEqual(res4.status, 302);
    assert.strictEqual(res4.headers.get('Location'), 'https://cafe-co.dinely.food/customer');
    console.log('  ✓ PASSED: Location header rewritten to preserve tenant browser URL');

    // -------------------------------------------------------------
    // TEST 5: Same-Domain Firebase Auth Helper Route (/__/auth/handler)
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Firebase Auth Helper: dinely.food/__/auth/handler');
    mockOriginResponse = {
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'Content-Type': 'text/html; charset=utf-8',
      }),
      body: '<html><body>Firebase Auth Helper</body></html>',
    };

    const req5 = new Request('https://dinely.food/__/auth/handler?apiKey=testApiKey', {
      headers: { 'Host': 'dinely.food' },
    });

    const res5 = await worker.fetch(req5, {}, {});
    assert.strictEqual(res5.status, 200);
    assert.strictEqual(lastOriginRequest.url, 'https://dinely-cd6cd.firebaseapp.com/__/auth/handler?apiKey=testApiKey');
    assert.strictEqual(lastOriginRequest.options.headers.get('Host'), 'dinely-cd6cd.firebaseapp.com');
    assert.strictEqual(res5.headers.get('X-Dinely-Routed-By'), 'dinely-tenant-router');
    assert.strictEqual(res5.headers.get('X-Dinely-Auth-Helper'), 'true');
    console.log('  ✓ PASSED: /__/auth/handler proxied directly to Firebase Auth helper with auth headers');

    console.log('\n====================================================');
    console.log('ALL CLOUDFLARE WORKER UNIT TESTS PASSED (5/5)');
    console.log('====================================================\n');
  } finally {
    global.fetch = originalFetch;
  }
}

runWorkerTests();
