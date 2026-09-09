# syntax=docker/dockerfile:1

# The static web bundle is target-independent. Both build tools must match the
# build host, including when the benchmark emulates an ARM64 runtime image.
FROM --platform=$BUILDPLATFORM oven/bun:1.4.0-slim AS bun-runtime

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web-builder
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /src
COPY package.json bun.lock bunfig.toml ./
# The container serves the web app; keep the Tauri workspace out of this install.
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile
COPY apps/web apps/web
COPY scripts/check-web-ui-contract.mjs scripts/check-web-ui-contract.mjs
COPY scripts/check-web-bundle-budget.mjs scripts/check-web-bundle-budget.mjs
RUN cd apps/web \
    && ../../node_modules/.bin/tsc -b \
    && bun ../../scripts/check-web-ui-contract.mjs \
    && node ../../node_modules/vite/bin/vite.js build \
    && bun ../../scripts/check-web-bundle-budget.mjs

FROM rust:1.88-bookworm AS rust-builder
ARG TARGETARCH
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
# Keep the dependency graph in a reusable layer. Source changes then rebuild
# only the application crate instead of recompiling every dependency.
# Container builds favor iteration speed; keep the desktop release profile's
# ThinLTO/single-codegen-unit settings unchanged outside this image.
RUN --mount=type=cache,id=cargo-registry-${TARGETARCH},target=/usr/local/cargo/registry \
    mkdir -p cargo-skeleton/src \
    && cp Cargo.toml Cargo.lock cargo-skeleton/ \
    && printf '\n[workspace]\n' >> cargo-skeleton/Cargo.toml \
    && printf 'fn main() {}\n' > cargo-skeleton/src/main.rs \
    && CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 \
      cargo build --manifest-path cargo-skeleton/Cargo.toml --target-dir /src/target \
      --release --locked --bin cortana \
    && rm -rf cargo-skeleton
COPY src src
COPY eval eval
RUN --mount=type=cache,id=cargo-registry-${TARGETARCH},target=/usr/local/cargo/registry \
    CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 \
    cargo build --release --locked --bin cortana \
    && cp /src/target/release/cortana /usr/local/bin/cortana

FROM python:3.11-slim-bookworm AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl tini \
    && groupadd --gid 10001 cortana \
    && useradd --uid 10001 --gid cortana --create-home --home-dir /home/cortana cortana

WORKDIR /opt/cortana
COPY pyproject.toml README.md ./
COPY src/cortana src/cortana
RUN python -m pip install --no-cache-dir ".[ingestion]"
COPY --from=rust-builder /usr/local/bin/cortana /usr/local/bin/cortana
COPY --from=web-builder /src/apps/web/dist /opt/cortana/web

RUN install -d -o 10001 -g 10001 \
      /etc/cortana \
      /var/lib/cortana \
      /var/lib/cortana/backups \
      /var/cache/cortana/models

# A new release version must not invalidate apt/pip and runtime assembly layers.
ARG CORTANA_VERSION=dev
LABEL org.opencontainers.image.title="Cortana" \
      org.opencontainers.image.description="Local-first single-node ContextProvider" \
      org.opencontainers.image.source="https://github.com/adea-ai/cortana" \
      org.opencontainers.image.version="${CORTANA_VERSION}" \
      org.opencontainers.image.licenses="Apache-2.0"

VOLUME ["/var/lib/cortana", "/var/lib/cortana/backups", "/var/cache/cortana/models"]
EXPOSE 7331
USER 10001:10001
ENTRYPOINT ["/usr/bin/tini", "--", "cortana"]
CMD ["--config", "/etc/cortana/config.toml", "serve", "--address", "0.0.0.0:7331", "--web-dir", "/opt/cortana/web", "--allow-remote"]
