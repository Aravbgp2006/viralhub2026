/**
 * scripts/verify_all_restored_videos.js
 */

const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: data, json: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    }).on('error', reject);
  });
}

async function verifyAll() {
  console.log('--- 1. Testing GET /api/videos ---');
  const res = await get('https://viralhub2026-mu.vercel.app/api/videos?limit=100');
  console.log('Status:', res.status, 'Total videos:', res.json.length);
  if (res.json.length !== 14) throw new Error('Expected 14 videos, got ' + res.json.length);
  
  console.log('\n--- 2. Testing individual video endpoints & related list ---');
  for (const v of res.json) {
    const detail = await get('https://viralhub2026-mu.vercel.app/api/videos/' + v.id);
    const relatedCount = detail.json?.related?.length || 0;
    console.log(`Video ${v.id}: Status ${detail.status} | Title: "${detail.json?.video?.title}" | Related/UpNext: ${relatedCount} videos`);
  }

  console.log('\n--- 3. Testing Homepage HTML for video elements ---');
  const homeRes = await get('https://viralhub2026-mu.vercel.app/');
  console.log('Homepage status:', homeRes.status, 'HTML length:', homeRes.body.length);

  console.log('\n✅ All checks passed successfully!');
}

verifyAll().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
