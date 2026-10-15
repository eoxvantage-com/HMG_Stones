#!/usr/bin/env bash

# Taruvi + Codex setup script.
# Configures MCP, fetches the AI provider key, and writes Codex auth.
# Does NOT start the dev server — that is the orchestrator's job.
#
# Usage:
#   bash scripts/start-codex-devcontainer.sh                 # interactive
#   bash scripts/start-codex-devcontainer.sh --non-interactive  # automatic (called by codespace-first-run.sh)

set -euo pipefail

NON_INTERACTIVE=false
for arg in "$@"; do
  case "$arg" in
    --non-interactive) NON_INTERACTIVE=true ;;
  esac
done

cd "${WORKSPACE_FOLDER:-$PWD}"

export XDG_CONFIG_HOME=/tmp

[ -f .env ] || cp .env.example .env

# ── Load and validate Taruvi credentials ──────────────────────────────────────

if [ "$NON_INTERACTIVE" = "true" ]; then
  eval "$(bash scripts/sync-taruvi-env.sh .env)"
  export TARUVI_SITE_URL TARUVI_APP_SLUG TARUVI_API_KEY

  if [ -z "${TARUVI_SITE_URL//[[:space:]]/}" ] \
    || [ -z "${TARUVI_APP_SLUG//[[:space:]]/}" ] \
    || [ -z "${TARUVI_API_KEY//[[:space:]]/}" ]; then
    echo "  ❌  Taruvi credentials missing in .env." >&2
    echo "      Fill TARUVI_SITE_URL, TARUVI_APP_SLUG, and TARUVI_API_KEY, then retry." >&2
    exit 1
  fi
else
  # Interactive fallback: open .env and wait for the participant
  open_env_once() {
    [ "${ENV_FILE_OPENED:-0}" = "1" ] && return
    if command -v code >/dev/null 2>&1; then
      code .env >/dev/null 2>&1 || true
      ENV_FILE_OPENED=1
    fi
  }

  while true; do
    eval "$(bash scripts/sync-taruvi-env.sh .env)"
    export TARUVI_SITE_URL TARUVI_APP_SLUG TARUVI_API_KEY
    if [ -n "${TARUVI_SITE_URL//[[:space:]]/}" ] \
      && [ -n "${TARUVI_APP_SLUG//[[:space:]]/}" ] \
      && [ -n "${TARUVI_API_KEY//[[:space:]]/}" ]; then
      break
    fi
    open_env_once
    echo "Open .env, fill TARUVI_SITE_URL, TARUVI_APP_SLUG, and TARUVI_API_KEY, then save and press Enter."
    read -r
  done
fi

echo "  ✅  Taruvi credentials loaded."

# ── Codex config ──────────────────────────────────────────────────────────────
export CODEX_HOME="${CODEX_HOME:-$PWD/.codex}"
mkdir -p "$CODEX_HOME/projects"
bash scripts/refresh-codex-config.sh

# ── Update .mcp.json ──────────────────────────────────────────────────────────
[ -f .mcp.json ] || cp .mcp.example.json .mcp.json

python3 -c "
import json, os
with open('.mcp.json') as f:
    mcp = json.load(f)
if 'taruvi' in mcp.get('mcpServers', {}):
    mcp['mcpServers']['taruvi']['url'] = os.environ['TARUVI_SITE_URL'] + '/mcp/'
    mcp['mcpServers']['taruvi']['headers'] = {
        'Authorization': 'Api-Key ' + os.environ['TARUVI_API_KEY'],
        'X-App-Slug': os.environ['TARUVI_APP_SLUG']
    }
with open('.mcp.json', 'w') as f:
    json.dump(mcp, f, indent=2)
"
echo "  ✅  MCP server configured."

# ── Fetch AI provider key ─────────────────────────────────────────────────────
fetch_secret() {
  local name="$1"
  curl -sf \
    -H "Authorization: Api-Key ${TARUVI_API_KEY}" \
    "${TARUVI_SITE_URL}/api/secrets/${name}/?app=${TARUVI_APP_SLUG}" \
    2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); inner=d.get('data',d); v=inner.get('value',{}).get('text',''); print(v) if v else sys.exit(1)" \
    2>/dev/null
}

PROVIDER_KEY=""
PROVIDER_VAR=""

# Read from .env first (pre-populated by codespace-first-run.sh)
for _var in OPENAI_API_KEY ANTHROPIC_API_KEY; do
  _val=$(grep -E "^${_var}=.+" .env 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')
  if [ -n "$_val" ]; then
    PROVIDER_KEY="$_val"
    PROVIDER_VAR="$_var"
    break
  fi
done
unset _var _val

# Fall back to fetching from participant's app secrets
if [ -z "$PROVIDER_KEY" ]; then
  if PROVIDER_KEY=$(fetch_secret OPENAI_API_KEY) && [ -n "$PROVIDER_KEY" ]; then
    PROVIDER_VAR="OPENAI_API_KEY"
  elif PROVIDER_KEY=$(fetch_secret ANTHROPIC_API_KEY) && [ -n "$PROVIDER_KEY" ]; then
    PROVIDER_VAR="ANTHROPIC_API_KEY"
  else
    echo "" >&2
    echo "  ❌  Could not fetch the AI provider key from Taruvi secrets." >&2
    echo "      Make sure onboarding step 6 (Register App) completed successfully." >&2
    echo "      If the problem persists, contact the hackathon admin." >&2
    exit 1
  fi
fi

# Detect if the stored value is a JSON object (ChatGPT OAuth tokens) or a plain API key
PROVIDER_IS_JSON=false
if echo "$PROVIDER_KEY" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  PROVIDER_IS_JSON=true
fi

mkdir -p "${XDG_CONFIG_HOME}/openai" "$HOME/.config/openai" "$CODEX_HOME"

if [ "$PROVIDER_IS_JSON" = "true" ]; then
  # OAuth auth — the value IS the auth.json content, write it directly
  printf '%s\n' "$PROVIDER_KEY" \
    | tee "${XDG_CONFIG_HOME}/openai/auth.json" \
          "$HOME/.config/openai/auth.json" \
          "$CODEX_HOME/auth.json" > /dev/null
else
  # Plain API key — wrap for auth.json and export as env var
  printf '{"apiKey":"%s"}\n' "$PROVIDER_KEY" \
    | tee "${XDG_CONFIG_HOME}/openai/auth.json" \
          "$HOME/.config/openai/auth.json" \
          "$CODEX_HOME/auth.json" > /dev/null
  if grep -q "^${PROVIDER_VAR}=" .env; then
    sed -i "s|^${PROVIDER_VAR}=.*|${PROVIDER_VAR}=${PROVIDER_KEY}|" .env
  else
    echo "${PROVIDER_VAR}=${PROVIDER_KEY}" >> .env
  fi
  export "${PROVIDER_VAR}=${PROVIDER_KEY}"
  if grep -q "^export ${PROVIDER_VAR}=" ~/.bashrc 2>/dev/null; then
    sed -i "s|^export ${PROVIDER_VAR}=.*|export ${PROVIDER_VAR}=${PROVIDER_KEY}|" ~/.bashrc
  else
    echo "export ${PROVIDER_VAR}=${PROVIDER_KEY}" >> ~/.bashrc
  fi
fi

echo "  ✅  AI provider key configured."
