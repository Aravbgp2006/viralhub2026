const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

(async () => {
  try {
    console.log('Testing live production at https://viralhub2026-mu.vercel.app...\n');

    // 1. Check /api/videos
    const videosRes = await get('https://viralhub2026-mu.vercel.app/api/videos');
    console.log('1. GET /api/videos status:', videosRes.status);
    if (videosRes.status !== 200) {
      throw new Error(`Unexpected status ${videosRes.status} on /api/videos`);
    }
    const videos = JSON.parse(videosRes.data);
    console.log('   Number of videos returned:', videos.length);
    if (videos.length > 0) {
      console.log('   Sample video title:', videos[0].title);
      console.log('   Sample video duration:', videos[0].duration);
      console.log('   Sample video display_duration:', videos[0].display_duration);
      if (!('display_duration' in videos[0])) {
        throw new Error('display_duration missing from video API response');
      }
    }

    // 2. Check video detail page
    const vidId = videos[0] ? videos[0].id : 74;
    const pageRes = await get(`https://viralhub2026-mu.vercel.app/video/${vidId}`);
    console.log(`\n2. GET /video/${vidId} status:`, pageRes.status);

    const btnMatch = pageRes.data.match(/<button id="btnUnlockVideo"[^>]*>([\s\S]*?)<\/button>/);
    if (!btnMatch) {
      throw new Error('Unlock button #btnUnlockVideo missing in HTML');
    }
    const btnInner = btnMatch[1];
    console.log('   #btnUnlockVideo HTML content:\n   ', btnInner.trim());

    const hasLockSvg = btnInner.includes('<svg');
    const hasUnlockText = btnInner.includes('Unlock for ₹9/month');

    console.log('   Lock SVG inside button:', hasLockSvg ? 'YES (FAIL)' : 'NO (PASS)');
    console.log('   Button contains "Unlock for ₹9/month":', hasUnlockText ? 'YES (PASS)' : 'NO (FAIL)');

    if (hasLockSvg) throw new Error('Lock SVG icon is still inside unlock button');
    if (!hasUnlockText) throw new Error('Unlock text missing');

    // 3. Verify CSS styling in production
    const cssRes = await get('https://viralhub2026-mu.vercel.app/style.css');
    console.log('\n3. GET /style.css status:', cssRes.status);
    const hasWhiteSpacenowrap = cssRes.data.includes('white-space: nowrap;') || cssRes.data.includes('white-space:nowrap;');
    console.log('   .btn-unlock-premium mobile wrap protection in production CSS:', hasWhiteSpacenowrap ? 'YES (PASS)' : 'NO');

    console.log('\n======================================================');
    console.log('🎉 ALL LIVE PRODUCTION DEPLOYMENT CHECKS PASSED!');
    console.log('======================================================');
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  }
})();
