import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CircleStop,
  Download,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-solid'
import {
  lazy,
  Suspense,
  Switch,
  Match,
  createEffect,
  createUniqueId,
  createSignal,
  mergeProps,
  onCleanup,
  For,
  Index,
  type JSX,
} from 'solid-js'
import { cn } from '../lib/utils'
import { DEFAULT_THEME, SUPPORTED_THEMES, type ThemeMode } from '../theme'
import { WorkspaceLogo } from '../workspaceLogos'
import { readWorkspaceLogoFile, writeWorkspaceLogo } from '../workspaceLogoStore'
import {
  moveWorkspaceThemePreference,
  readWorkspaceThemePreferences,
  writeWorkspaceThemePreference,
} from '../workspaceThemePreference'
import { MemoryReview } from './MemoryReview'
import { Toaster } from './shadcn/sonner'
import { SettingsConfirmProvider, useSettingsConfirm } from './settings/SettingsConfirm'
import {
  deriveWorkspaceIdentifier,
  ensureWorkspaceIdentifierUnique,
  isWorkspaceIdDerivedFromName,
  referencedSecretNames,
  validateSourceIdentityScopes,
} from './settings/SettingsSourceIdentity'
import { StatusGlyph } from './settings/SettingsWorkflowShared'
import { applyConfirmed, useDesktopForeground } from './settings/SettingsWorkflowUtils'
import {
  Field,
  NumberField,
  SettingsSection,
  type SettingsSectionProps,
} from './settings/SettingsLayout'
import {
  SettingsAccordion,
  SettingsAccordionContent,
  SettingsAccordionItem,
  SettingsAccordionTrigger,
  SettingsAlert,
  SettingsButton as Button,
  SettingsCard,
  SettingsCheckbox,
  SettingsFieldGroup,
  SettingsInput as Input,
  SettingsSelect as Select,
  SettingsSwitch,
  SettingsSurfaceProvider,
} from './settings/SettingsSurface'
import {
  cancelDesktopInstaller,
  cancelDesktopUpdate,
  checkDesktopUpdate,
  getDesktopAudit,
  getDesktopInstaller,
  getDesktopInfo,
  listDesktopProviderModels,
  getDesktopSchedule,
  getDesktopServices,
  getDesktopSettings,
  getDesktopUpdate,
  getRuntimeAudit,
  installDesktopUpdate,
  installDesktopServices,
  installDesktopSyncService,
  migrateDesktopEmbeddingGeneration,
  isDesktopApp,
  openDesktopProject,
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
import { type ProviderModelKind, type ProviderModelEntry } from '../types'
import { isLoopbackUrl } from '../operations'
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
  AuditEvent,
  AuthPrincipalSettings,
  WorkspaceSettings,
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
const SettingsCombobox = lazy(() =>
  import('./settings/SettingsModelCombobox').then((module) => ({
    default: module.SettingsModelCombobox,
  }))
)
const SettingsSecretInputGroup = lazy(() =>
  import('./settings/SettingsSecretInputGroup').then((module) => ({
    default: module.SettingsSecretInputGroup,
  }))
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
                <Button
                  variant="primary"
                  type="submit"
                  form="settings-form"
                  disabled={saving() || !dirty()}
                  title={dirty() ? undefined : 'Make a change before saving'}
                >
                  <Save size={16} /> {saving() ? 'Saving…' : 'Save changes'}
                </Button>
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
                  <UpdatesSection
                    desktopUpdate={props.desktopUpdate}
                    onDesktopUpdate={props.onDesktopUpdate}
                  />
                )}
                {section() === 'access' && (
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
                )}
                {section() === 'audit' && <AuditSection />}
                {section() === 'workspaces' && (
                  <WorkspaceSection settings={settings()!} update={update} />
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
                )}
                {section() === 'query' && (
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
                )}
                {section() === 'memory' && (
                  <NativeMemorySection settings={settings()!} update={update} />
                )}
                {section() === 'ingestion' && (
                  <IngestionSection settings={settings()!} update={update} />
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
              <div class="service-actions">
                <Button
                  variant="compact"
                  disabled={
                    !report()!.supported || !service.installed || running || actionInFlight()
                  }
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
                  disabled={!report()!.supported || !service.installed || actionInFlight()}
                  onClick={() => void serviceAction(service, 'restart')}
                >
                  <RefreshCw size={14} /> Restart
                </Button>
              </div>
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
function UpdatesSection(incoming: {
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
function NativeMemorySection(
  incoming: SettingsSectionProps & {
    settings: DesktopSettings
  }
) {
  const props = incoming
  const change = (patch: Partial<DesktopSettings['memory']>) =>
    props.update((current) => ({
      ...current,
      memory: {
        ...current.memory,
        ...patch,
      },
    }))
  return (
    <SettingsSection
      title="Native agentic memory"
      description="Cortana keeps operational memory in its own private local store. Memory is explicit, scoped, auditable, and protected by the local data-directory permissions."
    >
      <SettingsAlert class="safety-note" role="status">
        Knowledge documents remain source-backed. Agents may explicitly remember, recall, and redact
        bounded records through the native MCP, HTTP, or CLI interfaces.
      </SettingsAlert>
      <SettingsFieldGroup class="form-grid">
        <Field label="Maximum active memories" hint="bounded local record count">
          <Input
            type="number"
            min={1}
            max={1000000}
            value={props.settings.memory.max_active}
            onChange={(event) =>
              change({
                max_active: Number(event.target.value) || 1,
              })
            }
          />
        </Field>
        <Field label="Default confidence" hint="0 to 1; agents can override per record">
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={props.settings.memory.default_confidence}
            onChange={(event) =>
              change({
                default_confidence: Number(event.target.value) || 0,
              })
            }
          />
        </Field>
        <Field label="Default importance" hint="0 to 1; used for review and ranking">
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={props.settings.memory.default_importance}
            onChange={(event) =>
              change({
                default_importance: Number(event.target.value) || 0,
              })
            }
          />
        </Field>
      </SettingsFieldGroup>
      <MemoryReview maxActive={props.settings.memory.max_active} />
    </SettingsSection>
  )
}
function AccessSection(
  incoming: SettingsSectionProps & {
    secretValues: Record<string, string>
    onSecret: (values: Record<string, string>) => void
    clearedSecrets: Set<string>
    onClearSecret: (name: string) => void
  }
) {
  const props = incoming
  const confirm = useSettingsConfirm()
  const change = (index: number, patch: Partial<AuthPrincipalSettings>) =>
    props.update((current) => ({
      ...current,
      auth_principals: current.auth_principals.map((principal, position) =>
        position === index
          ? {
              ...principal,
              ...patch,
            }
          : principal
      ),
    }))
  const add = () =>
    props.update((current) => {
      const usedPrincipals = new Set(
        current.auth_principals.map((principal) => principal.principal)
      )
      const usedTokens = new Set(current.auth_principals.map((principal) => principal.token_env))
      let number = 1
      while (
        usedPrincipals.has(`agent-${number}`) ||
        usedTokens.has(`CORTANA_AGENT_${number}_TOKEN`)
      ) {
        number += 1
      }
      return {
        ...current,
        auth_principals: [
          ...current.auth_principals,
          {
            principal: `agent-${number}`,
            token_env: `CORTANA_AGENT_${number}_TOKEN`,
            scopes: ['query', 'status'],
            acl: current.workspaces.map((workspace) => workspace.id),
          },
        ],
      }
    })
  return (
    <SettingsSection
      title="Agent access"
      description="Create named bearer principals with least-privilege scopes and workspace ACL labels. Token values are write-only and never return to the renderer."
    >
      <div class="principal-list">
        <For each={props.settings.auth_principals}>
          {(principal, index) => {
            const secret = props.settings.secrets.find((item) => item.name === principal.token_env)
            return (
              // principals render in settings order
              <SettingsCard class="principal-card">
                <header>
                  <KeyRound size={16} />
                  <strong>{principal.principal || `Principal ${index() + 1}`}</strong>
                  <Button
                    variant="danger"
                    type="button"
                    class=""
                    aria-label={`Remove ${principal.principal}`}
                    tooltip={`Remove ${principal.principal}`}
                    onClick={() =>
                      applyConfirmed(
                        confirm(
                          `Remove ${principal.principal} from agent access? Its stored credential will be removed only after you save these changes.`
                        ),
                        () =>
                          props.update((current) => ({
                            ...current,
                            auth_principals: current.auth_principals.filter(
                              (_, position) => position !== index()
                            ),
                          }))
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                </header>
                <SettingsFieldGroup class="form-grid">
                  <Field label="Principal name">
                    <Input
                      value={principal.principal}
                      maxLength={128}
                      required
                      onChange={(event) =>
                        change(index(), {
                          principal: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Token environment name">
                    <Input
                      value={principal.token_env}
                      maxLength={128}
                      pattern="[A-Za-z_][A-Za-z0-9_]*"
                      required
                      onChange={(event) =>
                        change(index(), {
                          token_env: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="New bearer token" hint="write-only; leave blank to retain">
                    <Input
                      type="password"
                      autocomplete="new-password"
                      value={props.secretValues[principal.token_env] || ''}
                      onChange={(event) =>
                        props.onSecret({
                          ...props.secretValues,
                          [principal.token_env]: event.target.value,
                        })
                      }
                    />
                    {secret?.configured && !props.clearedSecrets.has(principal.token_env) && (
                      <Button
                        variant="danger"
                        onClick={() =>
                          applyConfirmed(
                            confirm(
                              `Clear the stored bearer token for ${principal.principal}? The change remains a draft until you save settings.`
                            ),
                            () => props.onClearSecret(principal.token_env)
                          )
                        }
                      >
                        Clear stored token
                      </Button>
                    )}
                  </Field>
                  <Field label="ACL labels" hint="comma-separated workspace IDs; * grants all">
                    <Input
                      value={principal.acl.join(', ')}
                      onChange={(event) =>
                        change(index(), {
                          acl: event.target.value
                            .split(',')
                            .map((value) => value.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                </SettingsFieldGroup>
                <div class="scope-options">
                  <For each={['query', 'status', 'admin'] as const}>
                    {(scope) => (
                      <label>
                        <SettingsCheckbox
                          aria-label={`${scope} scope for ${principal.principal}`}
                          checked={principal.scopes.includes(scope)}
                          onChange={(event) =>
                            change(index(), {
                              scopes: event.target.checked
                                ? [...principal.scopes, scope]
                                : principal.scopes.filter((value) => value !== scope),
                            })
                          }
                        />
                        {scope}
                      </label>
                    )}
                  </For>
                </div>
              </SettingsCard>
            )
          }}
        </For>
      </div>
      <Button variant="secondary" onClick={add}>
        <Plus size={15} /> Add principal
      </Button>
      <p class="settings-note">
        Settings take effect after the server restarts. Desktop requests select a matching private
        native credential by scope without exposing it to web content.
      </p>
    </SettingsSection>
  )
}
function AuditSection() {
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
function WorkspaceSection(incoming: {
  settings: DesktopSettings
  update: (change: (draft: DesktopSettings) => DesktopSettings) => void
}) {
  const props = incoming
  const confirm = useSettingsConfirm()
  const [logoError, setLogoError] = createSignal('')
  const [logoLoading, setLogoLoading] = createSignal<string | null>(null)
  const [workspaceThemes, setWorkspaceThemes] = createSignal(readWorkspaceThemePreferences())
  const [workspaceQuery, setWorkspaceQuery] = createSignal('')
  const hasWorkspaceSources = (workspaceId: string) =>
    props.settings.sources.some((source) => source.project === workspaceId)
  const updateLogo = async (workspaceId: string, file: File | undefined) => {
    if (!file) return
    setLogoLoading(workspaceId)
    try {
      writeWorkspaceLogo(workspaceId, await readWorkspaceLogoFile(file))
      setLogoError('')
    } catch (caught) {
      setLogoError(caught instanceof Error ? caught.message : 'Workspace logo could not be saved.')
    } finally {
      setLogoLoading(null)
    }
  }
  const addWorkspace = () =>
    props.update((current) => {
      const nextName = 'New workspace'
      const nextId = ensureWorkspaceIdentifierUnique(
        deriveWorkspaceIdentifier(nextName),
        current.workspaces.map((workspace) => workspace.id)
      )
      return {
        ...current,
        workspaces: [
          ...current.workspaces,
          {
            id: nextId,
            name: nextName,
            account_label: null,
            color: null,
          },
        ],
      }
    })
  const changeWorkspace = (index: number, patch: Partial<WorkspaceSettings>) => {
    const currentWorkspace = props.settings.workspaces[index]
    if (!currentWorkspace) return
    const remainingIds = props.settings.workspaces
      .map((workspace) => workspace.id)
      .filter((candidate) => candidate !== currentWorkspace.id)
    const nextName = patch.name ?? currentWorkspace.name
    const shouldDeriveId =
      patch.id === undefined &&
      patch.name !== undefined &&
      !hasWorkspaceSources(currentWorkspace.id) &&
      isWorkspaceIdDerivedFromName(currentWorkspace)
    const nextId = patch.id
      ? patch.id
      : shouldDeriveId
        ? ensureWorkspaceIdentifierUnique(deriveWorkspaceIdentifier(nextName), remainingIds)
        : currentWorkspace.id
    if (nextId !== currentWorkspace.id) {
      moveWorkspaceThemePreference(currentWorkspace.id, nextId)
      setWorkspaceThemes((previous) => {
        const theme = previous[currentWorkspace.id]
        if (!theme) return previous
        const next = {
          ...previous,
        }
        delete next[currentWorkspace.id]
        next[nextId] = theme
        return next
      })
    }
    props.update((current) => {
      const workspaceToUpdate = current.workspaces[index]
      if (!workspaceToUpdate) return current
      return {
        ...current,
        workspaces: current.workspaces.map((workspace, position) =>
          position === index
            ? {
                ...workspace,
                ...patch,
                id: nextId,
              }
            : workspace
        ),
      }
    })
  }
  const visibleWorkspaces = () =>
    props.settings.workspaces
      .map((workspace, index) => ({
        workspace,
        index,
      }))
      .filter(({ workspace }) => {
        const query = workspaceQuery().trim().toLocaleLowerCase()
        return (
          !query ||
          workspace.name.toLocaleLowerCase().includes(query) ||
          workspace.id.toLocaleLowerCase().includes(query) ||
          workspace.account_label?.toLocaleLowerCase().includes(query)
        )
      })
  const moveWorkspace = (index: number, offset: -1 | 1) =>
    props.update((current) => {
      const destination = index + offset
      if (destination < 0 || destination >= current.workspaces.length) return current
      const workspaces = [...current.workspaces]
      const [workspace] = workspaces.splice(index, 1)
      if (!workspace) return current
      workspaces.splice(destination, 0, workspace)
      return {
        ...current,
        workspaces,
      }
    })
  return (
    <SettingsSection
      title="Workspaces"
      description="Create isolated query scopes and assign each source or account to one workspace. Workspace logos stay local to this Desktop profile and never enter the index or portable settings export."
    >
      {props.settings.workspaces.length > 6 && (
        <Field
          label="Find workspace"
          hint={`${visibleWorkspaces().length} of ${props.settings.workspaces.length} shown`}
          wide
        >
          <div class="settings-search-input">
            <Search size={14} aria-hidden="true" />
            <Input
              type="search"
              value={workspaceQuery()}
              onChange={(event) => setWorkspaceQuery(event.target.value)}
              placeholder="Search name, ID, or account label"
              autocomplete="off"
            />
          </div>
        </Field>
      )}
      <div class={`workspace-settings-grid workspace-settings-grid--${visibleWorkspaces().length}`}>
        <Index each={visibleWorkspaces()}>
          {(entry) => {
            // Index keys rows by position so typing (which rebuilds the workspace
            // object) does not remount the card and drop input focus.
            const workspace = () => entry().workspace
            const index = () => entry().index
            return (
              <SettingsCard class="workspace-card">
                <div class="workspace-card-heading">
                  <WorkspaceLogo workspace={workspace()} size="large" />
                  <div class="workspace-card-title">
                    <strong>{workspace().name || 'New workspace'}</strong>
                    <small>Workspace identity</small>
                  </div>
                  <label
                    class={cn(
                      'workspace-logo-upload',
                      logoLoading() === workspace().id && 'is-loading'
                    )}
                    title={
                      logoLoading() === workspace().id
                        ? 'Saving workspace logo'
                        : 'Upload workspace logo'
                    }
                    aria-busy={logoLoading() === workspace().id}
                  >
                    {logoLoading() === workspace().id ? (
                      <LoaderCircle class="spin" size={14} aria-label="Saving workspace logo" />
                    ) : (
                      <Upload size={14} />
                    )}
                    <span class="visually-hidden">Upload logo for {workspace().name}</span>
                    <Input
                      type="file"
                      accept="image/*"
                      disabled={logoLoading() === workspace().id}
                      onChange={(event) => {
                        void updateLogo(workspace().id, event.target.files?.[0])
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                  {props.settings.workspaces.length > 1 && (
                    <div class="workspace-order-actions">
                      <Button
                        variant="ghost"
                        type="button"
                        aria-label={`Move ${workspace().name} up`}
                        disabled={index() === 0}
                        tooltip="Move workspace up"
                        onClick={() => moveWorkspace(index(), -1)}
                      >
                        <ArrowUp size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        type="button"
                        aria-label={`Move ${workspace().name} down`}
                        disabled={index() === props.settings.workspaces.length - 1}
                        tooltip="Move workspace down"
                        onClick={() => moveWorkspace(index(), 1)}
                      >
                        <ArrowDown size={15} />
                      </Button>
                      <Button
                        variant="danger"
                        type="button"
                        class=""
                        aria-label={`Remove ${workspace().name}`}
                        disabled={hasWorkspaceSources(workspace().id)}
                        tooltip={
                          hasWorkspaceSources(workspace().id)
                            ? 'Move assigned sources before removing this workspace'
                            : 'Remove workspace'
                        }
                        onClick={() =>
                          applyConfirmed(
                            confirm(
                              `Remove the ${workspace().name} workspace? This changes only the settings draft and does not delete indexed data.`
                            ),
                            () =>
                              props.update((current) => ({
                                ...current,
                                workspaces: current.workspaces.filter(
                                  (_, position) => position !== index()
                                ),
                              }))
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  )}
                </div>
                <div class="workspace-identity-row">
                  <Field label="Display name">
                    <Input
                      value={workspace().name}
                      onChange={(event) =>
                        changeWorkspace(index(), {
                          name: event.target.value,
                        })
                      }
                      required
                      maxLength={80}
                    />
                  </Field>
                  <Field label="Workspace theme">
                    <Select
                      aria-label={`Theme for ${workspace().name || 'new workspace'}`}
                      value={workspaceThemes()[workspace().id] ?? DEFAULT_THEME}
                      onChange={(event) => {
                        const next = (event.target as HTMLSelectElement).value as ThemeMode
                        setWorkspaceThemes((current) => ({
                          ...current,
                          [workspace().id]: next,
                        }))
                        writeWorkspaceThemePreference(workspace().id, next)
                      }}
                    >
                      <For each={SUPPORTED_THEMES}>
                        {(item) => <option value={item.id}>{item.label}</option>}
                      </For>
                    </Select>
                  </Field>
                </div>
                <SettingsAccordion class="workspace-advanced-details">
                  <SettingsAccordionItem value={`workspace-${workspace().id}`}>
                    <SettingsAccordionTrigger>Advanced workspace details</SettingsAccordionTrigger>
                    <SettingsAccordionContent class="workspace-advanced-fields">
                      <small class="workspace-advanced-note">
                        ID is internal; account labels are optional metadata.
                      </small>
                      <Field
                        label="Scope ID"
                        hint="generated from the display name; used internally"
                      >
                        <Input
                          value={workspace().id}
                          readOnly
                          disabled={hasWorkspaceSources(workspace().id)}
                          aria-disabled={hasWorkspaceSources(workspace().id)}
                          title="Generated from the display name and used internally"
                          required
                          maxLength={32}
                          pattern="[a-z0-9][a-z0-9_-]*"
                        />
                      </Field>
                      <Field
                        label="Account label"
                        hint="optional display note; OAuth credentials belong to each source"
                      >
                        <Input
                          value={workspace().account_label || ''}
                          onChange={(event) =>
                            changeWorkspace(index(), {
                              account_label: event.target.value || null,
                            })
                          }
                          maxLength={128}
                          placeholder="e.g. Nifty League"
                        />
                      </Field>
                    </SettingsAccordionContent>
                  </SettingsAccordionItem>
                </SettingsAccordion>
              </SettingsCard>
            )
          }}
        </Index>
      </div>
      {logoError() && (
        <p class="settings-inline-error" role="alert">
          {logoError()}
        </p>
      )}
      <Button
        variant="secondary"
        type="button"
        disabled={props.settings.workspaces.length >= 128}
        onClick={addWorkspace}
      >
        <Plus size={15} /> Add workspace ({props.settings.workspaces.length}/128)
      </Button>
    </SettingsSection>
  )
}
function SafeMarkdown(incoming: { text: string }) {
  const props = incoming
  return <div class="safe-markdown">{renderMarkdownToNodes(props.text)}</div>
}
function renderMarkdownToNodes(text: string): JSX.Element[] {
  const nodes: JSX.Element[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let currentList: {
    ordered: boolean
    items: string[]
  } | null = null
  const closeList = () => {
    if (!currentList) return
    if (currentList.ordered) {
      nodes.push(
        <ol>
          <For each={currentList.items}>
            {(item) => (
              // markdown list items are positional
              <li>{parseInlineMarkdown(item)}</li>
            )}
          </For>
        </ol>
      )
    } else {
      nodes.push(
        <ul>
          <For each={currentList.items}>
            {(item) => (
              // markdown list items are positional
              <li>{parseInlineMarkdown(item)}</li>
            )}
          </For>
        </ul>
      )
    }
    currentList = null
  }
  for (const line of lines) {
    const trimmed = line.trimEnd()
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    const ordered = trimmed.match(/^\d+\.\s+(.+)$/)
    if (!trimmed) {
      closeList()
      continue
    }
    if (heading) {
      closeList()
      const level = heading[1].length
      const title = parseInlineMarkdown(heading[2])
      if (level === 1) nodes.push(<h1>{title}</h1>)
      else if (level === 2) nodes.push(<h2>{title}</h2>)
      else nodes.push(<h3>{title}</h3>)
      continue
    }
    if (bullet) {
      if (!currentList || currentList.ordered) {
        closeList()
        currentList = {
          ordered: false,
          items: [],
        }
      }
      currentList.items.push(bullet[1])
      continue
    }
    if (ordered) {
      if (!currentList || !currentList.ordered) {
        closeList()
        currentList = {
          ordered: true,
          items: [],
        }
      }
      currentList.items.push(ordered[1])
      continue
    }
    closeList()
    nodes.push(<p>{parseInlineMarkdown(trimmed)}</p>)
  }
  closeList()
  return nodes
}
function parseInlineMarkdown(value: string): JSX.Element[] {
  const parts = value.split(/(`[^`]*`|\[[^\]]+\]\([^)]+\))/g)
  const nodes: JSX.Element[] = []
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(<code>{part.slice(1, -1)}</code>)
      continue
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      const url = safeMarkdownUrl(link[2])
      if (url) {
        nodes.push(
          <a href={url} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        )
      } else {
        nodes.push(<span>{part}</span>)
      }
      continue
    }
    nodes.push(<span>{part}</span>)
  }
  return nodes
}
function safeMarkdownUrl(value: string): string | null {
  try {
    const candidate = new URL(value)
    if (candidate.protocol === 'http:' || candidate.protocol === 'https:') return candidate.href
    return null
  } catch {
    return null
  }
}
type ProviderValue = DesktopSettings['embedding'] | DesktopSettings['query']
type ModelChoice = {
  value: string
  label: string
}

/** Provider-advertised catalog captured for one provider kind. */
type ProviderModelsState = {
  kind: ProviderModelKind
  /** Normalized base URL the catalog was fetched from. */
  provider: string
  mode: 'local' | 'cloud'
  key_env: string | null
  models: ProviderModelEntry[]
  truncated: boolean
}
function normalizeProviderUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}
function EmbeddingSection(incoming: {
  settings: DesktopSettings
  secretValues: Record<string, string>
  onSecret: (values: Record<string, string>) => void
  clearedSecrets: Set<string>
  onClearSecret: (name: string) => void
  update: (change: (draft: DesktopSettings) => DesktopSettings) => void
  advertisedModels: readonly ModelChoice[] | null
  modelsLoading: boolean
  modelsError: string
  modelsTruncated: boolean
  onRefreshModels: () => void
}) {
  const props = incoming
  const setEmbedding = (embedding: DesktopSettings['embedding']) =>
    props.update((current) => ({
      ...current,
      embedding,
    }))
  return (
    <ProviderSection
      title="Embedding model"
      description="Local Qwen maximizes privacy and cache reuse. Cloud endpoints must use HTTPS."
      provider={props.settings.embedding}
      secrets={props.settings.secrets}
      secretValues={props.secretValues}
      onSecret={props.onSecret}
      clearedSecrets={props.clearedSecrets}
      onClearSecret={props.onClearSecret}
      update={setEmbedding}
      advertisedModels={props.advertisedModels}
      modelsLoading={props.modelsLoading}
      modelsError={props.modelsError}
      modelsTruncated={props.modelsTruncated}
      onRefreshModels={props.onRefreshModels}
      modelControl="select"
      modelCatalog={
        props.settings.embedding.provider === 'local'
          ? [
              {
                value: 'Qwen/Qwen3-Embedding-0.6B',
                label: 'Qwen/Qwen3-Embedding-0.6B',
              },
              {
                value: 'Qwen/Qwen3-Embedding-4B',
                label: 'Qwen/Qwen3-Embedding-4B',
              },
            ]
          : []
      }
    >
      <div class="settings-note">
        <strong>Local service command:</strong>{' '}
        {props.settings.embedding_service_program
          ? `${props.settings.embedding_service_program} (managed in config.toml)`
          : 'automatic command derived from the model and loopback endpoint'}
        . Desktop preserves explicit executable commands but does not edit shell command arrays.
      </div>
      <SettingsFieldGroup class="form-grid compact">
        <NumberField
          label="Vector dimension"
          value={props.settings.embedding.dimension}
          min={1}
          max={65536}
          onChange={(dimension) =>
            setEmbedding({
              ...props.settings.embedding,
              dimension,
            })
          }
        />
        <NumberField
          label="Cache entries"
          hint="0 disables new embedding-cache writes"
          value={props.settings.embedding.cache_max_entries}
          min={0}
          max={5000000}
          onChange={(cache_max_entries) =>
            setEmbedding({
              ...props.settings.embedding,
              cache_max_entries,
            })
          }
        />
        <NumberField
          label="Request timeout"
          value={props.settings.embedding.request_timeout_seconds}
          min={1}
          max={3600}
          onChange={(request_timeout_seconds) =>
            setEmbedding({
              ...props.settings.embedding,
              request_timeout_seconds,
            })
          }
        />
        <NumberField
          label="Request concurrency"
          value={props.settings.embedding.request_concurrency}
          min={1}
          max={64}
          onChange={(request_concurrency) =>
            setEmbedding({
              ...props.settings.embedding,
              request_concurrency,
            })
          }
        />
        <NumberField
          label="Startup timeout"
          value={props.settings.embedding.startup_timeout_seconds}
          min={1}
          max={3600}
          onChange={(startup_timeout_seconds) =>
            setEmbedding({
              ...props.settings.embedding,
              startup_timeout_seconds,
            })
          }
        />
        <NumberField
          label="Memory limit (MB)"
          value={props.settings.embedding.memory_limit_mb}
          min={256}
          max={262144}
          onChange={(memory_limit_mb) =>
            setEmbedding({
              ...props.settings.embedding,
              memory_limit_mb,
            })
          }
        />
      </SettingsFieldGroup>
    </ProviderSection>
  )
}
function ProviderSection<T extends ProviderValue>(incoming: {
  title: string
  description: string
  provider: T
  secrets: DesktopSettings['secrets']
  secretValues: Record<string, string>
  onSecret: (values: Record<string, string>) => void
  clearedSecrets: Set<string>
  onClearSecret: (name: string) => void
  modelCatalog: readonly ModelChoice[]
  /** Provider-advertised models; null when unavailable or stale. */
  advertisedModels: readonly ModelChoice[] | null
  modelsLoading: boolean
  modelsError: string
  modelsTruncated: boolean
  onRefreshModels: () => void
  modelControl?: 'combobox' | 'select'
  update: (provider: T) => void
  children?: JSX.Element
}) {
  const props = mergeProps(
    {
      modelControl: 'combobox',
    },
    incoming
  )
  const confirm = useSettingsConfirm()
  const modelFieldId = createUniqueId()
  const secretFieldId = createUniqueId()
  const secret = () =>
    props.provider.api_key_env
      ? props.secrets.find((item) => item.name === props.provider.api_key_env)
      : undefined
  // Provider-advertised models take precedence while available. Local Qwen
  // presets are the only static catalog because they are Cortana's supported
  // bundled path; cloud and local query model ids must come from the provider
  // or remain explicit custom values rather than aging silently in the UI.
  const activeCatalog = () =>
    props.advertisedModels && props.advertisedModels.length > 0
      ? props.advertisedModels
      : props.modelCatalog
  const catalogValues = () => activeCatalog().map((candidate) => candidate.value)
  // The select mode is derived from the active catalog so a provider refresh
  // can never leave a stale select visible: when the current model is not in
  // the active catalog the custom input is shown with the value preserved.
  // The explicit override remembers only a user's own catalog/custom choice
  // and is cleared whenever the available catalog changes.
  const [explicitModelMode, setExplicitModelMode] = createSignal<'catalog' | 'custom' | null>(null)
  const modelMode = (): 'catalog' | 'custom' =>
    explicitModelMode() ?? (catalogValues().includes(props.provider.model) ? 'catalog' : 'custom')
  const catalogKey = () => catalogValues().join('\u0000')
  const [previousCatalogKey, setPreviousCatalogKey] = createSignal(catalogKey())
  createEffect(() => {
    const key = catalogKey()
    if (key !== previousCatalogKey()) {
      setPreviousCatalogKey(key)
      setExplicitModelMode(null)
    }
  })
  const modelInput = () => (
    <Field label="Model" controlId={modelFieldId}>
      <Input
        id={modelFieldId}
        aria-label="Model"
        value={props.provider.model}
        onChange={(event) =>
          props.update({
            ...props.provider,
            model: event.target.value,
          })
        }
        required
        maxLength={256}
      />
    </Field>
  )
  const modelSelect = () => (
    <Field label="Model" controlId={modelFieldId}>
      <Suspense
        fallback={
          <Input
            id={modelFieldId}
            aria-label="Model catalog"
            value={props.provider.model}
            readOnly
          />
        }
      >
        <SettingsCombobox
          id={modelFieldId}
          aria-label="Model catalog"
          class="settings-model-control"
          value={modelMode() === 'catalog' ? props.provider.model : 'custom'}
          choices={[
            ...activeCatalog(),
            {
              value: 'custom',
              label: 'Custom',
            },
          ]}
          onValueChange={(selected) => {
            if (selected === 'custom') {
              setExplicitModelMode('custom')
              return
            }
            if (catalogValues().includes(selected)) {
              setExplicitModelMode('catalog')
              props.update({
                ...props.provider,
                model: selected,
              })
            } else {
              // Unmatched selections (programmatic or label-based) open the
              // custom field with the current model preserved.
              setExplicitModelMode('custom')
            }
          }}
        />
      </Suspense>
    </Field>
  )
  const dropdownCatalog = () =>
    catalogValues().includes(props.provider.model)
      ? activeCatalog()
      : [
          {
            value: props.provider.model,
            label: props.provider.model,
          },
          ...activeCatalog(),
        ]
  const modelDropdown = () => (
    <Field label="Model" controlId={modelFieldId}>
      <Select
        id={modelFieldId}
        aria-label="Model catalog"
        class="settings-model-control"
        value={props.provider.model}
        required
        onChange={(event) =>
          props.update({
            ...props.provider,
            model: event.target.value,
          })
        }
      >
        <For each={dropdownCatalog()}>
          {(candidate) => <option value={candidate.value}>{candidate.label}</option>}
        </For>
      </Select>
    </Field>
  )
  const modelControls = (
    <div class="model-field">
      {props.modelControl === 'select'
        ? modelDropdown()
        : modelMode() === 'custom'
          ? modelInput()
          : modelSelect()}
      <div class="model-refresh">
        <Button
          variant="secondary"
          type="button"
          aria-label={`Refresh ${props.title} models from provider`}
          disabled={props.modelsLoading}
          onClick={props.onRefreshModels}
        >
          {props.modelsLoading ? <LoaderCircle class="spin" size={14} /> : <RefreshCw size={14} />}{' '}
          Refresh models
        </Button>
      </div>
      {props.modelsError && (
        <p class="settings-inline-error" role="alert">
          {props.modelsError}
        </p>
      )}
      {props.advertisedModels && props.advertisedModels.length > 0 && (
        <small class="model-note">
          {props.advertisedModels.length} model{props.advertisedModels.length === 1 ? '' : 's'}{' '}
          advertised by the provider{props.modelsTruncated ? ' (first 512 shown)' : ''}. A current
          model that is not advertised stays selected in the custom field.
        </small>
      )}
    </div>
  )
  return (
    <SettingsSection title={props.title} description={props.description}>
      <SettingsFieldGroup class="form-grid">
        <Field label="Provider">
          <Select
            class="settings-provider-control"
            value={props.provider.provider}
            onChange={(event) => {
              const nextProvider = event.target.value as 'local' | 'cloud'
              const loopback = isLoopbackUrl(props.provider.base_url)
              const base_url =
                nextProvider === 'cloud' && loopback
                  ? 'https://api.openai.com/v1'
                  : nextProvider === 'local' && !loopback
                    ? props.title.startsWith('Embedding')
                      ? 'http://127.0.0.1:6999/v1'
                      : 'http://127.0.0.1:8008/v1'
                    : props.provider.base_url
              props.update({
                ...props.provider,
                provider: nextProvider,
                base_url,
              })
            }}
          >
            <option value="local">Local</option>
            <option value="cloud">Cloud</option>
          </Select>
        </Field>
        {modelControls}
        <Field label="OpenAI-compatible endpoint" wide>
          <Input
            type="url"
            value={props.provider.base_url}
            onChange={(event) =>
              props.update({
                ...props.provider,
                base_url: event.target.value,
              })
            }
            required
          />
        </Field>
        <Field
          label="API key variable"
          hint={
            secret()?.configured && !props.clearedSecrets.has(secret()!.name)
              ? `Configured via ${secret()!.source}`
              : 'Optional for local providers'
          }
        >
          <Input
            value={props.provider.api_key_env || ''}
            onChange={(event) =>
              props.update({
                ...props.provider,
                api_key_env: event.target.value || null,
              })
            }
            pattern="[A-Z_][A-Z0-9_]*"
            placeholder="CORTANA_PROVIDER_API_KEY"
          />
        </Field>
        <Field
          label="New API key"
          hint="write-only; leave blank to keep existing"
          controlId={secretFieldId}
        >
          <Suspense
            fallback={
              <Input
                id={secretFieldId}
                aria-label="New API key"
                aria-describedby={`${secretFieldId}-description`}
                type="password"
                autocomplete="new-password"
                value=""
                disabled
              />
            }
          >
            <SettingsSecretInputGroup
              id={secretFieldId}
              aria-describedby={`${secretFieldId}-description`}
              value={
                props.provider.api_key_env
                  ? props.secretValues[props.provider.api_key_env] || ''
                  : ''
              }
              disabled={!props.provider.api_key_env}
              onChange={(event) => {
                if (!props.provider.api_key_env) return
                props.onSecret({
                  ...props.secretValues,
                  [props.provider.api_key_env]: (event.target as HTMLInputElement).value,
                })
              }}
              onClear={
                props.provider.api_key_env &&
                secret()?.configured &&
                !props.clearedSecrets.has(secret()!.name)
                  ? () =>
                      applyConfirmed(
                        confirm(
                          'Clear the stored provider API key? The change remains a draft until you save settings.'
                        ),
                        () => props.onClearSecret(props.provider.api_key_env!)
                      )
                  : undefined
              }
            />
          </Suspense>
        </Field>
      </SettingsFieldGroup>
      {props.children}
    </SettingsSection>
  )
}
function QuerySection(incoming: {
  settings: DesktopSettings
  secrets: DesktopSettings['secrets']
  secretValues: Record<string, string>
  onSecret: (values: Record<string, string>) => void
  clearedSecrets: Set<string>
  onClearSecret: (name: string) => void
  update: (change: (draft: DesktopSettings) => DesktopSettings) => void
  advertisedModels: readonly ModelChoice[] | null
  modelsLoading: boolean
  modelsError: string
  modelsTruncated: boolean
  onRefreshModels: () => void
}) {
  const props = incoming
  const setQuery = (query: DesktopSettings['query']) =>
    props.update((current) => ({
      ...current,
      query,
    }))
  return (
    <ProviderSection
      title="Query and answer model"
      description="Retrieval always works locally. Enable synthesis to create grounded answers with citations."
      provider={props.settings.query}
      secrets={props.secrets}
      secretValues={props.secretValues}
      onSecret={props.onSecret}
      clearedSecrets={props.clearedSecrets}
      onClearSecret={props.onClearSecret}
      update={setQuery}
      advertisedModels={props.advertisedModels}
      modelsLoading={props.modelsLoading}
      modelsError={props.modelsError}
      modelsTruncated={props.modelsTruncated}
      onRefreshModels={props.onRefreshModels}
      modelControl="select"
      modelCatalog={[]}
    >
      <label class="toggle-row">
        <SettingsSwitch
          aria-label="Enable answer synthesis"
          checked={props.settings.query.synthesis_enabled}
          onChange={(event) =>
            setQuery({
              ...props.settings.query,
              synthesis_enabled: event.target.checked,
            })
          }
        />
        <span>
          <strong>Grounded answer synthesis</strong>
          <small>
            Uses retrieved evidence and validates citation indices before returning an answer.
          </small>
        </span>
      </label>
      <SettingsFieldGroup class="form-grid compact">
        <NumberField
          label="Planned queries"
          value={props.settings.query.max_planned_queries}
          min={1}
          max={8}
          onChange={(max_planned_queries) =>
            setQuery({
              ...props.settings.query,
              max_planned_queries,
            })
          }
        />
        <NumberField
          label="Retrieval candidates"
          value={props.settings.query.retrieval_limit}
          min={1}
          max={100}
          onChange={(retrieval_limit) =>
            setQuery({
              ...props.settings.query,
              retrieval_limit,
            })
          }
        />
        <NumberField
          label="Evidence results"
          value={props.settings.query.result_limit}
          min={1}
          max={50}
          onChange={(result_limit) =>
            setQuery({
              ...props.settings.query,
              result_limit,
            })
          }
        />
        <NumberField
          label="Context tokens"
          value={props.settings.query.context_tokens}
          min={256}
          max={131072}
          onChange={(context_tokens) =>
            setQuery({
              ...props.settings.query,
              context_tokens,
            })
          }
        />
        <NumberField
          label="Output tokens"
          value={props.settings.query.output_tokens}
          min={64}
          max={32768}
          onChange={(output_tokens) =>
            setQuery({
              ...props.settings.query,
              output_tokens,
            })
          }
        />
        <NumberField
          label="Request timeout"
          value={props.settings.query.request_timeout_seconds}
          min={1}
          max={600}
          onChange={(request_timeout_seconds) =>
            setQuery({
              ...props.settings.query,
              request_timeout_seconds,
            })
          }
        />
        <NumberField
          label="Answer timeout"
          value={props.settings.query.answer_timeout_seconds}
          min={1}
          max={600}
          onChange={(answer_timeout_seconds) =>
            setQuery({
              ...props.settings.query,
              answer_timeout_seconds,
            })
          }
        />
        <NumberField
          label="Request concurrency"
          value={props.settings.query.request_concurrency}
          min={1}
          max={32}
          onChange={(request_concurrency) =>
            setQuery({
              ...props.settings.query,
              request_concurrency,
            })
          }
        />
        <NumberField
          label="Cache entries"
          hint="0 disables new answer-cache writes"
          value={props.settings.query.cache_max_entries}
          min={0}
          max={1000000}
          onChange={(cache_max_entries) =>
            setQuery({
              ...props.settings.query,
              cache_max_entries,
            })
          }
        />
        <NumberField
          label="Cache lifetime (seconds)"
          hint="0 disables answer-cache reads"
          value={props.settings.query.cache_ttl_seconds}
          min={0}
          max={604800}
          onChange={(cache_ttl_seconds) =>
            setQuery({
              ...props.settings.query,
              cache_ttl_seconds,
            })
          }
        />
      </SettingsFieldGroup>
    </ProviderSection>
  )
}
function IngestionSection(incoming: SettingsSectionProps) {
  const props = incoming
  const setIngestion = (patch: Partial<DesktopSettings['ingestion']>) =>
    props.update((current) => ({
      ...current,
      ingestion: {
        ...current.ingestion,
        ...patch,
      },
    }))
  return (
    <SettingsSection
      title="Ingestion safety budgets"
      description="These hard limits protect the machine even when a connector returns more data than expected. Scheduled sync remains opt-in."
    >
      <SettingsFieldGroup class="form-grid compact">
        <NumberField
          label="Documents per source"
          value={props.settings.ingestion.max_documents_per_source}
          min={1}
          max={1000000}
          onChange={(max_documents_per_source) =>
            setIngestion({
              max_documents_per_source,
            })
          }
        />
        <NumberField
          label="Bytes per source"
          value={props.settings.ingestion.max_bytes_per_source}
          min={1024}
          max={1099511627776}
          onChange={(max_bytes_per_source) =>
            setIngestion({
              max_bytes_per_source,
            })
          }
        />
        <NumberField
          label="Duration seconds"
          value={props.settings.ingestion.max_duration_seconds}
          min={1}
          max={86400}
          onChange={(max_duration_seconds) =>
            setIngestion({
              max_duration_seconds,
            })
          }
        />
        <NumberField
          label="Document batch size"
          value={props.settings.ingestion.document_batch_size}
          min={1}
          max={2048}
          onChange={(document_batch_size) =>
            setIngestion({
              document_batch_size,
            })
          }
        />
        <NumberField
          label="Request concurrency"
          value={props.settings.ingestion.request_concurrency}
          min={1}
          max={32}
          onChange={(request_concurrency) =>
            setIngestion({
              request_concurrency,
            })
          }
        />
        <NumberField
          label="Sync freshness (hours)"
          hint="0 disables stale-sync warnings in the source health view"
          value={props.settings.ingestion.sync_freshness_hours}
          min={0}
          max={8760}
          onChange={(sync_freshness_hours) =>
            setIngestion({
              sync_freshness_hours,
            })
          }
        />
      </SettingsFieldGroup>
      <SettingsAlert class="safety-note">
        <AlertTriangle size={16} />
        <span>
          Saving these values does not start a sync. Source authorization and bounded sync controls
          are managed separately.
        </span>
      </SettingsAlert>
    </SettingsSection>
  )
}
