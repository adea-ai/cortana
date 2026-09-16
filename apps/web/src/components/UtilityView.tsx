import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  CircleStop,
  CircleX,
  Copy,
  ExternalLink,
  FileText,
  Inbox,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  TerminalSquare,
} from 'lucide-solid'
import { createSignal, For, Show, type ComponentProps, type JSX } from 'solid-js'

import { openDesktopUrl } from '../api'
import { codeRevisionLabel } from '../codeEvidence'
import type {
  AnswerResponse,
  BrainStatus,
  ContextBundle,
  DesktopSourceJob,
  Evidence,
} from '../types'
import { describeSourceJobProgress, recentCompletedJobs } from '../sourceJobs'
import { describeSyncRunProgress } from '../operations'
import { shortcutLabel } from '../shortcuts'
import { useClipboardCopy } from '../useClipboardCopy'
import { VariantButton as Button } from './cortana/VariantButton'
import { Card } from './shadcn/card'

const EMPTY_ACTIONS: Array<{ label: string; icon: JSX.Element; onClick: () => void }> = []

export type UtilityKind = 'inbox' | 'conversations' | 'agent-tools' | 'index' | 'help'

const TITLES: Record<UtilityKind, { eyebrow: string; title: string; description: string }> = {
  inbox: {
    eyebrow: 'Attention',
    title: 'Inbox',
    description: 'Current sync health and source-job activity. Nothing here is fabricated history.',
  },
  conversations: {
    eyebrow: 'Session',
    title: 'Conversations',
    description: 'The live query, answer, and evidence state of this workspace session.',
  },
  'agent-tools': {
    eyebrow: 'Retrieval',
    title: 'Agent tools',
    description: 'The token-bounded context bundle generated for the current conversation.',
  },
  index: {
    eyebrow: 'Brain',
    title: 'Index',
    description: 'Live document, chunk, source, and cache metrics reported by the brain.',
  },
  help: {
    eyebrow: 'Support',
    title: 'Help',
    description: 'Keyboard shortcuts and links to the project documentation.',
  },
}

function UtilityCard(props: ComponentProps<'div'>) {
  return <Card {...props} />
}

export function UtilityView(props: {
  kind: UtilityKind
  status: BrainStatus | null
  statusError?: string
  onRetryStatus?: () => void
  sourceJobs: DesktopSourceJob[]
  query: string
  answer: AnswerResponse | null
  evidence: Evidence[]
  loading: boolean
  error: string
  contextBundle: ContextBundle | null
  contextLoading: boolean
  contextError: string
  contextTokens: number
  desktopAvailable: boolean
  sourceJobError?: string
  onRetrySourceJobs?: () => void
  onSearchFocus: () => void
  onRetrieveContext: () => void
  onOpenSettings: () => void
  onOpenProject: () => void | Promise<void>
  onCancelSourceJob?: (id: string) => void
}) {
  const titles = () => TITLES[props.kind]
  return (
    <main id="main-content" class="utility-view m7-utility-view" data-m7-utility-view={props.kind}>
      <header class="utility-header">
        <div>
          <span class="eyebrow">{titles().eyebrow}</span>
          <h1>{titles().title}</h1>
          <p>{titles().description}</p>
        </div>
      </header>
      <div class="utility-body">
        <Show when={props.kind === 'inbox'}>
          <InboxView
            status={props.status}
            statusError={props.statusError ?? ''}
            sourceJobs={props.sourceJobs}
            sourceJobError={props.sourceJobError}
            onRetrySourceJobs={props.onRetrySourceJobs}
            onOpenSettings={props.onOpenSettings}
            onRetryStatus={props.onRetryStatus}
            onCancelSourceJob={props.onCancelSourceJob}
          />
        </Show>
        <Show when={props.kind === 'conversations'}>
          <ConversationsView
            query={props.query}
            answer={props.answer}
            evidence={props.evidence}
            loading={props.loading}
            error={props.error}
            onSearchFocus={props.onSearchFocus}
          />
        </Show>
        <Show when={props.kind === 'agent-tools'}>
          <AgentToolsView
            query={props.query}
            evidence={props.evidence}
            contextBundle={props.contextBundle}
            contextLoading={props.contextLoading}
            contextError={props.contextError}
            contextTokens={props.contextTokens}
            onRetrieveContext={props.onRetrieveContext}
          />
        </Show>
        <Show when={props.kind === 'index'}>
          <IndexView
            status={props.status}
            statusError={props.statusError ?? ''}
            onOpenSettings={props.onOpenSettings}
            onRetryStatus={props.onRetryStatus}
          />
        </Show>
        <Show when={props.kind === 'help'}>
          <HelpView desktopAvailable={props.desktopAvailable} onOpenProject={props.onOpenProject} />
        </Show>
      </div>
    </main>
  )
}

function InboxView(props: {
  status: BrainStatus | null
  statusError: string
  sourceJobs: DesktopSourceJob[]
  sourceJobError?: string
  onRetrySourceJobs?: () => void
  onOpenSettings: () => void
  onRetryStatus?: () => void
  onCancelSourceJob?: (id: string) => void
}) {
  const attention = () =>
    (props.status?.sync_runs ?? []).filter((run) =>
      ['running', 'failed', 'cancelled', 'budget_exceeded'].includes(run.status)
    )
  const activeJobs = () =>
    props.sourceJobs.filter((job) => job.status === 'running' || job.status === 'cancelling')
  const completedJobs = () => recentCompletedJobs(props.sourceJobs)
  const empty = () =>
    !props.sourceJobError &&
    attention().length === 0 &&
    activeJobs().length === 0 &&
    completedJobs().length === 0

  const emptyView = (
    <Show
      when={props.status}
      fallback={
        <UtilityEmpty
          icon={
            props.statusError ? (
              <AlertTriangle size={26} />
            ) : (
              <LoaderCircle class="spin" size={26} />
            )
          }
          title={props.statusError ? 'Sync health unavailable' : 'Loading sync health'}
          detail={
            props.statusError ||
            'Waiting for the runtime status snapshot before reporting source health or sync history.'
          }
          actions={[
            ...(props.onRetryStatus
              ? [
                  {
                    label: 'Retry status',
                    icon: <RefreshCw size={15} />,
                    onClick: props.onRetryStatus!,
                  },
                ]
              : []),
            { label: 'Open settings', icon: <Settings size={15} />, onClick: props.onOpenSettings },
          ]}
        />
      }
    >
      <UtilityEmpty
        icon={<Inbox size={26} />}
        title="No sync attention"
        detail={
          props.statusError
            ? `${props.statusError} No attention is recorded in the last known snapshot.`
            : 'Every configured source is idle and the last sync of each source finished cleanly. New sync activity will appear here as it happens.'
        }
        actions={[
          { label: 'Open settings', icon: <Settings size={15} />, onClick: props.onOpenSettings },
        ]}
      />
    </Show>
  )

  return (
    <Show when={!empty()} fallback={emptyView}>
      <Show when={props.sourceJobError}>
        <p class="utility-error" role="alert">
          {props.sourceJobError}
          <Show when={props.onRetrySourceJobs}>
            {' '}
            <Button
              variant="ghost"
              type="button"
              class="link-button"
              onClick={props.onRetrySourceJobs}
            >
              Retry source jobs
            </Button>
          </Show>
        </p>
      </Show>
      <Show when={props.statusError && props.status}>
        <p class="utility-error" role="status">
          {props.statusError} Showing the last known sync snapshot.{' '}
          <Show when={props.onRetryStatus}>
            <Button variant="ghost" type="button" class="link-button" onClick={props.onRetryStatus}>
              Retry status
            </Button>
          </Show>
        </p>
      </Show>
      <Show when={attention().length > 0}>
        <section class="utility-section">
          <h2>Sync attention</h2>
          <div class="utility-list">
            <For each={attention()}>
              {(run) => (
                <div class="utility-item">
                  <SyncIcon status={run.status} />
                  <div class="utility-item-main">
                    <strong>{run.source}</strong>
                    <span>
                      {run.project} · started {new Date(run.started_at).toLocaleString()} ·{' '}
                      {describeSyncRunProgress(run)} ·{' '}
                      {run.progress_documents ?? run.documents ?? '—'} documents ·{' '}
                      {run.progress_bytes ?? run.bytes ?? '—'} bytes
                    </span>
                  </div>
                  <StatusPill status={run.status} />
                </div>
              )}
            </For>
          </div>
        </section>
      </Show>
      <Show when={activeJobs().length > 0}>
        <section class="utility-section">
          <h2>Active source jobs</h2>
          <div class="utility-list">
            <For each={activeJobs()}>
              {(job) => (
                <div class="utility-item">
                  <LoaderCircle class="spin" size={16} />
                  <div class="utility-item-main">
                    <strong>{job.source}</strong>
                    <span>
                      {job.project} · {job.operation} · {describeSourceJobProgress(job)} · started{' '}
                      {new Date(job.started_at_unix_seconds * 1000).toLocaleString()}
                    </span>
                  </div>
                  <StatusPill status={job.status} />
                  <Show when={props.onCancelSourceJob}>
                    <Button
                      variant="compact"
                      type="button"
                      class="utility-cancel"
                      disabled={job.status === 'cancelling'}
                      aria-label={`Cancel ${job.project} ${job.source} ${job.operation}`}
                      onClick={() => props.onCancelSourceJob?.(job.id)}
                    >
                      <CircleStop size={14} /> Cancel
                    </Button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </section>
      </Show>
      <Show when={completedJobs().length > 0}>
        <section class="utility-section">
          <h2>Recent source jobs</h2>
          <div class="utility-list">
            <For each={completedJobs()}>
              {(job) => {
                const terminalStatus = job.status === 'cancelling' ? 'running' : job.status
                const started = new Date(job.started_at_unix_seconds * 1000)
                const completed = job.completed_at_unix_seconds
                  ? new Date(job.completed_at_unix_seconds * 1000)
                  : null
                const duration = completed
                  ? `${Math.max(0, Math.round((completed.getTime() - started.getTime()) / 1000))}s`
                  : 'duration unavailable'
                return (
                  <div class="utility-item">
                    <SyncIcon status={terminalStatus} />
                    <div class="utility-item-main">
                      <strong>
                        {job.source} · {job.operation}
                      </strong>
                      <span>
                        {job.project} · {job.summary} · started {started.toLocaleString()} ·{' '}
                        {duration}
                      </span>
                      <Show when={job.log}>
                        <details class="utility-job-log">
                          <summary>View job log</summary>
                          <pre>{job.log}</pre>
                        </details>
                      </Show>
                    </div>
                    <StatusPill status={terminalStatus} />
                  </div>
                )
              }}
            </For>
          </div>
        </section>
      </Show>
      <div class="utility-actions">
        <Button variant="secondary" onClick={props.onOpenSettings}>
          <Settings size={15} /> Manage ingestion in settings
        </Button>
      </div>
    </Show>
  )
}

function ConversationsView(props: {
  query: string
  answer: AnswerResponse | null
  evidence: Evidence[]
  loading: boolean
  error: string
  onSearchFocus: () => void
}) {
  return (
    <Show
      when={!props.loading}
      fallback={
        <UtilityEmpty
          icon={<LoaderCircle class="spin" size={26} />}
          title="Searching the brain"
          detail={`Fusing semantic and exact-term evidence for “${props.query}”.`}
        />
      }
    >
      <Show
        when={!(props.error && !props.answer)}
        fallback={
          <UtilityEmpty
            icon={<AlertTriangle size={26} />}
            title="The brain is unreachable"
            detail={`${props.error} Start the Rust API or add ?demo=1 to preview the workspace.`}
            actions={[
              {
                label: 'Search the brain',
                icon: <Search size={15} />,
                onClick: props.onSearchFocus,
              },
            ]}
          />
        }
      >
        <Show
          when={props.answer}
          fallback={
            <UtilityEmpty
              icon={<MessageCircle size={26} />}
              title="No conversation yet"
              detail="Ask a question in the search bar above. The current query, answer, and cited evidence will be tracked here."
              actions={[
                {
                  label: 'Search the brain',
                  icon: <Search size={15} />,
                  onClick: props.onSearchFocus,
                },
              ]}
            />
          }
        >
          {(answer) => (
            <>
              <section class="utility-section">
                <h2>Current conversation</h2>
                <UtilityCard class="utility-card">
                  <span class="utility-card-eyebrow">
                    <Sparkles size={14} /> Query
                  </span>
                  <h3>{props.query}</h3>
                  <div class="utility-meta">
                    <span>{answer().mode}</span>
                    <span>
                      {answer().retrieval_degraded
                        ? 'lexical fallback'
                        : answer().retrieval_mode || 'hybrid retrieval'}
                    </span>
                    <span>{answer().cached ? 'cache hit' : `${answer().latency_ms} ms`}</span>
                    <span>
                      {answer().plan.queries.length}{' '}
                      {answer().plan.queries.length === 1 ? 'retrieval' : 'retrievals'}
                    </span>
                    <span>{props.evidence.length} cited passages</span>
                  </div>
                  <p class="utility-answer">{answer().answer}</p>
                  <For each={answer().warnings}>
                    {(warning) => <p class="answer-warning">{warning}</p>}
                  </For>
                </UtilityCard>
              </section>
              <Show when={props.evidence.length > 0}>
                <section class="utility-section">
                  <h2>Cited evidence</h2>
                  <div class="utility-list">
                    <For each={props.evidence.slice(0, 4)}>
                      {(item, index) => (
                        <div class="utility-item">
                          <span class="utility-index">{index() + 1}</span>
                          <div class="utility-item-main">
                            <strong>{item.title}</strong>
                            <span>
                              {codeRevisionLabel(item) ?? item.source} · updated{' '}
                              {new Date(item.updated_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Show>
              <div class="utility-actions">
                <Button variant="secondary" onClick={props.onSearchFocus}>
                  <Search size={15} /> Search the brain
                </Button>
              </div>
            </>
          )}
        </Show>
      </Show>
    </Show>
  )
}

function AgentToolsView(props: {
  query: string
  evidence: Evidence[]
  contextBundle: ContextBundle | null
  contextLoading: boolean
  contextError: string
  contextTokens: number
  onRetrieveContext: () => void
}) {
  const { copied, copyError, copy } = useClipboardCopy(() => props.contextBundle?.context ?? null)

  return (
    <>
      <section class="utility-section">
        <h2>Generated context</h2>
        <Show
          when={!props.contextLoading}
          fallback={
            <UtilityEmpty
              icon={<LoaderCircle class="spin" size={26} />}
              title="Retrieving context"
              detail={`Building a token-bounded bundle for “${props.query}”.`}
            />
          }
        >
          <Show
            when={props.contextBundle}
            fallback={
              <UtilityEmpty
                icon={<TerminalSquare size={26} />}
                title="No context generated yet"
                detail="Retrieve the token-bounded context bundle for the current conversation. It is the same citation-ready surface the agent integrations receive."
                actions={[
                  {
                    label: 'Retrieve context',
                    icon: <Sparkles size={15} />,
                    onClick: props.onRetrieveContext,
                  },
                ]}
              />
            }
          >
            {(contextBundle) => (
              <>
                <div class="utility-metrics">
                  <Metric label="Retrieval" value={contextBundle().retrieval_mode || 'hybrid'} />
                  <Metric
                    label="Retrieved"
                    value={contextBundle().metrics.retrieved.toLocaleString()}
                  />
                  <Metric
                    label="Included"
                    value={contextBundle().metrics.included.toLocaleString()}
                  />
                  <Metric
                    label="Omitted"
                    value={contextBundle().metrics.omitted.toLocaleString()}
                  />
                  <Metric
                    label="Native memory"
                    value={(
                      contextBundle().metrics.memories_included ??
                      contextBundle().memories?.length ??
                      0
                    ).toLocaleString()}
                  />
                  <Metric
                    label="Estimated tokens"
                    value={contextBundle().metrics.estimated_tokens.toLocaleString()}
                  />
                  <Metric
                    label="Max tokens"
                    value={contextBundle().metrics.max_tokens.toLocaleString()}
                  />
                </div>
                <Show when={contextBundle().retrieval_warning}>
                  <p class="answer-warning" role="status">
                    {contextBundle().retrieval_warning}
                  </p>
                </Show>
                <Show when={contextBundle().evidence.length > 0}>
                  <div class="utility-list utility-list-spaced">
                    <For each={contextBundle().evidence}>
                      {(item) => (
                        <div class="utility-item">
                          <FileText size={16} />
                          <div class="utility-item-main">
                            <strong>{item.title}</strong>
                            <span>
                              {item.source} · score {item.score.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
                <div class="utility-actions">
                  <Button
                    variant="secondary"
                    aria-label="Copy MCP-equivalent context"
                    onClick={() => void copy()}
                  >
                    {copied() ? <Check size={15} /> : <Copy size={15} />}
                    {copied() ? 'Context copied' : 'Copy MCP-equivalent context'}
                  </Button>
                  <Show when={copyError()}>
                    <p class="utility-error" role="alert">
                      {copyError()}
                    </p>
                  </Show>
                </div>
              </>
            )}
          </Show>
        </Show>
        <Show when={props.contextError}>
          <p class="utility-error" role="alert">
            {props.contextError}
          </p>
        </Show>
      </section>
      <section class="utility-section">
        <h2>Agent context window</h2>
        <UtilityCard class="utility-card">
          <p class="utility-answer">
            ~{props.contextTokens.toLocaleString()} tokens assembled from the active query and{' '}
            {props.evidence.length} cited {props.evidence.length === 1 ? 'passage' : 'passages'}.
          </p>
          <p class="utility-note">
            The window is rebuilt locally from the current session state and never leaves this
            machine.
          </p>
        </UtilityCard>
      </section>
    </>
  )
}

function IndexView(props: {
  status: BrainStatus | null
  statusError: string
  onOpenSettings: () => void
  onRetryStatus?: () => void
}) {
  return (
    <Show
      when={props.status}
      fallback={
        <UtilityEmpty
          icon={
            props.statusError ? (
              <AlertTriangle size={26} />
            ) : (
              <LoaderCircle class="spin" size={26} />
            )
          }
          title={props.statusError ? 'Index unavailable' : 'Loading index'}
          detail={
            props.statusError ||
            'Waiting for the runtime status snapshot before reporting live index metrics.'
          }
          actions={[
            ...(props.onRetryStatus
              ? [
                  {
                    label: 'Retry status',
                    icon: <RefreshCw size={15} />,
                    onClick: props.onRetryStatus,
                  },
                ]
              : []),
            { label: 'Open settings', icon: <Settings size={15} />, onClick: props.onOpenSettings },
          ]}
        />
      }
    >
      {(status) => (
        <>
          <Show when={status().stats_stale}>
            <p class="utility-warning" role="status">
              {status().stats_warning ?? 'Live database statistics are temporarily stale.'}
              {typeof status().stats_age_seconds === 'number'
                ? ` Snapshot age: ${status().stats_age_seconds!.toLocaleString()} seconds.`
                : ''}
            </p>
          </Show>
          <section class="utility-section">
            <h2>Live metrics</h2>
            <div class="utility-metrics">
              <Metric label="Documents" value={status().documents.toLocaleString()} />
              <Metric label="Chunks" value={status().chunks.toLocaleString()} />
              <Metric label="Sources" value={status().sources.length.toLocaleString()} />
              <Metric
                label="Embedding cache"
                value={`${status().embedding_cache_entries.toLocaleString()} entries`}
              />
              <Metric
                label="Embedding cache hits"
                value={status().embedding_cache_hits.toLocaleString()}
              />
              <Metric
                label="Query cache"
                value={`${status().query_cache_entries.toLocaleString()} entries`}
              />
              <Metric label="Query cache hits" value={status().query_cache_hits.toLocaleString()} />
              <Metric
                label="Retrieval fallbacks"
                value={(status().retrieval_fallbacks_total ?? 0).toLocaleString()}
              />
              <Metric label="Answers total" value={status().answers_total.toLocaleString()} />
              <Metric
                label="Native memory"
                value={`${status().memory.active.toLocaleString()} active · ${status().memory.total.toLocaleString()} total`}
              />
              <Metric label="Expired memory" value={status().memory.expired.toLocaleString()} />
            </div>
          </section>
          <section class="utility-section">
            <h2>Configuration</h2>
            <UtilityCard class="utility-card">
              <div class="utility-line">
                <span>Embedding</span>
                <strong>{status().embedding_fingerprint ?? '—'}</strong>
              </div>
              <div class="utility-line">
                <span>Query mode</span>
                <strong>{status().query.mode}</strong>
              </div>
              <div class="utility-line">
                <span>Ingestion</span>
                <strong>
                  {status().ingestion.mode}
                  {status().ingestion.scheduled ? ' · scheduled' : ' · manual'}
                </strong>
              </div>
              <div class="utility-line">
                <span>Workspaces</span>
                <strong>{status().workspaces.length}</strong>
              </div>
            </UtilityCard>
          </section>
          <div class="utility-actions">
            <Button variant="secondary" onClick={props.onOpenSettings}>
              <Settings size={15} /> Open settings
            </Button>
          </div>
        </>
      )}
    </Show>
  )
}

function HelpView(props: { desktopAvailable: boolean; onOpenProject: () => void | Promise<void> }) {
  const [projectError, setProjectError] = createSignal('')
  const shortcuts = [
    { keys: shortcutLabel('MOD K'), action: 'Focus the search bar' },
    { keys: shortcutLabel('MOD P'), action: 'Toggle the command palette' },
    { keys: shortcutLabel('MOD ⇧ F'), action: 'Open the document filter' },
    { keys: 'Esc', action: 'Close panels and the palette' },
  ]
  const links = [
    {
      label: 'GitHub project',
      href: 'https://github.com/adea-ai/cortana',
      detail: 'Source, releases, and issues.',
    },
    {
      label: 'Documentation',
      href: 'https://github.com/adea-ai/cortana/tree/main/docs',
      detail: 'Architecture, ingestion, query, and operations guides.',
    },
  ]
  return (
    <>
      <section class="utility-section">
        <h2>Keyboard shortcuts</h2>
        <div class="utility-list">
          <For each={shortcuts}>
            {({ keys, action }) => (
              <div class="utility-shortcut">
                <kbd>{keys}</kbd>
                <span>{action}</span>
              </div>
            )}
          </For>
        </div>
      </section>
      <section class="utility-section">
        <h2>Project and docs</h2>
        <div class="utility-list">
          <For each={links}>
            {({ label, href, detail }) => (
              <a
                class="utility-link"
                href={href}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  if (!props.desktopAvailable) return
                  event.preventDefault()
                  setProjectError('')
                  void openDesktopUrl(href).catch((caught: unknown) => {
                    setProjectError(
                      caught instanceof Error
                        ? caught.message
                        : `Unable to open ${label.toLowerCase()} in the system browser`
                    )
                  })
                }}
              >
                <BookOpen size={16} />
                <span>
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
                <ExternalLink size={14} />
              </a>
            )}
          </For>
        </div>
        <Show when={props.desktopAvailable}>
          <div class="utility-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setProjectError('')
                void Promise.resolve(props.onOpenProject()).catch((caught: unknown) => {
                  setProjectError(
                    caught instanceof Error
                      ? caught.message
                      : 'Unable to open the Cortana project page'
                  )
                })
              }}
            >
              <ExternalLink size={15} /> Open project page
            </Button>
          </div>
        </Show>
        <Show when={projectError()}>
          <p class="utility-error" role="alert">
            {projectError()}
          </p>
        </Show>
        <p class="utility-note">
          Cortana is local-first: your index, context bundles, and settings stay on this machine.
        </p>
      </section>
    </>
  )
}

function SyncIcon(props: { status: string }) {
  return (
    <>
      {props.status === 'running' || props.status === 'cancelling' ? (
        <LoaderCircle class="spin" size={16} />
      ) : props.status === 'succeeded' ? (
        <CheckCircle2 size={16} />
      ) : props.status === 'cancelled' ? (
        <CircleX size={16} />
      ) : (
        <AlertTriangle size={16} />
      )}
    </>
  )
}

function StatusPill(props: {
  status: 'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled' | 'budget_exceeded'
}) {
  const label = () =>
    props.status === 'budget_exceeded'
      ? 'Budget exceeded'
      : props.status === 'cancelling'
        ? 'Cancelling…'
        : props.status === 'succeeded'
          ? 'Succeeded'
          : props.status[0].toUpperCase() + props.status.slice(1)
  const tone = () =>
    props.status === 'running' || props.status === 'cancelling'
      ? 'running'
      : props.status === 'succeeded'
        ? 'healthy'
        : 'warning'
  return <span class={`status-pill ${tone()}`}>{label()}</span>
}

function Metric(props: { label: string; value: string }) {
  return (
    <div class="utility-metric">
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  )
}

function UtilityEmpty(props: {
  icon: JSX.Element
  title: string
  detail: string
  actions?: Array<{ label: string; icon: JSX.Element; onClick: () => void }>
}) {
  return (
    <div class="utility-empty">
      {props.icon}
      <strong>{props.title}</strong>
      <p>{props.detail}</p>
      <Show when={(props.actions ?? EMPTY_ACTIONS).length > 0}>
        <div class="utility-actions utility-actions-center">
          <For each={props.actions ?? EMPTY_ACTIONS}>
            {({ label, icon: actionIcon, onClick }) => (
              <Button variant="secondary" onClick={onClick}>
                {actionIcon} {label}
              </Button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
