const CoolifyAPI = require('../api/coolify');
const SSHManager = require('../ssh/connection');
const VolumeTransfer = require('../transfer/rsync');
const ResourceCloner = require('../db/clone');
const { getConfig } = require('../utils/config');
const logger = require('../utils/logger');

async function moveResource(options) {
  const { resource, from, to, dryRun, skipSpaceCheck, stopSource, resourceType } = options;
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

    // 3. Get resource info from database (detect type)
    logger.step('Fetching resource information...');

    let resourceInfo = null;
    let detectedType = resourceType || null;
    let volumes = [];

    // Try to find resource in different tables
    if (!detectedType || detectedType === 'service') {
      resourceInfo = await cloner.getService(resource);
      if (resourceInfo) {
        detectedType = 'service';
        volumes = await cloner.getServiceVolumes(resourceInfo.uuid);
      }
    }

    // Database types to check
    const dbTypes = [
      { table: 'standalone_postgresqls', type: 'postgresql' },
      { table: 'standalone_redis', type: 'redis' },
      { table: 'standalone_mysqls', type: 'mysql' },
      { table: 'standalone_mariadbs', type: 'mariadb' },
      { table: 'standalone_mongodbs', type: 'mongodb' },
      { table: 'standalone_keydbs', type: 'keydb' },
      { table: 'standalone_dragonflies', type: 'dragonfly' },
      { table: 'standalone_clickhouses', type: 'clickhouse' }
    ];

    let dbTable = null;
    for (const db of dbTypes) {
      if (!resourceInfo && (!detectedType || detectedType === 'database')) {
        resourceInfo = await cloner.getStandaloneDatabase(db.table, resource);
        if (resourceInfo) {
          detectedType = db.type;
          dbTable = db.table;
          break;
        }
      }
    }

    // Get volumes after we have resourceInfo.id
    if (resourceInfo && dbTable) {
      volumes = await cloner.getStandaloneDatabaseVolumes(dbTable, resourceInfo.id);
    }

    if (!resourceInfo) {
      throw new Error(`Resource not found: ${resource}`);
    }

    logger.info(`  Name: ${resourceInfo.name}`);
    logger.info(`  UUID: ${resourceInfo.uuid}`);
    logger.info(`  Type: ${detectedType}`);

    // 4. Connect to servers via SSH
    logger.step('Connecting to servers...');
    await ssh.connect(sourceServer);
    await ssh.connect(targetServer);
    logger.success('Connected to both servers');

    // 5. Get volume information
    logger.step('Analyzing volumes...');

    let totalVolumeSize = 0;
    if (volumes.length === 0) {
      logger.warn('No volumes found for this resource');
    } else {
      logger.info(`  Found ${volumes.length} volume(s)`);
      for (const vol of volumes) {
        const size = await ssh.getVolumeSize(sourceServer.name, vol.name);
        const sizeBytes = await ssh.getVolumeSizeBytes(sourceServer.name, vol.name);
        totalVolumeSize += sizeBytes;
        logger.info(`    - ${vol.name} (${size})`);
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

    // 7. Stop source resource if requested
    if (stopSource && !dryRun) {
      logger.step('Stopping source resource...');
      try {
        if (detectedType === 'service') {
          await api.stopService(resourceInfo.uuid);
        } else {
          await api.stopDatabase(resourceInfo.uuid);
        }
        logger.success('Source resource stopped');
      } catch (err) {
        logger.warn(`Could not stop resource via API: ${err.message}`);
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

      let clonedResource;
      const cloneOptions = { newName: resourceInfo.name };

      // Clone based on detected type
      const cloneMethods = {
        'service': () => cloner.cloneService(resourceInfo.uuid, targetServer.id, targetDestination.id, cloneOptions),
        'postgresql': () => cloner.clonePostgresql(resourceInfo.uuid, targetServer.id, targetDestination.id, cloneOptions),
        'redis': () => cloner.cloneRedis(resourceInfo.uuid, targetServer.id, targetDestination.id, cloneOptions),
        'mysql': () => cloner.cloneMysql(resourceInfo.uuid, targetServer.id, targetDestination.id, cloneOptions),
        'mariadb': () => cloner.cloneMariadb(resourceInfo.uuid, targetServer.id, targetDestination.id, cloneOptions),
        'mongodb': () => cloner.cloneMongodb(resourceInfo.uuid, targetServer.id, targetDestination.id, cloneOptions),
        'keydb': () => cloner.cloneKeydb(resourceInfo.uuid, targetServer.id, targetDestination.id, cloneOptions),
        'dragonfly': () => cloner.cloneDragonfly(resourceInfo.uuid, targetServer.id, targetDestination.id, cloneOptions),
        'clickhouse': () => cloner.cloneClickhouse(resourceInfo.uuid, targetServer.id, targetDestination.id, cloneOptions)
      };

      if (cloneMethods[detectedType]) {
        clonedResource = await cloneMethods[detectedType]();
      } else {
        throw new Error(`Unsupported resource type: ${detectedType}`);
      }

      logger.success(`Cloned resource: ${clonedResource.uuid}`);

      // 9. Transfer volumes
      if (volumes.length > 0) {
        logger.step('Transferring volume data...');

        for (const vol of volumes) {
          // Replace old UUID with new UUID in volume name
          const targetVolumeName = vol.name.replace(resourceInfo.uuid, clonedResource.uuid);

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

      // 10. Rename old resource to -old
      logger.step('Renaming old resource...');
      const oldName = `${resourceInfo.name}-old`;
      await cloner.renameResource(detectedType, resourceInfo.id, oldName);

      logger.success('Migration completed!');
      logger.info('');
      logger.warn('IMPORTANT: Please verify the new resource works correctly!');
      logger.info('');
      logger.info('Next steps:');
      logger.info('  1. Go to Coolify dashboard');
      logger.info(`  2. Deploy the new resource: ${clonedResource.name}`);
      logger.info('  3. Test and verify everything works correctly');
      logger.info(`  4. If OK, stop and delete the old resource: ${oldName}`);
      logger.info('');
      logger.warn(`Old resource renamed to "${oldName}" - data preserved until you delete it`);

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
