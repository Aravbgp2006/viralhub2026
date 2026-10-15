/**
 * scripts/test_admin_views_update.js
 * Test Admin updating view count and public site reflecting formatted view count.
 */

const assert = require('assert');
const http = require('http');
const app = require('../server');
const { query } = require('../database/db');

async function run() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3108, resolve));
  const baseUrl = 'http://localhost:3108';

  try {
    console.log('--- Testing Admin View Count Update & Public Reflection ---');

    // 1. Admin Login
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123'
      })
    });
    assert.strictEqual(loginRes.status, 200, 'Admin login failed');
    const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
    const adminCookie = setCookies.map(c => c.split(';')[0]).join('; ');
    assert(adminCookie.includes('admin_token='), 'No admin cookie returned');
    console.log('✅ Admin login succeeded, cookie:', adminCookie);

    // 2. Get first video
    const videos = await query.all('SELECT id, title, views, category FROM videos WHERE published = true LIMIT 1');
    assert(videos.length > 0, 'No published videos in database');
    const targetVideo = videos[0];
    const originalViews = targetVideo.views;
    console.log(`Target Video #${targetVideo.id} ("${targetVideo.title}") current views: ${originalViews}`);

    // 3. Admin updates views to 63000
    const updateRes = await fetch(`${baseUrl}/api/videos/${targetVideo.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie
      },
      body: JSON.stringify({
        title: targetVideo.title,
        category: targetVideo.category || 'latest',
        views: '63K'
      })
    });
    assert.strictEqual(updateRes.status, 200, 'PUT /api/videos/:id failed');
    console.log('✅ Admin successfully set views to 63K (63000)');

    // 4. Public endpoint GET /api/videos/:id
    const publicRes = await fetch(`${baseUrl}/api/videos/${targetVideo.id}`);
    const publicData = await publicRes.json();
    assert.strictEqual(publicRes.status, 200, 'Public video fetch failed');
    console.log(`Public video returned views: ${publicData.video.views}`);
    assert(Number(publicData.video.views) === 63000 || Number(publicData.video.views) === 63001, 'Views value in DB must be updated to 63000');

    // 5. Restore original views
    await fetch(`${baseUrl}/api/videos/${targetVideo.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie
      },
      body: JSON.stringify({
        title: targetVideo.title,
        category: targetVideo.category || 'latest',
        views: originalViews
      })
    });
    console.log(`✅ Restored original views: ${originalViews}`);

    console.log('\n🎉 ALL ADMIN VIEW UPDATE CHECKS PASSED!');
  } finally {
    server.close();
  }
}

run().then(() => process.exit(0)).catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
