import { Spinner } from '@adea-ai/ui/components/ui/spinner'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@adea-ai/ui/components/ui/accordion'
import { Alert, AlertDescription } from '@adea-ai/ui/components/ui/alert'
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
  MessageCircle,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  TerminalSquare,
} from 'lucide-solid'
import { createSignal, For, Show } from 'solid-js'

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
import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import { ListGroup, ListRow } from '@adea-ai/ui/components/composites/list-row'
import { Badge } from '@adea-ai/ui/components/ui/badge'
import { Table, TableBody, TableRow, TableCell, TableHead } from '@adea-ai/ui/components/ui/table'
import { Kbd } from '@adea-ai/ui/components/ui/kbd'
import { Card } from '@adea-ai/ui/components/ui/card'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@adea-ai/ui/components/ui/empty'
import { Stat } from '@adea-ai/ui/components/composites/stat'
import { StatusChip } from '@adea-ai/ui/components/ui/status-chip'

import type { UtilityKind } from '../utilityKinds'
export { isUtilityKind, type UtilityKind } from '../utilityKinds'

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
    <main
      tabIndex={-1}
      id="main-content"
      class="utility-view m7-utility-view"
      data-m7-utility-view={props.kind}
    >
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
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {props.statusError ? (
                <AlertTriangle size={26} aria-hidden="true" />
              ) : (
                <Spinner size="xl" label={false} />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {props.statusError ? 'Sync health unavailable' : 'Loading sync health'}
            </EmptyTitle>
            <EmptyDescription>
              {props.statusError ||
                'Waiting for the runtime status snapshot before reporting source health or sync history.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <For
              each={[
                ...(props.onRetryStatus
                  ? [
                      {
                        label: 'Retry status',
                        icon: <RefreshCw size={15} aria-hidden="true" />,
                        onClick: props.onRetryStatus!,
                      },
                    ]
                  : []),
                {
                  label: 'Open settings',
                  icon: <Settings size={15} aria-hidden="true" />,
                  onClick: props.onOpenSettings,
                },
              ]}
            >
              {({ label, icon, onClick }) => (
                <Button variant="secondary" size="sm" tooltip={label} onClick={onClick}>
                  {icon}
                  {label}
                </Button>
              )}
            </For>
          </EmptyContent>
        </Empty>
      }
    >
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">{<Inbox size={26} aria-hidden="true" />}</EmptyMedia>
          <EmptyTitle>{'No sync attention'}</EmptyTitle>
          <EmptyDescription>
            {props.statusError
              ? `${props.statusError} No attention is recorded in the last known snapshot.`
              : 'Every configured source is idle and the last sync of each source finished cleanly. New sync activity will appear here as it happens.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <For
            each={[
              {
                label: 'Open settings',
                icon: <Settings size={15} aria-hidden="true" />,
                onClick: props.onOpenSettings,
              },
            ]}
          >
            {({ label, icon, onClick }) => (
              <Button variant="secondary" size="sm" tooltip={label} onClick={onClick}>
                {icon}
                {label}
              </Button>
            )}
          </For>
        </EmptyContent>
      </Empty>
    </Show>
  )

  return (
    <Show when={!empty()} fallback={emptyView}>
      <Show when={props.sourceJobError}>
        <Alert variant="destructive" class="utility-error" role="alert">
          <AlertDescription>
            {props.sourceJobError}
            <Show when={props.onRetrySourceJobs}>
              {' '}
              <Button
                tooltip="Retry source jobs"
                variant="ghost"
                size="sm"
                type="button"
                class="link-button"
                onClick={props.onRetrySourceJobs}
              >
                Retry source jobs
              </Button>
            </Show>
          </AlertDescription>
        </Alert>
      </Show>
      <Show when={props.statusError && props.status}>
        <Alert variant="destructive" class="utility-error" role="status">
          <AlertDescription>
            {props.statusError} Showing the last known sync snapshot.{' '}
            <Show when={props.onRetryStatus}>
              <Button
                tooltip="Retry status"
                variant="ghost"
                size="sm"
                type="button"
                class="link-button"
                onClick={props.onRetryStatus}
              >
                Retry status
              </Button>
            </Show>
          </AlertDescription>
        </Alert>
      </Show>
      <Show when={attention().length > 0}>
        <section class="utility-section">
          <h2>Sync attention</h2>
          <ListGroup>
            <For each={attention()}>
              {(run) => (
                <ListRow
                  leading={<SyncIcon status={run.status} />}
                  description={`${run.project} · started ${new Date(run.started_at).toLocaleString()} · ${describeSyncRunProgress(run)} · ${run.progress_documents ?? run.documents ?? '—'} documents · ${run.progress_bytes ?? run.bytes ?? '—'} bytes`}
                  trailing={<StatusPill status={run.status} />}
                >
                  {run.source}
                </ListRow>
              )}
            </For>
          </ListGroup>
        </section>
      </Show>
      <Show when={activeJobs().length > 0}>
        <section class="utility-section">
          <h2>Active source jobs</h2>
          <ListGroup>
            <For each={activeJobs()}>
              {(job) => (
                <ListRow
                  leading={<Spinner size="sm" label={false} />}
                  description={`${job.project} · ${job.operation} · ${describeSourceJobProgress(job)} · started ${new Date(job.started_at_unix_seconds * 1000).toLocaleString()}`}
                  trailing={
                    <>
                      <StatusPill status={job.status} />
                      <Show when={props.onCancelSourceJob}>
                        <Button
                          tooltip={`Cancel ${job.project} ${job.source} ${job.operation}`}
                          variant="secondary"
                          size="xs"
                          type="button"
                          class="utility-cancel"
                          disabled={job.status === 'cancelling'}
                          aria-label={`Cancel ${job.project} ${job.source} ${job.operation}`}
                          onClick={() => props.onCancelSourceJob?.(job.id)}
                        >
                          <CircleStop size={14} aria-hidden="true" /> Cancel
                        </Button>
                      </Show>
                    </>
                  }
                >
                  {job.source}
                </ListRow>
              )}
            </For>
          </ListGroup>
        </section>
      </Show>
      <Show when={completedJobs().length > 0}>
        <section class="utility-section">
          <h2>Recent source jobs</h2>
          <ListGroup>
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
                  <>
                    <ListRow
                      leading={<SyncIcon status={terminalStatus} />}
                      description={`${job.project} · ${job.summary} · started ${started.toLocaleString()} · ${duration}`}
                      trailing={<StatusPill status={terminalStatus} />}
                    >
                      {job.source} · {job.operation}
                    </ListRow>
                    <Show when={job.log}>
                      <Accordion collapsible class="utility-job-log">
                        <AccordionItem value="details">
                          <AccordionTrigger>View job log</AccordionTrigger>
                          <AccordionContent>
                            <pre>{job.log}</pre>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </Show>
                  </>
                )
              }}
            </For>
          </ListGroup>
        </section>
      </Show>
      <div class="utility-actions">
        <Button
          tooltip="Manage ingestion in settings"
          variant="secondary"
          size="sm"
          onClick={props.onOpenSettings}
        >
          <Settings size={15} aria-hidden="true" /> Manage ingestion in settings
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
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{<Spinner size="xl" label={false} />}</EmptyMedia>
            <EmptyTitle>{'Searching the brain'}</EmptyTitle>
            <EmptyDescription>{`Fusing semantic and exact-term evidence for “${props.query}”.`}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    >
      <Show
        when={!(props.error && !props.answer)}
        fallback={
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {<AlertTriangle size={26} aria-hidden="true" />}
              </EmptyMedia>
              <EmptyTitle>{'The brain is unreachable'}</EmptyTitle>
              <EmptyDescription>{`${props.error} Start the Rust API or add ?demo=1 to preview the workspace.`}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <For
                each={[
                  {
                    label: 'Search the brain',
                    icon: <Search size={15} aria-hidden="true" />,
                    onClick: props.onSearchFocus,
                  },
                ]}
              >
                {({ label, icon, onClick }) => (
                  <Button variant="secondary" size="sm" tooltip={label} onClick={onClick}>
                    {icon}
                    {label}
                  </Button>
                )}
              </For>
            </EmptyContent>
          </Empty>
        }
      >
        <Show
          when={props.answer}
          fallback={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {<MessageCircle size={26} aria-hidden="true" />}
                </EmptyMedia>
                <EmptyTitle>{'No conversation yet'}</EmptyTitle>
                <EmptyDescription>
                  {
                    'Ask a question in the search bar above. The current query, answer, and cited evidence will be tracked here.'
                  }
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <For
                  each={[
                    {
                      label: 'Search the brain',
                      icon: <Search size={15} aria-hidden="true" />,
                      onClick: props.onSearchFocus,
                    },
                  ]}
                >
                  {({ label, icon, onClick }) => (
                    <Button variant="secondary" size="sm" tooltip={label} onClick={onClick}>
                      {icon}
                      {label}
                    </Button>
                  )}
                </For>
              </EmptyContent>
            </Empty>
          }
        >
          {(answer) => (
            <>
              <section class="utility-section">
                <h2>Current conversation</h2>
                <Card class="utility-card">
                  <span class="utility-card-eyebrow">
                    <Sparkles size={14} aria-hidden="true" /> Query
                  </span>
                  <h3>{props.query}</h3>
                  <div class="utility-meta">
                    <Badge variant="secondary">{answer().mode}</Badge>
                    <Badge variant="secondary">
                      {answer().retrieval_degraded
                        ? 'lexical fallback'
                        : answer().retrieval_mode || 'hybrid retrieval'}
                    </Badge>
                    <Badge variant="secondary">
                      {answer().cached ? 'cache hit' : `${answer().latency_ms} ms`}
                    </Badge>
                    <Badge variant="secondary">
                      {answer().plan.queries.length}{' '}
                      {answer().plan.queries.length === 1 ? 'retrieval' : 'retrievals'}
                    </Badge>
                    <Badge variant="secondary">{props.evidence.length} cited passages</Badge>
                  </div>
                  <p class="utility-answer">{answer().answer}</p>
                  <For each={answer().warnings}>
                    {(warning) => (
                      <Alert variant="warning" class="answer-warning">
                        <AlertDescription>{warning}</AlertDescription>
                      </Alert>
                    )}
                  </For>
                </Card>
              </section>
              <Show when={props.evidence.length > 0}>
                <section class="utility-section">
                  <h2>Cited evidence</h2>
                  <ListGroup>
                    <For each={props.evidence.slice(0, 4)}>
                      {(item, index) => (
                        <ListRow
                          leading={<span>{index() + 1}</span>}
                          description={`${codeRevisionLabel(item) ?? item.source} · updated ${new Date(item.updated_at).toLocaleDateString()}`}
                        >
                          {item.title}
                        </ListRow>
                      )}
                    </For>
                  </ListGroup>
                </section>
              </Show>
              <div class="utility-actions">
                <Button
                  tooltip="Search the brain"
                  variant="secondary"
                  size="sm"
                  onClick={props.onSearchFocus}
                >
                  <Search size={15} aria-hidden="true" /> Search the brain
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
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">{<Spinner size="xl" label={false} />}</EmptyMedia>
                <EmptyTitle>{'Retrieving context'}</EmptyTitle>
                <EmptyDescription>{`Building a token-bounded bundle for “${props.query}”.`}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
        >
          <Show
            when={props.contextBundle}
            fallback={
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {<TerminalSquare size={26} aria-hidden="true" />}
                  </EmptyMedia>
                  <EmptyTitle>{'No context generated yet'}</EmptyTitle>
                  <EmptyDescription>
                    {
                      'Retrieve the token-bounded context bundle for the current conversation. It is the same citation-ready surface the agent integrations receive.'
                    }
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <For
                    each={[
                      {
                        label: 'Retrieve context',
                        icon: <Sparkles size={15} aria-hidden="true" />,
                        onClick: props.onRetrieveContext,
                      },
                    ]}
                  >
                    {({ label, icon, onClick }) => (
                      <Button variant="secondary" size="sm" tooltip={label} onClick={onClick}>
                        {icon}
                        {label}
                      </Button>
                    )}
                  </For>
                </EmptyContent>
              </Empty>
            }
          >
            {(contextBundle) => (
              <>
                <div class="utility-metrics">
                  <Stat label="Retrieval" value={contextBundle().retrieval_mode || 'hybrid'} />
                  <Stat
                    label="Retrieved"
                    value={contextBundle().metrics.retrieved.toLocaleString()}
                  />
                  <Stat
                    label="Included"
                    value={contextBundle().metrics.included.toLocaleString()}
                  />
                  <Stat label="Omitted" value={contextBundle().metrics.omitted.toLocaleString()} />
                  <Stat
                    label="Native memory"
                    value={(
                      contextBundle().metrics.memories_included ??
                      contextBundle().memories?.length ??
                      0
                    ).toLocaleString()}
                  />
                  <Stat
                    label="Estimated tokens"
                    value={contextBundle().metrics.estimated_tokens.toLocaleString()}
                  />
                  <Stat
                    label="Max tokens"
                    value={contextBundle().metrics.max_tokens.toLocaleString()}
                  />
                </div>
                <Show when={contextBundle().retrieval_warning}>
                  <Alert variant="warning" class="answer-warning" role="status">
                    <AlertDescription>{contextBundle().retrieval_warning}</AlertDescription>
                  </Alert>
                </Show>
                <Show when={contextBundle().evidence.length > 0}>
                  <ListGroup class="utility-list-spaced">
                    <For each={contextBundle().evidence}>
                      {(item) => (
                        <ListRow
                          leading={<FileText size={16} aria-hidden="true" />}
                          description={`${item.source} · score ${item.score.toFixed(2)}`}
                        >
                          {item.title}
                        </ListRow>
                      )}
                    </For>
                  </ListGroup>
                </Show>
                <div class="utility-actions">
                  <Button
                    tooltip="Copy MCP-equivalent context"
                    variant="secondary"
                    size="sm"
                    aria-label="Copy MCP-equivalent context"
                    onClick={() => void copy()}
                  >
                    {copied() ? (
                      <Check size={15} aria-hidden="true" />
                    ) : (
                      <Copy size={15} aria-hidden="true" />
                    )}
                    {copied() ? 'Context copied' : 'Copy MCP-equivalent context'}
                  </Button>
                  <Show when={copyError()}>
                    <Alert variant="destructive" class="utility-error" role="alert">
                      <AlertDescription>{copyError()}</AlertDescription>
                    </Alert>
                  </Show>
                </div>
              </>
            )}
          </Show>
        </Show>
        <Show when={props.contextError}>
          <Alert variant="destructive" class="utility-error" role="alert">
            <AlertDescription>{props.contextError}</AlertDescription>
          </Alert>
        </Show>
      </section>
      <section class="utility-section">
        <h2>Agent context window</h2>
        <Card class="utility-card">
          <p class="utility-answer">
            ~{props.contextTokens.toLocaleString()} tokens assembled from the active query and{' '}
            {props.evidence.length} cited {props.evidence.length === 1 ? 'passage' : 'passages'}.
          </p>
          <p class="utility-note">
            The window is rebuilt locally from the current session state and never leaves this
            machine.
          </p>
        </Card>
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
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {props.statusError ? (
                <AlertTriangle size={26} aria-hidden="true" />
              ) : (
                <Spinner size="xl" label={false} />
              )}
            </EmptyMedia>
            <EmptyTitle>{props.statusError ? 'Index unavailable' : 'Loading index'}</EmptyTitle>
            <EmptyDescription>
              {props.statusError ||
                'Waiting for the runtime status snapshot before reporting live index metrics.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <For
              each={[
                ...(props.onRetryStatus
                  ? [
                      {
                        label: 'Retry status',
                        icon: <RefreshCw size={15} aria-hidden="true" />,
                        onClick: props.onRetryStatus,
                      },
                    ]
                  : []),
                {
                  label: 'Open settings',
                  icon: <Settings size={15} aria-hidden="true" />,
                  onClick: props.onOpenSettings,
                },
              ]}
            >
              {({ label, icon, onClick }) => (
                <Button variant="secondary" size="sm" tooltip={label} onClick={onClick}>
                  {icon}
                  {label}
                </Button>
              )}
            </For>
          </EmptyContent>
        </Empty>
      }
    >
      {(status) => (
        <>
          <Show when={status().stats_stale}>
            <Alert variant="warning" class="utility-warning" role="status">
              <AlertDescription>
                {status().stats_warning ?? 'Live database statistics are temporarily stale.'}
                {typeof status().stats_age_seconds === 'number'
                  ? ` Snapshot age: ${status().stats_age_seconds!.toLocaleString()} seconds.`
                  : ''}
              </AlertDescription>
            </Alert>
          </Show>
          <section class="utility-section">
            <h2>Live metrics</h2>
            <div class="utility-metrics">
              <Stat label="Documents" value={status().documents.toLocaleString()} />
              <Stat label="Chunks" value={status().chunks.toLocaleString()} />
              <Stat label="Sources" value={status().sources.length.toLocaleString()} />
              <Stat
                label="Embedding cache"
                value={`${status().embedding_cache_entries.toLocaleString()} entries`}
              />
              <Stat
                label="Embedding cache hits"
                value={status().embedding_cache_hits.toLocaleString()}
              />
              <Stat
                label="Query cache"
                value={`${status().query_cache_entries.toLocaleString()} entries`}
              />
              <Stat label="Query cache hits" value={status().query_cache_hits.toLocaleString()} />
              <Stat
                label="Retrieval fallbacks"
                value={(status().retrieval_fallbacks_total ?? 0).toLocaleString()}
              />
              <Stat label="Answers total" value={status().answers_total.toLocaleString()} />
              <Stat
                label="Native memory"
                value={`${status().memory.active.toLocaleString()} active · ${status().memory.total.toLocaleString()} total`}
              />
              <Stat label="Expired memory" value={status().memory.expired.toLocaleString()} />
            </div>
          </section>
          <section class="utility-section">
            <h2>Configuration</h2>
            <Table aria-label="Index configuration">
              <TableBody>
                <TableRow>
                  <TableHead scope="row">Embedding</TableHead>
                  <TableCell class="break-words">{status().embedding_fingerprint ?? '—'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableHead scope="row">Query mode</TableHead>
                  <TableCell>{status().query.mode}</TableCell>
                </TableRow>
                <TableRow>
                  <TableHead scope="row">Ingestion</TableHead>
                  <TableCell>
                    {status().ingestion.mode}
                    {status().ingestion.scheduled ? ' · scheduled' : ' · manual'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableHead scope="row">Workspaces</TableHead>
                  <TableCell>{status().workspaces.length}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
          <div class="utility-actions">
            <Button
              tooltip="Review configuration and resolve setup requirements."
              variant="secondary"
              size="sm"
              onClick={props.onOpenSettings}
            >
              <Settings size={15} aria-hidden="true" /> Open settings
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
        <ListGroup>
          <For each={shortcuts}>
            {({ keys, action }) => <ListRow trailing={<Kbd>{keys}</Kbd>}>{action}</ListRow>}
          </For>
        </ListGroup>
      </section>
      <section class="utility-section">
        <h2>Project and docs</h2>
        <ListGroup>
          <For each={links}>
            {({ label, href, detail }) => (
              <ListRow
                as="a"
                tooltip={`Open ${label.toLowerCase()} in your browser.`}
                leading={<BookOpen size={16} aria-hidden="true" />}
                description={detail}
                trailing={<ExternalLink size={14} aria-hidden="true" />}
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
                {label}
              </ListRow>
            )}
          </For>
        </ListGroup>
        <Show when={props.desktopAvailable}>
          <div class="utility-actions">
            <Button
              tooltip="Open project page"
              variant="secondary"
              size="sm"
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
              <ExternalLink size={15} aria-hidden="true" /> Open project page
            </Button>
          </div>
        </Show>
        <Show when={projectError()}>
          <Alert variant="destructive" class="utility-error" role="alert">
            <AlertDescription>{projectError()}</AlertDescription>
          </Alert>
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
        <Spinner size="md" label={false} />
      ) : props.status === 'succeeded' ? (
        <CheckCircle2 size={16} aria-hidden="true" />
      ) : props.status === 'cancelled' ? (
        <CircleX size={16} aria-hidden="true" />
      ) : (
        <AlertTriangle size={16} aria-hidden="true" />
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
      ? 'info'
      : props.status === 'succeeded'
        ? 'success'
        : props.status === 'cancelled'
          ? 'neutral'
          : 'danger'
  return <StatusChip label={label()} tone={tone()} />
}
