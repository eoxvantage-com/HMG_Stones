#!/usr/bin/env bash

# Pre-writes Codex auth.json during postStartCommand so it exists before VS Code
# loads extensions on attach. Silently exits if config is not yet available.

set -uo pipefail

[ -z "${CODESPACE_NAME:-}" ] && exit 0

_resp=$(curl -sf -X POST \
  "https://hackathonsite.taruvi.cloud/api/apps/hackathonapp/functions/get-codespace-config/execute/" \
  -H "Content-Type: application/json" \
  -d "{\"async\":false,\"params\":{\"codespace_name\":\"$CODESPACE_NAME\"}}" \
  2>/dev/null) || exit 0

# Extract the provider key value — first of OPENAI_API_KEY or ANTHROPIC_API_KEY
PROVIDER_KEY=""
for _var in OPENAI_API_KEY ANTHROPIC_API_KEY; do
  _val=$(printf '%s' "$_resp" | jq -r ".data.config.${_var} // empty" 2>/dev/null)
  if [ -n "${_val//[[:space:]]/}" ]; then
    PROVIDER_KEY="$_val"
    break
  fi
done
unset _var _val

[ -z "$PROVIDER_KEY" ] && exit 0

export XDG_CONFIG_HOME=/tmp
CODEX_HOME="${CODEX_HOME:-$PWD/.codex}"
mkdir -p "/tmp/openai" "$HOME/.config/openai" "$CODEX_HOME"

if printf '%s' "$PROVIDER_KEY" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  # OAuth JSON — write directly
  printf '%s\n' "$PROVIDER_KEY" \
    | tee "/tmp/openai/auth.json" \
          "$HOME/.config/openai/auth.json" \
          "$CODEX_HOME/auth.json" > /dev/null
else
  # Plain API key — wrap in {"apiKey":"..."} format
  printf '{"apiKey":"%s"}\n' "$PROVIDER_KEY" \
    | tee "/tmp/openai/auth.json" \
          "$HOME/.config/openai/auth.json" \
          "$CODEX_HOME/auth.json" > /dev/null
fi

echo "  ✅  Codex auth pre-written."
