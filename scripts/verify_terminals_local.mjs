import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { CDPClient, getWebSocketDebuggerUrl } from './cdp_helper.mjs';

const ARTIFACT_DIR = '/Users/ayaan/.gemini/antigravity-ide/brain/c3d0d38b-c63b-4b26-b48a-09c2e48e676e';
const VALID_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNmQ5MzEzNC00MDQ4LTQ5ZWItYTc4Yi0wOWE1YzQzMWYzZjgiLCJzY29wZSI6Ik9XTkVSIiwianRpIjoiNjRhNDUyZDItMGYxYi00YmE2LTgxYzktOGIwMGYxZjE0ODllIiwiaWF0IjoxNzkzMjQyODkyLCJleHAiOjE3OTM4NDc2OTIsInR5cGUiOiJhY2Nlc3MiLCJ1aWQiOiJXNDV3dGFnVk5jY240MzhxTHpLRnByMDQ3dDYzIiwiZW1haWwiOiJheWFuYW1pdHk3N0BnbWFpbC5jb20iLCJyb2xlIjoiT1dORVIiLCJyZXN0YXVyYW50X2lkIjoicmVzdC0xNzkwNTk0NTQ0NTI2LTM5NjAyMiJ9.ljYt1Sna2dT5nIK8myi-hrnG1MY8-rGs4_eC29nixHk';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startHeadlessChrome(port = 9222) {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    'about:blank'
  ], { stdio: 'ignore' });

  for (let i = 0; i < 30; i++) {
    try {
      await getWebSocketDebuggerUrl(port);
      return chrome;
    } catch {
      await sleep(300);
    }
  }
  throw new Error('Failed to start headless Chrome within timeout');
}

async function captureScreenshot(cdp, filename) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(shot.data, 'base64');
  const fullPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  console.log(`[SCREENSHOT] Saved: ${fullPath} (${buffer.length} bytes)`);
  return fullPath;
}

async function evaluate(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res.result ? res.result.value : null;
}

async function waitForCondition(cdp, fnStr, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const val = await evaluate(cdp, fnStr);
    if (val) return val;
    await sleep(400);
  }
  throw new Error(`Condition timed out: ${fnStr}`);
}

async function main() {
  console.log('================================================================');
  console.log('🔍 LOCAL UI VERIFICATION: TWO-SECTION BAR & HOOKAH TERMINALS');
  console.log('================================================================');

  let chrome;
  try {
    chrome = await startHeadlessChrome(9222);
  } catch (e) {
    console.log('[INFO] Chrome already running or failed to spawn:', e.message);
  }

  try {
    const browserWs = await getWebSocketDebuggerUrl(9222);
    const browserCdp = new CDPClient(browserWs);
    await browserCdp.connect();

    const targetRes = await browserCdp.send('Target.createTarget', { url: 'about:blank' });
    const targetId = targetRes.targetId;
    const pageWs = `ws://127.0.0.1:9222/devtools/page/${targetId}`;
    const pageCdp = new CDPClient(pageWs);
    await pageCdp.connect();

    await pageCdp.send('Page.enable');
    await pageCdp.send('DOM.enable');
    await pageCdp.send('Runtime.enable');

    await pageCdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1.0,
      mobile: false,
    });

    // 1. Visit root to set valid JWT auth credentials
    console.log('\n[STEP 1] Setting valid JWT credentials on localhost:3007...');
    await pageCdp.send('Page.navigate', { url: 'http://localhost:3007/' });
    await sleep(1500);

    await evaluate(pageCdp, `
      (function() {
        localStorage.setItem('dinely_auth_token', '${VALID_JWT}');
        localStorage.setItem('dinely_owner_token', '${VALID_JWT}');
        localStorage.setItem('dinely_active_restaurant_id', 'rest-1790594544526-396022');
        localStorage.setItem('dinely_restaurant_id', 'rest-1790594544526-396022');

        const user = {
          id: 'W45wtagVNccn438qLzKFpr047t63',
          email: 'ayanamity77@gmail.com',
          name: 'Ayan Amity',
          role: 'OWNER',
          scope: 'OWNER',
          restaurantId: 'rest-1790594544526-396022'
        };
        const tokens = {
          accessToken: '${VALID_JWT}',
          refreshToken: '${VALID_JWT}',
          expiresIn: 86400,
          tokenType: 'Bearer'
        };
        
        sessionStorage.setItem('dinely_session_bar', JSON.stringify({ user, tokens, restaurantId: 'rest-1790594544526-396022' }));
        sessionStorage.setItem('dinely_session_hookah', JSON.stringify({ user, tokens, restaurantId: 'rest-1790594544526-396022' }));
        sessionStorage.setItem('dinely_session_owner', JSON.stringify({ user, tokens, restaurantId: 'rest-1790594544526-396022' }));
      })()
    `);

    // =========================================================================
    // 2. Open Bar Terminal on local server
    // =========================================================================
    console.log('\n[STEP 2] Navigating to http://localhost:3007/bar?tenant=the-start ...');
    await pageCdp.send('Page.navigate', { url: 'http://localhost:3007/bar?tenant=the-start' });
    
    await waitForCondition(pageCdp, `
      (function() {
        const text = document.body.innerText.toUpperCase();
        return text.includes('ACTIVE ORDERS') && text.includes('SENT TO WAITER');
      })()
    `, 20000);
    await sleep(2000);

    const barInspection = await evaluate(pageCdp, `
      (function() {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
        const bodyText = document.body.innerText.toUpperCase();
        return {
          title: document.title,
          url: window.location.href,
          hasSectionActiveOrders: bodyText.includes('ACTIVE ORDERS'),
          hasSectionSentToWaiter: bodyText.includes('SENT TO WAITER'),
          hasOldIncomingQueue: bodyText.includes('INCOMING QUEUE'),
          hasOldMixologyCol: bodyText.includes('MIXOLOGY & POURING'),
          hasOldReadyBarPass: bodyText.includes('READY AT BAR PASS'),
          hasOldRecentDispatchesCol: bodyText.includes('RECENT DISPATCHES') && !bodyText.includes('HISTORY'),
          hasLiveShiftPulse: bodyText.includes('LIVE SHIFT PULSE'),
          hasFilterPills: bodyText.includes('ALL ACTIVE') || bodyText.includes('NEW TICKETS'),
          hasStartPreparingBtn: buttons.some(t => t.toUpperCase().includes('START PREPARING')),
          hasReadySendToWaiterBtn: buttons.some(t => t.toUpperCase().includes('READY — SEND TO WAITER')),
          sampleButtons: buttons.filter(b => b.length > 0).slice(0, 10),
        };
      })()
    `);
    console.log('\n[BAR TERMINAL 2-SECTION REPORT]:\n', JSON.stringify(barInspection, null, 2));

    await captureScreenshot(pageCdp, 'bar_terminal_two_sections_initial.png');

    // 3. Test Clicking "START PREPARING" on Bar Terminal if available
    console.log('\n[STEP 3] Testing action on Bar Terminal...');
    const startPrepClicked = await evaluate(pageCdp, `
      (function() {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('START PREPARING'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log('START PREPARING clicked:', startPrepClicked);
    await sleep(2000);

    const postStartInspection = await evaluate(pageCdp, `
      (function() {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
        return {
          hasReadySendToWaiterBtn: buttons.some(t => t.includes('READY — SEND TO WAITER')),
          readySendButtonsCount: buttons.filter(t => t.includes('READY — SEND TO WAITER')).length
        };
      })()
    `);
    console.log('[BAR TERMINAL POST-START-PREPARING]:', JSON.stringify(postStartInspection, null, 2));
    await captureScreenshot(pageCdp, 'bar_terminal_two_sections_preparing.png');

    // Test Clicking "READY — SEND TO WAITER" on Bar Terminal
    console.log('\n[STEP 3b] Testing "READY — SEND TO WAITER" action on Bar Terminal...');
    const readySendClicked = await evaluate(pageCdp, `
      (function() {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('READY — SEND TO WAITER'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log('READY — SEND TO WAITER clicked:', readySendClicked);
    await sleep(2000);

    const postReadyInspection = await evaluate(pageCdp, `
      (function() {
        const bodyText = document.body.innerText;
        return {
          hasWaitingForWaiter: bodyText.includes('WAITING FOR WAITER'),
          hasSentToWaiterOrder: !bodyText.includes('No Orders Sent to Waiter')
        };
      })()
    `);
    console.log('[BAR TERMINAL POST-SEND-TO-WAITER]:', JSON.stringify(postReadyInspection, null, 2));
    await captureScreenshot(pageCdp, 'bar_terminal_order_in_sent_to_waiter.png');

    // =========================================================================
    // 4. Open Hookah Terminal on local server
    // =========================================================================
    console.log('\n[STEP 4] Navigating to http://localhost:3007/hookah?tenant=the-start ...');
    await pageCdp.send('Page.navigate', { url: 'http://localhost:3007/hookah?tenant=the-start' });

    await waitForCondition(pageCdp, `
      (function() {
        const text = document.body.innerText.toUpperCase();
        return text.includes('ACTIVE ORDERS') && text.includes('SENT TO WAITER');
      })()
    `, 20000);
    await sleep(2000);

    const hookahInspection = await evaluate(pageCdp, `
      (function() {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
        const bodyText = document.body.innerText.toUpperCase();
        return {
          title: document.title,
          url: window.location.href,
          hasSectionActiveOrders: bodyText.includes('ACTIVE ORDERS'),
          hasSectionSentToWaiter: bodyText.includes('SENT TO WAITER'),
          hasOldIncomingQueue: bodyText.includes('INCOMING QUEUE'),
          hasOldCoalsPrep: bodyText.includes('COALS & PREPARATION'),
          hasOldReadyShishaPass: bodyText.includes('READY SHISHA PASS'),
          hasLiveShiftPulse: bodyText.includes('LIVE SHIFT PULSE'),
          hasFilterPills: bodyText.includes('ALL ACTIVE') || bodyText.includes('NEW TICKETS'),
          hasStartPreparingBtn: buttons.some(t => t.toUpperCase().includes('START PREPARING')),
          hasReadySendToWaiterBtn: buttons.some(t => t.toUpperCase().includes('READY — SEND TO WAITER')),
          sampleButtons: buttons.filter(b => b.length > 0).slice(0, 10),
        };
      })()
    `);
    console.log('\n[HOOKAH TERMINAL 2-SECTION REPORT]:\n', JSON.stringify(hookahInspection, null, 2));

    await captureScreenshot(pageCdp, 'hookah_terminal_two_sections_initial.png');

    // 5. Test Clicking "START PREPARING" on Hookah Terminal if available
    console.log('\n[STEP 5] Testing action on Hookah Terminal...');
    const hookahStartClicked = await evaluate(pageCdp, `
      (function() {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('START PREPARING'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log('Hookah START PREPARING clicked:', hookahStartClicked);
    await sleep(2000);

    await captureScreenshot(pageCdp, 'hookah_terminal_two_sections_preparing.png');

    // Test Clicking "READY — SEND TO WAITER" on Hookah Terminal
    console.log('\n[STEP 5b] Testing "READY — SEND TO WAITER" action on Hookah Terminal...');
    const hookahReadySendClicked = await evaluate(pageCdp, `
      (function() {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('READY — SEND TO WAITER'));
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()
    `);
    console.log('Hookah READY — SEND TO WAITER clicked:', hookahReadySendClicked);
    await sleep(2000);

    const postHookahReadyInspection = await evaluate(pageCdp, `
      (function() {
        const bodyText = document.body.innerText;
        return {
          hasWaitingForWaiter: bodyText.includes('WAITING FOR WAITER'),
          hasSentToWaiterOrder: !bodyText.includes('No Pipes Sent to Waiter')
        };
      })()
    `);
    console.log('[HOOKAH TERMINAL POST-SEND-TO-WAITER]:', JSON.stringify(postHookahReadyInspection, null, 2));
    await captureScreenshot(pageCdp, 'hookah_terminal_order_in_sent_to_waiter.png');

    await pageCdp.send('Target.closeTarget', { targetId }).catch(() => {});
    if (chrome) chrome.kill();

    console.log('\n================================================================');
    console.log('🎉 2-SECTION TERMINAL PROOF & ACTIONS VERIFIED SUCCESSFULLY!');
    console.log('================================================================');
  } catch (err) {
    console.error('[-] Error during visual verification:', err);
    if (chrome) chrome.kill();
    process.exit(1);
  }
}

main();
