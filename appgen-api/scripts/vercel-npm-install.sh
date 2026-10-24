#!/usr/bin/env bash
set -euo pipefail
# Vercel sets NPM_CONFIG_CACHE_DIR; npm 11 maps it to unknown "cache-dir". Use npm's "cache" config instead.
if [[ -n "${NPM_CONFIG_CACHE_DIR:-}" && -z "${npm_config_cache:-}" ]]; then
  export npm_config_cache="$NPM_CONFIG_CACHE_DIR"
fi
unset NPM_CONFIG_CACHE_DIR npm_config_cache_dir
exec npm install "$@"
