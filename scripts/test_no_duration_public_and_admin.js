/**
 * scripts/test_no_duration_public_and_admin.js
 * End-to-end verification for:
 * 1. Remove Display Duration from Admin (add & edit forms, validation, and payload)
 * 2. Hide Duration everywhere on the public website (homepage cards, detail page, related videos, carousel)
 * 3. Preserve normal video publishing, editing, playback streaming, and payment/unlock button
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const app = require('../server');

let server;
let serverPort = 3105;
let adminCookie = '';

function request(method, pathUrl, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathUrl, `http://127.0.0.1:${serverPort}`);
    const reqHeaders = { ...headers };
    if (adminCookie && !reqHeaders.cookie && !reqHeaders.Cookie) {
      reqHeaders.cookie = adminCookie;
    }
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
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
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });
    req.on('error', reject);
    if (body) {
      if (typeof body === 'string') {
        req.write(body);
      } else {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(body));
      }
    }
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

async function run() {
  console.log('🚀 Starting test server on port ' + serverPort + '...');
  await new Promise((resolve) => {
    server = app.listen(serverPort, () => {
      resolve();
    });
  });

  try {
    console.log('\n--- SUITE 1: Verify Admin HTML & JS (No Display Duration UI) ---');
    const adminHtml = fs.readFileSync('public/admin.html', 'utf8');
    assert(!adminHtml.includes('addDisplayDuration'), 'public/admin.html has no #addDisplayDuration input');
    assert(!adminHtml.includes('editDisplayDuration'), 'public/admin.html has no #editDisplayDuration input');
    assert(!adminHtml.includes('Display Duration'), 'public/admin.html has no "Display Duration" label');

    const adminJs = fs.readFileSync('public/admin.js', 'utf8');
    assert(!adminJs.includes('validateDisplayDuration'), 'public/admin.js has no validateDisplayDuration function');
    assert(!adminJs.includes('display_duration'), 'public/admin.js has no display_duration references');

    console.log('\n--- SUITE 2: Verify Public HTML/JS/CSS (No Duration Labels) ---');
    const publicAppJs = fs.readFileSync('public/app.js', 'utf8');
    assert(!publicAppJs.includes('video-badge-duration'), 'public/app.js does not render video-badge-duration');

    const videoHtml = fs.readFileSync('public/video.html', 'utf8');
    assert(!videoHtml.includes('videoDurationBadge'), 'public/video.html does not contain videoDurationBadge');
    assert(!videoHtml.includes('videoDurationSep'), 'public/video.html does not contain videoDurationSep');
    assert(!videoHtml.includes('related-duration'), 'public/video.html does not render related-duration');

    const styleCss = fs.readFileSync('public/style.css', 'utf8');
    assert(styleCss.includes('.video-badge-duration') && styleCss.includes('display: none !important;'), 'public/style.css hides .video-badge-duration');
    assert(styleCss.includes('.related-duration') && styleCss.includes('display: none !important;'), 'public/style.css hides .related-duration');

    console.log('\n--- SUITE 3: Admin Login & Authentication ---');
    const loginRes = await request('POST', '/api/admin/login', {}, {
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123'
    });
    assert(loginRes.statusCode === 200 && loginRes.json.success, 'Admin login succeeded');
    const setCookie = loginRes.headers['set-cookie'];
    if (Array.isArray(setCookie)) {
      adminCookie = setCookie.map(c => c.split(';')[0]).join('; ');
    } else if (setCookie) {
      adminCookie = setCookie.split(';')[0];
    }
    assert(adminCookie.includes('admin_token='), 'Received valid admin_token cookie');

    console.log('\n--- SUITE 4: Publish Video without Display Duration ---');
    const pubRes = await request('POST', '/api/videos', {}, {
      title: 'Hidden Duration Test Video ' + Date.now(),
      description: 'Testing publishing with duration hidden everywhere',
      category: 'latest',
      video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnail_url: '/uploads/thumbnails/seed-thumb-1.svg',
      duration_seconds: 25,
      thumbnail_aspect_ratio: '16:9',
      published: true
    });
    assert(pubRes.statusCode === 201 && pubRes.json.success, 'Video published successfully without display_duration');
    const testVideo = pubRes.json.video;
    assert(testVideo.id, `Created video ID ${testVideo.id}`);
    assert(testVideo.duration_seconds === 25, 'Internal duration_seconds preserved for video playback');

    console.log('\n--- SUITE 5: Edit Video without Display Duration ---');
    const editRes = await request('PUT', `/api/videos/${testVideo.id}`, {}, {
      title: testVideo.title + ' (Edited)',
      description: 'Updated description without display duration',
      category: 'latest',
      views: 42,
      published: true
    });
    assert(editRes.statusCode === 200 && editRes.json.success, 'Video edited successfully');
    assert(editRes.json.video.title.includes('(Edited)'), 'Title updated');
    assert(Number(editRes.json.video.views) === 42, 'Views updated to 42');

    console.log('\n--- SUITE 6: Verify Public Endpoints & Pages ---');
    // 1. Homepage GET /
    const homeHtmlRes = await request('GET', '/');
    assert(homeHtmlRes.statusCode === 200, 'GET / returns HTTP 200');
    assert(!homeHtmlRes.data.includes('detail-duration-pill'), 'GET / has no duration badge in HTML');

    // 2. Video detail page GET /video/:id
    const detailHtmlRes = await request('GET', `/video/${testVideo.id}`);
    assert(detailHtmlRes.statusCode === 200, 'GET /video/:id returns HTTP 200');
    assert(!detailHtmlRes.data.includes('videoDurationBadge'), 'Detail page HTML has no videoDurationBadge');
    assert(!detailHtmlRes.data.includes('videoDurationSep'), 'Detail page HTML has no videoDurationSep');

    // Unlock button check (Requirement 3: preserve unlock button without lock icon)
    assert(detailHtmlRes.data.includes('id="btnUnlockVideo"'), 'Detail page contains #btnUnlockVideo');
    assert(detailHtmlRes.data.includes('Unlock for ₹9/month'), 'Detail page button text is "Unlock for ₹9/month"');
    const btnMatch = detailHtmlRes.data.match(/<button id="btnUnlockVideo"[^>]*>([\s\S]*?)<\/button>/);
    assert(Boolean(btnMatch), 'Extracted #btnUnlockVideo');
    assert(!btnMatch[1].includes('<svg'), 'No lock icon in #btnUnlockVideo');

    // 3. Streaming endpoint (Requirement 3: actual video playback timeline unaltered)
    const streamRes = await request('GET', `/api/videos/${testVideo.id}/stream`);
    assert(streamRes.statusCode === 302 || streamRes.statusCode === 200 || streamRes.statusCode === 206, `Streaming endpoint active (HTTP ${streamRes.statusCode})`);

    console.log('\n--- SUITE 7: Clean Up Test Video ---');
    const delRes = await request('DELETE', `/api/videos/${testVideo.id}`);
    assert(delRes.statusCode === 200, 'Test video cleaned up successfully');

    console.log('\n🎉 ALL SUITES PASSED FLAWLESSLY!');
  } finally {
    if (server) {
      server.close();
      console.log('Server shut down cleanly.');
    }
  }
}

run().catch((err) => {
  console.error('Unhandled test failure:', err);
  if (server) server.close();
  process.exit(1);
});
