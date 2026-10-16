/**
 * scripts/test_inapp_and_payu_complete.js
 * 
 * Comprehensive E2E Verification for:
 * 1. Direct PayU checkout initiation (NO extra popup modal or mandatory fields).
 * 2. Instagram Android In-App Browser detection & discrete lock-screen Chrome fallback.
 * 3. Standard Android Chrome 1-click PayU checkout.
 * 4. Desktop viewport direct checkout behavior.
 */

const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

const puppeteer = require('puppeteer-core');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEST_VIDEO_ID = '92';

const UA_INSTAGRAM_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.90 Mobile Safari/537.36 Instagram 316.0.0.38.109 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 7; cheetah; cheetah; en_US; 565012345)';
const UA_CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.90 Mobile Safari/537.36';

let passed = 0;
let failed = 0;

function assert(description, condition, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${description}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${description} ${details ? '(' + details + ')' : ''}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('E2E TEST: DIRECT PAYU CHECKOUT & STREAMLINED UX VALIDATION');
  console.log('================================================================');

  let browser = null;
  let server = null;
  try {
    const domains = ['secure.payu.in', 'api.payu.in', 'info.payu.in', 'static.payu.in', 'web-assets.payu.in', 'viralhub2026-mu.vercel.app'];
    const rules = [];
    for (const d of domains) {
      try {
        const ips = await dns.promises.resolve4(d);
        if (ips && ips.length > 0) rules.push(`MAP ${d} ${ips[0]}`);
      } catch (_) {}
    }

    const chromeArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
    if (rules.length > 0) {
      chromeArgs.push(`--host-resolver-rules=${rules.join(', ')}`);
    }

    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: chromeArgs
    });

    const app = require('../server');
    server = http.createServer(app);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const localUrl = `http://127.0.0.1:${port}/video/${TEST_VIDEO_ID}`;
    console.log(`Local test server running at: ${localUrl}`);

    // -------------------------------------------------------------------------
    // TEST SUITE 1: Instagram In-App Browser Simulation
    // -------------------------------------------------------------------------
    console.log('\n[1/3] Testing Instagram In-App Browser...');
    {
      const page = await browser.newPage();
      await page.setUserAgent(UA_INSTAGRAM_ANDROID);
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

      await page.goto(localUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForSelector('#playerWrapper', { timeout: 10000 });

      // Verify NO intrusive top banner is shown
      const banner = await page.$('#inAppBrowserBanner');
      assert('Intrusive top notice banner has been removed', !banner);

      // Verify discrete fallback options on the lock screen
      const fallbackDisplay = await page.$eval('#inAppBrowserFallback', el => window.getComputedStyle(el).display);
      assert('In-app fallback options are displayed on the lock screen', fallbackDisplay !== 'none');

      const chromeIntentHref = await page.$eval('#btnFallbackOpenChrome', el => el.getAttribute('href') || el.href);
      assert('Open in Chrome has valid Android intent URI', chromeIntentHref.startsWith('intent://') && chromeIntentHref.includes('package=com.android.chrome'), `href=${chromeIntentHref}`);

      const copyBtn = await page.$('#btnFallbackCopyLink');
      assert('Copy Link fallback button is present on lock screen', Boolean(copyBtn));

      // Verify no extra checkout modal exists
      const checkoutModal = await page.$('#checkoutModal');
      assert('Separate checkout modal has been completely removed', !checkoutModal);

      await page.close();
    }

    // -------------------------------------------------------------------------
    // TEST SUITE 2: Standard Android Chrome Direct 1-Click PayU Initiation
    // -------------------------------------------------------------------------
    console.log('\n[2/3] Testing Standard Android Chrome Direct 1-Click PayU Initiation...');
    {
      const page = await browser.newPage();
      await page.setUserAgent(UA_CHROME_ANDROID);
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

      await page.goto(localUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForFunction(() => {
        const btn = document.getElementById('btnUnlockVideo');
        return btn && btn.offsetParent !== null;
      }, { timeout: 10000 });

      // In regular Chrome, in-app fallback should be hidden
      const fallbackDisplay = await page.$eval('#inAppBrowserFallback', el => window.getComputedStyle(el).display);
      assert('In-app fallback is hidden in regular Chrome', fallbackDisplay === 'none');

      // Intercept direct POST navigation to PayU
      let navigatedToPayU = false;
      let payuRequestData = null;
      page.on('request', req => {
        if (req.url().includes('secure.payu.in/_payment')) {
          navigatedToPayU = true;
          payuRequestData = req.postData();
        }
      });

      // Click Unlock button directly (NO intermediate modal!)
      await page.click('#btnUnlockVideo');
      await new Promise(r => setTimeout(r, 2500));

      assert('Clicking Unlock directly initiates PayU checkout (zero extra modal)', navigatedToPayU);
      if (payuRequestData) {
        assert('PayU request includes txnid', payuRequestData.includes('txnid=tx_vid_'));
        assert('PayU request includes valid amount (₹9)', payuRequestData.includes('amount=9.00'));
        assert('PayU request includes success callback surl', payuRequestData.includes('surl='));
        assert('PayU request includes failure callback furl', payuRequestData.includes('furl='));
        assert('PayU request includes SHA-512 cryptographic hash', payuRequestData.includes('hash='));
      }

      await page.close();
    }

    // -------------------------------------------------------------------------
    // TEST SUITE 3: Desktop Viewport Simulation
    // -------------------------------------------------------------------------
    console.log('\n[3/3] Testing Desktop Viewport Direct Checkout...');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      await page.goto(localUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForFunction(() => {
        const btn = document.getElementById('btnUnlockVideo');
        return btn && btn.offsetParent !== null;
      }, { timeout: 10000 });

      const fallbackDisplay = await page.$eval('#inAppBrowserFallback', el => window.getComputedStyle(el).display);
      assert('In-app fallback is hidden on Desktop', fallbackDisplay === 'none');

      let navigatedToPayU = false;
      page.on('request', req => {
        if (req.url().includes('secure.payu.in/_payment')) {
          navigatedToPayU = true;
        }
      });

      await page.click('#btnUnlockVideo');
      await new Promise(r => setTimeout(r, 2000));
      assert('Clicking Unlock on Desktop directly initiates PayU checkout', navigatedToPayU);

      await page.close();
    }

  } catch (err) {
    console.error('Test Execution Error:', err);
    failed++;
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
