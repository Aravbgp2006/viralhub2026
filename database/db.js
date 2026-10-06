/**
 * database/db.js
 * Database Connection and Query Management for ViralHub CMS
 * Supports Neon PostgreSQL (production) with local SQLite fallback.
 */

require('dotenv').config();
const { Pool } = require('pg');
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const isPostgres = Boolean(DATABASE_URL && DATABASE_URL.trim());

let pgPool = null;
let sqliteDb = null;

if (isPostgres) {
  // Configure PostgreSQL connection pool for Neon
  const poolConfig = {
    connectionString: DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  };

  if (DATABASE_URL.includes('localhost')) {
    poolConfig.ssl = false;
  } else if (!DATABASE_URL.includes('sslmode=')) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  pgPool = new Pool(poolConfig);

  pgPool.on('error', (err) => {
    console.error('⚠️ Unexpected error on idle PostgreSQL client:', err.message);
  });
} else {
  const isProduction = Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production');

  if (isProduction) {
    console.error('❌ FATAL: Running in production/Vercel without DATABASE_URL!');
    throw new Error('[DATABASE_URL REQUIRED] DATABASE_URL environment variable is required in production on Vercel.');
  }

  const path = require('path');
  const fs = require('fs');
  const sqlite3 = require('sqlite3').verbose();

  const DB_PATH = path.join(__dirname, 'videos.db');
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  sqliteDb = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('❌ Error opening SQLite database:', err.message);
    }
  });
}

async function executePgQuery(sql, params = [], retries = 3) {
  try {
    return await pgPool.query(sql, params);
  } catch (err) {
    const isConnErr = err.message && (
      err.message.includes('Connection terminated') ||
      err.message.includes('timeout') ||
      err.message.includes('ECONNRESET') ||
      err.message.includes('ENOTFOUND') ||
      err.message.includes('closed') ||
      err.message.includes('terminating connection')
    );
    if (retries > 0 && isConnErr) {
      await new Promise(r => setTimeout(r, 200));
      return executePgQuery(sql, params, retries - 1);
    }
    throw err;
  }
}

// --------------------------------------------------------------------------
// Unified Query Interface
// --------------------------------------------------------------------------
const query = {
  // Fetch a single row (or null)
  async get(sql, params = []) {
    if (isPostgres) {
      const res = await executePgQuery(sql, params);
      return res.rows[0] || null;
    } else {
      const { adaptedSql, adaptedParams, isReturning } = adaptSqlForSqlite(sql, params);
      if (isReturning && /^(?:UPDATE|INSERT)\s+/i.test(adaptedSql)) {
        return new Promise((resolve, reject) => {
          sqliteDb.run(adaptedSql, adaptedParams, function (err) {
            if (err) return reject(err);
            const idParam = params[params.length - 1];
            const targetId = this.lastID || idParam;
            if (targetId) {
              sqliteDb.get('SELECT * FROM videos WHERE id = ?', [targetId], (err2, row) => {
                if (err2) resolve(null);
                else resolve(row || null);
              });
            } else {
              resolve(null);
            }
          });
        });
      }

      return new Promise((resolve, reject) => {
        sqliteDb.get(adaptedSql, adaptedParams, (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    }
  },

  // Fetch all rows
  async all(sql, params = []) {
    if (isPostgres) {
      const res = await executePgQuery(sql, params);
      return res.rows;
    } else {
      const { adaptedSql, adaptedParams } = adaptSqlForSqlite(sql, params);
      return new Promise((resolve, reject) => {
        sqliteDb.all(adaptedSql, adaptedParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });
    }
  },

  // Execute an INSERT / UPDATE / DELETE statement
  async run(sql, params = []) {
    if (isPostgres) {
      const res = await executePgQuery(sql, params);
      return {
        rowCount: res.rowCount,
        lastID: res.rows && res.rows[0] ? res.rows[0].id : null,
        rows: res.rows || []
      };
    } else {
      const { adaptedSql, adaptedParams, isReturning } = adaptSqlForSqlite(sql, params);
      if (isReturning) {
        // If query had RETURNING, emulate in SQLite by running and then getting row
        return new Promise((resolve, reject) => {
          sqliteDb.run(adaptedSql, adaptedParams, function (err) {
            if (err) return reject(err);
            const lastID = this.lastID;
            const changes = this.changes;
            if (lastID) {
              sqliteDb.get('SELECT * FROM videos WHERE id = ?', [lastID], (err2, row) => {
                if (err2) resolve({ lastID, changes, rows: [] });
                else resolve({ lastID, changes, rows: row ? [row] : [] });
              });
            } else {
              resolve({ lastID, changes, rows: [] });
            }
          });
        });
      }

      return new Promise((resolve, reject) => {
        sqliteDb.run(adaptedSql, adaptedParams, function (err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes, rowCount: this.changes });
        });
      });
    }
  },

  // Raw query execution
  async raw(sql, params = []) {
    if (isPostgres) {
      return await executePgQuery(sql, params);
    } else {
      const { adaptedSql, adaptedParams } = adaptSqlForSqlite(sql, params);
      return new Promise((resolve, reject) => {
        sqliteDb.all(adaptedSql, adaptedParams, (err, rows) => {
          if (err) reject(err);
          else resolve({ rows });
        });
      });
    }
  }
};

// SQLite adapter for local fallback
function adaptSqlForSqlite(sql, params) {
  let adaptedSql = sql;
  const isReturning = /RETURNING\s+.+/i.test(adaptedSql);

  // Convert PostgreSQL $1, $2, ... to SQLite ?
  adaptedSql = adaptedSql.replace(/\$\d+/g, '?');

  // Convert ILIKE to LIKE
  adaptedSql = adaptedSql.replace(/ILIKE/gi, 'LIKE');

  // Convert intervals: NOW() - INTERVAL '7 days' -> datetime('now', '-7 days')
  adaptedSql = adaptedSql.replace(/NOW\(\)\s*-\s*INTERVAL\s*'7\s*days'/gi, "datetime('now', '-7 days')");
  adaptedSql = adaptedSql.replace(/NOW\(\)\s*\+\s*INTERVAL\s*'30\s*days'/gi, "datetime('now', '+30 days')");
  adaptedSql = adaptedSql.replace(/NOW\(\)/gi, "datetime('now')");

  // Convert PostgreSQL FILTER clauses to SUM(CASE ...) for SQLite
  adaptedSql = adaptedSql.replace(/COUNT\(\*\)\s+FILTER\s*\(WHERE\s+published\s*=\s*true\)::int/gi, "SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END)");
  adaptedSql = adaptedSql.replace(/COUNT\(\*\)\s+FILTER\s*\(WHERE\s+published\s*=\s*false\)::int/gi, "SUM(CASE WHEN published = 0 THEN 1 ELSE 0 END)");
  adaptedSql = adaptedSql.replace(/COUNT\(\*\)::int/gi, "COUNT(*)");
  adaptedSql = adaptedSql.replace(/COALESCE\(SUM\(views\),\s*0\)::bigint/gi, "COALESCE(SUM(views), 0)");

  // Convert boolean equals for SQLite
  adaptedSql = adaptedSql.replace(/published\s*=\s*true/gi, "(published = 1 OR published = true)");
  adaptedSql = adaptedSql.replace(/published\s*=\s*false/gi, "(published = 0 OR published = false)");

  // Strip RETURNING clause for SQLite run()
  adaptedSql = adaptedSql.replace(/RETURNING\s+[\w\s,\*]+/gi, '').trim();

  // Convert boolean params: true -> 1, false -> 0
  const adaptedParams = params.map(p => {
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });

  return { adaptedSql, adaptedParams, isReturning };
}

// --------------------------------------------------------------------------
// Initialize Database Schema & Seed if Empty
// --------------------------------------------------------------------------
async function initDatabase() {
  if (isPostgres) {
    console.log('🚀 Checking Neon PostgreSQL schema...');
    
    let attempts = 0;
    const maxAttempts = 3;
    while (attempts < maxAttempts) {
      try {
        attempts++;
        // Create PostgreSQL videos table with full field support
        await query.raw(`
          CREATE TABLE IF NOT EXISTS videos (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            category VARCHAR(50) DEFAULT 'latest',
            video_url TEXT,
            video_path TEXT,
            thumbnail_url TEXT,
            thumbnail_path TEXT,
            duration VARCHAR(20) DEFAULT '00:00',
            duration_seconds INTEGER,
            thumbnail_aspect_ratio VARCHAR(10) DEFAULT '16:9',
            published BOOLEAN DEFAULT TRUE,
            views BIGINT DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );

          -- Safe non-destructive column addition for existing production databases
          ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
          ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_aspect_ratio VARCHAR(10) DEFAULT '16:9';

          CREATE INDEX IF NOT EXISTS idx_videos_published ON videos (published);
          CREATE INDEX IF NOT EXISTS idx_videos_category ON videos (category);
          CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos (created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_videos_views ON videos (views DESC);

          -- Create PostgreSQL subscriptions table
          CREATE TABLE IF NOT EXISTS subscriptions (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            customer_email TEXT,
            customer_phone TEXT,
            razorpay_subscription_id TEXT UNIQUE NOT NULL,
            razorpay_customer_id TEXT,
            razorpay_payment_id TEXT,
            plan_id TEXT NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'created',
            current_period_start TIMESTAMPTZ,
            current_period_end TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
          CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);
          CREATE INDEX IF NOT EXISTS idx_subscriptions_razorpay_sub_id ON subscriptions (razorpay_subscription_id);
          CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_email ON subscriptions (customer_email);

          -- Create PostgreSQL entitlements table for per-video access
          CREATE TABLE IF NOT EXISTS entitlements (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            video_id INTEGER NOT NULL,
            customer_email TEXT,
            customer_phone TEXT,
            razorpay_payment_id TEXT,
            razorpay_order_id TEXT,
            amount INTEGER DEFAULT 900,
            status VARCHAR(50) NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT unique_user_video_entitlement UNIQUE (user_id, video_id)
          );

          CREATE INDEX IF NOT EXISTS idx_entitlements_user_video ON entitlements (user_id, video_id);
          CREATE INDEX IF NOT EXISTS idx_entitlements_email_video ON entitlements (customer_email, video_id);
          CREATE INDEX IF NOT EXISTS idx_entitlements_video_id ON entitlements (video_id);
          CREATE INDEX IF NOT EXISTS idx_entitlements_payment_id ON entitlements (razorpay_payment_id);
          CREATE INDEX IF NOT EXISTS idx_entitlements_status ON entitlements (status);

          -- Create PostgreSQL video_entitlements table (per-video purchase model)
          CREATE TABLE IF NOT EXISTS video_entitlements (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            video_id INTEGER NOT NULL,
            payment_id TEXT,
            amount INTEGER DEFAULT 900,
            status VARCHAR(50) NOT NULL DEFAULT 'active',
            purchased_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMPTZ,
            customer_email TEXT,
            customer_phone TEXT,
            CONSTRAINT unique_user_video_purchase UNIQUE (user_id, video_id)
          );

          CREATE INDEX IF NOT EXISTS idx_ventitlements_user_vid ON video_entitlements (user_id, video_id);
          CREATE INDEX IF NOT EXISTS idx_ventitlements_payment_id ON video_entitlements (payment_id);
          CREATE INDEX IF NOT EXISTS idx_ventitlements_video_id ON video_entitlements (video_id);

          ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
          ALTER TABLE video_entitlements ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

          -- Create PostgreSQL featured_home_videos table (up to 6 slots)
          CREATE TABLE IF NOT EXISTS featured_home_videos (
            id SERIAL PRIMARY KEY,
            video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
            position INTEGER NOT NULL UNIQUE CHECK (position >= 1 AND position <= 6),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_featured_videos_pos ON featured_home_videos (position);
          CREATE INDEX IF NOT EXISTS idx_featured_videos_active ON featured_home_videos (is_active);
          CREATE INDEX IF NOT EXISTS idx_featured_videos_vid ON featured_home_videos (video_id);
        `);
        break;
      } catch (err) {
        if (attempts >= maxAttempts) throw err;
        console.warn(`⚠️ Neon connection attempt ${attempts} timed out (waking up compute), retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    console.log('✅ Neon PostgreSQL `videos`, `subscriptions`, `entitlements`, and `featured_home_videos` tables ready.');

    // Check if initial seeding is needed
    const countRes = await query.get('SELECT COUNT(*)::int AS total FROM videos');
    if (countRes && countRes.total === 0) {
      console.log('🌱 Seeding initial demo videos into Neon PostgreSQL...');
      await seedInitialVideos();
    }
    await seedFeaturedVideosIfEmpty();
  } else {
    // Local SQLite fallback schema
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'latest',
        video_url TEXT,
        video_path TEXT NOT NULL,
        thumbnail_url TEXT,
        thumbnail_path TEXT NOT NULL,
        duration TEXT DEFAULT '00:00',
        duration_seconds INTEGER,
        published INTEGER DEFAULT 1,
        views INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        customer_email TEXT,
        customer_phone TEXT,
        razorpay_subscription_id TEXT UNIQUE NOT NULL,
        razorpay_customer_id TEXT,
        razorpay_payment_id TEXT,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'created',
        current_period_start DATETIME,
        current_period_end DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS entitlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        video_id INTEGER NOT NULL,
        customer_email TEXT,
        customer_phone TEXT,
        razorpay_payment_id TEXT,
        razorpay_order_id TEXT,
        amount INTEGER DEFAULT 900,
        status TEXT NOT NULL DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, video_id)
      );

      CREATE INDEX IF NOT EXISTS idx_entitlements_user_video ON entitlements (user_id, video_id);
      CREATE INDEX IF NOT EXISTS idx_entitlements_email_video ON entitlements (customer_email, video_id);
      CREATE INDEX IF NOT EXISTS idx_entitlements_video_id ON entitlements (video_id);
      CREATE INDEX IF NOT EXISTS idx_entitlements_payment_id ON entitlements (razorpay_payment_id);
      CREATE INDEX IF NOT EXISTS idx_entitlements_status ON entitlements (status);

      CREATE TABLE IF NOT EXISTS video_entitlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        video_id INTEGER NOT NULL,
        payment_id TEXT,
        amount INTEGER DEFAULT 900,
        status TEXT NOT NULL DEFAULT 'active',
        purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME,
        customer_email TEXT,
        customer_phone TEXT,
        UNIQUE(user_id, video_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ventitlements_user_vid ON video_entitlements (user_id, video_id);
      CREATE INDEX IF NOT EXISTS idx_ventitlements_payment_id ON video_entitlements (payment_id);
      CREATE INDEX IF NOT EXISTS idx_ventitlements_video_id ON video_entitlements (video_id);

      -- Create SQLite featured_home_videos table (up to 6 slots)
      CREATE TABLE IF NOT EXISTS featured_home_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        position INTEGER NOT NULL UNIQUE CHECK (position >= 1 AND position <= 6),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_featured_videos_pos ON featured_home_videos (position);
      CREATE INDEX IF NOT EXISTS idx_featured_videos_active ON featured_home_videos (is_active);
      CREATE INDEX IF NOT EXISTS idx_featured_videos_vid ON featured_home_videos (video_id);
    `;

    await query.raw(createTableSql);

    // Ensure video_url and thumbnail_url exist on existing SQLite table for backward compatibility
    await new Promise((resolve) => {
      sqliteDb.all('PRAGMA table_info(videos)', [], async (err, cols) => {
        if (!err && Array.isArray(cols)) {
          const colNames = cols.map(c => c.name);
          if (!colNames.includes('video_url')) {
            await new Promise(r => sqliteDb.run('ALTER TABLE videos ADD COLUMN video_url TEXT', r));
            await new Promise(r => sqliteDb.run('UPDATE videos SET video_url = video_path WHERE video_url IS NULL', r));
          }
          if (!colNames.includes('thumbnail_url')) {
            await new Promise(r => sqliteDb.run('ALTER TABLE videos ADD COLUMN thumbnail_url TEXT', r));
            await new Promise(r => sqliteDb.run('UPDATE videos SET thumbnail_url = thumbnail_path WHERE thumbnail_url IS NULL', r));
          }
          if (!colNames.includes('duration_seconds')) {
            await new Promise(r => sqliteDb.run('ALTER TABLE videos ADD COLUMN duration_seconds INTEGER', r));
          }
          if (!colNames.includes('thumbnail_aspect_ratio')) {
            await new Promise(r => sqliteDb.run("ALTER TABLE videos ADD COLUMN thumbnail_aspect_ratio TEXT DEFAULT '16:9'", r));
            await new Promise(r => sqliteDb.run("UPDATE videos SET thumbnail_aspect_ratio = '16:9' WHERE thumbnail_aspect_ratio IS NULL", r));
          }
        }
        resolve();
      });
    });

    console.log('✅ SQLite `videos` and `featured_home_videos` tables ready.');

    const countRow = await query.get('SELECT COUNT(*) AS total FROM videos');
    if (countRow && countRow.total === 0) {
      console.log('🌱 Seeding initial demo videos into SQLite...');
      await seedInitialVideos();
    }
    await seedFeaturedVideosIfEmpty();
  }
}

async function seedFeaturedVideosIfEmpty() {
  try {
    const featuredCount = await query.get(
      isPostgres 
        ? 'SELECT COUNT(*)::int AS total FROM featured_home_videos'
        : 'SELECT COUNT(*) AS total FROM featured_home_videos'
    );
    if (!featuredCount || Number(featuredCount.total) === 0) {
      const published = await query.all(
        isPostgres
          ? 'SELECT id FROM videos WHERE published = true ORDER BY views DESC, id DESC LIMIT 6'
          : 'SELECT id FROM videos WHERE published = 1 ORDER BY views DESC, id DESC LIMIT 6'
      );
      if (published && published.length > 0) {
        for (let i = 0; i < published.length; i++) {
          const pos = i + 1;
          const vidId = published[i].id;
          if (isPostgres) {
            await query.run(
              'INSERT INTO featured_home_videos (video_id, position, is_active) VALUES ($1, $2, $3) ON CONFLICT (position) DO NOTHING',
              [vidId, pos, true]
            );
          } else {
            await query.run(
              'INSERT OR IGNORE INTO featured_home_videos (video_id, position, is_active) VALUES ($1, $2, $3)',
              [vidId, pos, 1]
            );
          }
        }
        console.log(`⭐ Seeded ${published.length} default featured homepage videos.`);
      }
    }
  } catch (err) {
    console.warn('Notice: seedFeaturedVideosIfEmpty encountered:', err.message);
  }
}

// --------------------------------------------------------------------------
// Initial Seed Data
// --------------------------------------------------------------------------
async function seedInitialVideos() {
  const initialVideos = [
    {
      title: "World Record FPV Drone Chase Through Cyber Tokyo 2026 (8K 120FPS)",
      description: "An unbelievable continuous 4-minute single-take dive through Shinjuku neon canyons and underground speedway tunnels with custom sub-250g ultra-high-speed propulsion drone.",
      category: "latest",
      duration: "04:18",
      views: 1420500,
      published: true,
      theme: "fpv-tokyo",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
    },
    {
      title: "Autonomous Bipedal Robot Masters Extreme Parkour Championship Finals",
      description: "Watch Model-X7 complete an obstacle gauntlet featuring 3-meter vertical wall jumps, dynamic rail slides, and a backflip precision landing without human remote assistance.",
      category: "trending",
      duration: "03:42",
      views: 2840000,
      published: true,
      theme: "robot-parkour",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString()
    },
    {
      title: "Deep Mariana Trench Exploration Captures Giant Bioluminescent Leviathan",
      description: "At 10,800 meters beneath sea level, our autonomous submarine searchlight illuminated an undocumented deep-sea creature radiating pulsating sapphire and emerald bio-photons.",
      category: "latest",
      duration: "08:15",
      views: 4120000,
      published: true,
      theme: "deep-ocean",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString()
    },
    {
      title: "Hypersonic Jet Prototype Breaks Sound Barrier in Low Altitude Desert Flyby",
      description: "The sound of vapor cones splitting the desert stillness at Mach 4.2. Captured using specialized 500,000 frames-per-second tracking cameras mounted on high-altitude solar aerostats.",
      category: "most-viewed",
      duration: "02:54",
      views: 5610000,
      published: true,
      theme: "hypersonic-jet",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString()
    },
    {
      title: "Extreme Speed Wingsuit Dive Through Matterhorn Natural Needle Arch",
      description: "Threaded through a natural granite arch barely 4 meters wide at over 260 km/h. Two years of weather simulation and wind tunnel tests culminated in this heart-stopping descent across the Swiss Alps.",
      category: "latest",
      duration: "05:03",
      views: 3950000,
      published: true,
      theme: "wingsuit-alps",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString()
    },
    {
      title: "World First Real Holographic Concert Stuns 80,000 Fans in London Dome",
      description: "Without 3D glasses or headsets, a 20-meter tall volumetric photon-projection performed live duets across the stadium arena. Crowd reaction was electric.",
      category: "trending",
      duration: "06:40",
      views: 8300000,
      published: true,
      theme: "hologram-concert",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString()
    },
    {
      title: "Master Tokyo Chef Slices 1,000 Micro-Layers of Handcrafted Wagyu Sashimi",
      description: "Pure culinary zen. 48 years of blade mastery shown in uninterrupted macro detail. Each paper-thin slice melts instantaneously on the palate.",
      category: "most-viewed",
      duration: "10:12",
      views: 6200000,
      published: true,
      theme: "artisan-chef",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString()
    },
    {
      title: "Zero-Gravity High-Speed Water Physics Experiment Inside Orbiting Lab",
      description: "What happens when acoustic levitation waves collide with a floating sphere of colored hydrophobic fluids inside microgravity? Miniature galaxies form.",
      category: "new",
      duration: "07:22",
      views: 7720000,
      published: true,
      theme: "zero-g-fluid",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString()
    },
    {
      title: "Hidden Underground Waterfall Discovered Beneath 150-Year-Old Abandoned Metro",
      description: "Deep subterranean exploration under Paris reveals an enormous flooded limestone cavern where an underground aquifer created a 15-meter subterranean waterfall.",
      category: "latest",
      duration: "09:48",
      views: 3410000,
      published: true,
      theme: "underground-cave",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString()
    },
    {
      title: "Solar Storm Aurora Borealis Over Lofoten Archipelago in Ultra Timelapse",
      description: "The strongest G5 solar geomagnetic storm of the solar cycle creates ribbons of crimson, violet, and electric green shimmering over frozen fjords.",
      category: "trending",
      duration: "04:55",
      views: 9540000,
      published: true,
      theme: "aurora-norway",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString()
    },
    {
      title: "Custom 1,800HP Electric Supercar Prototype Smashes Nürburgring Lap Record",
      description: "Full in-car telemetry and roll cage perspective as the quad-motor prototype clocks a breathtaking 5:48.33 lap time on cold Michelin slicks.",
      category: "new",
      duration: "06:05",
      views: 11200000,
      published: true,
      theme: "supercar-lap",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 144).toISOString()
    },
    {
      title: "Illusionist Warps Reality in Live Uncut 3D Street Art Demonstration",
      description: "Pedestrians in central Covent Garden literally stop in their tracks as a flat chalk pavement drawing transforms into a dizzying infinite abyssal portal.",
      category: "most-viewed",
      duration: "03:15",
      views: 14600000,
      published: true,
      theme: "street-illusion",
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 168).toISOString()
    }
  ];

  for (let i = 0; i < initialVideos.length; i++) {
    const v = initialVideos[i];
    const thumbPath = `/uploads/thumbnails/seed-thumb-${i + 1}.svg`;
    const videoPath = `/uploads/videos/seed-video-${i + 1}.mp4`;

    if (isPostgres) {
      await query.run(
        `INSERT INTO videos (
           title, description, category, video_url, video_path, 
           thumbnail_url, thumbnail_path, duration, published, views, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          v.title, v.description, v.category, videoPath, videoPath,
          thumbPath, thumbPath, v.duration, v.published, v.views, v.created_at
        ]
      );
    } else {
      await query.run(
        `INSERT INTO videos (
           title, description, category, video_url, video_path, 
           thumbnail_url, thumbnail_path, duration, published, views, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          v.title, v.description, v.category, videoPath, videoPath,
          thumbPath, thumbPath, v.duration, v.published ? 1 : 0, v.views, v.created_at
        ]
      );
    }
  }

  console.log(`✅ Seeded ${initialVideos.length} demo videos.`);
}

module.exports = {
  isPostgres,
  pgPool,
  sqliteDb,
  query,
  initDatabase
};
