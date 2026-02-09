const CoolifyAPI = require('../api/coolify');
const SSHManager = require('../ssh/connection');
const VolumeTransfer = require('../transfer/rsync');
const ResourceCloner = require('../db/clone');
const { getConfig } = require('../utils/config');
const logger = require('../utils/logger');

async function moveResource(options) {
  const { resource, from, to, dryRun, skipSpaceCheck, stopSource } = options;
  const config = getConfig();

  const api = new CoolifyAPI(config.apiUrl, config.apiToken);
  const ssh = new SSHManager(config.sshKeysPath);
  const transfer = new VolumeTransfer(config.sshKeysPath, config.tempDir);
  const cloner = new ResourceCloner(config.dbConfig);

  logger.info(`Moving "${resource}" from "${from}" to "${to}"${dryRun ? ' (DRY RUN)' : ''}`);

  try {
    // 1. Get server info from API
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

    // 2. Connect to database for clone operation
    logger.step('Connecting to Coolify database...');
    await cloner.connect();
    logger.success('Connected to database');

    // 3. Get resource info from database
    logger.step('Fetching resource information...');
    const serviceInfo = await cloner.getService(resource);

    if (!serviceInfo) {
      throw new Error(`Service not found: ${resource}`);
    }

    logger.info(`  Service: ${serviceInfo.name}`);
    logger.info(`  UUID: ${serviceInfo.uuid}`);
    logger.info(`  Type: ${serviceInfo.service_type || 'docker-compose'}`);

    // 4. Connect to servers via SSH
    logger.step('Connecting to servers...');
    await ssh.connect(sourceServer);
    await ssh.connect(targetServer);
    logger.success('Connected to both servers');

    // 5. Get volume information from database
    logger.step('Analyzing volumes...');
    const volumes = await cloner.getServiceVolumes(serviceInfo.uuid);

    let totalVolumeSize = 0;
    if (volumes.length === 0) {
      logger.warn('No volumes found for this service');
    } else {
      logger.info(`  Found ${volumes.length} volume(s)`);
      for (const vol of volumes) {
        const size = await ssh.getVolumeSize(sourceServer.name, vol.name);
        const sizeBytes = await ssh.getVolumeSizeBytes(sourceServer.name, vol.name);
        totalVolumeSize += sizeBytes;
        const sourceLabel = vol.source === 'service' ? '' : ` (${vol.appName || vol.dbName})`;
        logger.info(`    - ${vol.name} (${size})${sourceLabel}`);
      }
    }

    // 6. Pre-flight disk space check
    if (volumes.length > 0 && !skipSpaceCheck) {
      logger.step('Pre-flight checks...');
      const targetAvailable = await ssh.getAvailableSpace(targetServer.name);

      logger.info(`  Total volume size:  ${ssh.formatBytes(totalVolumeSize)}`);
      logger.info(`  Target available:   ${ssh.formatBytes(targetAvailable)}`);

      const requiredSpace = Math.ceil(totalVolumeSize * 1.1);

      if (targetAvailable < requiredSpace) {
        logger.error(`  [FAIL] Insufficient disk space on target server!`);
        logger.error(`  Required (with 10% buffer): ${ssh.formatBytes(requiredSpace)}`);
        logger.error(`  Available: ${ssh.formatBytes(targetAvailable)}`);
        logger.info('\n  Use --skip-space-check to bypass this check (not recommended)');
        throw new Error('Insufficient disk space on target server');
      }

      logger.success('  [OK] Sufficient disk space');
    } else if (volumes.length > 0 && skipSpaceCheck) {
      logger.warn('Skipping disk space check (--skip-space-check)');
    }

    // 7. Stop source service if requested
    if (stopSource && !dryRun) {
      logger.step('Stopping source service...');
      try {
        await api.stopService(serviceInfo.uuid);
        logger.success('Source service stopped');
      } catch (err) {
        logger.warn(`Could not stop service via API: ${err.message}`);
        logger.info('  You may need to stop it manually from Coolify dashboard');
      }
    }

    // 8. Clone resource configuration via database
    if (!dryRun) {
      logger.step('Cloning resource configuration...');

      // Get target destination
      const targetDestination = await cloner.getDestination(targetServer.id);
      if (!targetDestination) {
        throw new Error(`No Docker destination found on target server: ${targetServer.name}`);
      }

      const clonedResource = await cloner.cloneService(
        serviceInfo.uuid,
        targetServer.id,
        targetDestination.id,
        { newName: serviceInfo.name }
      );

      logger.success(`Cloned resource: ${clonedResource.uuid}`);

      // 9. Transfer volumes
      if (volumes.length > 0) {
        logger.step('Transferring volume data...');

        // Build volume mapping (old uuid -> new uuid)
        const volumeMapping = new Map();
        volumeMapping.set(serviceInfo.uuid, clonedResource.uuid);

        for (const app of clonedResource.applications) {
          volumeMapping.set(app.sourceUuid, app.uuid);
        }
        for (const db of clonedResource.databases) {
          volumeMapping.set(db.sourceUuid, db.uuid);
        }

        for (const vol of volumes) {
          // Find the new volume name by replacing old UUID with new UUID
          let targetVolumeName = vol.name;
          for (const [oldUuid, newUuid] of volumeMapping) {
            if (vol.name.includes(oldUuid)) {
              targetVolumeName = vol.name.replace(oldUuid, newUuid);
              break;
            }
          }

          logger.info(`  Transferring: ${vol.name} -> ${targetVolumeName}`);

          // Create target volume if needed
          await ssh.createVolume(targetServer.name, targetVolumeName);

          // Transfer data
          await transfer.transfer({
            sourceServer,
            targetServer,
            sourceVolume: vol.name,
            targetVolume: targetVolumeName,
            viaLocalhost: true,
            dryRun: false
          });
        }
      }

      logger.success('Migration completed!');
      logger.info('\nNext steps:');
      logger.info('  1. Go to Coolify dashboard');
      logger.info(`  2. Deploy the new service: ${clonedResource.name}`);
      logger.info('  3. Verify it works correctly');
      logger.info(`  4. Stop and delete the old service: ${serviceInfo.name}`);

    } else {
      logger.info('\nDRY RUN - No changes made');
      logger.info('Remove --dry-run flag to perform actual migration');
    }

  } finally {
    await ssh.disconnectAll();
    await cloner.disconnect();
  }
}

module.exports = moveResource;
