/**
 * scripts/sync_live_payu_env.js
 * 
 * Safely syncs LIVE PayU environment variables from local .env to Vercel Production.
 * Never prints or logs secret values.
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
  const key = getEnvValue(envContent, 'PAYU_KEY');
  const salt = getEnvValue(envContent, 'PAYU_SALT');
  const clientId = getEnvValue(envContent, 'PAYU_CLIENT_ID');
  const clientSecret = getEnvValue(envContent, 'PAYU_CLIENT_SECRET');
  const envMode = getEnvValue(envContent, 'PAYU_ENV') || 'production';

  console.log('--- Checking PayU configuration in .env ---');

  if (!key || !salt) {
    console.log('⚠️ PAYU_KEY or PAYU_SALT is not filled in .env.');
    console.log('Please fill in your PayU credentials in .env:');
    console.log('  PAYU_KEY=<your_payu_key>');
    console.log('  PAYU_SALT=<your_payu_salt>');
    console.log('  PAYU_CLIENT_ID=<optional_client_id>');
    console.log('  PAYU_CLIENT_SECRET=<optional_client_secret>');
    console.log('  PAYU_ENV=production');
    process.exit(1);
  }

  console.log('✅ PayU credentials detected in .env (Key length:', key.length, ', Salt length:', salt.length, ')');

  // Sync to Vercel Production securely via piped stdin
  console.log('Syncing to Vercel Production environment...');

  const varsToSet = [
    { name: 'PAYU_KEY', val: key },
    { name: 'PAYU_SALT', val: salt },
    { name: 'PAYU_ENV', val: envMode }
  ];

  if (clientId) varsToSet.push({ name: 'PAYU_CLIENT_ID', val: clientId });
  if (clientSecret) varsToSet.push({ name: 'PAYU_CLIENT_SECRET', val: clientSecret });

  for (const item of varsToSet) {
    try {
      execSync(`vercel.cmd env rm ${item.name} production -y`, { stdio: 'ignore' });
    } catch (_) {}

    execSync(`vercel.cmd env add ${item.name} production`, {
      input: item.val + '\n',
      stdio: ['pipe', 'ignore', 'inherit']
    });
    console.log(`✓ Added ${item.name} to Vercel Production`);
  }

  console.log('🎉 Successfully synced PayU credentials to Vercel Production!');
}

main();
