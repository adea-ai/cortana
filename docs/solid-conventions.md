# SolidJS conventions

High-performance SolidJS rules for `apps/web`. These exist so the shell stays native to Solid's
fine-grained reactivity instead of carrying React-era assumptions forward.

## Signals and stores

- Use `createSignal` for scalar UI state (tabs, errors, loading flags).
- Use `createStore` + `reconcile` for polled snapshots that list views consume. `reconcile` keys
  array items by `id` and preserves object identity for unchanged records, so a 1–15 s poll that
  returns the same data does not invalidate every memo and `For` row downstream.
- Signal setters wrap store writes when the read side needs an accessor:
  `const status = () => snapshot.value`.
- **Store ownership rule**: a `createStore` proxies the object you hand it, and `reconcile`
  writes differences _into_ that object. Never seed or update a store with an object that is
  owned or long-lived elsewhere (a prop snapshot, a shared fixture, another signal's value) —
  leaf writes would silently mutate the shared copy. Store-fed inputs must be owned by the
  store: fresh API responses and `unwrap`ped cache copies are safe; a settings draft seeded
  from a shell-owned prop is not, which is why the draft stays a signal.
- Never store the same fact twice. If a value is computable from other reactive state, use
  `createMemo` or a plain accessor — not a synchronized copy.

## Effects

- `createEffect` is for talking to the outside world: network requests, timers, DOM listeners,
  `localStorage`. Everything inside it that decides whether work happens should read its reactive
  dependencies synchronously so they stay tracked.
- `createComputed` (runs during the computation phase, before paint) is the right primitive for
  writes that derive or redirect state read by render — tab redirects, prop-transition resets.
- A bare `if (props.x !== previous) { ... }` in a component body runs **once** at setup — it is a
  broken `getDerivedStateFromProps` translation and silently dead. Track the previous value in a
  `let` and compare inside an effect instead.
- Merge scope-reset and fetch logic into one effect. Splitting them across effects keyed on a
  shared string invites drift (the retry nonce that reset state without refetching is the example
  to avoid: every input that should trigger a request must be read inside the fetch effect).
- Abort in-flight work in `onCleanup`, and keep a request generation counter so a stale response
  can never overwrite a newer scope.

## Rendering and lists

- `For` is keyed by item identity — it works best with reconciled stores, where unchanged items
  keep the same proxy and their rows are not rebuilt. `Index` is for primitives that are
  recreated each render.
- Do not wrap a single-group list in an extra grouping layer; it rebuilds the row identity every
  update.
- Keep per-row `class`/`style` strings cheap: a plain concatenation beats `cn()` in rows rendered
  hundreds at a time inside a virtualized list.
- DOM refs and slots passed to children keep the `{ current }` object shape; pure-logic mutable
  slots (request ids, abort controllers, in-flight sets) are plain `let`/`const`, not
  `useRef`-style objects.

## Loading and caching

- Lazy (`lazy()` + `Suspense`) is for secondary surfaces: Settings, the command palette. The app
  shell itself is a static import so there is no entry→shell waterfall.
- Scope-keyed bounded caches (`createBoundedCache`) provide stale-while-revalidate: a scope
  round-trip paints the remembered snapshot instantly while the fresh request revalidates it.
  Bounded — never an unbounded `Map` on session data.
- Invalidate caches on every input that changes what the data means: settings saves clear the
  document and graph caches because a save can change workspaces, sources, or index scope.
- Hover prefetch warms the detail cache (`prefetchDocument`) — a strong open intent at zero
  idle-time cost beyond one deduplicated request per id.
- Polling pauses on `useDesktopForeground()` going false; nothing should poll while hidden.

## Shared primitives

- `createMediaQuery` (`src/lib/mediaQuery.ts`) — one shared `matchMedia` subscription per query
  text; do not register per-component media listeners.
- `useDesktopForeground` (`src/lib/foreground.ts`) — shared visibility/focus signal; never create
  a second `visibilitychange` listener.
- `createBoundedCache` (`src/lib/boundedCache.ts`) — insertion-ordered LRU for SWR snapshots.
- `VariantButton` (`src/components/cortana/VariantButton.tsx`) — the shared Cortana variant
  vocabulary over the shadcn button; do not add another local variant-mapping wrapper.

## Budgets

`scripts/check-web-bundle-budget.mjs` enforces the initial-graph, complete-graph, and CSS budgets
in the build. The initial graph is the entry chunk plus the static `App.tsx` chain; lazy surfaces
must stay outside it. Do not lower budgets to make a build pass — tighten the graph instead.
