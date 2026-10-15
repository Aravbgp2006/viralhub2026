/**
 * scripts/migrate_display_duration.js
 * Adds display_duration column to Neon PostgreSQL and SQLite databases.
 * Backward-compatible non-destructive migration.
 */

require('dotenv').config();
const { initDatabase, query, isPostgres } = require('../database/db');

async function migrate() {
  await initDatabase();

  console.log('Adding display_duration column...');
  if (isPostgres) {
    await query.raw(`
      ALTER TABLE videos ADD COLUMN IF NOT EXISTS display_duration VARCHAR(20);
    `);
  } else {
    try {
      await query.raw(`ALTER TABLE videos ADD COLUMN display_duration TEXT`);
    } catch (e) {
      // Column might already exist in SQLite
      console.log('SQLite column note:', e.message);
    }
  }

  const sample = await query.get(`SELECT id, title, duration, duration_seconds, display_duration FROM videos LIMIT 1`);
  console.log('Sample video after migration:', sample);
  console.log('Migration completed successfully!');
}

migrate().then(() => process.exit(0)).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
