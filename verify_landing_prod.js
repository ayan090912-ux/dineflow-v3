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

async function verifyProductionLanding() {
  console.log('=== VERIFYING LIVE PRODUCTION LANDING WEBSITE (https://dinely.food) ===\n');

  const res = await get('https://dinely.food');
  console.log('1. Page Status:', res.status === 200 ? 'PASS (HTTP 200)' : `FAIL (${res.status})`);

  const hasTitle = res.data.includes('Dinely — Connected Restaurant Operating System');
  console.log('2. Updated SEO Title in HTML:', hasTitle ? 'PASS' : 'FAIL');

  const hasMeta = res.data.includes('restaurant ordering system, QR ordering');
  console.log('3. Updated Meta Description & Keywords:', hasMeta ? 'PASS' : 'FAIL');

  const scriptMatch = res.data.match(/src="([^"]+)"/);
  console.log('4. Deployed JavaScript Bundle Tag:', scriptMatch ? scriptMatch[1] : 'Not Found');

  if (scriptMatch) {
    const bundleRes = await get('https://dinely.food' + scriptMatch[1]);
    console.log('5. Bundle Load Status:', bundleRes.status === 200 ? 'PASS (HTTP 200)' : `FAIL (${bundleRes.status})`);
    console.log('   Bundle Size:', bundleRes.data.length, 'bytes');

    const checks = [
      { name: 'Headline ("Run Your Entire Restaurant From One Connected Platform.")', match: bundleRes.data.includes('Run Your Entire Restaurant From') },
      { name: 'Connected Pipeline Section ("The Connected Dinely Dining Pipeline")', match: bundleRes.data.includes('The Connected Dinely Dining Pipeline') },
      { name: 'Problem vs Solution ("The Cost of Disconnected Restaurant Software")', match: bundleRes.data.includes('The Cost of Disconnected Restaurant Software') },
      { name: '6-Step Dining Flow ("How Dinely Powers a Table from Scan to Settlement")', match: bundleRes.data.includes('How Dinely Powers a Table from Scan to Settlement') },
      { name: 'Role Workspaces ("Built for Every Role in Your Restaurant")', match: bundleRes.data.includes('Built for Every Role in Your Restaurant') },
      { name: 'Modular Business Types ("Only Use What Your Business Actually Needs")', match: bundleRes.data.includes('Only Use What Your Business Actually Needs') },
      { name: 'Billing & UPI ("Configurable GST, Custom Invoice Numbering & UPI QR")', match: bundleRes.data.includes('Configurable GST, Custom Invoice Numbering & UPI QR') },
      { name: 'FAQ Section ("Frequently Asked Questions")', match: bundleRes.data.includes('Frequently Asked Questions') },
      { name: 'No Platform Admin public leakage', match: !bundleRes.data.includes('Global SaaS Console & Approvals') },
    ];

    console.log('\n--- Content & SaaS Verification Checks ---');
    checks.forEach(c => {
      console.log(`- ${c.name}: ${c.match ? 'PASS' : 'FAIL'}`);
    });
  }

  console.log('\n=== PRODUCTION LANDING VERIFICATION COMPLETE ===');
}

verifyProductionLanding().catch(console.error);
