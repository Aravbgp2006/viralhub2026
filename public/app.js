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
  // 0. PAYMENT RETURN REDIRECT
  // If user was redirected to homepage after Razorpay checkout, redirect to video
  // ========================================================================
  const homeUrlParams = new URLSearchParams(window.location.search);
  const rzpPaymentId = homeUrlParams.get('razorpay_payment_id') || homeUrlParams.get('payment_id');
  if (rzpPaymentId) {
    let pendingVid = null;
    try {
      const cookieMatch = document.cookie.match(/(?:^|;\s*)vh_pending_vid=(\d+)/);
      if (cookieMatch) pendingVid = cookieMatch[1];
      if (!pendingVid) {
        pendingVid = sessionStorage.getItem('vh_pending_checkout_vid') || localStorage.getItem('vh_pending_checkout_vid');
      }
    } catch (_) {}
    if (pendingVid) {
      window.location.replace(`/video/${pendingVid}${window.location.search}`);
      return;
    }
  }

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
      const isPortrait = video.thumbnail_aspect_ratio === '9:16';
      const aspectClass = isPortrait ? 'aspect-9-16' : 'aspect-16-9';
      card.className = `video-card ${aspectClass}`;
      card.setAttribute('role', 'article');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${video.title}, ${formatViews(video.views)}, ${formatDate(video.created_at)}`);
      card.dataset.id = video.id;

      card.innerHTML = `
        <div class="video-card-thumb-wrapper ${aspectClass}">
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
  // 6b. FEATURED HOMEPAGE VIDEOS CAROUSEL CONTROLLER
  // ========================================================================
  let featuredVideosList = [];
  let currentFeaturedIndex = 0;
  let isFeaturedMuted = true;
  let featuredScrollDebounce = null;
  let isUserDraggingTrack = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;
  let hasDraggedDistance = false;

  const featuredCarouselSection = document.getElementById('featuredCarouselSection');
  const featuredTrack = document.getElementById('featuredTrack');
  const featuredCurrentSlide = document.getElementById('featuredCurrentSlide');
  const featuredTotalSlides = document.getElementById('featuredTotalSlides');
  const featuredDots = document.getElementById('featuredDots');
  const btnFeaturedPrev = document.getElementById('btnFeaturedPrev');
  const btnFeaturedNext = document.getElementById('btnFeaturedNext');

  const muteSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
  const unmuteSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

  async function initFeaturedCarousel() {
    if (!featuredCarouselSection || !featuredTrack) return;

    try {
      const res = await fetch('/api/featured-videos');
      if (!res.ok) {
        featuredCarouselSection.style.display = 'none';
        return;
      }

      const data = await res.json();
      const list = (data && Array.isArray(data.videos)) ? data.videos : [];

      if (list.length === 0) {
        featuredCarouselSection.style.display = 'none';
        featuredVideosList = [];
        return;
      }

      featuredVideosList = list;
      featuredCarouselSection.style.display = 'block';
      if (featuredTotalSlides) featuredTotalSlides.textContent = String(featuredVideosList.length);

      renderFeaturedSlides();
      renderFeaturedDots();

      // Ensure fresh visit starts from Slot 1 (no scroll offset persisted)
      currentFeaturedIndex = 0;
      featuredTrack.scrollLeft = 0;
      updateFeaturedCounter(0);
      updateFeaturedDots(0);

      // Setup drag and click handlers
      setupFeaturedTrackEvents();

      // Autoplay Slot 1 after slight frame delay to ensure DOM readiness
      requestAnimationFrame(() => {
        activateFeaturedSlide(0, true);
      });

      // Pause playback when carousel leaves viewport
      setupFeaturedIntersectionObserver();

    } catch (err) {
      console.warn('Could not initialize featured carousel:', err);
      if (featuredCarouselSection) featuredCarouselSection.style.display = 'none';
    }
  }

  function renderFeaturedSlides() {
    if (!featuredTrack) return;
    featuredTrack.innerHTML = '';

    featuredVideosList.forEach((item, index) => {
      const slide = document.createElement('div');
      slide.className = 'featured-slide';
      slide.dataset.index = index;
      slide.dataset.id = item.id;

      const isPortrait = item.thumbnail_aspect_ratio === '9:16';
      const thumbUrl = item.thumbnail_url || `/api/videos/${item.id}/thumbnail`;
      const streamUrl = item.preview_video_url || `/api/featured-videos/${item.id}/stream`;

      slide.innerHTML = `
        <div class="featured-card">
          <div class="featured-media-box" id="featuredMediaBox_${index}">
            <span class="featured-slot-pill">Slot ${item.position || (index + 1)}</span>
            <button type="button" class="featured-sound-toggle" id="featuredSoundToggle_${index}" aria-label="Toggle Sound" title="Toggle Sound">
              ${isFeaturedMuted ? muteSvg : unmuteSvg}
            </button>
            <img class="featured-poster" id="featuredPoster_${index}" src="${escapeHtmlApp(thumbUrl)}" alt="${escapeHtmlApp(item.title)}" loading="${index === 0 ? 'eager' : 'lazy'}">
            <video class="featured-video-player" id="featuredVideo_${index}" playsinline webkit-playsinline muted loop preload="${index <= 1 ? 'metadata' : 'none'}" data-src="${escapeHtmlApp(streamUrl)}">
            </video>
            <div class="featured-play-hint" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            </div>
          </div>
          <div class="featured-info-overlay">
            <div class="featured-info-content">
              <div class="featured-tag-row">
                <span class="featured-cat-tag">${escapeHtmlApp(item.category || 'Featured')}</span>
                <span class="featured-dur-pill">${item.duration || '00:00'}</span>
              </div>
              <a href="/video/${item.id}" class="featured-title-link">
                <h3 class="featured-video-title">${escapeHtmlApp(item.title)}</h3>
              </a>
            </div>
            <a href="/video/${item.id}" class="featured-watch-btn">
              <span>Watch</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </a>
          </div>
        </div>
      `;

      // Sound button listener
      const soundBtn = slide.querySelector(`#featuredSoundToggle_${index}`);
      if (soundBtn) {
        soundBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          toggleFeaturedSound();
        });
      }

      // Media box click: toggle play/pause of the current active slide
      const mediaBox = slide.querySelector(`#featuredMediaBox_${index}`);
      if (mediaBox) {
        mediaBox.addEventListener('click', (e) => {
          if (e.target.closest('.featured-sound-toggle')) return;
          if (hasDraggedDistance) return;

          if (index !== currentFeaturedIndex) {
            scrollToFeaturedSlide(index);
            return;
          }

          const video = document.getElementById(`featuredVideo_${index}`);
          if (!video) return;

          if (video.paused) {
            video.play().then(() => {
              mediaBox.classList.remove('paused');
            }).catch(() => {});
          } else {
            video.pause();
            mediaBox.classList.add('paused');
          }
        });
      }

      featuredTrack.appendChild(slide);
    });
  }

  function renderFeaturedDots() {
    if (!featuredDots) return;
    featuredDots.innerHTML = '';

    featuredVideosList.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `featured-dot ${index === 0 ? 'active' : ''}`;
      dot.dataset.index = index;
      dot.setAttribute('aria-label', `Go to featured slide ${index + 1}`);

      dot.addEventListener('click', () => {
        scrollToFeaturedSlide(index);
      });

      featuredDots.appendChild(dot);
    });
  }

  function updateFeaturedCounter(index) {
    if (featuredCurrentSlide) {
      featuredCurrentSlide.textContent = String(index + 1);
    }
  }

  function updateFeaturedDots(index) {
    if (!featuredDots) return;
    const dots = featuredDots.querySelectorAll('.featured-dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === index);
    });
  }

  function updateAllSoundButtons() {
    featuredVideosList.forEach((_, i) => {
      const btn = document.getElementById(`featuredSoundToggle_${i}`);
      if (btn) {
        btn.innerHTML = isFeaturedMuted ? muteSvg : unmuteSvg;
        btn.title = isFeaturedMuted ? 'Unmute' : 'Mute';
      }
    });
  }

  function toggleFeaturedSound() {
    isFeaturedMuted = !isFeaturedMuted;
    updateAllSoundButtons();

    const activeVid = document.getElementById(`featuredVideo_${currentFeaturedIndex}`);
    if (activeVid) {
      activeVid.muted = isFeaturedMuted;
    }
  }

  function activateFeaturedSlide(index, allowAutoplay = true) {
    if (index < 0 || index >= featuredVideosList.length) return;

    currentFeaturedIndex = index;
    updateFeaturedCounter(index);
    updateFeaturedDots(index);

    // 1. Immediately pause and reset all other videos
    featuredVideosList.forEach((_, i) => {
      if (i !== index) {
        const otherVid = document.getElementById(`featuredVideo_${i}`);
        const otherPoster = document.getElementById(`featuredPoster_${i}`);
        const otherBox = document.getElementById(`featuredMediaBox_${i}`);
        if (otherVid) {
          otherVid.pause();
          try { otherVid.currentTime = 0; } catch (_) {}
        }
        if (otherPoster) {
          otherPoster.classList.remove('hidden');
        }
        if (otherBox) {
          otherBox.classList.remove('paused');
        }
      }
    });

    // 2. Prepare and activate targeted video
    const activeVid = document.getElementById(`featuredVideo_${index}`);
    const activePoster = document.getElementById(`featuredPoster_${index}`);
    const activeBox = document.getElementById(`featuredMediaBox_${index}`);

    if (activeVid) {
      if (!activeVid.src && activeVid.dataset.src) {
        activeVid.src = activeVid.dataset.src;
        activeVid.load();
      }

      activeVid.muted = isFeaturedMuted;

      if (allowAutoplay) {
        const playPromise = activeVid.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            if (activePoster) activePoster.classList.add('hidden');
            if (activeBox) activeBox.classList.remove('paused');
          }).catch(() => {
            activeVid.muted = true;
            isFeaturedMuted = true;
            updateAllSoundButtons();
            activeVid.play().then(() => {
              if (activePoster) activePoster.classList.add('hidden');
              if (activeBox) activeBox.classList.remove('paused');
            }).catch(() => {
              if (activeBox) activeBox.classList.add('paused');
            });
          });
        }
      }
    }

    // 3. Preload adjacent next video
    const nextIndex = index + 1;
    if (nextIndex < featuredVideosList.length) {
      const nextVid = document.getElementById(`featuredVideo_${nextIndex}`);
      if (nextVid && !nextVid.src && nextVid.dataset.src) {
        nextVid.src = nextVid.dataset.src;
        nextVid.preload = 'metadata';
      }
    }
  }

  let isProgrammaticScrolling = false;
  let programmaticScrollTimer = null;

  function scrollToFeaturedSlide(index) {
    if (!featuredTrack) return;
    const clamped = Math.max(0, Math.min(featuredVideosList.length - 1, index));
    const slideWidth = featuredTrack.clientWidth || 360;

    isProgrammaticScrolling = true;
    clearTimeout(programmaticScrollTimer);
    clearTimeout(featuredScrollDebounce);

    activateFeaturedSlide(clamped, true);

    featuredTrack.scrollTo({
      left: clamped * slideWidth,
      behavior: 'smooth'
    });

    programmaticScrollTimer = setTimeout(() => {
      isProgrammaticScrolling = false;
    }, 500);
  }

  function setupFeaturedTrackEvents() {
    if (!featuredTrack) return;

    featuredTrack.addEventListener('scroll', () => {
      if (isUserDraggingTrack || isProgrammaticScrolling) return;

      clearTimeout(featuredScrollDebounce);
      featuredScrollDebounce = setTimeout(() => {
        if (isProgrammaticScrolling) return;
        const slideWidth = featuredTrack.clientWidth || 360;
        const newIndex = Math.round(featuredTrack.scrollLeft / slideWidth);
        if (newIndex !== currentFeaturedIndex && newIndex >= 0 && newIndex < featuredVideosList.length) {
          activateFeaturedSlide(newIndex, true);
        }
      }, 80);
    }, { passive: true });

    featuredTrack.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      isUserDraggingTrack = true;
      hasDraggedDistance = false;
      dragStartX = e.pageX - featuredTrack.offsetLeft;
      dragStartScrollLeft = featuredTrack.scrollLeft;
      featuredTrack.style.cursor = 'grabbing';
      featuredTrack.style.scrollSnapType = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isUserDraggingTrack) return;
      e.preventDefault();
      const x = e.pageX - featuredTrack.offsetLeft;
      const walk = (x - dragStartX) * 1.2;
      if (Math.abs(walk) > 6) {
        hasDraggedDistance = true;
      }
      featuredTrack.scrollLeft = dragStartScrollLeft - walk;
    });

    window.addEventListener('mouseup', () => {
      if (!isUserDraggingTrack) return;
      isUserDraggingTrack = false;
      featuredTrack.style.cursor = '';
      featuredTrack.style.scrollSnapType = 'x mandatory';

      const slideWidth = featuredTrack.clientWidth || 360;
      const targetIndex = Math.round(featuredTrack.scrollLeft / slideWidth);
      scrollToFeaturedSlide(targetIndex);

      setTimeout(() => {
        hasDraggedDistance = false;
      }, 50);
    });

    if (btnFeaturedPrev) {
      btnFeaturedPrev.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToFeaturedSlide(currentFeaturedIndex - 1);
      });
    }

    if (btnFeaturedNext) {
      btnFeaturedNext.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToFeaturedSlide(currentFeaturedIndex + 1);
      });
    }
  }

  function setupFeaturedIntersectionObserver() {
    if (!featuredCarouselSection || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const activeVid = document.getElementById(`featuredVideo_${currentFeaturedIndex}`);
        const activeBox = document.getElementById(`featuredMediaBox_${currentFeaturedIndex}`);
        if (!activeVid) return;

        if (!entry.isIntersecting) {
          if (!activeVid.paused) {
            activeVid.pause();
            if (activeBox) activeBox.classList.add('paused');
          }
        }
      });
    }, { threshold: 0.3 });

    observer.observe(featuredCarouselSection);
  }

  function escapeHtmlApp(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ========================================================================
  // 7. INITIALIZATION
  // ========================================================================
  fetchVideos();
  initFeaturedCarousel();

})();

