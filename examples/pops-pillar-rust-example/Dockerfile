# syntax=docker/dockerfile:1.7
# Reference Rust pillar — see docs/themes/13-pillar-finale/prds/233-external-pillar-example-repo/

FROM rust:1.83-slim-bookworm AS builder
WORKDIR /build

RUN apt-get update \
  && apt-get install -y --no-install-recommends pkg-config \
  && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml ./
RUN mkdir src \
  && echo 'fn main() {}' > src/main.rs \
  && cargo build --release \
  && rm -rf src target/release/deps/pops_pillar_rust_example*

COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --no-create-home pops

COPY --from=builder /build/target/release/pops-pillar-rust-example /usr/local/bin/pops-pillar-rust-example

USER pops
ENV PORT=3010
EXPOSE 3010

HEALTHCHECK --interval=10s --timeout=2s --start-period=5s --retries=3 \
  CMD ["/bin/sh", "-c", "wget -q -O /dev/null http://127.0.0.1:${PORT:-3010}/health || exit 1"]

ENTRYPOINT ["/usr/local/bin/pops-pillar-rust-example"]
