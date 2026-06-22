#!/bin/sh
# Moltbot config + secrets validation. Runs as a one-shot container in compose
# (see infra/docker-compose.yml service `moltbot-validator`) before the bot
# itself starts, so the operator gets a fast, obvious failure when something
# is missing rather than a silent "every message dropped" loop.
#
# Exits 0 when everything looks good, prints the offending field and exits
# 1 otherwise. Keep this in POSIX `sh` so it works in alpine/busybox base
# images.

set -eu

CONFIG="${MOLTBOT_CONFIG:-/config/config.yml}"
TOKEN="${TELEGRAM_BOT_TOKEN_FILE:-/run/secrets/telegram_bot_token}"
CLAUDE="${CLAUDE_API_KEY_FILE:-/run/secrets/claude_api_key}"
POPS_KEY="${POPS_API_KEY_FILE:-/run/secrets/pops_api_key}"

fail() {
  echo "moltbot-validator: $1" >&2
  exit 1
}

[ -f "$CONFIG" ] || fail "config file not found at $CONFIG"
[ -s "$TOKEN" ] || fail "telegram_bot_token secret is missing or empty ($TOKEN)"
[ -s "$CLAUDE" ] || fail "claude_api_key secret is missing or empty ($CLAUDE)"
[ -s "$POPS_KEY" ] || fail "pops_api_key secret is missing or empty ($POPS_KEY)"

# Reject the empty allow-list — the upstream bot would silently ignore every
# message until the operator notices. Be loud instead. The check is a plain
# string match on the rendered YAML so we don't need a yaml parser in the
# validator image.
if grep -E '^[[:space:]]*allowed_user_ids:[[:space:]]*\[\][[:space:]]*(#.*)?$' "$CONFIG" >/dev/null; then
  fail "allowed_user_ids is empty in $CONFIG — fill in your Telegram user ID before starting moltbot"
fi

# Reject obvious placeholder tokens to catch the case where the operator
# `cp`'d the example file but forgot to edit it.
if grep -q 'REPLACE_ME' "$TOKEN" "$CLAUDE" "$POPS_KEY" 2>/dev/null; then
  fail "one of the secret files still contains the REPLACE_ME placeholder"
fi

echo "moltbot-validator: OK"
