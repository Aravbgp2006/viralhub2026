const https = require('https');
const crypto = require('crypto');
require('dotenv').config();

const SESSION_SECRET = process.env.SESSION_SECRET || 'viralhub_2026_cms_secret_key_8f3a1b';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

const data = `${ADMIN_USERNAME}:${Date.now()}`;
const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
const adminToken = `${Buffer.from(data).toString('base64')}.${hmac}`;

function putVideo(id, payload) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(payload);
    const req = https.request({
      hostname: 'viralhub2026-mu.vercel.app',
      path: `/api/videos/${id}`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Cookie': `admin_token=${adminToken}`
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function restoreVideos() {
  console.log('--- 1. Fetch current admin videos list to get exact existing details ---');
  const getReq = new Promise((resolve, reject) => {
    https.get({
      hostname: 'viralhub2026-mu.vercel.app',
      path: '/api/admin/videos',
      headers: { 'Cookie': `admin_token=${adminToken}` }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });

  const videos = await getReq;
  console.log(`Fetched ${videos.length} videos from admin.`);

  // Video 92 original title: "Sleeping big boobs bhabhi sleeping fucked mms"
  for (const v of videos) {
    let titleToRestore = v.title;
    if (v.id === 92) {
      titleToRestore = 'Sleeping big boobs bhabhi sleeping fucked mms';
    }

    const payload = {
      title: titleToRestore,
      description: v.description || '',
      category: v.category || 'latest',
      published: 1,
      views: v.views,
      thumbnail_url: v.thumbnail_url || v.thumbnail_path,
      video_url: v.video_url || v.video_path,
      thumbnail_aspect_ratio: v.thumbnail_aspect_ratio || '16:9'
    };

    console.log(`Updating Video ID ${v.id}: published=1, title="${titleToRestore}"...`);
    const updateRes = await putVideo(v.id, payload);
    console.log(`  -> Status: ${updateRes.status}`, updateRes.data?.success ? '✅ SUCCESS' : updateRes.data);
  }

  console.log('\n--- 2. Verifying public /api/videos endpoint ---');
  const publicVideos = await new Promise((resolve, reject) => {
    https.get('https://viralhub2026-mu.vercel.app/api/videos?limit=100', res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });

  const list = publicVideos.videos || (Array.isArray(publicVideos) ? publicVideos : []);
  console.log(`Public /api/videos count: ${list.length}`);
  for (const v of list) {
    console.log(`  ID ${v.id} | published=${v.published} | views=${v.views} | "${v.title}"`);
  }
}

restoreVideos().catch(console.error);
