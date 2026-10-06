/**
 * scripts/debug_carousel_performance.js
 * Profiles the mobile performance of the featured video carousel:
 * - Checks video readyState, network, play promise, paused state
 * - Monitors touch event handling during swipes
 * - Measures FPS and execution time
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BASE_URL = 'http://127.0.0.1:3000';
const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('Launching browser to profile carousel performance...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--autoplay-policy=no-user-gesture-required']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  const ageGate = await page.$('#btnAgeOver18');
  if (ageGate) await ageGate.click();
  await sleep(1000);

  // Profile initial state
  const initialMetrics = await page.evaluate(() => {
    const vids = Array.from(document.querySelectorAll('.featured-slide video')).map(v => ({
      id: v.id,
      src: v.src || v.dataset.src,
      hasSrcAttr: Boolean(v.src),
      paused: v.paused,
      readyState: v.readyState,
      currentTime: v.currentTime,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      muted: v.muted
    }));
    return {
      videoCount: vids.length,
      videos: vids
    };
  });
  console.log('Initial Video Elements in DOM:', initialMetrics);

  // Check how many videos are currently playing
  const playingCount = initialMetrics.videos.filter(v => !v.paused).length;
  console.log(`Number of videos actively playing initially: ${playingCount}`);

  // Test swipe performance
  console.log('Simulating swipe...');
  const swipeMetrics = await page.evaluate(async () => {
    const wrapper = document.getElementById('featuredViewportWrapper');
    const start = performance.now();
    let moveCount = 0;

    const tStart = new Touch({ identifier: 1, target: wrapper, clientX: 250, clientY: 400, pageX: 250, pageY: 400, screenX: 250, screenY: 400 });
    wrapper.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [tStart], changedTouches: [tStart], targetTouches: [tStart] }));

    for (let i = 1; i <= 20; i++) {
      const curX = 250 - (i * 5);
      const tMove = new Touch({ identifier: 1, target: wrapper, clientX: curX, clientY: 400, pageX: curX, pageY: 400, screenX: curX, screenY: 400 });
      wrapper.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [tMove], changedTouches: [tMove], targetTouches: [tMove] }));
      moveCount++;
      await new Promise(r => requestAnimationFrame(r));
    }

    const tEnd = new Touch({ identifier: 1, target: wrapper, clientX: 150, clientY: 400, pageX: 150, pageY: 400, screenX: 150, screenY: 400 });
    wrapper.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [tEnd], targetTouches: [] }));

    const duration = performance.now() - start;
    return { moveCount, duration };
  });

  console.log('Swipe Metrics:', swipeMetrics);
  await sleep(1000);

  // Profile after swipe
  const afterSwipeMetrics = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.featured-slide video')).map(v => ({
      id: v.id,
      hasSrc: Boolean(v.src),
      paused: v.paused,
      readyState: v.readyState,
      currentTime: v.currentTime
    }));
  });
  console.log('Video Elements after swipe:', afterSwipeMetrics);

  await browser.close();
}

run().catch(console.error);
