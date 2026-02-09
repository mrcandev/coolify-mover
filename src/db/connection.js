const { Client } = require('pg');
const { execSync } = require('child_process');

class CoolifyDB {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.COOLIFY_DB_HOST || this.autoDetectHost(),
      port: config.port || process.env.COOLIFY_DB_PORT || 5432,
      database: config.database || process.env.COOLIFY_DB_NAME || 'coolify',
      user: config.user || process.env.COOLIFY_DB_USER || 'coolify',
      password: config.password || process.env.COOLIFY_DB_PASSWORD || this.autoDetectPassword()
    };
    this.client = null;
  }

  // Auto-detect coolify-db container IP
  autoDetectHost() {
    try {
      const result = execSync(
        "docker inspect coolify-db --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null",
        { encoding: 'utf8', timeout: 5000 }
      );
      return result.trim() || 'localhost';
    } catch {
      return 'localhost';
    }
  }

  // Auto-detect password from coolify-db container
  autoDetectPassword() {
    try {
      const result = execSync(
        'docker exec coolify-db env 2>/dev/null | grep POSTGRES_PASSWORD | sed "s/POSTGRES_PASSWORD=//"',
        { encoding: 'utf8', timeout: 5000 }
      );
      return result.trim() || 'coolify';
    } catch {
      return 'coolify';
    }
  }

  async connect() {
    this.client = new Client(this.config);
    await this.client.connect();
    return this;
  }

  async query(sql, params = []) {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.client.query(sql, params);
  }

  async disconnect() {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  // Generate UUID like Coolify does
  generateUuid() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 26; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }
}

module.exports = CoolifyDB;
