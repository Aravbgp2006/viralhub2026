/**
 * scripts/test_display_duration_and_mobile_button.js
 * End-to-end verification for:
 * 1. Remove cropped lock icon on mobile from Unlock button
 * 2. Manually configurable Display Duration in Admin
 * 3. Consistent MM:SS / HH:MM:SS formatting and fallback on website
 * 4. Backward compatibility with existing video records
 */

require('dotenv').config();
const http = require('http');
const app = require('../server');
const { query } = require('../database/db');

let server;
let serverPort = 3099;
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
    console.log('\n--- TEST 1: Admin Authentication ---');
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

    console.log('\n--- TEST 2: Existing Videos Backward Compatibility ---');
    const publicVideosRes = await request('GET', '/api/videos');
    assert(publicVideosRes.statusCode === 200, 'GET /api/videos returns HTTP 200');
    assert(Array.isArray(publicVideosRes.json), 'GET /api/videos returns array of videos');
    assert(publicVideosRes.json.length >= 1, `Found ${publicVideosRes.json.length} existing videos`);
    const sampleExisting = publicVideosRes.json[0];
    assert(Boolean(sampleExisting.duration), `Existing video has duration formatted: "${sampleExisting.duration}"`);
    console.log(`  Sample existing video #${sampleExisting.id}: "${sampleExisting.title}" -> duration: "${sampleExisting.duration}", display_duration: ${sampleExisting.display_duration}`);

    console.log('\n--- TEST 3: Unlock Button Verification (No cropped lock icon) ---');
    const videoDetailHtmlRes = await request('GET', `/video/${sampleExisting.id}`);
    assert(videoDetailHtmlRes.statusCode === 200, `GET /video/${sampleExisting.id} returns HTTP 200`);
    assert(videoDetailHtmlRes.data.includes('id="btnUnlockVideo"'), 'HTML contains #btnUnlockVideo');
    assert(videoDetailHtmlRes.data.includes('Unlock for ₹9/month'), 'Button contains text "Unlock for ₹9/month"');
    
    // Extract exact HTML for btnUnlockVideo
    const btnMatch = videoDetailHtmlRes.data.match(/<button id="btnUnlockVideo"[^>]*>([\s\S]*?)<\/button>/);
    assert(Boolean(btnMatch), 'Successfully extracted #btnUnlockVideo outer HTML');
    const btnInner = btnMatch[1];
    assert(!btnInner.includes('<svg'), 'Payment/unlock button #btnUnlockVideo contains NO SVG lock icon');
    assert(btnInner.includes('Unlock for ₹9/month'), 'Button contains text span "Unlock for ₹9/month"');

    console.log('\n--- TEST 4: Display Duration Format Validation on Server ---');
    // Test invalid format "abc"
    const inv1 = await request('POST', '/api/videos', {}, {
      title: 'Invalid Test 1',
      video_url: 'https://example.com/test.mp4',
      thumbnail_url: 'https://example.com/test.jpg',
      display_duration: 'abc'
    });
    assert(inv1.statusCode === 400, 'Invalid format "abc" rejected with HTTP 400');
    assert(inv1.json.error.includes('Invalid Display Duration format'), 'Helpful error message returned for "abc"');

    // Test invalid format with seconds >= 60 "3:75"
    const inv2 = await request('POST', '/api/videos', {}, {
      title: 'Invalid Test 2',
      video_url: 'https://example.com/test.mp4',
      thumbnail_url: 'https://example.com/test.jpg',
      display_duration: '3:75'
    });
    assert(inv2.statusCode === 400, 'Invalid format "3:75" rejected with HTTP 400');

    // Test invalid format with 4 segments "1:02:03:04"
    const inv3 = await request('POST', '/api/videos', {}, {
      title: 'Invalid Test 3',
      video_url: 'https://example.com/test.mp4',
      thumbnail_url: 'https://example.com/test.jpg',
      display_duration: '1:02:03:04'
    });
    assert(inv3.statusCode === 400, 'Invalid format "1:02:03:04" rejected with HTTP 400');

    console.log('\n--- TEST 5: Publish Video with Display Duration "3:00" ---');
    const pubRes = await request('POST', '/api/videos', {}, {
      title: 'Display Duration Test Video 2026',
      description: 'Automated test video for display duration verification',
      category: 'latest',
      video_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      thumbnail_url: '/uploads/thumbnails/seed-thumb-1.svg',
      duration_seconds: 15, // Real video file duration is 15 seconds (00:15)
      display_duration: '3:00', // Configured override is 3:00
      published: true
    });
    assert(pubRes.statusCode === 201 && pubRes.json.success, 'Video published successfully with HTTP 201');
    const testVideo = pubRes.json.video;
    assert(testVideo.display_duration === '3:00', 'Saved display_duration with video record: "3:00"');
    assert(testVideo.duration === '03:00', 'Website formatted duration returned as "03:00"');
    assert(testVideo.duration_seconds === 15, 'Actual video file metadata preserved internally (duration_seconds === 15)');

    console.log('\n--- TEST 6: Verify Configured Duration on Website (List & Detail) ---');
    // 1. Check GET /api/videos
    const pubListRes = await request('GET', '/api/videos');
    const listVideo = pubListRes.json.find(v => v.id === testVideo.id);
    assert(Boolean(listVideo), 'Published video appears in GET /api/videos');
    assert(listVideo.duration === '03:00', `GET /api/videos displays configured duration formatted as "03:00" (got "${listVideo.duration}")`);
    assert(listVideo.display_duration === '3:00', 'GET /api/videos includes display_duration: "3:00"');

    // 2. Check GET /api/videos/:id
    const detailApiRes = await request('GET', `/api/videos/${testVideo.id}`);
    assert(detailApiRes.statusCode === 200, `GET /api/videos/${testVideo.id} returns HTTP 200`);
    assert(detailApiRes.json.video.duration === '03:00', `GET /api/videos/:id displays configured duration as "03:00" (got "${detailApiRes.json.video.duration}")`);
    assert(detailApiRes.json.video.display_duration === '3:00', 'GET /api/videos/:id includes display_duration: "3:00"');
    assert(detailApiRes.json.video.duration_seconds === 15, 'Internal real video duration_seconds === 15 preserved');

    // 3. Check GET /api/admin/videos
    const adminVideosRes = await request('GET', '/api/admin/videos');
    assert(adminVideosRes.statusCode === 200, 'GET /api/admin/videos returns HTTP 200');
    const adminVideo = adminVideosRes.json.find(v => v.id === testVideo.id);
    assert(Boolean(adminVideo), 'Admin videos list includes created video');
    assert(adminVideo.display_duration === '3:00', 'Admin video record has display_duration: "3:00" for edit modal prefill');
    assert(adminVideo.duration === '03:00', 'Admin video record displays formatted duration: "03:00"');

    console.log('\n--- TEST 7: Edit Video and Verify Value Persists & Updates ---');
    // Edit with new display duration "1:05:30" (longer video format)
    const updateRes = await request('PUT', `/api/videos/${testVideo.id}`, {}, {
      title: 'Display Duration Test Video 2026 (Updated)',
      display_duration: '1:05:30'
    });
    assert(updateRes.statusCode === 200 && updateRes.json.success, 'Video updated successfully');
    assert(updateRes.json.video.display_duration === '1:05:30', 'Updated display_duration persisted: "1:05:30"');
    assert(updateRes.json.video.duration === '1:05:30', 'Formatted duration for longer video displayed as "1:05:30"');

    // Verify GET /api/videos/:id reflects updated duration
    const detailUpdated = await request('GET', `/api/videos/${testVideo.id}`);
    assert(detailUpdated.json.video.duration === '1:05:30', 'GET /api/videos/:id reflects updated duration: "1:05:30"');
    assert(detailUpdated.json.video.display_duration === '1:05:30', 'GET /api/videos/:id reflects updated display_duration');

    console.log('\n--- TEST 8: Fallback to Actual Video Duration When Field Is Empty ---');
    const emptyDurRes = await request('PUT', `/api/videos/${testVideo.id}`, {}, {
      title: 'Display Duration Test Video 2026 (Fallback Test)',
      display_duration: '' // Empty string: fallback to actual video duration
    });
    assert(emptyDurRes.statusCode === 200 && emptyDurRes.json.success, 'Update with empty display_duration succeeded');
    assert(emptyDurRes.json.video.display_duration === null, 'display_duration is null in database');
    assert(emptyDurRes.json.video.duration === '00:15', `duration cleanly falls back to actual video duration 15s -> "00:15" (got "${emptyDurRes.json.video.duration}")`);

    // Verify GET /api/videos reflects fallback duration
    const publicFallbackRes = await request('GET', `/api/videos/${testVideo.id}`);
    assert(publicFallbackRes.json.video.duration === '00:15', 'Public detail page reflects actual duration fallback "00:15"');

    console.log('\n--- TEST 9: Clean Up Test Video ---');
    const delRes = await request('DELETE', `/api/videos/${testVideo.id}`);
    assert(delRes.statusCode === 200 && delRes.json.success, 'Test video deleted successfully');

    // Confirm deleted
    const verifyDel = await request('GET', `/api/videos/${testVideo.id}`);
    assert(verifyDel.statusCode === 404, 'Test video is gone from public view');

    console.log('\n🎉 ALL 9 AUTOMATED SUITES PASSED FLAWLESSLY!');
  } finally {
    if (server) {
      await new Promise(r => server.close(r));
      console.log('Server shut down cleanly.');
    }
  }
}

run().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test execution error:', err);
  if (server) server.close();
  process.exit(1);
});
