import {
  AlertTriangle,
  CircleStop,
  ExternalLink,
  LoaderCircle,
  Play,
  RefreshCw,
} from 'lucide-solid'
import { createEffect, createSignal, onCleanup, type JSX } from 'solid-js'

import {
  cancelDesktopUpdate,
  checkDesktopUpdate,
  getDesktopUpdate,
  installDesktopUpdate,
  openDesktopProject,
} from '../../api'
import type { DesktopUpdate } from '../../types'
import { SafeMarkdown } from './markdown'
import { useSettingsConfirm } from './SettingsConfirm'
import { SettingsSection } from './SettingsLayout'
import { SettingsAlert, SettingsButton as Button, SettingsCard } from './SettingsSurface'
import { useDesktopForeground } from './SettingsWorkflowUtils'

export function UpdatesSection(incoming: {
  desktopUpdate?: DesktopUpdate | null
  onDesktopUpdate?: (update: DesktopUpdate) => void
}) {
  const props = incoming
  const confirm = useSettingsConfirm()
  const foreground = useDesktopForeground()
  const [localUpdate, setLocalUpdate] = createSignal<DesktopUpdate | null>(null)
  const update = () => (props.desktopUpdate === undefined ? localUpdate() : props.desktopUpdate)
  const setUpdate = props.onDesktopUpdate ?? setLocalUpdate
  const [busy, setBusy] = createSignal('')
  const [error, setError] = createSignal('')
  createEffect(() => {
    if ((props.desktopUpdate !== undefined && props.desktopUpdate !== null) || !foreground()) {
      return
    }
    void getDesktopUpdate()
      .then((result) => {
        setUpdate(result)
        if (!result.error) setError('')
        return null
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Updater status unavailable')
      })
  })
  createEffect(() => {
    if (props.desktopUpdate !== undefined || busy() !== 'install' || !foreground()) return
    let requestInFlight = false
    const poll = () => {
      if (requestInFlight) return
      requestInFlight = true
      void getDesktopUpdate()
        .then((result) => {
          setUpdate(result)
          if (!result.error) setError('')
          return null
        })
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : 'Updater status unavailable')
        })
        .finally(() => {
          requestInFlight = false
        })
    }
    const timer = window.setInterval(poll, 400)
    return onCleanup(() => window.clearInterval(timer))
  })
  const check = async () => {
    setBusy('check')
    setError('')
    try {
      setUpdate(await checkDesktopUpdate())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Update check failed')
      try {
        setUpdate(await getDesktopUpdate())
      } catch {
        // Keep the existing snapshot when both the check and status fallback
        // are unavailable; the visible error already explains the failure.
      }
    } finally {
      setBusy('')
    }
  }
  const install = async () => {
    if (!update()?.available_version) return
    if (
      !(await confirm(
        `Install signed Cortana ${update()!.available_version} and restart the Desktop app?\n\nThe native updater will verify the release signature before installation.`
      ))
    ) {
      return
    }
    setBusy('install')
    setError('')
    setUpdate({
      ...update()!,
      phase: 'downloading',
      downloaded_bytes: 0,
      total_bytes: null,
      error: null,
    })
    try {
      setUpdate(await installDesktopUpdate(update()!.available_version!, true))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Update installation failed')
      try {
        setUpdate(await getDesktopUpdate())
      } catch {
        // Keep the last known update state when the updater is unreachable.
      }
    } finally {
      setBusy('')
    }
  }
  const cancel = async () => {
    setError('')
    try {
      setUpdate(await cancelDesktopUpdate())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Update cancellation failed')
    }
  }
  const openProject = async () => {
    setError('')
    try {
      await openDesktopProject()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open the Cortana project page')
    }
  }
  const percent = () =>
    update()?.total_bytes && update()!.total_bytes! > 0
      ? Math.min(100, Math.round((update()!.downloaded_bytes! / update()!.total_bytes!) * 100))
      : null
  const updateInFlight = () =>
    busy() === 'install' ||
    update()?.phase === 'downloading' ||
    update()?.phase === 'installing' ||
    update()?.phase === 'cancelling'
  const canInstall = () =>
    Boolean(update()?.available_version) &&
    !update()?.restart_required &&
    update()?.phase !== 'installed'
  return (
    <SettingsSection
      title="Updates"
      description="Cortana checks the fixed GitHub release feed and verifies signed Tauri artifacts in the native process before installation."
    >
      <SettingsCard class="update-card">
        <div>
          <span class="eyebrow">Installed version</span>
          <strong>{update()?.current_version || 'Checking…'}</strong>
          <small>
            {update()?.phase === 'cancelled'
              ? 'Update cancelled; you can retry when ready'
              : update()?.available_version
                ? `Version ${update()!.available_version} is available`
                : update()?.phase === 'current'
                  ? 'You are up to date'
                  : update()?.phase === 'unavailable'
                    ? 'No signed package is published for this platform'
                    : `Updater status: ${update()?.phase || 'idle'}`}
          </small>
        </div>
        <div class="service-actions">
          {updateInFlight() && (
            <Button
              variant="secondary"
              type="button"
              disabled={update()?.phase === 'cancelling'}
              onClick={() => void cancel()}
            >
              <CircleStop size={14} />
              {update()?.phase === 'cancelling' ? 'Cancelling…' : 'Cancel update'}
            </Button>
          )}
          <Button
            variant="secondary"
            type="button"
            disabled={Boolean(busy()) || updateInFlight()}
            onClick={() => void check()}
          >
            {busy() === 'check' ? <LoaderCircle class="spin" size={14} /> : <RefreshCw size={14} />}
            Check now
          </Button>
          <Button
            variant="primary"
            type="button"
            disabled={!canInstall() || Boolean(busy()) || updateInFlight()}
            onClick={() => void install()}
          >
            {updateInFlight() ? <LoaderCircle class="spin" size={14} /> : <Play size={14} />}
            {update()?.restart_required || update()?.phase === 'installed'
              ? 'Restart required'
              : 'Install and restart'}
          </Button>
        </div>
      </SettingsCard>
      {percent() !== null && (
        <div class="update-progress" role="progressbar" aria-valuenow={percent()!}>
          <i
            style={
              {
                '--update-progress': `${percent()}%`,
              } as JSX.CSSProperties
            }
          />
          <span>{percent()}% downloaded</span>
        </div>
      )}
      {(error() || update()?.error) && (
        <SettingsAlert class="safety-note error" variant="destructive" role="alert">
          <AlertTriangle size={16} /> <span>{error() || update()?.error}</span>
        </SettingsAlert>
      )}
      {update()?.release_notes && (
        <div class="release-notes">
          <h3>Version {update()!.available_version}</h3>
          <SafeMarkdown text={update()!.release_notes!} />
        </div>
      )}
      <div class="release-notes">
        <h3>Installed changelog</h3>
        <SafeMarkdown text={update()?.changelog || 'Loading changelog…'} />
      </div>
      {update() && (
        <Button
          variant="ghost"
          type="button"
          class="link-button"
          onClick={() => void openProject()}
        >
          View Cortana source on GitHub <ExternalLink size={13} />
        </Button>
      )}
    </SettingsSection>
  )
}
