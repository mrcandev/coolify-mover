# coolify-mover

CLI tool to migrate resources between Coolify servers.

Coolify doesn't have a built-in migration feature ([Issue #5014](https://github.com/coollabsio/coolify/issues/5014)). This tool fills that gap by cloning resources directly via database (same method as Coolify UI) and transferring volume data with rsync.

> **Warning**
> Community tool, not official. Always backup before migration. Test with `--dry-run` first.

## What it does

- Clones service/application config via Coolify's PostgreSQL database
- Copies environment variables, volumes, sub-applications
- Transfers volume data between servers with rsync
- Checks disk space before transfer
- Uses Coolify's existing SSH keys

## Install

Run on your Coolify server:

```bash
curl -fsSL https://raw.githubusercontent.com/mrcandev/coolify-mover/main/install.sh | sudo bash
```

Or manually:

```bash
cd /opt
git clone https://github.com/mrcandev/coolify-mover.git
cd coolify-mover
npm install
cp .env.example .env
nano .env  # Add your API token
```

## Setup

Edit `/opt/coolify-mover/.env`:

```env
COOLIFY_API_URL=http://localhost:8000/api/v1
COOLIFY_API_TOKEN=your_token_here
SSH_KEYS_PATH=/data/coolify/ssh/keys
```

Get API token: Coolify Dashboard → Settings → API Tokens

Database password is auto-detected from coolify-db container.

## Usage

```bash
# List resources
coolify-mover list
coolify-mover list --server my-server

# Move resource (dry run first)
coolify-mover move -r my-service -f server1 -t server2 --dry-run

# Move resource (for real)
coolify-mover move -r my-service -f server1 -t server2

# Stop source before migration (good for databases)
coolify-mover move -r postgres-db -f server1 -t server2 --stop-source

# Transfer only volume data
coolify-mover volume -v volume_name -f server1 -t server2 --target-volume new_name
```

## Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would happen, don't do anything |
| `--stop-source` | Stop source service before migration |
| `--skip-space-check` | Skip disk space verification |

## How it works

1. Connects to Coolify API to get server info
2. Connects to coolify-db (PostgreSQL) to clone service record
3. Copies related data: env vars, volumes, sub-apps, sub-dbs
4. Creates new volume on target server
5. Transfers data with rsync via SSH

The clone process is the same as clicking "Clone Resource" in Coolify UI.

## Requirements

- Node.js 18+
- Coolify API token
- rsync on both servers
- Run on Coolify main server (needs access to coolify-db)

## Troubleshooting

**"Cannot connect to database"**
- Make sure you're running on the Coolify server
- Check if coolify-db container is running: `docker ps | grep coolify-db`

**"SSH key not found"**
- Check SSH_KEYS_PATH in .env
- Server must have a private key assigned in Coolify

**"Resource not found"**
- Use `coolify-mover list` to see available resources
- Check resource name or UUID

## Disclaimer

This is a community project, not affiliated with Coolify. Use at your own risk. Always backup first.

## License

MIT

## Author

Ömer AYDINOĞLU ([@mrcandev](https://github.com/mrcandev))
