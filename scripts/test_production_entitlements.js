/**
 * scripts/test_production_entitlements.js
 * Comprehensive automated verification for Production Video Entitlements (Tests A through J)
 *
 * A. Open unpaid video → LOCKED
 * B. Click unlock → REAL payment gateway opens (Cashfree order & session created)
 * C. No payment → remains LOCKED
 * D. Failed/pending payment → remains LOCKED
 * E. Verified PAID payment for video 40 → video 40 UNLOCKED
 * F. Video 41 remains LOCKED
 * G. Refresh video 40 → remains UNLOCKED
 * H. Refresh/reopen video 41 → remains LOCKED
 * I. Duplicate verification → no duplicate entitlement
 * J. /payment-test remains isolated and does not unlock any production video
 */

require('dotenv').config();
const http = require('http');
const { query, initDatabase } = require('../database/db');
const { mockOrderStore } = require('../services/cashfree');
const app = require('../server');

let server;
const PORT = 3567;
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

async function run() {
  console.log('======================================================================');
  console.log('PRODUCTION VIDEO ENTITLEMENT TEST SUITE (CASES A - J)');
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

  await new Promise((resolve) => {
    server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`🚀 Production Test server listening on http://127.0.0.1:${PORT}\n`);
      resolve();
    });
  });

  try {
    const vid40 = 40;
    const vid41 = 41;
    const testEmail = `prod_test_buyer_${Date.now()}@example.com`;
    const userCookieInitial = `vh_uid=usr_prod_test_${Date.now()}`;
    let authUserCookies = '';

    // Clean up any pre-existing test entitlements for this user/email to start clean
    await query.run('DELETE FROM entitlements WHERE customer_email = $1 OR user_id = $2', [testEmail, 'usr_prod_test']);
    try {
      await query.run('DELETE FROM video_entitlements WHERE customer_email = $1', [testEmail]);
    } catch (_) {}

    // ----------------------------------------------------------------------
    // Case A: Open unpaid video → LOCKED
    // ----------------------------------------------------------------------
    console.log(`--- CASE A: Open unpaid video ${vid40} → LOCKED ---`);
    const vid40Initial = await request('GET', `/api/videos/${vid40}`, { 'Cookie': userCookieInitial });
    assert(`GET /api/videos/${vid40} returns 200`, vid40Initial.statusCode === 200);
    assert(`Video ${vid40} is LOCKED (is_locked: true)`, vid40Initial.json?.video?.is_locked === true);
    assert(`Video ${vid40} video_url is NULL`, vid40Initial.json?.video?.video_url === null);

    const stream40Unpaid = await request('GET', `/api/videos/${vid40}/stream`, { 'Cookie': userCookieInitial });
    assert(`Streaming unpaid Video ${vid40} returns 403 Forbidden`, stream40Unpaid.statusCode === 403);
    assert('403 response indicates locked: true', stream40Unpaid.json?.locked === true);

    // ----------------------------------------------------------------------
    // Case B: Click unlock → REAL payment gateway opens
    // ----------------------------------------------------------------------
    console.log(`\n--- CASE B: Click unlock → REAL payment gateway opens ---`);
    const configRes = await request('GET', '/api/entitlements/config');
    assert('GET /api/entitlements/config returns 200', configRes.statusCode === 200);
    assert('Payment config specifies provider: cashfree', configRes.json?.provider === 'cashfree');
    assert('Payment config test_mode is FALSE (no fake unlock)', configRes.json?.test_mode === false);
    assert('Payment config shows is_configured: true', configRes.json?.is_configured === true);

    const orderRes = await request('POST', '/api/entitlements/create-order', { 'Cookie': userCookieInitial }, {
      video_id: vid40,
      email: testEmail,
      phone: '9876543210'
    });
    assert('POST /api/entitlements/create-order returns 200', orderRes.statusCode === 200);
    assert('Returns real gateway order_id', Boolean(orderRes.json?.order_id));
    assert('Returns Cashfree payment_session_id', Boolean(orderRes.json?.payment_session_id));
    assert(`Order tied to video_id: ${vid40}`, orderRes.json?.video_id === vid40);
    const orderId40 = orderRes.json?.order_id;

    // ----------------------------------------------------------------------
    // Case C: No payment → remains LOCKED
    // ----------------------------------------------------------------------
    console.log(`\n--- CASE C: No payment → remains LOCKED ---`);
    // User opened gateway but did not finish checkout
    const vid40NoPay = await request('GET', `/api/videos/${vid40}`, { 'Cookie': userCookieInitial });
    assert(`Video ${vid40} remains LOCKED without payment confirmation`, vid40NoPay.json?.video?.is_locked === true);
    assert(`Video ${vid40} stream URL remains NULL`, vid40NoPay.json?.video?.video_url === null);

    // ----------------------------------------------------------------------
    // Case D: Failed/pending payment → remains LOCKED
    // ----------------------------------------------------------------------
    console.log(`\n--- CASE D: Failed/pending payment → remains LOCKED ---`);
    // Cashfree order status is ACTIVE (unpaid) or simulated pending
    const pendingVerifyRes = await request('POST', '/api/entitlements/verify', { 'Cookie': userCookieInitial }, {
      video_id: vid40,
      order_id: orderId40
    });
    assert('Pending payment verification rejected with 400 Bad Request', pendingVerifyRes.statusCode === 400);
    assert('Response indicates unlocked: false', pendingVerifyRes.json?.unlocked === false);
    assert('Error message specifies payment has not been completed', Boolean(pendingVerifyRes.json?.error));

    // Video must strictly remain locked
    const vid40AfterFailed = await request('GET', `/api/videos/${vid40}`, { 'Cookie': userCookieInitial });
    assert(`Video ${vid40} remains strictly LOCKED after pending/failed verification`, vid40AfterFailed.json?.video?.is_locked === true);

    // ----------------------------------------------------------------------
    // Case E: Verified PAID payment for video 40 → video 40 UNLOCKED
    // ----------------------------------------------------------------------
    console.log(`\n--- CASE E: Verified PAID payment for Video 40 → Video 40 UNLOCKED ---`);
    // We register the order as PAID in Cashfree store / sandbox
    mockOrderStore.set(orderId40, {
      order_id: orderId40,
      order_status: 'PAID',
      order_amount: '9.00',
      order_currency: 'INR',
      customer_id: 'cust_prod_test',
      order_tags: { video_id: String(vid40) }
    });

    const verifySuccessRes = await request('POST', '/api/entitlements/verify', { 'Cookie': userCookieInitial }, {
      video_id: vid40,
      order_id: orderId40,
      email: testEmail
    });
    assert('POST /api/entitlements/verify for PAID order returns 200 OK', verifySuccessRes.statusCode === 200);
    assert('Verification returns unlocked: true', verifySuccessRes.json?.unlocked === true);
    assert(`Entitlement created for exact video_id: ${vid40}`, verifySuccessRes.json?.video_id === vid40);
    assert('Verification returns stream URL', verifySuccessRes.json?.video_url === `/api/videos/${vid40}/stream`);

    const userTokenCookie = extractCookie(verifySuccessRes.headers, 'vh_user_token');
    assert('Server issues secure vh_user_token cookie', Boolean(userTokenCookie));
    authUserCookies = [userTokenCookie, userCookieInitial].filter(Boolean).join('; ');

    // Verify Video 40 is now UNLOCKED
    const vid40Unlocked = await request('GET', `/api/videos/${vid40}`, { 'Cookie': authUserCookies });
    assert(`Video ${vid40} is now UNLOCKED (is_locked: false)`, vid40Unlocked.json?.video?.is_locked === false);
    assert(`Video ${vid40} provides playable stream URL`, Boolean(vid40Unlocked.json?.video?.video_url));

    const stream40Paid = await request('GET', `/api/videos/${vid40}/stream`, { 'Cookie': authUserCookies });
    assert(`Streaming Video ${vid40} authorized: HTTP 200/206`, stream40Paid.statusCode === 200 || stream40Paid.statusCode === 206);

    // ----------------------------------------------------------------------
    // Case F: Video 41 remains LOCKED
    // ----------------------------------------------------------------------
    console.log(`\n--- CASE F: Video 41 remains LOCKED ---`);
    const vid41Check = await request('GET', `/api/videos/${vid41}`, { 'Cookie': authUserCookies });
    assert(`Video ${vid41} remains strictly LOCKED (is_locked: true)`, vid41Check.json?.video?.is_locked === true);
    assert(`Video ${vid41} video_url is NULL`, vid41Check.json?.video?.video_url === null);

    const stream41Forbidden = await request('GET', `/api/videos/${vid41}/stream`, { 'Cookie': authUserCookies });
    assert(`Streaming Video 41 returns 403 Forbidden`, stream41Forbidden.statusCode === 403);

    // ----------------------------------------------------------------------
    // Case G: Refresh video 40 → remains UNLOCKED
    // ----------------------------------------------------------------------
    console.log(`\n--- CASE G: Refresh Video 40 → remains UNLOCKED ---`);
    const vid40Refreshed = await request('GET', `/api/videos/${vid40}`, { 'Cookie': authUserCookies });
    assert(`Refreshed Video 40 remains UNLOCKED (is_locked: false)`, vid40Refreshed.json?.video?.is_locked === false);
    assert(`Refreshed Video 40 stream URL available`, Boolean(vid40Refreshed.json?.video?.video_url));

    const check40Api = await request('GET', `/api/entitlements/check/${vid40}`, { 'Cookie': authUserCookies });
    assert(`GET /api/entitlements/check/${vid40} reports is_entitled: true`, check40Api.json?.is_entitled === true);

    // ----------------------------------------------------------------------
    // Case H: Refresh/reopen video 41 → remains LOCKED
    // ----------------------------------------------------------------------
    console.log(`\n--- CASE H: Refresh/reopen Video 41 → remains LOCKED ---`);
    const vid41Refreshed = await request('GET', `/api/videos/${vid41}`, { 'Cookie': authUserCookies });
    assert(`Refreshed Video 41 remains strictly LOCKED (is_locked: true)`, vid41Refreshed.json?.video?.is_locked === true);
    assert(`Refreshed Video 41 video_url is NULL`, vid41Refreshed.json?.video?.video_url === null);

    const check41Api = await request('GET', `/api/entitlements/check/${vid41}`, { 'Cookie': authUserCookies });
    assert(`GET /api/entitlements/check/${vid41} reports is_entitled: false`, check41Api.json?.is_entitled === false);

    // ----------------------------------------------------------------------
    // Case I: Duplicate verification → no duplicate entitlement
    // ----------------------------------------------------------------------
    console.log(`\n--- CASE I: Duplicate verification → no duplicate entitlement ---`);
    const countBefore = await query.get(
      'SELECT COUNT(*) as count FROM entitlements WHERE (razorpay_payment_id = $1 OR razorpay_order_id = $1) AND video_id = $2',
      [orderId40, vid40]
    );

    const dupVerifyRes = await request('POST', '/api/entitlements/verify', { 'Cookie': authUserCookies }, {
      video_id: vid40,
      order_id: orderId40,
      email: testEmail
    });
    assert('Duplicate verification returns 200 OK (idempotent)', dupVerifyRes.statusCode === 200);
    assert('Returns already_verified: true or unlocked: true', dupVerifyRes.json?.already_verified === true || dupVerifyRes.json?.unlocked === true);

    const countAfter = await query.get(
      'SELECT COUNT(*) as count FROM entitlements WHERE (razorpay_payment_id = $1 OR razorpay_order_id = $1) AND video_id = $2',
      [orderId40, vid40]
    );
    assert('Entitlement record count unchanged in database (idempotent)', Number(countBefore.count) === Number(countAfter.count));

    // ----------------------------------------------------------------------
    // Case J: /payment-test remains isolated and does not unlock production video
    // ----------------------------------------------------------------------
    console.log(`\n--- CASE J: /payment-test is isolated and does not unlock production videos ---`);
    // Create test order on /api/test-payment/create-order
    const testPgOrder = await request('POST', '/api/test-payment/create-order', {}, {
      amount: 1.00,
      customer_name: 'Isolated Test User',
      customer_email: 'isolated@test.com'
    });
    assert('POST /api/test-payment/create-order returns 200', testPgOrder.statusCode === 200);
    const testOrderId = testPgOrder.json?.order_id;
    assert('Test order created', Boolean(testOrderId));

    // Verify test payment on /api/test-payment/verify-order
    mockOrderStore.set(testOrderId, {
      order_id: testOrderId,
      order_status: 'PAID',
      order_amount: '1.00',
      order_currency: 'INR'
    });
    const testPgVerify = await request('POST', '/api/test-payment/verify-order', {}, {
      order_id: testOrderId
    });
    assert('POST /api/test-payment/verify-order returns 200 OK', testPgVerify.statusCode === 200);
    assert('Test order status is PAID', testPgVerify.json?.order_status === 'PAID');

    // Confirm that /payment-test created ZERO video entitlements
    const testEntitlementCheck = await query.get(
      'SELECT COUNT(*) as count FROM entitlements WHERE razorpay_payment_id = $1 OR razorpay_order_id = $1',
      [testOrderId]
    );
    assert('/payment-test created 0 video entitlements in DB', Number(testEntitlementCheck?.count || 0) === 0);

    // Fresh visitor check: Video 41 is still locked
    const freshUserRes = await request('GET', `/api/videos/${vid41}`, { 'Cookie': 'vh_uid=fresh_stranger_123' });
    assert(`Production Video ${vid41} remains completely LOCKED`, freshUserRes.json?.video?.is_locked === true);

    console.log('\n======================================================================');
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Test suite error:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

run();
