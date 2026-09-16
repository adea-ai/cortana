import { Pause, Play, RefreshCw, Search, ShieldCheck } from 'lucide-solid'
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  Show,
  splitProps,
  type ComponentProps,
  type JSX,
} from 'solid-js'

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
import { Alert, AlertDescription } from './shadcn/alert'
import { Badge } from './shadcn/badge'
import { Button } from './shadcn/button'
import { Card } from './shadcn/card'
import { cn } from '@/lib/utils'

import { Checkbox } from './shadcn/checkbox'
import { Input } from './shadcn/input'
import { Spinner } from './shadcn/spinner'
import { Textarea } from './shadcn/textarea'
import { Toggle } from './shadcn/toggle'
import { useSettingsConfirm } from './settings/SettingsConfirm'

type QueueView =
  | 'all'
  | 'pending'
  | 'approved'
  | 'auto-retained'
  | 'rejected'
  | 'expired'
  | 'failed'
  | 'dead-letter'

type MemoryButtonProps = Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon' | 'compact'
}

function MemoryButton(props: MemoryButtonProps) {
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

function MemoryInput(props: ComponentProps<'input'>) {
  return <Input {...props} />
}

function MemoryTextarea(props: ComponentProps<'textarea'>) {
  return <Textarea {...props} />
}

function MemoryCard(props: ComponentProps<'div'>) {
  return <Card size="sm" {...props} />
}

function MemoryBadge(props: ComponentProps<'span'>) {
  return <Badge variant="secondary" {...props} />
}

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
    <div class="memory-policy" aria-label="Memory retention policy">
      <label>
        Working ceiling (days)
        <MemoryInput
          type="number"
          min={1}
          max={7}
          value={props.policy.maxWorkingDays}
          onChange={(event) => patch({ maxWorkingDays: Number(event.target.value) })}
        />
      </label>
      <label>
        Durable ceiling (days)
        <MemoryInput
          type="number"
          min={1}
          max={3650}
          value={props.policy.maxDurableDays}
          onChange={(event) => patch({ maxDurableDays: Number(event.target.value) })}
        />
      </label>
      <label>
        Candidate expiry (days)
        <MemoryInput
          type="number"
          min={1}
          max={7}
          value={props.policy.candidateExpiryDays}
          onChange={(event) => patch({ candidateExpiryDays: Number(event.target.value) })}
        />
      </label>
      <p>
        Candidate processing is manual. Automatic retention and recurring processing remain
        disabled.
      </p>
    </div>
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
    <div>
      <div
        class="memory-candidate-list"
        role="list"
        aria-label="Memory candidate queue"
        aria-busy={props.loading}
        onScroll={(event) => props.onScroll(event.currentTarget.scrollTop)}
      >
        <div
          class="memory-virtual-space"
          style={{ '--virtual-total-height': `${props.range.totalHeight}px` } as JSX.CSSProperties}
        >
          <div
            class="memory-virtual-window"
            style={{ '--virtual-offset': `${props.range.offsetTop}px` } as JSX.CSSProperties}
          >
            <For each={props.filtered.slice(props.range.start, props.range.end)}>
              {(candidate) => (
                <MemoryCard
                  role="listitem"
                  class={cn(
                    'memory-candidate-row',
                    props.selectedId === candidate.id && 'selected'
                  )}
                >
                  <Checkbox
                    aria-label={`Select ${candidate.title}`}
                    checked={props.selectedIds.has(candidate.id)}
                    onChange={(checked) => updateSelection(candidate, checked)}
                  />
                  <MemoryButton
                    variant="ghost"
                    type="button"
                    aria-current={props.selectedId === candidate.id}
                    aria-label={`${candidate.title}, ${queueStatus(candidate)}`}
                    onClick={() => props.onSelect(candidate.id)}
                  >
                    <strong>{candidate.title}</strong>
                    <span>{candidate.content}</span>
                  </MemoryButton>
                  <MemoryBadge class="memory-status" data-status={queueStatus(candidate)}>
                    {queueStatus(candidate)}
                  </MemoryBadge>
                </MemoryCard>
              )}
            </For>
          </div>
        </div>
        <Show when={!props.loading && props.filtered.length === 0}>
          <p class="empty-state">No candidates match this view.</p>
        </Show>
      </div>
      <Show when={props.selectedIds.size > 0}>
        <div class="memory-bulk-actions" aria-label="Bulk-safe candidate actions">
          <span>
            {props.selectedIds.size}/{MAX_BULK_ACTIONS} selected
          </span>
          <MemoryButton
            type="button"
            variant="secondary"
            disabled={props.busy}
            onClick={() => props.onBulk('reject', [...props.selectedIds])}
          >
            Reject selected
          </MemoryButton>
          <MemoryButton
            type="button"
            variant="secondary"
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

  createEffect(() => {
    const maxActive = props.maxActive ?? DEFAULT_POLICY.maxActive
    setPolicy((current) => ({ ...current, maxActive }))
  })

  const selected = () => candidates().find((candidate) => candidate.id === selectedId())

  createEffect(() => {
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
      class="memory-review m7-memory-review"
      aria-labelledby="memory-review-title"
      data-m7-memory-review=""
    >
      <header class="memory-review-header">
        <div>
          <span class="eyebrow">Review before retention</span>
          <h3 id="memory-review-title">Memory control center</h3>
          <p>Inspect candidates, canonical recall, and derived reasoning as separate layers.</p>
        </div>
        <div class="memory-review-header-actions">
          <MemoryButton
            type="button"
            variant="secondary"
            disabled={busy() || !canControl()}
            title={canControl() ? undefined : 'Owner authorization is required'}
            onClick={() => void togglePause()}
          >
            {paused() ? <Play size={14} /> : <Pause size={14} />}
            {paused() ? 'Resume consolidation' : 'Pause consolidation'}
          </MemoryButton>
          <MemoryButton
            type="button"
            variant="secondary"
            disabled={loading()}
            onClick={() => void refresh()}
          >
            {loading() ? <Spinner /> : <RefreshCw size={14} />} Refresh
          </MemoryButton>
        </div>
      </header>

      <MemoryPolicy policy={policy()} onChange={setPolicy} />
      <div class="memory-review-filters">
        <label class="memory-review-search">
          <Search size={14} aria-hidden="true" />
          <span class="sr-only">Search memory candidates</span>
          <MemoryInput
            type="search"
            aria-label="Search memory candidates"
            value={query()}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search candidate content, project, or source"
          />
        </label>
        <div class="memory-status-tabs" role="group" aria-label="Candidate status views">
          <For each={QUEUE_VIEWS}>
            {(status) => (
              <Toggle
                size="sm"
                pressed={view() === status}
                onChange={(pressed) => pressed && setView(status)}
              >
                {status.replace('-', ' ')}
              </Toggle>
            )}
          </For>
        </div>
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
          <div role="status" class="memory-review-message">
            {notice()}
          </div>
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
    <Show
      when={props.selected}
      fallback={<article class="memory-candidate-detail">Select a candidate.</article>}
    >
      {(selected) => (
        <article class="memory-candidate-detail" aria-live="polite">
          <span class="eyebrow">Candidate · not canonical</span>
          <h4>{selected().title}</h4>
          {props.editing ? (
            <div class="memory-edit-fields">
              <label>
                Proposed title
                <MemoryInput
                  value={props.editTitle}
                  onChange={(event) => props.onTitle(event.target.value)}
                />
              </label>
              <label>
                Proposed content
                <MemoryTextarea
                  value={props.editContent}
                  onChange={(event) => props.onContent(event.target.value)}
                />
              </label>
            </div>
          ) : (
            <p>{selected().content}</p>
          )}
          <CandidateMetadata selected={selected()} classification={props.classification} />
          <Show
            when={selected().status === 'pending'}
            fallback={
              <p class="memory-explanation">
                This candidate is terminal. Its stored outcome is shown above; no new classification
                or action was run.
              </p>
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
  )
}

function CandidateMetadata(props: {
  selected: MemoryCandidate
  classification: MemoryCandidateClassification | null
}) {
  return (
    <>
      <div class="memory-metadata">
        <div>
          <span>Content type</span>
          <strong>{props.selected.content_type}</strong>
        </div>
        <div>
          <span>Retention</span>
          <strong>{props.selected.retention_tier}</strong>
        </div>
        <div>
          <span>Scope</span>
          <strong>{props.selected.scope}</strong>
        </div>
        <div>
          <span>Confidence</span>
          <strong>{Math.round(props.selected.confidence * 100)}%</strong>
        </div>
        <div>
          <span>Sensitivity</span>
          <strong>{props.selected.sensitivity}</strong>
        </div>
        <div>
          <span>Expires</span>
          <strong>{props.selected.expires_at}</strong>
        </div>
        <div>
          <span>Classification</span>
          <strong>
            {props.selected.consolidation?.classification ??
              props.classification?.classification ??
              'Not evaluated'}
          </strong>
        </div>
        <div>
          <span>Policy version</span>
          <strong>{props.selected.consolidation?.policy_version ?? 'Not evaluated'}</strong>
        </div>
      </div>
      <Show when={props.selected.consolidation}>
        {(consolidation) => (
          <div class="memory-metadata">
            <div>
              <span>Decision</span>
              <strong>{consolidation().decision}</strong>
            </div>
            <div>
              <span>Job status</span>
              <strong>{consolidation().status}</strong>
            </div>
            <div>
              <span>Attempts</span>
              <strong>{consolidation().attempts}</strong>
            </div>
            <div>
              <span>Canonical memory</span>
              <strong>{consolidation().memory_id ?? 'None'}</strong>
            </div>
            <div>
              <span>Last error</span>
              <strong>{consolidation().last_error ?? 'None'}</strong>
            </div>
            <div>
              <span>Evaluated</span>
              <strong>{consolidation().updated_at}</strong>
            </div>
          </div>
        )}
      </Show>
      <Show when={props.classification}>
        <p class="memory-explanation">{props.classification!.explanation}</p>
      </Show>
      <Show when={!props.classification && props.selected.consolidation}>
        <p class="memory-explanation">
          {props.selected.consolidation!.explanation ??
            `Stored policy decision ${props.selected.consolidation!.decision} ended as ${props.selected.consolidation!.status}`}
          {props.selected.consolidation!.memory_id
            ? ` and created canonical memory ${props.selected.consolidation!.memory_id}`
            : ' without creating canonical memory'}
          {props.selected.consolidation!.reason_code
            ? ` (reason: ${props.selected.consolidation!.reason_code})`
            : ''}
          .
        </p>
      </Show>
      <details>
        <summary>Provenance and support</summary>
        <pre>{JSON.stringify(props.selected.provenance, null, 2)}</pre>
        <p>
          Supporting memories:{' '}
          {(
            props.classification?.supporting_memory_ids ??
            props.selected.consolidation?.supporting_memory_ids ??
            []
          ).join(', ') || 'None'}
        </p>
      </details>
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
    <div class="memory-candidate-actions">
      <MemoryButton type="button" disabled={props.busy} onClick={() => props.onAction('approve')}>
        <ShieldCheck size={14} /> Approve canonical memory
      </MemoryButton>
      <Show
        when={props.editing}
        fallback={
          <MemoryButton type="button" variant="secondary" onClick={() => props.onEditing(true)}>
            Edit and approve
          </MemoryButton>
        }
      >
        <MemoryButton
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
        type="button"
        variant="secondary"
        disabled={props.busy}
        onClick={() => props.onAction('working')}
      >
        Keep working
      </MemoryButton>
      <MemoryButton
        type="button"
        variant="secondary"
        disabled={props.busy}
        onClick={() => props.onAction('supersede')}
      >
        Review and supersede
      </MemoryButton>
      <Show when={props.retryable}>
        <MemoryButton
          type="button"
          variant="secondary"
          disabled={props.busy}
          onClick={() => props.onAction('retry')}
        >
          Retry
        </MemoryButton>
      </Show>
      <MemoryButton
        type="button"
        variant="secondary"
        disabled={props.busy}
        onClick={() => props.onAction('reject')}
      >
        Reject
      </MemoryButton>
      <MemoryButton
        type="button"
        variant="secondary"
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
      <section aria-labelledby="canonical-memory-title">
        <span class="eyebrow">Recall</span>
        <h4 id="canonical-memory-title">Canonical memory</h4>
        <p>Durable records eligible for recall and evidence-backed answers.</p>
        <ul>
          <For each={props.canonical.slice(0, 20)}>
            {(memory) => (
              <li>
                <strong>{memory.title}</strong>
                <span>{memory.content}</span>
                <span>
                  {memory.status ?? 'active'}
                  {memory.supersedes_id ? ` · supersedes ${memory.supersedes_id}` : ''}
                  {memory.source ? ` · from ${memory.source}` : ''}
                </span>
              </li>
            )}
          </For>
        </ul>
      </section>
      <section aria-labelledby="derived-memory-title">
        <span class="eyebrow">Reflect</span>
        <h4 id="derived-memory-title">Derived · not canonical</h4>
        <p>Recomputed interpretations are never source evidence or citation authority.</p>
        <ul>
          <For each={props.derived?.representations.slice(0, 20) ?? []}>
            {(item) => (
              <li>
                <strong>
                  {item.kind}: {item.statement}
                </strong>
                <span>Supports: {item.supporting_memory_ids.join(', ') || 'None'}</span>
                <span>Opposes: {item.contradicting_memory_ids.join(', ') || 'None'}</span>
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  )
}

function queueStatus(candidate: MemoryCandidate): QueueView {
  const job = candidate.consolidation
  if (candidate.status === 'expired') return 'expired'
  if (candidate.status === 'accepted' && job?.decision === 'auto-retain') return 'auto-retained'
  if (candidate.status === 'accepted') return 'approved'
  if (['cancelled', 'rejected', 'redacted'].includes(candidate.status)) return 'rejected'
  if (job?.status === 'dead-letter') return 'dead-letter'
  if (job?.status === 'retry') return 'failed'
  return 'pending'
}
