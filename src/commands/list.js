const CoolifyAPI = require('../api/coolify');
const { getConfig } = require('../utils/config');
const logger = require('../utils/logger');

async function listResources(options) {
  const { server } = options;
  const config = getConfig();

  const api = new CoolifyAPI(config.apiUrl, config.apiToken);

  try {
    // Get servers
    logger.step('Fetching servers...');
    const servers = await api.getServers();

    // Build server lookup map
    const serverMap = new Map();
    for (const s of servers) {
      serverMap.set(s.id, s);
    }

    // Get all resources
    logger.step('Fetching resources...');
    const [services, applications] = await Promise.all([
      api.getServices(),
      api.getApplications()
    ]);

    // Filter by server if specified
    let filteredServices = services;
    let filteredApps = applications;

    if (server) {
      const targetServer = servers.find(s => s.name === server || s.uuid === server);
      if (!targetServer) {
        throw new Error(`Server not found: ${server}`);
      }

      filteredServices = services.filter(s => s.server_id === targetServer.id);
      filteredApps = applications.filter(a => a.server_id === targetServer.id);
    }

    // Display results
    console.log('\n' + '='.repeat(80));
    console.log('SERVERS');
    console.log('='.repeat(80));

    for (const s of servers) {
      const marker = server && s.name === server ? ' *' : '';
      console.log(`  ${s.name}${marker}`);
      console.log(`    IP: ${s.ip}`);
      console.log(`    UUID: ${s.uuid}`);
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('SERVICES');
    console.log('='.repeat(80));

    if (filteredServices.length === 0) {
      console.log('  No services found');
    } else {
      for (const svc of filteredServices) {
        const serverInfo = serverMap.get(svc.server_id);
        console.log(`  ${svc.name}`);
        console.log(`    UUID: ${svc.uuid}`);
        console.log(`    Server: ${serverInfo?.name || 'Unknown'}`);
        console.log(`    Status: ${svc.status || 'unknown'}`);

        const volumes = svc.persistent_storages || [];
        if (volumes.length > 0) {
          console.log(`    Volumes:`);
          for (const v of volumes) {
            console.log(`      - ${v.volume_name || v.name} -> ${v.mount_path}`);
          }
        }
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log('APPLICATIONS');
    console.log('='.repeat(80));

    if (filteredApps.length === 0) {
      console.log('  No applications found');
    } else {
      for (const app of filteredApps) {
        const serverInfo = serverMap.get(app.server_id);
        console.log(`  ${app.name}`);
        console.log(`    UUID: ${app.uuid}`);
        console.log(`    Server: ${serverInfo?.name || 'Unknown'}`);
        console.log(`    Status: ${app.status || 'unknown'}`);

        const volumes = app.persistent_storages || [];
        if (volumes.length > 0) {
          console.log(`    Volumes:`);
          for (const v of volumes) {
            console.log(`      - ${v.volume_name || v.name} -> ${v.mount_path}`);
          }
        }
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log(`Total: ${filteredServices.length} services, ${filteredApps.length} applications`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    throw error;
  }
}

module.exports = listResources;
