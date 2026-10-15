/**
 * scripts/verify_prod_video_info_layout.js
 * Comprehensive live production verification for video information layout & timestamp removal.
 */

const assert = require('assert');
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const PROD_URL = 'https://viralhub2026-mu.vercel.app';
const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : (fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

async function run() {
  console.log(`🌐 Testing live production site at ${PROD_URL}...\n`);

  // ==========================================
  // 1. HTTP Static Content Verification
  // ==========================================
  console.log('--- 1. HTTP Bundle & Template Verification ---');
  const appJsRes = await fetch(`${PROD_URL}/app.js?v=${Date.now()}`);
  assert.strictEqual(appJsRes.status, 200, 'Failed to fetch /app.js from production');
  const appJsText = await appJsRes.text();

  assert(!appJsText.includes('${formatDate(video.created_at)}'), 'Production app.js still contains created_at formatting');
  assert(!appJsText.includes('<span class="stat-divider">·</span>'), 'Production app.js still contains stat divider');
  assert(appJsText.includes('ViralHub · ${video.category ? video.category.toUpperCase() : \'LATEST\'}'), 'Production app.js missing ViralHub · LATEST line');
  console.log('✅ Production app.js: Verified 3-line card structure with no timestamps');

  // Fetch a live video from API
  const videosRes = await fetch(`${PROD_URL}/api/videos?v=${Date.now()}`);
  assert.strictEqual(videosRes.status, 200, 'Failed to fetch /api/videos from production');
  const videos = await videosRes.json();
  assert(Array.isArray(videos) && videos.length > 0, 'No videos returned from production API');
  const testVid = videos[0];
  console.log(`✅ Production API: Found ${videos.length} videos. Test Video: ID ${testVid.id} ("${testVid.title}")`);

  // Fetch production video detail page
  const detailHtmlRes = await fetch(`${PROD_URL}/video/${testVid.id}?v=${Date.now()}`);
  assert.strictEqual(detailHtmlRes.status, 200, `Failed to fetch /video/${testVid.id} from production`);
  const detailHtml = await detailHtmlRes.text();

  assert(!detailHtml.includes('id="videoDate"'), 'Production detail page still contains #videoDate');
  assert(!detailHtml.includes('formatDate(video.created_at)'), 'Production detail page still formats video created_at');
  assert(detailHtml.includes('ViralHub · <span id="categoryBadge">LATEST</span>'), 'Production detail page missing ViralHub · LATEST line');

  const titleIdx = detailHtml.indexOf('id="videoTitle"');
  const channelIdx = detailHtml.indexOf('ViralHub · <span id="categoryBadge">LATEST</span>');
  const viewsIdx = detailHtml.indexOf('id="videoViews"');
  assert(titleIdx < channelIdx, 'Title must appear before ViralHub · LATEST');
  assert(channelIdx < viewsIdx, 'ViralHub · LATEST must appear before videoViews');
  console.log('✅ Production HTML: Detail page HTML order verified (Title -> ViralHub · LATEST -> Views)');

  // ==========================================
  // 2. Real Browser Verification (Desktop)
  // ==========================================
  console.log('\n--- 2. Real Browser Desktop Verification (1280x800) ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setCookie({
      name: 'ageGatePassed',
      value: 'true',
      domain: 'viralhub2026-mu.vercel.app',
      path: '/'
    });

    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${PROD_URL}/`, { waitUntil: 'networkidle2' });

    await page.waitForSelector('.video-card', { timeout: 15000 });
    const desktopCard = await page.evaluate(() => {
      const card = document.querySelector('.video-card');
      const title = card.querySelector('.video-card-title')?.innerText?.trim();
      const channel = card.querySelector('.video-channel-name')?.innerText?.trim();
      const views = card.querySelector('.video-stats-row')?.innerText?.trim();
      const fullText = card.innerText;
      return {
        title, channel, views,
        hasAgo: /\bago\b/i.test(fullText),
        hasJustNow: /\bjust now\b/i.test(fullText)
      };
    });

    console.log('Live Desktop Card:');
    console.log('  1. Title:', desktopCard.title);
    console.log('  2. Channel:', desktopCard.channel);
    console.log('  3. Views:', desktopCard.views);

    assert(desktopCard.title, 'Desktop card title missing');
    assert(desktopCard.channel.includes('ViralHub · LATEST'), `Desktop second line mismatch: ${desktopCard.channel}`);
    assert(desktopCard.views.includes('views'), `Desktop third line mismatch: ${desktopCard.views}`);
    assert(!desktopCard.hasAgo && !desktopCard.hasJustNow, 'Desktop card contains timestamp!');
    console.log('✅ Live Desktop Homepage Card passed all criteria');

    // ==========================================
    // 3. Real Browser Verification (Mobile)
    // ==========================================
    console.log('\n--- 3. Real Browser Mobile Verification (375x812) ---');
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle2' });

    await page.waitForSelector('.video-card', { timeout: 15000 });
    const mobileCard = await page.evaluate(() => {
      const card = document.querySelector('.video-card');
      const title = card.querySelector('.video-card-title')?.innerText?.trim();
      const channel = card.querySelector('.video-channel-name')?.innerText?.trim();
      const views = card.querySelector('.video-stats-row')?.innerText?.trim();
      const fullText = card.innerText;
      return {
        title, channel, views,
        hasAgo: /\bago\b/i.test(fullText),
        hasJustNow: /\bjust now\b/i.test(fullText)
      };
    });

    console.log('Live Mobile Card:');
    console.log('  1. Title:', mobileCard.title);
    console.log('  2. Channel:', mobileCard.channel);
    console.log('  3. Views:', mobileCard.views);

    assert(mobileCard.title, 'Mobile card title missing');
    assert(mobileCard.channel.includes('ViralHub · LATEST'), `Mobile second line mismatch: ${mobileCard.channel}`);
    assert(mobileCard.views.includes('views'), `Mobile third line mismatch: ${mobileCard.views}`);
    assert(!mobileCard.hasAgo && !mobileCard.hasJustNow, 'Mobile card contains timestamp!');
    console.log('✅ Live Mobile Homepage Card passed all criteria');

    // ==========================================
    // 4. Live Detail Page Verification (Desktop & Mobile)
    // ==========================================
    console.log(`\n--- 4. Live Detail Page Verification (/video/${testVid.id}) ---`);
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${PROD_URL}/video/${testVid.id}`, { waitUntil: 'networkidle2' });

    await page.waitForFunction(
      (expectedTitle) => document.getElementById('videoTitle')?.innerText?.trim() === expectedTitle,
      { timeout: 15000 },
      testVid.title
    );

    const liveDetail = await page.evaluate(() => {
      const title = document.getElementById('videoTitle')?.innerText?.trim();
      const channel = document.querySelector('.detail-info-box .detail-channel-name')?.innerText?.trim();
      const views = document.getElementById('videoViews')?.innerText?.trim();
      const pageText = document.body.innerText;

      const related = Array.from(document.querySelectorAll('.related-card')).map(rc => ({
        title: rc.querySelector('.related-video-title')?.innerText?.trim(),
        channel: rc.querySelector('.related-channel')?.innerText?.trim(),
        meta: rc.querySelector('.related-meta')?.innerText?.trim(),
        hasTimestamp: /\bago\b/i.test(rc.innerText) || /\bjust now\b/i.test(rc.innerText)
      }));

      return {
        title, channel, views,
        hasAgo: /\bago\b/i.test(pageText),
        hasJustNow: /\bjust now\b/i.test(pageText),
        related
      };
    });

    console.log('Live Detail Page:');
    console.log('  1. Title:', liveDetail.title);
    console.log('  2. Channel:', liveDetail.channel);
    console.log('  3. Views:', liveDetail.views);

    assert.strictEqual(liveDetail.title, testVid.title, 'Detail title mismatch');
    assert(liveDetail.channel.includes('ViralHub · LATEST'), `Detail second line mismatch: ${liveDetail.channel}`);
    assert(liveDetail.views.includes('views'), `Detail third line mismatch: ${liveDetail.views}`);
    assert(!liveDetail.hasAgo && !liveDetail.hasJustNow, 'Detail page contains posting timestamp!');
    console.log('✅ Live Detail Page passed all criteria');

    if (liveDetail.related.length > 0) {
      console.log('Live Related Video Sample:');
      console.log('  1. Title:', liveDetail.related[0].title);
      console.log('  2. Channel:', liveDetail.related[0].channel);
      console.log('  3. Views:', liveDetail.related[0].meta);
      assert(!liveDetail.related[0].hasTimestamp, 'Related video card contains timestamp!');
      console.log('✅ Live Related Videos passed all criteria');
    }

    console.log('\n🚀 ALL LIVE PRODUCTION VERIFICATIONS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('❌ Production Verification Error:', err);
  process.exit(1);
});
