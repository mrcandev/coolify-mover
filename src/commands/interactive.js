const inquirer = require('inquirer');
const CoolifyAPI = require('../api/coolify');
const ResourceCloner = require('../db/clone');
const SSHManager = require('../ssh/connection');
const { getConfig } = require('../utils/config');
const logger = require('../utils/logger');
const moveResource = require('./move');

async function runPreflightChecks(config, sourceServerName, targetServerName, resourceUuid, resourceType) {
  let allPassed = true;
  let cloner = null;
  let ssh = null;

  console.log('');
  logger.step('Running pre-flight checks...');
  console.log('');

  try {
    // 1. Database connection
    process.stdout.write('  [....] Database connection');
    cloner = new ResourceCloner(config.dbConfig);
    await cloner.connect();
    process.stdout.write('\r  [ OK ] Database connection\n');

    // 2. Get servers from database (not API - API doesn't have id and private_key_uuid)
    process.stdout.write('  [....] Source server lookup');
    const sourceServer = await cloner.getServer(sourceServerName);
    if (sourceServer) {
      process.stdout.write('\r  [ OK ] Source server lookup\n');
    } else {
      process.stdout.write('\r  [FAIL] Source server lookup - not found in database\n');
      allPassed = false;
    }

    process.stdout.write('  [....] Target server lookup');
    const targetServer = await cloner.getServer(targetServerName);
    if (targetServer) {
      process.stdout.write('\r  [ OK ] Target server lookup\n');
    } else {
      process.stdout.write('\r  [FAIL] Target server lookup - not found in database\n');
      allPassed = false;
    }

    // 3. Check resource exists
    process.stdout.write('  [....] Resource lookup');
    let resourceInfo = null;

    if (resourceType === 'service') {
      resourceInfo = await cloner.getService(resourceUuid);
    } else {
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

      for (const db of dbTypes) {
        resourceInfo = await cloner.getStandaloneDatabase(db.table, resourceUuid);
        if (resourceInfo) break;
      }
    }

    if (resourceInfo) {
      process.stdout.write('\r  [ OK ] Resource lookup\n');
    } else {
      process.stdout.write('\r  [FAIL] Resource lookup - not found in database\n');
      allPassed = false;
    }

    // 4. Check target destination exists
    process.stdout.write('  [....] Target server destination');
    if (targetServer) {
      const targetDestination = await cloner.getDestination(targetServer.id);
      if (targetDestination) {
        process.stdout.write('\r  [ OK ] Target server destination\n');
      } else {
        process.stdout.write('\r  [FAIL] Target server destination - no Docker destination found\n');
        allPassed = false;
      }
    } else {
      process.stdout.write('\r  [SKIP] Target server destination - server not found\n');
    }

    // 5. SSH connectivity (only if servers found)
    ssh = new SSHManager(config.sshKeysPath);

    if (sourceServer) {
      try {
        process.stdout.write('  [....] Source server SSH');
        await ssh.connect(sourceServer);
        process.stdout.write('\r  [ OK ] Source server SSH\n');

        // Check rsync on source
        process.stdout.write('  [....] Source server rsync');
        const sourceHasRsync = await ssh.checkCommand(sourceServerName, 'rsync');
        if (sourceHasRsync) {
          process.stdout.write('\r  [ OK ] Source server rsync\n');
        } else {
          process.stdout.write('\r  [FAIL] Source server rsync - not installed\n');
          allPassed = false;
        }
      } catch (err) {
        process.stdout.write(`\r  [FAIL] Source server SSH - ${err.message}\n`);
        allPassed = false;
      }
    }

    if (targetServer) {
      try {
        process.stdout.write('  [....] Target server SSH');
        await ssh.connect(targetServer);
        process.stdout.write('\r  [ OK ] Target server SSH\n');

        // Check rsync on target
        process.stdout.write('  [....] Target server rsync');
        const targetHasRsync = await ssh.checkCommand(targetServerName, 'rsync');
        if (targetHasRsync) {
          process.stdout.write('\r  [ OK ] Target server rsync\n');
        } else {
          process.stdout.write('\r  [FAIL] Target server rsync - not installed\n');
          allPassed = false;
        }
      } catch (err) {
        process.stdout.write(`\r  [FAIL] Target server SSH - ${err.message}\n`);
        allPassed = false;
      }
    }

  } catch (err) {
    process.stdout.write(`\r  [FAIL] Database connection - ${err.message}\n`);
    allPassed = false;
  } finally {
    if (ssh) await ssh.disconnectAll();
    if (cloner) await cloner.disconnect();
  }

  console.log('');

  if (allPassed) {
    logger.success('All pre-flight checks passed!');
  } else {
    logger.error('Some pre-flight checks failed. Please fix the issues above before proceeding.');
  }

  console.log('');

  return allPassed;
}

async function interactiveMove() {
  const config = getConfig();
  const api = new CoolifyAPI(config.apiUrl, config.apiToken);

  try {
    // 1. Get all servers
    logger.step('Fetching servers...');
    const servers = await api.getServers();

    if (servers.length === 0) {
      logger.error('No servers found.');
      return;
    }

    const serverChoices = servers.map(s => ({
      name: `${s.name} (${s.ip})`,
      value: s.name
    }));

    // 2. Select source server
    const { sourceServer } = await inquirer.prompt([
      {
        type: 'list',
        name: 'sourceServer',
        message: 'Select source server:',
        choices: serverChoices
      }
    ]);

    // 3. Get resources on source server
    logger.step('Fetching resources...');
    const sourceServerData = servers.find(s => s.name === sourceServer);

    let resources = [];

    // Get databases
    const databases = await api.getDatabases();
    const serverDatabases = databases.filter(d =>
      d.server?.name === sourceServer || d.server_id === sourceServerData.id
    );
    resources.push(...serverDatabases.map(d => ({
      name: `${d.name} (${d.type || 'database'})`,
      value: d.uuid,
      type: d.type || 'database',
      resourceType: 'database'
    })));

    // Get services
    const services = await api.getServices();
    const serverServices = services.filter(s =>
      s.server?.name === sourceServer || s.server_id === sourceServerData.id
    );
    resources.push(...serverServices.map(s => ({
      name: `${s.name} (service)`,
      value: s.uuid,
      type: 'service',
      resourceType: 'service'
    })));

    // Get applications
    const applications = await api.getApplications();
    const serverApps = applications.filter(a =>
      a.server?.name === sourceServer || a.server_id === sourceServerData.id
    );
    resources.push(...serverApps.map(a => ({
      name: `${a.name} (application)`,
      value: a.uuid,
      type: 'application',
      resourceType: 'application'
    })));

    if (resources.length === 0) {
      logger.warn(`No resources found on ${sourceServer}`);
      return;
    }

    // 4. Select resource
    const { resourceUuid } = await inquirer.prompt([
      {
        type: 'list',
        name: 'resourceUuid',
        message: 'Select resource to move:',
        choices: resources
      }
    ]);

    const selectedResource = resources.find(r => r.value === resourceUuid);

    // 5. Select target server
    const targetChoices = serverChoices.filter(s => s.value !== sourceServer);

    if (targetChoices.length === 0) {
      logger.error('No other servers available as target.');
      return;
    }

    const { targetServer } = await inquirer.prompt([
      {
        type: 'list',
        name: 'targetServer',
        message: 'Select target server:',
        choices: targetChoices
      }
    ]);

    // 6. Options
    const { options } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'options',
        message: 'Options:',
        choices: [
          { name: 'Stop source before migration (recommended for databases)', value: 'stopSource', checked: selectedResource.resourceType === 'database' },
          { name: 'Skip disk space check', value: 'skipSpaceCheck' },
          { name: 'Dry run (don\'t make changes)', value: 'dryRun' }
        ]
      }
    ]);

    // 7. Summary
    console.log('');
    console.log('Migration summary:');
    console.log(`  Resource:      ${selectedResource.name}`);
    console.log(`  Type:          ${selectedResource.resourceType}`);
    console.log(`  From:          ${sourceServer}`);
    console.log(`  To:            ${targetServer}`);
    console.log(`  Stop source:   ${options.includes('stopSource') ? 'Yes' : 'No'}`);
    console.log(`  Dry run:       ${options.includes('dryRun') ? 'Yes' : 'No'}`);

    // 8. Pre-flight checks
    const checksPassed = await runPreflightChecks(
      config,
      sourceServer,
      targetServer,
      resourceUuid,
      selectedResource.resourceType
    );

    if (!checksPassed) {
      const { continueAnyway } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueAnyway',
          message: 'Some checks failed. Continue anyway?',
          default: false
        }
      ]);

      if (!continueAnyway) {
        logger.info('Migration cancelled.');
        return;
      }
    }

    // 9. Confirm
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Start migration?',
        default: false
      }
    ]);

    if (!confirm) {
      logger.info('Migration cancelled.');
      return;
    }

    // 10. Run migration
    console.log('');
    await moveResource({
      resource: resourceUuid,
      from: sourceServer,
      to: targetServer,
      dryRun: options.includes('dryRun'),
      stopSource: options.includes('stopSource'),
      skipSpaceCheck: options.includes('skipSpaceCheck'),
      resourceType: selectedResource.resourceType
    });

  } catch (error) {
    logger.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { interactiveMove };
