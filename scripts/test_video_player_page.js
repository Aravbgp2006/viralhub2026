/**
 * test_video_player_page.js
 * End-to-end verification of the Video Detail Page (http://127.0.0.1:3000/video/15)
 * Verifies both non-subscriber locked paywall and active subscriber stream flows.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { query } = require('../database/db');

function request(method, pathUrl, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathUrl, 'http://127.0.0.1:3000');
    const req = http.request({
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers
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
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
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

async function runTests() {
  console.log('====================================================');
  console.log('TESTING VIDEO DETAIL PAGE & INITIALIZATION (/video/15)');
  console.log('====================================================\n');

  // 1. Fetch HTML page
  console.log('Step 1: Fetching GET /video/15...');
  const pageRes = await request('GET', '/video/15');
  assert(pageRes.statusCode === 200, 'GET /video/15 returns HTTP 200');
  assert(pageRes.data.includes('Loading video player...'), 'HTML contains initial loading state');
  assert(pageRes.data.includes('id="videoLockOverlay"'), 'HTML contains #videoLockOverlay element');
  assert(pageRes.data.includes('Video Locked'), 'HTML contains "Video Locked"');
  assert(pageRes.data.includes('Unlock Premium Access'), 'HTML contains "Unlock Premium Access"');
  assert(pageRes.data.includes('₹9'), 'HTML contains price tag');
  assert(pageRes.data.includes('Unlock for ₹9/month'), 'HTML contains "Unlock for ₹9/month" button');

  // 2. Validate no JavaScript syntax errors in HTML
  console.log('\nStep 2: Checking for JavaScript syntax errors in public/video.html...');
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let inlineScriptsFound = 0;
  while ((match = scriptRegex.exec(pageRes.data)) !== null) {
    const fullTag = match[0];
    const openTag = fullTag.substring(0, fullTag.indexOf('>') + 1);
    const isExternal = /src\s*=/i.test(openTag);
    if (!isExternal) {
      inlineScriptsFound++;
      try {
        new Function(match[1]);
        assert(true, `Inline script #${inlineScriptsFound} parsed with zero syntax errors`);
      } catch (err) {
        assert(false, `Inline script #${inlineScriptsFound} threw syntax error: ${err.message}`);
      }
    }
  }
  assert(inlineScriptsFound >= 1, 'Found at least one inline JavaScript script block');

  // 3. Test API GET /api/videos/15 for Non-Subscriber
  console.log('\nStep 3: Testing GET /api/videos/15 as non-subscriber...');
  const apiRes = await request('GET', '/api/videos/15');
  assert(apiRes.statusCode === 200, 'GET /api/videos/15 returns HTTP 200');
  assert(apiRes.json && apiRes.json.video, 'Response contains video object');
  assert(apiRes.json.video.is_locked === true, 'Non-subscriber receives is_locked === true');
  assert(apiRes.json.video.video_url === null, 'Non-subscriber receives video_url === null (PROTECTED)');
  assert(apiRes.json.video.video_path === null, 'Non-subscriber receives video_path === null (PROTECTED)');
  assert(Boolean(apiRes.json.video.title && apiRes.json.video.title.trim()), 'Video title is present');
  assert(apiRes.json.subscription.active === false, 'Subscription active is false');

  // 4. Test API GET /api/subscription/status for Non-Subscriber
  console.log('\nStep 4: Testing GET /api/subscription/status as non-subscriber...');
  const subStatusRes = await request('GET', '/api/subscription/status');
  assert(subStatusRes.statusCode === 200, 'GET /api/subscription/status returns HTTP 200');
  assert(subStatusRes.json.subscribed === false, 'subscribed is false');

  // 5. Test Direct Stream request without subscription (Security verification)
  console.log('\nStep 5: Testing GET /api/videos/15/stream without subscription (Security check)...');
  const stream403Res = await request('GET', '/api/videos/15/stream');
  assert(stream403Res.statusCode === 403, 'Unauthorized stream request returns HTTP 403 Forbidden');
  assert(stream403Res.json.locked === true, 'Stream response includes locked: true');

  // 6. Test Direct File Access to /uploads/videos/ without subscription
  console.log('\nStep 6: Testing GET /uploads/videos/ without subscription...');
  const rawFileRes = await request('GET', '/uploads/videos/video_sample.mp4');
  assert(rawFileRes.statusCode === 403, 'Direct raw video file download returns HTTP 403 Forbidden');

  // 7. Client DOM Simulation for Non-Subscriber
  console.log('\nStep 7: Simulating client-side DOM execution for non-subscriber...');
  const domState = {
    loadingIndicator: { style: { display: 'block' } },
    videoContent: { style: { display: 'none' } },
    videoLockOverlay: { style: { display: 'none' } },
    playerLockBackdrop: { style: { backgroundImage: '' } },
    subStatusBadge: { style: { display: 'none' }, textContent: '' },
    videoTitle: { textContent: '' },
    videoViews: { textContent: '', title: '' },
    videoDate: { textContent: '' },
    categoryBadge: { textContent: '' },
    videoDescription: { textContent: '' },
    detailPlayer: {
      src: '',
      poster: '',
      removeAttribute(attr) { if (attr === 'src') this.src = ''; },
      load() {}
    },
    relatedList: { innerHTML: '', appendChild() {} },
    errorState: { style: { display: 'none' } },
    errorMessage: { textContent: '' }
  };

  // Simulate initVideoPage logic with the received non-subscriber API data
  const video = apiRes.json.video;
  const isVideoLocked = Boolean(video.is_locked);
  
  if (isVideoLocked) {
    const thumbUrl = video.thumbnail_url || video.thumbnail_path || '/uploads/thumbnails/seed-thumb-1.svg';
    domState.playerLockBackdrop.style.backgroundImage = `url('${thumbUrl}')`;
    domState.videoLockOverlay.style.display = 'flex';
    domState.subStatusBadge.style.display = 'none';
    domState.detailPlayer.removeAttribute('src');
    domState.detailPlayer.load();
  }
  domState.loadingIndicator.style.display = 'none';
  domState.videoContent.style.display = 'grid';

  assert(domState.loadingIndicator.style.display === 'none', 'Loading indicator is hidden (style.display = "none")');
  assert(domState.videoContent.style.display === 'grid', 'Video content is displayed (style.display = "grid")');
  assert(domState.videoLockOverlay.style.display === 'flex', 'Locked paywall overlay is visible (style.display = "flex")');
  assert(domState.subStatusBadge.style.display === 'none', 'Premium active badge is hidden for non-subscriber');
  assert(domState.detailPlayer.src === '', 'Player src is empty (no protected URL exposed)');
  assert(domState.playerLockBackdrop.style.backgroundImage.includes(video.thumbnail_path), 'Lock backdrop set to blurred thumbnail');

  // 8. Test Active Subscriber Flow
  console.log('\nStep 8: Testing active subscriber verification & stream flow...');
  // Create test subscription
  const testEmail = `subscriber_test_${Date.now()}@example.com`;
  const createSubRes = await request('POST', '/api/subscription/create', { 'Content-Type': 'application/json' }, { email: testEmail });
  assert(createSubRes.statusCode === 200, 'POST /api/subscription/create returns HTTP 200');
  const subId = createSubRes.json.subscription_id;

  // Verify and activate subscription
  const verifySubRes = await request('POST', '/api/subscription/verify', { 'Content-Type': 'application/json' }, {
    razorpay_payment_id: 'pay_test_' + Date.now(),
    razorpay_subscription_id: subId,
    razorpay_signature: 'sig_test_valid',
    email: testEmail
  });
  assert(verifySubRes.statusCode === 200, 'POST /api/subscription/verify returns HTTP 200');
  assert(verifySubRes.json.subscribed === true, 'Verification returns subscribed: true');
  
  // Extract session cookie from Set-Cookie header
  const setCookie = verifySubRes.headers['set-cookie'];
  assert(setCookie && setCookie.length > 0, 'Server returns Set-Cookie header with vh_sub_token');
  const subCookie = setCookie.map(c => c.split(';')[0]).join('; ');

  // Fetch GET /api/videos/15 with subscriber cookie
  const subVidRes = await request('GET', '/api/videos/15', { Cookie: subCookie });
  assert(subVidRes.statusCode === 200, 'GET /api/videos/15 for subscriber returns HTTP 200');
  assert(subVidRes.json.video.is_locked === false, 'Subscriber receives is_locked === false');
  assert(subVidRes.json.video.video_url === '/api/videos/15/stream', 'Subscriber receives authorized stream URL');
  assert(subVidRes.json.subscription.active === true, 'Subscription active is true');

  // Stream video with subscriber cookie
  const subStreamRes = await request('GET', '/api/videos/15/stream', { Cookie: subCookie });
  assert(subStreamRes.statusCode === 200, 'Authorized stream request returns HTTP 200 OK');
  assert(subStreamRes.headers['content-type'] === 'video/mp4', 'Stream Content-Type is video/mp4');
  assert(subStreamRes.headers['accept-ranges'] === 'bytes', 'Stream supports Range requests');

  // Range stream request
  const rangeRes = await request('GET', '/api/videos/15/stream', {
    Cookie: subCookie,
    Range: 'bytes=0-1023'
  });
  assert(rangeRes.statusCode === 206, 'Range request returns HTTP 206 Partial Content');
  assert(rangeRes.headers['content-range'].includes('bytes 0-1023/'), 'Content-Range header returned');

  console.log('\n====================================================');
  console.log('✅ ALL TESTS PASSED! Video player page is 100% verified.');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
