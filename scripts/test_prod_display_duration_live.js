require('dotenv').config();
const https = require('https');

const PROD_ORIGIN = 'https://viralhub2026-mu.vercel.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PROD_ORIGIN);
    const reqHeaders = { ...headers };
    let reqBody = null;

    if (body) {
      if (typeof body === 'string') {
        reqBody = body;
      } else {
        reqBody = JSON.stringify(body);
        reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(reqBody);
    }

    const req = https.request(url, {
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data
        });
      });
    });

    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

(async () => {
  try {
    console.log('🚀 Running Live End-to-End Test on Production:', PROD_ORIGIN);

    // 1. Admin login
    const loginRes = await request('POST', '/api/admin/login', {
      username: process.env.ADMIN_USERNAME || 'admin',
      password: ADMIN_PASSWORD || 'admin123'
    });
    console.log('1. Admin login status:', loginRes.status);
    if (loginRes.status !== 200) throw new Error('Admin login failed: ' + loginRes.data);

    const setCookie = loginRes.headers['set-cookie'];
    if (!setCookie) throw new Error('No cookie returned from login');
    const cookieHeader = setCookie.map(c => c.split(';')[0]).join('; ');
    const authHeaders = { Cookie: cookieHeader };

    // 2. Publish a test video with display_duration "3:00"
    const newVideoPayload = {
      title: 'Vercel Prod Test Video ' + Date.now(),
      description: 'Automated test video for display duration',
      category: 'General',
      video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnail_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&q=80',
      display_duration: '3:00',
      duration_seconds: 18,
      thumbnail_aspect_ratio: '16:9',
      published: true
    };

    let videoId = null;
    try {
      const createRes = await request('POST', '/api/videos', newVideoPayload, authHeaders);
      console.log('2. Publish video status:', createRes.status);
      if (createRes.status !== 201) throw new Error('Create video failed: ' + createRes.data);
      const createdJson = JSON.parse(createRes.data);
      videoId = createdJson.video.id;
      console.log(`   Created video ID ${videoId}: duration="${createdJson.video.duration}", display_duration="${createdJson.video.display_duration}"`);

      if (createdJson.video.duration !== '03:00') {
        throw new Error(`Expected duration "03:00", got "${createdJson.video.duration}"`);
      }
      if (createdJson.video.display_duration !== '3:00') {
        throw new Error(`Expected display_duration "3:00", got "${createdJson.video.display_duration}"`);
      }

      // 3. Verify public GET /api/videos on production
      const listRes = await request('GET', '/api/videos');
      const listVideos = JSON.parse(listRes.data);
      const foundInList = listVideos.find(v => v.id === videoId);
      if (!foundInList) throw new Error('New video not found in public list');
      console.log('3. Public GET /api/videos formatted duration:', foundInList.duration, '| display_duration:', foundInList.display_duration);
      if (foundInList.duration !== '03:00') throw new Error('Public list duration does not match');

      // 4. Verify public GET /api/videos/:id on production
      const detailRes = await request('GET', `/api/videos/${videoId}`);
      const detailJson = JSON.parse(detailRes.data);
      const detailVideo = detailJson.video;
      console.log('4. Public GET /api/videos/:id duration:', detailVideo.duration, '| display_duration:', detailVideo.display_duration);
      if (detailVideo.duration !== '03:00') throw new Error('Detail video duration does not match');

      // 5. Edit video to Display Duration "1:05:30"
      const updateRes = await request('PUT', `/api/videos/${videoId}`, {
        title: newVideoPayload.title + ' (Updated)',
        description: 'Updated description',
        category: 'General',
        display_duration: '1:05:30',
        duration_seconds: 18,
        published: true
      }, authHeaders);
      console.log('5. Edit video status:', updateRes.status);
      const updatedJson = JSON.parse(updateRes.data);
      console.log(`   Updated duration="${updatedJson.video.duration}", display_duration="${updatedJson.video.display_duration}"`);
      if (updatedJson.video.duration !== '1:05:30') throw new Error('Updated duration did not format to 1:05:30');

      // 6. Edit video with empty display_duration (fallback to actual 18s -> "00:18")
      const fallbackRes = await request('PUT', `/api/videos/${videoId}`, {
        title: newVideoPayload.title + ' (Fallback)',
        description: 'Fallback test',
        category: 'General',
        display_duration: '',
        duration_seconds: 18,
        published: true
      }, authHeaders);
      console.log('6. Fallback edit status:', fallbackRes.status);
      const fallbackJson = JSON.parse(fallbackRes.data);
      console.log(`   Fallback duration="${fallbackJson.video.duration}", display_duration="${fallbackJson.video.display_duration}"`);
      if (fallbackJson.video.duration !== '00:18') throw new Error('Fallback did not revert to actual duration 00:18');
      if (fallbackJson.video.display_duration !== null) throw new Error('display_duration is not null after clearing');
    } finally {
      if (videoId) {
        console.log(`Cleaning up test video ID ${videoId}...`);
        await request('DELETE', `/api/videos/${videoId}`, null, authHeaders);
      }
      // Also clean up ID 88 if it was created previously
      try {
        await request('DELETE', '/api/videos/88', null, authHeaders);
      } catch (_) {}
    }

    console.log('\n======================================================');
    console.log('✅ ALL PRODUCTION LIVE END-TO-END TESTS PASSED 100%!');
    console.log('======================================================');
  } catch (err) {
    console.error('❌ Production test error:', err.message);
    process.exit(1);
  }
})();
