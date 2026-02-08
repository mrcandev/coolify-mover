const CoolifyAPI = require('../api/coolify');
const SSHManager = require('../ssh/connection');
const VolumeTransfer = require('../transfer/rsync');
const { getConfig } = require('../utils/config');
const logger = require('../utils/logger');

async function moveResource(options) {
  const { resource, from, to, dryRun } = options;
  const config = getConfig();

  const api = new CoolifyAPI(config.apiUrl, config.apiToken);
  const ssh = new SSHManager(config.sshKeysPath);
  const transfer = new VolumeTransfer(config.sshKeysPath, config.tempDir);

  logger.info(`Moving "${resource}" from "${from}" to "${to}"${dryRun ? ' (DRY RUN)' : ''}`);

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

    // 2. Get resource info (try services first, then applications)
    logger.step('Fetching resource information...');

    let resourceInfo = null;
    let resourceType = null;

    // Try services
    const services = await api.getServices();
    resourceInfo = services.find(s => s.name === resource || s.uuid === resource);
    if (resourceInfo) {
      resourceType = 'service';
    }

    // Try applications if not found in services
    if (!resourceInfo) {
      const applications = await api.getApplications();
      resourceInfo = applications.find(a => a.name === resource || a.uuid === resource);
      if (resourceInfo) {
        resourceType = 'application';
      }
    }

    if (!resourceInfo) {
      throw new Error(`Resource not found: ${resource}`);
    }

    logger.info(`  Resource: ${resourceInfo.name}`);
    logger.info(`  Type: ${resourceType}`);
    logger.info(`  UUID: ${resourceInfo.uuid}`);

    // 3. Connect to servers
    logger.step('Connecting to servers...');
    await ssh.connect(sourceServer);
    await ssh.connect(targetServer);
    logger.success('Connected to both servers');

    // 4. Get volume information
    logger.step('Analyzing volumes...');
    const volumes = resourceInfo.persistent_storages || resourceInfo.volumes || [];

    if (volumes.length === 0) {
      logger.warn('No volumes found for this resource');
    } else {
      logger.info(`  Found ${volumes.length} volume(s)`);
      for (const vol of volumes) {
        const volumeName = vol.volume_name || `${resourceInfo.uuid}_${vol.name}`;
        const size = await ssh.getVolumeSize(sourceServer.name, volumeName);
        logger.info(`    - ${volumeName} (${size})`);
      }
    }

    // 5. Clone resource configuration (if not dry run)
    if (!dryRun) {
      logger.step('Cloning resource configuration...');

      let clonedResource;
      if (resourceType === 'service') {
        clonedResource = await api.cloneService(
          resourceInfo.uuid,
          targetServer.id,
          targetServer.destination_id
        );
      } else {
        clonedResource = await api.cloneApplication(
          resourceInfo.uuid,
          targetServer.id,
          targetServer.destination_id
        );
      }

      logger.success(`Cloned resource: ${clonedResource.uuid}`);

      // 6. Transfer volumes
      if (volumes.length > 0) {
        logger.step('Transferring volume data...');

        for (const vol of volumes) {
          const sourceVolume = vol.volume_name || `${resourceInfo.uuid}_${vol.name}`;
          const targetVolume = `${clonedResource.uuid}_${vol.name}`;

          logger.info(`  Transferring: ${sourceVolume} -> ${targetVolume}`);

          // Create target volume if needed
          await ssh.createVolume(targetServer.name, targetVolume);

          // Transfer data
          await transfer.transfer({
            sourceServer,
            targetServer,
            sourceVolume,
            targetVolume,
            viaLocalhost: true,
            dryRun: false
          });
        }
      }

      logger.success('Migration completed!');
      logger.info('\nNext steps:');
      logger.info('  1. Go to Coolify dashboard');
      logger.info(`  2. Deploy the new resource: ${clonedResource.name || clonedResource.uuid}`);
      logger.info('  3. Verify it works correctly');
      logger.info(`  4. Stop and delete the old resource: ${resourceInfo.name}`);
    } else {
      logger.info('\nDRY RUN - No changes made');
      logger.info('Remove --dry-run flag to perform actual migration');
    }

  } finally {
    await ssh.disconnectAll();
  }
}

module.exports = moveResource;
