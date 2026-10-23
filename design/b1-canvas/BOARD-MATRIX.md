# B1 board matrix (head of claude/b1-canvas-sources)

One row per board in `project/canvas.json` (178), plus the unlisted `NavExpanded` file.

- **Changed**: `yes` if the composed render changed against the saved baseline render (any pixel differs by more than 24 in a channel).
- **Valid reference**: a live capture that exists, was not overwritten, and is mapped to this board by name. Only `real/v2/kn-answer-…` was re-checked for state in this step (Answer tab selected). The other references come from earlier runs and their state is taken from their filenames and earlier measurements, not re-verified. Lost captures are listed separately as retired.
- **Diff vs reference**: raw percent of pixels differing by more than 24, whole 1440x900 board. Only boards with a valid reference have one. Goal is under 1%.
- **Changed % vs baseline**: how much of the composed board changed from the saved baseline render.

| Board | Page | Changed | Changed % vs baseline | Valid reference | Diff vs reference % |
|---|---|---|---|---|---|
| Main | App map | no |  | none |  |
| Header | Shell parts | no |  | none |  |
| StatusBar | Shell parts | no |  | none |  |
| Rail | Shell parts | no |  | none |  |
| SourcesPanel | Shell parts | yes | 1.186 | none |  |
| ContextPanel | Shell parts | yes | 1.645 | none |  |
| SettingsNav | Shell parts | no |  | none |  |
| KnowledgeAnswer | Knowledge | yes | 3.226 | `kn-answer-2026-10-23T21-30-08-504Z.png` | 6.706 |
| KnowledgeDocument | Knowledge | yes | 2.464 | `kn-document-1440.png` | 4.116 |
| KnowledgeEvidence | Knowledge | yes | 3.226 | `kn-evidence-1440.png` | 4.768 |
| KnowledgeTimeline | Knowledge | yes | 2.831 | none |  |
| KnowledgeEmpty | Knowledge | yes | 2.156 | `knowledge-1440.png` | 2.664 |
| SidebarCollapsed | Knowledge | yes | 1.645 | none |  |
| Graph | Graph, conversations, tools, inbox, index | no |  | none |  |
| Conversations | Graph, conversations, tools, inbox, index | no |  | none |  |
| AgentTools | Graph, conversations, tools, inbox, index | no |  | none |  |
| Inbox | Graph, conversations, tools, inbox, index | no |  | none |  |
| Index | Graph, conversations, tools, inbox, index | no |  | none |  |
| SetServices | Settings | no |  | none |  |
| SetWorkspaces | Settings | no |  | none |  |
| SetSources | Settings | no |  | `sources-1440.png` | 2.838 |
| SetReadiness | Settings | no |  | none |  |
| SetAccess | Settings | no |  | none |  |
| SetAudit | Settings | no |  | none |  |
| SetEmbedding | Settings | no |  | none |  |
| SetQuery | Settings | no |  | none |  |
| SetIngestion | Settings | no |  | none |  |
| SetAdvanced | Settings | no |  | none |  |
| SetMemory | Settings | no |  | none |  |
| WorkspaceMenu | Menus and dialogs | yes | 2.156 | none |  |
| MoreMenu | Menus and dialogs | yes | 1.886 | none |  |
| SystemStatus | Menus and dialogs | yes | 1.863 | none |  |
| UserMenu | Menus and dialogs | yes | 2.156 | none |  |
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
| SetSourcesEmpty | Settings | no |  | `mock-empty-root-1440.png` | 3.788 |
| SetSourcesWorkspaceEmpty | Settings | no |  | `mock-workspace-empty-1440.png` | 2.702 |
| SetSourcesAdvanced | Settings | no |  | none |  |
| SetSourcesDiscord | Settings | no |  | none |  |
| SetSourcesJobRunning | Settings | no |  | `mock-job-running-1440.png` | 3.803 |
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

## Sets

- Changed listed boards: 50 (of 175 with a baseline render).
- Changed set including NavExpanded: 51 (the 51 earlier reported).
- References that exist and are not overwritten: 8 (state re-verified only for KnowledgeAnswer): KnowledgeAnswer, KnowledgeDocument, KnowledgeEmpty, KnowledgeEvidence, SetSources, SetSourcesEmpty, SetSourcesJobRunning, SetSourcesWorkspaceEmpty.
- Intersection of changed and referenced: 4: KnowledgeAnswer, KnowledgeDocument, KnowledgeEmpty, KnowledgeEvidence.
- Changed without a valid reference: 46 listed, plus NavExpanded = 47 of 51.
- Referenced but unchanged: SetSources, SetSourcesEmpty, SetSourcesJobRunning, SetSourcesWorkspaceEmpty.
- Listed boards with no baseline render (new in 7d8f7bb): SystemStatusWrapped, HeaderEnlarged, SearchMenu. These are not in the 51.
- Rail: no valid reference (its only measurement used the lost kn-answer-1440.png). Rail is not in the changed set.
- SidebarCollapsed: changed, no valid reference (its only reference, kn-collapsed-1440.png, is lost).

## Reconciling earlier counts

- 51: changed set including NavExpanded (the first render comparison).
- 47: 51 minus the 4 intersecting boards. That is 46 listed boards plus NavExpanded.
- 46: listed boards without a valid reference, after the 4-board intersection. It excludes NavExpanded.
- 44: the earlier list. It was 51 minus 7 "covered" boards, two of which (KnowledgeAnswer and SidebarCollapsed) were later found invalid. The 44 list did include NavExpanded and excluded the SetSources group, which is not changed.

## Retired (lost, do not use)

- `real/kn-answer-1440.png`: overwritten 21:26Z by `kn-states.mjs`, which landed on the Document tab. Earlier 4.8% figure is historical.
- `real/kn-collapsed-1440.png`: overwritten 21:25Z. Its SidebarCollapsed reference is gone.
- `real/kn-doc-1440.png`: overwritten 21:24Z. Not a board reference.
- `kn-states.mjs`: retired. Do not run it.

## Captures created in this step

- `real/v2/kn-answer-2026-10-23T21-30-08-504Z.png`: script `kn-answer-v2.mjs`. Checked before save: Answer tab `aria-selected=true`, Document not selected, Evidence brief present. Unique name, `real/v2/` only.
