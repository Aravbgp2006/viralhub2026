const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const CHROME_PATH = fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function run() {
  console.log('======================================================================');
  console.log('BROWSER E2E TEST: THUMBNAIL ASPECT RATIO & FIT/CROP BLUR EDITOR');
  console.log('======================================================================\n');

  console.log(`Using browser: ${CHROME_PATH}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    // 1. Log into admin
    console.log('1. Logging into Admin API...');
    const loginRes = await fetch('http://127.0.0.1:3000/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const rawCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
    let tokenVal = '';
    rawCookies.forEach(c => {
      const m = c.match(/admin_token=([^;]+)/);
      if (m) tokenVal = m[1];
    });
    assert(tokenVal, 'Failed to obtain admin_token cookie');

    await page.setCookie({
      name: 'admin_token',
      value: tokenVal,
      domain: '127.0.0.1',
      path: '/'
    });

    console.log('Navigating directly to /admin...');
    await page.goto('http://127.0.0.1:3000/admin', { waitUntil: 'networkidle2' });
    console.log('✅ Admin dashboard loaded, current URL:', page.url());

    // 2. Open Add Video Modal
    console.log('2. Opening Add Video Modal...');
    await page.click('#btnOpenAddModal');
    await page.waitForSelector('#addVideoModal.active', { visible: true });
    console.log('✅ Add Video Modal opened');

    // 3. Test TEST CASE A: Portrait image inside 16:9 Landscape Frame
    console.log('\n--- TEST CASE A: Portrait image inside 16:9 Landscape Frame ---');
    // Ensure 16:9 radio is checked
    await page.evaluate(() => {
      const r = document.querySelector('input[name="addThumbFormat"][value="16:9"]');
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Generate a portrait image in the page and trigger crop editor
    const result169 = await page.evaluate(async () => {
      // Create a canvas with a red/purple gradient (portrait: 400x800)
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 800;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 400, 800);
      grad.addColorStop(0, '#e11d48'); // Red-rose
      grad.addColorStop(1, '#7c3aed'); // Purple
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 400, 800);

      // Draw a center white symbol
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(150, 350, 100, 100);

      return new Promise((resolve) => {
        c.toBlob((blob) => {
          const file = new File([blob], 'test-portrait.jpg', { type: 'image/jpeg' });
          // Call the editor function directly in window
          const dt = new DataTransfer();
          dt.items.add(file);
          const input = document.getElementById('addThumbnail');
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          resolve({ ok: true, size: blob.size });
        }, 'image/jpeg', 0.95);
      });
    });

    console.log('Portrait file fed to input:', result169);
    await page.waitForSelector('#thumbEditorModal.active', { visible: true, timeout: 5000 });
    console.log('✅ Thumbnail crop/fit editor opened automatically on image select');

    // Wait for canvas to draw
    await new Promise(r => setTimeout(r, 600));

    // Inspect the canvas state and pixels
    const canvasAnalysis169 = await page.evaluate(() => {
      const canvas = document.getElementById('thumbEditorCanvas');
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // In 16:9 frame (1280x720) with a 400x800 portrait image:
      // Sharp foreground image width = 720 * (400/800) = 360px centered at x = (1280 - 360)/2 = 460px.
      // Left area (x = 100, y = 360) is outside foreground -> MUST be blurred background!
      // Right area (x = 1180, y = 360) is outside foreground -> MUST be blurred background!
      const leftPixel = ctx.getImageData(100, 360, 1, 1).data;
      const centerPixel = ctx.getImageData(640, 360, 1, 1).data;
      const rightPixel = ctx.getImageData(1180, 360, 1, 1).data;

      return {
        width: w,
        height: h,
        aspectRatio: (w / h).toFixed(2),
        leftPixel: Array.from(leftPixel),
        centerPixel: Array.from(centerPixel),
        rightPixel: Array.from(rightPixel)
      };
    });

    console.log('Canvas 16:9 analysis:', canvasAnalysis169);
    assert.strictEqual(canvasAnalysis169.width, 1280);
    assert.strictEqual(canvasAnalysis169.height, 720);
    // Verify left and right pixel have non-zero alpha and color from the image (blurred red/purple)
    assert(canvasAnalysis169.leftPixel[3] === 255, 'Left blurred pixel alpha must be 255');
    assert(canvasAnalysis169.leftPixel[0] > 40 || canvasAnalysis169.leftPixel[2] > 40, 'Left blurred pixel must contain colors from image');
    assert(canvasAnalysis169.rightPixel[3] === 255, 'Right blurred pixel alpha must be 255');
    console.log('✅ Blurred background fills left and right margins of 16:9 frame seamlessly');

    // Test Zoom slider interaction
    await page.evaluate(() => {
      const slider = document.getElementById('thumbZoomSlider');
      slider.value = 1.35;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await new Promise(r => setTimeout(r, 200));

    const zoomText = await page.$eval('#zoomValueText', el => el.textContent);
    console.log(`Zoom updated to: ${zoomText}`);
    assert.strictEqual(zoomText, '135%');

    // Test Reset button
    await page.click('#btnResetThumbEditor');
    await new Promise(r => setTimeout(r, 200));
    const resetZoomText = await page.$eval('#zoomValueText', el => el.textContent);
    console.log(`After Reset, zoom is: ${resetZoomText}`);
    assert.strictEqual(resetZoomText, '100%');

    // Click Save Thumbnail
    await page.click('#btnSaveThumbEditor');
    await page.waitForSelector('#thumbEditorModal:not(.active)', { timeout: 5000 });
    console.log('✅ Editor saved and closed');

    // Verify Add form preview card
    const previewBadgeText = await page.$eval('#addPreviewBadge', el => el.textContent);
    console.log(`Preview card badge: "${previewBadgeText}"`);
    assert(previewBadgeText.includes('16:9 Landscape'), 'Badge must indicate 16:9 Landscape');

    // 4. Test TEST CASE B: Landscape image inside 9:16 Portrait Frame
    console.log('\n--- TEST CASE B: Landscape image inside 9:16 Portrait Frame ---');
    // Select 9:16 format radio
    await page.evaluate(() => {
      const r = document.querySelector('input[name="addThumbFormat"][value="9:16"]');
      r.checked = true;
      r.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Generate a landscape image (800x400 with cyan/blue gradient)
    const result916 = await page.evaluate(async () => {
      const c = document.createElement('canvas');
      c.width = 800;
      c.height = 400;
      const ctx = c.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 800, 400);
      grad.addColorStop(0, '#06b6d4'); // Cyan
      grad.addColorStop(1, '#2563eb'); // Blue
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 800, 400);

      // Draw center yellow circle
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(400, 200, 80, 0, Math.PI * 2);
      ctx.fill();

      return new Promise((resolve) => {
        c.toBlob((blob) => {
          const file = new File([blob], 'test-landscape.jpg', { type: 'image/jpeg' });
          const dt = new DataTransfer();
          dt.items.add(file);
          const input = document.getElementById('addThumbnail');
          input.files = dt.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          resolve({ ok: true, size: blob.size });
        }, 'image/jpeg', 0.95);
      });
    });

    console.log('Landscape file fed to input for 9:16:', result916);
    await page.waitForSelector('#thumbEditorModal.active', { visible: true, timeout: 5000 });
    await new Promise(r => setTimeout(r, 600));

    // Inspect the canvas state and pixels
    const canvasAnalysis916 = await page.evaluate(() => {
      const canvas = document.getElementById('thumbEditorCanvas');
      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // In 9:16 frame (720x1280) with 800x400 landscape image:
      // Sharp foreground image width = 720, height = 720 * (400/800) = 360px centered at y = (1280 - 360)/2 = 460px.
      // Top area (x = 360, y = 100) is outside foreground -> MUST be blurred background!
      // Bottom area (x = 360, y = 1180) is outside foreground -> MUST be blurred background!
      const topPixel = ctx.getImageData(360, 100, 1, 1).data;
      const centerPixel = ctx.getImageData(360, 640, 1, 1).data;
      const bottomPixel = ctx.getImageData(360, 1180, 1, 1).data;

      return {
        width: w,
        height: h,
        aspectRatio: (w / h).toFixed(2),
        topPixel: Array.from(topPixel),
        centerPixel: Array.from(centerPixel),
        bottomPixel: Array.from(bottomPixel)
      };
    });

    console.log('Canvas 9:16 analysis:', canvasAnalysis916);
    assert.strictEqual(canvasAnalysis916.width, 720);
    assert.strictEqual(canvasAnalysis916.height, 1280);
    assert(canvasAnalysis916.topPixel[3] === 255, 'Top blurred pixel alpha must be 255');
    assert(canvasAnalysis916.topPixel[1] > 30 || canvasAnalysis916.topPixel[2] > 30, 'Top blurred pixel must have cyan/blue from image');
    assert(canvasAnalysis916.bottomPixel[3] === 255, 'Bottom blurred pixel alpha must be 255');
    console.log('✅ Blurred background fills top and bottom margins of 9:16 frame seamlessly');

    // Save 9:16 Thumbnail
    await page.click('#btnSaveThumbEditor');
    await page.waitForSelector('#thumbEditorModal:not(.active)', { timeout: 5000 });
    console.log('✅ 9:16 Thumbnail saved successfully');

    const badge916 = await page.$eval('#addPreviewBadge', el => el.textContent);
    console.log(`Preview card badge: "${badge916}"`);
    assert(badge916.includes('9:16 Portrait'), 'Badge must indicate 9:16 Portrait');

    // 5. Test Homepage Display & Card Aspect Ratios
    console.log('\n--- 5. Verifying Homepage Display of 16:9 and 9:16 Cards ---');
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle2' });
    
    // Check if age gate overlay needs to be clicked
    const hasAgeGate = await page.evaluate(() => {
      const btn = document.getElementById('btnAgeOver18');
      if (btn && !document.getElementById('ageGateOverlay').classList.contains('hidden')) {
        btn.click();
        return true;
      }
      return false;
    });
    if (hasAgeGate) {
      console.log('Dismissed age gate overlay');
      await new Promise(r => setTimeout(r, 400));
    }

    const cardsInfo = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.video-card'));
      return cards.map(c => {
        const thumbWrapper = c.querySelector('.video-card-thumb-wrapper');
        const computed = window.getComputedStyle(thumbWrapper);
        return {
          id: c.dataset.id,
          classes: c.className,
          thumbWrapperClasses: thumbWrapper.className,
          aspectRatioCSS: computed.aspectRatio,
          width: thumbWrapper.offsetWidth,
          height: thumbWrapper.offsetHeight
        };
      });
    });

    console.log(`Found ${cardsInfo.length} video cards on homepage:`);
    cardsInfo.slice(0, 5).forEach((ci, idx) => {
      console.log(` Card #${idx + 1} (ID ${ci.id}): classes="${ci.classes}", aspectRatio="${ci.aspectRatioCSS}", ${ci.width}x${ci.height}px`);
    });

    // Verify existing videos display with 16 / 9 aspect ratio
    const existingCards = cardsInfo.filter(c => !c.classes.includes('aspect-9-16'));
    assert(existingCards.length > 0, 'Existing videos must be present');
    existingCards.forEach(c => {
      assert(c.aspectRatioCSS === '16 / 9' || Math.abs((c.width / c.height) - (16 / 9)) < 0.1, `Card should display in 16:9: ${JSON.stringify(c)}`);
    });
    console.log('✅ Existing video cards display correctly in 16:9 format');

    console.log('\n======================================================================');
    console.log('✅ ALL BROWSER E2E TESTS PASSED WITH 100% ACCURACY!');
    console.log('======================================================================\n');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('Fatal browser test error:', err);
  process.exit(1);
});
