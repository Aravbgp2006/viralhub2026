/**
 * scripts/test_prod_entitlements.js
 * Verifies the deployed production Vercel instance live:
 * https://viralhub2026-mu.vercel.app
 */

const https = require('https');
const crypto = require('crypto');

const BASE_URL = 'https://viralhub2026-mu.vercel.app';
let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message) {
  if (condition) {
    totalPassed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    totalFailed++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

function request(method, endpoint, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      headers: { ...headers }
    };

    if (body && typeof body === 'object') {
      body = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = null;
        }

        const rawCookies = res.headers['set-cookie'] || [];
        const cookies = {};
        for (const c of rawCookies) {
          const parts = c.split(';')[0].split('=');
          if (parts[0]) {
            cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
          }
        }

        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          json,
          cookies
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function formatCookieHeader(cookieObj) {
  return Object.entries(cookieObj)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function runProdVerification() {
  console.log(`\n============================================================`);
  console.log(`   RUNNING LIVE PRODUCTION TESTS ON: ${BASE_URL}`);
  console.log(`============================================================\n`);

  // Step 1: Health / Config Check
  console.log(`--- PHASE 1: Config & Metadata ---`);
  const configRes = await request('GET', '/api/entitlements/config');
  assert(configRes.statusCode === 200, 'Config endpoint returns 200');
  assert(configRes.json && configRes.json.price === '₹9', 'Config price is ₹9');
  assert(configRes.json && configRes.json.amount === 900, 'Config amount is 900 paise');

  // Step 2: Establish User A Session
  console.log(`\n--- PHASE 2: Initial Video States for New Visitor ---`);
  const initial41 = await request('GET', '/api/videos/41');
  assert(initial41.statusCode === 200, 'GET /api/videos/41 returns 200');
  const userCookies = { ...initial41.cookies };
  assert(userCookies.vh_uid, `User assigned persistent vh_uid: ${userCookies.vh_uid}`);
  assert(initial41.json.video.is_locked === true, 'Video 41 is initially LOCKED');
  assert(initial41.json.video.video_url === null, 'Protected video_url is null for locked video');

  const initial42 = await request('GET', '/api/videos/42', {
    Cookie: formatCookieHeader(userCookies)
  });
  assert(initial42.json.video.is_locked === true, 'Video 42 is initially LOCKED');

  // Step 3: Stream protection check (403 without entitlement)
  console.log(`\n--- PHASE 3: Stream Protection (403 for locked videos) ---`);
  const stream41Before = await request('GET', '/api/videos/41/stream', {
    Cookie: formatCookieHeader(userCookies)
  });
  assert(stream41Before.statusCode === 403, 'GET /api/videos/41/stream is 403 Forbidden without entitlement');

  // Step 4: Order Creation
  console.log(`\n--- PHASE 4: Order Creation for Video 41 ---`);
  const orderRes = await request('POST', '/api/entitlements/create-order', {
    Cookie: formatCookieHeader(userCookies)
  }, {
    videoId: 41,
    customerEmail: `prodtest_${Date.now()}@example.com`
  });
  assert(orderRes.statusCode === 200, 'Order creation returns 200');
  assert(orderRes.json && orderRes.json.order_id, `Order ID created: ${orderRes.json?.order_id}`);
  assert(orderRes.json.video_id === 41, 'Order corresponds to video_id 41');
  assert(orderRes.json.amount === 900, 'Order amount is 900');

  const orderId = orderRes.json.order_id;

  // Step 5: Test Failed/Forged Verification (TEST 6 from prompt)
  console.log(`\n--- PHASE 5: Test 6 - Fake / Forged Verification Fails ---`);
  const forgedRes = await request('POST', '/api/entitlements/verify', {
    Cookie: formatCookieHeader(userCookies)
  }, {
    videoId: 41,
    razorpay_order_id: orderId,
    razorpay_payment_id: 'pay_fraudulent_123',
    razorpay_signature: 'invalid_forged_signature_xyz'
  });
  assert(forgedRes.statusCode === 400, 'Forged signature rejected with 400 Bad Request');
  assert(forgedRes.json && forgedRes.json.unlocked === false, 'unlocked is false on failed verification');

  // Check Video 41 is still locked
  const video41AfterFraud = await request('GET', '/api/videos/41', {
    Cookie: formatCookieHeader(userCookies)
  });
  assert(video41AfterFraud.json.video.is_locked === true, 'Video 41 remains locked after failed verification');

  // Step 6: Legitimate Verification (TEST 1 & TEST 5)
  console.log(`\n--- PHASE 6: Test 1 - Successful Payment & Verification for Video 41 ---`);
  // If in test mode, the server signs using HMAC or test verifier
  // In mock/test mode without live keys, server accepts mock verification; with live keys, uses HMAC
  const paymentId = `pay_prod_test_${Date.now()}`;
  let signature = 'mock_signature';
  if (configRes.json.is_configured) {
    // If live keys were configured on Vercel, we'd sign with RAZORPAY_KEY_SECRET
  }

  const verifyRes = await request('POST', '/api/entitlements/verify', {
    Cookie: formatCookieHeader(userCookies)
  }, {
    videoId: 41,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    customerEmail: `prodtest_${Date.now()}@example.com`
  });

  assert(verifyRes.statusCode === 200, `Verification returned status ${verifyRes.statusCode}`);
  assert(verifyRes.json && verifyRes.json.unlocked === true, 'Verification returned unlocked: true');
  assert(verifyRes.json.video_id === 41, 'Entitlement unlocked exact video_id 41');
  assert(verifyRes.json.stream_url, `Stream URL provided upon verification: ${verifyRes.json?.stream_url}`);

  if (verifyRes.cookies && verifyRes.cookies.vh_user_token) {
    userCookies.vh_user_token = verifyRes.cookies.vh_user_token;
  }

  // TEST 1 Verification: Video 41 UNLOCKED, Video 42 LOCKED
  console.log(`\n--- PHASE 7: Test 1 & Test 3 - Video 41 Unlocked, Video 42 Locked ---`);
  const check41 = await request('GET', '/api/videos/41', {
    Cookie: formatCookieHeader(userCookies)
  });
  assert(check41.json.video.is_locked === false, 'TEST 1: Video 41 is now UNLOCKED');
  assert(check41.json.is_entitled === true, 'TEST 1: is_entitled is true for Video 41');
  assert(typeof check41.json.video.video_url === 'string' && check41.json.video.video_url.length > 0, 'TEST 1: Video 41 has streamable video_url');

  const check42 = await request('GET', '/api/videos/42', {
    Cookie: formatCookieHeader(userCookies)
  });
  assert(check42.json.video.is_locked === true, 'TEST 1 & 3: Video 42 REMAINS LOCKED');
  assert(check42.json.is_entitled === false, 'TEST 1 & 3: is_entitled is false for Video 42');
  assert(check42.json.video.video_url === null, 'TEST 1 & 3: Video 42 video_url is null');

  // TEST 2: Refresh Video 41
  console.log(`\n--- PHASE 8: Test 2 - Refresh Video 41 ---`);
  const refresh41 = await request('GET', '/api/videos/41', {
    Cookie: formatCookieHeader(userCookies)
  });
  assert(refresh41.json.video.is_locked === false, 'TEST 2: Refreshing Video 41 keeps it UNLOCKED');
  assert(refresh41.json.is_entitled === true, 'TEST 2: Entitlement persists on refresh');

  // TEST 4: User A pays for Video 42
  console.log(`\n--- PHASE 9: Test 4 - User A Pays for Video 42 ---`);
  const order42 = await request('POST', '/api/entitlements/create-order', {
    Cookie: formatCookieHeader(userCookies)
  }, {
    videoId: 42
  });
  assert(order42.statusCode === 200, 'Order created for Video 42');

  const verify42 = await request('POST', '/api/entitlements/verify', {
    Cookie: formatCookieHeader(userCookies)
  }, {
    videoId: 42,
    razorpay_order_id: order42.json.order_id,
    razorpay_payment_id: `pay_prod_42_${Date.now()}`,
    razorpay_signature: 'mock_signature'
  });
  assert(verify42.statusCode === 200, 'Video 42 payment verified');
  assert(verify42.json.unlocked === true, 'Video 42 unlocked: true');

  const check42After = await request('GET', '/api/videos/42', {
    Cookie: formatCookieHeader(userCookies)
  });
  assert(check42After.json.video.is_locked === false, 'TEST 4: Video 42 is now UNLOCKED');

  const check41Still = await request('GET', '/api/videos/41', {
    Cookie: formatCookieHeader(userCookies)
  });
  assert(check41Still.json.video.is_locked === false, 'TEST 4: Video 41 is STILL UNLOCKED after Video 42 purchase');

  // TEST 7: Cross-device / cross-browser session restoration
  console.log(`\n--- PHASE 10: Test 7 - Cross-Device / Another Browser Session ---`);
  // Device B has a new fresh cookie session
  const deviceBInitial = await request('GET', '/api/videos/41');
  const deviceBCookies = { ...deviceBInitial.cookies };
  assert(deviceBCookies.vh_uid !== userCookies.vh_uid, 'Device B has independent session ID');
  assert(deviceBInitial.json.video.is_locked === true, 'Video 41 initially locked on Device B before authentication');

  // Restore access using customer email/token
  const restoreRes = await request('POST', '/api/entitlements/restore', {
    Cookie: formatCookieHeader(deviceBCookies)
  }, {
    userToken: userCookies.vh_user_token
  });
  assert(restoreRes.statusCode === 200, 'Access restored on Device B using secure token');
  assert(restoreRes.json.restored === true, 'Restored status is true');
  assert(restoreRes.json.entitlement_count >= 2, `Restored ${restoreRes.json?.entitlement_count} video entitlements to Device B`);

  if (restoreRes.cookies && restoreRes.cookies.vh_user_token) {
    deviceBCookies.vh_user_token = restoreRes.cookies.vh_user_token;
  }

  // Verify Video 41 and Video 42 are now unlocked on Device B!
  const deviceBCheck41 = await request('GET', '/api/videos/41', {
    Cookie: formatCookieHeader(deviceBCookies)
  });
  assert(deviceBCheck41.json.video.is_locked === false, 'TEST 7: Video 41 is UNLOCKED on Device B');

  const deviceBCheck42 = await request('GET', '/api/videos/42', {
    Cookie: formatCookieHeader(deviceBCookies)
  });
  assert(deviceBCheck42.json.video.is_locked === false, 'TEST 7: Video 42 is UNLOCKED on Device B');

  // Video 40 was never purchased, should be locked on both devices
  const deviceBCheck40 = await request('GET', '/api/videos/40', {
    Cookie: formatCookieHeader(deviceBCookies)
  });
  assert(deviceBCheck40.json.video.is_locked === true, 'TEST 7: Unpurchased Video 40 remains LOCKED on Device B');

  console.log(`\n============================================================`);
  console.log(`   LIVE PRODUCTION TEST SUMMARY`);
  console.log(`   TOTAL PASSED: ${totalPassed}`);
  console.log(`   TOTAL FAILED: ${totalFailed}`);
  console.log(`============================================================\n`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runProdVerification().catch(err => {
  console.error('Fatal test error on production:', err);
  process.exit(1);
});
