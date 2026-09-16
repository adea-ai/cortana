import {
  AlertTriangle,
  CheckCircle2,
  CircleStop,
  CircleX,
  Inbox,
  LoaderCircle,
  RefreshCw,
  Settings,
} from 'lucide-solid'
import { For, Show } from 'solid-js'

import { describeSyncRunProgress } from '@/operations'
import { describeSourceJobProgress, recentCompletedJobs } from '@/sourceJobs'
import type { BrainStatus, DesktopSourceJob, SourceSyncSummary } from '@/types'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/shadcn/alert'
import { Badge } from '@/components/shadcn/badge'
import { Button } from '@/components/shadcn/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/shadcn/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/shadcn/empty'
import { Progress } from '@/components/shadcn/progress'

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
  const variant =
    status === 'failed' || status === 'cancelled' || status === 'budget_exceeded'
      ? 'destructive'
      : status === 'succeeded'
        ? 'secondary'
        : 'outline'
  return <Badge variant={variant}>{label}</Badge>
}

function statusIcon(status: SourceSyncSummary['status'] | DesktopSourceJob['status']) {
  if (status === 'running' || status === 'cancelling') {
    return <LoaderCircle class="size-4 animate-spin" aria-hidden="true" />
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
    <Empty class="min-h-72 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {props.loading ? (
            <LoaderCircle class="animate-spin" aria-hidden="true" />
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
            <Button variant="outline" onClick={props.onRetryStatus}>
              <RefreshCw aria-hidden="true" /> Retry status
            </Button>
          </Show>
          <Button variant="outline" onClick={props.onOpenSettings}>
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
    <Card size="sm">
      <CardHeader class="activity-card-header">
        <CardTitle class="activity-card-title-line">
          {statusIcon(props.run.status)}
          <span class="truncate">{props.run.source}</span>
          <span class="activity-card-meta">
            {props.run.project} · started {new Date(props.run.started_at).toLocaleString()}
          </span>
        </CardTitle>
        <CardAction>{statusBadge(props.run.status)}</CardAction>
      </CardHeader>
      <CardContent class="activity-card-content">
        <div class="activity-card-detail-row">
          <p class="activity-card-summary text-sm text-muted-foreground">
            {describeSyncRunProgress(props.run)}
          </p>
          <div class="activity-card-status-row">
            <Show when={props.run.status === 'running'}>
              <Progress
                value={progress() ?? undefined}
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
    <Card size="sm">
      <CardHeader class="activity-card-header">
        <CardTitle class="activity-card-title-line">
          {statusIcon(props.job.status)}
          <span class="truncate">
            {props.job.source} · {sourceOperationLabel(props.job.operation)}
          </span>
          <span class="activity-card-meta">
            {props.job.project} · started {started().toLocaleString()}
          </span>
        </CardTitle>
        <CardAction>{statusBadge(props.job.status)}</CardAction>
      </CardHeader>
      <CardContent class="activity-card-content">
        <div class="activity-card-detail-row">
          <p class="activity-card-summary text-sm text-muted-foreground">
            {describeSourceJobProgress(props.job)}
          </p>
          <div class="activity-card-status-row">
            <Show when={running()}>
              <Progress
                value={undefined}
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
                variant="outline"
                size="sm"
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
          <details class="activity-card-log rounded-md border p-2 text-xs">
            <summary class="cursor-pointer font-medium">View job log</summary>
            <pre class="mt-2 overflow-auto whitespace-pre-wrap text-muted-foreground">
              {props.job.log}
            </pre>
          </details>
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
    <main id="main-content" class="utility-view m7-utility-view" data-m7-activity-inbox>
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
              <AlertAction>
                <Button variant="outline" size="sm" onClick={props.onRetrySourceJobs}>
                  Retry
                </Button>
              </AlertAction>
            </Show>
          </Alert>
        </Show>
        <Show when={statusError() && props.status}>
          <Alert>
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Showing the last known sync snapshot</AlertTitle>
            <AlertDescription>{statusError()}</AlertDescription>
            <Show when={props.onRetryStatus}>
              <AlertAction>
                <Button variant="outline" size="sm" onClick={props.onRetryStatus}>
                  Retry
                </Button>
              </AlertAction>
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
                <h2 id="m7-sync-attention" class="font-heading text-base font-medium">
                  Sync attention
                </h2>
                <div class="activity-card-grid">
                  <For each={attention()}>{(run) => <SyncActivityCard run={run} />}</For>
                </div>
              </section>
            </Show>
            <Show when={activeJobs().length}>
              <section class="flex flex-col gap-3" aria-labelledby="m7-active-source-jobs">
                <h2 id="m7-active-source-jobs" class="font-heading text-base font-medium">
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
                <h2 id="m7-recent-source-jobs" class="font-heading text-base font-medium">
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
          <Button variant="outline" onClick={props.onOpenSettings}>
            <Settings aria-hidden="true" /> Manage ingestion in settings
          </Button>
        </div>
      </div>
    </main>
  )
}
