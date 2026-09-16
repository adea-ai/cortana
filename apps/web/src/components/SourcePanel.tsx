import {
  ChevronDown,
  ChevronRight,
  CircleStop,
  Database,
  ExternalLink,
  KeyRound,
  Search,
  Settings,
  X,
} from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'

import { activeJobs, describeSourceJobProgress } from '../sourceJobs'
import { operationalSources, sourceHealth } from '../operations'
import { SourceIcon } from './sourceIcons'
import { cn } from '@/lib/utils'

import { sourceDisplayName } from './sourceIconData'
import { TooltipButton as Button } from './cortana/TooltipButton'
import { VariantButton as ActionButton } from './cortana/VariantButton'
import { Input } from './shadcn/input'
import { Progress } from './shadcn/progress'
import { Skeleton } from './shadcn/skeleton'
import { Spinner } from './shadcn/spinner'
import { Switch } from './shadcn/switch'
import type {
  BrainDocumentSummary,
  BrainStatus,
  DesktopSourceJob,
  WorkspaceSettings,
} from '../types'
import { VirtualDocumentList } from './VirtualDocumentList'

const EMPTY_JOBS: DesktopSourceJob[] = []

export function SourcePanel(props: {
  open: boolean
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
  const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set())
  const sourceJobError = () => props.sourceJobError ?? ''
  const sourceToggleBusy = () => props.sourceToggleBusy ?? null
  const sourceToggleDisabled = () => props.sourceToggleDisabled ?? false
  const sourceToggleError = () => props.sourceToggleError ?? ''
  const sourceToggleNotice = () => props.sourceToggleNotice ?? ''
  const jobs = () => props.jobs ?? EMPTY_JOBS
  const selectedWorkspaceId = () => props.workspace || props.workspaces[0]?.id || ''
  const sources = createMemo(() =>
    operationalSources(props.status).filter((item) => item.project === selectedWorkspaceId())
  )
  // The job snapshot store reconciles by id, so this only re-runs when a job
  // actually changed instead of on every poll tick.
  const active = createMemo(() => activeJobs(jobs()))
  const selectedWorkspace = () =>
    props.workspaces.find((item) => item.id === props.workspace) ?? props.workspaces[0]
  const selectedSource = () => sources().find((item) => item.source === props.selected)
  const statusLoading = () => props.status === null && props.statusError === ''
  const sourceModeClass = () =>
    props.status
      ? props.status.ingestion.scheduled
        ? 'scheduled'
        : 'manual'
      : props.statusError
        ? 'unavailable'
        : 'manual'
  const sourceModeLabel = () =>
    props.status
      ? props.status.ingestion.scheduled
        ? 'scheduled'
        : 'paused · manual only'
      : props.statusError
        ? 'status unavailable'
        : 'loading status…'

  return (
    <aside
      class={cn('source-panel m7-source-panel', props.open && 'mobile-open')}
      data-m7-source-panel=""
    >
      <div class="panel-heading">
        <strong>Sources</strong>
        <ActionButton
          variant="icon"
          class="mobile-close "
          aria-label="Close sources"
          tooltip="Close sources"
          onClick={props.onClose}
        >
          <X size={17} />
        </ActionButton>
        <ActionButton
          variant="icon"
          class=""
          aria-label="Add source"
          tooltip="Add source"
          onClick={props.onOpenSourcesSettings}
        >
          +
        </ActionButton>
        <ActionButton
          variant="icon"
          class=""
          aria-label="Source settings"
          tooltip="Source settings"
          onClick={props.onOpenSourcesSettings}
        >
          <Settings size={16} />
        </ActionButton>
      </div>
      <div class={`source-mode ${sourceModeClass()}`}>
        <i />
        Ingestion {statusLoading() ? 'loading status…' : sourceModeLabel()}
      </div>
      <Show when={active().length > 0}>
        <div class="source-jobs-strip" aria-label="Active source jobs">
          <For each={active()}>
            {(job) => (
              <div class="source-job-item">
                <Spinner />
                <span>
                  {job.project} · {job.source} · {job.operation} · {job.status} ·{' '}
                  {describeSourceJobProgress(job)}
                </span>
                <Show when={props.onCancelSourceJob}>
                  <ActionButton
                    variant="icon"
                    type="button"
                    class="source-job-cancel "
                    aria-label={`Cancel ${job.project} ${job.source} ${job.operation}`}
                    tooltip={`Cancel ${job.project} ${job.source} ${job.operation}`}
                    disabled={job.status === 'cancelling'}
                    onClick={() => props.onCancelSourceJob?.(job.id)}
                  >
                    <CircleStop size={12} />
                  </ActionButton>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={sourceJobError()}>
        <p class="document-list-error source-job-error" role="alert">
          {sourceJobError()}
          <Show when={props.onRetrySourceJobs}>
            {' '}
            <ActionButton
              variant="ghost"
              type="button"
              class="link-button"
              onClick={props.onRetrySourceJobs}
            >
              Retry source jobs
            </ActionButton>
          </Show>
        </p>
      </Show>
      <Show when={sourceToggleError()}>
        <p class="document-list-error source-job-error" role="alert">
          {sourceToggleError()}
        </p>
      </Show>
      <Show when={sourceToggleNotice()}>
        <p class="document-list-state source-toggle-notice" role="status">
          {sourceToggleNotice()}
        </p>
      </Show>
      <Show when={props.statusError && props.status}>
        <p class="document-list-error" role="status">
          {props.statusError} Showing the last known source index.{' '}
          <Show when={props.onRetryStatus}>
            <ActionButton
              variant="ghost"
              type="button"
              class="link-button"
              onClick={props.onRetryStatus}
            >
              Retry status
            </ActionButton>
          </Show>
        </p>
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
            <p class="document-list-error" role="status">
              {props.statusError}{' '}
              <Show when={props.onRetryStatus}>
                <ActionButton
                  variant="ghost"
                  type="button"
                  class="link-button"
                  onClick={props.onRetryStatus}
                >
                  Retry status
                </ActionButton>
              </Show>
            </p>
          }
        >
          <Show
            when={sources().length}
            fallback={
              <div class="source-empty">
                <Database size={20} />
                <p>No indexed sources yet.</p>
                <span>Configure a source, then run cortana sync.</span>
              </div>
            }
          >
            <div class="source-tree">
              <section>
                <For each={sources()}>
                  {(item) => {
                    const health = () => sourceHealth(item)
                    const key = `${item.project}:${item.source}`
                    const isCollapsed = () => collapsed().has(key)
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
                      <div class="source-node">
                        <div class="source-row">
                          <ActionButton
                            variant="icon"
                            type="button"
                            class="tree-toggle "
                            aria-label={`${isCollapsed() ? 'Expand' : 'Collapse'} ${item.name}`}
                            tooltip={`${isCollapsed() ? 'Expand' : 'Collapse'} ${item.name}`}
                            aria-expanded={!isCollapsed()}
                            onClick={() => {
                              setCollapsed((current) => {
                                const next = new Set(current)
                                if (next.has(key)) next.delete(key)
                                else next.add(key)
                                return next
                              })
                            }}
                          >
                            {isCollapsed() ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          </ActionButton>
                          <Button
                            variant="ghost"
                            type="button"
                            class={cn('source-select', isSelected() && 'selected')}
                            aria-pressed={isSelected()}
                            aria-label={`${item.source} ${item.documents.toLocaleString()}`}
                            onClick={() => props.onSelect(item.source, item.project)}
                            title={health().label}
                          >
                            <SourceIcon kind={item.kind} size={17} />
                            <span>{sourceDisplayName(item.kind, item.name)}</span>
                            <i class={`source-health ${health().state}`} />
                            <small>{item.documents.toLocaleString()}</small>
                          </Button>
                          <Show when={props.onOpenSourceSetup && needsProviderSetup()}>
                            <ActionButton
                              variant="icon"
                              type="button"
                              class="source-action "
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
                              <ExternalLink size={13} />
                            </ActionButton>
                          </Show>
                          <Show when={props.onAuthorizeSource && needsBrowserAuthorization()}>
                            <ActionButton
                              variant="icon"
                              type="button"
                              class="source-action "
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
                              <KeyRound size={13} />
                            </ActionButton>
                          </Show>
                          <Show when={props.onToggleSource && item.kind !== 'indexed'}>
                            <Switch
                              size="sm"
                              checked={item.enabled}
                              aria-busy={sourceToggleBusy() === key}
                              aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.name}`}
                              disabled={
                                sourceToggleDisabled() ||
                                sourceToggleBusy() !== null ||
                                sourceJobActive()
                              }
                              onClick={(event: MouseEvent) => event.stopPropagation()}
                              onChange={(checked) =>
                                props.onToggleSource?.(item.source, item.project, checked)
                              }
                            />
                          </Show>
                        </div>
                        <Show when={!isCollapsed()}>
                          <span class="source-node-hint">
                            {item.chunks.toLocaleString()} chunks · {health().label}
                          </span>
                        </Show>
                      </div>
                    )
                  }}
                </For>
              </section>
            </div>
          </Show>
        </Show>
      </Show>
      <section class="document-explorer" aria-label="Document explorer">
        <div class="document-explorer-heading">
          <strong
            aria-label={`Documents in ${
              selectedWorkspace()?.name || selectedWorkspaceId() || 'Documents'
            } / ${
              selectedSource()
                ? sourceDisplayName(selectedSource()!.kind, selectedSource()!.source)
                : 'All sources'
            }`}
          >
            <span class="explorer-workspace">
              {selectedWorkspace()?.name || selectedWorkspaceId() || 'Documents'}
            </span>
            <span class="explorer-separator" aria-hidden="true">
              /
            </span>
            <span class="explorer-scope">
              {selectedSource()
                ? sourceDisplayName(selectedSource()!.kind, selectedSource()!.source)
                : 'All sources'}
            </span>
          </strong>
          <span>{props.documents.length.toLocaleString()} loaded</span>
        </div>
        <label class="document-filter">
          <Search size={14} />
          <Input
            id="document-filter"
            value={props.documentQuery}
            onChange={(event) => props.onDocumentQueryChange(event.target.value)}
            placeholder="Filter documents"
            aria-label="Filter documents"
          />
          <Show when={props.documentQuery !== ''}>
            <ActionButton
              variant="icon"
              type="button"
              class="document-filter-clear"
              aria-label="Clear document filter"
              onClick={() => props.onDocumentQueryChange('')}
            >
              <X size={14} />
            </ActionButton>
          </Show>
        </label>
        <Show
          when={!props.documentsError}
          fallback={
            <p class="document-list-error" role="alert">
              {props.documentsError}{' '}
              <Show when={props.onRetryDocuments}>
                <ActionButton
                  variant="ghost"
                  type="button"
                  class="link-button"
                  onClick={props.onRetryDocuments}
                >
                  Retry documents
                </ActionButton>
              </Show>
            </p>
          }
        >
          <Show
            when={props.documents.length}
            fallback={
              <p class="document-list-state">
                {props.documentsLoading ? 'Loading documents…' : 'No documents match this scope.'}
              </p>
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
          <Progress value={undefined} aria-label="Loading more documents" />
        </Show>
        <Show when={props.hasMoreDocuments && !props.documentsLoading}>
          <ActionButton
            variant="secondary"
            class="load-more-documents"
            onClick={props.onLoadMoreDocuments}
          >
            Load next page
          </ActionButton>
        </Show>
      </section>
    </aside>
  )
}
