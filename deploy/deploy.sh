#!/usr/bin/env bash
set -euo pipefail

# MerlinsA-IDE Deployment Script for Ubuntu
# Usage: ./deploy/deploy.sh [--setup | --update | --status]

APP_DIR="/opt/the-ide"
DATA_DIR="/var/lib/the-ide"
SERVICE_NAME="the-ide-api"
SERVICE_USER="the-ide"
NGINX_CONF="/etc/nginx/sites-available/the-ide"
NGINX_ENABLED="/etc/nginx/sites-enabled/the-ide"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[deploy]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ─── First-time setup ───────────────────────────────────────────────────

setup() {
    log "Running first-time setup..."

    # Check for root
    if [ "$EUID" -ne 0 ]; then
        error "Setup must be run as root (sudo ./deploy/deploy.sh --setup)"
    fi

    # Install Node.js 22+ if not present
    if ! command -v node &> /dev/null; then
        log "Installing Node.js 22..."
        curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
        apt-get install -y nodejs
        success "Node.js $(node -v) installed"
    else
        success "Node.js $(node -v) already installed"
    fi

    # Install pnpm if not present
    if ! command -v pnpm &> /dev/null; then
        log "Installing pnpm..."
        npm install -g pnpm
        success "pnpm installed"
    else
        success "pnpm already installed"
    fi

    # Install nginx if not present
    if ! command -v nginx &> /dev/null; then
        log "Installing nginx..."
        apt-get install -y nginx
        success "nginx installed"
    else
        success "nginx already installed"
    fi

    # Create service user
    if ! id "$SERVICE_USER" &>/dev/null; then
        log "Creating service user: $SERVICE_USER"
        useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" "$SERVICE_USER"
        success "User $SERVICE_USER created"
    else
        success "User $SERVICE_USER already exists"
    fi

    # Create data directory
    mkdir -p "$DATA_DIR"
    chown "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
    success "Data directory: $DATA_DIR"

    # Create app directory
    mkdir -p "$APP_DIR"
    success "App directory: $APP_DIR"

    # Copy systemd service
    cp deploy/the-ide-api.service /etc/systemd/system/
    systemctl daemon-reload
    success "systemd service installed"

    # Configure nginx
    cp deploy/nginx.conf "$NGINX_CONF"
    if [ ! -L "$NGINX_ENABLED" ]; then
        ln -s "$NGINX_CONF" "$NGINX_ENABLED"
    fi

    # Remove default site if it conflicts
    if [ -L /etc/nginx/sites-enabled/default ]; then
        rm /etc/nginx/sites-enabled/default
    fi

    nginx -t && systemctl reload nginx
    success "nginx configured"

    # Generate JWT secret if not set
    JWT_SECRET=$(openssl rand -base64 32)
    log "Generated JWT secret. Update /etc/systemd/system/${SERVICE_NAME}.service:"
    echo "  Environment=THE_IDE_JWT_SECRET=$JWT_SECRET"
    echo ""
    warn "Also update THE_IDE_AUTH_PASSWORD in the service file!"

    success "Setup complete! Run './deploy/deploy.sh --update' to deploy the app."
}

# ─── Deploy/update ───────────────────────────────────────────────────────

update() {
    log "Deploying MerlinsA-IDE..."

    # Sync files to app directory
    log "Syncing files to $APP_DIR..."
    rsync -a --delete \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='data' \
        --exclude='.claude' \
        ./ "$APP_DIR/"
    success "Files synced"

    # Install dependencies
    log "Installing dependencies..."
    cd "$APP_DIR"
    pnpm install --frozen-lockfile --prod=false
    success "Dependencies installed"

    # Build all packages
    log "Building packages..."
    pnpm build
    success "Build complete"

    # Set ownership
    chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
    success "Ownership set"

    # Restart service
    log "Restarting API server..."
    systemctl restart "$SERVICE_NAME"
    systemctl enable "$SERVICE_NAME"
    success "API server restarted"

    # Reload nginx
    nginx -t && systemctl reload nginx
    success "nginx reloaded"

    # Health check
    sleep 2
    if curl -sf http://127.0.0.1:3000/api/v1/health > /dev/null 2>&1; then
        success "Health check passed — API is running"
    else
        warn "Health check failed — check: journalctl -u $SERVICE_NAME -f"
    fi

    echo ""
    success "Deployment complete!"
    log "API:       http://127.0.0.1:3000/api/v1/health"
    log "Dashboard: http://your-domain.com/"
    log "Swagger:   http://your-domain.com/docs"
    log "Logs:      journalctl -u $SERVICE_NAME -f"
}

# ─── Status ──────────────────────────────────────────────────────────────

status() {
    echo ""
    log "MerlinsA-IDE Status"
    echo "─────────────────────────────────────────"

    # Service status
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        success "API Server: running"
    else
        error_msg=$(systemctl status "$SERVICE_NAME" --no-pager 2>&1 | head -3 || true)
        warn "API Server: stopped"
        echo "  $error_msg"
    fi

    # Nginx status
    if systemctl is-active --quiet nginx; then
        success "Nginx: running"
    else
        warn "Nginx: stopped"
    fi

    # Health check
    if curl -sf http://127.0.0.1:3000/api/v1/health > /dev/null 2>&1; then
        success "Health check: OK"
        curl -s http://127.0.0.1:3000/api/v1/health | python3 -m json.tool 2>/dev/null || true
    else
        warn "Health check: unreachable"
    fi

    # Database
    if [ -f "$DATA_DIR/the-ide.db" ]; then
        DB_SIZE=$(du -h "$DATA_DIR/the-ide.db" | cut -f1)
        success "Database: $DATA_DIR/the-ide.db ($DB_SIZE)"
    else
        warn "Database: not found at $DATA_DIR/the-ide.db"
    fi

    echo ""
}

# ─── Main ────────────────────────────────────────────────────────────────

case "${1:-}" in
    --setup)
        setup
        ;;
    --update)
        update
        ;;
    --status)
        status
        ;;
    *)
        echo "Usage: $0 [--setup | --update | --status]"
        echo ""
        echo "  --setup   First-time server setup (requires root)"
        echo "  --update  Deploy or update the application"
        echo "  --status  Check deployment status"
        exit 1
        ;;
esac
