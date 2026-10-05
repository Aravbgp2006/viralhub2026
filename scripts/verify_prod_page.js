const https = require('https');

https.get('https://viralhub2026-mu.vercel.app/video/41', (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('HTTP Status:', res.statusCode);
    console.log('Has #btnUnlockVideo:', data.includes('id="btnUnlockVideo"'));
    console.log('Has Unlock for ₹9/month button text:', data.includes('Unlock for ₹9/month'));
    console.log('Has #unlockErrorAlert element:', data.includes('id="unlockErrorAlert"'));
    console.log('Has #videoLockOverlay:', data.includes('id="videoLockOverlay"'));
    console.log('Has startPaymentFlow function:', data.includes('startPaymentFlow'));
    console.log('Has Payment Link redirect:', data.includes('window.location.href = paymentLinkUrl'));
    console.log('Has Razorpay SDK checkout popup open:', data.includes('rzp.open()'));
    console.log('Has visible error handling:', data.includes('showErrorMessage'));
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
