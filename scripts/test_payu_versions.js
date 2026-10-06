require('dotenv').config();
const crypto = require('crypto');
const { getKey, getSalt } = require('../services/payu');

async function test(name, apiVersion) {
  const key = getKey();
  const salt = getSalt();
  const txnid = 'tx_test_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const amount = '9.00';
  const productinfo = 'Unlock Video 41';
  const firstname = 'Customer';
  const email = 'test@example.com';
  const phone = '9999999999';
  const surl = 'https://viralhub2026-mu.vercel.app/api/payment/payu/success';
  const furl = 'https://viralhub2026-mu.vercel.app/api/payment/payu/failure';

  const params = {
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    phone,
    surl,
    furl,
    udf1: '41'
  };

  let hash = '';
  if (apiVersion === 19) {
    params.api_version = '19';
    // v19 sequence:
    // key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|user_token|offer_key|offer_auto_apply|cart_details|extra_charges|phone|SALT
    const hashStr = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|41|||||||||||||||${phone}|${salt}`;
    hash = crypto.createHash('sha512').update(hashStr).digest('hex').toLowerCase();
  } else {
    // Standard sequence:
    // key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT
    const hashStr = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|41||||||||||${salt}`;
    hash = crypto.createHash('sha512').update(hashStr).digest('hex').toLowerCase();
  }
  params.hash = hash;

  const form = new URLSearchParams(params);
  const res = await fetch('https://secure.payu.in/_payment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: form.toString(),
    redirect: 'manual'
  });

  const location = res.headers.get('location');
  const text = !location ? (await res.text()).substring(0, 200) : '';
  console.log(`${name}: HTTP ${res.status} ${res.statusText}`);
  if (location) {
    console.log(`  -> Redirect to PayU Checkout: ${location}`);
  } else {
    console.log(`  -> Response: ${text}`);
  }
}

(async () => {
  await test('Standard PayU (no api_version)', null);
  await test('PayU with api_version=19', 19);
})();
