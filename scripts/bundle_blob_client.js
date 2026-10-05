/**
 * scripts/bundle_blob_client.js
 * Builds standalone browser bundle of @vercel/blob/client
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const jsDir = path.join(__dirname, '..', 'public', 'js');
if (!fs.existsSync(jsDir)) {
  fs.mkdirSync(jsDir, { recursive: true });
}

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', 'node_modules', '@vercel', 'blob', 'dist', 'client.js')],
  bundle: true,
  format: 'iife',
  globalName: 'VercelBlob',
  outfile: path.join(jsDir, 'vercel-blob.js'),
  platform: 'browser',
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env': '{}',
    'global': 'window'
  }
});

console.log('✅ @vercel/blob/client bundled successfully into public/js/vercel-blob.js');
