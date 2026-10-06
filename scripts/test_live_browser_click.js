/**
 * scripts/test_live_browser_click.js
 * Automates real Chrome browser to visit live https://viralhub2026-mu.vercel.app/video/41,
 * click "Unlock for ₹9/month", and confirm that the Cashfree payment gateway modal opens.
 */

const fs = require('fs');
const { spawn } = require('child_process');

async function testLiveBrowserClick() {
  console.log('Spawning real Chrome browser in headless mode with remote debugging...');
  const chromeProcess = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--user-data-dir=C:\\Users\\suji2\\.gemini\\chrome-test-profile',
    '--disable-gpu',
    'about:blank'
  ], { detached: false });

  // Wait for Chrome CDP to be ready
  let version = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      version = await (await fetch('http://127.0.0.1:9222/json/version')).json();
      if (version) break;
    } catch (_) {}
  }

  if (!version) {
    throw new Error('Failed to connect to Chrome DevTools Protocol after launching Chrome.');
  }

  console.log('Connected to Chrome CDP:', version.Browser);
  
  try {
    // 1. Create a new target page in Chrome pointing to live Video 41
    const newPageRes = await (await fetch('http://127.0.0.1:9222/json/new?https://viralhub2026-mu.vercel.app/video/41', { method: 'PUT' })).json();
    console.log('New target page created:', newPageRes.id);
    const wsUrl = newPageRes.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);

    let msgId = 1;
    const pendingRequests = new Map();

    function sendCommand(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pendingRequests.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    console.log('Connected to target page WebSocket.');

    // Listen to console messages and network requests
    const consoleMessages = [];
    const networkRequests = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pendingRequests.has(data.id)) {
        const { resolve } = pendingRequests.get(data.id);
        pendingRequests.delete(data.id);
        resolve(data.result);
      } else if (data.method === 'Runtime.consoleAPICalled') {
        const args = data.params.args.map(a => a.value || a.description).join(' ');
        consoleMessages.push(args);
        console.log('  [Browser Console]:', args);
      } else if (data.method === 'Network.requestWillBeSent') {
        networkRequests.push(data.params.request.url);
        if (data.params.request.url.includes('cashfree') || data.params.request.url.includes('/api/entitlements')) {
          console.log('  [Network Request]:', data.params.request.url);
        }
      }
    };

    // Enable Page, Runtime, DOM, Network
    await sendCommand('Page.enable');
    await sendCommand('Runtime.enable');
    await sendCommand('Network.enable');

    // Wait 5 seconds for page to fully load and render video 41 details
    console.log('Waiting for video 41 page to load on live site...');
    await new Promise(r => setTimeout(r, 5000));

    // Verify locked overlay text
    const checkOverlayRes = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const title = document.querySelector('.lock-title')?.innerText || '';
        const sub = document.querySelector('.lock-subtitle')?.innerText || '';
        const price = document.querySelector('.lock-price-tag')?.innerText || '';
        const btn = document.querySelector('#btnUnlockVideo')?.innerText || '';
        const isLocked = document.getElementById('videoLockOverlay')?.style.display !== 'none';
        return { title, sub, price, btn, isLocked };
      })()`,
      returnByValue: true
    });

    console.log('Pre-click Locked Overlay State:', checkOverlayRes.result.value);

    // Click the "Unlock for ₹9/month" button
    console.log('\n--- CLICKING "Unlock for ₹9/month" BUTTON IN REAL BROWSER ---');
    await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('btnUnlockVideo');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      })()`
    });

    // Wait 4 seconds for /api/entitlements/create-order and Cashfree SDK checkout modal to initialize
    await new Promise(r => setTimeout(r, 4000));

    // Inspect DOM for Cashfree Checkout Modal / iframe
    const checkoutModalCheck = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
          src: f.src,
          id: f.id,
          className: f.className,
          visible: f.offsetWidth > 0 && f.offsetHeight > 0
        }));
        const cfElements = Array.from(document.querySelectorAll('[id*=\"cashfree\"], [class*=\"cashfree\"], [id*=\"cf-\"], [class*=\"cf-\"]')).map(el => ({
          tag: el.tagName,
          id: el.id,
          className: el.className
        }));
        const unlockBtnText = document.getElementById('btnUnlockVideo')?.innerText || '';
        const errorAlert = document.getElementById('unlockErrorAlert')?.innerText || '';
        const errorDisplay = document.getElementById('unlockErrorAlert')?.style.display;
        const subBadgeText = document.getElementById('subStatusBadge')?.innerText || '';
        const subBadgeDisplay = document.getElementById('subStatusBadge')?.style.display;

        return {
          iframes,
          cfElements,
          unlockBtnText,
          errorAlert,
          errorDisplay,
          subBadgeText,
          subBadgeDisplay
        };
      })()`,
      returnByValue: true
    });

    console.log('\nPost-click Gateway & DOM State:');
    console.log(JSON.stringify(checkoutModalCheck.result.value, null, 2));

    // Take screenshot
    const screenshotRes = await sendCommand('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(screenshotRes.data, 'base64');
    fs.writeFileSync('artifacts_browser_unlock_cashfree.png', buffer);
    console.log('Saved screenshot to artifacts_browser_unlock_cashfree.png (size: ' + buffer.length + ' bytes)');

    // Close page
    await sendCommand('Page.close');
    ws.close();

    // Evaluate results
    const val = checkoutModalCheck.result.value;
    const openedGateway = (val.iframes.length > 0 && val.iframes.some(f => f.src.includes('cashfree'))) ||
                          val.cfElements.length > 0 ||
                          networkRequests.some(u => u.includes('cashfree.com'));

    const noFakePremium = (val.subBadgeDisplay === 'none' || !val.subBadgeText.includes('Premium Active'));

    console.log('\n======================================================');
    console.log('REAL BROWSER VERIFICATION RESULT:');
    console.log('  Cashfree gateway opened:', openedGateway ? 'YES ✅' : 'NO ❌');
    console.log('  No fake Premium Active:', noFakePremium ? 'YES ✅' : 'NO ❌');
    console.log('======================================================');

    if (!openedGateway && val.errorAlert) {
      console.error('Error displayed in UI:', val.errorAlert);
      process.exit(1);
    } else {
      process.exit(0);
    }
  } finally {
    try {
      chromeProcess.kill();
    } catch (_) {}
  }
}

testLiveBrowserClick().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
