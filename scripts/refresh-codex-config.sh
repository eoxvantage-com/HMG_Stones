#!/usr/bin/env bash

set -euo pipefail

cd "${WORKSPACE_FOLDER:-$PWD}"

if [ ! -f .env ]; then
  cp .env.example .env
fi

eval "$(bash scripts/sync-taruvi-env.sh .env)"

if [ -z "${TARUVI_SITE_URL//[[:space:]]/}" ] || [ -z "${TARUVI_APP_SLUG//[[:space:]]/}" ] || [ -z "${TARUVI_API_KEY//[[:space:]]/}" ]; then
  echo "Missing required Taruvi values in .env. Please fill TARUVI_SITE_URL, TARUVI_APP_SLUG, and TARUVI_API_KEY." >&2
  exit 1
fi

export CODEX_HOME="${CODEX_HOME:-$PWD/.codex}"
mkdir -p "$CODEX_HOME/projects"

cat > "$CODEX_HOME/config.toml" <<EOF
model = "gpt-5.5"
approval_policy = "never"
sandbox_mode = "danger-full-access"

[mcp_servers.taruvi]
url = "${TARUVI_SITE_URL}/mcp/"

[mcp_servers.taruvi.http_headers]
Accept = "application/json, text/event-stream"
Authorization = "Api-Key ${TARUVI_API_KEY}"
X-App-Slug = "${TARUVI_APP_SLUG}"

[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
EOF

echo "Codex config refreshed at $CODEX_HOME/config.toml"
