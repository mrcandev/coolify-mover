#!/usr/bin/env node

const { program } = require('commander');
const moveResource = require('../src/commands/move');
const volumeTransfer = require('../src/commands/volume');
const listResources = require('../src/commands/list');
const batchMigrate = require('../src/commands/batch');
const { interactiveMove } = require('../src/commands/interactive');
const { initConfig } = require('../src/utils/config');

program
  .name('coolify-mover')
  .description('CLI tool to migrate resources between Coolify servers')
  .version('1.2.0');

// Init command - create config file
program
  .command('init')
  .description('Create config file at ~/.coolify-mover/.env')
  .action(() => {
    const result = initConfig();
    if (result.exists) {
      console.log(`Config already exists: ${result.path}`);
    } else {
      console.log(`Config created: ${result.path}`);
      console.log('');
      console.log('Next steps:');
      console.log(`  1. Edit the config: nano ${result.path}`);
      console.log('  2. Set your COOLIFY_API_TOKEN');
      console.log('  3. Run: coolify-mover list');
    }
  });

// Interactive move command (no arguments)
program
  .command('migrate')
  .description('Interactive migration wizard')
  .action(async () => {
    try {
      await interactiveMove();
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('move')
  .description('Move a resource from one server to another')
  .requiredOption('-r, --resource <name>', 'Resource name or UUID')
  .requiredOption('-f, --from <server>', 'Source server name')
  .requiredOption('-t, --to <server>', 'Target server name')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--skip-space-check', 'Skip disk space verification (not recommended)')
  .option('--stop-source', 'Stop source service before migration (recommended for databases)')
  .action(async (options) => {
    try {
      await moveResource(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('volume')
  .description('Transfer only volume data between servers')
  .requiredOption('-v, --volume <name>', 'Source volume name')
  .requiredOption('-f, --from <server>', 'Source server name')
  .requiredOption('-t, --to <server>', 'Target server name')
  .requiredOption('--target-volume <name>', 'Target volume name')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--skip-space-check', 'Skip disk space verification (not recommended)')
  .action(async (options) => {
    try {
      await volumeTransfer(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all resources and their locations')
  .option('-s, --server <name>', 'Filter by server name')
  .action(async (options) => {
    try {
      await listResources(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program
  .command('batch')
  .description('Run batch migration from config file')
  .requiredOption('-c, --config <file>', 'YAML config file path')
  .option('--dry-run', 'Show what would be done without making changes')
  .option('--skip-space-check', 'Skip disk space verification (not recommended)')
  .action(async (options) => {
    try {
      await batchMigrate(options);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

program.parse();
