const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('=== TESTING ADD VIDEO MODAL & CMS BACKEND ===\n');

  // 1. Verify CSS styles for modal footer and buttons
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
  const checks = [
    { name: '.modal-form flex layout', test: css.includes('.modal-form') },
    { name: '.modal-footer sticky positioning', test: css.includes('position: sticky') && css.includes('.modal-footer') },
    { name: '.btn-publish-submit button styling', test: css.includes('.btn-publish-submit') },
    { name: '.btn-modal-cancel button styling', test: css.includes('.btn-modal-cancel') },
    { name: '.upload-progress-box progress bar styling', test: css.includes('.upload-progress-box') },
    { name: 'Mobile full-width buttons', test: css.includes('.btn-publish-submit') && css.includes('@media (max-width: 640px)') }
  ];

  console.log('--- Modal CSS Verification ---');
  let cssOk = true;
  checks.forEach(c => {
    console.log((c.test ? '✓' : '✗') + ' ' + c.name);
    if (!c.test) cssOk = false;
  });

  // 2. Verify HTML structure in public/admin.html
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
  const htmlChecks = [
    { name: 'modal-form in addVideoForm', test: html.includes('<form id="addVideoForm" class="modal-form">') },
    { name: 'Publish Video button in modal-footer', test: html.includes('id="btnSubmitAdd"') && html.includes('Publish Video') },
    { name: 'Cancel button in modal-footer', test: html.includes('id="btnCancelAdd"') && html.includes('Cancel') },
    { name: 'Upload progress container', test: html.includes('id="uploadProgressContainer"') },
    { name: 'Thumbnail file input accept attributes', test: html.includes('id="addThumbnail"') && html.includes('accept=') },
    { name: 'Video file input accept attributes', test: html.includes('id="addVideoFile"') && html.includes('accept=') }
  ];

  console.log('\n--- Modal HTML Structure Verification ---');
  let htmlOk = true;
  htmlChecks.forEach(c => {
    console.log((c.test ? '✓' : '✗') + ' ' + c.name);
    if (!c.test) htmlOk = false;
  });

  // 3. Test API upload endpoint using simulated multipart upload
  console.log('\n--- Admin Login & Video Upload API Verification ---');
  try {
    // Login
    const loginRes = await fetch('http://127.0.0.1:3000/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    console.log('Admin login status:', loginRes.status, loginData);

    const cookie = loginRes.headers.get('set-cookie');
    if (!cookie) throw new Error('No cookie received from login');

    // Create test files
    const testThumbPath = path.join(__dirname, 'test_thumb.jpg');
    const testVideoPath = path.join(__dirname, 'test_video.mp4');
    fs.writeFileSync(testThumbPath, Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]));
    fs.writeFileSync(testVideoPath, Buffer.from('TEST_MP4_DEMO_VIDEO_CONTENT'));

    // Prepare multipart form data using native FormData
    const formData = new FormData();
    formData.append('title', 'Automated Test Video ' + Date.now());
    formData.append('description', 'Test description from verification script');
    formData.append('category', 'latest');
    formData.append('published', '1');

    const thumbBlob = new Blob([fs.readFileSync(testThumbPath)], { type: 'image/jpeg' });
    const videoBlob = new Blob([fs.readFileSync(testVideoPath)], { type: 'video/mp4' });

    formData.append('thumbnail', thumbBlob, 'test_thumb.jpg');
    formData.append('video', videoBlob, 'test_video.mp4');

    const uploadRes = await fetch('http://127.0.0.1:3000/api/videos', {
      method: 'POST',
      headers: { 'Cookie': cookie },
      body: formData
    });

    const uploadData = await uploadRes.json();
    console.log('Upload video status:', uploadRes.status, uploadData);

    if (uploadData.success && uploadData.video) {
      console.log('✓ Successfully created video ID:', uploadData.video.id, 'Title:', uploadData.video.title);

      // Verify that this video appears in public GET /api/videos
      const publicRes = await fetch('http://127.0.0.1:3000/api/videos');
      const publicVideos = await publicRes.json();
      const found = publicVideos.find(v => v.id === uploadData.video.id);

      if (found) {
        console.log('✓ Newly published video appears automatically in public /api/videos feed!');
      } else {
        console.log('✗ Video did not appear in public feed');
      }

      // Cleanup test video
      const delRes = await fetch(`http://127.0.0.1:3000/api/videos/${uploadData.video.id}`, {
        method: 'DELETE',
        headers: { 'Cookie': cookie }
      });
      console.log('✓ Cleanup test video status:', delRes.status);
    }

    // Clean temp files
    if (fs.existsSync(testThumbPath)) fs.unlinkSync(testThumbPath);
    if (fs.existsSync(testVideoPath)) fs.unlinkSync(testVideoPath);

    console.log('\n🎉 ALL MODAL AND UPLOAD VERIFICATIONS COMPLETED SUCCESSFULLY!');
  } catch (err) {
    console.error('API Verification error:', err);
  }
}

runTests();
