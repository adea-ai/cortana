# Agent Instructions

<!-- code-foundry-managed: config-aware-policy -->

These instructions are the repository-level operating contract for coding agents, including Hermes, OpenCode, and other automation.

They complement `CONTRIBUTING.md`. More specific instructions in nested `AGENTS.md` files and project documentation take precedence for their directory.

<!-- /code-foundry-managed: config-aware-policy -->

<!-- code-foundry-managed: mission -->

## Mission

- Keep formatting, linting, type checking, builds, tests, and coverage reproducible locally and in CI.
- Prefer the repository's configured toolchain; `toolchain: auto` uses native
  tools unless an existing `.mise.toml` is present.
- Do not commit secrets, generated credentials, local environment files, or machine-specific paths.
- Add tests for behavior changes and keep coverage thresholds explicit in the project configuration.
- Make the smallest complete, well-tested change that solves the requested problem without disturbing unrelated work.

This repository may contain TypeScript, Rust, Python, or any combination of them. Detect the active stack from the files present; do not assume every check applies.

<!-- /code-foundry-managed: mission -->

<!-- code-foundry-managed: contributing-back -->

## Contributing back

Consumers are encouraged to help improve this open-source project. Open a small,
focused pull request for bug fixes, performance improvements, documentation, or
other narrowly scoped changes. For larger feature requests or architectural
changes, create an issue first so the proposal can be discussed and scoped.
Contributions should help make the tool as performant, reliable, and helpful as
possible for everyone.

<!-- /code-foundry-managed: contributing-back -->

<!-- code-foundry-managed: read-before-acting -->

## Read before acting

Before editing:

1. Read this file and `.github/CONTRIBUTING.md`.
2. Find and read any nested `AGENTS.md` that covers the files you will touch.
3. Read the nearest README, package manifest, build configuration, and relevant tests.
4. Inspect the current branch, worktree, remotes, and recent history:

   ```sh
   git status --short --branch
   git remote -v
   git log -5 --oneline
   ```

5. Identify the repository's package manager, lockfile, runtime versions, test commands, deployment assumptions, and generated files.

If the worktree is dirty, preserve existing changes and avoid overlapping edits until their ownership is clear.

<!-- /code-foundry-managed: read-before-acting -->

<!-- code-foundry-managed: priorities -->

## Priorities

When instructions conflict, use this order:

1. System and user instructions
2. This repository's instructions and explicit task scope
3. Nested directory instructions
4. Existing project conventions
5. General best practices

Ask for clarification when a missing decision would materially change the implementation. Otherwise make the smallest reasonable assumption and document it.

<!-- /code-foundry-managed: priorities -->

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

<!-- code-foundry-managed: standard-workflow -->

## Standard workflow

1. Restate the desired outcome and identify the files or systems in scope.
2. Inspect before editing; preserve unrelated work.
3. Plan the smallest coherent change.
4. Implement with existing project patterns.
5. Run `npx code-foundry init` for a new checkout, or `npx code-foundry doctor` to diagnose setup drift.
6. Run focused checks while iterating.
7. Inspect the final diff for accidental changes, secrets, formatting, and generated files.
8. Run the broadest applicable validation available.
9. Report what changed, exact checks and results, skipped checks with reasons, risks, and remaining work.

For normal feature work, branch from `main` and target pull requests at `main`. Treat `main` as the protected release branch. Follow `.github/CONTRIBUTING.md` for the complete internal and external contribution flow.

<!-- /code-foundry-managed: standard-workflow -->

<!-- code-foundry-managed: git-workflow-and-merging -->

## Git workflow and merging

This repository uses the `direct` workflow: topic branches **squash** directly into `main`, and the Release Please version PR **squashes** into `main` (`release_merge_strategy: squash`). Feature and release PRs land on `main` with squash merges. No integration branch exists; all pull requests target `main`.

Merge only with the repository's canonical method. Never merge with `--admin`, never default or auto-select a merge method, and never use a method the branch ruleset does not allow. When in doubt, prefer the merge button's configured method and verify the ruleset after merging. Check `.github/CONTRIBUTING.md` for the complete flow and merge table.

### Branch and commit policy

Branch rulesets enforce deletions, force-pushes, required status checks, pull
requests, conversation resolution, and linear history where the repository's
plan supports them. Mirror those rules even where the plan cannot enforce
them:

- Branch from the default branch using
  `feat/*`, `fix/*`, `chore/*`, `refactor/*`, `docs/*`, or `test/*` names.
- Never push directly to protected branches; open a pull request.
- Use Conventional Commit subjects (`feat:`, `fix:`, `chore:`, …); Release
  Please depends on them to version releases.
- Keep pull requests focused; merge with the canonical method only after
  required checks pass.

<!-- /code-foundry-managed: git-workflow-and-merging -->

<!-- code-foundry-managed: pull-request-policy -->

## Code Foundry workflow policy (mandatory)

This repository uses the `direct` workflow. Topic pull requests target `main`.

- Open every ordinary pull request as a draft. Use `gh pr create --draft` or
  set `draft: true` in the GitHub API; never create a ready ordinary pull
  request as a shortcut.
- Keep ordinary pull requests in draft while preparing them. The generated
  Draft Guard converts ready ordinary pull requests to draft when they are
  opened or reopened, and runner-heavy validation starts only after an
  explicit `ready_for_review` transition unless `draft_protection: false` is
  configured for generated callers. That opt-out does not disable Draft Guard
  or draft-PR automation. Cloudflare reusable callers use
  `draft-protection: false`.
- Run local validation and finish review preparation before marking an ordinary
  pull request ready. Ready pull requests stay ready when new commits arrive,
  and validation reruns for the current head; draft updates allocate no
  validation runner until the pull request is ready.
- This contract is mandatory for every agent scope. Nested `AGENTS.md` files
  may add stricter rules but must not weaken or replace it.
- Release Please version pull requests are managed by the Code Foundry release
  workflow; do not manually change their draft state unless the workflow asks.

<!-- /code-foundry-managed: pull-request-policy -->

<!-- code-foundry-managed: toolchain-and-dependencies -->

## Toolchain and dependencies

- Follow `toolchain: auto` in `.github/code-foundry.yml`; use native tools by
  default and reuse mise only when the repository already has `.mise.toml`.
- If `toolchain: mise` is selected, run `mise install` before validation.
- Use the package manager indicated by the existing lockfile:
  - `bun.lock` or `bun.lockb` → Bun
  - `pnpm-lock.yaml` → pnpm
  - `yarn.lock` → Yarn
  - `package-lock.json` → npm
- Use the existing Python environment and dependency manifest. Prefer a project-managed virtual environment.
- Use Cargo commands and the committed Cargo lockfile for Rust projects.
- Do not mix package managers or regenerate lockfiles as a side effect.
- Keep dependency additions narrowly scoped and explain security, licensing, and runtime impact.

<!-- /code-foundry-managed: toolchain-and-dependencies -->

<!-- code-foundry-managed: validation -->

## Validation

Use the shared scripts when present. They detect supported tools and skip inapplicable checks:

```sh
node src/runtime.mjs ci format
node src/runtime.mjs ci lint
node src/runtime.mjs ci type_check
node src/runtime.mjs ci build
node src/runtime.mjs ci unit
node src/runtime.mjs ci integration
node src/runtime.mjs ci e2e
node src/runtime.mjs ci smoke
node src/runtime.mjs ci eval
node src/runtime.mjs ci performance
Security and dependency audits run through the GitHub Security workflow.
```

Run focused tests first, then the complete applicable set for release, security, workflow, dependency, and configuration changes.

At minimum:

- TypeScript/JavaScript: Oxfmt formatting, Oxlint linting, type-check, build, and Bun's native test runner for unit/integration tests; use the project's native browser runner for E2E tests. Repositories using a different linter or formatter keep full control through their own `lint`/`format` scripts, which the runtime honors.
- Do not add Vitest. Preserve specialized native runners such as Matchstick for The Graph and Hardhat for smart contracts.
- Rust: default rustfmt, Clippy with warnings treated as errors, check, unit/integration tests, and dependency audit
- Python: Ruff formatting and linting, compile or type checks, pytest, coverage, and dependency audit
- Mixed projects: validate each active ecosystem and its integration boundaries

If a check cannot run, state the exact reason. A skipped check is not a passing check.

The generated `.githooks/pre-commit` gate is change-aware so parallel work on a
shared checkout is not serialized behind repository-wide checks. It blocks
whitespace errors, formats and lints only staged files, runs the project's
type-check command only when typed sources or compiler configuration are
staged, and does not build unless `pre_commit_build: true` is set. Passing the
hook is not full validation: run the broader checks above before opening or
readying a pull request.

<!-- /code-foundry-managed: validation -->

## Shared web UI and theme

- In `apps/web`, import components from `@adea-ai/ui/components/*`, shared helpers from `@adea-ai/ui/lib/*`, and the theme stylesheet from `@adea-ai/ui/theme.css`. Do not recreate shared components, generic class helpers, or variants locally.
- Use shared controls for interactive elements. Do not import or re-export the bare shared `Button`; use `ActionButton` or an interactive `ListRow` for actions. Every app-rendered shared `ActionButton` (including aliases, local re-exports, and values passed through an `as` prop) and every interactive `ListRow` (`as="button"`, `as="a"`, or with `onClick`) must have a helpful explicit `tooltip` prop; punctuation-only placeholders and prop spreads do not satisfy this help contract. Shared compound controls such as `SideRail` own their own help. A semantic shared `FieldSet` needs a shared `FieldLegend` child or explicit `aria-label`/`aria-labelledby`; use the shared `FieldGroup` for layout-only grouping. Do not add raw interactive HTML controls (including `<details>` and `<summary>`) or dynamically select native controls.
- Let `@adea-ai/ui` own theme tokens and shared component visuals. App CSS may style native domain content and layout with shared tokens; it must not redefine theme tokens or visually restyle shared components through custom classes or `data-slot` selectors. Do not set padding or block sizing on shared controls; choose their shared size variant. Keep width and flex placement in the app layout, and keep a shared control's root display mode; put grid/block/flex arrangement on an inner domain wrapper. A contextual `display: none` may hide a shared control when needed.
- Do not use JSX inline styles or `classList` in the application; use shared layout primitives for geometry and static object-form classes for conditional classes. Do not weaken shared UI rules in overrides or add class exemptions. See `docs/web-ui-standards.md` for the detailed contract.
- Run `bun scripts/check-web-ui-contract.mjs`, `bun test scripts/check-web-ui-contract.test.mjs`, and `bunx oxlint --deny-warnings apps/web/src` when changing the web UI or its contract.

<!-- code-foundry-managed: tests-and-coverage -->

## Tests and coverage

- Add or update tests for behavior changes and regressions.
- Keep unit, performance, integration, E2E, and smoke coverage in the suite where each applies.
- Preserve project-specific coverage thresholds; do not lower them to make CI green.
- Keep test data deterministic and remove secrets from logs and fixtures.
- Use the narrowest test command while iterating, then run the affected package or workspace suite.

<!-- /code-foundry-managed: tests-and-coverage -->

<!-- code-foundry-managed: github-workflows-and-configuration -->

## GitHub workflows and configuration

- Keep workflows concise, independently runnable, and safe to re-run.
- Use `push` for `main` and `pull_request` for `main` unless a workflow has a documented event-specific reason.
- Give workflows clear names and jobs concise names; avoid repeating the workflow name in the job name.
- Use per-workflow concurrency groups keyed by pull request or ref that cancel superseded pull-request runs while allowing independent workflows to run in parallel. Do not cancel in progress for pushes to `main`, release, publication, or deployment runs; let them queue.
- Do not put `always()` on heavy jobs: it keeps a cancelled run alive and holding its concurrency group. Use `!cancelled()` for jobs that must run after upstream failures, and keep `always()` for lightweight aggregate gates only.
- Keep setup language-aware and cache dependency downloads by lockfile; do not cache secrets, `node_modules`, virtual environments, or broad build output without a measured reason.
- Use least-privilege permissions and pin action versions consistently with the template.
- Keep CI, Test, Security, CodeQL, Draft Guard, Draft PR, Release PR, and Release concerns separated.
- Security and CodeQL may skip when repository visibility or GitHub plan support does not permit them. Do not make an unavailable check required.
- Optional Turborepo Remote Caching uses `TURBO_TOKEN` and `TURBO_TEAM`; do not add Vercel deployment behavior just to enable caching.
- Update branch protection when adding or renaming required job checks; verify the actual GitHub status context.

<!-- /code-foundry-managed: github-workflows-and-configuration -->

<!-- code-foundry-managed: documentation-and-generated-files -->

## Documentation and generated files

- Update documentation when behavior, setup, configuration, commands, or operational procedures change.
- Keep `.env.example` limited to variable names and safe placeholders.
- Do not commit build output, caches, coverage output, dependency directories, generated credentials, or temporary files.
- Preserve formatting and line-ending conventions from `.editorconfig` and `.gitattributes`.

<!-- /code-foundry-managed: documentation-and-generated-files -->

<!-- code-foundry-managed: completion-report -->

## Completion report

End every agent task with:

```text
Summary:
Files changed:
Validation:
Skipped checks:
Risks or follow-up:
Branch/PR:
```

Use exact command names and outcomes. Mention external changes separately from local changes, and distinguish completed work from recommendations.

<!-- /code-foundry-managed: completion-report -->

## Repository-specific working guidance

Code Foundry owns the managed blocks above. Run its sync before applying
repository-specific additions outside those blocks.

The repository maps, commands and draft-WIP workflow below supplement the original
guide above. For ordinary authorized work, the draft-WIP workflow below clarifies
earlier boilerplate: commit and push incomplete work to the task's draft branch
throughout the task and before handoff; report failing or skipped checks there.
Review and applicable passing checks gate readiness and merge, rather than WIP pushes.

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
check.

From the repository root:

```sh
bun run format:check       # Oxfmt
bun run lint               # web UI contract and Oxlint
bun run docs:check         # Python documentation consistency checker through uv
bun run typecheck          # web only
bun run type-check         # Python mypy, Rust all-target check and web types
bun run test               # isolated JavaScript suites
bun run test:unit          # lockfile, JS, Python, docs, Rust eval and production web build
bun run test:integration   # Python integration lane
bun run test:smoke         # Python smoke lane
bun run test:eval          # Rust evaluation integration test
bun run build              # production web build and bundle budget
bun run desktop:check      # desktop check script
bun run desktop:test       # desktop test script
bun run desktop:test:native
```

Root Cargo defaults include the runtime and four member crates; the Tauri crate is
excluded and has its own desktop commands. The JS runner defaults to at most four
parallel groups, bounded by CPU availability and group count;
`CORTANA_TEST_MAX_PARALLEL=1` helps diagnose flaky runs. The `test:unit` runner
also validates the Cargo lockfile, runs Rust evaluation and builds the production
web app alongside JavaScript, non-integration Python and docs checks. Use the relevant
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
