# Cortana tauri-plugin-updater 2.10.1 security backport

This directory is the `tauri-plugin-updater 2.10.1` crate published by the Tauri project, vendored
for the desktop dependency graph only.

- Crates.io archive SHA-256:
  `806d9dac662c2e4594ff03c647a552f2c9bd544e7d0f683ec58f872f952ce4af` (the checksum
  `apps/desktop/src-tauri/Cargo.lock` carried before this patch)
- Advisories: `RUSTSEC-2026-0367`, `RUSTSEC-2026-0368`, `RUSTSEC-2026-0369` against `zip` before
  9.0.0, reached through `ZipArchive::extract` in the Windows updater.
- Upstream change: tauri-apps/plugins-workspace#3698, commit
  `ba98bfadc4c868c9a7e1a226c83af528e1f11b89` ("update rust crate zip to v9"). It changes only the
  `zip` requirement in the Windows target dependencies; no updater source changes. No published
  `tauri-plugin-updater` release carries it yet (2.10.1 through 2.14.0 and 3.0.0-alpha.3 require
  `zip ^4`).
- Local delta: in `Cargo.toml`, the `zip` requirement under
  `[target.'cfg(target_os = "windows")'.dependencies.zip]` is `"9"` instead of `"4"`. The locked
  version is `zip 9.0.4`.
- Omitted from the published archive: the npm guest bindings (`guest-js`, `package.json`,
  `rollup.config.js`, `tsconfig.json`), the crate's own `Cargo.lock` and `banner.png`. None of them
  take part in the Rust build; `api-iife.js` stays because `build.rs` embeds it.
- Licenses: `Apache-2.0 OR MIT`, unchanged; both license texts are kept.

Do not remove this patch until a published `tauri-plugin-updater` release requires `zip >= 9`; then
delete this directory, the `[patch.crates-io]` entry and the root workspace exclusion. Run
`bun scripts/verify-vendored-updater.mjs` after any dependency update.
