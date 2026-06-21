#!/bin/sh
# Production boot wiring for the pops-shell nginx image (Theme 13 PRD-255,
# US-02 boot-render + US-03 watcher). Runs before nginx so a pillar that
# self-registered with the core registry is routable on this boot, with no
# image rebuild.
#
# Flow:
#   1. Boot-render the conf from the LIVE registry. On ANY failure
#      (registry unreachable, render error, `nginx -t` rejects the output)
#      keep the committed static fallback at $SERVED_CONF — nginx ALWAYS
#      boots. The fallback is logged at warn level.
#   2. Start nginx (master), then the registry watcher, both as children.
#   3. Supervise: if EITHER exits, tear the other down and exit non-zero so
#      the orchestrator restarts the container (no silent half-dead state).
#
# Strict POSIX sh (alpine /bin/sh = busybox ash). No bashisms.
set -eu

SERVED_CONF="/etc/nginx/conf.d/default.conf"
FALLBACK_CONF="/etc/nginx/fallback/default.conf"
RENDER_BUNDLE="/opt/pops-shell/render-nginx-conf.mjs"
WATCH_BUNDLE="/opt/pops-shell/watch-registry-and-reload.mjs"

REGISTRY_URL="${POPS_REGISTRY_URL:-${CORE_REGISTRY_URL:-http://core-api:3001}}"

log() { printf '[pops-shell-entrypoint] %s\n' "$*"; }
warn() { printf '[pops-shell-entrypoint] WARN %s\n' "$*" >&2; }

# Validate the conf currently installed at $SERVED_CONF with `nginx -t`.
# nginx -t loads the real /etc/nginx/nginx.conf (which `include`s
# conf.d/*.conf), so the served conf is exactly what gets tested.
served_conf_is_valid() {
  nginx -t >/dev/null 2>&1
}

# Render from the live registry into a temp file, install it at the served
# path, and validate. On success the served conf is the live render; on any
# failure the static fallback is restored and the function returns non-zero.
boot_render() {
  candidate="$(mktemp)"
  if ! node "$RENDER_BUNDLE" --dynamic \
    --registry-url "$REGISTRY_URL" \
    --out "$candidate"; then
    warn "boot-render: dynamic render from $REGISTRY_URL failed"
    rm -f "$candidate"
    return 1
  fi

  cp "$candidate" "$SERVED_CONF"
  rm -f "$candidate"

  if ! served_conf_is_valid; then
    warn "boot-render: rendered conf failed nginx -t validation"
    cp "$FALLBACK_CONF" "$SERVED_CONF"
    return 1
  fi

  log "boot-render: installed registry-rendered conf from $REGISTRY_URL"
  return 0
}

main() {
  # Start from the committed static fallback (baked by the Dockerfile) so a
  # partial prior render can never leave a broken file in place.
  cp "$FALLBACK_CONF" "$SERVED_CONF"

  if boot_render; then
    : # served conf is the live render
  else
    warn "falling back to committed static conf — registry was unreachable or the render was invalid; the watcher will re-render on the first registry event"
  fi

  # Hard guard: never start nginx with an invalid conf. If even the static
  # fallback fails to validate, surface the error and exit (the image is
  # broken — better to fail loudly than serve nothing).
  if ! served_conf_is_valid; then
    warn "served conf failed nginx -t after fallback; the committed static conf is broken"
    nginx -t
    exit 1
  fi

  log "starting nginx"
  nginx -g 'daemon off;' &
  nginx_pid=$!

  # The watcher writes each re-render to $SERVED_CONF, validates, then
  # reloads the running master. Its default config-test is
  # `nginx -t -c <output>`, which would treat the server-block fragment as
  # a whole config and fail; override it to a plain `nginx -t` so the test
  # loads the real /etc/nginx/nginx.conf that `include`s the served conf —
  # matching this entrypoint's own validation.
  log "starting registry watcher (registry=$REGISTRY_URL)"
  POPS_REGISTRY_URL="$REGISTRY_URL" \
  POPS_NGINX_OUTPUT="$SERVED_CONF" \
  POPS_NGINX_CONFIG_TEST_CMD="nginx -t" \
  POPS_NGINX_RELOAD_CMD="nginx -s reload" \
    node "$WATCH_BUNDLE" &
  watch_pid=$!

  terminate() {
    trap - TERM INT
    kill "$nginx_pid" "$watch_pid" 2>/dev/null || true
  }
  trap terminate TERM INT

  # Supervise both children with a portable poll (strict POSIX — no
  # `wait -n`). If EITHER nginx or the watcher dies, bring the other down
  # and exit non-zero so the orchestrator restarts the container; no silent
  # half-dead state.
  while kill -0 "$nginx_pid" 2>/dev/null && kill -0 "$watch_pid" 2>/dev/null; do
    sleep 1
  done

  if ! kill -0 "$nginx_pid" 2>/dev/null; then
    warn "nginx exited; shutting down the container"
  else
    warn "registry watcher exited; shutting down the container"
  fi
  terminate
  exit 1
}

main "$@"
