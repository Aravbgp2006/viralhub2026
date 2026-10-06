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
  // 6b. FEATURED HOMEPAGE VIDEOS CAROUSEL CONTROLLER (PURE VIDEO ONLY)
  // ========================================================================
  let featuredVideosList = [];
  let currentFeaturedIndex = 0;
  let featuredScrollDebounce = null;
  let isUserDraggingTrack = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;
  let hasDraggedDistance = false;
  let isProgrammaticScrolling = false;
  let programmaticScrollTimer = null;

  const featuredCarouselSection = document.getElementById('featuredCarouselSection');
  const featuredTrack = document.getElementById('featuredTrack');
  const btnFeaturedPrev = document.getElementById('btnFeaturedPrev');
  const btnFeaturedNext = document.getElementById('btnFeaturedNext');

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

      renderFeaturedSlides();

      // Refresh behavior: ALWAYS start at Slot 1 (reset scroll offset)
      currentFeaturedIndex = 0;
      featuredTrack.scrollLeft = 0;

      // Setup drag and click handlers
      setupFeaturedTrackEvents();

      // Autoplay Slot 1 after slight frame delay
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

      const streamUrl = item.stream_url || item.preview_video_url || `/api/featured-carousel/${item.id}/stream`;
      const zoom = parseFloat(item.zoom) || 1.0;
      const panX = parseFloat(item.pan_x) || 0;
      const panY = parseFloat(item.pan_y) || 0;

      // PURE VIDEO ONLY:
      // Layer 1: Heavily blurred background video (fills the compact container)
      // Layer 2: Centered 9:16 foreground video (never stretched/distorted)
      slide.innerHTML = `
        <div class="featured-bg-layer" aria-hidden="true">
          <video class="featured-bg-video" id="featuredBgVideo_${index}" playsinline webkit-playsinline muted loop preload="${index <= 1 ? 'metadata' : 'none'}" data-src="${escapeHtmlApp(streamUrl)}">
          </video>
        </div>
        <div class="featured-fg-container">
          <div class="featured-fg-frame">
            <video class="featured-fg-video" id="featuredFgVideo_${index}" playsinline webkit-playsinline muted loop preload="${index <= 1 ? 'metadata' : 'none'}" data-src="${escapeHtmlApp(streamUrl)}" style="transform: translate(${panX}px, ${panY}px) scale(${zoom});">
            </video>
          </div>
        </div>
      `;

      // Tap on slide toggles play/pause for active slide
      slide.addEventListener('click', () => {
        if (hasDraggedDistance) return;

        if (index !== currentFeaturedIndex) {
          scrollToFeaturedSlide(index);
          return;
        }

        const fgVid = document.getElementById(`featuredFgVideo_${index}`);
        const bgVid = document.getElementById(`featuredBgVideo_${index}`);
        if (!fgVid) return;

        if (fgVid.paused) {
          fgVid.play().catch(() => {});
          if (bgVid && bgVid.paused) bgVid.play().catch(() => {});
        } else {
          fgVid.pause();
          if (bgVid) bgVid.pause();
        }
      });

      featuredTrack.appendChild(slide);
    });
  }

  function activateFeaturedSlide(index, allowAutoplay = true) {
    if (index < 0 || index >= featuredVideosList.length) return;

    currentFeaturedIndex = index;

    // 1. Immediately pause and reset all other videos (never play multiple videos simultaneously)
    featuredVideosList.forEach((_, i) => {
      if (i !== index) {
        const otherFg = document.getElementById(`featuredFgVideo_${i}`);
        const otherBg = document.getElementById(`featuredBgVideo_${i}`);
        if (otherFg) {
          otherFg.pause();
          try { otherFg.currentTime = 0; } catch (_) {}
        }
        if (otherBg) {
          otherBg.pause();
          try { otherBg.currentTime = 0; } catch (_) {}
        }
      }
    });

    // 2. Prepare and activate targeted video (both fg and bg)
    const activeFg = document.getElementById(`featuredFgVideo_${index}`);
    const activeBg = document.getElementById(`featuredBgVideo_${index}`);

    if (activeFg) {
      if (!activeFg.src && activeFg.dataset.src) {
        activeFg.src = activeFg.dataset.src;
        activeFg.load();
      }
      activeFg.muted = true; // Initially muted per browser autoplay policy

      if (activeBg) {
        if (!activeBg.src && activeBg.dataset.src) {
          activeBg.src = activeBg.dataset.src;
          activeBg.load();
        }
        activeBg.muted = true;
      }

      if (allowAutoplay) {
        const p1 = activeFg.play();
        if (p1 !== undefined) {
          p1.catch(() => {
            activeFg.muted = true;
            activeFg.play().catch(() => {});
          });
        }
        if (activeBg) {
          const p2 = activeBg.play();
          if (p2 !== undefined) {
            p2.catch(() => {
              activeBg.muted = true;
              activeBg.play().catch(() => {});
            });
          }
        }
      }
    }

    // 3. Preload adjacent next video
    const nextIndex = index + 1;
    if (nextIndex < featuredVideosList.length) {
      const nextFg = document.getElementById(`featuredFgVideo_${nextIndex}`);
      const nextBg = document.getElementById(`featuredBgVideo_${nextIndex}`);
      if (nextFg && !nextFg.src && nextFg.dataset.src) {
        nextFg.src = nextFg.dataset.src;
        nextFg.preload = 'metadata';
      }
      if (nextBg && !nextBg.src && nextBg.dataset.src) {
        nextBg.src = nextBg.dataset.src;
        nextBg.preload = 'metadata';
      }
    }
  }

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
      }, 70);
    }, { passive: true });

    // Desktop Mouse Drag / Swipe
    featuredTrack.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
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
      const walk = (x - dragStartX) * 1.25;
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
        const activeFg = document.getElementById(`featuredFgVideo_${currentFeaturedIndex}`);
        const activeBg = document.getElementById(`featuredBgVideo_${currentFeaturedIndex}`);
        if (!activeFg) return;

        if (!entry.isIntersecting) {
          if (!activeFg.paused) {
            activeFg.pause();
            if (activeBg) activeBg.pause();
          }
        } else {
          // Re-entering viewport resumes playback
          if (activeFg.paused) {
            activeFg.play().catch(() => {});
            if (activeBg && activeBg.paused) activeBg.play().catch(() => {});
          }
        }
      });
    }, { threshold: 0.25 });

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

