/**
 * scripts/test_subscription_system.js
 * End-to-End Automated Verification for ViralHub Subscription Paywall & Razorpay Integration
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { query, initDatabase } = require('../database/db');

const BASE_URL = 'http://127.0.0.1:3000';

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
        } catch (e) {}
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

async function runTests() {
  console.log('====================================================');
  console.log('VIRALHUB SUBSCRIPTION PAYWALL AUTOMATED TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(desc, condition) {
    total++;
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
    }
  }

  // 1. Verify videos exist in Neon PostgreSQL
  await initDatabase();
  const dbVideos = await query.all('SELECT id, title, published FROM videos WHERE published = true');
  assert('Published videos exist in DB', dbVideos.length >= 1);
  const targetVidId = 15;

  // 2. Test Homepage Public API: clear thumbnails, NO video_url leaked
  const homeApiRes = await request('GET', '/api/videos');
  assert('GET /api/videos returns HTTP 200', homeApiRes.statusCode === 200);
  assert('GET /api/videos returns array of videos', Array.isArray(homeApiRes.json));
  const firstCard = homeApiRes.json[0];
  assert('Homepage video card has thumbnail_url', Boolean(firstCard.thumbnail_url || firstCard.thumbnail_path));
  assert('Homepage video card does NOT leak video_url', firstCard.video_url === null);
  assert('Homepage video card does NOT leak video_path', firstCard.video_path === null);

  // 3. Test Video Detail Page for Non-Subscriber
  const detailRes = await request('GET', `/api/videos/${targetVidId}`);
  assert(`GET /api/videos/${targetVidId} returns HTTP 200`, detailRes.statusCode === 200);
  assert('Video is locked for non-subscriber', detailRes.json.video.is_locked === true);
  assert('Protected video_url is null for non-subscriber', detailRes.json.video.video_url === null);
  assert('Subscription status indicates active: false', detailRes.json.subscription.active === false);
  assert('Subscription plan price is ₹9/month', detailRes.json.subscription.plan_price === '₹9/month');

  // 4. Test Direct Access to Video Stream without Subscription -> 403 Forbidden
  const streamUnauthorized = await request('GET', `/api/videos/${targetVidId}/stream`);
  assert('Direct stream access without subscription returns HTTP 403 Forbidden', streamUnauthorized.statusCode === 403);
  assert('403 response contains locked: true', streamUnauthorized.json?.locked === true);

  // 5. Test Direct Access to /uploads/videos/seed-video-1.mp4 without Subscription -> 403 Forbidden
  const directMp4Unauthorized = await request('GET', '/uploads/videos/seed-video-1.mp4');
  assert('Direct file access to /uploads/videos/ returns HTTP 403 Forbidden', directMp4Unauthorized.statusCode === 403);

  // 6. Test Public Thumbnails remain accessible -> HTTP 200
  const thumbRes = await request('GET', '/uploads/thumbnails/seed-thumb-1.svg');
  assert('Thumbnails remain publicly accessible HTTP 200', thumbRes.statusCode === 200);

  // 7. Test Subscription Public Config
  const configRes = await request('GET', '/api/subscription/config');
  assert('GET /api/subscription/config returns HTTP 200', configRes.statusCode === 200);
  assert('Config provides safe key_id', Boolean(configRes.json.key_id));
  assert('Config provides plan_id', Boolean(configRes.json.plan_id));
  assert('Config provides price ₹9/month', configRes.json.plan_price === '₹9/month');

  // 8. Test Subscription Creation
  const testEmail = `test_subscriber_${Date.now()}@example.com`;
  const createSubRes = await request('POST', '/api/subscription/create', {}, {
    email: testEmail,
    phone: '+919876543210'
  });
  assert('POST /api/subscription/create returns HTTP 200', createSubRes.statusCode === 200);
  assert('Subscription ID is generated', Boolean(createSubRes.json.subscription_id));
  const subId = createSubRes.json.subscription_id;

  // 9. Test Subscription Verification (Server-Side Verification)
  const verifyRes = await request('POST', '/api/subscription/verify', {}, {
    razorpay_payment_id: 'pay_test_' + Date.now(),
    razorpay_subscription_id: subId,
    razorpay_signature: 'sig_test_valid',
    email: testEmail,
    phone: '+919876543210'
  });
  assert('POST /api/subscription/verify returns HTTP 200', verifyRes.statusCode === 200);
  assert('Verification success is true', verifyRes.json.success === true);
  assert('Verification returns subscribed: true', verifyRes.json.subscribed === true);

  // Check Set-Cookie for vh_sub_token
  const setCookie = verifyRes.headers['set-cookie'];
  assert('Server sets HTTP-only vh_sub_token cookie', Array.isArray(setCookie) && setCookie.some(c => c.includes('vh_sub_token=')));
  const subCookieHeader = setCookie.find(c => c.includes('vh_sub_token=')).split(';')[0];

  // 10. Verify Subscription Stored in Neon PostgreSQL
  const dbSub = await query.get('SELECT * FROM subscriptions WHERE razorpay_subscription_id = $1', [subId]);
  assert('Subscription record exists in Neon DB', Boolean(dbSub));
  assert('Subscription status in DB is active', dbSub?.status === 'active');
  assert('Subscription customer_email matches', dbSub?.customer_email === testEmail);

  // 11. Test Active Subscriber receives Unlocked Video Detail
  const detailSubscribed = await request('GET', `/api/videos/${targetVidId}`, {
    'Cookie': subCookieHeader
  });
  assert('Subscriber detail request returns is_locked: false', detailSubscribed.json.video.is_locked === false);
  assert('Subscriber detail request provides stream URL', detailSubscribed.json.video.video_url === `/api/videos/${targetVidId}/stream`);
  assert('Subscription status indicates active: true', detailSubscribed.json.subscription.active === true);

  // 12. Test Active Subscriber receives Authorized Stream Access (HTTP 200 / 206)
  const streamAuthorized = await request('GET', `/api/videos/${targetVidId}/stream`, {
    'Cookie': subCookieHeader
  });
  assert('Subscriber stream request returns HTTP 200 OK', streamAuthorized.statusCode === 200);
  assert('Stream Content-Type is video/mp4', streamAuthorized.headers['content-type'] === 'video/mp4');
  assert('Stream Accept-Ranges is bytes', streamAuthorized.headers['accept-ranges'] === 'bytes');

  // Test Range Seeking for Subscriber
  const streamRange = await request('GET', `/api/videos/${targetVidId}/stream`, {
    'Cookie': subCookieHeader,
    'Range': 'bytes=0-15'
  });
  assert('Subscriber Range request returns HTTP 206 Partial Content', streamRange.statusCode === 206);
  assert('Range request returns Content-Range', Boolean(streamRange.headers['content-range']));
  assert('Range request Content-Length is 16', streamRange.headers['content-length'] === '16');

  // 13. Test Refreshing / Subscription Status Endpoint
  const statusRes = await request('GET', '/api/subscription/status', {
    'Cookie': subCookieHeader
  });
  assert('GET /api/subscription/status returns subscribed: true', statusRes.json.subscribed === true);
  assert('Subscription status matches active', statusRes.json.status === 'active');
  assert('Subscription email matches', statusRes.json.email === testEmail);

  // 14. Test Webhook: Subscription Cancelled
  const cancelWebhookPayload = JSON.stringify({
    event: 'subscription.cancelled',
    payload: {
      subscription: {
        entity: {
          id: subId,
          status: 'cancelled'
        }
      }
    }
  });

  const webhookCancelRes = await request('POST', '/api/webhook/razorpay', {
    'Content-Type': 'application/json'
  }, cancelWebhookPayload);
  assert('Webhook subscription.cancelled returns HTTP 200', webhookCancelRes.statusCode === 200);

  // Verify DB status changed to cancelled
  const dbSubCancelled = await query.get('SELECT * FROM subscriptions WHERE razorpay_subscription_id = $1', [subId]);
  assert('Subscription status in DB is now cancelled', dbSubCancelled.status === 'cancelled');

  // 15. Verify Cancelled Subscriber becomes Locked again!
  const detailCancelled = await request('GET', `/api/videos/${targetVidId}`, {
    'Cookie': subCookieHeader
  });
  assert('Cancelled subscriber receives is_locked: true', detailCancelled.json.video.is_locked === true);
  assert('Cancelled subscriber protected video_url is null', detailCancelled.json.video.video_url === null);

  const streamCancelled = await request('GET', `/api/videos/${targetVidId}/stream`, {
    'Cookie': subCookieHeader
  });
  assert('Cancelled subscriber stream request returns HTTP 403 Forbidden', streamCancelled.statusCode === 403);

  // 16. Test Webhook: Subscription Reactivated / Charged
  const chargedWebhookPayload = JSON.stringify({
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: subId,
          status: 'active',
          current_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000)
        }
      },
      payment: {
        entity: {
          id: 'pay_renew_' + Date.now()
        }
      }
    }
  });

  const webhookChargeRes = await request('POST', '/api/webhook/razorpay', {
    'Content-Type': 'application/json'
  }, chargedWebhookPayload);
  assert('Webhook subscription.charged returns HTTP 200', webhookChargeRes.statusCode === 200);

  const dbSubReactivated = await query.get('SELECT * FROM subscriptions WHERE razorpay_subscription_id = $1', [subId]);
  assert('Subscription status in DB reactivated to active', dbSubReactivated.status === 'active');

  // 17. Test Restore Access Flow
  const restoreRes = await request('POST', '/api/subscription/restore', {}, {
    identifier: testEmail
  });
  assert('POST /api/subscription/restore returns HTTP 200', restoreRes.statusCode === 200);
  assert('Restore access returns subscribed: true', restoreRes.json.subscribed === true);
  const restoredCookie = restoreRes.headers['set-cookie']?.find(c => c.includes('vh_sub_token=')).split(';')[0];
  assert('Restore access issues new session cookie', Boolean(restoredCookie));

  // 18. Test Admin Login and Admin Subscriptions API
  const adminLoginRes = await request('POST', '/api/admin/login', {}, {
    username: 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  });
  assert('Admin login returns HTTP 200', adminLoginRes.statusCode === 200);
  const adminCookie = adminLoginRes.headers['set-cookie']?.find(c => c.includes('admin_token=')).split(';')[0];
  assert('Admin login sets admin_token cookie', Boolean(adminCookie));

  const adminSubsRes = await request('GET', '/api/admin/subscriptions', {
    'Cookie': adminCookie
  });
  assert('GET /api/admin/subscriptions returns HTTP 200', adminSubsRes.statusCode === 200);
  assert('Admin subscriptions contains summary stats', Boolean(adminSubsRes.json.summary));
  assert('Admin subscriptions summary includes total >= 1', adminSubsRes.json.summary.total >= 1);
  assert('Admin subscriptions summary includes active >= 1', adminSubsRes.json.summary.active >= 1);
  assert('Admin subscriptions summary includes MRR', typeof adminSubsRes.json.summary.mrr === 'number');
  assert('Admin subscriptions contains list of subscriptions', Array.isArray(adminSubsRes.json.subscriptions));

  // 19. Verify UI Templates Structure
  const videoHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'video.html'), 'utf8');
  assert('video.html contains #videoLockOverlay', videoHtml.includes('id="videoLockOverlay"'));
  assert('video.html contains "Video Locked"', videoHtml.includes('Video Locked'));
  assert('video.html contains "Unlock Premium Access"', videoHtml.includes('Unlock Premium Access'));
  assert('video.html contains "₹9/month"', videoHtml.includes('₹9'));
  assert('video.html contains Unlock for ₹9/month button', videoHtml.includes('id="btnUnlockVideo"'));
  assert('video.html contains checkout modal', videoHtml.includes('id="checkoutModal"'));
  assert('video.html contains restore modal', videoHtml.includes('id="restoreModal"'));
  assert('video.html contains Razorpay checkout.js script', videoHtml.includes('https://checkout.razorpay.com/v1/checkout.js'));

  const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
  assert('admin.html contains Customer Subscriptions section', adminHtml.includes('Customer Subscriptions'));
  assert('admin.html contains #statTotalSubs', adminHtml.includes('id="statTotalSubs"'));
  assert('admin.html contains #statActiveSubs', adminHtml.includes('id="statActiveSubs"'));
  assert('admin.html contains #subscriptionsTableBody', adminHtml.includes('id="subscriptionsTableBody"'));

  console.log(`\n====================================================`);
  console.log(`TEST SUMMARY: ${passed} / ${total} CHECKS PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================');

  if (passed === total) {
    console.log('✅ ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('❌ SOME CHECKS FAILED!');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
