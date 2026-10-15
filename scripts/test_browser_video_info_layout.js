/**
 * scripts/test_browser_video_info_layout.js
 * End-to-end browser test for video info layout and timestamp removal on mobile & desktop.
 */

const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const app = require('../server');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : (fs.existsSync('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe')
    ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

async function run() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(3107, resolve));
  const baseUrl = 'http://localhost:3107';
  console.log(`🚀 Test server started at ${baseUrl}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set cookie for age gate bypass
    await page.setCookie({
      name: 'ageGatePassed',
      value: 'true',
      domain: 'localhost',
      path: '/'
    });

    // ==========================================
    // 1. DESKTOP VIEWPORT TEST (HOMEPAGE)
    // ==========================================
    console.log('\n--- 1. Testing Homepage Cards on Desktop (1280x800) ---');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' });

    // Wait for video cards
    await page.waitForSelector('.video-card', { timeout: 10000 });
    const cards = await page.$$('.video-card');
    console.log(`Found ${cards.length} video cards on homepage.`);
    if (cards.length === 0) throw new Error('No video cards rendered!');

    // Check first card layout
    const firstCardData = await page.evaluate(() => {
      const card = document.querySelector('.video-card');
      const title = card.querySelector('.video-card-title')?.innerText?.trim();
      const channel = card.querySelector('.video-channel-name')?.innerText?.trim();
      const stats = card.querySelector('.video-stats-row')?.innerText?.trim();

      // Check text of all card content for timestamps
      const fullText = card.innerText;
      const hasAgo = /\bago\b/i.test(fullText);
      const hasJustNow = /\bjust now\b/i.test(fullText);

      return { title, channel, stats, fullText, hasAgo, hasJustNow };
    });

    console.log('Desktop Card Sample:');
    console.log('  Line 1 (Title):', firstCardData.title);
    console.log('  Line 2 (Channel/Latest):', firstCardData.channel);
    console.log('  Line 3 (Views):', firstCardData.stats);

    if (!firstCardData.title) throw new Error('First line (title) is missing!');
    if (!firstCardData.channel.includes('ViralHub · LATEST')) {
      throw new Error(`Second line expected "ViralHub · LATEST", got "${firstCardData.channel}"`);
    }
    if (!firstCardData.stats.includes('views')) {
      throw new Error(`Third line expected view count, got "${firstCardData.stats}"`);
    }
    if (firstCardData.hasAgo || firstCardData.hasJustNow) {
      throw new Error('Video card contains posting timestamp!');
    }
    console.log('✅ Desktop homepage card layout matches requirements.');

    // ==========================================
    // 2. MOBILE VIEWPORT TEST (HOMEPAGE)
    // ==========================================
    console.log('\n--- 2. Testing Homepage Cards on Mobile (375x812) ---');
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle2' });

    await page.waitForSelector('.video-card', { timeout: 10000 });
    const mobileCardData = await page.evaluate(() => {
      const card = document.querySelector('.video-card');
      const title = card.querySelector('.video-card-title')?.innerText?.trim();
      const channel = card.querySelector('.video-channel-name')?.innerText?.trim();
      const stats = card.querySelector('.video-stats-row')?.innerText?.trim();
      const fullText = card.innerText;
      return {
        title, channel, stats,
        hasAgo: /\bago\b/i.test(fullText),
        hasJustNow: /\bjust now\b/i.test(fullText)
      };
    });

    console.log('Mobile Card Sample:');
    console.log('  Line 1 (Title):', mobileCardData.title);
    console.log('  Line 2 (Channel/Latest):', mobileCardData.channel);
    console.log('  Line 3 (Views):', mobileCardData.stats);

    if (!mobileCardData.title) throw new Error('Mobile title missing!');
    if (!mobileCardData.channel.includes('ViralHub · LATEST')) {
      throw new Error(`Mobile second line expected "ViralHub · LATEST", got "${mobileCardData.channel}"`);
    }
    if (!mobileCardData.stats.includes('views')) {
      throw new Error(`Mobile third line expected view count, got "${mobileCardData.stats}"`);
    }
    if (mobileCardData.hasAgo || mobileCardData.hasJustNow) {
      throw new Error('Mobile video card contains posting timestamp!');
    }
    console.log('✅ Mobile homepage card layout matches requirements.');

    // ==========================================
    // 3. VIDEO DETAIL PAGE TEST (DESKTOP)
    // ==========================================
    console.log('\n--- 3. Testing Video Detail Page on Desktop (1280x800) ---');
    await page.setViewport({ width: 1280, height: 800 });

    const res = await fetch(`${baseUrl}/api/videos`);
    const data = await res.json();
    const firstVideo = Array.isArray(data) ? data[0] : (data.videos ? data.videos[0] : null);
    if (!firstVideo) throw new Error('No videos returned from /api/videos');
    const firstVideoId = firstVideo.id;
    console.log(`Navigating to video detail /video/${firstVideoId} (${firstVideo.title})...`);
    await page.goto(`${baseUrl}/video/${firstVideoId}`, { waitUntil: 'networkidle2' });

    // Wait until video title matches the loaded video
    await page.waitForFunction(
      (expectedTitle) => document.getElementById('videoTitle')?.innerText?.trim() === expectedTitle,
      { timeout: 10000 },
      firstVideo.title
    );

    const detailData = await page.evaluate(() => {
      const title = document.getElementById('videoTitle')?.innerText?.trim();
      const channelEl = document.querySelector('.detail-info-box .detail-channel-name');
      const channel = channelEl?.innerText?.trim();
      const views = document.getElementById('videoViews')?.innerText?.trim();

      const pageText = document.body.innerText;
      const hasAgo = /\bago\b/i.test(pageText);
      const hasJustNow = /\bjust now\b/i.test(pageText);

      // Check related videos
      const related = Array.from(document.querySelectorAll('.related-card')).map(rc => ({
        title: rc.querySelector('.related-video-title')?.innerText?.trim(),
        channel: rc.querySelector('.related-channel')?.innerText?.trim(),
        meta: rc.querySelector('.related-meta')?.innerText?.trim(),
        hasTimestamp: /\bago\b/i.test(rc.innerText) || /\bjust now\b/i.test(rc.innerText)
      }));

      return { title, channel, views, hasAgo, hasJustNow, related };
    });

    console.log('Detail Page Layout:');
    console.log('  Line 1 (Title):', detailData.title);
    console.log('  Line 2 (Channel/Latest):', detailData.channel);
    console.log('  Line 3 (Views):', detailData.views);

    if (!detailData.title) throw new Error('Detail title missing!');
    if (!detailData.channel.includes('ViralHub · LATEST')) {
      throw new Error(`Detail second line expected "ViralHub · LATEST", got "${detailData.channel}"`);
    }
    if (!detailData.views.includes('views')) {
      throw new Error(`Detail third line expected view count, got "${detailData.views}"`);
    }
    if (detailData.hasAgo || detailData.hasJustNow) {
      throw new Error('Video detail page contains posting timestamp!');
    }
    console.log('✅ Video detail page layout matches requirements.');

    if (detailData.related.length > 0) {
      console.log('Related Video Sample:');
      console.log('  Title:', detailData.related[0].title);
      console.log('  Channel:', detailData.related[0].channel);
      console.log('  Meta:', detailData.related[0].meta);
      if (detailData.related[0].hasTimestamp) {
        throw new Error('Related video contains posting timestamp!');
      }
      console.log('✅ Related videos layout matches requirements.');
    }

    // ==========================================
    // 4. VIDEO DETAIL PAGE TEST (MOBILE)
    // ==========================================
    console.log('\n--- 4. Testing Video Detail Page on Mobile (375x812) ---');
    await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle2' });

    await page.waitForFunction(
      (expectedTitle) => document.getElementById('videoTitle')?.innerText?.trim() === expectedTitle,
      { timeout: 10000 },
      firstVideo.title
    );

    const mobileDetail = await page.evaluate(() => {
      const title = document.getElementById('videoTitle')?.innerText?.trim();
      const channel = document.querySelector('.detail-info-box .detail-channel-name')?.innerText?.trim();
      const views = document.getElementById('videoViews')?.innerText?.trim();
      const pageText = document.body.innerText;
      return {
        title, channel, views,
        hasAgo: /\bago\b/i.test(pageText),
        hasJustNow: /\bjust now\b/i.test(pageText)
      };
    });

    console.log('Mobile Detail Layout:');
    console.log('  Line 1 (Title):', mobileDetail.title);
    console.log('  Line 2 (Channel/Latest):', mobileDetail.channel);
    console.log('  Line 3 (Views):', mobileDetail.views);

    if (!mobileDetail.title || !mobileDetail.channel.includes('ViralHub · LATEST') || !mobileDetail.views.includes('views')) {
      throw new Error('Mobile detail page layout mismatch!');
    }
    if (mobileDetail.hasAgo || mobileDetail.hasJustNow) {
      throw new Error('Mobile detail page contains posting timestamp!');
    }
    console.log('✅ Mobile video detail page matches requirements.');

    console.log('\n🎉 ALL BROWSER E2E TESTS PASSED WITH 100% SUCCESS!');
  } finally {
    if (browser) await browser.close();
    if (server) server.close();
  }
}

run().catch((err) => {
  console.error('❌ Browser Test Error:', err);
  process.exit(1);
});
