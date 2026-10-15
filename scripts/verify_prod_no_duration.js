require('dotenv').config();
const https = require('https');

const PROD_ORIGIN = 'https://viralhub2026-mu.vercel.app';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

function get(path) {
  return new Promise((resolve, reject) => {
    https.get(new URL(path, PROD_ORIGIN), (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    }).on('error', reject);
  });
}

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
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ [PASS] ${message}`);
  }
}

(async () => {
  try {
    console.log('🚀 Verifying Live Production Deployment at', PROD_ORIGIN, '\n');

    // 1. Verify Admin HTML on production
    console.log('--- 1. Checking Admin HTML & JS Assets on Production ---');
    const adminHtmlRes = await get('/admin.html');
    assert(adminHtmlRes.status === 200, 'GET /admin.html returns 200');
    assert(!adminHtmlRes.data.includes('addDisplayDuration'), 'Production admin.html has no #addDisplayDuration');
    assert(!adminHtmlRes.data.includes('editDisplayDuration'), 'Production admin.html has no #editDisplayDuration');
    assert(!adminHtmlRes.data.includes('Display Duration'), 'Production admin.html has no "Display Duration" label');

    const adminJsRes = await get('/admin.js');
    assert(adminJsRes.status === 200, 'GET /admin.js returns 200');
    assert(!adminJsRes.data.includes('validateDisplayDuration'), 'Production admin.js has no validateDisplayDuration');
    assert(!adminJsRes.data.includes('display_duration'), 'Production admin.js has no display_duration references');

    // 2. Verify Public Frontend Assets on production
    console.log('\n--- 2. Checking Public HTML/JS/CSS Assets on Production ---');
    const appJsRes = await get('/app.js');
    assert(appJsRes.status === 200, 'GET /app.js returns 200');
    assert(!appJsRes.data.includes('video-badge-duration'), 'Production app.js does not render video-badge-duration');

    const videoHtmlRes = await get('/video.html');
    assert(videoHtmlRes.status === 200, 'GET /video.html returns 200');
    assert(!videoHtmlRes.data.includes('videoDurationBadge'), 'Production video.html has no videoDurationBadge');
    assert(!videoHtmlRes.data.includes('videoDurationSep'), 'Production video.html has no videoDurationSep');
    assert(!videoHtmlRes.data.includes('related-duration'), 'Production video.html does not render related-duration');

    const styleCssRes = await get('/style.css');
    assert(styleCssRes.status === 200, 'GET /style.css returns 200');
    assert(styleCssRes.data.includes('.video-badge-duration') && styleCssRes.data.includes('display: none !important;'), 'Production style.css hides .video-badge-duration');
    assert(styleCssRes.data.includes('.related-duration') && styleCssRes.data.includes('display: none !important;'), 'Production style.css hides .related-duration');

    // 3. Verify Existing Video on Live Site (No duration shown)
    console.log('\n--- 3. Checking Existing Video Detail Page on Production ---');
    const existingVideoDetail = await get('/video/74');
    assert(existingVideoDetail.status === 200, 'GET /video/74 returns 200');
    assert(!existingVideoDetail.data.includes('videoDurationBadge'), 'Detail page has no duration badge element');
    assert(!existingVideoDetail.data.includes('videoDurationSep'), 'Detail page has no duration separator');

    // Verify unlock button intact and uncropped
    assert(existingVideoDetail.data.includes('id="btnUnlockVideo"'), 'Unlock button #btnUnlockVideo exists');
    assert(existingVideoDetail.data.includes('Unlock for ₹9/month'), 'Button label is "Unlock for ₹9/month"');
    const btnMatch = existingVideoDetail.data.match(/<button id="btnUnlockVideo"[^>]*>([\s\S]*?)<\/button>/);
    assert(Boolean(btnMatch), 'Extracted #btnUnlockVideo outer HTML');
    assert(!btnMatch[1].includes('<svg'), 'No lock icon in #btnUnlockVideo');

    // 4. Admin Live Workflow: Publish, Edit, Verify & Cleanup
    console.log('\n--- 4. Live Production Admin Publishing & Playback Verification ---');
    const loginRes = await request('POST', '/api/admin/login', {
      username: ADMIN_USERNAME,
      password: ADMIN_PASSWORD
    });
    assert(loginRes.status === 200 && loginRes.json.success, 'Production admin login succeeded');

    const setCookie = loginRes.headers['set-cookie'];
    const cookieHeader = setCookie.map(c => c.split(';')[0]).join('; ');
    const authHeaders = { Cookie: cookieHeader };

    let createdId = null;
    try {
      const pubRes = await request('POST', '/api/videos', {
        title: 'Prod Test No Duration ' + Date.now(),
        description: 'Verifying publishing without duration field',
        category: 'latest',
        video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        thumbnail_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&q=80',
        duration_seconds: 30,
        thumbnail_aspect_ratio: '16:9',
        published: true
      }, authHeaders);
      assert(pubRes.status === 201 && pubRes.json.success, 'Published video on production successfully');
      createdId = pubRes.json.video.id;

      // Edit video
      const editRes = await request('PUT', `/api/videos/${createdId}`, {
        title: pubRes.json.video.title + ' (Edited)',
        description: 'Edited description',
        category: 'latest',
        views: 123,
        published: true
      }, authHeaders);
      assert(editRes.status === 200 && editRes.json.success, 'Edited video on production successfully');

      // Test streaming access
      const streamRes = await request('GET', `/api/videos/${createdId}/stream`, null, authHeaders);
      assert(streamRes.status === 200 || streamRes.status === 302 || streamRes.status === 206, `Playback streaming endpoint responded with HTTP ${streamRes.status}`);

      console.log('✅ End-to-end admin publishing, editing, and playback verified on live production!');
    } finally {
      if (createdId) {
        console.log(`Cleaning up production test video ID ${createdId}...`);
        await request('DELETE', `/api/videos/${createdId}`, null, authHeaders);
      }
    }

    console.log('\n======================================================');
    console.log('🎉 ALL LIVE PRODUCTION VERIFICATIONS PASSED 100%!');
    console.log('======================================================');
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  }
})();
