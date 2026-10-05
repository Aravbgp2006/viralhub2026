/**
 * scripts/test_vercel_blob_upload_flow.js
 * Verification test for Vercel production upload flow & serverless filesystem safety.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:3000';

async function runTests() {
  console.log('🧪 Starting Vercel Blob Upload Flow & Production Filesystem Safety Tests...');

  // 1. Verify GET /api/blob/status endpoint
  console.log('\n--- 1. Testing GET /api/blob/status ---');
  const statusRes = await fetch(`${BASE_URL}/api/blob/status`);
  assert.strictEqual(statusRes.status, 200, 'Expected 200 from /api/blob/status');
  const statusData = await statusRes.json();
  console.log('Blob status response:', statusData);
  assert.ok('enabled' in statusData, 'Response must contain "enabled"');
  assert.ok('isProduction' in statusData, 'Response must contain "isProduction"');
  assert.ok('isServerless' in statusData, 'Response must contain "isServerless"');
  console.log('✅ /api/blob/status verified');

  // 2. Admin Login
  console.log('\n--- 2. Testing Admin Authentication ---');
  const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  assert.strictEqual(loginRes.status, 200, 'Admin login failed');
  const rawCookies = loginRes.headers.get('set-cookie') || '';
  const adminTokenMatch = rawCookies.match(/admin_token=([^;]+)/);
  assert.ok(adminTokenMatch, 'admin_token cookie missing in login response');
  const adminCookie = `admin_token=${adminTokenMatch[1]}`;
  console.log('✅ Admin authenticated successfully');

  // 3. Test Admin Video Creation with Blob URLs (The primary production flow)
  console.log('\n--- 3. Testing POST /api/videos with Vercel Blob URLs ---');
  const testBlobThumb = 'https://abc123xyz.public.blob.vercel-storage.com/thumbnails/test-thumb-12345.png';
  const testBlobVideo = 'https://abc123xyz.public.blob.vercel-storage.com/videos/test-video-12345.mp4';
  const testTitle = `Vercel Blob Test Video ${Date.now()}`;

  const createRes = await fetch(`${BASE_URL}/api/videos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': adminCookie
    },
    body: JSON.stringify({
      title: testTitle,
      description: 'Testing Vercel Blob integration and Neon DB storage without local disk writes',
      category: 'trending',
      initial_views: '1.5K',
      published: '1',
      video_url: testBlobVideo,
      thumbnail_url: testBlobThumb
    })
  });

  assert.strictEqual(createRes.status, 201, `Expected 201 Created, got ${createRes.status}`);
  const createData = await createRes.json();
  assert.ok(createData.success, 'Expected createData.success to be true');
  const createdVideo = createData.video;
  assert.strictEqual(createdVideo.title, testTitle);
  assert.strictEqual(createdVideo.views, 1500, 'Views shorthand 1.5K should parse to 1500');
  assert.strictEqual(createdVideo.thumbnail_url, testBlobThumb, 'Thumbnail URL must match Blob URL');
  assert.strictEqual(createdVideo.video_url, testBlobVideo, 'Video URL must match Blob URL');
  console.log(`✅ Video created successfully: ID ${createdVideo.id} with Blob URLs stored in Neon`);

  // 4. Verify Public Video Listing & Detail Page with Blob URLs
  console.log('\n--- 4. Testing Public API for Blob Video ---');
  const listRes = await fetch(`${BASE_URL}/api/videos?category=trending`);
  const listData = await listRes.json();
  const foundInList = listData.find(v => v.id === createdVideo.id);
  assert.ok(foundInList, 'Created video not found in public list');
  assert.strictEqual(foundInList.thumbnail_url, testBlobThumb, 'Homepage thumbnail matches Blob URL');

  const detailRes = await fetch(`${BASE_URL}/api/videos/${createdVideo.id}`);
  assert.strictEqual(detailRes.status, 200);
  const detailData = await detailRes.json();
  assert.strictEqual(detailData.video.thumbnail_url, testBlobThumb);
  assert.ok(detailData.video.is_locked, 'Video is locked for non-subscriber');
  console.log('✅ Public listing and detail API correctly return Blob URL and lock status');

  // 5. Test Editing Video Details with Blob URL
  console.log('\n--- 5. Testing PUT /api/videos/:id with Updated Blob URL ---');
  const updatedBlobThumb = 'https://abc123xyz.public.blob.vercel-storage.com/thumbnails/test-thumb-updated.png';
  const editRes = await fetch(`${BASE_URL}/api/videos/${createdVideo.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': adminCookie
    },
    body: JSON.stringify({
      title: `${testTitle} (Updated)`,
      description: 'Updated description',
      category: 'latest',
      views: '2.5K',
      published: 1,
      thumbnail_url: updatedBlobThumb
    })
  });
  assert.strictEqual(editRes.status, 200);
  const editData = await editRes.json();
  assert.strictEqual(editData.video.thumbnail_url, updatedBlobThumb);
  assert.strictEqual(editData.video.views, 2500);
  console.log('✅ Video updated with new Blob URL successfully');

  // 6. Test Deleting Video with Blob URLs
  console.log('\n--- 6. Testing DELETE /api/videos/:id ---');
  const deleteRes = await fetch(`${BASE_URL}/api/videos/${createdVideo.id}`, {
    method: 'DELETE',
    headers: { 'Cookie': adminCookie }
  });
  assert.strictEqual(deleteRes.status, 200);
  console.log('✅ Video deleted cleanly without filesystem error');

  // 7. Verify Multer Destination and Serverless Safety Unit Test
  console.log('\n--- 7. Verifying Multer Destination Configuration ---');
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  // Verify that multer storage checks isServerless / isBlobConfigured and uses os.tmpdir()
  assert.ok(serverCode.includes('if (isServerless || isBlobConfigured())'), 'Multer must check isServerless/isBlobConfigured');
  assert.ok(serverCode.includes('cb(null, os.tmpdir())'), 'Multer must redirect to os.tmpdir() in serverless');
  
  // Verify that no serverless startup code tries to mkdir into uploads/
  assert.ok(serverCode.includes('if (!isServerless)'), 'Folder creation must be guarded by !isServerless');

  // Verify that token: process.env.BLOB_READ_WRITE_TOKEN is passed explicitly
  assert.ok(serverCode.includes('token: process.env.BLOB_READ_WRITE_TOKEN'), 'BLOB_READ_WRITE_TOKEN must be read from process.env');

  console.log('✅ Multer destination and serverless protections verified in server.js');

  console.log('\n🎉 ALL VERCEL BLOB UPLOAD FLOW TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
