function getConfig() {
  const apiUrl = process.env.COOLIFY_API_URL;
  const apiToken = process.env.COOLIFY_API_TOKEN;
  const sshKeysPath = process.env.SSH_KEYS_PATH;
  const tempDir = process.env.TEMP_DIR || '/tmp/coolify-mover';

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
    tempDir
  };
}

module.exports = { getConfig };
