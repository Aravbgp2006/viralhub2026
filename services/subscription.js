/**
 * services/subscription.js
 * Razorpay Recurring Subscription Management Service for ViralHub 2026
 * Handles subscription creation, verification, webhooks, and customer sessions.
 */

require('dotenv').config();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { query, isPostgres } = require('../database/db');

const SESSION_SECRET = process.env.SESSION_SECRET || 'viralhub_2026_cms_secret_key_8f3a1b';

const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || '').trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || '').trim();
const RAZORPAY_PLAN_ID = (process.env.RAZORPAY_PLAN_ID || '').trim();
const RAZORPAY_WEBHOOK_SECRET = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
const RAZORPAY_PAYMENT_LINK_URL = (process.env.RAZORPAY_PAYMENT_LINK_URL || '').trim();

const PLAN_PRICE = '₹9/month';
const PLAN_AMOUNT = 900; // in paise: 900 paise = 9 INR

let razorpayInstance = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  try {
    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
  } catch (err) {
    console.error('⚠️ Error initializing Razorpay SDK:', err.message);
  }
}

/**
 * Checks whether real Razorpay credentials are fully configured
 */
function isRazorpayConfigured() {
  return Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && (RAZORPAY_PLAN_ID || RAZORPAY_PAYMENT_LINK_URL));
}

/**
 * Returns public safe Razorpay configuration
 */
function getPublicConfig() {
  const hasLink = Boolean(RAZORPAY_PAYMENT_LINK_URL);
  const isConfigured = isRazorpayConfigured();
  return {
    key_id: RAZORPAY_KEY_ID || 'rzp_test_mock_viralhub',
    plan_id: RAZORPAY_PLAN_ID || 'plan_mock_viralhub_9',
    plan_price: PLAN_PRICE,
    is_configured: Boolean(isConfigured || hasLink),
    payment_link_url: RAZORPAY_PAYMENT_LINK_URL || null,
    has_payment_link: hasLink,
    test_mode: !RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.startsWith('rzp_test_') || RAZORPAY_KEY_ID.includes('mock')
  };
}

/**
 * Create a cryptographically signed subscriber session token
 */
function createSubscriberToken(payload) {
  const data = JSON.stringify({
    user_id: payload.user_id,
    email: payload.email || '',
    sub_id: payload.sub_id,
    iat: Date.now()
  });
  const b64 = Buffer.from(data).toString('base64url');
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(b64).digest('hex');
  return `${b64}.${hmac}`;
}

/**
 * Verify a subscriber session token
 */
function verifySubscriberToken(token) {
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
  } catch (err) {
    return null;
  }
}

/**
 * Checks if a user or email has an active subscription in the database
 */
async function hasActiveSubscription(userId, email) {
  if (!userId && !email) return false;

  try {
    const nowCheck = isPostgres 
      ? '(current_period_end IS NULL OR current_period_end > NOW())' 
      : "(current_period_end IS NULL OR current_period_end > datetime('now'))";

    const rows = await query.all(
      `SELECT * FROM subscriptions 
       WHERE (user_id = $1 OR (customer_email IS NOT NULL AND customer_email != '' AND customer_email = $2))
         AND status = 'active'
         AND ${nowCheck}
       ORDER BY id DESC LIMIT 1`,
      [userId || '', email || '']
    );

    return rows && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.error('Error checking active subscription:', err.message);
    return false;
  }
}

/**
 * Creates a Razorpay subscription (or test mock subscription)
 */
async function createSubscription({ user_id, email, phone }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const normalizedPhone = (phone || '').trim();

  if (isRazorpayConfigured() && razorpayInstance) {
    try {
      const sub = await razorpayInstance.subscriptions.create({
        plan_id: RAZORPAY_PLAN_ID,
        total_count: 120, // 10 years of monthly recurring cycles
        quantity: 1,
        customer_notify: 1,
        notes: {
          user_id: user_id || 'anonymous',
          email: normalizedEmail,
          phone: normalizedPhone,
          platform: 'ViralHub 2026'
        }
      });

      // Save initial record with status 'created'
      await query.run(
        `INSERT INTO subscriptions 
          (user_id, customer_email, customer_phone, razorpay_subscription_id, plan_id, status)
         VALUES ($1, $2, $3, $4, $5, 'created')
         ON CONFLICT (razorpay_subscription_id) DO UPDATE 
         SET customer_email = EXCLUDED.customer_email,
             customer_phone = EXCLUDED.customer_phone,
             updated_at = CURRENT_TIMESTAMP`,
        [user_id, normalizedEmail, normalizedPhone, sub.id, RAZORPAY_PLAN_ID]
      );

      return {
        subscription_id: sub.id,
        key_id: RAZORPAY_KEY_ID,
        plan_id: RAZORPAY_PLAN_ID,
        email: normalizedEmail,
        is_test_mode: RAZORPAY_KEY_ID.startsWith('rzp_test_')
      };
    } catch (err) {
      console.error('Error calling Razorpay subscriptions.create:', err);
      throw new Error(`Razorpay subscription error: ${err.message || 'Failed to initialize subscription'}`);
    }
  }

  // Local development / Test mode fallback
  const testSubId = `sub_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  
  // Upsert test record into Neon / SQLite
  if (isPostgres) {
    await query.run(
      `INSERT INTO subscriptions 
        (user_id, customer_email, customer_phone, razorpay_subscription_id, plan_id, status)
       VALUES ($1, $2, $3, $4, 'plan_mock_9', 'created')
       ON CONFLICT (razorpay_subscription_id) DO NOTHING`,
      [user_id, normalizedEmail, normalizedPhone, testSubId]
    );
  } else {
    await query.run(
      `INSERT OR IGNORE INTO subscriptions 
        (user_id, customer_email, customer_phone, razorpay_subscription_id, plan_id, status)
       VALUES ($1, $2, $3, $4, 'plan_mock_9', 'created')`,
      [user_id, normalizedEmail, normalizedPhone, testSubId]
    );
  }

  return {
    subscription_id: testSubId,
    key_id: 'rzp_test_mock_viralhub',
    plan_id: 'plan_mock_9',
    email: normalizedEmail,
    is_test_mode: true
  };
}

/**
 * Verifies Razorpay subscription payment signature and activates subscription
 */
async function verifyAndActivateSubscription({
  razorpay_payment_id,
  razorpay_subscription_id,
  razorpay_signature,
  user_id,
  email,
  phone
}) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const normalizedPhone = (phone || '').trim();

  const isRealRazorpay = isRazorpayConfigured() && razorpayInstance;

  if (isRealRazorpay) {
    // Cryptographic verification of Razorpay subscription signature
    // Razorpay signature is generated by hashing payment_id + "|" + subscription_id with key_secret
    if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature) {
      throw new Error('Missing payment verification parameters');
    }

    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(razorpay_signature)
    );

    if (!isValid) {
      throw new Error('Invalid Razorpay signature. Verification failed.');
    }
  } else {
    // In local development test mode, verify subscription ID structure
    if (!razorpay_subscription_id) {
      throw new Error('Missing subscription ID');
    }
  }

  // Calculate 30-day initial subscription period
  const periodStartSql = isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')";
  const periodEndSql = isPostgres 
    ? "CURRENT_TIMESTAMP + INTERVAL '30 days'" 
    : "datetime('now', '+30 days')";

  // Check if subscription record already exists
  const existing = await query.get(
    'SELECT * FROM subscriptions WHERE razorpay_subscription_id = $1',
    [razorpay_subscription_id]
  );

  if (existing) {
    await query.run(
      `UPDATE subscriptions 
       SET status = 'active',
           razorpay_payment_id = $1,
           customer_email = COALESCE(NULLIF($2, ''), customer_email),
           customer_phone = COALESCE(NULLIF($3, ''), customer_phone),
           user_id = COALESCE(NULLIF($4, ''), user_id),
           current_period_start = ${periodStartSql},
           current_period_end = ${periodEndSql},
           updated_at = CURRENT_TIMESTAMP
       WHERE razorpay_subscription_id = $5`,
      [
        razorpay_payment_id || 'pay_test_' + Date.now(),
        normalizedEmail,
        normalizedPhone,
        user_id || 'anonymous',
        razorpay_subscription_id
      ]
    );
  } else {
    await query.run(
      `INSERT INTO subscriptions 
        (user_id, customer_email, customer_phone, razorpay_subscription_id, razorpay_payment_id, plan_id, status, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', ${periodStartSql}, ${periodEndSql})`,
      [
        user_id || 'anonymous',
        normalizedEmail,
        normalizedPhone,
        razorpay_subscription_id,
        razorpay_payment_id || 'pay_test_' + Date.now(),
        RAZORPAY_PLAN_ID || 'plan_mock_9'
      ]
    );
  }

  // Create subscriber session token
  const subToken = createSubscriberToken({
    user_id: user_id || existing?.user_id || 'anonymous',
    email: normalizedEmail || existing?.customer_email,
    sub_id: razorpay_subscription_id
  });

  return {
    success: true,
    subscription_id: razorpay_subscription_id,
    token: subToken,
    email: normalizedEmail
  };
}

/**
 * Verifies a Razorpay Payment Link payment server-side and activates premium access
 */
async function verifyPaymentLinkPayment({
  razorpay_payment_id,
  razorpay_payment_link_id,
  razorpay_payment_link_reference_id,
  razorpay_payment_link_status,
  razorpay_signature,
  user_id,
  email,
  phone
}) {
  if (!razorpay_payment_id) {
    throw new Error('Payment ID is required for verification');
  }

  const isRealRazorpay = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && razorpayInstance);
  let verifiedEmail = (email || '').trim().toLowerCase();
  let verifiedPhone = (phone || '').trim();

  if (isRealRazorpay) {
    // 1. Signature verification if signature was passed back by Razorpay redirect
    if (razorpay_signature && razorpay_payment_link_id) {
      // Signature for payment link: HMAC-SHA256 of payment_link_id + "|" + payment_link_reference_id + "|" + payment_link_status + "|" + payment_id
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
      if (payment.amount < PLAN_AMOUNT) {
        throw new Error(`Payment amount ${payment.amount} is less than required ₹9`);
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

  // Calculate 30-day access period
  const periodStartSql = isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')";
  const periodEndSql = isPostgres 
    ? "CURRENT_TIMESTAMP + INTERVAL '30 days'" 
    : "datetime('now', '+30 days')";

  const subIdentifier = razorpay_payment_link_id || `plink_${razorpay_payment_id}`;

  const existing = await query.get(
    'SELECT * FROM subscriptions WHERE razorpay_subscription_id = $1 OR razorpay_payment_id = $2',
    [subIdentifier, razorpay_payment_id]
  );

  if (existing) {
    await query.run(
      `UPDATE subscriptions 
       SET status = 'active',
           razorpay_payment_id = $1,
           customer_email = COALESCE(NULLIF($2, ''), customer_email),
           customer_phone = COALESCE(NULLIF($3, ''), customer_phone),
           user_id = COALESCE(NULLIF($4, ''), user_id),
           current_period_start = ${periodStartSql},
           current_period_end = ${periodEndSql},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [
        razorpay_payment_id,
        verifiedEmail,
        verifiedPhone,
        user_id || 'anonymous',
        existing.id
      ]
    );
  } else {
    await query.run(
      `INSERT INTO subscriptions 
        (user_id, customer_email, customer_phone, razorpay_subscription_id, razorpay_payment_id, plan_id, status, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4, $5, 'payment_link_9', 'active', ${periodStartSql}, ${periodEndSql})`,
      [
        user_id || 'anonymous',
        verifiedEmail,
        verifiedPhone,
        subIdentifier,
        razorpay_payment_id
      ]
    );
  }

  const token = createSubscriberToken({
    user_id: user_id || existing?.user_id || 'anonymous',
    email: verifiedEmail || existing?.customer_email,
    sub_id: subIdentifier
  });

  return {
    success: true,
    subscribed: true,
    payment_id: razorpay_payment_id,
    token,
    email: verifiedEmail
  };
}

/**
 * Handles incoming Razorpay webhook events
 */
async function handleWebhookEvent(rawBody, signature) {
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
  console.log(`🔔 Received Razorpay webhook event: ${eventName}`);

  const subEntity = event.payload?.subscription?.entity;
  const paymentEntity = event.payload?.payment?.entity;
  const paymentLinkEntity = event.payload?.payment_link?.entity;

  // Handle Payment Link / One-Time Payment Webhook Events
  if (eventName === 'payment_link.paid' || (eventName === 'payment.captured' && !subEntity?.id)) {
    const plinkId = paymentLinkEntity?.id || event.payload?.payment_link_id || (paymentEntity?.id ? `plink_${paymentEntity.id}` : null);
    const pId = paymentEntity?.id || event.payload?.payment_id || paymentLinkEntity?.payment_id;
    const email = (paymentEntity?.email || paymentLinkEntity?.customer?.email || '').trim().toLowerCase();
    const phone = (paymentEntity?.contact || paymentLinkEntity?.customer?.contact || '').trim();
    const periodStartSql = isPostgres ? 'CURRENT_TIMESTAMP' : "datetime('now')";
    const periodEndSql = isPostgres ? "CURRENT_TIMESTAMP + INTERVAL '30 days'" : "datetime('now', '+30 days')";

    if (!plinkId && !pId) {
      console.log('ℹ️ Payment link webhook event missing IDs, skipping.');
      return { status: 'ignored', event: eventName };
    }

    const subKey = plinkId || `plink_${pId}`;
    const existing = await query.get(
      'SELECT id FROM subscriptions WHERE razorpay_subscription_id = $1 OR (razorpay_payment_id IS NOT NULL AND razorpay_payment_id = $2)',
      [subKey, pId]
    );

    if (existing) {
      await query.run(
        `UPDATE subscriptions 
         SET status = 'active',
             razorpay_payment_id = COALESCE($1, razorpay_payment_id),
             customer_email = COALESCE(NULLIF($2, ''), customer_email),
             customer_phone = COALESCE(NULLIF($3, ''), customer_phone),
             current_period_start = COALESCE(current_period_start, ${periodStartSql}),
             current_period_end = ${periodEndSql},
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [pId, email, phone, existing.id]
      );
    } else {
      await query.run(
        `INSERT INTO subscriptions 
          (user_id, customer_email, customer_phone, razorpay_subscription_id, razorpay_payment_id, plan_id, status, current_period_start, current_period_end)
         VALUES ($1, $2, $3, $4, $5, 'payment_link_9', 'active', ${periodStartSql}, ${periodEndSql})`,
        ['anonymous', email, phone, subKey, pId]
      );
    }

    console.log(`✅ Payment link paid & verified via webhook: ${subKey} (Payment ID: ${pId})`);
    return { status: 'processed', event: eventName, payment_id: pId };
  }

  const subscriptionId = subEntity?.id || event.payload?.subscription_id;

  if (!subscriptionId) {
    console.log('ℹ️ Webhook event does not contain subscription ID, skipping.');
    return { status: 'ignored', event: eventName };
  }

  let statusToSet = null;
  let currentStart = subEntity?.current_start ? new Date(subEntity.current_start * 1000) : null;
  let currentEnd = subEntity?.current_end ? new Date(subEntity.current_end * 1000) : null;

  switch (eventName) {
    case 'subscription.activated':
    case 'subscription.charged':
    case 'payment.captured':
      statusToSet = 'active';
      if (!currentEnd) {
        currentEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
      break;

    case 'subscription.cancelled':
      statusToSet = 'cancelled';
      break;

    case 'subscription.completed':
    case 'subscription.halted':
      statusToSet = 'expired';
      break;

    case 'subscription.paused':
      statusToSet = 'paused';
      break;

    case 'payment.failed':
      // Do not cancel immediately on single payment failure, but note it
      console.warn(`⚠️ Payment failed for subscription ${subscriptionId}`);
      break;

    default:
      console.log(`ℹ️ Webhook event ${eventName} not requiring status change.`);
      break;
  }

  if (statusToSet) {
    const paymentId = paymentEntity?.id || null;
    const customerId = subEntity?.customer_id || null;

    await query.run(
      `UPDATE subscriptions 
       SET status = $1,
           razorpay_payment_id = COALESCE($2, razorpay_payment_id),
           razorpay_customer_id = COALESCE($3, razorpay_customer_id),
           current_period_start = COALESCE($4, current_period_start),
           current_period_end = COALESCE($5, current_period_end),
           updated_at = CURRENT_TIMESTAMP
       WHERE razorpay_subscription_id = $6`,
      [statusToSet, paymentId, customerId, currentStart, currentEnd, subscriptionId]
    );

    console.log(`✅ Subscription ${subscriptionId} status updated to: ${statusToSet}`);
  }

  return { status: 'processed', event: eventName, subscription_id: subscriptionId };
}

/**
 * Restores access for a customer by email or subscription ID
 */
async function restoreAccess(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const cleanId = identifier.trim().toLowerCase();

  const nowCheck = isPostgres 
    ? '(current_period_end IS NULL OR current_period_end > NOW())' 
    : "(current_period_end IS NULL OR current_period_end > datetime('now'))";

  const rows = await query.all(
    `SELECT * FROM subscriptions 
     WHERE (LOWER(customer_email) = $1 OR razorpay_subscription_id = $2)
       AND status = 'active'
       AND ${nowCheck}
     ORDER BY id DESC LIMIT 1`,
    [cleanId, cleanId]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const sub = rows[0];
  const token = createSubscriberToken({
    user_id: sub.user_id,
    email: sub.customer_email,
    sub_id: sub.razorpay_subscription_id
  });

  return {
    subscription: sub,
    token: token
  };
}

/**
 * Returns subscription statistics and recent subscriptions for admin panel
 */
async function getAdminSubscriptions() {
  const statsRes = await query.get(`
    SELECT 
      COUNT(*)::int AS total_subscriptions,
      COUNT(*) FILTER (WHERE status = 'active')::int AS active_subscriptions,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_subscriptions,
      COUNT(*) FILTER (WHERE status = 'expired' OR status = 'halted')::int AS expired_subscriptions
    FROM subscriptions
  `);

  const subscriptions = await query.all(`
    SELECT 
      id, 
      user_id, 
      customer_email, 
      customer_phone, 
      razorpay_subscription_id, 
      razorpay_payment_id, 
      plan_id, 
      status, 
      current_period_start, 
      current_period_end, 
      created_at, 
      updated_at
    FROM subscriptions
    ORDER BY created_at DESC
    LIMIT 100
  `);

  const activeCount = Number(statsRes?.active_subscriptions || 0);

  return {
    summary: {
      total: Number(statsRes?.total_subscriptions || 0),
      active: activeCount,
      cancelled: Number(statsRes?.cancelled_subscriptions || 0),
      expired: Number(statsRes?.expired_subscriptions || 0),
      mrr: activeCount * 9 // ₹9/month * active subscribers
    },
    subscriptions
  };
}

module.exports = {
  PLAN_PRICE,
  PLAN_AMOUNT,
  isRazorpayConfigured,
  getPublicConfig,
  createSubscriberToken,
  verifySubscriberToken,
  hasActiveSubscription,
  createSubscription,
  verifyAndActivateSubscription,
  verifyPaymentLinkPayment,
  handleWebhookEvent,
  restoreAccess,
  getAdminSubscriptions
};
