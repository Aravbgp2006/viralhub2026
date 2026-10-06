const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function run() {
  console.log('====================================================');
  console.log('TESTING THUMBNAIL ASPECT RATIO & FIT/CROP EDITOR');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name} -> ${err.message}`);
      failed++;
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name} -> ${err.message}`);
      failed++;
    }
  }

  // 1. Static HTML Checks
  console.log('--- 1. ADMIN HTML CHECKS ---');
  const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

  test('Add Modal has Thumbnail Format selection (16:9 & 9:16)', () => {
    assert(adminHtml.includes('name="addThumbFormat"'), 'Missing addThumbFormat radio group');
    assert(adminHtml.includes('value="16:9"'), 'Missing 16:9 option');
    assert(adminHtml.includes('value="9:16"'), 'Missing 9:16 option');
    assert(adminHtml.includes('16:9 Landscape'), 'Missing 16:9 label');
    assert(adminHtml.includes('9:16 Portrait'), 'Missing 9:16 label');
  });

  test('Edit Modal has Thumbnail Format selection (16:9 & 9:16)', () => {
    assert(adminHtml.includes('name="editThumbFormat"'), 'Missing editThumbFormat radio group');
  });

  test('Thumbnail Crop & Fit Editor Modal is present (#thumbEditorModal)', () => {
    assert(adminHtml.includes('id="thumbEditorModal"'), 'Missing #thumbEditorModal');
    assert(adminHtml.includes('id="thumbEditorCanvas"'), 'Missing #thumbEditorCanvas');
    assert(adminHtml.includes('id="thumbCropViewport"'), 'Missing #thumbCropViewport');
    assert(adminHtml.includes('id="thumbCropFrame"'), 'Missing #thumbCropFrame');
    assert(adminHtml.includes('id="thumbZoomSlider"'), 'Missing #thumbZoomSlider');
    assert(adminHtml.includes('id="btnResetThumbEditor"'), 'Missing Reset button');
    assert(adminHtml.includes('id="btnCancelThumbEditor"'), 'Missing Cancel button');
    assert(adminHtml.includes('id="btnSaveThumbEditor"'), 'Missing Save Thumbnail button');
  });

  test('Live Preview Containers exist in Add & Edit forms', () => {
    assert(adminHtml.includes('id="addThumbPreviewCard"'), 'Missing addThumbPreviewCard');
    assert(adminHtml.includes('id="editThumbPreviewCard"'), 'Missing editThumbPreviewCard');
  });

  // 2. CSS Styles Checks
  console.log('\n--- 2. CSS STYLES CHECKS ---');
  const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

  test('Thumbnail format pills styling exists', () => {
    assert(styleCss.includes('.thumb-format-pills'), 'Missing .thumb-format-pills');
    assert(styleCss.includes('.thumb-format-pill input[type="radio"]:checked + .pill-content'), 'Missing checked state styling');
  });

  test('Homepage card aspect ratio styling exists', () => {
    assert(styleCss.includes('.video-card.aspect-9-16 .video-card-thumb-wrapper'), 'Missing .video-card.aspect-9-16');
    assert(styleCss.includes('aspect-ratio: 9 / 16;'), 'Missing aspect-ratio: 9 / 16');
    assert(styleCss.includes('aspect-ratio: 16 / 9;'), 'Missing aspect-ratio: 16 / 9');
  });

  test('Crop editor responsive viewport & frame styling exists', () => {
    assert(styleCss.includes('.thumb-editor-overlay'), 'Missing .thumb-editor-overlay');
    assert(styleCss.includes('.thumb-crop-viewport'), 'Missing .thumb-crop-viewport');
    assert(styleCss.includes('.thumb-crop-frame.aspect-16-9'), 'Missing .thumb-crop-frame.aspect-16-9');
    assert(styleCss.includes('.thumb-crop-frame.aspect-9-16'), 'Missing .thumb-crop-frame.aspect-9-16');
    assert(styleCss.includes('@media (max-width: 640px)'), 'Missing mobile responsiveness media query');
  });

  // 3. Mathematical Simulation of Dual-Layer Image Fitting & Background Blur
  console.log('\n--- 3. IMAGE FITTING & BACKGROUND BLUR ALGORITHM SIMULATION ---');

  test('Portrait image (1080x1920) inside 16:9 frame (1280x720): foreground fits without stretch, background covers completely', () => {
    const imgW = 1080;
    const imgH = 1920;
    const targetW = 1280;
    const targetH = 720;

    // Foreground sharp image
    const fitScale = Math.min(targetW / imgW, targetH / imgH);
    const fgW = imgW * fitScale;
    const fgH = imgH * fitScale;
    assert.strictEqual(Math.round(fgH), 720, 'Foreground height should fill target height');
    assert(fgW < targetW, 'Foreground width should be narrower than 1280 (needs blurred sides)');
    assert.strictEqual(Math.round(fgW / fgH * 1000), Math.round(imgW / imgH * 1000), 'Aspect ratio of original image must be perfectly preserved');

    // Background blurred cover
    const coverScale = Math.max(targetW / imgW, targetH / imgH) * 1.25;
    const bgW = imgW * coverScale;
    const bgH = imgH * coverScale;
    assert(bgW >= targetW, 'Background width must cover targetW');
    assert(bgH >= targetH, 'Background height must cover targetH');
  });

  test('Landscape image (1920x1080) inside 9:16 frame (720x1280): foreground fits without stretch, background covers completely', () => {
    const imgW = 1920;
    const imgH = 1080;
    const targetW = 720;
    const targetH = 1280;

    // Foreground sharp image
    const fitScale = Math.min(targetW / imgW, targetH / imgH);
    const fgW = imgW * fitScale;
    const fgH = imgH * fitScale;
    assert.strictEqual(Math.round(fgW), 720, 'Foreground width should fill target width');
    assert(fgH < targetH, 'Foreground height should be shorter than 1280 (needs blurred top/bottom)');
    assert.strictEqual(Math.round(fgW / fgH * 1000), Math.round(imgW / imgH * 1000), 'Original image aspect ratio preserved');

    // Background blurred cover
    const coverScale = Math.max(targetW / imgW, targetH / imgH) * 1.25;
    const bgW = imgW * coverScale;
    const bgH = imgH * coverScale;
    assert(bgW >= targetW, 'Background width must cover targetW');
    assert(bgH >= targetH, 'Background height must cover targetH');
  });

  // 4. API Endpoints & DB Tests
  console.log('\n--- 4. API ENDPOINTS & DATABASE PERSISTENCE TESTS ---');

  let adminCookie = '';

  await testAsync('Admin Login', async () => {
    const res = await fetch('http://127.0.0.1:3000/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert(data.success);
    const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
    assert(rawCookies && rawCookies.length, 'Missing cookies');
    adminCookie = rawCookies.map(c => c.split(';')[0]).join('; ');
    assert(adminCookie.includes('admin_token='), 'admin_token missing in cookie header');
  });

  await testAsync('GET /api/videos returns thumbnail_aspect_ratio for all videos (defaulting to 16:9)', async () => {
    const res = await fetch('http://127.0.0.1:3000/api/videos');
    assert.strictEqual(res.status, 200);
    const videos = await res.json();
    assert(Array.isArray(videos), 'Expected array of videos');
    assert(videos.length > 0, 'Expected at least 1 video');
    videos.forEach(v => {
      assert(v.thumbnail_aspect_ratio, `Video ${v.id} missing thumbnail_aspect_ratio`);
      assert(['16:9', '9:16'].includes(v.thumbnail_aspect_ratio), `Invalid aspect ratio ${v.thumbnail_aspect_ratio}`);
    });
  });

  let createdVideo169Id = null;
  let createdVideo916Id = null;

  await testAsync('POST /api/videos creates video with 16:9 landscape aspect ratio', async () => {
    const payload = {
      title: 'Automated Test 16:9 Landscape Video',
      description: 'Testing 16:9 landscape thumbnail persistence',
      category: 'latest',
      initial_views: 100,
      published: '1',
      video_url: 'https://example.com/videos/test-16-9.mp4',
      thumbnail_url: 'https://example.com/thumbs/test-16-9.jpg',
      thumbnail_aspect_ratio: '16:9'
    };

    const res = await fetch('http://127.0.0.1:3000/api/videos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    assert.strictEqual(res.status, 201, `Failed to create video: ${JSON.stringify(data)}`);
    assert(data.success);
    assert(data.video);
    assert.strictEqual(data.video.thumbnail_aspect_ratio, '16:9');
    createdVideo169Id = data.video.id;
  });

  await testAsync('POST /api/videos creates video with 9:16 portrait aspect ratio', async () => {
    const payload = {
      title: 'Automated Test 9:16 Portrait Video',
      description: 'Testing 9:16 portrait thumbnail persistence',
      category: 'trending',
      initial_views: 250,
      published: '1',
      video_url: 'https://example.com/videos/test-9-16.mp4',
      thumbnail_url: 'https://example.com/thumbs/test-9-16.jpg',
      thumbnail_aspect_ratio: '9:16'
    };

    const res = await fetch('http://127.0.0.1:3000/api/videos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    assert.strictEqual(res.status, 201, `Failed to create video: ${JSON.stringify(data)}`);
    assert(data.success);
    assert(data.video);
    assert.strictEqual(data.video.thumbnail_aspect_ratio, '9:16');
    createdVideo916Id = data.video.id;
  });

  await testAsync('GET /api/videos/:id returns correct aspect ratio for 9:16 video', async () => {
    const res = await fetch(`http://127.0.0.1:3000/api/videos/${createdVideo916Id}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert(data.video);
    assert.strictEqual(data.video.thumbnail_aspect_ratio, '9:16');
  });

  await testAsync('PUT /api/videos/:id updates aspect ratio from 16:9 to 9:16', async () => {
    const updatePayload = {
      title: 'Automated Test Video - Updated to 9:16',
      description: 'Updated aspect ratio',
      category: 'latest',
      views: 150,
      published: '1',
      thumbnail_aspect_ratio: '9:16'
    };

    const res = await fetch(`http://127.0.0.1:3000/api/videos/${createdVideo169Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminCookie
      },
      body: JSON.stringify(updatePayload)
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200, `Failed to update video: ${JSON.stringify(data)}`);
    assert(data.success);

    // Verify via GET
    const getRes = await fetch(`http://127.0.0.1:3000/api/videos/${createdVideo169Id}`);
    const getData = await getRes.json();
    assert.strictEqual(getData.video.thumbnail_aspect_ratio, '9:16');
  });

  // Cleanup test videos
  if (createdVideo169Id) {
    await fetch(`http://127.0.0.1:3000/api/videos/${createdVideo169Id}`, {
      method: 'DELETE',
      headers: { 'Cookie': adminCookie }
    });
  }
  if (createdVideo916Id) {
    await fetch(`http://127.0.0.1:3000/api/videos/${createdVideo916Id}`, {
      method: 'DELETE',
      headers: { 'Cookie': adminCookie }
    });
  }

  console.log('\n====================================================');
  console.log(`TEST RUN COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
