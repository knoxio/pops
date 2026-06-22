/**
 * Static nginx-conf fragments used by `generate-nginx-conf.ts`.
 *
 * Split out so the generator's renderer stays small and the literal
 * blocks (which are essentially data) live next to each other. Order:
 * the renderer concatenates
 *   HEAD → REST_INTRO → <per-pillar /<id>-api/ blocks> → TAIL.
 *
 * Editing any text below changes the committed `nginx.conf` — the
 * drift-detection test will fail until `pnpm gen:nginx` is re-run.
 */

export const NGINX_CONF_HEAD = `server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Resolver for variable-form \`proxy_pass\`. Upstreams held in an
    # nginx variable defer DNS resolution to request time (vs. config-
    # load time for literal \`proxy_pass <name>\`), letting nginx boot
    # even when an optional pillar container is missing. Every \`proxy_pass\`
    # in this file uses the variable form so the shell always boots — a
    # registry-driven boot-render (PRD-255) must never hard-fail on an
    # absent pillar — and new upstreams must adopt the same form.
    resolver 127.0.0.11 valid=30s ipv6=off;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;

    # Cache static assets aggressively (Vite hashes filenames)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
`;

/**
 * Intro comment for the generated per-pillar REST surfaces. Heads the
 * `/<id>-api/` REST blocks the generator emits below it.
 */
export const NGINX_CONF_REST_INTRO = `    # ── Per-pillar REST surfaces (pillar migration cutover, generated) ──
    #
    # GENERATED FILE — do not hand-edit. Source:
    #   pillars/shell/scripts/generate-nginx-conf.ts
    #
    # Each collapsed pillar now serves an idiomatic REST contract at root
    # on its own container (\`/health\`, \`/pillars\`, \`/openapi\`, plus its
    # resource routes). The Hey API clients post to the shell's
    # \`/<pillar>-api/...\` prefix (e.g. \`/media-api/...\`, \`/registry-api/...\`);
    # each block strips the \`/<pillar>-api\` prefix so the pillar's own
    # router sees its natural paths, then proxies to the pillar container.
    #
    # Variable-form \`proxy_pass\` defers DNS to request time so pops-shell
    # still boots when a pillar container is absent; calls 502 until the
    # upstream is in place.
`;

export const NGINX_CONF_TAIL = `    # Relocated raw routes (02): Up Bank webhook → finance pillar; inventory
    # photo/document byte routes → inventory pillar. Variable-form proxy_pass
    # so pops-shell still boots when an upstream is absent.
    location /webhooks/up {
        set $up_webhook_upstream http://finance-api:3004;
        proxy_pass $up_webhook_upstream;
        proxy_set_header Host $host;
        proxy_read_timeout 30s;
    }

    location ~ ^/(api/inventory|inventory/documents)/ {
        set $inventory_upstream http://inventory-api:3002;
        proxy_pass $inventory_upstream;
        proxy_set_header Host $host;
    }

    # Proxy media images (posters, backdrops) served by the media pillar
    # On-demand downloads from TMDB/TVDB may take a few seconds on first request
    # Cache headers are set by the API — don't override with expires/add_header
    #
    # Variable-form \`proxy_pass\` (like every other upstream here) so the
    # shell boots even when media-api is unreachable — a registry-driven
    # boot-render must never hard-fail the image on an absent pillar
    # (PRD-255). The location prefix matches the upstream path, so the bare
    # host:port variable plus the unchanged \`$request_uri\` reproduces the
    # previous literal \`http://media-api:3003/media/images/\` target.
    location /media/images/ {
        set $media_images_upstream http://media-api:3003;
        proxy_pass $media_images_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 30s;
    }

    # Proxy health check — served by the registry pillar (formerly core).
    # Variable-form so the shell still boots when registry-api is absent (the
    # request URI flows through unchanged, hitting registry-api's /health).
    location /health {
        set $health_upstream http://registry-api:3001;
        proxy_pass $health_upstream;
    }

    # Registry pillar snapshot (ADR-026 phase 3 PR 4). The shell's
    # \`fetchPillarRegistry\` hits \`/pillars\` at boot; route it to registry-api
    # which is the authoritative source. \`/pillars/health\` is served by the
    # same registry pillar (the monolith aggregator that previously owned it is
    # gone after the 02 decommission).
    #
    # Regex match so /pillars and /pillars/ both reach the upstream (and
    # similarly for /pillars/health). nginx forbids a URI part on
    # \`proxy_pass\` inside a regex location, so the upstream is the bare
    # host:port and the original \`$request_uri\` flows through unchanged.
    # Both upstreams are Express with default \`strict routing: off\` so
    # the trailing-slash and bare variants hit the same handler.
    #
    # The registry-api upstream is stored in a variable so nginx defers DNS
    # resolution to request time. Hosts that haven't yet deployed
    # \`pops-registry\` would otherwise fail to boot pops-shell entirely
    # (\`host not found in upstream "registry-api"\`); with the variable form
    # the SPA stays up and \`/pillars\` returns 502 until the upstream is
    # in place — the correct failure mode. The renamed container also carries
    # a \`core-api\` network alias during the rename window, so a stale name
    # still resolves.
    location ~ ^/pillars/?$ {
        set $pillars_upstream http://registry-api:3001;
        proxy_pass $pillars_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
    }

    # Registry pillar SSE stream (PRD-163). \`GET /registry/subscribe\`
    # is a plain-HTTP Server-Sent-Events endpoint on the registry pillar (NOT
    # a tRPC subscription). Proxy buffering is disabled and the read
    # timeout is long so the stream stays open; the handler already sets
    # \`X-Accel-Buffering: no\` but we pin it here too. Variable-form
    # \`proxy_pass\` keeps pops-shell booting when registry-api is absent.
    location ~ ^/registry/subscribe/?$ {
        set $registry_subscribe_upstream http://registry-api:3001;
        proxy_pass $registry_subscribe_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_connect_timeout 5s;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # NOTE: \`/registry/{register,heartbeat,deregister}\` are deliberately
    # NOT exposed by this public nginx. Pillar registration runs entirely
    # within the docker network — each pillar-api boots and POSTs directly
    # to \`http://registry-api:3001/registry/register\` over the internal
    # bridge. Removing the public allow-list closes the only path an
    # external caller could have reached the registration surface from.

    location ~ ^/pillars/health/?$ {
        set $pillars_health_upstream http://registry-api:3001;
        proxy_pass $pillars_health_upstream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
    }

    # TRANSITIONAL (core→registry rename window): the registry pillar's REST
    # surface is now served under \`/registry-api/\` (generated above). An old
    # shell bundle baked before the rename still posts to \`/core-api/\`, so
    # this alias block proxies the legacy prefix to the same registry-api
    # upstream. Strips \`/core-api\` exactly like the generated \`/registry-api/\`
    # block strips its own prefix. Removed once every shell bundle posts to
    # \`/registry-api/\`.
    location /core-api/ {
        set $core_api_upstream http://registry-api:3001;
        rewrite ^/core-api/(.*)$ /$1 break;
        proxy_pass $core_api_upstream;
        include /etc/nginx/snippets/_pillar-proxy.conf;
    }

    # API docs browser — Theme 13 PRD-219.
    #
    # \`pops-docs\` is a tiny static nginx image serving Stoplight Elements
    # pointed at every contract package's OpenAPI snapshot. Variable-form
    # \`proxy_pass\` so pops-shell still boots if pops-docs is absent
    # (consistent with the rest of this file); requests to \`/docs/\` 502
    # in that case instead of failing the shell container.
    #
    # The trailing slash on \`proxy_pass\` strips the \`/docs/\` prefix
    # before forwarding so pops-docs's own nginx serves \`/\`, \`/catalog.json\`,
    # \`/openapi/<pillar>.json\`, and \`/healthz\` at their natural paths.
    location /docs/ {
        set $pops_docs_upstream http://pops-docs:80;
        proxy_pass $pops_docs_upstream/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
    }

    # SPA fallback — serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
`;
