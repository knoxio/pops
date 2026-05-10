# Moltbot secrets

Templates for the Docker secret files moltbot mounts. These are committed
under `.example` so the structure is discoverable; the live files live
under `infra/secrets/` (gitignored) on each deployer host.

## First-run

```sh
cd infra
mkdir -p secrets
for f in secrets.example/moltbot/*.example; do
  name=$(basename "$f" .example)
  if [ ! -f "secrets/$name" ]; then
    cp "$f" "secrets/$name"
    chmod 600 "secrets/$name"
  fi
done
$EDITOR secrets/telegram_bot_token secrets/claude_api_key secrets/pops_api_key
```

## What goes in each file

| File                     | Source                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `telegram_bot_token`     | Output of `/newbot` from [@BotFather](https://t.me/BotFather) on Telegram. One line, no quotes, no `bot` prefix.                |
| `telegram_bot_token_dev` | A second `/newbot` for staging. Use a different name (`pops-staging-bot`) so you can A/B against prod.                          |
| `claude_api_key`         | Anthropic console → API keys.                                                                                                   |
| `pops_api_key`           | Mint via `core.serviceAccounts.create` (admin tRPC route). Plaintext is shown exactly once — paste it here, then close the tab. |
| `finance_api_key`        | Same value as `pops_api_key` (legacy alias still referenced by the finance skill template).                                     |

## Provisioning the `pops_api_key`

The moltbot service account needs scopes covering both skills:

```
core.serviceAccounts.create({
  name: 'moltbot',
  scopes: [
    'cerebrum.ingest',   // /capture
    'cerebrum.query',    // /ask
    'cerebrum.retrieval' // /ask citations + search-mode
    // add 'finance.*' subprefixes only if you actually run the finance skill
  ]
})
```

The response contains `plaintextKey` (`pops_sa_<prefix>.<secret>`) — copy
that exact string into `secrets/pops_api_key`. Newlines are fine; the
validator trims them. Revoke and reissue if the key ever leaks.
