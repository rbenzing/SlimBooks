#!/bin/sh

# Slimbooks Production Deployment Script for Raspberry Pi (POSIX compliant)
# This script builds and deploys the application using Docker

set -e  # Exit on any error

# Colors for output (portable ANSI sequences)
RED="$(printf '\033[0;31m')"
GREEN="$(printf '\033[0;32m')"
YELLOW="$(printf '\033[1;33m')"
BLUE="$(printf '\033[0;34m')"
NC="$(printf '\033[0m')" # No Color

# Configuration
APP_NAME="slimbooks"
CONTAINER_NAME="slimbooks-app"
IMAGE_NAME="slimbooks:latest"
PORT=8080
DATA_DIR="./data"
UPLOADS_DIR="./uploads"
LOGS_DIR="./logs"

printf "%s🚀 Starting Slimbooks deployment...%s\n" "$BLUE" "$NC"

# Function to print colored output
print_status() {
    printf "%s✅ %s%s\n" "$GREEN" "$1" "$NC"
}

print_warning() {
    printf "%s⚠️  %s%s\n" "$YELLOW" "$1" "$NC"
}

print_error() {
    printf "%s❌ %s%s\n" "$RED" "$1" "$NC"
}

# Check if Docker is installed and running
if ! command -v docker >/dev/null 2>&1; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

print_status "Docker is available and running"

# Check if docker-compose is available
if ! command -v docker-compose >/dev/null 2>&1; then
    print_warning "docker-compose not found, using 'docker compose' instead"
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Create necessary directories
printf "%s📁 Creating necessary directories...%s\n" "$BLUE" "$NC"
mkdir -p "$DATA_DIR" "$UPLOADS_DIR" "$LOGS_DIR"
print_status "Directories created"

# Check for environment file.
#
# `.env.example` is the only template; `.env` is the only file the application
# reads. This used to copy from a second `.env.production` template that had to
# be kept in step with the first by hand.
if [ ! -f ".env" ]; then
    print_warning "No .env file found. Creating from .env.example template..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_warning "Please edit .env and set the JWT secrets before continuing!"
        printf "%sGenerate each with: node -e \"console.log(require('crypto').randomBytes(64).toString('base64'))\"%s\n" "$YELLOW" "$NC"
        printf "%sPress ENTER to continue after updating .env file...%s" "$YELLOW" "$NC"
        read dummy
    else
        print_error ".env.example template not found. Please create .env file manually."
        exit 1
    fi
fi

# Validate critical environment variables
printf "%s🔍 Validating environment configuration...%s\n" "$BLUE" "$NC"
. .env

# A secret is acceptable only if it is present and long. The previous check
# looked for the strings "CHANGE_THIS" or "default", which the shipped
# placeholder ("your-secret-key-here-replace-with-random-64-chars") contained
# neither of — so it passed validation and deployed with a published secret.
check_secret() {
    name="$1"
    value="$2"

    if [ -z "$value" ]; then
        print_error "$name is empty in .env - generate one before deploying!"
        exit 1
    fi

    case "$value" in
        *your-*|*CHANGE_THIS*|*default*|*replace-with*|*change-in-production*)
            print_error "$name is still set to a placeholder in .env!"
            exit 1
            ;;
    esac

    if [ "${#value}" -lt 32 ]; then
        print_error "$name is shorter than 32 characters - too weak for signing tokens."
        exit 1
    fi
}

check_secret "JWT_SECRET" "$JWT_SECRET"
check_secret "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"
check_secret "SESSION_SECRET" "$SESSION_SECRET"

print_status "Environment configuration validated"

# Stop existing container if running
printf "%s🛑 Stopping existing containers...%s\n" "$BLUE" "$NC"
$DOCKER_COMPOSE down --remove-orphans || true
print_status "Existing containers stopped"

# Build the application
printf "%s🔨 Building application...%s\n" "$BLUE" "$NC"
npm ci --only=production
npm run build
print_status "Application built successfully"

# Build Docker image
printf "%s🐳 Building Docker image...%s\n" "$BLUE" "$NC"
docker build -t "$IMAGE_NAME" .
print_status "Docker image built successfully"

# Start the application
printf "%s🚀 Starting application...%s\n" "$BLUE" "$NC"
$DOCKER_COMPOSE up -d
print_status "Application started successfully"

# Wait for application to be ready
printf "%s⏳ Waiting for application to be ready...%s\n" "$BLUE" "$NC"
sleep 10

# Health check loop (POSIX compliant)
printf "%s🏥 Performing health check...%s\n" "$BLUE" "$NC"
i=1
while [ "$i" -le 30 ]; do
    if curl -f "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
        print_status "Application is healthy and ready!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        print_error "Health check failed after 30 attempts"
        printf "%sChecking logs...%s\n" "$YELLOW" "$NC"
        $DOCKER_COMPOSE logs --tail=20
        exit 1
    fi
    printf "."
    sleep 2
    i=$((i+1))
done

# Deployment info
printf "\n%s🎉 Deployment completed successfully!%s\n" "$GREEN" "$NC"
printf "%s📊 Deployment Information:%s\n" "$BLUE" "$NC"
printf "  🌐 Application URL: http://localhost:%s\n" "$PORT"
printf "  🐳 Container Name: %s\n" "$CONTAINER_NAME"
printf "  📁 Data Directory: %s\n" "$DATA_DIR"
printf "  📤 Uploads Directory: %s\n" "$UPLOADS_DIR"
printf "  📝 Logs Directory: %s\n" "$LOGS_DIR"

printf "\n%s🔧 Useful Commands:%s\n" "$BLUE" "$NC"
printf "  View logs: %s logs -f\n" "$DOCKER_COMPOSE"
printf "  Stop app: %s down\n" "$DOCKER_COMPOSE"
printf "  Restart: %s restart\n" "$DOCKER_COMPOSE"
printf "  Update: ./scripts/deploy.sh\n"

printf "\n%s✅ Slimbooks is now running on your Raspberry Pi!%s\n" "$GREEN" "$NC"
