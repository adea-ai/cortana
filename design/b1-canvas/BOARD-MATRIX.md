# B1 board matrix (#2624, head 90d2547 plus the change in this commit)

> **HISTORICAL:** the "50 listed / 51 with NavExpanded" changed set and every "Changed" value in the first table describe the pre-Header49 candidate (commits up to c5e6f2e). They are superseded by "Current changed set" below.

One row per board in `project/canvas.json` (178), plus the unlisted `NavExpanded` file.

## Reference status

- **Current** references come from the origin/main build at commit 6fc6d59 (`apps/web` built in a worktree and served on port 4181). Harness: `harness/kn-main-capture.mjs`.
- **Stale** references come from the app build dated 2026-10-19 07:39, which has no "Collapse sidebar" control. They are kept only as history. Do not use them for acceptance. The 10-19 build differs from main, so their diffs are not comparable to the current build.
- **Lost** references were overwritten on 2026-10-23 at 21:24–21:26Z by a harness run that landed on the Document tab. They are gone.

| Reference | Board | Build | File | Diff vs composed (raw %) | Status |
|---|---|---|---|---|---|
| current | KnowledgeAnswer | 6fc6d59 | `real/v2/kn-answer-main6fc6d59-2026-10-23T21-46-15-267Z.png` | 3.851 (was 5.109 before e42ba90) | state verified before save (Answer selected, Work chip) |
| current | SidebarCollapsed | 6fc6d59 | `real/v2/kn-collapsed-main6fc6d59-2026-10-23T21-46-25-868Z.png` | 5.492 (was 6.405 before e42ba90) | state verified before save (Answer selected, Work chip, sidebar collapsed) |
| stale | KnowledgeEvidence | 2026-10-19 | `real/kn-evidence-1440.png` | not re-measured | do not use |
| stale | KnowledgeDocument | 2026-10-19 | `real/kn-document-1440.png` | not re-measured | do not use |
| stale | KnowledgeEmpty | 2026-10-19 | `real/knowledge-1440.png` | not re-measured | do not use |
| stale | SetSources | 2026-10-19 | `real/sources-1440.png` | not re-measured | do not use |
| stale | SetSourcesEmpty | 2026-10-19 | `real/mock-empty-root-1440.png` | not re-measured | do not use |
| stale | SetSourcesWorkspaceEmpty | 2026-10-19 | `real/mock-workspace-empty-1440.png` | not re-measured | do not use |
| stale | SetSourcesJobRunning | 2026-10-19 | `real/mock-job-running-1440.png` | not re-measured | do not use |
| stale | KnowledgeAnswer | 2026-10-19 | `real/v2/kn-answer-2026-10-23T21-37-50-607Z.png` | 6.706 (old build) | do not use |
| lost | KnowledgeAnswer | 2026-10-19 | `real/kn-answer-1440.png` | 4.8 (historical, unreproducible) | overwritten 21:26Z |
| lost | SidebarCollapsed | 2026-10-19 | `real/kn-collapsed-1440.png` | n/a | overwritten 21:25Z |
| lost | (Rail) | 2026-10-19 | `real/kn-answer-1440.png` | 2.59 (historical) | no valid reference |
| lost | (kn-doc) | 2026-10-19 | `real/kn-doc-1440.png` | n/a | overwritten 21:24Z |

## Board rows

| Board | Page | Changed | Changed % vs baseline | Current reference | Diff vs current reference % |
|---|---|---|---|---|---|
| Main | App map | no |  | none |  |
| Header | Shell parts | no |  | none |  |
| StatusBar | Shell parts | no |  | none |  |
| Rail | Shell parts | no |  | none |  |
| SourcesPanel | Shell parts | yes | 1.186 | none |  |
| ContextPanel | Shell parts | yes | 1.645 | none |  |
| SettingsNav | Shell parts | no |  | none |  |
| KnowledgeAnswer | Knowledge | yes | 3.226 | `kn-answer-main6fc6d59-2026-10-23T21-46-15-267Z.png` | 3.851 (was 5.109) |
| KnowledgeDocument | Knowledge | yes | 2.464 | stale only |  |
| KnowledgeEvidence | Knowledge | yes | 3.226 | stale only |  |
| KnowledgeTimeline | Knowledge | yes | 2.831 | none |  |
| KnowledgeEmpty | Knowledge | yes | 2.156 | stale only |  |
| SidebarCollapsed | Knowledge | yes | 1.645 | `kn-collapsed-main6fc6d59-2026-10-23T21-46-25-868Z.png` | 5.492 (was 6.405) |
| Graph | Graph, conversations, tools, inbox, index | no |  | `real/v2/graph-main6fc6d59-2026-10-23T22-02-01-898Z.png` (current, main 6fc6d59) | 0.800 raw (post e42ba90); pre 2.333. State: Graph nav aria-current=page, Work chip |
| Conversations | Graph, conversations, tools, inbox, index | no |  | none |  |
| AgentTools | Graph, conversations, tools, inbox, index | no |  | `real/v2/agenttools-main6fc6d59-2026-10-23T22-02-06-269Z.png` (current, main 6fc6d59) | 2.049 raw (post e42ba90); pre 3.130. State: Agent tools nav aria-current=page, Work chip |
| Inbox | Graph, conversations, tools, inbox, index | no |  | `real/v2/inbox-main6fc6d59-2026-10-23T22-01-57-669Z.png` (current, main 6fc6d59) | 0.688 raw (post e42ba90); pre 1.580. State: Inbox nav aria-current=page, Work chip |
| Index | Graph, conversations, tools, inbox, index | no |  | none |  |
| SetServices | Settings | no |  | none |  |
| SetWorkspaces | Settings | no |  | none |  |
| SetSources | Settings | no |  | stale only |  |
| SetReadiness | Settings | no |  | none |  |
| SetAccess | Settings | no |  | none |  |
| SetAudit | Settings | no |  | none |  |
| SetEmbedding | Settings | no |  | none |  |
| SetQuery | Settings | no |  | none |  |
| SetIngestion | Settings | no |  | none |  |
| SetAdvanced | Settings | no |  | none |  |
| SetMemory | Settings | no |  | none |  |
| WorkspaceMenu | Menus and dialogs | yes | 2.156 | `real/v2/workspacemenu-main6fc6d59-2026-10-23T21-58-53-502Z.png` (current, main 6fc6d59, Work chip, menu open) | 2.366 raw (post e42ba90); pre 2.755 |
| MoreMenu | Menus and dialogs | yes | 1.886 | `real/v2/moremenu-main6fc6d59-2026-10-23T21-58-44-554Z.png` (current, main 6fc6d59, Work chip, Actions menu open) | 2.082 raw (post e42ba90); pre 2.641. Live capture has a focus outline around the menu that the board lacks |
| SystemStatus | Menus and dialogs | yes | 1.863 | `real/v2/systemstatus-main6fc6d59-2026-10-23T21-58-40-691Z.png` (current, main 6fc6d59, Work chip, system status dialog open) | 2.133 raw (post e42ba90); pre 2.716 |
| UserMenu | Menus and dialogs | yes | 2.156 | `real/v2/usermenu-main6fc6d59-2026-10-23T21-58-57-292Z.png` (current, main 6fc6d59, Work chip, user menu open) | 2.136 raw (post e42ba90); pre 2.728 |
| CommandPalette | Menus and dialogs | yes | 2.156 | none |  |
| HelpCenter | Menus and dialogs | yes | 0.053 | none |  |
| About | Menus and dialogs | yes | 0.053 | none |  |
| AddSource | Menus and dialogs | no |  | none |  |
| KnowledgeOffline | Knowledge | no |  | none |  |
| KnowledgeReflection | Knowledge | yes | 2.156 | none |  |
| AgentToolsEmpty | Graph, conversations, tools, inbox, index | no |  | none |  |
| SetSetup | Settings | no |  | none |  |
| SetInstallDesktop | Settings | no |  | none |  |
| InitialSync | Menus and dialogs | no |  | none |  |
| ConfirmAction | Menus and dialogs | no |  | none |  |
| UpdateDialog | Menus and dialogs | yes | 0.053 | none |  |
| ContextSheet | Narrow windows | yes | 2.204 | none |  |
| MobileNav | Narrow windows | no |  | none |  |
| MobileSources | Narrow windows | yes | 1.430 | none |  |
| SettingsPhone | Narrow windows | no |  | none |  |
| SourcesStatusFailed | Shell parts | no |  | none |  |
| SourcesStatusStale | Shell parts | yes | 1.186 | none |  |
| SourcesDocsFailed | Shell parts | yes | 1.208 | none |  |
| SourcesEmpty | Shell parts | no |  | none |  |
| SourcesLoading | Shell parts | no |  | none |  |
| SourcesLoadMore | Shell parts | yes | 2.859 | none |  |
| SourcesLoadingMore | Shell parts | yes | 3.018 | none |  |
| ContextLoading | Shell parts | yes | 0.859 | none |  |
| ContextError | Shell parts | yes | 1.147 | none |  |
| HeaderSearching | Shell parts | no |  | none |  |
| HeaderTablet | Shell parts | no |  | none |  |
| HeaderNarrow | Shell parts | no |  | none |  |
| StatusBarOffline | Shell parts | no |  | none |  |
| KnowledgeDocumentMetadata | Knowledge | yes | 2.464 | none |  |
| KnowledgeDocumentRelations | Knowledge | yes | 2.461 | none |  |
| KnowledgeDocumentSourceError | Knowledge | yes | 2.464 | none |  |
| KnowledgeDocumentTruncated | Knowledge | yes | 2.464 | none |  |
| KnowledgeDocumentOpening | Knowledge | yes | 2.464 | none |  |
| KnowledgeSearching | Knowledge | yes | 2.156 | none |  |
| KnowledgeAnswerExtractive | Knowledge | yes | 1.186 | none |  |
| KnowledgeAnswerDegraded | Knowledge | yes | 2.891 | none |  |
| KnowledgeAnswerMemories | Knowledge | yes | 2.891 | none |  |
| KnowledgeEvidenceSourceError | Knowledge | yes | 2.831 | none |  |
| AgentToolsCopied | Graph, conversations, tools, inbox, index | no |  | none |  |
| AgentToolsCopyError | Graph, conversations, tools, inbox, index | no |  | none |  |
| AgentToolsError | Graph, conversations, tools, inbox, index | no |  | none |  |
| AgentToolsRetrieving | Graph, conversations, tools, inbox, index | no |  | none |  |
| AgentToolsWarning | Graph, conversations, tools, inbox, index | no |  | none |  |
| ConversationsEmpty | Graph, conversations, tools, inbox, index | no |  | none |  |
| ConversationsFallback | Graph, conversations, tools, inbox, index | no |  | none |  |
| ConversationsSearching | Graph, conversations, tools, inbox, index | no |  | none |  |
| ConversationsUnreachable | Graph, conversations, tools, inbox, index | no |  | none |  |
| GraphFocused | Graph, conversations, tools, inbox, index | no |  | none |  |
| GraphLoadMore | Graph, conversations, tools, inbox, index | no |  | none |  |
| GraphLoading | Graph, conversations, tools, inbox, index | no |  | none |  |
| GraphLoadingMore | Graph, conversations, tools, inbox, index | no |  | none |  |
| GraphNoData | Graph, conversations, tools, inbox, index | no |  | none |  |
| GraphNoMatch | Graph, conversations, tools, inbox, index | no |  | none |  |
| GraphPinned | Graph, conversations, tools, inbox, index | no |  | none |  |
| GraphRetry | Graph, conversations, tools, inbox, index | no |  | none |  |
| GraphShowMore | Graph, conversations, tools, inbox, index | no |  | none |  |
| GraphUnavailable | Graph, conversations, tools, inbox, index | no |  | none |  |
| InboxAlerts | Graph, conversations, tools, inbox, index | no |  | none |  |
| InboxBusy | Graph, conversations, tools, inbox, index | no |  | none |  |
| InboxEmpty | Graph, conversations, tools, inbox, index | no |  | none |  |
| InboxJobLog | Graph, conversations, tools, inbox, index | no |  | none |  |
| InboxJobStates | Graph, conversations, tools, inbox, index | no |  | none |  |
| InboxLoading | Graph, conversations, tools, inbox, index | no |  | none |  |
| InboxUnavailable | Graph, conversations, tools, inbox, index | no |  | none |  |
| IndexLoading | Graph, conversations, tools, inbox, index | no |  | none |  |
| IndexStale | Graph, conversations, tools, inbox, index | no |  | none |  |
| IndexUnavailable | Graph, conversations, tools, inbox, index | no |  | none |  |
| SetDirty | Settings | no |  | none |  |
| SetSaved | Settings | no |  | none |  |
| SetRestarting | Settings | no |  | none |  |
| SetSaveError | Settings | no |  | none |  |
| SetLoading | Settings | no |  | none |  |
| SetLoadError | Settings | no |  | none |  |
| SetServicesRestarting | Settings | no |  | none |  |
| SetServicesRestarted | Settings | no |  | none |  |
| SetServicesRecovery | Settings | no |  | none |  |
| SetSourcesEmpty | Settings | no |  | stale only |  |
| SetSourcesWorkspaceEmpty | Settings | no |  | stale only |  |
| SetSourcesAdvanced | Settings | no |  | none |  |
| SetSourcesDiscord | Settings | no |  | none |  |
| SetSourcesJobRunning | Settings | no |  | stale only |  |
| SetSourcesLegacy | Settings | no |  | none |  |
| SetSourcesAddProvider | Settings | no |  | none |  |
| SetReadinessScanning | Settings | no |  | none |  |
| SetReadinessFailed | Settings | no |  | none |  |
| SetReadinessWarning | Settings | no |  | none |  |
| SetReadinessCancelled | Settings | no |  | none |  |
| SetServicesNotInstalled | Settings | no |  | none |  |
| SetSourcesExternal | Settings | no |  | none |  |
| SetMemoryProvenance | Settings | no |  | none |  |
| SetQueryRefreshing | Settings | no |  | none |  |
| SetQueryKey | Settings | no |  | none |  |
| SetAdvancedResults | Settings | no |  | none |  |
| SetAdvancedImport | Settings | no |  | none |  |
| SetAdvancedErrors | Settings | no |  | none |  |
| SetAdvancedVaultRunning | Settings | no |  | none |  |
| SetAdvancedVaultSelect | Settings | no |  | none |  |
| SetMemoryBulk | Settings | no |  | none |  |
| SetMemoryEdit | Settings | no |  | none |  |
| SetMemoryNotice | Settings | no |  | none |  |
| SetMemoryEmpty | Settings | no |  | none |  |
| SetMemoryLoading | Settings | no |  | none |  |
| SetMemoryError | Settings | no |  | none |  |
| SetEmbeddingModels | Settings | no |  | none |  |
| SetEmbeddingModelsError | Settings | no |  | none |  |
| SetWorkspacesOverride | Settings | no |  | none |  |
| CommandPaletteFiltered | Menus and dialogs | yes | 2.156 | none |  |
| CommandPaletteEmpty | Menus and dialogs | yes | 2.156 | none |  |
| SystemStatusDesktop | Menus and dialogs | yes | 1.796 | none |  |
| SystemStatusBusy | Menus and dialogs | yes | 1.473 | none |  |
| SystemStatusSuccess | Menus and dialogs | yes | 1.573 | none |  |
| SystemStatusAttention | Menus and dialogs | yes | 1.473 | none |  |
| SystemStatusOffline | Menus and dialogs | no |  | none |  |
| AddSourceConnect | Menus and dialogs | no |  | none |  |
| AddSourceBuzz | Menus and dialogs | no |  | none |  |
| InitialSyncPlan | Menus and dialogs | no |  | none |  |
| InitialSyncReady | Menus and dialogs | no |  | none |  |
| UpdateAvailable | Menus and dialogs | yes | 0.053 | none |  |
| UpdateDownloading | Menus and dialogs | yes | 0.053 | none |  |
| UpdateFailed | Menus and dialogs | yes | 0.053 | none |  |
| UpdateRestart | Menus and dialogs | yes | 0.053 | none |  |
| UserMenuDesktop | Menus and dialogs | yes | 2.156 | none |  |
| Tooltips | Menus and dialogs | yes | 2.156 | none |  |
| CrashApp | Menus and dialogs | no |  | none |  |
| CrashRenderer | Menus and dialogs | no |  | none |  |
| ConfirmUpdate | Menus and dialogs | no |  | none |  |
| ConfirmDiscard | Menus and dialogs | no |  | none |  |
| ConfirmToggle | Menus and dialogs | yes | 0.053 | none |  |
| ConfirmAuthorize | Menus and dialogs | yes | 0.053 | none |  |
| PhoneAnswer | Narrow windows | no |  | none |  |
| PhoneDocument | Narrow windows | no |  | none |  |
| PhoneGraph | Narrow windows | no |  | none |  |
| PhoneGraphSelected | Narrow windows | no |  | none |  |
| PhoneConversations | Narrow windows | no |  | none |  |
| PhoneAgentToolsEmpty | Narrow windows | no |  | none |  |
| PhoneAgentTools | Narrow windows | no |  | none |  |
| PhoneInbox | Narrow windows | no |  | none |  |
| PhoneIndex | Narrow windows | no |  | none |  |
| Tablet768Answer | Narrow windows | no |  | none |  |
| Narrow800Answer | Narrow windows | yes | 1.191 | none |  |
| HeaderWrapped | Shell parts | no |  | none |  |
| SystemStatusWrapped | Narrow windows | no baseline render |  | none |  |
| HeaderEnlarged | Shell parts | no baseline render |  | none |  |
| SearchMenu | Menus and dialogs | no baseline render |  | none |  |

## Unlisted file

| File | Declared in canvas.json | Changed | Note |
|---|---|---|---|
| `unlisted/NavExpanded.dc.html` | no | yes (in the 51-set) | Not a canvas board. Moved out of `project/` in 7d8f7bb. |

## Sets (current build)

- Changed listed boards: 50 (of 175 with a baseline render). Including NavExpanded: 51 of 51.
- Current references: 2: KnowledgeAnswer, SidebarCollapsed.
- Intersection of changed and current references: 2: KnowledgeAnswer, SidebarCollapsed.
- Changed listed boards without a current reference: 48. Including NavExpanded: 49 of 51.
- Stale references (not usable): KnowledgeDocument, KnowledgeEmpty, KnowledgeEvidence, SetSources, SetSourcesEmpty, SetSourcesJobRunning, SetSourcesWorkspaceEmpty, KnowledgeAnswer (10-19 build).
- Listed boards with no baseline render (new in 7d8f7bb): SystemStatusWrapped, HeaderEnlarged, SearchMenu. These are not in the 51.

## Reconciling earlier counts

- 51: changed set including NavExpanded (first render comparison).
- 44, 46, 47: earlier counts. They were built on references that were later found to be stale or lost, so they do not describe the current build.

## Captures and runs

- 10-19 build, Answer state (old harness, `kn-answer-v2.mjs`, port 4180): `real/v2/kn-answer-2026-10-23T21-30-08-504Z.png`, `…21-37-13-151Z.png`, `…21-37-50-607Z.png`. Each checked Answer selected and the Work chip. All stale.
- main 6fc6d59, Answer state (`kn-main-capture.mjs answer`): `real/v2/kn-answer-main6fc6d59-2026-10-23T21-46-15-267Z.png`. Checked Answer selected, Document not selected, Evidence brief present, Work chip, sidebar expanded. Diff 5.109 raw.
- main 6fc6d59, sidebar collapsed (`kn-main-capture.mjs collapsed`): `real/v2/kn-collapsed-main6fc6d59-2026-10-23T21-46-25-868Z.png`. Checked Answer selected, Document not selected, Evidence brief present, Work chip, Expand sidebar visible. Diff 6.405 raw.
- Retired: `kn-states.mjs` (landed on Document and overwrote files), and the old port-4180 Answer and collapsed attempts.

## Notes

- The workspace chip is checked in each run. The Personal race did not occur in these runs (3 of 3 Work).
- Harness artifacts still present in the composed render: `/_blob/` icons (not loaded under file://) and platform hint text. These are masked in the masked numbers only.

## Render check after the 49px header commit (e42ba90)

- Command: `node render-all.mjs <project dir> <out dir> <part> 4`, four parts in parallel, 1440x900 clip, 900 ms settle. Run once on the 85ea124 sources (`r-pre`) and once on e42ba90 (`r-post`).
- Result: 178 of 178 boards rendered, 0 page errors in either run.
- Any-pixel change between runs (threshold 24): 117 boards; 109 are above 0.5%.
- Shift analysis (body rows 60-860, best vertical offset of post against pre): 105 boards match at +1px (content moved down with the 1px taller header), 63 at 0px, 7 at +2px. No board needs a larger shift.
- Largest residual after the best shift: KnowledgeAnswer 2.0%, SidebarCollapsed 2.0%, KnowledgeAnswerDegraded 1.9%. These are text-rasterization residuals. Nothing in this check shows a layout break.
- Changed boards: none is accepted by this check. Visual acceptance is not claimed for any board. Boards without a current capture stay unverified.
- Header residual on the two current references: 4.174 to 0.181 (KnowledgeAnswer) and 4.172 to 0.178 (SidebarCollapsed).

## Batch of reachable main-build captures (c5e6f2e)

- Command: `node main-state-capture.mjs <Board> <trigger> <menu|dialog>` against 127.0.0.1:4181, `?demo`. Before saving it checks that a `[role=menu]` or `[role=dialog]` is open and that the workspace chip reads Work. It writes one unique file per run under `real/v2/` and never overwrites.
- SystemStatus, trigger "System status", dialog open. Saved, 2.133 raw.
- MoreMenu, trigger "Actions", menu open. Saved, 2.082 raw.
- WorkspaceMenu, trigger "Switch workspace, current: Work", menu open. Saved, 2.366 raw.
- UserMenu, trigger "User settings", menu open. Saved, 2.136 raw.
- All four are above the 1% bar. Not accepted. The live MoreMenu capture has a focus outline around the menu that the board does not; this is probably a capture-state difference and is not yet verified.
- Not attempted in this batch (unverified): the other changed boards without a reference, including the Knowledge family states, the Sources states, the Context states, the Update dialogs, HelpCenter, About, and the Tooltip and Confirm states. Several need states that the demo build does not show.

## Current changed set (post-Header49, against the e8f6 baseline)

Recorded at 02ad20d (before the StatusBar label fix). At bd4da55, from the manifested run, the counts are 129 changed and 46 unchanged; StatusBar is the only board that moved (unchanged to changed). The 3 unverified boards are unchanged. See `README.md`, "Changed-board accounting".

- Baseline: `composed/before/` (178 renders of the e8f6 sources, the composed-route baseline in the 2026-10-23 receipt). Candidate: `composed/r-post/` (renders of e42ba90 sources, 178 renders, 0 page errors).
- Commands: `node harness/render-all.mjs <project dir> <out dir> <part> 4` for parts 0 to 3, run in parallel; then `python3 harness/compare-renders.py <before dir> <r-post dir>`. Output saved as `harness/changed-set-post-header49.txt`.
- Compared: 175. Changed: 128. Unchanged: 47. Unverified: 3, with no baseline render: HeaderEnlarged, SearchMenu, SystemStatusWrapped.
- Not in the 178 declared set: NavExpanded, ProposedThemeDefault, ProposedThemeOverride. They have baseline renders but are not counted.
- Changed boards are listed with their share of pixels above the 24 channel threshold. Unchanged boards show exactly 0.

Changed (128):
- About 0.072%
- AgentTools 2.366%
- AgentToolsCopied 2.337%
- AgentToolsCopyError 2.665%
- AgentToolsEmpty 1.737%
- AgentToolsError 2.017%
- AgentToolsRetrieving 1.528%
- AgentToolsWarning 2.722%
- CommandPalette 3.042%
- CommandPaletteEmpty 3.215%
- CommandPaletteFiltered 3.215%
- ConfirmAuthorize 0.072%
- ConfirmToggle 0.072%
- ContextSheet 1.186%
- Conversations 2.348%
- ConversationsEmpty 1.044%
- ConversationsFallback 2.659%
- Graph 2.770%
- GraphFocused 2.834%
- GraphLoadMore 3.109%
- GraphLoading 0.496%
- GraphLoadingMore 2.750%
- GraphNoData 0.466%
- GraphNoMatch 1.939%
- GraphPinned 3.295%
- GraphRetry 2.848%
- GraphShowMore 3.123%
- Header 0.222%
- HeaderNarrow 0.062%
- HeaderSearching 0.111%
- HeaderTablet 0.079%
- HeaderWrapped 0.049%
- HelpCenter 0.072%
- Inbox 1.468%
- InboxAlerts 2.668%
- InboxBusy 3.368%
- InboxEmpty 1.079%
- InboxJobLog 3.149%
- InboxJobStates 3.503%
- Index 2.450%
- IndexStale 3.044%
- KnowledgeAnswer 6.165%
- KnowledgeAnswerDegraded 5.994%
- KnowledgeAnswerExtractive 6.196%
- KnowledgeAnswerMemories 5.716%
- KnowledgeDocument 4.957%
- KnowledgeDocumentMetadata 5.216%
- KnowledgeDocumentOpening 3.442%
- KnowledgeDocumentRelations 4.842%
- KnowledgeDocumentSourceError 5.384%
- KnowledgeDocumentTruncated 5.370%
- KnowledgeEmpty 3.215%
- KnowledgeEvidence 5.780%
- KnowledgeEvidenceSourceError 5.812%
- KnowledgeReflection 4.699%
- KnowledgeSearching 1.186%
- KnowledgeTimeline 4.245%
- MobileSources 1.430%
- MoreMenu 2.913%
- Narrow800Answer 1.191%
- SetAccess 3.271%
- SetAdvanced 4.355%
- SetAdvancedErrors 4.559%
- SetAdvancedImport 4.546%
- SetAdvancedResults 4.641%
- SetAdvancedVaultRunning 4.408%
- SetAdvancedVaultSelect 4.347%
- SetAudit 2.273%
- SetDirty 3.179%
- SetEmbedding 4.272%
- SetEmbeddingModels 4.396%
- SetEmbeddingModelsError 4.567%
- SetIngestion 3.457%
- SetMemory 5.062%
- SetMemoryBulk 5.065%
- SetMemoryEdit 5.060%
- SetMemoryEmpty 4.800%
- SetMemoryError 5.064%
- SetMemoryLoading 4.753%
- SetMemoryNotice 5.081%
- SetMemoryProvenance 5.060%
- SetQuery 4.357%
- SetQueryKey 4.533%
- SetQueryRefreshing 4.344%
- SetReadiness 3.544%
- SetReadinessCancelled 3.700%
- SetReadinessFailed 3.784%
- SetReadinessScanning 3.551%
- SetReadinessWarning 3.820%
- SetRestarting 3.312%
- SetSaveError 3.414%
- SetSaved 3.207%
- SetServices 4.243%
- SetServicesNotInstalled 4.347%
- SetServicesRecovery 4.412%
- SetServicesRestarted 4.310%
- SetServicesRestarting 4.300%
- SetSetup 3.859%
- SetSources 2.644%
- SetSourcesAdvanced 3.836%
- SetSourcesDiscord 3.234%
- SetSourcesEmpty 2.277%
- SetSourcesExternal 3.241%
- SetSourcesJobRunning 3.683%
- SetSourcesLegacy 3.429%
- SetSourcesWorkspaceEmpty 2.285%
- SetWorkspaces 3.655%
- SetWorkspacesOverride 3.707%
- SidebarCollapsed 4.999%
- SourcesDocsFailed 1.208%
- SourcesLoadMore 2.859%
- SourcesLoadingMore 3.018%
- SourcesPanel 1.186%
- SourcesStatusStale 1.186%
- SystemStatus 2.888%
- SystemStatusAttention 2.499%
- SystemStatusBusy 2.499%
- SystemStatusDesktop 2.822%
- SystemStatusSuccess 2.599%
- Tooltips 3.074%
- UpdateAvailable 0.072%
- UpdateDialog 0.072%
- UpdateDownloading 0.072%
- UpdateFailed 0.072%
- UpdateRestart 0.072%
- UserMenu 3.214%
- UserMenuDesktop 3.214%
- WorkspaceMenu 3.037%

Unchanged (47):
AddSource, AddSourceBuzz, AddSourceConnect, ConfirmAction, ConfirmDiscard, ConfirmUpdate, ContextError, ContextLoading, ContextPanel, ConversationsSearching, ConversationsUnreachable, CrashApp, CrashRenderer, GraphUnavailable, InboxLoading, InboxUnavailable, IndexLoading, IndexUnavailable, InitialSync, InitialSyncPlan, InitialSyncReady, KnowledgeOffline, Main, MobileNav, PhoneAgentTools, PhoneAgentToolsEmpty, PhoneAnswer, PhoneConversations, PhoneDocument, PhoneGraph, PhoneGraphSelected, PhoneInbox, PhoneIndex, Rail, SetInstallDesktop, SetLoadError, SetLoading, SetSourcesAddProvider, SettingsNav, SettingsPhone, SourcesEmpty, SourcesLoading, SourcesStatusFailed, StatusBar, StatusBarOffline, SystemStatusOffline, Tablet768Answer

Unverified (no baseline): HeaderEnlarged, SearchMenu, SystemStatusWrapped.

Changed boards with a valid current capture: KnowledgeAnswer (3.851%), SidebarCollapsed (5.492%), SystemStatus (2.133%), MoreMenu (2.082%), WorkspaceMenu (2.366%), UserMenu (2.136%), AgentTools (2.049%), Inbox (0.688%), Graph (0.800%). Nine boards in total. Only Inbox and Graph are under 1% raw, on one capture each, and neither is accepted yet.
