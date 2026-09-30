import { Spinner } from '@adea-ai/ui/components/ui/spinner'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@adea-ai/ui/components/ui/accordion'
import {
  AlertTriangle,
  CheckCircle2,
  CircleStop,
  CircleX,
  Inbox,
  RefreshCw,
  Settings,
} from 'lucide-solid'
import { For, Show } from 'solid-js'

import { describeSyncRunProgress } from '@/operations'
import { describeSourceJobProgress, recentCompletedJobs } from '@/sourceJobs'
import type { BrainStatus, DesktopSourceJob, SourceSyncSummary } from '@/types'
import { Alert, AlertDescription, AlertTitle } from '@adea-ai/ui/components/ui/alert'
import { StatusChip } from '@adea-ai/ui/components/ui/status-chip'
import { ActionButton as Button } from '@adea-ai/ui/components/composites/action-button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@adea-ai/ui/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@adea-ai/ui/components/ui/empty'
import { Progress } from '@adea-ai/ui/components/ui/progress'

export type M7ActivityInboxProps = {
  status: BrainStatus | null
  statusError?: string
  sourceJobs: DesktopSourceJob[]
  sourceJobError?: string
  onRetrySourceJobs?: () => void
  onOpenSettings: () => void
  onRetryStatus?: () => void
  onCancelSourceJob?: (id: string) => void
}

function statusBadge(status: SourceSyncSummary['status'] | DesktopSourceJob['status']) {
  const label =
    status === 'budget_exceeded'
      ? 'Budget exceeded'
      : status === 'cancelling'
        ? 'Cancelling…'
        : status[0].toUpperCase() + status.slice(1)
  const tone =
    status === 'failed' || status === 'cancelled' || status === 'budget_exceeded'
      ? 'danger'
      : status === 'succeeded'
        ? 'success'
        : 'info'
  return <StatusChip tone={tone} label={label} />
}

function statusIcon(status: SourceSyncSummary['status'] | DesktopSourceJob['status']) {
  if (status === 'running' || status === 'cancelling') {
    return <Spinner size="md" label={false} />
  }
  if (status === 'succeeded') return <CheckCircle2 class="size-4" aria-hidden="true" />
  if (status === 'cancelled') return <CircleX class="size-4" aria-hidden="true" />
  return <AlertTriangle class="size-4" aria-hidden="true" />
}

function sourceOperationLabel(operation: DesktopSourceJob['operation']): string {
  return {
    'connection-check': 'Connection check',
    validation: 'Budget validation',
    authorization: 'Authorization',
    'trial-sync': 'Trial sync',
    'initial-sync': 'Initial sync',
  }[operation]
}

function ActivityEmpty(props: {
  loading: boolean
  error: string
  onRetryStatus?: () => void
  onOpenSettings: () => void
}) {
  return (
    <Empty class="min-h-72">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {props.loading ? (
            <Spinner size="md" label={false} />
          ) : props.error ? (
            <AlertTriangle aria-hidden="true" />
          ) : (
            <Inbox aria-hidden="true" />
          )}
        </EmptyMedia>
        <EmptyTitle>
          {props.loading
            ? 'Loading sync health'
            : props.error
              ? 'Sync health unavailable'
              : 'No sync attention'}
        </EmptyTitle>
        <EmptyDescription>
          {props.error ||
            (props.loading
              ? 'Waiting for the runtime status snapshot before reporting source health or sync history.'
              : 'Every configured source is idle and the latest syncs finished cleanly. New activity appears here as it happens.')}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div class="flex flex-wrap justify-center gap-2">
          <Show when={props.error && props.onRetryStatus}>
            <Button tooltip="Retry status" variant="outline" onClick={props.onRetryStatus}>
              <RefreshCw aria-hidden="true" /> Retry status
            </Button>
          </Show>
          <Button
            tooltip="Review configuration and resolve setup requirements."
            variant="outline"
            onClick={props.onOpenSettings}
          >
            <Settings aria-hidden="true" /> Open settings
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  )
}

function SyncActivityCard(props: { run: SourceSyncSummary }) {
  const documents = () => props.run.progress_documents ?? props.run.documents ?? 0
  const progress = () =>
    props.run.budget_documents
      ? Math.min(100, Math.round((documents() / props.run.budget_documents) * 100))
      : null
  return (
    <Card>
      <CardHeader>
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div data-activity-card-copy="" class="flex min-w-0 flex-1 flex-col gap-2">
            <CardTitle class="activity-card-title-line">
              {statusIcon(props.run.status)}
              <span class="min-w-0 break-words">{props.run.source}</span>
            </CardTitle>
            <CardDescription class="break-words">
              {props.run.project} · started {new Date(props.run.started_at).toLocaleString()}
            </CardDescription>
          </div>
          <CardAction>{statusBadge(props.run.status)}</CardAction>
        </div>
      </CardHeader>
      <CardContent class="activity-card-content">
        <div class="activity-card-detail-row">
          <p class="m-0 text-sm text-muted-foreground">{describeSyncRunProgress(props.run)}</p>
          <div class="activity-card-status-row">
            <Show when={props.run.status === 'running'}>
              <Progress
                value={progress() ?? undefined}
                indeterminate={progress() === undefined}
                hideValue
                aria-label={`${props.run.source} sync progress`}
              />
            </Show>
            <p class="text-xs text-muted-foreground">
              {documents().toLocaleString()} documents ·{' '}
              {(props.run.progress_bytes ?? props.run.bytes ?? 0).toLocaleString()} bytes
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function SourceJobCard(props: { job: DesktopSourceJob; onCancel?: (id: string) => void }) {
  const completed = () =>
    props.job.completed_at_unix_seconds
      ? new Date(props.job.completed_at_unix_seconds * 1000)
      : null
  const started = () => new Date(props.job.started_at_unix_seconds * 1000)
  const running = () => props.job.status === 'running' || props.job.status === 'cancelling'
  return (
    <Card>
      <CardHeader>
        <div class="flex min-w-0 items-start justify-between gap-3">
          <div data-activity-card-copy="" class="flex min-w-0 flex-1 flex-col gap-2">
            <CardTitle class="activity-card-title-line">
              {statusIcon(props.job.status)}
              <span class="min-w-0 break-words">
                {props.job.source} · {sourceOperationLabel(props.job.operation)}
              </span>
            </CardTitle>
            <CardDescription class="break-words">
              {props.job.project} · started {started().toLocaleString()}
            </CardDescription>
          </div>
          <CardAction>{statusBadge(props.job.status)}</CardAction>
        </div>
      </CardHeader>
      <CardContent class="activity-card-content">
        <div class="activity-card-detail-row">
          <p class="m-0 text-sm text-muted-foreground">{describeSourceJobProgress(props.job)}</p>
          <div class="activity-card-status-row">
            <Show when={running()}>
              <Progress
                value={undefined}
                indeterminate
                hideValue
                aria-label={`${props.job.source} ${sourceOperationLabel(props.job.operation)} in progress`}
              />
            </Show>
            <Show when={completed()}>
              <p class="text-xs text-muted-foreground">
                Completed in{' '}
                {Math.max(0, Math.round((completed()!.getTime() - started().getTime()) / 1000))}{' '}
                seconds
              </p>
            </Show>
            <Show when={props.onCancel && running()}>
              <Button
                tooltip={`Cancel ${props.job.project} ${props.job.source} ${props.job.operation}`}
                variant="outline"
                size="xs"
                disabled={props.job.status === 'cancelling'}
                aria-label={`Cancel ${props.job.project} ${props.job.source} ${props.job.operation}`}
                onClick={() => props.onCancel?.(props.job.id)}
              >
                <CircleStop aria-hidden="true" /> Cancel
              </Button>
            </Show>
          </div>
        </div>
        <Show when={props.job.log}>
          <Accordion collapsible class="activity-card-log p-2">
            <AccordionItem value="details">
              <AccordionTrigger>View job log</AccordionTrigger>
              <AccordionContent>
                <pre class="mt-2 overflow-auto whitespace-pre-wrap text-muted-foreground">
                  {props.job.log}
                </pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Show>
      </CardContent>
    </Card>
  )
}

export function M7ActivityInbox(props: M7ActivityInboxProps) {
  const statusError = () => props.statusError ?? ''
  const sourceJobError = () => props.sourceJobError ?? ''
  const attention = () =>
    (props.status?.sync_runs ?? []).filter((run) =>
      ['running', 'failed', 'cancelled', 'budget_exceeded'].includes(run.status)
    )
  const activeJobs = () =>
    props.sourceJobs.filter((job) => job.status === 'running' || job.status === 'cancelling')
  const completedJobs = () => recentCompletedJobs(props.sourceJobs)
  const empty = () =>
    attention().length === 0 && activeJobs().length === 0 && completedJobs().length === 0

  return (
    <main
      tabIndex={-1}
      id="main-content"
      class="utility-view m7-utility-view"
      data-m7-activity-inbox
    >
      <header class="utility-header">
        <div>
          <span class="eyebrow">Attention</span>
          <h1>Inbox</h1>
          <p>Current sync health and source-job activity. Nothing here is fabricated history.</p>
        </div>
      </header>
      <div class="utility-body" data-m7-activity-body>
        <Show when={sourceJobError()}>
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Source jobs unavailable</AlertTitle>
            <AlertDescription>{sourceJobError()}</AlertDescription>
            <Show when={props.onRetrySourceJobs}>
              {/* The shared Alert has no action slot; the retry rides inside it. */}
              <div class="activity-alert-action">
                <Button
                  tooltip="Retry the last failed request."
                  variant="outline"
                  size="xs"
                  onClick={props.onRetrySourceJobs}
                >
                  Retry
                </Button>
              </div>
            </Show>
          </Alert>
        </Show>
        <Show when={statusError() && props.status}>
          <Alert>
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Showing the last known sync snapshot</AlertTitle>
            <AlertDescription>{statusError()}</AlertDescription>
            <Show when={props.onRetryStatus}>
              {/* The shared Alert has no action slot; the retry rides inside it. */}
              <div class="activity-alert-action">
                <Button
                  tooltip="Retry the last failed request."
                  variant="outline"
                  size="xs"
                  onClick={props.onRetryStatus}
                >
                  Retry
                </Button>
              </div>
            </Show>
          </Alert>
        </Show>
        <Show
          when={!empty()}
          fallback={
            <ActivityEmpty
              loading={!props.status && !statusError()}
              error={statusError()}
              onRetryStatus={props.onRetryStatus}
              onOpenSettings={props.onOpenSettings}
            />
          }
        >
          <div class="flex flex-col gap-6">
            <Show when={attention().length}>
              <section class="flex flex-col gap-3" aria-labelledby="m7-sync-attention">
                <h2 id="m7-sync-attention" class="font-sans text-base font-medium">
                  Sync attention
                </h2>
                <div class="activity-card-grid">
                  <For each={attention()}>{(run) => <SyncActivityCard run={run} />}</For>
                </div>
              </section>
            </Show>
            <Show when={activeJobs().length}>
              <section class="flex flex-col gap-3" aria-labelledby="m7-active-source-jobs">
                <h2 id="m7-active-source-jobs" class="font-sans text-base font-medium">
                  Active source jobs
                </h2>
                <div class="activity-card-grid">
                  <For each={activeJobs()}>
                    {(job) => <SourceJobCard job={job} onCancel={props.onCancelSourceJob} />}
                  </For>
                </div>
              </section>
            </Show>
            <Show when={completedJobs().length}>
              <section class="flex flex-col gap-3" aria-labelledby="m7-recent-source-jobs">
                <h2 id="m7-recent-source-jobs" class="font-sans text-base font-medium">
                  Recent source jobs
                </h2>
                <div class="activity-card-grid">
                  <For each={completedJobs()}>{(job) => <SourceJobCard job={job} />}</For>
                </div>
              </section>
            </Show>
          </div>
        </Show>
        <div class="utility-actions">
          <Button
            tooltip="Manage ingestion in settings"
            variant="outline"
            onClick={props.onOpenSettings}
          >
            <Settings aria-hidden="true" /> Manage ingestion in settings
          </Button>
        </div>
      </div>
    </main>
  )
}
