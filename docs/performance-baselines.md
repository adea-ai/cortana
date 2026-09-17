# Performance baselines

Measured baselines for the desktop build path and web bundle budgets, recorded so regressions have
a reference point and the budget headroom stays visible (issue #2273). Budgets themselves live in
`scripts/check-web-bundle-budget.mjs` and are enforced in the `test:unit` lane on every PR.

All numbers: macOS arm64 (Apple Silicon), repository at 0.56.25-era sources. Build times are warm
-cache wall times and machine-dependent; bundle and CSS sizes are deterministic outputs of the
committed sources and are the enforced part.

## Web bundle (enforced gate)

Measured by `scripts/check-web-bundle-budget.mjs` after `bun run --cwd apps/web build`
(TypeScript 6.0.3 per `bun.lock`, Vite production build):

| Surface                        | Measured bytes | Budget bytes | Headroom        |
| ------------------------------ | -------------- | ------------ | --------------- |
| Initial application JavaScript | 409,960        | 500,000      | 90,040 (18.0%)  |
| Complete production JavaScript | 727,009        | 850,000      | 122,991 (14.5%) |
| Application CSS                | 208,626        | 220,000      | 11,374 (5.2%)   |

The SolidJS architecture audit (static `App` entry, lazy Settings and command palette, removal of
manual eager chunking) cut the initial graph by roughly half and the complete graph by a quarter
versus the pre-audit baseline (796,809 / 959,164 / 218,947 bytes). Budgets were tightened to the
new measurements; the CSS budget is the tightest at ~5% headroom. Any feature that ships frontend
code must either fit inside this headroom, raise the budget with reviewed justification in the
same PR, or ship code as a lazy chunk outside the production graph (the `demoDesktop` exclusion
pattern).

## Desktop build path

| Stage                                                     | Measured                              |
| --------------------------------------------------------- | ------------------------------------- |
| `cargo build` (debug, `apps/desktop/src-tauri`, warm)     | ~20 s                                 |
| `prepare:sidecar --release` (release cortana binary)      | warm minutes; binary 12,269,056 bytes |
| `bun run --cwd apps/web build`                            | ~4 s (tsc + vite)                     |
| Desktop app binary (debug)                                | 59,460,864 bytes                      |
| Full `desktop:build` (`tauri build --no-bundle`)          | 13 m 52 s warm release compile        |
| Release desktop binary (`target/release/cortana-desktop`) | 24,523,456 bytes                      |
| Packaged `Cortana.app` (`desktop:bundle:mac`, unsigned)   | 51,236,864 bytes                      |

## Workspace layout and local build caching

The Rust binary is split into workspace crates so compile units stay
independent: `crates/core` (storage, memory, ingestion, connectors, sync),
`crates/retrieval` (embedding, retrieval, answer, evaluation), `crates/server`
(HTTP API, service, readiness, supervisor, relay, knowledge evaluation), and
`crates/mcp` (the rmcp server surface). The root `cortana` package is a facade
library plus the CLI binary; `cargo check -p <crate>` type-checks a single
crate and its upstreams, and edits that do not change a crate's public
metadata do not recompile downstream crates or the test binaries.

The dev profile used to set `opt-level = 2` for every dependency, and a cold
`cargo check --all-targets` in a fresh worktree measured ~45 minutes at that
setting (build scripts and proc macros must be fully compiled even for
`check`, and optimization multiplies their cost). The override now covers only
the HTTP, SQLite, and crypto crates that the eval latency gates exercise (the
annotated list in the root `Cargo.toml`), and the same cold check measured
**33.6 s** (sccache disabled, fresh target dir, 0.58.8-era sources, macOS
arm64). `scripts/setup-worktree.sh` symlinks `target/` (and the Tauri
crate's separate target dir) into `~/.cache/cortana` — or `$CORTANA_BUILD_CACHE`
— so dependency artifacts are shared across every worktree while workspace
crates still incremental-build per worktree. Concurrent builds serialize on
Cargo's target lock rather than corrupting output; `cargo clean` in one
worktree clears the shared cache for all. `test:eval` is the regression gate
for the optimized-dependency list: its latency budgets must stay green
whenever that list changes.

Two optional local tools:

- `sccache` as `rustc-wrapper` (`brew install sccache`, then add
  `rustc-wrapper = "sccache"` under `[build]` in `~/.cargo/config.toml`) —
  note it only caches non-incremental compiles, so it helps release and
  desktop builds, not the dev-profile loop covered by the shared target dir.
- `cargo nextest run` (`brew install cargo-nextest`) executes Rust tests as
  parallel processes instead of per-binary batches; especially effective for
  the `assert_cmd`-driven `tests/cli.rs` suite (604 tests in ~21s locally).

`test:unit` runs its five independent lanes (JS tests, pytest, docs
consistency, the evaluation gate, and the web build plus bundle budget)
concurrently via `scripts/run-unit-lanes.mjs`;
`node scripts/run-unit-lanes.mjs <lane>` runs a single lane while iterating.

`desktop:check` and `desktop:clippy` reuse an existing sidecar binary
(`prepare:sidecar --ensure`) instead of rebuilding it, and host builds no
longer pass an explicit `--target` triple so the sidecar shares `target/debug`
artifacts with normal `cargo build` output.

## Build-path failure modes (do not reintroduce)

- **Stale `node_modules` vs `bun.lock`**: the lockfile pinned TypeScript 6.0.3 while the
  installed tree held 5.9.3, so `tsc -b` rejected the committed `ignoreDeprecations: "6.0"` and
  the whole desktop build path failed at its first step. Recovery is `bun install --frozen-lockfile`;
  the `test:unit` bundle gate now fails loudly on any equivalent future breakage.
- **Stale sidecar lock**: a killed `desktop:build` left `binaries.lock` behind. The lock now
  records its owner PID and is stolen immediately when the owner is dead; age-based staleness
  (10 minutes) remains the fallback for owner files that cannot be read.
- **Moved checkout directories**: Cargo `.d` artifacts embed absolute paths from the checkout
  where they were built (observed: pre-rename paths from the project's earlier checkout
  locations). Cargo invalidates these on the first build after a move; if incremental rebuilds
  misbehave after relocating the repository, run `cargo clean` in the affected target directory
  rather than committing generated fixes. Tauri's permission generation was verified clean after
  the dependency resync: `tauri build --no-bundle` regenerates `gen/schemas` with no tracked
  diffs and no old-checkout references in build output.

## Startup and memory

The host-launch harness (`scripts/desktop-host-launch.mjs`) requires a stable-start window from
the launched host. Launching the unsigned local bundle's inner binary exits with code 0 before
that window — the same diagnostic recorded during M10 — so startup and memory numbers for
unsigned local bundles are **not claimable**; they belong to the packaged-acceptance lanes
(#2040–#2044, #2168) once signed packaged releases exist. No startup or memory claim is made
here, and none should be inferred from this document.
