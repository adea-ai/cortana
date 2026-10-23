# B1 composed canvas sources (working copy, not published)

Source of the composed Cortana canvas boards for the B1 repair. The live canvas artifact 3fe3d3a4 (url 8taxEWNmorL69bc58MpS79) is still at version 1792723423-e8f6 and is not changed by this branch.

## Status

- Not published to the canvas. Publish is held until every changed board is under 1% against live captures.
- 178 boards are declared in `project/canvas.json`, and the 178 `.dc.html` files on disk match them exactly (checked by `inventory.test.mjs`).
- 51 boards differ from the e8f6 baseline in a render comparison.
- Live reference status: KnowledgeEvidence, KnowledgeDocument, KnowledgeEmpty, SetSources and Rail have references from earlier captures.
  KnowledgeAnswer and SidebarCollapsed references were overwritten on 2026-10-23 at 21:24–21:26 by a harness run that landed on the Document tab, so they are not valid. Their earlier measurements (4.8% and the sidebar figures) cannot be reproduced yet and are withdrawn until re-captured.
- Unverified (44 changed boards, plus the two above): no valid live capture yet. Their changes are not accepted visually.
- Remaining gap: KnowledgeAnswer is about 4.8% whole-board against live, above the 1% goal.

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
