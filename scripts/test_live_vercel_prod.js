/**
 * scripts/test_live_vercel_prod.js
 * 
 * Runs end-to-end browser tests directly against the LIVE production site:
 * https://viralhub2026-mu.vercel.app/video/92
 */

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const puppeteer = require('puppeteer-core');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const LIVE_URL = 'https://viralhub2026-mu.vercel.app/video/92';

const UA_INSTAGRAM_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.90 Mobile Safari/537.36 Instagram 316.0.0.38.109 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 7; cheetah; cheetah; en_US; 565012345)';
const UA_CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.90 Mobile Safari/537.36';

let passed = 0;
let failed = 0;

function assert(desc, condition, details = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${desc}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${desc} ${details ? '(' + details + ')' : ''}`);
  }
}

async function runLiveTests() {
  console.log('======================================================================');
  console.log('TESTING LIVE PRODUCTION DEPLOYMENT AT:');
  console.log(LIVE_URL);
  console.log('======================================================================');

  const domains = ['viralhub2026-mu.vercel.app', 'secure.payu.in', 'api.payu.in', 'static.payu.in', 'web-assets.payu.in'];
  const rules = [];
  for (const d of domains) {
    try {
      const ips = await dns.promises.resolve4(d);
      if (ips && ips.length > 0) rules.push(`MAP ${d} ${ips[0]}`);
    } catch (_) {}
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', rules.length > 0 ? `--host-resolver-rules=${rules.join(', ')}` : '']
  });

  try {
    // 1. Instagram In-App Browser Simulation on Live Production
    console.log('\n[1/3] Live Instagram In-App Browser (Android UA)...');
    {
      const page = await browser.newPage();
      await page.setUserAgent(UA_INSTAGRAM_ANDROID);
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

      await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForSelector('#playerWrapper', { timeout: 10000 });

      // Verify intrusive banner is gone
      const topBanner = await page.$('#inAppBrowserBanner');
      assert('Live: Intrusive top banner is removed', !topBanner);

      await page.waitForFunction(() => {
        const btn = document.getElementById('btnUnlockVideo');
        return btn && btn.offsetParent !== null;
      }, { timeout: 15000 });

      // Verify discrete lock screen fallback
      const fallbackDisplay = await page.$eval('#inAppBrowserFallback', el => window.getComputedStyle(el).display);
      assert('Live: Lock screen in-app fallback is visible', fallbackDisplay !== 'none');

      const chromeIntentHref = await page.$eval('#btnFallbackOpenChrome', el => el.getAttribute('href') || el.href);
      assert('Live: Open in Chrome has valid Android intent URI', chromeIntentHref.startsWith('intent://') && chromeIntentHref.includes('package=com.android.chrome'));

      const copyBtn = await page.$('#btnFallbackCopyLink');
      assert('Live: Copy Link fallback button is present on lock screen', Boolean(copyBtn));

      const modal = await page.$('#checkoutModal');
      assert('Live: Separate checkout modal has been completely removed', !modal);

      await page.close();
    }

    // 2. Standard Android Chrome Simulation on Live Production
    console.log('\n[2/3] Live Standard Android Chrome (Direct 1-Click PayU Initiation)...');
    {
      const page = await browser.newPage();
      await page.setUserAgent(UA_CHROME_ANDROID);
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

      await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForFunction(() => {
        const btn = document.getElementById('btnUnlockVideo');
        return btn && btn.offsetParent !== null;
      }, { timeout: 15000 });

      const fallbackDisplay = await page.$eval('#inAppBrowserFallback', el => window.getComputedStyle(el).display);
      assert('Live: In-app fallback is hidden in regular Chrome', fallbackDisplay === 'none');

      let navigatedToPayU = false;
      page.on('request', req => {
        if (req.url().includes('secure.payu.in/_payment')) {
          navigatedToPayU = true;
        }
      });

      await page.click('#btnUnlockVideo');
      await new Promise(r => setTimeout(r, 2500));
      assert('Live: Clicking Unlock directly initiates PayU checkout (zero extra modal)', navigatedToPayU);

      await page.close();
    }

    // 3. Desktop Viewport Simulation on Live Production
    console.log('\n[3/3] Live Desktop Viewport Direct Checkout...');
    {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });

      await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForFunction(() => {
        const btn = document.getElementById('btnUnlockVideo');
        return btn && btn.offsetParent !== null;
      }, { timeout: 15000 });

      const fallbackDisplay = await page.$eval('#inAppBrowserFallback', el => window.getComputedStyle(el).display);
      assert('Live: In-app fallback is hidden on Desktop', fallbackDisplay === 'none');

      let navigatedToPayU = false;
      page.on('request', req => {
        if (req.url().includes('secure.payu.in/_payment')) {
          navigatedToPayU = true;
        }
      });

      await page.click('#btnUnlockVideo');
      await new Promise(r => setTimeout(r, 2000));
      assert('Live: Clicking Unlock on Desktop directly initiates PayU checkout', navigatedToPayU);

      await page.close();
    }

  } catch (err) {
    console.error('Live Test Error:', err);
    failed++;
  } finally {
    await browser.close();
  }

  console.log('\n======================================================================');
  console.log(`LIVE PRODUCTION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runLiveTests();
