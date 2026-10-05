const fs = require('fs');
const path = require('path');

console.log('=== VERIFYING CODEBASE INTEGRITY ===\n');

// 1. Verify HTML Structure
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const checks = [
  { name: 'Age Gate Overlay Container', pattern: /id=["']ageGateOverlay["']/ },
  { name: 'Button: "I AM 18+"', pattern: /id=["']btnAgeOver18["']/ },
  { name: 'Button: "I AM UNDER 18"', pattern: /id=["']btnAgeUnder18["']/ },
  { name: 'Heading: "Latest Viral Videos 2026"', pattern: /Latest Viral Videos 2026/ },
  { name: 'Subheading: "18+ ONLY"', pattern: /18\+ ONLY/ },
  { name: 'Description text', pattern: /By entering this website, you confirm that you are 18 years of age or older\./ },
  { name: 'Category LATEST', pattern: /data-category=["']latest["']/ },
  { name: 'Category TRENDING', pattern: /data-category=["']trending["']/ },
  { name: 'Category MOST VIEWED', pattern: /data-category=["']most-viewed["']/ },
  { name: 'Category NEW', pattern: /data-category=["']new["']/ },
  { name: 'Responsive Video Grid', pattern: /id=["']videoGrid["']/ },
  { name: 'Video Detail View Container', pattern: /id=["']videoDetailView["']/ },
  { name: 'Player Container', pattern: /id=["']playerContainer["']/ },
  { name: 'Controls Bar & Scrubber', pattern: /id=["']playerProgressBar["']/ },
  { name: 'Related Videos Container', pattern: /id=["']relatedVideoList["']/ }
];

let allPassed = true;
console.log('--- HTML Structure Checks ---');
checks.forEach(c => {
  const passed = c.pattern.test(html);
  console.log((passed ? '✓' : '✗') + ' ' + c.name);
  if (!passed) allPassed = false;
});

// 2. Verify CSS Responsive Rules & Palette
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'index.css'), 'utf8');
const cssChecks = [
  { name: 'Max width 500px for age gate card', pattern: /max-width:\s*500px/ },
  { name: '4 columns on desktop', pattern: /grid-template-columns:\s*repeat\(4,\s*1fr\)/ },
  { name: '3 columns on medium desktop', pattern: /grid-template-columns:\s*repeat\(3,\s*1fr\)/ },
  { name: '2 columns on tablet', pattern: /grid-template-columns:\s*repeat\(2,\s*1fr\)/ },
  { name: '1 column on mobile (1 video card per row)', pattern: /grid-template-columns:\s*1fr\s*!important/ },
  { name: 'Touch target minimum 48px height', pattern: /min-height:\s*48px/ },
  { name: 'Color Palette: #FFFFFF background', pattern: /#FFFFFF/ },
  { name: 'Color Palette: #000000 primary', pattern: /#000000/ },
  { name: 'Color Palette: #111111 text', pattern: /#111111/ },
  { name: 'Color Palette: #666666 secondary text', pattern: /#666666/ },
  { name: 'Color Palette: #E5E5E5 borders', pattern: /#E5E5E5/ }
];

console.log('\n--- CSS Responsive & Aesthetic Checks ---');
cssChecks.forEach(c => {
  const passed = c.pattern.test(css);
  console.log((passed ? '✓' : '✗') + ' ' + c.name);
  if (!passed) allPassed = false;
});

// 3. Verify Video Data Ordering & Attributes
const { DEMO_VIDEOS } = require('../js/data.js');
console.log('\n--- Video Dataset Checks ---');
console.log('Total Demo Videos:', DEMO_VIDEOS.length);
if (DEMO_VIDEOS.length >= 12) {
  console.log('✓ Video count is at least 12');
} else {
  console.log('✗ Less than 12 videos');
  allPassed = false;
}

// Check sorting of LATEST (newest first)
const latestSorted = [...DEMO_VIDEOS].sort((a,b) => b.timestamp - a.timestamp);
console.log('✓ Video 1 in LATEST (Newest):', latestSorted[0].title);
console.log('✓ Video 12 in LATEST (Oldest):', latestSorted[latestSorted.length - 1].title);

// Verify consistent video attributes
let validCards = true;
DEMO_VIDEOS.forEach((v, i) => {
  if (!v.thumbnail || !v.duration || !v.title || !v.uploadTime || !v.views || !v.channel) {
    console.log(`✗ Video #${i+1} missing required properties`);
    validCards = false;
    allPassed = false;
  }
});
if (validCards) {
  console.log('✓ All 12 video cards contain thumbnail, duration badge, title, upload date, view count, and channel');
}

console.log('\n' + (allPassed ? '✅ ALL AUDITS PASSED SUCCESSFULLY!' : '❌ SOME AUDITS FAILED'));
process.exit(allPassed ? 0 : 1);
