const fs = require('fs');
const YAML = require('yaml');
const moveResource = require('./move');
const volumeTransfer = require('./volume');
const logger = require('../utils/logger');

async function batchMigrate(options) {
  const { config: configPath, dryRun, skipSpaceCheck } = options;

  // Read config file
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = YAML.parse(configContent);

  if (!config.migrations || !Array.isArray(config.migrations)) {
    throw new Error('Config must contain a "migrations" array');
  }

  logger.info(`Batch migration: ${config.migrations.length} tasks${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('');

  let completed = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < config.migrations.length; i++) {
    const migration = config.migrations[i];
    const taskNum = i + 1;

    console.log('='.repeat(80));
    logger.info(`Task ${taskNum}/${config.migrations.length}`);
    console.log('='.repeat(80));

    try {
      if (migration.volume) {
        // Volume-only migration
        await volumeTransfer({
          volume: migration.volume,
          from: migration.from,
          to: migration.to,
          targetVolume: migration.target_volume || migration.volume,
          dryRun,
          skipSpaceCheck
        });
      } else if (migration.resource) {
        // Full resource migration
        await moveResource({
          resource: migration.resource,
          from: migration.from,
          to: migration.to,
          dryRun,
          skipSpaceCheck
        });
      } else {
        throw new Error('Migration must specify either "resource" or "volume"');
      }

      completed++;
      logger.success(`Task ${taskNum} completed`);

    } catch (error) {
      failed++;
      errors.push({
        task: taskNum,
        migration,
        error: error.message
      });
      logger.error(`Task ${taskNum} failed: ${error.message}`);
    }

    console.log('');
  }

  // Summary
  console.log('='.repeat(80));
  logger.info('BATCH MIGRATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total tasks: ${config.migrations.length}`);
  console.log(`  Completed: ${completed}`);
  console.log(`  Failed: ${failed}`);

  if (errors.length > 0) {
    console.log('\nFailed tasks:');
    for (const err of errors) {
      console.log(`  Task ${err.task}: ${err.error}`);
    }
  }

  console.log('='.repeat(80) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

module.exports = batchMigrate;
