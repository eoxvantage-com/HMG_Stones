#!/usr/bin/env bash

# Codespace setup orchestrator.
# Called by postAttachCommand on every attach.
# Waits for .env to be valid and runs Taruvi + Codex setup.
# Dev server is started by the separate 'app' postAttachCommand key.

set -uo pipefail

MARKER=".codespace/.setup-complete"
ENV_FILE=".env"

# ── Prerequisites ──────────────────────────────────────────────────────────────
[ -f .mcp.json ]   || cp .mcp.example.json .mcp.json
[ -f "$ENV_FILE" ] || cp .env.example "$ENV_FILE"
mkdir -p .codex/projects .codespace

# ── Path B: pre-injected Codespace environment variables ──────────────────────
# When github-inject-secrets runs successfully the Build-a-thon platform injects
# TARUVI_SITE_URL / TARUVI_APP_SLUG / TARUVI_API_KEY as GitHub Codespace secrets
# (environment variables). Detect them and write into .env so the watcher and
# setup script pick them up without requiring manual input.
# Values are never printed — only a masked confirmation is shown.
_write_env_var() {
  local varname="$1" value="$2"
  if grep -q "^${varname}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${varname}=.*|${varname}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$varname" "$value" >> "$ENV_FILE"
  fi
}

# Fetch credentials from the Taruvi codespace_configs datatable using the
# $CODESPACE_NAME env var that GitHub injects into every Codespace automatically.
echo "  ℹ️   Fetching config for Codespace: ${CODESPACE_NAME:-<unset>}"

_response=$(curl -s -w "\n__HTTP_STATUS:%{http_code}" -X POST \
  "https://hackathonsite.taruvi.cloud/api/apps/hackathonapp/functions/get-codespace-config/execute/" \
  -H "Content-Type: application/json" \
  -d "{\"async\": false, \"params\": {\"codespace_name\": \"$CODESPACE_NAME\"}}" 2>&1)

_http_status=$(echo "$_response" | grep '__HTTP_STATUS:' | sed 's/.*__HTTP_STATUS://')
_body=$(echo "$_response" | sed '/__HTTP_STATUS:/d')

echo "  ℹ️   Config API status: ${_http_status:-failed}"
echo "  ℹ️   Config API body: $_body"

_PRE_SITE=$(echo "$_body" | jq -r '.data.config.TARUVI_SITE_URL // empty' 2>/dev/null)
_PRE_SLUG=$(echo "$_body" | jq -r '.data.config.TARUVI_APP_SLUG // empty' 2>/dev/null)
_PRE_KEY=$(echo  "$_body" | jq -r '.data.config.TARUVI_API_KEY  // empty' 2>/dev/null)
_PREINJECTED=false

if [ -n "${_PRE_SITE//[[:space:]]/}" ] \
  && [ -n "${_PRE_SLUG//[[:space:]]/}" ] \
  && [ -n "${_PRE_KEY//[[:space:]]/}" ]; then
  _PREINJECTED=true
  _write_env_var "TARUVI_SITE_URL" "${_PRE_SITE%/}"
  _write_env_var "TARUVI_APP_SLUG" "$_PRE_SLUG"
  _write_env_var "TARUVI_API_KEY"  "$_PRE_KEY"
  # Write AI provider key (OPENAI_API_KEY or ANTHROPIC_API_KEY) if present
  for _prov_var in OPENAI_API_KEY ANTHROPIC_API_KEY; do
    _prov_val=$(echo "$_body" | jq -r ".data.config.${_prov_var} // empty" 2>/dev/null)
    if [ -n "${_prov_val//[[:space:]]/}" ]; then
      _write_env_var "$_prov_var" "$_prov_val"
    fi
  done
  unset _prov_var _prov_val
  echo ""
  echo "  ✅  Found pre-configured Taruvi credentials."
fi
unset _PRE_SITE _PRE_SLUG _PRE_KEY

# ── Path A: manual paste — open guide and .env (skipped when pre-injected) ────
if [ "$_PREINJECTED" = "false" ]; then
  code .codespace/START_HERE.md "$ENV_FILE" 2>/dev/null || true
  echo ""
  echo "  ┌──────────────────────────────────────────────────────┐"
  echo "  │   👋  Welcome to your Taruvi Hackathon Codespace     │"
  echo "  │                                                       │"
  echo "  │   Paste your TARUVI values into .env and save.       │"
  echo "  │   Everything else happens automatically.              │"
  echo "  └──────────────────────────────────────────────────────┘"
  echo ""
fi
unset _PREINJECTED _write_env_var

# ── Env validation ─────────────────────────────────────────────────────────────
env_is_valid() {
  local site slug key
  site=$(grep -E "^TARUVI_SITE_URL=.+" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')
  slug=$(grep -E "^TARUVI_APP_SLUG=.+" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')
  key=$(grep  -E "^TARUVI_API_KEY=.+"  "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '[:space:]')
  [ -n "$site" ] && [ -n "$slug" ] && [ -n "$key" ]
}

# ── Skip setup on re-attach if already complete and env is still valid ─────────
if [ -f "$MARKER" ] && env_is_valid && [ -f ".codex/auth.json" ]; then
  echo "  ✅  Already set up."
  echo ""
else
  # Wait for participant to save a valid .env
  until env_is_valid; do
    sleep 2
  done

  echo "  ✅  Taruvi credentials detected. Running setup..."
  echo ""

  setup_ok=true
  bash scripts/start-codex-devcontainer.sh --non-interactive || setup_ok=false

  if [ "$setup_ok" = "false" ]; then
    echo ""
    echo "  ⚠️   Setup encountered an issue."
    echo "       Your app will still start."
    echo "       Use the '🔁 Retry Setup' button to try again."
    echo ""
  else
    touch "$MARKER"
    echo "  ✅  Setup complete."
    echo ""
  fi
fi
