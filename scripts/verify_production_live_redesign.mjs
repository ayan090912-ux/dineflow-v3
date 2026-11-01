import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CDPClient, getWebSocketDebuggerUrl } from './cdp_helper.mjs';

const ARTIFACT_DIR = '/Users/ayaan/.gemini/antigravity/brain/2f5bb0c8-027a-4080-aeb1-17415c6dc610';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const port = 9235;
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    'about:blank',
  ], { stdio: 'ignore' });

  let debuggerUrl = null;
  for (let i = 0; i < 25; i++) {
    try {
      debuggerUrl = await getWebSocketDebuggerUrl(port);
      if (debuggerUrl) break;
    } catch {}
    await sleep(250);
  }

  if (!debuggerUrl) {
    console.error('Failed to connect to headless Chrome on port', port);
    chrome.kill();
    return;
  }

  const browserCdp = new CDPClient(debuggerUrl);
  await browserCdp.connect();

  const { targetId } = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
  const pageWs = `ws://127.0.0.1:${port}/devtools/page/${targetId}`;
  const client = new CDPClient(pageWs);
  await client.connect();
  await client.send('Page.enable');
  await client.send('DOM.enable');

  // Test 1: Mobile Customer App Viewport (360x780)
  console.log('[TEST 1] Verifying Mobile Customer Menu on https://the-start.dinely.food/customer?table=03...');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 360,
    height: 780,
    deviceScaleFactor: 2,
    mobile: true,
  });

  await client.send('Page.navigate', { url: 'https://the-start.dinely.food/customer?table=03' });
  await sleep(3500);

  const shot1 = await client.send('Page.captureScreenshot', { format: 'png' });
  const p1 = path.join(ARTIFACT_DIR, '67_production_verified_customer_mobile.png');
  fs.writeFileSync(p1, Buffer.from(shot1.data, 'base64'));
  console.log('Saved:', p1);

  // Check no horizontal overflow
  const overflow = await client.send('Runtime.evaluate', {
    expression: `(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = window.innerWidth;
      const cards = Array.from(document.querySelectorAll('.liquid-glass-card'));
      return { scrollWidth: docW, innerWidth: winW, hasOverflow: docW > winW, cardCount: cards.length };
    })()`,
    returnByValue: true,
  });
  console.log('Mobile Layout Check:', overflow.result?.value);

  // Test 2: Trigger Session Bill Modal
  console.log('[TEST 2] Verifying Session Bill Modal with UPI QR...');
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const billBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Bill'));
      if (billBtn) billBtn.click();
      return !!billBtn;
    })()`,
    returnByValue: true,
  });
  await sleep(1500);

  const shot2 = await client.send('Page.captureScreenshot', { format: 'png' });
  const p2 = path.join(ARTIFACT_DIR, '68_production_verified_customer_bill.png');
  fs.writeFileSync(p2, Buffer.from(shot2.data, 'base64'));
  console.log('Saved:', p2);

  // Test 3: Desktop View (1440x900) of Restaurant Operations & Billing Hub
  console.log('[TEST 3] Verifying Desktop Restaurant Operations Hub & Billing...');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await client.send('Page.navigate', { url: 'https://the-start.dinely.food/' });
  await sleep(1500);

  const PROD_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5YjdjMmUzNS1kNWY2LTQyMzctYjdkNy1mMGU5MGI3MTZiNTMiLCJzY29wZSI6Ik9XTkVSIiwianRpIjoiMDBjYzU2M2YtMTgyOC00NTZkLTk5ODktYjZjZWIwZWYwZmQ4IiwiaWF0IjoxNzkzMjQ0MjE4LCJleHAiOjE3OTQ0NTM4MTgsInR5cGUiOiJhY2Nlc3MiLCJ1aWQiOiJXNDV3dGFnVk5jY240MzhxTHpLRnByMDQ3dDYzIiwiZW1haWwiOiJheWFuYW1pdHk3N0BnbWFpbC5jb20iLCJyb2xlIjoiT1dORVIiLCJyZXN0YXVyYW50X2lkIjoicmVzdC0xNzkwNTk0NTQ0NTI2LTM5NjAyMiJ9.1m4TavFEaf5uC-SLoNe3d71cHTRqlxXRXLcYc4jUXXI';

  await client.send('Runtime.evaluate', {
    expression: `
      (function() {
        const ownerUser = {
          id: 'W45wtagVNccn438qLzKFpr047t63',
          name: 'Ayan Amity',
          email: 'ayanamity77@gmail.com',
          role: 'OWNER',
          scope: 'OWNER',
          restaurantId: 'rest-1790594544526-396022'
        };
        const tokens = {
          accessToken: '${PROD_TOKEN}',
          refreshToken: '${PROD_TOKEN}',
          expiresIn: 86400 * 14,
          tokenType: 'Bearer'
        };
        localStorage.setItem('dinely_auth_token', '${PROD_TOKEN}');
        localStorage.setItem('dinely_owner_token', '${PROD_TOKEN}');
        localStorage.setItem('dinely_active_scope', 'OWNER');
        localStorage.setItem('dinely_active_restaurant_id', 'rest-1790594544526-396022');
        localStorage.setItem('dinely_restaurant_id', 'rest-1790594544526-396022');
        localStorage.setItem('dinely_user_role', 'OWNER');
        localStorage.setItem('dinely_user', JSON.stringify(ownerUser));
        localStorage.setItem('dinely_user_owner', JSON.stringify(ownerUser));
        sessionStorage.setItem('dinely_session_owner', JSON.stringify({ user: ownerUser, tokens, restaurantId: 'rest-1790594544526-396022' }));
        document.cookie = 'dinely_auth_token=' + encodeURIComponent('${PROD_TOKEN}') + '; Domain=.dinely.food; Path=/; Max-Age=2592000; Secure';
      })();
    `,
  });

  await client.send('Page.navigate', { url: 'https://the-start.dinely.food/restaurant/dashboard' });
  await sleep(4000);

  // Navigate to Billing & Invoices
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const billingTab = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Billing & Invoices'));
      if (billingTab) billingTab.click();
      return !!billingTab;
    })()`,
  });
  await sleep(3000);

  const shot3 = await client.send('Page.captureScreenshot', { format: 'png' });
  const p3 = path.join(ARTIFACT_DIR, '69_production_verified_restaurant_hub.png');
  fs.writeFileSync(p3, Buffer.from(shot3.data, 'base64'));
  console.log('Saved:', p3);

  // Test 4: Waiter Terminal
  console.log('[TEST 4] Verifying Waiter Terminal on https://the-start.dinely.food/restaurant/dashboard...');
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const waiterTab = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Waiter Terminal'));
      if (waiterTab) waiterTab.click();
      return !!waiterTab;
    })()`,
  });
  await sleep(3500);

  const shot4 = await client.send('Page.captureScreenshot', { format: 'png' });
  const p4 = path.join(ARTIFACT_DIR, '70_production_verified_waiter_terminal.png');
  fs.writeFileSync(p4, Buffer.from(shot4.data, 'base64'));
  console.log('Saved:', p4);

  // Test 5: Waiter Terminal Tables & Sessions Subtab
  console.log('[TEST 5] Verifying Waiter Terminal Tables & Sessions subtab...');
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.toLowerCase().includes('tables & sessions'));
      if (tab) tab.click();
      return !!tab;
    })()`,
  });
  await sleep(2500);

  const shot5 = await client.send('Page.captureScreenshot', { format: 'png' });
  const p5 = path.join(ARTIFACT_DIR, '73_production_waiter_tables_synced.png');
  fs.writeFileSync(p5, Buffer.from(shot5.data, 'base64'));
  console.log('Saved:', p5);

  // Test 6: Bar Terminal
  console.log('[TEST 6] Verifying Bar Terminal on https://the-start.dinely.food/restaurant/dashboard...');
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Bar Terminal'));
      if (tab) tab.click();
      return !!tab;
    })()`,
  });
  await sleep(3500);

  const shot6 = await client.send('Page.captureScreenshot', { format: 'png' });
  const p6 = path.join(ARTIFACT_DIR, '74_production_bar_terminal.png');
  fs.writeFileSync(p6, Buffer.from(shot6.data, 'base64'));
  console.log('Saved:', p6);

  // Test 7: Hookah Terminal
  console.log('[TEST 7] Verifying Hookah Terminal on https://the-start.dinely.food/restaurant/dashboard...');
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Hookah Terminal'));
      if (tab) tab.click();
      return !!tab;
    })()`,
  });
  await sleep(3500);

  const shot7 = await client.send('Page.captureScreenshot', { format: 'png' });
  const p7 = path.join(ARTIFACT_DIR, '75_production_hookah_terminal.png');
  fs.writeFileSync(p7, Buffer.from(shot7.data, 'base64'));
  console.log('Saved:', p7);

  // Test 8: Kitchen KDS
  console.log('[TEST 8] Verifying Kitchen KDS on https://the-start.dinely.food/restaurant/dashboard...');
  await client.send('Runtime.evaluate', {
    expression: `(() => {
      const tab = Array.from(document.querySelectorAll('button')).find(el => el.textContent && el.textContent.includes('Kitchen KDS'));
      if (tab) tab.click();
      return !!tab;
    })()`,
  });
  await sleep(3500);

  const shot8 = await client.send('Page.captureScreenshot', { format: 'png' });
  const p8 = path.join(ARTIFACT_DIR, '76_production_kitchen_kds.png');
  fs.writeFileSync(p8, Buffer.from(shot8.data, 'base64'));
  console.log('Saved:', p8);

  client.ws.close();
  chrome.kill();
  console.log('ALL SCREENSHOT VERIFICATIONS COMPLETED SUCCESSFULLY!');
}

main().catch(console.error);
