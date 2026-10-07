import { ListRow } from '@adea-ai/ui/components/composites/list-row'
import { Tooltip, TooltipContent, TooltipTrigger } from '@adea-ai/ui/components/ui/tooltip'
import { VirtualWindow } from '@adea-ai/ui/components/layout/virtual-window'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@adea-ai/ui/components/ui/accordion'
import { Pause, Play, RefreshCw, Search, ShieldCheck } from 'lucide-solid'
import { createComputed, createEffect, createSignal, For, onCleanup, Show } from 'solid-js'

import {
  actOnMemoryCandidate,
  classifyMemoryCandidate,
  getMemoryConsolidationState,
  listCanonicalMemories,
  listDerivedMemories,
  listMemoryCandidates,
  setMemoryConsolidationPaused,
  type MemoryCandidateAction,
} from '../api'
import type {
  AgentMemory,
  DerivedMemoryResponse,
  MemoryCandidate,
  MemoryCandidateActionResult,
  MemoryCandidateClassification,
  MemoryReviewPolicy,
} from '../types'
import { virtualRange } from '../virtualization'
import { Alert, AlertDescription } from '@adea-ai/ui/components/ui/alert'
import { StatusChip, type StatusTone } from '@adea-ai/ui/components/ui/status-chip'
import { ActionButton as MemoryButton } from '@adea-ai/ui/components/composites/action-button'
import { Card, CardContent, CardHeader } from '@adea-ai/ui/components/ui/card'
import { CodeBlock } from '@adea-ai/ui/components/ui/code-block'
import { FieldSet, FormField } from '@adea-ai/ui/components/ui/field'
import {
  ItemDescription,
  ItemGroup,
  ItemGroupEntry,
  ItemTitle,
} from '@adea-ai/ui/components/ui/item'
import { ScrollArea } from '@adea-ai/ui/components/ui/scroll-area'
import { Separator } from '@adea-ai/ui/components/ui/separator'
import { PropertyList, PropertyTerm, PropertyValue } from '@adea-ai/ui/components/composites/stat'

import { Checkbox } from '@adea-ai/ui/components/ui/checkbox'
import { Input } from '@adea-ai/ui/components/ui/input'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@adea-ai/ui/components/ui/empty'
import { Spinner } from '@adea-ai/ui/components/ui/spinner'
import { Textarea } from '@adea-ai/ui/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@adea-ai/ui/components/ui/toggle-group'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@adea-ai/ui/components/ui/input-group'
import { useSettingsConfirm } from './settings/SettingsConfirm'
import { Heading, Text } from '@adea-ai/ui/components/ui/typography'

type QueueView =
  | 'all'
  | 'pending'
  | 'approved'
  | 'auto-retained'
  | 'rejected'
  | 'expired'
  | 'failed'
  | 'dead-letter'

export type MemoryReviewClient = {
  listCandidates: (project?: string, query?: string, status?: string) => Promise<MemoryCandidate[]>
  classifyCandidate: (id: string) => Promise<MemoryCandidateClassification>
  listDerived: (project?: string) => Promise<DerivedMemoryResponse>
  listCanonical: (project?: string) => Promise<AgentMemory[]>
  act: (
    id: string,
    action: MemoryCandidateAction,
    policy: MemoryReviewPolicy,
    edit?: { title: string; content: string }
  ) => Promise<MemoryCandidateActionResult>
  setConsolidationPaused: (paused: boolean) => Promise<void>
  getConsolidationState: () => Promise<{ paused: boolean; canControl: boolean }>
}

function MemoryPolicy(props: {
  policy: MemoryReviewPolicy
  onChange: (policy: MemoryReviewPolicy) => void
}) {
  const patch = (next: Partial<MemoryReviewPolicy>) => props.onChange({ ...props.policy, ...next })
  return (
    <>
      <div class="grid gap-4 sm:grid-cols-3">
        <FormField label="Working ceiling (days)">
          <Input
            type="number"
            min={1}
            max={7}
            value={props.policy.maxWorkingDays}
            onInput={(event) => patch({ maxWorkingDays: Number(event.target.value) })}
          />
        </FormField>
        <FormField label="Durable ceiling (days)">
          <Input
            type="number"
            min={1}
            max={3650}
            value={props.policy.maxDurableDays}
            onInput={(event) => patch({ maxDurableDays: Number(event.target.value) })}
          />
        </FormField>
        <FormField label="Candidate expiry (days)">
          <Input
            type="number"
            min={1}
            max={7}
            value={props.policy.candidateExpiryDays}
            onInput={(event) => patch({ candidateExpiryDays: Number(event.target.value) })}
          />
        </FormField>
      </div>
      <Text variant="caption" tone="muted" as="p">
        Candidate processing is manual. Automatic retention and recurring processing remain
        disabled.
      </Text>
    </>
  )
}

type CandidateRange = ReturnType<typeof virtualRange>

function CandidateQueue(props: {
  filtered: MemoryCandidate[]
  range: CandidateRange
  selectedId: string
  selectedIds: Set<string>
  loading: boolean
  busy: boolean
  onScroll: (top: number) => void
  onSelect: (id: string) => void
  onCheck: (ids: Set<string>) => void
  onBulk: (action: MemoryCandidateAction, ids: string[]) => void
}) {
  const updateSelection = (candidate: MemoryCandidate, checked: boolean) => {
    const next = new Set(props.selectedIds)
    if (checked && next.size < MAX_BULK_ACTIONS) next.add(candidate.id)
    else next.delete(candidate.id)
    props.onCheck(next)
  }

  return (
    <div class="flex min-w-0 flex-col gap-2">
      <Card size="flush" class="overflow-hidden">
        <ScrollArea
          class="h-90"
          tabIndex={-1}
          role="list"
          aria-label="Memory candidate queue"
          aria-busy={props.loading}
          onScroll={(event) => props.onScroll(event.currentTarget.scrollTop)}
        >
          <VirtualWindow totalSize={props.range.totalHeight} offset={props.range.offsetTop}>
            <For each={props.filtered.slice(props.range.start, props.range.end)}>
              {(candidate) => (
                <div
                  role="listitem"
                  class="memory-candidate-row flex h-18 items-center gap-2 px-2.5"
                >
                  <Checkbox
                    aria-label={`Select ${candidate.title}`}
                    checked={props.selectedIds.has(candidate.id)}
                    onChange={(checked: boolean) => updateSelection(candidate, checked)}
                  />
                  <ListRow
                    as="button"
                    type="button"
                    tooltip={`${candidate.title}, ${queueStatus(candidate)}`}
                    selected={props.selectedId === candidate.id}
                    aria-label={`${candidate.title}, ${queueStatus(candidate)}`}
                    onClick={() => props.onSelect(candidate.id)}
                    description={candidate.content}
                    class="min-w-0 flex-1 text-left"
                  >
                    {candidate.title}
                  </ListRow>
                  <StatusChip
                    tone={QUEUE_TONES[queueStatus(candidate)]}
                    label={queueStatus(candidate)}
                    role="status"
                  />
                </div>
              )}
            </For>
          </VirtualWindow>
          <Show when={!props.loading && props.filtered.length === 0}>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No candidates match this view</EmptyTitle>
                <EmptyDescription>
                  Adjust the search text or switch the status view to see other candidates.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </Show>
        </ScrollArea>
      </Card>
      <Show when={props.selectedIds.size > 0}>
        <div
          class="flex flex-wrap items-center justify-end gap-2"
          aria-label="Bulk-safe candidate actions"
        >
          <Text variant="micro" tone="muted">
            {props.selectedIds.size}/{MAX_BULK_ACTIONS} selected
          </Text>
          <MemoryButton
            tooltip="Reject selected"
            type="button"
            variant="secondary"
            size="sm"
            disabled={props.busy}
            onClick={() => props.onBulk('reject', [...props.selectedIds])}
          >
            Reject selected
          </MemoryButton>
          <MemoryButton
            tooltip="Redact selected"
            type="button"
            variant="secondary"
            size="sm"
            disabled={props.busy}
            onClick={() => props.onBulk('redact', [...props.selectedIds])}
          >
            Redact selected
          </MemoryButton>
        </div>
      </Show>
    </div>
  )
}

const defaultClient: MemoryReviewClient = {
  listCandidates: listMemoryCandidates,
  classifyCandidate: classifyMemoryCandidate,
  listDerived: listDerivedMemories,
  listCanonical: listCanonicalMemories,
  act: actOnMemoryCandidate,
  setConsolidationPaused: setMemoryConsolidationPaused,
  getConsolidationState: getMemoryConsolidationState,
}

const QUEUE_VIEWS: QueueView[] = [
  'all',
  'pending',
  'approved',
  'auto-retained',
  'rejected',
  'expired',
  'failed',
  'dead-letter',
]
const queueViewLabel = (view: QueueView) =>
  `${view.charAt(0).toUpperCase()}${view.slice(1).replace('-', ' ')}`
const ROW_HEIGHT = 72
const MAX_BULK_ACTIONS = 25

const DEFAULT_POLICY: MemoryReviewPolicy = {
  autoCommit: false,
  maxWorkingDays: 7,
  maxDurableDays: 365,
  maxActive: 10_000,
  candidateExpiryDays: 7,
  schedule: 'manual',
}

export function MemoryReview(props: {
  project?: string
  maxActive?: number
  client?: MemoryReviewClient
}) {
  const confirm = useSettingsConfirm()
  const client = () => props.client ?? defaultClient
  const [candidates, setCandidates] = createSignal<MemoryCandidate[]>([])
  const [canonical, setCanonical] = createSignal<AgentMemory[]>([])
  const [derived, setDerived] = createSignal<DerivedMemoryResponse | null>(null)
  const [classification, setClassification] = createSignal<MemoryCandidateClassification | null>(
    null
  )
  const [selectedId, setSelectedId] = createSignal('')
  const [selectedIds, setSelectedIds] = createSignal<Set<string>>(new Set())
  const [view, setView] = createSignal<QueueView>('all')
  const [query, setQuery] = createSignal('')
  const [scrollTop, setScrollTop] = createSignal(0)
  const [loading, setLoading] = createSignal(true)
  const [busy, setBusy] = createSignal(false)
  const [paused, setPaused] = createSignal(false)
  const [canControl, setCanControl] = createSignal(false)
  const [error, setError] = createSignal('')
  const [notice, setNotice] = createSignal('')
  const [policy, setPolicy] = createSignal({
    ...DEFAULT_POLICY,
    maxActive: props.maxActive ?? DEFAULT_POLICY.maxActive,
  })
  const [editing, setEditing] = createSignal(false)
  const [editTitle, setEditTitle] = createSignal('')
  const [editContent, setEditContent] = createSignal('')
  let refreshVersion = 0

  const refresh = async () => {
    const version = ++refreshVersion
    setLoading(true)
    setError('')
    try {
      const [nextCandidates, nextCanonical, nextDerived, consolidationState] = await Promise.all([
        client().listCandidates(
          props.project,
          query().trim() || undefined,
          view() === 'all' ? undefined : view()
        ),
        client().listCanonical(props.project),
        client().listDerived(props.project),
        client().getConsolidationState(),
      ])
      if (version !== refreshVersion) return
      setCandidates(nextCandidates)
      setCanonical(nextCanonical.slice(0, 100))
      setDerived(nextDerived)
      setPaused(consolidationState.paused)
      setCanControl(consolidationState.canControl)
      setSelectedId((current) =>
        nextCandidates.some((candidate) => candidate.id === current)
          ? current
          : (nextCandidates[0]?.id ?? '')
      )
    } catch (caught) {
      if (version !== refreshVersion) return
      setError(caught instanceof Error ? caught.message : 'Memory review failed')
    } finally {
      if (version === refreshVersion) setLoading(false)
    }
  }

  createEffect(() => {
    // Re-fetch (debounced) whenever the client, project, query, or view changes.
    client()
    void props.project
    query()
    view()
    const timer = window.setTimeout(() => void refresh(), 200)
    onCleanup(() => window.clearTimeout(timer))
  })

  createComputed(() => {
    const maxActive = props.maxActive ?? DEFAULT_POLICY.maxActive
    setPolicy((current) => ({ ...current, maxActive }))
  })

  const selected = () => candidates().find((candidate) => candidate.id === selectedId())

  createComputed(() => {
    const current = selected()
    setEditTitle(current?.title ?? '')
    setEditContent(current?.content ?? '')
    setClassification(null)
    if (current?.status !== 'pending') return
    let active = true
    client()
      .classifyCandidate(current.id)
      .then((result) => {
        if (active) setClassification(result)
        return null
      })
      .catch(() => {
        if (active) setClassification(null)
      })
    onCleanup(() => {
      active = false
    })
  })

  const filtered = candidates
  const range = () => virtualRange(filtered().length, scrollTop(), 360, ROW_HEIGHT)

  async function runAction(
    action: MemoryCandidateAction,
    ids = selected() ? [selected()!.id] : [],
    edit?: { title: string; content: string }
  ) {
    const boundedIds = ids.slice(0, MAX_BULK_ACTIONS)
    if (!boundedIds.length) return
    const canonicalWrite = ['approve', 'edit-approve', 'working', 'supersede', 'retry'].includes(
      action
    )
    if (
      canonicalWrite &&
      !(await confirm(
        `Confirm ${action.replace('-', ' ')} for ${boundedIds.length} candidate${boundedIds.length === 1 ? '' : 's'}? Canonical memory may change only if backend policy approves.`
      ))
    ) {
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const results: MemoryCandidateActionResult[] = []
      for (const id of boundedIds) results.push(await client().act(id, action, policy(), edit))
      const reviews = results.filter(
        (result) => result.status === 'review' || result.decision?.decision === 'review'
      ).length
      const writes = results.filter((result) => Boolean(result.memory_id)).length
      if (reviews) {
        setNotice(
          `${reviews} candidate(s) remain in review; no canonical memory changed for those records.`
        )
      } else if (writes) {
        setNotice(`Canonical memory updated for ${writes} candidate(s).`)
      } else {
        setNotice(`${action.replace('-', ' ')} recorded for ${boundedIds.length} candidate(s).`)
      }
      setEditing(false)
      setSelectedIds(new Set<string>())
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Memory candidate ${action} failed`)
    } finally {
      setBusy(false)
    }
  }

  async function togglePause() {
    setBusy(true)
    setError('')
    try {
      await client().setConsolidationPaused(!paused())
      setPaused(!paused())
      setNotice(`Consolidation ${paused() ? 'resumed' : 'paused'}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Consolidation control failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      class="flex min-w-0 flex-col gap-4"
      aria-labelledby="memory-review-title"
      data-m7-memory-review=""
    >
      <Separator class="my-2" />
      <header class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex min-w-0 flex-col gap-1">
          <Text variant="overline">Review before retention</Text>
          <Heading size="card" id="memory-review-title">
            Memory control center
          </Heading>
          <Text variant="caption" tone="muted" as="p">
            Inspect candidates, canonical recall, and derived reasoning as separate layers.
          </Text>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <MemoryButton
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy() || !canControl()}
            tooltip={
              !canControl()
                ? 'Owner authorization is required.'
                : busy()
                  ? 'Wait for the current memory operation to finish.'
                  : paused()
                    ? 'Resume consolidation of reviewed memory candidates.'
                    : 'Pause consolidation while reviewing memory candidates.'
            }
            onClick={() => void togglePause()}
          >
            {paused() ? (
              <Play size={14} aria-hidden="true" />
            ) : (
              <Pause size={14} aria-hidden="true" />
            )}
            {paused() ? 'Resume consolidation' : 'Pause consolidation'}
          </MemoryButton>
          <MemoryButton
            tooltip={
              loading()
                ? 'Wait for the current memory refresh to finish.'
                : 'Reload memory candidates and retention state.'
            }
            type="button"
            variant="secondary"
            size="sm"
            disabled={loading()}
            onClick={() => void refresh()}
          >
            {loading() ? <Spinner /> : <RefreshCw size={14} aria-hidden="true" />} Refresh
          </MemoryButton>
        </div>
      </header>

      <FieldSet aria-label="Memory retention policy">
        <MemoryPolicy policy={policy()} onChange={setPolicy} />
      </FieldSet>
      <div class="flex flex-wrap items-start gap-2">
        <InputGroup class="min-w-56 flex-1">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search memory candidates"
            value={query()}
            onInput={(event) => setQuery(event.target.value)}
            placeholder="Search candidate content, project, or source"
          />
        </InputGroup>
        <ToggleGroup
          class="max-w-full flex-wrap"
          aria-label="Candidate status views"
          value={view()}
          onChange={(value: string | null) => value && setView(value as QueueView)}
        >
          <For each={QUEUE_VIEWS}>
            {(status) => (
              <Tooltip>
                <TooltipTrigger as={ToggleGroupItem} value={status} size="xs" variant="outline">
                  {queueViewLabel(status)}
                </TooltipTrigger>
                <TooltipContent>
                  {status === 'all'
                    ? 'Show every memory candidate status'
                    : `Show ${status.replace('-', ' ')} memory candidates`}
                </TooltipContent>
              </Tooltip>
            )}
          </For>
        </ToggleGroup>
      </div>

      <Show
        when={!error()}
        fallback={
          <Alert variant="destructive">
            <AlertDescription>{error()}</AlertDescription>
          </Alert>
        }
      >
        <Show when={notice()}>
          <Alert variant="success" role="status">
            <AlertDescription>{notice()}</AlertDescription>
          </Alert>
        </Show>
      </Show>

      <div class="memory-review-layout">
        <CandidateQueue
          filtered={filtered()}
          range={range()}
          selectedId={selectedId()}
          selectedIds={selectedIds()}
          loading={loading()}
          busy={busy()}
          onScroll={setScrollTop}
          onSelect={setSelectedId}
          onCheck={setSelectedIds}
          onBulk={(action, ids) => void runAction(action, ids)}
        />
        <CandidateDetail
          selected={selected()}
          classification={classification()}
          busy={busy()}
          editing={editing()}
          editTitle={editTitle()}
          editContent={editContent()}
          onEditing={setEditing}
          onTitle={setEditTitle}
          onContent={setEditContent}
          onAction={(action, edit) => void runAction(action, undefined, edit)}
        />
      </div>

      <MemoryLayers canonical={canonical()} derived={derived()} />
    </section>
  )
}

function CandidateDetail(props: {
  selected?: MemoryCandidate
  classification: MemoryCandidateClassification | null
  busy: boolean
  editing: boolean
  editTitle: string
  editContent: string
  onEditing: (editing: boolean) => void
  onTitle: (title: string) => void
  onContent: (content: string) => void
  onAction: (action: MemoryCandidateAction, edit?: { title: string; content: string }) => void
}) {
  return (
    <Card size="sm" class="min-w-0">
      <CardContent>
        <Show
          when={props.selected}
          fallback={
            <Text variant="caption" tone="muted" as="p">
              Select a candidate.
            </Text>
          }
        >
          {(selected) => (
            <article class="flex min-w-0 flex-col gap-3" aria-live="polite">
              <div class="flex min-w-0 flex-col gap-1">
                <Text variant="overline">Candidate · not canonical</Text>
                <Heading size="subsection">{selected().title}</Heading>
              </div>
              {props.editing ? (
                <div class="flex flex-col gap-3">
                  <FormField label="Proposed title">
                    <Input
                      value={props.editTitle}
                      onInput={(event) => props.onTitle(event.target.value)}
                    />
                  </FormField>
                  <FormField label="Proposed content">
                    <Textarea
                      rows={5}
                      size="comfortable"
                      value={props.editContent}
                      onInput={(event) => props.onContent(event.target.value)}
                    />
                  </FormField>
                </div>
              ) : (
                <Text variant="caption" tone="muted" as="p">
                  {selected().content}
                </Text>
              )}
              <CandidateMetadata selected={selected()} classification={props.classification} />
              <Show
                when={selected().status === 'pending'}
                fallback={
                  <Text variant="caption" tone="muted" as="p">
                    This candidate is terminal. Its stored outcome is shown above; no new
                    classification or action was run.
                  </Text>
                }
              >
                <CandidateActions
                  busy={props.busy}
                  retryable={
                    selected().consolidation?.status === 'dead-letter' ||
                    selected().consolidation?.status === 'retry'
                  }
                  editing={props.editing}
                  editTitle={props.editTitle}
                  editContent={props.editContent}
                  onEditing={props.onEditing}
                  onAction={props.onAction}
                />
              </Show>
            </article>
          )}
        </Show>
      </CardContent>
    </Card>
  )
}

function CandidateMetadata(props: {
  selected: MemoryCandidate
  classification: MemoryCandidateClassification | null
}) {
  return (
    <>
      <PropertyList>
        <PropertyTerm>Content type</PropertyTerm>
        <PropertyValue>{props.selected.content_type}</PropertyValue>
        <PropertyTerm>Retention</PropertyTerm>
        <PropertyValue>{props.selected.retention_tier}</PropertyValue>
        <PropertyTerm>Scope</PropertyTerm>
        <PropertyValue>{props.selected.scope}</PropertyValue>
        <PropertyTerm>Confidence</PropertyTerm>
        <PropertyValue>{Math.round(props.selected.confidence * 100)}%</PropertyValue>
        <PropertyTerm>Sensitivity</PropertyTerm>
        <PropertyValue>{props.selected.sensitivity}</PropertyValue>
        <PropertyTerm>Expires</PropertyTerm>
        <PropertyValue>{props.selected.expires_at}</PropertyValue>
        <PropertyTerm>Classification</PropertyTerm>
        <PropertyValue>
          {props.selected.consolidation?.classification ??
            props.classification?.classification ??
            'Not evaluated'}
        </PropertyValue>
        <PropertyTerm>Policy version</PropertyTerm>
        <PropertyValue>
          {props.selected.consolidation?.policy_version ?? 'Not evaluated'}
        </PropertyValue>
        <Show when={props.selected.consolidation}>
          {(consolidation) => (
            <>
              <PropertyTerm>Decision</PropertyTerm>
              <PropertyValue>{consolidation().decision}</PropertyValue>
              <PropertyTerm>Job status</PropertyTerm>
              <PropertyValue>{consolidation().status}</PropertyValue>
              <PropertyTerm>Attempts</PropertyTerm>
              <PropertyValue>{consolidation().attempts}</PropertyValue>
              <PropertyTerm>Canonical memory</PropertyTerm>
              <PropertyValue>{consolidation().memory_id ?? 'None'}</PropertyValue>
              <PropertyTerm>Last error</PropertyTerm>
              <PropertyValue>{consolidation().last_error ?? 'None'}</PropertyValue>
              <PropertyTerm>Evaluated</PropertyTerm>
              <PropertyValue>{consolidation().updated_at}</PropertyValue>
            </>
          )}
        </Show>
      </PropertyList>
      <Show when={props.classification}>
        <Text variant="caption" tone="muted" as="p">
          {props.classification!.explanation}
        </Text>
      </Show>
      <Show when={!props.classification && props.selected.consolidation}>
        <Text variant="caption" tone="muted" as="p">
          {props.selected.consolidation!.explanation ??
            `Stored policy decision ${props.selected.consolidation!.decision} ended as ${props.selected.consolidation!.status}`}
          {props.selected.consolidation!.memory_id
            ? ` and created canonical memory ${props.selected.consolidation!.memory_id}`
            : ' without creating canonical memory'}
          {props.selected.consolidation!.reason_code
            ? ` (reason: ${props.selected.consolidation!.reason_code})`
            : ''}
          .
        </Text>
      </Show>
      <Accordion collapsible>
        <AccordionItem value="details">
          <AccordionTrigger>Provenance and support</AccordionTrigger>
          <AccordionContent>
            <div class="flex flex-col gap-2">
              <CodeBlock
                code={JSON.stringify(props.selected.provenance, null, 2)}
                language="json"
                title="Provenance"
                complete
                wrap
                maxHeight={140}
              />
              <Text variant="caption" tone="muted" as="p">
                Supporting memories:{' '}
                {(
                  props.classification?.supporting_memory_ids ??
                  props.selected.consolidation?.supporting_memory_ids ??
                  []
                ).join(', ') || 'None'}
              </Text>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  )
}

function CandidateActions(props: {
  busy: boolean
  retryable: boolean
  editing: boolean
  editTitle: string
  editContent: string
  onEditing: (editing: boolean) => void
  onAction: (action: MemoryCandidateAction, edit?: { title: string; content: string }) => void
}) {
  return (
    <div class="flex flex-wrap items-center gap-2">
      <MemoryButton
        tooltip="Approve canonical memory"
        variant="secondary"
        size="sm"
        type="button"
        disabled={props.busy}
        onClick={() => props.onAction('approve')}
      >
        <ShieldCheck size={14} aria-hidden="true" /> Approve canonical memory
      </MemoryButton>
      <Show
        when={props.editing}
        fallback={
          <MemoryButton
            tooltip="Edit and approve"
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => props.onEditing(true)}
          >
            Edit and approve
          </MemoryButton>
        }
      >
        <MemoryButton
          tooltip="Confirm edit and approve"
          variant="secondary"
          size="sm"
          type="button"
          disabled={props.busy || !props.editTitle.trim() || !props.editContent.trim()}
          onClick={() =>
            props.onAction('edit-approve', {
              title: props.editTitle,
              content: props.editContent,
            })
          }
        >
          Confirm edit and approve
        </MemoryButton>
      </Show>
      <MemoryButton
        tooltip="Keep working"
        type="button"
        variant="secondary"
        size="sm"
        disabled={props.busy}
        onClick={() => props.onAction('working')}
      >
        Keep working
      </MemoryButton>
      <MemoryButton
        tooltip="Review and supersede"
        type="button"
        variant="secondary"
        size="sm"
        disabled={props.busy}
        onClick={() => props.onAction('supersede')}
      >
        Review and supersede
      </MemoryButton>
      <Show when={props.retryable}>
        <MemoryButton
          tooltip="Retry the last failed request."
          type="button"
          variant="secondary"
          size="sm"
          disabled={props.busy}
          onClick={() => props.onAction('retry')}
        >
          Retry
        </MemoryButton>
      </Show>
      <MemoryButton
        tooltip="Reject"
        type="button"
        variant="secondary"
        size="sm"
        disabled={props.busy}
        onClick={() => props.onAction('reject')}
      >
        Reject
      </MemoryButton>
      <MemoryButton
        tooltip="Redact"
        type="button"
        variant="secondary"
        size="sm"
        disabled={props.busy}
        onClick={() => props.onAction('redact')}
      >
        Redact
      </MemoryButton>
    </div>
  )
}

function MemoryLayers(props: { canonical: AgentMemory[]; derived: DerivedMemoryResponse | null }) {
  return (
    <div class="memory-layer-grid">
      <Card size="sm" class="min-w-0" role="region" aria-labelledby="canonical-memory-title">
        <CardHeader>
          <Text variant="overline">Recall</Text>
          <Heading size="subsection" id="canonical-memory-title">
            Canonical memory
          </Heading>
          <Text variant="caption" tone="muted" as="p">
            Durable records eligible for recall and evidence-backed answers.
          </Text>
        </CardHeader>
        <CardContent>
          <ScrollArea class="max-h-65" tabIndex={-1}>
            <ItemGroup listLabel="Canonical memory records">
              <For each={props.canonical.slice(0, 20)}>
                {(memory) => (
                  <ItemGroupEntry variant="outline" size="sm">
                    <ItemTitle>{memory.title}</ItemTitle>
                    <ItemDescription>{memory.content}</ItemDescription>
                    <ItemDescription>
                      {memory.status ?? 'active'}
                      {memory.supersedes_id ? ` · supersedes ${memory.supersedes_id}` : ''}
                      {memory.source ? ` · from ${memory.source}` : ''}
                    </ItemDescription>
                  </ItemGroupEntry>
                )}
              </For>
            </ItemGroup>
          </ScrollArea>
        </CardContent>
      </Card>
      <Card size="sm" class="min-w-0" role="region" aria-labelledby="derived-memory-title">
        <CardHeader>
          <Text variant="overline">Reflect</Text>
          <Heading size="subsection" id="derived-memory-title">
            Derived · not canonical
          </Heading>
          <Text variant="caption" tone="muted" as="p">
            Recomputed interpretations are never source evidence or citation authority.
          </Text>
        </CardHeader>
        <CardContent>
          <ScrollArea class="max-h-65" tabIndex={-1}>
            <ItemGroup listLabel="Derived memory representations">
              <For each={props.derived?.representations.slice(0, 20) ?? []}>
                {(item) => (
                  <ItemGroupEntry variant="outline" size="sm">
                    <ItemTitle>
                      {item.kind}: {item.statement}
                    </ItemTitle>
                    <ItemDescription>
                      Supports: {item.supporting_memory_ids.join(', ') || 'None'}
                    </ItemDescription>
                    <ItemDescription>
                      Opposes: {item.contradicting_memory_ids.join(', ') || 'None'}
                    </ItemDescription>
                  </ItemGroupEntry>
                )}
              </For>
            </ItemGroup>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

const QUEUE_TONES: Record<Exclude<QueueView, 'all'>, StatusTone> = {
  pending: 'info',
  approved: 'success',
  'auto-retained': 'success',
  rejected: 'danger',
  failed: 'danger',
  'dead-letter': 'danger',
  expired: 'neutral',
}

function queueStatus(candidate: MemoryCandidate): Exclude<QueueView, 'all'> {
  const job = candidate.consolidation
  if (candidate.status === 'expired') return 'expired'
  if (candidate.status === 'accepted' && job?.decision === 'auto-retain') return 'auto-retained'
  if (candidate.status === 'accepted') return 'approved'
  if (['cancelled', 'rejected', 'redacted'].includes(candidate.status)) return 'rejected'
  if (job?.status === 'dead-letter') return 'dead-letter'
  if (job?.status === 'retry') return 'failed'
  return 'pending'
}
