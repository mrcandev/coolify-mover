const CoolifyDB = require('./connection');
const logger = require('../utils/logger');

class ResourceCloner {
  constructor(dbConfig = {}) {
    this.db = new CoolifyDB(dbConfig);
  }

  async connect() {
    await this.db.connect();
    return this;
  }

  async disconnect() {
    await this.db.disconnect();
  }

  // Get service by UUID or name
  async getService(identifier) {
    const result = await this.db.query(
      `SELECT * FROM services WHERE uuid = $1 OR name = $1 LIMIT 1`,
      [identifier]
    );
    return result.rows[0] || null;
  }

  // Get destination (standalone_docker) by server_id
  async getDestination(serverId) {
    const result = await this.db.query(
      `SELECT * FROM standalone_dockers WHERE server_id = $1 LIMIT 1`,
      [serverId]
    );
    return result.rows[0] || null;
  }

  // Get server by name or UUID
  async getServer(identifier) {
    const result = await this.db.query(
      `SELECT * FROM servers WHERE uuid = $1 OR name = $1 LIMIT 1`,
      [identifier]
    );
    return result.rows[0] || null;
  }

  // Clone a service to a new destination
  async cloneService(sourceUuid, targetServerId, targetDestinationId, options = {}) {
    const source = await this.getService(sourceUuid);
    if (!source) {
      throw new Error(`Service not found: ${sourceUuid}`);
    }

    const newUuid = this.db.generateUuid();
    const newName = options.newName || `${source.name}-clone`;

    logger.info(`Cloning service: ${source.name} -> ${newName}`);
    logger.info(`  New UUID: ${newUuid}`);

    // 1. Clone main service record
    const insertResult = await this.db.query(`
      INSERT INTO services (
        uuid, name, environment_id, server_id, description,
        docker_compose_raw, docker_compose, destination_type, destination_id,
        connect_to_docker_network, config_hash, service_type,
        is_container_label_escape_enabled, compose_parsing_version,
        created_at, updated_at
      )
      SELECT
        $1, $2, environment_id, $3, description,
        docker_compose_raw, docker_compose, destination_type, $4,
        connect_to_docker_network, NULL, service_type,
        is_container_label_escape_enabled, compose_parsing_version,
        NOW(), NOW()
      FROM services WHERE id = $5
      RETURNING id, uuid, name
    `, [newUuid, newName, targetServerId, targetDestinationId, source.id]);

    const newService = insertResult.rows[0];
    logger.success(`  Created new service: ID ${newService.id}`);

    // 2. Clone environment variables
    const envCount = await this.cloneEnvironmentVariables(
      source.id,
      newService.id,
      'App\\Models\\Service'
    );
    logger.info(`  Cloned ${envCount} environment variables`);

    // 3. Clone service_applications
    const appsCloned = await this.cloneServiceApplications(source.id, newService.id, newUuid);
    logger.info(`  Cloned ${appsCloned.length} service applications`);

    // 4. Clone service_databases
    const dbsCloned = await this.cloneServiceDatabases(source.id, newService.id, newUuid);
    logger.info(`  Cloned ${dbsCloned.length} service databases`);

    // 5. Clone persistent volumes
    const volumesCloned = await this.clonePersistentVolumes(
      source.id,
      newService.id,
      'App\\Models\\Service',
      newUuid,
      source.uuid
    );
    logger.info(`  Cloned ${volumesCloned.length} persistent volumes`);

    return {
      id: newService.id,
      uuid: newUuid,
      name: newName,
      sourceId: source.id,
      sourceUuid: source.uuid,
      applications: appsCloned,
      databases: dbsCloned,
      volumes: volumesCloned
    };
  }

  // Clone environment variables
  async cloneEnvironmentVariables(sourceId, targetId, resourceType) {
    const result = await this.db.query(`
      INSERT INTO environment_variables (
        uuid, key, value, is_preview, is_shown_once, is_multiline,
        version, is_literal, "order", is_required, is_shared,
        resourceable_type, resourceable_id, is_runtime, is_buildtime,
        created_at, updated_at
      )
      SELECT
        $1 || substr(md5(random()::text), 1, 20), key, value, is_preview, is_shown_once, is_multiline,
        version, is_literal, "order", is_required, is_shared,
        $2, $3, is_runtime, is_buildtime,
        NOW(), NOW()
      FROM environment_variables
      WHERE resourceable_id = $4 AND resourceable_type = $2
    `, [this.db.generateUuid().substring(0, 6), resourceType, targetId, sourceId]);

    return result.rowCount;
  }

  // Clone service applications
  async cloneServiceApplications(sourceServiceId, newServiceId, newServiceUuid) {
    const apps = await this.db.query(
      `SELECT * FROM service_applications WHERE service_id = $1 AND deleted_at IS NULL`,
      [sourceServiceId]
    );

    const clonedApps = [];
    for (const app of apps.rows) {
      const newAppUuid = this.db.generateUuid();

      const result = await this.db.query(`
        INSERT INTO service_applications (
          uuid, name, human_name, description, fqdn, ports, exposes,
          status, service_id, exclude_from_status, required_fqdn,
          image, is_log_drain_enabled, is_include_timestamps,
          is_gzip_enabled, is_stripprefix_enabled, last_online_at, is_migrated,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          'exited', $8, $9, $10,
          $11, $12, $13,
          $14, $15, NOW(), false,
          NOW(), NOW()
        )
        RETURNING id, uuid, name
      `, [
        newAppUuid, app.name, app.human_name, app.description, null, app.ports, app.exposes,
        newServiceId, app.exclude_from_status, app.required_fqdn,
        app.image, app.is_log_drain_enabled, app.is_include_timestamps,
        app.is_gzip_enabled, app.is_stripprefix_enabled
      ]);

      const newApp = result.rows[0];

      // Clone env vars for this application
      await this.cloneEnvironmentVariables(
        app.id,
        newApp.id,
        'App\\Models\\ServiceApplication'
      );

      // Clone volumes for this application
      await this.clonePersistentVolumes(
        app.id,
        newApp.id,
        'App\\Models\\ServiceApplication',
        newAppUuid,
        app.uuid
      );

      clonedApps.push({
        id: newApp.id,
        uuid: newAppUuid,
        name: app.name,
        sourceId: app.id,
        sourceUuid: app.uuid
      });
    }

    return clonedApps;
  }

  // Clone service databases
  async cloneServiceDatabases(sourceServiceId, newServiceId, newServiceUuid) {
    const dbs = await this.db.query(
      `SELECT * FROM service_databases WHERE service_id = $1 AND deleted_at IS NULL`,
      [sourceServiceId]
    );

    const clonedDbs = [];
    for (const db of dbs.rows) {
      const newDbUuid = this.db.generateUuid();

      const result = await this.db.query(`
        INSERT INTO service_databases (
          uuid, name, human_name, description, ports, exposes,
          status, service_id, exclude_from_status, image,
          is_log_drain_enabled, is_include_timestamps, last_online_at, is_migrated,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          'exited', $7, $8, $9,
          $10, $11, NOW(), false,
          NOW(), NOW()
        )
        RETURNING id, uuid, name
      `, [
        newDbUuid, db.name, db.human_name, db.description, db.ports, db.exposes,
        newServiceId, db.exclude_from_status, db.image,
        db.is_log_drain_enabled, db.is_include_timestamps
      ]);

      const newDb = result.rows[0];

      // Clone env vars for this database
      await this.cloneEnvironmentVariables(
        db.id,
        newDb.id,
        'App\\Models\\ServiceDatabase'
      );

      // Clone volumes for this database
      await this.clonePersistentVolumes(
        db.id,
        newDb.id,
        'App\\Models\\ServiceDatabase',
        newDbUuid,
        db.uuid
      );

      clonedDbs.push({
        id: newDb.id,
        uuid: newDbUuid,
        name: db.name,
        sourceId: db.id,
        sourceUuid: db.uuid
      });
    }

    return clonedDbs;
  }

  // Clone persistent volumes
  async clonePersistentVolumes(sourceId, targetId, resourceType, newUuid, oldUuid) {
    const volumes = await this.db.query(
      `SELECT * FROM local_persistent_volumes WHERE resource_id = $1 AND resource_type = $2`,
      [sourceId, resourceType]
    );

    const clonedVolumes = [];
    for (const vol of volumes.rows) {
      // Replace old UUID with new UUID in volume name
      const newVolumeName = vol.name.replace(oldUuid, newUuid);

      await this.db.query(`
        INSERT INTO local_persistent_volumes (
          name, mount_path, host_path, container_id,
          resource_type, resource_id, created_at, updated_at
        )
        VALUES ($1, $2, $3, NULL, $4, $5, NOW(), NOW())
      `, [newVolumeName, vol.mount_path, vol.host_path, resourceType, targetId]);

      clonedVolumes.push({
        sourceName: vol.name,
        targetName: newVolumeName,
        mountPath: vol.mount_path
      });
    }

    return clonedVolumes;
  }

  // Get all volumes for a service (including sub-applications and databases)
  async getServiceVolumes(serviceUuid) {
    const service = await this.getService(serviceUuid);
    if (!service) {
      throw new Error(`Service not found: ${serviceUuid}`);
    }

    const volumes = [];

    // Main service volumes
    const serviceVols = await this.db.query(
      `SELECT * FROM local_persistent_volumes WHERE resource_id = $1 AND resource_type = 'App\\Models\\Service'`,
      [service.id]
    );
    volumes.push(...serviceVols.rows.map(v => ({ ...v, source: 'service' })));

    // Service application volumes
    const apps = await this.db.query(
      `SELECT id, uuid, name FROM service_applications WHERE service_id = $1 AND deleted_at IS NULL`,
      [service.id]
    );
    for (const app of apps.rows) {
      const appVols = await this.db.query(
        `SELECT * FROM local_persistent_volumes WHERE resource_id = $1 AND resource_type = 'App\\Models\\ServiceApplication'`,
        [app.id]
      );
      volumes.push(...appVols.rows.map(v => ({ ...v, source: 'application', appName: app.name })));
    }

    // Service database volumes
    const dbs = await this.db.query(
      `SELECT id, uuid, name FROM service_databases WHERE service_id = $1 AND deleted_at IS NULL`,
      [service.id]
    );
    for (const db of dbs.rows) {
      const dbVols = await this.db.query(
        `SELECT * FROM local_persistent_volumes WHERE resource_id = $1 AND resource_type = 'App\\Models\\ServiceDatabase'`,
        [db.id]
      );
      volumes.push(...dbVols.rows.map(v => ({ ...v, source: 'database', dbName: db.name })));
    }

    return volumes;
  }
}

module.exports = ResourceCloner;