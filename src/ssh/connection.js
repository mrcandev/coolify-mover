const { NodeSSH } = require('node-ssh');
const path = require('path');
const fs = require('fs');

class SSHManager {
  constructor(keysPath) {
    this.keysPath = keysPath;
    this.connections = new Map();
  }

  getKeyPath(privateKeyUuid) {
    // Coolify stores keys as: ssh_key@{uuid}
    const keyPath = path.join(this.keysPath, `ssh_key@${privateKeyUuid}`);

    if (!fs.existsSync(keyPath)) {
      throw new Error(`SSH key not found: ${keyPath}`);
    }

    return keyPath;
  }

  async connect(server) {
    const keyPath = this.getKeyPath(server.private_key_uuid || server.private_key_id);

    const ssh = new NodeSSH();
    await ssh.connect({
      host: server.ip,
      username: server.user || 'root',
      port: server.port || 22,
      privateKeyPath: keyPath,
      readyTimeout: 30000
    });

    this.connections.set(server.name, ssh);
    return ssh;
  }

  async exec(serverName, command) {
    const ssh = this.connections.get(serverName);
    if (!ssh) {
      throw new Error(`Not connected to ${serverName}`);
    }

    const result = await ssh.execCommand(command);
    return result;
  }

  async getVolumeSize(serverName, volumeName) {
    const result = await this.exec(
      serverName,
      `du -sh /var/lib/docker/volumes/${volumeName}/_data 2>/dev/null || echo "0"`
    );
    return result.stdout.split('\t')[0] || 'Unknown';
  }

  async getVolumeSizeBytes(serverName, volumeName) {
    const result = await this.exec(
      serverName,
      `du -sb /var/lib/docker/volumes/${volumeName}/_data 2>/dev/null | cut -f1 || echo "0"`
    );
    return parseInt(result.stdout.trim(), 10) || 0;
  }

  async getAvailableSpace(serverName) {
    // Get available space on /var/lib/docker/volumes in bytes
    const result = await this.exec(
      serverName,
      `df -B1 /var/lib/docker/volumes 2>/dev/null | tail -1 | awk '{print $4}'`
    );
    return parseInt(result.stdout.trim(), 10) || 0;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async checkVolumeExists(serverName, volumeName) {
    const result = await this.exec(
      serverName,
      `test -d /var/lib/docker/volumes/${volumeName}/_data && echo "exists" || echo "not found"`
    );
    return result.stdout.trim() === 'exists';
  }

  async createVolume(serverName, volumeName) {
    await this.exec(serverName, `docker volume create ${volumeName}`);
  }

  async checkCommand(serverName, command) {
    const result = await this.exec(serverName, `which ${command} && echo "found" || echo "not found"`);
    return result.stdout.includes('found');
  }

  async disconnect(serverName) {
    const ssh = this.connections.get(serverName);
    if (ssh) {
      ssh.dispose();
      this.connections.delete(serverName);
    }
  }

  async disconnectAll() {
    for (const [name, ssh] of this.connections) {
      ssh.dispose();
    }
    this.connections.clear();
  }
}

module.exports = SSHManager;
