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

| Surface                        | Measured bytes | Budget bytes | Headroom     |
| ------------------------------ | -------------- | ------------ | ------------ |
| Initial application JavaScript | 796,809        | 800,000      | 3,191 (0.4%) |
| Complete production JavaScript | 959,164        | 960,000      | 836 (0.1%)   |
| Application CSS                | 218,947        | 220,000      | 1,053 (0.5%) |

The complete-JavaScript and CSS budgets are effectively exhausted (under 1% headroom). Any
feature that ships frontend code must either fit inside this headroom, raise the budget with
reviewed justification in the same PR, or ship code as a lazy chunk outside the production graph
(the `demoDesktop` exclusion pattern).

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
