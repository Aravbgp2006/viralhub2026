require('dotenv').config();
const crypto = require('crypto');
const { getKey, getSalt } = require('../services/payu');

async function testProductInfo(title, productinfo) {
  const key = getKey();
  const salt = getSalt();
  const txnid = 'tx_t_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const amount = '9.00';
  const firstname = 'Customer';
  const email = 'test@example.com';
  const phone = '9999999999';
  const surl = 'https://viralhub2026-mu.vercel.app/api/payment/payu/success';
  const furl = 'https://viralhub2026-mu.vercel.app/api/payment/payu/failure';

  const hashStr = `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|||||||||||${salt}`;
  const hash = crypto.createHash('sha512').update(hashStr).digest('hex').toLowerCase();

  const form = new URLSearchParams({
    key, txnid, amount, productinfo, firstname, email, phone, surl, furl, hash
  });

  const res = await fetch('https://secure.payu.in/_payment', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: form.toString(),
    redirect: 'manual'
  });

  console.log(`[${title}]`);
  console.log(`  productinfo: "${productinfo}"`);
  console.log(`  HTTP status: ${res.status} ${res.statusText}`);
  console.log(`  Server: ${res.headers.get('server')}`);
  console.log(`  Location: ${res.headers.get('location')}`);
}

(async () => {
  await testProductInfo('With # character', 'Unlock Video #41');
  await testProductInfo('Without # character', 'Unlock Video 41');
})();
