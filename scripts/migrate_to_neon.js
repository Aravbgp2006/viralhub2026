/**
 * scripts/migrate_to_neon.js
 * Safe SQLite to Neon PostgreSQL Data Migration Script
 * 
 * Usage:
 *   node scripts/migrate_to_neon.js
 *   or:
 *   DATABASE_URL="postgresql://..." node scripts/migrate_to_neon.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

async function migrate() {
  console.log('================================================================================');
  console.log('📦 Starting ViralHub SQLite -> Neon PostgreSQL Migration');
  console.log('================================================================================\n');

  const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!DATABASE_URL || !DATABASE_URL.trim()) {
    console.error('❌ ERROR: DATABASE_URL environment variable is missing!\n');
    console.error('Please configure DATABASE_URL in your environment or .env file before running migration.');
    process.exit(1);
  }

  const SQLITE_PATH = path.join(__dirname, '..', 'database', 'videos.db');
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ ERROR: Source SQLite database not found at: ${SQLITE_PATH}`);
    process.exit(1);
  }

  // 1. Read existing records from SQLite
  console.log('1️⃣  Reading existing records from SQLite database at:', SQLITE_PATH);
  const sqliteDb = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY);

  const sqliteRecords = await new Promise((resolve, reject) => {
    sqliteDb.all('SELECT * FROM videos ORDER BY id ASC', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

  console.log(`   Found ${sqliteRecords.length} video record(s) in SQLite database.`);

  // 2. Connect to Neon PostgreSQL
  console.log('2️⃣  Connecting to Neon PostgreSQL...');
  const poolConfig = {
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 15000
  };
  if (DATABASE_URL.includes('localhost')) {
    poolConfig.ssl = false;
  } else if (!DATABASE_URL.includes('sslmode=')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
  const pool = new Pool(poolConfig);

  const client = await pool.connect();
  console.log('   Connected to PostgreSQL successfully.');

  try {
    // 3. Create PostgreSQL videos table and indexes if not exists
    console.log('3️⃣  Verifying PostgreSQL table schema...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'latest',
        video_url TEXT,
        video_path TEXT,
        thumbnail_url TEXT,
        thumbnail_path TEXT,
        duration VARCHAR(20) DEFAULT '03:45',
        published BOOLEAN DEFAULT TRUE,
        views BIGINT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_videos_published ON videos (published);
      CREATE INDEX IF NOT EXISTS idx_videos_category ON videos (category);
      CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_videos_views ON videos (views DESC);
    `);
    console.log('   PostgreSQL `videos` table and indexes verified.');

    // 4. Copy records to PostgreSQL with ON CONFLICT DO UPDATE (idempotent, no duplicates)
    console.log('4️⃣  Migrating records to PostgreSQL...');
    let migratedCount = 0;

    for (const v of sqliteRecords) {
      const videoPath = v.video_path || v.video_url || '';
      const thumbPath = v.thumbnail_path || v.thumbnail_url || '';
      const isPublished = Boolean(v.published === 1 || v.published === true || v.published === '1');
      const views = Number(v.views) || 0;
      const createdAt = v.created_at ? new Date(v.created_at).toISOString() : new Date().toISOString();

      await client.query(
        `INSERT INTO videos (
           id, title, description, category,
           video_url, video_path,
           thumbnail_url, thumbnail_path,
           duration, published, views, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           video_url = EXCLUDED.video_url,
           video_path = EXCLUDED.video_path,
           thumbnail_url = EXCLUDED.thumbnail_url,
           thumbnail_path = EXCLUDED.thumbnail_path,
           duration = EXCLUDED.duration,
           published = EXCLUDED.published,
           views = EXCLUDED.views,
           created_at = EXCLUDED.created_at`,
        [
          v.id,
          v.title,
          v.description || '',
          v.category || 'latest',
          videoPath,
          videoPath,
          thumbPath,
          thumbPath,
          v.duration || '03:45',
          isPublished,
          views,
          createdAt
        ]
      );
      migratedCount++;
    }

    // 5. Update Postgres sequence so new inserts start after the highest migrated ID
    console.log('5️⃣  Syncing PostgreSQL sequence...');
    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('videos', 'id'),
        COALESCE((SELECT MAX(id) FROM videos), 1)
      );
    `);

    // 6. Verify total records in PostgreSQL
    const countCheck = await client.query('SELECT COUNT(*)::int AS total FROM videos');
    const totalInPg = countCheck.rows[0].total;

    console.log('\n================================================================================');
    console.log('🎉 MIGRATION COMPLETED SUCCESSFULLY!');
    console.log(`   - Records from SQLite: ${sqliteRecords.length}`);
    console.log(`   - Records migrated:    ${migratedCount}`);
    console.log(`   - Total in PostgreSQL: ${totalInPg}`);
    console.log('   - Original SQLite file preserved: ✅ (database/videos.db not deleted)');
    console.log('================================================================================\n');

  } catch (err) {
    console.error('\n❌ Migration failed with error:', err.message || 'Database error');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    sqliteDb.close();
  }
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('Fatal migration error:', err);
    process.exit(1);
  });
}

module.exports = { migrate };
