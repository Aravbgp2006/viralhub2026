/**
 * scripts/test_blob_integration.js
 * Comprehensive integration test for Vercel Blob and Neon PostgreSQL CMS.
 */

require('dotenv').config();
const http = require('http');
const { query } = require('../database/db');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:3000';
const cookieJar = {};

// Helper to make HTTP requests with proper cookie accumulation and JSON support
function request(method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathUrl, BASE_URL);
    const reqHeaders = { ...headers };
    const cookieStr = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookieStr) reqHeaders['Cookie'] = cookieStr;
    
    let postData = null;
    if (body && typeof body === 'object') {
      reqHeaders['Content-Type'] = 'application/json';
      postData = JSON.stringify(body);
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      if (res.headers['set-cookie']) {
        res.headers['set-cookie'].forEach(c => {
          const part = c.split(';')[0];
          const eqIdx = part.indexOf('=');
          if (eqIdx !== -1) {
            cookieJar[part.substring(0, eqIdx).trim()] = part.substring(eqIdx + 1).trim();
          }
        });
      }
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, text: data, json });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runBlobTests() {
  console.log('================================================================================');
  console.log('🧪 RUNNING VERCEL BLOB & NEON POSTGRESQL INTEGRATION TEST SUITE');
  console.log('================================================================================\n');

  // Clean up any test records from prior runs
  await query.run("DELETE FROM videos WHERE title LIKE '%Vercel Blob Integration Test Video%'");

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      testPassed++;
    } else {
      console.error(`❌ [FAIL] ${name}`);
      testFailed++;
    }
  }

  // 1. Status endpoint
  console.log('--- TEST 1: Check Vercel Blob Status API ---');
  const statusRes = await request('GET', '/api/blob/status');
  assert(statusRes.status === 200, 'GET /api/blob/status returns 200');
  assert(typeof statusRes.json?.enabled === 'boolean', `Status enabled field is boolean: ${statusRes.json?.enabled}`);

  // 2. Security: Unauthorized access rejection
  console.log('\n--- TEST 2: Security & Admin Authentication Verification ---');
  const unauthUploadRes = await request('POST', '/api/blob/upload', { type: 'blob.generate-client-token' });
  assert(unauthUploadRes.status === 401, 'Unauthenticated POST /api/blob/upload rejected with 401');

  const unauthVideoCreate = await request('POST', '/api/videos', { title: 'Hacker Video' });
  assert(unauthVideoCreate.status === 401, 'Unauthenticated POST /api/videos rejected with 401');

  // 3. Admin Login
  console.log('\n--- TEST 3: Admin Login ---');
  const loginRes = await request('POST', '/api/admin/login', {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'viralhub2026!'
  });
  assert(loginRes.status === 200 && loginRes.json?.success, 'Admin login succeeded');
  assert(Boolean(cookieJar['admin_token']), 'Admin authentication cookie received');

  const checkAuthRes = await request('GET', '/api/admin/check-auth');
  assert(checkAuthRes.json?.authenticated === true, 'GET /api/admin/check-auth returns authenticated: true');

  // 4. Create Video with Vercel Blob URLs
  console.log('\n--- TEST 4: Create Video with Vercel Blob URLs ---');
  const mockBlobVideoUrl = 'https://viralhub2026-blob.public.blob.vercel-storage.com/videos/sample-test-video.mp4';
  const mockBlobThumbUrl = 'https://viralhub2026-blob.public.blob.vercel-storage.com/thumbnails/sample-test-thumb.jpg';

  const createRes = await request('POST', '/api/videos', {
    title: 'Vercel Blob Integration Test Video',
    description: 'Verifying persistent storage of Blob URLs in Neon PostgreSQL',
    category: 'latest',
    published: 1,
    initial_views: '3.5K',
    video_url: mockBlobVideoUrl,
    thumbnail_url: mockBlobThumbUrl
  });

  assert(createRes.status === 201 && createRes.json?.success, 'POST /api/videos created video with Blob URLs');
  const newVideoId = createRes.json?.video?.id;
  assert(Boolean(newVideoId), `New video created with ID: ${newVideoId}`);
  assert(createRes.json?.video?.video_url === mockBlobVideoUrl, 'Video record has exact Blob video URL');
  assert(createRes.json?.video?.thumbnail_url === mockBlobThumbUrl, 'Video record has exact Blob thumbnail URL');
  assert(Number(createRes.json?.video?.views) === 3500, 'Initial views shorthand "3.5K" correctly stored as 3500');

  // 5. Verify Database URL Storage directly from Neon PostgreSQL
  console.log('\n--- TEST 5: Verify Neon Database URL Storage ---');
  const dbRow = await query.get('SELECT * FROM videos WHERE id = $1', [newVideoId]);
  assert(Boolean(dbRow), 'Video record found in Neon PostgreSQL');
  assert(dbRow.video_url === mockBlobVideoUrl, 'Neon video_url matches Blob URL');
  assert(dbRow.thumbnail_url === mockBlobThumbUrl, 'Neon thumbnail_url matches Blob URL');

  // 6. Public Video Page & API Playback
  console.log('\n--- TEST 6: Public Playback & API ---');
  const publicListRes = await request('GET', '/api/videos');
  const foundInPublic = publicListRes.json?.find(v => v.id === newVideoId);
  assert(Boolean(foundInPublic), 'New Blob video appears on public API listing');
  assert(foundInPublic?.video_url === mockBlobVideoUrl, 'Public video item contains Blob video_url');
  assert(foundInPublic?.thumbnail_url === mockBlobThumbUrl, 'Public video item contains Blob thumbnail_url');

  const detailRes = await request('GET', `/api/videos/${newVideoId}`);
  assert(detailRes.status === 200, 'GET /api/videos/:id returns 200');
  assert(detailRes.json?.video?.video_url === mockBlobVideoUrl, 'Public detail endpoint provides Blob URL for playback');

  const htmlRes = await request('GET', `/video/${newVideoId}`);
  assert(htmlRes.status === 200, 'Public video detail HTML page loads (200)');

  // 7. Edit Video & Replace Blob URL
  console.log('\n--- TEST 7: Edit Video & Safe Blob Replacement ---');
  const updatedBlobThumb = 'https://viralhub2026-blob.public.blob.vercel-storage.com/thumbnails/updated-thumb.jpg';
  const editRes = await request('PUT', `/api/videos/${newVideoId}`, {
    title: 'Vercel Blob Integration Test Video (Updated)',
    description: 'Updated description for test',
    category: 'trending',
    views: '10K',
    published: 1,
    thumbnail_url: updatedBlobThumb
  });

  assert(editRes.status === 200 && editRes.json?.success, 'PUT /api/videos/:id updated successfully');
  const updatedDbRow = await query.get('SELECT * FROM videos WHERE id = $1', [newVideoId]);
  assert(updatedDbRow.title === 'Vercel Blob Integration Test Video (Updated)', 'Title updated in Neon DB');
  assert(updatedDbRow.thumbnail_url === updatedBlobThumb, 'Thumbnail URL updated to new Blob URL in Neon DB');
  assert(Number(updatedDbRow.views) === 10000, 'Views updated to 10000 in Neon DB');

  // 8. Toggle Publish
  console.log('\n--- TEST 8: Toggle Published Status ---');
  const unpublishRes = await request('PATCH', `/api/videos/${newVideoId}/publish`, { published: 0 });
  assert(unpublishRes.status === 200 && unpublishRes.json?.published === 0, 'Video successfully unpublished');

  const publishRes = await request('PATCH', `/api/videos/${newVideoId}/publish`, { published: 1 });
  assert(publishRes.status === 200 && publishRes.json?.published === 1, 'Video successfully republished');

  // 9. Delete Video
  console.log('\n--- TEST 9: Delete Video & Cleanup ---');
  const deleteRes = await request('DELETE', `/api/videos/${newVideoId}`);
  assert(deleteRes.status === 200 && deleteRes.json?.success, 'DELETE /api/videos/:id returned success');

  const verifyDeleted = await query.get('SELECT * FROM videos WHERE id = $1', [newVideoId]);
  assert(verifyDeleted === null, 'Video successfully removed from Neon PostgreSQL');

  // 10. Verify Integrity of Existing 13 Videos
  console.log('\n--- TEST 10: Integrity of Existing 13 Videos & Local Files ---');
  const allVideos = await query.all('SELECT id, title, video_path, thumbnail_path FROM videos ORDER BY id ASC');
  assert(allVideos.length === 13, `Exactly 13 existing videos remain in Neon PostgreSQL (found: ${allVideos.length})`);

  const localVideosCount = fs.readdirSync(path.join(__dirname, '..', 'uploads', 'videos')).length;
  const localThumbsCount = fs.readdirSync(path.join(__dirname, '..', 'uploads', 'thumbnails')).length;
  assert(localVideosCount >= 13, `Local uploaded video files intact (${localVideosCount} files in uploads/videos)`);
  assert(localThumbsCount >= 13, `Local uploaded thumbnail files intact (${localThumbsCount} files in uploads/thumbnails)`);

  console.log('\n================================================================================');
  console.log(`TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
  console.log('================================================================================\n');

  if (testFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runBlobTests().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
