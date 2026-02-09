const { execSync } = require('child_process');

class CoolifyDB {
  constructor(config = {}) {
    this.container = config.container || process.env.COOLIFY_DB_CONTAINER || 'coolify-db';
    this.database = config.database || process.env.COOLIFY_DB_NAME || 'coolify';
    this.user = config.user || process.env.COOLIFY_DB_USER || 'coolify';
  }

  async connect() {
    // Test connection
    try {
      this.query('SELECT 1 AS test');
    } catch (err) {
      throw new Error(`Cannot connect to database: ${err.message}`);
    }
    return this;
  }

  query(sql, params = []) {
    // Replace $1, $2, etc. with actual values (reverse order to handle $10 before $1)
    let finalSql = sql;
    for (let i = params.length - 1; i >= 0; i--) {
      const placeholder = `$${i + 1}`;
      const param = params[i];
      const value = param === null ? 'NULL' : `'${String(param).replace(/'/g, "''")}'`;
      finalSql = finalSql.split(placeholder).join(value);
    }

    // Escape for shell
    const escapedSql = finalSql.replace(/"/g, '\\"');

    // Use -A for unaligned output, no -t so we get headers
    const cmd = `docker exec ${this.container} psql -U ${this.user} -d ${this.database} -A -c "${escapedSql}"`;

    try {
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      return this.parseResult(result, finalSql);
    } catch (err) {
      throw new Error(`Query failed: ${err.message}`);
    }
  }

  parseResult(output, sql) {
    const lines = output.trim().split('\n').filter(line => line.length > 0);

    // Check if it's a RETURNING query or SELECT
    const isSelect = sql.trim().toUpperCase().startsWith('SELECT') || sql.includes('RETURNING');

    if (!isSelect) {
      return { rows: [], rowCount: 0 };
    }

    // Need at least header + one row
    if (lines.length < 2) {
      return { rows: [], rowCount: 0 };
    }

    // First line is header (column names)
    const headers = lines[0].split('|').map(h => h.toLowerCase());

    // Last line might be row count like "(1 row)" - skip it
    const dataLines = lines.slice(1).filter(line => !line.match(/^\(\d+ rows?\)$/));

    const rows = dataLines.map(line => {
      const values = line.split('|');
      const row = {};
      headers.forEach((col, i) => {
        row[col] = values[i] === '' ? null : values[i];
      });
      return row;
    });

    return { rows, rowCount: rows.length };
  }

  async disconnect() {
    // Nothing to disconnect with docker exec
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
