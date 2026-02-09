#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}"
echo "  ___            _  _  __         __  __                      "
echo " / __|  ___  ___| |(_)/ _|_  _   |  \/  | ___ __ __ ___  _ _  "
echo "| (__  / _ \/ _ \ || |  _| || |  | |\/| |/ _ \\ V // -_)| '_| "
echo " \___| \___/\___/_||_|_|  \_, |  |_|  |_|\___/ \_/ \___||_|   "
echo "                          |__/                                "
echo -e "${NC}"
echo "Coolify Migration Tool Installer"
echo "================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo)${NC}"
  exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}Node.js is not installed.${NC}"
  echo "Install Node.js 18+ first:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
  echo "  apt-get install -y nodejs"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}Node.js 18+ required. Current: $(node -v)${NC}"
  exit 1
fi

echo -e "${GREEN}[OK]${NC} Node.js $(node -v)"

# Install directory
INSTALL_DIR="/opt/coolify-mover"

# Remove old installation if exists
if [ -d "$INSTALL_DIR" ]; then
  echo -e "${YELLOW}Removing old installation...${NC}"
  rm -rf "$INSTALL_DIR"
fi

# Clone repository
echo "Downloading coolify-mover..."
git clone --depth 1 https://github.com/mrcandev/coolify-mover.git "$INSTALL_DIR"

# Install dependencies
echo "Installing dependencies..."
cd "$INSTALL_DIR"
npm install --production

# Create symlink
ln -sf "$INSTALL_DIR/bin/coolify-mover.js" /usr/local/bin/coolify-mover
chmod +x "$INSTALL_DIR/bin/coolify-mover.js"

echo -e "${GREEN}[OK]${NC} Installed to $INSTALL_DIR"

# Setup .env if not exists
if [ ! -f "$INSTALL_DIR/.env" ]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"

  echo ""
  echo -e "${YELLOW}Configuration needed!${NC}"
  echo ""
  echo "1. Get your API token from Coolify:"
  echo "   Dashboard > Settings > API Tokens > Create"
  echo ""
  echo "2. Edit the config file:"
  echo "   nano $INSTALL_DIR/.env"
  echo ""
  echo "3. Set your COOLIFY_API_TOKEN"
  echo ""
  echo "(Database password is auto-detected, no need to configure)"
  echo ""
fi

echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "Usage:"
echo "  coolify-mover list                    # List all resources"
echo "  coolify-mover move -r NAME -f A -t B  # Move resource"
echo "  coolify-mover --help                  # Show help"
echo ""
echo "Config: $INSTALL_DIR/.env"
echo ""
