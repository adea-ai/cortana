import {
  AlertTriangle,
  Check,
  CircleStop,
  Download,
  FolderOpen,
  KeyRound,
  LoaderCircle,
  Upload,
} from 'lucide-solid'
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'

import {
  cancelDesktopVaultExport,
  exportDesktopSettings,
  getDesktopVaultExport,
  importDesktopSettings,
  migrateDesktopSecrets,
  openDesktopSecretFile,
  startDesktopVaultExport,
} from '../../api'
import { cn } from '@/lib/utils'

import type { DesktopSettings, DesktopVaultExport } from '../../types'
import { useSettingsConfirm } from './SettingsConfirm'
import { Field, NumberField, SettingsSection, type SettingsSectionProps } from './SettingsLayout'
import {
  SettingsAlert,
  SettingsButton as Button,
  SettingsCheckbox as Checkbox,
  SettingsFieldGroup,
  SettingsInput as Input,
} from './SettingsSurface'

export function AdvancedSettingsSection(props: SettingsSectionProps & { dirty: boolean }) {
  const confirm = useSettingsConfirm()
  const [portableBusy, setPortableBusy] = createSignal<
    'export' | 'import' | 'open-secret' | 'migrate-secrets' | ''
  >('')
  const [portableNotice, setPortableNotice] = createSignal('')
  const [portableError, setPortableError] = createSignal('')
  const [vaultSelected, setVaultSelected] = createSignal(
    new Set(props.settings.workspaces.map((workspace) => workspace.id))
  )
  const [vaultJob, setVaultJob] = createSignal<DesktopVaultExport | null>(null)
  const [vaultError, setVaultError] = createSignal('')
  const setRuntime = (patch: Partial<DesktopSettings['runtime']>) =>
    props.update((current) => ({ ...current, runtime: { ...current.runtime, ...patch } }))

  const vaultJobRunning = () =>
    Boolean(vaultJob() && ['running', 'cancelling'].includes(vaultJob()!.status))

  createEffect(() => {
    const job = vaultJob()
    if (!job || !['running', 'cancelling'].includes(job.status)) return
    let active = true
    const timer = window.setTimeout(async () => {
      try {
        const next = await getDesktopVaultExport(job.id)
        if (active) setVaultJob(next)
      } catch (caught) {
        if (active) {
          setVaultError(caught instanceof Error ? caught.message : 'Vault status unavailable')
        }
      }
    }, 250)
    onCleanup(() => {
      active = false
      window.clearTimeout(timer)
    })
  })

  const startVaultExport = async (dryRun: boolean) => {
    const workspaces = [...vaultSelected()]
    if (!workspaces.length) {
      setVaultError('Select at least one workspace.')
      return
    }
    if (
      !dryRun &&
      !(await confirm(
        `Export ${workspaces.length} selected workspace${workspaces.length === 1 ? '' : 's'} as a derived Obsidian vault?\n\nCortana will replace only a vault it manages, retain the previous complete export, and never ingest edits from the exported Markdown.`
      ))
    ) {
      return
    }
    setVaultError('')
    try {
      const job = await startDesktopVaultExport(workspaces, dryRun)
      if (job) setVaultJob(job)
    } catch (caught) {
      setVaultError(caught instanceof Error ? caught.message : 'Vault export failed')
    }
  }

  const cancelVaultExport = async () => {
    const job = vaultJob()
    if (!job) return
    try {
      setVaultJob(await cancelDesktopVaultExport(job.id))
    } catch (caught) {
      setVaultError(caught instanceof Error ? caught.message : 'Vault cancellation failed')
    }
  }

  const exportSettings = async () => {
    setPortableBusy('export')
    setPortableNotice('')
    setPortableError('')
    try {
      const result = await exportDesktopSettings()
      if (!result) return
      const omitted = result.omitted_external_sources.length
        ? ` Executable connectors omitted: ${result.omitted_external_sources.join(', ')}.`
        : ''
      setPortableNotice(`Redacted settings exported to ${result.path}.${omitted}`)
    } catch (caught) {
      setPortableError(caught instanceof Error ? caught.message : 'Settings export failed')
    } finally {
      setPortableBusy('')
    }
  }

  const importSettings = async () => {
    setPortableBusy('import')
    setPortableNotice('')
    setPortableError('')
    try {
      const result = await importDesktopSettings()
      if (!result) return
      if (
        !(await confirm(
          `Load the validated settings from ${result.path} into this form?\n\nSecret values are never imported. Existing executable connectors are preserved. Saving a changed principal list may remove credentials for principals you remove. Nothing is written until you choose Save changes.`
        ))
      ) {
        return
      }
      props.update((current) => ({ ...current, ...result.settings }))
      const preserved = result.preserved_external_sources.length
        ? ` Preserved executable connectors: ${result.preserved_external_sources.join(', ')}.`
        : ''
      setPortableNotice(`Imported settings are ready for review.${preserved}`)
    } catch (caught) {
      setPortableError(caught instanceof Error ? caught.message : 'Settings import failed')
    } finally {
      setPortableBusy('')
    }
  }

  const openSecretFile = async () => {
    setPortableBusy('open-secret')
    setPortableNotice('')
    setPortableError('')
    try {
      await openDesktopSecretFile()
      setPortableNotice('Opened the active secret file in your default application.')
    } catch (caught) {
      setPortableError(caught instanceof Error ? caught.message : 'Unable to open secret file')
    } finally {
      setPortableBusy('')
    }
  }

  const migrateSecrets = async () => {
    if (props.dirty) return
    if (
      !(await confirm(
        'Move configured secret-file values into platform secure storage? This is explicit and recoverable, removes migrated plaintext values from secrets.env, and never includes secret values in the audit log.'
      ))
    ) {
      return
    }
    setPortableBusy('migrate-secrets')
    setPortableNotice('')
    setPortableError('')
    try {
      const result = await migrateDesktopSecrets()
      setPortableNotice(
        result.migrated === 0
          ? 'Secure storage is already active, or no secret-file values were eligible to migrate.'
          : `Migrated ${result.migrated} secret${result.migrated === 1 ? '' : 's'} to platform secure storage. Plaintext file values were removed.`
      )
    } catch (caught) {
      setPortableError(caught instanceof Error ? caught.message : 'Secure-storage migration failed')
    } finally {
      setPortableBusy('')
    }
  }

  return (
    <SettingsSection
      title="Local runtime"
      description="Storage and audit configuration for this machine. Moving the data directory requires a restart and does not copy existing data."
    >
      <SettingsFieldGroup class="form-grid">
        <Field
          label="Effective secret file"
          hint={
            props.settings.secret_file_managed
              ? 'Owner-only Desktop-managed path for provider, connector, and agent tokens'
              : 'Externally managed runtime.env_file; Desktop will not write this path'
          }
          wide
        >
          <Input
            value={props.settings.secret_file_path}
            title={props.settings.secret_file_path}
            readOnly
            aria-readonly="true"
          />
        </Field>
        <Field label="Data directory" wide>
          <Input
            value={props.settings.runtime.data_dir}
            onChange={(event) => setRuntime({ data_dir: event.target.value })}
            required
          />
        </Field>
        <NumberField
          label="Connector timeout"
          value={props.settings.runtime.connector_timeout_seconds}
          min={1}
          max={86400}
          onChange={(connector_timeout_seconds) => setRuntime({ connector_timeout_seconds })}
        />
        <NumberField
          label="Audit event limit"
          value={props.settings.runtime.audit_max_events}
          min={100}
          max={1000000}
          onChange={(audit_max_events) => setRuntime({ audit_max_events })}
        />
      </SettingsFieldGroup>
      <div class="portable-settings">
        <div>
          <strong>Redacted settings backup</strong>
          <p>
            Export configuration without secret values or executable connector commands. Import
            validates a bounded preview and never writes until you save.
          </p>
        </div>
        <div class="service-actions">
          <Button
            variant="secondary"
            type="button"
            disabled={Boolean(portableBusy()) || props.dirty}
            title={
              props.dirty ? 'Save or discard draft changes before exporting' : 'Export settings'
            }
            onClick={() => void exportSettings()}
          >
            {portableBusy() === 'export' ? (
              <LoaderCircle class="spin" size={14} />
            ) : (
              <Download size={14} />
            )}
            Export
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={Boolean(portableBusy())}
            onClick={() => void importSettings()}
          >
            {portableBusy() === 'import' ? (
              <LoaderCircle class="spin" size={14} />
            ) : (
              <Upload size={14} />
            )}
            Import preview
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={Boolean(portableBusy())}
            onClick={() => void openSecretFile()}
          >
            {portableBusy() === 'open-secret' ? (
              <LoaderCircle class="spin" size={14} />
            ) : (
              <FolderOpen size={14} />
            )}
            Open secret file
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={Boolean(portableBusy()) || props.dirty}
            title={
              props.dirty
                ? 'Save or discard draft changes before migrating secrets'
                : 'Migrate secrets'
            }
            onClick={() => void migrateSecrets()}
          >
            {portableBusy() === 'migrate-secrets' ? (
              <LoaderCircle class="spin" size={14} />
            ) : (
              <KeyRound size={14} />
            )}
            Migrate to secure storage
          </Button>
        </div>
      </div>
      <Show when={portableNotice() || portableError()}>
        <SettingsAlert
          class={cn('safety-note', portableError() && 'error')}
          variant={portableError() ? 'destructive' : 'default'}
          role={portableError() ? 'alert' : 'status'}
        >
          {portableError() ? <AlertTriangle size={16} /> : <Check size={16} />}
          <span>{portableError() || portableNotice()}</span>
        </SettingsAlert>
      </Show>
      <div class="portable-settings">
        <div>
          <strong>Derived Obsidian vault</strong>
          <p>
            Export authorized canonical documents as deterministic Markdown. The vault is a
            read-only projection from Cortana’s perspective and can be removed or rebuilt at any
            time.
          </p>
          <fieldset class="vault-workspace-picker" disabled={vaultJobRunning()}>
            <legend>Workspaces to export</legend>
            <For each={props.settings.workspaces}>
              {(workspace) => (
                <label>
                  <Checkbox
                    checked={vaultSelected().has(workspace.id)}
                    onChange={(event) =>
                      setVaultSelected((current) => {
                        const next = new Set(current)
                        if (event.target.checked) next.add(workspace.id)
                        else next.delete(workspace.id)
                        return next
                      })
                    }
                  />
                  {workspace.name}
                </label>
              )}
            </For>
          </fieldset>
        </div>
        <div class="service-actions">
          <Button
            variant="secondary"
            type="button"
            disabled={props.dirty || vaultJobRunning()}
            title={props.dirty ? 'Save or discard workspace changes first' : 'Preview vault export'}
            onClick={() => void startVaultExport(true)}
          >
            <Download size={14} /> Preview vault export
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={props.dirty || vaultJobRunning()}
            title={
              props.dirty ? 'Save or discard workspace changes first' : 'Export Obsidian vault'
            }
            onClick={() => void startVaultExport(false)}
          >
            {vaultJob()?.status === 'running' ? (
              <LoaderCircle class="spin" size={14} />
            ) : (
              <FolderOpen size={14} />
            )}
            Export vault
          </Button>
          <Show when={vaultJobRunning()}>
            <Button
              variant="danger"
              type="button"
              disabled={vaultJob()!.status === 'cancelling'}
              onClick={() => void cancelVaultExport()}
            >
              <CircleStop size={14} /> Cancel vault export
            </Button>
          </Show>
        </div>
      </div>
      <Show when={vaultJob()}>
        {(job) => (
          <SettingsAlert
            class={cn('safety-note', job().status === 'failed' && 'error')}
            variant={job().status === 'failed' ? 'destructive' : 'default'}
            role={job().status === 'failed' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {job().status === 'failed' ? <AlertTriangle size={16} /> : <Check size={16} />}
            <span>
              {job().status === 'succeeded' && job().report
                ? `${job().dry_run ? 'Previewed' : 'Exported'} ${job().report!.documents} documents; ${job().report!.content_rewrites} content rewrites and ${job().report!.unchanged_documents} unchanged.`
                : `Vault export ${job().phase}: ${job().documents_completed} documents scanned, ${job().files_written} files staged.`}
            </span>
          </SettingsAlert>
        )}
      </Show>
      <Show when={vaultError()}>
        <SettingsAlert class="safety-note error" variant="destructive" role="alert">
          <AlertTriangle size={16} />
          <span>{vaultError()}</span>
        </SettingsAlert>
      </Show>
    </SettingsSection>
  )
}
