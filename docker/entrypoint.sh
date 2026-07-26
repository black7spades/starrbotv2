#!/bin/sh
# Entrypoint script - generates secrets if not provided, then starts the app

set -e

# Fix data directory ownership for the nodejs user
chown -R nodejs:nodejs /app/data

# Generate secrets if not provided
if [ -z "$JWT_ACCESS_SECRET" ]; then
    export JWT_ACCESS_SECRET=$(openssl rand -hex 32)
    echo "Generated JWT_ACCESS_SECRET"
fi

if [ -z "$JWT_REFRESH_SECRET" ]; then
    export JWT_REFRESH_SECRET=$(openssl rand -hex 32)
    echo "Generated JWT_REFRESH_SECRET"
fi

if [ -z "$COOKIE_SECRET" ]; then
    export COOKIE_SECRET=$(openssl rand -hex 32)
    echo "Generated COOKIE_SECRET"
fi

# Drop privileges and execute the main command
exec su-exec nodejs "$@"