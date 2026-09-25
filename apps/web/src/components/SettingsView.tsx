import {
  AlertTriangle,
  Check,
  CircleStop,
  Download,
  LoaderCircle,
  Play,
  RefreshCw,
  Save,
  Settings2,
  Upload,
  X,
} from 'lucide-solid'
import {
  lazy,
  Suspense,
  Switch,
  Match,
  Show,
  createEffect,
  createSignal,
  mergeProps,
  onCleanup,
  For,
} from 'solid-js'
import { cn } from '../lib/utils'
import { AsyncButton } from './cortana/async-button'
import { Toaster } from './shadcn/sonner'
import { normalizeProviderUrl, type ProviderModelsState } from './settings/providerUtils'
import { SettingsConfirmProvider, useSettingsConfirm } from './settings/SettingsConfirm'
import {
  referencedSecretNames,
  validateSourceIdentityScopes,
} from './settings/SettingsSourceIdentity'
import { StatusGlyph } from './settings/SettingsWorkflowShared'
import { useDesktopForeground } from './settings/SettingsWorkflowUtils'
import { NumberField, SettingsSection } from './settings/SettingsLayout'
import {
  SettingsAlert,
  SettingsButton as Button,
  SettingsCard,
  SettingsFieldGroup,
  SettingsSwitch,
  SettingsSurfaceProvider,
} from './settings/SettingsSurface'
import {
  cancelDesktopInstaller,
  getDesktopInstaller,
  getDesktopInfo,
  listDesktopProviderModels,
  getDesktopSchedule,
  getDesktopServices,
  getDesktopSettings,
  installDesktopServices,
  installDesktopSyncService,
  migrateDesktopEmbeddingGeneration,
  isDesktopApp,
  saveDesktopSettings,
  saveDesktopSchedule,
  scanDesktopReadiness,
  setDesktopAutostart,
  startDesktopInstaller,
  runDesktopServiceAction,
  runDesktopServicesActionAll,
  backupDesktopDatabase,
  restoreDesktopDatabase,
} from '../api'
import { buildSetupSteps } from '../setup'
import { type ProviderModelKind } from '../types'
import type {
  DesktopInstallJob,
  DesktopInfo,
  DesktopReadiness,
  DesktopReadinessActivity,
  DesktopServiceActivity,
  DesktopServiceReport,
  DesktopDatabaseActionResult,
  DesktopSchedule,
  DesktopSettings,
  DesktopSettingsUpdate,
  DesktopSourceJob,
  DesktopUpdate,
  SourceSettings,
} from '../types'
const AdvancedSettingsSection = lazy(() =>
  import('./settings/AdvancedSettingsSection').then((module) => ({
    default: module.AdvancedSettingsSection,
  }))
)
const SourcesSection = lazy(() =>
  import('./settings/SourceSettingsWorkflow').then((module) => ({
    default: module.SourcesSection,
  }))
)
const UpdatesSection = lazy(() =>
  import('./settings/UpdatesSection').then((module) => ({ default: module.UpdatesSection }))
)
const AccessSection = lazy(() =>
  import('./settings/AccessSection').then((module) => ({ default: module.AccessSection }))
)
const AuditSection = lazy(() =>
  import('./settings/AuditSection').then((module) => ({ default: module.AuditSection }))
)
const WorkspaceSection = lazy(() =>
  import('./settings/WorkspaceSection').then((module) => ({ default: module.WorkspaceSection }))
)
const NativeMemorySection = lazy(() =>
  import('./settings/NativeMemorySection').then((module) => ({
    default: module.NativeMemorySection,
  }))
)
const EmbeddingSection = lazy(() =>
  import('./settings/ProviderSections').then((module) => ({ default: module.EmbeddingSection }))
)
const QuerySection = lazy(() =>
  import('./settings/ProviderSections').then((module) => ({ default: module.QuerySection }))
)
const IngestionSection = lazy(() =>
  import('./settings/IngestionSection').then((module) => ({ default: module.IngestionSection }))
)
type Section =
  | 'readiness'
  | 'services'
  | 'updates'
  | 'access'
  | 'audit'
  | 'workspaces'
  | 'sources'
  | 'embedding'
  | 'query'
  | 'memory'
  | 'ingestion'
  | 'advanced'
const SETTINGS_NAV_PRIMARY_SECTIONS: Section[] = ['services', 'workspaces', 'sources', 'readiness']
const SETTINGS_NAV_SECONDARY_SECTIONS: Section[] = [
  'updates',
  'access',
  'audit',
  'embedding',
  'query',
  'ingestion',
  'advanced',
]
function SettingsViewContent(incoming: {
  /** Shell-owned settings snapshot. Standalone renders fetch their own copy. */
  desktopSettings?: DesktopSettings
  /** Report a standalone settings load back to the Desktop shell. */
  onLoaded?: (settings: DesktopSettings) => void
  onSaved: (settings: DesktopSettings) => void
  onDirtyChange?: (dirty: boolean) => void
  initialSection?: Section
  onJob?: (job: DesktopSourceJob) => void
  /**
   * Shared snapshots from the shell-level source-job poller. Standalone
   * renders (for example the web fallback and focused tests) omit this prop
   * and keep the local observer below.
   */
  sourceJobs?: DesktopSourceJob[]
  /**
   * Optional shell-owned installer state. The app shell supplies this so an
   * install remains observable while SettingsView is unmounted. Standalone
   * renders keep the local state below.
   */
  installerJob?: DesktopInstallJob | null
  onInstallerJob?: (job: DesktopInstallJob | null) => void
  /** Optional shell-owned readiness snapshot shared across Settings mounts. */
  readiness?: DesktopReadiness | null
  onReadiness?: (readiness: DesktopReadiness | null) => void
  readinessActivity?: DesktopReadinessActivity | null
  onReadinessScan?: () => Promise<DesktopReadiness>
  /** Optional shell-owned updater snapshot shared across Settings mounts. */
  desktopUpdate?: DesktopUpdate | null
  onDesktopUpdate?: (update: DesktopUpdate) => void
  /** Shell-owned service status shared with the tray/health indicator. */
  services?: DesktopServiceReport | null
  onServices?: (report: DesktopServiceReport) => void
  servicesError?: string
  onServicesError?: (error: string) => void
  desktopInfo?: DesktopInfo | null
  onDesktopInfo?: (info: DesktopInfo) => void
  /** Shell-owned service action status shared across Settings mounts. */
  serviceActivity?: DesktopServiceActivity | null
  onServiceActivity?: (activity: DesktopServiceActivity | null) => void
}) {
  const props = mergeProps(
    {
      initialSection: 'readiness' as Section,
    },
    incoming
  )
  const confirm = useSettingsConfirm()
  // The draft stays a signal: it is seeded from and compared against the
  // shell-owned desktopSettings object, and a store would write leaf edits
  // into that shared object. A draft owned by the store would need a deep
  // copy on every external adoption, which is a worse trade-off here.
  const [settings, setSettings] = createSignal<DesktopSettings | null>(
    props.desktopSettings ?? null
  )
  const [section, setSection] = createSignal<Section>(props.initialSection)
  const [secretValues, setSecretValues] = createSignal<Record<string, string>>({})
  const [clearedSecrets, setClearedSecrets] = createSignal<Set<string>>(new Set())
  const [saving, setSaving] = createSignal(false)
  const [error, setError] = createSignal('')
  const [saved, setSaved] = createSignal(false)
  const [dirty, setDirty] = createSignal(false)
  const [localReadiness, setLocalReadiness] = createSignal<DesktopReadiness | null>(null)
  const setupReadiness = () => (props.readiness === undefined ? localReadiness() : props.readiness)
  const setSetupReadiness = props.onReadiness ?? setLocalReadiness
  const [localInstallerJob, setLocalInstallerJob] = createSignal<DesktopInstallJob | null>(null)
  const installerJob = () =>
    props.installerJob === undefined ? localInstallerJob() : props.installerJob
  const setInstallerJob = props.onInstallerJob ?? setLocalInstallerJob
  let componentMounted = true
  onCleanup(() => {
    componentMounted = false
  })
  const settingsNavRef = {
    current: null as HTMLElement | null,
  }
  // Track the last shell snapshot actually adopted by this draft. The shell
  // can deliver the same prop again while a save is settling; re-applying it
  // whenever `dirty` changes would overwrite a just-saved draft with that
  // stale snapshot. Defer newer snapshots while dirty and adopt them once the
  // draft is clean.
  let appliedExternalSettings = props.desktopSettings
  const [providerModels, setProviderModels] = createSignal<ProviderModelsState[]>([])
  const [modelsLoading, setModelsLoading] = createSignal<ProviderModelKind | null>(null)
  const [modelsError, setModelsError] = createSignal<Record<ProviderModelKind, string>>({
    embedding: '',
    query: '',
  })
  const applyLoadedSettings = (next: DesktopSettings) => {
    setSettings(next)
    props.onLoaded?.(next)
  }

  /**
   * Fetch the models advertised by the configured provider through the
   * bundled CLI. The catalog is applied only when the provider endpoint,
   * mode, and API key variable are unchanged since the fetch started, so a
   * stale list can never be attached to a different provider.
   */
  const refreshProviderModels = async (kind: ProviderModelKind) => {
    const current = settings()
    if (!current) return
    const provider = kind === 'embedding' ? current.embedding : current.query
    const captured = {
      provider: normalizeProviderUrl(provider.base_url),
      mode: provider.provider,
      key_env: provider.api_key_env,
    }
    setModelsLoading(kind)
    setModelsError({
      embedding: '',
      query: '',
    })
    try {
      const list = await listDesktopProviderModels(kind)
      if (!componentMounted) return
      const live = settings()
      if (!live) return
      const liveProvider = kind === 'embedding' ? live.embedding : live.query
      if (
        normalizeProviderUrl(liveProvider.base_url) !== captured.provider ||
        liveProvider.provider !== captured.mode ||
        liveProvider.api_key_env !== captured.key_env
      ) {
        setModelsError((previous) => ({
          ...previous,
          [kind]: 'Provider endpoint changed while refreshing; run refresh again.',
        }))
        return
      }
      setProviderModels((existing) => [
        ...existing.filter((entry) => entry.kind !== kind),
        {
          kind,
          provider: list.provider,
          mode: captured.mode,
          key_env: captured.key_env,
          models: list.models,
          truncated: list.truncated,
        },
      ])
    } catch (caught) {
      if (!componentMounted) return
      setModelsError((previous) => ({
        ...previous,
        [kind]: caught instanceof Error ? caught.message : 'Unable to refresh provider models',
      }))
    } finally {
      if (componentMounted) setModelsLoading(null)
    }
  }

  /** Advertised catalog for a kind, or null when unavailable or stale. */
  const advertisedModelsFor = (kind: ProviderModelKind) => {
    const entry = providerModels().find((candidate) => candidate.kind === kind)
    if (!entry || entry.models.length === 0 || !settings()!) return null
    const provider = kind === 'embedding' ? settings()!.embedding : settings()!.query
    if (
      normalizeProviderUrl(provider.base_url) !== entry.provider ||
      provider.provider !== entry.mode ||
      provider.api_key_env !== entry.key_env
    ) {
      return null
    }
    return entry
  }
  createEffect(() => {
    if (props.desktopSettings) {
      // The shell owns the saved snapshot. Do not replace an in-progress local
      // draft, or re-apply the same stale object when a save clears `dirty`.
      // A new object is adopted once the draft is clean; this preserves parent
      // updates that arrived while the operator was editing.
      if (dirty() || appliedExternalSettings === props.desktopSettings) return
      appliedExternalSettings = props.desktopSettings
      setSettings(props.desktopSettings)
      return
    }
    appliedExternalSettings = undefined
    if (!isDesktopApp) return
    void getDesktopSettings()
      .then(applyLoadedSettings)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Unable to load settings')
      )
  })
  // The shell can retarget the visible section (for example a status-bar
  // indicator opening Services) while Settings stays mounted. A component
  // body check would only run once, so track the handoff in an effect.
  let previousInitialSection = props.initialSection
  createEffect(() => {
    const next = props.initialSection
    if (next === previousInitialSection) return
    previousInitialSection = next
    setSection(next)
  })
  createEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    if (!window.matchMedia('(max-width: 799px)').matches) return
    const navigation = settingsNavRef.current
    const active = navigation?.querySelector<HTMLElement>('.settings-nav-item.active')
    if (navigation && active) navigation.scrollLeft = Math.max(0, active.offsetLeft - 10)
  })
  createEffect(() => {
    props.onDirtyChange?.(dirty())
  })

  // Restarts the affected core services in the background after a save that
  // reports restart_required. Success clears the pending-restart notice;
  // failure keeps it visible with an explicit recovery action instead of
  // leaving the operator guessing which service needs attention.
  const restartServices = (next: DesktopSettings) => {
    props.onServiceActivity?.({
      target: 'core services',
      action: 'restart',
      status: 'running',
      detail: null,
    })
    void runDesktopServicesActionAll('restart')
      .then(() => {
        if (!componentMounted) return
        props.onServiceActivity?.({
          target: 'core services',
          action: 'restart',
          status: 'succeeded',
          detail: null,
        })
        const cleared = {
          ...next,
          restart_required: false,
        }
        setSettings(cleared)
        props.onSaved(cleared)
        setSaved(false)
        return null
      })
      .catch((caught: unknown) => {
        if (!componentMounted) return
        props.onServiceActivity?.({
          target: 'core services',
          action: 'restart',
          status: 'failed',
          detail: caught instanceof Error ? caught.message : 'Core services restart failed',
        })
      })
  }
  const restartAfterSaveIfNeeded = (next: DesktopSettings) => {
    if (!next.restart_required) return
    restartServices(next)
  }
  const update = (change: (draft: DesktopSettings) => DesktopSettings) => {
    setSettings((current) => (current ? change(current) : current))
    setSaved(false)
    setDirty(true)
  }
  const referencedSecretIdentityKey = () =>
    settings()!
      ? // oxlint-disable-next-line unicorn/no-array-sort -- stable ES2020-compatible copy
        Array.from(referencedSecretNames(settings()!)).sort().join('\n')
      : ''
  const [previousSecretIdentityKey, setPreviousSecretIdentityKey] = createSignal(
    referencedSecretIdentityKey()
  )
  createEffect(() => {
    const nextKey = referencedSecretIdentityKey()
    if (nextKey === previousSecretIdentityKey()) return
    setPreviousSecretIdentityKey(nextKey)
    const referenced = new Set(nextKey.split('\n').filter(Boolean))
    setSecretValues((current) =>
      Object.fromEntries(Object.entries(current).filter(([name]) => referenced.has(name)))
    )
    setClearedSecrets(
      (current) => new Set(Array.from(current).filter((name) => referenced.has(name)))
    )
  })
  const stageSecrets = (values: Record<string, string>) => {
    setSecretValues(values)
    setClearedSecrets((current) => {
      const next = new Set(current)
      Object.entries(values).forEach(([name, value]) => {
        if (value.length > 0) next.delete(name)
      })
      return next
    })
    setDirty(true)
    setSaved(false)
  }
  const retrySettingsLoad = () => {
    setError('')
    void getDesktopSettings()
      .then(applyLoadedSettings)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Unable to load settings')
      )
  }
  const discard = async () => {
    if (!dirty() || saving()) return
    if (!(await confirm('Discard unsaved Cortana settings changes?'))) return
    setSaving(true)
    setError('')
    try {
      const next = await getDesktopSettings()
      applyLoadedSettings(next)
      setSecretValues({})
      setClearedSecrets(new Set<string>())
      setSaved(false)
      setDirty(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to discard settings changes')
    } finally {
      setSaving(false)
    }
  }
  async function submit(event: SubmitEvent) {
    event.preventDefault()
    // Enter can submit a form even when the visible Save button is disabled.
    // Avoid creating a no-op settings audit event or touching secrets when
    // there is no draft to persist.
    if (!settings()! || !dirty() || saving()) return
    const sourceIdentityError = validateSourceIdentityScopes(settings()!.sources)
    if (sourceIdentityError) {
      setError(sourceIdentityError)
      return
    }
    setSaving(true)
    setError('')
    try {
      const referencedSecrets = referencedSecretNames(settings()!)
      const payload: DesktopSettingsUpdate = {
        workspaces: settings()!.workspaces,
        sources: settings()!.sources,
        auth_principals: settings()!.auth_principals,
        embedding: settings()!.embedding,
        query: settings()!.query,
        memory: settings()!.memory,
        ingestion: settings()!.ingestion,
        runtime: settings()!.runtime,
        secrets: [
          ...Object.entries(secretValues())
            .filter(
              ([name, value]) =>
                referencedSecrets.has(name) && value.length > 0 && !clearedSecrets().has(name)
            )
            .map(([name, value]) => ({
              name,
              value,
            })),
          ...Array.from(clearedSecrets())
            .filter((name) => referencedSecrets.has(name))
            .map((name) => ({
              name,
              clear: true,
            })),
        ],
      }
      const next = await saveDesktopSettings(payload)
      setSettings(next)
      setSecretValues({})
      setClearedSecrets(new Set<string>())
      setSaved(true)
      setDirty(false)
      props.onSaved(next)
      restartAfterSaveIfNeeded(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save settings')
    } finally {
      setSaving(false)
    }
  }
  async function persistConnectedSources(sources: SourceSettings[]): Promise<DesktopSettings> {
    if (!settings()! || dirty() || saving()) {
      throw new Error('Save or discard current settings changes before connecting a source.')
    }
    setSaving(true)
    setError('')
    try {
      const next = await saveDesktopSettings({
        workspaces: settings()!.workspaces,
        sources,
        auth_principals: settings()!.auth_principals,
        embedding: settings()!.embedding,
        query: settings()!.query,
        memory: settings()!.memory,
        ingestion: settings()!.ingestion,
        runtime: settings()!.runtime,
        secrets: [],
      })
      setSettings(next)
      setSaved(true)
      setDirty(false)
      props.onSaved(next)
      restartAfterSaveIfNeeded(next)
      return next
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the connected source')
      throw caught
    } finally {
      setSaving(false)
    }
  }
  // Component bodies run once under Solid, so React-style early returns must
  // be reactive branches: render the unavailable and loading states through
  // Switch/Match instead of gated `return` statements.
  const restartFailed = () =>
    Boolean(settings()?.restart_required) && props.serviceActivity?.status === 'failed'
  return (
    <Switch>
      <Match when={!isDesktopApp && !props.desktopSettings}>
        <SettingsSurfaceProvider>
          <main id="main-content" class="settings-view settings-unavailable">
            <Settings2 size={34} />
            <h1>Desktop settings</h1>
            <p>
              Install Cortana Desktop to manage local models, secrets, workspaces, and services.
            </p>
          </main>
        </SettingsSurfaceProvider>
      </Match>
      <Match when={!settings()}>
        <SettingsSurfaceProvider>
          <main id="main-content" class="settings-view settings-unavailable">
            <Settings2 size={34} />
            <h1 role={error() ? 'alert' : 'status'}>{error() || 'Loading local settings…'}</h1>
            {error() && (
              <Button variant="secondary" onClick={retrySettingsLoad}>
                <RefreshCw size={15} /> Retry settings
              </Button>
            )}
          </main>
        </SettingsSurfaceProvider>
      </Match>
      <Match when={true}>
        <SettingsSurfaceProvider>
          <main id="main-content" class="settings-view">
            <header class="settings-header">
              <div>
                <span class="eyebrow">
                  {settings()!.needs_setup ? 'Guided setup' : 'Control plane'}
                </span>
                <h1>Settings</h1>
                <p>
                  Changes are written locally and audited. Secret values never return to this
                  window.
                </p>
              </div>
              <div class="settings-header-actions">
                {dirty() && (
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={saving()}
                    onClick={() => void discard()}
                  >
                    <X size={15} /> Discard
                  </Button>
                )}
                <AsyncButton
                  variant="default"
                  type="submit"
                  form="settings-form"
                  busy={saving()}
                  disabled={!dirty()}
                  busyLabel="Saving…"
                  title={dirty() ? undefined : 'Make a change before saving'}
                >
                  <Save size={16} /> Save changes
                </AsyncButton>
              </div>
            </header>
            {settings()!.needs_setup && (
              <SetupGuide
                settings={settings()!}
                readiness={setupReadiness()}
                dirty={dirty()}
                onOpen={setSection}
              />
            )}
            <div class="settings-layout">
              <nav
                ref={(el) => (settingsNavRef.current = el)}
                class="settings-nav"
                aria-label="Settings sections"
              >
                <For each={SETTINGS_NAV_PRIMARY_SECTIONS}>
                  {(item) => (
                    <Button
                      variant="ghost"
                      type="button"
                      class={cn('settings-nav-item', section() === item && 'active')}
                      aria-current={section() === item ? 'page' : undefined}
                      onClick={() => setSection(item)}
                    >
                      {item[0].toUpperCase() + item.slice(1)}
                    </Button>
                  )}
                </For>
                <div class="settings-nav-divider" aria-hidden="true" />
                <For each={SETTINGS_NAV_SECONDARY_SECTIONS}>
                  {(item) => (
                    <Button
                      variant="ghost"
                      type="button"
                      class={cn('settings-nav-item', section() === item && 'active')}
                      aria-current={section() === item ? 'page' : undefined}
                      onClick={() => setSection(item)}
                    >
                      {item[0].toUpperCase() + item.slice(1)}
                    </Button>
                  )}
                </For>
                <Button
                  variant="ghost"
                  type="button"
                  class={cn('settings-nav-item', section() === 'memory' && 'active')}
                  aria-current={section() === 'memory' ? 'page' : undefined}
                  onClick={() => setSection('memory')}
                >
                  Memory
                </Button>
                <div class="settings-paths">
                  <span>Config</span>
                  <code title={settings()!.config_path}>{settings()!.config_path}</code>
                </div>
              </nav>
              <form id="settings-form" class="settings-form" onSubmit={submit}>
                {section() === 'readiness' && (
                  <ReadinessSection
                    autoScan={settings()!.needs_setup}
                    readiness={setupReadiness()}
                    onResult={setSetupReadiness}
                    onOpenServices={() => setSection('services')}
                    job={installerJob()}
                    onJob={setInstallerJob}
                    readinessActivity={props.readinessActivity}
                    onReadinessScan={props.onReadinessScan}
                    pollInstaller={props.installerJob === undefined}
                  />
                )}
                {section() === 'services' && (
                  <ServicesSection
                    settings={settings()!}
                    dirty={dirty()}
                    services={props.services}
                    onServices={props.onServices}
                    servicesError={props.servicesError}
                    onServicesError={props.onServicesError}
                    desktopInfo={props.desktopInfo}
                    onDesktopInfo={props.onDesktopInfo}
                    serviceActivity={props.serviceActivity}
                    onServiceActivity={props.onServiceActivity}
                    onRestarted={() =>
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              restart_required: false,
                            }
                          : current
                      )
                    }
                  />
                )}
                {section() === 'updates' && (
                  <Suspense fallback={<p role="status">Loading update settings…</p>}>
                    <UpdatesSection
                      desktopUpdate={props.desktopUpdate}
                      onDesktopUpdate={props.onDesktopUpdate}
                    />
                  </Suspense>
                )}
                {section() === 'access' && (
                  <Suspense fallback={<p role="status">Loading access settings…</p>}>
                    <AccessSection
                      settings={settings()!}
                      update={update}
                      secretValues={secretValues()}
                      onSecret={stageSecrets}
                      clearedSecrets={clearedSecrets()}
                      onClearSecret={(name) => {
                        setClearedSecrets((current) => new Set(current).add(name))
                        setSecretValues((current) => ({
                          ...current,
                          [name]: '',
                        }))
                        setDirty(true)
                        setSaved(false)
                      }}
                    />
                  </Suspense>
                )}
                {section() === 'audit' && (
                  <Suspense fallback={<p role="status">Loading audit trail…</p>}>
                    <AuditSection />
                  </Suspense>
                )}
                {section() === 'workspaces' && (
                  <Suspense fallback={<p role="status">Loading workspace settings…</p>}>
                    <WorkspaceSection settings={settings()!} update={update} />
                  </Suspense>
                )}
                {section() === 'sources' && (
                  <Suspense
                    fallback={
                      <SettingsSection
                        title="Ingestion sources"
                        description="Loading source workflows…"
                      >
                        <p role="status">Loading source configuration…</p>
                      </SettingsSection>
                    }
                  >
                    <SourcesSection
                      settings={settings()!}
                      update={update}
                      canValidate={!dirty() && !saving()}
                      secretValues={secretValues()}
                      onSecret={stageSecrets}
                      clearedSecrets={clearedSecrets()}
                      onClearSecret={(name) => {
                        setClearedSecrets((current) => new Set(current).add(name))
                        setSecretValues((current) => ({
                          ...current,
                          [name]: '',
                        }))
                        setDirty(true)
                        setSaved(false)
                      }}
                      onJob={props.onJob}
                      sourceJobs={props.sourceJobs}
                      onPersistSources={persistConnectedSources}
                    />
                  </Suspense>
                )}
                {section() === 'embedding' && (
                  <Suspense fallback={<p role="status">Loading embedding settings…</p>}>
                    <EmbeddingSection
                      settings={settings()!}
                      secretValues={secretValues()}
                      onSecret={stageSecrets}
                      clearedSecrets={clearedSecrets()}
                      onClearSecret={(name) => {
                        setClearedSecrets((current) => new Set(current).add(name))
                        setSecretValues((current) => ({
                          ...current,
                          [name]: '',
                        }))
                        setDirty(true)
                        setSaved(false)
                      }}
                      update={update}
                      advertisedModels={
                        advertisedModelsFor('embedding')?.models.map((model) => ({
                          value: model.id,
                          label: model.id,
                        })) ?? null
                      }
                      modelsLoading={modelsLoading() === 'embedding'}
                      modelsError={modelsError().embedding}
                      modelsTruncated={advertisedModelsFor('embedding')?.truncated ?? false}
                      onRefreshModels={() => void refreshProviderModels('embedding')}
                    />
                  </Suspense>
                )}
                {section() === 'query' && (
                  <Suspense fallback={<p role="status">Loading query settings…</p>}>
                    <QuerySection
                      settings={settings()!}
                      secrets={settings()!.secrets}
                      secretValues={secretValues()}
                      onSecret={stageSecrets}
                      clearedSecrets={clearedSecrets()}
                      onClearSecret={(name) => {
                        setClearedSecrets((current) => new Set(current).add(name))
                        setSecretValues((current) => ({
                          ...current,
                          [name]: '',
                        }))
                        setDirty(true)
                        setSaved(false)
                      }}
                      update={update}
                      advertisedModels={
                        advertisedModelsFor('query')?.models.map((model) => ({
                          value: model.id,
                          label: model.id,
                        })) ?? null
                      }
                      modelsLoading={modelsLoading() === 'query'}
                      modelsError={modelsError().query}
                      modelsTruncated={advertisedModelsFor('query')?.truncated ?? false}
                      onRefreshModels={() => void refreshProviderModels('query')}
                    />
                  </Suspense>
                )}
                {section() === 'memory' && (
                  <Suspense fallback={<p role="status">Loading memory settings…</p>}>
                    <NativeMemorySection settings={settings()!} update={update} />
                  </Suspense>
                )}
                {section() === 'ingestion' && (
                  <Suspense fallback={<p role="status">Loading ingestion settings…</p>}>
                    <IngestionSection settings={settings()!} update={update} />
                  </Suspense>
                )}
                {section() === 'advanced' && (
                  <Suspense
                    fallback={
                      <SettingsSection
                        title="Local runtime"
                        description="Loading runtime controls…"
                      >
                        <p role="status">Loading local runtime settings…</p>
                      </SettingsSection>
                    }
                  >
                    <AdvancedSettingsSection
                      settings={settings()!}
                      update={update}
                      dirty={dirty()}
                    />
                  </Suspense>
                )}
              </form>
            </div>
            {(error() || saved() || settings()!.restart_required) && (
              <SettingsAlert
                class={cn('settings-banner', (error() || restartFailed()) && 'error')}
                variant={error() || restartFailed() ? 'destructive' : 'default'}
                role={error() || restartFailed() ? 'alert' : 'status'}
              >
                {error() || restartFailed() ? <AlertTriangle size={16} /> : <Check size={16} />}
                {error() ||
                  (restartFailed()
                    ? `Settings saved, but the service restart failed${props.serviceActivity?.detail ? `: ${props.serviceActivity.detail}` : '.'}`
                    : settings()!.restart_required && props.serviceActivity?.status === 'running'
                      ? 'Settings saved. Restarting affected services in the background…'
                      : saved() && settings()!.restart_required
                        ? 'Settings saved. A service restart is still required.'
                        : saved()
                          ? 'Settings saved.'
                          : 'A service restart is still required.')}
                {!error() &&
                  settings()!.restart_required &&
                  props.serviceActivity?.status !== 'running' && (
                    <>
                      {restartFailed() && (
                        <Button
                          variant="secondary"
                          type="button"
                          onClick={() => restartServices(settings()!)}
                        >
                          <RefreshCw size={14} /> Retry restart
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => setSection('services')}
                      >
                        Open services
                      </Button>
                    </>
                  )}
              </SettingsAlert>
            )}
          </main>
        </SettingsSurfaceProvider>
      </Match>
    </Switch>
  )
}
type SettingsViewProps = Parameters<typeof SettingsViewContent>[0]
export function SettingsView(props: SettingsViewProps) {
  return (
    <SettingsSurfaceProvider>
      <SettingsConfirmProvider>
        <SettingsViewContent {...props} />
      </SettingsConfirmProvider>
      <Toaster position="bottom-right" closeButton />
    </SettingsSurfaceProvider>
  )
}
function SetupGuide(incoming: {
  settings: DesktopSettings
  readiness: DesktopReadiness | null
  dirty: boolean
  onOpen: (section: Section) => void
}) {
  const props = incoming
  const steps = buildSetupSteps(props.settings, props.readiness)
  const complete = steps.filter((step) => step.complete).length
  return (
    <section class="setup-guide" aria-label="Guided setup progress">
      <div class="setup-guide-heading">
        <div>
          <span class="eyebrow">First launch</span>
          <strong>Set up Cortana safely</strong>
          <p>
            Review each step, then save. The guide itself never starts ingestion; recurring sync is
            a separate validation-gated action in Services.
          </p>
        </div>
        <span>
          {complete} of {steps.length} ready
        </span>
      </div>
      <div class="setup-steps">
        <For each={steps}>
          {(step, index) => (
            <Button
              variant="ghost"
              type="button"
              class={cn(step.complete && 'complete')}
              onClick={() => props.onOpen(step.section)}
            >
              <i>{step.complete ? <Check size={13} /> : index() + 1}</i>
              <span>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </span>
            </Button>
          )}
        </For>
      </div>
      <p class="setup-save-state">
        {props.dirty
          ? 'Unsaved setup changes are ready for review.'
          : 'The Save changes button creates an owner-only configuration with a rollback copy.'}
      </p>
    </section>
  )
}
function ServicesSection(incoming: {
  settings: DesktopSettings
  dirty: boolean
  services?: DesktopServiceReport | null
  onServices?: (report: DesktopServiceReport) => void
  servicesError?: string
  onServicesError?: (error: string) => void
  desktopInfo?: DesktopInfo | null
  onDesktopInfo?: (info: DesktopInfo) => void
  serviceActivity?: DesktopServiceActivity | null
  onServiceActivity?: (activity: DesktopServiceActivity | null) => void
  onRestarted?: () => void
}) {
  const props = incoming
  const confirm = useSettingsConfirm()
  const foreground = useDesktopForeground()
  const [localReport, setLocalReport] = createSignal<DesktopServiceReport | null>(null)
  const report = () => (props.services === undefined ? localReport() : props.services)
  const setReport = props.onServices ?? setLocalReport
  const [localInfo, setLocalInfo] = createSignal<DesktopInfo | null>(null)
  const info = () => (props.desktopInfo === undefined ? localInfo() : props.desktopInfo)
  const setInfo = props.onDesktopInfo ?? setLocalInfo
  const [busy, setBusy] = createSignal('')
  const [localError, setLocalError] = createSignal('')
  const [schedule, setSchedule] = createSignal<DesktopSchedule | null>(
    isDesktopApp
      ? null
      : {
          sync_interval_seconds: 3600,
          backup_interval_seconds: 86400,
        }
  )
  const [scheduleDraft, setScheduleDraft] = createSignal<DesktopSchedule | null>(schedule()!)
  const [scheduleError, setScheduleError] = createSignal('')
  const [scheduleSaving, setScheduleSaving] = createSignal(false)
  const [scheduleApplyPending, setScheduleApplyPending] = createSignal(false)
  const [databaseBusy, setDatabaseBusy] = createSignal<'backup' | 'restore' | ''>('')
  const [databaseResult, setDatabaseResult] = createSignal<DesktopDatabaseActionResult | null>(null)
  const [databaseError, setDatabaseError] = createSignal('')
  const error = () => localError() || props.servicesError || ''
  let refreshInFlight = false
  let serviceActionInFlight = false
  let mounted = true
  onCleanup(() => {
    mounted = false
  })
  let servicesRequestId = 0
  const isFreshServicesRequest = (requestId: number) => mounted && requestId === servicesRequestId

  // Desktop shells own service status errors. When a parent shell refresh
  // succeeds after a previous section-local failure, clear stale local messages
  // so the user-visible banner is driven by the latest snapshot.
  let previousServicesError = props.servicesError
  createEffect(() => {
    const next = props.servicesError
    if (next === previousServicesError) return
    previousServicesError = next
    if (next !== undefined && next.length === 0) {
      setLocalError('')
    }
  })
  const refresh = async () => {
    if (refreshInFlight || serviceActionInFlight) return
    refreshInFlight = true
    const requestId = ++servicesRequestId
    setLocalError('')
    try {
      const [nextReport, nextInfo] = await Promise.all([getDesktopServices(), getDesktopInfo()])
      if (!isFreshServicesRequest(requestId)) return
      setReport(nextReport)
      setInfo(nextInfo)
      props.onServicesError?.('')
    } catch (caught) {
      if (!isFreshServicesRequest(requestId)) return
      const message =
        caught instanceof Error ? caught.message : 'Service status could not be loaded'
      setLocalError(message)
      props.onServicesError?.(message)
    } finally {
      if (servicesRequestId === requestId) refreshInFlight = false
    }
  }
  createEffect(() => {
    if (props.services !== undefined || !foreground()) return
    void refresh()
    const timer = window.setInterval(() => void refresh(), 15_000)
    return onCleanup(() => {
      window.clearInterval(timer)
      servicesRequestId += 1
      refreshInFlight = false
    })
  })
  createEffect(() => {
    if (!isDesktopApp) return
    let active = true
    void getDesktopSchedule()
      .then((result) => {
        if (!active) return null
        setSchedule(result)
        setScheduleDraft(result)
        setScheduleError('')
        return null
      })
      .catch((caught) => {
        if (!active) return
        setScheduleError(caught instanceof Error ? caught.message : 'Schedule could not be loaded')
      })
    return onCleanup(() => {
      active = false
    })
  })
  const saveSchedule = async () => {
    if (!scheduleDraft() || scheduleSaving()) return
    setScheduleSaving(true)
    setScheduleError('')
    try {
      const next = await saveDesktopSchedule(scheduleDraft()!)
      if (!mounted) return
      setSchedule(next)
      setScheduleDraft(next)
      if (report()?.services.some((service) => service.name === 'sync' && service.installed)) {
        setScheduleApplyPending(true)
      }
    } catch (caught) {
      setScheduleError(caught instanceof Error ? caught.message : 'Schedule could not be saved')
    } finally {
      setScheduleSaving(false)
    }
  }

  // This helper intentionally stays local with the service action state.
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- keeps service state local
  const serviceIsRunning = (service: DesktopServiceReport['services'][number]) =>
    service.state === 'running' || (service.loaded && service.state === null)
  // A service that is not installed needs a next step, not just a state: each
  // hint names the control that installs it, so the panel answers the question
  // the warning raises without sending the reader to the docs.
  const installHint = (service: DesktopServiceReport['services'][number]) => {
    if (report()?.supported !== true) {
      return 'Background service schedules are not supported on this platform.'
    }
    if (service.name === 'sync') {
      return 'Recurring ingestion is opt-in: use Enable recurring sync above, which re-checks every enabled source before scheduling it.'
    }
    if (service.name === 'vault') {
      return 'Vault export installs with the core service set once a vault output path is configured.'
    }
    if (service.name === 'embedding' && props.settings.embedding.provider !== 'local') {
      return 'Not installed by design: the local embedding service is only used when the embedding provider is local.'
    }
    return 'Installs with the core service set: use Install core services above.'
  }
  const serviceAction = async (
    service: DesktopServiceReport['services'][number],
    action: 'start' | 'stop' | 'restart'
  ) => {
    const warning =
      service.name === 'sync'
        ? '\n\nThis controls only an already installed recurring sync job. Cortana will not install one automatically.'
        : ''
    if (!(await confirm(`${action} ${service.label}?${warning}`))) return
    setBusy(`${service.name}:${action}`)
    serviceActionInFlight = true
    refreshInFlight = false
    servicesRequestId += 1
    setLocalError('')
    props.onServiceActivity?.({
      target: service.name,
      action,
      status: 'running',
      detail: null,
    })
    try {
      const next = await runDesktopServiceAction(service.name, action)
      if (mounted || props.onServices) {
        setReport(next)
        props.onServicesError?.('')
      }
      props.onServiceActivity?.({
        target: service.name,
        action,
        status: 'succeeded',
        detail: null,
      })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Service action failed'
      if (mounted) setLocalError(message)
      props.onServiceActivity?.({
        target: service.name,
        action,
        status: 'failed',
        detail: message,
      })
    } finally {
      serviceActionInFlight = false
      if (mounted) setBusy('')
    }
  }
  const toggleAutostart = async (enabled: boolean) => {
    setBusy('autostart')
    serviceActionInFlight = true
    refreshInFlight = false
    servicesRequestId += 1
    setLocalError('')
    try {
      const next = await setDesktopAutostart(enabled)
      if (mounted) setInfo(next)
    } catch (caught) {
      setLocalError(
        caught instanceof Error ? caught.message : 'Desktop autostart could not be changed'
      )
    } finally {
      serviceActionInFlight = false
      setBusy('')
    }
  }
  const groupAction = async (action: 'start' | 'stop' | 'restart') => {
    const coreServices =
      props.settings.embedding.provider === 'local'
        ? 'the server and embedding services'
        : 'the server'
    if (
      !(await confirm(
        `${action} ${coreServices}?\n\nRecurring sync and backup are explicitly excluded.`
      ))
    ) {
      return
    }
    setBusy(`all:${action}`)
    serviceActionInFlight = true
    refreshInFlight = false
    servicesRequestId += 1
    setLocalError('')
    props.onServiceActivity?.({
      target: 'core services',
      action,
      status: 'running',
      detail: null,
    })
    try {
      const next = await runDesktopServicesActionAll(action)
      if (mounted || props.onServices) {
        setReport(next)
        props.onServicesError?.('')
      }
      props.onServiceActivity?.({
        target: 'core services',
        action,
        status: 'succeeded',
        detail: null,
      })
      if (mounted && action === 'restart') props.onRestarted?.()
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Whole-app service action failed'
      if (mounted) setLocalError(message)
      props.onServiceActivity?.({
        target: 'core services',
        action,
        status: 'failed',
        detail: message,
      })
    } finally {
      serviceActionInFlight = false
      if (mounted) setBusy('')
    }
  }
  const databaseAction = async (action: 'backup' | 'restore') => {
    if (props.dirty) {
      setDatabaseError('Save or discard draft changes before using database recovery.')
      return
    }
    const activeServices = report()?.services.filter((service) => serviceIsRunning(service)) ?? []
    if (action === 'restore' && (report()?.supported !== true || activeServices.length > 0)) {
      setDatabaseError('Stop all Cortana services before restoring a database snapshot.')
      return
    }
    const confirmation =
      action === 'backup'
        ? 'Export a verified Cortana database snapshot?\n\nThe native picker will choose a new .sqlite3 file. No sync or service is started.'
        : 'Restore this Cortana database snapshot?\n\nThis replaces the active index and keeps a pre-restore recovery copy. All Cortana services must already be stopped. No sync is run.'
    if (!(await confirm(confirmation))) return
    setDatabaseBusy(action)
    setDatabaseResult(null)
    setDatabaseError('')
    try {
      const result =
        action === 'backup' ? await backupDesktopDatabase() : await restoreDesktopDatabase()
      if (result) setDatabaseResult(result)
    } catch (caught) {
      setDatabaseError(caught instanceof Error ? caught.message : `Database ${action} failed`)
    } finally {
      setDatabaseBusy('')
    }
  }
  const install = async () => {
    if (
      !(await confirm(
        'Install Cortana background services for this user?\n\nThis installs the API, local embedding (when configured), and verified backup jobs. It does not install or enable recurring ingestion.'
      ))
    ) {
      return
    }
    setBusy('install')
    serviceActionInFlight = true
    refreshInFlight = false
    servicesRequestId += 1
    setLocalError('')
    props.onServiceActivity?.({
      target: 'core services',
      action: 'install',
      status: 'running',
      detail: null,
    })
    try {
      const next = await installDesktopServices()
      if (mounted || props.onServices) {
        setReport(next)
        props.onServicesError?.('')
      }
      props.onServiceActivity?.({
        target: 'core services',
        action: 'install',
        status: 'succeeded',
        detail: null,
      })
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Cortana services could not be installed'
      if (mounted) setLocalError(message)
      props.onServiceActivity?.({
        target: 'core services',
        action: 'install',
        status: 'failed',
        detail: message,
      })
    } finally {
      serviceActionInFlight = false
      if (mounted) setBusy('')
    }
  }
  const installSync = async () => {
    if (props.dirty) {
      setLocalError(
        'Save changes before enabling recurring sync so the validated configuration is current.'
      )
      return
    }
    if (!schedule()! || !scheduleDraft()) {
      setLocalError('Load the service schedule before enabling recurring sync.')
      return
    }
    if (
      scheduleDraft()!.sync_interval_seconds !== schedule()!.sync_interval_seconds ||
      scheduleDraft()!.backup_interval_seconds !== schedule()!.backup_interval_seconds
    ) {
      setLocalError('Save the service schedule before enabling recurring sync.')
      return
    }
    const applyingExistingSchedule =
      scheduleApplyPending() &&
      !(
        report()?.services.some((service) => service.name === 'sync' && !service.installed) ?? false
      )
    const actionLabel = applyingExistingSchedule
      ? 'Apply the updated recurring sync schedule'
      : 'Enable recurring source sync'
    if (
      !(await confirm(
        `${actionLabel} for this user?\n\nCortana will re-check that every enabled source has a current successful validation covering its configured safety budgets before installing the schedule. The first run is delayed by the platform scheduler; existing indexed data is not deleted.`
      ))
    ) {
      return
    }
    setBusy('sync-install')
    serviceActionInFlight = true
    refreshInFlight = false
    servicesRequestId += 1
    setLocalError('')
    props.onServiceActivity?.({
      target: 'recurring sync',
      action: 'install',
      status: 'running',
      detail: null,
    })
    try {
      const next = await installDesktopSyncService()
      if (mounted || props.onServices) {
        setReport(next)
        if (mounted) setScheduleApplyPending(false)
        props.onServicesError?.('')
      }
      props.onServiceActivity?.({
        target: 'recurring sync',
        action: 'install',
        status: 'succeeded',
        detail: null,
      })
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Recurring sync could not be installed'
      if (mounted) setLocalError(message)
      props.onServiceActivity?.({
        target: 'recurring sync',
        action: 'install',
        status: 'failed',
        detail: message,
      })
    } finally {
      serviceActionInFlight = false
      if (mounted) setBusy('')
    }
  }
  const needsCoreInstall = () =>
    report()?.supported === true &&
    report()!.services.some(
      (service) =>
        service.name !== 'sync' &&
        service.name !== 'vault' &&
        (service.name !== 'embedding' || props.settings.embedding.provider === 'local') &&
        !service.installed
    )
  const needsSyncInstall = () =>
    report()?.supported === true &&
    report()!.services.some((service) => service.name === 'sync' && !service.installed)
  const syncScheduleNeedsApply = () => needsSyncInstall() || scheduleApplyPending()
  const actionInFlight = () =>
    Boolean(busy()) || Boolean(databaseBusy()) || props.serviceActivity?.status === 'running'
  const actionMessage = () =>
    props.serviceActivity
      ? `${props.serviceActivity.action === 'install' ? 'Install' : props.serviceActivity.action[0].toUpperCase() + props.serviceActivity.action.slice(1)} ${props.serviceActivity.target}${props.serviceActivity.status === 'running' ? ' in progress…' : props.serviceActivity.status === 'succeeded' ? ' completed.' : ` failed: ${props.serviceActivity.detail || 'unknown error'}`}`
      : ''
  return (
    <SettingsSection
      title="Services"
      description="Inspect and control Cortana runtime services. Recurring ingestion stays absent until its dedicated, validation-gated action is confirmed."
    >
      <div class="service-autostart">
        <label class="source-enable">
          <SettingsSwitch
            aria-label="Open Cortana Desktop at login"
            checked={info()?.autostart_enabled || false}
            disabled={!info() || busy() === 'autostart' || actionInFlight()}
            onChange={(event) => void toggleAutostart(event.target.checked)}
          />
          <span>
            <strong>Open Cortana Desktop at login</strong>
            <small>
              The window may be closed while the tray and runtime continue independently.
            </small>
          </span>
        </label>
      </div>
      <div class="source-settings-toolbar">
        <span>
          {report()?.supported
            ? `${report()!.services.filter((service) => service.loaded).length} loaded`
            : report()
              ? `Runtime service control is not supported on ${report()!.platform}`
              : 'Checking services…'}
        </span>
        <div class="service-actions">
          <Button
            variant="compact"
            disabled={actionInFlight() || report()?.supported !== true}
            onClick={() => void groupAction('start')}
          >
            <Play size={14} /> Start all
          </Button>
          <Button
            variant="compact"
            disabled={actionInFlight() || report()?.supported !== true}
            onClick={() => void groupAction('stop')}
          >
            <CircleStop size={14} /> Stop all
          </Button>
          <Button
            variant="compact"
            disabled={actionInFlight() || report()?.supported !== true}
            onClick={() => void groupAction('restart')}
          >
            <RefreshCw size={14} /> Restart all
          </Button>
          <Button variant="compact" disabled={actionInFlight()} onClick={() => void refresh()}>
            <RefreshCw size={14} /> Refresh
          </Button>
          {needsCoreInstall() && (
            <Button variant="primary" disabled={actionInFlight()} onClick={() => void install()}>
              {busy() === 'install' ? (
                <LoaderCircle class="spin" size={14} />
              ) : (
                <Download size={14} />
              )}{' '}
              Install core services
            </Button>
          )}
          {syncScheduleNeedsApply() && (
            <Button
              variant="compact"
              disabled={actionInFlight() || report()?.supported !== true}
              onClick={() => void installSync()}
            >
              {busy() === 'sync-install' ? (
                <LoaderCircle class="spin" size={14} />
              ) : (
                <Download size={14} />
              )}{' '}
              {scheduleApplyPending() && !needsSyncInstall()
                ? 'Apply recurring sync schedule'
                : 'Enable recurring sync'}
            </Button>
          )}
        </div>
      </div>
      {(error() || scheduleError() || actionMessage()) && (
        <SettingsAlert
          class={cn(
            'safety-note',
            (error() || scheduleError() || props.serviceActivity?.status === 'failed') && 'error'
          )}
          variant={
            error() || scheduleError() || props.serviceActivity?.status === 'failed'
              ? 'destructive'
              : 'default'
          }
          role={
            error() || scheduleError() || props.serviceActivity?.status === 'failed'
              ? 'alert'
              : 'status'
          }
        >
          {error() || scheduleError() || actionMessage()}
        </SettingsAlert>
      )}
      {scheduleDraft() && (
        <div class="service-schedule">
          <div>
            <strong>Background schedule</strong>
            <p>
              These intervals apply only when you explicitly install recurring sync. Saving them
              never starts a service.
            </p>
          </div>
          <SettingsFieldGroup class="form-grid compact">
            <NumberField
              label="Sync interval (seconds)"
              hint="1 minute to 7 days"
              value={scheduleDraft()!.sync_interval_seconds}
              min={60}
              max={604800}
              onChange={(sync_interval_seconds) =>
                setScheduleDraft((current) =>
                  current
                    ? {
                        ...current,
                        sync_interval_seconds,
                      }
                    : current
                )
              }
            />
            <NumberField
              label="Backup interval (seconds)"
              hint="5 minutes to 30 days"
              value={scheduleDraft()!.backup_interval_seconds}
              min={300}
              max={2592000}
              onChange={(backup_interval_seconds) =>
                setScheduleDraft((current) =>
                  current
                    ? {
                        ...current,
                        backup_interval_seconds,
                      }
                    : current
                )
              }
            />
          </SettingsFieldGroup>
          <div class="service-actions">
            <Button
              variant="compact"
              disabled={
                actionInFlight() ||
                scheduleSaving() ||
                !schedule()! ||
                (scheduleDraft()!.sync_interval_seconds === schedule()!.sync_interval_seconds &&
                  scheduleDraft()!.backup_interval_seconds === schedule()!.backup_interval_seconds)
              }
              onClick={() => void saveSchedule()}
            >
              {scheduleSaving() ? <LoaderCircle class="spin" size={14} /> : <Save size={14} />} Save
              schedule
            </Button>
          </div>
        </div>
      )}
      <div class="portable-settings">
        <div>
          <strong>Database recovery</strong>
          <p>
            Export a verified SQLite snapshot or restore one into the active index. Restore is
            blocked while any Cortana service is running and never starts recurring sync.
          </p>
        </div>
        <div class="service-actions">
          <Button
            variant="compact"
            disabled={actionInFlight() || props.dirty}
            onClick={() => void databaseAction('backup')}
            title={props.dirty ? 'Save or discard draft changes first' : 'Export database backup'}
          >
            {databaseBusy() === 'backup' ? (
              <LoaderCircle class="spin" size={14} />
            ) : (
              <Download size={14} />
            )}{' '}
            Backup database
          </Button>
          <Button
            variant="compact"
            disabled={
              actionInFlight() ||
              props.dirty ||
              report()?.supported !== true ||
              report()!.services.some((service) => serviceIsRunning(service))
            }
            onClick={() => void databaseAction('restore')}
            title={
              props.dirty
                ? 'Save or discard draft changes first'
                : report()?.supported !== true
                  ? 'Service status is required before restore'
                  : report()!.services.some((service) => serviceIsRunning(service))
                    ? 'Stop all Cortana services before restore'
                    : 'Restore database backup'
            }
          >
            {databaseBusy() === 'restore' ? (
              <LoaderCircle class="spin" size={14} />
            ) : (
              <Upload size={14} />
            )}{' '}
            Restore database
          </Button>
        </div>
      </div>
      {(databaseResult() || databaseError()) && (
        <SettingsAlert
          class={cn('safety-note', databaseError() && 'error')}
          variant={databaseError() ? 'destructive' : 'default'}
          role={databaseError() ? 'alert' : 'status'}
        >
          {databaseError() ? <AlertTriangle size={16} /> : <Check size={16} />}
          <span>
            {databaseError() ||
              `${databaseResult()?.action === 'backup' ? 'Verified backup exported' : 'Database restored'} to ${databaseResult()?.path} (${databaseResult()?.bytes} bytes).`}
          </span>
        </SettingsAlert>
      )}
      <div class="service-grid">
        {report()?.services.map((service) => {
          const running = service.loaded && service.state === 'running'
          const failed = service.last_exit_status !== null && service.last_exit_status !== 0
          return (
            <SettingsCard class="service-card">
              <header>
                <i class={cn('service-state', running ? 'ready' : failed && 'failed')} />
                <div>
                  <strong>{service.name[0].toUpperCase() + service.name.slice(1)}</strong>
                  <small>{service.label}</small>
                </div>
              </header>
              <p>
                {!service.installed
                  ? 'Not installed'
                  : service.loaded
                    ? service.state || 'Loaded'
                    : 'Installed, not loaded'}
                {service.pid ? ` · PID ${service.pid}` : ''}
                {failed ? ` · last exit ${service.last_exit_status}` : ''}
              </p>
              <Show
                when={service.installed}
                fallback={
                  // A bare "Not installed" is a dead end: name the control that
                  // installs this service and why it is not installed yet.
                  <p class="service-install-hint">{installHint(service)}</p>
                }
              >
                <div class="service-actions">
                  <Button
                    variant="compact"
                    disabled={!report()!.supported || running || actionInFlight()}
                    onClick={() => void serviceAction(service, 'start')}
                  >
                    <Play size={14} /> Start
                  </Button>
                  <Button
                    variant="compact"
                    disabled={!report()!.supported || !service.loaded || actionInFlight()}
                    onClick={() => void serviceAction(service, 'stop')}
                  >
                    <CircleStop size={14} /> Stop
                  </Button>
                  <Button
                    variant="compact"
                    disabled={!report()!.supported || actionInFlight()}
                    onClick={() => void serviceAction(service, 'restart')}
                  >
                    <RefreshCw size={14} /> Restart
                  </Button>
                </div>
              </Show>
            </SettingsCard>
          )
        })}
      </div>
      <p class="settings-note">
        Recurring sync is opt-in and requires current source validation before installation.
        Starting the server, embedding, or backup service does not run ingestion.
      </p>
    </SettingsSection>
  )
}
function ReadinessSection(incoming: {
  autoScan?: boolean
  readiness: DesktopReadiness | null
  onResult: (readiness: DesktopReadiness | null) => void
  onOpenServices?: () => void
  job: DesktopInstallJob | null
  onJob: (job: DesktopInstallJob | null) => void
  readinessActivity?: DesktopReadinessActivity | null
  onReadinessScan?: () => Promise<DesktopReadiness>
  pollInstaller?: boolean
}) {
  const props = mergeProps(
    {
      autoScan: false,
      pollInstaller: true,
    },
    incoming
  )
  const confirm = useSettingsConfirm()
  const foreground = useDesktopForeground()
  const [scanning, setScanning] = createSignal(false)
  const [migratingGeneration, setMigratingGeneration] = createSignal(false)
  const [error, setError] = createSignal('')
  const [migrationNotice, setMigrationNotice] = createSignal('')
  let autoScanAttempted = false
  let pollAlive = true
  onCleanup(() => {
    pollAlive = false
  })
  createEffect(() => {
    if (
      !props.pollInstaller ||
      !foreground() ||
      !props.job ||
      !['running', 'cancelling'].includes(props.job.status)
    ) {
      return
    }
    // The liveness flag is component-scoped: props.job updates re-run this
    // effect while a poll callback is still completing, and a per-effect flag
    // would drop the post-install readiness scan and leave scanning stuck on.
    const jobId = props.job!.id
    const timer = window.setTimeout(() => {
      void getDesktopInstaller(jobId)
        .then((result) => {
          // A stale poll for a superseded job must not overwrite the current one.
          if (!pollAlive || props.job?.id !== jobId) return null
          props.onJob(result)
          if (result.status === 'succeeded') {
            props.onResult(null)
            setScanning(true)
            void (props.onReadinessScan ? props.onReadinessScan() : scanDesktopReadiness())
              .then((scan) => {
                if (!pollAlive) return null
                props.onResult(scan)
                return null
              })
              .catch((caught: unknown) => {
                if (pollAlive) {
                  setError(
                    caught instanceof Error ? caught.message : 'Post-install readiness scan failed'
                  )
                }
              })
              .finally(() => {
                if (pollAlive) setScanning(false)
              })
          }
          return null
        })
        .catch((caught: unknown) => {
          if (pollAlive) {
            setError(caught instanceof Error ? caught.message : 'Installer status failed')
          }
        })
    }, 700)
    return onCleanup(() => {
      window.clearTimeout(timer)
    })
  })
  const scan = async () => {
    setScanning(true)
    setError('')
    setMigrationNotice('')
    try {
      const next = await (props.onReadinessScan ? props.onReadinessScan() : scanDesktopReadiness())
      props.onResult(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Readiness scan failed')
    } finally {
      setScanning(false)
    }
  }
  const migrateGeneration = async () => {
    const generation = props.readiness?.core?.embedding_generation
    if (!generation?.stored || generation.stored === generation.configured) return
    const from = generation.stored
    if (
      !(await confirm(
        `Adopt the stored embedding generation?\n\n${from}\n\nUse this only when the configured model, dimension, and vector space are unchanged and only the provider fingerprint changed. Cortana will create a verified backup, update generation metadata, and clear derived caches. Indexed documents will not be rebuilt. Continue?`
      ))
    ) {
      return
    }
    setMigratingGeneration(true)
    setError('')
    setMigrationNotice('')
    try {
      await migrateDesktopEmbeddingGeneration(from)
      try {
        const next = await (props.onReadinessScan
          ? props.onReadinessScan()
          : scanDesktopReadiness())
        props.onResult(next)
        const nextGeneration = next.core?.embedding_generation
        if (!nextGeneration || nextGeneration.stored !== nextGeneration.configured) {
          setError(
            'Embedding generation was adopted, but the follow-up readiness scan still reports a mismatch.'
          )
        } else {
          setMigrationNotice('Embedding generation adopted and readiness was rescanned.')
        }
      } catch (caught) {
        setError(
          caught instanceof Error
            ? `Embedding generation was adopted, but readiness could not be rescanned: ${caught.message}`
            : 'Embedding generation was adopted, but readiness could not be rescanned'
        )
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Embedding generation migration failed')
    } finally {
      setMigratingGeneration(false)
    }
  }
  let autoScanAlive = true
  onCleanup(() => {
    autoScanAlive = false
  })
  createEffect(() => {
    if (!props.autoScan || props.readiness || autoScanAttempted) return
    // First-launch readiness is intentionally one-shot. A failed scan is
    // surfaced for the operator to retry explicitly; it must not loop every
    // time the shell-owned activity status changes to failed. The liveness
    // flag is component-scoped: props.readiness changes re-run this effect
    // while the scan is still in flight, and a per-effect flag would leave
    // scanning stuck on.
    autoScanAttempted = true
    setScanning(true)
    setError('')
    void (props.onReadinessScan ? props.onReadinessScan() : scanDesktopReadiness())
      .then((result) => {
        if (!autoScanAlive) return null
        props.onResult(result)
        return null
      })
      .catch((caught: unknown) => {
        if (autoScanAlive) {
          setError(caught instanceof Error ? caught.message : 'Readiness scan failed')
        }
      })
      .finally(() => {
        if (autoScanAlive) setScanning(false)
      })
  })
  const readinessInFlight = () =>
    scanning() || migratingGeneration() || props.readinessActivity?.status === 'running'
  const readinessActivityError = () =>
    props.readinessActivity?.status === 'failed' ? props.readinessActivity.detail : null
  const embeddingGeneration = () => props.readiness?.core?.embedding_generation
  const embeddingGenerationMismatch = () =>
    Boolean(
      embeddingGeneration()?.stored &&
      embeddingGeneration()!.stored !== embeddingGeneration()!.configured
    )
  const install = async (tool: string, label: string) => {
    const action =
      tool === 'connectors'
        ? 'Cortana will create the per-user connector environment from the signed Desktop bundle and install its bounded ingestion dependencies with uv.'
        : tool === 'embedding-runtime'
          ? 'Cortana will install the text-embeddings-inference runtime with Homebrew. The model itself is downloaded by the runtime on first start and no ingestion will begin.'
          : 'Cortana will run its fixed, platform-specific installer.'
    if (
      !(await confirm(
        `Install ${label} on this computer?\n\n${action} No ingestion or sync will start.`
      ))
    ) {
      return
    }
    setError('')
    try {
      props.onJob(await startDesktopInstaller(tool))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Installer failed to start')
    }
  }
  const cancel = async () => {
    if (!props.job) return
    try {
      props.onJob(await cancelDesktopInstaller(props.job.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Installer could not be cancelled')
    }
  }
  return (
    <SettingsSection
      title="System readiness"
      description="A read-only scan checks local tools and Cortana's production gates. The first Connector environment install needs explicit approval here; previously installed environments are maintained automatically after Desktop updates. This scan never starts a connector, installs a schedule, or writes indexed data."
    >
      <div class="readiness-actions">
        <Button variant="secondary" type="button" disabled={readinessInFlight()} onClick={scan}>
          {readinessInFlight() ? <LoaderCircle class="spin" size={15} /> : <RefreshCw size={15} />}
          {readinessInFlight()
            ? 'Checking system…'
            : props.readiness
              ? 'Run again'
              : 'Run readiness scan'}
        </Button>
        {props.readiness && (
          <span>
            Last checked{' '}
            {new Date(props.readiness.scanned_at_unix_seconds * 1000).toLocaleTimeString()}
          </span>
        )}
      </div>
      {(error() || readinessActivityError()) && (
        <SettingsAlert class="safety-note error" variant="destructive" role="alert">
          <AlertTriangle size={16} /> <span>{error() || readinessActivityError()}</span>
        </SettingsAlert>
      )}
      {migrationNotice() && (
        <SettingsAlert class="safety-note" role="status">
          <Check size={16} /> <span>{migrationNotice()}</span>
        </SettingsAlert>
      )}
      {props.readiness && (
        <>
          <div class="readiness-summary">
            <StatusGlyph passed={props.readiness.tools_ready} />
            <div>
              <strong>
                {props.readiness.tools_ready ? 'Local tools ready' : 'Setup required'}
              </strong>
              <span>
                {props.readiness.tools.filter((tool) => tool.required && !tool.available).length}{' '}
                required components missing
              </span>
            </div>
          </div>
          <div class="readiness-list">
            <For each={props.readiness.tools}>
              {(tool) => (
                <article>
                  <StatusGlyph passed={tool.available} optional={!tool.required} />
                  <div>
                    <strong>
                      {tool.label} {!tool.required && <small>optional</small>}
                    </strong>
                    <span>{tool.version || tool.detail}</span>
                    {tool.path && <code>{tool.path}</code>}
                  </div>
                  {!tool.available && tool.install_supported && (
                    <Button
                      variant="compact"
                      type="button"
                      disabled={
                        props.job?.status === 'running' || props.job?.status === 'cancelling'
                      }
                      onClick={() => void install(tool.id, tool.label)}
                    >
                      Install
                    </Button>
                  )}
                </article>
              )}
            </For>
          </div>
          <div class="core-readiness">
            <h3>Production gates</h3>
            {props.readiness.core_error && <p>{props.readiness.core_error}</p>}
            {props.readiness.core?.checks.map((check) => (
              <article>
                <StatusGlyph passed={check.passed} />
                <div>
                  <strong>{check.name.replaceAll('-', ' ')}</strong>
                  <span>{check.detail}</span>
                </div>
              </article>
            ))}
            {embeddingGenerationMismatch() && (
              <SettingsAlert class="safety-note" role="status">
                <span>
                  The index uses a different embedding generation. Adopt it only after confirming
                  that the vectors are interchangeable; otherwise rebuild or import a new
                  generation.
                </span>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={readinessInFlight()}
                  onClick={() => void migrateGeneration()}
                >
                  {migratingGeneration() ? 'Adopting generation…' : 'Adopt stored generation'}
                </Button>
              </SettingsAlert>
            )}
          </div>
          {props.readiness.core && !props.readiness.core.passed && (
            <SettingsAlert class="safety-note" role="status">
              <span>
                Readiness is blocked by:{' '}
                <strong>
                  {props.readiness.core.checks
                    .filter((check) => !check.passed)
                    .map((check) => check.name.replaceAll('-', ' '))
                    .join(', ') || 'an unknown runtime check'}
                </strong>
                . Review the failed check details above before retrying.
              </span>
              {props.onOpenServices &&
                props.readiness.core.checks.some(
                  (check) =>
                    !check.passed &&
                    /api|service|server|embedding|backup/i.test(`${check.name} ${check.detail}`)
                ) && (
                  <Button variant="secondary" onClick={props.onOpenServices}>
                    Check Services
                  </Button>
                )}
            </SettingsAlert>
          )}
        </>
      )}
      {props.job && (
        <div class={`installer-job ${props.job.status}`} role="status">
          <div>
            {['running', 'cancelling'].includes(props.job.status) ? (
              <LoaderCircle class="spin" size={16} />
            ) : (
              <StatusGlyph passed={props.job.status === 'succeeded'} />
            )}
            <span>
              <strong>{props.job.summary}</strong>
              <small>Status: {props.job.status}</small>
            </span>
            {props.job!.status === 'running' && (
              <Button variant="compact" onClick={() => void cancel()}>
                Cancel
              </Button>
            )}
            {props.job!.retryable && (
              <Button
                variant="compact"
                onClick={() => void install(props.job!.tool, props.job!.tool)}
              >
                Retry
              </Button>
            )}
          </div>
          {props.job!.log && <pre>{props.job!.log}</pre>}
        </div>
      )}
    </SettingsSection>
  )
}
