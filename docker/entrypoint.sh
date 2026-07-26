#!/bin/sh
# Entrypoint script - generates secrets if not provided, then starts the app

set -e

# Generate secrets if not provided
if [ -z "$JWT_SECRET" ]; then
    export JWT_SECRET=$(openssl rand -hex 32)
    echo "Generated JWT_SECRET"
fi

if [ -z "$JWT_REFRESH_SECRET" ]; then
    export JWT_REFRESH_SECRET=$(openssl rand -hex 32)
    echo "Generated JWT_REFRESH_SECRET"
fi

if [ -z "$COOKIE_SECRET" ]; then
    export COOKIE_SECRET=$(openssl rand -hex 32)
    echo "Generated COOKIE_SECRET"
fi

# Execute the main command
exec "$@"