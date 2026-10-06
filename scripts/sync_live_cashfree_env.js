/**
 * scripts/sync_live_cashfree_env.js
 * 
 * Safely syncs LIVE Cashfree environment variables from local .env to Vercel Production.
 * Never prints or logs secrets.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getEnvValue(content, key) {
  const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

function main() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found.');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const appId = getEnvValue(envContent, 'CASHFREE_APP_ID');
  const secretKey = getEnvValue(envContent, 'CASHFREE_SECRET_KEY');
  const envMode = getEnvValue(envContent, 'CASHFREE_ENV') || 'production';

  console.log('--- Checking local Cashfree configuration in .env ---');

  if (!appId || !secretKey) {
    console.log('⚠️ CASHFREE_APP_ID or CASHFREE_SECRET_KEY is empty in .env.');
    console.log('Please fill in your LIVE Cashfree credentials in .env (lines 8-10):');
    console.log('  CASHFREE_APP_ID=<your_live_app_id>');
    console.log('  CASHFREE_SECRET_KEY=<your_live_secret_key>');
    console.log('  CASHFREE_ENV=production');
    process.exit(1);
  }

  if (appId.startsWith('TEST') || secretKey.startsWith('cfsk_ma_test_')) {
    console.log('⚠️ Sandbox/Test credentials detected in .env:');
    console.log('  App ID starts with "TEST" or Secret Key starts with "cfsk_ma_test_".');
    console.log('For LIVE production, please replace them with your LIVE Cashfree credentials.');
    process.exit(2);
  }

  console.log('✅ LIVE credentials detected (Non-sandbox App ID, length:', appId.length, ')');

  // Sync to Vercel Production securely via piped stdin
  console.log('Syncing to Vercel Production environment...');
  
  // 1. Remove existing if present
  try {
    execSync('vercel.cmd env rm CASHFREE_APP_ID production -y', { stdio: 'ignore' });
  } catch (_) {}
  try {
    execSync('vercel.cmd env rm CASHFREE_SECRET_KEY production -y', { stdio: 'ignore' });
  } catch (_) {}
  try {
    execSync('vercel.cmd env rm CASHFREE_ENV production -y', { stdio: 'ignore' });
  } catch (_) {}

  // 2. Add LIVE credentials
  execSync('vercel.cmd env add CASHFREE_APP_ID production', { input: appId + '\n', stdio: ['pipe', 'ignore', 'inherit'] });
  console.log('✓ Added CASHFREE_APP_ID to Vercel Production');

  execSync('vercel.cmd env add CASHFREE_SECRET_KEY production', { input: secretKey + '\n', stdio: ['pipe', 'ignore', 'inherit'] });
  console.log('✓ Added CASHFREE_SECRET_KEY to Vercel Production');

  execSync('vercel.cmd env add CASHFREE_ENV production', { input: 'production\n', stdio: ['pipe', 'ignore', 'inherit'] });
  console.log('✓ Added CASHFREE_ENV=production to Vercel Production');

  console.log('🎉 Successfully synced LIVE Cashfree credentials to Vercel Production!');
}

main();
