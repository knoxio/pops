# Moltbot

[Moltbot](https://github.com/moltbot/moltbot) is the Telegram channel for POPS
([PRD-088 US-02](../../docs/themes/06-cerebrum/prds/088-ego-channels/us-02-moltbot-channel.md)).
This directory ships:

- The **config** files (prod + dev) that get mounted into the upstream
  `moltbot/moltbot:latest` container.
- The **skill prompts** (`pops-cerebrum/`, `pops-finance/`) that turn `/capture`,
  `/ask`, and `/help` Telegram messages into pops-api calls.
- A small **validator script** (`scripts/validate-config.sh`) that the compose
  stack runs as a one-shot init container before the bot starts so missing
  secrets or an empty `allowed_user_ids` fail loudly instead of silently
  dropping every message.

The bot itself is the upstream image — we don't fork it.

## First-run runbook

Estimated 10–15 minutes from a clean checkout (PRD-088 acceptance target).

### 1. Create the Telegram bot

1. Open Telegram, message [@BotFather](https://t.me/BotFather), `/newbot`.
2. Follow the prompts — name (`POPS Bot`), username (`pops_owner_bot`,
   must end in `bot`).
3. Copy the token line: `123456789:AA...` (looks like a colon-separated string).

### 2. Find your Telegram user ID

Message [@userinfobot](https://t.me/userinfobot). It replies with your numeric
user ID (e.g. `123456789`). Only this ID will be allowed to send messages —
the validator refuses to start the bot until at least one ID is configured.

### 3. Mint a pops-api service-account key

The bot calls pops-api as a machine client using a service-account key. The
key is hashed at rest; the plaintext is shown exactly once at creation time.

From a logged-in shell (Cloudflare Access session) call:

```bash
pnpm --filter @pops/api exec tsx -e '
  import { appRouter } from "./src/router.js";
  const c = appRouter.createCaller({
    user: { email: "you@example.com" },
    serviceAccount: null,
  });
  const r = await c.core.serviceAccounts.create({
    name: "moltbot",
    scopes: ["cerebrum.ingest", "cerebrum.query", "cerebrum.retrieval"],
  });
  console.log(r.plaintextKey);
'
```

(or hit `core.serviceAccounts.create` from the shell admin UI once the
matching panel ships — see follow-ups in #2496). Add `finance.transactions`,
`finance.budgets`, etc. to the scope list only if you actually run the
finance skill.

The plaintext key looks like `pops_sa_abc12345.<32-char-secret>`. Save the
output in a password manager **before** writing it to disk — you cannot
recover it.

### 4. Drop secrets into `infra/secrets/`

```bash
cd infra
mkdir -p secrets
chmod 700 secrets
for f in secrets.example/moltbot/*.example; do
  name=$(basename "$f" .example)
  cp -n "$f" "secrets/$name"
done
chmod 600 secrets/*
$EDITOR secrets/telegram_bot_token   # paste step 1 token, no quotes
$EDITOR secrets/claude_api_key       # Anthropic API key
$EDITOR secrets/pops_api_key         # paste step 3 plaintext key
```

Make sure each file ends with at most one newline. The validator rejects
any file that still contains `REPLACE_ME`.

### 5. Add your user ID to the config

```yaml
# apps/moltbot/config/config.yml
telegram:
  allowed_user_ids: [123456789] # your Telegram user ID from step 2
```

### 6. Start the moltbot profile

The profile is opt-in so `docker compose up -d` skips it on hosts that
don't run a Telegram bot.

```bash
docker compose -f infra/docker-compose.yml --profile moltbot up -d
```

The validator runs first; if it exits non-zero (missing secret, empty
`allowed_user_ids`, placeholder still in a secret file) the bot service
will refuse to start and `docker compose ps` will show `moltbot-validator`
as `Exited (1)`.

### 7. Verify

Send your bot:

- `/help` — should reply with the command list.
- `/capture testing the moltbot integration` — should reply with the
  assigned engram ID.
- `/ask what was that test capture I just made?` — should retrieve the
  capture with a citation link to the shell.

If `/capture` returns "Cerebrum auth failed", the service-account key
in `secrets/pops_api_key` doesn't match a row in `service_accounts`.
Mint a new one and rotate.

## Local dev workflow

`mise moltbot:dev` boots a moltbot container against a **separate**
Telegram bot (token in `secrets/telegram_bot_token_dev`) using
`config.dev.yml`. Use this when iterating on the skill prompts so you
don't poison your prod conversation history.

```bash
mise moltbot:dev    # starts dev compose with moltbot profile
mise moltbot:logs   # tail the bot logs
```

Stop with `docker compose -f infra/docker-compose.dev.yml --profile moltbot down moltbot moltbot-validator`.

## Authentication contract

Skills authenticate to pops-api using:

```
X-API-Key: <plaintext key from pops_api_key secret>
```

pops-api rejects the call with 401 if the key is missing/invalid or 403 if
the key is valid but the row's `scopes` don't cover the procedure path
(e.g. `moltbot` calling `core.serviceAccounts.create` will hit 403). See
`apps/pops-api/src/modules/core/service-accounts/` for the implementation
and rotation API.

## Why a separate validator container?

The upstream bot doesn't expose a "validate config and exit" mode and we
don't want to fork the image just for that. A 6-line `alpine:3.20` init
container that runs `validate-config.sh` keeps the failure visible at
`docker compose up` time without touching the upstream binary.

## Out of scope (for issue #2496)

- Building our own moltbot fork.
- Multi-user `allowed_user_ids` — the bot stays single-tenant.
- Reaching the Up Bank webhook from skills — that path uses signed
  webhook auth and doesn't need a service-account key.
