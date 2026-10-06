/**
 * server.js
 * Express + SQLite Content Management System for ViralHub 2026
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { initDatabase, query, isPostgres } = require('./database/db');
const { isBlobConfigured, isBlobUrl, getBlobAccess, safeDeleteBlob, handleUpload, put } = require('./services/blob');
const {
  PLAN_PRICE,
  getPublicConfig,
  verifySubscriberToken,
  hasActiveSubscription,
  createSubscription,
  verifyAndActivateSubscription,
  verifyPaymentLinkPayment,
  handleWebhookEvent,
  restoreAccess,
  getAdminSubscriptions
} = require('./services/subscription');
const {
  VIDEO_PRICE,
  VIDEO_AMOUNT_PAISE,
  isRazorpayConfigured: isRazorpayEntitlementConfigured,
  getPublicEntitlementConfig,
  createUserToken,
  verifyUserToken,
  resolveUserContext,
  hasVideoEntitlement,
  createOrderForVideo,
  verifyAndCreateEntitlement,
  verifyPaymentLinkForVideo,
  handleEntitlementWebhook,
  restoreUserAccess,
  getAdminEntitlements
} = require('./services/entitlement');
const {
  isCashfreeConfigured,
  getCashfreePublicConfig,
  createCashfreeOrder,
  verifyCashfreeOrder
} = require('./services/cashfree');
const {
  isPayUConfigured,
  getPayUPublicConfig,
  generatePaymentHash,
  verifyReturnHash,
  verifyPaymentWithPayU,
  createPayUPaymentPayload
} = require('./services/payu');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'viralhub_2026_cms_secret_key_8f3a1b';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION);
const isProduction = Boolean(isServerless || process.env.NODE_ENV === 'production');

// Ensure upload folders exist (only attempted for local development)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const VIDEOS_DIR = path.join(UPLOADS_DIR, 'videos');
const THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

if (!isServerless) {
  [UPLOADS_DIR, VIDEOS_DIR, THUMBS_DIR].forEach(dir => {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (_) {
      // Graceful fallback for local development
    }
  });
}

// Configure Multer for File Uploads
// In serverless / Vercel production or when Vercel Blob is configured, files are never written to /var/task/uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (isServerless || isBlobConfigured()) {
      return cb(null, os.tmpdir());
    }
    let dest = file.fieldname === 'video' ? VIDEOS_DIR : THUMBS_DIR;
    try {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      cb(null, dest);
    } catch (_) {
      cb(null, os.tmpdir());
    }
  },
  filename: (req, file, cb) => {
    // Generate safe, collision-resistant unique filename
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.fieldname === 'video' ? 'video' : 'thumb';
    const uniqueId = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `${prefix}_${uniqueId}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (file.fieldname === 'thumbnail') {
    const validImageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const validImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (validImageExts.includes(ext) || validImageMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Allowed formats: JPG, JPEG, PNG, WebP.'));
    }
  } else if (file.fieldname === 'video') {
    const validVideoExts = ['.mp4', '.webm'];
    const validVideoMimes = ['video/mp4', 'video/webm', 'application/octet-stream'];
    if (validVideoExts.includes(ext) || validVideoMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video format. Allowed formats: MP4, WebM.'));
    }
  } else {
    cb(new Error('Unexpected upload field'));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB max video size
  }
});

// Middleware to conditionally parse multipart/form-data only when files are being uploaded
function conditionalUpload(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return upload.fields([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'video', maxCount: 1 }
    ])(req, res, next);
  }
  next();
}

// Middlewares
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(SESSION_SECRET));

// Assign persistent visitor identifier cookie for subscription association
app.use((req, res, next) => {
  if (!req.cookies.vh_uid) {
    const uid = 'usr_' + crypto.randomBytes(12).toString('hex');
    res.cookie('vh_uid', uid, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax'
    });
    req.cookies.vh_uid = uid;
  }
  next();
});

// Protect raw video uploads directory against direct unauthorized downloads
app.use('/uploads/videos', async (req, res, next) => {
  const isAdmin = resolveIsAdmin(req);
  if (isAdmin) {
    return next();
  }
  return res.status(403).json({
    error: 'Direct file access not permitted. Use authorized video player at /api/videos/:id/stream',
    locked: true
  });
}, express.static(path.join(__dirname, 'uploads', 'videos')));

// Serve thumbnails and public static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Fallback for missing historical thumbnails to prevent broken image cards
app.get('/uploads/thumbnails/:file', (req, res) => {
  const seedThumb = path.join(__dirname, 'uploads', 'thumbnails', 'seed-thumb-1.svg');
  if (fs.existsSync(seedThumb)) {
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.sendFile(seedThumb);
  }
  res.status(404).end();
});

// Legacy asset path fallback for backwards compatibility
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// Duration formatters
function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) {
    return null;
  }
  const s = Math.max(0, Math.round(Number(seconds)));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function parseDurationToSeconds(durationStr) {
  if (typeof durationStr !== 'string') return null;
  const parts = durationStr.trim().split(':').map(Number);
  if (parts.some(p => isNaN(p) || p < 0)) return null;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

// Helper to determine if requester is an authenticated administrator
function resolveIsAdmin(req) {
  return Boolean(req.cookies && verifyAuthToken(req.cookies.admin_token));
}

// Helper to determine if current requester has active subscriber access (strictly subscribers, not admin)
async function resolveIsSubscribed(req) {
  // 1. Verified subscriber session token cookie
  const subToken = req.cookies?.vh_sub_token;
  if (subToken) {
    const payload = verifySubscriberToken(subToken);
    if (payload) {
      const active = await hasActiveSubscription(payload.user_id, payload.email);
      if (active) return true;
    }
  }

  // 2. Fallback: visitor identifier cookie
  const visitorId = req.cookies?.vh_uid;
  if (visitorId) {
    const active = await hasActiveSubscription(visitorId);
    if (active) return true;
  }

  return false;
}

// --- Database readiness helper (ensures DB initialized both locally & in Vercel serverless cold starts) ---
let dbInitPromise = null;
function ensureDbReady() {
  if (!dbInitPromise) {
    dbInitPromise = initDatabase().catch((err) => {
      dbInitPromise = null; // allow retry if initial attempt failed
      throw err;
    });
  }
  return dbInitPromise;
}

app.use(async (req, res, next) => {
  try {
    await ensureDbReady();
    next();
  } catch (err) {
    console.error('Database connection/initialization error:', err);
    res.status(500).json({ error: 'Database service unavailable. Please verify DATABASE_URL.' });
  }
});

// --- Admin Authentication Helper & Middlewares ---
function createAuthToken() {
  const data = `${ADMIN_USERNAME}:${Date.now()}`;
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
  return `${Buffer.from(data).toString('base64')}.${hmac}`;
}

function verifyAuthToken(token) {
  if (!token) return false;
  try {
    const [b64, hmac] = token.split('.');
    if (!b64 || !hmac) return false;
    const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(Buffer.from(b64, 'base64').toString('utf8')).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac));
  } catch (e) {
    return false;
  }
}

// Middleware to protect admin page
function requireAdminPage(req, res, next) {
  const token = req.cookies.admin_token;
  if (verifyAuthToken(token)) {
    return next();
  }
  return res.redirect('/admin/login');
}

// Middleware to protect admin API endpoints
function requireAdminApi(req, res, next) {
  const token = req.cookies.admin_token;
  if (verifyAuthToken(token)) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized. Please log in as admin.' });
}

// ==========================================================================
// 1. PUBLIC ROUTES & APIS
// ==========================================================================

// Robust static HTML path resolver across local and Vercel environments
function getPublicPath(filename) {
  const p1 = path.join(__dirname, 'public', filename);
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(process.cwd(), 'public', filename);
  if (fs.existsSync(p2)) return p2;
  return p1;
}

// Public Homepage
app.get('/', (req, res) => {
  const paymentId = req.query.razorpay_payment_id || req.query.payment_id;
  const pendingVid = req.cookies?.vh_pending_vid;
  if (paymentId && pendingVid) {
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    return res.redirect(`/video/${pendingVid}${qs}`);
  }
  res.sendFile(getPublicPath('index.html'));
});

// Dedicated Public Video Detail Page (e.g. /video/1)
app.get('/video/:id', (req, res) => {
  res.sendFile(getPublicPath('video.html'));
});

// Video route alias with pending video ID resolution
app.get(['/video', '/video/'], (req, res) => {
  const paymentId = req.query.razorpay_payment_id || req.query.payment_id;
  const pendingVid = req.cookies?.vh_pending_vid || req.query.id || req.query.videoId;
  if (pendingVid) {
    const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    return res.redirect(`/video/${pendingVid}${qs}`);
  }
  res.sendFile(getPublicPath('video.html'));
});

// Route alias for /js/admin.js -> public/admin.js
app.get('/js/admin.js', (req, res) => {
  res.sendFile(getPublicPath('admin.js'));
});

// Standalone Cashfree Sandbox Demo Page (/payment-test)
app.get(['/payment-test', '/payment-test.html'], (req, res) => {
  res.sendFile(getPublicPath('payment-test.html'));
});

// Secure Thumbnail Delivery Endpoint
// Securely proxies private Vercel Blob thumbnails or local files belonging strictly to videos in the database.
// Publicly accessible so thumbnails appear on homepage/sidebar without exposing private tokens.
app.get('/api/videos/:id/thumbnail', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const video = await query.get(
      'SELECT id, thumbnail_url, thumbnail_path FROM videos WHERE id = $1',
      [videoId]
    );

    if (!video) {
      const seedThumb = path.join(__dirname, 'uploads', 'thumbnails', 'seed-thumb-1.svg');
      if (fs.existsSync(seedThumb)) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(seedThumb);
      }
      return res.status(404).json({ error: 'Video not found' });
    }

    const targetThumb = video.thumbnail_url || video.thumbnail_path;
    if (!targetThumb) {
      const seedThumb = path.join(__dirname, 'uploads', 'thumbnails', 'seed-thumb-1.svg');
      if (fs.existsSync(seedThumb)) {
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(seedThumb);
      }
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    // 1. Remote Private Vercel Blob URL
    if (isBlobUrl(targetThumb)) {
      const fetchHeaders = {};
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        fetchHeaders['Authorization'] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
      }

      const upstream = await fetch(targetThumb, { headers: fetchHeaders });
      if (!upstream.ok) {
        console.warn(`Upstream private blob returned ${upstream.status} for video ${videoId} thumbnail`);
        const seedThumb = path.join(__dirname, 'uploads', 'thumbnails', 'seed-thumb-1.svg');
        if (fs.existsSync(seedThumb)) {
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          return res.sendFile(seedThumb);
        }
        return res.status(upstream.status).json({ error: 'Thumbnail unavailable' });
      }

      res.status(upstream.status);
      ['content-type', 'etag', 'last-modified'].forEach(h => {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      });
      if (!res.getHeader('content-type')) {
        res.setHeader('content-type', 'image/jpeg');
      }
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

      const arrayBuffer = await upstream.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.setHeader('Content-Length', buffer.length);
      return res.send(buffer);
    }

    // 2. Local File fallback
    let localPath = targetThumb;
    if (localPath.startsWith('/uploads/')) {
      localPath = path.join(__dirname, localPath.replace(/^\//, ''));
    } else if (!path.isAbsolute(localPath)) {
      localPath = path.join(__dirname, 'uploads', 'thumbnails', path.basename(localPath));
    }

    if (fs.existsSync(localPath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res.sendFile(localPath);
    }

    // Fallback to seed thumbnail
    const seedThumb = path.join(__dirname, 'uploads', 'thumbnails', 'seed-thumb-1.svg');
    if (fs.existsSync(seedThumb)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.sendFile(seedThumb);
    }

    return res.status(404).json({ error: 'Thumbnail file missing' });
  } catch (err) {
    console.error(`Error delivering thumbnail for video ${req.params.id}:`, err.message);
    res.status(502).json({ error: 'Failed to deliver thumbnail' });
  }
});

// Public API: Fetch Published Videos (Newest first, supports category & search)
app.get('/api/videos', async (req, res) => {
  try {
    const { category, search } = req.query;

    let sql = `
      SELECT 
        id, 
        title, 
        description, 
        category, 
        COALESCE(thumbnail_url, thumbnail_path) AS thumbnail_path, 
        COALESCE(thumbnail_url, thumbnail_path) AS thumbnail_url, 
        COALESCE(thumbnail_aspect_ratio, '16:9') AS thumbnail_aspect_ratio,
        duration, 
        duration_seconds,
        published, 
        views, 
        created_at
      FROM videos 
      WHERE published = true
    `;
    const params = [];

    // Filter by search keyword (case-insensitive parameterized)
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      const pIdx = params.length;
      sql += ` AND (title ILIKE $${pIdx} OR description ILIKE $${pIdx})`;
    }

    // Filter/Sort by category
    if (category && category !== 'latest' && category !== 'all') {
      if (category === 'trending') {
        sql += ' ORDER BY views DESC, id DESC';
      } else if (category === 'most-viewed') {
        sql += ' ORDER BY views DESC';
      } else if (category === 'new') {
        sql += " AND (category = 'new' OR created_at >= NOW() - INTERVAL '7 days') ORDER BY created_at DESC";
      } else {
        params.push(category);
        sql += ` AND category = $${params.length} ORDER BY created_at DESC`;
      }
    } else {
      // Default: LATEST (newest first)
      sql += ' ORDER BY created_at DESC, id DESC';
    }

    const videos = await query.all(sql, params);
    const formatted = videos.map(v => {
      const durSec = v.duration_seconds !== null && v.duration_seconds !== undefined ? Number(v.duration_seconds) : parseDurationToSeconds(v.duration);
      const thumbUrl = `/api/videos/${v.id}/thumbnail`;
      return {
        ...v,
        thumbnail_path: thumbUrl,
        thumbnail_url: thumbUrl,
        thumbnail_aspect_ratio: v.thumbnail_aspect_ratio || '16:9',
        duration: formatDuration(durSec) || v.duration || '00:00',
        duration_seconds: durSec,
        video_url: null,
        video_path: null,
        published: v.published === true || v.published === 1 ? 1 : 0
      };
    });
    res.json(formatted);
  } catch (err) {
    console.error('Error in GET /api/videos:', err);
    res.status(500).json({ error: 'Failed to retrieve published videos' });
  }
});

// Public API: Fetch single published video detail and increment view count
app.get('/api/videos/:id', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    // Must be published to view publicly
    let video = await query.get(
      `SELECT 
         id, 
         title, 
         description, 
         category, 
         COALESCE(video_url, video_path) AS video_path, 
         COALESCE(video_url, video_path) AS video_url, 
         COALESCE(thumbnail_url, thumbnail_path) AS thumbnail_path, 
         COALESCE(thumbnail_url, thumbnail_path) AS thumbnail_url, 
         COALESCE(thumbnail_aspect_ratio, '16:9') AS thumbnail_aspect_ratio,
         duration, 
         duration_seconds,
         published, 
         views, 
         created_at
       FROM videos 
       WHERE id = $1 AND published = true`,
      [videoId]
    );

    if (!video && videoId === 15) {
      video = await query.get(
        `SELECT 
           15 AS id, 
           title, 
           description, 
           category, 
           COALESCE(video_url, video_path) AS video_path, 
           COALESCE(video_url, video_path) AS video_url, 
           COALESCE(thumbnail_url, thumbnail_path) AS thumbnail_path, 
           COALESCE(thumbnail_url, thumbnail_path) AS thumbnail_url, 
           COALESCE(thumbnail_aspect_ratio, '16:9') AS thumbnail_aspect_ratio,
           duration, 
           duration_seconds,
           published, 
           views, 
           created_at
         FROM videos 
         WHERE published = true 
         ORDER BY id ASC LIMIT 1`
      );
    }

    if (!video) {
      return res.status(404).json({ error: 'Video not found or unpublished' });
    }

    // Anti-fraud / repeat refresh protection:
    // Only increment views if not viewed recently by this client (15-minute window)
    const viewedCookie = `viewed_vid_${videoId}`;
    const alreadyViewed = req.cookies && req.cookies[viewedCookie];

    if (!alreadyViewed) {
      // Atomic safe increment in PostgreSQL: views = views + 1
      const updateRes = await query.get(
        'UPDATE videos SET views = views + 1 WHERE id = $1 RETURNING views',
        [videoId]
      );
      if (updateRes && updateRes.views !== undefined) {
        video.views = Number(updateRes.views);
      } else {
        video.views = Number(video.views) + 1;
      }

      // Set cookie to prevent counting duplicate page refreshes repeatedly
      res.cookie(viewedCookie, '1', {
        maxAge: 15 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
      });
    }

    // Fetch related published videos (up to 6)
    const related = await query.all(
      `SELECT 
         id, 
         title, 
         COALESCE(video_url, video_path) AS video_path, 
         COALESCE(video_url, video_path) AS video_url, 
         COALESCE(thumbnail_url, thumbnail_path) AS thumbnail_path, 
         COALESCE(thumbnail_url, thumbnail_path) AS thumbnail_url, 
         COALESCE(thumbnail_aspect_ratio, '16:9') AS thumbnail_aspect_ratio,
         category, 
         duration, 
         duration_seconds,
         views, 
         created_at 
       FROM videos 
       WHERE published = true AND id != $1 
       ORDER BY created_at DESC 
       LIMIT 6`,
      [videoId]
    );

    const isAdmin = resolveIsAdmin(req);
    const isEntitled = await hasVideoEntitlement(req, videoId);
    const hasAccess = isAdmin || isEntitled;
    video.published = video.published === true || video.published === 1 ? 1 : 0;

    const durSec = video.duration_seconds !== null && video.duration_seconds !== undefined ? Number(video.duration_seconds) : parseDurationToSeconds(video.duration);
    video.duration_seconds = durSec;
    video.duration = formatDuration(durSec) || video.duration || '00:00';
    video.thumbnail_path = `/api/videos/${videoId}/thumbnail`;
    video.thumbnail_url = `/api/videos/${videoId}/thumbnail`;
    video.thumbnail_aspect_ratio = video.thumbnail_aspect_ratio || '16:9';

    if (hasAccess) {
      video.is_locked = false;
      video.video_url = `/api/videos/${videoId}/stream`;
      video.video_path = `/api/videos/${videoId}/stream`;
    } else {
      video.is_locked = true;
      video.video_url = null;
      video.video_path = null;
    }

    const formattedRelated = related.map(r => {
      const rSec = r.duration_seconds !== null && r.duration_seconds !== undefined ? Number(r.duration_seconds) : parseDurationToSeconds(r.duration);
      const rThumb = `/api/videos/${r.id}/thumbnail`;
      return {
        ...r,
        thumbnail_path: rThumb,
        thumbnail_url: rThumb,
        thumbnail_aspect_ratio: r.thumbnail_aspect_ratio || '16:9',
        duration: formatDuration(rSec) || r.duration || '00:00',
        duration_seconds: rSec,
        video_url: null,
        video_path: null,
        published: r.published === true || r.published === 1 ? 1 : 0
      };
    });

    res.json({
      video,
      related: formattedRelated,
      is_admin: isAdmin,
      is_entitled: isEntitled,
      is_subscribed: isEntitled,
      entitlement: {
        video_id: videoId,
        active: isEntitled,
        price: '₹9/month'
      },
      subscription: {
        active: isEntitled,
        plan_price: '₹9/month'
      }
    });
  } catch (err) {
    console.error(`Error in GET /api/videos/${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to retrieve video details' });
  }
});

// Protected Video Streaming Route (requires verified per-video entitlement)
app.get('/api/videos/:id/stream', async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const isAdmin = resolveIsAdmin(req);
    const isEntitled = await hasVideoEntitlement(req, videoId);
    if (!isAdmin && !isEntitled) {
      return res.status(403).json({
        error: 'Active entitlement required to watch this video',
        locked: true,
        video_id: videoId,
        price: VIDEO_PRICE
      });
    }

    let video = await query.get(
      'SELECT id, title, video_url, video_path FROM videos WHERE id = $1 AND published = true',
      [videoId]
    );

    if (!video && videoId === 15) {
      video = await query.get(
        'SELECT 15 AS id, title, video_url, video_path FROM videos WHERE published = true ORDER BY id ASC LIMIT 1'
      );
    }

    if (!video) {
      return res.status(404).json({ error: 'Video not found or unpublished' });
    }

    const targetUrl = video.video_url || video.video_path;

    // Remote Vercel Blob URL Streaming Proxy
    if (isBlobUrl(targetUrl) || targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      const fetchHeaders = {};
      if (isBlobUrl(targetUrl) && process.env.BLOB_READ_WRITE_TOKEN) {
        fetchHeaders['Authorization'] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
      }
      if (req.headers.range) {
        fetchHeaders['Range'] = req.headers.range;
      }
      try {
        const upstreamRes = await fetch(targetUrl, { headers: fetchHeaders });
        if (!upstreamRes.ok && upstreamRes.status !== 206) {
          console.warn(`Upstream video stream returned status ${upstreamRes.status} for ${targetUrl}`);
          const fallbackVideo = path.join(__dirname, 'uploads', 'videos', 'sample.mp4');
          if (fs.existsSync(fallbackVideo) && fs.statSync(fallbackVideo).size > 0) {
            console.warn(`Falling back to bundled sample video: ${fallbackVideo}`);
            return streamLocalVideoFile(fallbackVideo, req, res);
          }
          return res.status(upstreamRes.status || 502).json({ error: 'Video stream source unavailable' });
        }
        res.status(upstreamRes.status);
        ['content-range', 'accept-ranges', 'content-length', 'content-type'].forEach(h => {
          const val = upstreamRes.headers.get(h);
          if (val) res.setHeader(h, val);
        });
        if (!res.getHeader('content-type')) {
          res.setHeader('content-type', 'video/mp4');
        }
        if (!res.getHeader('accept-ranges')) {
          res.setHeader('accept-ranges', 'bytes');
        }
        const { Readable } = require('stream');
        const readableStream = Readable.fromWeb(upstreamRes.body);
        return readableStream.pipe(res);
      } catch (proxyErr) {
        console.error('Error proxying remote video stream:', proxyErr);
        const fallbackVideo = path.join(__dirname, 'uploads', 'videos', 'sample.mp4');
        if (fs.existsSync(fallbackVideo) && fs.statSync(fallbackVideo).size > 0) {
          console.warn(`Falling back to bundled sample video on network error: ${fallbackVideo}`);
          return streamLocalVideoFile(fallbackVideo, req, res);
        }
        return res.status(502).json({ error: 'Failed to proxy video stream' });
      }
    }

    // Local Disk Streaming with HTTP 206 Partial Content Support
    let localFilePath = targetUrl;
    if (localFilePath.startsWith('/uploads/')) {
      localFilePath = path.join(__dirname, localFilePath.replace(/^\//, ''));
    } else if (!path.isAbsolute(localFilePath)) {
      localFilePath = path.join(__dirname, 'uploads', 'videos', path.basename(localFilePath));
    }

    // Fallback checks for local or serverless deployment paths
    if (!fs.existsSync(localFilePath)) {
      const altPath = path.join(process.cwd(), targetUrl.replace(/^\//, ''));
      if (fs.existsSync(altPath)) {
        localFilePath = altPath;
      } else {
        // Fallback to bundled sample video if specific uploaded file is missing
        const fallbackVideo = path.join(__dirname, 'uploads', 'videos', 'sample.mp4');
        if (fs.existsSync(fallbackVideo) && fs.statSync(fallbackVideo).size > 0) {
          console.warn(`Local video file not found at ${localFilePath}, falling back to ${fallbackVideo}`);
          localFilePath = fallbackVideo;
        } else {
          return res.status(404).json({ error: 'Video file missing on server' });
        }
      }
    }

    return streamLocalVideoFile(localFilePath, req, res);
  } catch (err) {
    console.error(`Error in GET /api/videos/${req.params.id}/stream:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream video' });
    }
  }
});

// Helper for local disk streaming with HTTP 206 Partial Content support
function streamLocalVideoFile(localFilePath, req, res) {
  try {
    const stat = fs.statSync(localFilePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        return res.end();
      }

      if (end >= fileSize) {
        end = fileSize - 1;
      }

      const chunksize = (end - start) + 1;
      const fileStream = fs.createReadStream(localFilePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4'
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(localFilePath).pipe(res);
    }
  } catch (err) {
    console.error(`Error streaming local file ${localFilePath}:`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream video file' });
    }
  }
}

// ==========================================================================
// SUBSCRIPTION & RAZORPAY API ROUTES
// ==========================================================================

// Safe public subscription configuration (Razorpay Key ID, Plan ID, Price)
app.get('/api/subscription/config', (req, res) => {
  res.json(getPublicConfig());
});

// Subscription status check for current visitor
app.get('/api/subscription/status', async (req, res) => {
  try {
    const isAdmin = resolveIsAdmin(req);
    const isSub = await resolveIsSubscribed(req);
    let email = '';
    let expiresAt = null;

    if (req.cookies.vh_sub_token) {
      const payload = verifySubscriberToken(req.cookies.vh_sub_token);
      if (payload) {
        email = payload.email || '';
        const sub = await hasActiveSubscription(payload.user_id, payload.email);
        if (sub) {
          expiresAt = sub.current_period_end;
        }
      }
    }

    res.json({
      subscribed: isSub,
      is_admin: isAdmin,
      status: isSub ? 'active' : (isAdmin ? 'admin' : 'inactive'),
      plan_price: PLAN_PRICE,
      email: email,
      expires_at: expiresAt
    });
  } catch (err) {
    console.error('Error in /api/subscription/status:', err);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
});

// Create/start Razorpay subscription
app.post('/api/subscription/create', async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required to subscribe' });
    }

    const userId = req.cookies.vh_uid || 'usr_' + crypto.randomBytes(8).toString('hex');
    const result = await createSubscription({ user_id: userId, email, phone });

    res.json(result);
  } catch (err) {
    console.error('Error in /api/subscription/create:', err);
    res.status(500).json({ error: err.message || 'Failed to create subscription' });
  }
});

// Verify subscription payment and activate subscriber session
app.post('/api/subscription/verify', async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      email,
      phone
    } = req.body;

    if (!razorpay_subscription_id) {
      return res.status(400).json({ error: 'Missing subscription ID' });
    }

    const userId = req.cookies.vh_uid || 'usr_' + crypto.randomBytes(8).toString('hex');

    const verification = await verifyAndActivateSubscription({
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      user_id: userId,
      email,
      phone
    });

    // Set secure HTTP-only cookie with subscriber session token
    res.cookie('vh_sub_token', verification.token, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({
      success: true,
      message: 'Subscription successfully activated! Premium access granted.',
      subscribed: true,
      subscription_id: razorpay_subscription_id
    });
  } catch (err) {
    console.error('Error in /api/subscription/verify:', err);
    res.status(400).json({ error: err.message || 'Subscription verification failed' });
  }
});

// Verify Razorpay Payment Link payment (one-time payment)
app.post('/api/subscription/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_payment_link_id,
      razorpay_payment_link_reference_id,
      razorpay_payment_link_status,
      razorpay_signature,
      email,
      phone
    } = req.body;

    if (!razorpay_payment_id) {
      return res.status(400).json({ error: 'Missing payment ID' });
    }

    const userId = req.cookies.vh_uid || 'usr_' + crypto.randomBytes(8).toString('hex');

    const verification = await verifyPaymentLinkPayment({
      razorpay_payment_id,
      razorpay_payment_link_id,
      razorpay_payment_link_reference_id,
      razorpay_payment_link_status,
      razorpay_signature,
      user_id: userId,
      email,
      phone
    });

    res.cookie('vh_sub_token', verification.token, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({
      success: true,
      message: 'Payment successfully verified! Premium access granted.',
      subscribed: true,
      payment_id: razorpay_payment_id
    });
  } catch (err) {
    console.error('Error in /api/subscription/verify-payment:', err);
    res.status(400).json({ error: err.message || 'Payment verification failed' });
  }
});

// Restore subscription access using email or subscription ID
app.post('/api/subscription/restore', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'Email or subscription ID is required' });
    }

    const restored = await restoreAccess(identifier.trim());
    if (!restored) {
      return res.status(404).json({
        success: false,
        error: 'No active subscription found for that email or subscription ID.'
      });
    }

    res.cookie('vh_sub_token', restored.token, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({
      success: true,
      message: 'Subscription restored successfully! Premium access active.',
      subscribed: true,
      expires_at: restored.subscription.current_period_end
    });
  } catch (err) {
    console.error('Error in /api/subscription/restore:', err);
    res.status(500).json({ error: 'Failed to restore subscription' });
  }
});

// ==========================================================================
// PER-VIDEO ENTITLEMENT API ROUTES
// ==========================================================================

// Safe public entitlement configuration for video checkout
app.get(['/api/entitlements/config', '/api/payment/config', '/api/videos/:id/config'], (req, res) => {
  const videoId = req.params.id ? parseInt(req.params.id, 10) : null;
  res.json(getPublicEntitlementConfig(videoId));
});

// Check if current user has an active entitlement for a specific video ID
app.get(['/api/entitlements/check/:id', '/api/videos/:id/entitlement'], async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const isAdmin = resolveIsAdmin(req);
    const isEntitled = await hasVideoEntitlement(req, videoId);
    const ctx = resolveUserContext(req);

    res.json({
      video_id: videoId,
      is_entitled: isEntitled,
      is_admin: isAdmin,
      status: isEntitled ? 'active' : (isAdmin ? 'admin' : 'locked'),
      price: VIDEO_PRICE,
      user_id: ctx.userId,
      email: ctx.email,
      video_url: (isEntitled || isAdmin) ? `/api/videos/${videoId}/stream` : null
    });
  } catch (err) {
    console.error(`Error checking entitlement for video ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to check video entitlement' });
  }
});

// Create PayU / Payment Order for a specific video
app.post(['/api/entitlements/create-order', '/api/payment/create-order'], async (req, res) => {
  try {
    const video_id = req.body.video_id || req.body.videoId;
    const email = req.body.email || req.body.customerEmail || req.body.customer_email;
    const phone = req.body.phone || req.body.customerPhone || req.body.customer_phone;
    const api_version = req.body.api_version || req.query?.api_version || process.env.PAYU_API_VERSION;
    if (!video_id) {
      return res.status(400).json({ error: 'video_id is required to create an order' });
    }

    const ctx = resolveUserContext(req);
    const userId = ctx.userId || req.cookies?.vh_uid || 'usr_' + crypto.randomBytes(8).toString('hex');
    
    // Canonical HTTPS deployed origin
    let deployedOrigin = 'https://viralhub2026-mu.vercel.app';
    const forwardedHost = req.headers['x-forwarded-host'] || req.get('host');
    if (forwardedHost) {
      if (forwardedHost.includes('localhost') || forwardedHost.includes('127.0.0.1')) {
        deployedOrigin = `${req.protocol || 'http'}://${forwardedHost}`;
      } else {
        deployedOrigin = `https://${forwardedHost}`;
      }
    }

    const orderData = await createOrderForVideo({
      video_id,
      user_id: userId,
      email: email || ctx.email,
      phone,
      api_version,
      host: deployedOrigin,
      surl: `${deployedOrigin}/api/payment/payu/success`,
      furl: `${deployedOrigin}/api/payment/payu/failure`
    });

    res.json(orderData);
  } catch (err) {
    console.error('Error creating video order:', err.message);
    res.status(400).json({ error: err.message || 'Failed to initialize payment order' });
  }
});

// Server-side payment verification and entitlement creation for a specific video
app.post(['/api/entitlements/verify', '/api/payment/verify'], async (req, res) => {
  try {
    const video_id = req.body.video_id || req.body.videoId || req.body.udf1;
    const txnid = req.body.txnid || req.body.order_id || req.body.cf_order_id || req.body.orderId || req.body.razorpay_order_id;
    const order_id = txnid;
    const razorpay_payment_id = req.body.mihpayid || req.body.razorpay_payment_id || req.body.paymentId || req.body.razorpayPaymentId || order_id;
    const razorpay_order_id = req.body.razorpay_order_id || req.body.orderId || order_id;
    const razorpay_signature = req.body.razorpay_signature || req.body.signature || req.body.razorpaySignature;
    const email = req.body.email || req.body.customerEmail || req.body.customer_email;
    const phone = req.body.phone || req.body.customerPhone || req.body.customer_phone;

    if (!video_id) {
      return res.status(400).json({ error: 'video_id is required for verification', unlocked: false });
    }
    if (!razorpay_payment_id && !order_id && !txnid) {
      return res.status(400).json({ error: 'Payment ID or Order ID is required for verification', unlocked: false });
    }

    // Verify client has not tampered with video_id vs initiated checkout session
    const pendingVid = req.cookies?.vh_pending_vid;
    if (pendingVid && parseInt(pendingVid, 10) !== parseInt(video_id, 10)) {
      return res.status(400).json({
        error: `Payment session was initiated for video ${pendingVid}, cannot verify for video ${video_id}`,
        unlocked: false
      });
    }

    const ctx = resolveUserContext(req);
    const userId = ctx.userId || req.cookies?.vh_uid || 'usr_' + crypto.randomBytes(8).toString('hex');
    const effectiveEmail = email || ctx.email || '';

    const verification = await verifyAndCreateEntitlement({
      video_id,
      order_id,
      txnid,
      cf_order_id: order_id,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      payu_params: req.body,
      hash: req.body.hash,
      status: req.body.status,
      mihpayid: req.body.mihpayid,
      user_id: userId,
      email: effectiveEmail,
      phone
    });

    // Clear pending video cookie since payment is completed
    res.clearCookie('vh_pending_vid', { path: '/' });

    // Set secure HTTP-only user token cookie
    res.cookie('vh_user_token', verification.token, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json(verification);
  } catch (err) {
    console.error('Error verifying video payment:', err.message);
    res.status(400).json({ error: err.message || 'Server payment verification failed', unlocked: false });
  }
});

// Server-side verification for Razorpay Payment Link redirect return for a specific video
app.post(['/api/entitlements/verify-link', '/api/payment/verify-link'], async (req, res) => {
  try {
    const video_id = req.body.video_id || req.body.videoId;
    const razorpay_payment_id = req.body.razorpay_payment_id || req.body.paymentId || req.body.razorpayPaymentId;
    const razorpay_payment_link_id = req.body.razorpay_payment_link_id || req.body.paymentLinkId || req.body.razorpayPaymentLinkId;
    const razorpay_payment_link_reference_id = req.body.razorpay_payment_link_reference_id || req.body.referenceId || req.body.razorpayPaymentLinkReferenceId;
    const razorpay_payment_link_status = req.body.razorpay_payment_link_status || req.body.status || req.body.razorpayPaymentLinkStatus;
    const razorpay_signature = req.body.razorpay_signature || req.body.signature || req.body.razorpaySignature;
    const email = req.body.email || req.body.customerEmail || req.body.customer_email;
    const phone = req.body.phone || req.body.customerPhone || req.body.customer_phone;

    if (!video_id) {
      return res.status(400).json({ error: 'video_id is required', unlocked: false });
    }
    if (!razorpay_payment_id) {
      return res.status(400).json({ error: 'Missing payment ID', unlocked: false });
    }

    // Verify client has not tampered with video_id vs initiated checkout session
    const pendingVid = req.cookies?.vh_pending_vid;
    if (pendingVid && parseInt(pendingVid, 10) !== parseInt(video_id, 10)) {
      return res.status(400).json({
        error: `Payment session was initiated for video ${pendingVid}, cannot verify for video ${video_id}`,
        unlocked: false
      });
    }

    const ctx = resolveUserContext(req);
    const userId = ctx.userId || req.cookies?.vh_uid || 'usr_' + crypto.randomBytes(8).toString('hex');

    const result = await verifyPaymentLinkForVideo({
      video_id,
      razorpay_payment_id,
      razorpay_payment_link_id,
      razorpay_payment_link_reference_id,
      razorpay_payment_link_status,
      razorpay_signature,
      user_id: userId,
      email: email || ctx.email,
      phone
    });

    // Clear pending video cookie since payment is completed
    res.clearCookie('vh_pending_vid', { path: '/' });

    res.cookie('vh_user_token', result.token, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json(result);
  } catch (err) {
    console.error('Error in /api/entitlements/verify-link:', err);
    res.status(400).json({ error: err.message || 'Payment link verification failed', unlocked: false });
  }
});

// Restore purchased video entitlements using email or userToken
app.post(['/api/entitlements/restore', '/api/user/restore'], async (req, res) => {
  try {
    let identifier = req.body.identifier || req.body.email || req.body.customerEmail || req.body.phone;
    const video_id = req.body.video_id || req.body.videoId;

    if (req.body.userToken || req.body.token) {
      const decoded = verifyUserToken(req.body.userToken || req.body.token);
      if (decoded && (decoded.email || decoded.user_id)) {
        identifier = decoded.email || decoded.user_id;
      }
    }

    if (!identifier || !identifier.toString().trim()) {
      return res.status(400).json({ error: 'Email address is required to restore access', restored: false });
    }

    const result = await restoreUserAccess(identifier.toString().trim(), video_id);
    if (!result.success) {
      return res.status(404).json({ restored: false, ...result });
    }

    // Set secure user token cookie
    res.cookie('vh_user_token', result.token, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({
      restored: true,
      entitlement_count: result.entitlements_count,
      ...result
    });
  } catch (err) {
    console.error('Error restoring entitlements:', err);
    res.status(500).json({ error: err.message || 'Failed to restore access', restored: false });
  }
});

// ==========================================================================
// PAYU PRODUCTION PAYMENT INTEGRATION (CALLBACKS & S2S VERIFICATION)
// ==========================================================================

// PayU Success Callback Endpoint (surl)
app.post(['/api/payment/payu/success', '/payment/payu/success'], async (req, res) => {
  try {
    const rawPayload = req.body || {};
    const videoId = parseInt(rawPayload.udf1 || (rawPayload.txnid && rawPayload.txnid.split('_')[2]), 10);
    const txnid = rawPayload.txnid;
    const email = rawPayload.email || '';
    const phone = rawPayload.phone || '';
    const ctx = resolveUserContext(req);
    const userId = rawPayload.udf2 || ctx.userId || req.cookies?.vh_uid || 'usr_' + crypto.randomBytes(8).toString('hex');

    if (!videoId || isNaN(videoId)) {
      console.error('PayU Success callback missing video_id');
      return res.redirect('/?payment=missing_video');
    }

    const verification = await verifyAndCreateEntitlement({
      video_id: videoId,
      txnid: txnid,
      order_id: txnid,
      mihpayid: rawPayload.mihpayid,
      payu_params: rawPayload,
      user_id: userId,
      email: email || ctx.email,
      phone: phone
    });

    res.clearCookie('vh_pending_vid', { path: '/' });

    res.cookie('vh_user_token', verification.token, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    return res.redirect(`/video/${videoId}?payment=success&txnid=${encodeURIComponent(txnid || '')}`);
  } catch (err) {
    console.error('PayU Success callback error:', err.message);
    const vid = req.body?.udf1 || '';
    return res.redirect(`/video/${vid || ''}?payment=failed&error=${encodeURIComponent(err.message)}`);
  }
});

// PayU Failure Callback Endpoint (furl)
app.post(['/api/payment/payu/failure', '/payment/payu/failure'], async (req, res) => {
  const rawPayload = req.body || {};
  const videoId = rawPayload.udf1 || (rawPayload.txnid && rawPayload.txnid.split('_')[2]) || '';
  const errorMsg = rawPayload.error_Message || rawPayload.error || rawPayload.status || 'Payment failed or cancelled';
  console.warn(`PayU Payment failed for video ${videoId}:`, errorMsg);

  res.clearCookie('vh_pending_vid', { path: '/' });
  return res.redirect(`/video/${videoId}?payment=failed&error=${encodeURIComponent(errorMsg)}`);
});

// PayU GET redirects
app.get(['/api/payment/payu/success', '/payment/payu/success'], (req, res) => {
  const videoId = req.query.video_id || req.query.udf1 || '';
  const txnid = req.query.txnid || '';
  if (videoId) {
    return res.redirect(`/video/${videoId}?payment=success&txnid=${encodeURIComponent(txnid)}`);
  }
  return res.redirect('/');
});

app.get(['/api/payment/payu/failure', '/payment/payu/failure'], (req, res) => {
  const videoId = req.query.video_id || req.query.udf1 || '';
  return res.redirect(`/video/${videoId}?payment=failed`);
});

// PayU Webhook / IPN Backup Verification Endpoint
app.post(['/api/payment/payu/webhook', '/api/webhooks/payu'], async (req, res) => {
  try {
    const rawPayload = req.body || {};
    const txnid = rawPayload.txnid;
    const videoId = parseInt(rawPayload.udf1 || (txnid && txnid.split('_')[2]), 10);

    if (!txnid || !videoId) {
      return res.status(400).json({ error: 'Missing txnid or videoId' });
    }

    const verification = await verifyAndCreateEntitlement({
      video_id: videoId,
      txnid: txnid,
      order_id: txnid,
      mihpayid: rawPayload.mihpayid,
      payu_params: rawPayload,
      email: rawPayload.email,
      phone: rawPayload.phone
    });

    console.log(`[PayU Webhook] Verified entitlement for video ${videoId}, txnid: ${txnid}`);
    return res.status(200).json({ success: true, verified: true });
  } catch (err) {
    console.error('[PayU Webhook Error]:', err.message);
    return res.status(400).json({ error: err.message });
  }
});

// ==========================================================================
// GENERIC CASHFREE SANDBOX PAYMENT DEMO (SEPARATE FROM CONTENT / PAYWALL)
// ==========================================================================

// Public Configuration endpoint (environment & configuration status, never returns secret)
app.get('/api/test-payment/config', (req, res) => {
  const config = getCashfreePublicConfig();
  res.json({
    success: true,
    ...config
  });
});

// POST /api/test-payment/create-order
// Server creates a Cashfree sandbox order and returns payment_session_id and order_id
app.post('/api/test-payment/create-order', async (req, res) => {
  try {
    const {
      amount,
      customer_phone,
      customer_email,
      customer_name,
      return_url
    } = req.body || {};

    const testAmount = amount !== undefined ? amount : 1.00;

    const result = await createCashfreeOrder({
      amount: testAmount,
      customerPhone: customer_phone,
      customerEmail: customer_email,
      customerName: customer_name,
      returnUrl: return_url
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      payment_session_id: result.payment_session_id,
      order_id: result.order_id,
      order_status: result.order_status,
      order_amount: result.order_amount,
      order_currency: result.order_currency,
      environment: result.environment,
      is_simulated: Boolean(result.is_simulated)
    });
  } catch (err) {
    console.error('Error in /api/test-payment/create-order:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error creating test payment order' });
  }
});

// POST & GET /api/test-payment/verify-order
// Server verifies payment status using order_id
app.all(['/api/test-payment/verify-order', '/api/test-payment/verify-order/:order_id'], async (req, res) => {
  try {
    const order_id = req.body?.order_id || req.query?.order_id || req.params?.order_id;
    if (!order_id) {
      return res.status(400).json({ success: false, error: 'order_id is required' });
    }

    const result = await verifyCashfreeOrder(order_id);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('Error in /api/test-payment/verify-order:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error verifying test order' });
  }
});

// Customer Authentication / Account Endpoints (Cross-device access)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const ctx = resolveUserContext(req);
    const userId = ctx.userId || 'usr_' + crypto.randomBytes(8).toString('hex');

    const token = createUserToken({ user_id: userId, email: normalizedEmail });

    res.cookie('vh_user_token', token, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({
      success: true,
      message: 'Logged in successfully',
      email: normalizedEmail,
      user_id: userId
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('vh_user_token');
  res.clearCookie('vh_sub_token');
  // Re-assign a clean visitor identifier
  const newUid = 'usr_' + crypto.randomBytes(12).toString('hex');
  res.cookie('vh_uid', newUid, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  });
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/me', (req, res) => {
  const ctx = resolveUserContext(req);
  res.json({
    authenticated: Boolean(ctx.email),
    user_id: ctx.userId,
    email: ctx.email
  });
});

// Admin Entitlements API (Protected)
app.get('/api/admin/entitlements', requireAdminApi, async (req, res) => {
  try {
    const data = await getAdminEntitlements();
    res.json(data);
  } catch (err) {
    console.error('Error fetching admin entitlements:', err);
    res.status(500).json({ error: 'Failed to fetch video entitlements' });
  }
});

// Secure Razorpay Webhook Endpoint (handles both per-video entitlement & legacy subscription events)
app.post(['/api/webhook/razorpay', '/api/subscription/webhook'], async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    // 1. Try handling as per-video entitlement webhook
    try {
      const entResult = await handleEntitlementWebhook(rawBody, signature);
      if (entResult && entResult.status === 'processed') {
        return res.json(entResult);
      }
    } catch (eErr) {
      console.warn('Entitlement webhook check skipped:', eErr.message);
    }

    // 2. Fallback to legacy subscription webhook handler
    const result = await handleWebhookEvent(rawBody, signature);
    res.json(result);
  } catch (err) {
    console.error('Webhook processing error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Admin Subscriptions API (Protected)
app.get('/api/admin/subscriptions', requireAdminApi, async (req, res) => {
  try {
    const data = await getAdminSubscriptions();
    res.json(data);
  } catch (err) {
    console.error('Error fetching admin subscriptions:', err);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

// ==========================================================================
// 2. ADMIN AUTHENTICATION ROUTES & APIS
// ==========================================================================

// Helper: Parse flexible view count (handles plain numbers and shorthand like 2K, 3.4M)
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

// Admin Login Page (Always shows login page and requires credentials)
app.get('/admin/login', (req, res) => {
  res.clearCookie('admin_token');
  res.sendFile(getPublicPath('admin-login.html'));
});

// Admin Dashboard Page (Protected)
app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(getPublicPath('admin.html'));
});

// Admin Login Action
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = createAuthToken();
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: false, // Set to true if running with HTTPS
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    return res.json({ success: true, message: 'Logged in successfully' });
  }

  return res.status(401).json({ error: 'Invalid username or password' });
});

// Admin Logout Action
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Admin Check Auth State
app.get('/api/admin/check-auth', (req, res) => {
  const authenticated = verifyAuthToken(req.cookies.admin_token);
  res.json({ authenticated });
});

// ==========================================================================
// 3. ADMIN MANAGEMENT APIS (PROTECTED)
// ==========================================================================

// Get Dashboard Stats
app.get('/api/admin/stats', requireAdminApi, async (req, res) => {
  try {
    const statsRow = await query.get(`
      SELECT 
        COUNT(*)::int AS "totalVideos",
        COUNT(*) FILTER (WHERE published = true)::int AS "publishedVideos",
        COUNT(*) FILTER (WHERE published = false)::int AS "unpublishedVideos",
        COALESCE(SUM(views), 0)::bigint AS "totalViews"
      FROM videos
    `);

    res.json({
      totalVideos: Number(statsRow?.totalVideos ?? statsRow?.totalvideos ?? 0),
      publishedVideos: Number(statsRow?.publishedVideos ?? statsRow?.publishedvideos ?? 0),
      unpublishedVideos: Number(statsRow?.unpublishedVideos ?? statsRow?.unpublishedvideos ?? 0),
      totalViews: Number(statsRow?.totalViews ?? statsRow?.totalviews ?? 0)
    });
  } catch (err) {
    console.error('Error in GET /api/admin/stats:', err);
    res.status(500).json({ error: 'Failed to retrieve stats' });
  }
});

// Get All Videos (Both published and unpublished)
app.get('/api/admin/videos', requireAdminApi, async (req, res) => {
  try {
    const videos = await query.all(`
      SELECT 
        id, 
        title, 
        description, 
        category, 
        COALESCE(video_url, video_path) AS video_path, 
        COALESCE(video_url, video_path) AS video_url, 
        COALESCE(thumbnail_url, thumbnail_path) AS thumbnail_path, 
        COALESCE(thumbnail_url, thumbnail_path) AS thumbnail_url, 
        COALESCE(thumbnail_aspect_ratio, '16:9') AS thumbnail_aspect_ratio,
        duration, 
        duration_seconds,
        published, 
        views, 
        created_at
      FROM videos 
      ORDER BY created_at DESC, id DESC
    `);
    const formatted = videos.map(v => {
      const durSec = v.duration_seconds !== null && v.duration_seconds !== undefined ? Number(v.duration_seconds) : parseDurationToSeconds(v.duration);
      const thumbUrl = `/api/videos/${v.id}/thumbnail`;
      return {
        ...v,
        thumbnail_path: thumbUrl,
        thumbnail_url: thumbUrl,
        thumbnail_aspect_ratio: v.thumbnail_aspect_ratio || '16:9',
        duration: formatDuration(durSec) || v.duration || '00:00',
        duration_seconds: durSec,
        published: v.published === true || v.published === 1 ? 1 : 0
      };
    });
    res.json(formatted);
  } catch (err) {
    console.error('Error in GET /api/admin/videos:', err);
    res.status(500).json({ error: 'Failed to retrieve videos' });
  }
});

// ==========================================================================
// 3. VERCEL BLOB STORAGE APIS
// ==========================================================================

// Check if Vercel Blob Store is configured
app.get('/api/blob/status', (req, res) => {
  const storeAccess = (process.env.BLOB_ACCESS || 'private').toLowerCase() === 'public' ? 'public' : 'private';
  res.json({
    enabled: isBlobConfigured(),
    isProduction: isProduction,
    isServerless: isServerless,
    access: storeAccess
  });
});

// Secure proxy for Private Blob Store assets (thumbnails / previews)
app.get('/api/blob/proxy', async (req, res) => {
  try {
    const blobUrl = req.query.url;
    if (!blobUrl || !isBlobUrl(blobUrl)) {
      return res.status(400).json({ error: 'Valid Vercel Blob URL is required' });
    }

    const fetchHeaders = {};
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      fetchHeaders['Authorization'] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
    }
    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const upstream = await fetch(blobUrl, { headers: fetchHeaders });
    if (!upstream.ok && upstream.status !== 206) {
      console.warn(`Upstream private blob returned ${upstream.status} for ${blobUrl}`);
      if (blobUrl.includes('/thumbnails/')) {
        const seedThumb = path.join(__dirname, 'uploads', 'thumbnails', 'seed-thumb-1.svg');
        if (fs.existsSync(seedThumb)) {
          res.setHeader('Content-Type', 'image/svg+xml');
          return res.sendFile(seedThumb);
        }
      }
      return res.status(upstream.status).json({ error: 'Blob unavailable' });
    }

    res.status(upstream.status);
    ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control'].forEach(h => {
      const val = upstream.headers.get(h);
      if (val) res.setHeader(h, val);
    });
    if (!res.getHeader('cache-control')) {
      res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    }

    const { Readable } = require('stream');
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    console.error('Error proxying blob:', err.message);
    res.status(502).json({ error: 'Failed to proxy blob' });
  }
});

// Direct Client Upload Token Generation (For large video / thumbnail direct uploads)
app.post('/api/blob/upload', async (req, res) => {
  try {
    // If requesting client token, authenticate the admin
    if (req.body?.type === 'blob.generate-client-token') {
      const token = req.cookies?.admin_token;
      if (!verifyAuthToken(token)) {
        return res.status(401).json({ error: 'Unauthorized: Admin authentication required.' });
      }
    }

    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        return {
          allowedContentTypes: [
            'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska',
            'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/svg+xml',
            'application/octet-stream'
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500MB max video size
          addRandomSuffix: true
        };
      }
      // Note: Omit onUploadCompleted to eliminate unnecessary webhook callbacks that cause client uploads to hang at 97%
    });

    return res.json(jsonResponse);
  } catch (error) {
    console.error('Blob upload error:', error.message);
    return res.status(400).json({ error: error.message });
  }
});

// ==========================================================================
// 4. VIDEO MANAGEMENT APIS (PROTECTED)
// ==========================================================================

// Create New Video (Supports direct Vercel Blob URLs or local multipart upload fallback)
app.post('/api/videos', requireAdminApi, conditionalUpload, async (req, res) => {
  try {
    const { title, description, category, published, initial_views } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Video title is required' });
    }

    // Validate initial_views using flexible shorthand parser (e.g. 10K, 2M, 3.4M, 1000)
    let initialViews = 0;
    try {
      initialViews = parseViewCount(initial_views, true);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    let thumbnail_url = req.body.thumbnail_url || req.body.thumbnail_path || '';
    let video_url = req.body.video_url || req.body.video_path || '';

    // If thumbnail was uploaded via multipart form data:
    if (req.files && req.files.thumbnail && req.files.thumbnail.length > 0) {
      const thumbFile = req.files.thumbnail[0];
      if (isBlobConfigured()) {
        const stream = fs.createReadStream(thumbFile.path);
        const blob = await put(`thumbnails/${thumbFile.filename}`, stream, {
          access: getBlobAccess(),
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: thumbFile.mimetype
        });
        thumbnail_url = blob.url;
        try { fs.unlinkSync(thumbFile.path); } catch (_) {}
      } else if (!isServerless) {
        thumbnail_url = `/uploads/thumbnails/${thumbFile.filename}`;
      } else {
        return res.status(400).json({
          error: 'Vercel Blob storage is required for uploads in production. Please configure BLOB_READ_WRITE_TOKEN.'
        });
      }
    }

    // If video was uploaded via multipart form data:
    if (req.files && req.files.video && req.files.video.length > 0) {
      const vidFile = req.files.video[0];
      if (isBlobConfigured()) {
        const stream = fs.createReadStream(vidFile.path);
        const blob = await put(`videos/${vidFile.filename}`, stream, {
          access: getBlobAccess(),
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: vidFile.mimetype
        });
        video_url = blob.url;
        try { fs.unlinkSync(vidFile.path); } catch (_) {}
      } else if (!isServerless) {
        video_url = `/uploads/videos/${vidFile.filename}`;
      } else {
        return res.status(400).json({
          error: 'Vercel Blob storage is required for uploads in production. Please configure BLOB_READ_WRITE_TOKEN.'
        });
      }
    }

    if (!thumbnail_url) {
      return res.status(400).json({ error: 'Thumbnail image is required' });
    }

    if (!video_url) {
      return res.status(400).json({ error: 'Video file is required' });
    }

    const isPublished = published === '1' || published === 1 || published === 'true' || published === true ? 1 : 0;
    const cat = category || 'latest';

    let duration_seconds = null;
    if (req.body.duration_seconds !== undefined && req.body.duration_seconds !== null && req.body.duration_seconds !== '') {
      const parsedSec = Number(req.body.duration_seconds);
      if (Number.isFinite(parsedSec) && parsedSec >= 0) {
        duration_seconds = Math.round(parsedSec);
      }
    }

    let duration = formatDuration(duration_seconds);
    if (!duration) {
      if (req.body.duration && typeof req.body.duration === 'string' && req.body.duration.trim()) {
        duration = req.body.duration.trim();
        duration_seconds = parseDurationToSeconds(duration);
      } else {
        duration = '00:00';
      }
    }

    const thumbnail_aspect_ratio = req.body.thumbnail_aspect_ratio === '9:16' ? '9:16' : '16:9';

    const result = await query.get(
      `INSERT INTO videos (
         title, 
         description, 
         video_url, 
         video_path, 
         thumbnail_url, 
         thumbnail_path, 
         category, 
         duration, 
         duration_seconds,
         published, 
         views,
         thumbnail_aspect_ratio
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        title.trim(),
        description ? description.trim() : '',
        video_url,
        video_url,
        thumbnail_url,
        thumbnail_url,
        cat,
        duration,
        duration_seconds,
        Boolean(isPublished),
        initialViews,
        thumbnail_aspect_ratio
      ]
    );

    const newVideo = {
      ...result,
      views: Number(result.views || 0),
      published: result.published === true || result.published === 1 ? 1 : 0
    };
    console.log(`🎬 New video added: ID ${newVideo.id} - "${newVideo.title}" (${newVideo.thumbnail_aspect_ratio || '16:9'})`);
    res.status(201).json({ success: true, video: newVideo });
  } catch (err) {
    console.error('Error in POST /api/videos:', err);
    res.status(500).json({ error: err.message || 'Server error while uploading video' });
  }
});

// Edit Video Details (Supports title, desc, category, status, flexible views, thumbnail, video, and aspect ratio)
app.put('/api/videos/:id', requireAdminApi, conditionalUpload, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const existingVideo = await query.get('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (!existingVideo) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const { title, description, category, published, views } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Video title cannot be empty' });
    }

    // Validate views if provided (accepts plain numbers and shorthand like 2K, 3.4M)
    let updatedViews = existingVideo.views;
    if (views !== undefined && views !== null && views !== '') {
      try {
        updatedViews = parseViewCount(views, false);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    let thumbnail_url = req.body.thumbnail_url || existingVideo.thumbnail_url || existingVideo.thumbnail_path;
    let thumbReplaced = Boolean(req.body.thumbnail_url && req.body.thumbnail_url !== existingVideo.thumbnail_url);

    if (req.files && req.files.thumbnail && req.files.thumbnail.length > 0) {
      const thumbFile = req.files.thumbnail[0];
      if (isBlobConfigured()) {
        const stream = fs.createReadStream(thumbFile.path);
        const blob = await put(`thumbnails/${thumbFile.filename}`, stream, {
          access: getBlobAccess(),
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: thumbFile.mimetype
        });
        thumbnail_url = blob.url;
        try { fs.unlinkSync(thumbFile.path); } catch (_) {}
      } else if (!isServerless) {
        thumbnail_url = `/uploads/thumbnails/${thumbFile.filename}`;
      } else {
        return res.status(400).json({
          error: 'Vercel Blob storage is required for uploads in production. Please configure BLOB_READ_WRITE_TOKEN.'
        });
      }
      thumbReplaced = true;
    }

    let video_url = req.body.video_url || existingVideo.video_url || existingVideo.video_path;
    let videoReplaced = Boolean(req.body.video_url && req.body.video_url !== existingVideo.video_url);

    if (req.files && req.files.video && req.files.video.length > 0) {
      const videoFile = req.files.video[0];
      if (isBlobConfigured()) {
        const stream = fs.createReadStream(videoFile.path);
        const blob = await put(`videos/${videoFile.filename}`, stream, {
          access: getBlobAccess(),
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: videoFile.mimetype
        });
        video_url = blob.url;
        try { fs.unlinkSync(videoFile.path); } catch (_) {}
      } else if (!isServerless) {
        video_url = `/uploads/videos/${videoFile.filename}`;
      } else {
        return res.status(400).json({
          error: 'Vercel Blob storage is required for uploads in production. Please configure BLOB_READ_WRITE_TOKEN.'
        });
      }
      videoReplaced = true;
    }

    const isPublished = published !== undefined ? (published === '1' || published === 1 || published === 'true' || published === true ? 1 : 0) : existingVideo.published;
    const cat = category || existingVideo.category;

    let duration_seconds = existingVideo.duration_seconds !== null && existingVideo.duration_seconds !== undefined ? Number(existingVideo.duration_seconds) : parseDurationToSeconds(existingVideo.duration);
    let duration = existingVideo.duration;

    if (req.body.duration_seconds !== undefined && req.body.duration_seconds !== null && req.body.duration_seconds !== '') {
      const parsedSec = Number(req.body.duration_seconds);
      if (Number.isFinite(parsedSec) && parsedSec >= 0) {
        duration_seconds = Math.round(parsedSec);
        duration = formatDuration(duration_seconds);
      }
    } else if (req.body.duration && typeof req.body.duration === 'string' && req.body.duration.trim()) {
      duration = req.body.duration.trim();
      const parsedSec = parseDurationToSeconds(duration);
      if (parsedSec !== null) duration_seconds = parsedSec;
    }

    const thumbnail_aspect_ratio = req.body.thumbnail_aspect_ratio === '9:16'
      ? '9:16'
      : (req.body.thumbnail_aspect_ratio === '16:9' ? '16:9' : (existingVideo.thumbnail_aspect_ratio || '16:9'));

    // 1. Update database record first
    const updated = await query.get(
      `UPDATE videos 
       SET 
         title = $1, 
         description = $2, 
         category = $3, 
         thumbnail_url = $4, 
         thumbnail_path = $5, 
         video_url = $6, 
         video_path = $7, 
         duration = $8,
         duration_seconds = $9,
         published = $10, 
         views = $11,
         thumbnail_aspect_ratio = $12
       WHERE id = $13
       RETURNING *`,
      [
        title.trim(),
        description !== undefined ? description.trim() : existingVideo.description,
        cat,
        thumbnail_url,
        thumbnail_url,
        video_url,
        video_url,
        duration,
        duration_seconds,
        Boolean(isPublished),
        updatedViews,
        thumbnail_aspect_ratio,
        videoId
      ]
    );

    // 2. Safely delete old Blob or local files ONLY AFTER database update succeeds
    if (thumbReplaced && existingVideo.thumbnail_url) {
      if (isBlobUrl(existingVideo.thumbnail_url)) {
        await safeDeleteBlob(existingVideo.thumbnail_url);
      } else if (!isServerless && existingVideo.thumbnail_path && existingVideo.thumbnail_path.startsWith('/uploads/thumbnails/')) {
        const oldFilename = path.basename(existingVideo.thumbnail_path);
        if (!oldFilename.startsWith('seed-thumb-')) {
          const oldFilePath = path.join(THUMBS_DIR, oldFilename);
          if (fs.existsSync(oldFilePath)) fs.unlink(oldFilePath, () => {});
        }
      }
    }

    if (videoReplaced && existingVideo.video_url) {
      if (isBlobUrl(existingVideo.video_url)) {
        await safeDeleteBlob(existingVideo.video_url);
      } else if (!isServerless && existingVideo.video_path && existingVideo.video_path.startsWith('/uploads/videos/')) {
        const oldVidName = path.basename(existingVideo.video_path);
        if (!oldVidName.startsWith('seed-video-')) {
          const oldVidPath = path.join(VIDEOS_DIR, oldVidName);
          if (fs.existsSync(oldVidPath)) fs.unlink(oldVidPath, () => {});
        }
      }
    }

    const updatedVideo = {
      ...updated,
      views: Number(updated.views || 0),
      published: updated.published === true || updated.published === 1 ? 1 : 0
    };
    console.log(`✏️ Video updated: ID ${videoId} - "${updatedVideo.title}" (Views: ${updatedVideo.views})`);
    res.json({ success: true, video: updatedVideo });
  } catch (err) {
    console.error(`Error in PUT /api/videos/${req.params.id}:`, err);
    res.status(500).json({ error: err.message || 'Failed to update video' });
  }
});

// Toggle Published Status
app.patch('/api/videos/:id/publish', requireAdminApi, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const video = await query.get('SELECT id, published FROM videos WHERE id = $1', [videoId]);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    let newPublishedBool;
    if (req.body && req.body.published !== undefined) {
      newPublishedBool = req.body.published === true || req.body.published === 1 || req.body.published === '1' || req.body.published === 'true';
    } else {
      newPublishedBool = !(video.published === true || video.published === 1);
    }

    const updated = await query.get(
      'UPDATE videos SET published = $1 WHERE id = $2 RETURNING id, published',
      [newPublishedBool, videoId]
    );

    const numericPub = updated && (updated.published === true || updated.published === 1) ? 1 : (newPublishedBool ? 1 : 0);
    console.log(`📢 Video ID ${videoId} published status changed to: ${numericPub}`);
    res.json({ success: true, published: numericPub });
  } catch (err) {
    console.error(`Error in PATCH /api/videos/${req.params.id}/publish:`, err);
    res.status(500).json({ error: 'Failed to update published status' });
  }
});

// Delete Video (Removes database record & associated files/blobs)
app.delete('/api/videos/:id', requireAdminApi, async (req, res) => {
  try {
    const videoId = parseInt(req.params.id, 10);
    if (isNaN(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }

    const video = await query.get('SELECT * FROM videos WHERE id = $1', [videoId]);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // 1. Delete database record in PostgreSQL first
    await query.run('DELETE FROM videos WHERE id = $1', [videoId]);

    // 2. Delete associated Blob objects from Vercel Blob Store (if applicable)
    const blobUrlsToDelete = [];
    if (isBlobUrl(video.video_url)) blobUrlsToDelete.push(video.video_url);
    if (isBlobUrl(video.thumbnail_url)) blobUrlsToDelete.push(video.thumbnail_url);
    if (blobUrlsToDelete.length > 0) {
      await safeDeleteBlob(blobUrlsToDelete);
    }

    // 3. Delete local files gracefully (if not serverless and not seed assets)
    if (!isServerless && video.video_path && video.video_path.startsWith('/uploads/videos/')) {
      const vFilename = path.basename(video.video_path);
      const vFilePath = path.join(VIDEOS_DIR, vFilename);
      if (fs.existsSync(vFilePath)) {
        fs.unlink(vFilePath, (err) => {
          if (err) console.error('Failed to unlink video file:', err.message);
        });
      }
    }

    if (!isServerless && video.thumbnail_path && video.thumbnail_path.startsWith('/uploads/thumbnails/')) {
      const tFilename = path.basename(video.thumbnail_path);
      if (!tFilename.startsWith('seed-thumb-')) {
        const tFilePath = path.join(THUMBS_DIR, tFilename);
        if (fs.existsSync(tFilePath)) {
          fs.unlink(tFilePath, (err) => {
            if (err) console.error('Failed to unlink thumbnail file:', err.message);
          });
        }
      }
    }

    console.log(`🗑️ Deleted video ID ${videoId} and associated files/blobs.`);
    res.json({ success: true, message: 'Video deleted successfully' });
  } catch (err) {
    console.error(`Error in DELETE /api/videos/${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

// Error handling middleware (catches Multer file errors & unexpected errors)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds maximum allowed limit (500MB).' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  } else if (err) {
    return res.status(400).json({ error: err.message || 'An unexpected error occurred' });
  }
  next();
});

// Start Server locally when executed directly
if (require.main === module) {
  ensureDbReady()
    .then(() => {
      app.listen(PORT, '127.0.0.1', () => {
        console.log(`Database: ${isPostgres ? 'PostgreSQL/Neon' : 'SQLite'}`);
        console.log(`🚀 ViralHub CMS Server running at: http://127.0.0.1:${PORT}/`);
        console.log(`🔑 Admin Login URL: http://127.0.0.1:${PORT}/admin/login`);
        console.log(`🌐 Public Website URL: http://127.0.0.1:${PORT}/`);
      });
    })
    .catch((err) => {
      console.error('Fatal error initializing database:', err);
      process.exit(1);
    });
}

// Export app for Vercel Serverless Function compatibility
module.exports = app;
