/**
 * scripts/test_payment_link_flow.js
 * Comprehensive automated test suite for Razorpay Payment Link flow.
 */

const BASE_URL = 'http://127.0.0.1:3000';

async function runTests() {
  console.log('🧪 Starting Razorpay Payment Link Flow Test Suite...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      failed++;
      throw new Error(message);
    } else {
      console.log(`✅ PASSED: ${message}`);
      passed++;
    }
  }

  try {
    // Test 1: GET /api/subscription/config
    console.log('\n--- 1. Testing /api/subscription/config endpoint ---');
    const configRes = await fetch(`${BASE_URL}/api/subscription/config`);
    assert(configRes.ok, 'Config endpoint returned 200 OK');
    const configData = await configRes.json();
    assert(configData.key_id !== undefined, 'Config contains key_id');
    assert(configData.plan_price === '₹9/month', 'Config contains correct plan_price ₹9/month');
    assert(configData.has_payment_link !== undefined, 'Config contains has_payment_link boolean');
    assert(configData.key_secret === undefined, 'Config DOES NOT leak key_secret');
    assert(configData.webhook_secret === undefined, 'Config DOES NOT leak webhook_secret');

    // Test 2: Unverified payment rejection
    console.log('\n--- 2. Testing unverified payment attempts rejection ---');
    const emptyRes = await fetch(`${BASE_URL}/api/subscription/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(emptyRes.status === 400, 'Rejects empty payload with 400 Bad Request');

    // Test 3: Locked video without subscription
    console.log('\n--- 3. Testing locked video without subscription ---');
    const vidListRes = await fetch(`${BASE_URL}/api/videos`);
    const vidListData = await vidListRes.json();
    const testVideo = (vidListData.videos && vidListData.videos[0]) || { id: 15 };
    const testVideoId = testVideo.id;

    const unauthVidRes = await fetch(`${BASE_URL}/api/videos/${testVideoId}`);
    assert(unauthVidRes.ok, `GET /api/videos/${testVideoId} returned 200`);
    const unauthVidData = await unauthVidRes.json();
    assert(unauthVidData.video.is_locked === true, 'Video is locked for non-subscribed visitor');
    assert(!unauthVidData.video.video_url, 'Actual video URL is protected and hidden from non-subscriber');

    const unauthStreamRes = await fetch(`${BASE_URL}/api/videos/${testVideoId}/stream`);
    assert(unauthStreamRes.status === 403, 'Stream endpoint returns 403 Forbidden for non-subscriber');

    // Test 4: Server-side Payment Link Verification & Access Grant
    console.log('\n--- 4. Testing server-side Payment Link verification & activation ---');
    const testPaymentId = `pay_test_${Date.now()}`;
    const testPaymentLinkId = `plink_test_${Date.now()}`;
    const testEmail = `paylink_user_${Date.now()}@test.com`;

    const verifyRes = await fetch(`${BASE_URL}/api/subscription/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_payment_id: testPaymentId,
        razorpay_payment_link_id: testPaymentLinkId,
        razorpay_payment_link_status: 'paid',
        email: testEmail
      })
    });

    assert(verifyRes.ok, 'Payment verification returned 200 OK');
    const verifyData = await verifyRes.json();
    assert(verifyData.success === true, 'Verification returns success: true');
    assert(verifyData.subscribed === true, 'Verification returns subscribed: true');

    const rawCookies = verifyRes.headers.get('set-cookie');
    assert(Boolean(rawCookies && rawCookies.includes('vh_sub_token')), 'Response sets secure vh_sub_token cookie');

    const subTokenMatch = rawCookies.match(/vh_sub_token=([^;]+)/);
    const subCookie = subTokenMatch ? `vh_sub_token=${subTokenMatch[1]}` : rawCookies;

    // Test 5: Verify status with session cookie
    console.log('\n--- 5. Testing subscription status with verified cookie ---');
    const statusRes = await fetch(`${BASE_URL}/api/subscription/status`, {
      headers: { Cookie: subCookie }
    });
    assert(statusRes.ok, 'Status check returned 200 OK');
    const statusData = await statusRes.json();
    assert(statusData.subscribed === true, 'Subscription status reports subscribed: true');

    // Test 6: Verify video is now unlocked
    console.log('\n--- 6. Testing video detail & stream access for verified subscriber ---');
    const authVidRes = await fetch(`${BASE_URL}/api/videos/${testVideoId}`, {
      headers: { Cookie: subCookie }
    });
    assert(authVidRes.ok, 'Video detail returned 200 OK');
    const authVidData = await authVidRes.json();
    assert(authVidData.video.is_locked === false, 'Video is now unlocked for verified subscriber');
    assert(Boolean(authVidData.video.video_url), 'Video playback URL is provided to verified subscriber');

    const authStreamRes = await fetch(`${BASE_URL}/api/videos/${testVideoId}/stream`, {
      headers: { Cookie: subCookie }
    });
    assert(authStreamRes.status === 200 || authStreamRes.status === 206, 'Stream endpoint allows access (200/206) for verified subscriber');

    // Test 7: Testing Webhook for payment_link.paid
    console.log('\n--- 7. Testing Webhook processing for payment_link.paid ---');
    const webhookPlinkId = `plink_wh_${Date.now()}`;
    const webhookPaymentId = `pay_wh_${Date.now()}`;
    const webhookEmail = `wh_user_${Date.now()}@test.com`;

    const webhookRes = await fetch(`${BASE_URL}/api/subscription/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'payment_link.paid',
        payload: {
          payment_link: {
            entity: {
              id: webhookPlinkId,
              payment_id: webhookPaymentId,
              customer: {
                email: webhookEmail
              }
            }
          },
          payment: {
            entity: {
              id: webhookPaymentId,
              email: webhookEmail,
              status: 'captured',
              amount: 900
            }
          }
        }
      })
    });
    assert(webhookRes.ok, 'Webhook endpoint returned 200 OK');
    const webhookData = await webhookRes.json();
    assert(webhookData.status === 'processed', 'Webhook event processed successfully');

    // Test 8: Testing access restore for email from webhook
    console.log('\n--- 8. Testing Restore Access with webhook customer email ---');
    const restoreRes = await fetch(`${BASE_URL}/api/subscription/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: webhookEmail })
    });
    assert(restoreRes.ok, 'Restore access returned 200 OK');
    const restoreData = await restoreRes.json();
    assert(restoreData.success === true, 'Restore access granted successfully');
    assert(restoreData.subscribed === true, 'Restored status is active');

    console.log(`\n🎉 All tests passed successfully! (${passed}/${passed + failed})`);
  } catch (err) {
    console.error('\n❌ Test suite stopped due to error:', err.message);
    process.exit(1);
  }
}

runTests();
