# B1 composed canvas sources (working copy, not published)

Source of the composed Cortana canvas boards for the B1 repair. The live canvas artifact 3fe3d3a4 (url 8taxEWNmorL69bc58MpS79) is still at version 1792723423-e8f6 and is not changed by this branch.

## Status

- Not published to the canvas. Publish is held until every changed board is under 1% against live captures, and until the 178-board regression is rerun.
- 178 boards are declared in `project/canvas.json`. The 178 `.dc.html` files on disk match them exactly (checked by `inventory.test.mjs`).
- Changed-board accounting is in the section below, "Changed-board accounting". Earlier figures of 50 listed and 51 with NavExpanded are historical and are not used.
- Visual acceptance: none. No board is accepted on the basis of a capture alone.

## Live evidence

Captures live in `/mnt/project-files/cortana/canvas-redraw-2026-10-23/` (previous) and in the scratchpad `b1-v31/real/` and `b1-v31/real/v2/` (new). Only captures verified by state are listed here.

Valid current references (origin/main 6fc6d59 build on 127.0.0.1:4181, captured by `harness/kn-main-capture.mjs`, which checks the Answer tab, the Evidence brief, the Work chip and the sidebar state before saving; compared against the composed board at 1440x900):
- KnowledgeAnswer: `real/v2/kn-answer-main6fc6d59-2026-10-23T21-46-15-267Z.png`. Historical: 5.109% raw on the committed source before the Header49 change (85ea124). Current measurement at bd4da55: 3.824% raw.
- SidebarCollapsed: `real/v2/kn-collapsed-main6fc6d59-2026-10-23T21-46-25-868Z.png`. Historical: 6.405% raw on the committed source before the Header49 change (85ea124). Current measurement at bd4da55: 5.465% raw.

Stale (taken from the 2026-10-19 build, which lacks the current main chrome; not used for acceptance): KnowledgeEvidence, KnowledgeDocument, KnowledgeEmpty, SetSources and its variants, and the `real/v2/kn-answer-2026-10-23T21-*` runs, which were on the stale build. The 6.71% and 4.8% figures are historical.

Lost or unverified (do not use):
- `real/kn-answer-1440.png`, `real/kn-collapsed-1440.png` and `real/kn-doc-1440.png` were overwritten at 21:24–21:26Z by `kn-states.mjs`, which landed on the Document tab. They are gone, with no backup.
- The earlier KnowledgeAnswer figure of 4.8% and the SidebarCollapsed figures came from those lost files. They are historical and not reproducible.
- Rail has no valid live reference. Its only measurement used `kn-answer-1440.png`, which is lost.

## Changed-board accounting

Against the original e8f6 baseline render (`composed/before`, the composed-route baseline with no manifest, so compared with `--legacy-baseline`):

- At committed source bd4da55, from the manifested run `20261023T221206Z-23d0d3d3` (`harness/compare_renders.py`, output in the scratchpad): 175 boards have a baseline render. 129 changed, 46 unchanged. 3 have no baseline render and are unverified: HeaderEnlarged, SearchMenu, SystemStatusWrapped. 9 changed boards have a current capture and 120 do not.
- At 02ad20d, before the StatusBar label fix (bd4da55), the same comparison gave 128 changed, 47 unchanged, 3 unverified, with 9 captured and 119 not. The one difference is StatusBar itself, which moved from unchanged to changed.
- Not in the declared 178 and not counted: NavExpanded, ProposedThemeDefault, ProposedThemeOverride.
- The earlier 50 listed / 51 with NavExpanded set described the pre-Header49 candidate. It is historical and is not used for any count.
- Acceptance: none. The nine captured boards are all above 1% raw. Visual acceptance is not claimed for any board, and the canvas stays unpublished.

Current valid captures beyond the two above (main 6fc6d59, state-checked, unique names under `real/v2/`): SystemStatus 2.133%, MoreMenu 2.082% (live shows a focus outline the board lacks), WorkspaceMenu 2.366%, UserMenu 2.136%, AgentTools 2.049%, Inbox 0.688%, Graph 0.800%. All figures are raw full-frame on the committed sources at e42ba90 and are not accepted.

Chrome finding (measured 2026-10-23, applied in e42ba90 "design: apply the 49px header chrome to the B1 sources"):
- Against main 6fc6d59 the composed Header is 1px short. Main's header border sits at y=48 and the composed border at y=47. The 10-19 build also had the border at 47, so this is a real change on main, not a capture artifact.
- Historical (pre-StatusBar, pre-harness-repair, committed source before Header49): scratch test with Header height 49 (border at 48), rail and panel arithmetic moved to h-49 and h-77 (literal 851 and 823 in SidebarCollapsed), and ContextPanel header back to 48: KnowledgeAnswer 5.109% → 3.851% full frame, header 4.174% → 0.181%, context 6.228% → 6.197%. SidebarCollapsed 6.405% → 5.492% full frame, header 4.172% → 0.178%.
- Patch: applied from `candidates/header-49-chrome.patch` (removed from the tree in the same commit). It touched four files: Header (height 49, preview 49), KnowledgeAnswer and SidebarCollapsed (rail and panel arithmetic), and ContextPanel (header 48). Decision: coordinator, under the design authority delegated by Andrew on 2026-10-23. The app is the source of truth: main measures the header at 49px.
- Scope of the change: Header is shared by 98 boards, and 79 layout sites assume a 48px header (74 literal 852/824 heights, 5 `h - 48`/`h - 76` expressions). Only KnowledgeAnswer and SidebarCollapsed were given the arithmetic in this commit, so the other boards need the same check. Most of them have no current capture, so they stay unverified. Applying the change does not accept them.
- Remaining sidebar difference (KnowledgeAnswer 6.8%, SidebarCollapsed 7.3%) looks like text rasterization. A detail-row margin test moved it by 0.04% and was not adopted. The Slack source block sits 2px low in the composed board; not fixed.
- Harness masks: the sidebar hint shows "Ctrl K" in the live capture and "⌘ K" in the board. The workspace chip shows a text avatar in the live capture and an icon in the board.

Harness notes:
- `kn-states.mjs` is retired. It clicked a document result first, and it overwrites `real/`. Do not run it.
- `kn-answer-v2.mjs` uses the page's "Search your knowledge" input, not a search button, and it writes only to `real/v2/` with a unique name.
- The live app runs from a static server on 127.0.0.1:4180, serving the scratchpad `dist/` build.

## Board inventory

- `project/canvas.json` is byte-identical to the canvas artifact's version 1792723423-e8f6 (sha256 06b58e03…).
- Three boards declared by canvas.json were missing from this branch: `HeaderEnlarged.dc.html`, `SearchMenu.dc.html` and `SystemStatusWrapped.dc.html`. They are now copied from the live artifact of version 1792723423-e8f6. Their sha256 values match the live listing: 41fb96b3…, c045bfb7…, 816900e0….
- Three committed files were not declared by canvas.json. `NavExpanded.dc.html`, `ProposedThemeDefault.dc.html` and `ProposedThemeOverride.dc.html` moved to `unlisted/`. They are not canvas boards. They are kept for reference only and are not published.
- The saved preserve copy at /mnt/project-files/cortana/canvas-redraw-2026-10-23/preserve-e8f6-2026-10-23/ is also missing the three declared boards, so it is incomplete. It has not been changed. The live artifact is the authority for those three files.
- Regression: `node --test design/b1-canvas/inventory.test.mjs`. It checks that order has no duplicates, that boards and order match, and that declared boards equal the files on disk as sets. It fails on the previous commit with "declared but absent on disk".

## Replay dependencies

- 27 listed boards reference the artifact's `/_blob/` images, which do not load under file://. Icons such as the Answer tab mark render blank in local captures. One more file, `unlisted/NavExpanded.dc.html`, also references one, so the tree has 28 in total.
- 164 listed boards load Google Fonts (Space Grotesk, JetBrains Mono) from the network. Local renders use the bundled Space Grotesk file for the same family.
- Replay needs the live artifact's assets, or a local blob map, and network access to Google Fonts. Without them, captures are not comparable to the live app.

## Edits in this branch (relative to e8f6 render sources)

- SourcesPanel.dc.html: source-row name button padding 12px → 6px right; detail line margin -3px 10px 0 38px → 4px 6px -3px 38px; tree grid and column gap.
- ContextPanel.dc.html: header height 48px → 49px, to match the live divider at y=96. Confirmed against live knowledge-1440.png.
- KnowledgeAnswer.dc.html, KnowledgeEvidence.dc.html: SourcesPanel selected="0".
- Inventory: three boards added from the live artifact, three unlisted files moved to `unlisted/`, regression test and this README.

## Not representable in source control

- The live canvas artifact and its version history.
- Live capture PNGs and per-board diff reports, kept in /mnt/project-files/cortana/canvas-redraw-2026-10-23/.
- Platform and demo-state differences kept on purpose: ⌘K vs Ctrl K hint, workspace chip avatar.
