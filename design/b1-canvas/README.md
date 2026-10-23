# B1 composed canvas sources (working copy, not published)

Source of the composed Cortana canvas boards for the B1 repair. Live canvas artifact 3fe3d3a4 (url 8taxEWNmorL69bc58MpS79) is still at version 1792723423-e8f6 and is not changed by this commit. The pre-edit copy of that version is preserved under /mnt/project-files/cortana/canvas-redraw-2026-10-23/preserve-e8f6-2026-10-23/.

## Status

- Not published to the canvas. Publish is held until every changed board is under 1% against live captures.
- 178 boards rendered with 0 errors. 51 differ from the e8f6 baseline.
- Live-verified (7): KnowledgeAnswer, KnowledgeEvidence, KnowledgeEmpty, KnowledgeDocument, SidebarCollapsed, SetSources, Rail.
- Unverified (44): no live capture yet. Their changes are not accepted visually.
- Remaining gap: KnowledgeAnswer is about 4.8% whole-board against live, above the 1% goal.

## Edits in this commit (relative to e8f6)

- SourcesPanel.dc.html: source-row name button padding 12px → 6px right; detail line margin 4px 6px -3px 38px; tree grid and column gap.
- ContextPanel.dc.html: header height 48px → 49px, to match the live divider at y=96. Confirmed against live knowledge-1440.png.
- KnowledgeAnswer.dc.html, KnowledgeEvidence.dc.html: SourcesPanel selected="0".

## Not representable in source control

- Live canvas artifact and its version history.
- Live capture PNGs and per-board diff reports (kept in /mnt/project-files/cortana/canvas-redraw-2026-10-23/).
- Platform and demo-state differences kept on purpose: ⌘K vs Ctrl K hint, workspace chip avatar.
- /_blob/ images do not load under file://, so some icons render blank in local captures.
