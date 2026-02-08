# coolify-mover

CLI tool to migrate volumes and resources between Coolify servers.

Coolify lacks a built-in migration feature ([Issue #5014](https://github.com/coollabsio/coolify/issues/5014)). This tool fills that gap.

## Features

- Migrate resources between Coolify servers
- Transfer Docker volumes with rsync
- Uses Coolify's existing SSH keys
- Batch migration support via YAML config
- Direct server-to-server or via localhost transfer

## Installation

```bash
# On your Coolify main server
cd /opt
git clone https://github.com/mrcandev/coolify-mover.git
cd coolify-mover
npm install
cp .env.example .env
```

## Configuration

```env
COOLIFY_API_URL=http://localhost:8000/api/v1
COOLIFY_API_TOKEN=your_api_token_here
SSH_KEYS_PATH=/data/coolify/ssh/keys
```

## Usage

```bash
# Move a resource
coolify-mover move --resource minio-storage --from server1 --to server2

# Transfer only volume data
coolify-mover volume --volume app_data --from server1 --to server2 --target-volume new_app_data

# Batch migration
coolify-mover batch --config migrations.yaml
```

## Requirements

- Node.js 18+
- Coolify API Token
- SSH access to servers (via Coolify keys)

## How It Works

```
Coolify Main Server (localhost)
         │
         ├── SSH to Source Server ──► Pull volume data
         │
         └── SSH to Target Server ──► Push volume data
```

## License

MIT

## Author

**Ömer AYDINOĞLU** ([@mrcandev](https://github.com/mrcandev) / [Simeray](https://simeray.com))
