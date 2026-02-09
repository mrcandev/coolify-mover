const inquirer = require('inquirer');
const CoolifyAPI = require('../api/coolify');
const { getConfig } = require('../utils/config');
const logger = require('../utils/logger');
const moveResource = require('./move');

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

    // 7. Confirm
    console.log('');
    console.log('Migration summary:');
    console.log(`  Resource:      ${selectedResource.name}`);
    console.log(`  Type:          ${selectedResource.resourceType}`);
    console.log(`  From:          ${sourceServer}`);
    console.log(`  To:            ${targetServer}`);
    console.log(`  Stop source:   ${options.includes('stopSource') ? 'Yes' : 'No'}`);
    console.log(`  Dry run:       ${options.includes('dryRun') ? 'Yes' : 'No'}`);
    console.log('');

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

    // 8. Run migration
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
