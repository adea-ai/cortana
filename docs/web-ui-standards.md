# Web UI standards

Cortana consumes the published `@adea-ai/ui` and `@adea-ai/themes` packages. The shared UI library owns controls, compound components, accessibility behavior, typography, spacing variants, fonts, and semantic tokens. Themes owns the palette catalogue and provenance. Cortana owns source, document, graph, memory, and operational behavior.

Package versions are declared in the root `package.json` (shared UI lint dependency) and `apps/web/package.json` (web dependencies); `bun.lock` records the resolved versions. Treat those manifests and the lockfile as authoritative instead of duplicating version numbers in this guide.

## Component ownership

Use canonical subpaths so lint can identify each component; root-barrel imports are rejected. Keep the root lint dependency and web UI dependency at the same version. Import shared components from `@adea-ai/ui/components/*` and utilities from `@adea-ai/ui/lib/*`. Do not import or re-export the bare `Button` from `ui/button`; use `ActionButton` or an interactive `ListRow` for actions. Pure re-exports of the supported shared API may preserve application terminology. Generic components, control wrappers, variants, class utilities, and accessible control implementations belong in the shared library. Use shared ListGroup/ListRow for utility and evidence lists, Kbd for keyboard keys, Badge for metadata pills, and Table for configuration tables; native anchors, keyboard keys, progress indicators, meters, and tables are rejected. Add missing capabilities there and consume a published version; do not copy implementation files into Cortana or add local package aliases.

| UI need                                       | Shared component                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------- |
| An action, including disabled or busy actions | `ActionButton`, with an explicit informative `tooltip`                             |
| Navigation, application frame, panels         | `AppShell`, `SideRail`, `TopBar`, `Sheet`, `ResizablePanelGroup`                   |
| Settings sections and labelled controls       | `SettingsSection`, `FormField`, `NumberField`, `ValueCombobox`, `SecretInputGroup` |
| State and feedback                            | `StatusChip`, `Alert`, `EmptyState`, `Spinner`, `Progress`                         |
| Expandable information                        | `Accordion`                                                                        |
| Virtualized rows and graph placement          | `VirtualWindow`, `OrbitLayout`, `OrbitItem`                                        |

Keep disabled actions discoverable when their help explains a prerequisite. Shared ActionButton owns activation guards and accessibility semantics; consumers must not replace those guards with styling. Interactive ListRow instances (`as="button"`, `as="a"`, or `onClick`) also require helpful tooltip text; punctuation-only placeholders do not count. Labels, hints, validation errors, and the actual focusable control must have real ID relationships. Use shared fields to maintain them. SettingsSection owns its body spacing: choose `bodyLayout="content"` for forms and mixed content, and the default row layout for settings rows. ListRow owns its description height and padding; do not recreate them in application CSS.

Prose links use shared `TextLink`; file downloads use `downloadBlob` from `@adea-ai/ui/lib/download`. Native anchors, including DOM-created anchors, are prohibited. Keep JSON serialization and other domain payload work in Cortana.

Use shared `SkipLink` from `components/layout/app-shell` before navigation, with a focusable `main-content` destination.

Workspace logo storage and upload validation belong in Cortana. Render the image or fallback with shared `EntityIcon`, using its `src` and size variants; do not rebuild logo tiles with custom appearance CSS.

Use shared `Spinner` size variants and its `label` prop for loading indicators. Pass `label={false}` when nearby text already describes the state. Do not import Lucide loading icons or recreate their animation in application CSS.

Shared `FieldSet` is semantic: give it a shared `FieldLegend` child or an explicit `aria-label` or `aria-labelledby`. The legend must have text and be a direct child; `aria-labelledby` must reference an ID declared in the same view. Use the shared `FieldGroup` for layout-only grouping so a screen reader does not encounter an unnamed group.

Domain views may compose shared components and render semantic document content. Native buttons, form controls, labels, disclosure elements, interactive layout elements, and direct primitive-library imports are prohibited. Shared compound controls own their internal interaction and help.

Use the published `AboutDialog`, `HelpCenter`, `UpdateDialog`, and `AccountMenu`/`createAppMenuItems` for app identity, help, updater, and account-menu support surfaces. Keep native updater transport, confirmation, cancellation, and external-URL handling in Cortana's adapter; pass the complete compiled changelog without truncating it. On desktop, compose app actions in the shared `AccountMenu`; in the modal mobile navigation sheet, render those same `createAppMenuItems` as direct shared `SideRailItem` rows. Do not put a portaled `AccountMenu` inside the sheet: its popup is hidden from assistive technology while the modal sheet is open. For the macOS overlay title bar, start dragging through Tauri's `startDragging()` only on primary-pointer presses outside interactive controls, and grant only its required window permission. Other desktop platforms keep native title-bar dragging.

## Styling

Use shared variants for appearance and static layout utilities for placement. Application CSS may arrange domain content and style canonical document or graph artwork with shared tokens. Do not redefine theme tokens or restyle shared controls through classes, roles, slots, or descendant selectors. CSS must not set padding, height, min-height, max-height, or their logical block-size equivalents on `Button`, `ActionButton`, `Input`, `NativeSelect`, `Checkbox`, `Switch`, `Toggle`, `TabsTrigger`, badges, keyboard keys, identity tiles, or loading indicators, whether the selector uses a matched class, control role, or control `data-slot`; choose the shared size variant instead. JSX on those controls also may not set padding, height, or root display utilities, including responsive/state/arbitrary variants, object-form class maps, const aliases, or static prop spreads; `hidden` is allowed for contextual hiding. Arbitrary descendant variants may not reach into shared component internals such as buttons or control `data-slot`s. This leaves normal layout padding, responsive/state layout utilities, width, and flex placement available on components such as `SheetContent` and `Card`. Place layout for a shared control root on an inner domain wrapper. Generic layout components such as `Card` may keep their domain padding and dimensions.

Consumer JSX must have no `style` or `classList` props, including CSS custom properties and static object spreads hidden behind local aliases. Use shared geometry props for variable dimensions. Imperative DOM style mutations and raw control creation are rejected too. Do not add UI or accessibility rule suppressions, path exemptions, wildcard class allowlists, or ignore patterns covering any application source. All shared lint rules are errors. Keep both shared lint plugins loaded in every override, preserve the shared component source, and do not exclude imports or source paths. The root configuration owns the web lint policy; nested replacement configs and blanket, UI, or accessibility rule suppressions are rejected. The contract reads the installed library’s rule catalogue, so a newly published rule must be enabled before its dependency upgrade can pass.

Keep DOM order consistent with keyboard and reading order. At narrow widths, use shared sheets or a flowing layout rather than overlapping controls. Preserve focus when closing overlays, give icon actions useful names and tooltips, and keep status meaning available as text.

## Required validation

Run the following after a web UI change:

```sh
bun install --frozen-lockfile
bun run format:check
bun run lint
bun test scripts/check-web-ui-contract.test.mjs
bun run typecheck
bun run build
bun run test
```

`lint` and the production build both run the architecture contract. The contract rejects copied UI, primitive-library access, raw controls, styling bypasses, missing action help, and unpublished package substitutions. Keep the existing bundle budgets.

For visual or interaction changes, build and preview the production app, then run `scripts/capture-m7-visuals.mjs` against that preview and `node scripts/e2e-journeys.mjs` for search evidence, citation copying, memory approval, and workspace persistence. Keep journey locators tied to accessible roles and names so replacing components preserves behavior checks. The default visual audit discovers every dark theme offered by the shared catalogue and runs at 320, 768, 1024, 1440, and 1920 pixels. CI runs both Chromium and WebKit on ready transitions and subsequent ready-PR updates. Retain theme, breakpoint, populated and empty view, overlay, keyboard, zoom, contrast, and Axe coverage. Exercise source setup, settings sections, graph filtering, operational actions, and disabled or busy states. A green lint or unit test does not replace this browser evidence; demo browser evidence does not establish packaged native or manual assistive-technology acceptance.

Update `NOTICE` from the exact installed published package notices when dependencies change. Keep release evidence and native acceptance in their owning records.
