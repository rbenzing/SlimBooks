#!/bin/sh

set -e

# Colors for output (portable)
RED=$(printf '\033[0;31m')
GREEN=$(printf '\033[0;32m')
YELLOW=$(printf '\033[1;33m')
BLUE=$(printf '\033[0;34m')
NC=$(printf '\033[0m') # No Color

printf "%b🥧 Setting up Raspberry Pi for Slimbooks...%b\n" "$BLUE" "$NC"

print_status() {
    printf "%b✅ %s%b\n" "$GREEN" "$1" "$NC"
}

print_warning() {
    printf "%b⚠️  %s%b\n" "$YELLOW" "$1" "$NC"
}

print_error() {
    printf "%b❌ %s%b\n" "$RED" "$1" "$NC"
}

# Check if running on Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
    print_warning "This doesn't appear to be a Raspberry Pi, but continuing anyway..."
fi

printf "%b📦 Updating system packages...%b\n" "$BLUE" "$NC"
sudo apt update && sudo apt upgrade -y
print_status "System packages updated"

printf "%b📦 Installing required packages...%b\n" "$BLUE" "$NC"
sudo apt install -y \
    curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release
print_status "Required packages installed"

printf "%b🐳 Installing Docker...%b\n" "$BLUE" "$NC"
if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker "$USER"
    print_status "Docker installed successfully"
else
    print_status "Docker is already installed"
fi

printf "%b🐳 Installing Docker Compose...%b\n" "$BLUE" "$NC"
if ! command -v docker-compose >/dev/null 2>&1; then
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep 'tag_name' | cut -d\" -f4)
    sudo curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_status "Docker Compose installed successfully"
else
    print_status "Docker Compose is already installed"
fi

printf "%b📦 Installing Node.js...%b\n" "$BLUE" "$NC"
if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
    print_status "Node.js installed successfully"
else
    print_status "Node.js is already installed"
fi

APP_DIR="/opt/slimbooks"
printf "%b📁 Creating application directory...%b\n" "$BLUE" "$NC"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"
print_status "Application directory created at $APP_DIR"

# Firewall setup if ufw is present
if command -v ufw >/dev/null 2>&1; then
    printf "%b🔥 Configuring firewall...%b\n" "$BLUE" "$NC"
    sudo ufw allow 22/tcp
    sudo ufw allow 8080/tcp
    print_status "Firewall configured"
fi

printf "%b⚙️  Creating systemd service...%b\n" "$BLUE" "$NC"
sudo tee /etc/systemd/system/slimbooks.service > /dev/null <<EOF
[Unit]
Description=Slimbooks Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0
User=$USER

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
print_status "Systemd service created"

printf "%b📝 Setting up log rotation...%b\n" "$BLUE" "$NC"
sudo tee /etc/logrotate.d/slimbooks > /dev/null <<EOF
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    copytruncate
}
EOF
print_status "Log rotation configured"

printf "%b💾 Creating backup script...%b\n" "$BLUE" "$NC"
sudo tee /usr/local/bin/slimbooks-backup > /dev/null <<'EOF'
#!/bin/sh
BACKUP_DIR="/opt/slimbooks-backups"
APP_DIR="/opt/slimbooks"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# The database lives under DATA_DIR (default $APP_DIR/data). `server/data` was
# where broken path resolution used to put it before 2.0.0; backing that up now
# would silently archive nothing, which is worse than failing.
DB_FILE="${DATA_DIR:-$APP_DIR/data}/slimbooks.db"

if [ -f "$DB_FILE" ]; then
    # sqlite3 .backup is safe against a running server; cp of a WAL database is
    # not. Fall back to cp only if sqlite3 is unavailable.
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/slimbooks_$DATE.db'"
    else
        cp "$DB_FILE" "$BACKUP_DIR/slimbooks_$DATE.db"
    fi
    echo "Database backed up to $BACKUP_DIR/slimbooks_$DATE.db"
else
    echo "WARNING: no database found at $DB_FILE - nothing backed up" >&2
fi

if [ -d "$APP_DIR/uploads" ]; then
    tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C "$APP_DIR" uploads
    echo "Uploads backed up to $BACKUP_DIR/uploads_$DATE.tar.gz"
fi

find "$BACKUP_DIR" -name "*.db" -mtime +7 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF
sudo chmod +x /usr/local/bin/slimbooks-backup
print_status "Backup script created"

printf "%b⏰ Setting up daily backup...%b\n" "$BLUE" "$NC"
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/slimbooks-backup") | crontab -
print_status "Daily backup scheduled at 2 AM"

printf "\n%b🎉 Raspberry Pi setup completed successfully!%b\n" "$GREEN" "$NC"
printf "%b📊 Setup Summary:%b\n" "$BLUE" "$NC"
printf "  🐳 Docker and Docker Compose installed\n"
printf "  📦 Node.js installed\n"
printf "  📁 Application directory: %s\n" "$APP_DIR"
printf "  🔥 Firewall configured (if ufw available)\n"
printf "  ⚙️  Systemd service created\n"
printf "  📝 Log rotation configured\n"
printf "  💾 Daily backup scheduled\n"

printf "\n%b🔧 Next Steps:%b\n" "$BLUE" "$NC"
printf "  1. Reboot the system: sudo reboot\n"
printf "  2. Clone your Slimbooks repository to %s\n" "$APP_DIR"
printf "  3. Run the deployment script: ./scripts/deploy.sh\n"
printf "  4. Enable auto-start: sudo systemctl enable slimbooks\n"

printf "\n%b⚠️  Important Notes:%b\n" "$YELLOW" "$NC"
printf "  • You may need to log out and back in for Docker group membership to take effect\n"
printf "  • Make sure to configure your .env file with secure secrets\n"
printf "  • The application will be accessible on port 8080\n"
printf "  • Backups are stored in /opt/slimbooks-backups\n"

printf "\n%b✅ Your Raspberry Pi is now ready for Slimbooks!%b\n" "$GREEN" "$NC"
