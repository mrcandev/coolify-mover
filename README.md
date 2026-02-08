# coolify-mover

CLI tool to migrate volumes and resources between Coolify servers.

Coolify lacks a built-in migration feature ([Issue #5014](https://github.com/coollabsio/coolify/issues/5014)). This tool fills that gap.

## Features

- Migrate resources between Coolify servers
- Transfer Docker volumes with rsync
- Uses Coolify's existing SSH keys
- Batch migration support via YAML config
- Direct server-to-server or via localhost transfer
- Dry-run mode for safe testing

## Quick Install

Run this on your **Coolify main server**:

```bash
curl -fsSL https://raw.githubusercontent.com/mrcandev/coolify-mover/main/install.sh | sudo bash
```

### Manual Installation

```bash
cd /opt
git clone https://github.com/mrcandev/coolify-mover.git
cd coolify-mover
npm install
cp .env.example .env
nano .env  # Add your API token
```

### NPM (Coming Soon)

```bash
npm install -g coolify-mover
```

## Configuration

Edit `/opt/coolify-mover/.env`:

```env
COOLIFY_API_URL=http://localhost:8000/api/v1
COOLIFY_API_TOKEN=your_api_token_here
SSH_KEYS_PATH=/data/coolify/ssh/keys
TEMP_DIR=/tmp/coolify-mover
```

**Get API Token:** Coolify Dashboard → Settings → API Tokens → Create

## Usage

### List Resources

```bash
coolify-mover list
coolify-mover list --server my-server
```

### Move Resource (Config + Data)

```bash
coolify-mover move --resource minio-storage --from server1 --to server2

# Dry run first
coolify-mover move --resource minio-storage --from server1 --to server2 --dry-run
```

### Transfer Volume Only

```bash
coolify-mover volume \
  --volume abc123_minio-data \
  --from server1 \
  --to server2 \
  --target-volume xyz789_minio-data
```

### Batch Migration

Create `migrations.yaml`:

```yaml
migrations:
  - resource: minio-storage
    from: old-server
    to: new-server

  - resource: postgres-db
    from: old-server
    to: new-server

  - volume: custom_volume_name
    from: old-server
    to: new-server
    target_volume: new_volume_name
```

Run:

```bash
coolify-mover batch --config migrations.yaml
```

## Database Migration

For databases (PostgreSQL, MySQL, etc.), **stop the service first**:

1. Coolify Dashboard → Stop the database service
2. Run migration: `coolify-mover move --resource postgres-db --from A --to B`
3. Deploy on new server

This ensures data consistency.

## How It Works

```
┌─────────────────────────────────────────┐
│       Coolify Main Server               │
│              (localhost)                │
│                                         │
│   coolify-mover reads:                  │
│   - Coolify API (resources, servers)    │
│   - SSH keys from /data/coolify/ssh/    │
└─────────────────────────────────────────┘
                    │
       ┌────────────┴────────────┐
       │ SSH                     │ SSH
       ▼                         ▼
┌──────────────┐          ┌──────────────┐
│ Source       │  rsync   │ Target       │
│ Server       │ ───────► │ Server       │
│              │          │              │
│ Volume: X    │          │ Volume: Y    │
└──────────────┘          └──────────────┘
```

## Requirements

- Node.js 18+
- Coolify API Token
- rsync installed on servers
- SSH access (via Coolify managed keys)

## Security

- Runs only on Coolify main server (localhost)
- Uses existing Coolify SSH keys (no new keys created)
- API token stored locally in `.env`
- Source data is never deleted (copy only)

## Troubleshooting

**"SSH key not found"**
- Check `SSH_KEYS_PATH` in `.env`
- Verify server has a private key assigned in Coolify

**"Resource not found"**
- Use `coolify-mover list` to see available resources
- Check resource name or UUID

**"Connection refused"**
- Ensure Coolify API is running on port 8000
- Check `COOLIFY_API_URL` in `.env`

## Contributing

Pull requests welcome! Please open an issue first for major changes.

## License

MIT

## Author

**Ömer AYDINOĞLU** ([@mrcandev](https://github.com/mrcandev) / [Simeray](https://simeray.com))
