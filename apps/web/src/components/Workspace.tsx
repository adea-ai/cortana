import {
  BookOpen,
  Database,
  FileText,
  FolderTree,
  History,
  Link2,
  Network,
  Search,
  Star,
} from 'lucide-solid'
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  splitProps,
  Switch,
  type ComponentProps,
  type JSX,
} from 'solid-js'
import { Dynamic } from 'solid-js/web'

import { isDesktopApp, openDesktopUrl } from '../api'
import { codeRevisionLabel } from '../codeEvidence'
import { isFavoriteDocument, toggleFavoriteDocument } from '../favoriteDocuments'
import { safeSourceLink } from '../sourceLinks'
import { Badge } from './shadcn/badge'
import { TooltipButton as Button } from './cortana/TooltipButton'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './shadcn/empty'
import { Input } from './shadcn/input'
import { NativeSelect } from './shadcn/native-select'
import { Spinner } from './shadcn/spinner'
import { Tabs, TabsList, TabsTrigger } from './shadcn/tabs'
import { Toggle } from './shadcn/toggle'
import type {
  AnswerResponse,
  BrainDocument,
  BrainGraphNode,
  BrainGraphPage,
  Evidence,
  ReflectResponse,
} from '../types'

const tabs = [
  { id: 'answer', label: 'Answer', icon: AppIcon },
  { id: 'document', label: 'Document', icon: BookOpen },
  { id: 'sources', label: 'Evidence', icon: FileText },
  { id: 'timeline', label: 'Timeline', icon: History },
] as const

export type WorkspaceTab = (typeof tabs)[number]['id'] | 'graph'

// Result-only views stay inert until a search returns an answer or evidence.
// The Document tab is the default primary view and Graph remains an explicit
// separate view, so neither is gated.
const resultGatedTabs = new Set<WorkspaceTab>(['answer', 'sources', 'timeline'])
const EMPTY_GRAPH_NODES: BrainGraphNode[] = []

type WorkspaceButtonProps = Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon' | 'compact'
}

function WorkspaceButton(props: WorkspaceButtonProps) {
  const [local, rest] = splitProps(props, ['variant'])
  const variant = () => local.variant ?? 'secondary'
  return (
    <Button
      {...rest}
      variant={
        variant() === 'primary'
          ? 'default'
          : variant() === 'danger'
            ? 'destructive'
            : variant() === 'ghost' || variant() === 'icon'
              ? 'ghost'
              : 'secondary'
      }
      size={variant() === 'icon' ? 'icon' : variant() === 'compact' ? 'sm' : 'default'}
    />
  )
}

function WorkspaceInteractive(props: ComponentProps<'button'>) {
  return <Button variant="ghost" {...props} />
}

function WorkspaceBadge(props: ComponentProps<'span'>) {
  return <Badge variant="secondary" {...props} />
}

async function openSourceLink(href: string): Promise<boolean> {
  if (!isDesktopApp) return false
  if (!safeSourceLink(href, { allowLocalFile: true })) return false
  try {
    await openDesktopUrl(href)
    return true
  } catch {
    // Desktop URL policy is enforced natively. Never fall back to a renderer
    // window, which could bypass the configured-root check for file links.
    return false
  }
}

export function Workspace(props: {
  query: string
  answer: AnswerResponse | null
  reflection: ReflectResponse | null
  evidence: Evidence[]
  selected: number
  loading: boolean
  error: string
  document: BrainDocument | null
  documentLoading: boolean
  graph: BrainGraphPage | null
  graphLoading: boolean
  graphAppendLoading?: boolean
  graphError: string
  onLoadMoreGraph?: () => void
  onRetryGraph?: () => void
  tab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
  onSelect: (index: number) => void
  onSelectDocument: (id: string) => void
  onFocusGraphNode?: (node: BrainGraphNode) => void
  graphFocused?: boolean
  onResetGraphFocus?: () => void
  graphEdgeKind?: BrainGraphPage['edges'][number]['kind'] | 'all'
  onGraphEdgeKindChange?: (kind: BrainGraphPage['edges'][number]['kind'] | 'all') => void
  graphOrigin?: NonNullable<BrainGraphPage['edges'][number]['origin']> | 'all'
  onGraphOriginChange?: (
    origin: NonNullable<BrainGraphPage['edges'][number]['origin']> | 'all'
  ) => void
  graphCanGoBack?: boolean
  graphCanGoForward?: boolean
  onGraphBack?: () => void
  onGraphForward?: () => void
  graphMinConfidence?: number | null
  onGraphMinConfidenceChange?: (confidence: number | null) => void
  onRetry: () => void
}) {
  const active = () => props.evidence[props.selected] ?? null
  const hasResults = () =>
    props.answer !== null || props.reflection !== null || props.evidence.length > 0
  const selectEvidenceByChunkId = (chunkId: string) => {
    const next = props.evidence.findIndex((item) => item.chunk_id === chunkId)
    if (next >= 0) {
      props.onSelect(next)
      props.onTabChange('sources')
    }
  }

  createEffect(() => {
    if (props.document) props.onTabChange('document')
  })
  createEffect(() => {
    if (props.answer || props.reflection) props.onTabChange('answer')
  })
  createEffect(() => {
    // Keep an explicitly submitted search visible while retrieval is in
    // flight. The result tab is hidden from the tab strip until evidence
    // arrives, but redirecting it immediately would replace the loading
    // state with the idle document view.
    if (!props.loading && !hasResults() && resultGatedTabs.has(props.tab)) {
      props.onTabChange('document')
    }
  })

  // Kobalte reverts a controlled value that is absent from the collection,
  // so every tab must stay listed while a search is in flight.
  const availableTabs = () =>
    tabs.filter(({ id }) => id === 'document' || hasResults() || props.loading)

  return (
    <main id="main-content" class="workspace m7-knowledge-workspace" data-m7-knowledge-workspace="">
      <Show when={props.tab !== 'graph'}>
        <Tabs
          class="shrink-0 border-b px-3 pt-2"
          value={props.tab}
          onChange={(value) => props.onTabChange(value as WorkspaceTab)}
        >
          <TabsList variant="line" aria-label="Result views">
            <For each={availableTabs()}>
              {({ id, label, icon }) => (
                <TabsTrigger value={id}>
                  <Dynamic component={icon} size={15} />
                  {label}
                  <Show when={id === 'document' && props.document}>
                    <Badge variant="secondary">1</Badge>
                  </Show>
                  <Show when={id === 'sources' && props.evidence.length > 0}>
                    <Badge variant="secondary">{props.evidence.length}</Badge>
                  </Show>
                </TabsTrigger>
              )}
            </For>
          </TabsList>
        </Tabs>
      </Show>
      <Switch>
        <Match when={props.documentLoading}>
          <EmptyState
            title="Opening document"
            detail="Loading the canonical indexed content…"
            announceAs="status"
            busy
          />
        </Match>
        <Match when={props.tab === 'document' && props.document}>
          <BrainDocumentView document={props.document!} onSelectDocument={props.onSelectDocument} />
        </Match>
        <Match when={props.tab === 'graph'}>
          <GraphView
            graph={props.graph}
            graphLoading={props.graphLoading}
            graphAppendLoading={props.graphAppendLoading ?? false}
            graphError={props.graphError}
            onLoadMore={props.onLoadMoreGraph}
            onRetry={props.onRetryGraph}
            evidence={props.evidence}
            onSelect={selectEvidenceByChunkId}
            onSelectDocument={props.onSelectDocument}
            onFocusGraphNode={props.onFocusGraphNode}
            graphFocused={props.graphFocused ?? false}
            onResetGraphFocus={props.onResetGraphFocus}
            graphEdgeKind={props.graphEdgeKind ?? 'all'}
            onGraphEdgeKindChange={props.onGraphEdgeKindChange}
            graphOrigin={props.graphOrigin ?? 'all'}
            onGraphOriginChange={props.onGraphOriginChange}
            graphCanGoBack={props.graphCanGoBack ?? false}
            graphCanGoForward={props.graphCanGoForward ?? false}
            onGraphBack={props.onGraphBack}
            onGraphForward={props.onGraphForward}
            graphMinConfidence={props.graphMinConfidence ?? null}
            onGraphMinConfidenceChange={props.onGraphMinConfidenceChange}
          />
        </Match>
        <Match when={props.error}>
          <EmptyState
            title="Cortana could not reach the brain"
            detail={`${props.error}. Start the Rust API or add ?demo=1 to preview the workspace.`}
            action={props.onRetry}
            announceAs="alert"
          />
        </Match>
        <Match when={props.tab === 'document'}>
          <EmptyState
            title="Choose a document"
            detail="Open a workspace and source in the sidebar, then select any indexed document."
          />
        </Match>
        <Match when={props.loading && props.evidence.length === 0}>
          <EmptyState
            title="Searching your brain"
            detail="Fusing semantic and exact-term evidence…"
            announceAs="status"
            busy
          />
        </Match>
        <Match when={props.evidence.length === 0 && !hasResults()}>
          <EmptyState title="No evidence found" detail="Try a broader phrase or another source." />
        </Match>
        <Match when={props.tab === 'timeline'}>
          <TimelineView evidence={props.evidence} onSelect={selectEvidenceByChunkId} />
        </Match>
        <Match when={props.tab === 'answer'}>
          <Show
            when={props.reflection}
            fallback={
              <AnswerView
                query={props.query}
                response={props.answer}
                evidence={props.evidence}
                onSelect={(index) => {
                  props.onSelect(index)
                  props.onTabChange('sources')
                }}
              />
            }
          >
            {(reflection) => <ReflectionView response={reflection()} />}
          </Show>
        </Match>
        <Match when={active()}>
          <DocumentView active={active()!} evidence={props.evidence} onSelect={props.onSelect} />
        </Match>
      </Switch>
    </main>
  )
}

function BrainDocumentView(props: {
  document: BrainDocument
  onSelectDocument: (id: string) => void
}) {
  const [favorite, setFavorite] = createSignal(isFavoriteDocument(props.document.id))
  const [sourceOpenError, setSourceOpenError] = createSignal(false)
  const [copyStatus, setCopyStatus] = createSignal('')

  createEffect(() => {
    const id = props.document.id
    setFavorite(isFavoriteDocument(id))
    setSourceOpenError(false)
    setCopyStatus('')
  })

  const metadata = () => Object.entries(props.document.metadata).slice(0, 24)
  const sourceHref = () =>
    props.document.uri ? safeSourceLink(props.document.uri, { allowLocalFile: isDesktopApp }) : null
  const copyDocumentValue = async (value: string, success: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus(success)
    } catch {
      setCopyStatus('Copy failed. Select the canonical text and copy it manually.')
    }
  }
  return (
    <article class="document canonical-document">
      <div class="breadcrumbs">
        <span>Brain</span> / <span>{props.document.project}</span> /{' '}
        <span>{props.document.source}</span> / <strong>{props.document.title}</strong>
        <div>
          <WorkspaceInteractive
            type="button"
            aria-label={favorite() ? 'Remove favorite' : 'Add favorite'}
            aria-pressed={favorite()}
            title={favorite() ? 'Remove favorite' : 'Add favorite'}
            class=""
            onClick={() => setFavorite(toggleFavoriteDocument(props.document.id))}
          >
            <Star size={17} fill={favorite() ? 'currentColor' : 'none'} />
          </WorkspaceInteractive>
          <Show when={sourceHref()}>
            <a
              href={sourceHref()!}
              target={isDesktopApp ? undefined : '_blank'}
              rel={isDesktopApp ? undefined : 'noreferrer'}
              aria-label="Open original source"
              title="Open original source"
              class=""
              onClick={(event) => {
                if (!isDesktopApp) return
                const uri = sourceHref()!
                event.preventDefault()
                setSourceOpenError(false)
                void openSourceLink(uri).then((opened) => {
                  if (!opened) setSourceOpenError(true)
                  return null
                })
              }}
            >
              <Link2 size={17} />
            </a>
          </Show>
        </div>
      </div>
      <Show when={sourceOpenError()}>
        <p class="answer-warning source-link-error" role="alert">
          Cortana could not open the original source. Check that the source app is installed and try
          again.
        </p>
      </Show>
      <div class="document-grid">
        <div class="document-body">
          <h1>{props.document.title}</h1>
          <p class="byline">
            {props.document.project} · {props.document.source} ·{' '}
            {new Date(props.document.updated_at).toLocaleString()} · {props.document.chunk_count}{' '}
            indexed chunks
          </p>
          <div class="document-labels" aria-label="Document security and provenance">
            <span>Workspace: {props.document.project}</span>
            <span>Source ID: {props.document.source_id}</span>
            <For each={props.document.acl.length ? props.document.acl : ['public']}>
              {(label) => <span>ACL: {label}</span>}
            </For>
          </div>
          <div class="document-copy-actions" role="group" aria-label="Document copy actions">
            <WorkspaceButton
              variant="ghost"
              onClick={() =>
                void copyDocumentValue(props.document.content, 'Canonical content copied.')
              }
            >
              Copy content
            </WorkspaceButton>
            <WorkspaceButton
              variant="ghost"
              onClick={() =>
                void copyDocumentValue(
                  `${props.document.title} — ${props.document.source}:${props.document.source_id} (${props.document.updated_at})${props.document.uri ? ` ${props.document.uri}` : ''}`,
                  'Citation copied.'
                )
              }
            >
              Copy citation
            </WorkspaceButton>
            <span role="status" aria-live="polite">
              {copyStatus()}
            </span>
          </div>
          <div class="rule" />
          <div class="canonical-content">
            <For each={props.document.content.split(/\n{2,}/)}>
              {(paragraph) => <p>{paragraph}</p>}
            </For>
          </div>
          <Show when={props.document.truncated}>
            <p class="answer-warning">
              This unusually large document was safely truncated at the desktop display limit. Open
              the original source for the complete content.
            </p>
          </Show>
          <Show when={props.document.backlinks.length > 0 || props.document.surrounding.length > 0}>
            <div class="document-relations">
              <Show when={props.document.backlinks.length > 0}>
                <section>
                  <h2>Backlinks</h2>
                  <For each={props.document.backlinks}>
                    {(related) => (
                      <WorkspaceInteractive
                        type="button"
                        onClick={() => props.onSelectDocument(related.id)}
                      >
                        <Link2 size={14} />
                        <span>{related.title}</span>
                        <small>{related.source}</small>
                      </WorkspaceInteractive>
                    )}
                  </For>
                </section>
              </Show>
              <Show when={props.document.surrounding.length > 0}>
                <section>
                  <h2>Surrounding documents</h2>
                  <For each={props.document.surrounding}>
                    {(related) => (
                      <WorkspaceInteractive
                        type="button"
                        onClick={() => props.onSelectDocument(related.id)}
                      >
                        <FileText size={14} />
                        <span>{related.title}</span>
                        <small>{new Date(related.updated_at).toLocaleDateString()}</small>
                      </WorkspaceInteractive>
                    )}
                  </For>
                </section>
              </Show>
            </div>
          </Show>
        </div>
        <aside class="document-outline">
          <strong>Indexed document</strong>
          <span>{props.document.content_chars.toLocaleString()} characters</span>
          <span>{props.document.chunk_count.toLocaleString()} retrieval chunks</span>
          <span>{props.document.source}</span>
          <span title={props.document.source_id}>{props.document.source_id}</span>
          <Show when={metadata().length > 0}>
            <details class="document-metadata">
              <summary>Metadata ({metadata().length})</summary>
              <dl>
                <For each={metadata()}>
                  {([key, value]) => (
                    <div>
                      <dt>{key}</dt>
                      <dd>{formatMetadata(value)}</dd>
                    </div>
                  )}
                </For>
              </dl>
            </details>
          </Show>
          <BookOpen size={56} />
          <small>Canonical content protected by workspace ACLs</small>
        </aside>
      </div>
    </article>
  )
}

function formatMetadata(value: unknown) {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const serialized = JSON.stringify(value)
  return serialized.length > 300 ? `${serialized.slice(0, 297)}…` : serialized
}

function DocumentView(props: {
  active: Evidence
  evidence: Evidence[]
  onSelect: (index: number) => void
}) {
  const [favorite, setFavorite] = createSignal(isFavoriteDocument(props.active.chunk_id))
  const [sourceOpenError, setSourceOpenError] = createSignal(false)

  createEffect(() => {
    const id = props.active.chunk_id
    setFavorite(isFavoriteDocument(id))
    setSourceOpenError(false)
  })

  const sourceHref = () =>
    props.active.uri ? safeSourceLink(props.active.uri, { allowLocalFile: isDesktopApp }) : null

  return (
    <article class="document">
      <div class="breadcrumbs">
        <span>Brain</span> / <span>{props.active.source}</span> /{' '}
        <strong>{props.active.title}</strong>
        <div>
          <WorkspaceInteractive
            type="button"
            aria-label={favorite() ? 'Remove favorite' : 'Add favorite'}
            aria-pressed={favorite()}
            title={favorite() ? 'Remove favorite' : 'Add favorite'}
            class=""
            onClick={() => setFavorite(toggleFavoriteDocument(props.active.chunk_id))}
          >
            <Star size={17} fill={favorite() ? 'currentColor' : 'none'} />
          </WorkspaceInteractive>
          <Show when={sourceHref()}>
            <a
              href={sourceHref()!}
              target={isDesktopApp ? undefined : '_blank'}
              rel={isDesktopApp ? undefined : 'noreferrer'}
              aria-label="Open original source"
              title="Open original source"
              class=""
              onClick={(event) => {
                if (!isDesktopApp) return
                event.preventDefault()
                setSourceOpenError(false)
                void openSourceLink(sourceHref()!).then((opened) => {
                  if (!opened) setSourceOpenError(true)
                  return null
                })
              }}
            >
              <Link2 size={17} />
            </a>
          </Show>
        </div>
      </div>
      <div class="document-grid">
        <div class="document-body">
          <h1>{props.active.title}</h1>
          <p class="byline">
            Retrieved from {props.active.source} ·{' '}
            {new Date(props.active.updated_at).toLocaleString()}
          </p>
          <div class="rule" />
          <div id="passage">
            <For each={props.active.content.split(/\n{2,}/)}>
              {(paragraph) => <p>{paragraph}</p>}
            </For>
          </div>
          <div id="related" class="evidence-footer">
            <h2>Related evidence</h2>
            <For each={props.evidence.slice(0, 6)}>
              {(item, index) => (
                <WorkspaceInteractive type="button" onClick={() => props.onSelect(index())}>
                  <span>{index() + 1}</span> {item.title}
                </WorkspaceInteractive>
              )}
            </For>
          </div>
        </div>
        <aside class="document-outline">
          <strong>In this evidence</strong>
          <a href="#passage">Retrieved passage</a>
          <a href="#related">Related evidence</a>
          <Network size={56} />
          <small>{props.evidence.length} linked results</small>
        </aside>
      </div>
      <Show when={sourceOpenError()}>
        <p class="answer-warning source-link-error" role="alert">
          Cortana could not open the original source. Check that the source app is installed and try
          again.
        </p>
      </Show>
    </article>
  )
}

function ReflectionView(props: { response: ReflectResponse }) {
  const statements = (): Array<{ text: string; ids: string[]; evidenceIds?: string[] }> => [
    ...props.response.claims.map((item) => ({
      text: item.text,
      ids: item.supporting_memory_ids,
      evidenceIds: item.supporting_evidence_ids,
    })),
    ...props.response.patterns.map((item) => ({
      text: item.statement,
      ids: item.supporting_memory_ids,
    })),
    ...props.response.tensions.map((item) => ({
      text: item.statement,
      ids: item.supporting_memory_ids,
    })),
    ...props.response.recommendations.map((item) => ({
      text: item.statement,
      ids: item.supporting_memory_ids,
    })),
  ]
  return (
    <article class="answer-view" aria-label="Derived memory reflection">
      <span class="eyebrow">Derived reflection · not canonical memory</span>
      <h1>{props.response.objective}</h1>
      <p class="answer-warning">
        {props.response.status} · {props.response.provider.selected} · memory revision{' '}
        {props.response.memory_revision}
      </p>
      <div class="answer-copy">
        <For each={statements()}>
          {(item) => (
            <section class="answer-memory-entry">
              <p>{item.text}</p>
              <small>
                Supporting memory: {item.ids.join(', ') || 'none'}
                {'evidenceIds' in item && item.evidenceIds?.length
                  ? ` · evidence: ${item.evidenceIds.join(', ')}`
                  : ''}
              </small>
            </section>
          )}
        </For>
      </div>
      <Show when={props.response.chronology.length > 0}>
        <section class="answer-memory" aria-label="Reflection chronology">
          <h2>Chronology</h2>
          <For each={props.response.chronology}>
            {(item) => (
              <p>
                {item.observed_at} · {item.title} · supporting memory {item.memory_id}
              </p>
            )}
          </For>
        </section>
      </Show>
      <Show when={props.response.proposed_candidates.length > 0}>
        <section class="answer-memory" aria-label="Review-only proposed memories">
          <h2>Proposed memories requiring approval</h2>
          <For each={props.response.proposed_candidates}>
            {(item) => (
              <article class="answer-memory-entry">
                <h3>{item.title}</h3>
                <p>{item.content}</p>
                <small>
                  {item.content_type} · {item.retention_tier} · {item.scope} · support{' '}
                  {item.supporting_memory_ids.join(', ')}
                </small>
              </article>
            )}
          </For>
        </section>
      </Show>
      <p class="lead">
        {props.response.metrics.memories_included} memories included · canonical memory unchanged
      </p>
    </article>
  )
}

function AnswerView(props: {
  query: string
  response: AnswerResponse | null
  evidence: Evidence[]
  onSelect: (index: number) => void
}) {
  return (
    <article class="answer-view">
      <span class="eyebrow">
        <AppIcon size={14} /> Evidence brief
      </span>
      <h1>{props.query}</h1>
      <Show when={props.response}>
        {(response) => (
          <div class="answer-meta">
            <WorkspaceBadge>{response().mode}</WorkspaceBadge>
            <WorkspaceBadge>
              {response().retrieval_degraded
                ? 'lexical fallback'
                : response().retrieval_mode || 'hybrid retrieval'}
            </WorkspaceBadge>
            <WorkspaceBadge>
              {response().cached ? 'cache hit' : `${response().latency_ms} ms`}
            </WorkspaceBadge>
            <WorkspaceBadge>
              {response().plan.queries.length}{' '}
              {response().plan.queries.length === 1 ? 'retrieval' : 'retrievals'}
            </WorkspaceBadge>
          </div>
        )}
      </Show>
      <div class="answer-copy">
        <For
          each={(props.response?.answer ?? 'Cortana found relevant evidence below.').split(
            /\n{2,}/
          )}
        >
          {(paragraph) => <p>{paragraph}</p>}
        </For>
      </div>
      <Show when={props.response && props.response.plan.queries.length > 1}>
        <details class="answer-plan">
          <summary>Retrieval plan</summary>
          <ol>
            <For each={props.response!.plan.queries}>
              {(plannedQuery) => <li>{plannedQuery}</li>}
            </For>
          </ol>
        </details>
      </Show>
      <For each={props.response?.warnings ?? []}>
        {(warning) => <p class="answer-warning">{warning}</p>}
      </For>
      <Show when={props.response?.retrieval_degraded}>
        <p class="answer-warning" role="status">
          Embedding retrieval is temporarily unavailable; these citations came from exact-term
          search.
        </p>
      </Show>
      <p class="lead">{props.evidence.length} cited passages</p>
      <Show when={props.response?.memories && props.response.memories.length > 0}>
        <section class="answer-memory" aria-label="Native agent memory">
          <p class="lead">{props.response!.memories!.length} native memory entries</p>
          <For each={props.response!.memories!.slice(0, 4)}>
            {(memory) => (
              <article class="answer-memory-entry">
                <h2>{memory.title}</h2>
                <p>{memory.content}</p>
                <small>
                  {memory.content_type ?? memory.kind} · {memory.retention_tier ?? 'durable'} ·{' '}
                  {memory.scope ?? 'workspace'} · {memory.project} · confidence{' '}
                  {memory.confidence.toFixed(2)}
                  {memory.valid_until
                    ? ` · expires ${new Date(memory.valid_until).toLocaleDateString()}`
                    : ''}
                </small>
              </article>
            )}
          </For>
        </section>
      </Show>
      <For each={props.evidence.slice(0, 4)}>
        {(item, index) => (
          <WorkspaceInteractive
            type="button"
            class="answer-source"
            onClick={() => props.onSelect(index())}
          >
            <span>[{index() + 1}]</span>
            <div>
              <h2>{item.title}</h2>
              <p>{item.content}</p>
            </div>
          </WorkspaceInteractive>
        )}
      </For>
      <p class="answer-note">
        {props.response?.mode === 'synthesized'
          ? 'Synthesized from the cited passages. Open a source to inspect the original evidence.'
          : 'Extractive mode keeps citations stable when no synthesis model is configured.'}
      </p>
    </article>
  )
}

type GraphNodeLike =
  | BrainGraphNode
  | {
      id: string
      kind: 'document'
      label: string
      project: string
      source: string | null
      document_id: null
    }

function GraphView(props: {
  graph: BrainGraphPage | null
  graphLoading: boolean
  graphAppendLoading: boolean
  graphError: string
  onRetry?: () => void
  onLoadMore?: () => void
  evidence: Evidence[]
  onSelect?: (chunkId: string) => void
  onSelectDocument: (id: string) => void
  onFocusGraphNode?: (node: BrainGraphNode) => void
  graphFocused: boolean
  onResetGraphFocus?: () => void
  graphEdgeKind: BrainGraphPage['edges'][number]['kind'] | 'all'
  onGraphEdgeKindChange?: (kind: BrainGraphPage['edges'][number]['kind'] | 'all') => void
  graphOrigin: NonNullable<BrainGraphPage['edges'][number]['origin']> | 'all'
  onGraphOriginChange?: (
    origin: NonNullable<BrainGraphPage['edges'][number]['origin']> | 'all'
  ) => void
  graphCanGoBack: boolean
  graphCanGoForward: boolean
  onGraphBack?: () => void
  onGraphForward?: () => void
  graphMinConfidence: number | null
  onGraphMinConfidenceChange?: (confidence: number | null) => void
}) {
  const [visibleCount, setVisibleCount] = createSignal(12)
  const [filter, setFilter] = createSignal('')
  const [kindFilter, setKindFilter] = createSignal<BrainGraphNode['kind'] | 'all'>('all')
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null)
  const [pinnedNodeIds, setPinnedNodeIds] = createSignal<Set<string>>(new Set())
  const graphNodes = createMemo(() => props.graph?.nodes ?? EMPTY_GRAPH_NODES)
  const usingEvidenceFallback = () => props.graph === null
  const normalizedFilter = () => filter().trim().toLocaleLowerCase()
  const filteredNodes = createMemo(() =>
    normalizedFilter()
      ? graphNodes().filter(
          (node) =>
            (kindFilter() === 'all' || node.kind === kindFilter()) &&
            [node.label, node.project, node.source ?? '', node.kind].some((value) =>
              value.toLocaleLowerCase().includes(normalizedFilter())
            )
        )
      : graphNodes().filter((node) => kindFilter() === 'all' || node.kind === kindFilter())
  )
  const graphResetKey = () =>
    `${props.graph?.nodes[0]?.id ?? ''} ${kindFilter()} ${normalizedFilter()}`
  createEffect(() => {
    graphResetKey()
    setVisibleCount(12)
    setSelectedNodeId(null)
  })
  const nodes = createMemo((): GraphNodeLike[] =>
    filteredNodes().length
      ? filteredNodes().slice(0, visibleCount())
      : usingEvidenceFallback()
        ? props.evidence.slice(0, 8).map((item) => ({
            id: item.chunk_id,
            kind: 'document' as const,
            label: item.title,
            project: '',
            source: item.source,
            document_id: null,
          }))
        : []
  )
  const visibleNodeIds = createMemo(() => new Set(nodes().map((node) => node.id)))
  const visibleEdges = createMemo(() => {
    if (!props.graph || usingEvidenceFallback()) return []
    const ids = visibleNodeIds()
    return props.graph.edges.filter((edge) => ids.has(edge.target) || ids.has(edge.source))
  })
  const activeGraphNode = createMemo(
    () => nodes().find((node) => node.id === selectedNodeId()) ?? null
  )
  const selectedEdges = createMemo(() => {
    const active = activeGraphNode()
    return active
      ? visibleEdges().filter((edge) => edge.source === active.id || edge.target === active.id)
      : []
  })

  return (
    <Switch>
      <Match when={props.graphLoading && nodes().length === 0}>
        <EmptyState
          title="Loading knowledge graph"
          detail="Mapping indexed workspaces and documents…"
          announceAs="status"
        />
      </Match>
      <Match when={props.graphError && nodes().length === 0}>
        <EmptyState
          title="Graph unavailable"
          detail={props.graphError}
          action={props.onRetry}
          announceAs="alert"
        />
      </Match>
      <Match when={!props.graphLoading && nodes().length === 0 && normalizedFilter()}>
        <div class="graph-empty-filter">
          <Search size={24} aria-hidden="true" />
          <h1>No matching graph nodes</h1>
          <p>Try a workspace, source, or document name.</p>
          <WorkspaceButton variant="secondary" onClick={() => setFilter('')}>
            Clear filter
          </WorkspaceButton>
        </div>
      </Match>
      <Match when={!props.graphLoading && nodes().length === 0}>
        <EmptyState
          title="No graph data"
          detail="Index a source to build linked workspace nodes."
        />
      </Match>
      <Match when>
        <div class="graph-view">
          <Show when={visibleEdges().length > 0}>
            <svg class="graph-links" viewBox="0 0 100 100" aria-hidden="true">
              <For each={nodes()}>
                {(node, index) => {
                  if (!visibleEdges().some((edge) => edge.target === node.id)) return null
                  const angle = (index() / Math.max(nodes().length, 1)) * Math.PI * 2 - Math.PI / 2
                  return (
                    <line
                      x1="50"
                      y1="50"
                      x2={50 + 31 * Math.cos(angle)}
                      y2={50 + 31 * Math.sin(angle)}
                    />
                  )
                }}
              </For>
            </svg>
          </Show>
          <div class="graph-center">
            <AppIcon size={24} />
          </div>
          <div class="graph-toolbar" role="search">
            <Search size={14} aria-hidden="true" />
            <Input
              type="search"
              aria-label="Filter graph nodes"
              placeholder="Filter nodes…"
              value={filter()}
              onChange={(event) => setFilter(event.target.value)}
            />
            <Show when={filter()}>
              <WorkspaceButton
                variant="ghost"
                type="button"
                class="link-button"
                onClick={() => setFilter('')}
              >
                Clear
              </WorkspaceButton>
            </Show>
            <NativeSelect
              aria-label="Filter graph relationships"
              value={props.graphEdgeKind}
              onChange={(event) =>
                props.onGraphEdgeKindChange?.(
                  event.target.value as BrainGraphPage['edges'][number]['kind'] | 'all'
                )
              }
            >
              <option value="all">All relationships</option>
              <For
                each={
                  [
                    'contains',
                    'references',
                    'backlink',
                    'nearby',
                    'same-thread',
                    'authored-by',
                    'mentions',
                    'temporal',
                    'supports',
                    'contradicts',
                    'derives',
                  ] as const
                }
              >
                {(kind) => <option value={kind}>{kind}</option>}
              </For>
            </NativeSelect>
            <NativeSelect
              aria-label="Filter graph relationship origin"
              value={props.graphOrigin}
              onChange={(event) =>
                props.onGraphOriginChange?.(
                  event.target.value as
                    | NonNullable<BrainGraphPage['edges'][number]['origin']>
                    | 'all'
                )
              }
            >
              <option value="all">All origins</option>
              <option value="explicit">Explicit</option>
              <option value="derived">Derived</option>
              <option value="inferred">Inferred</option>
            </NativeSelect>
            <NativeSelect
              aria-label="Filter graph minimum confidence"
              value={props.graphMinConfidence == null ? 'all' : String(props.graphMinConfidence)}
              onChange={(event) =>
                props.onGraphMinConfidenceChange?.(
                  event.target.value === 'all' ? null : Number(event.target.value)
                )
              }
            >
              <option value="all">Any confidence</option>
              <option value="0.5">50% or higher</option>
              <option value="0.75">75% or higher</option>
              <option value="0.9">90% or higher</option>
            </NativeSelect>
          </div>
          <Show when={props.graph && !usingEvidenceFallback()}>
            <div class="graph-kind-filter" role="group" aria-label="Filter graph node types">
              <For each={['all', 'workspace', 'source', 'document'] as const}>
                {(kind) => (
                  <Toggle
                    size="sm"
                    variant="outline"
                    pressed={kindFilter() === kind}
                    onChange={(pressed) => pressed && setKindFilter(kind)}
                  >
                    {kind === 'all'
                      ? 'All'
                      : kind === 'workspace'
                        ? 'Workspaces'
                        : kind === 'source'
                          ? 'Sources'
                          : 'Documents'}
                  </Toggle>
                )}
              </For>
            </div>
          </Show>
          <div class="graph-summary" role="status">
            <span>
              {props.graph && !usingEvidenceFallback()
                ? graphNodes().every((node) => node.kind === 'document')
                  ? `Showing ${nodes().length} of ${filteredNodes().length}${normalizedFilter() ? ` matching ${graphNodes().length}` : ''} document${filteredNodes().length === 1 ? '' : 's'} · ${visibleEdges().length} link${visibleEdges().length === 1 ? '' : 's'}`
                  : `Showing ${nodes().length} of ${filteredNodes().length}${normalizedFilter() ? ` matching ${graphNodes().length}` : ''} node${filteredNodes().length === 1 ? '' : 's'} · ${visibleEdges().length} link${visibleEdges().length === 1 ? '' : 's'}`
                : props.graphLoading
                  ? 'Loading indexed graph…'
                  : 'Retrieved evidence'}
              {props.graphError ? ` · ${props.graphError}` : ''}
            </span>
          </div>
          <Show when={props.graphError && props.onRetry}>
            <div class="graph-overlay-actions">
              <WorkspaceButton
                variant="ghost"
                type="button"
                class="link-button"
                onClick={props.onRetry}
              >
                Retry graph
              </WorkspaceButton>
            </div>
          </Show>
          <Show when={props.graphFocused || props.graphCanGoBack || props.graphCanGoForward}>
            <div class="graph-overlay-actions">
              <WorkspaceButton
                variant="ghost"
                type="button"
                disabled={!props.graphCanGoBack}
                onClick={props.onGraphBack}
              >
                Back
              </WorkspaceButton>
              <WorkspaceButton
                variant="ghost"
                type="button"
                disabled={!props.graphCanGoForward}
                onClick={props.onGraphForward}
              >
                Forward
              </WorkspaceButton>
              <Show when={props.graphFocused && props.onResetGraphFocus}>
                <WorkspaceButton
                  variant="secondary"
                  type="button"
                  onClick={props.onResetGraphFocus}
                >
                  Return to graph overview
                </WorkspaceButton>
              </Show>
            </div>
          </Show>
          <Show when={props.graph?.next_cursor && props.onLoadMore}>
            <div class="graph-pagination">
              <WorkspaceButton
                variant="secondary"
                onClick={props.onLoadMore}
                disabled={props.graphAppendLoading}
              >
                {props.graphAppendLoading ? 'Loading more nodes…' : 'Load more nodes'}
              </WorkspaceButton>
              <span>More nodes remain outside this bounded view.</span>
            </div>
          </Show>
          <Show when={!props.graph?.next_cursor && filteredNodes().length > visibleCount()}>
            <div class="graph-pagination">
              <WorkspaceButton
                variant="secondary"
                onClick={() =>
                  setVisibleCount((count) => Math.min(count + 12, filteredNodes().length))
                }
              >
                Show more nodes
              </WorkspaceButton>
              <span>Showing a bounded window for responsive rendering.</span>
            </div>
          </Show>
          <For each={nodes()}>
            {(node, index) => (
              <button
                type="button"
                aria-label={`${node.document_id ? 'Open document' : node.kind === 'workspace' ? 'Focus workspace' : node.kind === 'source' ? 'Focus source' : 'Open evidence'}: ${node.label}`}
                title={
                  node.document_id
                    ? 'Open document'
                    : node.kind === 'workspace'
                      ? 'Focus workspace'
                      : node.kind === 'source'
                        ? 'Focus source'
                        : 'Open retrieved evidence'
                }
                class={` graph-node graph-node--${node.kind}`}
                data-kind={node.kind}
                style={
                  {
                    '--angle': `${(index() / Math.max(nodes().length, 1)) * Math.PI * 2}rad`,
                  } as JSX.CSSProperties
                }
                onClick={() => {
                  setSelectedNodeId(node.id)
                  if (node.document_id) return
                  if (node.kind === 'workspace' || node.kind === 'source') {
                    props.onFocusGraphNode?.(node as BrainGraphNode)
                    return
                  }
                  // The API-backed graph uses workspace/source nodes for navigation,
                  // while the offline evidence fallback uses chunk IDs. Preserve the
                  // fallback's evidence selection without passing synthetic graph IDs
                  // into the workspace/source focus handler.
                  props.onSelect?.(node.id)
                }}
              >
                {node.kind === 'workspace' ? (
                  <FolderTree size={17} aria-hidden="true" />
                ) : node.kind === 'source' ? (
                  <Database size={17} aria-hidden="true" />
                ) : (
                  <FileText size={17} aria-hidden="true" />
                )}
                <span>{node.label}</span>
              </button>
            )}
          </For>
          <Show when={activeGraphNode()}>
            {(selectedNode) => (
              <aside class="graph-selection" aria-label="Selected graph node" aria-live="polite">
                <strong>{selectedNode().label}</strong>
                <span>
                  {selectedNode().kind === 'workspace'
                    ? 'Workspace'
                    : selectedNode().kind === 'source'
                      ? `Source in ${selectedNode().project || 'Unscoped'}`
                      : `${selectedNode().project || 'Unscoped'} · ${selectedNode().source || 'Unknown source'}`}
                </span>
                <small>
                  {selectedEdges().length} related link{selectedEdges().length === 1 ? '' : 's'}
                  {pinnedNodeIds().has(selectedNode().id) ? ' · pinned' : ''}
                </small>
                <Show when={selectedEdges().length > 0}>
                  <ul>
                    <For each={selectedEdges()}>
                      {(edge) => (
                        <li>
                          <span>
                            {edge.kind === 'contains'
                              ? 'Contained by its workspace or source'
                              : edge.kind}
                          </span>
                          <Show when={edge.origin}>
                            <small>
                              {edge.origin === 'inferred'
                                ? `Inferred relationship${edge.confidence == null ? '' : ` · ${Math.round(edge.confidence * 100)}% confidence`}`
                                : `${edge.origin![0].toUpperCase()}${edge.origin!.slice(1)} relationship`}
                              {edge.support
                                ? ` · ${edge.support.record_ids.length} supporting record${edge.support.record_ids.length === 1 ? '' : 's'}`
                                : ''}
                              {edge.citation_authority
                                ? ' · citation-capable'
                                : ' · not citation evidence'}
                            </small>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                <Show when={selectedNode().document_id}>
                  <div class="graph-selection-actions">
                    <WorkspaceButton
                      variant="ghost"
                      onClick={() =>
                        setPinnedNodeIds((current) => {
                          const next = new Set(current)
                          if (next.has(selectedNode().id)) next.delete(selectedNode().id)
                          else next.add(selectedNode().id)
                          return next
                        })
                      }
                    >
                      {pinnedNodeIds().has(selectedNode().id) ? 'Unpin node' : 'Pin node'}
                    </WorkspaceButton>
                    <WorkspaceButton
                      variant="secondary"
                      onClick={() => props.onSelectDocument(selectedNode().document_id!)}
                    >
                      Open document
                    </WorkspaceButton>
                    <Show when={props.onFocusGraphNode}>
                      <WorkspaceButton
                        variant="ghost"
                        onClick={() => props.onFocusGraphNode!(selectedNode() as BrainGraphNode)}
                      >
                        Expand one-hop relationships
                      </WorkspaceButton>
                    </Show>
                  </div>
                </Show>
              </aside>
            )}
          </Show>
        </div>
      </Match>
    </Switch>
  )
}

function TimelineView(props: { evidence: Evidence[]; onSelect: (chunkId: string) => void }) {
  return (
    <div class="timeline-view">
      <h1>Evidence timeline</h1>
      <For
        each={props.evidence.toSorted((left, right) =>
          right.updated_at.localeCompare(left.updated_at)
        )}
      >
        {(item) => (
          <WorkspaceInteractive
            type="button"
            aria-label={`Timeline evidence: ${item.title}`}
            onClick={() => props.onSelect(item.chunk_id)}
          >
            <time>{new Date(item.updated_at).toLocaleDateString()}</time>
            <i />
            <div>
              <strong>{item.title}</strong>
              <span>{codeRevisionLabel(item) ?? item.source}</span>
            </div>
          </WorkspaceInteractive>
        )}
      </For>
    </div>
  )
}

function EmptyState(props: {
  title: string
  detail: string
  action?: () => void
  busy?: boolean
  announceAs?: 'alert' | 'status'
}) {
  return (
    <Empty
      class="m-4 min-h-64 border"
      role={props.announceAs}
      aria-live={props.announceAs === 'status' ? 'polite' : undefined}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {props.busy ? <Spinner aria-label="Loading" /> : <Search aria-hidden="true" />}
        </EmptyMedia>
        <EmptyTitle role="heading" aria-level={1}>
          {props.title}
        </EmptyTitle>
        <EmptyDescription>{props.detail}</EmptyDescription>
      </EmptyHeader>
      <Show when={props.action}>
        <EmptyContent>
          <Button onClick={props.action}>Try again</Button>
        </EmptyContent>
      </Show>
    </Empty>
  )
}

function AppIcon(props: { size?: number }) {
  const size = () => props.size ?? 16
  return <img src="/app-icon.svg" alt="" width={size()} height={size()} aria-hidden="true" />
}
