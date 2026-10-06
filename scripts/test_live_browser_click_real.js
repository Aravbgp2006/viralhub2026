/**
 * scripts/test_live_browser_click_real.js
 * 
 * Verifies clicking the deployed payment button in a real browser (headless Chrome),
 * intercepts the PayU POST request and response, and confirms arrival on PayU Checkout page.
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;

dns.setServers(['8.8.8.8', '1.1.1.1']);

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const PROD_URL = 'https://viralhub2026-mu.vercel.app/video/41';

async function resolveHostRules() {
  const domains = [
    'viralhub2026-mu.vercel.app',
    'secure.payu.in',
    'api.payu.in',
    'info.payu.in',
    'fonts.googleapis.com',
    'fonts.gstatic.com'
  ];
  const rules = [];
  for (const d of domains) {
    try {
      const ips = await dns.resolve4(d);
      if (ips && ips.length > 0) {
        rules.push(`MAP ${d} ${ips[0]}`);
      }
    } catch (_) {}
  }
  return rules.join(', ');
}

async function runBrowserTest() {
  console.log('======================================================================');
  console.log('REAL BROWSER VERIFICATION: PAYU CHECKOUT BUTTON ON DEPLOYED SITE');
  console.log(`Target: ${PROD_URL}`);
  console.log(`Browser Executable: ${CHROME_PATH}`);
  console.log('======================================================================\n');

  const hostResolverRules = await resolveHostRules();
  console.log(`Custom DNS Host Rules for Chrome: ${hostResolverRules}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    ignoreHTTPSErrors: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      `--host-resolver-rules=${hostResolverRules}`
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const requests = [];
    const responses = [];

    page.on('request', req => {
      const url = req.url();
      if (url.includes('payu') || url.includes('create-order')) {
        console.log(`[Browser Network Request] ${req.method()} ${url}`);
        if (req.method() === 'POST' && url.includes('_payment')) {
          console.log(`  Content-Type: ${req.headers()['content-type']}`);
          console.log(`  POST Data: ${req.postData() ? req.postData().substring(0, 150) + '...' : 'none'}`);
        }
        requests.push({ method: req.method(), url, postData: req.postData() });
      }
    });

    page.on('response', async res => {
      const url = res.url();
      if (url.includes('payu') || url.includes('create-order')) {
        console.log(`[Browser Network Response] HTTP ${res.status()} ${res.statusText()} ${url}`);
        const headers = res.headers();
        if (headers['location']) {
          console.log(`  Redirect Location: ${headers['location']}`);
        }
        responses.push({ status: res.status(), url, headers });
      }
    });

    console.log(`\n1. Navigating to ${PROD_URL}...`);
    await page.goto(PROD_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const title = await page.title();
    console.log(`   Page loaded: "${title}"`);

    // Ensure unlock button is present
    await page.waitForSelector('#btnUnlockVideo', { timeout: 10000 });
    const buttonText = await page.$eval('#btnUnlockVideo', el => el.innerText.trim());
    console.log(`   Found Unlock Button with text: "${buttonText}"`);

    console.log('\n2. Clicking "Unlock for ₹9/month" button (#btnUnlockVideo)...');
    
    // We expect navigation or form submission to PayU
    await Promise.all([
      page.waitForNavigation({ timeout: 25000, waitUntil: 'domcontentloaded' }).catch(err => {
        console.log('   Navigation wait note:', err.message);
        return null;
      }),
      page.$eval('#btnUnlockVideo', el => el.click())
    ]);

    // Give page time to load PayU UI
    await new Promise(r => setTimeout(r, 4000));

    const finalUrl = page.url();
    console.log(`\n3. Final Browser URL: ${finalUrl}`);

    // Verify PayU POST request
    const payuPostReq = requests.find(r => r.url.includes('secure.payu.in/_payment') && r.method === 'POST');
    if (payuPostReq) {
      console.log('   ✅ PayU Form POST request was dispatched by the browser.');
    }

    // Verify PayU Response
    const payuPostRes = responses.find(r => r.url.includes('secure.payu.in/_payment'));
    if (payuPostRes) {
      console.log(`   ✅ PayU Endpoint Response: HTTP ${payuPostRes.status}`);
      if (payuPostRes.status === 403) {
        throw new Error('FAILED: PayU returned HTTP 403 Forbidden!');
      }
    }

    if (finalUrl.includes('payu.in')) {
      console.log('   ✅ Successfully reached PayU Checkout Page!');
      console.log(`   Checkout URL: ${finalUrl}`);
    } else {
      console.error(`   ❌ Final URL is not a PayU domain: ${finalUrl}`);
      throw new Error(`Failed to reach PayU Checkout page. Final URL was ${finalUrl}`);
    }

    // Save screenshot for audit
    const screenshotPath = path.join(__dirname, 'payu_checkout_success.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`   📸 Screenshot saved to: ${screenshotPath}`);

    console.log('\n======================================================================');
    console.log('REAL BROWSER VERIFICATION PASSED: PAYU CHECKOUT REACHED!');
    console.log('======================================================================');
  } finally {
    await browser.close();
  }
}

runBrowserTest().catch(err => {
  console.error('\nBrowser test failed:', err);
  process.exit(1);
});
