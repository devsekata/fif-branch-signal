#!/bin/sh
set -e

# Load environment variables from /app/.env if present
if [ -f /app/.env ]; then
  echo "[entrypoint] Loading environment variables from /app/.env..."
  while IFS= read -r line || [ -n "$line" ]; do
    clean_line=$(echo "$line" | tr -d '\r')
    case "$clean_line" in
      \#*|"") continue ;;
    esac
    key="${clean_line%%=*}"
    val="${clean_line#*=}"
    key=$(echo "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    val=$(echo "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    val=$(echo "$val" | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")
    export "$key=$val"
  done < /app/.env
elif [ -f /app/.env.local ]; then
  echo "[entrypoint] Loading environment variables from /app/.env.local..."
  while IFS= read -r line || [ -n "$line" ]; do
    clean_line=$(echo "$line" | tr -d '\r')
    case "$clean_line" in
      \#*|"") continue ;;
    esac
    key="${clean_line%%=*}"
    val="${clean_line#*=}"
    key=$(echo "$key" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    val=$(echo "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
    val=$(echo "$val" | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")
    export "$key=$val"
  done < /app/.env.local
fi

# Fallback API URL if not specified
API_URL="${NEXT_PUBLIC_API_BASE_URL:-https://api-fif.kepiai.co}"
# Strip trailing slashes
API_URL=$(echo "$API_URL" | sed 's:/*$::')

echo "[entrypoint] Applying NEXT_PUBLIC_API_BASE_URL = $API_URL"

# Restore pristine build files from template
if [ -d /app/.next-template ]; then
  echo "[entrypoint] Restoring pristine build files from .next-template..."
  rm -rf /app/.next
  cp -r /app/.next-template /app/.next
fi

# Escape replacement string for sed (&, |, and \)
ESCAPED_URL=$(echo "$API_URL" | sed -e 's/[&|\\]/\\&/g')

# Replace placeholder with actual API URL
echo "[entrypoint] Replacing build placeholder with runtime API URL..."
find /app/.next -type f \( -name "*.js" -o -name "*.html" -o -name "*.json" \) -exec sed -i "s|__NEXT_PUBLIC_API_BASE_URL__|${ESCAPED_URL}|g" {} +

echo "[entrypoint] Starting Next.js standalone server on port ${PORT:-3000}..."
exec "$@"
