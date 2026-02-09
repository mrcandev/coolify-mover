function getConfig() {
  const apiUrl = process.env.COOLIFY_API_URL;
  const apiToken = process.env.COOLIFY_API_TOKEN;
  const sshKeysPath = process.env.SSH_KEYS_PATH;
  const tempDir = process.env.TEMP_DIR || '/tmp/coolify-mover';

  // Database config (for clone operations)
  const dbConfig = {
    host: process.env.COOLIFY_DB_HOST || 'localhost',
    port: parseInt(process.env.COOLIFY_DB_PORT || '5432', 10),
    database: process.env.COOLIFY_DB_NAME || 'coolify',
    user: process.env.COOLIFY_DB_USER || 'coolify',
    password: process.env.COOLIFY_DB_PASSWORD || 'coolify'
  };

  if (!apiUrl) {
    throw new Error('COOLIFY_API_URL is not set. Please check your .env file.');
  }

  if (!apiToken) {
    throw new Error('COOLIFY_API_TOKEN is not set. Please check your .env file.');
  }

  if (!sshKeysPath) {
    throw new Error('SSH_KEYS_PATH is not set. Please check your .env file.');
  }

  return {
    apiUrl,
    apiToken,
    sshKeysPath,
    tempDir,
    dbConfig
  };
}

module.exports = { getConfig };
