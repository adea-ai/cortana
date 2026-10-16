import { Alert, AlertDescription } from '@adea-ai/ui/components/ui/alert'
import {
  AlertTriangle,
  Check,
  Copy,
  FileText,
  MessageCircle,
  Search,
  Settings,
  Sparkles,
  TerminalSquare,
} from 'lucide-solid'
import { For, Show } from 'solid-js'

import { codeRevisionLabel } from '../codeEvidence'
import type { AnswerResponse, BrainStatus, ContextBundle, Evidence } from '../types'
import { useClipboardCopy } from '../useClipboardCopy'
import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import { ListGroup, ListRow } from '@adea-ai/ui/components/composites/list-row'
import { Badge } from '@adea-ai/ui/components/ui/badge'
import { Table, TableBody, TableRow, TableCell, TableHead } from '@adea-ai/ui/components/ui/table'
import { Card, CardContent, CardHeader } from '@adea-ai/ui/components/ui/card'
import { Separator } from '@adea-ai/ui/components/ui/separator'
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from '@adea-ai/ui/components/layout/page'
import { EmptyState } from '@adea-ai/ui/components/ui/empty'
import { Stat, StatGroup } from '@adea-ai/ui/components/composites/stat'

import type { UtilityKind } from '../utilityKinds'
import { Heading, Text } from '@adea-ai/ui/components/ui/typography'
export { isUtilityKind, type UtilityKind } from '../utilityKinds'

const TITLES: Record<UtilityKind, { eyebrow: string; title: string; description: string }> = {
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
}

export function UtilityView(props: {
  kind: UtilityKind
  status: BrainStatus | null
  statusError?: string
  onRetryStatus?: () => void
  query: string
  answer: AnswerResponse | null
  evidence: Evidence[]
  loading: boolean
  error: string
  contextBundle: ContextBundle | null
  contextLoading: boolean
  contextError: string
  contextTokens: number
  onSearchFocus: () => void
  onRetrieveContext: () => void
  onOpenSettings: () => void
}) {
  const titles = () => TITLES[props.kind]
  return (
    <main tabIndex={-1} id="main-content" class="utility-view" data-m7-utility-view={props.kind}>
      <PageHeader>
        <PageHeaderContent>
          <Text variant="overline">{titles().eyebrow}</Text>
          <PageHeaderTitle>{titles().title}</PageHeaderTitle>
          <PageHeaderDescription>{titles().description}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      <Separator />
      <div
        data-utility-body=""
        class="grid min-h-0 flex-1 grid-cols-1 content-start gap-7 overflow-y-auto px-5 pt-5 pb-14 min-[1180px]:grid-cols-2"
      >
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
      </div>
    </main>
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
        <EmptyState
          headingLevel={2}
          busy
          announceAs="status"
          title="Searching the brain"
          detail={`Fusing semantic and exact-term evidence for “${props.query}”.`}
        />
      }
    >
      <Show
        when={!(props.error && !props.answer)}
        fallback={
          <EmptyState
            headingLevel={2}
            icon={<AlertTriangle aria-hidden="true" />}
            announceAs="alert"
            title="The brain is unreachable"
            detail={`${props.error.replace(/[.!?]+$/, '')}. Start the Rust API or add ?demo=1 to preview the workspace.`}
            action={props.onSearchFocus}
            actionLabel="Search the brain"
          />
        }
      >
        <Show
          when={props.answer}
          fallback={
            <EmptyState
              headingLevel={2}
              icon={<MessageCircle aria-hidden="true" />}
              title="No conversation yet"
              detail="Ask a question in the search bar above. The current query, answer, and cited evidence will be tracked here."
              action={props.onSearchFocus}
              actionLabel="Search the brain"
            />
          }
        >
          {(answer) => (
            <>
              <section class="flex min-w-0 flex-col gap-3">
                <Heading size="section">Current conversation</Heading>
                <Card size="sm">
                  <CardHeader>
                    <Text variant="overline">
                      <span class="inline-flex items-center gap-1.5">
                        <Sparkles size={14} aria-hidden="true" /> Query
                      </span>
                    </Text>
                    <Heading as="h3" size="title">
                      {props.query}
                    </Heading>
                  </CardHeader>
                  <CardContent>
                    <div class="flex flex-col gap-3">
                      <div class="flex flex-wrap gap-2">
                        <Badge variant="outline">{answer().mode}</Badge>
                        <Badge variant="outline">
                          {answer().retrieval_degraded
                            ? 'lexical fallback'
                            : answer().retrieval_mode || 'hybrid retrieval'}
                        </Badge>
                        <Badge variant="outline">
                          {answer().cached ? 'cache hit' : `${answer().latency_ms} ms`}
                        </Badge>
                        <Badge variant="outline">
                          {answer().plan.queries.length}{' '}
                          {answer().plan.queries.length === 1 ? 'retrieval' : 'retrievals'}
                        </Badge>
                        <Badge variant="outline">{props.evidence.length} cited passages</Badge>
                      </div>
                      <Text class="whitespace-pre-wrap">{answer().answer}</Text>
                      <For each={answer().warnings}>
                        {(warning) => (
                          <Alert variant="warning">
                            <AlertDescription>{warning}</AlertDescription>
                          </Alert>
                        )}
                      </For>
                    </div>
                  </CardContent>
                </Card>
              </section>
              <Show when={props.evidence.length > 0}>
                <section class="flex min-w-0 flex-col gap-3">
                  <Heading size="section">Cited evidence</Heading>
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
              <div class="flex flex-wrap gap-2 min-[1180px]:col-span-full">
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
      <section class="flex min-w-0 flex-col gap-3">
        <Heading size="section">Generated context</Heading>
        <Show
          when={!props.contextLoading}
          fallback={
            <EmptyState
              headingLevel={3}
              busy
              announceAs="status"
              title="Retrieving context"
              detail={`Building a token-bounded bundle for “${props.query}”.`}
            />
          }
        >
          <Show
            when={props.contextBundle}
            fallback={
              <EmptyState
                headingLevel={3}
                icon={<TerminalSquare aria-hidden="true" />}
                title="No context generated yet"
                detail="Retrieve the token-bounded context bundle for the current conversation. It is the same citation-ready surface the agent integrations receive."
                action={props.onRetrieveContext}
                actionLabel="Retrieve context"
              />
            }
          >
            {(contextBundle) => (
              <>
                <StatGroup fit>
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
                </StatGroup>
                <Show when={contextBundle().retrieval_warning}>
                  <Alert variant="warning" role="status">
                    <AlertDescription>{contextBundle().retrieval_warning}</AlertDescription>
                  </Alert>
                </Show>
                <Show when={contextBundle().evidence.length > 0}>
                  <ListGroup>
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
                <div class="flex flex-wrap gap-2">
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
                    <Alert variant="destructive" role="alert">
                      <AlertDescription>{copyError()}</AlertDescription>
                    </Alert>
                  </Show>
                </div>
              </>
            )}
          </Show>
        </Show>
        <Show when={props.contextError}>
          <Alert variant="destructive" role="alert">
            <AlertDescription>{props.contextError}</AlertDescription>
          </Alert>
        </Show>
      </section>
      <section class="flex min-w-0 flex-col gap-3">
        <Heading size="section">Agent context window</Heading>
        <Card size="sm">
          <CardContent>
            <div class="flex flex-col gap-3">
              <Text>
                ~{props.contextTokens.toLocaleString()} tokens assembled from the active query and{' '}
                {props.evidence.length} cited {props.evidence.length === 1 ? 'passage' : 'passages'}
                .
              </Text>
              <Text variant="caption" tone="muted" as="p">
                The window is rebuilt locally from the current session state and never leaves this
                machine.
              </Text>
            </div>
          </CardContent>
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
        <EmptyState
          headingLevel={2}
          {...(props.statusError
            ? { icon: <AlertTriangle aria-hidden="true" />, announceAs: 'alert' as const }
            : { busy: true, announceAs: 'status' as const })}
          title={props.statusError ? 'Index unavailable' : 'Loading index'}
          detail={
            props.statusError ||
            'Waiting for the runtime status snapshot before reporting live index metrics.'
          }
          {...(props.onRetryStatus
            ? {
                action: props.onRetryStatus,
                actionLabel: 'Retry status',
                secondaryAction: props.onOpenSettings,
                secondaryActionLabel: 'Open settings',
              }
            : { action: props.onOpenSettings, actionLabel: 'Open settings' })}
        />
      }
    >
      {(status) => (
        <>
          <Show when={status().stats_stale}>
            <Alert variant="warning" class="min-[1180px]:col-span-full" role="status">
              <AlertDescription>
                {status().stats_warning ?? 'Live database statistics are temporarily stale.'}
                {typeof status().stats_age_seconds === 'number'
                  ? ` Snapshot age: ${status().stats_age_seconds!.toLocaleString()} seconds.`
                  : ''}
              </AlertDescription>
            </Alert>
          </Show>
          <section class="flex min-w-0 flex-col gap-3">
            <Heading size="section">Live metrics</Heading>
            <StatGroup fit>
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
            </StatGroup>
          </section>
          <section class="flex min-w-0 flex-col gap-3">
            <Heading size="section">Configuration</Heading>
            <Table aria-label="Index configuration">
              <TableBody>
                <TableRow>
                  <TableHead scope="row">Embedding</TableHead>
                  <TableCell class="wrap-anywhere">
                    {status().embedding_fingerprint ?? '—'}
                  </TableCell>
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
          <div class="flex flex-wrap gap-2 min-[1180px]:col-span-full">
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
