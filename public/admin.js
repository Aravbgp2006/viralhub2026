/**
 * public/admin.js
 * Admin Dashboard CMS Controller for ViralHub
 */

(function () {
  'use strict';

  // --- State ---
  let allVideos = [];
  let videoToDelete = null;

  // --- DOM Elements ---
  const statTotalVideos = document.getElementById('statTotalVideos');
  const statPublishedVideos = document.getElementById('statPublishedVideos');
  const statUnpublishedVideos = document.getElementById('statUnpublishedVideos');
  const statTotalViews = document.getElementById('statTotalViews');

  const adminSearchInput = document.getElementById('adminSearchInput');
  const filterCategory = document.getElementById('filterCategory');
  const filterStatus = document.getElementById('filterStatus');
  const adminTableBody = document.getElementById('adminTableBody');
  const adminCardsContainer = document.getElementById('adminCardsContainer');

  const btnAdminLogout = document.getElementById('btnAdminLogout');
  const btnOpenAddModal = document.getElementById('btnOpenAddModal');
  const addVideoModal = document.getElementById('addVideoModal');
  const btnCloseAddModal = document.getElementById('btnCloseAddModal');
  const btnCancelAdd = document.getElementById('btnCancelAdd');
  const addVideoForm = document.getElementById('addVideoForm');
  const addErrorBanner = document.getElementById('addErrorBanner');
  const btnSubmitAdd = document.getElementById('btnSubmitAdd');

  const addThumbnail = document.getElementById('addThumbnail');
  const thumbSelectedName = document.getElementById('thumbSelectedName');
  const addVideoFile = document.getElementById('addVideoFile');
  const videoSelectedName = document.getElementById('videoSelectedName');

  let addVideoDurationSeconds = null;
  let editVideoDurationSeconds = null;

  function formatDuration(seconds) {
    const sec = Math.round(Number(seconds) || 0);
    if (sec <= 0) return '00:00';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const remainingSecs = sec % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  }

  function extractVideoDuration(file) {
    return new Promise((resolve) => {
      try {
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        const objectUrl = URL.createObjectURL(file);
        tempVideo.src = objectUrl;

        let resolved = false;
        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            try {
              URL.revokeObjectURL(objectUrl);
              tempVideo.removeAttribute('src');
              tempVideo.load();
            } catch (_) {}
          }
        };

        tempVideo.onloadedmetadata = () => {
          const duration = tempVideo.duration;
          cleanup();
          if (isFinite(duration) && duration > 0) {
            resolve(Math.round(duration));
          } else {
            resolve(null);
          }
        };

        tempVideo.onerror = () => {
          cleanup();
          resolve(null);
        };

        setTimeout(() => {
          cleanup();
          resolve(null);
        }, 5000);
      } catch (e) {
        resolve(null);
      }
    });
  }

  const editVideoModal = document.getElementById('editVideoModal');
  const btnCloseEditModal = document.getElementById('btnCloseEditModal');
  const btnCancelEdit = document.getElementById('btnCancelEdit');
  const editVideoForm = document.getElementById('editVideoForm');
  const editErrorBanner = document.getElementById('editErrorBanner');
  const btnSubmitEdit = document.getElementById('btnSubmitEdit');
  const editThumbnail = document.getElementById('editThumbnail');
  const editThumbSelectedName = document.getElementById('editThumbSelectedName');
  const editVideoFile = document.getElementById('editVideoFile');
  const editVideoSelectedName = document.getElementById('editVideoSelectedName');
  const editUploadProgressContainer = document.getElementById('editUploadProgressContainer');
  const editUploadProgressBar = document.getElementById('editUploadProgressBar');
  const editUploadProgressPercent = document.getElementById('editUploadProgressPercent');
  const editUploadProgressLabel = document.getElementById('editUploadProgressLabel');
  const btnSubmitEditText = document.getElementById('btnSubmitEditText');

  // --- Thumbnail Aspect Ratio & Crop Editor Elements ---
  const addThumbPreviewCard = document.getElementById('addThumbPreviewCard');
  const addPreviewAspectContainer = document.getElementById('addPreviewAspectContainer');
  const addThumbPreviewImg = document.getElementById('addThumbPreviewImg');
  const addPreviewBadge = document.getElementById('addPreviewBadge');
  const btnReCropAdd = document.getElementById('btnReCropAdd');

  const editThumbPreviewCard = document.getElementById('editThumbPreviewCard');
  const editPreviewAspectContainer = document.getElementById('editPreviewAspectContainer');
  const editThumbPreviewImg = document.getElementById('editThumbPreviewImg');
  const editPreviewBadge = document.getElementById('editPreviewBadge');
  const btnReCropEdit = document.getElementById('btnReCropEdit');

  const thumbEditorModal = document.getElementById('thumbEditorModal');
  const btnCloseThumbEditor = document.getElementById('btnCloseThumbEditor');
  const btnCancelThumbEditor = document.getElementById('btnCancelThumbEditor');
  const btnResetThumbEditor = document.getElementById('btnResetThumbEditor');
  const btnSaveThumbEditor = document.getElementById('btnSaveThumbEditor');
  const editorActiveFormatLabel = document.getElementById('editorActiveFormatLabel');
  const thumbCropViewport = document.getElementById('thumbCropViewport');
  const thumbCropFrame = document.getElementById('thumbCropFrame');
  const thumbEditorCanvas = document.getElementById('thumbEditorCanvas');
  const thumbZoomSlider = document.getElementById('thumbZoomSlider');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnZoomIn = document.getElementById('btnZoomIn');
  const zoomValueText = document.getElementById('zoomValueText');

  // --- Crop Editor State ---
  let currentCropContext = 'add'; // 'add' or 'edit'
  let cropSourceImage = null; // HTMLImageElement
  let cropSourceFile = null;  // File
  let cropTargetRatio = '16:9'; // '16:9' or '9:16'
  let cropZoom = 1.0;
  let cropPanX = 0;
  let cropPanY = 0;
  let isCropDragging = false;
  let cropDragStartX = 0;
  let cropDragStartY = 0;
  let cropDragInitialPanX = 0;
  let cropDragInitialPanY = 0;
  let cropTouchInitialDistance = null;
  let cropTouchInitialZoom = 1.0;

  let activeAddThumbFile = null;
  let activeAddThumbDataUrl = null;
  let activeEditThumbFile = null;
  let activeEditThumbDataUrl = null;
  let isBlobEnabled = false;
  let isProductionEnv = false;
  let currentBlobAccess = 'private'; // Default to private per project config

  async function checkBlobStatus() {
    try {
      const res = await fetch('/api/blob/status');
      if (res.ok) {
        const data = await res.json();
        const vercelBlobLib = (typeof window !== 'undefined' && window.VercelBlob) || (typeof VercelBlob !== 'undefined' ? VercelBlob : null);
        if (typeof window !== 'undefined' && !window.VercelBlob && vercelBlobLib) {
          window.VercelBlob = vercelBlobLib;
        }
        isBlobEnabled = Boolean(data.enabled && vercelBlobLib && typeof vercelBlobLib.upload === 'function');
        isProductionEnv = Boolean(data.isProduction || data.isServerless || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'));
        if (data.access) {
          currentBlobAccess = data.access;
        }
      }
    } catch (e) {
      isBlobEnabled = false;
    }
    return isBlobEnabled;
  }

  async function uploadDirectToBlob(file, prefix, onProgress) {
    const vercelBlobLib = (typeof window !== 'undefined' && window.VercelBlob) || (typeof VercelBlob !== 'undefined' ? VercelBlob : null);
    if (!vercelBlobLib || typeof vercelBlobLib.upload !== 'function') {
      throw new Error('Vercel Blob client library is not loaded');
    }
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const pathname = `${prefix}/${Date.now()}-${cleanName}`;
    const isLarge = file.size > 5 * 1024 * 1024; // >5MB use multipart

    const doUpload = async (accessMode) => {
      return await vercelBlobLib.upload(pathname, file, {
        access: accessMode,
        handleUploadUrl: '/api/blob/upload',
        multipart: isLarge ? true : undefined,
        onUploadProgress: (progress) => {
          if (typeof onProgress === 'function') {
            const pct = Math.min(100, Math.round(progress.percentage !== undefined ? progress.percentage : (progress.loaded / progress.total) * 100));
            onProgress(pct);
          }
        }
      });
    };

    try {
      return await doUpload(currentBlobAccess || 'private');
    } catch (err) {
      const errMsg = (err.message || '').toLowerCase();
      if (errMsg.includes('access') || errMsg.includes('private') || errMsg.includes('public')) {
        const altAccess = (currentBlobAccess === 'private') ? 'public' : 'private';
        console.warn(`Upload with ${currentBlobAccess} failed (${err.message}), retrying with ${altAccess}...`);
        return await doUpload(altAccess);
      }
      throw err;
    }
  }

  const deleteVideoModal = document.getElementById('deleteVideoModal');
  const btnCloseDeleteModal = document.getElementById('btnCloseDeleteModal');
  const btnCancelDelete = document.getElementById('btnCancelDelete');
  const btnConfirmDelete = document.getElementById('btnConfirmDelete');
  const deleteVideoTitlePrompt = document.getElementById('deleteVideoTitlePrompt');

  const adminToast = document.getElementById('adminToast');

  // ========================================================================
  // 1. VIEW COUNT SHORTHAND PARSER
  // ========================================================================
  function parseViewCount(input, allowEmpty = true) {
    if (input === undefined || input === null) {
      if (allowEmpty) return 0;
      throw new Error('View count is required.');
    }

    const str = String(input).trim();
    if (str === '') {
      if (allowEmpty) return 0;
      throw new Error('View count cannot be empty.');
    }

    if (str.startsWith('-')) {
      throw new Error('View count cannot be negative.');
    }

    // Shorthand K / k (e.g. 2K, 3.4k, 750K)
    const kMatch = str.match(/^(\d+(?:\.\d+)?)\s*[kK]$/);
    if (kMatch) {
      const val = parseFloat(kMatch[1]);
      if (isNaN(val) || val < 0) throw new Error('Invalid view count value.');
      return Math.round(val * 1000);
    }

    // Shorthand M / m (e.g. 2M, 3.4m, 1.5M)
    const mMatch = str.match(/^(\d+(?:\.\d+)?)\s*[mM]$/);
    if (mMatch) {
      const val = parseFloat(mMatch[1]);
      if (isNaN(val) || val < 0) throw new Error('Invalid view count value.');
      return Math.round(val * 1000000);
    }

    // Plain number (accepts digits, optional standard thousands commas)
    const cleanNumber = str.replace(/,/g, '');
    if (/^\d+$/.test(cleanNumber)) {
      const val = parseInt(cleanNumber, 10);
      if (isNaN(val) || val < 0) throw new Error('Invalid view count value.');
      return val;
    }

    throw new Error(`Invalid view count "${str}". Enter a number (e.g. 1000) or shorthand (e.g. 2K, 3.4M).`);
  }

  // ========================================================================
  // 2. AUTHENTICATION CHECK
  // ========================================================================
  async function checkAuth() {
    try {
      const res = await fetch('/api/admin/check-auth');
      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        window.location.href = '/admin/login';
      }
    } catch (err) {
      console.error('Auth verification failed:', err);
      window.location.href = '/admin/login';
    }
  }

  // ========================================================================
  // 2. LOAD DATA (STATS & VIDEOS)
  // ========================================================================
  async function loadDashboardData() {
    try {
      const [statsRes, videosRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/videos')
      ]);

      if (statsRes.status === 401 || videosRes.status === 401) {
        window.location.href = '/admin/login';
        return;
      }

      if (statsRes.ok) {
        const stats = await statsRes.json();
        statTotalVideos.textContent = stats.totalVideos || 0;
        statPublishedVideos.textContent = stats.publishedVideos || 0;
        statUnpublishedVideos.textContent = stats.unpublishedVideos || 0;
        statTotalViews.textContent = Number(stats.totalViews || 0).toLocaleString();
      }

      if (videosRes.ok) {
        allVideos = await videosRes.json();
        renderFilteredVideos();
      }

      await loadSubscriptionsData();
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      showToast('Error connecting to database');
    }
  }

  // ========================================================================
  // 2b. LOAD CUSTOMER SUBSCRIPTIONS
  // ========================================================================
  async function loadSubscriptionsData() {
    const statTotalSubs = document.getElementById('statTotalSubs');
    const statActiveSubs = document.getElementById('statActiveSubs');
    const statInactiveSubs = document.getElementById('statInactiveSubs');
    const statSubsMRR = document.getElementById('statSubsMRR');
    const subscriptionsTableBody = document.getElementById('subscriptionsTableBody');

    if (!subscriptionsTableBody) return;

    try {
      const res = await fetch('/api/admin/subscriptions');
      if (!res.ok) return;
      const data = await res.json();
      const summary = data.summary || {};
      const subs = data.subscriptions || [];

      if (statTotalSubs) statTotalSubs.textContent = summary.total || 0;
      if (statActiveSubs) statActiveSubs.textContent = summary.active || 0;
      if (statInactiveSubs) statInactiveSubs.textContent = (summary.cancelled || 0) + (summary.expired || 0);
      if (statSubsMRR) statSubsMRR.textContent = `₹${(summary.mrr || 0).toLocaleString()}`;

      subscriptionsTableBody.innerHTML = '';
      if (subs.length === 0) {
        subscriptionsTableBody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 36px;">
              No customer subscriptions yet. Active subscriptions created via Razorpay will be listed here automatically.
            </td>
          </tr>
        `;
        return;
      }

      subs.forEach(s => {
        const tr = document.createElement('tr');
        const statusClass = s.status === 'active' ? 'status-active' : (s.status === 'cancelled' || s.status === 'expired' ? 'status-cancelled' : 'status-created');
        const periodEnd = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : 'N/A';
        const createdDate = s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Recent';

        tr.innerHTML = `
          <td>
            <div style="font-weight: 600;">${s.customer_email || s.user_id || 'Subscriber'}</div>
            ${s.customer_phone ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${s.customer_phone}</div>` : ''}
          </td>
          <td><code style="font-size: 0.8125rem;">${s.razorpay_subscription_id || 'N/A'}</code></td>
          <td><code style="font-size: 0.8125rem; color: var(--text-muted);">${s.razorpay_payment_id || 'Pending'}</code></td>
          <td><span class="status-badge ${statusClass}">${(s.status || 'created').toUpperCase()}</span></td>
          <td style="font-size: 0.8125rem;">${periodEnd}</td>
          <td style="font-size: 0.8125rem; color: var(--text-muted);">${createdDate}</td>
        `;
        subscriptionsTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error('Error loading subscriptions data:', err);
    }
  }

  // ========================================================================
  // 2c. THUMBNAIL FIT & CROP EDITOR ENGINE (Canvas + Dual-Layer Blur)
  // ========================================================================
  function getSelectedFormat(context) {
    const radioName = context === 'add' ? 'addThumbFormat' : 'editThumbFormat';
    const checked = document.querySelector(`input[name="${radioName}"]:checked`);
    return checked ? checked.value : '16:9';
  }

  function setZoom(val) {
    cropZoom = Math.max(0.3, Math.min(3.0, Math.round(val * 100) / 100));
    if (thumbZoomSlider) thumbZoomSlider.value = cropZoom;
    if (zoomValueText) zoomValueText.textContent = `${Math.round(cropZoom * 100)}%`;
    renderThumbnailCanvas();
  }

  function renderThumbnailCanvas() {
    if (!thumbEditorCanvas) return;
    const isPortrait = cropTargetRatio === '9:16';
    const targetW = isPortrait ? 720 : 1280;
    const targetH = isPortrait ? 1280 : 720;

    if (thumbEditorCanvas.width !== targetW || thumbEditorCanvas.height !== targetH) {
      thumbEditorCanvas.width = targetW;
      thumbEditorCanvas.height = targetH;
    }

    if (thumbCropFrame) {
      thumbCropFrame.className = `thumb-crop-frame ${isPortrait ? 'aspect-9-16' : 'aspect-16-9'}`;
    }
    if (editorActiveFormatLabel) {
      editorActiveFormatLabel.textContent = `Format: ${isPortrait ? '9:16 Portrait' : '16:9 Landscape'}`;
    }

    const ctx = thumbEditorCanvas.getContext('2d');
    ctx.clearRect(0, 0, targetW, targetH);

    if (!cropSourceImage || !cropSourceImage.complete || !cropSourceImage.naturalWidth) {
      return;
    }

    const imgW = cropSourceImage.naturalWidth;
    const imgH = cropSourceImage.naturalHeight;

    // Base "fit" scale where image fits inside target canvas without distortion
    const baseFitScale = Math.min(targetW / imgW, targetH / imgH);
    const currentW = imgW * baseFitScale * cropZoom;
    const currentH = imgH * baseFitScale * cropZoom;

    const fgX = (targetW - currentW) / 2 + cropPanX;
    const fgY = (targetH - currentH) / 2 + cropPanY;

    // Check if foreground fully covers canvas without leaving gaps
    const isFullyCovered = (fgX <= 0 && fgY <= 0 && (fgX + currentW) >= targetW && (fgY + currentH) >= targetH);

    // LAYER 1: Strongly blurred, slightly darkened enlarged background from SAME image
    const coverScale = Math.max(targetW / imgW, targetH / imgH) * 1.25;
    const bgW = imgW * coverScale;
    const bgH = imgH * coverScale;
    const bgX = (targetW - bgW) / 2;
    const bgY = (targetH - bgH) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, targetW, targetH);
    ctx.clip();

    ctx.filter = 'blur(42px) brightness(0.68)';
    ctx.drawImage(cropSourceImage, bgX, bgY, bgW, bgH);

    // Reset filter & apply dark overlay tint for contrast
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.restore();

    // LAYER 2: Sharp foreground image
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, targetW, targetH);
    ctx.clip();

    if (!isFullyCovered) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
    }

    ctx.drawImage(cropSourceImage, fgX, fgY, currentW, currentH);
    ctx.restore();
  }

  function openThumbEditorModal(context, ratio) {
    currentCropContext = context;
    cropTargetRatio = ratio || getSelectedFormat(context);
    cropZoom = 1.0;
    cropPanX = 0;
    cropPanY = 0;
    if (thumbZoomSlider) thumbZoomSlider.value = 1.0;
    if (zoomValueText) zoomValueText.textContent = '100%';
    renderThumbnailCanvas();
    if (thumbEditorModal) thumbEditorModal.classList.add('active');
  }

  function closeThumbEditor() {
    if (thumbEditorModal) thumbEditorModal.classList.remove('active');
  }

  function openThumbEditorWithFile(file, context) {
    if (!file) return;
    cropSourceFile = file;
    currentCropContext = context;
    const format = getSelectedFormat(context);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        cropSourceImage = img;
        openThumbEditorModal(context, format);
      };
      img.onerror = () => {
        showToast('Could not load image for crop editor.');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Crop Frame Drag & Wheel Interactions
  if (thumbCropFrame) {
    thumbCropFrame.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isCropDragging = true;
      cropDragStartX = e.clientX;
      cropDragStartY = e.clientY;
      cropDragInitialPanX = cropPanX;
      cropDragInitialPanY = cropPanY;
      thumbCropFrame.classList.add('dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (!isCropDragging || !thumbCropFrame) return;
      const rect = thumbCropFrame.getBoundingClientRect();
      const targetW = cropTargetRatio === '9:16' ? 720 : 1280;
      const scaleFactor = targetW / (rect.width || 1);
      cropPanX = cropDragInitialPanX + (e.clientX - cropDragStartX) * scaleFactor;
      cropPanY = cropDragInitialPanY + (e.clientY - cropDragStartY) * scaleFactor;
      renderThumbnailCanvas();
    });

    window.addEventListener('mouseup', () => {
      if (isCropDragging) {
        isCropDragging = false;
        if (thumbCropFrame) thumbCropFrame.classList.remove('dragging');
      }
    });

    thumbCropFrame.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      setZoom(cropZoom + delta);
    }, { passive: false });

    // Touch Support for Mobile
    thumbCropFrame.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isCropDragging = true;
        cropDragStartX = e.touches[0].clientX;
        cropDragStartY = e.touches[0].clientY;
        cropDragInitialPanX = cropPanX;
        cropDragInitialPanY = cropPanY;
        thumbCropFrame.classList.add('dragging');
      } else if (e.touches.length === 2) {
        isCropDragging = false;
        cropTouchInitialDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        cropTouchInitialZoom = cropZoom;
      }
    }, { passive: true });

    thumbCropFrame.addEventListener('touchmove', (e) => {
      if (isCropDragging && e.touches.length === 1) {
        e.preventDefault();
        const rect = thumbCropFrame.getBoundingClientRect();
        const targetW = cropTargetRatio === '9:16' ? 720 : 1280;
        const scaleFactor = targetW / (rect.width || 1);
        cropPanX = cropDragInitialPanX + (e.touches[0].clientX - cropDragStartX) * scaleFactor;
        cropPanY = cropDragInitialPanY + (e.touches[0].clientY - cropDragStartY) * scaleFactor;
        renderThumbnailCanvas();
      } else if (e.touches.length === 2 && cropTouchInitialDistance) {
        e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const ratio = dist / cropTouchInitialDistance;
        setZoom(cropTouchInitialZoom * ratio);
      }
    }, { passive: false });

    thumbCropFrame.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        isCropDragging = false;
        cropTouchInitialDistance = null;
        if (thumbCropFrame) thumbCropFrame.classList.remove('dragging');
      } else if (e.touches.length === 1) {
        isCropDragging = true;
        cropDragStartX = e.touches[0].clientX;
        cropDragStartY = e.touches[0].clientY;
        cropDragInitialPanX = cropPanX;
        cropDragInitialPanY = cropPanY;
        cropTouchInitialDistance = null;
      }
    }, { passive: true });
  }

  if (thumbZoomSlider) {
    thumbZoomSlider.addEventListener('input', (e) => setZoom(parseFloat(e.target.value)));
  }
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => setZoom(cropZoom + 0.1));
  }
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => setZoom(cropZoom - 0.1));
  }
  if (btnResetThumbEditor) {
    btnResetThumbEditor.addEventListener('click', () => {
      cropZoom = 1.0;
      cropPanX = 0;
      cropPanY = 0;
      setZoom(1.0);
    });
  }
  if (btnCloseThumbEditor) btnCloseThumbEditor.addEventListener('click', closeThumbEditor);
  if (btnCancelThumbEditor) btnCancelThumbEditor.addEventListener('click', closeThumbEditor);

  // Save Thumbnail from Canvas to JPEG File
  if (btnSaveThumbEditor) {
    btnSaveThumbEditor.addEventListener('click', () => {
      if (!thumbEditorCanvas) return;
      thumbEditorCanvas.toBlob((blob) => {
        if (!blob) {
          showToast('Failed to generate thumbnail image.');
          return;
        }

        const fileName = `thumb-${Date.now()}-${cropTargetRatio.replace(':', 'x')}.jpg`;
        const croppedFile = new File([blob], fileName, { type: 'image/jpeg' });
        const previewUrl = URL.createObjectURL(blob);

        if (currentCropContext === 'add') {
          activeAddThumbFile = croppedFile;
          activeAddThumbDataUrl = previewUrl;
          if (addThumbPreviewImg) addThumbPreviewImg.src = previewUrl;
          if (addPreviewAspectContainer) {
            addPreviewAspectContainer.className = `preview-aspect-container aspect-${cropTargetRatio.replace(':', '-')}`;
          }
          if (addPreviewBadge) {
            addPreviewBadge.textContent = `${cropTargetRatio === '9:16' ? '9:16 Portrait' : '16:9 Landscape'} · Saved`;
          }
          if (addThumbPreviewCard) addThumbPreviewCard.style.display = 'block';
          if (thumbSelectedName) {
            thumbSelectedName.textContent = `Cropped: ${cropTargetRatio} format (${(blob.size / 1024).toFixed(0)} KB)`;
          }
        } else {
          activeEditThumbFile = croppedFile;
          activeEditThumbDataUrl = previewUrl;
          if (editThumbPreviewImg) editThumbPreviewImg.src = previewUrl;
          if (editPreviewAspectContainer) {
            editPreviewAspectContainer.className = `preview-aspect-container aspect-${cropTargetRatio.replace(':', '-')}`;
          }
          if (editPreviewBadge) {
            editPreviewBadge.textContent = `${cropTargetRatio === '9:16' ? '9:16 Portrait' : '16:9 Landscape'} · Replacement Saved`;
          }
          if (editThumbPreviewCard) editThumbPreviewCard.style.display = 'block';
          if (btnReCropEdit) btnReCropEdit.style.display = 'inline-flex';
          if (editThumbSelectedName) {
            editThumbSelectedName.textContent = `New replacement: ${cropTargetRatio} format (${(blob.size / 1024).toFixed(0)} KB)`;
          }
        }

        closeThumbEditor();
        showToast(`Thumbnail saved (${cropTargetRatio})`);
      }, 'image/jpeg', 0.92);
    });
  }

  // Adjust crop buttons
  if (btnReCropAdd) {
    btnReCropAdd.addEventListener('click', () => {
      if (cropSourceImage) {
        openThumbEditorModal('add', getSelectedFormat('add'));
      } else if (addThumbnail && addThumbnail.files[0]) {
        openThumbEditorWithFile(addThumbnail.files[0], 'add');
      }
    });
  }
  if (btnReCropEdit) {
    btnReCropEdit.addEventListener('click', () => {
      if (cropSourceImage) {
        openThumbEditorModal('edit', getSelectedFormat('edit'));
      } else if (editThumbnail && editThumbnail.files[0]) {
        openThumbEditorWithFile(editThumbnail.files[0], 'edit');
      }
    });
  }

  // Format selector change handlers
  document.querySelectorAll('input[name="addThumbFormat"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const newRatio = e.target.value;
      if (cropSourceImage && (activeAddThumbFile || (thumbEditorModal && thumbEditorModal.classList.contains('active')))) {
        openThumbEditorModal('add', newRatio);
      }
    });
  });

  document.querySelectorAll('input[name="editThumbFormat"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const newRatio = e.target.value;
      if (cropSourceImage && activeEditThumbFile) {
        openThumbEditorModal('edit', newRatio);
      } else {
        if (editPreviewAspectContainer) {
          editPreviewAspectContainer.className = `preview-aspect-container aspect-${newRatio.replace(':', '-')}`;
        }
        if (editPreviewBadge) {
          editPreviewBadge.textContent = `${newRatio === '9:16' ? '9:16 Portrait' : '16:9 Landscape'}`;
        }
      }
    });
  });

  // ========================================================================
  // 3. RENDER TABLE & CARDS
  // ========================================================================
  function renderFilteredVideos() {
    const q = adminSearchInput.value.toLowerCase().trim();
    const cat = filterCategory.value;
    const stat = filterStatus.value;

    let filtered = allVideos.filter(v => {
      const matchSearch = !q || (v.title && v.title.toLowerCase().includes(q)) || (v.description && v.description.toLowerCase().includes(q));
      const matchCat = cat === 'all' || v.category === cat;
      const matchStatus = stat === 'all' || (stat === 'published' ? v.published === 1 : v.published === 0);
      return matchSearch && matchCat && matchStatus;
    });

    renderDesktopTable(filtered);
    renderMobileCards(filtered);
  }

  function renderDesktopTable(videos) {
    adminTableBody.innerHTML = '';

    if (videos.length === 0) {
      adminTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
            No videos match your filter criteria. Click <strong>Add New Video</strong> above.
          </td>
        </tr>
      `;
      return;
    }

    videos.forEach(v => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="admin-thumb-cell">
          <img class="admin-thumb-img aspect-${(v.thumbnail_aspect_ratio || '16:9').replace(':', '-')}" src="/api/videos/${v.id}/thumbnail" alt="${v.title}" onerror="this.src='/uploads/thumbnails/seed-thumb-1.svg'">
        </td>
        <td class="admin-title-cell">
          <div class="admin-table-video-title" title="${v.title}">${v.title}</div>
          <div class="admin-table-desc">${v.description || 'No description'}</div>
          ${v.duration ? `<div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted); margin-top: 3px;">⏱ ${v.duration}</div>` : ''}
        </td>
        <td>
          <span class="category-tag">${(v.category || 'latest').toUpperCase()}</span>
        </td>
        <td>
          <span class="status-pill ${v.published ? 'published' : 'unpublished'}">
            ${v.published ? '● Published' : '○ Unpublished'}
          </span>
        </td>
        <td style="font-size: 0.8125rem; color: var(--text-secondary); white-space: nowrap;">
          ${formatDate(v.created_at)}
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.8125rem; font-weight: 600;">
          ${Number(v.views || 0).toLocaleString()}
        </td>
        <td class="admin-actions-cell">
          <div class="admin-action-btn-group">
            <button class="action-icon-btn btn-edit" data-id="${v.id}" type="button" title="Edit video details">
              Edit
            </button>
            <button class="action-icon-btn btn-toggle-publish" data-id="${v.id}" data-published="${v.published}" type="button">
              ${v.published ? 'Unpublish' : 'Publish'}
            </button>
            <button class="action-icon-btn btn-delete" data-id="${v.id}" data-title="${v.title.replace(/"/g, '&quot;')}" type="button" title="Delete video">
              Delete
            </button>
          </div>
        </td>
      `;
      adminTableBody.appendChild(tr);
    });

    attachActionListeners();
  }

  function renderMobileCards(videos) {
    adminCardsContainer.innerHTML = '';

    if (videos.length === 0) {
      adminCardsContainer.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: var(--text-secondary); background: var(--bg-subtle); border-radius: var(--radius-md);">
          No videos match your filter.
        </div>
      `;
      return;
    }

    videos.forEach(v => {
      const card = document.createElement('div');
      card.className = 'admin-video-card-item';
      card.innerHTML = `
        <div class="admin-card-top">
          <div class="admin-card-thumb-box">
            <img class="admin-card-thumb-img aspect-${(v.thumbnail_aspect_ratio || '16:9').replace(':', '-')}" src="/api/videos/${v.id}/thumbnail" alt="${v.title}" onerror="this.src='/uploads/thumbnails/seed-thumb-1.svg'">
          </div>
          <div class="admin-card-meta">
            <h3 class="admin-card-title">${v.title}</h3>
            <div class="admin-card-details-row">
              <span class="category-tag">${(v.category || 'latest').toUpperCase()}</span>
              <span class="status-pill ${v.published ? 'published' : 'unpublished'}">
                ${v.published ? 'Published' : 'Unpublished'}
              </span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
              ${v.duration ? `<span style="font-family: var(--font-mono); font-weight: 600;">${v.duration}</span> · ` : ''}${Number(v.views || 0).toLocaleString()} views · ${formatDate(v.created_at)}
            </div>
          </div>
        </div>
        <div class="admin-card-actions">
          <button class="action-icon-btn btn-edit" data-id="${v.id}" type="button">Edit</button>
          <button class="action-icon-btn btn-toggle-publish" data-id="${v.id}" data-published="${v.published}" type="button">
            ${v.published ? 'Unpublish' : 'Publish'}
          </button>
          <button class="action-icon-btn btn-delete" data-id="${v.id}" data-title="${v.title.replace(/"/g, '&quot;')}" type="button">Delete</button>
        </div>
      `;
      adminCardsContainer.appendChild(card);
    });

    attachActionListeners();
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'Recently';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function attachActionListeners() {
    // Edit buttons
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.onclick = () => openEditModal(btn.dataset.id);
    });

    // Toggle publish buttons
    document.querySelectorAll('.btn-toggle-publish').forEach(btn => {
      btn.onclick = () => togglePublish(btn.dataset.id, btn.dataset.published === '1');
    });

    // Delete buttons
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.onclick = () => openDeleteModal(btn.dataset.id, btn.dataset.title);
    });
  }

  // ========================================================================
  // 4. ADD NEW VIDEO (UPLOAD & DB RECORD)
  // ========================================================================
  const uploadProgressContainer = document.getElementById('uploadProgressContainer');
  const uploadProgressLabel = document.getElementById('uploadProgressLabel');
  const uploadProgressPercent = document.getElementById('uploadProgressPercent');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const btnSubmitText = document.getElementById('btnSubmitText');
  const btnSubmitIcon = document.getElementById('btnSubmitIcon');

  let isUploading = false;

  btnOpenAddModal.addEventListener('click', () => {
    addVideoForm.reset();
    addVideoDurationSeconds = null;
    activeAddThumbFile = null;
    activeAddThumbDataUrl = null;
    cropSourceImage = null;
    cropSourceFile = null;
    const addInitialViews = document.getElementById('addInitialViews');
    if (addInitialViews) addInitialViews.value = '0';
    thumbSelectedName.textContent = '';
    videoSelectedName.textContent = '';
    addErrorBanner.style.display = 'none';
    if (addThumbPreviewCard) addThumbPreviewCard.style.display = 'none';
    const defRadio = document.querySelector('input[name="addThumbFormat"][value="16:9"]');
    if (defRadio) defRadio.checked = true;
    if (uploadProgressContainer) uploadProgressContainer.style.display = 'none';
    if (uploadProgressBar) uploadProgressBar.style.width = '0%';
    resetSubmitButton();
    addVideoModal.classList.add('active');
  });

  function resetSubmitButton() {
    isUploading = false;
    btnSubmitAdd.disabled = false;
    btnCancelAdd.disabled = false;
    btnCloseAddModal.disabled = false;
    if (btnSubmitText) btnSubmitText.textContent = 'Publish Video';
    if (btnSubmitIcon) btnSubmitIcon.style.display = 'inline-block';
  }

  function closeAddModal() {
    if (isUploading) return; // Prevent closing while in the middle of uploading
    addVideoModal.classList.remove('active');
    resetSubmitButton();
  }
  btnCloseAddModal.addEventListener('click', closeAddModal);
  btnCancelAdd.addEventListener('click', closeAddModal);

  addThumbnail.addEventListener('change', () => {
    const file = addThumbnail.files[0];
    if (file) {
      thumbSelectedName.textContent = `Selected: ${file.name} — Opening crop editor...`;
      openThumbEditorWithFile(file, 'add');
    } else {
      thumbSelectedName.textContent = '';
    }
  });

  addVideoFile.addEventListener('change', async () => {
    const file = addVideoFile.files[0];
    addVideoDurationSeconds = null;
    if (file) {
      videoSelectedName.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB) — Detecting duration...`;
      const detectedDuration = await extractVideoDuration(file);
      if (detectedDuration) {
        addVideoDurationSeconds = detectedDuration;
        videoSelectedName.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB, ${formatDuration(detectedDuration)})`;
      } else {
        videoSelectedName.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
      }
    } else {
      videoSelectedName.textContent = '';
    }
  });

  addVideoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isUploading) return; // Prevent duplicate submissions

    addErrorBanner.style.display = 'none';

    const title = document.getElementById('addTitle').value.trim();
    const description = document.getElementById('addDescription').value.trim();
    const category = document.getElementById('addCategory').value;
    const initialViewsInput = document.getElementById('addInitialViews') ? document.getElementById('addInitialViews').value.trim() : '0';
    const published = document.getElementById('addPublished').checked ? '1' : '0';
    const effectiveThumb = activeAddThumbFile || (addThumbnail.files ? addThumbnail.files[0] : null);
    const thumbFile = effectiveThumb;
    const videoFile = addVideoFile.files ? addVideoFile.files[0] : null;
    const selectedThumbRatio = getSelectedFormat('add');

    // Client-side validations
    if (!title) {
      showAddError('Video title is required.');
      document.getElementById('addTitle').focus();
      return;
    }

    // Validate Initial Views (accepts numbers or shorthand e.g. 10K, 2M, 3.4M)
    let initialViews = 0;
    try {
      initialViews = parseViewCount(initialViewsInput, true);
    } catch (err) {
      showAddError(err.message);
      document.getElementById('addInitialViews').focus();
      return;
    }

    if (!thumbFile) {
      showAddError('Please select a thumbnail image (JPG, PNG, WebP).');
      return;
    }
    const validThumbExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const thumbExt = thumbFile.name ? '.' + thumbFile.name.split('.').pop().toLowerCase() : '';
    const isImageMime = thumbFile.type ? thumbFile.type.startsWith('image/') : false;
    if (!validThumbExts.includes(thumbExt) && !isImageMime) {
      showAddError('Invalid thumbnail format. Please select a JPG, PNG, or WebP image.');
      return;
    }

    if (!videoFile) {
      showAddError('Please select a video file (MP4, WebM).');
      return;
    }
    const validVideoExts = ['.mp4', '.webm'];
    const videoExt = videoFile.name ? '.' + videoFile.name.split('.').pop().toLowerCase() : '';
    const isVideoMime = videoFile.type ? (videoFile.type === 'video/mp4' || videoFile.type === 'video/webm') : false;
    if (!validVideoExts.includes(videoExt) && !isVideoMime) {
      showAddError('Invalid video format. Please select an MP4 or WebM video file.');
      return;
    }

    // Lock UI and show clear loading state
    isUploading = true;
    btnSubmitAdd.disabled = true;
    btnCancelAdd.disabled = true;
    btnCloseAddModal.disabled = true;
    if (btnSubmitIcon) btnSubmitIcon.style.display = 'none';
    if (btnSubmitText) btnSubmitText.textContent = 'Publishing...';

    if (uploadProgressContainer) {
      uploadProgressContainer.style.display = 'block';
      uploadProgressBar.style.width = '0%';
      uploadProgressPercent.textContent = '0%';
      uploadProgressLabel.textContent = 'Publishing...';
    }

    try {
      // Ensure latest Blob status before starting upload
      await checkBlobStatus();

    // Direct Vercel Blob client upload flow
    if (isBlobEnabled) {
      try {
        // 1. Direct client upload for thumbnail to Vercel Blob
        uploadProgressLabel.textContent = 'Uploading thumbnail to Vercel Blob... 0%';
        if (btnSubmitText) btnSubmitText.textContent = 'Uploading thumbnail... 0%';

        const thumbBlob = await uploadDirectToBlob(thumbFile, 'thumbnails', (pct) => {
          if (uploadProgressBar) uploadProgressBar.style.width = pct + '%';
          if (uploadProgressPercent) uploadProgressPercent.textContent = pct + '%';
          if (uploadProgressLabel) uploadProgressLabel.textContent = `Uploading thumbnail... ${pct}%`;
          if (btnSubmitText) btnSubmitText.textContent = `Uploading thumbnail... ${pct}%`;
        });

        if (!thumbBlob || !thumbBlob.url) {
          throw new Error('Thumbnail upload completed without a valid Blob URL response.');
        }

        // Thumbnail complete: visually confirm 100% before initiating video upload
        if (uploadProgressBar) uploadProgressBar.style.width = '100%';
        if (uploadProgressPercent) uploadProgressPercent.textContent = '100%';
        if (uploadProgressLabel) uploadProgressLabel.textContent = 'Thumbnail uploaded (100%). Starting video upload...';
        if (btnSubmitText) btnSubmitText.textContent = 'Thumbnail uploaded (100%)';

        // 2. Direct client upload for video to Vercel Blob
        uploadProgressBar.style.width = '0%';
        uploadProgressPercent.textContent = '0%';
        uploadProgressLabel.textContent = 'Uploading video to Vercel Blob... 0%';
        if (btnSubmitText) btnSubmitText.textContent = 'Uploading video... 0%';

        const videoBlob = await uploadDirectToBlob(videoFile, 'videos', (pct) => {
          if (uploadProgressBar) uploadProgressBar.style.width = pct + '%';
          if (uploadProgressPercent) uploadProgressPercent.textContent = pct + '%';
          if (uploadProgressLabel) uploadProgressLabel.textContent = `Uploading video... ${pct}%`;
          if (btnSubmitText) btnSubmitText.textContent = `Uploading video... ${pct}%`;
        });

        if (!videoBlob || !videoBlob.url) {
          throw new Error('Video upload completed without a valid Blob URL response.');
        }

        // Video complete: visually confirm 100% before database record creation
        if (uploadProgressBar) uploadProgressBar.style.width = '100%';
        if (uploadProgressPercent) uploadProgressPercent.textContent = '100%';
        uploadProgressLabel.textContent = 'Files uploaded (100%). Saving video details to database...';
        if (btnSubmitText) btnSubmitText.textContent = 'Saving...';

        // 3. Save metadata and Blob URLs to Neon PostgreSQL database
        const saveRes = await fetch('/api/videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title,
            description,
            category,
            initial_views: initialViews,
            published,
            video_url: videoBlob.url,
            thumbnail_url: thumbBlob.url,
            duration_seconds: addVideoDurationSeconds,
            thumbnail_aspect_ratio: selectedThumbRatio
          })
        });

        const saveData = await saveRes.json();
        if (saveRes.ok && saveData.success) {
          if (uploadProgressBar) uploadProgressBar.style.width = '100%';
          if (uploadProgressPercent) uploadProgressPercent.textContent = '100%';
          if (uploadProgressLabel) uploadProgressLabel.textContent = 'Completed!';
          closeAddModal();
          showToast('Video published successfully!');
          loadDashboardData();
        } else {
          showAddError(saveData.error || 'Failed to save video record');
        }
      } catch (blobErr) {
        console.error('Blob upload error:', blobErr);
        const errorDetail = blobErr.message || (typeof blobErr === 'string' ? blobErr : 'Upload failed. Please check your connection.');
        showAddError(`Upload failed: ${errorDetail}`);
        if (uploadProgressLabel) uploadProgressLabel.textContent = `Upload failed: ${errorDetail}`;
      } finally {
        resetSubmitButton();
      }
      return;
    }

    // Never write to local filesystem when running in production
    if (isProductionEnv) {
      resetSubmitButton();
      showAddError('Vercel Blob storage is not configured. Please ensure BLOB_READ_WRITE_TOKEN is set in your Vercel project environment variables.');
      return;
    }

    // Fallback: Local multipart upload (ONLY for local offline development without Blob token)
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('category', category);
    formData.append('initial_views', initialViews);
    formData.append('published', published);
    formData.append('thumbnail_aspect_ratio', selectedThumbRatio);
    formData.append('thumbnail', thumbFile);
    formData.append('video', videoFile);
    if (addVideoDurationSeconds) {
      formData.append('duration_seconds', addVideoDurationSeconds);
    }

    if (btnSubmitText) btnSubmitText.textContent = 'Uploading 0%...';
    if (uploadProgressLabel) uploadProgressLabel.textContent = 'Uploading files to server...';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/videos', true);

    // Real-time Upload Progress
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
        if (uploadProgressBar) uploadProgressBar.style.width = percent + '%';
        if (uploadProgressPercent) uploadProgressPercent.textContent = percent + '%';
        if (btnSubmitText) btnSubmitText.textContent = `Uploading ${percent}%...`;

        if (percent >= 99 && uploadProgressLabel) {
          uploadProgressLabel.textContent = 'Saving video record to database...';
          if (btnSubmitText) btnSubmitText.textContent = 'Publishing...';
        }
      }
    };

    xhr.onload = () => {
      resetSubmitButton();

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            if (uploadProgressBar) uploadProgressBar.style.width = '100%';
            if (uploadProgressPercent) uploadProgressPercent.textContent = '100%';
            
            closeAddModal();
            showToast('Video published successfully!');
            loadDashboardData();
          } else {
            showAddError(data.error || 'Failed to upload video.');
          }
        } catch (ex) {
          showAddError('Unexpected server response.');
        }
      } else {
        try {
          const errData = JSON.parse(xhr.responseText);
          showAddError(errData.error || 'Failed to publish video.');
        } catch (ex) {
          showAddError(`Server error (${xhr.status}). Please try again.`);
        }
      }
    };

    xhr.onerror = () => {
      resetSubmitButton();
      showAddError('Network connection error while uploading. Please check the server.');
    };

    xhr.send(formData);
    } catch (topErr) {
      console.error('Publish error:', topErr);
      resetSubmitButton();
      showAddError(topErr.message || 'Error occurred while publishing.');
    }
  });

  function showAddError(msg) {
    addErrorBanner.textContent = msg;
    addErrorBanner.style.display = 'block';
  }

  // ========================================================================
  // 5. EDIT VIDEO MODAL & UPDATE
  // ========================================================================
  function openEditModal(id) {
    const video = allVideos.find(v => v.id === Number(id));
    if (!video) return;

    document.getElementById('editVideoId').value = video.id;
    document.getElementById('editTitle').value = video.title;
    document.getElementById('editDescription').value = video.description || '';
    document.getElementById('editCategory').value = video.category || 'latest';
    document.getElementById('editPublished').checked = video.published === 1;

    const editViews = document.getElementById('editViews');
    if (editViews) editViews.value = video.views !== undefined ? video.views : 0;

    const existingRatio = video.thumbnail_aspect_ratio === '9:16' ? '9:16' : '16:9';
    const ratioRadio = document.querySelector(`input[name="editThumbFormat"][value="${existingRatio}"]`);
    if (ratioRadio) ratioRadio.checked = true;

    activeEditThumbFile = null;
    activeEditThumbDataUrl = null;
    cropSourceImage = null;
    cropSourceFile = null;

    editThumbnail.value = '';
    editThumbSelectedName.textContent = '';
    if (editThumbPreviewCard && editThumbPreviewImg && editPreviewAspectContainer && editPreviewBadge) {
      editThumbPreviewImg.src = `/api/videos/${video.id}/thumbnail`;
      editPreviewAspectContainer.className = `preview-aspect-container aspect-${existingRatio.replace(':', '-')}`;
      editPreviewBadge.textContent = `${existingRatio === '9:16' ? '9:16 Portrait' : '16:9 Landscape'} (Current)`;
      editThumbPreviewCard.style.display = 'block';
      if (btnReCropEdit) btnReCropEdit.style.display = 'none';
    }

    if (editVideoFile) editVideoFile.value = '';
    if (editVideoSelectedName) editVideoSelectedName.textContent = '';
    editVideoDurationSeconds = null;
    editErrorBanner.style.display = 'none';

    if (editUploadProgressContainer) editUploadProgressContainer.style.display = 'none';
    if (editUploadProgressBar) editUploadProgressBar.style.width = '0%';
    if (editUploadProgressPercent) editUploadProgressPercent.textContent = '0%';
    btnSubmitEdit.disabled = false;
    if (btnSubmitEditText) btnSubmitEditText.textContent = 'Save Changes';

    editVideoModal.classList.add('active');
  }

  function closeEditModal() {
    editVideoModal.classList.remove('active');
  }
  btnCloseEditModal.addEventListener('click', closeEditModal);
  btnCancelEdit.addEventListener('click', closeEditModal);

  editThumbnail.addEventListener('change', () => {
    const file = editThumbnail.files[0];
    if (file) {
      editThumbSelectedName.textContent = `Selected: ${file.name} — Opening crop editor...`;
      openThumbEditorWithFile(file, 'edit');
    } else {
      editThumbSelectedName.textContent = '';
    }
  });

  if (editVideoFile) {
    editVideoFile.addEventListener('change', async () => {
      const file = editVideoFile.files[0];
      editVideoDurationSeconds = null;
      if (file) {
        editVideoSelectedName.textContent = `New replacement: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB) — Detecting duration...`;
        const detectedDuration = await extractVideoDuration(file);
        if (detectedDuration) {
          editVideoDurationSeconds = detectedDuration;
          editVideoSelectedName.textContent = `New replacement: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB, ${formatDuration(detectedDuration)})`;
        } else {
          editVideoSelectedName.textContent = `New replacement: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
        }
      } else {
        editVideoSelectedName.textContent = '';
      }
    });
  }

  editVideoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    editErrorBanner.style.display = 'none';

    const id = document.getElementById('editVideoId').value;
    const title = document.getElementById('editTitle').value.trim();
    const description = document.getElementById('editDescription').value.trim();
    const category = document.getElementById('editCategory').value;
    const viewsInput = document.getElementById('editViews') ? document.getElementById('editViews').value.trim() : '';
    const published = document.getElementById('editPublished').checked ? '1' : '0';
    const newThumb = activeEditThumbFile || (editThumbnail.files ? editThumbnail.files[0] : null);
    const newVideo = editVideoFile ? editVideoFile.files[0] : null;

    if (!title) {
      editErrorBanner.textContent = 'Title cannot be empty.';
      editErrorBanner.style.display = 'block';
      return;
    }

    // Validate Base / Historical Views (accepts numbers or shorthand e.g. 10K, 2M, 3.4M)
    let viewsVal = 0;
    try {
      viewsVal = parseViewCount(viewsInput, false);
    } catch (err) {
      editErrorBanner.textContent = err.message;
      editErrorBanner.style.display = 'block';
      document.getElementById('editViews').focus();
      return;
    }

    if (newThumb) {
      const validThumbExts = ['.jpg', '.jpeg', '.png', '.webp'];
      const thumbExt = newThumb.name ? '.' + newThumb.name.split('.').pop().toLowerCase() : '';
      const isImageMime = newThumb.type ? newThumb.type.startsWith('image/') : false;
      if (!validThumbExts.includes(thumbExt) && !isImageMime) {
        editErrorBanner.textContent = 'Invalid replacement thumbnail format. Please select a JPG, PNG, or WebP image.';
        editErrorBanner.style.display = 'block';
        return;
      }
    }

    if (newVideo) {
      const validVideoExts = ['.mp4', '.webm'];
      const videoExt = newVideo.name ? '.' + newVideo.name.split('.').pop().toLowerCase() : '';
      const isVideoMime = newVideo.type ? (newVideo.type === 'video/mp4' || newVideo.type === 'video/webm') : false;
      if (!validVideoExts.includes(videoExt) && !isVideoMime) {
        editErrorBanner.textContent = 'Invalid replacement video format. Please select an MP4 or WebM file.';
        editErrorBanner.style.display = 'block';
        return;
      }
    }

    // Refresh Blob status right before edit
    await checkBlobStatus();

    btnSubmitEdit.disabled = true;
    if (btnSubmitEditText) btnSubmitEditText.textContent = 'Saving...';

    // Direct Blob upload flow if enabled and files are selected
    if (isBlobEnabled && (newThumb || newVideo)) {
      let newThumbUrl = null;
      let newVideoUrl = null;

      try {
        if (newThumb) {
          if (editUploadProgressContainer) {
            editUploadProgressContainer.style.display = 'block';
            editUploadProgressBar.style.width = '0%';
            editUploadProgressPercent.textContent = '0%';
            editUploadProgressLabel.textContent = 'Uploading replacement thumbnail... 0%';
          }
          if (btnSubmitEditText) btnSubmitEditText.textContent = 'Uploading thumbnail...';

          const thumbBlob = await uploadDirectToBlob(newThumb, 'thumbnails', (pct) => {
            if (editUploadProgressBar) editUploadProgressBar.style.width = pct + '%';
            if (editUploadProgressPercent) editUploadProgressPercent.textContent = pct + '%';
            if (editUploadProgressLabel) editUploadProgressLabel.textContent = `Uploading replacement thumbnail... ${pct}%`;
            if (btnSubmitEditText) btnSubmitEditText.textContent = `Uploading thumbnail... ${pct}%`;
          });
          if (!thumbBlob || !thumbBlob.url) {
            throw new Error('Replacement thumbnail upload failed to return a valid URL.');
          }
          newThumbUrl = thumbBlob.url;
          if (editUploadProgressBar) editUploadProgressBar.style.width = '100%';
          if (editUploadProgressPercent) editUploadProgressPercent.textContent = '100%';
          if (editUploadProgressLabel) editUploadProgressLabel.textContent = 'Thumbnail uploaded (100%).';
        }

        if (newVideo) {
          if (editUploadProgressContainer) {
            editUploadProgressContainer.style.display = 'block';
            editUploadProgressBar.style.width = '0%';
            editUploadProgressPercent.textContent = '0%';
            editUploadProgressLabel.textContent = 'Uploading replacement video... 0%';
          }
          if (btnSubmitEditText) btnSubmitEditText.textContent = 'Uploading video...';

          const videoBlob = await uploadDirectToBlob(newVideo, 'videos', (pct) => {
            if (editUploadProgressBar) editUploadProgressBar.style.width = pct + '%';
            if (editUploadProgressPercent) editUploadProgressPercent.textContent = pct + '%';
            if (editUploadProgressLabel) editUploadProgressLabel.textContent = `Uploading replacement video... ${pct}%`;
            if (btnSubmitEditText) btnSubmitEditText.textContent = `Uploading video... ${pct}%`;
          });
          if (!videoBlob || !videoBlob.url) {
            throw new Error('Replacement video upload failed to return a valid URL.');
          }
          newVideoUrl = videoBlob.url;
          if (editUploadProgressBar) editUploadProgressBar.style.width = '100%';
          if (editUploadProgressPercent) editUploadProgressPercent.textContent = '100%';
          if (editUploadProgressLabel) editUploadProgressLabel.textContent = 'Video uploaded (100%).';
        }

        if (editUploadProgressLabel) editUploadProgressLabel.textContent = 'Updating database record...';
        if (btnSubmitEditText) btnSubmitEditText.textContent = 'Saving...';

        const selectedEditThumbRatio = getSelectedFormat('edit');
        const updatePayload = {
          title,
          description,
          category,
          views: viewsVal,
          published,
          thumbnail_aspect_ratio: selectedEditThumbRatio
        };
        if (newThumbUrl) updatePayload.thumbnail_url = newThumbUrl;
        if (newVideoUrl) {
          updatePayload.video_url = newVideoUrl;
          if (editVideoDurationSeconds) updatePayload.duration_seconds = editVideoDurationSeconds;
        }

        const res = await fetch(`/api/videos/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
          if (editUploadProgressBar) editUploadProgressBar.style.width = '100%';
          if (editUploadProgressPercent) editUploadProgressPercent.textContent = '100%';
          closeEditModal();
          showToast('Video updated successfully!');
          loadDashboardData();
        } else {
          editErrorBanner.textContent = data.error || 'Failed to update video.';
          editErrorBanner.style.display = 'block';
        }
      } catch (err) {
        console.error('Update failed:', err);
        editErrorBanner.textContent = err.message || 'Server error during update.';
        editErrorBanner.style.display = 'block';
      } finally {
        btnSubmitEdit.disabled = false;
        if (btnSubmitEditText) btnSubmitEditText.textContent = 'Save Changes';
        if (editUploadProgressContainer) editUploadProgressContainer.style.display = 'none';
      }
      return;
    }

    // In production, if files were selected but Blob is not enabled
    if (isProductionEnv && (newThumb || newVideo)) {
      btnSubmitEdit.disabled = false;
      if (btnSubmitEditText) btnSubmitEditText.textContent = 'Save Changes';
      editErrorBanner.textContent = 'Vercel Blob storage is not configured. Please ensure BLOB_READ_WRITE_TOKEN is set in your Vercel project environment variables.';
      editErrorBanner.style.display = 'block';
      return;
    }

    // If only editing text metadata without replacement files, send JSON directly
    const isJsonOnly = !newThumb && !newVideo;
    let reqBody;
    let reqHeaders = {};
    const selectedEditThumbRatio = getSelectedFormat('edit');

    if (isJsonOnly) {
      reqHeaders['Content-Type'] = 'application/json';
      reqBody = JSON.stringify({
        title,
        description,
        category,
        views: viewsVal,
        published,
        thumbnail_aspect_ratio: selectedEditThumbRatio
      });
    } else {
      // Local fallback multipart FormData
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('category', category);
      formData.append('views', viewsVal);
      formData.append('published', published);
      formData.append('thumbnail_aspect_ratio', selectedEditThumbRatio);
      if (newThumb) formData.append('thumbnail', newThumb);
      if (newVideo) {
        formData.append('video', newVideo);
        if (editVideoDurationSeconds) formData.append('duration_seconds', editVideoDurationSeconds);
      }
      reqBody = formData;
    }

    try {
      const res = await fetch(`/api/videos/${id}`, {
        method: 'PUT',
        headers: reqHeaders,
        body: reqBody
      });

      const data = await res.json();

      if (res.ok && data.success) {
        closeEditModal();
        showToast('Video updated successfully!');
        loadDashboardData();
      } else {
        editErrorBanner.textContent = data.error || 'Failed to update video.';
        editErrorBanner.style.display = 'block';
      }
    } catch (err) {
      console.error('Update failed:', err);
      editErrorBanner.textContent = 'Server error during update.';
      editErrorBanner.style.display = 'block';
    } finally {
      btnSubmitEdit.disabled = false;
      if (btnSubmitEditText) btnSubmitEditText.textContent = 'Save Changes';
    }
  });

  // ========================================================================
  // 6. PUBLISH / UNPUBLISH TOGGLE
  // ========================================================================
  async function togglePublish(id, currentlyPublished) {
    const newPublished = currentlyPublished ? 0 : 1;

    try {
      const res = await fetch(`/api/videos/${id}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: newPublished })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast(newPublished ? 'Video published to homepage' : 'Video unpublished');
        loadDashboardData();
      } else {
        showToast(data.error || 'Failed to toggle publish status');
      }
    } catch (err) {
      console.error('Failed to toggle status:', err);
      showToast('Error updating status');
    }
  }

  // ========================================================================
  // 7. DELETE VIDEO (CONFIRMATION & CLEANUP)
  // ========================================================================
  function openDeleteModal(id, title) {
    videoToDelete = id;
    deleteVideoTitlePrompt.textContent = `"${title}"`;
    deleteVideoModal.classList.add('active');
  }

  function closeDeleteModal() {
    deleteVideoModal.classList.remove('active');
    videoToDelete = null;
  }
  btnCloseDeleteModal.addEventListener('click', closeDeleteModal);
  btnCancelDelete.addEventListener('click', closeDeleteModal);

  btnConfirmDelete.addEventListener('click', async () => {
    if (!videoToDelete) return;

    btnConfirmDelete.disabled = true;
    btnConfirmDelete.textContent = 'Deleting...';

    try {
      const res = await fetch(`/api/videos/${videoToDelete}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (res.ok && data.success) {
        closeDeleteModal();
        showToast('Video and files deleted permanently');
        loadDashboardData();
      } else {
        showToast(data.error || 'Failed to delete video');
      }
    } catch (err) {
      console.error('Delete failed:', err);
      showToast('Error communicating with server');
    } finally {
      btnConfirmDelete.disabled = false;
      btnConfirmDelete.textContent = 'Delete Video';
    }
  });

  // ========================================================================
  // 8. LOGOUT
  // ========================================================================
  btnAdminLogout.addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    }
    window.location.href = '/admin/login';
  });

  // ========================================================================
  // 9. FILTERS & SEARCH LISTENERS
  // ========================================================================
  adminSearchInput.addEventListener('input', renderFilteredVideos);
  filterCategory.addEventListener('change', renderFilteredVideos);
  filterStatus.addEventListener('change', renderFilteredVideos);

  function showToast(msg) {
    adminToast.textContent = msg;
    adminToast.classList.add('show');
    setTimeout(() => adminToast.classList.remove('show'), 2400);
  }

  // Initialize
  checkBlobStatus();
  checkAuth();
  loadDashboardData();

})();
