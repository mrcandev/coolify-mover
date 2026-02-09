const fs = require('fs');
const path = require('path');

// Try to load .env from multiple locations
function loadEnv() {
  const dotenv = require('dotenv');

  // Priority order:
  // 1. Current directory .env
  // 2. ~/.coolify-mover/.env
  // 3. /opt/coolify-mover/.env

  const locations = [
    path.join(process.cwd(), '.env'),
    path.join(process.env.HOME || '~', '.coolify-mover', '.env'),
    '/opt/coolify-mover/.env'
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      dotenv.config({ path: loc });
      return loc;
    }
  }

  // No .env found, rely on environment variables
  return null;
}

function getConfig() {
  const envPath = loadEnv();

  const apiUrl = process.env.COOLIFY_API_URL;
  const apiToken = process.env.COOLIFY_API_TOKEN;
  const sshKeysPath = process.env.SSH_KEYS_PATH || '/data/coolify/ssh/keys';
  const tempDir = process.env.TEMP_DIR || '/tmp/coolify-mover';

  // Database config (for clone operations)
  const dbConfig = {
    host: process.env.COOLIFY_DB_HOST || 'localhost',
    port: parseInt(process.env.COOLIFY_DB_PORT || '5432', 10),
    database: process.env.COOLIFY_DB_NAME || 'coolify',
    user: process.env.COOLIFY_DB_USER || 'coolify',
    password: process.env.COOLIFY_DB_PASSWORD || null // auto-detect if null
  };

  if (!apiUrl) {
    console.error('Error: COOLIFY_API_URL is not set.');
    console.error('');
    console.error('Setup options:');
    console.error('');
    console.error('  1. Environment variables:');
    console.error('     export COOLIFY_API_URL=http://localhost:8000/api/v1');
    console.error('     export COOLIFY_API_TOKEN=your_token');
    console.error('');
    console.error('  2. Config file (~/.coolify-mover/.env):');
    console.error('     mkdir -p ~/.coolify-mover');
    console.error('     echo "COOLIFY_API_URL=http://localhost:8000/api/v1" >> ~/.coolify-mover/.env');
    console.error('     echo "COOLIFY_API_TOKEN=your_token" >> ~/.coolify-mover/.env');
    console.error('');
    process.exit(1);
  }

  if (!apiToken) {
    console.error('Error: COOLIFY_API_TOKEN is not set.');
    console.error('Get it from: Coolify Dashboard → Settings → API Tokens');
    process.exit(1);
  }

  return {
    apiUrl,
    apiToken,
    sshKeysPath,
    tempDir,
    dbConfig,
    envPath
  };
}

function initConfig() {
  const configDir = path.join(process.env.HOME || '~', '.coolify-mover');
  const configFile = path.join(configDir, '.env');

  if (fs.existsSync(configFile)) {
    return { exists: true, path: configFile };
  }

  // Create config directory
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Create default config
  const defaultConfig = `# Coolify API
COOLIFY_API_URL=http://localhost:8000/api/v1
COOLIFY_API_TOKEN=your_token_here

# SSH Keys (usually no need to change)
SSH_KEYS_PATH=/data/coolify/ssh/keys
`;

  fs.writeFileSync(configFile, defaultConfig);
  return { exists: false, path: configFile };
}

module.exports = { getConfig, initConfig };
