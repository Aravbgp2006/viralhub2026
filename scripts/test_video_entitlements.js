/**
 * scripts/test_video_entitlements.js
 * Comprehensive automated verification for Video-Specific Entitlement System
 *
 * Verifies all 7 tests from user prompt:
 * TEST 1: User A pays for Video 41 -> Video 41 = UNLOCKED, Video 42 = LOCKED
 * TEST 2: Refresh Video 41 -> Video 41 = still UNLOCKED
 * TEST 3: Open Video 42 -> Video 42 = LOCKED
 * TEST 4: User A pays for Video 42 -> Video 42 = UNLOCKED, Video 41 = still UNLOCKED
 * TEST 5: Payment cancelled/failed -> Video remains LOCKED
 * TEST 6: Payment UI says success but server verification fails -> Video remains LOCKED
 * TEST 7: Open the same video from another browser/device while logged into the same account -> Server entitlement determines access
 */

require('dotenv').config();
const http = require('http');
const { query, initDatabase } = require('../database/db');
const app = require('../server');

let server;
const PORT = 3456;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function request(method, endpoint, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { ...headers }
    };

    if (body && typeof body === 'object') {
      body = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
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
    if (body) req.write(body);
    req.end();
  });
}

function extractCookie(headers, cookieName) {
  const setCookies = headers['set-cookie'];
  if (!setCookies) return null;
  const list = Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const c of list) {
    if (c.includes(`${cookieName}=`)) {
      return c.split(';')[0];
    }
  }
  return null;
}

async function runSuite() {
  console.log('======================================================================');
  console.log('VIRALHUB VIDEO-SPECIFIC PAYMENT & ENTITLEMENT AUTOMATED TEST SUITE');
  console.log('======================================================================\n');

  await initDatabase();

  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed++;
    }
  }

  // Start local HTTP server for testing
  await new Promise((resolve) => {
    server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`🚀 Test server listening on http://127.0.0.1:${PORT}\n`);
      resolve();
    });
  });

  try {
    // 0. Locate test videos (Video 41 and Video 42)
    const videos = await query.all('SELECT id, title, published FROM videos ORDER BY id DESC LIMIT 10');
    console.log(`Found ${videos.length} videos in database.`);
    
    // Find video 41 and 42 or pick top two
    let vid41 = 41;
    let vid42 = 42;
    const has41 = videos.some(v => v.id === 41);
    const has42 = videos.some(v => v.id === 42);

    if (!has41 || !has42) {
      if (videos.length >= 2) {
        vid41 = videos[1].id;
        vid42 = videos[0].id;
      }
    }

    console.log(`Testing with Video A (ID: ${vid41}) and Video B (ID: ${vid42})\n`);

    const userEmail = `usera_${Date.now()}@example.com`;
    let userCookies = '';

    // Clean any pre-existing test entitlements for this email
    await query.run('DELETE FROM entitlements WHERE customer_email = $1', [userEmail]);

    // ----------------------------------------------------------------------
    // INITIAL STATE: Both videos must be locked for visitor
    // ----------------------------------------------------------------------
    console.log('--- Pre-condition: Initial locked state check ---');
    const initVid41Res = await request('GET', `/api/videos/${vid41}`);
    assert(`GET /api/videos/${vid41} returns HTTP 200`, initVid41Res.statusCode === 200);
    assert(`Video ${vid41} is initially LOCKED (is_locked: true)`, initVid41Res.json.video.is_locked === true);
    assert(`Video ${vid41} video_url is null when locked`, initVid41Res.json.video.video_url === null);

    const initVid42Res = await request('GET', `/api/videos/${vid42}`);
    assert(`GET /api/videos/${vid42} returns HTTP 200`, initVid42Res.statusCode === 200);
    assert(`Video ${vid42} is initially LOCKED (is_locked: true)`, initVid42Res.json.video.is_locked === true);
    assert(`Video ${vid42} video_url is null when locked`, initVid42Res.json.video.video_url === null);

    // Initial stream attempt: HTTP 403 Forbidden
    const unauthStream = await request('GET', `/api/videos/${vid41}/stream`);
    assert(`Stream /api/videos/${vid41}/stream without entitlement returns 403 Forbidden`, unauthStream.statusCode === 403);
    assert('403 response contains locked: true', unauthStream.json?.locked === true);

    // ----------------------------------------------------------------------
    // TEST 1: User A pays for Video 41
    // Expected: Video 41 = UNLOCKED, Video 42 = LOCKED
    // ----------------------------------------------------------------------
    console.log(`\n--- TEST 1: User A pays for Video ${vid41} ---`);
    // 1a. Create Order
    const orderRes = await request('POST', '/api/entitlements/create-order', {}, {
      video_id: vid41,
      email: userEmail,
      phone: '+919876543210'
    });
    assert(`POST /api/entitlements/create-order for Video ${vid41} returns 200`, orderRes.statusCode === 200);
    assert('Order response contains order_id', Boolean(orderRes.json.order_id));
    assert(`Order response belongs to video_id: ${vid41}`, orderRes.json.video_id === vid41);

    const orderId = orderRes.json.order_id;
    const paymentId = `pay_test_${vid41}_${Date.now()}`;

    // 1b. Server-Side Verification
    const verifyRes = await request('POST', '/api/entitlements/verify', {}, {
      video_id: vid41,
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      razorpay_signature: 'sig_test_valid',
      email: userEmail,
      phone: '+919876543210'
    });
    assert('POST /api/entitlements/verify returns 200 OK', verifyRes.statusCode === 200);
    assert('Verification success is true', verifyRes.json.success === true);
    assert(`Entitlement created for exact video_id: ${vid41}`, verifyRes.json.entitlement?.video_id === vid41);
    assert('Verification returns stream URL', verifyRes.json.video_url === `/api/videos/${vid41}/stream`);

    // Capture user session cookie
    const userTokenCookie = extractCookie(verifyRes.headers, 'vh_user_token');
    const uidCookie = extractCookie(verifyRes.headers, 'vh_uid');
    assert('Server sets HTTP-only vh_user_token cookie', Boolean(userTokenCookie));
    userCookies = [userTokenCookie, uidCookie].filter(Boolean).join('; ');

    // 1c. Check Video 41 state
    const vid41AfterPay = await request('GET', `/api/videos/${vid41}`, { 'Cookie': userCookies });
    assert(`Video ${vid41} is now UNLOCKED (is_locked: false)`, vid41AfterPay.json.video.is_locked === false);
    assert(`Video ${vid41} returns playable stream URL`, vid41AfterPay.json.video.video_url === `/api/videos/${vid41}/stream`);

    // 1d. Check Video 42 state: MUST REMAIN LOCKED!
    const vid42AfterPay = await request('GET', `/api/videos/${vid42}`, { 'Cookie': userCookies });
    assert(`Video ${vid42} remains LOCKED (is_locked: true)`, vid42AfterPay.json.video.is_locked === true);
    assert(`Video ${vid42} video_url is NULL`, vid42AfterPay.json.video.video_url === null);

    // 1e. Stream Video 41 authorized
    const stream41Auth = await request('GET', `/api/videos/${vid41}/stream`, { 'Cookie': userCookies });
    assert(`Streaming Video ${vid41} returns HTTP 200 (Authorized)`, stream41Auth.statusCode === 200 || stream41Auth.statusCode === 206);

    // 1f. Stream Video 42 unauthorized -> 403 Forbidden
    const stream42Forbidden = await request('GET', `/api/videos/${vid42}/stream`, { 'Cookie': userCookies });
    assert(`Streaming Video ${vid42} returns HTTP 403 Forbidden`, stream42Forbidden.statusCode === 403);

    // ----------------------------------------------------------------------
    // TEST 2: Refresh Video 41
    // Expected: Video 41 = still UNLOCKED
    // ----------------------------------------------------------------------
    console.log(`\n--- TEST 2: Refresh Video ${vid41} ---`);
    const vid41Refreshed = await request('GET', `/api/videos/${vid41}`, { 'Cookie': userCookies });
    assert(`Page refresh: Video ${vid41} remains UNLOCKED (is_locked: false)`, vid41Refreshed.json.video.is_locked === false);
    assert(`Page refresh: Video ${vid41} stream URL available`, Boolean(vid41Refreshed.json.video.video_url));

    const check41Api = await request('GET', `/api/entitlements/check/${vid41}`, { 'Cookie': userCookies });
    assert(`GET /api/entitlements/check/${vid41} reports is_entitled: true`, check41Api.json.is_entitled === true);

    // ----------------------------------------------------------------------
    // TEST 3: Open Video 42
    // Expected: Video 42 = LOCKED
    // ----------------------------------------------------------------------
    console.log(`\n--- TEST 3: Open Video ${vid42} ---`);
    const vid42Check = await request('GET', `/api/videos/${vid42}`, { 'Cookie': userCookies });
    assert(`Opening Video ${vid42}: is_locked is TRUE`, vid42Check.json.video.is_locked === true);
    assert(`Opening Video ${vid42}: video_url is NULL`, vid42Check.json.video.video_url === null);

    const check42Api = await request('GET', `/api/entitlements/check/${vid42}`, { 'Cookie': userCookies });
    assert(`GET /api/entitlements/check/${vid42} reports is_entitled: false`, check42Api.json.is_entitled === false);

    // ----------------------------------------------------------------------
    // TEST 4: User A pays for Video 42
    // Expected: Video 42 = UNLOCKED, Video 41 = still UNLOCKED
    // ----------------------------------------------------------------------
    console.log(`\n--- TEST 4: User A pays for Video ${vid42} ---`);
    const order42Res = await request('POST', '/api/entitlements/create-order', { 'Cookie': userCookies }, {
      video_id: vid42,
      email: userEmail
    });
    assert(`POST /api/entitlements/create-order for Video ${vid42} returns 200`, order42Res.statusCode === 200);

    const order42Id = order42Res.json.order_id;
    const payment42Id = `pay_test_${vid42}_${Date.now()}`;

    const verify42Res = await request('POST', '/api/entitlements/verify', { 'Cookie': userCookies }, {
      video_id: vid42,
      razorpay_payment_id: payment42Id,
      razorpay_order_id: order42Id,
      razorpay_signature: 'sig_test_valid',
      email: userEmail
    });
    assert(`Payment verification for Video ${vid42} returns 200`, verify42Res.statusCode === 200);
    assert(`Entitlement created for Video ${vid42}`, verify42Res.json.entitlement?.video_id === vid42);

    // Check Video 42 is now UNLOCKED
    const vid42NowUnlocked = await request('GET', `/api/videos/${vid42}`, { 'Cookie': userCookies });
    assert(`Video ${vid42} is now UNLOCKED (is_locked: false)`, vid42NowUnlocked.json.video.is_locked === false);
    assert(`Video ${vid42} has stream URL`, Boolean(vid42NowUnlocked.json.video.video_url));

    // Check Video 41 is STILL UNLOCKED
    const vid41StillUnlocked = await request('GET', `/api/videos/${vid41}`, { 'Cookie': userCookies });
    assert(`Video ${vid41} is STILL UNLOCKED (is_locked: false)`, vid41StillUnlocked.json.video.is_locked === false);
    assert(`Video ${vid41} has stream URL`, Boolean(vid41StillUnlocked.json.video.video_url));

    // ----------------------------------------------------------------------
    // TEST 5: Payment cancelled/failed
    // Expected: Video remains LOCKED
    // ----------------------------------------------------------------------
    console.log('\n--- TEST 5: Payment cancelled/failed ---');
    const userBEmail = `userb_cancelled_${Date.now()}@example.com`;
    const userBCookies = `vh_uid=usr_visitor_user_b_${Date.now()}`;

    // Verify video 41 is locked for User B
    const vid41UserB = await request('GET', `/api/videos/${vid41}`, { 'Cookie': userBCookies });
    assert(`User B: Video ${vid41} starts LOCKED`, vid41UserB.json.video.is_locked === true);

    // User B abandons / cancels checkout without verifying payment
    // Checking again -> must remain locked
    const vid41UserBAfterCancel = await request('GET', `/api/videos/${vid41}`, { 'Cookie': userBCookies });
    assert(`User B: Video ${vid41} remains LOCKED after cancellation`, vid41UserBAfterCancel.json.video.is_locked === true);
    assert('User B: Video stream returns 403 Forbidden', (await request('GET', `/api/videos/${vid41}/stream`, { 'Cookie': userBCookies })).statusCode === 403);

    // ----------------------------------------------------------------------
    // TEST 6: Payment UI says success but server verification fails
    // Expected: Video remains LOCKED
    // ----------------------------------------------------------------------
    console.log('\n--- TEST 6: Payment UI says success but server verification fails ---');
    const userCEmail = `userc_fake_${Date.now()}@example.com`;
    const userCCookies = `vh_uid=usr_visitor_user_c_${Date.now()}`;

    // Frontend attempts to verify with invalid signature / spoofed payment
    const forgedVerifyRes = await request('POST', '/api/entitlements/verify', { 'Cookie': userCCookies }, {
      video_id: vid41,
      razorpay_payment_id: 'pay_spoofed_123',
      razorpay_order_id: 'order_spoofed_456',
      razorpay_signature: 'sig_invalid', // invalid signature
      email: userCEmail
    });
    assert('Forged payment verification rejected with HTTP 400 Bad Request', forgedVerifyRes.statusCode === 400);
    assert('Error message returned', Boolean(forgedVerifyRes.json?.error));

    // Video must remain LOCKED
    const vid41UserCAfterFail = await request('GET', `/api/videos/${vid41}`, { 'Cookie': userCCookies });
    assert(`User C: Video ${vid41} remains LOCKED (server rejected fake payment)`, vid41UserCAfterFail.json.video.is_locked === true);
    assert('User C: video_url is NULL', vid41UserCAfterFail.json.video.video_url === null);

    // ----------------------------------------------------------------------
    // TEST 7: Open the same video from another browser/device while logged into the same account
    // Expected: The server-side entitlement determines access.
    // ----------------------------------------------------------------------
    console.log('\n--- TEST 7: Cross-browser / Device 2 access with same account ---');
    // Device 2 has a fresh, different visitor cookie (empty session)
    const device2CleanCookie = `vh_uid=usr_device2_${Date.now()}`;

    // Before login on Device 2: Video 41 is initially locked
    const d2BeforeLogin = await request('GET', `/api/videos/${vid41}`, { 'Cookie': device2CleanCookie });
    assert(`Device 2: Video ${vid41} is initially locked before restore/login`, d2BeforeLogin.json.video.is_locked === true);

    // Device 2 user logs in / restores access using User A's email
    const restoreRes = await request('POST', '/api/entitlements/restore', { 'Cookie': device2CleanCookie }, {
      identifier: userEmail,
      video_id: vid41
    });
    assert('POST /api/entitlements/restore returns 200 OK', restoreRes.statusCode === 200);
    assert('Restore confirms entitled_for_current is true', restoreRes.json.entitled_for_current === true);
    assert(`Restore reports total entitlements: ${restoreRes.json.entitlements_count}`, restoreRes.json.entitlements_count >= 2);

    const device2AuthCookie = extractCookie(restoreRes.headers, 'vh_user_token');
    assert('Device 2 receives valid vh_user_token cookie', Boolean(device2AuthCookie));
    const device2FullCookies = `${device2AuthCookie}; ${device2CleanCookie}`;

    // Device 2 checks Video 41 -> MUST BE UNLOCKED!
    const d2Vid41 = await request('GET', `/api/videos/${vid41}`, { 'Cookie': device2FullCookies });
    assert(`Device 2: Video ${vid41} is UNLOCKED from server-side entitlement`, d2Vid41.json.video.is_locked === false);
    assert(`Device 2: Video ${vid41} has stream URL`, d2Vid41.json.video.video_url === `/api/videos/${vid41}/stream`);

    // Device 2 checks Video 42 -> ALSO UNLOCKED because User A bought both!
    const d2Vid42 = await request('GET', `/api/videos/${vid42}`, { 'Cookie': device2FullCookies });
    assert(`Device 2: Video ${vid42} is UNLOCKED from server-side entitlement`, d2Vid42.json.video.is_locked === false);

    // If an unpurchased video (e.g. video 39 or 40) is checked -> MUST REMAIN LOCKED
    const unpurchasedVid = 40;
    const d2Unpurchased = await request('GET', `/api/videos/${unpurchasedVid}`, { 'Cookie': device2FullCookies });
    assert(`Device 2: Unpurchased Video ${unpurchasedVid} remains LOCKED`, d2Unpurchased.json.video.is_locked === true);

    // ----------------------------------------------------------------------
    // TEST 8: Logout and Login Behavior
    // ----------------------------------------------------------------------
    console.log('\n--- TEST 8: Customer Logout and Login ---');
    // Logout Device 2
    const logoutRes = await request('POST', '/api/auth/logout', { 'Cookie': device2FullCookies });
    assert('POST /api/auth/logout returns 200 OK', logoutRes.statusCode === 200);
    const loggedOutUid = extractCookie(logoutRes.headers, 'vh_uid');
    
    // Check Video 41 after logout -> MUST BE LOCKED AGAIN!
    const afterLogoutVid41 = await request('GET', `/api/videos/${vid41}`, { 'Cookie': loggedOutUid || '' });
    assert(`After logout: Video ${vid41} is LOCKED again`, afterLogoutVid41.json.video.is_locked === true);

    // ----------------------------------------------------------------------
    // TEST 9: Idempotency & Duplicate Entitlement Prevention
    // ----------------------------------------------------------------------
    console.log('\n--- TEST 9: Duplicate Entitlement Prevention ---');
    const countBefore = await query.get(
      'SELECT COUNT(*)::int AS total FROM entitlements WHERE customer_email = $1 AND video_id = $2',
      [userEmail, vid41]
    );
    assert(`Single entitlement record in DB before re-verify (count: ${countBefore.total})`, countBefore.total === 1);

    // Re-verify identical payment
    await request('POST', '/api/entitlements/verify', { 'Cookie': userCookies }, {
      video_id: vid41,
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      razorpay_signature: 'sig_test_valid',
      email: userEmail
    });

    const countAfter = await query.get(
      'SELECT COUNT(*)::int AS total FROM entitlements WHERE customer_email = $1 AND video_id = $2',
      [userEmail, vid41]
    );
    assert(`No duplicate records created (count still: ${countAfter.total})`, countAfter.total === 1);

    // ----------------------------------------------------------------------
    // TEST 10: Admin Access Preserved
    // ----------------------------------------------------------------------
    console.log('\n--- TEST 10: Admin Access Preservation ---');
    const adminLoginRes = await request('POST', '/api/admin/login', {}, {
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123'
    });
    assert('Admin login returns 200', adminLoginRes.statusCode === 200);
    const adminCookie = extractCookie(adminLoginRes.headers, 'admin_token');
    assert('Admin token cookie received', Boolean(adminCookie));

    const adminVid40 = await request('GET', `/api/videos/${unpurchasedVid}`, { 'Cookie': adminCookie });
    assert(`Admin can preview unpurchased Video ${unpurchasedVid} (is_locked: false)`, adminVid40.json.video.is_locked === false);
    assert('Admin detail has is_admin: true', adminVid40.json.is_admin === true);

    const adminEntitlementsRes = await request('GET', '/api/admin/entitlements', { 'Cookie': adminCookie });
    assert('Admin entitlements API returns 200', adminEntitlementsRes.statusCode === 200);
    assert('Admin entitlements summary contains total', adminEntitlementsRes.json.summary?.total >= 2);

    // ----------------------------------------------------------------------
    // TEST 11: Expired Entitlement Verification
    // ----------------------------------------------------------------------
    console.log('\n--- TEST 11: Expired Entitlement Verification ---');
    const expiredUserId = `user_exp_${Date.now()}`;
    const { createUserToken } = require('../services/entitlement');
    const expiredToken = createUserToken({ user_id: expiredUserId });
    const expiredCookieHeader = `vh_user_token=${expiredToken}`;

    // Insert entitlement with expires_at in the past (48 hours ago, immune to cloud clock drift)
    const pastDate = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    await query.run(
      `INSERT INTO video_entitlements (user_id, video_id, payment_id, status, expires_at)
       VALUES ($1, $2, $3, 'active', $4)
       ON CONFLICT (user_id, video_id) DO UPDATE SET status = 'active', expires_at = $4`,
      [expiredUserId, vid41, 'pay_expired_test', pastDate]
    );

    const expiredVidRes = await request('GET', `/api/videos/${vid41}`, { 'Cookie': expiredCookieHeader });
    assert(`Expired entitlement: Video ${vid41} is LOCKED (is_locked: true)`, expiredVidRes.json.video.is_locked === true);
    assert(`Expired entitlement: video_url is null`, expiredVidRes.json.video.video_url === null);

    const expiredStreamRes = await request('GET', `/api/videos/${vid41}/stream`, { 'Cookie': expiredCookieHeader });
    assert('Expired entitlement stream request returns 403 Forbidden', expiredStreamRes.statusCode === 403);

    // Now update expires_at to the future
    const futureDate = new Date(Date.now() + 86400 * 1000).toISOString();
    await query.run(
      `UPDATE video_entitlements SET expires_at = $1 WHERE user_id = $2 AND video_id = $3`,
      [futureDate, expiredUserId, vid41]
    );

    const renewedVidRes = await request('GET', `/api/videos/${vid41}`, { 'Cookie': expiredCookieHeader });
    assert(`Renewed/Active future entitlement: Video ${vid41} is UNLOCKED (is_locked: false)`, renewedVidRes.json.video.is_locked === false);

    console.log('\n======================================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================================\n');

  } catch (err) {
    console.error('Fatal test execution error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}

runSuite();
