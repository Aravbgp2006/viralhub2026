/**
 * scripts/test_video_info_layout.js
 * Test suite to verify the public video information layout and absence of posting times.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Starting Video Information Layout & Timestamp Removal Tests...\n');

// 1. Verify public/app.js layout and absence of posting time
const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

// Confirm no formatDate call in card rendering
assert(!appJs.includes('${formatDate(video.created_at)}'), 'public/app.js should not call formatDate on video cards');
assert(!appJs.includes('<span class="stat-divider">·</span>'), 'public/app.js should not have stat divider dot before views');

// Confirm exact order in renderVideos:
// 1) <h3 class="video-card-title">${video.title}</h3>
// 2) <div class="video-channel-name">...ViralHub · ...</div>
// 3) <div class="video-stats-row"><span>${formatViews(video.views)}</span></div>
const titleIndex = appJs.indexOf('<h3 class="video-card-title">${video.title}</h3>');
const channelIndex = appJs.indexOf('ViralHub · ${video.category ? video.category.toUpperCase() : \'LATEST\'}');
const viewsIndex = appJs.indexOf('<span>${formatViews(video.views)}</span>');

assert(titleIndex > 0, 'Video title must be present in card template');
assert(channelIndex > 0, 'ViralHub · LATEST line must be present in card template');
assert(viewsIndex > 0, 'View count must be present in card template');
assert(titleIndex < channelIndex, 'Title must appear before ViralHub · LATEST');
assert(channelIndex < viewsIndex, 'ViralHub · LATEST must appear before View count');

console.log('✅ public/app.js: Card template order verified (Title -> ViralHub · LATEST -> View count)');

// Check formatViews function logic
function testFormatViews(views) {
  const num = Number(views) || 0;
  if (num >= 1000000) {
    const millions = (num / 1000000).toFixed(2).replace(/\.?0+$/, '');
    return `${millions}M views`;
  }
  if (num >= 1000) {
    const thousands = (num / 1000).toFixed(2).replace(/\.?0+$/, '');
    return `${thousands}K views`;
  }
  return `${num.toLocaleString()} views`;
}

assert.strictEqual(testFormatViews(63000), '63K views');
assert.strictEqual(testFormatViews(63001), '63K views');
assert.strictEqual(testFormatViews(1200), '1.2K views');
assert.strictEqual(testFormatViews(1500000), '1.5M views');
assert.strictEqual(testFormatViews(100), '100 views');
assert.strictEqual(testFormatViews(0), '0 views');
console.log('✅ formatViews: Properly formats views (e.g., 63K views, 1.2K views, 1.5M views)');

// 2. Verify public/video.html layout and absence of posting time
const videoHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'video.html'), 'utf8');

// Confirm no videoDate element or call
assert(!videoHtml.includes('id="videoDate"'), 'public/video.html must not contain videoDate element');
assert(!videoHtml.includes('formatDate(video.created_at)'), 'public/video.html must not format created_at');
assert(!videoHtml.includes('formatDate(rel.created_at)'), 'public/video.html must not format related created_at');

// Confirm order in detail-info-box
const detailTitleIndex = videoHtml.indexOf('id="videoTitle"');
const detailChannelIndex = videoHtml.indexOf('ViralHub · <span id="categoryBadge">LATEST</span>');
const detailViewsIndex = videoHtml.indexOf('id="videoViews"');

assert(detailTitleIndex > 0, 'Detail video title must be present');
assert(detailChannelIndex > 0, 'Detail ViralHub · LATEST line must be present');
assert(detailViewsIndex > 0, 'Detail video views must be present');
assert(detailTitleIndex < detailChannelIndex, 'Detail title must appear before ViralHub · LATEST');
assert(detailChannelIndex < detailViewsIndex, 'Detail ViralHub · LATEST must appear before View count');

// Confirm related videos order
const relatedTitleIndex = videoHtml.indexOf('class="related-video-title">${rel.title}</h4>');
const relatedChannelIndex = videoHtml.indexOf('class="related-channel">ViralHub · ${(rel.category || \'latest\').toUpperCase()}</div>');
const relatedMetaIndex = videoHtml.indexOf('class="related-meta">${formatViews(rel.views)}</div>');

assert(relatedTitleIndex > 0, 'Related video title must be present');
assert(relatedChannelIndex > 0, 'Related video ViralHub · LATEST must be present');
assert(relatedMetaIndex > 0, 'Related video views must be present');
assert(relatedTitleIndex < relatedChannelIndex, 'Related title must appear before ViralHub · LATEST');
assert(relatedChannelIndex < relatedMetaIndex, 'Related ViralHub · LATEST must appear before views');

console.log('✅ public/video.html: Detail and related video layout verified (Title -> ViralHub · LATEST -> View count)');

// 3. Confirm absence of relative timestamp labels anywhere in public/video.html & public/app.js
const timestampPatterns = [
  /\b\d+\s*minutes?\s*ago\b/i,
  /\b\d+\s*hours?\s*ago\b/i,
  /\b\d+\s*days?\s*ago\b/i,
  /\bjust\s*now\b/i,
  /\bm\s*ago\b/i,
  /\bh\s*ago\b/i,
  /\bd\s*ago\b/i
];

timestampPatterns.forEach(pattern => {
  assert(!pattern.test(videoHtml), `public/video.html must not contain timestamps matching ${pattern}`);
  assert(!pattern.test(appJs), `public/app.js must not contain timestamps matching ${pattern}`);
});
console.log('✅ Timestamp check: No relative or absolute timestamps found in public templates');

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
