# Hand-written multi-stage build for the contacts pillar — the FIRST Rust
# pillar, and the reference Dockerfile every future Rust pillar copies.
#
# Build context is the REPO ROOT (publish-images.yml + pillar-quality.yml both
# pass `context: .`), so COPY paths are repo-relative. The cargo workspace root
# lives at the repo root and the member crate at `pillars/contacts`; both must
# be present for `cargo build -p contacts` to resolve the workspace.
#
# The contacts crate uses sqlx's RUNTIME query API (see
# pillars/contacts/src/entities/repo.rs), so there is NO `.sqlx/` offline cache
# and NO build-time DATABASE_URL — the image builds fully offline. Migrations
# are embedded into the binary at compile time via `sqlx::migrate!`, so the
# runtime image needs neither the migrations directory nor sqlx-cli.

FROM rust:1-slim AS builder
WORKDIR /build

# System deps for the build: rustls pulls its own crypto (no OpenSSL), so only
# the basics are needed. `pkg-config`/`libssl` are intentionally omitted.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Workspace + member manifests first so a dependency-only layer caches across
# source-only changes. The workspace declares pops-ai / pops-settings members;
# copy their manifests too so `cargo` can parse the workspace graph (a member
# missing its Cargo.toml fails workspace resolution even when we build only
# `-p contacts`).
COPY Cargo.toml Cargo.lock ./
COPY libs/pops-ai/Cargo.toml ./libs/pops-ai/
COPY libs/pops-settings/Cargo.toml ./libs/pops-settings/
COPY pillars/contacts/Cargo.toml ./pillars/contacts/

# Stub sources so the dependency layer compiles the third-party crate graph
# without the real source. Each member needs a lib target to satisfy its
# manifest; contacts also declares two bins. The stub lib is empty and the
# stub bins are trivial `fn main() {}`, so this build genuinely SUCCEEDS — it
# compiles every dependency (the slow part, cached via `--mount=type=cache`)
# plus a trivial crate. No `|| true`: a broken dependency graph fails here
# loudly instead of being masked.
RUN mkdir -p libs/pops-ai/src libs/pops-settings/src \
        pillars/contacts/src pillars/contacts/src/bin \
    && echo '' > libs/pops-ai/src/lib.rs \
    && echo '' > libs/pops-settings/src/lib.rs \
    && echo '' > pillars/contacts/src/lib.rs \
    && echo 'fn main() {}' > pillars/contacts/src/main.rs \
    && echo 'fn main() {}' > pillars/contacts/src/bin/emit_openapi.rs
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --release --manifest-path Cargo.toml -p contacts

# Real sources. The contacts crate's own artifacts from the stub layer compiled
# the empty stub lib/main, and cargo fingerprints by mtime — so purge the
# contacts crate's artifacts to force a clean recompile against the real source.
# The (cached, slow) third-party dependency artifacts in `target/release/deps`
# are untouched, so the rebuild is still fast.
COPY pillars/contacts/migrations ./pillars/contacts/migrations
COPY pillars/contacts/openapi ./pillars/contacts/openapi
COPY pillars/contacts/src ./pillars/contacts/src
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    rm -rf target/release/contacts \
        target/release/deps/contacts-* \
        target/release/.fingerprint/contacts-* \
    && cargo build --release --manifest-path Cargo.toml -p contacts --bin contacts

FROM debian:bookworm-slim AS runtime
WORKDIR /app

# curl for the compose/Docker healthcheck; ca-certificates so the registry
# handshake over HTTPS (if the registry URL is https) verifies. A non-root
# user mirrors the TS pillars' `USER node`.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system contacts \
    && useradd --system --gid contacts --home /app --no-create-home contacts \
    && mkdir -p /data/sqlite \
    && chown -R contacts:contacts /data

COPY --from=builder /build/target/release/contacts /app/contacts

# Watchtower injects the git SHA as BUILD_VERSION; the binary coerces a
# non-semver value to 0.0.0-sha.<7> for the manifest.
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION

# Default the DB onto the writable, chowned volume mount so the image boots
# standalone (the non-root user can't write the WORKDIR). Compose overrides
# this with the same path; the value is here so `docker run` works with no env.
ENV CONTACTS_SQLITE_PATH=/data/sqlite/contacts.db

EXPOSE 3010
USER contacts

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -fsS http://localhost:3010/health || exit 1

CMD ["/app/contacts"]
