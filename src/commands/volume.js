const CoolifyAPI = require('../api/coolify');
const SSHManager = require('../ssh/connection');
const VolumeTransfer = require('../transfer/rsync');
const { getConfig } = require('../utils/config');
const logger = require('../utils/logger');

async function volumeTransfer(options) {
  const { volume, from, to, targetVolume, dryRun } = options;
  const config = getConfig();

  const api = new CoolifyAPI(config.apiUrl, config.apiToken);
  const ssh = new SSHManager(config.sshKeysPath);
  const transfer = new VolumeTransfer(config.sshKeysPath, config.tempDir);

  logger.info(`Transferring volume "${volume}" from "${from}" to "${to}"${dryRun ? ' (DRY RUN)' : ''}`);

  try {
    // 1. Get server info
    logger.step('Fetching server information...');
    const sourceServer = await api.getServer(from);
    const targetServer = await api.getServer(to);

    if (!sourceServer) {
      throw new Error(`Source server not found: ${from}`);
    }
    if (!targetServer) {
      throw new Error(`Target server not found: ${to}`);
    }

    logger.info(`  Source: ${sourceServer.name} (${sourceServer.ip})`);
    logger.info(`  Target: ${targetServer.name} (${targetServer.ip})`);

    // 2. Connect to servers
    logger.step('Connecting to servers...');
    await ssh.connect(sourceServer);
    await ssh.connect(targetServer);
    logger.success('Connected to both servers');

    // 3. Check source volume exists
    logger.step('Checking source volume...');
    const sourceExists = await ssh.checkVolumeExists(sourceServer.name, volume);
    if (!sourceExists) {
      throw new Error(`Source volume not found: ${volume}`);
    }

    const sourceSize = await ssh.getVolumeSize(sourceServer.name, volume);
    logger.info(`  Source volume: ${volume} (${sourceSize})`);

    // 4. Create target volume if needed
    logger.step('Preparing target volume...');
    const targetExists = await ssh.checkVolumeExists(targetServer.name, targetVolume);
    if (!targetExists && !dryRun) {
      await ssh.createVolume(targetServer.name, targetVolume);
      logger.info(`  Created target volume: ${targetVolume}`);
    } else if (targetExists) {
      logger.warn(`  Target volume already exists: ${targetVolume}`);
    }

    // 5. Transfer volume data
    logger.step('Transferring volume data...');
    await transfer.transfer({
      sourceServer,
      targetServer,
      sourceVolume: volume,
      targetVolume: targetVolume,
      viaLocalhost: true,
      dryRun
    });

    if (!dryRun) {
      logger.success('Volume transfer completed!');
    } else {
      logger.info('\nDRY RUN - No data transferred');
    }

  } finally {
    await ssh.disconnectAll();
  }
}

module.exports = volumeTransfer;
