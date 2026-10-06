/**
 * scripts/test_cashfree_sandbox.js
 * 
 * Automated test suite for the generic Cashfree Sandbox demo.
 * Confirms order creation, session ID issuance, status verification,
 * secret key protection, frontend asset delivery, and isolation from
 * the existing video/entitlement systems.
 */

const assert = require('assert');

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function runTests() {
  console.log(`\n============================================================`);
  console.log(`🧪 CASHFREE SANDBOX PAYMENT DEMO TEST SUITE`);
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`============================================================\n`);

  let passed = 0;
  let failed = 0;

  function recordPass(testName, details = '') {
    passed++;
    console.log(`✅ PASS: ${testName} ${details ? '— ' + details : ''}`);
  }

  function recordFail(testName, error) {
    failed++;
    console.error(`❌ FAIL: ${testName} — ${error.message || error}`);
  }

  // --- Test 1: Config Endpoint ---
  try {
    const res = await fetch(`${BASE_URL}/api/test-payment/config`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true, 'Expected success: true');
    assert.strictEqual(data.environment, 'sandbox', 'Expected environment: sandbox');

    // Security check: CASHFREE_SECRET_KEY must never be returned
    const rawText = JSON.stringify(data);
    assert.strictEqual(rawText.includes('secret'), false, 'Response must not contain "secret" key');
    if (process.env.CASHFREE_SECRET_KEY) {
      assert.strictEqual(rawText.includes(process.env.CASHFREE_SECRET_KEY), false, 'Secret key value exposed!');
    }

    recordPass('Test 1: Public Config Endpoint', `Environment: ${data.environment}, Configured: ${data.configured}`);
  } catch (err) {
    recordFail('Test 1: Public Config Endpoint', err);
  }

  // --- Test 2: Create Order Endpoint ---
  let createdOrderId = null;
  let createdSessionId = null;
  try {
    const res = await fetch(`${BASE_URL}/api/test-payment/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1.00,
        customer_name: 'Automated Test User',
        customer_phone: '9999999999',
        customer_email: 'test@cashfree.com',
        return_url: `${BASE_URL}/payment-test?order_id={order_id}`
      })
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true, 'Expected success: true');
    assert.ok(data.order_id, 'Missing order_id');
    assert.ok(data.payment_session_id, 'Missing payment_session_id');
    assert.ok(data.payment_session_id.length > 10, 'payment_session_id is too short');

    createdOrderId = data.order_id;
    createdSessionId = data.payment_session_id;

    // Security check: No secrets in order payload
    const rawText = JSON.stringify(data);
    assert.strictEqual(rawText.includes('x-client-secret'), false, 'Headers leaked in body');
    if (process.env.CASHFREE_SECRET_KEY) {
      assert.strictEqual(rawText.includes(process.env.CASHFREE_SECRET_KEY), false, 'Secret key value exposed in order response!');
    }

    recordPass('Test 2: Create Sandbox Order (₹1)', `Order ID: ${createdOrderId}, Session ID: ${createdSessionId.slice(0, 16)}...`);
  } catch (err) {
    recordFail('Test 2: Create Sandbox Order (₹1)', err);
  }

  // --- Test 3: Verify Order Endpoint ---
  try {
    assert.ok(createdOrderId, 'Requires order_id from Test 2');
    const res = await fetch(`${BASE_URL}/api/test-payment/verify-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: createdOrderId })
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true, 'Expected success: true');
    assert.strictEqual(data.order_id, createdOrderId, 'order_id mismatch');
    assert.ok(['PAID', 'ACTIVE'].includes(data.order_status), `Unexpected status: ${data.order_status}`);

    recordPass('Test 3: Server-side Order Verification', `Verified status: ${data.order_status}`);
  } catch (err) {
    recordFail('Test 3: Server-side Order Verification', err);
  }

  // --- Test 4: Verify Order GET Route Alias ---
  try {
    assert.ok(createdOrderId, 'Requires order_id from Test 2');
    const res = await fetch(`${BASE_URL}/api/test-payment/verify-order?order_id=${encodeURIComponent(createdOrderId)}`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    recordPass('Test 4: Verification GET Route Alias', `Status: ${data.order_status}`);
  } catch (err) {
    recordFail('Test 4: Verification GET Route Alias', err);
  }

  // --- Test 5: Standalone Demo HTML Page Delivery ---
  try {
    const res = await fetch(`${BASE_URL}/payment-test`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();

    assert.ok(html.includes('https://sdk.cashfree.com/js/v3/cashfree.js'), 'Must load Cashfree JS SDK v3');
    assert.ok(html.includes('payment_session_id') || html.includes('paymentSessionId'), 'Must handle payment session ID');
    assert.ok(html.includes('mode: \'sandbox\'') || html.includes('mode: "sandbox"'), 'Must initialize SDK in sandbox mode');
    assert.ok(html.includes('1.00'), 'Must display ₹1 test amount');
    assert.ok(html.includes('/api/test-payment/create-order'), 'Must target create-order API');
    assert.ok(html.includes('/api/test-payment/verify-order'), 'Must target verify-order API');

    recordPass('Test 5: Standalone HTML Page Delivery (/payment-test)', 'SDK script and checkout handlers verified');
  } catch (err) {
    recordFail('Test 5: Standalone HTML Page Delivery (/payment-test)', err);
  }

  // --- Test 6: System Isolation Verification ---
  try {
    // Existing video & entitlement APIs must remain completely untouched and functional
    const entRes = await fetch(`${BASE_URL}/api/entitlements/config`);
    assert.strictEqual(entRes.status, 200, 'Entitlements config broken');

    const vidsRes = await fetch(`${BASE_URL}/api/videos`);
    assert.strictEqual(vidsRes.status, 200, 'Videos API broken');

    recordPass('Test 6: System Isolation', 'Video content and entitlement systems untouched');
  } catch (err) {
    recordFail('Test 6: System Isolation', err);
  }

  console.log(`\n============================================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`============================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
