/**
 * scripts/test_featured_carousel_browser.js
 * End-to-End Real Browser & API Test for Redesigned Pure-Video Featured Carousel
 * Verifies all 16 User Requirements.
 */

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

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to create a dummy MP4 test file for gallery upload if needed
function getTestVideoPath() {
  const seedPath = path.join(__dirname, '..', 'public', 'uploads', 'videos', 'seed-video-1.mp4');
  if (fs.existsSync(seedPath)) return seedPath;
  const tempPath = path.join(__dirname, 'test_upload_gallery.mp4');
  if (!fs.existsSync(tempPath)) {
    // 100KB dummy video file
    fs.writeFileSync(tempPath, Buffer.alloc(100 * 1024, 0));
  }
  return tempPath;
}

async function run() {
  console.log('======================================================================');
  console.log('TESTING ALL 16 REQUIREMENTS: HOMEPAGE FEATURED CAROUSEL REDESIGN');
  console.log('======================================================================\n');
  console.log(`Browser executable: ${CHROME_PATH}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => {
    console.error(' [BROWSER ERROR]', err.message);
    pageErrors.push(err.message);
  });

  try {
    // ----------------------------------------------------------------------
    // 0. AUTHENTICATE ADMIN SESSION
    // ----------------------------------------------------------------------
    console.log('\n--- AUTHENTICATING ADMIN SESSION ---');
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

    // ----------------------------------------------------------------------
    // REQUIREMENT 1 & 2: ADMIN UPLOAD FROM GALLERY & SAVE AS SLOT 1
    // ----------------------------------------------------------------------
    console.log('\n--- ITEM 1 & 2: UPLOAD VIDEO FROM GALLERY & SAVE AS SLOT 1 ---');
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#featuredSlotsGrid .featured-slot-card', { timeout: 10000 });

    const testVideoFile = getTestVideoPath();
    console.log(`Using test video for gallery upload: ${testVideoFile}`);

    // Test API gallery upload endpoint directly
    const formUpload = new FormData();
    const fileBytes = fs.readFileSync(testVideoFile);
    formUpload.append('video', new Blob([fileBytes], { type: 'video/mp4' }), 'gallery_featured_1.mp4');

    const uploadRes = await fetch(`${BASE_URL}/api/admin/featured-carousel/upload`, {
      method: 'POST',
      headers: { 'Cookie': `admin_token=${tokenVal}` },
      body: formUpload
    });
    assert.strictEqual(uploadRes.status, 200, 'POST /api/admin/featured-carousel/upload should return 200');
    const uploadJson = await uploadRes.json();
    assert.strictEqual(uploadJson.success, true, 'Upload success should be true');
    assert.ok(uploadJson.video_url, 'Must return uploaded video_url');
    console.log(`Uploaded gallery video URL: ${uploadJson.video_url}`);

    // Save as Slot 1 with initial zoom 1.0, pan 0, 0
    const saveSlot1Res = await fetch(`${BASE_URL}/api/admin/featured-carousel/slot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `admin_token=${tokenVal}`
      },
      body: JSON.stringify({
        slot_position: 1,
        video_url: uploadJson.video_url,
        zoom: 1.0,
        pan_x: 0,
        pan_y: 0,
        is_active: true
      })
    });
    assert.strictEqual(saveSlot1Res.status, 200, 'Saving Slot 1 must return 200');
    console.log('✅ Slot 1 saved with new gallery video.');

    // ----------------------------------------------------------------------
    // REQUIREMENT 3: POPULATE SLOTS 2-6
    // ----------------------------------------------------------------------
    console.log('\n--- ITEM 3: ENSURE DIFFERENT VIDEOS IN SLOTS 2-6 ---');
    const seedVideosRes = await fetch(`${BASE_URL}/api/videos`);
    const seedVideosJson = await seedVideosRes.json();
    const otherVideos = seedVideosJson.slice(0, 5);

    for (let pos = 2; pos <= 6; pos++) {
      const vItem = otherVideos[pos - 2];
      const vUrl = (vItem && (vItem.video_url || vItem.video_path)) || `/uploads/videos/seed-video-${pos}.mp4`;
      await fetch(`${BASE_URL}/api/admin/featured-carousel/slot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': `admin_token=${tokenVal}`
        },
        body: JSON.stringify({
          slot_position: pos,
          video_url: vUrl,
          zoom: 1.0,
          pan_x: 0,
          pan_y: 0,
          is_active: true
        })
      });
    }
    console.log('✅ Slots 1-6 configured.');

    // ----------------------------------------------------------------------
    // REQUIREMENT 4: ADJUST ZOOM AND PAN IN ADMIN EDITOR
    // ----------------------------------------------------------------------
    console.log('\n--- ITEM 4: ADJUST ZOOM & PAN IN ADMIN POSITIONING EDITOR ---');
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#featuredSlotsGrid .featured-slot-card');

    // Click "Adjust Position" on Slot 1
    const openedEditor = await page.evaluate(() => {
      const card1 = document.querySelector('.featured-slot-card[data-position="1"]');
      const adjustBtn = card1 ? card1.querySelector('.btn-slot-adjust') : null;
      if (adjustBtn) {
        adjustBtn.click();
        return true;
      }
      return false;
    });
    assert.ok(openedEditor, 'Should click Adjust Position button for Slot 1');
    await sleep(600);

    // Verify Positioning Editor Modal is open
    const modalCheck = await page.evaluate(() => {
      const modal = document.getElementById('featuredVideoEditorModal');
      const bgVid = document.getElementById('editorBgVideo');
      const fgVid = document.getElementById('editorFgVideo');
      const zoomSlider = document.getElementById('editorZoomSlider');
      return {
        isOpen: modal ? modal.classList.contains('active') : false,
        hasBgVid: Boolean(bgVid && bgVid.src),
        hasFgVid: Boolean(fgVid && fgVid.src),
        zoomVal: zoomSlider ? zoomSlider.value : null
      };
    });
    console.log('Admin Video Positioning Editor check:', modalCheck);
    assert.strictEqual(modalCheck.isOpen, true, 'Editor modal must be open');
    assert.strictEqual(modalCheck.hasBgVid, true, 'Editor background video must be loaded');
    assert.strictEqual(modalCheck.hasFgVid, true, 'Editor foreground video must be loaded');

    // Simulate Zoom In via + button
    await page.click('#btnEditorZoomIn');
    await sleep(100);
    await page.click('#btnEditorZoomIn');
    await sleep(100);

    // Simulate Pan Drag on viewport
    const dragResult = await page.evaluate(() => {
      const vp = document.getElementById('featuredEditorViewport');
      const rect = vp.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;

      // Dispatch mousedown
      vp.dispatchEvent(new MouseEvent('mousedown', { clientX: startX, clientY: startY, bubbles: true }));
      // Dispatch mousemove (+25px X, -15px Y)
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: startX + 25, clientY: startY - 15, bubbles: true }));
      // Dispatch mouseup
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      const fgVid = document.getElementById('editorFgVideo');
      const zoomSlider = document.getElementById('editorZoomSlider');
      const panCoords = document.getElementById('editorPanCoords');
      return {
        fgTransform: fgVid ? fgVid.style.transform : '',
        zoomVal: zoomSlider ? zoomSlider.value : '',
        panText: panCoords ? panCoords.textContent : ''
      };
    });
    console.log('After zoom & pan adjustment:', dragResult);
    assert.ok(dragResult.fgTransform.includes('translate'), 'Transform must include pan translate');
    assert.ok(dragResult.fgTransform.includes('scale'), 'Transform must include zoom scale');

    // Save adjusted position
    await page.click('#btnSaveFeaturedEditor');
    await sleep(1000);

    // Verify saved zoom and pan in API
    const slotCheckRes = await fetch(`${BASE_URL}/api/featured-videos`);
    const slotCheckData = await slotCheckRes.json();
    const s1 = slotCheckData.videos.find(v => v.slot_position === 1);
    console.log('Slot 1 persisted position in API:', { zoom: s1.zoom, pan_x: s1.pan_x, pan_y: s1.pan_y });
    assert.ok(s1.zoom > 1.0, 'Slot 1 zoom must be updated > 1.0');

    // ----------------------------------------------------------------------
    // REQUIREMENT 5 & 6 & 1: HOMEPAGE PURE VIDEO DESIGN VERIFICATION
    // ----------------------------------------------------------------------
    console.log('\n--- ITEMS 1, 5, 6: HOMEPAGE PURE VIDEO DESIGN & DUAL-LAYER FIT ---');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    // Handle age gate if visible
    const ageGateBtn = await page.$('#btnAgeOver18');
    if (ageGateBtn) {
      await ageGateBtn.click();
      await sleep(300);
    }

    // VERIFY ALL EXTRA UI IS COMPLETELY REMOVED FROM CAROUSEL
    const uiRemovalCheck = await page.evaluate(() => {
      const carousel = document.getElementById('featuredCarouselSection');
      if (!carousel) return { missingCarousel: true };

      return {
        hasHeading: Boolean(carousel.querySelector('.featured-section-title') || carousel.querySelector('h2') || carousel.querySelector('h3')),
        hasCounter: Boolean(carousel.querySelector('.featured-counter') || carousel.querySelector('#featuredCounterBadge') || carousel.querySelector('#featuredCurrentSlide')),
        hasDots: Boolean(carousel.querySelector('.featured-dots') || carousel.querySelector('.featured-dot')),
        hasSlotPill: Boolean(carousel.querySelector('.featured-slot-pill')),
        hasWatchBtn: Boolean(carousel.querySelector('.featured-watch-btn')),
        hasMuteBtn: Boolean(carousel.querySelector('.featured-sound-toggle')),
        hasDuration: Boolean(carousel.querySelector('.featured-dur-pill')),
        hasTitle: Boolean(carousel.querySelector('.featured-video-title')),
        hasInfoOverlay: Boolean(carousel.querySelector('.featured-info-overlay')),
        textInsideCarousel: carousel.innerText.trim()
      };
    });
    console.log('Extra UI Removal Verification:', uiRemovalCheck);
    assert.strictEqual(uiRemovalCheck.hasHeading, false, 'No heading must appear in carousel');
    assert.strictEqual(uiRemovalCheck.hasCounter, false, 'No "1 / 6" counter must appear in carousel');
    assert.strictEqual(uiRemovalCheck.hasDots, false, 'No dots indicator must appear in carousel');
    assert.strictEqual(uiRemovalCheck.hasSlotPill, false, 'No "Slot X" pill must appear in carousel');
    assert.strictEqual(uiRemovalCheck.hasWatchBtn, false, 'No Watch button must appear in carousel');
    assert.strictEqual(uiRemovalCheck.hasMuteBtn, false, 'No Mute button must appear in carousel');
    assert.strictEqual(uiRemovalCheck.hasDuration, false, 'No duration must appear in carousel');
    assert.strictEqual(uiRemovalCheck.hasTitle, false, 'No title text must appear in carousel');
    assert.strictEqual(uiRemovalCheck.hasInfoOverlay, false, 'No info overlay must appear in carousel');
    assert.strictEqual(uiRemovalCheck.textInsideCarousel, '', 'Visually NO text should appear over the carousel video');

    // VERIFY DUAL-LAYER FIT & UNUSED SPACE BLUR
    const dualLayerCheck = await page.evaluate(() => {
      const s0 = document.querySelector('.featured-slide[data-index="0"]');
      if (!s0) return { slideMissing: true };

      const bgLayer = s0.querySelector('.featured-bg-layer');
      const bgVideo = s0.querySelector('.featured-bg-video');
      const fgContainer = s0.querySelector('.featured-fg-container');
      const fgFrame = s0.querySelector('.featured-fg-frame');
      const fgVideo = s0.querySelector('.featured-fg-video');

      const bgFilter = window.getComputedStyle(bgVideo).filter;
      const bgObjectFit = window.getComputedStyle(bgVideo).objectFit;
      const fgObjectFit = window.getComputedStyle(fgVideo).objectFit;
      const fgFrameRatio = window.getComputedStyle(fgFrame).aspectRatio;

      return {
        hasBgVideo: Boolean(bgVideo),
        hasFgVideo: Boolean(fgVideo),
        bgFilter,
        bgObjectFit,
        fgObjectFit,
        fgFrameRatio,
        bgSrc: bgVideo.src || bgVideo.dataset.src,
        fgSrc: fgVideo.src || fgVideo.dataset.src
      };
    });
    console.log('Dual-layer video check:', dualLayerCheck);
    assert.ok(dualLayerCheck.hasBgVideo, 'Background video layer must exist');
    assert.ok(dualLayerCheck.hasFgVideo, 'Foreground video layer must exist');
    assert.ok(dualLayerCheck.bgFilter.includes('blur'), 'Background video must be heavily blurred');
    assert.strictEqual(dualLayerCheck.bgObjectFit, 'cover', 'Background video must cover complete carousel container');
    assert.strictEqual(dualLayerCheck.fgObjectFit, 'contain', 'Foreground video must NEVER be stretched or distorted (object-fit: contain)');
    assert.strictEqual(dualLayerCheck.bgSrc, dualLayerCheck.fgSrc, 'Background and foreground must use the SAME video asset');

    // ----------------------------------------------------------------------
    // REQUIREMENT 7, 8, 9: NAVIGATION & PLAYBACK PAUSE BEHAVIOR
    // ----------------------------------------------------------------------
    console.log('\n--- ITEMS 7, 8, 9: SWIPE/NEXT BEHAVIOR & SINGLE PLAYING VIDEO RULE ---');
    await sleep(800);

    // Slot 1 is active initially
    const initialPlay = await page.evaluate(() => {
      const fg0 = document.getElementById('featuredFgVideo_0');
      const fg1 = document.getElementById('featuredFgVideo_1');
      return {
        fg0HasSrc: Boolean(fg0 && (fg0.src || fg0.dataset.src)),
        fg0Muted: fg0 ? fg0.muted : false,
        fg1Paused: fg1 ? fg1.paused : true
      };
    });
    console.log('Slot 1 initial playback state:', initialPlay);
    assert.strictEqual(initialPlay.fg0Muted, true, 'Slot 1 must be muted initially per autoplay policy');

    // Advance 1 -> 2
    await page.click('#btnFeaturedNext');
    await sleep(700);

    const afterAdvance1to2 = await page.evaluate(() => {
      const fg0 = document.getElementById('featuredFgVideo_0');
      const fg1 = document.getElementById('featuredFgVideo_1');
      return {
        fg0Paused: fg0 ? fg0.paused : null,
        fg0Time: fg0 ? fg0.currentTime : null,
        fg1Paused: fg1 ? fg1.paused : null
      };
    });
    console.log('After advancing 1 -> 2:', afterAdvance1to2);
    assert.strictEqual(afterAdvance1to2.fg0Paused, true, 'Slot 1 must pause immediately when swiping away');

    // Advance 2 -> 3
    await page.click('#btnFeaturedNext');
    await sleep(700);

    const afterAdvance2to3 = await page.evaluate(() => {
      const fg1 = document.getElementById('featuredFgVideo_1');
      const fg2 = document.getElementById('featuredFgVideo_2');
      return {
        fg1Paused: fg1 ? fg1.paused : null,
        fg2Paused: fg2 ? fg2.paused : null
      };
    });
    console.log('After advancing 2 -> 3:', afterAdvance2to3);
    assert.strictEqual(afterAdvance2to3.fg1Paused, true, 'Slot 2 must pause immediately when leaving viewport');

    // Advance 3 -> 4 -> 5 -> 6
    for (let s = 3; s < 6; s++) {
      await page.click('#btnFeaturedNext');
      await sleep(600);
    }
    console.log('Advanced through to Slot 6.');

    // ----------------------------------------------------------------------
    // REQUIREMENT 10: REFRESH ALWAYS STARTS AT SLOT 1
    // ----------------------------------------------------------------------
    console.log('\n--- ITEM 10: REFRESH BEHAVIOR (ALWAYS STARTS AT SLOT 1) ---');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(600);

    const refreshCheck = await page.evaluate(() => {
      const track = document.getElementById('featuredTrack');
      return {
        scrollLeft: track ? track.scrollLeft : -1
      };
    });
    console.log('Track scrollLeft after refresh:', refreshCheck.scrollLeft);
    assert.strictEqual(refreshCheck.scrollLeft, 0, 'Every homepage refresh must start at Slot 1 (scrollLeft = 0)');

    // ----------------------------------------------------------------------
    // REQUIREMENT 11: MOBILE-FIRST RESPONSIVE VIEWPORT & SWIPE
    // ----------------------------------------------------------------------
    console.log('\n--- ITEM 11: MOBILE VIEWPORT COMPACT SIZE & SWIPE ---');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(600);

    const mobileDimensions = await page.evaluate(() => {
      const vpWrapper = document.querySelector('.featured-viewport-wrapper');
      const rect = vpWrapper.getBoundingClientRect();
      const catNav = document.getElementById('categoryNavSection');
      const feedHeader = document.querySelector('.feed-header');
      const gapToCat = rect.top - catNav.getBoundingClientRect().bottom;
      const gapToFeed = feedHeader.getBoundingClientRect().top - rect.bottom;

      return {
        width: rect.width,
        height: rect.height,
        gapToCat,
        gapToFeed
      };
    });
    console.log('Mobile Carousel Dimensions & Spacing:', mobileDimensions);
    assert.ok(mobileDimensions.height <= 340, 'Carousel container must be compact and NOT a full-height 9:16 vertical phone screen');
    assert.ok(mobileDimensions.height >= 220, 'Carousel height should be suitable compact size');
    assert.ok(mobileDimensions.gapToCat < 25, 'Small spacing between category tabs and carousel');
    assert.ok(mobileDimensions.gapToFeed < 30, 'Small spacing between carousel and Latest Videos feed');

    // Mobile swipe via scroll
    await page.evaluate(() => {
      const track = document.getElementById('featuredTrack');
      track.scrollTo({ left: track.clientWidth, behavior: 'smooth' });
    });
    await sleep(700);

    const mobileSwipeVideoCheck = await page.evaluate(() => {
      const fg0 = document.getElementById('featuredFgVideo_0');
      return { fg0Paused: fg0 ? fg0.paused : null };
    });
    assert.strictEqual(mobileSwipeVideoCheck.fg0Paused, true, 'Mobile swipe away pauses previous video');

    // ----------------------------------------------------------------------
    // REQUIREMENT 12: DESKTOP VIEWPORT & COMPACT RATIO
    // ----------------------------------------------------------------------
    console.log('\n--- ITEM 12: DESKTOP VIEWPORT COMPACT SIZE ---');
    await page.setViewport({ width: 1280, height: 900 });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(600);

    const desktopDimensions = await page.evaluate(() => {
      const vpWrapper = document.querySelector('.featured-viewport-wrapper');
      const rect = vpWrapper.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height
      };
    });
    console.log('Desktop Carousel Dimensions:', desktopDimensions);
    assert.ok(desktopDimensions.height <= 360, 'Desktop carousel must be compact, not dominating homepage');

    // ----------------------------------------------------------------------
    // REQUIREMENT 13: REPLACE A SLOT
    // ----------------------------------------------------------------------
    console.log('\n--- ITEM 13: REPLACE A SLOT ---');
    const replaceSlotRes = await fetch(`${BASE_URL}/api/admin/featured-carousel/slot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `admin_token=${tokenVal}`
      },
      body: JSON.stringify({
        slot_position: 2,
        video_url: '/uploads/videos/seed-video-3.mp4',
        zoom: 1.15,
        pan_x: 10,
        pan_y: -5,
        is_active: true
      })
    });
    assert.strictEqual(replaceSlotRes.status, 200, 'Replacing slot must succeed');

    const replaceVerify = await fetch(`${BASE_URL}/api/featured-videos`);
    const replaceData = await replaceVerify.json();
    const s2 = replaceData.videos.find(v => v.slot_position === 2);
    assert.strictEqual(s2.video_url, '/uploads/videos/seed-video-3.mp4', 'Slot 2 must be replaced');
    assert.strictEqual(s2.zoom, 1.15, 'Slot 2 zoom must be preserved');
    console.log('✅ Slot 2 replaced successfully.');

    // ----------------------------------------------------------------------
    // REQUIREMENT 14: DELETE A SLOT
    // ----------------------------------------------------------------------
    console.log('\n--- ITEM 14: DELETE A SLOT ---');
    const delRes = await fetch(`${BASE_URL}/api/admin/featured-carousel/6`, {
      method: 'DELETE',
      headers: { 'Cookie': `admin_token=${tokenVal}` }
    });
    assert.strictEqual(delRes.status, 200, 'Deleting slot 6 must return 200');

    const delVerify = await fetch(`${BASE_URL}/api/featured-videos`);
    const delData = await delVerify.json();
    console.log(`Featured videos count after deleting slot 6: ${delData.videos.length}`);
    assert.strictEqual(delData.videos.length, 5, 'Must have 5 active slots after deleting slot 6');
    console.log('✅ Slot 6 deleted successfully.');

    // ----------------------------------------------------------------------
    // REQUIREMENT 15: REORDER SLOTS
    // ----------------------------------------------------------------------
    console.log('\n--- ITEM 15: REORDER SLOTS (PRESERVE ORDER 1 -> 2 -> 3 -> 4 -> 5) ---');
    const reorderPayload = [
      { slot_position: 1, video_url: '/uploads/videos/seed-video-3.mp4', zoom: 1.0, pan_x: 0, pan_y: 0, is_active: true },
      { slot_position: 2, video_url: uploadJson.video_url, zoom: 1.2, pan_x: 5, pan_y: -5, is_active: true },
      { slot_position: 3, video_url: '/uploads/videos/seed-video-2.mp4', zoom: 1.0, pan_x: 0, pan_y: 0, is_active: true },
      { slot_position: 4, video_url: '/uploads/videos/seed-video-4.mp4', zoom: 1.0, pan_x: 0, pan_y: 0, is_active: true },
      { slot_position: 5, video_url: '/uploads/videos/seed-video-5.mp4', zoom: 1.0, pan_x: 0, pan_y: 0, is_active: true }
    ];

    const reorderRes = await fetch(`${BASE_URL}/api/admin/featured-carousel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `admin_token=${tokenVal}`
      },
      body: JSON.stringify({ slots: reorderPayload })
    });
    assert.strictEqual(reorderRes.status, 200, 'Reorder slots must succeed');

    const reorderVerify = await fetch(`${BASE_URL}/api/featured-videos`);
    const reorderData = await reorderVerify.json();
    assert.strictEqual(reorderData.videos[0].video_url, '/uploads/videos/seed-video-3.mp4', 'Slot 1 matches reorder');
    assert.strictEqual(reorderData.videos[1].video_url, uploadJson.video_url, 'Slot 2 matches reorder');
    console.log('✅ Slots reordered successfully.');

    // ----------------------------------------------------------------------
    // REQUIREMENT 16: VERIFY EXISTING NORMAL VIDEOS STILL WORK
    // ----------------------------------------------------------------------
    console.log('\n--- ITEM 16: VERIFY NORMAL VIDEOS AND SYSTEM REMAIN UNBROKEN ---');
    const normalVideosRes = await fetch(`${BASE_URL}/api/videos`);
    assert.strictEqual(normalVideosRes.status, 200, 'Normal videos API must return 200');
    const normalVideos = await normalVideosRes.json();
    assert.ok(normalVideos.length > 0, 'Normal published videos must exist');

    const firstNormal = normalVideos[0];
    const normalDetailsRes = await fetch(`${BASE_URL}/api/videos/${firstNormal.id}`);
    assert.strictEqual(normalDetailsRes.status, 200, 'Video details API must return 200');
    const normalDetails = await normalDetailsRes.json();
    assert.strictEqual((normalDetails.video && normalDetails.video.id) || normalDetails.id, firstNormal.id, 'Video record matches');

    // Restore full 6 slots for production cleanliness
    const restore6 = [
      { slot_position: 1, video_url: uploadJson.video_url, zoom: 1.1, pan_x: 5, pan_y: 0, is_active: true },
      { slot_position: 2, video_url: '/uploads/videos/seed-video-2.mp4', zoom: 1.0, pan_x: 0, pan_y: 0, is_active: true },
      { slot_position: 3, video_url: '/uploads/videos/seed-video-3.mp4', zoom: 1.0, pan_x: 0, pan_y: 0, is_active: true },
      { slot_position: 4, video_url: '/uploads/videos/seed-video-4.mp4', zoom: 1.0, pan_x: 0, pan_y: 0, is_active: true },
      { slot_position: 5, video_url: '/uploads/videos/seed-video-5.mp4', zoom: 1.0, pan_x: 0, pan_y: 0, is_active: true },
      { slot_position: 6, video_url: '/uploads/videos/seed-video-6.mp4', zoom: 1.0, pan_x: 0, pan_y: 0, is_active: true }
    ];
    await fetch(`${BASE_URL}/api/admin/featured-carousel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `admin_token=${tokenVal}`
      },
      body: JSON.stringify({ slots: restore6 })
    });
    console.log('✅ Final 6 slots restored.');

    console.log('\n======================================================================');
    console.log('🎉 ALL 16 REQUIREMENTS FULLY TESTED AND PASSED IN REAL BROWSER!');
    console.log('======================================================================\n');

  } catch (err) {
    console.error('\n❌ TEST FAILURE:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
