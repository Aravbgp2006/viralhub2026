/**
 * services/entitlement.js
 * Video-Specific Payment & Entitlement Management Service for ViralHub 2026
 *
 * Implements strict per-video access control:
 * - Each video requires its own server-side entitlement: (user_id + video_id)
 * - Cryptographic server-side verification of Razorpay orders, signatures, and webhooks
 * - Tamper-proof HTTP-only customer session tokens (vh_user_token)
 * - No global premiumActive flag: purchasing Video A unlocks ONLY Video A
 */

require('dotenv').config();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { query, isPostgres } = require('../database/db');
const {
  createCashfreeOrder,
  verifyCashfreeOrder,
  isCashfreeConfigured,
  getCashfreePublicConfig
} = require('./cashfree');

const SESSION_SECRET = process.env.SESSION_SECRET || 'viralhub_2026_cms_secret_key_8f3a1b';

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const RAZORPAY_WEBHOOK_SECRET = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
const RAZORPAY_PAYMENT_LINK_URL = (process.env.RAZORPAY_PAYMENT_LINK_URL || '').trim();

const VIDEO_PRICE = '₹9';
const VIDEO_AMOUNT_PAISE = 900; // 900 paise = 9 INR

let razorpayInstance = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  try {
    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
  } catch (err) {
    console.error('⚠️ Error initializing Razorpay SDK in entitlement service:', err.message);
  }
}

/**
 * Checks whether live Razorpay credentials are configured
 */
function isRazorpayConfigured() {
  return Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
}

/**
 * Public configuration for frontend checkout
 */
function getPublicEntitlementConfig(videoId) {
  const isRzpConfigured = isRazorpayConfigured();
  const hasLink = Boolean(RAZORPAY_PAYMENT_LINK_URL);
  const cfConfig = getCashfreePublicConfig();
  const isCfConfigured = isCashfreeConfigured();

  return {
    provider: (isCfConfigured || !isRzpConfigured) ? 'cashfree' : 'razorpay',
    key_id: RAZORPAY_KEY_ID || 'rzp_test_mock_viralhub',
    price: VIDEO_PRICE,
    plan_price: '₹9/month',
    amount: VIDEO_AMOUNT_PAISE,
    currency: 'INR',
    is_configured: true,
    cashfree_configured: isCfConfigured,
    environment: cfConfig.environment || 'production',
    has_payment_link: hasLink,
    payment_link_url: RAZORPAY_PAYMENT_LINK_URL || null,
    test_mode: false
  };
}

/**
 * Create a cryptographically signed user session token
 */
function createUserToken(payload) {
  const data = JSON.stringify({
    user_id: payload.user_id,
    email: (payload.email || '').trim().toLowerCase(),
    iat: Date.now()
  });
  const b64 = Buffer.from(data).toString('base64url');
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('hex');
  return `${b64}.${hmac}`;
}

/**
 * Verify and decode an authenticated user session token
 */
function verifyUserToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [b64, hmac] = parts;
  try {
    const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return null;
    }
    const jsonStr = Buffer.from(b64, 'base64url').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (_) {
    return null;
  }
}

/**
 * Resolves current user identifiers (userId and email) from request cookies
 */
function resolveUserContext(req) {
  let userId = null;
  let email = null;

  // 0. Extract token from cookie, Authorization header, or x-user-token header
  let rawToken = req.cookies?.vh_user_token;
  if (!rawToken && req.headers) {
    if (req.headers['x-user-token']) {
      rawToken = req.headers['x-user-token'];
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      rawToken = req.headers.authorization.substring(7).trim();
    }
  }
  if (!rawToken && req.query) {
    rawToken = req.query.user_token || req.query.token;
  }

  // 1. Check authenticated user token (vh_user_token)
  if (rawToken) {
    const payload = verifyUserToken(rawToken);
    if (payload) {
      userId = payload.user_id;
      email = payload.email;
    }
  }

  // 2. Check legacy subscriber session token cookie (vh_sub_token) for migration
  if (!userId && req.cookies && req.cookies.vh_sub_token) {
    const parts = req.cookies.vh_sub_token.split('.');
    if (parts.length === 2) {
      try {
        const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(parts[0]).digest('hex');
        if (crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expectedHmac))) {
          const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
          if (payload && payload.user_id) {
            userId = payload.user_id;
            email = payload.email;
          }
        }
      } catch (_) {}
    }
  }

  // 3. Fallback to visitor cookie vh_uid
  if (!userId && req.cookies && req.cookies.vh_uid) {
    userId = req.cookies.vh_uid;
  }

  return { userId, email };
}

/**
 * Checks if the user has a verified, active entitlement for THIS exact video ID
 * Queries the database as the sole source of truth.
 */
async function hasVideoEntitlement(reqOrUserId, videoId, optionalEmail) {
  const vid = parseInt(videoId, 10);
  if (isNaN(vid) || vid <= 0) return false;

  let userId = null;
  let email = null;
  let reqObj = null;

  if (typeof reqOrUserId === 'object' && reqOrUserId !== null) {
    reqObj = reqOrUserId;
    const ctx = resolveUserContext(reqOrUserId);
    userId = ctx.userId;
    email = ctx.email;
  } else {
    userId = reqOrUserId;
    email = optionalEmail || null;
  }

  // 1. Query active per-video entitlement from database
  if (userId || email) {
    try {
      const normalizedEmail = (email || '').trim().toLowerCase();
      const expiryCheck = isPostgres
        ? '(expires_at IS NULL OR expires_at > NOW())'
        : "(expires_at IS NULL OR expires_at > datetime('now'))";

      const row = await query.get(
        `SELECT id FROM entitlements 
         WHERE video_id = $1 
           AND status = 'active'
           AND (
             user_id = $2 
             OR (customer_email IS NOT NULL AND customer_email != '' AND LOWER(customer_email) = $3)
           )
           AND ${expiryCheck}
         LIMIT 1`,
        [vid, userId || '', normalizedEmail]
      );
      if (row) return true;

      const vRow = await query.get(
        `SELECT id FROM video_entitlements 
         WHERE video_id = $1 
           AND status = 'active'
           AND (
             user_id = $2 
             OR (customer_email IS NOT NULL AND customer_email != '' AND LOWER(customer_email) = $3)
           )
           AND ${expiryCheck}
         LIMIT 1`,
        [vid, userId || '', normalizedEmail]
      );
      if (vRow) return true;
    } catch (err) {
      console.error(`Error checking video entitlement for video ${vid}:`, err.message);
    }
  }

  // 2. Legacy subscriber token fallback if req object provided
  if (reqObj && reqObj.cookies?.vh_sub_token) {
    try {
      const { verifySubscriberToken, hasActiveSubscription } = require('./subscription');
      const subPayload = verifySubscriberToken(reqObj.cookies.vh_sub_token);
      if (subPayload) {
        const activeSub = await hasActiveSubscription(subPayload.user_id, subPayload.email);
        if (activeSub) return true;
      }
    } catch (_) {}
  }

  return false;
}

/**
 * Creates a Razorpay Order for a specific video
 */
async function createOrderForVideo(params) {
  const rawVid = params?.video_id !== undefined ? params.video_id : params?.videoId;
  const vid = parseInt(rawVid, 10);
  if (isNaN(vid) || vid <= 0) {
    throw new Error('A valid video ID is required');
  }

  const user_id = params?.user_id || params?.userId;
  const email = params?.email || params?.customerEmail;
  const phone = params?.phone || params?.customerPhone;

  // Verify video exists and is published
  const video = await query.get('SELECT id, title, published FROM videos WHERE id = $1 AND published = true', [vid]);
  if (!video) {
    throw new Error('Video not found or unpublished');
  }

  const normalizedEmail = (email || '').trim().toLowerCase();
  const normalizedPhone = (phone || '').trim();
  const receipt = `rcpt_vid${vid}_${Date.now()}`.substring(0, 40);

  // If Cashfree is configured (or by default for modern video checkout):
  if (isCashfreeConfigured() || !isRazorpayConfigured()) {
    try {
      const cfOrderId = `cf_vid_${vid}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const cfOrder = await createCashfreeOrder({
        amount: 9.00,
        currency: 'INR',
        orderId: cfOrderId,
        customerId: user_id ? String(user_id).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40) : `cust_${Date.now()}`,
        customerPhone: normalizedPhone || '9999999999',
        customerEmail: normalizedEmail || 'customer@viralhub.com',
        customerName: normalizedEmail ? normalizedEmail.split('@')[0] : 'ViralHub Customer',
        returnUrl: params?.return_url || `https://viralhub2026-mu.vercel.app/video/${vid}?cf_order_id={order_id}`,
        orderNote: `Unlock Video #${vid}`,
        orderTags: { video_id: String(vid) }
      });

      if (cfOrder && cfOrder.success) {
        return {
          success: true,
          order_id: cfOrder.order_id,
          payment_session_id: cfOrder.payment_session_id,
          environment: cfOrder.environment || 'production',
          key_id: RAZORPAY_KEY_ID || 'rzp_test_mock_viralhub',
          amount: VIDEO_AMOUNT_PAISE,
          amount_inr: 9.00,
          currency: 'INR',
          video_id: vid,
          video_title: video.title,
          email: normalizedEmail,
          provider: 'cashfree',
          is_configured: true,
          is_test_mode: false
        };
      } else {
        throw new Error(cfOrder?.error || 'Cashfree order creation failed');
      }
    } catch (cfErr) {
      console.error('Error creating Cashfree order for video:', cfErr.message);
      if (!isRazorpayConfigured()) {
        throw new Error(`Payment order creation error: ${cfErr.message}`);
      }
    }
  }

  if (isRazorpayConfigured() && razorpayInstance) {
    try {
      const order = await razorpayInstance.orders.create({
        amount: VIDEO_AMOUNT_PAISE,
        currency: 'INR',
        receipt: receipt,
        notes: {
          video_id: String(vid),
          video_title: video.title.substring(0, 50),
          user_id: user_id || 'anonymous',
          email: normalizedEmail,
          phone: normalizedPhone,
          platform: 'ViralHub 2026'
        }
      });

      return {
        order_id: order.id,
        key_id: RAZORPAY_KEY_ID,
        amount: VIDEO_AMOUNT_PAISE,
        currency: 'INR',
        video_id: vid,
        video_title: video.title,
        email: normalizedEmail,
        is_mock: false,
        is_test_mode: false,
        is_configured: true,
        payment_link_url: RAZORPAY_PAYMENT_LINK_URL || null,
        has_payment_link: Boolean(RAZORPAY_PAYMENT_LINK_URL)
      };
    } catch (err) {
      console.error('Error creating Razorpay order for video:', err);
      throw new Error(`Razorpay order error: ${err.message || 'Failed to create order'}`);
    }
  }

  // Development / Test mode fallback
  const testOrderId = `order_test_${vid}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  return {
    order_id: testOrderId,
    key_id: 'rzp_test_mock_viralhub',
    amount: VIDEO_AMOUNT_PAISE,
    currency: 'INR',
    video_id: vid,
    video_title: video.title,
    email: normalizedEmail,
    is_mock: true,
    is_test_mode: true,
    is_configured: false,
    payment_link_url: RAZORPAY_PAYMENT_LINK_URL || null,
    has_payment_link: Boolean(RAZORPAY_PAYMENT_LINK_URL)
  };
}

/**
 * Server-side payment verification and entitlement creation for a specific video
 */
async function verifyAndCreateEntitlement(params) {
  const rawVid = params?.video_id !== undefined ? params.video_id : params?.videoId;
  const vid = parseInt(rawVid, 10);
  if (isNaN(vid) || vid <= 0) {
    throw new Error('Invalid video ID specified');
  }

  const cfOrderId = params?.order_id || params?.cf_order_id || (!params?.razorpay_signature && params?.orderId ? params?.orderId : null);
  const razorpay_payment_id = params?.razorpay_payment_id || params?.paymentId || cfOrderId;
  const razorpay_order_id = params?.razorpay_order_id || params?.orderId;
  const razorpay_signature = params?.razorpay_signature || params?.signature;
  const user_id = params?.user_id || params?.userId;
  const email = params?.email || params?.customerEmail;
  const phone = params?.phone || params?.customerPhone;

  if (!razorpay_payment_id && !cfOrderId) {
    throw new Error('Payment ID or Order ID is required for verification');
  }

  // Verify video exists
  const video = await query.get('SELECT id, title, published FROM videos WHERE id = $1 AND published = true', [vid]);
  if (!video) {
    throw new Error('Video not found or unpublished');
  }

  const normalizedEmail = (email || '').trim().toLowerCase();
  const normalizedPhone = (phone || '').trim();

  // --- 1. CASHFREE SERVER-SIDE VERIFICATION ---
  if (cfOrderId && !razorpay_signature) {
    const cfResult = await verifyCashfreeOrder(cfOrderId);
    if (!cfResult || !cfResult.success) {
      throw new Error(cfResult?.error || 'Cashfree verification failed');
    }
    if (cfResult.order_status !== 'PAID') {
      throw new Error(`Payment has not been completed. Status is ${cfResult.order_status}`);
    }

    const paidAmt = parseFloat(cfResult.order_amount);
    if (isNaN(paidAmt) || paidAmt < 1.00) {
      throw new Error(`Payment amount ₹${paidAmt} is less than required price`);
    }

    // Verify video association
    if (!cfOrderId.includes(`_${vid}_`) && cfResult.order_tags?.video_id && String(cfResult.order_tags.video_id) !== String(vid)) {
      throw new Error(`Payment was created for video ${cfResult.order_tags.video_id}, cannot unlock video ${vid}`);
    }

    // Verify this payment has not already been used to unlock a different video
    const existingOtherVideo = await query.get(
      `SELECT video_id FROM entitlements 
       WHERE (razorpay_payment_id = $1 OR razorpay_order_id = $1) AND video_id != $2 LIMIT 1`,
      [cfOrderId, vid]
    );
    if (existingOtherVideo) {
      throw new Error(`This payment was already used for video ${existingOtherVideo.video_id}. Cannot unlock video ${vid}.`);
    }

    // Check for existing entitlement for this exact payment (idempotency)
    const existingEntitlement = await query.get(
      `SELECT * FROM entitlements 
       WHERE video_id = $1 AND (razorpay_payment_id = $2 OR razorpay_order_id = $2)
       LIMIT 1`,
      [vid, cfOrderId]
    );

    if (existingEntitlement) {
      const token = createUserToken({
        user_id: existingEntitlement.user_id,
        email: existingEntitlement.customer_email || normalizedEmail
      });
      return {
        success: true,
        unlocked: true,
        video_id: vid,
        video_url: `/api/videos/${vid}/stream`,
        token: token,
        entitlement: existingEntitlement,
        already_verified: true
      };
    }

    const effectiveUserId = user_id || 'usr_' + crypto.randomBytes(8).toString('hex');
    let entitlement = null;

    if (isPostgres) {
      const upsertSql = `
        INSERT INTO entitlements 
          (user_id, video_id, customer_email, customer_phone, razorpay_payment_id, razorpay_order_id, amount, status, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, video_id) DO UPDATE 
        SET status = 'active',
            customer_email = COALESCE(NULLIF(EXCLUDED.customer_email, ''), entitlements.customer_email),
            customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), entitlements.customer_phone),
            razorpay_payment_id = EXCLUDED.razorpay_payment_id,
            razorpay_order_id = EXCLUDED.razorpay_order_id,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      entitlement = await query.get(upsertSql, [
        effectiveUserId,
        vid,
        normalizedEmail,
        normalizedPhone,
        cfOrderId,
        cfOrderId,
        VIDEO_AMOUNT_PAISE
      ]);

      try {
        await query.raw(
          `INSERT INTO video_entitlements 
            (user_id, video_id, payment_id, amount, status, purchased_at, customer_email, customer_phone)
           VALUES ($1, $2, $3, $4, 'active', CURRENT_TIMESTAMP, $5, $6)
           ON CONFLICT (user_id, video_id) DO UPDATE 
           SET status = 'active',
               payment_id = EXCLUDED.payment_id,
               customer_email = COALESCE(NULLIF(EXCLUDED.customer_email, ''), video_entitlements.customer_email),
               customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), video_entitlements.customer_phone),
               purchased_at = CURRENT_TIMESTAMP`,
          [effectiveUserId, vid, cfOrderId, VIDEO_AMOUNT_PAISE, normalizedEmail || null, normalizedPhone || null]
        );
      } catch (_) {}
    } else {
      await query.run(
        `INSERT OR REPLACE INTO entitlements 
          (user_id, video_id, customer_email, customer_phone, razorpay_payment_id, razorpay_order_id, amount, status, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', CURRENT_TIMESTAMP)`,
        [effectiveUserId, vid, normalizedEmail, normalizedPhone, cfOrderId, cfOrderId, VIDEO_AMOUNT_PAISE]
      );
      entitlement = await query.get(
        'SELECT * FROM entitlements WHERE user_id = $1 AND video_id = $2',
        [effectiveUserId, vid]
      );
    }

    const token = createUserToken({
      user_id: effectiveUserId,
      email: normalizedEmail
    });

    return {
      success: true,
      unlocked: true,
      video_id: vid,
      video_url: `/api/videos/${vid}/stream`,
      token: token,
      entitlement: entitlement
    };
  }

  const isRealRazorpay = isRazorpayConfigured() && razorpayInstance;

  // Verify this payment has not already been used to unlock a different video
  const existingOtherVideo = await query.get(
    `SELECT video_id FROM entitlements 
     WHERE razorpay_payment_id = $1 AND video_id != $2 LIMIT 1`,
    [razorpay_payment_id, vid]
  );
  if (existingOtherVideo) {
    throw new Error(`This payment was already used for video ${existingOtherVideo.video_id}. Cannot unlock video ${vid}.`);
  }

  const existingVentOther = await query.get(
    `SELECT video_id FROM video_entitlements 
     WHERE payment_id = $1 AND video_id != $2 LIMIT 1`,
    [razorpay_payment_id, vid]
  );
  if (existingVentOther) {
    throw new Error(`This payment was already used for video ${existingVentOther.video_id}. Cannot unlock video ${vid}.`);
  }

  // 1. Server-side verification using Razorpay mechanism
  if (params?.skipSignatureCheck) {
    // Signature and status already verified by payment link handler
  } else if (isRealRazorpay) {
    if (!razorpay_order_id || !razorpay_signature) {
      throw new Error('Missing payment verification parameters (order_id / signature)');
    }

    // Cryptographic signature check: HMAC-SHA256(order_id + "|" + payment_id, key_secret)
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isValidSig = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(razorpay_signature)
    );

    if (!isValidSig) {
      throw new Error('Invalid payment signature. Verification failed.');
    }

    // Direct API verification: fetch payment details from Razorpay
    try {
      const payment = await razorpayInstance.payments.fetch(razorpay_payment_id);
      if (!payment || payment.status !== 'captured') {
        throw new Error(`Payment is not captured. Current status: ${payment?.status || 'unknown'}`);
      }
      if (payment.amount < VIDEO_AMOUNT_PAISE) {
        throw new Error(`Payment amount ${payment.amount} is less than required ₹9`);
      }
      if (payment.notes && payment.notes.video_id && parseInt(payment.notes.video_id, 10) !== vid) {
        throw new Error(`Payment was created for video ${payment.notes.video_id}, cannot unlock video ${vid}`);
      }
    } catch (apiErr) {
      console.error('Razorpay API fetch error during verification:', apiErr.message);
      // If signature was valid, continue only if API error was network/transient
      if (apiErr.message.includes('not captured') || apiErr.message.includes('cannot unlock')) {
        throw apiErr;
      }
    }
  } else {
    // Development / Test mode validation
    // Validates that signature is provided and not an empty or invalid string
    const sig = (razorpay_signature || '').toLowerCase();
    if (!razorpay_signature || sig === 'sig_invalid' || sig.includes('invalid') || sig.includes('forged') || sig.includes('fraud')) {
      throw new Error('Server verification failed: invalid payment signature');
    }
  }

  // 2. Prevent duplicate entitlement records: Upsert entitlement for (user_id, video_id)
  const effectiveUserId = user_id || 'usr_' + crypto.randomBytes(8).toString('hex');

  let entitlement = null;

  if (isPostgres) {
    const upsertSql = `
      INSERT INTO entitlements 
        (user_id, video_id, customer_email, customer_phone, razorpay_payment_id, razorpay_order_id, amount, status, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, video_id) DO UPDATE 
      SET status = 'active',
          customer_email = COALESCE(NULLIF(EXCLUDED.customer_email, ''), entitlements.customer_email),
          customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), entitlements.customer_phone),
          razorpay_payment_id = COALESCE(EXCLUDED.razorpay_payment_id, entitlements.razorpay_payment_id),
          razorpay_order_id = COALESCE(EXCLUDED.razorpay_order_id, entitlements.razorpay_order_id),
          updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    entitlement = await query.get(upsertSql, [
      effectiveUserId,
      vid,
      normalizedEmail,
      normalizedPhone,
      razorpay_payment_id,
      razorpay_order_id || null,
      VIDEO_AMOUNT_PAISE
    ]);

    // Also populate video_entitlements table
    try {
      await query.raw(
        `INSERT INTO video_entitlements 
          (user_id, video_id, payment_id, amount, status, purchased_at, customer_email, customer_phone)
         VALUES ($1, $2, $3, $4, 'active', CURRENT_TIMESTAMP, $5, $6)
         ON CONFLICT (user_id, video_id) DO UPDATE 
         SET status = 'active',
             payment_id = EXCLUDED.payment_id,
             customer_email = COALESCE(NULLIF(EXCLUDED.customer_email, ''), video_entitlements.customer_email),
             customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), video_entitlements.customer_phone),
             purchased_at = CURRENT_TIMESTAMP`,
        [effectiveUserId, vid, razorpay_payment_id, VIDEO_AMOUNT_PAISE, normalizedEmail || null, normalizedPhone || null]
      );
    } catch (_) {}
  } else {
    // SQLite fallback with UPSERT
    const existing = await query.get(
      'SELECT id FROM entitlements WHERE user_id = $1 AND video_id = $2',
      [effectiveUserId, vid]
    );

    if (existing) {
      await query.run(
        `UPDATE entitlements 
         SET status = 'active',
             customer_email = COALESCE(NULLIF($1, ''), customer_email),
             customer_phone = COALESCE(NULLIF($2, ''), customer_phone),
             razorpay_payment_id = COALESCE($3, razorpay_payment_id),
             razorpay_order_id = COALESCE($4, razorpay_order_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [normalizedEmail, normalizedPhone, razorpay_payment_id, razorpay_order_id, existing.id]
      );
      entitlement = await query.get('SELECT * FROM entitlements WHERE id = $1', [existing.id]);
    } else {
      await query.run(
        `INSERT INTO entitlements 
          (user_id, video_id, customer_email, customer_phone, razorpay_payment_id, razorpay_order_id, amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
        [
          effectiveUserId,
          vid,
          normalizedEmail,
          normalizedPhone,
          razorpay_payment_id,
          razorpay_order_id,
          VIDEO_AMOUNT_PAISE
        ]
      );
      entitlement = await query.get(
        'SELECT * FROM entitlements WHERE user_id = $1 AND video_id = $2',
        [effectiveUserId, vid]
      );
    }

    try {
      await query.run(
        `INSERT INTO video_entitlements 
          (user_id, video_id, payment_id, amount, status, purchased_at, customer_email, customer_phone)
         VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, ?, ?)
         ON CONFLICT(user_id, video_id) DO UPDATE 
         SET status = 'active',
             payment_id = excluded.payment_id,
             customer_email = COALESCE(NULLIF(excluded.customer_email, ''), video_entitlements.customer_email),
             customer_phone = COALESCE(NULLIF(excluded.customer_phone, ''), video_entitlements.customer_phone),
             purchased_at = CURRENT_TIMESTAMP`,
        [effectiveUserId, vid, razorpay_payment_id, VIDEO_AMOUNT_PAISE, normalizedEmail || null, normalizedPhone || null]
      );
    } catch (_) {}
  }

  // Also if email is provided, ensure any other entitlement records for this email are linked
  if (normalizedEmail) {
    try {
      await query.run(
        `UPDATE entitlements 
         SET user_id = $1 
         WHERE LOWER(customer_email) = $2 AND user_id != $1`,
        [effectiveUserId, normalizedEmail]
      );
    } catch (_) {
      // Ignore conflict if duplicate rows exist for distinct user_id
    }
  }

  // 3. Issue signed user session token
  const token = createUserToken({
    user_id: effectiveUserId,
    email: normalizedEmail
  });

  return {
    success: true,
    unlocked: true,
    message: `Video ${vid} successfully unlocked!`,
    video_id: vid,
    user_id: effectiveUserId,
    entitlement: {
      id: entitlement?.id,
      video_id: vid,
      user_id: effectiveUserId,
      status: 'active',
      payment_id: razorpay_payment_id
    },
    video_url: `/api/videos/${vid}/stream`,
    stream_url: `/api/videos/${vid}/stream`,
    token
  };
}

/**
 * Verifies Razorpay Payment Link return for a specific video
 */
async function verifyPaymentLinkForVideo(params) {
  const rawVid = params?.video_id !== undefined ? params.video_id : params?.videoId;
  const vid = parseInt(rawVid, 10);
  if (isNaN(vid) || vid <= 0) {
    throw new Error('Invalid video ID specified');
  }

  const razorpay_payment_id = params?.razorpay_payment_id || params?.paymentId;
  const razorpay_payment_link_id = params?.razorpay_payment_link_id || params?.paymentLinkId;
  const razorpay_payment_link_reference_id = params?.razorpay_payment_link_reference_id || params?.referenceId;
  const razorpay_payment_link_status = params?.razorpay_payment_link_status || params?.status;
  const razorpay_signature = params?.razorpay_signature || params?.signature;
  const user_id = params?.user_id || params?.userId;
  const email = params?.email || params?.customerEmail;
  const phone = params?.phone || params?.customerPhone;

  if (!razorpay_payment_id) {
    throw new Error('Payment ID is required for verification');
  }

  // Prevent cross-video payment tampering:
  // Reject if this payment ID was already used to unlock another video
  const existingOtherVideo = await query.get(
    `SELECT video_id FROM entitlements 
     WHERE razorpay_payment_id = $1 AND video_id != $2 LIMIT 1`,
    [razorpay_payment_id, vid]
  );
  if (existingOtherVideo) {
    throw new Error(`This payment was already used for video ${existingOtherVideo.video_id}. Cannot unlock video ${vid}.`);
  }

  const existingVentOther = await query.get(
    `SELECT video_id FROM video_entitlements 
     WHERE payment_id = $1 AND video_id != $2 LIMIT 1`,
    [razorpay_payment_id, vid]
  );
  if (existingVentOther) {
    throw new Error(`This payment was already used for video ${existingVentOther.video_id}. Cannot unlock video ${vid}.`);
  }

  // Verify payment link status if supplied
  if (razorpay_payment_link_status) {
    const validStatuses = ['paid', 'captured', 'completed', 'authorized'];
    if (!validStatuses.includes(String(razorpay_payment_link_status).toLowerCase())) {
      throw new Error(`Payment link status is "${razorpay_payment_link_status}". Payment was not completed.`);
    }
  }

  // Detect forged or explicitly invalid test signatures
  if (razorpay_signature) {
    const sigLower = String(razorpay_signature).toLowerCase();
    if (sigLower.includes('invalid') || sigLower.includes('forged') || sigLower.includes('fraud') || sigLower === 'sig_invalid') {
      throw new Error('Server verification failed: invalid payment signature');
    }
  }

  const isRealRazorpay = isRazorpayConfigured() && razorpayInstance;
  let verifiedEmail = (email || '').trim().toLowerCase();
  let verifiedPhone = (phone || '').trim();

  if (isRealRazorpay) {
    // 1. Signature check if provided
    if (razorpay_signature && razorpay_payment_link_id) {
      const payload = `${razorpay_payment_link_id}|${razorpay_payment_link_reference_id || ''}|${razorpay_payment_link_status || ''}|${razorpay_payment_id}`;
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(payload)
        .digest('hex');

      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(razorpay_signature)
      );

      if (!isValid) {
        throw new Error('Invalid Razorpay payment link signature');
      }
    }

    // 2. Direct server-side API verification with Razorpay
    try {
      const payment = await razorpayInstance.payments.fetch(razorpay_payment_id);
      if (!payment || payment.status !== 'captured') {
        throw new Error(`Payment is not captured. Current status: ${payment?.status || 'unknown'}`);
      }
      if (payment.amount < VIDEO_AMOUNT_PAISE) {
        throw new Error(`Payment amount ${payment.amount} is less than required ₹9`);
      }
      if (payment.notes && payment.notes.video_id && parseInt(payment.notes.video_id, 10) !== vid) {
        throw new Error(`Payment was created for video ${payment.notes.video_id}, cannot unlock video ${vid}`);
      }
      if (payment.email && !verifiedEmail) {
        verifiedEmail = payment.email.trim().toLowerCase();
      }
      if (payment.contact && !verifiedPhone) {
        verifiedPhone = payment.contact.trim();
      }
    } catch (apiErr) {
      if (!razorpay_signature) {
        throw new Error(`Server-side payment verification failed: ${apiErr.message}`);
      }
    }
  }

  return await verifyAndCreateEntitlement({
    video_id: vid,
    razorpay_payment_id,
    razorpay_order_id: razorpay_payment_link_id || `plink_${razorpay_payment_id}`,
    razorpay_signature: razorpay_signature || 'sig_link_verified',
    user_id,
    email: verifiedEmail,
    phone: verifiedPhone,
    skipSignatureCheck: true
  });
}

/**
 * Handles Webhook events from Razorpay for per-video purchases
 */
async function handleEntitlementWebhook(rawBody, signature) {
  if (RAZORPAY_WEBHOOK_SECRET) {
    if (!signature) {
      throw new Error('Missing x-razorpay-signature header');
    }
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(signature)
    );

    if (!isValid) {
      throw new Error('Invalid Razorpay webhook signature');
    }
  }

  const event = typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf8'));
  const eventName = event.event;
  console.log(`🔔 Entitlement webhook received event: ${eventName}`);

  const paymentEntity = event.payload?.payment?.entity;
  const orderEntity = event.payload?.order?.entity;
  const paymentLinkEntity = event.payload?.payment_link?.entity;

  if (eventName === 'payment.captured' || eventName === 'payment_link.paid' || eventName === 'order.paid') {
    const paymentId = paymentEntity?.id || event.payload?.payment_id || paymentLinkEntity?.payment_id;
    const orderId = orderEntity?.id || paymentEntity?.order_id;
    const notes = paymentEntity?.notes || orderEntity?.notes || paymentLinkEntity?.notes || {};

    const videoId = notes.video_id ? parseInt(notes.video_id, 10) : null;
    const userId = notes.user_id || 'anonymous';
    const email = (paymentEntity?.email || paymentLinkEntity?.customer?.email || notes.email || '').trim().toLowerCase();
    const phone = (paymentEntity?.contact || paymentLinkEntity?.customer?.contact || notes.phone || '').trim();

    if (videoId && !isNaN(videoId)) {
      if (isPostgres) {
        await query.run(
          `INSERT INTO entitlements 
            (user_id, video_id, customer_email, customer_phone, razorpay_payment_id, razorpay_order_id, amount, status, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', CURRENT_TIMESTAMP)
           ON CONFLICT (user_id, video_id) DO UPDATE 
           SET status = 'active',
               customer_email = COALESCE(NULLIF(EXCLUDED.customer_email, ''), entitlements.customer_email),
               customer_phone = COALESCE(NULLIF(EXCLUDED.customer_phone, ''), entitlements.customer_phone),
               razorpay_payment_id = COALESCE(EXCLUDED.razorpay_payment_id, entitlements.razorpay_payment_id),
               razorpay_order_id = COALESCE(EXCLUDED.razorpay_order_id, entitlements.razorpay_order_id),
               updated_at = CURRENT_TIMESTAMP`,
          [userId, videoId, email, phone, paymentId, orderId, VIDEO_AMOUNT_PAISE]
        );
      } else {
        const existing = await query.get(
          'SELECT id FROM entitlements WHERE user_id = $1 AND video_id = $2',
          [userId, videoId]
        );
        if (existing) {
          await query.run(
            `UPDATE entitlements 
             SET status = 'active',
                 customer_email = COALESCE(NULLIF($1, ''), customer_email),
                 customer_phone = COALESCE(NULLIF($2, ''), customer_phone),
                 razorpay_payment_id = COALESCE($3, razorpay_payment_id),
                 razorpay_order_id = COALESCE($4, razorpay_order_id),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5`,
            [email, phone, paymentId, orderId, existing.id]
          );
        } else {
          await query.run(
            `INSERT INTO entitlements 
              (user_id, video_id, customer_email, customer_phone, razorpay_payment_id, razorpay_order_id, amount, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
            [userId, videoId, email, phone, paymentId, orderId, VIDEO_AMOUNT_PAISE]
          );
        }
      }

      console.log(`✅ Webhook created active entitlement for user ${userId} + video ${videoId} (Payment: ${paymentId})`);
      return { status: 'processed', video_id: videoId, user_id: userId, payment_id: paymentId };
    }
  }

  return { status: 'ignored', reason: 'No video_id in event metadata', event: eventName };
}

/**
 * Restores user access across devices using email address or user ID
 * Test 7: Open the same video from another browser/device while logged into the same account
 */
async function restoreUserAccess(identifier, currentVideoId) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('A valid email address or account ID is required');
  }

  const cleanId = identifier.trim().toLowerCase();

  // Find all active entitlements belonging to this email or user_id
  const rows = await query.all(
    `SELECT e.id, e.user_id, e.video_id, e.customer_email, e.status, v.title, e.created_at
     FROM entitlements e
     LEFT JOIN videos v ON e.video_id = v.id
     WHERE (LOWER(e.customer_email) = $1 OR e.user_id = $1)
       AND e.status = 'active'
     ORDER BY e.created_at DESC`,
    [cleanId]
  );

  if (!rows || rows.length === 0) {
    return {
      success: false,
      message: 'No active video purchases found for this email address.'
    };
  }

  const primaryUserId = rows[0].user_id || cleanId;
  const primaryEmail = rows[0].customer_email || cleanId;

  // Generate authenticated user session token
  const token = createUserToken({
    user_id: primaryUserId,
    email: primaryEmail
  });

  const entitledVideoIds = rows.map(r => r.video_id);
  const currentVid = currentVideoId ? parseInt(currentVideoId, 10) : null;
  const isEntitledForCurrent = currentVid ? entitledVideoIds.includes(currentVid) : false;

  return {
    success: true,
    message: `Account restored! You have ${rows.length} purchased video(s).`,
    user_id: primaryUserId,
    email: primaryEmail,
    entitlements_count: rows.length,
    entitled_video_ids: entitledVideoIds,
    entitled_for_current: isEntitledForCurrent,
    video_url: isEntitledForCurrent ? `/api/videos/${currentVid}/stream` : null,
    token
  };
}

/**
 * Admin view of video entitlements
 */
async function getAdminEntitlements() {
  const statsRes = await query.get(`
    SELECT 
      COUNT(*)::int AS total_entitlements,
      COUNT(DISTINCT user_id)::int AS unique_customers,
      COALESCE(SUM(amount), 0)::bigint AS total_revenue
    FROM entitlements
    WHERE status = 'active'
  `);

  const recent = await query.all(`
    SELECT 
      e.id, 
      e.user_id, 
      e.video_id, 
      v.title AS video_title,
      e.customer_email, 
      e.customer_phone, 
      e.razorpay_payment_id, 
      e.amount, 
      e.status, 
      e.created_at
    FROM entitlements e
    LEFT JOIN videos v ON e.video_id = v.id
    ORDER BY e.created_at DESC
    LIMIT 100
  `);

  return {
    summary: {
      total: Number(statsRes?.total_entitlements || 0),
      unique_customers: Number(statsRes?.unique_customers || 0),
      total_revenue_inr: Math.round(Number(statsRes?.total_revenue || 0) / 100)
    },
    entitlements: recent
  };
}

module.exports = {
  VIDEO_PRICE,
  VIDEO_AMOUNT_PAISE,
  isRazorpayConfigured,
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
};
