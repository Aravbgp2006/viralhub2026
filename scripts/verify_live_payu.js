/**
 * scripts/verify_live_payu.js
 * Verification of LIVE Vercel production deployment for PayU Production Payment Integration
 */

const https = require('https');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}

const BASE_URL = 'https://viralhub2026-mu.vercel.app';

const customLookup = (hostname, opts, cb) => {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }
  dns.resolve4(hostname, (err, addrs) => {
    if (err || !addrs || addrs.length === 0) return dns.lookup(hostname, opts, cb);
    if (opts && opts.all) {
      cb(null, addrs.map(a => ({ address: a, family: 4 })));
    } else {
      cb(null, addrs[0], 4);
    }
  });
};

function request(method, endpoint, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      headers: { ...headers },
      lookup: customLookup
    };

    let postData = null;
    if (body) {
      if (typeof body === 'object') {
        postData = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      } else {
        postData = String(body);
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function verifyLivePayU() {
  console.log('======================================================================');
  console.log(`VERIFYING LIVE PRODUCTION PAYU INTEGRATION AT: ${BASE_URL}`);
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  // 1. Fetch live HTML of Video 41
  console.log('--- 1. Live Video Page UI & Security ---');
  const htmlRes = await request('GET', '/video/41');
  const html = htmlRes.data;

  assert('Video Locked header present', html.includes('Video Locked'));
  assert('Unlock Premium Access subtitle present', html.includes('Unlock Premium Access'));
  assert('₹9/month pricing tag present', html.includes('₹9') && html.includes('/month'));
  assert('Unlock for ₹9/month button present', html.includes('Unlock for ₹9/month'));
  assert('Cashfree SDK removed from production video page', !html.includes('https://sdk.cashfree.com/js/v3/cashfree.js'));
  assert('PayU Production endpoint referenced', html.includes('https://secure.payu.in/_payment'));
  assert('PAYU_SALT is NEVER in HTML source', !html.includes('lRaimQ1M70k662mAFCLwQBkZTXFO98X1'));
  assert('PAYU_CLIENT_SECRET is NEVER in HTML source', !html.includes('25f7bc65786ad0a1cb8c5e75b690c086aa184af3e6d2f628dd273953e6f9a378'));

  // 2. Fetch Live Entitlement Config
  console.log('\n--- 2. Live /api/entitlements/config ---');
  const cfgRes = await request('GET', '/api/entitlements/config');
  assert('Config endpoint returns HTTP 200', cfgRes.statusCode === 200);
  const cfg = cfgRes.json;
  assert('Provider is payu', cfg.provider === 'payu');
  assert('PayU is configured (is_configured: true)', cfg.is_configured === true);
  assert('Environment is production', cfg.environment === 'production');
  assert('Payment URL is https://secure.payu.in/_payment', cfg.payment_url === 'https://secure.payu.in/_payment');
  assert('Price is ₹9', cfg.price === '₹9');
  assert('Amount is 900 paise', cfg.amount === 900);

  // 3. Create Live PayU Order
  console.log('\n--- 3. Live POST /api/entitlements/create-order ---');
  const orderRes = await request('POST', '/api/entitlements/create-order', {}, {
    video_id: 41,
    email: 'live_test_' + Date.now() + '@viralhub.com',
    phone: '+919876543210'
  });
  assert('Create order returns HTTP 200', orderRes.statusCode === 200);
  const orderData = orderRes.json;
  assert('Order response provider is payu', orderData.provider === 'payu');
  assert('Action URL is https://secure.payu.in/_payment', orderData.action === 'https://secure.payu.in/_payment');
  assert('Order ID / txnid created', Boolean(orderData.order_id && orderData.txnid));
  assert('PayU params contain key and txnid', Boolean(orderData.params?.key && orderData.params?.txnid));
  assert('PayU params contain SHA-512 request hash', Boolean(orderData.params?.hash && orderData.params.hash.length === 128));
  assert('PayU params contain success callback surl', Boolean(orderData.params?.surl?.includes('/api/payment/payu/success')));
  assert('PayU params contain failure callback furl', Boolean(orderData.params?.furl?.includes('/api/payment/payu/failure')));

  // 4. Live PayU Production POST Checkout Execution
  console.log('\n--- 4. Live PayU Production POST Submission ---');
  const formPayload = new URLSearchParams(orderData.params).toString();
  const payuResponse = await fetch(orderData.action, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: formPayload,
    redirect: 'manual'
  });

  const payuStatus = payuResponse.status;
  const payuLocation = payuResponse.headers.get('location') || '';
  console.log(`  PayU Production Endpoint: ${orderData.action}`);
  console.log(`  PayU HTTP Method: POST`);
  console.log(`  PayU HTTP Status: ${payuStatus} ${payuResponse.statusText}`);
  console.log(`  PayU Location: ${payuLocation}`);

  assert('PayU Production did NOT return HTTP 403 Forbidden', payuStatus !== 403);
  assert('PayU Production returned HTTP 302 redirect', payuStatus === 302);
  assert('PayU redirect targets PayU checkout page (api.payu.in/public/#/...)', payuLocation.includes('payu.in'));

  // 5. Verification without valid payment fails
  console.log('\n--- 5. Live POST /api/entitlements/verify (Anti-fraud Protection) ---');
  const verifyRes = await request('POST', '/api/entitlements/verify', {}, {
    video_id: 41,
    txnid: orderData.txnid
  });
  assert('Uncompleted / unpaid transaction rejected with 400 Bad Request', verifyRes.statusCode === 400);
  const verifyData = verifyRes.json;
  assert('unlocked is false on failed verification', verifyData?.unlocked === false);

  // 6. Video State Integrity
  console.log('\n--- 6. Video State Integrity ---');
  const v41Res = await request('GET', '/api/videos/41');
  const v41 = v41Res.json;
  assert('Unpurchased visitor receives is_locked: true', v41?.video?.is_locked === true);
  assert('Protected video_url is null for unpurchased visitor', v41?.video?.video_url === null);

  console.log('\n======================================================================');
  console.log(`LIVE PRODUCTION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

verifyLivePayU().catch(err => {
  console.error('Live verification failed:', err);
  process.exit(1);
});
