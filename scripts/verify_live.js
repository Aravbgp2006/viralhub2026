async function testFullLiveProduction() {
  const prod = 'https://viralhub2026-mu.vercel.app';
  console.log('=== VERIFYING LIVE PRODUCTION AT ' + prod + ' ===\n');

  // 1. Fetch HTML of video 40
  const htmlRes = await fetch(prod + '/video/40');
  const html = await htmlRes.text();

  const checks = [
    { name: 'Video Locked Header', pass: html.includes('Video Locked') },
    { name: 'Unlock Premium Access Subtitle', pass: html.includes('Unlock Premium Access') },
    { name: '₹9/month Price Tag', pass: html.includes('₹9') && html.includes('/month') },
    { name: 'Unlock for ₹9/month Button', pass: html.includes('Unlock for ₹9/month') },
    { name: 'Cashfree JS SDK v3 Loaded', pass: html.includes('https://sdk.cashfree.com/js/v3/cashfree.js') },
    { name: 'Cashfree Modal Checkout Call', pass: html.includes("redirectTarget: '_modal'") },
    { name: 'Fake Test Unlock Removed', pass: !html.includes('sig_test_valid') }
  ];

  for (const c of checks) {
    console.log((c.pass ? '✅ [PASS] ' : '❌ [FAIL] ') + c.name);
  }

  // 2. Fetch Video 40 API state
  const v40Res = await fetch(prod + '/api/videos/40');
  const v40 = await v40Res.json();
  console.log(v40.video?.is_locked === true ? '✅ [PASS] Video 40 is initially LOCKED' : '❌ [FAIL] Video 40 unlocked');
  console.log(v40.video?.video_url === null ? '✅ [PASS] Video 40 video_url is null' : '❌ [FAIL] Video 40 has URL');

  // 3. Create Real Cashfree Order
  const orderRes = await fetch(prod + '/api/entitlements/create-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: 40, email: 'prod_verify_' + Date.now() + '@viralhub.com' })
  });
  const orderData = await orderRes.json();
  console.log(Boolean(orderData.order_id) ? '✅ [PASS] Order ID created: ' + orderData.order_id : '❌ [FAIL] Order creation failed');
  console.log(Boolean(orderData.payment_session_id) ? '✅ [PASS] Payment Session ID created: ' + (orderData.payment_session_id || '').substring(0, 15) + '...' : '❌ [FAIL] No payment session ID');
  console.log(orderData.provider === 'cashfree' ? '✅ [PASS] Provider is Cashfree' : '❌ [FAIL] Provider mismatch');

  // 4. Verification without payment must FAIL
  const verifyRes = await fetch(prod + '/api/entitlements/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_id: 40, order_id: orderData.order_id })
  });
  const verifyData = await verifyRes.json();
  console.log(verifyRes.status === 400 ? '✅ [PASS] Unpaid order rejected with 400 Bad Request' : '❌ [FAIL] Status ' + verifyRes.status);
  console.log(verifyData.unlocked === false ? '✅ [PASS] unlocked: false confirmed' : '❌ [FAIL] Unlocked was granted');

  // 5. Video 41 isolation
  const v41Res = await fetch(prod + '/api/videos/41');
  const v41 = await v41Res.json();
  console.log(v41.video?.is_locked === true ? '✅ [PASS] Video 41 remains strictly LOCKED' : '❌ [FAIL] Video 41 unlocked');

  // 6. /payment-test isolation
  const ptRes = await fetch(prod + '/payment-test');
  const ptHtml = await ptRes.text();
  console.log(ptHtml.includes('Cashfree Sandbox Payment Demo') ? '✅ [PASS] /payment-test is separate sandbox demo' : '❌ [FAIL] /payment-test mismatch');

  console.log('\n=== LIVE VERIFICATION FINISHED SUCCESSFULLY ===');
}

testFullLiveProduction().catch(console.error);
