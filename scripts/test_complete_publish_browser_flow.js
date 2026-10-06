const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE_URL = 'http://127.0.0.1:3000';

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : (fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

async function run() {
  console.log('======================================================================');
  console.log('COMPLETE REAL BROWSER E2E TEST: PUBLISH BUTTON & THUMBNAIL FLOW');
  console.log('======================================================================\n');

  console.log(`Using browser binary: ${CHROME_PATH}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  const pageErrors = [];
  page.on('pageerror', (err) => {
    console.error(' [BROWSER ERROR]', err.message);
    pageErrors.push(err.message);
  });

  const createdVideoIds = [];

  try {
    // ----------------------------------------------------------------------
    // 1. Admin Authentication
    // ----------------------------------------------------------------------
    console.log('1. Authenticating admin session...');
    const loginRes = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const rawCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
    let tokenVal = '';
    rawCookies.forEach(c => {
      const m = c && c.match(/admin_token=([^;]+)/);
      if (m) tokenVal = m[1];
    });
    assert(tokenVal, 'Failed to obtain admin_token cookie');

    await page.setCookie({
      name: 'admin_token',
      value: tokenVal,
      domain: '127.0.0.1',
      path: '/'
    });

    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    console.log('✅ Admin dashboard loaded, URL:', page.url());

    // ----------------------------------------------------------------------
    // 2. Test Validation Messages & Enabled Button State
    // ----------------------------------------------------------------------
    console.log('\n2. Testing Form Validations & Enabled Button State...');
    await page.click('#btnOpenAddModal');
    await page.waitForSelector('#addVideoModal.active', { visible: true });
    console.log('   Add Video modal opened.');

    // 2a. Click Publish with empty form
    await page.click('#btnSubmitAdd');
    await new Promise(r => setTimeout(r, 200));

    let val = await page.evaluate(() => {
      const banner = document.getElementById('addErrorBanner');
      const btn = document.getElementById('btnSubmitAdd');
      return {
        bannerText: banner ? banner.textContent : '',
        bannerDisplay: banner ? banner.style.display : '',
        btnDisabled: btn ? btn.disabled : false,
        btnText: btn ? btn.innerText.trim() : ''
      };
    });
    console.log('   Validation test 1 (empty form):', val);
    assert(val.bannerDisplay !== 'none' && val.bannerText.includes('title is required'), 'Expected title validation message');
    assert(!val.btnDisabled, 'Publish button MUST remain enabled when validation fails');
    console.log('   ✅ Title validation showed exact error message and button remained enabled.');

    // 2b. Fill title, click Publish without thumbnail
    await page.type('#addTitle', 'Validation Test');
    await page.click('#btnSubmitAdd');
    await new Promise(r => setTimeout(r, 200));

    val = await page.evaluate(() => {
      const banner = document.getElementById('addErrorBanner');
      const btn = document.getElementById('btnSubmitAdd');
      return {
        bannerText: banner ? banner.textContent : '',
        bannerDisplay: banner ? banner.style.display : '',
        btnDisabled: btn ? btn.disabled : false
      };
    });
    console.log('   Validation test 2 (missing thumb):', val);
    assert(val.bannerDisplay !== 'none' && val.bannerText.includes('thumbnail image'), 'Expected thumbnail validation message');
    assert(!val.btnDisabled, 'Publish button MUST remain enabled when validation fails');
    console.log('   ✅ Thumbnail validation showed exact error message and button remained enabled.');

    // Close modal
    await page.click('#btnCloseAddModal');
    await page.waitForSelector('#addVideoModal:not(.active)', { hidden: true });

    // ----------------------------------------------------------------------
    // 3. Complete Flow: Publish 16:9 Video with Cropped Thumbnail
    // ----------------------------------------------------------------------
    console.log('\n3. Testing 16:9 Landscape Publish Flow (Add -> Crop -> Publish)...');
    await page.click('#btnOpenAddModal');
    await page.waitForSelector('#addVideoModal.active', { visible: true });

    const title16x9 = `Auto Test 16:9 Video ${Date.now()}`;
    await page.type('#addTitle', title16x9);
    await page.type('#addDescription', 'Test description for 16:9 video');

    // Ensure 16:9 format selected
    await page.evaluate(() => {
      const r = document.querySelector('input[name="addThumbFormat"][value="16:9"]');
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Provide portrait image to trigger crop editor
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 800;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ff4757';
      ctx.fillRect(0, 0, 400, 800);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(100, 300, 200, 200);

      return new Promise(res => {
        c.toBlob(blob => {
          const file = new File([blob], 'portrait-169.jpg', { type: 'image/jpeg' });
          const dt = new DataTransfer();
          dt.items.add(file);
          const input = document.getElementById('addThumbnail');
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          res();
        }, 'image/jpeg');
      });
    });

    await page.waitForSelector('#thumbEditorModal.active', { visible: true });
    console.log('   ✅ Thumbnail crop/fit editor opened automatically on image select.');

    // Save thumbnail in editor
    await page.click('#btnSaveThumbEditor');
    await page.waitForSelector('#thumbEditorModal:not(.active)', { hidden: true });
    console.log('   ✅ Crop editor saved and closed.');

    // Verify preview card shows 16:9 saved
    const badge16x9 = await page.evaluate(() => {
      const b = document.getElementById('addPreviewBadge');
      return b ? b.textContent : '';
    });
    console.log(`   Preview badge text: "${badge16x9}"`);
    assert(badge16x9.includes('16:9'), 'Expected 16:9 badge');

    // Add video file
    await page.evaluate(async () => {
      // Create minimal fake video blob
      const blob = new Blob([new Uint8Array(1024 * 50)], { type: 'video/mp4' });
      const file = new File([blob], 'sample-video.mp4', { type: 'video/mp4' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('addVideoFile');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 400));

    // Monitor network requests
    let postSent = false;
    let postStatus = null;
    page.on('request', req => {
      if (req.url().includes('/api/videos') && req.method() === 'POST') {
        postSent = true;
      }
    });
    page.on('response', res => {
      if (res.url().includes('/api/videos') && res.request().method() === 'POST') {
        postStatus = res.status();
      }
    });

    console.log('   Clicking "Publish Video" (#btnSubmitAdd)...');
    await page.click('#btnSubmitAdd');

    // Check loading text
    await new Promise(r => setTimeout(r, 80));
    const btnLoading = await page.evaluate(() => {
      const btn = document.getElementById('btnSubmitAdd');
      const text = document.getElementById('btnSubmitText');
      return {
        disabled: btn ? btn.disabled : false,
        text: text ? text.textContent : ''
      };
    });
    console.log('   Observed button state right after click:', btnLoading);
    assert(btnLoading.disabled, 'Publish button should be disabled during publish');
    assert(btnLoading.text.includes('Publishing') || btnLoading.text.includes('Uploading') || btnLoading.text.includes('Saving'), 'Expected loading text on publish button');

    // Wait for add modal to close
    await page.waitForSelector('#addVideoModal:not(.active)', { timeout: 15000 });
    console.log('   ✅ Add modal closed on completion.');
    assert(postSent, 'POST /api/videos MUST have been sent');
    assert(postStatus === 200 || postStatus === 201, `Expected 200/201 response, got ${postStatus}`);

    // Wait for video to appear in admin table
    await page.waitForFunction((t) => {
      const rows = Array.from(document.querySelectorAll('#adminTableBody tr'));
      return rows.some(r => r.textContent.includes(t));
    }, { timeout: 10000 }, title16x9);

    const video16x9Id = await page.evaluate((t) => {
      const rows = Array.from(document.querySelectorAll('#adminTableBody tr'));
      for (const row of rows) {
        if (row.textContent.includes(t)) {
          const editBtn = row.querySelector('.btn-edit');
          return editBtn ? Number(editBtn.getAttribute('data-id')) : null;
        }
      }
      return null;
    }, title16x9);

    assert(video16x9Id, `Published 16:9 video "${title16x9}" not found in admin table!`);
    console.log(`   ✅ Video found in Admin table with ID: ${video16x9Id}`);
    createdVideoIds.push(video16x9Id);

    // ----------------------------------------------------------------------
    // 4. Complete Flow: Publish 9:16 Portrait Video with Cropped Thumbnail
    // ----------------------------------------------------------------------
    console.log('\n4. Testing 9:16 Portrait Publish Flow (Add -> Crop -> Publish)...');
    await page.click('#btnOpenAddModal');
    await page.waitForSelector('#addVideoModal.active', { visible: true });

    const title9x16 = `Auto Test 9:16 Video ${Date.now()}`;
    await page.type('#addTitle', title9x16);
    await page.type('#addDescription', 'Test description for 9:16 portrait video');

    // Switch format to 9:16
    await page.evaluate(() => {
      const r = document.querySelector('input[name="addThumbFormat"][value="9:16"]');
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Provide landscape image to trigger 9:16 crop editor
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = 675;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#2ed573';
      ctx.fillRect(0, 0, 1200, 675);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(500, 200, 200, 200);

      return new Promise(res => {
        c.toBlob(blob => {
          const file = new File([blob], 'landscape-916.jpg', { type: 'image/jpeg' });
          const dt = new DataTransfer();
          dt.items.add(file);
          const input = document.getElementById('addThumbnail');
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          res();
        }, 'image/jpeg');
      });
    });

    await page.waitForSelector('#thumbEditorModal.active', { visible: true });
    console.log('   ✅ 9:16 Crop editor opened.');
    await page.click('#btnSaveThumbEditor');
    await page.waitForSelector('#thumbEditorModal:not(.active)', { hidden: true });

    // Add video file
    await page.evaluate(async () => {
      const blob = new Blob([new Uint8Array(1024 * 50)], { type: 'video/mp4' });
      const file = new File([blob], 'sample-video-2.mp4', { type: 'video/mp4' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('addVideoFile');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 400));

    console.log('   Clicking "Publish Video" for 9:16...');
    await page.click('#btnSubmitAdd');
    await page.waitForSelector('#addVideoModal:not(.active)', { timeout: 15000 });

    // Wait for 9:16 video to appear in admin table
    await page.waitForFunction((t) => {
      const rows = Array.from(document.querySelectorAll('#adminTableBody tr'));
      return rows.some(r => r.textContent.includes(t));
    }, { timeout: 10000 }, title9x16);

    const video9x16Id = await page.evaluate((t) => {
      const rows = Array.from(document.querySelectorAll('#adminTableBody tr'));
      for (const row of rows) {
        if (row.textContent.includes(t)) {
          const editBtn = row.querySelector('.btn-edit');
          return editBtn ? Number(editBtn.getAttribute('data-id')) : null;
        }
      }
      return null;
    }, title9x16);

    assert(video9x16Id, `Published 9:16 video "${title9x16}" not found in admin table!`);
    console.log(`   ✅ 9:16 Video found in Admin table with ID: ${video9x16Id}`);
    createdVideoIds.push(video9x16Id);

    // ----------------------------------------------------------------------
    // 5. Test Edit Video WITHOUT Changing Thumbnail
    // ----------------------------------------------------------------------
    console.log('\n5. Testing Edit Video WITHOUT changing thumbnail...');
    await page.click(`.btn-edit[data-id="${video16x9Id}"]`);
    await page.waitForSelector('#editVideoModal.active', { visible: true });

    const editedTitle = `${title16x9} (Edited No Thumb Change)`;
    await page.$eval('#editTitle', el => el.value = '');
    await page.type('#editTitle', editedTitle);

    await page.click('#btnSubmitEdit');
    await page.waitForSelector('#editVideoModal:not(.active)', { timeout: 10000 });
    console.log('   ✅ Edit Modal saved and closed.');

    await page.waitForFunction((t) => {
      const rows = Array.from(document.querySelectorAll('#adminTableBody tr'));
      return rows.some(r => r.textContent.includes(t));
    }, { timeout: 10000 }, editedTitle);
    console.log('   ✅ Video edited successfully without changing thumbnail.');

    // ----------------------------------------------------------------------
    // 6. Test Edit Video WITH Newly Cropped Replacement Thumbnail
    // ----------------------------------------------------------------------
    console.log('\n6. Testing Edit Video WITH newly cropped replacement thumbnail...');
    await page.click(`.btn-edit[data-id="${video16x9Id}"]`);
    await page.waitForSelector('#editVideoModal.active', { visible: true });

    // Switch ratio to 9:16 on edit
    await page.evaluate(() => {
      const r = document.querySelector('input[name="editThumbFormat"][value="9:16"]');
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Provide replacement image
    await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 1200;
      c.height = 675;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#9b59b6';
      ctx.fillRect(0, 0, 1200, 675);
      return new Promise(res => {
        c.toBlob(blob => {
          const file = new File([blob], 'edit-replacement.jpg', { type: 'image/jpeg' });
          const dt = new DataTransfer();
          dt.items.add(file);
          const input = document.getElementById('editThumbnail');
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          res();
        }, 'image/jpeg');
      });
    });

    await page.waitForSelector('#thumbEditorModal.active', { visible: true });
    console.log('   ✅ Crop editor opened during video edit.');
    await page.click('#btnSaveThumbEditor');
    await page.waitForSelector('#thumbEditorModal:not(.active)', { hidden: true });
    console.log('   Crop editor saved replacement thumbnail.');

    await page.click('#btnSubmitEdit');
    await page.waitForSelector('#editVideoModal:not(.active)', { timeout: 10000 });
    console.log('   ✅ Video updated with replacement cropped thumbnail.');

    // ----------------------------------------------------------------------
    // 7. Verify Videos on Public Homepage (public/index.html)
    // ----------------------------------------------------------------------
    console.log('\n7. Verifying videos appear on public Homepage...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    // Dismiss age gate
    await page.evaluate(() => {
      const btn = document.getElementById('btnEnter18');
      if (btn && window.getComputedStyle(btn).display !== 'none') {
        btn.click();
      }
    });
    await new Promise(r => setTimeout(r, 600));

    await page.waitForSelector('.video-card', { timeout: 8000 });

    const cardResults = await page.evaluate((t1, t2) => {
      const cards = Array.from(document.querySelectorAll('.video-card'));
      const c1 = cards.find(c => c.textContent.includes(t1));
      const c2 = cards.find(c => c.textContent.includes(t2));
      return {
        card1: c1 ? {
          title: c1.querySelector('.video-title')?.textContent,
          classes: c1.className,
          hasAspect: Array.from(c1.classList).some(cl => cl.startsWith('aspect-'))
        } : null,
        card2: c2 ? {
          title: c2.querySelector('.video-title')?.textContent,
          classes: c2.className,
          hasAspect: Array.from(c2.classList).some(cl => cl.startsWith('aspect-'))
        } : null
      };
    }, editedTitle, title9x16);

    console.log('   Homepage verification:', cardResults);
    assert(cardResults.card1, `Video "${editedTitle}" must appear on homepage`);
    assert(cardResults.card2, `Video "${title9x16}" must appear on homepage`);
    assert(cardResults.card1.hasAspect, 'Card 1 must have aspect ratio class');
    assert(cardResults.card2.hasAspect, 'Card 2 must have aspect ratio class');
    console.log('   ✅ Both videos confirmed visible on homepage with aspect ratio classes!');

    // ----------------------------------------------------------------------
    // 8. Clean up created test videos
    // ----------------------------------------------------------------------
    console.log('\n8. Cleaning up test videos from Neon Database...');
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      window.confirm = () => true;
    });

    for (const vid of createdVideoIds) {
      await page.evaluate(async (id) => {
        await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      }, vid);
      console.log(`   Cleaned up test video ID: ${vid}`);
    }

    assert(pageErrors.length === 0, `Encountered browser page errors: ${pageErrors.join(', ')}`);

    console.log('\n======================================================================');
    console.log('🎉 ALL REAL BROWSER TESTS PASSED COMPLETELY WITH 0 ERRORS!');
    console.log('======================================================================');

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
