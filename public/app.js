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
  // 6b. FEATURED HOMEPAGE VIDEOS CAROUSEL CONTROLLER (2:3 PURE VIDEO)
  // ========================================================================
  // ========================================================================
  // FEATURED SHORT VIDEOS HOMEPAGE CAROUSEL (60FPS MOBILE PERFORMANCE ENGINE)
  // ========================================================================
  let featuredVideosList = [];
  let currentFeaturedIndex = 0;
  let isFeaturedMuted = true;
  let isCarouselAnimating = false;
  let animTimeout = null;
  let animCleanupCallback = null;
  let currentPlayingIndex = -1;

  const featuredCarouselSection = document.getElementById('featuredCarouselSection');
  const featuredViewportWrapper = document.getElementById('featuredViewportWrapper');
  const featuredTrack = document.getElementById('featuredTrack');
  const btnFeaturedSound = document.getElementById('btnFeaturedSound');
  const soundIconMuted = document.getElementById('soundIconMuted');
  const soundIconUnmuted = document.getElementById('soundIconUnmuted');
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

      // Always reset to Video 1 (index 0) on fresh load / refresh
      currentFeaturedIndex = 0;
      currentPlayingIndex = -1;
      isFeaturedMuted = true;
      updateFeaturedSoundButtonUI();

      renderFeaturedSlides();

      // Initialize preload window (Video 0 auto, adjacent metadata, distant none)
      updateVideoPreloadWindow(0);

      // Setup touch swipe, mouse drag, and buttons
      setupFeaturedTouchAndDragEvents();

      // Autoplay Video 1 immediately
      requestAnimationFrame(() => {
        activateAndPlayFeaturedSlide(0, true);
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
      slide.className = `featured-slide${index === 0 ? ' active' : ''}`;
      slide.id = `featuredSlide_${index}`;
      slide.dataset.index = index;
      slide.dataset.id = item.id;
      slide.style.display = index === 0 ? 'block' : 'none';
      slide.style.transform = index === 0 ? 'translate3d(0, 0, 0)' : 'translate3d(100%, 0, 0)';

      const streamUrl = item.stream_url || item.preview_video_url || `/api/featured-carousel/${item.id}/stream`;
      const zoom = parseFloat(item.zoom) || 1.0;
      const panX = parseFloat(item.pan_x) || 0;
      const panY = parseFloat(item.pan_y) || 0;
      const hasThumb = Boolean(item.thumbnail_url && item.thumbnail_url.trim().length > 0);

      // ULTRA-PERFORMANT DUAL-LAYER DESIGN:
      // Layer 1 (Background): Static image snapshot with CSS blur (or strictly PAUSED video frame fallback).
      //                       CRITICAL: Background NEVER plays or continuously decodes video!
      // Layer 2 (Foreground): The ONLY actively playing and decoding video in the entire browser.
      slide.innerHTML = `
        <div class="featured-bg-layer" aria-hidden="true">
          <img class="featured-bg-img" id="featuredBgImg_${index}" alt="" src="${escapeHtmlApp(hasThumb ? item.thumbnail_url : '')}" style="${hasThumb ? 'display: block;' : 'display: none;'}" loading="lazy" />
          <video class="featured-bg-video" id="featuredBgVideo_${index}" playsinline webkit-playsinline muted loop preload="${index === 0 ? 'metadata' : 'none'}" style="${hasThumb ? 'display: none;' : 'display: block;'}" data-src="${escapeHtmlApp(streamUrl)}">
          </video>
        </div>
        <div class="featured-fg-container">
          <video class="featured-fg-video" id="featuredFgVideo_${index}" playsinline webkit-playsinline muted loop preload="${index === 0 ? 'auto' : 'none'}" data-src="${escapeHtmlApp(streamUrl)}" style="transform: translate3d(${panX}px, ${panY}px, 0) scale(${zoom});">
          </video>
        </div>
      `;

      // Set initial src for active slide
      const fgVid = slide.querySelector('.featured-fg-video');
      const bgVid = slide.querySelector('.featured-bg-video');

      if (index === 0) {
        if (fgVid && !fgVid.src) fgVid.src = streamUrl;
        if (bgVid && !bgVid.src && !hasThumb) bgVid.src = streamUrl;
      }

      // Robust Video Event Handlers for Foreground Video
      if (fgVid) {
        fgVid.addEventListener('loadedmetadata', () => {
          fgVid.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`;
        });

        // Frame snapshot capture: Replace background video with static image texture as soon as first frame decodes
        fgVid.addEventListener('loadeddata', () => {
          const bgImg = document.getElementById(`featuredBgImg_${index}`);
          if (bgImg && (!bgImg.src || bgImg.style.display === 'none') && fgVid.videoWidth > 0) {
            try {
              const c = document.createElement('canvas');
              c.width = 160;
              c.height = 284;
              const ctx = c.getContext('2d');
              if (ctx) {
                ctx.drawImage(fgVid, 0, 0, c.width, c.height);
                bgImg.src = c.toDataURL('image/jpeg', 0.6);
                bgImg.style.display = 'block';
                const curBgVid = document.getElementById(`featuredBgVideo_${index}`);
                if (curBgVid) curBgVid.style.display = 'none';
              }
            } catch (_) {
              // Graceful fallback: bgVid remains paused
            }
          }
        }, { once: true });

        fgVid.addEventListener('waiting', () => {
          // Buffering event: Carousel UI remains completely responsive and independent
        });

        fgVid.addEventListener('stalled', () => {
          // Stalled event: Carousel UI remains completely responsive
        });

        fgVid.addEventListener('error', (e) => {
          console.warn(`Featured video playback notice on slide ${index}:`, e);
        });

        fgVid.addEventListener('ended', () => {
          fgVid.currentTime = 0;
          fgVid.play().catch(() => {});
        });
      }

      // Tap on slide toggles play/pause for active slide
      slide.addEventListener('click', (e) => {
        if (e.target.closest('#btnFeaturedSound') || e.target.closest('#btnFeaturedPrev') || e.target.closest('#btnFeaturedNext')) return;
        if (index !== currentFeaturedIndex) {
          goToFeaturedSlide(index, index > currentFeaturedIndex ? 'next' : 'prev');
          return;
        }

        const activeFg = document.getElementById(`featuredFgVideo_${index}`);
        if (!activeFg) return;

        if (activeFg.paused) {
          activeFg.play().catch(() => {});
        } else {
          activeFg.pause();
        }
      });

      featuredTrack.appendChild(slide);
    });
  }

  // Preload Management: ONLY active, next, and previous videos are retained
  function updateVideoPreloadWindow(activeIdx) {
    const n = featuredVideosList.length;
    if (n === 0) return;

    const nextIdx = (activeIdx + 1) % n;
    const prevIdx = (activeIdx - 1 + n) % n;

    for (let i = 0; i < n; i++) {
      const fg = document.getElementById(`featuredFgVideo_${i}`);
      const bg = document.getElementById(`featuredBgVideo_${i}`);
      if (!fg) continue;

      if (i === activeIdx) {
        // Active slide: full preload and ready
        if (!fg.src && fg.dataset.src) {
          fg.src = fg.dataset.src;
        }
        fg.preload = 'auto';
        if (bg && !bg.src && bg.dataset.src && (!bg.previousElementSibling || !bg.previousElementSibling.src)) {
          bg.src = bg.dataset.src;
          bg.preload = 'metadata';
        }
      } else if (i === nextIdx || i === prevIdx) {
        // Immediate adjacent slides: metadata preloaded, playback strictly paused
        if (!fg.src && fg.dataset.src) {
          fg.src = fg.dataset.src;
        }
        fg.preload = 'metadata';
        if (!fg.paused) fg.pause();
        if (bg && !bg.paused) bg.pause();
      } else {
        // Distant slides: do NOT download or decode
        if (!fg.paused) fg.pause();
        if (bg && !bg.paused) bg.pause();
        fg.preload = 'none';
        if (n > 3 && fg.src) {
          fg.removeAttribute('src');
          try { fg.load(); } catch (_) {}
        }
        if (bg && bg.src) {
          bg.removeAttribute('src');
          try { bg.load(); } catch (_) {}
        }
      }
    }
  }

  function pauseAllExcept(targetIndex) {
    const n = featuredVideosList.length;
    for (let i = 0; i < n; i++) {
      if (i !== targetIndex) {
        const otherFg = document.getElementById(`featuredFgVideo_${i}`);
        if (otherFg && !otherFg.paused) {
          otherFg.pause();
        }
        const otherBg = document.getElementById(`featuredBgVideo_${i}`);
        if (otherBg && !otherBg.paused) {
          otherBg.pause();
        }
      }
    }
  }

  function activateAndPlayFeaturedSlide(index, allowAutoplay = true) {
    if (index < 0 || index >= featuredVideosList.length) return;

    // Immediately pause all other videos (strictly ONE playing video in entire app)
    pauseAllExcept(index);

    const activeFg = document.getElementById(`featuredFgVideo_${index}`);
    if (activeFg) {
      if (!activeFg.src && activeFg.dataset.src) {
        activeFg.src = activeFg.dataset.src;
        activeFg.load();
      }

      activeFg.muted = isFeaturedMuted;
      if (!isFeaturedMuted) {
        activeFg.volume = 1.0;
      }

      // Background video is ALWAYS kept paused (it is visual snapshot only)
      const activeBg = document.getElementById(`featuredBgVideo_${index}`);
      if (activeBg) {
        activeBg.muted = true;
        if (!activeBg.paused) activeBg.pause();
      }

      if (allowAutoplay) {
        if (activeFg.paused || currentPlayingIndex !== index) {
          currentPlayingIndex = index;
          const playPromise = activeFg.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {
              // Autoplay policy fallback: mute and resume gracefully without breaking UI
              if (!isFeaturedMuted) {
                isFeaturedMuted = true;
                updateFeaturedSoundButtonUI();
                activeFg.muted = true;
                activeFg.play().catch(() => {});
              }
            });
          }
        }
      }
    }

    // Keep memory and network strictly constrained to active + neighbors
    updateVideoPreloadWindow(index);
  }

  function forceFinishActiveAnimation() {
    if (isCarouselAnimating && typeof animCleanupCallback === 'function') {
      if (animTimeout) {
        clearTimeout(animTimeout);
        animTimeout = null;
      }
      const cb = animCleanupCallback;
      animCleanupCallback = null;
      cb();
    }
  }

  function goToFeaturedSlide(targetIndex, direction = 'next') {
    const n = featuredVideosList.length;
    if (n <= 0) return;
    if (n === 1 || targetIndex === currentFeaturedIndex) {
      snapBackSlide();
      return;
    }

    // Finalize any existing in-flight animation immediately
    forceFinishActiveAnimation();
    isCarouselAnimating = true;

    const oldIndex = currentFeaturedIndex;
    const oldSlide = document.getElementById(`featuredSlide_${oldIndex}`);
    const newSlide = document.getElementById(`featuredSlide_${targetIndex}`);

    // Immediately pause outgoing video
    const oldFg = document.getElementById(`featuredFgVideo_${oldIndex}`);
    if (oldFg && !oldFg.paused) {
      oldFg.pause();
    }

    // Prepare preload window
    updateVideoPreloadWindow(targetIndex);

    const w = featuredViewportWrapper ? (featuredViewportWrapper.clientWidth || 340) : 340;
    const TRANSITION_CSS = 'transform 280ms cubic-bezier(0.25, 1, 0.5, 1)';

    // Position new slide before animating
    if (newSlide) {
      newSlide.style.transition = 'none';
      newSlide.style.display = 'block';
      newSlide.className = 'featured-slide animating';
      newSlide.style.transform = direction === 'next' ? `translate3d(${w}px, 0, 0)` : `translate3d(${-w}px, 0, 0)`;
    }

    if (oldSlide) {
      oldSlide.style.display = 'block';
      oldSlide.className = 'featured-slide animating';
    }

    // Single reflow sync before starting transition
    if (newSlide) void newSlide.offsetWidth;

    // Trigger video playback on new slide
    activateAndPlayFeaturedSlide(targetIndex, true);

    // Apply hardware-accelerated CSS transition to both slides
    if (oldSlide) {
      oldSlide.style.transition = TRANSITION_CSS;
      oldSlide.style.transform = direction === 'next' ? `translate3d(${-w}px, 0, 0)` : `translate3d(${w}px, 0, 0)`;
    }
    if (newSlide) {
      newSlide.style.transition = TRANSITION_CSS;
      newSlide.style.transform = 'translate3d(0, 0, 0)';
    }

    const cleanup = () => {
      currentFeaturedIndex = targetIndex;
      resetAllSlides();
      isCarouselAnimating = false;
      animCleanupCallback = null;
      if (animTimeout) {
        clearTimeout(animTimeout);
        animTimeout = null;
      }
    };

    animCleanupCallback = cleanup;

    if (newSlide) {
      const onEnd = (e) => {
        if (e.target !== newSlide || e.propertyName !== 'transform') return;
        newSlide.removeEventListener('transitionend', onEnd);
        cleanup();
      };
      newSlide.addEventListener('transitionend', onEnd, { once: true });
    }

    // Safety timeout ensuring cleanup always fires
    animTimeout = setTimeout(cleanup, 290);
  }

  function nextFeaturedSlide() {
    if (featuredVideosList.length <= 1) return;
    const nextIdx = (currentFeaturedIndex + 1) % featuredVideosList.length;
    goToFeaturedSlide(nextIdx, 'next');
  }

  function prevFeaturedSlide() {
    if (featuredVideosList.length <= 1) return;
    const prevIdx = (currentFeaturedIndex - 1 + featuredVideosList.length) % featuredVideosList.length;
    goToFeaturedSlide(prevIdx, 'prev');
  }

  function snapBackSlide() {
    const n = featuredVideosList.length;
    if (n <= 0) return;

    forceFinishActiveAnimation();
    isCarouselAnimating = true;

    const curSlide = document.getElementById(`featuredSlide_${currentFeaturedIndex}`);
    const nextIdx = (currentFeaturedIndex + 1) % n;
    const prevIdx = (currentFeaturedIndex - 1 + n) % n;
    const nextSlide = document.getElementById(`featuredSlide_${nextIdx}`);
    const prevSlide = document.getElementById(`featuredSlide_${prevIdx}`);

    const w = featuredViewportWrapper ? (featuredViewportWrapper.clientWidth || 340) : 340;
    const TRANSITION_CSS = 'transform 280ms cubic-bezier(0.25, 1, 0.5, 1)';

    if (curSlide) {
      curSlide.style.display = 'block';
      curSlide.style.transition = TRANSITION_CSS;
      curSlide.style.transform = 'translate3d(0, 0, 0)';
    }
    if (nextSlide && nextSlide !== curSlide) {
      nextSlide.style.display = 'block';
      nextSlide.style.transition = TRANSITION_CSS;
      nextSlide.style.transform = `translate3d(${w}px, 0, 0)`;
    }
    if (prevSlide && prevSlide !== curSlide && prevSlide !== nextSlide) {
      prevSlide.style.display = 'block';
      prevSlide.style.transition = TRANSITION_CSS;
      prevSlide.style.transform = `translate3d(${-w}px, 0, 0)`;
    }

    const cleanup = () => {
      resetAllSlides();
      isCarouselAnimating = false;
      animCleanupCallback = null;
      if (animTimeout) {
        clearTimeout(animTimeout);
        animTimeout = null;
      }
    };

    animCleanupCallback = cleanup;
    animTimeout = setTimeout(cleanup, 290);
  }

  function resetAllSlides() {
    const n = featuredVideosList.length;
    for (let i = 0; i < n; i++) {
      const slide = document.getElementById(`featuredSlide_${i}`);
      if (!slide) continue;
      slide.style.transition = '';
      if (i === currentFeaturedIndex) {
        slide.className = 'featured-slide active';
        slide.style.display = 'block';
        slide.style.transform = 'translate3d(0, 0, 0)';
      } else {
        slide.className = 'featured-slide';
        slide.style.display = 'none';
        slide.style.transform = 'translate3d(100%, 0, 0)';
      }
    }
  }

  function toggleFeaturedSound() {
    isFeaturedMuted = !isFeaturedMuted;
    const curFg = document.getElementById(`featuredFgVideo_${currentFeaturedIndex}`);
    if (curFg) {
      curFg.muted = isFeaturedMuted;
      if (!isFeaturedMuted) {
        curFg.volume = 1.0;
        if (curFg.paused) {
          curFg.play().catch(() => {});
        }
      }
    }
    updateFeaturedSoundButtonUI();
  }

  function updateFeaturedSoundButtonUI() {
    if (soundIconMuted) soundIconMuted.style.display = isFeaturedMuted ? 'block' : 'none';
    if (soundIconUnmuted) soundIconUnmuted.style.display = isFeaturedMuted ? 'none' : 'block';
    if (btnFeaturedSound) {
      btnFeaturedSound.setAttribute('aria-label', isFeaturedMuted ? 'Unmute video' : 'Mute video');
      btnFeaturedSound.setAttribute('title', isFeaturedMuted ? 'Unmute video' : 'Mute video');
    }
  }

  // ========================================================================
  // ULTRA-SMOOTH GPU GESTURE ENGINE (ZERO LAYOUT REFLOWS IN TOUCHMOVE)
  // ========================================================================
  function setupFeaturedTouchAndDragEvents() {
    if (!featuredViewportWrapper) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isTouchDragging = false;
    let isHorizontalGesture = null;
    let touchDeltaX = 0;
    let cachedViewportWidth = 340;
    let rafPending = false;

    // Cached elements for live frame updates
    let curSlideEl = null;
    let nextSlideEl = null;
    let prevSlideEl = null;

    function prepareDragSlides() {
      const n = featuredVideosList.length;
      if (n <= 1) return;
      cachedViewportWidth = featuredViewportWrapper ? (featuredViewportWrapper.clientWidth || 340) : 340;

      const nextIdx = (currentFeaturedIndex + 1) % n;
      const prevIdx = (currentFeaturedIndex - 1 + n) % n;
      curSlideEl = document.getElementById(`featuredSlide_${currentFeaturedIndex}`);
      nextSlideEl = document.getElementById(`featuredSlide_${nextIdx}`);
      prevSlideEl = document.getElementById(`featuredSlide_${prevIdx}`);

      if (curSlideEl) {
        curSlideEl.style.transition = 'none';
        curSlideEl.style.display = 'block';
        curSlideEl.className = 'featured-slide active animating';
        curSlideEl.style.transform = 'translate3d(0, 0, 0)';
      }
      if (nextSlideEl && nextSlideEl !== curSlideEl) {
        nextSlideEl.style.transition = 'none';
        nextSlideEl.style.display = 'block';
        nextSlideEl.className = 'featured-slide animating';
        nextSlideEl.style.transform = `translate3d(${cachedViewportWidth}px, 0, 0)`;
      }
      if (prevSlideEl && prevSlideEl !== curSlideEl && prevSlideEl !== nextSlideEl) {
        prevSlideEl.style.transition = 'none';
        prevSlideEl.style.display = 'block';
        prevSlideEl.className = 'featured-slide animating';
        prevSlideEl.style.transform = `translate3d(${-cachedViewportWidth}px, 0, 0)`;
      }
    }

    function renderDragTransforms() {
      rafPending = false;
      if (!isTouchDragging) return;

      const dx = touchDeltaX;
      const w = cachedViewportWidth;

      if (curSlideEl) {
        curSlideEl.style.transform = `translate3d(${dx}px, 0, 0)`;
      }

      if (dx < 0) {
        if (nextSlideEl) {
          nextSlideEl.style.transform = `translate3d(${w + dx}px, 0, 0)`;
        }
      } else {
        if (prevSlideEl) {
          prevSlideEl.style.transform = `translate3d(${-w + dx}px, 0, 0)`;
        }
      }
    }

    // --- MOBILE TOUCH GESTURES (PASSIVE START, MINIMAL MOVE, CANCELABLE SWIPE) ---
    featuredViewportWrapper.addEventListener('touchstart', (e) => {
      if (featuredVideosList.length <= 1) return;
      forceFinishActiveAnimation();

      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      touchStartTime = performance.now();
      isTouchDragging = true;
      isHorizontalGesture = null;
      touchDeltaX = 0;
      prepareDragSlides();
    }, { passive: true });

    featuredViewportWrapper.addEventListener('touchmove', (e) => {
      if (!isTouchDragging || featuredVideosList.length <= 1) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;

      if (isHorizontalGesture === null) {
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absX < 6 && absY < 6) return;
        if (absY >= absX) {
          // Vertical page scroll detected -> do not block webpage scroll, gracefully abort drag
          isHorizontalGesture = false;
          isTouchDragging = false;
          resetAllSlides();
          return;
        }
        // Horizontal carousel swipe detected!
        isHorizontalGesture = true;
      }

      if (isHorizontalGesture) {
        if (e.cancelable) e.preventDefault();
        touchDeltaX = dx;

        // Batch GPU transform updates to animation frame (ZERO layout reflows!)
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(renderDragTransforms);
        }
      }
    }, { passive: false });

    featuredViewportWrapper.addEventListener('touchend', () => {
      if (!isTouchDragging) return;
      isTouchDragging = false;
      rafPending = false;

      if (!isHorizontalGesture) {
        resetAllSlides();
        return;
      }

      const dt = performance.now() - touchStartTime;
      const velocity = Math.abs(touchDeltaX) / Math.max(1, dt);
      const threshold = 35;
      const velocityThreshold = 0.35;

      if (touchDeltaX < -threshold || (touchDeltaX < -15 && velocity > velocityThreshold)) {
        // Swipe LEFT -> next video
        nextFeaturedSlide();
      } else if (touchDeltaX > threshold || (touchDeltaX > 15 && velocity > velocityThreshold)) {
        // Swipe RIGHT -> previous video
        prevFeaturedSlide();
      } else {
        snapBackSlide();
      }
      touchDeltaX = 0;
    });

    featuredViewportWrapper.addEventListener('touchcancel', () => {
      if (isTouchDragging) {
        isTouchDragging = false;
        rafPending = false;
        snapBackSlide();
      }
    });

    // --- DESKTOP MOUSE DRAG ---
    let isMouseDragging = false;
    let mouseStartX = 0;
    let mouseDeltaX = 0;
    let mouseStartTime = 0;

    featuredViewportWrapper.addEventListener('mousedown', (e) => {
      if (e.target.closest('#btnFeaturedSound') || e.target.closest('#btnFeaturedPrev') || e.target.closest('#btnFeaturedNext')) return;
      if (featuredVideosList.length <= 1) return;
      forceFinishActiveAnimation();

      isMouseDragging = true;
      mouseStartX = e.clientX;
      mouseStartTime = performance.now();
      mouseDeltaX = 0;
      prepareDragSlides();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDragging || featuredVideosList.length <= 1) return;
      const dx = e.clientX - mouseStartX;
      if (Math.abs(dx) > 4) {
        e.preventDefault();
        mouseDeltaX = dx;
        touchDeltaX = dx;
        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(renderDragTransforms);
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (!isMouseDragging) return;
      isMouseDragging = false;
      rafPending = false;

      const dt = performance.now() - mouseStartTime;
      const velocity = Math.abs(mouseDeltaX) / Math.max(1, dt);
      const threshold = 35;
      const velocityThreshold = 0.35;

      if (mouseDeltaX < -threshold || (mouseDeltaX < -15 && velocity > velocityThreshold)) {
        nextFeaturedSlide();
      } else if (mouseDeltaX > threshold || (mouseDeltaX > 15 && velocity > velocityThreshold)) {
        prevFeaturedSlide();
      } else if (Math.abs(mouseDeltaX) > 0) {
        snapBackSlide();
      }
      mouseDeltaX = 0;
      touchDeltaX = 0;
    });

    // --- BUTTON CONTROLS (SHARED SINGLE NAVIGATION FUNCTION) ---
    if (btnFeaturedSound) {
      btnFeaturedSound.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleFeaturedSound();
      });
      btnFeaturedSound.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      }, { passive: false });
    }

    if (btnFeaturedPrev) {
      btnFeaturedPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        prevFeaturedSlide();
      });
      btnFeaturedPrev.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      }, { passive: false });
    }

    if (btnFeaturedNext) {
      btnFeaturedNext.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        nextFeaturedSlide();
      });
      btnFeaturedNext.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      }, { passive: false });
    }
  }

  // --- INTERSECTION OBSERVER (PAUSE PLAYBACK WHEN SCROLLED OUT OF VIEW) ---
  function setupFeaturedIntersectionObserver() {
    if (!featuredCarouselSection || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const activeFg = document.getElementById(`featuredFgVideo_${currentFeaturedIndex}`);
        if (!activeFg) return;

        if (!entry.isIntersecting) {
          if (!activeFg.paused) {
            activeFg.pause();
          }
        } else {
          // Re-entering viewport resumes active video according to autoplay policy
          if (activeFg.paused && !isCarouselAnimating) {
            activeFg.play().catch(() => {});
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

