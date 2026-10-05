/**
 * scripts/migrate_uploads_to_blob.js
 * Migrates existing local video and thumbnail files to Vercel Blob Store.
 * Updates records in Neon PostgreSQL while preserving local files on disk.
 * 
 * Usage:
 *   npm run migrate:blob
 *   or:
 *   node scripts/migrate_uploads_to_blob.js
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { put, isBlobConfigured, isBlobUrl } = require('../services/blob');
const { query, initDatabase } = require('../database/db');

async function migrateUploadsToBlob() {
  console.log('================================================================================');
  console.log('📦 Starting Local Uploads -> Vercel Blob Migration');
  console.log('================================================================================\n');

  if (!isBlobConfigured()) {
    console.error('❌ ERROR: BLOB_READ_WRITE_TOKEN environment variable is missing!\n');
    console.error('Please configure BLOB_READ_WRITE_TOKEN in your environment or .env file.');
    process.exit(1);
  }

  await initDatabase();

  const videos = await query.all('SELECT id, title, video_path, thumbnail_path FROM videos ORDER BY id ASC');
  console.log(`Found ${videos.length} total video record(s) in Neon PostgreSQL.\n`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const v of videos) {
    console.log(`--- Processing Video #${v.id}: "${v.title}" ---`);
    let updatedVideoUrl = v.video_path;
    let updatedThumbUrl = v.thumbnail_path;
    let needsUpdate = false;

    // 1. Check Video File
    if (v.video_path && !isBlobUrl(v.video_path) && v.video_path.startsWith('/uploads/videos/')) {
      const localRel = v.video_path.replace(/^\//, '');
      const localAbs = path.join(__dirname, '..', localRel);

      if (fs.existsSync(localAbs)) {
        console.log(`   Uploading video file: ${path.basename(localAbs)}...`);
        const fileStream = fs.createReadStream(localAbs);
        const blobName = `videos/${Date.now()}_${path.basename(localAbs)}`;
        const blob = await put(blobName, fileStream, {
          access: 'public',
          addRandomSuffix: true
        });
        updatedVideoUrl = blob.url;
        needsUpdate = true;
        console.log(`   ✅ Video uploaded to Vercel Blob.`);
      } else {
        console.warn(`   ⚠️ Local video file not found at: ${localAbs} (skipping video upload)`);
      }
    } else {
      console.log(`   ℹ️ Video already hosted on external/blob URL.`);
    }

    // 2. Check Thumbnail File
    if (v.thumbnail_path && !isBlobUrl(v.thumbnail_path) && v.thumbnail_path.startsWith('/uploads/thumbnails/')) {
      const localRel = v.thumbnail_path.replace(/^\//, '');
      const localAbs = path.join(__dirname, '..', localRel);

      if (fs.existsSync(localAbs)) {
        console.log(`   Uploading thumbnail file: ${path.basename(localAbs)}...`);
        const fileStream = fs.createReadStream(localAbs);
        const blobName = `thumbnails/${Date.now()}_${path.basename(localAbs)}`;
        const blob = await put(blobName, fileStream, {
          access: 'public',
          addRandomSuffix: true
        });
        updatedThumbUrl = blob.url;
        needsUpdate = true;
        console.log(`   ✅ Thumbnail uploaded to Vercel Blob.`);
      } else {
        console.warn(`   ⚠️ Local thumbnail file not found at: ${localAbs} (skipping thumbnail upload)`);
      }
    } else {
      console.log(`   ℹ️ Thumbnail already hosted on external/blob URL.`);
    }

    // 3. Update Database Record
    if (needsUpdate) {
      await query.run(
        `UPDATE videos 
         SET 
           video_url = $1, 
           video_path = $1, 
           thumbnail_url = $2, 
           thumbnail_path = $2 
         WHERE id = $3`,
        [updatedVideoUrl, updatedThumbUrl, v.id]
      );
      migratedCount++;
      console.log(`   💾 Neon PostgreSQL record updated for ID ${v.id}.\n`);
    } else {
      skippedCount++;
      console.log(`   ⏭️ No migration needed for Video #${v.id}.\n`);
    }
  }

  console.log('================================================================================');
  console.log('🎉 LOCAL UPLOADS TO VERCEL BLOB MIGRATION COMPLETE');
  console.log(`   - Videos migrated: ${migratedCount}`);
  console.log(`   - Videos skipped:  ${skippedCount}`);
  console.log(`   - Local files preserved: ✅ (No local files were deleted)`);
  console.log('================================================================================\n');
}

if (require.main === module) {
  migrateUploadsToBlob().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}

module.exports = { migrateUploadsToBlob };
