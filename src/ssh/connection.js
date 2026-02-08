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
