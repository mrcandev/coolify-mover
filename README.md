# coolify-mover

Migrate resources between Coolify servers.

Coolify doesn't have built-in migration ([Issue #5014](https://github.com/coollabsio/coolify/issues/5014)). This tool clones resources via database and transfers volumes with rsync.

> **Note:** Community tool, not official. Always backup first. Test with `--dry-run`.

## Install

### Option 1: npm (recommended)

```bash
npm install -g coolify-mover
```

### Option 2: Git clone

```bash
cd /opt
git clone https://github.com/mrcandev/coolify-mover.git
cd coolify-mover
npm install
npm link
```

## Setup

Run on your **Coolify server** (where coolify-db runs):

```bash
coolify-mover init
```

This creates `~/.coolify-mover/.env`. Edit it:

```bash
nano ~/.coolify-mover/.env
```

Add your API token:

```env
COOLIFY_API_URL=http://localhost:8000/api/v1
COOLIFY_API_TOKEN=your_token_here
SSH_KEYS_PATH=/data/coolify/ssh/keys
```

Get API token from: **Coolify Dashboard → Settings → API Tokens**

Database password is auto-detected from coolify-db container.

## Usage

### Interactive mode (easiest)

```bash
coolify-mover migrate
```

This will:
1. Show your servers, let you pick source
2. Show resources on that server, let you pick one
3. Let you pick target server
4. Ask for options (stop source, dry run)
5. Run migration

### Command line

```bash
# List all resources
coolify-mover list

# List resources on specific server
coolify-mover list --server my-server

# Move resource (test first with --dry-run)
coolify-mover move -r my-service -f server1 -t server2 --dry-run

# Move for real
coolify-mover move -r my-service -f server1 -t server2

# Stop source before migration (for databases)
coolify-mover move -r postgres-db -f server1 -t server2 --stop-source

# Transfer only volume data
coolify-mover volume -v volume_name -f server1 -t server2 --target-volume new_name
```

### Batch migration

Create `migrations.yaml`:

```yaml
migrations:
  - resource: my-service
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
| `--dry-run` | Show what would happen, don't do anything |
| `--stop-source` | Stop source service before migration |
| `--skip-space-check` | Skip disk space check |

## How it works

1. Reads servers from Coolify API
2. Clones service record in coolify-db (PostgreSQL)
3. Copies env vars, volumes, sub-apps
4. Transfers volume data via rsync over SSH
5. New service appears in Coolify dashboard

Same process as "Clone Resource" button in Coolify UI.

## Requirements

- Node.js 18+
- Run on Coolify main server (needs coolify-db access)
- rsync on both servers
- Coolify API token

## Config locations

Tool looks for `.env` in this order:
1. Current directory
2. `~/.coolify-mover/.env`
3. `/opt/coolify-mover/.env`

Or use environment variables directly:

```bash
export COOLIFY_API_URL=http://localhost:8000/api/v1
export COOLIFY_API_TOKEN=your_token
coolify-mover list
```

## Troubleshooting

**"COOLIFY_API_URL is not set"**
- Run `coolify-mover init` to create config
- Or set environment variables

**"Cannot connect to database"**
- Must run on Coolify server
- Check: `docker ps | grep coolify-db`

**"SSH key not found"**
- Server needs private key in Coolify
- Check SSH_KEYS_PATH in config

**"Resource not found"**
- Run `coolify-mover list` to see available resources

## Disclaimer

Community project, not affiliated with Coolify. Use at your own risk.

## License

MIT

## Author

Ömer AYDINOĞLU ([@mrcandev](https://github.com/mrcandev))
