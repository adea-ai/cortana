import { Download, LoaderCircle, RefreshCw } from 'lucide-solid'
import { createEffect, createSignal, onCleanup } from 'solid-js'

import { getDesktopAudit, getRuntimeAudit } from '../../api'
import type { AuditEvent } from '../../types'
import { SettingsSection } from './SettingsLayout'
import { SettingsAlert, SettingsButton as Button } from './SettingsSurface'

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
    setError(errors.join(' · '))
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
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `cortana-audit-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Defer the revoke one tick so the browser can initiate the download
    // before the object URL is torn down.
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  return (
    <SettingsSection
      title="Audit trail"
      description="Bounded metadata-only runtime and Desktop events. Queries, document contents, bearer tokens, and secret values are excluded."
    >
      <div class="source-settings-toolbar">
        <span>
          {runtime().length} runtime · {desktop().length} Desktop events
        </span>
        <div class="service-actions">
          <Button
            variant="compact"
            disabled={loading()}
            onClick={() => {
              setLoading(true)
              setError('')
              void refresh()
            }}
          >
            {loading() ? <LoaderCircle class="spin" size={14} /> : <RefreshCw size={14} />}
            Refresh
          </Button>
          <Button variant="secondary" type="button" disabled={loading()} onClick={exportAudit}>
            <Download size={14} /> Export
          </Button>
        </div>
      </div>
      {error() && (
        <SettingsAlert class="safety-note error" variant="destructive" role="alert">
          {error()}
        </SettingsAlert>
      )}
      <AuditList title="Runtime retrieval" events={runtime()} />
      <AuditList title="Desktop actions" events={desktop()} />
    </SettingsSection>
  )
}
function AuditList(incoming: { title: string; events: AuditEvent[] }) {
  const props = incoming
  return (
    <div class="audit-list">
      <h3>{props.title}</h3>
      {props.events.length === 0 ? (
        <p>No events available.</p>
      ) : (
        props.events.map((event) => (
          // audit events render in fetch order
          <article>
            <strong class={`audit-event-title ${auditOutcome(event)}`}>
              {String(event['event'] || event['action'] || 'event')}
            </strong>
            <time>
              {event['timestamp']
                ? new Date(String(event['timestamp'])).toLocaleString()
                : event['at_unix_seconds']
                  ? new Date(Number(event['at_unix_seconds']) * 1000).toLocaleString()
                  : ''}
            </time>
            <pre>{JSON.stringify(event, null, 2)}</pre>
          </article>
        ))
      )}
    </div>
  )
}
function auditOutcome(event: AuditEvent): 'success' | 'failure' | 'neutral' {
  if (event['success'] === true || event['passed'] === true) return 'success'
  if (event['success'] === false || event['passed'] === false) return 'failure'
  const value = String(event['status'] || event['outcome'] || event['result'] || '').toLowerCase()
  if (/^(success|succeeded|completed|passed|ok)$/.test(value)) return 'success'
  if (/^(failure|failed|error|cancelled|canceled|budget_exceeded)$/.test(value)) return 'failure'
  return 'neutral'
}
