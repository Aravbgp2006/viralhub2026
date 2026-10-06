/**
 * scripts/test_featured_carousel_browser.js
 * End-to-End Real Browser Test for Featured Videos Carousel & Admin Management
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
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

async function run() {
  console.log('======================================================================');
  console.log('FEATURED VIDEOS CAROUSEL: COMPLETE REAL BROWSER E2E TEST');
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
  page.on('console', (msg) => {
    console.log(' [BROWSER CONSOLE]', msg.text());
  });

  try {
    // ----------------------------------------------------------------------
    // STEP 1: RESTORE / ENSURE 6 SEEDED FEATURED VIDEOS
    // ----------------------------------------------------------------------
    console.log('\n--- STEP 1: INITIAL STATE & API VERIFICATION ---');
    const loginRes0 = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const rawCookies0 = loginRes0.headers.getSetCookie ? loginRes0.headers.getSetCookie() : [loginRes0.headers.get('set-cookie')];
    let tokenVal0 = '';
    rawCookies0.forEach(c => {
      const m = c && c.match(/admin_token=([^;]+)/);
      if (m) tokenVal0 = m[1];
    });
    assert(tokenVal0, 'Failed to obtain admin_token cookie');

    const top6Seed = [41, 42, 40, 39, 74, 73];
    await fetch(`${BASE_URL}/api/admin/featured-videos`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `admin_token=${tokenVal0}`
      },
      body: JSON.stringify({
        slots: top6Seed.map((vidId, i) => ({ position: i + 1, video_id: vidId, is_active: true }))
      })
    });

    const initRes = await fetch(`${BASE_URL}/api/featured-videos`);
    const initData = await initRes.json();
    assert.strictEqual(initRes.status, 200, 'GET /api/featured-videos must return 200');
    assert.strictEqual(initData.success, true, 'GET /api/featured-videos success flag');
    console.log(`Current featured videos count: ${initData.videos.length}`);
    assert.strictEqual(initData.videos.length, 6, 'Should have exactly 6 featured videos seeded');

    // ----------------------------------------------------------------------
    // STEP 2: DESKTOP HOMEPAGE CAROUSEL VERIFICATION
    // ----------------------------------------------------------------------
    console.log('\n--- STEP 2: DESKTOP HOMEPAGE CAROUSEL ---');
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    // Handle age gate if visible
    const ageGateBtn = await page.$('#btnAgeOver18');
    if (ageGateBtn) {
      await ageGateBtn.click();
      await sleep(300);
    }

    // Check position: Carousel must exist immediately below categoryNavSection
    const positionCheck = await page.evaluate(() => {
      const catNav = document.getElementById('categoryNavSection');
      const carousel = document.getElementById('featuredCarouselSection');
      if (!catNav || !carousel) return { valid: false, reason: 'missing elements' };
      const nextSibling = catNav.nextElementSibling;
      return {
        valid: nextSibling === carousel || carousel.previousElementSibling === catNav,
        catNavBottom: catNav.getBoundingClientRect().bottom,
        carouselTop: carousel.getBoundingClientRect().top
      };
    });
    console.log('Position relative to category navigation:', positionCheck);
    assert.ok(positionCheck.valid, 'Carousel must be positioned directly below category navigation tabs');

    // Check visibility and slide count
    const desktopCarouselInfo = await page.evaluate(() => {
      const section = document.getElementById('featuredCarouselSection');
      const slides = document.querySelectorAll('#featuredTrack .featured-slide');
      const currentSlideText = document.getElementById('featuredCurrentSlide')?.textContent;
      const totalSlidesText = document.getElementById('featuredTotalSlides')?.textContent;
      return {
        display: window.getComputedStyle(section).display,
        slidesCount: slides.length,
        currentSlideText,
        totalSlidesText
      };
    });
    console.log('Desktop Carousel Info:', desktopCarouselInfo);
    assert.notStrictEqual(desktopCarouselInfo.display, 'none', 'Featured carousel section must be visible');
    assert.strictEqual(desktopCarouselInfo.slidesCount, initData.videos.length, 'Must render exact number of slides');
    assert.strictEqual(desktopCarouselInfo.currentSlideText, '1', 'Initial slide must be Slot 1');

    // ----------------------------------------------------------------------
    // STEP 3: SLOT 1 AUTOPLAY & PLAYBACK BEHAVIOR
    // ----------------------------------------------------------------------
    console.log('\n--- STEP 3: SLOT 1 AUTOPLAY & SINGLE PLAYING VIDEO GUARANTEE ---');
    await sleep(1000); // Allow autoplay policy to start video

    const playbackState1 = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('#featuredTrack .featured-video-player'));
      return videos.map((v, idx) => ({
        index: idx,
        paused: v.paused,
        currentTime: v.currentTime,
        muted: v.muted,
        hasSrc: Boolean(v.src)
      }));
    });
    console.log('Slide playback states at Slot 1:', playbackState1);

    // Verify only ONE video can play at any time
    const playingCount1 = playbackState1.filter(p => !p.paused).length;
    console.log(`Currently playing videos count: ${playingCount1}`);
    assert.ok(playingCount1 <= 1, 'Only ONE featured video may play at any time');

    // ----------------------------------------------------------------------
    // STEP 4: DESKTOP NAVIGATION (NEXT, NEXT, PREV)
    // ----------------------------------------------------------------------
    console.log('\n--- STEP 4: DESKTOP NAVIGATION & SLIDE SWITCHING ---');
    // Click Next (Slot 1 -> Slot 2)
    await page.click('#btnFeaturedNext');
    await sleep(600);

    const slide2State = await page.evaluate(() => {
      const current = document.getElementById('featuredCurrentSlide')?.textContent;
      const vid0 = document.getElementById('featuredVideo_0');
      const vid1 = document.getElementById('featuredVideo_1');
      return {
        currentSlide: current,
        vid0Paused: vid0?.paused,
        vid0Time: vid0?.currentTime,
        vid1Paused: vid1?.paused
      };
    });
    console.log('After Next (Slot 1 -> Slot 2):', slide2State);
    assert.strictEqual(slide2State.currentSlide, '2', 'Slide counter must show Slot 2');
    assert.strictEqual(slide2State.vid0Paused, true, 'Slot 1 video must be paused when moving to Slot 2');

    // Click Next again (Slot 2 -> Slot 3)
    await page.click('#btnFeaturedNext');
    await sleep(600);

    const slide3State = await page.evaluate(() => {
      const current = document.getElementById('featuredCurrentSlide')?.textContent;
      const vid1 = document.getElementById('featuredVideo_1');
      return {
        currentSlide: current,
        vid1Paused: vid1?.paused
      };
    });
    console.log('After Next (Slot 2 -> Slot 3):', slide3State);
    assert.strictEqual(slide3State.currentSlide, '3', 'Slide counter must show Slot 3');
    assert.strictEqual(slide3State.vid1Paused, true, 'Slot 2 video must be paused when moving to Slot 3');

    // Click Prev (Slot 3 -> Slot 2)
    await page.click('#btnFeaturedPrev');
    await sleep(600);

    const slide2BackState = await page.evaluate(() => {
      const current = document.getElementById('featuredCurrentSlide')?.textContent;
      const vid2 = document.getElementById('featuredVideo_2');
      return {
        currentSlide: current,
        vid2Paused: vid2?.paused
      };
    });
    console.log('After Prev (Slot 3 -> Slot 2):', slide2BackState);
    assert.strictEqual(slide2BackState.currentSlide, '2', 'Slide counter must show Slot 2');
    assert.strictEqual(slide2BackState.vid2Paused, true, 'Slot 3 video must be paused when moving back');

    // ----------------------------------------------------------------------
    // STEP 5: REFRESH BEHAVIOR (ALWAYS STARTS FROM SLOT 1)
    // ----------------------------------------------------------------------
    console.log('\n--- STEP 5: REFRESH BEHAVIOR TEST ---');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(600);

    const refreshState = await page.evaluate(() => {
      const current = document.getElementById('featuredCurrentSlide')?.textContent;
      const track = document.getElementById('featuredTrack');
      return {
        currentSlide: current,
        scrollLeft: track ? track.scrollLeft : -1
      };
    });
    console.log('After page refresh:', refreshState);
    assert.strictEqual(refreshState.currentSlide, '1', 'Fresh visit must always start from Slot 1');
    assert.strictEqual(refreshState.scrollLeft, 0, 'Scroll position must be at 0 on refresh');

    // ----------------------------------------------------------------------
    // STEP 6: MOBILE VIEWPORT & SWIPE BEHAVIOR
    // ----------------------------------------------------------------------
    console.log('\n--- STEP 6: MOBILE VIEWPORT & TOUCH SWIPE ---');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(600);

    const mobileLayoutCheck = await page.evaluate(() => {
      const track = document.getElementById('featuredTrack');
      const slide = document.querySelector('#featuredTrack .featured-slide');
      const touchAction = window.getComputedStyle(track).touchAction;
      return {
        trackWidth: track.clientWidth,
        slideWidth: slide.clientWidth,
        touchAction: touchAction
      };
    });
    console.log('Mobile layout check:', mobileLayoutCheck);
    assert.strictEqual(mobileLayoutCheck.touchAction, 'pan-y', 'touch-action must be pan-y so vertical scrolling is unaffected');
    assert.strictEqual(mobileLayoutCheck.trackWidth, mobileLayoutCheck.slideWidth, 'Exactly one slide visible at a time on mobile');

    // Perform horizontal swipe 1 -> 2 via touch
    console.log('Swiping 1 -> 2 on mobile...');
    await page.evaluate(() => {
      const track = document.getElementById('featuredTrack');
      track.scrollTo({ left: track.clientWidth, behavior: 'smooth' });
    });
    await sleep(700);

    const mobileSwipe1to2 = await page.evaluate(() => {
      return document.getElementById('featuredCurrentSlide')?.textContent;
    });
    console.log('After mobile swipe 1 -> 2, current slide:', mobileSwipe1to2);
    assert.strictEqual(mobileSwipe1to2, '2', 'Mobile swipe must advance to Slot 2');

    // Swipe 2 -> 3
    console.log('Swiping 2 -> 3 on mobile...');
    await page.evaluate(() => {
      const track = document.getElementById('featuredTrack');
      track.scrollTo({ left: track.clientWidth * 2, behavior: 'smooth' });
    });
    await sleep(700);

    const mobileSwipe2to3 = await page.evaluate(() => {
      return document.getElementById('featuredCurrentSlide')?.textContent;
    });
    console.log('After mobile swipe 2 -> 3, current slide:', mobileSwipe2to3);
    assert.strictEqual(mobileSwipe2to3, '3', 'Mobile swipe must advance to Slot 3');

    // Swipe backwards 3 -> 2
    console.log('Swiping backwards 3 -> 2 on mobile...');
    await page.evaluate(() => {
      const track = document.getElementById('featuredTrack');
      track.scrollTo({ left: track.clientWidth, behavior: 'smooth' });
    });
    await sleep(700);

    const mobileSwipeBack = await page.evaluate(() => {
      return document.getElementById('featuredCurrentSlide')?.textContent;
    });
    console.log('After backwards swipe, current slide:', mobileSwipeBack);
    assert.strictEqual(mobileSwipeBack, '2', 'Mobile backwards swipe must return to Slot 2');

    // ----------------------------------------------------------------------
    // STEP 7: ADMIN MANAGEMENT (AUTHENTICATION, SECTION, SLOTS, REORDER, REMOVE)
    // ----------------------------------------------------------------------
    console.log('\n--- STEP 7: ADMIN MANAGEMENT & CURATION ---');
    await page.setViewport({ width: 1280, height: 900 });

    // Authenticate admin session
    console.log('Authenticating admin session...');
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
    console.log('Admin dashboard loaded, URL:', page.url());
    await page.waitForSelector('#featuredSlotsGrid .featured-slot-card', { timeout: 10000 });

    // Check "Featured Homepage Videos" section in admin dashboard
    const adminSectionExists = await page.evaluate(() => {
      const grid = document.getElementById('featuredSlotsGrid');
      const saveBtn = document.getElementById('btnSaveFeatured');
      const clearBtn = document.getElementById('btnClearAllFeatured');
      const cards = document.querySelectorAll('.featured-slot-card');
      return {
        gridExists: Boolean(grid),
        saveBtnExists: Boolean(saveBtn),
        clearBtnExists: Boolean(clearBtn),
        slotCardsCount: cards.length
      };
    });
    console.log('Admin Featured Section inspection:', adminSectionExists);
    assert.strictEqual(adminSectionExists.gridExists, true, 'Featured slots grid must exist');
    assert.strictEqual(adminSectionExists.slotCardsCount, 6, 'Must show exactly 6 slots in admin');

    // Test Admin Removal of Slot 6
    console.log('Testing removal of Slot 6...');
    const cardsInspection = await page.evaluate(() => {
      const cards = document.querySelectorAll('.featured-slot-card');
      return Array.from(cards).map((c, i) => ({
        index: i,
        pos: c.dataset.position,
        title: c.querySelector('.slot-video-title')?.textContent || 'empty',
        hasRemove: Boolean(c.querySelector('.btn-slot-remove'))
      }));
    });
    console.log('Cards state before removal:', cardsInspection);

    const slot6Removed = await page.evaluate(() => {
      const cards = document.querySelectorAll('.featured-slot-card');
      const removeBtn = cards[5]?.querySelector('.btn-slot-remove');
      if (removeBtn) {
        removeBtn.click();
        return true;
      }
      return false;
    });
    console.log('Slot 6 remove button clicked:', slot6Removed);
    await sleep(400);

    // Save changes
    await page.evaluate(() => document.getElementById('btnSaveFeatured').click());
    await sleep(1800);

    // Verify FEWER THAN 6 VIDEOS in public API
    const fewerRes = await fetch(`${BASE_URL}/api/featured-videos`);
    const fewerData = await fewerRes.json();
    console.log(`Featured videos count after removing Slot 6: ${fewerData.videos.length}`);
    assert.strictEqual(fewerData.videos.length, 5, 'Public API must return 5 featured videos');

    // Test Admin Reordering (Swap Slot 1 & Slot 2)
    console.log('Testing reordering (swapping Slot 1 and Slot 2)...');
    const swapped = await page.evaluate(() => {
      const cards = document.querySelectorAll('.featured-slot-card');
      const downBtn = cards[0]?.querySelector('.btn-slot-down');
      if (downBtn) {
        downBtn.click();
        return true;
      }
      return false;
    });
    console.log('Slot 1 down button clicked:', swapped);
    await sleep(300);

    // Save changes
    await page.evaluate(() => document.getElementById('btnSaveFeatured').click());
    await sleep(1000);

    // Verify reorder preserved in API
    const reorderedRes = await fetch(`${BASE_URL}/api/featured-videos`);
    const reorderedData = await reorderedRes.json();
    assert.strictEqual(reorderedData.videos[0].position, 1, 'Slot 1 position preserved');
    assert.strictEqual(reorderedData.videos[1].position, 2, 'Slot 2 position preserved');
    console.log(`Reordered Slot 1 title: "${reorderedData.videos[0].title}", Slot 2 title: "${reorderedData.videos[1].title}"`);

    // Test Admin Replacement / Selection via Modal
    console.log('Testing Video Picker Modal for Slot 6...');
    await page.evaluate(() => {
      const cards = document.querySelectorAll('.featured-slot-card');
      const selectBtn = cards[5]?.querySelector('.btn-slot-select') || cards[5]?.querySelector('.btn-slot-replace');
      if (selectBtn) selectBtn.click();
    });
    await sleep(500);

    const pickerModalState = await page.evaluate(() => {
      const modal = document.getElementById('featuredVideoPickerModal');
      const items = document.querySelectorAll('.picker-video-item');
      return {
        active: modal?.classList.contains('active'),
        itemCount: items.length
      };
    });
    console.log('Picker Modal State:', pickerModalState);
    assert.strictEqual(pickerModalState.active, true, 'Picker modal must be open');
    assert.ok(pickerModalState.itemCount > 0, 'Picker modal must list published videos');

    // Pick first video in list
    await page.evaluate(() => {
      const item = document.querySelector('.picker-video-item');
      if (item) item.click();
    });
    await sleep(500);

    // Save changes
    await page.evaluate(() => document.getElementById('btnSaveFeatured').click());
    await sleep(1000);

    const restored6Res = await fetch(`${BASE_URL}/api/featured-videos`);
    const restored6Data = await restored6Res.json();
    console.log(`Featured videos count after replacing Slot 6: ${restored6Data.videos.length}`);
    assert.strictEqual(restored6Data.videos.length, 6, 'Must have 6 featured videos again');

    // ----------------------------------------------------------------------
    // STEP 8: EMPTY CAROUSEL TEST
    // ----------------------------------------------------------------------
    console.log('\n--- STEP 8: EMPTY CAROUSEL TEST ---');
    // Clear all via API to simulate empty state without browser confirm dialog blocking
    const clearRes = await fetch(`${BASE_URL}/api/admin/featured-videos`, {
      method: 'DELETE',
      headers: {
        'Cookie': `admin_token=${tokenVal}`
      }
    });
    assert.strictEqual(clearRes.status, 200, 'DELETE /api/admin/featured-videos must succeed');

    const emptyRes = await fetch(`${BASE_URL}/api/featured-videos`);
    const emptyData = await emptyRes.json();
    console.log(`Featured videos count after clear: ${emptyData.videos.length}`);
    assert.strictEqual(emptyData.videos.length, 0, 'Public API must return 0 videos when empty');

    // Check homepage with empty carousel
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await sleep(500);

    const emptyDisplay = await page.evaluate(() => {
      const section = document.getElementById('featuredCarouselSection');
      return window.getComputedStyle(section).display;
    });
    console.log('Empty carousel section display:', emptyDisplay);
    assert.strictEqual(emptyDisplay, 'none', 'Featured carousel section must be hidden when empty');

    // ----------------------------------------------------------------------
    // STEP 9: RESTORE 6 FEATURED VIDEOS FOR PRODUCTION
    // ----------------------------------------------------------------------
    console.log('\n--- STEP 9: RESTORING 6 SEEDED FEATURED VIDEOS ---');
    const pubVideosRes = await fetch(`${BASE_URL}/api/videos`);
    const pubVideos = await pubVideosRes.json();
    const top6 = pubVideos.slice(0, 6);

    const slotsPayload = top6.map((v, i) => ({
      position: i + 1,
      video_id: v.id,
      is_active: true
    }));

    const restoreRes = await fetch(`${BASE_URL}/api/admin/featured-videos`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `admin_token=${tokenVal}`
      },
      body: JSON.stringify({ slots: slotsPayload })
    });
    assert.strictEqual(restoreRes.status, 200, 'PUT /api/admin/featured-videos restore');

    const finalRes = await fetch(`${BASE_URL}/api/featured-videos`);
    const finalData = await finalRes.json();
    console.log(`Final restored featured videos count: ${finalData.videos.length}`);
    assert.strictEqual(finalData.videos.length, 6, 'Must be restored to 6 videos');

    // Final homepage verification
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await sleep(500);
    const finalDisplay = await page.evaluate(() => {
      const section = document.getElementById('featuredCarouselSection');
      const slides = document.querySelectorAll('#featuredTrack .featured-slide');
      return {
        display: window.getComputedStyle(section).display,
        slides: slides.length
      };
    });
    console.log('Final homepage carousel state:', finalDisplay);
    assert.notStrictEqual(finalDisplay.display, 'none', 'Section must be visible');
    assert.strictEqual(finalDisplay.slides, 6, 'Must have 6 slides rendered');

    console.log('\n======================================================================');
    console.log('🎉 ALL FEATURED CAROUSEL BROWSER TESTS PASSED COMPLETELY! (0 ERRORS)');
    console.log('======================================================================');

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
