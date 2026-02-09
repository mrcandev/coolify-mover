# coolify-mover

Migrate resources between Coolify servers via database cloning and rsync volume transfer.

Coolify doesn't have built-in migration yet ([Issue #5014](https://github.com/coollabsio/coolify/issues/5014)). This tool automates the manual migration process by cloning resources directly in the database and transferring volume data via rsync.

> **Note:** Community tool, not official. Always backup first. Test with `--dry-run`.

## Supported Resources

**Databases:**
- PostgreSQL, MySQL, MariaDB
- Redis, KeyDB, Dragonfly
- MongoDB, ClickHouse

**Services:** Docker Compose services (Meilisearch, Minio, Supabase, etc.)

**Applications:** Dockerfile, Nixpacks, Docker Compose, Static builds

## Install

```bash
npm install -g coolify-mover
```

## Quick Start

```bash
# Initialize config
coolify-mover init

# Edit config and add your API token
nano ~/.coolify-mover/.env

# Run interactive migration
coolify-mover migrate
```

## Example: Interactive Migration

```
$ coolify-mover migrate

>> Fetching servers...
? Select source server:
❯ production-server (192.168.1.10)
  staging-server (192.168.1.20)
  development-server (192.168.1.30)

>> Fetching resources...
? Select resource to move:
❯ my-postgres (database)
  my-redis (database)
  my-app (application)
  my-meilisearch (service)

? Select target server: staging-server (192.168.1.20)

? Options:
 ◉ Stop source before migration (recommended for databases)
 ◯ Skip disk space check
 ◯ Dry run (don't make changes)

Migration summary:
  Resource:      my-postgres (database)
  Type:          database
  From:          production-server
  To:            staging-server
  Stop source:   Yes
  Dry run:       No

>> Running pre-flight checks...

  [ OK ] Database connection
  [ OK ] Source server lookup
  [ OK ] Target server lookup
  [ OK ] Resource lookup
  [ OK ] Target server destination
  [ OK ] Source server SSH
  [ OK ] Source server rsync
  [ OK ] Target server SSH
  [ OK ] Target server rsync

[OK] All pre-flight checks passed!

? Start migration? Yes

>> Connecting to Coolify database...
[OK] Connected to database

>> Fetching server information...
  Source: production-server (192.168.1.10)
  Target: staging-server (192.168.1.20)

>> Fetching resource information...
  Name: my-postgres
  UUID: abc123def456
  Type: postgresql

>> Connecting to servers...
[OK] Connected to both servers

>> Analyzing volumes...
  Found 1 volume(s)
    - postgres-data-abc123def456 (1.2 GB)

>> Pre-flight checks...
  Total volume size:  1.2 GB
  Target available:   50.5 GB
[OK] Sufficient disk space

>> Stopping source resource...
[OK] Source resource stopped

>> Cloning resource configuration...
Cloning PostgreSQL: my-postgres -> my-postgres
  New UUID: xyz789ghi012
[OK] Created new PostgreSQL: ID 15
  Cloned 0 environment variables
  Cloned 1 persistent volumes
[OK] Cloned resource: xyz789ghi012

>> Transferring volume data...
  Transferring: postgres-data-abc123def456 -> postgres-data-xyz789ghi012

[1/2] Pulling from source server...
sent 1,234,567 bytes  received 103 bytes  89,765.43 bytes/sec
total size is 1,289,748,123  speedup is 1,044.12

[2/2] Pushing to target server...
sent 1,234,567 bytes  received 103 bytes  89,765.43 bytes/sec
total size is 1,289,748,123  speedup is 1,044.12

Cleaning up temp files...

>> Renaming old resource...
  Renamed old resource to: my-postgres-old
[OK] Migration completed!

[WARN] IMPORTANT: Please verify the new resource works correctly!

Next steps:
  1. Go to Coolify dashboard
  2. Deploy the new resource: my-postgres
  3. Test and verify everything works correctly
  4. If OK, stop and delete the old resource: my-postgres-old
```

## Example: Volume-Only Transfer

Transfer volume data without touching Coolify configuration:

```
$ coolify-mover volume -v redis-data-abc123 -f production-server -t staging-server

>> Connecting to servers...
[OK] Connected to both servers

>> Checking source volume...
  Volume: redis-data-abc123
  Size: 256 MB

>> Transferring volume data...

[1/2] Pulling from source server...
receiving incremental file list
./
dump.rdb
appendonlydir/

sent 115 bytes  received 1,973 bytes  464.00 bytes/sec

[2/2] Pushing to target server...
sending incremental file list
./
dump.rdb
appendonlydir/

sent 1,967 bytes  received 103 bytes  591.43 bytes/sec

[OK] Volume transfer completed!
```

## Commands

| Command | Description |
|---------|-------------|
| `init` | Create config file |
| `migrate` | Interactive migration wizard |
| `list` | List all resources |
| `move` | Move a resource (CLI mode) |
| `volume` | Transfer volume data only |
| `batch` | Run migrations from YAML file |

## CLI Options

```bash
# List all resources
coolify-mover list

# List resources on specific server
coolify-mover list --server production-server

# Migrate with CLI flags
coolify-mover move -r my-postgres -f production-server -t staging-server

# With options
coolify-mover move -r my-postgres -f production-server -t staging-server --stop-source

# Dry run (no changes)
coolify-mover move -r my-postgres -f production-server -t staging-server --dry-run

# Volume transfer only
coolify-mover volume -v volume-name -f source-server -t target-server
coolify-mover volume -v old-volume -f source -t target --target-volume new-volume
```

## Batch Migration

Create `migrations.yaml`:

```yaml
migrations:
  - resource: my-redis
    from: production-server
    to: staging-server

  - resource: my-postgres
    from: production-server
    to: staging-server
    stopSource: true
```

Run:

```bash
coolify-mover batch --config migrations.yaml
```

## How It Works

1. **Connects to coolify-db** via `docker exec psql`
2. **Runs pre-flight checks** (SSH, rsync, disk space)
3. **Clones resource** in database (same as Coolify's Clone button)
4. **Copies environment variables** and persistent volume records
5. **Transfers volume data** via rsync (source → localhost → target)
6. **Renames old resource** with `-old` suffix (data preserved)

## After Migration

The old resource is renamed with `-old` suffix, not deleted:

```
my-postgres  →  my-postgres-old
```

**Next steps:**
1. Deploy the new resource from Coolify dashboard
2. Update environment variables if needed (new internal hostnames)
3. Test and verify everything works
4. Delete the old resource when confirmed working

## Configuration

Run `coolify-mover init` or create `~/.coolify-mover/.env`:

```env
COOLIFY_API_URL=http://localhost:8000/api/v1
COOLIFY_API_TOKEN=your_api_token_here
SSH_KEYS_PATH=/data/coolify/ssh/keys
```

Get API token: Coolify Dashboard → Settings → API → Create Token (read + write)

## Requirements

- Node.js 18+
- Must run on Coolify main server (needs coolify-db access)
- rsync installed on source and target servers
- SSH keys configured in Coolify for both servers

## Troubleshooting

**"Cannot connect to database"**
```bash
# Check coolify-db is running
docker ps | grep coolify-db
```

**"SSH key not found"**
- Verify server has a private key assigned in Coolify
- Check `SSH_KEYS_PATH` in config

**"Pre-flight check failed"**
- Fix the specific issue shown
- Or continue anyway (not recommended)

**Version mismatch after migration (e.g., Meilisearch)**
- Change the image version in Coolify to match source data version

## Contributing

Issues and PRs welcome: https://github.com/mrcandev/coolify-mover

## License

MIT

## Author

Omer AYDINOGLU ([@mrcandev](https://github.com/mrcandev))
