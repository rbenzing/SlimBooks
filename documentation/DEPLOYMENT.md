# Slimbooks Deployment Guide

This guide will help you securely deploy Slimbooks on your Raspberry Pi using Docker.

## 🔒 Security Overview

Your Slimbooks application has been hardened with the following security measures:

### ✅ Implemented Security Features

- **🔐 Secure Authentication**: JWT tokens with configurable expiration
- **🛡️ Rate Limiting**: Protection against brute force attacks
- **🔒 Security Headers**: Helmet.js for comprehensive security headers
- **🚫 Input Validation**: Server-side validation for all inputs
- **🔍 CORS Protection**: Configurable cross-origin resource sharing
- **📝 Request Logging**: Comprehensive request/response logging
- **🚨 Error Handling**: Secure error responses without information leakage
- **📁 File Upload Security**: Restricted file types and size limits
- **🔐 Environment Variables**: Secure configuration management

### 🚨 Security Improvements Made

1. **Removed hardcoded JWT secrets** - Now uses environment variables
2. **Restricted CORS policy** - No longer allows all origins
3. **Added rate limiting** - Prevents brute force attacks
4. **Secured database endpoints** - Removed dangerous SQL execution endpoints
5. **Added input validation** - Prevents SQL injection and data corruption
6. **Implemented security headers** - Protection against common web attacks
7. **Disabled debug endpoints** - Only available in development mode
8. **Reduced file upload limits** - From 100MB to 10MB for security

## 🚀 Quick Deployment

### Prerequisites

- Raspberry Pi with Raspberry Pi OS
- Internet connection
- SSH access to your Pi

### Step 1: Prepare Your Raspberry Pi

```bash
# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/rbenzing/slimbooks/main/scripts/setup-raspberry-pi.sh | bash

# Reboot to ensure all changes take effect
sudo reboot
```

### Step 2: Clone and Configure

```bash
# Clone your repository
cd /opt/slimbooks
git clone https://github.com/rbenzing/slimbooks.git .

# Generate secure secrets
./scripts/generate-secrets.sh

# Review and customize your .env file
nano .env
```

### Step 3: Deploy

```bash
# Run the deployment script
./scripts/deploy.sh
```

Your application will be available at `http://your-pi-ip:8080`

## 🔧 Manual Deployment Steps

If you prefer to deploy manually or need to customize the process:

### 1. System Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. Application Setup

```bash
# Create application directory
sudo mkdir -p /opt/slimbooks
sudo chown $USER:$USER /opt/slimbooks
cd /opt/slimbooks

# Clone repository
git clone https://github.com/rbenzing/slimbooks.git .

# Create secure environment configuration
cp .env.example .env
```

### 3. Security Configuration

**CRITICAL**: Give your `.env` file real secrets before exposing this to a
network. Left blank, the application signs tokens with a default whose value is
published in this repository, which means anyone can mint a valid session.

```bash
# Creates .env from .env.example and fills in all three secrets
./scripts/generate-secrets.sh
```

This replaces the `.env` you copied above, so run it either instead of the
`cp` or before you edit anything else. It backs up any existing `.env` first.

To do it by hand instead, generate each secret and paste it in:

```bash
openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | cut -c1-64
```

Set `JWT_SECRET`, `JWT_REFRESH_SECRET` and `SESSION_SECRET` from three separate
runs. `tr -dc 'A-Za-z0-9'` is not optional — `openssl rand -base64` wraps its
output, and a secret containing that line break spans two lines in `.env`,
which truncates the value and breaks any script that sources the file.

### 4. Build and Deploy

```bash
# Install dependencies and build
npm ci --only=production
npm run build

# Build Docker image
docker build -t slimbooks:latest .

# Start the application
docker-compose up -d
```

## 🔒 Security Configuration

### Environment Variables

Key security-related environment variables in your `.env` file:

```env
# Security Secrets (MUST be changed in production)
JWT_SECRET=your-64-character-secret-here
JWT_REFRESH_SECRET=your-64-character-refresh-secret-here
SESSION_SECRET=your-64-character-session-secret-here

# CORS Configuration
CORS_ORIGIN=http://your-domain.com:8080

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000          # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100          # 100 requests per window
LOGIN_RATE_LIMIT_MAX_ATTEMPTS=5      # 5 login attempts per window

# Security Features
ENABLE_DEBUG_ENDPOINTS=false         # Never enable in production
ENABLE_SAMPLE_DATA=false            # Never enable in production
BCRYPT_ROUNDS=12                    # Password hashing strength
```

### Network Security

The Docker configuration includes:

- **Port binding to localhost only**: `127.0.0.1:8080:3002`
- **Read-only filesystem**: Container runs with read-only root filesystem
- **Non-root user**: Application runs as user ID 1001
- **Dropped capabilities**: All unnecessary Linux capabilities removed
- **Resource limits**: Memory and CPU limits to prevent resource exhaustion

### Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 8080/tcp    # Slimbooks application
```

## 📊 Monitoring and Maintenance

### Health Checks

The application includes built-in health checks:

```bash
# Check application health
curl http://localhost:8080/api/health

# View application logs
docker-compose logs -f

# Check container status
docker-compose ps
```

### Backup Strategy

Automated daily backups are configured:

```bash
# Manual backup
/usr/local/bin/slimbooks-backup

# View backup files
ls -la /opt/slimbooks-backups/
```

### Log Management

Logs are automatically rotated:

- **Application logs**: `/opt/slimbooks/logs/`
- **Docker logs**: Managed by Docker with size limits
- **System logs**: Standard syslog rotation

## 🔧 Troubleshooting

### Common Issues

1. **Application won't start**
   ```bash
   # Check logs
   docker-compose logs
   
   # Verify environment configuration
   docker-compose config
   ```

2. **Database connection issues**
   ```bash
   # Check data directory permissions
   ls -la data/
   
   # Verify SQLite database
   sqlite3 data/slimbooks.db ".tables"
   ```

3. **Port conflicts**
   ```bash
   # Check what's using port 8080
   sudo netstat -tulpn | grep 8080
   
   # Change port in docker-compose.yml if needed
   ```

### Security Verification

```bash
# Verify security headers
curl -I http://localhost:8080/

# Test rate limiting
for i in {1..10}; do curl http://localhost:8080/api/health; done

# Check for exposed debug endpoints (should return 404)
curl http://localhost:8080/api/debug/data
```

## 🚨 Security Checklist

Before going live, ensure:

- [ ] JWT secrets are changed from defaults
- [ ] CORS_ORIGIN is set to your actual domain
- [ ] Debug endpoints are disabled
- [ ] Sample data is disabled
- [ ] Firewall is configured
- [ ] SSL/TLS is configured (if exposing to internet)
- [ ] Regular backups are working
- [ ] Log monitoring is in place

## 📞 Support

If you encounter issues:

1. Check the logs: `docker-compose logs`
2. Verify your configuration: `docker-compose config`
3. Review this deployment guide
4. Check the main README.md for application-specific help

## 🔄 Updates

To update your deployment:

```bash
# Pull latest changes
git pull

# Rebuild and redeploy
./scripts/deploy.sh
```

---

**⚠️ Security Notice**: This application contains sensitive financial data. Always use HTTPS in production, keep your system updated, and follow security best practices.
