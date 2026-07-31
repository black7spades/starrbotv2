#!/bin/sh
# Entrypoint: resolve secrets, then start the app.
#
# Generated secrets are PERSISTED to the data volume. They used to be minted
# fresh on every container start, which logged every user out on each restart
# and — worse — silently broke Twitch. Twitch keeps signing EventSub callbacks
# with the secret a subscription was created with, so a new secret means every
# incoming event fails signature verification until Twitch revokes the
# subscription. Nothing logs an obvious cause; go-live alerts just stop.
#
# Precedence: environment (your .env) > stored value > freshly generated.

set -e

DATA_DIR=/app/data
SECRETS_FILE="$DATA_DIR/.secrets"
SECRET_NAMES="JWT_ACCESS_SECRET JWT_REFRESH_SECRET COOKIE_SECRET TWITCH_EVENTSUB_SECRET"

mkdir -p "$DATA_DIR"
chown -R nodejs:nodejs "$DATA_DIR"

SNAPSHOT="$DATA_DIR/.env-snapshot.$$"
FINAL="$SECRETS_FILE.$$"

# Clear anything a previous run left behind. The trap below does not fire on the
# normal path because `exec` replaces this shell, so cleanup is also explicit
# before the exec — without both, one snapshot file would pile up per restart.
rm -f "$DATA_DIR"/.env-snapshot.* "$SECRETS_FILE".[0-9]*
trap 'rm -f "$SNAPSHOT" "$FINAL"' EXIT INT TERM

# Snapshot whatever the environment supplied, before the stored file is sourced
# — sourcing would otherwise clobber an explicit .env value with the old one.
: > "$SNAPSHOT"
for name in $SECRET_NAMES; do
    value=$(printenv "$name" || true)
    if [ -n "$value" ]; then
        printf '%s=%s\nexport %s\n' "$name" "$value" "$name" >> "$SNAPSHOT"
    fi
done

# Stored values fill in anything the environment did not provide...
if [ -f "$SECRETS_FILE" ]; then
    # shellcheck disable=SC1090
    . "$SECRETS_FILE"
fi

# ...then the environment is re-applied on top, so it always wins.
# shellcheck disable=SC1090
. "$SNAPSHOT"

: > "$FINAL"
for name in $SECRET_NAMES; do
    # printenv rather than eval: a secret is never re-interpreted by the shell.
    value=$(printenv "$name" || true)
    if [ -z "$value" ]; then
        value=$(openssl rand -hex 32)
        export "$name=$value"
        echo "Generated $name"
    fi
    printf '%s=%s\nexport %s\n' "$name" "$value" "$name" >> "$FINAL"
done

# Rewritten from scratch each run and swapped in atomically, so the file never
# accumulates duplicates and a crash cannot leave it half-written.
chmod 600 "$FINAL"
chown nodejs:nodejs "$FINAL"
mv "$FINAL" "$SECRETS_FILE"

# `exec` replaces this shell, so the EXIT trap will not run — clean up first.
rm -f "$SNAPSHOT"

# Drop privileges and execute the main command
exec su-exec nodejs "$@"
