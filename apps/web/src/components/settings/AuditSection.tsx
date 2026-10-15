import { Spinner } from '@adea-ai/ui/components/ui/spinner'
import { downloadBlob } from '@adea-ai/ui/lib/download'
import { AlertDescription, Alert } from '@adea-ai/ui/components/ui/alert'
import { Card, CardContent, CardHeader } from '@adea-ai/ui/components/ui/card'
import { CodeBlock } from '@adea-ai/ui/components/ui/code-block'
import { EmptyState } from '@adea-ai/ui/components/ui/empty'
import { ItemGroup } from '@adea-ai/ui/components/ui/item'
import { ScrollArea } from '@adea-ai/ui/components/ui/scroll-area'
import { StatusChip, type StatusTone } from '@adea-ai/ui/components/ui/status-chip'
import { Heading, Text } from '@adea-ai/ui/components/ui/typography'
import { Download, RefreshCw } from 'lucide-solid'
import { createEffect, createSignal, onCleanup } from 'solid-js'

import { getDesktopAudit, getRuntimeAudit } from '../../api'
import type { AuditEvent } from '../../types'
import { SettingsSection } from '@adea-ai/ui/components/composites/settings'
import { ActionButton } from '@adea-ai/ui/components/composites/action-button'

export function AuditSection() {
  const [runtime, setRuntime] = createSignal<AuditEvent[]>([])
  const [desktop, setDesktop] = createSignal<AuditEvent[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  let refreshRequestId = 0
  const refresh = async () => {
    const requestId = ++refreshRequestId
    const [runtimeResult, desktopResult] = await Promise.allSettled([
      getRuntimeAudit(100),
      getDesktopAudit(100),
    ])
    // A manual refresh can overlap the initial request. Never let a slower
    // response replace a newer audit snapshot or clear its error state.
    if (refreshRequestId !== requestId) return
    if (runtimeResult.status === 'fulfilled') setRuntime(runtimeResult.value)
    if (desktopResult.status === 'fulfilled') setDesktop(desktopResult.value)
    const errors = [runtimeResult, desktopResult]
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) =>
        result.reason instanceof Error ? result.reason.message : 'Audit source unavailable'
      )
    // Both endpoints often fail for the same reason; say it once.
    setError([...new Set(errors)].join(' · '))
    setLoading(false)
  }
  createEffect(() => {
    queueMicrotask(() => void refresh())
    return onCleanup(() => {
      refreshRequestId += 1
    })
  })

  // The events already shown here are the redacted, bounded metadata snapshots
  // returned by the runtime and Desktop audit endpoints; this export writes
  // exactly those loaded events to a JSON file and adds nothing else.
  const exportAudit = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      runtime: runtime(),
      desktop: desktop(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    downloadBlob(blob, `cortana-audit-${new Date().toISOString().slice(0, 10)}.json`)
  }
  return (
    <SettingsSection
      bodyLayout="content"
      title="Audit trail"
      description="Bounded metadata-only runtime and Desktop events. Queries, document contents, bearer tokens, and secret values are excluded."
    >
      <div class="source-settings-toolbar">
        <span>
          {runtime().length} runtime · {desktop().length} Desktop events
        </span>
        <div class="service-actions">
          <ActionButton
            tooltip="Reload the bounded runtime and Desktop audit events."
            variant="secondary"
            size="xs"
            disabled={loading()}
            onClick={() => {
              setLoading(true)
              setError('')
              void refresh()
            }}
          >
            {loading() ? (
              <Spinner size="sm" label={false} />
            ) : (
              <RefreshCw size={14} aria-hidden="true" />
            )}
            Refresh
          </ActionButton>
          <ActionButton
            tooltip={
              loading()
                ? 'Wait for the audit events to finish loading before exporting.'
                : 'Download the currently loaded, redacted audit events as JSON.'
            }
            variant="secondary"
            size="xs"
            type="button"
            disabled={loading()}
            onClick={exportAudit}
          >
            <Download size={14} aria-hidden="true" /> Export
          </ActionButton>
        </div>
      </div>
      {error() && (
        <Alert class="safety-note" variant="destructive" role="alert">
          <AlertDescription>{error()}</AlertDescription>
        </Alert>
      )}
      <AuditList
        title="Runtime retrieval"
        detail="Retrieval requests handled by the runtime are recorded here."
        events={runtime()}
      />
      <AuditList
        title="Desktop actions"
        detail="Actions taken in Cortana Desktop are recorded here."
        events={desktop()}
      />
    </SettingsSection>
  )
}
export function AuditList(incoming: { title: string; detail: string; events: AuditEvent[] }) {
  const props = incoming
  return (
    <div class="mt-5 mb-3.5 flex flex-col gap-3">
      <Heading as="h3" size="subsection">
        {props.title}
      </Heading>
      {props.events.length === 0 ? (
        <EmptyState title="No events available." detail={props.detail} headingLevel={4} />
      ) : (
        <ItemGroup listLabel={props.title}>
          {props.events.map((event) => {
            const outcome = auditOutcome(event)
            return (
              // audit events render in fetch order
              <Card size="sm" role="listitem">
                <CardHeader>
                  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <Text variant="strong" class="break-all">
                        {String(event['event'] || event['action'] || 'event')}
                      </Text>
                      {outcome && <StatusChip tone={outcome.tone} label={outcome.label} />}
                    </div>
                    <Text as="time" variant="micro" tone="muted">
                      {auditTime(event)}
                    </Text>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea class="max-h-72" aria-label="Audit event details">
                    <CodeBlock code={JSON.stringify(event, null, 2)} language="json" complete />
                  </ScrollArea>
                </CardContent>
              </Card>
            )
          })}
        </ItemGroup>
      )}
    </div>
  )
}
function auditTime(event: AuditEvent): string {
  if (event['timestamp']) return new Date(String(event['timestamp'])).toLocaleString()
  if (event['at_unix_seconds'])
    return new Date(Number(event['at_unix_seconds']) * 1000).toLocaleString()
  return ''
}
// The outcome is always said in words as well as tone, so it never relies on
// colour alone. Events that report no outcome render no chip.
export function auditOutcome(event: AuditEvent): { tone: StatusTone; label: string } | null {
  if (event['success'] === true) return { tone: 'success', label: 'Succeeded' }
  if (event['success'] === false) return { tone: 'danger', label: 'Failed' }
  if (event['passed'] === true) return { tone: 'success', label: 'Passed' }
  if (event['passed'] === false) return { tone: 'danger', label: 'Failed' }
  const raw = String(event['status'] || event['outcome'] || event['result'] || '')
  if (!raw) return null
  const value = raw.toLowerCase()
  const label = `${raw.charAt(0).toUpperCase()}${raw.slice(1).replaceAll('_', ' ')}`
  if (/^(success|succeeded|completed|passed|ok)$/.test(value)) return { tone: 'success', label }
  if (/^(failure|failed|error|cancelled|canceled|budget_exceeded)$/.test(value))
    return { tone: 'danger', label }
  return { tone: 'neutral', label }
}
