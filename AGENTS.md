# Agent instructions — Cortana

Read [README.md](README.md) and [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)
with this file. Cortana combines a Rust knowledge runtime, Python connectors,
a Solid web UI and a Tauri desktop shell.

## Repository map

- `src/`, `crates/`: Rust runtime, core, retrieval, server and MCP workspace members.
- `src/cortana/`: Python connector package; `pyproject.toml` and `uv.lock` own its tools.
- `apps/web/`: Solid app and consumer integration; `apps/desktop/` owns Tauri packaging.
- `tests/`, `eval/`: cross-language contracts and evaluation evidence.
- `scripts/`: isolated JS lanes, docs consistency, browser journeys and release checks.
- [docs/README.md](docs/README.md), [docs/planning.md](docs/planning.md) and
  [docs/project-goal.md](docs/project-goal.md): documentation map and planning ownership.
- [docs/web-ui-standards.md](docs/web-ui-standards.md),
  [docs/solid-conventions.md](docs/solid-conventions.md) and
  [apps/desktop/README.md](apps/desktop/README.md): UI, Solid and desktop conventions.

## Tools and commands

Use committed `bun.lock`, `uv.lock` and Cargo lockfiles. `package.json` pins
Node 24.21.0 and Bun 1.4.0; `.mise.toml` currently selects Bun 1.4.2 and Rust
1.99.0 with the same Node version. Report which pins you use when reproducing a
check; do not silently rewrite either manifest to reconcile them.

From the repository root:

```sh
bun run format:check       # Oxfmt
bun run lint               # web UI contract and Oxlint
bun run docs:check         # Python documentation consistency checker through uv
bun run typecheck          # web only
bun run type-check         # Python mypy, Rust all-target check and web types
bun run test               # isolated JavaScript suites
bun run test:unit          # JS, non-integration Python and docs lanes
bun run test:integration   # Python integration lane
bun run test:smoke         # Python smoke lane
bun run test:eval          # Rust evaluation integration test
bun run build              # production web build and bundle budget
bun run desktop:check      # desktop check script
bun run desktop:test       # desktop test script
bun run desktop:test:native
```

Root Cargo defaults include the runtime and four member crates; the Tauri crate is
excluded and has its own desktop commands. The JS runner defaults to two parallel
groups; `CORTANA_TEST_MAX_PARALLEL=1` helps diagnose flaky runs. Use the relevant
lane rather than treating the web-only `typecheck` as full repository validation.
For guidance edits, run `bun run docs:check`, Markdown formatting and link/command
checks; code and browser suites apply when their implementation or contract changes.

## Design ownership and visual evidence

Cortana consumes published `@adea-ai/ui` and `@adea-ai/themes` versions in its
manifests. UI owns controls, accessibility, typography, spacing and token application;
Themes owns palettes and provenance. Cortana owns domain behavior and app layout.
Use the detailed existing contract below and `docs/web-ui-standards.md`.

For visual or interaction changes, build and preview the production web app, then
follow that document's `scripts/capture-m7-visuals.mjs` and
`node scripts/e2e-journeys.mjs` instructions. Retain its dark-theme, breakpoint,
keyboard, zoom, contrast and Axe coverage. The M7 visual workflow exercises Chromium
and WebKit. Browser demo evidence does not establish packaged native acceptance.

## Shared web UI and theme

- In `apps/web`, import components from `@adea-ai/ui/components/*`, shared helpers from `@adea-ai/ui/lib/*`, and the theme stylesheet from `@adea-ai/ui/theme.css`. Do not recreate shared components, generic class helpers, or variants locally.
- Use shared controls for interactive elements. Do not import or re-export the bare shared `Button`; use `ActionButton` or an interactive `ListRow` for actions. Every app-rendered shared `ActionButton` (including aliases, local re-exports, and values passed through an `as` prop) and every interactive `ListRow` (`as="button"`, `as="a"`, or with `onClick`) must have a helpful explicit `tooltip` prop; punctuation-only placeholders and prop spreads do not satisfy this help contract. Shared compound controls such as `SideRail` own their own help. A semantic shared `FieldSet` needs a shared `FieldLegend` child or explicit `aria-label`/`aria-labelledby`; use the shared `FieldGroup` for layout-only grouping. Do not add raw interactive HTML controls (including `<details>` and `<summary>`) or dynamically select native controls.
- Let `@adea-ai/ui` own theme tokens and shared component visuals. App CSS may style native domain content and layout with shared tokens; it must not redefine theme tokens or visually restyle shared components through custom classes or `data-slot` selectors. Do not set padding or block sizing on shared controls; choose their shared size variant. Keep width and flex placement in the app layout, and keep a shared control's root display mode; put grid/block/flex arrangement on an inner domain wrapper. A contextual `display: none` may hide a shared control when needed.
- Do not use JSX inline styles or `classList` in the application; use shared layout primitives for geometry and static object-form classes for conditional classes. Do not weaken shared UI rules in overrides or add class exemptions. See `docs/web-ui-standards.md` for the detailed contract.
- Run `bun scripts/check-web-ui-contract.mjs`, `bun test scripts/check-web-ui-contract.test.mjs`, and `bunx oxlint --deny-warnings apps/web/src` when changing the web UI or its contract.

## Draft WIP workflow

Use one focused topic branch from `main` and one draft PR targeting `main`.
Check existing PRs before starting; reuse the suitable draft branch for the task.
Commit and push WIP to that branch throughout the task and before stopping or
handing off, then verify the remote SHA. Incomplete work and failing checks belong
in the draft PR with exact results and remaining work; they do not block WIP pushes.
Review and applicable passing checks gate readiness and merge. Use Conventional
Commit subjects; this repository uses Code Foundry's direct, squash workflow.

Proceed with ordinary authorized edits, checks, commits and draft pushes. Resolve
routine implementation choices from repository sources. Ask only when a genuinely
missing consequential decision or authority prevents the work.

## Code Foundry guidance

[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) retains the complete contribution,
review, merge and CI contract; [docs/EXTENSIONS.md](docs/EXTENSIONS.md) explains
managed files and extension points. `.github/code-foundry.yml` is the CI source of
truth. Use the repository's pinned tools and lockfiles; keep coverage thresholds,
formatting conventions, generated-file ownership and change-aware hooks intact.
Add regression coverage for behavior changes and run focused checks while iterating.
A passing commit hook is not full validation. Report exact checks and outcomes,
skips with reasons, remaining work, and the branch/PR at handoff.

User instructions take precedence; directory guidance applies to its own scope.
Read the nearest manifest, README and affected tests, and inspect branch, worktree
and existing changes before editing. Preserve unrelated work.

<!-- code-foundry-managed: safety-boundaries -->

## Safety boundaries

- Do not discard, reset, overwrite, or rewrite user-owned changes.
- Do not expose or commit secrets, credentials, tokens, private keys, local environment files, or personal machine paths.
- Do not modify production resources, repository settings, branch protections, secrets, deployments, or external systems unless explicitly requested.
- Do not add organization- or product-specific details to this reusable baseline.
- Do not change dependency managers or lockfiles unnecessarily.
- Do not bypass hooks, tests, review requirements, or required checks to hide a failure.
- Do not claim completion while required validation, review, deployment, or user decisions remain pending.
- Publishing, committing, or opening a pull request requires explicit task scope or user authorization.

<!-- /code-foundry-managed: safety-boundaries -->
