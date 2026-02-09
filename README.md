# coolify-mover

Migrate resources between Coolify servers.

Coolify doesn't have built-in migration ([Issue #5014](https://github.com/coollabsio/coolify/issues/5014)). This tool clones resources via database and transfers volumes with rsync.

> **Note:** Community tool, not official. Always backup first. Test with `--dry-run`.

## Supported Resources

**Services:** Docker Compose services (meilisearch, minio, etc.)

**Databases:**
- PostgreSQL
- MySQL
- MariaDB
- Redis
- MongoDB
- KeyDB
- Dragonfly
- ClickHouse

**Applications:** Not yet supported (coming soon)

## Install

### npm (recommended)

```bash
npm install -g coolify-mover
```

### Git clone

```bash
cd /opt
git clone https://github.com/mrcandev/coolify-mover.git
cd coolify-mover
npm install
npm link
```

## Setup

Run on your **Coolify server** (needs coolify-db access):

```bash
coolify-mover init
```

Edit the config file:

```bash
nano ~/.coolify-mover/.env
```

Add your API token:

```env
COOLIFY_API_URL=http://localhost:8000/api/v1
COOLIFY_API_TOKEN=your_token_here
SSH_KEYS_PATH=/data/coolify/ssh/keys
```

Get API token:
1. Coolify Dashboard -> Settings -> Enable API
2. Keys & Tokens -> API Tokens -> Create new token
3. Give `read` and `write` permissions (or `root`)

Database password is auto-detected from coolify-db container.

## Usage

### Interactive mode (easiest)

```bash
coolify-mover migrate
```

Step by step:
1. Select source server
2. Select resource to move
3. Select target server
4. Choose options (stop source, dry run)
5. Pre-flight checks run automatically
6. Confirm and migrate

### Pre-flight Checks

Before migration starts, the tool validates:
- Database connection (coolify-db)
- Source server exists in database
- Target server exists in database
- Resource exists in database
- Target server has Docker destination
- SSH connectivity to both servers
- rsync is installed on both servers

```
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
```

### Command line

```bash
# List all resources
coolify-mover list

# List resources on specific server
coolify-mover list --server my-server

# Dry run (test, no changes)
coolify-mover move -r postgres-db -f server1 -t server2 --dry-run

# Actual migration
coolify-mover move -r postgres-db -f server1 -t server2

# Stop source before migration (recommended for databases)
coolify-mover move -r postgres-db -f server1 -t server2 --stop-source

# Transfer only volume data
coolify-mover volume -v volume_name -f server1 -t server2 --target-volume new_name
```

### Batch migration

Create `migrations.yaml`:

```yaml
migrations:
  - resource: redis-db
    from: old-server
    to: new-server

  - resource: postgres-db
    from: old-server
    to: new-server
```

Run:

```bash
coolify-mover batch --config migrations.yaml
```

## After Migration

The tool does **not** delete the old resource. It renames it with `-old` suffix.

```
venueplus-redis  ->  venueplus-redis-old
```

**What you need to do:**
1. Deploy the new resource from Coolify dashboard
2. Test that it works correctly
3. If everything is OK, delete the old resource (`-old` one)

> Don't delete the old resource until the new one is working! You may lose data.

## Commands

| Command | Description |
|---------|-------------|
| `init` | Create config file |
| `migrate` | Interactive migration wizard |
| `list` | List all resources |
| `move` | Move a resource |
| `volume` | Transfer volume data only |
| `batch` | Run migrations from YAML file |

## Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Test mode, no changes |
| `--stop-source` | Stop source before migration |
| `--skip-space-check` | Skip disk space check |

## How it Works

1. Connects to coolify-db via `docker exec`
2. Gets server info from database
3. Runs pre-flight checks (SSH, rsync, disk space)
4. Clones resource in database (same as Clone button)
5. Copies environment variables and volume records
6. Transfers volume data via rsync
7. Renames old resource with `-old` suffix
8. New resource appears in Coolify dashboard

## Requirements

- Node.js 18+
- Must run on Coolify main server (needs coolify-db access)
- rsync installed on both servers
- Coolify API token

## Config Locations

Tool looks for `.env` in this order:
1. Current directory
2. `~/.coolify-mover/.env`
3. `/opt/coolify-mover/.env`

Or use environment variables:

```bash
export COOLIFY_API_URL=http://localhost:8000/api/v1
export COOLIFY_API_TOKEN=your_token
coolify-mover list
```

## Troubleshooting

**"COOLIFY_API_URL is not set"**
- Run `coolify-mover init`

**"Cannot connect to database"**
- Are you on the Coolify server?
- Check: `docker ps | grep coolify-db`

**"SSH key not found"**
- Is the server's private key defined in Coolify?
- Check SSH_KEYS_PATH in config

**"Resource not found"**
- Run `coolify-mover list` to see available resources

**Pre-flight check fails**
- Fix the issue shown in the check output
- You can continue anyway but migration may fail

## License

MIT

## Author

Omer AYDINOGLU ([@mrcandev](https://github.com/mrcandev))
