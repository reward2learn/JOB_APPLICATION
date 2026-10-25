#!/usr/bin/env bash
# Start the XERJ engine on http://localhost:9200/
# Matches the MCP config: XERJ_URL=http://localhost:9200 (no API key → run with -k)
set -euo pipefail

XERJ_BIN="${XERJ_BIN:-/Users/iliashapiro/.local/bin/xerj}"
PORT="${XERJ_PORT:-9200}"
DATA_DIR="${XERJ_DATA_DIR:-$HOME/.local/share/xerj}"

# Already running? bail out early.
if curl -s -m 2 "http://localhost:${PORT}/" -o /dev/null; then
  echo "xerj already responding on http://localhost:${PORT}/"
  exit 0
fi

mkdir -p "$DATA_DIR"

echo "Starting xerj on http://localhost:${PORT}/ (data: $DATA_DIR)"
# -k: disable TLS + API-key auth (local dev only) — the MCP server config
#     sends no XERJ_API_KEY, so auth must be off for it to connect.
exec "$XERJ_BIN" \
  --bind 127.0.0.1 \
  --port "$PORT" \
  --data-dir "$DATA_DIR" \
  --insecure
