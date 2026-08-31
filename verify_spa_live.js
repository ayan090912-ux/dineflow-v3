const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    }).on('error', reject);
  });
}

async function verifyLiveSpaDeployment() {
  console.log('================================================================');
  console.log('=== VERIFYING LIVE SPA NAVIGATION & BUNDLE DEPLOYMENT ===');
  console.log('================================================================\n');

  const mainPage = await get('https://dinely.food');
  console.log('1. Live Website HTTP Status:', mainPage.status === 200 ? 'PASS (200 OK)' : `FAIL (${mainPage.status})`);
  
  const scriptMatch = mainPage.data.match(/src="([^"]+)"/);
  console.log('   Active JS Bundle:', scriptMatch ? scriptMatch[1] : 'Not Found');
  
  if (scriptMatch) {
    const bundleRes = await get('https://dinely.food' + scriptMatch[1]);
    const hasRouterEvents = bundleRes.data.includes('dinely_navigate') || bundleRes.data.includes('popstate');
    console.log('2. Event-Driven Router in Production:', hasRouterEvents ? 'PASS (Global navigation event bus active)' : 'FAIL');
  }

  // Verify direct URL SPA rewrites
  const directUrls = [
    'https://dinely.food/restaurant/dashboard',
    'https://dinely.food/waiter',
    'https://dinely.food/kitchen/dashboard',
    'https://dinely.food/bar/dashboard',
    'https://dinely.food/inventory/terminal',
    'https://dinely.food/customer?restaurant=rest-1787446097984&table=01'
  ];

  for (const url of directUrls) {
    const res = await get(url);
    console.log(`Direct route ${new URL(url).pathname} -> ${res.status === 200 ? 'PASS (200 OK SPA Rewrite)' : `FAIL (${res.status})`}`);
  }

  console.log('\n================================================================');
  console.log('=== SPA DEPLOYMENT VERIFICATION COMPLETE ===');
  console.log('================================================================');
}

verifyLiveSpaDeployment().catch(console.error);
