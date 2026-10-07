import { Card, CardContent } from '@adea-ai/ui/components/ui/card'
import { ListRow } from '@adea-ai/ui/components/composites/list-row'
import { Tooltip, TooltipContent, TooltipTrigger } from '@adea-ai/ui/components/ui/tooltip'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@adea-ai/ui/components/ui/accordion'
import { Alert, AlertDescription } from '@adea-ai/ui/components/ui/alert'
import { BookOpen, FileText, History, Link2, Network, Star } from 'lucide-solid'
import {
  createComputed,
  createEffect,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  type JSX,
  lazy,
  on,
  Suspense,
} from 'solid-js'
import { Dynamic } from 'solid-js/web'

import { writeClipboardText } from '../clipboard'
import { isDesktopApp, openDesktopUrl } from '../api'
import { codeRevisionLabel } from '../codeEvidence'
import { isFavoriteDocument, toggleFavoriteDocument } from '../favoriteDocuments'
import { safeSourceLink } from '../sourceLinks'
import { Badge } from '@adea-ai/ui/components/ui/badge'
import {
  ActionButton,
  ActionButton as Button,
} from '@adea-ai/ui/components/composites/action-button'
import { ActionButton as WorkspaceButton } from '@adea-ai/ui/components/composites/action-button'
import { EmptyState } from '@adea-ai/ui/components/ui/empty'
import { Tabs, TabsList, TabsTrigger } from '@adea-ai/ui/components/ui/tabs'
import type {
  AnswerResponse,
  BrainDocument,
  BrainGraphNode,
  BrainGraphPage,
  Evidence,
  ReflectResponse,
} from '../types'
import { Heading, Text } from '@adea-ai/ui/components/ui/typography'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@adea-ai/ui/components/ui/breadcrumb'
import { PanelActions, PanelHeader } from '@adea-ai/ui/components/layout/panel'
import { Separator } from '@adea-ai/ui/components/ui/separator'
import { ScrollArea } from '@adea-ai/ui/components/ui/scroll-area'
import { PropertyList, PropertyTerm, PropertyValue } from '@adea-ai/ui/components/composites/stat'

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
const LazyKnowledgeGraphView = lazy(() => import('./KnowledgeGraphView'))

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

  createEffect(
    on(
      () => props.document,
      (document) => {
        if (document) props.onTabChange('document')
      },
      { defer: true }
    )
  )
  createEffect(
    on(
      () => props.answer || props.reflection,
      (result) => {
        if (result) props.onTabChange('answer')
      },
      { defer: true }
    )
  )
  createComputed(() => {
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
    <main
      tabIndex={-1}
      id="main-content"
      class="workspace m7-knowledge-workspace"
      data-m7-knowledge-workspace=""
    >
      <Show when={props.tab !== 'graph'}>
        <Tabs
          class="h-topbar shrink-0 justify-end"
          value={props.tab}
          onChange={(value) => props.onTabChange(value as WorkspaceTab)}
        >
          <TabsList appearance="underline" fill class="px-3" aria-label="Result views">
            <For each={availableTabs()}>
              {({ id, label, icon }) => (
                <Tooltip>
                  <TooltipTrigger as={TabsTrigger} value={id}>
                    <Dynamic component={icon} size={16} />
                    {label}
                    <Show when={id === 'document' && props.document}>
                      <Badge variant="secondary">1</Badge>
                    </Show>
                    <Show when={id === 'sources' && props.evidence.length > 0}>
                      <Badge variant="secondary">{props.evidence.length}</Badge>
                    </Show>
                  </TooltipTrigger>
                  <TooltipContent>{`Show ${label.toLowerCase()} for this search`}</TooltipContent>
                </Tooltip>
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
          <Suspense
            fallback={
              <EmptyState
                title="Loading knowledge graph"
                detail="Loading graph view…"
                announceAs="status"
                busy
              />
            }
          >
            <LazyKnowledgeGraphView
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
          </Suspense>
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

  createComputed(() => {
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
      await writeClipboardText(value)
      setCopyStatus(success)
    } catch {
      setCopyStatus('Copy failed. Select the canonical text and copy it manually.')
    }
  }
  return (
    <article class="document canonical-document">
      <DocumentPathBar
        segments={['Brain', props.document.project, props.document.source]}
        title={props.document.title}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label={favorite() ? 'Remove favorite' : 'Add favorite'}
          aria-pressed={favorite()}
          tooltip={favorite() ? 'Remove favorite' : 'Add favorite'}
          onClick={() => setFavorite(toggleFavoriteDocument(props.document.id))}
        >
          <Star fill={favorite() ? 'currentColor' : 'none'} aria-hidden="true" />
        </Button>
        <Show when={sourceHref()}>
          <ActionButton
            as="a"
            variant="ghost"
            size="icon-sm"
            tooltip="Open original source"
            href={sourceHref()!}
            target={isDesktopApp ? undefined : '_blank'}
            rel={isDesktopApp ? undefined : 'noreferrer'}
            aria-label="Open original source"
            onClick={(event: MouseEvent & { currentTarget: HTMLAnchorElement }) => {
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
            <Link2 aria-hidden="true" />
          </ActionButton>
        </Show>
      </DocumentPathBar>
      <Show when={sourceOpenError()}>
        <Alert variant="warning" class="source-link-error" role="alert">
          <AlertDescription>
            Cortana could not open the original source. Check that the source app is installed and
            try again.
          </AlertDescription>
        </Alert>
      </Show>
      <div class="document-grid">
        <div>
          <div class="flex flex-col gap-2">
            <Heading size="title">{props.document.title}</Heading>
            <Text variant="caption" tone="muted" as="p">
              {props.document.project} · {props.document.source} ·{' '}
              {new Date(props.document.updated_at).toLocaleString()} · {props.document.chunk_count}{' '}
              indexed chunks
            </Text>
          </div>
          <div class="document-labels" aria-label="Document security and provenance">
            <Badge variant="outline">Workspace: {props.document.project}</Badge>
            <Badge variant="outline">Source ID: {props.document.source_id}</Badge>
            <For each={props.document.acl.length ? props.document.acl : ['public']}>
              {(label) => <Badge variant="outline">ACL: {label}</Badge>}
            </For>
          </div>
          <div class="document-copy-actions" role="group" aria-label="Document copy actions">
            <WorkspaceButton
              tooltip="Copy content"
              variant="ghost"
              size="sm"
              onClick={() =>
                void copyDocumentValue(props.document.content, 'Canonical content copied.')
              }
            >
              Copy content
            </WorkspaceButton>
            <WorkspaceButton
              tooltip="Copy citation"
              variant="ghost"
              size="sm"
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
          <Separator class="my-6" />
          <div class="canonical-content">
            <For each={props.document.content.split(/\n{2,}/)}>
              {(paragraph) => <Text>{paragraph}</Text>}
            </For>
          </div>
          <Show when={props.document.truncated}>
            <Alert variant="warning">
              <AlertDescription>
                This unusually large document was safely truncated at the desktop display limit.
                Open the original source for the complete content.
              </AlertDescription>
            </Alert>
          </Show>
          <Show when={props.document.backlinks.length > 0 || props.document.surrounding.length > 0}>
            <div class="document-relations">
              <Show when={props.document.backlinks.length > 0}>
                <section class="flex min-w-0 flex-col gap-1">
                  <Heading as="h2" size="subsection">
                    Backlinks
                  </Heading>
                  <For each={props.document.backlinks}>
                    {(related) => (
                      <ListRow
                        as="button"
                        tooltip={`Open related document: ${related.title}`}
                        onClick={() => props.onSelectDocument(related.id)}
                        leading={<Link2 size={14} aria-hidden="true" />}
                        trailing={related.source}
                        class="w-full text-left"
                      >
                        {related.title}
                      </ListRow>
                    )}
                  </For>
                </section>
              </Show>
              <Show when={props.document.surrounding.length > 0}>
                <section class="flex min-w-0 flex-col gap-1">
                  <Heading as="h2" size="subsection">
                    Surrounding documents
                  </Heading>
                  <For each={props.document.surrounding}>
                    {(related) => (
                      <ListRow
                        as="button"
                        tooltip={`Open related document: ${related.title}`}
                        onClick={() => props.onSelectDocument(related.id)}
                        leading={<FileText size={14} aria-hidden="true" />}
                        trailing={new Date(related.updated_at).toLocaleDateString()}
                        class="w-full text-left"
                      >
                        {related.title}
                      </ListRow>
                    )}
                  </For>
                </section>
              </Show>
            </div>
          </Show>
        </div>
        <aside class="document-outline">
          <Text variant="label" as="p">
            Indexed document
          </Text>
          <Text variant="caption" tone="muted" as="p">
            {props.document.content_chars.toLocaleString()} characters
          </Text>
          <Text variant="caption" tone="muted" as="p">
            {props.document.chunk_count.toLocaleString()} retrieval chunks
          </Text>
          <Text variant="caption" tone="muted" as="p">
            {props.document.source}
          </Text>
          <Text variant="caption" tone="muted" as="p" title={props.document.source_id}>
            {props.document.source_id}
          </Text>
          <Show when={metadata().length > 0}>
            <Accordion collapsible class="document-metadata">
              <AccordionItem value="details">
                <AccordionTrigger>Metadata ({metadata().length})</AccordionTrigger>
                <AccordionContent>
                  <ScrollArea class="max-h-65" aria-label="Document metadata">
                    <PropertyList class="grid-cols-1 gap-y-1">
                      <For each={metadata()}>
                        {([key, value]) => (
                          <>
                            <PropertyTerm>{key}</PropertyTerm>
                            <PropertyValue>{formatMetadata(value)}</PropertyValue>
                          </>
                        )}
                      </For>
                    </PropertyList>
                  </ScrollArea>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Show>
          <BookOpen size={56} class="document-outline-icon" aria-hidden="true" />
          <Text variant="caption" tone="muted" as="p" class="document-outline-note">
            Canonical content protected by workspace ACLs
          </Text>
        </aside>
      </div>
    </article>
  )
}

function DocumentPathBar(props: { segments: string[]; title: string; children: JSX.Element }) {
  return (
    <PanelHeader>
      <Breadcrumb aria-label="Document path" class="min-w-0 flex-1">
        <BreadcrumbList class="flex-nowrap">
          <For each={props.segments}>
            {(segment) => (
              <>
                <BreadcrumbItem class="max-[780px]:hidden">{segment}</BreadcrumbItem>
                <BreadcrumbSeparator class="max-[780px]:hidden" />
              </>
            )}
          </For>
          <BreadcrumbItem class="min-w-0">
            <BreadcrumbPage class="min-w-0">
              <span class="block truncate">{props.title}</span>
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <PanelActions>{props.children}</PanelActions>
    </PanelHeader>
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

  createComputed(() => {
    const id = props.active.chunk_id
    setFavorite(isFavoriteDocument(id))
    setSourceOpenError(false)
  })

  const sourceHref = () =>
    props.active.uri ? safeSourceLink(props.active.uri, { allowLocalFile: isDesktopApp }) : null

  return (
    <article class="document">
      <DocumentPathBar segments={['Brain', props.active.source]} title={props.active.title}>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          aria-label={favorite() ? 'Remove favorite' : 'Add favorite'}
          aria-pressed={favorite()}
          tooltip={favorite() ? 'Remove favorite' : 'Add favorite'}
          onClick={() => setFavorite(toggleFavoriteDocument(props.active.chunk_id))}
        >
          <Star fill={favorite() ? 'currentColor' : 'none'} aria-hidden="true" />
        </Button>
        <Show when={sourceHref()}>
          <ActionButton
            as="a"
            variant="ghost"
            size="icon-sm"
            tooltip="Open original source"
            href={sourceHref()!}
            target={isDesktopApp ? undefined : '_blank'}
            rel={isDesktopApp ? undefined : 'noreferrer'}
            aria-label="Open original source"
            onClick={(event: MouseEvent & { currentTarget: HTMLAnchorElement }) => {
              if (!isDesktopApp) return
              event.preventDefault()
              setSourceOpenError(false)
              void openSourceLink(sourceHref()!).then((opened) => {
                if (!opened) setSourceOpenError(true)
                return null
              })
            }}
          >
            <Link2 aria-hidden="true" />
          </ActionButton>
        </Show>
      </DocumentPathBar>
      <div class="document-grid">
        <div>
          <div class="flex flex-col gap-2">
            <Heading size="title">{props.active.title}</Heading>
            <Text variant="caption" tone="muted" as="p">
              Retrieved from {props.active.source} ·{' '}
              {new Date(props.active.updated_at).toLocaleString()}
            </Text>
          </div>
          <Separator class="my-6" />
          <div id="passage" class="canonical-content">
            <For each={props.active.content.split(/\n{2,}/)}>
              {(paragraph) => <Text>{paragraph}</Text>}
            </For>
          </div>
          <div id="related" class="evidence-footer">
            <Heading as="h2" size="subsection">
              Related evidence
            </Heading>
            <div class="evidence-footer-list">
              <For each={props.evidence.slice(0, 6)}>
                {(item, index) => (
                  <ListRow
                    as="button"
                    type="button"
                    tooltip={`Inspect retrieved evidence: ${item.title}`}
                    onClick={() => props.onSelect(index())}
                    leading={<span>{index() + 1}</span>}
                    class="w-full text-left"
                  >
                    {item.title}
                  </ListRow>
                )}
              </For>
            </div>
          </div>
        </div>
        <aside class="document-outline">
          <Text variant="label" as="p">
            In this evidence
          </Text>
          <div class="flex flex-col items-start gap-1">
            <Button
              as="a"
              variant="link"
              size="xs"
              href="#passage"
              tooltip="Jump to the retrieved passage in this evidence."
              class="justify-start"
            >
              Retrieved passage
            </Button>
            <Button
              as="a"
              variant="link"
              size="xs"
              href="#related"
              tooltip="Jump to related evidence for this result."
              class="justify-start"
            >
              Related evidence
            </Button>
          </div>
          <Network size={56} class="document-outline-icon" aria-hidden="true" />
          <Text variant="caption" tone="muted" as="p" class="document-outline-note">
            {props.evidence.length} linked results
          </Text>
        </aside>
      </div>
      <Show when={sourceOpenError()}>
        <Alert variant="warning" class="source-link-error" role="alert">
          <AlertDescription>
            Cortana could not open the original source. Check that the source app is installed and
            try again.
          </AlertDescription>
        </Alert>
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
      <Text variant="overline" class="eyebrow">
        Derived reflection · not canonical memory
      </Text>
      <Heading size="title" class="mb-2">
        {props.response.objective}
      </Heading>
      <Alert variant="warning">
        <AlertDescription>
          {props.response.status}· {props.response.provider.selected}· memory revision{' '}
          {props.response.memory_revision}
        </AlertDescription>
      </Alert>
      <div class="answer-copy">
        <For each={statements()}>
          {(item) => (
            <section class="answer-memory-entry">
              <Text>{item.text}</Text>
              <Text variant="caption" tone="muted">
                Supporting memory: {item.ids.join(', ') || 'none'}
                {'evidenceIds' in item && item.evidenceIds?.length
                  ? ` · evidence: ${item.evidenceIds.join(', ')}`
                  : ''}
              </Text>
            </section>
          )}
        </For>
      </div>
      <Show when={props.response.chronology.length > 0}>
        <section class="answer-memory" aria-label="Reflection chronology">
          <Heading as="h2" size="subsection" class="mb-3">
            Chronology
          </Heading>
          <For each={props.response.chronology}>
            {(item) => (
              <Text>
                {item.observed_at} · {item.title} · supporting memory {item.memory_id}
              </Text>
            )}
          </For>
        </section>
      </Show>
      <Show when={props.response.proposed_candidates.length > 0}>
        <section class="answer-memory" aria-label="Review-only proposed memories">
          <Heading as="h2" size="subsection" class="mb-3">
            Proposed memories requiring approval
          </Heading>
          <For each={props.response.proposed_candidates}>
            {(item) => (
              <article class="answer-memory-entry">
                <Heading as="h3" size="subsection">
                  {item.title}
                </Heading>
                <Text>{item.content}</Text>
                <Text variant="caption" tone="muted">
                  {item.content_type} · {item.retention_tier} · {item.scope} · support{' '}
                  {item.supporting_memory_ids.join(', ')}
                </Text>
              </article>
            )}
          </For>
        </section>
      </Show>
      <Text tone="muted" class="lead">
        {props.response.metrics.memories_included} memories included · canonical memory unchanged
      </Text>
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
      <Text variant="overline" class="eyebrow">
        <AppIcon size={14} /> Evidence brief
      </Text>
      <Heading size="title">{props.query}</Heading>
      <Show when={props.response}>
        {(response) => (
          <div class="answer-meta">
            <Badge variant="secondary">{response().mode}</Badge>
            <Badge variant="secondary">
              {response().retrieval_degraded
                ? 'lexical fallback'
                : response().retrieval_mode || 'hybrid retrieval'}
            </Badge>
            <Badge variant="secondary">
              {response().cached ? 'cache hit' : `${response().latency_ms} ms`}
            </Badge>
            <Badge variant="secondary">
              {response().plan.queries.length}{' '}
              {response().plan.queries.length === 1 ? 'retrieval' : 'retrievals'}
            </Badge>
          </div>
        )}
      </Show>
      <div class="answer-copy">
        <For
          each={(props.response?.answer ?? 'Cortana found relevant evidence below.').split(
            /\n{2,}/
          )}
        >
          {(paragraph) => <Text>{paragraph}</Text>}
        </For>
      </div>
      <Show when={props.response && props.response.plan.queries.length > 1}>
        <Accordion collapsible class="answer-plan">
          <AccordionItem value="details">
            <AccordionTrigger>Retrieval plan</AccordionTrigger>
            <AccordionContent>
              <ol>
                <For each={props.response!.plan.queries}>
                  {(plannedQuery) => <li>{plannedQuery}</li>}
                </For>
              </ol>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Show>
      <For each={props.response?.warnings ?? []}>
        {(warning) => (
          <Alert variant="warning">
            <AlertDescription>{warning}</AlertDescription>
          </Alert>
        )}
      </For>
      <Show when={props.response?.retrieval_degraded}>
        <Alert variant="warning" role="status">
          <AlertDescription>
            Embedding retrieval is temporarily unavailable; these citations came from exact-term
            search.
          </AlertDescription>
        </Alert>
      </Show>
      <Text tone="muted" class="lead">
        {props.evidence.length} cited passages
      </Text>
      <Show when={props.response?.memories && props.response.memories.length > 0}>
        <section class="answer-memory" aria-label="Native agent memory">
          <Text variant="label" as="p" class="mb-3">
            {props.response!.memories!.length} native memory entries
          </Text>
          <For each={props.response!.memories!.slice(0, 4)}>
            {(memory) => (
              <article class="answer-memory-entry">
                <Heading as="h2" size="subsection">
                  {memory.title}
                </Heading>
                <Text>{memory.content}</Text>
                <Text variant="caption" tone="muted">
                  {memory.content_type ?? memory.kind} · {memory.retention_tier ?? 'durable'} ·{' '}
                  {memory.scope ?? 'workspace'} · {memory.project} · confidence{' '}
                  {memory.confidence.toFixed(2)}
                  {memory.valid_until
                    ? ` · expires ${new Date(memory.valid_until).toLocaleDateString()}`
                    : ''}
                </Text>
              </article>
            )}
          </For>
        </section>
      </Show>
      <For each={props.evidence.slice(0, 4)}>
        {(item, index) => (
          <Card class="mb-4">
            <CardContent>
              <h2 class="mb-3">
                <ListRow
                  as="button"
                  type="button"
                  tooltip={`Inspect cited passage ${index() + 1}: ${item.title}`}
                  onClick={() => props.onSelect(index())}
                  leading={<span>[{index() + 1}]</span>}
                  class="w-full text-left"
                >
                  {item.title}
                </ListRow>
              </h2>
              <Text>{item.content}</Text>
            </CardContent>
          </Card>
        )}
      </For>
      <div class="answer-note">
        <Text variant="caption" tone="muted" as="p">
          {props.response?.mode === 'synthesized'
            ? 'Synthesized from the cited passages. Open a source to inspect the original evidence.'
            : 'Extractive mode keeps citations stable when no synthesis model is configured.'}
        </Text>
      </div>
    </article>
  )
}

function TimelineView(props: { evidence: Evidence[]; onSelect: (chunkId: string) => void }) {
  return (
    <div class="timeline-view">
      <Heading size="page" class="mb-6">
        Evidence timeline
      </Heading>
      <For
        each={props.evidence.toSorted((left, right) =>
          right.updated_at.localeCompare(left.updated_at)
        )}
      >
        {(item) => (
          <ListRow
            as="button"
            type="button"
            aria-label={`Timeline evidence: ${item.title}`}
            tooltip={`Inspect timeline evidence: ${item.title}`}
            onClick={() => props.onSelect(item.chunk_id)}
            description={codeRevisionLabel(item) ?? item.source}
            trailing={<time>{new Date(item.updated_at).toLocaleDateString()}</time>}
            class="w-full text-left"
          >
            {item.title}
          </ListRow>
        )}
      </For>
    </div>
  )
}

function AppIcon(props: { size?: number }) {
  const size = () => props.size ?? 16
  return <img src="/app-icon.svg" alt="" width={size()} height={size()} aria-hidden="true" />
}
