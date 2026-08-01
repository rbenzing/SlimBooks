#!/bin/sh

# Generate secure secrets for Slimbooks production deployment
# This script creates cryptographically secure secrets for JWT tokens

set -e  # Exit on any error

# Colors for output (portable ANSI sequences)
RED=$(printf '\033[0;31m')
GREEN=$(printf '\033[0;32m')
YELLOW=$(printf '\033[1;33m')
BLUE=$(printf '\033[0;34m')
NC=$(printf '\033[0m') # No Color

printf "%b\n" "${BLUE}🔐 Generating secure secrets for Slimbooks...${NC}"

# Function to print colored output
print_status() {
    printf "%b✅ %s%b\n" "$GREEN" "$1" "$NC"
}

print_warning() {
    printf "%b⚠️  %s%b\n" "$YELLOW" "$1" "$NC"
}

print_error() {
    printf "%b❌ %s%b\n" "$RED" "$1" "$NC"
}

# Function to generate a secure random string
generate_secret() {
    length=${1:-64}
    # Keep only alphanumerics, which drops the base64 padding and symbols AND
    # the line wrap in one unambiguous step. `tr -d "=+/\n"` is not portable
    # here: whether `\n` means a newline or the letter n depends on the tr
    # implementation.
    #
    # The wrap is the part that matters. `openssl rand -base64` wraps its
    # output, so without removing it the secret spans two lines in .env — the
    # second line looks like a command to anything that sources the file, which
    # deploy.sh does, and the value reaching the application is truncated at
    # the wrap.
    openssl rand -base64 "$length" | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-"$length"
}

# Check if openssl is available
if ! command -v openssl >/dev/null 2>&1; then
    print_error "OpenSSL is required but not installed. Please install OpenSSL first."
    exit 1
fi

printf "%b\n" "${BLUE}🎲 Generating cryptographically secure secrets...${NC}"

JWT_SECRET=$(generate_secret 64)
JWT_REFRESH_SECRET=$(generate_secret 64)
SESSION_SECRET=$(generate_secret 64)

print_status "Secrets generated successfully"

# Create or update .env file
ENV_FILE=".env"
BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"

if [ -f "$ENV_FILE" ]; then
    print_warning "Existing .env file found. Creating backup..."
    cp "$ENV_FILE" "$BACKUP_FILE"
    print_status "Backup created: $BACKUP_FILE"
fi

printf "%b\n" "${BLUE}📝 Creating .env file from .env.example...${NC}"

# .env.example is the single source for which variables exist. This script used
# to emit its own hardcoded list, which made it a third copy to keep in step
# alongside .env.example and the since-removed .env.production — and it had
# already drifted, omitting nine variables the application reads.
if [ ! -f ".env.example" ]; then
    print_error ".env.example not found. Run this from the project root."
    exit 1
fi

cp .env.example "$ENV_FILE"

# Fill in the three secrets. The whole line is rewritten including the key name,
# so this cannot leave a bare secret sitting on a line with no variable — which
# is what the documented `sed 's/PLACEHOLDER.*/$SECRET/'` did when it matched.
set_env_value() {
    key="$1"
    value="$2"

    if grep -q "^${key}=" "$ENV_FILE"; then
        awk -v k="$key" -v v="$value" \
            'index($0, k "=") == 1 { print k "=" v; next } { print }' \
            "$ENV_FILE" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "$ENV_FILE"
    else
        printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    fi
}

set_env_value "JWT_SECRET" "$JWT_SECRET"
set_env_value "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"
set_env_value "SESSION_SECRET" "$SESSION_SECRET"

print_status ".env file created with secure secrets"

chmod 600 "$ENV_FILE"
print_status "File permissions set to 600 (owner read/write only)"

# Display important information (show first 16 chars of secrets)
printf "\n%b🎉 Secure secrets generated successfully!%b\n" "$GREEN" "$NC"
printf "%b📊 Configuration Summary:%b\n" "$BLUE" "$NC"
printf "  🔐 JWT Secret: %.16s... (64 characters)\n" "$JWT_SECRET"
printf "  🔐 JWT Refresh Secret: %.16s... (64 characters)\n" "$JWT_REFRESH_SECRET"
printf "  🔐 Session Secret: %.16s... (64 characters)\n" "$SESSION_SECRET"

printf "\n%b📁 Files Created:%b\n" "$BLUE" "$NC"
printf "  ✅ %s (secure environment configuration)\n" "$ENV_FILE"
if [ -f "$BACKUP_FILE" ]; then
    printf "  💾 %s (backup of previous configuration)\n" "$BACKUP_FILE"
fi

printf "\n%b⚠️  Important Security Notes:%b\n" "$YELLOW" "$NC"
printf "  • Keep your .env file secure and never commit it to version control\n"
printf "  • Update CORS_ORIGIN to match your actual domain in production\n"
printf "  • Configure email and OAuth settings if you plan to use those features\n"
printf "  • The .env file has been set to read/write for owner only (600 permissions)\n"

printf "\n%b🔧 Next Steps:%b\n" "$BLUE" "$NC"
printf "  1. Review and customize the .env file as needed\n"
printf "  2. Update CORS_ORIGIN if deploying to a different domain\n"
printf "  3. Configure optional services (email, OAuth, Stripe) if needed\n"
printf "  4. Run the deployment script: ./scripts/deploy.sh\n"

printf "\n%b✅ Your Slimbooks application is now configured with secure secrets!%b\n" "$GREEN" "$NC"
