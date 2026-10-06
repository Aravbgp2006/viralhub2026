/**
 * services/cashfree.js
 * 
 * Generic Cashfree Sandbox Payment Demo Service
 * Isolated from video, content, and entitlement paywall systems.
 * 
 * Never exposes CASHFREE_SECRET_KEY to client or logs.
 */

const crypto = require('crypto');

const SANDBOX_BASE_URL = 'https://sandbox.cashfree.com/pg';
const PROD_BASE_URL = 'https://api.cashfree.com/pg';
const API_VERSION = '2023-08-01';

// In-memory test store for sandbox simulation when test credentials are not yet configured
const mockOrderStore = new Map();

function getAppId() {
  return (process.env.CASHFREE_APP_ID || '').trim();
}

function getSecretKey() {
  return (process.env.CASHFREE_SECRET_KEY || '').trim();
}

function getEnvironment() {
  return (process.env.CASHFREE_ENV || 'sandbox').trim().toLowerCase();
}

function getBaseUrl() {
  return getEnvironment() === 'production' ? PROD_BASE_URL : SANDBOX_BASE_URL;
}

/**
 * Returns true if Cashfree credentials are set and non-placeholder.
 */
function isCashfreeConfigured() {
  const appId = getAppId();
  const secret = getSecretKey();
  if (!appId || !secret) return false;
  if (appId.includes('TEST_APP_ID') || appId.includes('YOUR_')) return false;
  return true;
}

/**
 * Safe public configuration object. Never returns the secret key.
 */
function getCashfreePublicConfig() {
  const configured = isCashfreeConfigured();
  const appId = getAppId();
  return {
    configured,
    environment: getEnvironment(),
    // Expose masked indicator only if configured
    app_id_preview: configured && appId.length > 6 ? `${appId.slice(0, 4)}...${appId.slice(-3)}` : null
  };
}

/**
 * Creates a Cashfree order (Sandbox or Live based on CASHFREE_ENV).
 * Defaults to ₹1.00 for the test demo.
 */
async function createCashfreeOrder(options = {}) {
  const amount = options.amount !== undefined ? Number(options.amount).toFixed(2) : '1.00';
  const currency = options.currency || 'INR';
  const orderId = options.orderId || `cf_test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const customerId = options.customerId || `cust_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const customerPhone = options.customerPhone || '9999999999';
  const customerEmail = options.customerEmail || 'sandbox.test@cashfree.com';
  const customerName = options.customerName || 'Sandbox Test User';
  const returnUrl = options.returnUrl || `http://localhost:3000/payment-test?order_id=${orderId}`;

  // Log non-sensitive order creation intent
  console.log(`[Cashfree Sandbox Demo] Creating test order: ${orderId}, amount: ₹${amount}`);

  if (isCashfreeConfigured()) {
    const baseUrl = getBaseUrl();
    try {
      const payload = {
        order_id: orderId,
        order_amount: parseFloat(amount),
        order_currency: currency,
        customer_details: {
          customer_id: customerId,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          customer_name: customerName
        },
        order_meta: {
          return_url: returnUrl
        },
        order_note: options.orderNote || 'Cashfree Payment Order',
        ...(options.orderTags && typeof options.orderTags === 'object' ? { order_tags: options.orderTags } : {})
      };

      const response = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-version': API_VERSION,
          'x-client-id': getAppId(),
          'x-client-secret': getSecretKey(),
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`[Cashfree API Error] Status ${response.status}:`, data.message || data);
        return {
          success: false,
          error: data.message || `Cashfree API returned error ${response.status}`,
          code: data.code || 'API_ERROR'
        };
      }

      return {
        success: true,
        order_id: data.order_id,
        payment_session_id: data.payment_session_id,
        order_status: data.order_status,
        order_amount: data.order_amount,
        order_currency: data.order_currency,
        cf_order_id: data.cf_order_id,
        environment: getEnvironment(),
        is_simulated: false
      };
    } catch (err) {
      console.error('[Cashfree API Network Error]:', err.message);
      return {
        success: false,
        error: 'Failed to communicate with Cashfree API: ' + err.message
      };
    }
  } else {
    // When credentials are not yet entered, generate a valid simulated sandbox session
    // so tests and the demonstration UI work cleanly.
    console.log('[Cashfree Sandbox Demo] No live credentials configured. Running in sandbox simulation mode.');
    const simulatedSessionId = `session_sandbox_demo_${Date.now()}_${crypto.randomBytes(12).toString('hex')}`;
    mockOrderStore.set(orderId, {
      order_id: orderId,
      payment_session_id: simulatedSessionId,
      order_status: 'ACTIVE',
      order_amount: amount,
      order_currency: currency,
      customer_id: customerId,
      created_at: new Date().toISOString(),
      is_simulated: true
    });

    return {
      success: true,
      order_id: orderId,
      payment_session_id: simulatedSessionId,
      order_status: 'ACTIVE',
      order_amount: parseFloat(amount),
      order_currency: currency,
      environment: 'sandbox',
      is_simulated: true
    };
  }
}

/**
 * Verifies the status of a Cashfree order.
 */
async function verifyCashfreeOrder(orderId) {
  if (!orderId) {
    return { success: false, error: 'order_id is required' };
  }

  console.log(`[Cashfree Sandbox Demo] Verifying order status for: ${orderId}`);

  // Check simulated store first
  if (mockOrderStore.has(orderId)) {
    const record = mockOrderStore.get(orderId);
    const isPaid = (record.order_status === 'PAID');
    return {
      success: true,
      order_id: record.order_id,
      order_status: record.order_status,
      order_amount: record.order_amount,
      order_currency: record.order_currency,
      order_tags: record.order_tags || null,
      is_paid: isPaid,
      environment: 'sandbox',
      is_simulated: true
    };
  }

  if (isCashfreeConfigured()) {
    const baseUrl = getBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}`, {
        method: 'GET',
        headers: {
          'x-api-version': API_VERSION,
          'x-client-id': getAppId(),
          'x-client-secret': getSecretKey(),
          'Accept': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`[Cashfree API Verification Error] Status ${response.status}:`, data.message || data);
        return {
          success: false,
          error: data.message || `Cashfree API returned error ${response.status}`
        };
      }

      const isPaid = (data.order_status === 'PAID');

      return {
        success: true,
        order_id: data.order_id,
        order_status: data.order_status,
        order_amount: data.order_amount,
        order_currency: data.order_currency,
        cf_order_id: data.cf_order_id,
        order_tags: data.order_tags || null,
        is_paid: isPaid,
        environment: getEnvironment(),
        is_simulated: false
      };
    } catch (err) {
      console.error('[Cashfree Verification Network Error]:', err.message);
      return {
        success: false,
        error: 'Failed to verify Cashfree order: ' + err.message
      };
    }
  }

  return {
    success: false,
    error: `Order ${orderId} not found or Cashfree credentials unconfigured.`
  };
}

module.exports = {
  isCashfreeConfigured,
  getCashfreePublicConfig,
  createCashfreeOrder,
  verifyCashfreeOrder,
  mockOrderStore
};
