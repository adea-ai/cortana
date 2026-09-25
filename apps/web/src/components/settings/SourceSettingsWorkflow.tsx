import {
  AlertTriangle,
  CircleStop,
  ExternalLink,
  File,
  FolderOpen,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from 'lucide-solid'
import { createEffect, createSignal, onCleanup, For, Index, Show } from 'solid-js'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../shadcn/dialog'
import { WorkspaceLogo } from '../../workspaceLogos'
import { SourceIcon } from '../sourceIcons'
import { sourceDisplayName } from '../sourceIconData'
import {
  cancelDesktopSourceValidation,
  getDesktopSourceValidation,
  listDesktopBuzzCommunities,
  listDesktopDiscordChannels,
  listDesktopDiscordServers,
  listDesktopGithubRepositories,
  listDesktopSlackWorkspaces,
  openDesktopSourceSetup,
  pickDesktopPath,
  planDesktopInitialSync,
  startDesktopInitialSync,
  startDesktopSourceAuthorization,
  startDesktopSourceConnectionCheck,
  startDesktopSourceTrialSync,
  startDesktopSourceValidation,
} from '../../api'
import { INITIAL_SYNC_BUDGETS } from '../../types'
import type {
  BuzzCommunitySummary,
  DesktopInitialSyncPlan,
  DesktopSettings,
  DesktopSourceJob,
  DiscordGuildChannels,
  DiscordServerSummary,
  GithubRepositorySummary,
  InitialSyncBudget,
  SlackWorkspaceSummary,
  SourceKind,
  SourceSettings,
} from '../../types'
import { useSettingsConfirm } from './SettingsConfirm'
import { Field, SettingsSection, type SettingsSectionProps } from './SettingsLayout'
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
  SettingsRadio,
  SettingsRadioGroup,
  SettingsSelect as Select,
  SettingsSwitch,
  SettingsTabs,
  SettingsTabsContent,
  SettingsTabsList,
  SettingsTabsTrigger,
  SettingsTextarea as Textarea,
} from './SettingsSurface'
import { StatusGlyph } from './SettingsWorkflowShared'
import { applyConfirmed, useDesktopForeground } from './SettingsWorkflowUtils'
const SOURCE_KINDS: Array<{
  value: SourceKind
  label: string
}> = [
  {
    value: 'filesystem',
    label: 'Files and code',
  },
  {
    value: 'apple-notes',
    label: 'Apple Notes',
  },
  {
    value: 'buzz',
    label: 'Buzz',
  },
  {
    value: 'google-drive',
    label: 'Google Drive',
  },
  {
    value: 'gmail',
    label: 'Gmail',
  },
  {
    value: 'google-calendar',
    label: 'Google Calendar',
  },
  {
    value: 'github',
    label: 'GitHub code',
  },
  {
    value: 'slack',
    label: 'Slack',
  },
  {
    value: 'discord',
    label: 'Discord',
  },
]
const UNASSIGNED_WORKSPACE = '__unassigned__'
function sourceJobOperationLabel(operation: DesktopSourceJob['operation']): string {
  return {
    'connection-check': 'Connection check',
    validation: 'Budget validation',
    authorization: 'Authorization',
    'trial-sync': 'Trial sync',
    'initial-sync': 'Initial sync',
  }[operation]
}
function initialSourceWorkspace(settings: DesktopSettings): string {
  const workspaceIds = new Set(settings.workspaces.map((workspace) => workspace.id))
  if (settings.sources.some((source) => !workspaceIds.has(source.project))) {
    return UNASSIGNED_WORKSPACE
  }
  return (
    settings.workspaces.find((workspace) =>
      settings.sources.some((source) => source.project === workspace.id)
    )?.id ||
    settings.workspaces[0]?.id ||
    UNASSIGNED_WORKSPACE
  )
}
export function SourcesSection(
  incoming: SettingsSectionProps & {
    canValidate: boolean
    secretValues: Record<string, string>
    onSecret: (values: Record<string, string>) => void
    clearedSecrets: Set<string>
    onClearSecret: (name: string) => void
    onJob?: (job: DesktopSourceJob) => void
    sourceJobs?: DesktopSourceJob[]
    onPersistSources?: (sources: SourceSettings[]) => Promise<DesktopSettings>
  }
) {
  const props = incoming
  const confirm = useSettingsConfirm()
  const [job, setJob] = createSignal<DesktopSourceJob | null>(null)
  const applyJob = (next: DesktopSourceJob) => {
    setJob(next)
    props.onJob?.(next)
  }
  const [error, setError] = createSignal('')
  // Per-source actions (setup, authorize, test, sync) all have to run against
  // saved configuration. Hiding them while the form is dirty left an empty row
  // with no hint that anything was missing, so the row keeps them and explains
  // the reason instead.
  const actionsBlocked = () => Boolean(activeJob())
  const actionsReason = () =>
    props.canValidate ? null : 'Save source changes before using these actions'
  const [githubRepositories, setGithubRepositories] = createSignal<
    Record<
      string,
      {
        items: GithubRepositorySummary[]
        truncated: boolean
      }
    >
  >({})
  const [githubRepositoriesLoading, setGithubRepositoriesLoading] = createSignal<string | null>(
    null
  )
  const [discordChannels, setDiscordChannels] = createSignal<
    Record<
      string,
      {
        guilds: DiscordGuildChannels[]
        truncated: boolean
      }
    >
  >({})
  const [discordChannelsLoading, setDiscordChannelsLoading] = createSignal<string | null>(null)
  const [discordServers, setDiscordServers] = createSignal<
    Record<
      string,
      {
        guilds: DiscordServerSummary[]
        truncated: boolean
      }
    >
  >({})
  const [discordServersLoading, setDiscordServersLoading] = createSignal<string | null>(null)
  const [slackWorkspaces, setSlackWorkspaces] = createSignal<
    Record<
      string,
      {
        teams: SlackWorkspaceSummary[]
        truncated: boolean
      }
    >
  >({})
  const [slackWorkspacesLoading, setSlackWorkspacesLoading] = createSignal<string | null>(null)
  const [buzzCommunities, setBuzzCommunities] = createSignal<
    Record<
      string,
      {
        communities: BuzzCommunitySummary[]
        truncated: boolean
      }
    >
  >({})
  const [buzzCommunitiesLoading, setBuzzCommunitiesLoading] = createSignal<string | null>(null)
  const [sourceWorkspace, setSourceWorkspace] = createSignal(
    (() => initialSourceWorkspace(props.settings))()
  )
  const [sourceTypeOpen, setSourceTypeOpen] = createSignal(false)
  const [sourceType, setSourceType] = createSignal<SourceKind>('filesystem')
  const [connectingSource, setConnectingSource] = createSignal(false)
  const [initialSync, setInitialSync] = createSignal<{
    source: string
    budget: InitialSyncBudget
    plan: DesktopInitialSyncPlan | null
    planning: boolean
    flowError: string
  } | null>(null)
  let validationPlanKey = ''
  const sharedJobIds = new Set<string>()
  const cancelInFlight = new Set<string>()
  const foreground = useDesktopForeground()
  const workspaceIds = () => new Set(props.settings.workspaces.map((workspace) => workspace.id))
  const unassignedSourceCount = () =>
    props.settings.sources.filter((source) => !workspaceIds().has(source.project)).length
  const sourceWorkspaceIsAssigned = () => workspaceIds().has(sourceWorkspace())
  const visibleSources = () =>
    props.settings.sources
      .map((source, index) => ({
        source,
        index,
      }))
      .filter(({ source }) =>
        sourceWorkspace() === UNASSIGNED_WORKSPACE
          ? !workspaceIds().has(source.project)
          : source.project === sourceWorkspace()
      )
  const selectedWorkspace = () =>
    props.settings.workspaces.find(({ id }) => id === sourceWorkspace())
  const workspaceResetKey = () =>
    [
      sourceWorkspace(),
      sourceWorkspaceIsAssigned(),
      unassignedSourceCount(),
      props.settings.workspaces.map((workspace) => workspace.id).join(' '),
    ].join(' ')
  const [previousWorkspaceResetKey, setPreviousWorkspaceResetKey] =
    createSignal(workspaceResetKey())
  createEffect(() => {
    const nextKey = workspaceResetKey()
    if (nextKey === previousWorkspaceResetKey()) return
    setPreviousWorkspaceResetKey(nextKey)
    if (
      !sourceWorkspaceIsAssigned() &&
      !(sourceWorkspace() === UNASSIGNED_WORKSPACE && unassignedSourceCount())
    ) {
      setSourceWorkspace(initialSourceWorkspace(props.settings))
    }
  })

  // In the full Desktop shell, App owns one poller for the source-job list so
  // SourcePanel, the tray/status bar, and Settings all observe the same
  // snapshots. A standalone SettingsView still uses its local observer.
  createEffect(() => {
    if (!props.sourceJobs) return
    const currentIds = new Set(props.sourceJobs.map((candidate) => candidate.id))
    props.sourceJobs.forEach((candidate) => sharedJobIds.add(candidate.id))
    for (const id of sharedJobIds) {
      if (!currentIds.has(id) && id !== job()?.id) sharedJobIds.delete(id)
    }
    // A job may have started while Settings was unmounted. Adopt the newest
    // recovered snapshot so this section can show and cancel it immediately,
    // instead of only locking the editor in the background.
    if (!job()) {
      // adopt the shared poller's recovered job snapshot
      if (props.sourceJobs[0]) setJob(props.sourceJobs[0])
      return
    }
    const next = props.sourceJobs.find((candidate) => candidate.id === job()!.id)
    if (next && next !== job()) {
      // reconcile with the shared job registry snapshot
      setJob(next)
    } else if (!next && sharedJobIds.has(job()!.id)) {
      sharedJobIds.delete(job()!.id)
      setJob(null)
    }
  })
  createEffect(() => {
    if (props.sourceJobs || !foreground()) return
    if (!job() || !['running', 'cancelling'].includes(job()!.status)) return
    let active = true
    const timer = window.setTimeout(() => {
      void getDesktopSourceValidation(job()!.id)
        .then((result) => {
          if (!active) return null
          applyJob(result)
          return null
        })
        .catch((caught: unknown) => {
          if (active) {
            setError(caught instanceof Error ? caught.message : 'Source validation status failed')
          }
        })
    }, 700)
    return onCleanup(() => {
      active = false
      window.clearTimeout(timer)
    })
  })
  const activeJob = () =>
    (job() && ['running', 'cancelling'].includes(job()!.status) ? job() : undefined) ??
    props.sourceJobs?.find((candidate) => ['running', 'cancelling'].includes(candidate.status))
  const observedJob = () => activeJob() ?? job() ?? props.sourceJobs?.[0]
  const initialSyncSource = () =>
    initialSync()
      ? props.settings.sources.find((item) => item.name === initialSync()!.source)
      : undefined
  const requestPlan = async (source: string, budget: InitialSyncBudget) => {
    setInitialSync((current) =>
      current && current.source === source
        ? {
            ...current,
            budget,
            plan: null,
            planning: true,
            flowError: '',
          }
        : current
    )
    try {
      const plan = await planDesktopInitialSync(source, budget)
      setInitialSync((current) =>
        current && current.source === source && current.budget === budget
          ? {
              ...current,
              plan,
              planning: false,
              flowError: '',
            }
          : current
      )
    } catch (caught) {
      setInitialSync((current) =>
        current && current.source === source
          ? {
              ...current,
              planning: false,
              flowError:
                caught instanceof Error ? caught.message : 'Initial sync plan request failed',
            }
          : current
      )
    }
  }

  // Whether polling is owned by this section or by App, a successful
  // validation must unlock a fresh plan for the selected initial-sync budget.
  // Keeping this transition here avoids coupling the flow to one polling
  // implementation and prevents duplicate plan requests on rerenders.
  createEffect(() => {
    if (
      !observedJob() ||
      observedJob()!.status !== 'succeeded' ||
      observedJob()!.operation !== 'validation' ||
      !initialSync() ||
      initialSync()!.source !== observedJob()!.source
    ) {
      return
    }
    const key = `${observedJob()!.id}:${initialSync()!.budget}`
    if (validationPlanKey === key) return
    validationPlanKey = key
    void requestPlan(observedJob()!.source, initialSync()!.budget)
  })
  const openInitialSync = (source: SourceSettings, budget: InitialSyncBudget = 'small') => {
    setInitialSync({
      source: source.name,
      budget,
      plan: null,
      planning: false,
      flowError: '',
    })
    void requestPlan(source.name, budget)
  }
  const validateInitialSyncBudget = async (source: SourceSettings) => {
    if (!initialSync()) return
    if (!props.canValidate) {
      setError(
        'Save source changes before checking the connection so the native runtime uses this exact config.'
      )
      return
    }
    const budget = initialSync()!.budget
    if (
      !(await confirm(
        `Validate ${source.name} for an initial sync budget?\n\nCortana may read up to ${budgetLabel(budget)} without embedding, indexing, reconciling, or starting a sync.`
      ))
    ) {
      return
    }
    setError('')
    try {
      applyJob(await startDesktopSourceValidation(source.name, budget))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Budget validation failed to start')
    }
  }
  const startInitialSync = async (source: SourceSettings) => {
    if (!initialSync()?.plan) return
    const plan = initialSync()!.plan!
    if (
      !(await confirm(
        `Start a guarded initial sync for ${source.name}?\n\nIt may embed and index at most ${plan.budget_documents} documents or ${mebibytes(plan.budget_bytes)} MiB for up to ${minutes(plan.budget_seconds)} minutes. It requires a matching successful validation, and it will not delete or reconcile existing records. Committed batches remain indexed if you cancel.`
      ))
    ) {
      return
    }
    setError('')
    try {
      const next = await startDesktopInitialSync(source.name, plan.budget, plan.plan_id)
      applyJob(next)
      setInitialSync(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Initial sync failed to start')
    }
  }
  const changeSource = (index: number, patch: Partial<SourceSettings>) => {
    const current = props.settings.sources[index]
    if (activeJob() && current?.name === activeJob()!.source) return
    // A native initial-sync plan is tied to the exact saved source config.
    // Editing or renaming that source invalidates the plan; force a fresh
    // plan/validation rather than leaving an old plan ID in the UI.
    if (initialSync() && current?.name === initialSync()!.source) setInitialSync(null)
    props.update((previous) => ({
      ...previous,
      sources: previous.sources.map((source, position) =>
        position === index
          ? {
              ...source,
              ...patch,
            }
          : source
      ),
    }))
  }
  const addSource = (kind: SourceKind, root: string | null = null) => {
    const targetWorkspace = sourceWorkspaceIsAssigned()
      ? sourceWorkspace()
      : props.settings.workspaces[0]?.id || 'personal'
    if (!sourceWorkspaceIsAssigned()) setSourceWorkspace(targetWorkspace)
    props.update((current) => {
      const source = newSource(current, targetWorkspace, kind)
      if (root) {
        source.root = root
        source.name = nextAvailablePathIdentifier(
          identifierFromPath(root),
          current.sources.map((item) => item.name)
        )
      }
      return {
        ...current,
        sources: [...current.sources, source],
      }
    })
    setSourceTypeOpen(false)
  }
  const addFilesystemSource = async (picker: 'directory' | 'source-file') => {
    setError('')
    try {
      const root = await pickDesktopPath(picker)
      if (root) addSource('filesystem', root)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'File selection failed')
    }
  }
  const connectProviderSource = async (kind: SourceKind) => {
    if (!props.onPersistSources) {
      addSource(kind)
      return
    }
    if (kind === 'buzz') {
      addSource(kind)
      return
    }
    if (!props.canValidate) {
      setError('Save or discard current settings changes before connecting a provider.')
      return
    }
    setError('')
    setConnectingSource(true)
    try {
      const targetWorkspace = sourceWorkspaceIsAssigned()
        ? sourceWorkspace()
        : props.settings.workspaces[0]?.id || 'personal'
      const source = newSource(props.settings, targetWorkspace, kind)
      source.name = nextAvailablePathIdentifier(
        kind,
        props.settings.sources.map((item) => item.name)
      )
      if (kind !== 'apple-notes') {
        const oauthClientPath = await pickDesktopPath('oauth-client')
        if (!oauthClientPath) return
        const tokenPicker = isGoogleSource(kind)
          ? 'google-token'
          : kind === 'github'
            ? 'github-token'
            : kind === 'discord'
              ? 'discord-token'
              : 'slack-token'
        const tokenPath = await pickDesktopPath(tokenPicker)
        if (!tokenPath) return
        source.oauth_client_path = oauthClientPath
        source.token_path = tokenPath
        source.token_env = null
      }
      await props.onPersistSources([...props.settings.sources, source])
      setSourceTypeOpen(false)
      if (kind === 'apple-notes') await openDesktopSourceSetup(source.name)
      else applyJob(await startDesktopSourceAuthorization(source.name))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Source connection could not be started')
    } finally {
      setConnectingSource(false)
    }
  }
  const checkSourceConnection = async (source: SourceSettings) => {
    if (!props.canValidate) {
      setError(
        'Save source changes before validating so the native runtime uses this exact config.'
      )
      return
    }
    if (
      !(await confirm(
        `Check the connection for ${source.name} now?\n\nCortana checks the configured path or credentials and does not index documents, record validation coverage, or start a sync.`
      ))
    ) {
      return
    }
    setError('')
    try {
      applyJob(await startDesktopSourceConnectionCheck(source.name))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Source connection check failed to start')
    }
  }
  const authorizeSource = async (source: SourceSettings) => {
    if (!props.canValidate) {
      setError(
        'Save source changes before authorizing so the native runtime uses this exact config.'
      )
      return
    }
    const provider =
      source.kind === 'github'
        ? 'GitHub'
        : source.kind === 'discord'
          ? 'Discord'
          : source.kind === 'slack'
            ? 'Slack'
            : 'Google'
    const authorizationGuidance =
      source.kind === 'discord'
        ? 'Cortana will ask the running Discord Desktop client for approval and store the resulting token in the configured private file.'
        : source.kind === 'apple-notes'
          ? 'Cortana will ask macOS for Automation access to Apple Notes during validation; no note data is read during this setup step.'
          : 'Cortana will open the system browser and store the resulting token in the configured private file.'
    if (
      !(await confirm(
        `Authorize ${source.name} with ${provider}?\n\n${authorizationGuidance} No source data is read during authorization.`
      ))
    ) {
      return
    }
    setError('')
    try {
      applyJob(await startDesktopSourceAuthorization(source.name))
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : `${provider} authorization failed to start`
      )
    }
  }
  const discoverGithubRepositories = async (source: SourceSettings) => {
    if (!props.canValidate) {
      setError('Save source changes before discovering repositories.')
      return
    }
    setError('')
    setGithubRepositoriesLoading(source.name)
    try {
      const result = await listDesktopGithubRepositories(source.name)
      setGithubRepositories((current) => ({
        ...current,
        [source.name]: {
          items: result.repositories,
          truncated: result.truncated,
        },
      }))
      if (result.truncated) {
        setError(
          'GitHub returned more than 1,000 repositories; select from the most recently updated 1,000.'
        )
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'GitHub repository discovery failed')
    } finally {
      setGithubRepositoriesLoading(null)
    }
  }
  const toggleGithubRepository = (index: number, source: SourceSettings, fullName: string) => {
    const repositories = source.repositories.includes(fullName)
      ? source.repositories.filter((repository) => repository !== fullName)
      : [...source.repositories, fullName]
    changeSource(index, {
      repositories,
    })
  }
  const discoverDiscordChannels = async (source: SourceSettings) => {
    if (!props.canValidate) {
      setError('Save source changes before discovering channels.')
      return
    }
    setError('')
    setDiscordChannelsLoading(source.name)
    try {
      const result = await listDesktopDiscordChannels(source.name)
      setDiscordChannels((current) => ({
        ...current,
        [source.name]: {
          guilds: result.guilds,
          truncated: result.truncated,
        },
      }))
      if (result.truncated) {
        setError('Discord returned more than 100 servers; select from the first 100.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Discord channel discovery failed')
    } finally {
      setDiscordChannelsLoading(null)
    }
  }
  const toggleDiscordChannel = (index: number, source: SourceSettings, channelId: string) => {
    const channels = source.channels.includes(channelId)
      ? source.channels.filter((channel) => channel !== channelId)
      : [...source.channels, channelId]
    changeSource(index, {
      channels,
    })
  }
  const selectAllDiscordTextChannels = (
    index: number,
    source: SourceSettings,
    discovery: {
      guilds: DiscordGuildChannels[]
      truncated: boolean
    }
  ) => {
    const assignedServers = new Set(source.servers)
    const channels = discovery.guilds
      .filter((guild) => assignedServers.size === 0 || assignedServers.has(guild.id))
      .flatMap((guild) =>
        guild.channels
          .filter((channel) => channel.kind === 'text' || channel.kind === 'announcement')
          .map((channel) => channel.id)
      )
    changeSource(index, {
      channels: [...new Set(channels)],
    })
  }
  const discoverDiscordServers = async (source: SourceSettings) => {
    if (!props.canValidate) {
      setError('Save source changes before discovering servers.')
      return
    }
    setError('')
    setDiscordServersLoading(source.name)
    try {
      const result = await listDesktopDiscordServers(source.name)
      setDiscordServers((current) => ({
        ...current,
        [source.name]: {
          guilds: result.guilds,
          truncated: result.truncated,
        },
      }))
      if (result.truncated) {
        setError('Discord returned more than 100 servers; select from the first 100.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Discord server discovery failed')
    } finally {
      setDiscordServersLoading(null)
    }
  }
  const toggleDiscordServer = (index: number, source: SourceSettings, guildId: string) => {
    const servers = source.servers.includes(guildId)
      ? source.servers.filter((server) => server !== guildId)
      : [...source.servers, guildId]
    changeSource(index, {
      servers,
    })
  }
  const discoverSlackWorkspaces = async (source: SourceSettings) => {
    if (!props.canValidate) {
      setError('Save source changes before discovering workspaces.')
      return
    }
    setError('')
    setSlackWorkspacesLoading(source.name)
    try {
      const result = await listDesktopSlackWorkspaces(source.name)
      setSlackWorkspaces((current) => ({
        ...current,
        [source.name]: {
          teams: result.teams,
          truncated: result.truncated,
        },
      }))
      if (result.truncated) {
        setError('Slack returned more than 100 teams; select from the first 100.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Slack workspace discovery failed')
    } finally {
      setSlackWorkspacesLoading(null)
    }
  }
  const toggleSlackTeam = (index: number, source: SourceSettings, team: SlackWorkspaceSummary) => {
    // A Slack user token is scoped to exactly one workspace, so assigning a
    // team replaces the previous assignment instead of accumulating.
    const assigned = source.teams.includes(team.id)
    changeSource(index, {
      teams: assigned ? [] : [team.id],
      team_names: assigned ? [] : [team.name],
    })
  }
  const discoverBuzzCommunities = async (source: SourceSettings) => {
    if (!props.canValidate) {
      setError('Save source changes before discovering communities.')
      return
    }
    setError('')
    setBuzzCommunitiesLoading(source.name)
    try {
      const result = await listDesktopBuzzCommunities(source.name)
      setBuzzCommunities((current) => ({
        ...current,
        [source.name]: {
          communities: result.communities,
          truncated: result.truncated,
        },
      }))
      if (result.truncated) {
        setError('Buzz returned more than 100 communities; select from the first 100.')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Buzz community discovery failed')
    } finally {
      setBuzzCommunitiesLoading(null)
    }
  }
  const toggleBuzzCommunity = (
    index: number,
    source: SourceSettings,
    community: BuzzCommunitySummary
  ) => {
    // Community assignment is per-workspace: the checked community ids land
    // in the source's `communities` field with display names kept
    // index-aligned in `community_names`. This source belongs to exactly one
    // workspace, so the chooser is scoped to the selected workspace.
    const assigned = source.communities.includes(community.id)
    changeSource(index, {
      communities: assigned
        ? source.communities.filter((id) => id !== community.id)
        : [...source.communities, community.id],
      community_names: assigned
        ? source.community_names.filter(
            (_, position) => source.communities[position] !== community.id
          )
        : [...source.community_names, community.name],
    })
  }
  const trialSyncSource = async (source: SourceSettings) => {
    if (!props.canValidate) {
      setError('Save source changes before syncing so the native runtime uses this exact config.')
      return
    }
    if (
      !(await confirm(
        `Run a guarded trial sync for ${source.name}?\n\nThis requires a matching successful validation. It may embed and index at most 25 documents or 5 MiB for up to 5 minutes. It will not delete or reconcile existing records. Committed batches remain indexed if you cancel.`
      ))
    ) {
      return
    }
    setError('')
    try {
      applyJob(await startDesktopSourceTrialSync(source.name))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Trial sync failed to start')
    }
  }
  const openSetup = async (source: SourceSettings) => {
    if (!props.canValidate) {
      setError('Save this source before opening its account setup page.')
      return
    }
    setError('')
    try {
      await openDesktopSourceSetup(source.name)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Account setup page could not be opened')
    }
  }
  const choosePath = async (
    index: number,
    kind:
      | 'directory'
      | 'oauth-client'
      | 'google-token'
      | 'github-token'
      | 'discord-token'
      | 'slack-token',
    field: 'root' | 'token_path' | 'oauth_client_path'
  ) => {
    setError('')
    try {
      const path = await pickDesktopPath(kind)
      if (path)
        changeSource(index, {
          [field]: path,
        })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Path selection failed')
    }
  }
  const cancel = async () => {
    const current = observedJob()
    if (!current || current.status !== 'running' || cancelInFlight.has(current.id)) return
    cancelInFlight.add(current.id)
    const previous = current
    applyJob({
      ...current,
      status: 'cancelling',
      summary: `Cancelling source ${current.operation}…`,
    })
    setError('')
    try {
      applyJob(await cancelDesktopSourceValidation(current.id))
    } catch (caught) {
      applyJob(previous)
      setError(caught instanceof Error ? caught.message : 'Source job cancellation failed')
    } finally {
      cancelInFlight.delete(current.id)
    }
  }
  return (
    <SettingsSection
      title="Ingestion sources"
      description="Configure local and account-backed sources per workspace. Saving never ingests data. Most users only need Check connection followed by Initial sync; budget validation runs inside the initial-sync flow, while Trial sync remains an optional guarded recovery check."
    >
      <Dialog open={sourceTypeOpen()} onOpenChange={setSourceTypeOpen}>
        <div class="source-settings-toolbar">
          <span>
            {props.settings.sources.filter((source) => source.enabled).length} enabled ·{' '}
            {props.settings.sources.length} configured
          </span>
          <DialogTrigger
            as={Button}
            variant="secondary"
            type="button"
            disabled={props.settings.sources.length >= 128}
          >
            <Plus size={15} /> Add source
          </DialogTrigger>
        </div>

        <DialogContent class="source-type-dialog">
          <DialogHeader>
            <DialogTitle>Choose a source type</DialogTitle>
            <DialogDescription>
              {sourceType() === 'filesystem'
                ? `Choose a file or folder for ${selectedWorkspace()?.name || 'the first workspace'}. Cortana will populate the source from your selection.`
                : sourceType() === 'buzz'
                  ? `Add a Buzz connector for ${selectedWorkspace()?.name || 'the first workspace'}, then open advanced settings to choose communities.`
                  : `Connect ${SOURCE_KINDS.find((kind) => kind.value === sourceType())?.label || 'this provider'} to ${selectedWorkspace()?.name || 'the first workspace'}. Cortana will collect the required connection files, save the populated source, and launch authorization.`}{' '}
              No content is indexed until you run validation or sync.
            </DialogDescription>
          </DialogHeader>
          <SettingsRadioGroup
            class="source-type-options"
            aria-label="Source type"
            value={sourceType()}
            onValueChange={(value) => setSourceType(value as SourceKind)}
          >
            <For each={SOURCE_KINDS}>
              {(kind) => (
                <label class="source-type-option">
                  <SettingsRadio
                    value={kind.value}
                    checked={sourceType() === kind.value}
                    onChange={() => setSourceType(kind.value)}
                  />
                  <span class={`source-service-icon source-service-icon--${kind.value}`}>
                    <SourceIcon kind={kind.value} size={18} />
                  </span>
                  <span>{kind.label}</span>
                </label>
              )}
            </For>
          </SettingsRadioGroup>
          <DialogFooter>
            <Button variant="secondary" type="button" onClick={() => setSourceTypeOpen(false)}>
              Cancel
            </Button>
            {sourceType() === 'filesystem' ? (
              <>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void addFilesystemSource('source-file')}
                >
                  <File size={15} />
                  Choose file
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  onClick={() => void addFilesystemSource('directory')}
                >
                  <FolderOpen size={15} /> Choose folder
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                type="button"
                disabled={connectingSource()}
                onClick={() => void connectProviderSource(sourceType())}
              >
                {connectingSource() ? <LoaderCircle class="spin" size={15} /> : null}
                {sourceType() === 'buzz' ? 'Add' : 'Connect'}{' '}
                {SOURCE_KINDS.find((kind) => kind.value === sourceType())?.label || 'source'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SettingsTabs value={sourceWorkspace()} onValueChange={setSourceWorkspace}>
        <SettingsTabsList
          class="source-workspace-tabs"
          aria-label="Source workspace"
          variant="line"
        >
          <For each={props.settings.workspaces}>
            {(workspace) => {
              const count = props.settings.sources.filter(
                (source) => source.project === workspace.id
              ).length
              return (
                <SettingsTabsTrigger
                  value={workspace.id}
                  aria-selected={sourceWorkspace() === workspace.id}
                  class={cn(sourceWorkspace() === workspace.id && 'active')}
                >
                  <WorkspaceLogo workspace={workspace} size="small" />
                  <span>{workspace.name}</span>
                  <small>{count}</small>
                </SettingsTabsTrigger>
              )
            }}
          </For>
          {unassignedSourceCount() > 0 && (
            <SettingsTabsTrigger
              value={UNASSIGNED_WORKSPACE}
              aria-selected={sourceWorkspace() === UNASSIGNED_WORKSPACE}
              class={cn('warning', sourceWorkspace() === UNASSIGNED_WORKSPACE && 'active')}
            >
              <AlertTriangle size={15} />
              <span>Needs assignment</span>
              <small>{unassignedSourceCount()}</small>
            </SettingsTabsTrigger>
          )}
        </SettingsTabsList>

        <SettingsTabsContent value={sourceWorkspace()}>
          <p class="source-workspace-caption">
            {selectedWorkspace()
              ? `Showing sources assigned to ${selectedWorkspace()!.name}.`
              : 'Assign legacy sources to a workspace before enabling or syncing them.'}
          </p>

          {activeJob() && (
            <SettingsAlert class="safety-note" role="status">
              Settings for {activeJob()!.source} are locked while its operation is running. Other
              sources remain configurable, but source actions still wait until this operation
              finishes.
            </SettingsAlert>
          )}

          <div class="source-settings-list">
            {props.settings.sources.length === 0 && (
              <div class="empty-source-settings">
                <strong>No sources configured</strong>
                <span>
                  Choose a source type for this workspace, then save and run bounded validation.
                </span>
              </div>
            )}
            {props.settings.sources.length > 0 && visibleSources().length === 0 && (
              <div class="empty-source-settings">
                <strong>
                  {sourceWorkspace() === UNASSIGNED_WORKSPACE
                    ? 'No sources need assignment'
                    : `No sources in ${selectedWorkspace()?.name || 'this workspace'}`}
                </strong>
                <span>
                  {sourceWorkspace() === UNASSIGNED_WORKSPACE
                    ? 'All configured sources are assigned to a workspace.'
                    : 'Add a source to this workspace or switch workspaces from the application sidebar.'}
                </span>
              </div>
            )}
            <Index each={props.settings.sources}>
              {(source, index) => {
                const secret = () =>
                  source().token_env
                    ? props.settings.secrets.find((item) => item.name === source().token_env)
                    : undefined
                const runningThis = () => activeJob()?.source === source().name
                const sourceLocked = () => runningThis()
                const sourceLabel = () =>
                  SOURCE_KINDS.find((kind) => kind.value === source().kind)?.label ||
                  'External connector'
                const workspaceAssigned = () =>
                  props.settings.workspaces.some((workspace) => workspace.id === source().project)
                return (
                  <Show
                    when={
                      sourceWorkspace() === UNASSIGNED_WORKSPACE
                        ? !workspaceIds().has(source().project)
                        : source().project === sourceWorkspace()
                    }
                  >
                    <SettingsCard class="source-settings-card">
                      <header>
                        <div class="source-enable">
                          <span
                            class={`source-service-icon source-service-icon--${source().kind}`}
                            aria-label={`${sourceLabel()} connector`}
                            role="img"
                          >
                            <SourceIcon kind={source().kind} size={17} />
                          </span>
                          <span>
                            <strong>
                              {sourceDisplayName(source().kind, source().name || 'New source')}
                            </strong>
                            <small>{sourceSubtitle(source())}</small>
                          </span>
                        </div>
                        {!workspaceAssigned() && (
                          <label class="source-workspace-picker">
                            <span>Assign workspace</span>
                            <Select
                              aria-label={`Workspace for ${source().name}`}
                              value={source().project}
                              disabled={sourceLocked()}
                              onChange={(event) =>
                                changeSource(index, {
                                  project: event.target.value,
                                })
                              }
                            >
                              {source().project && (
                                <option value={source().project}>
                                  Unassigned: {source().project}
                                </option>
                              )}
                              <For each={props.settings.workspaces}>
                                {(workspace) => (
                                  <option value={workspace.id}>{workspace.name}</option>
                                )}
                              </For>
                            </Select>
                          </label>
                        )}
                        <div class="source-card-actions">
                          <div class="source-enabled-switch">
                            <span>{source().enabled ? 'Enabled' : 'Disabled'}</span>
                            <SettingsSwitch
                              aria-label={`Enable ${source().name}`}
                              checked={source().enabled}
                              disabled={
                                sourceLocked() || (!workspaceAssigned() && !source().enabled)
                              }
                              title={
                                !workspaceAssigned()
                                  ? 'Assign this source to a workspace before enabling it'
                                  : undefined
                              }
                              onChange={(event) =>
                                changeSource(index, {
                                  enabled: event.target.checked,
                                })
                              }
                            />
                          </div>
                          {hasBrowserSetup(source().kind) && (
                            <Button
                              variant="icon"
                              type="button"
                              class="source-icon-button "
                              aria-label={setupActionLabel(source().kind)}
                              disabled={actionsBlocked()}
                              tooltip={actionsReason() ?? setupActionLabel(source().kind)}
                              onClick={() => void openSetup(source())}
                            >
                              <ExternalLink size={14} />
                            </Button>
                          )}
                          {(isGoogleSource(source().kind) ||
                            source().kind === 'github' ||
                            source().kind === 'discord' ||
                            source().kind === 'slack') &&
                            canAuthorizeSource(source()) && (
                              <Button
                                variant="icon"
                                type="button"
                                class="source-icon-button "
                                aria-label="Authorize"
                                disabled={actionsBlocked()}
                                tooltip={actionsReason() ?? 'Authorize'}
                                onClick={() => void authorizeSource(source())}
                              >
                                <KeyRound size={14} />
                              </Button>
                            )}
                          {workspaceAssigned() && (
                            <Button
                              variant="icon"
                              type="button"
                              class="source-icon-button "
                              aria-label="Test connection"
                              disabled={actionsBlocked()}
                              tooltip={actionsReason() ?? 'Test connection'}
                              onClick={() => void checkSourceConnection(source())}
                            >
                              <ShieldCheck size={14} />
                            </Button>
                          )}
                          {source().enabled && workspaceAssigned() && (
                            <Button
                              variant="icon"
                              type="button"
                              class="source-icon-button "
                              aria-label="Initial sync"
                              disabled={actionsBlocked()}
                              tooltip={actionsReason() ?? 'Initial sync'}
                              onClick={() => openInitialSync(source())}
                            >
                              <Zap size={14} />
                            </Button>
                          )}
                          <Button
                            variant="danger"
                            type="button"
                            class="source-icon-button "
                            aria-label={`Remove ${source().name}`}
                            tooltip={`Remove ${source().name}`}
                            disabled={sourceLocked()}
                            onClick={() => {
                              const remove = () => {
                                if (initialSync()?.source === source().name) setInitialSync(null)
                                props.update((current) => ({
                                  ...current,
                                  sources: current.sources.filter(
                                    (_, position) => position !== index
                                  ),
                                }))
                              }
                              applyConfirmed(
                                confirm(
                                  `Remove ${source().name} from configuration? Existing indexed data is not deleted.`
                                ),
                                remove
                              )
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </header>

                      {!source().editable && (
                        <div class="source-managed-note">
                          This external command is managed in the TOML file. Desktop can retain,
                          disable, or remove it, but cannot edit or create shell commands.
                        </div>
                      )}

                      {!workspaceAssigned() && (
                        <div class="source-unassigned-note" role="alert">
                          <AlertTriangle size={15} />
                          <span>
                            This source uses the legacy{' '}
                            <code>{source().project || 'unassigned'}</code> scope. Assign it to a
                            workspace below before enabling, validating, or syncing it.
                          </span>
                        </div>
                      )}

                      <SettingsAccordion class="source-settings-details">
                        <SettingsAccordionItem value={`source-${index}`}>
                          <SettingsAccordionTrigger class="source-settings-trigger">
                            <span>Advanced source settings</span>
                            <small>Workspace, credentials, filters, and safety limits</small>
                          </SettingsAccordionTrigger>
                          <SettingsAccordionContent class="source-advanced-content">
                            <SettingsFieldGroup class="form-grid source-form-grid">
                              <Field label="Source name" hint="stable lowercase identifier">
                                <Input
                                  value={source().name}
                                  disabled={sourceLocked() || !source().editable}
                                  required
                                  maxLength={64}
                                  pattern="[a-z0-9][a-z0-9_-]*"
                                  onChange={(event) =>
                                    changeSource(index, {
                                      name: event.target.value,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Connector">
                                <Select
                                  value={source().kind}
                                  disabled={sourceLocked() || !source().editable}
                                  onChange={(event) => {
                                    const kind = event.target.value as SourceKind
                                    changeSource(index, {
                                      kind,
                                      token_env: defaultTokenEnv(kind),
                                      ...(kind === 'apple-notes'
                                        ? {}
                                        : {
                                            folders: [],
                                            exclude_folders: [],
                                          }),
                                    })
                                  }}
                                >
                                  {source().kind === 'external' && (
                                    <option value="external">External command</option>
                                  )}
                                  <For each={SOURCE_KINDS}>
                                    {(kind) => <option value={kind.value}>{kind.label}</option>}
                                  </For>
                                </Select>
                              </Field>
                              {source().kind === 'apple-notes' && (
                                <>
                                  <Field
                                    label="Include Apple Notes folders"
                                    hint="one exact folder name per line; leave empty to include every folder. On first validation, allow Cortana or the invoking terminal under macOS Privacy & Security > Automation."
                                    wide
                                  >
                                    <Textarea
                                      aria-label="Include Apple Notes folders"
                                      rows={3}
                                      value={(source().folders ?? []).join('\n')}
                                      disabled={sourceLocked() || !source().editable}
                                      onChange={(event) =>
                                        changeSource(index, {
                                          folders: splitList(event.target.value),
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field
                                    label="Exclude Apple Notes folders"
                                    hint="one exact folder name per line; exclusions win when both lists match"
                                    wide
                                  >
                                    <Textarea
                                      aria-label="Exclude Apple Notes folders"
                                      rows={3}
                                      value={(source().exclude_folders ?? []).join('\n')}
                                      disabled={sourceLocked() || !source().editable}
                                      onChange={(event) =>
                                        changeSource(index, {
                                          exclude_folders: splitList(event.target.value),
                                        })
                                      }
                                    />
                                  </Field>
                                </>
                              )}
                              {(source().kind === 'filesystem' || source().kind === 'buzz') && (
                                <Field
                                  label={
                                    source().kind === 'buzz'
                                      ? 'Buzz data directory'
                                      : 'Root directory'
                                  }
                                  hint="absolute, non-root path"
                                  wide
                                >
                                  <div class="path-input">
                                    <Input
                                      value={source().root || ''}
                                      disabled={sourceLocked() || !source().editable}
                                      required={source().enabled}
                                      placeholder="/Users/you/Documents"
                                      onChange={(event) =>
                                        changeSource(index, {
                                          root: event.target.value || null,
                                        })
                                      }
                                    />
                                    <Button
                                      variant="icon"
                                      type="button"
                                      disabled={sourceLocked() || !source().editable}
                                      aria-label="Choose source directory"
                                      tooltip="Choose source directory"
                                      class=""
                                      onClick={() => void choosePath(index, 'directory', 'root')}
                                    >
                                      <FolderOpen size={14} />
                                    </Button>
                                  </div>
                                </Field>
                              )}
                              {source().kind === 'buzz' && (
                                <Field
                                  label="Community chooser"
                                  hint="assign the communities this workspace may index; the list comes from Buzz's read-only agents/teams.json identity file in the configured data directory, so make sure the Buzz app has written it first"
                                  group
                                  wide
                                >
                                  <div class="source-repository-chooser">
                                    <Button
                                      variant="secondary"
                                      type="button"
                                      aria-label="Discover communities"
                                      disabled={
                                        !props.canValidate ||
                                        sourceLocked() ||
                                        buzzCommunitiesLoading() === source().name
                                      }
                                      onClick={() => void discoverBuzzCommunities(source())}
                                    >
                                      {buzzCommunitiesLoading() === source().name ? (
                                        <LoaderCircle class="spin" size={14} />
                                      ) : (
                                        <RefreshCw size={14} />
                                      )}{' '}
                                      Discover communities
                                    </Button>
                                    {buzzCommunities()[source().name] && (
                                      <div class="source-repository-options">
                                        {buzzCommunities()[source().name].communities.length ===
                                        0 ? (
                                          <small>
                                            No communities recorded in the identity file.
                                          </small>
                                        ) : (
                                          buzzCommunities()[source().name].communities.map(
                                            (community) => (
                                              <label>
                                                <SettingsCheckbox
                                                  aria-label={`Include ${community.name}`}
                                                  checked={source().communities.includes(
                                                    community.id
                                                  )}
                                                  disabled={sourceLocked() || !source().editable}
                                                  onChange={() =>
                                                    toggleBuzzCommunity(index, source(), community)
                                                  }
                                                />
                                                <span>{community.name}</span>
                                              </label>
                                            )
                                          )
                                        )}
                                        {buzzCommunities()[source().name].truncated && (
                                          <small>
                                            Buzz returned more than 100 communities; only the first
                                            100 are shown.
                                          </small>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </Field>
                              )}
                              <Field
                                label="Source label"
                                hint="identifier stored on indexed documents"
                              >
                                <Input
                                  aria-label="Source label"
                                  value={source().source || ''}
                                  disabled={sourceLocked() || !source().editable}
                                  maxLength={128}
                                  placeholder={source().name}
                                  onChange={(event) =>
                                    changeSource(index, {
                                      source: event.target.value || null,
                                    })
                                  }
                                />
                              </Field>
                              {source().kind === 'filesystem' && (
                                <Field
                                  label="Excluded paths"
                                  hint="comma or line separated, relative paths"
                                >
                                  <Input
                                    value={source().exclude.join(', ')}
                                    disabled={sourceLocked() || !source().editable}
                                    onChange={(event) =>
                                      changeSource(index, {
                                        exclude: splitList(event.target.value),
                                      })
                                    }
                                  />
                                </Field>
                              )}
                              {isGoogleSource(source().kind) && (
                                <>
                                  <Field
                                    label="Google OAuth token file"
                                    hint="private token created by Cortana; optional when a token path environment variable is configured"
                                    wide
                                  >
                                    <div class="path-input">
                                      <Input
                                        value={source().token_path || ''}
                                        disabled={sourceLocked() || !source().editable}
                                        required={source().enabled && !source().token_env}
                                        placeholder="/Users/you/.config/cortana/google-token.json"
                                        onChange={(event) =>
                                          changeSource(index, {
                                            token_path: event.target.value || null,
                                          })
                                        }
                                      />
                                      <Button
                                        variant="icon"
                                        type="button"
                                        disabled={sourceLocked() || !source().editable}
                                        aria-label="Choose Google token destination"
                                        tooltip="Choose Google token destination"
                                        class=""
                                        onClick={() =>
                                          void choosePath(index, 'google-token', 'token_path')
                                        }
                                      >
                                        <FolderOpen size={14} />
                                      </Button>
                                    </div>
                                  </Field>
                                  <Field
                                    label="Google Desktop OAuth client JSON"
                                    hint="downloaded from Google Cloud Console; required to authorize"
                                    wide
                                  >
                                    <div class="path-input">
                                      <Input
                                        value={source().oauth_client_path || ''}
                                        disabled={sourceLocked() || !source().editable}
                                        placeholder="/Users/you/Downloads/google-oauth-client.json"
                                        onChange={(event) =>
                                          changeSource(index, {
                                            oauth_client_path: event.target.value || null,
                                          })
                                        }
                                      />
                                      <Button
                                        variant="icon"
                                        type="button"
                                        disabled={sourceLocked() || !source().editable}
                                        aria-label="Choose Google OAuth client JSON"
                                        tooltip="Choose Google OAuth client JSON"
                                        class=""
                                        onClick={() =>
                                          void choosePath(
                                            index,
                                            'oauth-client',
                                            'oauth_client_path'
                                          )
                                        }
                                      >
                                        <FolderOpen size={14} />
                                      </Button>
                                    </div>
                                  </Field>
                                  <Field
                                    label="Google token path environment variable"
                                    hint="optional; its value must be an absolute OAuth token JSON path"
                                  >
                                    <Input
                                      value={source().token_env || ''}
                                      disabled={sourceLocked() || !source().editable}
                                      pattern="[A-Z_][A-Z0-9_]*"
                                      placeholder="CORTANA_GOOGLE_TOKEN_PATH"
                                      onChange={(event) =>
                                        changeSource(index, {
                                          token_env: event.target.value || null,
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field
                                    label="Google token path value"
                                    hint="write-only path; leave blank to keep the existing value"
                                  >
                                    <div class="secret-input">
                                      <Input
                                        type="password"
                                        autocomplete="new-password"
                                        disabled={
                                          sourceLocked() ||
                                          !source().editable ||
                                          !source().token_env
                                        }
                                        value={
                                          source().token_env
                                            ? props.secretValues[source().token_env!] || ''
                                            : ''
                                        }
                                        onChange={(event) => {
                                          if (source().token_env) {
                                            props.onSecret({
                                              ...props.secretValues,
                                              [source().token_env!]: event.target.value,
                                            })
                                          }
                                        }}
                                      />
                                      {source().token_env &&
                                        secret()?.configured &&
                                        !props.clearedSecrets.has(secret()!.name) && (
                                          <Button
                                            variant="danger"
                                            type="button"
                                            disabled={sourceLocked()}
                                            onClick={() =>
                                              applyConfirmed(
                                                confirm(
                                                  `Clear the stored Google token path for ${source().name}? The change remains a draft until you save settings.`
                                                ),
                                                () => props.onClearSecret(source().token_env!)
                                              )
                                            }
                                          >
                                            Clear
                                          </Button>
                                        )}
                                    </div>
                                  </Field>
                                  <Field
                                    label="Google query"
                                    hint="optional provider-native filter"
                                    wide
                                  >
                                    <Input
                                      value={source().query || ''}
                                      disabled={sourceLocked() || !source().editable}
                                      maxLength={2048}
                                      placeholder={source().kind === 'gmail' ? 'newer_than:1y' : ''}
                                      onChange={(event) =>
                                        changeSource(index, {
                                          query: event.target.value || null,
                                        })
                                      }
                                    />
                                  </Field>
                                </>
                              )}
                              {source().kind === 'github' && (
                                <>
                                  <Field
                                    label="Repository chooser"
                                    hint="discover accessible repositories, then select only the ones Cortana may index"
                                    group
                                    wide
                                  >
                                    <div class="source-repository-chooser">
                                      <Button
                                        variant="secondary"
                                        type="button"
                                        disabled={
                                          !props.canValidate ||
                                          sourceLocked() ||
                                          githubRepositoriesLoading() === source().name
                                        }
                                        onClick={() => void discoverGithubRepositories(source())}
                                      >
                                        {githubRepositoriesLoading() === source().name ? (
                                          <LoaderCircle class="spin" size={14} />
                                        ) : (
                                          <RefreshCw size={14} />
                                        )}{' '}
                                        Discover repositories
                                      </Button>
                                      {githubRepositories()[source().name] && (
                                        <div class="source-repository-options">
                                          {githubRepositories()[source().name].items.length ===
                                          0 ? (
                                            <small>No accessible repositories returned.</small>
                                          ) : (
                                            githubRepositories()[source().name].items.map(
                                              (repository) => (
                                                <label>
                                                  <SettingsCheckbox
                                                    aria-label={`Include ${repository.full_name}`}
                                                    checked={source().repositories.includes(
                                                      repository.full_name
                                                    )}
                                                    disabled={sourceLocked() || !source().editable}
                                                    onChange={() =>
                                                      toggleGithubRepository(
                                                        index,
                                                        source(),
                                                        repository.full_name
                                                      )
                                                    }
                                                  />
                                                  <span>
                                                    {repository.full_name}
                                                    {repository.private ? ' · private' : ''}
                                                  </span>
                                                </label>
                                              )
                                            )
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </Field>
                                  <Field
                                    label="GitHub OAuth token file"
                                    hint="private token created by Cortana; use this for OAuth or leave blank for an environment token"
                                    wide
                                  >
                                    <div class="path-input">
                                      <Input
                                        value={source().token_path || ''}
                                        disabled={sourceLocked() || !source().editable}
                                        required={source().enabled && !source().token_env}
                                        placeholder="/Users/you/.config/cortana/github-token.json"
                                        onChange={(event) =>
                                          changeSource(index, {
                                            token_path: event.target.value || null,
                                          })
                                        }
                                      />
                                      <Button
                                        variant="icon"
                                        type="button"
                                        disabled={sourceLocked() || !source().editable}
                                        aria-label="Choose GitHub token destination"
                                        tooltip="Choose GitHub token destination"
                                        class=""
                                        onClick={() =>
                                          void choosePath(index, 'github-token', 'token_path')
                                        }
                                      >
                                        <FolderOpen size={14} />
                                      </Button>
                                    </div>
                                  </Field>
                                </>
                              )}
                              {(source().kind === 'github' ||
                                source().kind === 'slack' ||
                                source().kind === 'discord') && (
                                <>
                                  {source().kind === 'discord' && (
                                    <Field
                                      label="Server chooser"
                                      hint="assign the servers this workspace may index; approve Cortana in Discord Desktop first, then discover and check the servers to assign"
                                      group
                                      wide
                                    >
                                      <div class="source-repository-chooser">
                                        <Button
                                          variant="secondary"
                                          type="button"
                                          aria-label="Discover servers"
                                          disabled={
                                            !props.canValidate ||
                                            sourceLocked() ||
                                            discordServersLoading() === source().name
                                          }
                                          onClick={() => void discoverDiscordServers(source())}
                                        >
                                          {discordServersLoading() === source().name ? (
                                            <LoaderCircle class="spin" size={14} />
                                          ) : (
                                            <RefreshCw size={14} />
                                          )}{' '}
                                          Discover servers
                                        </Button>
                                        {discordServers()[source().name] && (
                                          <div class="source-repository-options">
                                            {discordServers()[source().name].guilds.length === 0 ? (
                                              <small>No accessible servers returned.</small>
                                            ) : (
                                              discordServers()[source().name].guilds.map(
                                                (guild) => (
                                                  <label>
                                                    <SettingsCheckbox
                                                      aria-label={`Include ${guild.name}`}
                                                      checked={source().servers.includes(guild.id)}
                                                      disabled={
                                                        sourceLocked() || !source().editable
                                                      }
                                                      onChange={() =>
                                                        toggleDiscordServer(
                                                          index,
                                                          source(),
                                                          guild.id
                                                        )
                                                      }
                                                    />
                                                    <span>{guild.name}</span>
                                                  </label>
                                                )
                                              )
                                            )}
                                            {discordServers()[source().name].truncated && (
                                              <small>
                                                Discord returned more than 100 servers; only the
                                                first 100 are shown.
                                              </small>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </Field>
                                  )}
                                  {source().kind === 'discord' && (
                                    <Field
                                      label="Channel chooser"
                                      hint="discover channels through the running Discord Desktop RPC client, then select only the channels Cortana may index; channels outside assigned servers stay available when no servers are assigned"
                                      group
                                      wide
                                    >
                                      <div class="source-repository-chooser">
                                        <Button
                                          variant="secondary"
                                          type="button"
                                          aria-label="Discover channels"
                                          disabled={
                                            !props.canValidate ||
                                            sourceLocked() ||
                                            discordChannelsLoading() === source().name
                                          }
                                          onClick={() => void discoverDiscordChannels(source())}
                                        >
                                          {discordChannelsLoading() === source().name ? (
                                            <LoaderCircle class="spin" size={14} />
                                          ) : (
                                            <RefreshCw size={14} />
                                          )}{' '}
                                          Discover channels
                                        </Button>
                                        {discordChannels()[source().name] && (
                                          <div class="source-repository-options">
                                            <Button
                                              variant="secondary"
                                              type="button"
                                              aria-label="Select all Discord text channels"
                                              disabled={sourceLocked() || !source().editable}
                                              onClick={() =>
                                                selectAllDiscordTextChannels(
                                                  index,
                                                  source(),
                                                  discordChannels()[source().name]
                                                )
                                              }
                                            >
                                              Select all text channels
                                            </Button>
                                            <small>
                                              Selects text and announcement channels in assigned
                                              servers; voice, forum, stage, and category channels
                                              are excluded.
                                            </small>
                                            {discordChannels()[source().name].guilds.length ===
                                            0 ? (
                                              <small>No accessible servers returned.</small>
                                            ) : (
                                              discordChannels()[source().name].guilds.map(
                                                (guild) => {
                                                  const serversAssigned =
                                                    source().servers.length > 0
                                                  const assigned =
                                                    !serversAssigned ||
                                                    source().servers.includes(guild.id)
                                                  return (
                                                    <div
                                                      class={cn(
                                                        'discord-guild',
                                                        !assigned && 'discord-guild-unassigned'
                                                      )}
                                                    >
                                                      <strong>{guild.name}</strong>
                                                      {!assigned && (
                                                        <small>
                                                          {' '}
                                                          · not assigned to this workspace
                                                        </small>
                                                      )}
                                                      {guild.truncated && (
                                                        <small> · first 100 channels</small>
                                                      )}
                                                      {guild.channels.length === 0 ? (
                                                        <small>No channels returned.</small>
                                                      ) : (
                                                        guild.channels.map((channel) => (
                                                          <label
                                                            title={
                                                              assigned
                                                                ? undefined
                                                                : 'Assign this server in the server chooser before selecting its channels'
                                                            }
                                                          >
                                                            <SettingsCheckbox
                                                              aria-label={`${channel.name} · ${channel.kind}`}
                                                              checked={source().channels.includes(
                                                                channel.id
                                                              )}
                                                              disabled={
                                                                sourceLocked() || !source().editable
                                                              }
                                                              onChange={() =>
                                                                toggleDiscordChannel(
                                                                  index,
                                                                  source(),
                                                                  channel.id
                                                                )
                                                              }
                                                            />
                                                            <span>
                                                              {channel.name} · {channel.kind}
                                                            </span>
                                                          </label>
                                                        ))
                                                      )}
                                                    </div>
                                                  )
                                                }
                                              )
                                            )}
                                            {discordChannels()[source().name].truncated && (
                                              <small>
                                                Discord returned more than 100 servers; only the
                                                first 100 are shown.
                                              </small>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </Field>
                                  )}
                                  <Field
                                    label={
                                      source().kind === 'github' ? 'Repositories' : 'Channel IDs'
                                    }
                                    hint={
                                      source().kind === 'github'
                                        ? 'one owner/repository per line; only these repositories are indexed'
                                        : 'comma or line separated'
                                    }
                                    wide
                                  >
                                    <Textarea
                                      value={
                                        source().kind === 'github'
                                          ? source().repositories.join('\n')
                                          : source().channels.join(', ')
                                      }
                                      disabled={sourceLocked() || !source().editable}
                                      required={source().enabled}
                                      rows={source().kind === 'github' ? 3 : 1}
                                      placeholder={
                                        source().kind === 'github'
                                          ? 'owner/repository'
                                          : 'Channel IDs'
                                      }
                                      aria-label={
                                        source().kind === 'github'
                                          ? 'GitHub repositories'
                                          : 'Channel IDs'
                                      }
                                      onChange={(event) => {
                                        const values = splitList(event.target.value)
                                        changeSource(
                                          index,
                                          source().kind === 'github'
                                            ? {
                                                repositories: values,
                                              }
                                            : {
                                                channels: values,
                                              }
                                        )
                                      }}
                                    />
                                  </Field>
                                  {source().kind !== 'discord' && (
                                    <Field
                                      label="Token variable"
                                      hint={
                                        secret()?.configured &&
                                        !props.clearedSecrets.has(secret()!.name)
                                          ? `Configured via ${secret()!.source}`
                                          : 'stored in Cortana owner-only secret file'
                                      }
                                    >
                                      <Input
                                        value={source().token_env || ''}
                                        disabled={sourceLocked() || !source().editable}
                                        required={
                                          source().enabled &&
                                          source().kind !== 'github' &&
                                          !source().token_path
                                        }
                                        pattern="[A-Z_][A-Z0-9_]*"
                                        onChange={(event) =>
                                          changeSource(index, {
                                            token_env: event.target.value || null,
                                          })
                                        }
                                      />
                                    </Field>
                                  )}
                                  {source().kind !== 'discord' && (
                                    <Field
                                      label="New token"
                                      hint="write-only; leave blank to keep existing"
                                    >
                                      <div class="secret-input">
                                        <Input
                                          type="password"
                                          autocomplete="new-password"
                                          disabled={
                                            sourceLocked() ||
                                            !source().editable ||
                                            !source().token_env
                                          }
                                          value={
                                            source().token_env
                                              ? props.secretValues[source().token_env!] || ''
                                              : ''
                                          }
                                          onChange={(event) => {
                                            if (source().token_env) {
                                              props.onSecret({
                                                ...props.secretValues,
                                                [source().token_env!]: event.target.value,
                                              })
                                            }
                                          }}
                                        />
                                        {source().token_env &&
                                          secret()?.configured &&
                                          !props.clearedSecrets.has(secret()!.name) && (
                                            <Button
                                              variant="danger"
                                              type="button"
                                              disabled={sourceLocked()}
                                              onClick={() =>
                                                applyConfirmed(
                                                  confirm(
                                                    `Clear the stored token for ${source().name}? The change remains a draft until you save settings.`
                                                  ),
                                                  () => props.onClearSecret(source().token_env!)
                                                )
                                              }
                                            >
                                              Clear
                                            </Button>
                                          )}
                                      </div>
                                    </Field>
                                  )}
                                  {source().kind === 'discord' && (
                                    <>
                                      <Field
                                        label="Discord RPC token file"
                                        hint="private access token created through Discord Desktop RPC; used for server, channel, and message reads"
                                        wide
                                      >
                                        <div class="path-input">
                                          <Input
                                            value={source().token_path || ''}
                                            disabled={sourceLocked() || !source().editable}
                                            placeholder="/Users/you/.config/cortana/discord-rpc-token.json"
                                            onChange={(event) =>
                                              changeSource(index, {
                                                token_path: event.target.value || null,
                                              })
                                            }
                                          />
                                          <Button
                                            variant="icon"
                                            type="button"
                                            disabled={sourceLocked() || !source().editable}
                                            aria-label="Choose Discord RPC token destination"
                                            tooltip="Choose Discord RPC token destination"
                                            class=""
                                            onClick={() =>
                                              void choosePath(index, 'discord-token', 'token_path')
                                            }
                                          >
                                            <FolderOpen size={14} />
                                          </Button>
                                        </div>
                                      </Field>
                                      <Field
                                        label="Discord RPC client JSON"
                                        hint="JSON containing the Discord application client_id and optional client_secret"
                                        wide
                                      >
                                        <div class="path-input">
                                          <Input
                                            value={source().oauth_client_path || ''}
                                            disabled={sourceLocked() || !source().editable}
                                            placeholder="/Users/you/.config/cortana/discord-rpc-client.json"
                                            onChange={(event) =>
                                              changeSource(index, {
                                                oauth_client_path: event.target.value || null,
                                              })
                                            }
                                          />
                                          <Button
                                            variant="icon"
                                            type="button"
                                            disabled={sourceLocked() || !source().editable}
                                            aria-label="Choose Discord RPC client JSON"
                                            tooltip="Choose Discord RPC client JSON"
                                            class=""
                                            onClick={() =>
                                              void choosePath(
                                                index,
                                                'oauth-client',
                                                'oauth_client_path'
                                              )
                                            }
                                          >
                                            <FolderOpen size={14} />
                                          </Button>
                                        </div>
                                      </Field>
                                    </>
                                  )}
                                  {source().kind === 'slack' && (
                                    <>
                                      <Field
                                        label="Workspace chooser"
                                        hint="assign the workspace this source may index; authorize with Slack first, then discover and check the workspace to assign. A Slack user token is scoped to exactly one workspace, so at most one team can be assigned per source"
                                        group
                                        wide
                                      >
                                        <div class="source-repository-chooser">
                                          <Button
                                            variant="secondary"
                                            type="button"
                                            aria-label="Discover workspaces"
                                            disabled={
                                              !props.canValidate ||
                                              sourceLocked() ||
                                              slackWorkspacesLoading() === source().name
                                            }
                                            onClick={() => void discoverSlackWorkspaces(source())}
                                          >
                                            {slackWorkspacesLoading() === source().name ? (
                                              <LoaderCircle class="spin" size={14} />
                                            ) : (
                                              <RefreshCw size={14} />
                                            )}{' '}
                                            Discover workspaces
                                          </Button>
                                          {slackWorkspaces()[source().name] && (
                                            <div class="source-repository-options">
                                              {slackWorkspaces()[source().name].teams.length ===
                                              0 ? (
                                                <small>No accessible workspaces returned.</small>
                                              ) : (
                                                slackWorkspaces()[source().name].teams.map(
                                                  (team) => (
                                                    <label>
                                                      <SettingsCheckbox
                                                        aria-label={`Include ${team.name}`}
                                                        checked={source().teams.includes(team.id)}
                                                        disabled={
                                                          sourceLocked() || !source().editable
                                                        }
                                                        onChange={() =>
                                                          toggleSlackTeam(index, source(), team)
                                                        }
                                                      />
                                                      <span>{team.name}</span>
                                                    </label>
                                                  )
                                                )
                                              )}
                                              {slackWorkspaces()[source().name].truncated && (
                                                <small>
                                                  Slack returned more than 100 teams; only the first
                                                  100 are shown.
                                                </small>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </Field>
                                      <Field
                                        label="Slack OAuth token file"
                                        hint="private user token created by Cortana; used only to list the workspace for assignment. The SLACK_BOT_TOKEN environment variable is separate and stays the message-sync credential"
                                        wide
                                      >
                                        <div class="path-input">
                                          <Input
                                            value={source().token_path || ''}
                                            disabled={sourceLocked() || !source().editable}
                                            placeholder="/Users/you/.config/cortana/slack-user-token.json"
                                            onChange={(event) =>
                                              changeSource(index, {
                                                token_path: event.target.value || null,
                                              })
                                            }
                                          />
                                          <Button
                                            variant="icon"
                                            type="button"
                                            disabled={sourceLocked() || !source().editable}
                                            aria-label="Choose Slack OAuth token destination"
                                            tooltip="Choose Slack OAuth token destination"
                                            class=""
                                            onClick={() =>
                                              void choosePath(index, 'slack-token', 'token_path')
                                            }
                                          >
                                            <FolderOpen size={14} />
                                          </Button>
                                        </div>
                                      </Field>
                                      <Field
                                        label="Slack OAuth client JSON"
                                        hint="JSON containing the OAuth app client_id; required for browser authorization. Register the loopback redirect URI http://127.0.0.1:47521/callback in the Slack app first"
                                        wide
                                      >
                                        <div class="path-input">
                                          <Input
                                            value={source().oauth_client_path || ''}
                                            disabled={sourceLocked() || !source().editable}
                                            placeholder="/Users/you/.config/cortana/slack-oauth-client.json"
                                            onChange={(event) =>
                                              changeSource(index, {
                                                oauth_client_path: event.target.value || null,
                                              })
                                            }
                                          />
                                          <Button
                                            variant="icon"
                                            type="button"
                                            disabled={sourceLocked() || !source().editable}
                                            aria-label="Choose Slack OAuth client JSON"
                                            tooltip="Choose Slack OAuth client JSON"
                                            class=""
                                            onClick={() =>
                                              void choosePath(
                                                index,
                                                'oauth-client',
                                                'oauth_client_path'
                                              )
                                            }
                                          >
                                            <FolderOpen size={14} />
                                          </Button>
                                        </div>
                                      </Field>
                                    </>
                                  )}
                                </>
                              )}
                              {source().editable && (
                                <>
                                  <Field label="Document limit" hint="blank uses global budget">
                                    <Input
                                      type="number"
                                      disabled={sourceLocked()}
                                      min={1}
                                      max={1000000}
                                      value={source().max_documents ?? ''}
                                      onChange={(event) =>
                                        changeSource(index, {
                                          max_documents: optionalNumber(event.target.value),
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field
                                    label="Content limit (bytes)"
                                    hint="blank uses global budget"
                                  >
                                    <Input
                                      type="number"
                                      disabled={sourceLocked()}
                                      min={1024}
                                      max={1099511627776}
                                      value={source().max_bytes ?? ''}
                                      onChange={(event) =>
                                        changeSource(index, {
                                          max_bytes: optionalNumber(event.target.value),
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field
                                    label="Content limit (characters)"
                                    hint="blank uses connector defaults"
                                  >
                                    <Input
                                      type="number"
                                      disabled={sourceLocked()}
                                      min={1}
                                      max={10000000}
                                      value={source().max_content_chars ?? ''}
                                      onChange={(event) =>
                                        changeSource(index, {
                                          max_content_chars: optionalNumber(event.target.value),
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field
                                    label="Duration limit (seconds)"
                                    hint="blank uses the global budget"
                                  >
                                    <Input
                                      type="number"
                                      disabled={sourceLocked()}
                                      min={1}
                                      max={86400}
                                      value={source().max_duration_seconds ?? ''}
                                      onChange={(event) =>
                                        changeSource(index, {
                                          max_duration_seconds: optionalNumber(event.target.value),
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field
                                    label="Document labels"
                                    hint="comma or line separated"
                                    wide
                                  >
                                    <Input
                                      disabled={sourceLocked()}
                                      value={source().labels.join(', ')}
                                      onChange={(event) =>
                                        changeSource(index, {
                                          labels: splitList(event.target.value),
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field
                                    label="Document ACL labels"
                                    hint="comma or line separated; leave blank only for public data"
                                    wide
                                  >
                                    <Input
                                      disabled={sourceLocked()}
                                      value={source().acl.join(', ')}
                                      onChange={(event) =>
                                        changeSource(index, {
                                          acl: splitList(event.target.value),
                                        })
                                      }
                                    />
                                  </Field>
                                </>
                              )}
                            </SettingsFieldGroup>
                          </SettingsAccordionContent>
                        </SettingsAccordionItem>
                      </SettingsAccordion>
                      {observedJob()?.source === source().name && (
                        <div class={`source-validation-job ${observedJob()!.status}`}>
                          <div>
                            <StatusGlyph
                              passed={observedJob()!.status === 'succeeded'}
                              optional={observedJob()!.status === 'cancelled'}
                              pending={['running', 'cancelling'].includes(observedJob()!.status)}
                            />
                            <span>
                              <strong>
                                {sourceJobOperationLabel(observedJob()!.operation)} ·{' '}
                                {observedJob()!.status}
                              </strong>
                              <small>{observedJob()!.summary}</small>
                            </span>
                            {['running', 'cancelling'].includes(observedJob()!.status) && (
                              <Button
                                variant="compact"
                                type="button"
                                disabled={observedJob()!.status === 'cancelling'}
                                onClick={() => void cancel()}
                              >
                                <CircleStop size={14} /> Cancel
                              </Button>
                            )}
                            {observedJob()!.retryable && (
                              <Button
                                variant="compact"
                                type="button"
                                disabled={!props.canValidate || Boolean(activeJob())}
                                onClick={() => {
                                  if (observedJob()!.operation === 'authorization')
                                    void authorizeSource(source())
                                  else if (observedJob()!.operation === 'trial-sync')
                                    void trialSyncSource(source())
                                  else if (
                                    observedJob()!.operation === 'initial-sync' ||
                                    observedJob()!.operation === 'validation'
                                  ) {
                                    void openInitialSync(
                                      source(),
                                      (observedJob()!.budget as InitialSyncBudget | null) || 'small'
                                    )
                                  } else void checkSourceConnection(source())
                                }}
                              >
                                <RefreshCw size={14} /> Retry
                              </Button>
                            )}
                          </div>
                          {observedJob()!.log && <pre>{observedJob()!.log}</pre>}
                        </div>
                      )}
                    </SettingsCard>
                  </Show>
                )
              }}
            </Index>
          </div>

          {initialSync() && initialSyncSource() && (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) setInitialSync(null)
              }}
            >
              <DialogContent class="initial-sync-dialog">
                <DialogHeader>
                  <DialogTitle>Initial sync</DialogTitle>
                  <DialogDescription>
                    <span class="eyebrow">Guided initial sync</span> Review the bounded first-import
                    plan for {initialSyncSource()!.name}. Check the connection first, then start the
                    sync only when the selected budget is covered by a successful validation.
                  </DialogDescription>
                </DialogHeader>
                <InitialSyncFlow
                  source={initialSyncSource()!}
                  flow={initialSync()!}
                  busy={Boolean(activeJob()) || !props.canValidate}
                  onBudget={(budget) => void requestPlan(initialSync()!.source, budget)}
                  onValidate={() =>
                    void validateInitialSyncBudget(sourceOf(props.settings, initialSync()!.source))
                  }
                  onStart={() =>
                    void startInitialSync(sourceOf(props.settings, initialSync()!.source))
                  }
                />
              </DialogContent>
            </Dialog>
          )}

          {error() && (
            <SettingsAlert class="safety-note error" variant="destructive" role="alert">
              {error()}
            </SettingsAlert>
          )}
          <details class="source-safety-details">
            <summary>How source sync limits work</summary>
            <p>
              Check connection verifies the configured path or credentials without reading source
              documents or recording validation coverage. Budget validation is an explicit
              initial-sync safety step and writes only metadata about the outcome. Trial sync is an
              optional guarded recovery check, requires an exact successful validation, limits work
              to 25 documents and 5 MiB, and never performs deletion reconciliation. It is not
              required for the normal first import. Initial sync is planned first, uses one of three
              fixed budgets (up to 2,000 documents, 128 MiB, 60 minutes), requires validation at
              equal or larger limits, and never escalates beyond the selected budget.
            </p>
          </details>
        </SettingsTabsContent>
      </SettingsTabs>
    </SettingsSection>
  )
}
function sourceOf(settings: DesktopSettings, name: string): SourceSettings {
  return settings.sources.find((item) => item.name === name)!
}
function identifierFromPath(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean)
  const leaf = segments[segments.length - 1] || 'source'
  return (
    leaf
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'source'
  )
}
function sourceSubtitle(source: SourceSettings): string {
  if (source.kind === 'filesystem' || source.kind === 'external' || source.kind === 'buzz') {
    return source.root || 'Choose a file or folder'
  }
  if (source.kind === 'github') {
    return source.repositories.length
      ? source.repositories.slice(0, 2).join(', ')
      : source.token_path || source.token_env || 'GitHub account not connected'
  }
  if (source.kind === 'slack') {
    return source.team_names.join(', ') || source.token_path || 'Slack account not connected'
  }
  if (
    source.kind === 'google-drive' ||
    source.kind === 'gmail' ||
    source.kind === 'google-calendar'
  ) {
    return source.token_path || 'Google account not connected'
  }
  if (source.kind === 'discord') {
    return source.servers.length
      ? `${source.servers.length} server${source.servers.length === 1 ? '' : 's'} selected`
      : source.token_path || 'Discord account not connected'
  }
  if (source.kind === 'apple-notes') {
    return source.folders?.length ? source.folders.join(', ') : 'All Apple Notes folders'
  }
  return source.name || 'Not connected'
}
function canAuthorizeSource(source: SourceSettings): boolean {
  if (!source.oauth_client_path) return false
  if (source.kind === 'discord' || source.kind === 'slack') return Boolean(source.token_path)
  return Boolean(source.token_path || source.token_env)
}
function budgetLabel(budget: InitialSyncBudget) {
  const tier = INITIAL_SYNC_BUDGETS.find((item) => item.budget === budget)
  return tier
    ? `${tier.documents.toLocaleString()} documents or ${mebibytes(tier.bytes)} MiB for up to ${minutes(tier.seconds)} minutes`
    : budget
}
function mebibytes(bytes: number) {
  return Math.round(bytes / 1048576)
}
function minutes(seconds: number) {
  return Math.round(seconds / 60)
}
function InitialSyncFlow(incoming: {
  source: SourceSettings
  flow: {
    source: string
    budget: InitialSyncBudget
    plan: DesktopInitialSyncPlan | null
    planning: boolean
    flowError: string
  }
  busy: boolean
  onBudget: (budget: InitialSyncBudget) => void
  onValidate: () => void
  onStart: () => void
}) {
  const props = incoming
  const plan = () => props.flow.plan
  return (
    <section class="initial-sync-flow" aria-label={`Initial sync plan for ${props.source.name}`}>
      <SettingsRadioGroup
        class="initial-sync-budgets"
        role="radiogroup"
        aria-label="Initial sync budget"
        value={props.flow.budget}
        onValueChange={(value) => props.onBudget(value as InitialSyncBudget)}
      >
        <For each={INITIAL_SYNC_BUDGETS}>
          {(tier) => (
            <label class={cn(props.flow.budget === tier.budget && 'selected')}>
              <SettingsRadio
                name="initial-sync-budget"
                value={tier.budget}
                checked={props.flow.budget === tier.budget}
                disabled={props.flow.planning || props.busy}
                onChange={() => props.onBudget(tier.budget)}
              />
              <span>
                <strong>{tier.budget[0].toUpperCase() + tier.budget.slice(1)}</strong>
                <small>{budgetLabel(tier.budget)}</small>
              </span>
            </label>
          )}
        </For>
      </SettingsRadioGroup>
      {props.flow.planning && <p class="initial-sync-state">Requesting a native plan…</p>}
      {props.flow.flowError && (
        <SettingsAlert class="safety-note error" variant="destructive" role="alert">
          {props.flow.flowError}
        </SettingsAlert>
      )}
      {plan() && (
        <>
          <dl class="initial-sync-plan">
            <div>
              <dt>Source</dt>
              <dd>
                {plan()!.source} · {plan()!.kind} · {plan()!.project}
              </dd>
            </div>
            <div>
              <dt>Selected budget</dt>
              <dd>
                {plan()!.budget_documents.toLocaleString()} documents ·{' '}
                {mebibytes(plan()!.budget_bytes)} MiB · {minutes(plan()!.budget_seconds)} minutes
              </dd>
            </div>
            <div>
              <dt>Validation gate</dt>
              <dd>{plan()!.requires_validation ? 'Required at equal or larger limits' : 'None'}</dd>
            </div>
            <div>
              <dt>Deletion reconciliation</dt>
              <dd>Disabled</dd>
            </div>
            <div>
              <dt>Writes indexed data</dt>
              <dd>Yes — committed batches become searchable</dd>
            </div>
          </dl>
          {!plan()!.enabled && (
            <SettingsAlert class="safety-note">
              <AlertTriangle size={16} />
              <span>Enable this source and save before an initial sync.</span>
            </SettingsAlert>
          )}
          {plan()!.validation_covers_budget !== true && (
            <SettingsAlert class="safety-note">
              <AlertTriangle size={16} />
              <span>
                {plan()!.validation_covers_budget === false
                  ? 'The latest validation used smaller limits. Run a read-only validation with this budget before syncing.'
                  : 'This source has no validation record. Run a read-only validation with this budget before syncing.'}
              </span>
              {!props.busy && (
                <Button variant="compact" onClick={props.onValidate}>
                  Validate for this budget
                </Button>
              )}
            </SettingsAlert>
          )}
          <div class="initial-sync-actions">
            <Button
              variant="outline"
              disabled={
                !plan()!.enabled ||
                plan()!.validation_covers_budget !== true ||
                props.busy ||
                props.flow.planning
              }
              onClick={props.onStart}
            >
              <Zap size={15} /> Start initial sync
            </Button>
            <span>
              Execution requires explicit confirmation and reuses the native validation-gated,
              no-reconcile source-job boundary.
            </span>
          </div>
        </>
      )}
    </section>
  )
}
function newSource(
  settings: DesktopSettings,
  project?: string,
  kind: SourceKind = 'filesystem'
): SourceSettings {
  return {
    name: nextAvailableIdentifier(
      'source',
      settings.sources.map((source) => source.name)
    ),
    kind,
    enabled: true,
    project: project || settings.workspaces[0]?.id || 'personal',
    root: null,
    source: null,
    channels: [],
    folders: [],
    exclude_folders: [],
    repositories: [],
    servers: [],
    teams: [],
    team_names: [],
    communities: [],
    community_names: [],
    token_env: defaultTokenEnv(kind),
    token_path: null,
    oauth_client_path: null,
    query: null,
    labels: [],
    max_content_chars: null,
    max_documents: null,
    max_bytes: null,
    max_duration_seconds: null,
    exclude: [],
    acl: [],
    editable: true,
  }
}
function nextAvailableIdentifier(prefix: string, used: readonly string[]): string {
  const occupied = new Set(used)
  for (let number = 1; ; number += 1) {
    const candidate = `${prefix}-${number}`
    if (!occupied.has(candidate)) return candidate
  }
}
function nextAvailablePathIdentifier(prefix: string, used: readonly string[]): string {
  if (!used.includes(prefix)) return prefix
  return nextAvailableIdentifier(prefix, used)
}
function defaultTokenEnv(kind: SourceKind): string | null {
  if (kind === 'github') return 'GITHUB_TOKEN'
  if (kind === 'slack') return 'SLACK_BOT_TOKEN'
  return null
}
function isGoogleSource(kind: SourceKind) {
  return ['google-drive', 'gmail', 'google-calendar'].includes(kind)
}
function hasBrowserSetup(kind: SourceKind) {
  return (
    isGoogleSource(kind) ||
    kind === 'github' ||
    kind === 'slack' ||
    kind === 'discord' ||
    kind === 'apple-notes'
  )
}
function setupActionLabel(kind: SourceKind) {
  return kind === 'apple-notes' ? 'Grant Apple Notes access' : 'Setup'
}
function splitList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}
function optionalNumber(value: string): number | null {
  if (value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
