/**
 * scripts/migrate_thumbnail_aspect_ratio.js
 * Adds thumbnail_aspect_ratio column to Neon PostgreSQL and SQLite databases.
 */

require('dotenv').config();
const { initDatabase, query, isPostgres } = require('../database/db');

async function migrate() {
  await initDatabase();

  console.log('Adding thumbnail_aspect_ratio column...');
  if (isPostgres) {
    await query.raw(`
      ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_aspect_ratio VARCHAR(10) DEFAULT '16:9';
      UPDATE videos SET thumbnail_aspect_ratio = '16:9' WHERE thumbnail_aspect_ratio IS NULL;
    `);
  } else {
    try {
      await query.raw(`ALTER TABLE videos ADD COLUMN thumbnail_aspect_ratio TEXT DEFAULT '16:9'`);
    } catch (e) {
      // Column might already exist in SQLite
      console.log('SQLite column note:', e.message);
    }
  }

  const sample = await query.get(`SELECT id, title, thumbnail_aspect_ratio FROM videos LIMIT 1`);
  console.log('Sample video after migration:', sample);
  console.log('Migration completed successfully!');
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
