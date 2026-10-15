#!/usr/bin/env bash
set -euo pipefail

URL="https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"

echo ""
echo "  ┌─────────────────────────────────────────────────────────────┐"
echo "  │  Preview URL:                                                │"
echo "  │                                                             │"
echo "  │  ${URL}"
echo "  │                                                             │"
echo "  │  The preview normally opens automatically inside VS Code    │"
echo "  │  when setup completes. If it did not:                       │"
echo "  │                                                             │"
echo "  │  1. Open the URL above in a browser tab.                    │"
echo "  │  2. Log in there once.                                       │"
echo "  │  3. Return to Codespaces. The Simple Browser preview        │"
echo "  │     will reflect your session.                              │"
echo "  └─────────────────────────────────────────────────────────────┘"
echo ""
