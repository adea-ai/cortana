# Top bar keyboard order against the two-row bar

- **Issue:** [#2568](https://github.com/adea-ai/cortana/issues/2568) — design system consistency: audit findings and local CSS cleanup.
- **Finding:** [#2599](https://github.com/adea-ai/cortana/pull/2599) (merged 2026-10-19), the "Tab order in the two-row layout" row of its status table.
- **Source state:** `main` @ `19a4031f8aaf41da33c2defa4f6fc3c2aa12da39`, `apps/web` 0.70.0, `@adea-ai/ui` 0.146.0, `@adea-ai/themes` 0.10.10.
- **Measured on:** macOS 26.7.1 (25G241), arm64; Bun 1.4.3; Playwright 1.63.0's Chromium (Chrome Headless Shell 153.0.8010.12); the production renderer served from `apps/web/dist` by `vite preview`.
- **Result: the finding does not reproduce in the current header.** The Tab order follows the visual order on the one-row bar and on the two-row bar. The coverage that keeps it that way is in this branch.

## The finding as recorded

[#2599](https://github.com/adea-ai/cortana/pull/2599) recorded the header's two-row layout with the keyboard order and the visual order disagreeing:

> Tab order in the two-row layout — Open, upstream. Reproduction: viewport 390 px wide with 200% text (also 320 px at 100% and 200%), Tab from the top. Actual: Toggle navigation (row 1), Search (row 2), Reflect (row 2), System status (row 1), Actions (row 1). Visual order: Toggle, System status, Actions, then Search, Reflect. Focus drops to row 2 and returns to row 1. No control is unreachable, offscreen or clipped. … Cause: for a wide bar narrower than 19rem, `TopBar` moves its centre to `row-start-2` while the trailing group stays on row 1, and DOM order is leading, centre, trailing. That is UI package CSS, so this PR does not change it and adds no override; the fix belongs in `@adea-ai/ui`.

[#2602](https://github.com/adea-ai/cortana/pull/2602) named it as follow-up 1 of 3 from #2599 and left it open: _"The two-row Tab order (follow-up 1) is an `adea-ai/ui` item that is not part of this PR and is pending a product decision."_

## Why it no longer reproduces

[#2605](https://github.com/adea-ai/cortana/pull/2605) replaced the header's `TopBar` with the shared `ShellTopBar` and moved the search and Reflect out of the bar's centre track into its trailing group. The bar's DOM order is now the leading group and then the trailing group, and wrapping the bar does not reorder it, so the order the eye reads and the order the keyboard walks are the same order in both layouts. The shared centre slot that produced the finding is not rendered.

## The measurement

Every case below walks the Tab order through the header's controls and compares it with the order the same controls are drawn in (row by row, then left to right). The two-row bar is the 320 px bar at 200% text: the navigation toggle on the first row and the trailing group on the second.

| Width   | Root text | Bar rows | Keyboard order                                                                                                                 | Visual order | Result |
| ------- | --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------ |
| 320 px  | 100%      | 1        | Toggle navigation → Search and reflect → System status → Actions                                                               | the same     | pass   |
| 320 px  | 200%      | 2        | Toggle navigation → Search and reflect → System status → Actions                                                               | the same     | pass   |
| 390 px  | 100%      | 1        | Toggle navigation → Search and reflect → System status → Actions                                                               | the same     | pass   |
| 390 px  | 200%      | 1        | Toggle navigation → Search and reflect → System status → Actions                                                               | the same     | pass   |
| 768 px  | 100%      | 1        | Toggle navigation → Search and reflect → System status → Actions                                                               | the same     | pass   |
| 768 px  | 200%      | 1        | Toggle navigation → Search and reflect → System status → Actions                                                               | the same     | pass   |
| 1024 px | 100%      | 1        | Previous search query → Next search query → Collapse sidebar → Switch workspace → Search and reflect → System status → Actions | the same     | pass   |
| 1024 px | 200%      | 1        | the same seven controls                                                                                                        | the same     | pass   |
| 1440 px | 100%      | 1        | the same seven controls                                                                                                        | the same     | pass   |
| 1440 px | 200%      | 1        | the same seven controls                                                                                                        | the same     | pass   |

Captures: `header-keyboard-order-320-100.png` (the one-row bar) and `header-keyboard-order-320-200.png` (the two-row bar).

## The coverage added

- **`scripts/capture-m7-visuals.mjs`** — the hosted "Capture and audit (chromium)" job now walks the header's keyboard order at 320 px with 200% text, where the bar wraps, and fails when the order the keyboard walks is not the order the bar draws, when a keyboard stop falls outside the viewport, or when the bar stops wrapping (which would leave the check testing nothing). The wrapped bar is waited for: a root text-size change reflows the bar and the shell re-reads its own measurements afterwards, so the layout is read only once it has stopped moving.
- **`apps/web/src/components/m7/M7ApplicationHeader.test.tsx`** — the header's controls are pinned to the order the bar draws them, and the search is pinned to the trailing group rather than the shared centre slot, which the bar moves to a second row while the DOM keeps it before the trailing group.

### Negative control

The check was run against a deliberate reproduction of the finding's cause: the trailing group moved to the front of the DOM and the rows ordered so the eye still reads the leading group first. The check then reported the disagreement it is there to catch:

```
visual  : Toggle navigation → Search and reflect → System status → Actions
keyboard: Search and reflect → System status → Actions → Toggle navigation
```

## Known limitations

- Chromium only. The hosted pull-request job runs the Chromium leg; WebKit and Firefox are not run.
- 200% text is emulated with the root font size, as the existing capture script does. Real browser zoom and operating-system text scaling are not covered here.
- The demo fixture in the production renderer is the surface measured; the packaged desktop window, its native insets and the frameless drag region are not covered.
- **Observed, not changed:** on the two-row bar at 320 px with 200% text, the trailing group is drawn below the bar's own box (the bar measures 193 px while its trailing row ends at 288 px), so it overlaps the page content. That is a layout finding of its own, outside this scope; the keyboard order is unaffected.

## Linked issues

- #2568 — the audit findings this belongs to. It stays open.
- #2599 — the finding's record.
- #2602 — the follow-up that left the two-row Tab order open.
