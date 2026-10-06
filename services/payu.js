/**
 * services/payu.js
 * 
 * PayU Production Payment Gateway Service for ViralHub
 * 
 * Handles PayU payment payload generation, server-side SHA-512 hashing,
 * reverse hash verification, and server-to-server payment verification.
 * 
 * Strictly keeps PAYU_SALT and PAYU_CLIENT_SECRET server-side.
 * Uses PayU Production endpoint: https://secure.payu.in/_payment
 */

require('dotenv').config();
const crypto = require('crypto');

const PAYU_PROD_PAYMENT_URL = 'https://secure.payu.in/_payment';
const PAYU_TEST_PAYMENT_URL = 'https://test.payu.in/_payment';

const PAYU_PROD_VERIFY_URL = 'https://info.payu.in/merchant/postservice.php?form=2';
const PAYU_TEST_VERIFY_URL = 'https://test.payu.in/merchant/postservice.php?form=2';

function getKey() {
  return (process.env.PAYU_KEY || '').trim();
}

function getSalt() {
  return (process.env.PAYU_SALT || '').trim();
}

function getClientId() {
  return (process.env.PAYU_CLIENT_ID || '').trim();
}

function getClientSecret() {
  return (process.env.PAYU_CLIENT_SECRET || '').trim();
}

function getEnvironment() {
  const env = (process.env.PAYU_ENV || 'production').trim().toLowerCase();
  if (env === 'test' || env === 'sandbox') return 'sandbox';
  return 'production';
}

function getPaymentUrl() {
  return getEnvironment() === 'production' ? PAYU_PROD_PAYMENT_URL : PAYU_TEST_PAYMENT_URL;
}

function getVerifyUrl() {
  return getEnvironment() === 'production' ? PAYU_PROD_VERIFY_URL : PAYU_TEST_VERIFY_URL;
}

/**
 * Returns true if PayU credentials are set and non-placeholder.
 */
function isPayUConfigured() {
  const key = getKey();
  const salt = getSalt();
  if (!key || !salt) return false;
  if (key.includes('YOUR_') || salt.includes('YOUR_') || key.length < 5) return false;
  return true;
}

/**
 * Safe public configuration object for client.
 * NEVER exposes salt, client_secret, or private keys.
 */
function getPayUPublicConfig() {
  const configured = isPayUConfigured();
  const key = getKey();
  return {
    provider: 'payu',
    configured,
    environment: getEnvironment(),
    payment_url: getPaymentUrl(),
    key: configured ? key : null,
    key_preview: configured && key.length > 4 ? `${key.slice(0, 3)}...${key.slice(-2)}` : null
  };
}

/**
 * Generates PayU payment request SHA-512 hash:
 * Standard:
 * sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 * api_version=19:
 * sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|user_token|offer_key|offer_auto_apply|cart_details|extra_charges|phone|SALT)
 */
function generatePaymentHash({
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  phone = '',
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  udf6 = '',
  udf7 = '',
  udf8 = '',
  udf9 = '',
  udf10 = '',
  api_version = ''
}) {
  const key = getKey();
  const salt = getSalt();
  if (!key || !salt) {
    throw new Error('PayU Key or Salt is not configured.');
  }

  const formattedAmount = parseFloat(amount).toFixed(2);
  const cleanProductInfo = String(productinfo || 'Unlock Video')
    .replace(/#/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
  const cleanFirstname = String(firstname || 'Customer')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .substring(0, 50) || 'Customer';
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = String(phone || '').replace(/[^0-9]/g, '').slice(-10);

  let hashString = '';
  if (String(api_version) === '19') {
    hashString = `${key}|${txnid}|${formattedAmount}|${cleanProductInfo}|${cleanFirstname}|${cleanEmail}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}|${udf6}|${udf7}|${udf8}|${udf9}|${udf10}||||||${cleanPhone}|${salt}`;
  } else {
    hashString = `${key}|${txnid}|${formattedAmount}|${cleanProductInfo}|${cleanFirstname}|${cleanEmail}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
  }

  return crypto.createHash('sha512').update(hashString).digest('hex').toLowerCase();
}

/**
 * Generates PayU return hash (reverse hash):
 * If additionalCharges:
 * sha512(additionalCharges|SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 * Else:
 * sha512(SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
function generateReturnHash(params) {
  const key = getKey();
  const salt = getSalt();
  if (!key || !salt) {
    throw new Error('PayU Key or Salt is not configured.');
  }

  const {
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    status,
    additionalCharges,
    udf1 = '',
    udf2 = '',
    udf3 = '',
    udf4 = '',
    udf5 = ''
  } = params;

  if (!txnid || !status) {
    throw new Error('txnid and status are required to generate return hash');
  }

  const formattedAmount = parseFloat(amount).toFixed(2);
  const pInfo = String(productinfo || '').trim();
  const fName = String(firstname || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();

  let hashString = '';
  if (additionalCharges) {
    hashString = `${additionalCharges}|${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${cleanEmail}|${fName}|${pInfo}|${formattedAmount}|${txnid}|${key}`;
  } else {
    hashString = `${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${cleanEmail}|${fName}|${pInfo}|${formattedAmount}|${txnid}|${key}`;
  }

  return crypto.createHash('sha512').update(hashString).digest('hex').toLowerCase();
}

/**
 * Verifies PayU return hash (reverse hash)
 */
function verifyReturnHash(params) {
  if (!params?.hash || !params?.txnid || !params?.status) return false;

  try {
    const calculatedHash = generateReturnHash(params);
    const receivedHash = String(params.hash).toLowerCase();

    return crypto.timingSafeEqual(
      Buffer.from(calculatedHash, 'utf8'),
      Buffer.from(receivedHash, 'utf8')
    );
  } catch (_) {
    return false;
  }
}

/**
 * Safe diagnostic logger for PayU operations.
 * Logs ONLY safe diagnostic information: endpoint, method, txnid, amount, status, statusMessage.
 * NEVER logs key, salt, client secret, or hash.
 */
function logSafeDiagnostic(data) {
  const safe = {
    tag: 'PayU_Diagnostic',
    endpoint: data.endpoint || getPaymentUrl(),
    method: data.method || 'POST',
    txnid: data.txnid || undefined,
    amount: data.amount != null ? Number(data.amount).toFixed(2) : undefined,
    status: data.status != null ? data.status : undefined,
    statusMessage: data.statusMessage ? String(data.statusMessage).substring(0, 100) : undefined
  };
  console.log(`[PayU Safe Diagnostic]`, JSON.stringify(safe));
}

/**
 * Server-to-server verification via PayU verify_payment API:
 * Endpoint: https://info.payu.in/merchant/postservice.php?form=2
 * command: verify_payment
 * var1: txnid
 * hash = sha512(key|verify_payment|txnid|SALT)
 */
async function verifyPaymentWithPayU(txnid) {
  const key = getKey();
  const salt = getSalt();
  if (!key || !salt) {
    return { success: false, error: 'PayU credentials are not configured.' };
  }

  const command = 'verify_payment';
  const hashString = `${key}|${command}|${txnid}|${salt}`;
  const hash = crypto.createHash('sha512').update(hashString).digest('hex').toLowerCase();

  const url = getVerifyUrl();
  const body = new URLSearchParams({
    key,
    command,
    var1: txnid,
    hash
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    });

    logSafeDiagnostic({
      endpoint: url,
      method: 'POST',
      txnid: txnid,
      status: response.status,
      statusMessage: response.statusText
    });

    const data = await response.json();
    if (data.status === 1 && data.transaction_details && data.transaction_details[txnid]) {
      const details = data.transaction_details[txnid];
      const isSuccess = details.status === 'success';
      return {
        success: true,
        is_paid: isSuccess,
        status: details.status,
        amount: details.amt,
        mihpayid: details.mihpayid,
        txnid: txnid,
        raw: details
      };
    }

    return {
      success: false,
      is_paid: false,
      status: data.msg || 'Transaction not found',
      raw: data
    };
  } catch (err) {
    logSafeDiagnostic({
      endpoint: url,
      method: 'POST',
      txnid: txnid,
      statusMessage: 'Error: ' + err.message
    });
    return {
      success: false,
      error: 'Failed to verify transaction with PayU: ' + err.message
    };
  }
}

/**
 * Creates PayU payment payload ready for submission to https://secure.payu.in/_payment
 * Guarantees that amount/productinfo/firstname/email in the hash EXACTLY match
 * the values submitted to PayU.
 * Strips '#' and unwanted characters from productinfo to avoid AWS ALB WAF 403 blocks.
 */
function createPayUPaymentPayload(options = {}) {
  if (!isPayUConfigured()) {
    throw new Error('PayU Production credentials (PAYU_KEY / PAYU_SALT) are not configured in environment.');
  }

  const videoId = options.videoId || options.video_id;
  const txnid = options.txnid || `tx_vid_${videoId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const amount = parseFloat(options.amount || 9.00).toFixed(2);

  // Clean productinfo: alphanumeric, spaces, dashes, underscores only, NO '#', max 100 chars
  const rawProduct = options.productinfo || `Unlock Video ${videoId}`;
  const cleanProductInfo = String(rawProduct)
    .replace(/#/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100) || `Unlock Video ${videoId}`;

  // Clean email and firstname
  const cleanEmail = String(options.email || 'customer@viralhub.com').trim().toLowerCase();
  const rawFirstname = options.firstname || (cleanEmail ? cleanEmail.split('@')[0] : 'Customer');
  const cleanFirstname = String(rawFirstname)
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .substring(0, 50) || 'Customer';

  // Clean phone: 10 digits
  const rawPhone = String(options.phone || '9999999999').replace(/[^0-9]/g, '');
  const cleanPhone = (rawPhone.length >= 10 ? rawPhone.slice(-10) : '9999999999');

  const udf1 = String(videoId || '');
  const udf2 = String(options.userId || options.user_id || '');
  const udf3 = options.planType || 'monthly';
  const udf4 = '';
  const udf5 = '';

  const surl = options.surl;
  const furl = options.furl;

  if (!surl || !furl) {
    throw new Error('Success (surl) and Failure (furl) callback URLs are required.');
  }

  // Check if api_version=19 is requested
  const isV19 = String(options.api_version || process.env.PAYU_API_VERSION || '').trim() === '19';
  const api_version = isV19 ? '19' : undefined;

  // Generate hash using the EXACT sanitized values submitted to PayU
  const hash = generatePaymentHash({
    txnid,
    amount,
    productinfo: cleanProductInfo,
    firstname: cleanFirstname,
    email: cleanEmail,
    phone: cleanPhone,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5,
    api_version
  });

  const params = {
    key: getKey(),
    txnid,
    amount,
    productinfo: cleanProductInfo,
    firstname: cleanFirstname,
    email: cleanEmail,
    phone: cleanPhone,
    surl,
    furl,
    hash,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5
  };

  if (isV19) {
    params.api_version = '19';
  }

  // Safe diagnostic log (NEVER log key, salt, client secret, or hash)
  logSafeDiagnostic({
    endpoint: getPaymentUrl(),
    method: 'POST',
    txnid: txnid,
    amount: amount,
    statusMessage: `Payload generated (${isV19 ? 'api_version=19' : 'standard'})`
  });

  return {
    action: getPaymentUrl(),
    params
  };
}

module.exports = {
  getKey,
  getSalt,
  getClientId,
  getClientSecret,
  getEnvironment,
  getPaymentUrl,
  getVerifyUrl,
  isPayUConfigured,
  getPayUPublicConfig,
  generatePaymentHash,
  generateReturnHash,
  verifyReturnHash,
  verifyPaymentWithPayU,
  createPayUPaymentPayload,
  logSafeDiagnostic
};
