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
          <img class="admin-thumb-img" src="${v.thumbnail_url || v.thumbnail_path}" alt="${v.title}" onerror="this.src='/uploads/thumbnails/seed-thumb-1.svg'">
        </td>
        <td class="admin-title-cell">
          <div class="admin-table-video-title" title="${v.title}">${v.title}</div>
          <div class="admin-table-desc">${v.description || 'No description'}</div>
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
            <img class="admin-card-thumb-img" src="${v.thumbnail_url || v.thumbnail_path}" alt="${v.title}" onerror="this.src='/uploads/thumbnails/seed-thumb-1.svg'">
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
              ${Number(v.views || 0).toLocaleString()} views · ${formatDate(v.created_at)}
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
    const addInitialViews = document.getElementById('addInitialViews');
    if (addInitialViews) addInitialViews.value = '0';
    thumbSelectedName.textContent = '';
    videoSelectedName.textContent = '';
    addErrorBanner.style.display = 'none';
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
      thumbSelectedName.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    } else {
      thumbSelectedName.textContent = '';
    }
  });

  addVideoFile.addEventListener('change', () => {
    const file = addVideoFile.files[0];
    if (file) {
      videoSelectedName.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
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
    const thumbFile = addThumbnail.files[0];
    const videoFile = addVideoFile.files[0];

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
    const thumbExt = '.' + thumbFile.name.split('.').pop().toLowerCase();
    if (!validThumbExts.includes(thumbExt)) {
      showAddError('Invalid thumbnail format. Please select a JPG, PNG, or WebP image.');
      return;
    }

    if (!videoFile) {
      showAddError('Please select a video file (MP4, WebM).');
      return;
    }
    const validVideoExts = ['.mp4', '.webm'];
    const videoExt = '.' + videoFile.name.split('.').pop().toLowerCase();
    if (!validVideoExts.includes(videoExt)) {
      showAddError('Invalid video format. Please select an MP4 or WebM video file.');
      return;
    }

    // Ensure latest Blob status before starting upload
    await checkBlobStatus();

    // Lock UI and show progress
    isUploading = true;
    btnSubmitAdd.disabled = true;
    btnCancelAdd.disabled = true;
    btnCloseAddModal.disabled = true;
    if (btnSubmitIcon) btnSubmitIcon.style.display = 'none';

    if (uploadProgressContainer) {
      uploadProgressContainer.style.display = 'block';
      uploadProgressBar.style.width = '0%';
      uploadProgressPercent.textContent = '0%';
      uploadProgressLabel.textContent = 'Starting upload...';
    }

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
            thumbnail_url: thumbBlob.url
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
    formData.append('thumbnail', thumbFile);
    formData.append('video', videoFile);

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

    editThumbnail.value = '';
    editThumbSelectedName.textContent = '';
    if (editVideoFile) editVideoFile.value = '';
    if (editVideoSelectedName) editVideoSelectedName.textContent = '';
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
      editThumbSelectedName.textContent = `New replacement: ${file.name}`;
    } else {
      editThumbSelectedName.textContent = '';
    }
  });

  if (editVideoFile) {
    editVideoFile.addEventListener('change', () => {
      const file = editVideoFile.files[0];
      if (file) {
        editVideoSelectedName.textContent = `New replacement: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
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
    const newThumb = editThumbnail.files[0];
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
      const thumbExt = '.' + newThumb.name.split('.').pop().toLowerCase();
      if (!validThumbExts.includes(thumbExt)) {
        editErrorBanner.textContent = 'Invalid replacement thumbnail format. Please select a JPG, PNG, or WebP image.';
        editErrorBanner.style.display = 'block';
        return;
      }
    }

    if (newVideo) {
      const validVideoExts = ['.mp4', '.webm'];
      const videoExt = '.' + newVideo.name.split('.').pop().toLowerCase();
      if (!validVideoExts.includes(videoExt)) {
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

        const updatePayload = {
          title,
          description,
          category,
          views: viewsVal,
          published
        };
        if (newThumbUrl) updatePayload.thumbnail_url = newThumbUrl;
        if (newVideoUrl) updatePayload.video_url = newVideoUrl;

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

    if (isJsonOnly) {
      reqHeaders['Content-Type'] = 'application/json';
      reqBody = JSON.stringify({
        title,
        description,
        category,
        views: viewsVal,
        published
      });
    } else {
      // Local fallback multipart FormData
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('category', category);
      formData.append('views', viewsVal);
      formData.append('published', published);
      if (newThumb) formData.append('thumbnail', newThumb);
      if (newVideo) formData.append('video', newVideo);
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
