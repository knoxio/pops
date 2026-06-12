#!/usr/bin/env bash
# Validate apps/pops-shell/nginx.conf + the shared `_pillar-proxy.conf`
# partial by running `nginx -t` inside the same image we ship in
# production. Theme 13 PRD-190 split the dispatcher into a top-level
# config plus a snippet partial; this script is the smoke harness that
# catches typos before they reach a deploy.
#
# Requires Docker running locally. If Docker isn't available the script
# exits 0 with a skip message (CI can opt in by setting REQUIRE_DOCKER=1).
#
# Usage:
#   bash apps/pops-shell/scripts/validate-nginx-conf.sh
#   REQUIRE_DOCKER=1 bash apps/pops-shell/scripts/validate-nginx-conf.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
NGINX_CONF="$REPO_ROOT/apps/pops-shell/nginx.conf"
PARTIAL="$REPO_ROOT/apps/pops-shell/nginx/conf.d/_pillar-proxy.conf"

if [[ ! -f "$NGINX_CONF" ]]; then
  echo "FAIL: missing $NGINX_CONF" >&2
  exit 1
fi
if [[ ! -f "$PARTIAL" ]]; then
  echo "FAIL: missing $PARTIAL" >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  if [[ "${REQUIRE_DOCKER:-0}" == "1" ]]; then
    echo "FAIL: Docker is required (REQUIRE_DOCKER=1) but not running" >&2
    exit 1
  fi
  echo "SKIP: Docker not running — cannot run \`nginx -t\`. Set REQUIRE_DOCKER=1 to fail."
  exit 0
fi

docker run --rm \
  -v "$NGINX_CONF":/etc/nginx/conf.d/default.conf:ro \
  -v "$PARTIAL":/etc/nginx/snippets/_pillar-proxy.conf:ro \
  nginx:alpine \
  nginx -t
