/**
 * Latest Viral Videos 2026 - Main Application Logic
 * Production-quality, vanilla JS implementation
 */

(function () {
  'use strict';

  // --- State Management ---
  const state = {
    currentCategory: 'latest',
    searchQuery: '',
    currentVideoId: null,
    isPlaying: false,
    isMuted: false,
    volume: 0.9,
    playbackSpeed: 1,
    currentTime: 0,
    duration: 258,
    isLiked: false,
    likeCountRaw: 184000,
    isSubscribed: false,
    isSaved: false,
    userComments: {} // videoId -> array of comment objects
  };

  // Preset demo comments for video detail
  const DEMO_COMMENTS = [
    { id: 1, user: "Elena Rostova", time: "18 minutes ago", text: "The camera tracking stability on this at 120fps is completely insane. 2026 tech hits different!", likes: 421 },
    { id: 2, user: "Marcus Vance", time: "45 minutes ago", text: "I watched this 5 times in a row. The maneuver through the tunnel at 02:14 gave me chills.", likes: 289 },
    { id: 3, user: "Devon Thorne", time: "2 hours ago", text: "Best single-take drone sequence ever uploaded to the platform.", likes: 164 }
  ];

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

  // Video Player Elements
  const playerContainer = document.getElementById('playerContainer');
  const html5Video = document.getElementById('html5VideoPlayer');
  const playerCanvas = document.getElementById('playerCanvas');
  const playerBigPlay = document.getElementById('playerBigPlay');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const playPauseIcon = document.getElementById('playPauseIcon');
  const btnRewind10 = document.getElementById('btnRewind10');
  const btnForward10 = document.getElementById('btnForward10');
  const btnMuteToggle = document.getElementById('btnMuteToggle');
  const volumeSlider = document.getElementById('volumeSlider');
  const currentTimeDisplay = document.getElementById('currentTimeDisplay');
  const durationDisplay = document.getElementById('durationDisplay');
  const speedSelect = document.getElementById('speedSelect');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const playerProgressBar = document.getElementById('playerProgressBar');
  const progressPlayed = document.getElementById('progressPlayed');
  const progressBuffered = document.getElementById('progressBuffered');

  // Video Info Elements
  const btnBackToHome = document.getElementById('btnBackToHome');
  const detailVideoTitle = document.getElementById('detailVideoTitle');
  const detailChannelAvatar = document.getElementById('detailChannelAvatar');
  const detailChannelName = document.getElementById('detailChannelName');
  const detailChannelSubs = document.getElementById('detailChannelSubs');
  const btnSubscribe = document.getElementById('btnSubscribe');
  const btnLikeVideo = document.getElementById('btnLikeVideo');
  const likeCountDisplay = document.getElementById('likeCountDisplay');
  const btnShareVideo = document.getElementById('btnShareVideo');
  const btnSaveVideo = document.getElementById('btnSaveVideo');
  const detailViewCount = document.getElementById('detailViewCount');
  const detailUploadDate = document.getElementById('detailUploadDate');
  const detailBadge = document.getElementById('detailBadge');
  const detailDescription = document.getElementById('detailDescription');
  const relatedVideoList = document.getElementById('relatedVideoList');
  const commentForm = document.getElementById('commentForm');
  const newCommentInput = document.getElementById('newCommentInput');
  const commentsList = document.getElementById('commentsList');
  const commentsCount = document.getElementById('commentsCount');
  const toastNotice = document.getElementById('toastNotice');

  let canvasAnimationId = null;
  let simulatedTimer = null;

  // ========================================================================
  // 1. AGE GATE CONTROLLER
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
    // Ensure viewport is scrolled smoothly to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // BOTH buttons navigate to the SAME homepage!
  if (btnAgeOver18) btnAgeOver18.addEventListener('click', enterHomepage);
  if (btnAgeUnder18) btnAgeUnder18.addEventListener('click', enterHomepage);

  // If visitor already verified age, ensure gate overlay is hidden
  if (isAgeGatePassed()) {
    ageGateOverlay.classList.add('hidden');
  }

  // ========================================================================
  // 2. VIDEO FILTERING & SORTING LOGIC
  // ========================================================================
  function getSortedVideos() {
    let list = [...DEMO_VIDEOS];

    // Filter by search query if present
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase().trim();
      list = list.filter(v => 
        v.title.toLowerCase().includes(q) || 
        v.channel.name.toLowerCase().includes(q) || 
        v.description.toLowerCase().includes(q) ||
        v.badge.toLowerCase().includes(q)
      );
    }

    // Apply category sort/filter
    switch (state.currentCategory) {
      case 'latest':
        // Sort newest to oldest by timestamp
        list.sort((a, b) => b.timestamp - a.timestamp);
        break;
      case 'trending':
        // Sort by trending score
        list.sort((a, b) => b.trendingScore - a.trendingScore);
        break;
      case 'most-viewed':
        // Sort by total views descending
        list.sort((a, b) => b.viewCountRaw - a.viewCountRaw);
        break;
      case 'new':
        // Filter isNew: true, then newest first
        list = list.filter(v => v.isNew).sort((a, b) => b.timestamp - a.timestamp);
        break;
    }

    return list;
  }

  function updateCategoryCounts() {
    const total = DEMO_VIDEOS.length;
    const newCount = DEMO_VIDEOS.filter(v => v.isNew).length;

    const elLatest = document.getElementById('countLatest');
    const elTrending = document.getElementById('countTrending');
    const elMostViewed = document.getElementById('countMostViewed');
    const elNew = document.getElementById('countNew');

    if (elLatest) elLatest.textContent = `(${total})`;
    if (elTrending) elTrending.textContent = `(${total})`;
    if (elMostViewed) elMostViewed.textContent = `(${total})`;
    if (elNew) elNew.textContent = `(${newCount})`;
  }

  // ========================================================================
  // 3. RENDER HOMEPAGE VIDEO GRID
  // ========================================================================
  function renderVideoGrid() {
    const videos = getSortedVideos();
    videoGrid.innerHTML = '';

    // Update Header Text
    const titles = {
      'latest': { title: 'Latest Videos', subtitle: 'Sorted from newest to oldest' },
      'trending': { title: 'Trending Right Now', subtitle: 'Highest engagement across the platform' },
      'most-viewed': { title: 'Most Viewed All-Time', subtitle: 'Ranked by total historical view counts' },
      'new': { title: 'New Releases', subtitle: 'Fresh viral content published this week' }
    };

    if (state.searchQuery.trim()) {
      feedTitleHeading.textContent = `Search: "${state.searchQuery}"`;
      feedSubtitle.textContent = `Showing matching results`;
    } else {
      feedTitleHeading.textContent = titles[state.currentCategory].title;
      feedSubtitle.textContent = titles[state.currentCategory].subtitle;
    }

    feedCounter.textContent = `Showing ${videos.length} video${videos.length === 1 ? '' : 's'}`;

    if (videos.length === 0) {
      videoGrid.innerHTML = `
        <div class="empty-state">
          <h3 class="empty-state-title">No videos found</h3>
          <p class="empty-state-desc">We couldn't find any videos matching "${state.searchQuery}". Try different keywords or clear the search.</p>
          <button id="btnClearSearchEmpty" class="age-gate-btn" style="max-width: 200px; margin: 0 auto; height: 44px;">
            Clear Search
          </button>
        </div>
      `;
      const btnClear = document.getElementById('btnClearSearchEmpty');
      if (btnClear) {
        btnClear.addEventListener('click', () => {
          state.searchQuery = '';
          desktopSearchInput.value = '';
          modalSearchInput.value = '';
          desktopSearchClear.style.display = 'none';
          renderVideoGrid();
        });
      }
      return;
    }

    // Render Cards in strict sequence
    videos.forEach((video, index) => {
      const card = document.createElement('article');
      card.className = 'video-card';
      card.setAttribute('role', 'article');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${video.title}, ${video.views}, ${video.uploadTime}`);
      card.dataset.id = video.id;

      card.innerHTML = `
        <div class="video-card-thumb-wrapper">
          <img class="video-card-thumb" src="${video.thumbnail}" alt="${video.title}" loading="${index < 4 ? 'eager' : 'lazy'}">
          <span class="video-badge-duration">${video.duration}</span>
          <div class="video-play-overlay" aria-hidden="true">
            <div class="video-play-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 3 20 12 6 21 6 3"/>
              </svg>
            </div>
          </div>
        </div>
        <div class="video-card-info">
          <div class="video-channel-avatar" aria-hidden="true">${video.channel.initials}</div>
          <div class="video-meta-wrapper">
            <h3 class="video-card-title">${video.title}</h3>
            <div class="video-channel-name">
              <span>${video.channel.name}</span>
              ${video.channel.verified ? `
                <svg class="channel-check-icon" viewBox="0 0 24 24" fill="currentColor" aria-label="Verified">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              ` : ''}
            </div>
            <div class="video-stats-row">
              <span>${video.uploadTime}</span>
              <span class="stat-divider">·</span>
              <span>${video.views}</span>
            </div>
          </div>
        </div>
      `;

      // Card Click & Keyboard Navigation
      const openVideo = () => navigateToVideo(video.id);
      card.addEventListener('click', openVideo);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openVideo();
        }
      });

      videoGrid.appendChild(card);
    });
  }

  // ========================================================================
  // 4. NAVIGATION & VIEW CONTROLLER
  // ========================================================================
  function showHomepage() {
    state.currentVideoId = null;
    pauseVideoPlayback();
    
    homepageView.classList.remove('hidden');
    videoDetailView.classList.remove('active');
    
    document.title = "Latest Viral Videos 2026 — Trending & Viral Video Platform";
    window.location.hash = 'home';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function navigateToVideo(id) {
    const video = DEMO_VIDEOS.find(v => v.id === Number(id));
    if (!video) return;

    state.currentVideoId = video.id;
    state.duration = video.durationSec;
    state.currentTime = 0;
    state.isLiked = false;
    state.likeCountRaw = parseInt(video.likes) * 1000 || 184000;
    state.isSubscribed = false;
    state.isSaved = false;

    // Switch Views
    homepageView.classList.add('hidden');
    videoDetailView.classList.add('active');

    // Populate Details
    detailVideoTitle.textContent = video.title;
    detailChannelAvatar.textContent = video.channel.initials;
    detailChannelName.textContent = video.channel.name;
    detailChannelSubs.textContent = `${video.channel.subscribers} subscribers`;
    detailViewCount.textContent = video.views;
    detailUploadDate.textContent = video.uploadTime;
    detailBadge.textContent = video.badge;
    detailDescription.textContent = video.description;
    likeCountDisplay.textContent = video.likes;
    durationDisplay.textContent = video.duration;
    currentTimeDisplay.textContent = "00:00";
    progressPlayed.style.width = "0%";

    // Reset interaction buttons
    btnLikeVideo.classList.remove('active');
    btnSubscribe.classList.remove('subscribed');
    btnSubscribe.textContent = "Subscribe";
    btnSaveVideo.classList.remove('active');

    // Setup Video Player
    loadVideoPlayer(video);

    // Setup Comments
    renderComments(video.id);

    // Setup Related Videos
    renderRelatedVideos(video.id);

    document.title = `${video.title} — Latest Viral Videos 2026`;
    window.location.hash = `video-${video.id}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ========================================================================
  // 5. VIDEO PLAYER LOGIC (HTML5 + CANVAS VISUALIZER FALLBACK)
  // ========================================================================
  function loadVideoPlayer(video) {
    pauseVideoPlayback();

    // Use video canvas simulator for 100% offline & firewall robustness
    playerCanvas.classList.add('active');
    initCanvasVisualizer(video);
    
    // Set poster on video
    html5Video.poster = video.thumbnail;
    playerBigPlay.classList.remove('playing');
    playPauseIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
  }

  function togglePlay() {
    if (state.isPlaying) {
      pauseVideoPlayback();
    } else {
      startVideoPlayback();
    }
  }

  function startVideoPlayback() {
    state.isPlaying = true;
    playerBigPlay.classList.add('playing');
    playPauseIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;

    if (!simulatedTimer) {
      simulatedTimer = setInterval(() => {
        if (!state.isPlaying) return;
        state.currentTime += 1 * state.playbackSpeed;
        if (state.currentTime >= state.duration) {
          state.currentTime = 0;
        }
        updateTimeDisplays();
      }, 1000);
    }
  }

  function pauseVideoPlayback() {
    state.isPlaying = false;
    playerBigPlay.classList.remove('playing');
    playPauseIcon.innerHTML = `<polygon points="5 3 19 12 5 21 6 3"/>`;

    if (simulatedTimer) {
      clearInterval(simulatedTimer);
      simulatedTimer = null;
    }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function updateTimeDisplays() {
    currentTimeDisplay.textContent = formatTime(state.currentTime);
    const pct = Math.min(100, (state.currentTime / state.duration) * 100);
    progressPlayed.style.width = `${pct}%`;
  }

  // Canvas Cinematic Visualizer Engine
  function initCanvasVisualizer(video) {
    if (canvasAnimationId) {
      cancelAnimationFrame(canvasAnimationId);
    }

    const ctx = playerCanvas.getContext('2d');
    let width = (playerCanvas.width = playerContainer.clientWidth || 800);
    let height = (playerCanvas.height = playerContainer.clientHeight || 450);

    const particles = [];
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        size: Math.random() * 3 + 1,
        color: video.accentColor
      });
    }

    let frame = 0;

    function renderFrame() {
      if (playerCanvas.width !== playerContainer.clientWidth && playerContainer.clientWidth > 0) {
        width = playerCanvas.width = playerContainer.clientWidth;
        height = playerCanvas.height = playerContainer.clientHeight;
      }

      ctx.clearRect(0, 0, width, height);

      // Gradient background
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, video.gradient[0]);
      grad.addColorStop(0.5, video.gradient[1]);
      grad.addColorStop(1, video.gradient[2]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Ambient audio visualizer waveforms
      const bars = 48;
      const barWidth = width / bars;
      const audioPulse = state.isPlaying ? Math.sin(frame * 0.08) * 15 + 25 : 12;

      for (let i = 0; i < bars; i++) {
        const heightMultiplier = Math.sin(i * 0.2 + frame * 0.05) * 0.5 + 0.5;
        const bHeight = heightMultiplier * audioPulse * 3;
        const x = i * barWidth;
        const y = height / 2 - bHeight / 2;

        ctx.fillStyle = video.accentColor;
        ctx.globalAlpha = 0.25;
        ctx.fillRect(x + 2, y, barWidth - 4, bHeight);
      }
      ctx.globalAlpha = 1.0;

      // Particle simulation
      particles.forEach(p => {
        if (state.isPlaying) {
          p.x += p.vx * state.playbackSpeed;
          p.y += p.vy * state.playbackSpeed;
        }
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Telemetry HUD overlay
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.font = "11px monospace";
      ctx.fillText(`PLAYBACK: ${state.isPlaying ? "STREAMING [LIVE 120FPS]" : "PAUSED"}`, 24, 34);
      ctx.fillText(`CODEC: AV1 8K ULTRA-HDR`, 24, 52);
      ctx.fillText(`BITRATE: 48.6 MB/S · AUDIO: 32-BIT LOSSLESS`, 24, 70);

      frame++;
      canvasAnimationId = requestAnimationFrame(renderFrame);
    }

    renderFrame();
  }

  // Scrubber Seek interaction
  playerProgressBar.addEventListener('click', (e) => {
    const rect = playerProgressBar.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    state.currentTime = pos * state.duration;
    updateTimeDisplays();
  });

  // Play/Pause buttons
  playerBigPlay.addEventListener('click', togglePlay);
  btnPlayPause.addEventListener('click', togglePlay);

  // Skip Rewind / Forward
  btnRewind10.addEventListener('click', () => {
    state.currentTime = Math.max(0, state.currentTime - 10);
    updateTimeDisplays();
  });

  btnForward10.addEventListener('click', () => {
    state.currentTime = Math.min(state.duration, state.currentTime + 10);
    updateTimeDisplays();
  });

  // Volume slider & mute
  btnMuteToggle.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    volumeSlider.value = state.isMuted ? 0 : state.volume;
    updateVolumeIcon();
  });

  volumeSlider.addEventListener('input', (e) => {
    state.volume = parseFloat(e.target.value);
    state.isMuted = state.volume === 0;
    updateVolumeIcon();
  });

  function updateVolumeIcon() {
    const volumeIcon = document.getElementById('volumeIcon');
    if (state.isMuted || state.volume === 0) {
      volumeIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
    } else {
      volumeIcon.innerHTML = `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
    }
  }

  // Speed selector
  speedSelect.addEventListener('change', (e) => {
    state.playbackSpeed = parseFloat(e.target.value);
  });

  // Fullscreen toggle
  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      if (playerContainer.requestFullscreen) {
        playerContainer.requestFullscreen();
      } else if (playerContainer.webkitRequestFullscreen) {
        playerContainer.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  });

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Only if not typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space') {
      if (videoDetailView.classList.contains('active')) {
        e.preventDefault();
        togglePlay();
      }
    } else if (e.code === 'ArrowLeft') {
      if (videoDetailView.classList.contains('active')) {
        e.preventDefault();
        state.currentTime = Math.max(0, state.currentTime - 5);
        updateTimeDisplays();
      }
    } else if (e.code === 'ArrowRight') {
      if (videoDetailView.classList.contains('active')) {
        e.preventDefault();
        state.currentTime = Math.min(state.duration, state.currentTime + 5);
        updateTimeDisplays();
      }
    } else if (e.key === 'm' || e.key === 'M') {
      if (videoDetailView.classList.contains('active')) {
        state.isMuted = !state.isMuted;
        volumeSlider.value = state.isMuted ? 0 : state.volume;
        updateVolumeIcon();
      }
    } else if (e.key === 'Escape') {
      closeMobileDrawer();
      closeSearchModal();
    }
  });

  // ========================================================================
  // 6. VIDEO DETAIL ACTIONS (LIKE, SUBSCRIBE, SHARE, COMMENTS)
  // ========================================================================
  btnLikeVideo.addEventListener('click', () => {
    state.isLiked = !state.isLiked;
    if (state.isLiked) {
      btnLikeVideo.classList.add('active');
      likeCountDisplay.textContent = `${((state.likeCountRaw + 1) / 1000).toFixed(0)}K`;
      showToast("Added to Liked Videos");
    } else {
      btnLikeVideo.classList.remove('active');
      likeCountDisplay.textContent = `${(state.likeCountRaw / 1000).toFixed(0)}K`;
    }
  });

  btnSubscribe.addEventListener('click', () => {
    state.isSubscribed = !state.isSubscribed;
    if (state.isSubscribed) {
      btnSubscribe.classList.add('subscribed');
      btnSubscribe.textContent = "Subscribed";
      showToast("Subscribed to channel");
    } else {
      btnSubscribe.classList.remove('subscribed');
      btnSubscribe.textContent = "Subscribe";
    }
  });

  btnSaveVideo.addEventListener('click', () => {
    state.isSaved = !state.isSaved;
    if (state.isSaved) {
      btnSaveVideo.classList.add('active');
      showToast("Saved to Watch Later");
    } else {
      btnSaveVideo.classList.remove('active');
    }
  });

  btnShareVideo.addEventListener('click', () => {
    const shareUrl = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast("Link copied to clipboard!");
      }).catch(() => {
        showToast("Link ready to share!");
      });
    } else {
      showToast("Link ready to share!");
    }
  });

  function showToast(msg) {
    toastNotice.textContent = msg;
    toastNotice.classList.add('show');
    setTimeout(() => {
      toastNotice.classList.remove('show');
    }, 2400);
  }

  // Comments Controller
  function renderComments(videoId) {
    if (!state.userComments[videoId]) {
      state.userComments[videoId] = [...DEMO_COMMENTS];
    }
    const list = state.userComments[videoId];
    commentsCount.textContent = `(${list.length})`;
    commentsList.innerHTML = '';

    list.forEach(c => {
      const item = document.createElement('div');
      item.className = 'comment-item';
      item.innerHTML = `
        <div class="comment-avatar">${c.user.substring(0, 2).toUpperCase()}</div>
        <div class="comment-body">
          <div class="comment-user-row">
            <span class="comment-username">${c.user}</span>
            <span class="comment-time">${c.time}</span>
          </div>
          <p class="comment-message">${c.text}</p>
        </div>
      `;
      commentsList.appendChild(item);
    });
  }

  commentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = newCommentInput.value.trim();
    if (!text || !state.currentVideoId) return;

    if (!state.userComments[state.currentVideoId]) {
      state.userComments[state.currentVideoId] = [...DEMO_COMMENTS];
    }

    state.userComments[state.currentVideoId].unshift({
      id: Date.now(),
      user: "You",
      time: "Just now",
      text: text,
      likes: 0
    });

    newCommentInput.value = '';
    renderComments(state.currentVideoId);
    showToast("Comment posted");
  });

  // Related Videos Feed
  function renderRelatedVideos(currentId) {
    const related = DEMO_VIDEOS.filter(v => v.id !== Number(currentId));
    relatedVideoList.innerHTML = '';

    related.forEach(video => {
      const card = document.createElement('div');
      card.className = 'related-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML = `
        <div class="related-thumb-box">
          <img class="related-thumb" src="${video.thumbnail}" alt="${video.title}" loading="lazy">
          <span class="related-duration">${video.duration}</span>
        </div>
        <div class="related-info">
          <h4 class="related-video-title">${video.title}</h4>
          <div class="related-channel">${video.channel.name}</div>
          <div class="related-meta">${video.views} · ${video.uploadTime}</div>
        </div>
      `;

      const playRelated = () => {
        navigateToVideo(video.id);
        startVideoPlayback();
      };
      card.addEventListener('click', playRelated);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          playRelated();
        }
      });

      relatedVideoList.appendChild(card);
    });
  }

  btnBackToHome.addEventListener('click', showHomepage);
  siteBrand.addEventListener('click', (e) => {
    e.preventDefault();
    state.searchQuery = '';
    desktopSearchInput.value = '';
    modalSearchInput.value = '';
    desktopSearchClear.style.display = 'none';
    state.currentCategory = 'latest';
    updateActiveCategoryPill();
    renderVideoGrid();
    showHomepage();
  });

  // ========================================================================
  // 7. CATEGORY PILL SELECTION & ROUTING
  // ========================================================================
  function updateActiveCategoryPill() {
    categoryPills.forEach(pill => {
      if (pill.dataset.category === state.currentCategory) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  categoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      state.currentCategory = pill.dataset.category;
      updateActiveCategoryPill();
      if (videoDetailView.classList.contains('active')) {
        showHomepage();
      }
      renderVideoGrid();
    });
  });

  // ========================================================================
  // 8. SEARCH FUNCTIONALITY
  // ========================================================================
  function handleSearch(query) {
    state.searchQuery = query;
    if (query.trim()) {
      desktopSearchClear.style.display = 'flex';
    } else {
      desktopSearchClear.style.display = 'none';
    }
    if (videoDetailView.classList.contains('active')) {
      showHomepage();
    }
    renderVideoGrid();
  }

  desktopSearchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
  });

  desktopSearchClear.addEventListener('click', () => {
    desktopSearchInput.value = '';
    handleSearch('');
    desktopSearchInput.focus();
  });

  modalSearchInput.addEventListener('input', (e) => {
    handleSearch(e.target.value);
  });

  mobileSearchTrigger.addEventListener('click', () => {
    searchModal.classList.add('active');
    modalSearchInput.value = state.searchQuery;
    setTimeout(() => modalSearchInput.focus(), 100);
  });

  function closeSearchModal() {
    searchModal.classList.remove('active');
  }

  btnCloseSearchModal.addEventListener('click', closeSearchModal);

  // ========================================================================
  // 9. MOBILE DRAWER NAVIGATION
  // ========================================================================
  function openMobileDrawer() {
    drawerBackdrop.classList.add('active');
  }

  function closeMobileDrawer() {
    drawerBackdrop.classList.remove('active');
  }

  mobileMenuTrigger.addEventListener('click', openMobileDrawer);
  btnCloseDrawer.addEventListener('click', closeMobileDrawer);
  drawerBackdrop.addEventListener('click', (e) => {
    if (e.target === drawerBackdrop) closeMobileDrawer();
  });

  document.getElementById('drawerLinkHome').addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileDrawer();
    state.currentCategory = 'latest';
    updateActiveCategoryPill();
    renderVideoGrid();
    showHomepage();
  });

  document.getElementById('drawerLinkLatest').addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileDrawer();
    state.currentCategory = 'latest';
    updateActiveCategoryPill();
    renderVideoGrid();
    showHomepage();
  });

  document.getElementById('drawerLinkTrending').addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileDrawer();
    state.currentCategory = 'trending';
    updateActiveCategoryPill();
    renderVideoGrid();
    showHomepage();
  });

  document.getElementById('drawerLinkMostViewed').addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileDrawer();
    state.currentCategory = 'most-viewed';
    updateActiveCategoryPill();
    renderVideoGrid();
    showHomepage();
  });

  document.getElementById('drawerLinkNew').addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileDrawer();
    state.currentCategory = 'new';
    updateActiveCategoryPill();
    renderVideoGrid();
    showHomepage();
  });

  // Top Nav links
  const navLinkHome = document.getElementById('navLinkHome');
  const navLinkTrending = document.getElementById('navLinkTrending');

  if (navLinkHome) {
    navLinkHome.addEventListener('click', (e) => {
      e.preventDefault();
      state.currentCategory = 'latest';
      updateActiveCategoryPill();
      renderVideoGrid();
      showHomepage();
    });
  }

  if (navLinkTrending) {
    navLinkTrending.addEventListener('click', (e) => {
      e.preventDefault();
      state.currentCategory = 'trending';
      updateActiveCategoryPill();
      renderVideoGrid();
      showHomepage();
    });
  }

  // Hash change detection (back/forward browser buttons)
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash.startsWith('#video-')) {
      const id = hash.replace('#video-', '');
      if (state.currentVideoId !== Number(id)) {
        navigateToVideo(id);
      }
    } else {
      if (state.currentVideoId !== null) {
        showHomepage();
      }
    }
  });

  // ========================================================================
  // 10. INITIALIZATION
  // ========================================================================
  function init() {
    updateCategoryCounts();
    renderVideoGrid();

    // Check URL Hash on load
    const hash = window.location.hash;
    if (hash.startsWith('#video-')) {
      const id = hash.replace('#video-', '');
      navigateToVideo(id);
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
