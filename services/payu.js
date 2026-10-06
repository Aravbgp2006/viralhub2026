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
 * sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 */
function generatePaymentHash({ txnid, amount, productinfo, firstname, email, udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '' }) {
  const key = getKey();
  const salt = getSalt();
  if (!key || !salt) {
    throw new Error('PayU Key or Salt is not configured.');
  }

  const formattedAmount = parseFloat(amount).toFixed(2);
  const cleanProductInfo = String(productinfo || '').replace(/[\r\n\t]/g, ' ').trim();
  const cleanFirstname = String(firstname || 'Customer').replace(/[\r\n\t]/g, ' ').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();

  // PayU standard hash sequence: 5 pipes for empty udf6..udf10 between udf5 and salt
  const hashString = `${key}|${txnid}|${formattedAmount}|${cleanProductInfo}|${cleanFirstname}|${cleanEmail}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
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
  const cleanProductInfo = String(productinfo || '').replace(/[\r\n\t]/g, ' ').trim();
  const cleanFirstname = String(firstname || '').replace(/[\r\n\t]/g, ' ').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();

  let hashString = '';
  if (additionalCharges) {
    hashString = `${additionalCharges}|${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${cleanEmail}|${cleanFirstname}|${cleanProductInfo}|${formattedAmount}|${txnid}|${key}`;
  } else {
    hashString = `${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${cleanEmail}|${cleanFirstname}|${cleanProductInfo}|${formattedAmount}|${txnid}|${key}`;
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
    console.error('[PayU Verify API Error]:', err.message);
    return {
      success: false,
      error: 'Failed to verify transaction with PayU: ' + err.message
    };
  }
}

/**
 * Creates PayU payment payload ready for submission to https://secure.payu.in/_payment
 */
function createPayUPaymentPayload(options) {
  if (!isPayUConfigured()) {
    throw new Error('PayU Production credentials (PAYU_KEY / PAYU_SALT) are not configured in environment.');
  }

  const videoId = options.videoId || options.video_id;
  const txnid = options.txnid || `tx_vid_${videoId}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const amount = Number(options.amount || 9.00).toFixed(2);
  const productinfo = options.productinfo || `Unlock Video #${videoId}`;
  const email = (options.email || 'customer@viralhub.com').trim().toLowerCase();
  const firstname = options.firstname || (email ? email.split('@')[0] : 'Customer');
  const phone = (options.phone || '9999999999').trim();
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

  const hash = generatePaymentHash({
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1,
    udf2,
    udf3,
    udf4,
    udf5
  });

  return {
    action: getPaymentUrl(),
    params: {
      key: getKey(),
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      phone,
      surl,
      furl,
      hash,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5
    }
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
  createPayUPaymentPayload
};
