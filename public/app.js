/**
 * public/app.js
 * Public Frontend Application Logic for ViralHub CMS
 * Dynamically fetches published videos from SQLite backend
 */

(function () {
  'use strict';

  // --- State Management ---
  const state = {
    currentCategory: 'latest',
    searchQuery: '',
    videos: [],
    currentVideo: null,
    isPlaying: false
  };

  // --- DOM References ---
  const ageGateOverlay = document.getElementById('ageGateOverlay');
  const btnAgeOver18 = document.getElementById('btnAgeOver18');
  const btnAgeUnder18 = document.getElementById('btnAgeUnder18');

  const siteBrand = document.getElementById('siteBrand');
  const homepageView = document.getElementById('homepageView');
  const videoDetailView = document.getElementById('videoDetailView');
  const videoGrid = document.getElementById('videoGrid');
  const categoryPills = document.querySelectorAll('.category-pill');
  const feedTitleHeading = document.getElementById('feedTitleHeading');
  const feedSubtitle = document.getElementById('feedSubtitle');
  const feedCounter = document.getElementById('feedCounter');

  const desktopSearchInput = document.getElementById('desktopSearchInput');
  const desktopSearchClear = document.getElementById('desktopSearchClear');
  const mobileSearchTrigger = document.getElementById('mobileSearchTrigger');
  const searchModal = document.getElementById('searchModal');
  const modalSearchInput = document.getElementById('modalSearchInput');
  const btnCloseSearchModal = document.getElementById('btnCloseSearchModal');

  const mobileMenuTrigger = document.getElementById('mobileMenuTrigger');
  const drawerBackdrop = document.getElementById('drawerBackdrop');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');

  // Video Detail Elements
  const btnBackToHome = document.getElementById('btnBackToHome');
  const html5Video = document.getElementById('html5VideoPlayer');
  const detailVideoTitle = document.getElementById('detailVideoTitle');
  const detailChannelAvatar = document.getElementById('detailChannelAvatar');
  const detailChannelName = document.getElementById('detailChannelName');
  const detailViewCount = document.getElementById('detailViewCount');
  const detailUploadDate = document.getElementById('detailUploadDate');
  const detailBadge = document.getElementById('detailBadge');
  const detailDescription = document.getElementById('detailDescription');
  const relatedVideoList = document.getElementById('relatedVideoList');
  const btnLikeVideo = document.getElementById('btnLikeVideo');
  const likeCountDisplay = document.getElementById('likeCountDisplay');
  const btnShareVideo = document.getElementById('btnShareVideo');
  const btnSaveVideo = document.getElementById('btnSaveVideo');
  const toastNotice = document.getElementById('toastNotice');

  // ========================================================================
  // 1. AGE GATE LOGIC
  // Verification appears only once for first-time visitors and persists in storage.
  // Both buttons allow entry and store verification state.
  // ========================================================================
  function isAgeGatePassed() {
    try {
      return localStorage.getItem('ageGatePassed') === 'true' ||
             sessionStorage.getItem('ageGatePassed') === 'true' ||
             /(?:^|;\s*)ageGatePassed=true/.test(document.cookie);
    } catch (e) {
      return false;
    }
  }

  function enterHomepage() {
    ageGateOverlay.classList.add('hidden');
    try {
      localStorage.setItem('ageGatePassed', 'true');
      sessionStorage.setItem('ageGatePassed', 'true');
      document.cookie = 'ageGatePassed=true; path=/; max-age=31536000; SameSite=Lax';
    } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (btnAgeOver18) btnAgeOver18.addEventListener('click', enterHomepage);
  if (btnAgeUnder18) btnAgeUnder18.addEventListener('click', enterHomepage);

  // If visitor already verified age, ensure gate overlay is hidden
  if (isAgeGatePassed()) {
    ageGateOverlay.classList.add('hidden');
  }

  // ========================================================================
  // 2. FETCH VIDEOS FROM SQLITE API
  // ========================================================================
  async function fetchVideos() {
    videoGrid.setAttribute('aria-busy', 'true');
    feedCounter.textContent = 'Fetching latest published videos...';

    try {
      const url = new URL('/api/videos', window.location.origin);
      if (state.currentCategory) url.searchParams.set('category', state.currentCategory);
      if (state.searchQuery.trim()) url.searchParams.set('search', state.searchQuery.trim());

      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load videos from server');

      const data = await res.json();
      state.videos = Array.isArray(data) ? data : [];

      renderVideoGrid();
      updateCategoryCounts();
    } catch (err) {
      console.error('Error fetching videos:', err);
      videoGrid.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-state-title">Could not load videos</h3>
          <p class="empty-state-desc">The database server could not be reached. Please check the local server.</p>
        </div>
      `;
      feedCounter.textContent = 'Error connecting to database';
    } finally {
      videoGrid.setAttribute('aria-busy', 'false');
    }
  }

  function updateCategoryCounts() {
    // Optionally update pill counts
    const countEl = document.getElementById(`count${capitalize(state.currentCategory)}`);
    if (countEl) {
      countEl.textContent = `(${state.videos.length})`;
    }
  }

  function capitalize(str) {
    if (!str) return '';
    return str.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  }

  // ========================================================================
  // 3. RENDER VIDEO GRID (RESPONSIVE: 4-cols desktop, 1-col mobile)
  // ========================================================================
  function renderVideoGrid() {
    videoGrid.innerHTML = '';

    const titles = {
      'latest': { title: 'Latest Videos', subtitle: 'Sorted from newest to oldest' },
      'trending': { title: 'Trending Right Now', subtitle: 'Highest engagement across the platform' },
      'most-viewed': { title: 'Most Viewed All-Time', subtitle: 'Ranked by total views' },
      'new': { title: 'New Releases', subtitle: 'Freshly published content' }
    };

    if (state.searchQuery.trim()) {
      feedTitleHeading.textContent = `Search: "${state.searchQuery}"`;
      feedSubtitle.textContent = `Showing matching published results`;
    } else {
      feedTitleHeading.textContent = titles[state.currentCategory]?.title || 'Published Videos';
      feedSubtitle.textContent = titles[state.currentCategory]?.subtitle || '';
    }

    feedCounter.textContent = `Showing ${state.videos.length} video${state.videos.length === 1 ? '' : 's'}`;

    if (state.videos.length === 0) {
      videoGrid.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-state-title">No published videos found</h3>
          <p class="empty-state-desc">No videos match the current category or search criteria.</p>
        </div>
      `;
      return;
    }

    state.videos.forEach((video, index) => {
      const card = document.createElement('article');
      card.className = 'video-card';
      card.setAttribute('role', 'article');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${video.title}, ${formatViews(video.views)}, ${formatDate(video.created_at)}`);
      card.dataset.id = video.id;

      card.innerHTML = `
        <div class="video-card-thumb-wrapper">
          <img class="video-card-thumb" src="/api/videos/${video.id}/thumbnail" alt="${video.title}" loading="${index < 4 ? 'eager' : 'lazy'}" onerror="this.src='/uploads/thumbnails/seed-thumb-1.svg'">
          <span class="video-badge-duration">${video.duration || '00:00'}</span>
          <div class="video-play-overlay" aria-hidden="true">
            <div class="video-play-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 3 20 12 6 21 6 3"/>
              </svg>
            </div>
          </div>
        </div>
        <div class="video-card-info">
          <div class="video-channel-avatar" aria-hidden="true">${(video.title || 'V').substring(0, 2).toUpperCase()}</div>
          <div class="video-meta-wrapper">
            <h3 class="video-card-title">${video.title}</h3>
            <div class="video-channel-name">
              <span>ViralHub · ${video.category ? video.category.toUpperCase() : 'LATEST'}</span>
              <svg class="channel-check-icon" viewBox="0 0 24 24" fill="currentColor" aria-label="Verified">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
            </div>
            <div class="video-stats-row">
              <span>${formatDate(video.created_at)}</span>
              <span class="stat-divider">·</span>
              <span>${formatViews(video.views)}</span>
            </div>
          </div>
        </div>
      `;

      // Open video on click or enter
      const openAction = () => {
        window.location.href = `/video/${video.id}`;
      };
      card.addEventListener('click', openAction);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openAction();
        }
      });

      videoGrid.appendChild(card);
    });
  }

  function formatViews(views) {
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

  function formatDate(dateStr) {
    if (!dateStr) return 'Recently';
    const date = new Date(dateStr);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  }

  // ========================================================================
  // 4. CATEGORY NAVIGATION
  // ========================================================================
  categoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      categoryPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.currentCategory = pill.dataset.category;
      fetchVideos();
    });
  });

  // ========================================================================
  // 5. SEARCH FUNCTIONALITY & HIDDEN OWNER SHORTCUT
  // ========================================================================
  function isOwnerShortcut(val) {
    return (val || '').trim().toLowerCase() === 'i am the owner';
  }

  function handleSearch(query) {
    // If user entered the hidden owner shortcut, do not perform regular search
    if (isOwnerShortcut(query)) {
      return;
    }

    state.searchQuery = query;
    if (query.trim()) {
      desktopSearchClear.style.display = 'flex';
    } else {
      desktopSearchClear.style.display = 'none';
    }
    fetchVideos();
  }

  function checkAndTriggerShortcut(e, inputEl) {
    const val = inputEl ? inputEl.value : '';
    if (isOwnerShortcut(val)) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      inputEl.value = '';
      window.location.href = '/admin/login';
      return true;
    }
    return false;
  }

  desktopSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (checkAndTriggerShortcut(e, desktopSearchInput)) return;
      e.preventDefault();
      handleSearch(desktopSearchInput.value);
    }
  });

  modalSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (checkAndTriggerShortcut(e, modalSearchInput)) return;
      e.preventDefault();
      handleSearch(modalSearchInput.value);
    }
  });

  desktopSearchInput.addEventListener('input', (e) => handleSearch(e.target.value));
  modalSearchInput.addEventListener('input', (e) => handleSearch(e.target.value));

  desktopSearchInput.addEventListener('search', (e) => checkAndTriggerShortcut(e, desktopSearchInput));
  modalSearchInput.addEventListener('search', (e) => checkAndTriggerShortcut(e, modalSearchInput));

  desktopSearchClear.addEventListener('click', () => {
    desktopSearchInput.value = '';
    handleSearch('');
    desktopSearchInput.focus();
  });

  mobileSearchTrigger.addEventListener('click', () => {
    searchModal.classList.add('active');
    modalSearchInput.value = state.searchQuery;
    setTimeout(() => modalSearchInput.focus(), 100);
  });
  btnCloseSearchModal.addEventListener('click', () => searchModal.classList.remove('active'));

  // ========================================================================
  // 6. MOBILE DRAWER
  // ========================================================================
  function closeMobileDrawer() {
    drawerBackdrop.classList.remove('active');
  }
  mobileMenuTrigger.addEventListener('click', () => drawerBackdrop.classList.add('active'));
  btnCloseDrawer.addEventListener('click', closeMobileDrawer);
  drawerBackdrop.addEventListener('click', (e) => {
    if (e.target === drawerBackdrop) closeMobileDrawer();
  });

  // ========================================================================
  // 7. INITIALIZATION
  // ========================================================================
  fetchVideos();

})();
