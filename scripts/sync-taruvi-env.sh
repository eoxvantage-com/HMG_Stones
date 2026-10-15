#!/usr/bin/env bash

set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
fi

load_env_file() {
  local env_file="$1"

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"

    case "$line" in
      '' | [[:space:]]*'#'*)
        continue
        ;;
    esac

    case "$line" in
      *=*)
        ;;
      *)
        continue
        ;;
    esac

    local key="${line%%=*}"
    local value="${line#*=}"

    key="$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    value="$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

    if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      export "$key=$value"
    fi
  done < "$env_file"
}

persist_env_var() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local escaped_value

  escaped_value="$(printf '%s' "$value" | sed 's/[&|\\]/\\&/g')"

  if grep -q "^${key}=" "$env_file"; then
    sed -i.bak "s|^${key}=.*|${key}=${escaped_value}|" "$env_file"
    rm -f "${env_file}.bak"
  else
    printf '%s=%s\n' "$key" "$value" >> "$env_file"
  fi
}

trim_value() {
  echo "$1" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

load_env_file "$ENV_FILE"

# Accept both TARUVI_-prefixed names and the lowercase names injected by the
# onboarding app as GitHub Codespace secrets (site_url / app_slug / api_key).
SITE_URL="$(trim_value "${TARUVI_SITE_URL:-${site_url:-}}")"
APP_SLUG="$(trim_value "${TARUVI_APP_SLUG:-${app_slug:-}}")"
API_KEY="$(trim_value "${TARUVI_API_KEY:-${api_key:-}}")"

SITE_URL="${SITE_URL%/}"

if [ -n "$SITE_URL" ]; then
  persist_env_var "$ENV_FILE" "TARUVI_SITE_URL" "$SITE_URL"
fi

if [ -n "$APP_SLUG" ]; then
  persist_env_var "$ENV_FILE" "TARUVI_APP_SLUG" "$APP_SLUG"
fi

if [ -n "$API_KEY" ]; then
  persist_env_var "$ENV_FILE" "TARUVI_API_KEY" "$API_KEY"
fi

echo "TARUVI_SITE_URL=$SITE_URL"
echo "TARUVI_APP_SLUG=$APP_SLUG"
echo "TARUVI_API_KEY=$API_KEY"
