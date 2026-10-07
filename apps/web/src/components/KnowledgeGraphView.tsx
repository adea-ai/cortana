import { Tooltip, TooltipContent, TooltipTrigger } from '@adea-ai/ui/components/ui/tooltip'
import { Database, FileText, FolderTree, Search } from 'lucide-solid'
import {
  createComputed,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

import {
  ActionButton as Button,
  ActionButton as WorkspaceButton,
} from '@adea-ai/ui/components/composites/action-button'
import { EmptyState } from '@adea-ai/ui/components/ui/empty'
import { Card } from '@adea-ai/ui/components/ui/card'
import { OrbitItem, OrbitLayout } from '@adea-ai/ui/components/layout/orbit-layout'
import { createMediaQuery } from '../lib/mediaQuery'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@adea-ai/ui/components/ui/input-group'
import { NativeSelect } from '@adea-ai/ui/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@adea-ai/ui/components/ui/toggle-group'
import type { BrainGraphNode, BrainGraphPage, Evidence } from '../types'

const EMPTY_GRAPH_NODES: BrainGraphNode[] = []

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

export default function KnowledgeGraphView(props: {
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
  const compactGraph = createMediaQuery(() => '(max-width: 799px)')
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
  // Revalidation can reorder nodes even when the set is unchanged; keying the
  // reset on nodes[0] cleared an active selection mid-interaction. Only drop
  // the selection when the selected node actually leaves the filtered set.
  createComputed(() => {
    kindFilter()
    normalizedFilter()
    setVisibleCount(12)
  })
  createComputed(() => {
    const selected = selectedNodeId()
    if (selected && !filteredNodes().some((node) => node.id === selected)) {
      setSelectedNodeId(null)
    }
  })
  // The graph revalidates (SWR) while a node may be focused or selected, and
  // every fetch returns fresh node objects. Reconcile by id so an unchanged
  // revalidation keeps row identity — a rebuilt button would drop focus and
  // lose the pending keyboard activation.
  const [stableNodes, setStableNodes] = createStore<GraphNodeLike[]>([])
  createEffect(() => {
    setStableNodes(
      reconcile(
        filteredNodes().length
          ? filteredNodes()
          : usingEvidenceFallback()
            ? props.evidence.slice(0, 8).map((item) => ({
                id: item.chunk_id,
                kind: 'document' as const,
                label: item.title,
                project: '',
                source: item.source,
                document_id: null,
              }))
            : [],
        { key: 'id' }
      )
    )
  })
  const nodes = createMemo((): GraphNodeLike[] => stableNodes.slice(0, visibleCount()))
  const visibleNodeIds = createMemo(() => new Set(nodes().map((node) => node.id)))
  const visibleEdges = createMemo(() => {
    if (!props.graph || usingEvidenceFallback()) return []
    const ids = visibleNodeIds()
    return props.graph.edges.filter((edge) => ids.has(edge.target) || ids.has(edge.source))
  })
  // Search the full filtered set rather than the visible slice: a revalidation
  // reorder can push the selected node past the window without removing it.
  const activeGraphNode = createMemo(
    () => filteredNodes().find((node) => node.id === selectedNodeId()) ?? null
  )
  const selectedEdges = createMemo(() => {
    const active = activeGraphNode()
    return active
      ? visibleEdges().filter((edge) => edge.source === active.id || edge.target === active.id)
      : []
  })

  return (
    <>
      <h1 class="sr-only">Graph</h1>
      <Switch>
        <Match when={props.graphLoading && nodes().length === 0}>
          <EmptyState
            class="m-4 min-h-64"
            icon={<Search aria-hidden="true" />}
            busy
            title="Loading knowledge graph"
            detail="Mapping indexed workspaces and documents…"
            announceAs="status"
          />
        </Match>
        <Match when={props.graphError && nodes().length === 0}>
          <EmptyState
            class="m-4 min-h-64"
            icon={<Search aria-hidden="true" />}
            title="Graph unavailable"
            detail={props.graphError}
            action={props.onRetry}
            announceAs="alert"
          />
        </Match>
        <Match when={!props.graphLoading && nodes().length === 0 && normalizedFilter()}>
          <EmptyState
            class="m-4 min-h-64"
            icon={<Search aria-hidden="true" />}
            title="No matching graph nodes"
            detail="Try a workspace, source, or document name."
            action={() => setFilter('')}
            actionLabel="Clear filter"
            actionTooltip="Clear the graph node filter"
          />
        </Match>
        <Match when={!props.graphLoading && nodes().length === 0}>
          <EmptyState
            class="m-4 min-h-64"
            icon={<Search aria-hidden="true" />}
            title="No graph data"
            detail="Index a source to build linked workspace nodes."
          />
        </Match>
        <Match when>
          <div
            class="graph-view"
            data-compact={compactGraph() || undefined}
            data-selected={!!activeGraphNode() || undefined}
          >
            <Show when={!compactGraph() && visibleEdges().length > 0}>
              <svg class="graph-links" viewBox="0 0 100 100" aria-hidden="true">
                <For each={nodes()}>
                  {(node, index) => {
                    if (!visibleEdges().some((edge) => edge.target === node.id)) return null
                    const angle = (index() / Math.max(nodes().length, 1)) * Math.PI * 2
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
            <Show when={!compactGraph()}>
              <div class="graph-center">
                <img src="/app-icon.svg" alt="" width="24" height="24" aria-hidden="true" />
              </div>
            </Show>
            <div class="graph-controls">
              <Card class="graph-toolbar flex-row flex-wrap items-center gap-2 p-2" role="search">
                <InputGroup size="sm" class="graph-search">
                  <InputGroupAddon>
                    <Search aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    type="search"
                    aria-label="Filter graph nodes"
                    placeholder="Filter nodes…"
                    value={filter()}
                    onInput={(event) => setFilter(event.target.value)}
                  />
                </InputGroup>
                <Show when={filter()}>
                  <WorkspaceButton
                    tooltip="Clear the graph node filter"
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => setFilter('')}
                  >
                    Clear
                  </WorkspaceButton>
                </Show>
                <NativeSelect
                  size="sm"
                  aria-label="Filter graph relationships"
                  value={props.graphEdgeKind}
                  onChange={(event) =>
                    props.onGraphEdgeKindChange?.(
                      event.target.value as BrainGraphPage['edges'][number]['kind'] | 'all'
                    )
                  }
                  options={[
                    { value: 'all', label: 'All relationships' },
                    ...(
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
                    ).map((kind) => ({ value: kind, label: kind })),
                  ]}
                />
                <NativeSelect
                  size="sm"
                  aria-label="Filter graph relationship origin"
                  value={props.graphOrigin}
                  onChange={(event) =>
                    props.onGraphOriginChange?.(
                      event.target.value as
                        | NonNullable<BrainGraphPage['edges'][number]['origin']>
                        | 'all'
                    )
                  }
                  options={[
                    { value: 'all', label: 'All origins' },
                    { value: 'explicit', label: 'Explicit' },
                    { value: 'derived', label: 'Derived' },
                    { value: 'inferred', label: 'Inferred' },
                  ]}
                />
                <NativeSelect
                  size="sm"
                  aria-label="Filter graph minimum confidence"
                  value={
                    props.graphMinConfidence == null ? 'all' : String(props.graphMinConfidence)
                  }
                  onChange={(event) =>
                    props.onGraphMinConfidenceChange?.(
                      event.target.value === 'all' ? null : Number(event.target.value)
                    )
                  }
                  options={[
                    { value: 'all', label: 'Any confidence' },
                    { value: '0.5', label: '50% or higher' },
                    { value: '0.75', label: '75% or higher' },
                    { value: '0.9', label: '90% or higher' },
                  ]}
                />
              </Card>
              <Show when={props.graph && !usingEvidenceFallback()}>
                <ToggleGroup
                  class="max-w-full flex-wrap"
                  aria-label="Filter graph node types"
                  value={kindFilter()}
                  onChange={(value: string | null) =>
                    value && setKindFilter(value as BrainGraphNode['kind'] | 'all')
                  }
                >
                  <For each={['all', 'workspace', 'source', 'document'] as const}>
                    {(kind) => (
                      <Tooltip>
                        <TooltipTrigger
                          as={ToggleGroupItem}
                          value={kind}
                          size="xs"
                          variant="outline"
                        >
                          {kind === 'all'
                            ? 'All'
                            : kind === 'workspace'
                              ? 'Workspaces'
                              : kind === 'source'
                                ? 'Sources'
                                : 'Documents'}
                        </TooltipTrigger>
                        <TooltipContent>
                          {kind === 'all' ? 'Show every graph node type' : `Show ${kind} nodes`}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </For>
                </ToggleGroup>
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
            </div>
            <Show when={props.graphError && props.onRetry}>
              <div class="graph-overlay-actions">
                <WorkspaceButton
                  tooltip="Retry graph"
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={props.onRetry}
                >
                  Retry graph
                </WorkspaceButton>
              </div>
            </Show>
            <Show when={props.graphFocused || props.graphCanGoBack || props.graphCanGoForward}>
              <div class="graph-overlay-actions">
                <WorkspaceButton
                  tooltip={
                    props.graphCanGoBack
                      ? 'Return to the previous graph view'
                      : 'No previous graph view'
                  }
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={!props.graphCanGoBack}
                  onClick={props.onGraphBack}
                >
                  Back
                </WorkspaceButton>
                <WorkspaceButton
                  tooltip={
                    props.graphCanGoForward ? 'Return to the next graph view' : 'No next graph view'
                  }
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={!props.graphCanGoForward}
                  onClick={props.onGraphForward}
                >
                  Forward
                </WorkspaceButton>
                <Show when={props.graphFocused && props.onResetGraphFocus}>
                  <WorkspaceButton
                    tooltip="Return to graph overview"
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={props.onResetGraphFocus}
                  >
                    Return to graph overview
                  </WorkspaceButton>
                </Show>
              </div>
            </Show>
            <Show when={props.graph?.next_cursor && props.onLoadMore}>
              <Card class="graph-pagination flex-row flex-wrap items-center gap-2 p-2">
                <WorkspaceButton
                  tooltip={'Load the next page of nodes in this graph.'}
                  variant="secondary"
                  size="sm"
                  onClick={props.onLoadMore}
                  disabled={props.graphAppendLoading}
                >
                  {props.graphAppendLoading ? 'Loading more nodes…' : 'Load more nodes'}
                </WorkspaceButton>
                <span>More nodes remain outside this bounded view.</span>
              </Card>
            </Show>
            <Show when={!props.graph?.next_cursor && filteredNodes().length > visibleCount()}>
              <Card class="graph-pagination flex-row flex-wrap items-center gap-2 p-2">
                <WorkspaceButton
                  tooltip="Show more nodes"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setVisibleCount((count) => Math.min(count + 12, filteredNodes().length))
                  }
                >
                  Show more nodes
                </WorkspaceButton>
                <span>Showing a bounded window for responsive rendering.</span>
              </Card>
            </Show>
            <OrbitLayout
              radius="clamp(110px, 20vw, 300px)"
              mode={compactGraph() ? 'flow' : 'radial'}
              class={
                compactGraph()
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'absolute inset-0 pointer-events-none'
              }
            >
              <For each={nodes()}>
                {(node, index) => (
                  <OrbitItem
                    index={index()}
                    count={nodes().length}
                    class="graph-node pointer-events-auto"
                    data-kind={node.kind}
                  >
                    <Button
                      variant={selectedNodeId() === node.id ? 'default' : 'outline'}
                      size="lg"
                      type="button"
                      aria-pressed={selectedNodeId() === node.id}
                      aria-label={`${node.document_id ? 'Open document' : node.kind === 'workspace' ? 'Focus workspace' : node.kind === 'source' ? 'Focus source' : 'Open evidence'}: ${node.label}`}
                      tooltip={
                        node.document_id
                          ? 'Open document'
                          : node.kind === 'workspace'
                            ? 'Focus workspace'
                            : node.kind === 'source'
                              ? 'Focus source'
                              : 'Open retrieved evidence'
                      }
                      class="w-full"
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
                      <span class="graph-node-label">{node.label}</span>
                    </Button>
                  </OrbitItem>
                )}
              </For>
            </OrbitLayout>
            <Show when={activeGraphNode()}>
              {(selectedNode) => (
                <Card
                  role="complementary"
                  class="graph-selection gap-1 p-3"
                  aria-label="Selected graph node"
                  aria-live="polite"
                >
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
                        tooltip={
                          pinnedNodeIds().has(selectedNode().id)
                            ? 'Release this node from the pinned graph focus.'
                            : 'Keep this node in focus while exploring the graph.'
                        }
                        variant="ghost"
                        size="sm"
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
                        tooltip="Open document"
                        variant="secondary"
                        size="sm"
                        onClick={() => props.onSelectDocument(selectedNode().document_id!)}
                      >
                        Open document
                      </WorkspaceButton>
                      <Show when={props.onFocusGraphNode}>
                        <WorkspaceButton
                          tooltip="Expand one-hop relationships"
                          variant="ghost"
                          size="sm"
                          onClick={() => props.onFocusGraphNode!(selectedNode() as BrainGraphNode)}
                        >
                          Expand one-hop relationships
                        </WorkspaceButton>
                      </Show>
                    </div>
                  </Show>
                </Card>
              )}
            </Show>
          </div>
        </Match>
      </Switch>
    </>
  )
}
