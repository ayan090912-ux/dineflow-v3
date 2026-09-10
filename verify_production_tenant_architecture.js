const https = require('https');
const http = require('http');

const RENDER_API = 'https://dineflow-v3.onrender.com/api/v1';
const FIREBASE_ORIGIN = 'https://dinely-cd6cd.web.app';
const MAIN_PLATFORM = 'https://dinely.food';

function getHttps(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'Dinely-Verification-Bot/1.0', ...headers }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(data), raw: data });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    }).on('error', reject);
  });
}

function postHttps(url, body = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const dataStr = JSON.stringify(body);
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataStr),
        'User-Agent': 'Dinely-Verification-Bot/1.0',
        ...headers
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, json: JSON.parse(data), raw: data });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

async function runVerification() {
  console.log('================================================================');
  console.log('=== DINELY PRODUCTION SUBDOMAIN & TENANT ARCHITECTURE AUDIT ===');
  console.log('================================================================\n');

  let allPassed = true;

  // 1. Verify Production Main Platform
  console.log('[TEST 1] Main Platform (https://dinely.food)...');
  try {
    const mainRes = await getHttps(MAIN_PLATFORM);
    if (mainRes.status === 200) {
      console.log('  -> PASS: HTTP 200 OK');
    } else {
      console.log(`  -> FAIL: HTTP ${mainRes.status}`);
      allPassed = false;
    }
  } catch (e) {
    console.log(`  -> ERROR: ${e.message}`);
    allPassed = false;
  }

  // 2. Verify Firebase Hosting Origin
  console.log('\n[TEST 2] Firebase Hosting Origin (https://dinely-cd6cd.web.app)...');
  try {
    const fbRes = await getHttps(FIREBASE_ORIGIN);
    if (fbRes.status === 200) {
      console.log('  -> PASS: HTTP 200 OK (Single Page Application origin online)');
    } else {
      console.log(`  -> FAIL: HTTP ${fbRes.status}`);
      allPassed = false;
    }
  } catch (e) {
    console.log(`  -> ERROR: ${e.message}`);
    allPassed = false;
  }

  // 3. Verify Canonical Tenant Resolver on Render for THE DUNK
  console.log('\n[TEST 3] Backend Tenant Resolver (THE DUNK by hostname: the-dunk.dinely.food)...');
  try {
    const resolveRes = await getHttps(`${RENDER_API}/restaurants/public/resolve?hostname=the-dunk.dinely.food`);
    if (resolveRes.status === 200 && resolveRes.json) {
      const rest = resolveRes.json;
      console.log(`  -> PASS: HTTP 200 OK`);
      console.log(`     Restaurant ID: ${rest.id}`);
      console.log(`     Name: ${rest.name}`);
      console.log(`     Public Slug: ${rest.publicSlug}`);
      console.log(`     Domain: ${rest.domain}`);
      console.log(`     Lifecycle Status: ${rest.lifecycleStatus}`);
      console.log(`     Is Tenant Subdomain: ${rest.isTenantSubdomain}`);
    } else {
      console.log(`  -> FAIL: HTTP ${resolveRes.status}`, resolveRes.raw);
      allPassed = false;
    }
  } catch (e) {
    console.log(`  -> ERROR: ${e.message}`);
    allPassed = false;
  }

  // 4. Verify Unknown Tenant Subdomain returns 404 (No Fallback)
  console.log('\n[TEST 4] Backend Unknown Tenant Subdomain (unknown-random-tenant.dinely.food)...');
  try {
    const unknownRes = await getHttps(`${RENDER_API}/restaurants/public/resolve?hostname=unknown-random-tenant.dinely.food`);
    if (unknownRes.status === 404) {
      console.log(`  -> PASS: HTTP 404 Not Found as expected`);
      console.log(`     Detail: ${unknownRes.json?.detail || unknownRes.raw}`);
    } else {
      console.log(`  -> FAIL: Expected 404, got HTTP ${unknownRes.status}`);
      allPassed = false;
    }
  } catch (e) {
    console.log(`  -> ERROR: ${e.message}`);
    allPassed = false;
  }

  // 5. Verify Two-Tenant Independent Creation & Domain Isolation
  console.log('\n[TEST 5] Two-Tenant Independent Creation & Domain Isolation Test...');
  const tStamp = Date.now();
  const restA_id = `rest-iso-a-${tStamp}`;
  const restB_id = `rest-iso-b-${tStamp}`;

  console.log(`  Creating Tenant A: "Dunk West" (${restA_id})...`);
  const createARes = await postHttps(`${RENDER_API}/restaurants`, {
    id: restA_id,
    name: `Dunk West ${tStamp}`,
    cuisine: 'American Burgers',
    businessType: 'RESTAURANT',
    ownerName: 'Owner A',
    ownerEmail: `owner.a.${tStamp}@test.dinely.internal`,
    phone: '+91 91111 22222',
    address: '101 West Boulevard, Sector 1',
    tableCount: 4,
    hasTables: true,
    hasKitchen: true,
    hasWaiter: true,
  });

  console.log(`  Creating Tenant B: "Sakura Tokyo" (${restB_id})...`);
  const createBRes = await postHttps(`${RENDER_API}/restaurants`, {
    id: restB_id,
    name: `Sakura Tokyo ${tStamp}`,
    cuisine: 'Japanese Ramen',
    businessType: 'RESTAURANT',
    ownerName: 'Owner B',
    ownerEmail: `owner.b.${tStamp}@test.dinely.internal`,
    phone: '+91 93333 44444',
    address: '202 Sakura Avenue, Sector 5',
    tableCount: 4,
    hasTables: true,
    hasKitchen: true,
    hasWaiter: true,
  });

  if (createARes.status === 201 && createBRes.status === 201) {
    const slugA = createARes.json.public_slug;
    const slugB = createBRes.json.public_slug;
    const domainA = createARes.json.domain;
    const domainB = createBRes.json.domain;

    console.log(`  -> Tenant A Public Slug: ${slugA}`);
    console.log(`  -> Tenant A Domain:      ${domainA}`);
    console.log(`  -> Tenant B Public Slug: ${slugB}`);
    console.log(`  -> Tenant B Domain:      ${domainB}`);

    if (slugA !== slugB && domainA !== domainB && domainA.includes(slugA) && domainB.includes(slugB)) {
      console.log('  -> PASS: Tenant A and Tenant B have unique, independent public domains!');
    } else {
      console.log('  -> FAIL: Domain overlap or collision between tenants!');
      allPassed = false;
    }

    // Verify tables and QR code URLs
    const tablesARes = await getHttps(`${RENDER_API}/restaurants/${restA_id}/tables`);
    const tablesBRes = await getHttps(`${RENDER_API}/restaurants/${restB_id}/tables`);

    if (tablesARes.status === 200 && tablesBRes.status === 200 && Array.isArray(tablesARes.json) && Array.isArray(tablesBRes.json)) {
      const qrA = tablesARes.json[0]?.qr_code_url;
      const qrB = tablesBRes.json[0]?.qr_code_url;
      console.log(`  -> Tenant A Table 01 QR: ${qrA}`);
      console.log(`  -> Tenant B Table 01 QR: ${qrB}`);

      const qrAValid = qrA.includes(`${slugA}.dinely.food/customer?table=`) && !qrA.includes('dashboard');
      const qrBValid = qrB.includes(`${slugB}.dinely.food/customer?table=`) && !qrB.includes('dashboard');

      if (qrAValid && qrBValid && qrA !== qrB) {
        console.log('  -> PASS: Table QR codes use tenant subdomains and never leak owner dashboard URLs!');
      } else {
        console.log('  -> FAIL: QR code URLs invalid or overlapping!');
        allPassed = false;
      }
    } else {
      console.log('  -> FAIL: Could not fetch tables for test tenants');
      allPassed = false;
    }
  } else {
    console.log(`  -> FAIL: Tenant creation failed. A: ${createARes.status}, B: ${createBRes.status}`);
    allPassed = false;
  }

  // 6. Summary
  console.log('\n================================================================');
  if (allPassed) {
    console.log('=== ALL PRODUCTION TENANT ARCHITECTURE TESTS PASSED (100%) ===');
  } else {
    console.log('=== SOME TESTS FAILED — REVIEW DETAILS ABOVE ===');
  }
  console.log('================================================================\n');
}

runVerification().catch(console.error);
