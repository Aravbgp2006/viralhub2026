/**
 * services/blob.js
 * Vercel Blob Storage Integration Service
 * Manages client upload authorization, file deletion, and helper utilities.
 */

require('dotenv').config();
const { del, put } = require('@vercel/blob');
const { handleUpload } = require('@vercel/blob/client');

/**
 * Checks whether Vercel Blob is configured via environment variables
 */
function isBlobConfigured() {
  return Boolean(
    (process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_READ_WRITE_TOKEN.trim()) ||
    process.env.VERCEL_OIDC_TOKEN
  );
}

/**
 * Checks whether a given URL is a Vercel Blob Store URL
 */
function isBlobUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('https://') && url.includes('.blob.vercel-storage.com');
}

/**
 * Safely deletes one or more Blob objects from Vercel Blob Store
 * Never throws fatal error to prevent database inconsistency
 */
async function safeDeleteBlob(urls) {
  if (!isBlobConfigured()) return;
  const list = Array.isArray(urls) ? urls : [urls];
  const validBlobUrls = list.filter(isBlobUrl);

  if (validBlobUrls.length === 0) return;

  try {
    await del(validBlobUrls);
    console.log(`🗑️ Deleted ${validBlobUrls.length} object(s) from Vercel Blob`);
  } catch (err) {
    console.error('⚠️ Warning: Non-fatal error deleting from Vercel Blob:', err.message);
  }
}

module.exports = {
  isBlobConfigured,
  isBlobUrl,
  safeDeleteBlob,
  del,
  put,
  handleUpload
};
