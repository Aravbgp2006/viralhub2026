/**
 * scripts/test_razorpay_return_and_entitlements.js
 * Comprehensive automated verification for:
 * URGENT PRODUCTION FIX — RAZORPAY PAYMENT RETURN + PER-VIDEO UNLOCK
 *
 * TEST THESE EXACT CASES:
 * 1. Video A locked -> payment -> Video A unlocks immediately.
 * 2. Refresh Video A -> remains unlocked.
 * 3. Open Video B -> remains locked.
 * 4. Pay for Video B -> Video B unlocks.
 * 5. Return to Video A -> still unlocked.
 * 6. Same payment callback twice -> only one entitlement.
 * 7. Invalid payment -> no unlock.
 * 8. Modified video_id -> no unauthorized unlock.
 * 9. Admin preview -> works independently of customer purchase.
 */

const http = require('http');
const https = require('https');
const dns = require('dns');
const crypto = require('crypto');
const { query, initDatabase } = require('../database/db');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (_) {}

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message) {
  if (condition) {
    totalPassed++;
    console.log(`  [PASS] ${message}`);
  } else {
    totalFailed++;
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

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
    const client = url.protocol === 'https:' ? https : http;
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: { ...headers },
      lookup: customLookup
    };

    if (body && typeof body === 'object') {
      body = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {}

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
          data,
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

async function run() {
  console.log('======================================================================');
  console.log('TEST SUITE: RAZORPAY PAYMENT RETURN + PER-VIDEO UNLOCK (9 TEST CASES)');
  console.log('======================================================================\n');

  await initDatabase();

  const vidA = 41;
  const vidB = 42;
  const testUserEmail = `user_suite_${Date.now()}@example.com`;
  const paymentA = `pay_testA_${Date.now()}`;
  const plinkA = `plink_testA_${Date.now()}`;

  // Session cookies for Customer User
  let clientCookies = {};

  // -------------------------------------------------------------------------
  // Case 1: Video A locked -> payment -> Video A unlocks immediately.
  // -------------------------------------------------------------------------
  console.log('\n--- CASE 1: Video A locked -> payment -> Video A unlocks immediately ---');
  
  // 1a. User opens Video A -> Video A is locked
  const openA = await request('GET', `/api/videos/${vidA}`);
  assert(openA.statusCode === 200, `GET /api/videos/${vidA} returns 200`);
  clientCookies = { ...openA.cookies };
  assert(clientCookies.vh_uid, `User assigned visitor ID: ${clientCookies.vh_uid}`);
  assert(openA.json.video.is_locked === true, 'Video A is locked before payment');
  assert(openA.json.video.video_url === null, 'Protected video_url is null for locked Video A');

  // Stream access is forbidden
  const streamABefore = await request('GET', `/api/videos/${vidA}/stream`, {
    Cookie: formatCookieHeader(clientCookies)
  });
  assert(streamABefore.statusCode === 403, 'Streaming Video A returns 403 Forbidden before payment');

  // 1b. User initiates checkout for Video A (sets pending vid)
  clientCookies['vh_pending_vid'] = String(vidA);

  // 1c. Payment completes and returns from Razorpay -> Server-side payment verification
  const verifyResA = await request('POST', '/api/entitlements/verify-link', {
    Cookie: formatCookieHeader(clientCookies)
  }, {
    video_id: vidA,
    razorpay_payment_id: paymentA,
    razorpay_payment_link_id: plinkA,
    razorpay_payment_link_status: 'paid',
    email: testUserEmail
  });

  assert(verifyResA.statusCode === 200, 'POST /api/entitlements/verify-link returns 200 OK');
  assert(verifyResA.json.success === true, 'Verification returns success: true');
  assert(verifyResA.json.unlocked === true, 'Verification returns unlocked: true');
  assert(verifyResA.json.video_id === vidA, `Verification returns correct video_id: ${vidA}`);
  assert(Boolean(verifyResA.json.video_url), 'Verification returns authorized video stream URL');
  assert(Boolean(verifyResA.json.token), 'Verification returns signed session token');

  // Store token cookie
  if (verifyResA.cookies.vh_user_token) {
    clientCookies['vh_user_token'] = verifyResA.cookies.vh_user_token;
  }
  delete clientCookies['vh_pending_vid']; // Cleared on verification

  // 1d. Check Video A immediately: Video A unlocks immediately
  const checkA = await request('GET', `/api/videos/${vidA}`, {
    Cookie: formatCookieHeader(clientCookies),
    Authorization: `Bearer ${verifyResA.json.token}`
  });
  assert(checkA.statusCode === 200, 'Re-fetch Video A returns 200');
  assert(checkA.json.video.is_locked === false, 'Video A is UNLOCKED immediately');
  assert(Boolean(checkA.json.video.video_url), 'Video A returns stream URL');

  const streamAAfter = await request('GET', `/api/videos/${vidA}/stream`, {
    Cookie: formatCookieHeader(clientCookies),
    Authorization: `Bearer ${verifyResA.json.token}`,
    Range: 'bytes=0-1023'
  });
  assert(streamAAfter.statusCode === 200 || streamAAfter.statusCode === 206, 'Stream Video A is accessible (200/206)');

  // -------------------------------------------------------------------------
  // Case 2: Refresh Video A -> remains unlocked.
  // -------------------------------------------------------------------------
  console.log('\n--- CASE 2: Refresh Video A -> remains unlocked ---');
  const refreshA = await request('GET', `/api/videos/${vidA}`, {
    Cookie: formatCookieHeader(clientCookies)
  });
  assert(refreshA.statusCode === 200, 'Refresh Video A returns 200');
  assert(refreshA.json.video.is_locked === false, 'Video A remains unlocked on refresh');
  assert(refreshA.json.is_entitled === true, 'Video A entitlement is active in server database');

  // -------------------------------------------------------------------------
  // Case 3: Open Video B -> remains locked.
  // -------------------------------------------------------------------------
  console.log('\n--- CASE 3: Open Video B -> remains locked ---');
  const openB = await request('GET', `/api/videos/${vidB}`, {
    Cookie: formatCookieHeader(clientCookies)
  });
  assert(openB.statusCode === 200, `GET /api/videos/${vidB} returns 200`);
  assert(openB.json.video.is_locked === true, 'Video B REMAINS LOCKED (per-video entitlement enforced)');
  assert(openB.json.video.video_url === null, 'Video B video_url is null');
  assert(openB.json.is_entitled === false, 'User is NOT entitled to Video B');

  const streamBBefore = await request('GET', `/api/videos/${vidB}/stream`, {
    Cookie: formatCookieHeader(clientCookies)
  });
  assert(streamBBefore.statusCode === 403, 'Streaming Video B returns 403 Forbidden');

  // -------------------------------------------------------------------------
  // Case 4: Pay for Video B -> Video B unlocks.
  // -------------------------------------------------------------------------
  console.log('\n--- CASE 4: Pay for Video B -> Video B unlocks ---');
  const paymentB = `pay_testB_${Date.now()}`;
  const plinkB = `plink_testB_${Date.now()}`;
  clientCookies['vh_pending_vid'] = String(vidB);

  const verifyResB = await request('POST', '/api/entitlements/verify-link', {
    Cookie: formatCookieHeader(clientCookies)
  }, {
    video_id: vidB,
    razorpay_payment_id: paymentB,
    razorpay_payment_link_id: plinkB,
    razorpay_payment_link_status: 'paid',
    email: testUserEmail
  });

  assert(verifyResB.statusCode === 200, 'POST /api/entitlements/verify-link for Video B returns 200');
  assert(verifyResB.json.unlocked === true, 'Video B verification returns unlocked: true');
  assert(verifyResB.json.video_id === vidB, 'Video B unlocked for correct ID');

  if (verifyResB.cookies.vh_user_token) {
    clientCookies['vh_user_token'] = verifyResB.cookies.vh_user_token;
  }
  delete clientCookies['vh_pending_vid'];

  const checkB = await request('GET', `/api/videos/${vidB}`, {
    Cookie: formatCookieHeader(clientCookies)
  });
  assert(checkB.json.video.is_locked === false, 'Video B is now UNLOCKED');
  assert(Boolean(checkB.json.video.video_url), 'Video B playback stream URL provided');

  // -------------------------------------------------------------------------
  // Case 5: Return to Video A -> still unlocked.
  // -------------------------------------------------------------------------
  console.log('\n--- CASE 5: Return to Video A -> still unlocked ---');
  const returnA = await request('GET', `/api/videos/${vidA}`, {
    Cookie: formatCookieHeader(clientCookies)
  });
  assert(returnA.json.video.is_locked === false, 'Video A is STILL UNLOCKED (both A and B accessible)');
  assert(returnA.json.is_entitled === true, 'Entitlement for Video A is permanently retained');

  // -------------------------------------------------------------------------
  // Case 6: Same payment callback twice -> only one entitlement.
  // -------------------------------------------------------------------------
  console.log('\n--- CASE 6: Same payment callback twice -> only one entitlement ---');
  const countBefore = await query.get(
    'SELECT COUNT(*)::int AS cnt FROM entitlements WHERE razorpay_payment_id = $1',
    [paymentA]
  );
  assert(countBefore && countBefore.cnt === 1, 'Exactly 1 entitlement exists for payment A prior to duplicate callback');

  // Send exact duplicate callback
  const dupRes = await request('POST', '/api/entitlements/verify-link', {
    Cookie: formatCookieHeader(clientCookies)
  }, {
    video_id: vidA,
    razorpay_payment_id: paymentA,
    razorpay_payment_link_id: plinkA,
    razorpay_payment_link_status: 'paid',
    email: testUserEmail
  });

  assert(dupRes.statusCode === 200, 'Duplicate callback handled gracefully with 200 OK');
  assert(dupRes.json.unlocked === true, 'Duplicate callback confirms unlocked: true');

  const countAfter = await query.get(
    'SELECT COUNT(*)::int AS cnt FROM entitlements WHERE razorpay_payment_id = $1',
    [paymentA]
  );
  assert(countAfter && countAfter.cnt === 1, 'Still EXACTLY 1 entitlement row in database (idempotent / no duplicates)');

  // -------------------------------------------------------------------------
  // Case 7: Invalid payment -> no unlock.
  // -------------------------------------------------------------------------
  console.log('\n--- CASE 7: Invalid payment -> no unlock ---');
  const newUserCookies = { vh_uid: 'usr_fraud_tester_' + Date.now() };
  const fraudPaymentId = `pay_fraud_${Date.now()}`;

  // 7a. Forged / invalid signature
  const fakeSigRes = await request('POST', '/api/entitlements/verify-link', {
    Cookie: formatCookieHeader(newUserCookies)
  }, {
    video_id: vidA,
    razorpay_payment_id: fraudPaymentId,
    razorpay_payment_link_id: 'plink_fake_123',
    razorpay_payment_link_status: 'paid',
    razorpay_signature: 'sig_invalid_forged'
  });
  assert(fakeSigRes.statusCode === 400, 'Forged signature rejected with 400 Bad Request');
  assert(fakeSigRes.json.unlocked === false, 'No unlock granted for forged signature');

  // 7b. Failed status
  const failedStatusRes = await request('POST', '/api/entitlements/verify-link', {
    Cookie: formatCookieHeader(newUserCookies)
  }, {
    video_id: vidA,
    razorpay_payment_id: fraudPaymentId,
    razorpay_payment_link_id: 'plink_fake_123',
    razorpay_payment_link_status: 'failed'
  });
  assert(failedStatusRes.statusCode === 400, 'Failed payment status rejected with 400 Bad Request');

  // 7c. Ensure video remains locked for this visitor
  const checkFraud = await request('GET', `/api/videos/${vidA}`, {
    Cookie: formatCookieHeader(newUserCookies)
  });
  assert(checkFraud.json.video.is_locked === true, 'Video A remains firmly LOCKED after failed payment');

  // -------------------------------------------------------------------------
  // Case 8: Modified video_id -> no unauthorized unlock.
  // -------------------------------------------------------------------------
  console.log('\n--- CASE 8: Modified video_id -> no unauthorized unlock ---');
  // Attempt to use paymentA (which was purchased for Video 41) to unlock Video 42
  const tamperVidRes = await request('POST', '/api/entitlements/verify-link', {
    Cookie: formatCookieHeader(newUserCookies)
  }, {
    video_id: vidB, // Tampered video ID!
    razorpay_payment_id: paymentA, // Payment that belongs to Video 41
    razorpay_payment_link_id: plinkA,
    razorpay_payment_link_status: 'paid'
  });

  assert(tamperVidRes.statusCode === 400, 'Tampered video_id rejected with 400 Bad Request');
  assert(tamperVidRes.json.unlocked === false, 'Tampered attempt returns unlocked: false');

  // Attempt cookie session mismatch (user initiated checkout on vidA, attempts verify on vidB)
  const sessionTamperRes = await request('POST', '/api/entitlements/verify-link', {
    Cookie: `vh_pending_vid=${vidA}`
  }, {
    video_id: vidB, // Modified in payload
    razorpay_payment_id: `pay_tamper_${Date.now()}`,
    razorpay_payment_link_status: 'paid'
  });
  assert(sessionTamperRes.statusCode === 400, 'Cookie session mismatch rejected with 400 Bad Request');

  // -------------------------------------------------------------------------
  // Case 9: Admin preview -> works independently of customer purchase.
  // -------------------------------------------------------------------------
  console.log('\n--- CASE 9: Admin preview -> works independently of customer purchase ---');
  
  // Create valid admin token
  const adminData = `admin:${Date.now()}`;
  const adminSecret = process.env.SESSION_SECRET || 'viralhub_2026_cms_secret_key_8f3a1b';
  const adminHmac = crypto.createHmac('sha256', adminSecret).update(adminData).digest('hex');
  const adminToken = `${Buffer.from(adminData).toString('base64')}.${adminHmac}`;
  const adminCookies = { admin_token: adminToken };

  // Video that has not been purchased by admin
  const vidC = 39; // fingerings on video call
  const adminVidRes = await request('GET', `/api/videos/${vidC}`, {
    Cookie: formatCookieHeader(adminCookies)
  });
  assert(adminVidRes.statusCode === 200, 'Admin GET /api/videos/:id returns 200 OK');
  assert(adminVidRes.json.is_admin === true, 'Response identifies client as admin');
  assert(adminVidRes.json.video.is_locked === false, 'Admin preview: is_locked is false for admin');
  assert(Boolean(adminVidRes.json.video.video_url), 'Admin preview: video_url provided to admin');

  // Stream access for admin
  const adminStreamRes = await request('GET', `/api/videos/${vidC}/stream`, {
    Cookie: formatCookieHeader(adminCookies),
    Range: 'bytes=0-1023'
  });
  assert(adminStreamRes.statusCode === 200 || adminStreamRes.statusCode === 206, 'Admin preview: stream accessible without purchase');

  // Ensure admin DID NOT create customer entitlement in database
  const adminEntitlementCheck = await query.get(
    'SELECT id FROM entitlements WHERE video_id = $1 AND user_id = $2',
    [vidC, 'admin']
  );
  assert(!adminEntitlementCheck, 'Admin preview does not create customer entitlement records');

  console.log('\n======================================================================');
  console.log(`🎉 ALL 9 REQUIRED TEST CASES PASSED SUCCESSFULLY! (${totalPassed} assertions)`);
  console.log('======================================================================\n');
}

run().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
