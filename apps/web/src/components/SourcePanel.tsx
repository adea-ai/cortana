import {
  Alert as SharedFeedbackAlert,
  AlertAction as SharedFeedbackAction,
  AlertDescription as SharedFeedbackDescription,
} from '@adea-ai/ui/components/ui/alert'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@adea-ai/ui/components/ui/input-group'
import { CircleStop, Database, ExternalLink, KeyRound, Search, Settings, X } from 'lucide-solid'
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

import { activeJobs, describeSourceJobProgress } from '../sourceJobs'
import { operationalSources, sourceHealth, type OperationalSource } from '../operations'
import { SourceIcon } from './sourceIcons'
import { createMediaQuery } from '@/lib/mediaQuery'

import { sourceDisplayName } from './sourceIconData'
import { ActionButton } from '@adea-ai/ui/components/composites/action-button'
import { EmptyState } from '@adea-ai/ui/components/ui/empty'
import {
  Panel,
  PanelActions,
  PanelHeader,
  PanelTitle,
  PanelToolbar,
} from '@adea-ai/ui/components/layout/panel'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@adea-ai/ui/components/ui/breadcrumb'
import { Text } from '@adea-ai/ui/components/ui/typography'
import { Progress } from '@adea-ai/ui/components/ui/progress'
import { Skeleton } from '@adea-ai/ui/components/ui/skeleton'
import { Spinner } from '@adea-ai/ui/components/ui/spinner'
import { StatusChip, type StatusTone } from '@adea-ai/ui/components/ui/status-chip'
import { Switch } from '@adea-ai/ui/components/ui/switch'
import { Tree, TreeRow, type TreeItemDescriptor } from '@adea-ai/ui/components/composites/tree'
import type {
  BrainDocumentSummary,
  BrainStatus,
  DesktopSourceJob,
  WorkspaceSettings,
} from '../types'
import { VirtualDocumentList } from './VirtualDocumentList'

const EMPTY_JOBS: DesktopSourceJob[] = []
// A source row's expanded content is one child row of counts and health.
const SOURCE_DETAILS_SUFFIX = '#details'
const sourceKey = (item: OperationalSource) => `${item.project}:${item.source}`

export function SourcePanel(props: {
  status: BrainStatus | null
  statusError: string
  onRetryStatus?: () => void
  sourceJobError?: string
  onRetrySourceJobs?: () => void
  workspace: string
  workspaces: WorkspaceSettings[]
  documentQuery: string
  selected: string
  documents: BrainDocumentSummary[]
  selectedDocument: string
  documentsLoading: boolean
  documentsError: string
  hasMoreDocuments: boolean
  onSelect: (source: string, project: string) => void
  onDocumentQueryChange: (query: string) => void
  onSelectDocument: (id: string) => void
  onPrefetchDocument?: (id: string) => void
  onLoadMoreDocuments: () => void
  onRetryDocuments?: () => void
  onOpenSourcesSettings: () => void
  onOpenSourceSetup?: (source: string, project: string) => void
  onAuthorizeSource?: (source: string, project: string) => void
  onToggleSource?: (source: string, project: string, enabled: boolean) => void
  sourceToggleBusy?: string | null
  sourceToggleDisabled?: boolean
  sourceToggleError?: string
  sourceToggleNotice?: string
  onClose: () => void
  onCancelSourceJob?: (id: string) => void
  jobs?: DesktopSourceJob[]
}) {
  const compact = createMediaQuery(() => '(max-width: 799px)')
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set())
  const sourceJobError = () => props.sourceJobError ?? ''
  const sourceToggleBusy = () => props.sourceToggleBusy ?? null
  const sourceToggleDisabled = () => props.sourceToggleDisabled ?? false
  const sourceToggleError = () => props.sourceToggleError ?? ''
  const sourceToggleNotice = () => props.sourceToggleNotice ?? ''
  const jobs = () => props.jobs ?? EMPTY_JOBS
  const [activeSourceRow, setActiveSourceRow] = createSignal<string | null>(null)
  const setSourceExpanded = (key: string, expanded: boolean) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (expanded) next.delete(key)
      else next.add(key)
      return next
    })
  }
  // Pointer, Enter and Space all select the source; only a source row selects,
  // the details row under it does not.
  const selectSourceRow = (id: string) => {
    const item = sources.find((candidate) => sourceKey(candidate) === id)
    if (item) props.onSelect(item.source, item.project)
  }
  const selectedWorkspaceId = () => props.workspace || props.workspaces[0]?.id || ''
  // Status polls replace the snapshot wholesale. Reconcile by source name —
  // unique within the workspace-filtered list — so an unchanged poll keeps
  // every row's identity instead of rebuilding the tree every interval.
  const [sources, setSources] = createStore<OperationalSource[]>([])
  createEffect(() => {
    setSources(
      reconcile(
        operationalSources(props.status).filter((item) => item.project === selectedWorkspaceId()),
        { key: 'source' }
      )
    )
  })
  // The job snapshot store reconciles by id, so this only re-runs when a job
  // actually changed instead of on every poll tick.
  const active = createMemo(() => activeJobs(jobs()))
  const visibleSourceItems = createMemo<TreeItemDescriptor[]>(() =>
    sources.flatMap((item) => {
      const key = sourceKey(item)
      const open = !collapsed().has(key)
      const row: TreeItemDescriptor = {
        id: key,
        parentId: null,
        level: 1,
        expandable: true,
        expanded: open,
      }
      return open
        ? [
            row,
            {
              id: `${key}${SOURCE_DETAILS_SUFFIX}`,
              parentId: key,
              level: 2,
              expandable: false,
              expanded: false,
            },
          ]
        : [row]
    })
  )
  const selectedWorkspace = () =>
    props.workspaces.find((item) => item.id === props.workspace) ?? props.workspaces[0]
  const selectedSource = () => sources.find((item) => item.source === props.selected)
  const statusLoading = () => props.status === null && props.statusError === ''
  const sourceModeLabel = () =>
    props.status
      ? props.status.ingestion.scheduled
        ? 'scheduled'
        : 'paused · manual only'
      : props.statusError
        ? 'status unavailable'
        : 'loading status…'

  return (
    <Panel data-m7-source-panel="">
      <PanelHeader>
        <PanelTitle>Sources</PanelTitle>
        <PanelActions>
          <Show when={compact()}>
            <ActionButton
              variant="ghost"
              size="icon-sm"
              aria-label="Close sources"
              tooltip="Close sources"
              onClick={props.onClose}
            >
              <X aria-hidden="true" />
            </ActionButton>
          </Show>
          <ActionButton
            variant="ghost"
            size="icon-sm"
            aria-label="Add source"
            tooltip="Add source"
            onClick={props.onOpenSourcesSettings}
          >
            +
          </ActionButton>
          <ActionButton
            variant="ghost"
            size="icon-sm"
            aria-label="Source settings"
            tooltip="Source settings"
            onClick={props.onOpenSourcesSettings}
          >
            <Settings aria-hidden="true" />
          </ActionButton>
        </PanelActions>
      </PanelHeader>
      <PanelToolbar>
        <StatusChip
          tone={
            props.statusError ? 'warning' : props.status?.ingestion.scheduled ? 'info' : 'neutral'
          }
          label={`Ingestion ${statusLoading() ? 'loading status…' : sourceModeLabel()}`}
        />
      </PanelToolbar>
      <Show when={active().length > 0}>
        <div class="source-jobs-strip" aria-label="Active source jobs">
          <For each={active()}>
            {(job) => (
              <div class="source-job-item">
                <Spinner />
                <span class="source-job-item-text">
                  {job.project} · {job.source} · {job.operation} · {job.status} ·{' '}
                  {describeSourceJobProgress(job)}
                </span>
                <Show when={props.onCancelSourceJob}>
                  <ActionButton
                    variant="ghost"
                    size="icon-sm"
                    type="button"
                    class="ml-auto shrink-0"
                    aria-label={`Cancel ${job.project} ${job.source} ${job.operation}`}
                    tooltip={`Cancel ${job.project} ${job.source} ${job.operation}`}
                    disabled={job.status === 'cancelling'}
                    onClick={() => props.onCancelSourceJob?.(job.id)}
                  >
                    <CircleStop aria-hidden="true" />
                  </ActionButton>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={sourceJobError()}>
        <SharedFeedbackAlert variant="destructive" role="alert" class="my-2">
          <SharedFeedbackDescription>{sourceJobError()}</SharedFeedbackDescription>
          <Show when={props.onRetrySourceJobs}>
            <SharedFeedbackAction>
              <ActionButton
                tooltip="Retry source jobs"
                variant="outline"
                size="xs"
                type="button"
                onClick={props.onRetrySourceJobs}
              >
                Retry source jobs
              </ActionButton>
            </SharedFeedbackAction>
          </Show>
        </SharedFeedbackAlert>
      </Show>
      <Show when={sourceToggleError()}>
        <SharedFeedbackAlert variant="destructive" role="alert" class="my-2">
          <SharedFeedbackDescription>{sourceToggleError()}</SharedFeedbackDescription>
        </SharedFeedbackAlert>
      </Show>
      <Show when={sourceToggleNotice()}>
        <div class="px-2.5 py-2">
          <Text as="p" variant="micro" tone="muted" role="status">
            {sourceToggleNotice()}
          </Text>
        </div>
      </Show>
      <Show when={props.statusError && props.status}>
        <SharedFeedbackAlert variant="warning" role="status" class="my-2">
          <SharedFeedbackDescription>
            {props.statusError} Showing the last known source index.
          </SharedFeedbackDescription>
          <Show when={props.onRetryStatus}>
            <SharedFeedbackAction>
              <ActionButton
                tooltip="Retry status"
                variant="outline"
                size="xs"
                type="button"
                onClick={props.onRetryStatus}
              >
                Retry status
              </ActionButton>
            </SharedFeedbackAction>
          </Show>
        </SharedFeedbackAlert>
      </Show>
      <Show
        when={!statusLoading()}
        fallback={
          <div
            class="flex flex-col gap-2 p-3"
            role="status"
            aria-label="Loading source index and health"
          >
            <Skeleton class="h-8 w-full" />
            <Skeleton class="h-8 w-5/6" />
            <span class="sr-only">Loading source index and health…</span>
          </div>
        }
      >
        <Show
          when={!(props.statusError && !props.status)}
          fallback={
            <SharedFeedbackAlert variant="warning" role="status" class="my-2">
              <SharedFeedbackDescription>{props.statusError}</SharedFeedbackDescription>
              <Show when={props.onRetryStatus}>
                <SharedFeedbackAction>
                  <ActionButton
                    tooltip="Retry status"
                    variant="outline"
                    size="xs"
                    type="button"
                    onClick={props.onRetryStatus}
                  >
                    Retry status
                  </ActionButton>
                </SharedFeedbackAction>
              </Show>
            </SharedFeedbackAlert>
          }
        >
          <Show
            when={sources.length}
            fallback={
              <EmptyState
                headingLevel={2}
                title="No indexed sources yet."
                detail="Configure a source, then run cortana sync."
                icon={<Database aria-hidden="true" />}
              />
            }
          >
            <div class="max-h-2/5 min-h-22.5 overflow-y-auto border-b border-border px-2 py-2.5">
              <Tree
                aria-label="Indexed sources"
                disclosure="marker"
                visibleItems={visibleSourceItems()}
                activeId={activeSourceRow()}
                onActiveIdChange={setActiveSourceRow}
                onExpand={(id, expanded) => setSourceExpanded(id, expanded)}
                onActivate={(id) => selectSourceRow(id)}
                onSelectItem={(id) => selectSourceRow(id)}
              >
                <For each={sources}>
                  {(item) => {
                    const health = () => sourceHealth(item)
                    // The status poll reconciles rows by source name, so after a workspace switch
                    // this same row can describe a connector with the same name in another
                    // workspace. Derive the key from the live item each time, never once.
                    const key = () => sourceKey(item)
                    const isCollapsed = () => collapsed().has(key())
                    // Source names are only unique inside a workspace. When the
                    // panel shows all workspaces, matching by name alone would
                    // highlight every same-named connector and make a click
                    // appear to select the wrong account.
                    const isSelected = () =>
                      props.selected === item.source && selectedWorkspaceId() === item.project
                    const auth = () => item.authorization
                    const needsProviderSetup = () => Boolean(auth()?.setup_required)
                    const needsBrowserAuthorization = () =>
                      (auth()?.method === 'google_oauth' ||
                        auth()?.method === 'github_oauth' ||
                        auth()?.method === 'discord_rpc') &&
                      !auth()?.authorized &&
                      !needsProviderSetup()
                    const sourceJobActive = () =>
                      active().some(
                        (job) =>
                          job.project === item.project &&
                          (job.source === item.source || job.source === item.name)
                      )
                    return (
                      <>
                        <TreeRow
                          item={{
                            id: key(),
                            parentId: null,
                            level: 1,
                            expandable: true,
                            expanded: !isCollapsed(),
                          }}
                          selected={isSelected()}
                          aria-label={`${item.source} ${item.documents.toLocaleString()}`}
                          title={health().label}
                          leading={<SourceIcon kind={item.kind} size={17} />}
                          trailing={
                            <>
                              <StatusChip
                                compact
                                tone={
                                  (
                                    {
                                      healthy: 'success',
                                      failed: 'danger',
                                      warning: 'warning',
                                      running: 'info',
                                      disabled: 'neutral',
                                    } as Record<string, StatusTone>
                                  )[health().state] ?? 'unknown'
                                }
                                label={health().label}
                              />
                              <small>{item.documents.toLocaleString()}</small>
                              <Show when={props.onOpenSourceSetup && needsProviderSetup()}>
                                <ActionButton
                                  variant="ghost"
                                  size="icon-sm"
                                  type="button"
                                  aria-label={`Open ${item.name} setup`}
                                  tooltip={
                                    sourceJobActive()
                                      ? 'Wait for the active source job to finish'
                                      : auth()?.method === 'google_oauth'
                                        ? 'Open Google source settings'
                                        : auth()?.method === 'github_oauth'
                                          ? 'Open GitHub source settings'
                                          : auth()?.method === 'discord_rpc'
                                            ? 'Open Discord source settings'
                                            : 'Open the provider setup page'
                                  }
                                  disabled={
                                    sourceToggleBusy() !== null ||
                                    sourceToggleDisabled() ||
                                    sourceJobActive()
                                  }
                                  onClick={(event: MouseEvent) => {
                                    event.stopPropagation()
                                    props.onOpenSourceSetup?.(item.source, item.project)
                                  }}
                                >
                                  <ExternalLink aria-hidden="true" />
                                </ActionButton>
                              </Show>
                              <Show when={props.onAuthorizeSource && needsBrowserAuthorization()}>
                                <ActionButton
                                  variant="ghost"
                                  size="icon-sm"
                                  type="button"
                                  aria-label={`Authorize ${item.name}`}
                                  tooltip={
                                    sourceJobActive()
                                      ? 'Wait for the active source job to finish'
                                      : auth()?.method === 'github_oauth'
                                        ? 'Authorize this GitHub source in your browser'
                                        : auth()?.method === 'discord_rpc'
                                          ? 'Approve this Discord source in the running Discord Desktop client'
                                          : 'Authorize this Google source in your browser'
                                  }
                                  disabled={
                                    sourceToggleBusy() !== null ||
                                    sourceToggleDisabled() ||
                                    sourceJobActive()
                                  }
                                  onClick={(event: MouseEvent) => {
                                    event.stopPropagation()
                                    props.onAuthorizeSource?.(item.source, item.project)
                                  }}
                                >
                                  <KeyRound aria-hidden="true" />
                                </ActionButton>
                              </Show>
                              <Show when={props.onToggleSource && item.kind !== 'indexed'}>
                                {/* The switch's visual control is a plain element, so the tree
                                    needs this wrapper to treat a click on it as the switch's own. */}
                                <span data-tree-keyboard-stop>
                                  <Switch
                                    checked={item.enabled}
                                    aria-busy={sourceToggleBusy() === key()}
                                    aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`}
                                    disabled={
                                      sourceToggleDisabled() ||
                                      sourceToggleBusy() !== null ||
                                      sourceJobActive()
                                    }
                                    onClick={(event: MouseEvent) => event.stopPropagation()}
                                    onChange={(checked: boolean) =>
                                      props.onToggleSource?.(item.source, item.project, checked)
                                    }
                                  />
                                </span>
                              </Show>
                            </>
                          }
                        >
                          {sourceDisplayName(item.kind, item.name)}
                        </TreeRow>
                        <Show when={!isCollapsed()}>
                          <TreeRow
                            item={{
                              id: `${key()}${SOURCE_DETAILS_SUFFIX}`,
                              parentId: key(),
                              level: 2,
                              expandable: false,
                              expanded: false,
                            }}
                          >
                            <span class="text-2xs text-muted-foreground">
                              {item.chunks.toLocaleString()} chunks · {health().label}
                            </span>
                          </TreeRow>
                        </Show>
                      </>
                    )
                  }}
                </For>
              </Tree>
            </div>
          </Show>
        </Show>
      </Show>
      <section class="document-explorer" aria-label="Document explorer">
        <div class="flex min-w-0 items-center gap-2 px-2 pb-2" data-m7-explorer-heading>
          <Breadcrumb
            aria-label={`Documents in ${
              selectedWorkspace()?.name || selectedWorkspaceId() || 'Documents'
            } / ${
              selectedSource()
                ? sourceDisplayName(selectedSource()!.kind, selectedSource()!.source)
                : 'All sources'
            }`}
            class="min-w-0 flex-1"
          >
            <BreadcrumbList class="flex-nowrap">
              <BreadcrumbItem class="min-w-0">
                <span class="truncate">
                  {selectedWorkspace()?.name || selectedWorkspaceId() || 'Documents'}
                </span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem class="min-w-0">
                <BreadcrumbPage class="min-w-0">
                  <span class="block truncate">
                    {selectedSource()
                      ? sourceDisplayName(selectedSource()!.kind, selectedSource()!.source)
                      : 'All sources'}
                  </span>
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Text variant="caption" tone="muted" class="shrink-0">
            {props.documents.length.toLocaleString()} loaded
          </Text>
        </div>
        <InputGroup class="mb-2 shrink-0">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id="document-filter"
            value={props.documentQuery}
            onInput={(event) => props.onDocumentQueryChange(event.target.value)}
            placeholder="Filter documents"
            aria-label="Filter documents"
          />
          <Show when={props.documentQuery !== ''}>
            <InputGroupAddon align="end">
              <ActionButton
                tooltip="Clear document filter"
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label="Clear document filter"
                onClick={() => props.onDocumentQueryChange('')}
              >
                <X aria-hidden="true" />
              </ActionButton>
            </InputGroupAddon>
          </Show>
        </InputGroup>
        <Show
          when={!props.documentsError}
          fallback={
            <SharedFeedbackAlert variant="destructive" role="alert" class="my-2">
              <SharedFeedbackDescription>{props.documentsError}</SharedFeedbackDescription>
              <Show when={props.onRetryDocuments}>
                <SharedFeedbackAction>
                  <ActionButton
                    tooltip="Retry documents"
                    variant="outline"
                    size="xs"
                    type="button"
                    onClick={props.onRetryDocuments}
                  >
                    Retry documents
                  </ActionButton>
                </SharedFeedbackAction>
              </Show>
            </SharedFeedbackAlert>
          }
        >
          <Show
            when={props.documents.length}
            fallback={
              <div class="px-2.5 py-2">
                <Text as="p" variant="micro" tone="muted">
                  {props.documentsLoading ? 'Loading documents…' : 'No documents match this scope.'}
                </Text>
              </div>
            }
          >
            <VirtualDocumentList
              documents={props.documents}
              selectedDocument={props.selectedDocument}
              loading={props.documentsLoading}
              hasMore={props.hasMoreDocuments}
              onSelect={props.onSelectDocument}
              onPrefetch={props.onPrefetchDocument}
              onLoadMore={props.onLoadMoreDocuments}
            />
          </Show>
        </Show>
        <Show when={props.documentsLoading && props.documents.length > 0}>
          <Progress value={undefined} indeterminate hideValue aria-label="Loading more documents" />
        </Show>
        <Show when={props.hasMoreDocuments && !props.documentsLoading}>
          <ActionButton
            tooltip="Load next page"
            variant="secondary"
            size="sm"
            class="load-more-documents"
            onClick={props.onLoadMoreDocuments}
          >
            Load next page
          </ActionButton>
        </Show>
      </section>
    </Panel>
  )
}
