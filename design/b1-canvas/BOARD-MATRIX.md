# B1 board matrix (#2624, head 90d2547 plus the change in this commit)

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
| Graph | Graph, conversations, tools, inbox, index | no |  | none |  |
| Conversations | Graph, conversations, tools, inbox, index | no |  | none |  |
| AgentTools | Graph, conversations, tools, inbox, index | no |  | none |  |
| Inbox | Graph, conversations, tools, inbox, index | no |  | none |  |
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
