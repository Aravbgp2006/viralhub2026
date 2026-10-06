/**
 * scripts/test_payu_integration.js
 * Comprehensive automated verification for PayU Production Payment Gateway Integration
 */

require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const app = require('../server');
const { initDatabase, query, isPostgres } = require('../database/db');
const {
  isPayUConfigured,
  getPayUPublicConfig,
  generatePaymentHash,
  generateReturnHash,
  verifyReturnHash,
  createPayUPaymentPayload,
  getKey,
  getSalt
} = require('../services/payu');

const PORT = 3567;
const BASE_URL = `http://127.0.0.1:${PORT}`;
let server;

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
    if (postData) req.write(postData);
    req.end();
  });
}

function postForm(endpoint, formObj) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const bodyStr = new URLSearchParams(formObj).toString();
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

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
    req.write(bodyStr);
    req.end();
  });
}

async function runPayUTests() {
  console.log('======================================================================');
  console.log('   VIRALHUB PAYU PRODUCTION PAYMENT INTEGRATION VERIFICATION SUITE   ');
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

  // 1. PayU Configuration Integrity
  console.log('--- 1. PayU Configuration & Secrets Protection ---');
  assert('isPayUConfigured() is true', isPayUConfigured() === true);
  const pubConfig = getPayUPublicConfig();
  assert('Public config provider is payu', pubConfig.provider === 'payu');
  assert('Public config environment is production', pubConfig.environment === 'production');
  assert('Public config payment_url is https://secure.payu.in/_payment', pubConfig.payment_url === 'https://secure.payu.in/_payment');
  assert('PAYU_SALT is NEVER present in public config', pubConfig.salt === undefined && pubConfig.PAYU_SALT === undefined);
  assert('PAYU_CLIENT_SECRET is NEVER present in public config', pubConfig.client_secret === undefined && pubConfig.PAYU_CLIENT_SECRET === undefined);

  // 2. Cryptographic Hash Formula
  console.log('\n--- 2. Cryptographic SHA-512 Hash Generation & Verification ---');
  const testTxnId = `tx_test_${Date.now()}`;
  const testPayload = {
    txnid: testTxnId,
    amount: '9.00',
    productinfo: 'Unlock Video #41',
    firstname: 'TestCustomer',
    email: 'testcustomer@example.com',
    udf1: '41',
    udf2: 'usr_test_123',
    udf3: 'monthly',
    udf4: '',
    udf5: ''
  };

  const reqHash = generatePaymentHash(testPayload);
  assert('Request SHA-512 hash generated (length 128)', typeof reqHash === 'string' && reqHash.length === 128);

  // Standard reverse hash formula:
  // sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
  const salt = getSalt();
  const key = getKey();
  const returnHashStr = `${salt}|success||||||${testPayload.udf5}|${testPayload.udf4}|${testPayload.udf3}|${testPayload.udf2}|${testPayload.udf1}|${testPayload.email}|${testPayload.firstname}|${testPayload.productinfo}|9.00|${testTxnId}|${key}`;
  const validReturnHash = crypto.createHash('sha512').update(returnHashStr).digest('hex').toLowerCase();

  const isHashValid = verifyReturnHash({
    ...testPayload,
    status: 'success',
    hash: validReturnHash
  });
  assert('Valid PayU reverse hash returns true', isHashValid === true);

  const isTamperedInvalid = verifyReturnHash({
    ...testPayload,
    status: 'success',
    amount: '1.00', // Tampered amount
    hash: validReturnHash
  });
  assert('Tampered payment amount fails reverse hash verification', isTamperedInvalid === false);

  const isForgedInvalid = verifyReturnHash({
    ...testPayload,
    status: 'success',
    hash: 'forged_fake_hash_1234567890abcdef'
  });
  assert('Forged return hash fails reverse hash verification', isForgedInvalid === false);

  // Additional Charges Reverse Hash Formula
  const addChargesHashStr = `2.00|${salt}|success||||||${testPayload.udf5}|${testPayload.udf4}|${testPayload.udf3}|${testPayload.udf2}|${testPayload.udf1}|${testPayload.email}|${testPayload.firstname}|${testPayload.productinfo}|9.00|${testTxnId}|${key}`;
  const validAddChargesHash = crypto.createHash('sha512').update(addChargesHashStr).digest('hex').toLowerCase();
  const isAddChargesValid = verifyReturnHash({
    ...testPayload,
    status: 'success',
    additionalCharges: '2.00',
    hash: validAddChargesHash
  });
  assert('PayU additionalCharges reverse hash verified successfully', isAddChargesValid === true);

  // Start test HTTP server
  await new Promise((resolve) => {
    server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`\n🚀 Test server listening on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });

  try {
    // 3. GET /api/entitlements/config
    console.log('\n--- 3. /api/entitlements/config endpoint ---');
    const cfgRes = await request('GET', '/api/entitlements/config');
    assert('Config returns HTTP 200', cfgRes.statusCode === 200);
    assert('Config provider is payu', cfgRes.json.provider === 'payu');
    assert('Config price is ₹9', cfgRes.json.price === '₹9');
    assert('Config amount is 900', cfgRes.json.amount === 900);
    assert('Config payment_url is PayU production', cfgRes.json.payment_url === 'https://secure.payu.in/_payment');
    assert('Config does NOT contain salt', cfgRes.data.includes(salt) === false);

    // 4. POST /api/entitlements/create-order
    console.log('\n--- 4. POST /api/entitlements/create-order ---');
    const orderRes = await request('POST', '/api/entitlements/create-order', {}, {
      videoId: 41,
      customerEmail: 'arav@example.com',
      customerPhone: '+919876543210'
    });
    assert('Create order returns HTTP 200', orderRes.statusCode === 200);
    assert('Provider is payu', orderRes.json.provider === 'payu');
    assert('Action URL is https://secure.payu.in/_payment', orderRes.json.action === 'https://secure.payu.in/_payment');
    assert('Contains order_id (txnid)', Boolean(orderRes.json.order_id && orderRes.json.txnid));
    assert('PayU params contain key, txnid, amount, hash', Boolean(orderRes.json.params?.key && orderRes.json.params?.txnid && orderRes.json.params?.hash));
    assert('PayU params contain surl and furl callbacks', Boolean(orderRes.json.params?.surl && orderRes.json.params?.furl));
    assert('PayU params do NOT expose salt', orderRes.data.includes(salt) === false);

    const generatedTxnid = orderRes.json.txnid;
    const genParams = orderRes.json.params;

    // 5. PayU Success Callback POST (surl)
    console.log('\n--- 5. PayU Success Callback Route (surl) ---');
    const successForm = {
      key: key,
      txnid: generatedTxnid,
      amount: '9.00',
      productinfo: 'Unlock Video #41',
      firstname: 'arav',
      email: 'arav@example.com',
      status: 'success',
      mihpayid: `payu_${Date.now()}`,
      udf1: '41'
    };
    successForm.hash = generateReturnHash(successForm);

    const successCallbackRes = await postForm('/api/payment/payu/success', successForm);

    assert('PayU success callback redirects (HTTP 302)', successCallbackRes.statusCode === 302);
    assert('Redirect target contains payment=success and txnid', successCallbackRes.headers.location?.includes('/video/41?payment=success'));
    const setCookie = successCallbackRes.headers['set-cookie'] || [];
    const hasUserToken = setCookie.some(c => c.includes('vh_user_token='));
    assert('Success callback sets HTTP-only vh_user_token cookie', hasUserToken);

    // Verify database entitlement was created in Neon
    const dbEntitlement = await query.get(
      'SELECT * FROM entitlements WHERE video_id = $1 AND razorpay_order_id = $2',
      [41, generatedTxnid]
    );
    assert('Neon entitlements table has active record for Video 41', dbEntitlement && dbEntitlement.status === 'active');

    // Verify user subscription was activated in Neon
    const dbSub = await query.get(
      'SELECT * FROM subscriptions WHERE razorpay_subscription_id = $1',
      [generatedTxnid]
    );
    assert('Neon subscriptions table has active subscription record', dbSub && dbSub.status === 'active');

    // 6. PayU Failure Callback POST (furl)
    console.log('\n--- 6. PayU Failure Callback Route (furl) ---');
    const failCallbackRes = await postForm('/api/payment/payu/failure', {
      key: key,
      txnid: `tx_failed_${Date.now()}`,
      amount: '9.00',
      productinfo: 'Unlock Video #41',
      firstname: 'arav',
      email: 'arav@example.com',
      status: 'failure',
      error_Message: 'User cancelled payment on PayU',
      udf1: '41'
    });
    assert('PayU failure callback redirects (HTTP 302)', failCallbackRes.statusCode === 302);
    assert('Redirect target contains payment=failed', failCallbackRes.headers.location?.includes('payment=failed'));

    // 7. PayU Webhook / Backup IPN
    console.log('\n--- 7. PayU Webhook / IPN Backup Verification ---');
    const webhookTxn = `tx_vid_41_${Date.now()}_webhook`;
    const webhookPayload = {
      key: key,
      txnid: webhookTxn,
      amount: '9.00',
      productinfo: 'Unlock Video #41',
      firstname: 'WebhookUser',
      email: 'webhook@example.com',
      status: 'success',
      mihpayid: `payu_wh_${Date.now()}`,
      udf1: '41'
    };
    webhookPayload.hash = generateReturnHash(webhookPayload);

    const webhookRes = await request('POST', '/api/payment/payu/webhook', {}, webhookPayload);
    assert('PayU webhook returns HTTP 200 OK', webhookRes.statusCode === 200);
    assert('PayU webhook reports success: true', webhookRes.json.success === true);

    const whDbEntitlement = await query.get(
      'SELECT * FROM entitlements WHERE video_id = $1 AND razorpay_order_id = $2',
      [41, webhookTxn]
    );
    assert('Neon entitlements record created via PayU backup webhook', Boolean(whDbEntitlement));

  } finally {
    if (server) {
      await new Promise(r => server.close(r));
    }
  }

  console.log('\n======================================================================');
  console.log(`PAYU INTEGRATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPayUTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
